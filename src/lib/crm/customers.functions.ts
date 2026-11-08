import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CustomerRow = {
  id: string;
  customer_code: string | null;
  name: string;
  primary_email: string | null;
  primary_mobile: string | null;
  state: string | null;
  status: string;
  lifetime_value: number;
  total_applications: number;
  completed_applications: number;
  pending_applications: number;
  last_seen_at: string;
  first_seen_at: string;
  last_service_id: string | null;
};

export const listCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { q?: string; status?: string; limit?: number }) => d)
  .handler(async ({ data, context }): Promise<{ rows: CustomerRow[] }> => {
    const s = context.supabase;
    let q = s
      .from("customers")
      .select("id, customer_code, name, primary_email, primary_mobile, state, status, lifetime_value, total_applications, completed_applications, pending_applications, last_seen_at, first_seen_at, last_service_id")
      .order("last_seen_at", { ascending: false })
      .limit(data.limit ?? 200);

    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.q && data.q.trim().length >= 2) {
      const raw = data.q.trim();
      const like = `%${raw}%`;
      q = q.or(
        [
          `name.ilike.${like}`,
          `primary_email.ilike.${like}`,
          `primary_mobile.ilike.${like}`,
          `customer_code.ilike.${like}`,
          `pan_number.ilike.${like}`,
          `aadhaar_number.ilike.${like}`,
          `gst_number.ilike.${like}`,
          `udyam_number.ilike.${like}`,
          `business_name.ilike.${like}`,
        ].join(","),
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as CustomerRow[] };
  });

export type Customer360 = {
  customer: CustomerRow & { language: string | null; notes: string | null };
  leads: Array<{ id: string; lead_code: string | null; service: string; status: string; created_at: string; total_amount: number }>;
  applications: Array<{ id: string; application_code: string | null; application_status: string; form_status: string; document_status: string; created_at: string; updated_at: string; service_id: string | null }>;
  payments: Array<{ id: string; amount: number; status: string; gateway_name: string; created_at: string; payment_date: string | null; razorpay_payment_id: string | null }>;
  invoices: Array<{ id: string; invoice_number: string | null; total_amount: number; issued_at: string; pdf_path: string | null; payment_id: string }>;
  certificates: Array<{ id: string; certificate_number: string | null; file_name: string | null; file_path: string | null; issued_at: string | null; delivered_at: string | null }>;
  complaints: Array<{ id: string; complaint_number: string | null; status: string; severity: string; category: string | null; sla_due_at: string | null; created_at: string }>;
  emails: Array<{ id: string; to_email: string; subject: string; template_code: string | null; status: string; sent_at: string }>;
  notes: Array<{ id: string; note: string; created_at: string; user_id: string | null }>;
  activity: Array<{ id: string; activity_type: string; activity_description: string; created_at: string }>;
  documents: Array<{ id: string; doc_type: string; file_name: string; status: string; uploaded_at: string; verified_at: string | null; lead_id: string; application_id: string | null }>;
  events: Array<{ id: string; event_type: string; old_value: string | null; new_value: string | null; staff_name: string | null; staff_role: string | null; created_at: string; application_id: string | null; lead_id: string | null }>;
};

export const getCustomer360 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerId: string }) => d)
  .handler(async ({ data, context }): Promise<Customer360> => {
    const s = context.supabase;
    const id = data.customerId;

    const [cust, leads, apps, pays, invs, certs, comps, emails, notes, acts] = await Promise.all([
      s.from("customers").select("*").eq("id", id).maybeSingle(),
      s.from("leads").select("id, lead_code, service, status, lead_status_v2, created_at, total_amount").eq("customer_id", id).order("created_at", { ascending: false }),
      s.from("applications").select("id, application_code, application_status, fulfillment_status, form_status, document_status, created_at, updated_at, service_id, lead_id, documents_deleted_at, form_submitted_at, certificate_uploaded_at").eq("customer_id", id).order("created_at", { ascending: false }),
      s.from("payments").select("id, amount, status, gateway_name, created_at, payment_date, razorpay_payment_id").eq("customer_id", id).order("created_at", { ascending: false }),
      s.from("invoices").select("id, invoice_number, total_amount, issued_at, pdf_path, payment_id").eq("customer_id", id).order("issued_at", { ascending: false }),
      s.from("certificates").select("id, certificate_number, file_name, file_path, issued_at, delivered_at").eq("customer_id", id).order("created_at", { ascending: false }),
      s.from("complaints").select("id, complaint_number, status, severity, category, sla_due_at, created_at").eq("customer_id", id).order("created_at", { ascending: false }),
      s.from("email_logs").select("id, to_email, subject, template_code, status, sent_at, lead_id").order("sent_at", { ascending: false }).limit(50),
      s.from("customer_notes").select("id, note, created_at, user_id").eq("customer_id", id).order("created_at", { ascending: false }),
      s.from("activity_logs").select("id, activity_type, activity_description, created_at, lead_id").order("created_at", { ascending: false }).limit(80),
    ]);

    if (cust.error || !cust.data) throw new Error(cust.error?.message ?? "Customer not found");

    const leadIds = (leads.data ?? []).map((l: any) => l.id);
    const leadIdSet = new Set(leadIds);
    const emailsFiltered = (emails.data ?? []).filter((e: any) => !e.lead_id || leadIdSet.has(e.lead_id));
    const actsFiltered = (acts.data ?? []).filter((a: any) => !a.lead_id || leadIdSet.has(a.lead_id));

    let docs: any[] = [];
    if (leadIds.length > 0) {
      const { data: dData } = await s
        .from("documents")
        .select("id, doc_type, file_name, status, uploaded_at, verified_at, lead_id, application_id")
        .in("lead_id", leadIds)
        .order("uploaded_at", { ascending: false });
      docs = dData ?? [];
    }

    const { data: eventsData } = await s
      .from("application_events")
      .select("id, event_type, old_value, new_value, staff_name, staff_role, created_at, application_id, lead_id")
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(200);

    return {
      customer: cust.data as any,
      leads: (leads.data ?? []) as any,
      applications: (apps.data ?? []) as any,
      payments: (pays.data ?? []) as any,
      invoices: (invs.data ?? []) as any,
      certificates: (certs.data ?? []) as any,
      complaints: (comps.data ?? []) as any,
      emails: emailsFiltered as any,
      notes: (notes.data ?? []) as any,
      activity: actsFiltered as any,
      events: (eventsData ?? []) as any,
      documents: docs as any,
    };
  });

export const addCustomerNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerId: string; note: string }) => d)
  .handler(async ({ data, context }) => {
    const note = data.note.trim();
    if (!note) throw new Error("Note cannot be empty");
    if (note.length > 4000) throw new Error("Note too long");
    const { error } = await context.supabase.from("customer_notes").insert({
      customer_id: data.customerId,
      note,
      user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

type CustomerPatch = {
  name?: string;
  primary_email?: string | null;
  primary_mobile?: string | null;
  state?: string | null;
  status?: string;
  notes?: string | null;
  address?: string | null;
  pan_number?: string | null;
  pan_doc_path?: string | null;
  aadhaar_number?: string | null;
  aadhaar_doc_path?: string | null;
  business_name?: string | null;
  gst_number?: string | null;
  udyam_number?: string | null;
};

export const updateCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerId: string; patch: CustomerPatch }) => d)
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { ...data.patch };
    // Normalize PAN/GST/Udyam to uppercase
    for (const k of ["pan_number", "gst_number", "udyam_number"] as const) {
      if (typeof patch[k] === "string") patch[k] = (patch[k] as string).trim().toUpperCase() || null;
    }
    if (typeof patch.aadhaar_number === "string") {
      patch.aadhaar_number = (patch.aadhaar_number as string).replace(/\D/g, "") || null;
    }
    const { error } = await (context.supabase.from("customers") as any).update(patch).eq("id", data.customerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const uploadCustomerKyc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerId: string; docType: "pan" | "aadhaar"; fileName: string; contentType: string; base64: string }) => d)
  .handler(async ({ data, context }) => {
    // Authorize: any signed-in staff already filtered by RLS in other fns, but this is a privileged storage write.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ext = (data.fileName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
    const ts = Date.now();
    const path = `customers/${data.customerId}/${data.docType}-${ts}.${ext}`;
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const { error: upErr } = await supabaseAdmin.storage
      .from("documents")
      .upload(path, bytes, { contentType: data.contentType, upsert: true });
    if (upErr) throw new Error(upErr.message);
    const col = data.docType === "pan" ? "pan_doc_path" : "aadhaar_doc_path";
    const { error: updErr } = await (context.supabase
      .from("customers") as any)
      .update({ [col]: path })
      .eq("id", data.customerId);
    if (updErr) throw new Error(updErr.message);
    return { ok: true, path };
  });

export const getCustomerKycSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { path: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("documents")
      .createSignedUrl(data.path, 60 * 10);
    if (error || !signed?.signedUrl) throw new Error(error?.message ?? "Could not sign URL");
    return { url: signed.signedUrl };
  });

export const getRepeatPurchaseMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = context.supabase;
    const { data } = await s.from("customers").select("total_applications, lifetime_value, completed_applications");
    const rows = (data ?? []) as Array<{ total_applications: number; lifetime_value: number; completed_applications: number }>;
    const total = rows.length;
    const repeat = rows.filter((r) => (r.total_applications ?? 0) >= 2).length;
    const ltv = rows.reduce((s, r) => s + Number(r.lifetime_value ?? 0), 0);
    return {
      totalCustomers: total,
      repeatCustomers: repeat,
      repeatRate: total ? repeat / total : 0,
      lifetimeValue: ltv,
      avgLtv: total ? ltv / total : 0,
    };
  });
