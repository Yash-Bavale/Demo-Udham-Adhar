import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { isUserAdmin } from "@/lib/audit";

export type DocRow = {
  id: string;
  doc_type: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  status: string;
  version: number;
  parent_document_id: string | null;
  uploaded_at: string;
  verified_at: string | null;
  remarks: string | null;
  lead_id: string;
  application_id: string | null;
  application_code: string | null;
  customer_id: string | null;
  customer_name: string | null;
  lead_name: string | null;
};

const FilterSchema = z.object({
  q: z.string().optional(),
  docType: z.string().optional(),
  status: z.string().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const listAllDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.infer<typeof FilterSchema>) => FilterSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const isAdmin = await isUserAdmin(supabase, context.userId);
    if (!isAdmin) throw new Error("Forbidden: Admin access required.");

    let q = supabase
      .from("documents")
      .select(
        "id, doc_type, file_name, file_path, mime_type, status, version, parent_document_id, uploaded_at, verified_at, remarks, lead_id, application_id",
      )
      .order("uploaded_at", { ascending: false })
      .limit(data.limit ?? 200);

    if (data.docType) q = q.eq("doc_type", data.docType);
    if (data.status) q = q.eq("status", data.status);

    const { data: docs, error } = await q;
    if (error) throw new Error(error.message);

    const leadIds = Array.from(new Set((docs ?? []).map((d) => d.lead_id).filter(Boolean)));
    const appIds = Array.from(new Set((docs ?? []).map((d) => d.application_id).filter(Boolean)));

    const [leadsRes, appsRes] = await Promise.all([
      leadIds.length
        ? supabase.from("leads").select("id, name, customer_id").in("id", leadIds as string[])
        : Promise.resolve({ data: [] as any[] }),
      appIds.length
        ? supabase.from("applications").select("id, application_code").in("id", appIds as string[])
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const leadMap = new Map((leadsRes.data ?? []).map((l: any) => [l.id, l]));
    const appMap = new Map((appsRes.data ?? []).map((a: any) => [a.id, a]));

    const customerIds = Array.from(
      new Set((leadsRes.data ?? []).map((l: any) => l.customer_id).filter(Boolean)),
    );
    const custRes = customerIds.length
      ? await supabase.from("customers").select("id, name").in("id", customerIds as string[])
      : { data: [] as any[] };
    const custMap = new Map((custRes.data ?? []).map((c: any) => [c.id, c.name]));

    const rows: DocRow[] = (docs ?? []).map((d: any) => {
      const lead = leadMap.get(d.lead_id);
      const app = d.application_id ? appMap.get(d.application_id) : null;
      return {
        id: d.id,
        doc_type: d.doc_type,
        file_name: d.file_name,
        file_path: d.file_path,
        mime_type: d.mime_type,
        status: d.status,
        version: d.version,
        parent_document_id: d.parent_document_id,
        uploaded_at: d.uploaded_at,
        verified_at: d.verified_at,
        remarks: d.remarks,
        lead_id: d.lead_id,
        application_id: d.application_id,
        application_code: app?.application_code ?? null,
        customer_id: lead?.customer_id ?? null,
        customer_name: lead?.customer_id ? custMap.get(lead.customer_id) ?? null : null,
        lead_name: lead?.name ?? null,
      };
    });

    // Apply text filter post-join
    const text = (data.q || "").trim().toLowerCase();
    const filtered = text
      ? rows.filter(
          (r) =>
            r.file_name.toLowerCase().includes(text) ||
            (r.customer_name ?? "").toLowerCase().includes(text) ||
            (r.lead_name ?? "").toLowerCase().includes(text) ||
            (r.application_code ?? "").toLowerCase().includes(text),
        )
      : rows;

    // Doc-type list for filter
    const docTypes = Array.from(new Set(rows.map((r) => r.doc_type))).sort();

    return { rows: filtered, docTypes };
  });

export const getDocumentSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { path: string }) => z.object({ path: z.string().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: signed, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(data.path, 600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const getDocumentVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { docType: string; leadId: string }) =>
    z.object({ docType: z.string(), leadId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("documents")
      .select("id, version, file_name, file_path, status, uploaded_at, remarks, verified_at")
      .eq("doc_type", data.docType)
      .eq("lead_id", data.leadId)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return { versions: rows ?? [] };
  });
