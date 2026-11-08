import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const STATUSES = ["draft", "submitted", "under_review", "awaiting_response", "resolved", "closed"] as const;
const SEVERITIES = ["low", "normal", "high", "critical"] as const;

export const listComplaints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { status?: string; severity?: string; q?: string }) =>
    z
      .object({
        status: z.string().optional(),
        severity: z.string().optional(),
        q: z.string().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("complaints")
      .select(
        "id, complaint_number, status, severity, category, notes, description, authority_name, authority_ref_number, expected_update_at, submitted_at, created_at, updated_at, sla_due_at, lead_id, application_id, customer_id, assigned_to, reminder_count",
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (data.status) q = q.eq("status", data.status);
    if (data.severity) q = q.eq("severity", data.severity);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const leadIds = Array.from(new Set((rows ?? []).map((r) => r.lead_id).filter(Boolean)));
    const appIds = Array.from(new Set((rows ?? []).map((r) => r.application_id).filter(Boolean)));
    const custIds = Array.from(new Set((rows ?? []).map((r: any) => r.customer_id).filter(Boolean)));
    const assigneeIds = Array.from(new Set((rows ?? []).map((r: any) => r.assigned_to).filter(Boolean)));
    const [leadsRes, appsRes, custsRes, profilesRes] = await Promise.all([
      leadIds.length
        ? supabase.from("leads").select("id, name, email, mobile, service").in("id", leadIds as string[])
        : Promise.resolve({ data: [] as any[] }),
      appIds.length
        ? supabase
            .from("applications")
            .select("id, application_code, application_status, service_id, services(service_name)")
            .in("id", appIds as string[])
        : Promise.resolve({ data: [] as any[] }),
      custIds.length
        ? supabase.from("customers").select("id, name, primary_email, primary_mobile").in("id", custIds as string[])
        : Promise.resolve({ data: [] as any[] }),
      assigneeIds.length
        ? supabase.from("profiles").select("id, full_name, display_name, email").in("id", assigneeIds as string[])
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const leadMap = new Map((leadsRes.data ?? []).map((l: any) => [l.id, l]));
    const appMap = new Map((appsRes.data ?? []).map((a: any) => [a.id, a]));
    const custMap = new Map((custsRes.data ?? []).map((c: any) => [c.id, c]));
    const profMap = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p.full_name ?? p.display_name ?? p.email]));

    const enriched = (rows ?? []).map((r: any) => {
      const lead = leadMap.get(r.lead_id);
      const app = r.application_id ? appMap.get(r.application_id) : null;
      const customer = r.customer_id ? custMap.get(r.customer_id) : null;
      const created = new Date(r.created_at).getTime();
      const daysOpen = Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
      return {
        ...r,
        lead: lead ? { id: lead.id, name: lead.name, email: lead.email, mobile: lead.mobile, service: lead.service } : null,
        customer: customer ? { id: customer.id, name: customer.name, email: customer.primary_email, mobile: customer.primary_mobile } : null,
        application: app
          ? {
              id: app.id,
              application_code: app.application_code,
              application_status: app.application_status,
              service_name: (app as any).services?.service_name ?? null,
            }
          : null,
        assigned_name: r.assigned_to ? profMap.get(r.assigned_to) ?? null : null,
        days_open: daysOpen,
      };
    });

    const text = (data.q || "").trim().toLowerCase();
    const filtered = text
      ? enriched.filter(
          (r: any) =>
            (r.complaint_number || "").toLowerCase().includes(text) ||
            (r.lead?.name || "").toLowerCase().includes(text) ||
            (r.lead?.email || "").toLowerCase().includes(text) ||
            (r.lead?.mobile || "").includes(text) ||
            (r.application?.application_code || "").toLowerCase().includes(text),
        )
      : enriched;

    // counts (over unfiltered set, but using current status/severity filters is fine — keep separate via raw)
    const { data: allRaw } = await supabase
      .from("complaints")
      .select("status, severity")
      .limit(5000);
    const counts: Record<string, number> = { all: (allRaw ?? []).length };
    STATUSES.forEach((s) => (counts[s] = (allRaw ?? []).filter((x: any) => x.status === s).length));

    return { rows: filtered, counts };
  });

export const updateComplaintStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: (typeof STATUSES)[number] }) =>
    z.object({ id: z.string().uuid(), status: z.enum(STATUSES) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: { status: string; resolved_at?: string } = { status: data.status };
    if (data.status === "resolved" || data.status === "closed") {
      patch.resolved_at = new Date().toISOString();
    }
    const { error } = await supabase.from("complaints").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const searchLeadsForComplaint = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { q: string }) => z.object({ q: z.string().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const term = `%${data.q}%`;
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, lead_code, name, email, mobile, service")
      .or(`name.ilike.${term},email.ilike.${term},mobile.ilike.${term},lead_code.ilike.${term}`)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { leads: leads ?? [] };
  });

export const createComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        lead_id: z.string().uuid(),
        application_id: z.string().uuid().nullish(),
        category: z.string().max(120).optional(),
        severity: z.enum(SEVERITIES).optional(),
        notes: z.string().max(4000).optional(),
        description: z.string().max(5000).optional(),
        authority_name: z.string().trim().min(1).max(200),
        authority_ref_number: z.string().trim().max(200).optional(),
        expected_update_at: z.string().optional(), // ISO from datetime-local
        assigned_to: z.string().uuid().nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Resolve customer_id from the lead
    const { data: lead } = await supabase
      .from("leads")
      .select("customer_id, name")
      .eq("id", data.lead_id)
      .maybeSingle();

    const { data: inserted, error } = await supabase
      .from("complaints")
      .insert({
        lead_id: data.lead_id,
        application_id: data.application_id ?? null,
        customer_id: (lead as any)?.customer_id ?? null,
        category: data.category ?? null,
        severity: data.severity ?? "normal",
        notes: data.notes ?? null,
        description: data.description ?? null,
        authority_name: data.authority_name,
        authority_ref_number: data.authority_ref_number ?? null,
        expected_update_at: data.expected_update_at ? new Date(data.expected_update_at).toISOString() : null,
        assigned_to: data.assigned_to ?? null,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      } as never)
      .select("id, complaint_number")
      .single();
    if (error) throw new Error(error.message);

    // application_events: complaint_raised
    if (data.application_id) {
      await supabase.from("application_events").insert({
        application_id: data.application_id,
        lead_id: data.lead_id,
        customer_id: (lead as any)?.customer_id ?? null,
        event_type: "complaint_raised",
        new_value: inserted!.complaint_number,
        note: `Authority: ${data.authority_name}`,
        created_by: context.userId,
      } as never);
    }

    return inserted;
  });

export const updateComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z
          .object({
            authority_name: z.string().trim().min(1).max(200).optional(),
            authority_ref_number: z.string().trim().max(200).nullable().optional(),
            description: z.string().max(5000).nullable().optional(),
            expected_update_at: z.string().nullable().optional(),
            category: z.string().max(120).nullable().optional(),
            severity: z.enum(SEVERITIES).optional(),
            assigned_to: z.string().uuid().nullable().optional(),
          })
          .partial(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const p: Record<string, unknown> = { ...data.patch };
    if (p.expected_update_at && typeof p.expected_update_at === "string") {
      p.expected_update_at = new Date(p.expected_update_at).toISOString();
    }
    const { error } = await supabase.from("complaints").update(p as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const CONTACT_STATUSES = [
  "lead_created",
  "under_process",
  "contacted",
  "completed",
  "closed",
] as const;

export const listContactSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { status?: string; q?: string }) =>
    z
      .object({
        status: z.string().optional(),
        q: z.string().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let query = supabase
      .from("leads")
      .select(
        "id, name, email, mobile, state, language, service, lead_source, status, notes, lead_code, assigned_to, created_at, updated_at",
      )
      .or("lead_source.eq.contact_form,service.eq.Contact Enquiry")
      .order("created_at", { ascending: false })
      .limit(500);

    if (data.status) {
      query = query.eq("status", data.status as (typeof CONTACT_STATUSES)[number]);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const assigneeIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.assigned_to).filter(Boolean)),
    );
    const { data: profiles } = assigneeIds.length
      ? await supabase.from("profiles").select("id, full_name, display_name, email").in("id", assigneeIds as string[])
      : { data: [] as any[] };
    const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name ?? p.display_name ?? p.email]));

    const enriched = (rows ?? []).map((r: any) => ({
      ...r,
      assigned_name: r.assigned_to ? profMap.get(r.assigned_to) ?? null : null,
    }));

    const text = (data.q || "").trim().toLowerCase();
    const filtered = text
      ? enriched.filter(
          (r: any) =>
            (r.name || "").toLowerCase().includes(text) ||
            (r.email || "").toLowerCase().includes(text) ||
            (r.mobile || "").includes(text) ||
            (r.state || "").toLowerCase().includes(text) ||
            (r.notes || "").toLowerCase().includes(text) ||
            (r.lead_code || "").toLowerCase().includes(text),
        )
      : enriched;

    const { data: allRaw } = await supabase
      .from("leads")
      .select("status")
      .or("lead_source.eq.contact_form,service.eq.Contact Enquiry")
      .limit(5000);

    const counts: Record<string, number> = { all: (allRaw ?? []).length };
    CONTACT_STATUSES.forEach((s) => (counts[s] = (allRaw ?? []).filter((x: any) => x.status === s).length));

    return { rows: filtered, counts };
  });

export const updateContactSubmissionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(CONTACT_STATUSES),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("leads")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabase.from("activity_logs").insert({
      lead_id: data.id,
      activity_type: "status_changed",
      activity_description: `Contact enquiry status changed to ${data.status}`,
      created_by: context.userId,
    } as never);

    return { ok: true };
  });

export const updateContactSubmissionNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        notes: z.string().max(4000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("leads")
      .update({ notes: data.notes, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignContactSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        assigned_to: z.string().uuid().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("leads")
      .update({ assigned_to: data.assigned_to, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const convertContactToComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        lead_id: z.string().uuid(),
        authority_name: z.string().trim().min(1).max(200),
        authority_ref_number: z.string().trim().max(200).optional(),
        description: z.string().max(5000).optional(),
        severity: z.enum(SEVERITIES).optional(),
        expected_update_at: z.string().optional(),
        assigned_to: z.string().uuid().nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Fetch lead details
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("customer_id, name, notes")
      .eq("id", data.lead_id)
      .single();
    if (leadErr || !lead) throw new Error("Lead not found");

    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
    const complaintNumber = `CMP-${y}${m}-${rand}`;

    const { data: inserted, error: cErr } = await supabase
      .from("complaints")
      .insert({
        lead_id: data.lead_id,
        customer_id: lead.customer_id ?? null,
        complaint_number: complaintNumber,
        authority_name: data.authority_name,
        authority_ref_number: data.authority_ref_number ?? null,
        description: data.description || lead.notes || null,
        notes: `Converted from contact form enquiry.`,
        severity: data.severity ?? "normal",
        expected_update_at: data.expected_update_at ? new Date(data.expected_update_at).toISOString() : null,
        assigned_to: data.assigned_to ?? null,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      } as never)
      .select("id, complaint_number")
      .single();

    if (cErr || !inserted) throw new Error(cErr?.message || "Failed to create complaint");

    // Update lead service & status
    await supabase
      .from("leads")
      .update({ service: "Complaint", status: "under_process", updated_at: new Date().toISOString() })
      .eq("id", data.lead_id);

    // Activity log
    await supabase.from("activity_logs").insert({
      lead_id: data.lead_id,
      activity_type: "complaint_raised",
      activity_description: `Converted contact form enquiry to Complaint ${inserted.complaint_number}`,
      created_by: context.userId,
    } as never);

    return inserted;
  });

