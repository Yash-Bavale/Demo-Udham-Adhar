import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole, writeAudit } from "@/lib/audit";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}


export type ReviewDoc = {
  id: string;
  lead_id: string;
  application_id: string | null;
  doc_type: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  uploaded_at: string;
  verified_at: string | null;
  verification_comment: string | null;
  remarks: string | null;
  version: number;
  lead?: { id: string; name: string; email: string; lead_code: string | null; service: string } | null;
};

const STATUS_VALUES = ["pending", "approved", "rejected", "re_upload_requested"] as const;

export const listReviewDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { status?: string; limit?: number } | undefined) =>
    z
      .object({
        status: z.enum(STATUS_VALUES).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .optional()
      .parse(data ?? {})
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin", "operations", "support"]);
    let q = (await getAdmin())
      .from("documents")
      .select("*")
      .order("uploaded_at", { ascending: true })
      .limit(data?.limit ?? 100);
    if (data?.status) q = q.eq("status", data.status);
    else q = q.eq("status", "pending");
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const leadIds = Array.from(new Set((rows ?? []).map((r) => r.lead_id).filter(Boolean)));
    const { data: leads } = leadIds.length
      ? await (await getAdmin()).from("leads").select("id,name,email,lead_code,service").in("id", leadIds)
      : { data: [] as any[] };
    const leadMap = new Map((leads ?? []).map((l: any) => [l.id, l]));
    const enriched = (rows ?? []).map((r) => ({ ...r, lead: leadMap.get(r.lead_id) ?? null })) as ReviewDoc[];
    return { rows: enriched };
  });

export const getDocumentSignedUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string }) =>
    z.object({ documentId: z.string().uuid() }).parse(data)
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin", "operations", "support"]);
    const { data: doc } = await (await getAdmin())
      .from("documents")
      .select("file_path,mime_type,file_name")
      .eq("id", data.documentId)
      .single();
    if (!doc) throw new Error("Document not found");
    const { data: signed, error } = await (await getAdmin()).storage
      .from("documents")
      .createSignedUrl(doc.file_path, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl, mimeType: doc.mime_type, fileName: doc.file_name };
  });

export const approveDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string; comment?: string }) =>
    z.object({ documentId: z.string().uuid(), comment: z.string().max(2000).optional() }).parse(data)
  )
  .handler(async ({ data, context }) => {
    const user = await assertRole(context.supabase, ["super_admin", "admin", "operations"]);
    const { data: prev } = await (await getAdmin())
      .from("documents")
      .select("status, application_id, doc_type")
      .eq("id", data.documentId)
      .single();
    const { error } = await (await getAdmin())
      .from("documents")
      .update({
        status: "approved",
        verified_by: user.id,
        verified_at: new Date().toISOString(),
        verification_comment: data.comment ?? null,
      })
      .eq("id", data.documentId);
    if (error) throw new Error(error.message);
    await writeAudit({
      supabase: context.supabase,
      entityType: "document",
      entityId: data.documentId,
      action: "document_approved",
      oldValue: { status: prev?.status },
      newValue: { status: "approved", comment: data.comment },
      actorId: user.id,
    });

    if (prev?.application_id) {
      try {
        const { logEmployeeOrderAction } = await import("@/lib/orders/order-action-logger.server");
        await logEmployeeOrderAction({
          orderId: prev.application_id,
          employeeId: user.id,
          actionType: "DOCUMENT_REVIEWED",
          notes: `Document approved: ${prev.doc_type || "document"}`,
          source: "employee",
          supabase: await getAdmin(),
        });
      } catch (auditErr) {
        console.warn("[approveDocument] audit log error:", auditErr);
      }
    }

    return { ok: true };
  });

export const rejectDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string; reason: string }) =>
    z.object({ documentId: z.string().uuid(), reason: z.string().min(2).max(2000) }).parse(data)
  )
  .handler(async ({ data, context }) => {
    const user = await assertRole(context.supabase, ["super_admin", "admin", "operations"]);
    const { data: prev } = await (await getAdmin())
      .from("documents")
      .select("status, application_id, doc_type")
      .eq("id", data.documentId)
      .single();
    const { error } = await (await getAdmin())
      .from("documents")
      .update({
        status: "rejected",
        verified_by: user.id,
        verified_at: new Date().toISOString(),
        verification_comment: data.reason,
      })
      .eq("id", data.documentId);
    if (error) throw new Error(error.message);
    await writeAudit({
      supabase: context.supabase,
      entityType: "document",
      entityId: data.documentId,
      action: "document_rejected",
      newValue: { reason: data.reason },
      actorId: user.id,
    });

    if (prev?.application_id) {
      try {
        const { logEmployeeOrderAction } = await import("@/lib/orders/order-action-logger.server");
        await logEmployeeOrderAction({
          orderId: prev.application_id,
          employeeId: user.id,
          actionType: "DOCUMENT_REQUESTED",
          notes: `Document rejected (${prev.doc_type || "document"}): ${data.reason}`,
          source: "employee",
          supabase: await getAdmin(),
        });
      } catch (auditErr) {
        console.warn("[rejectDocument] audit log error:", auditErr);
      }
    }

    return { ok: true };
  });

/** Per-application checklist + completion %. */
export const getApplicationDocChecklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { applicationId: string }) =>
    z.object({ applicationId: z.string().uuid() }).parse(data)
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin", "operations", "support"]);
    const { data: app } = await (await getAdmin())
      .from("applications")
      .select("id, lead_id")
      .eq("id", data.applicationId)
      .single();
    const { data: leadRow } = app?.lead_id
      ? await (await getAdmin()).from("leads").select("service").eq("id", app.lead_id).maybeSingle()
      : { data: null as any };
    const serviceCode = leadRow?.service ?? null;

    const { data: schema } = serviceCode
      ? await (await getAdmin())
          .from("service_form_schemas")
          .select("documents")
          .eq("service_code", serviceCode)
          .eq("is_active", true)
          .maybeSingle()
      : { data: null as any };

    const required: { key: string; label: string }[] = Array.isArray(schema?.documents)
      ? (schema!.documents as any[]).map((d) => ({
          key: String(d.key ?? d.doc_type ?? d.id ?? d.label),
          label: String(d.label ?? d.title ?? d.key ?? d.doc_type),
        }))
      : [];

    const { data: docs } = await (await getAdmin())
      .from("documents")
      .select("id, doc_type, status, uploaded_at, verified_at")
      .eq("application_id", data.applicationId)
      .order("uploaded_at", { ascending: false });

    const byType = new Map<string, any>();
    for (const d of docs ?? []) {
      if (!byType.has(d.doc_type)) byType.set(d.doc_type, d);
    }

    const items =
      required.length > 0
        ? required.map((r) => ({ ...r, doc: byType.get(r.key) ?? null }))
        : Array.from(byType.entries()).map(([k, d]) => ({ key: k, label: k, doc: d }));

    const total = items.length || 1;
    const approved = items.filter((i) => i.doc?.status === "approved").length;
    const uploaded = items.filter((i) => i.doc).length;
    return {
      items,
      stats: {
        total,
        uploaded,
        approved,
        completionPct: Math.round((approved / total) * 100),
        uploadedPct: Math.round((uploaded / total) * 100),
      },
    };
  });
