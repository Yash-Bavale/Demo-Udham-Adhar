import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        status: z.string().max(40).optional(),
        service_code: z.string().max(80).optional(),
        search: z.string().max(120).optional(),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("onboarding_submissions")
      .select(
        "id, service_code, status, submitted_at, created_at, updated_at, application_id, lead_id",
      )
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    if (data.service_code) q = q.eq("service_code", data.service_code);
    const { data: subs, error } = await q;
    if (error) throw new Error(error.message);

    const leadIds = Array.from(new Set((subs ?? []).map((s) => s.lead_id).filter(Boolean)));
    const appIds = Array.from(
      new Set((subs ?? []).map((s) => s.application_id).filter(Boolean)),
    ) as string[];

    const [{ data: leads }, { data: apps }] = await Promise.all([
      leadIds.length
        ? supabase
            .from("leads")
            .select("id, name, email, mobile, lead_code, status, customer_id, service")
            .in("id", leadIds)
        : Promise.resolve({ data: [] as any[] }),
      appIds.length
        ? supabase
            .from("applications")
            .select("id, application_code, application_status, form_status, document_status")
            .in("id", appIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const leadMap = new Map((leads ?? []).map((l: any) => [l.id, l]));
    const appMap = new Map((apps ?? []).map((a: any) => [a.id, a]));

    let rows = (subs ?? []).map((s) => ({
      ...s,
      lead: leadMap.get(s.lead_id) ?? null,
      application: s.application_id ? appMap.get(s.application_id) ?? null : null,
    }));

    if (data.search) {
      const q = data.search.toLowerCase();
      rows = rows.filter((r: any) => {
        const l = r.lead;
        return (
          l?.name?.toLowerCase().includes(q) ||
          l?.email?.toLowerCase().includes(q) ||
          l?.mobile?.includes(q) ||
          l?.lead_code?.toLowerCase().includes(q) ||
          r.application?.application_code?.toLowerCase().includes(q)
        );
      });
    }
    return { rows };
  });

export const getSubmission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: sub, error } = await supabase
      .from("onboarding_submissions")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    const [
      { data: lead },
      { data: app },
      { data: schema },
      { data: workflow },
      { data: docs },
    ] = await Promise.all([
      supabase.from("leads").select("*").eq("id", sub.lead_id).maybeSingle(),
      sub.application_id
        ? supabase.from("applications").select("*").eq("id", sub.application_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("service_form_schemas")
        .select("*")
        .eq("service_code", sub.service_code)
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("service_workflows")
        .select("*")
        .eq("service_code", sub.service_code)
        .eq("is_active", true)
        .maybeSingle(),
      sub.application_id
        ? supabase
            .from("documents")
            .select("*")
            .eq("application_id", sub.application_id)
            .order("uploaded_at", { ascending: false })
        : supabase
            .from("documents")
            .select("*")
            .eq("lead_id", sub.lead_id)
            .order("uploaded_at", { ascending: false }),
    ]);

    const customer = lead?.customer_id
      ? (
          await supabase.from("customers").select("*").eq("id", lead.customer_id).maybeSingle()
        ).data
      : null;

    return {
      submission: sub,
      lead: lead ?? null,
      customer,
      application: app ?? null,
      formSchema: schema ?? null,
      workflow: workflow ?? null,
      documents: docs ?? [],
    };
  });

export const updateSubmissionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["draft", "submitted", "approved", "rejected", "needs_changes"]),
        notes: z.string().max(2000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: { status: string; updated_at: string; submitted_at?: string } = {
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    if (data.status === "submitted") patch.submitted_at = new Date().toISOString();
    const { error } = await supabase
      .from("onboarding_submissions")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if (data.notes) {
      const { data: sub } = await supabase
        .from("onboarding_submissions")
        .select("lead_id")
        .eq("id", data.id)
        .maybeSingle();
      if (sub?.lead_id) {
        await supabase.from("activity_logs").insert({
          lead_id: sub.lead_id,
          activity_type: "submission_reviewed",
          activity_description: `Submission ${data.status}: ${data.notes}`,
        });
      }
    }
    return { ok: true };
  });

// ───────── New: per-application "Form Submission" panel + Resend link ─────────

export const getFormSubmissionForApplication = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ applicationId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    // Authorize via user-scoped client, then read with admin client so that
    // operations/support/executive staff (whose RLS on onboarding tables may
    // be narrower) can still view full form details required to fill the
    // government portal.
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Staff check — any staff role qualifies.
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (!roles || roles.length === 0) throw new Error("Forbidden");

    const supabase = supabaseAdmin;

    const { data: app, error: appErr } = await supabase
      .from("applications")
      .select(
        "id, application_code, lead_id, customer_id, service_id, form_status, fulfillment_status, application_status, created_at",
      )
      .eq("id", data.applicationId)
      .maybeSingle();
    if (appErr) throw new Error(appErr.message);
    if (!app) return null;

    const [{ data: lead }, { data: submission }, { data: docs }, { data: service }] =
      await Promise.all([
        supabase
          .from("leads")
          .select("id, lead_code, name, email, mobile, service, state")
          .eq("id", app.lead_id!)
          .maybeSingle(),
        supabase
          .from("onboarding_submissions")
          .select("id, service_code, form_data, status, submitted_at, updated_at")
          .eq("application_id", app.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("documents")
          .select(
            "id, doc_type, file_name, file_path, mime_type, size_bytes, status, remarks, uploaded_at",
          )
          .eq("application_id", app.id)
          .order("uploaded_at", { ascending: false }),
        app.service_id
          ? supabase
              .from("services")
              .select("id, service_code, service_name, govt_portal_url")
              .eq("id", app.service_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);


    // Fallback: submission may not yet be linked to the application (legacy rows)
    let sub = submission;
    if (!sub && app.lead_id) {
      const { data: bylead } = await supabase
        .from("onboarding_submissions")
        .select("id, service_code, form_data, status, submitted_at, updated_at")
        .eq("lead_id", app.lead_id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      sub = bylead;
    }

    const targetServiceCode = (service as any)?.service_code ?? sub?.service_code ?? null;
    let serviceCode = targetServiceCode;

    // Auto-sync & heal submission if service changed, fields need mapping, or status was demoted
    try {
      const { syncSubmissionForOrder } = await import("@/lib/crm/submission-sync.server");
      const syncRes = await syncSubmissionForOrder({
        admin: supabaseAdmin,
        applicationId: app.id,
        leadId: app.lead_id,
        targetServiceId: app.service_id,
        targetServiceCode,
      });
      if (syncRes.submission) {
        sub = syncRes.submission;
        if (syncRes.serviceCode) serviceCode = syncRes.serviceCode;
      }
    } catch (syncErr) {
      console.warn("Failed to auto-sync submission for order:", syncErr);
    }

    let requiredDocs: Array<{ key: string; label: string; required: boolean }> = [];
    let activeSchema: any = null;
    if (serviceCode) {
      const { data: schema } = await supabase
        .from("service_form_schemas")
        .select("schema, documents")
        .eq("service_code", serviceCode)
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (schema?.schema) activeSchema = schema.schema;
      const docList = (schema?.documents as any[]) ?? [];
      requiredDocs = docList.map((d) => ({
        key: String(d.key ?? d.type ?? ""),
        label: String(d.label ?? d.name ?? d.key ?? ""),
        required: d.required !== false,
      }));

      // Fallback to TS schemas if no custom schema row in DB
      if (!activeSchema) {
        const { getSchema } = await import("@/lib/onboarding/schemas");
        const tsSchema = getSchema(serviceCode);
        if (tsSchema) {
          activeSchema = {
            fields: tsSchema.fields,
            sections: [],
          };
          if (!requiredDocs.length && tsSchema.documents?.length) {
            requiredDocs = tsSchema.documents.map((d) => ({
              key: String(d.key ?? (d as any).type ?? ""),
              label: String(d.label ?? (d as any).name ?? d.key ?? ""),
              required: d.required !== false,
            }));
          }
        }
      }
    }

    const roleList = (roles ?? []).map((r: any) => r.role);
    const isSuperAdmin = roleList.includes("super_admin") || roleList.includes("admin");

    return {
      application: app,
      lead: lead ?? null,
      service: service ?? null,
      submission: sub ?? null,
      documents: docs ?? [],
      requiredDocs,
      serviceCode,
      activeSchema,
      isSuperAdmin,
    };
  });

export const getFormSubmissionForLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ leadId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (!roles || roles.length === 0) throw new Error("Forbidden");

    const supabase = supabaseAdmin;

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, lead_code, name, email, mobile, service, service_id, created_at")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!lead) return null;

    const [{ data: submission }, { data: docs }, { data: service }] = await Promise.all([
      supabase
        .from("onboarding_submissions")
        .select("id, service_code, form_data, status, submitted_at, updated_at")
        .eq("lead_id", lead.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("documents")
        .select("id, doc_type, file_name, file_path, mime_type, size_bytes, status, remarks, uploaded_at")
        .eq("lead_id", lead.id)
        .order("uploaded_at", { ascending: false }),
      (lead as any).service_id
        ? supabase
            .from("services")
            .select("id, service_code, service_name")
            .eq("id", (lead as any).service_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const serviceCode = submission?.service_code ?? (service as any)?.service_code ?? null;

    let requiredDocs: Array<{ key: string; label: string; required: boolean }> = [];
    if (serviceCode) {
      const { data: schema } = await supabase
        .from("service_form_schemas")
        .select("documents")
        .eq("service_code", serviceCode)
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const docList = (schema?.documents as any[]) ?? [];
      requiredDocs = docList.map((d) => ({
        key: String(d.key ?? d.type ?? ""),
        label: String(d.label ?? d.name ?? d.key ?? ""),
        required: d.required !== false,
      }));
    }

    const roleList = (roles ?? []).map((r: any) => r.role);
    const isSuperAdmin = roleList.includes("super_admin") || roleList.includes("admin");

    return {
      lead,
      service: service ?? null,
      submission: submission ?? null,
      documents: docs ?? [],
      requiredDocs,
      serviceCode,
      isSuperAdmin,
    };
  });

export const resendFormLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ leadId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");
    const { supabase, userId } = context;

    const { data: lead, error } = await supabase
      .from("leads")
      .select("id, lead_code, name, email, mobile, service")
      .eq("id", data.leadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead?.email) throw new Error("Lead has no email on file");

    const origin =
      process.env.APP_BASE_URL || process.env.PUBLIC_SITE_URL || "https://udyamadhar.in";
    const formLink = `${origin}/onboarding/${encodeURIComponent(lead.lead_code ?? "")}`;

    const { data: appRow } = await supabaseAdmin
      .from("applications")
      .select("id, application_code")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { resolveApplicationCode } = await import("@/lib/orders/resolve-order-number.server");
    const orderNumber = (appRow as any)?.application_code
      ?? (await resolveApplicationCode(lead.id, { applicationId: (appRow as any)?.id ?? null }));
    if (!orderNumber) throw new Error("Order number not ready yet — please retry in a moment.");

    await enqueueFromTemplateInternal(
      "welcome_and_form_link",
      lead.email,
      {
        // snake_case keys match the welcome_and_form_link template placeholders
        customer_name: lead.name ?? "Customer",
        service_name: lead.service ?? "your service",
        form_link: formLink,
        order_number: orderNumber,
        // legacy camelCase aliases kept for older templates
        name: lead.name ?? "Customer",
        leadCode: lead.lead_code ?? "",
        service: lead.service ?? "your service",
        formLink,
        mobile: lead.mobile ?? "",
      },
      { toName: lead.name ?? undefined, leadId: lead.id, trigger: "manual" },
    );

    await supabaseAdmin.from("activity_logs").insert({
      lead_id: lead.id,
      user_id: userId,
      activity_type: "form_link_resent",
      activity_description: `Form link resent to ${lead.email}`,
    });

    return { ok: true, email: lead.email, formLink };
  });
