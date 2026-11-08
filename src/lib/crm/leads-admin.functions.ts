import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit, assertRole, isUserAdmin } from "@/lib/audit";
import { getUserModulePermission } from "@/lib/crm/permissions.functions";
import { Database } from "@/integrations/supabase/types";


const STAFF_READ_ROLES: Database["public"]["Enums"]["app_role"][] = [
  "super_admin",
  "operations",
  "admin",
  "support",
  "executive",
  "manager",
  "accounts",
  "finance",
];

const LEAD_WRITE_ROLES: Database["public"]["Enums"]["app_role"][] = [
  "super_admin",
  "operations",
  "admin",
  "manager",
  "executive",
];

const LEAD_FINANCE_WRITE_ROLES: Database["public"]["Enums"]["app_role"][] = [
  "super_admin",
  "admin",
  "finance",
];

const STAFF_MANAGEMENT_ROLES: Database["public"]["Enums"]["app_role"][] = [
  "super_admin",
  "operations",
  "admin",
  "manager",
  "executive",
  "support",
  "accounts",
  "finance",
];

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}


const LEAD_STATUS_ENUM = [
  "new_lead",
  "contacted",
  "payment_pending",
  "payment_successful",
  "under_process",
  "completed",
  "closed",
  "refund_requested",
  "lead_created",
  "details_pending",
  "documents_pending",
  "under_review"
] as const;

const LeadUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(LEAD_STATUS_ENUM).optional(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  mobile: z.string().optional(),
  state: z.string().optional(),
  language: z.string().optional(),
  lead_source: z.string().optional(),
  notes: z.string().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  remarks: z.string().optional(),
  service: z.string().optional(),
  base_amount: z.number().optional(),
  gst_amount: z.number().optional(),
  total_amount: z.number().optional(),
});

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => LeadUpdateSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { id: leadId, ...patch } = data;
    const supabase = context.supabase;

    const financeFields = ["service", "base_amount", "gst_amount", "total_amount"];
    const patchKeys = Object.keys(patch);
    const hasFinanceField = patchKeys.some(k => financeFields.includes(k));
    const hasNonFinanceField = patchKeys.some(k => !financeFields.includes(k));

    if (hasNonFinanceField) {
      await assertRole(supabase, LEAD_WRITE_ROLES);
    }
    if (hasFinanceField) {
      await assertRole(supabase, LEAD_FINANCE_WRITE_ROLES);
    }

    const admin = await getAdmin();

    // Completion gate: lead.status="completed" cannot be set manually here.
    // It is set by the fulfillment engine after certificate upload + delivery.
    if (patch.status === "completed") {
      const { data: cur } = await admin.from("leads").select("status").eq("id", leadId).maybeSingle();
      if (cur?.status !== "completed") {
        throw new Error("Cannot mark lead completed manually. Complete the application via the Completion Gate (certificate upload).");
      }
    }
    const { data: prev, error: fetchErr } = await admin
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (fetchErr || !prev) throw new Error("Lead not found");

    const { error: updateErr } = await admin
      .from("leads")
      .update(patch)
      .eq("id", leadId);

    if (updateErr) throw new Error(updateErr.message);

    // C1 — log status / assignee changes to the canonical timeline.
    const needStaff =
      (patch.status && patch.status !== prev.status) ||
      (patch.assigned_to !== undefined && patch.assigned_to !== prev.assigned_to);
    if (needStaff) {
      const [{ data: profile }, { data: roleRows }] = await Promise.all([
        admin.from("profiles").select("display_name, email").eq("id", context.userId).maybeSingle(),
        admin.from("user_roles").select("role").eq("user_id", context.userId),
      ]);
      const staff_name = profile?.display_name || profile?.email || "Staff";
      const staff_role = roleRows?.[0]?.role ?? "staff";
      if (patch.status && patch.status !== prev.status) {
        await admin.from("application_events").insert({
          lead_id: leadId,
          customer_id: prev.customer_id ?? null,
          event_type: "lead_status_change",
          old_value: prev.status,
          new_value: patch.status,
          created_by: context.userId,
          staff_name, staff_role,
        } as never);
      }
      if (patch.assigned_to !== undefined && patch.assigned_to !== prev.assigned_to) {
        await admin.from("application_events").insert({
          lead_id: leadId,
          customer_id: prev.customer_id ?? null,
          event_type: "assignment_change",
          old_value: prev.assigned_to ?? null,
          new_value: patch.assigned_to ?? null,
          created_by: context.userId,
          staff_name, staff_role,
        } as never);
        if (patch.assigned_to) {
          const { emitToUsers } = await import("@/lib/notifications/emit.server");
          await emitToUsers([patch.assigned_to], {
            kind: "order_assigned",
            title: "New Lead Assigned",
            body: `Lead ${prev.name || prev.lead_code || "New Lead"} has been assigned to your queue.`,
            href: `/admin/leads/${leadId}`,
            entityKind: "lead",
            entityId: leadId,
          });
        }
      }
    }

    await writeAudit({
      supabase,
      entityType: "lead",
      entityId: leadId,
      action: "update_lead",
      oldValue: prev,
      newValue: { ...prev, ...patch },
      actorId: context.userId,
    });

    return { ok: true };
  });

export const changeLeadService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      leadId: z.string().uuid(),
      serviceId: z.string().uuid().optional(),
      serviceCode: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertRole(supabase, LEAD_WRITE_ROLES);
    const admin = await getAdmin();

    // 1. Fetch current lead
    const { data: lead, error: leadErr } = await admin
      .from("leads")
      .select("id, lead_code, name, service, service_id, customer_id, base_amount, gst_amount, total_amount, status")
      .eq("id", data.leadId)
      .single();

    if (leadErr || !lead) throw new Error("Lead not found");

    // 2. Fetch target service from services table
    let svcQuery = admin.from("services").select("id, service_code, service_name, base_amount, gst_amount, total_amount");
    if (data.serviceId) {
      svcQuery = svcQuery.eq("id", data.serviceId);
    } else if (data.serviceCode) {
      svcQuery = svcQuery.eq("service_code", data.serviceCode);
    } else {
      throw new Error("Must provide serviceId or serviceCode");
    }

    const { data: targetSvc, error: svcErr } = await svcQuery.maybeSingle();
    if (svcErr || !targetSvc) throw new Error("Target service not found");

    const oldService = lead.service;
    const newService = targetSvc.service_name;
    const baseAmount = Number(targetSvc.base_amount);
    const gstAmount = Number(targetSvc.gst_amount);
    const totalAmount = Number(targetSvc.total_amount);

    // Check if lead has existing successful payments
    const { data: paidPayments } = await admin
      .from("payments")
      .select("amount")
      .eq("lead_id", data.leadId)
      .in("status", ["paid"]);

    const paidSum = (paidPayments ?? []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const isAlreadyPaid = paidSum > 0 || lead.status === "payment_successful";

    // 3. Update lead DB record. If lead is already paid, preserve the actual paid total_amount.
    const leadUpdate = {
      service: newService,
      service_id: targetSvc.id,
      ...(isAlreadyPaid
        ? {}
        : { base_amount: baseAmount, gst_amount: gstAmount, total_amount: totalAmount }),
    };

    const { error: updLeadErr } = await admin
      .from("leads")
      .update(leadUpdate)
      .eq("id", data.leadId);

    if (updLeadErr) throw new Error(updLeadErr.message);

    // 4. Update linked active applications; a new service restarts as Incomplete Form
    const { SERVICE_CHANGE_STAGE_RESET } = await import("@/lib/crm/submission-sync.server");
    await admin
      .from("applications")
      .update({
        service_id: targetSvc.id,
        ...SERVICE_CHANGE_STAGE_RESET,
      } as never)
      .not("fulfillment_status", "in", "(completed,order_completed,order_closed,cancelled)")
      .eq("lead_id", data.leadId);

    // 4b. Synchronize onboarding form submission to the target service schema and map common fields
    try {
      const { syncSubmissionForOrder } = await import("@/lib/crm/submission-sync.server");
      await syncSubmissionForOrder({
        admin,
        leadId: data.leadId,
        targetServiceId: targetSvc.id,
        targetServiceCode: targetSvc.service_code,
        resetToDraft: true,
      });
    } catch (syncErr) {
      console.warn("Failed to synchronize submission on lead service change:", syncErr);
    }

    // 5. Expire existing pending payment links for this lead
    await admin
      .from("payment_links" as any)
      .update({ status: "expired" })
      .eq("lead_id", data.leadId)
      .eq("status", "pending");

    // 6. Generate fresh payment link for unpaid leads or for any remaining balance
    let newPaymentLink: any = null;
    const remainingAmount = isAlreadyPaid ? Math.max(0, totalAmount - paidSum) : totalAmount;
    if (remainingAmount > 0) {
      const txnid = `LNK-${lead.lead_code}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
      const appOrigin = process.env.APP_BASE_URL || process.env.PUBLIC_SITE_URL || "https://udyamadhar.in";
      const paymentUrl = `${appOrigin}/payment/${encodeURIComponent(lead.lead_code ?? "")}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: linkData } = await admin
        .from("payment_links" as any)
        .insert({
          lead_id: data.leadId,
          txnid,
          payment_url: paymentUrl,
          amount: remainingAmount,
          status: "pending",
          expires_at: expiresAt,
          created_by: context.userId,
        } as any)
        .select("id, txnid, payment_url, amount, status")
        .maybeSingle();
      newPaymentLink = linkData;
      if (newPaymentLink?.payment_url) {
        const { withCheckoutToken } = await import("@/lib/security/customer-access.server");
        newPaymentLink = {
          ...newPaymentLink,
          payment_url: await withCheckoutToken(newPaymentLink.payment_url, data.leadId, context.userId),
        };
      }
    }

    // 7. Log timeline activity events
    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      admin.from("profiles").select("display_name, email").eq("id", context.userId).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    const staff_name = profile?.display_name || profile?.email || "Staff";
    const staff_role = roleRows?.[0]?.role ?? "staff";

    const displayAmountLog = isAlreadyPaid ? `Paid: ₹${paidSum}` : `₹${totalAmount}`;

    await admin.from("application_events").insert({
      lead_id: data.leadId,
      customer_id: lead.customer_id ?? null,
      event_type: "service_changed",
      old_value: oldService ?? "Unknown",
      new_value: `${newService} (${displayAmountLog})`,
      created_by: context.userId,
      staff_name,
      staff_role,
    } as never);

    await admin.from("activity_logs").insert({
      lead_id: data.leadId,
      user_id: context.userId,
      activity_type: "service_changed",
      activity_description: `Service changed from ${oldService ?? "Unknown"} to ${newService} (${displayAmountLog})`,
    });

    await writeAudit({
      supabase,
      entityType: "lead",
      entityId: data.leadId,
      action: "change_service",
      oldValue: lead,
      newValue: { ...lead, service: newService, service_id: targetSvc.id },
      actorId: context.userId,
    });

    return {
      ok: true,
      serviceName: newService,
      totalAmount: isAlreadyPaid ? paidSum : totalAmount,
      paymentLink: newPaymentLink,
    };
  });

export type SourceBreakdownItem = {
  /** Exact value stored in lead_source — pass as `source` filter to listLeads */
  value: string;
  /** Human-friendly label */
  label: string;
  /** Top-level channel: "ads" | "website" | "whatsapp" | "referral" | "manual" | "other" */
  channel: string;
  count: number;
};

export type SourceBreakdown = {
  channels: Array<{ key: string; label: string; icon: string; count: number }>;
  items: SourceBreakdownItem[];
};

/**
 * Returns distinct lead_source values with their lead counts.
 * Groups them into channels (Google Ads / Website pages / WhatsApp / etc.)
 * and surfaces every unique ad campaign automatically.
 */
export const getLeadSourceBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, STAFF_READ_ROLES);
    const admin = await getAdmin();

    // Fetch all distinct lead_source values with count — this is a lightweight scan
    const { data: rows, error } = await admin
      .from("leads")
      .select("lead_source")
      .not("lead_source", "is", null);
    if (error) throw new Error(error.message);

    // Count occurrences per distinct lead_source string
    const rawCounts: Record<string, number> = {};
    for (const r of rows ?? []) {
      const s = (r as any).lead_source as string;
      if (s) rawCounts[s] = (rawCounts[s] ?? 0) + 1;
    }

    const CHANNEL_LABELS: Record<string, { label: string; icon: string }> = {
      ads: { label: "Google Ads", icon: "📢" },
      website: { label: "Website", icon: "🌐" },
      whatsapp: { label: "WhatsApp", icon: "💬" },
      referral: { label: "Referral", icon: "👥" },
      manual: { label: "Manual / CRM", icon: "✍️" },
      instagram: { label: "Instagram", icon: "📸" },
      facebook: { label: "Facebook", icon: "📘" },
      other: { label: "Other", icon: "📋" },
    };
    const channelCounts: Record<string, number> = {};

    const items: SourceBreakdownItem[] = Object.entries(rawCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([src, count]) => {
        const lower = src.toLowerCase();

        let channel = "other";
        let label = src;

        if (lower.startsWith("google ads") || lower.includes("gclid") || lower.includes("utm_source=google")) {
          channel = "ads";
          // Parse campaign / keyword / page info for a nice label
          const parts = src.split("|").map((p) => p.trim());
          // e.g. ["Google Ads", "Campaign: c123", "kw: udyam", "Page: /"]
          label = parts.join(" · ");
        } else if (lower.startsWith("website")) {
          channel = "website";
          // "Website | /new-udyam-registration" → "Website · /new-udyam-registration"
          const parts = src.split("|").map((p) => p.trim());
          label = parts.join(" · ");
        } else if (lower.includes("whatsapp")) {
          channel = "whatsapp";
        } else if (lower.includes("instagram")) {
          channel = "instagram";
        } else if (lower.includes("facebook")) {
          channel = "facebook";
        } else if (lower.includes("referral")) {
          channel = "referral";
        } else if (["manual", "crm", "website", "other"].includes(lower)) {
          channel = "manual";
          label = lower === "manual" ? "Manual / CRM" : src;
        }

        channelCounts[channel] = (channelCounts[channel] ?? 0) + count;

        return { value: src, label, channel, count };
      });

    const channels = Object.entries(channelCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({
        key,
        label: CHANNEL_LABELS[key]?.label ?? key,
        icon: CHANNEL_LABELS[key]?.icon ?? "📋",
        count,
      }));

    return { channels, items };
  });

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    page: z.number().default(1),
    pageSize: z.number().default(25),
    search: z.string().optional(),
    status: z.enum(LEAD_STATUS_ENUM).optional(),
    source: z.string().optional(),
    service: z.string().optional(),
    assignee: z.string().optional(), // uuid | "__unassigned" | "__me"
    websiteId: z.string().uuid().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  }))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, STAFF_READ_ROLES);
    const admin = await getAdmin();
    const isAdmin = await isUserAdmin(context.supabase, context.userId);
    const perm = await getUserModulePermission(context.supabase, context.userId, "leads");

    if (!perm.canView) {
      return { rows: [], count: 0 };
    }

    let query = admin.from("leads").select("*", { count: "exact" });

    if (data.status) query = query.eq("status", data.status);
    if (data.websiteId) query = query.eq("website_id", data.websiteId);
    if (data.source) {
      if (data.source.startsWith("__channel:")) {
        const ch = data.source.slice("__channel:".length);
        const prefixMap: Record<string, string> = {
          ads: "Google Ads",
          website: "Website",
          whatsapp: "WhatsApp",
          referral: "Referral",
          manual: "Manual",
          instagram: "Instagram",
          facebook: "Facebook",
        };
        const prefix = prefixMap[ch];
        if (prefix) {
          query = query.ilike("lead_source", `${prefix}%`);
        }
      } else {
        // Exact value match (specific campaign / page)
        query = query.eq("lead_source", data.source);
      }
    }
    if (data.service) query = query.eq("service", data.service);
    if (!isAdmin) {
      if (!perm.scopeAll) {
        const allowedWebsites = perm.scopes.map((s) => s.websiteId).filter(Boolean) as string[];
        const allowedServices = perm.scopes.map((s) => s.serviceId).filter(Boolean) as string[];
        if (allowedWebsites.length > 0) {
          query = query.in("website_id", allowedWebsites);
        } else if (allowedServices.length > 0) {
          query = query.in("service", allowedServices);
        } else {
          query = query.eq("assigned_to", context.userId);
        }
      }
    } else {
      if (data.assignee === "__unassigned") query = query.is("assigned_to", null);
      else if (data.assignee === "__me") query = query.eq("assigned_to", context.userId);
      else if (data.assignee) query = query.eq("assigned_to", data.assignee);
    }
    if (data.dateFrom) query = query.gte("created_at", new Date(data.dateFrom).toISOString());
    if (data.dateTo) {
      const to = new Date(data.dateTo); to.setDate(to.getDate() + 1);
      query = query.lt("created_at", to.toISOString());
    }
    if (data.search) {
      query = query.or(
        `name.ilike.%${data.search}%,email.ilike.%${data.search}%,mobile.ilike.%${data.search}%,lead_code.ilike.%${data.search}%`
      );
    }

    const { data: rows, count, error } = await query
      .order("created_at", { ascending: false })
      .range((data.page - 1) * data.pageSize, data.page * data.pageSize - 1);

    if (error) throw new Error(error.message);

    // Fetch websites map
    const { data: websites } = await admin.from("websites").select("id, name, domain");
    const websitesById: Record<string, { name: string; domain: string }> = Object.fromEntries(
      (websites ?? []).map((w: any) => [w.id, { name: w.name, domain: w.domain }])
    );

    // C6 — attach assignee profile so the table can show a name, not a UUID.
    const assigneeIds = Array.from(new Set((rows ?? []).map((r: any) => r.assigned_to).filter(Boolean)));
    let profilesById: Record<string, { display_name: string | null; email: string | null }> = {};
    if (assigneeIds.length) {
      const { data: profs } = await admin
        .from("profiles")
        .select("id, display_name, email")
        .in("id", assigneeIds as string[]);
      profilesById = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
    }
    // Pull latest application + onboarding form status for each lead
    const leadIdsRaw = (rows ?? []).map((r: any) => r.id).filter(Boolean) as string[];
    let appsByLead: Record<string, { form_status: string | null }> = {};
    if (leadIdsRaw.length) {
      const { data: apps } = await admin
        .from("applications")
        .select("lead_id, form_status, created_at")
        .in("lead_id", leadIdsRaw)
        .order("created_at", { ascending: false });
      for (const a of apps ?? []) {
        const lid = (a as any).lead_id as string;
        if (!appsByLead[lid]) appsByLead[lid] = { form_status: (a as any).form_status ?? null };
      }
    }

    const enriched = (rows ?? []).map((r: any) => {
      const wsMeta = r.website_id ? websitesById[r.website_id] : null;
      let website_name = wsMeta?.name ?? null;
      if (!website_name) {
        // Fallback inference based on lead service / code / lead_source
        if (/registration|registration/i.test(r.service ?? "") || /udyamregistration/i.test(r.lead_source ?? "")) {
          website_name = "Udyam Registrations";
        } else {
          website_name = "Udyam Aadhar";
        }
      }
      return {
        ...r,
        website_name,
        website_domain: wsMeta?.domain ?? null,
        assignee_name: r.assigned_to
          ? (profilesById[r.assigned_to]?.display_name || profilesById[r.assigned_to]?.email || null)
          : null,
        form_status: appsByLead[r.id]?.form_status ?? null,
      };
    });

    return { rows: enriched, total: count || 0 };
  });

export const getLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, STAFF_READ_ROLES);
    const admin = await getAdmin();
    const isAdmin = await isUserAdmin(context.supabase, context.userId);

    let query = admin
      .from("leads")
      .select("*, applications!fk_applications_lead(*), lead_notes(*)")
      .eq("id", data.id);
    if (!isAdmin) {
      query = query.eq("assigned_to", context.userId);
    }
    const { data: lead, error } = await query.single();

    if (error || !lead) throw new Error("Lead not found");

    let assignee_name: string | null = null;
    if ((lead as any).assigned_to) {
      const { data: p } = await admin
        .from("profiles")
        .select("display_name, email")
        .eq("id", (lead as any).assigned_to)
        .maybeSingle();
      assignee_name = p?.display_name || p?.email || null;
    }

    return {
      lead: { ...lead, assignee_name },
      applications: (lead as any).applications ?? [],
      notes: (lead as any).lead_notes ?? [],
    };
  });

// Fetch a lead by code (e.g. "LD-1234") OR uuid so the Add-Lead dialog can
// prefill from an existing customer profile.
export const findLeadByCodeOrId = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ query: z.string().min(2).max(64) }))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, STAFF_READ_ROLES);
    const admin = await getAdmin();
    const q = data.query.trim();
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let row: any = null;
    if (uuidRe.test(q)) {
      const { data: r } = await admin.from("leads").select("*").eq("id", q).maybeSingle();
      row = r;
    }
    if (!row) {
      const { data: r } = await admin.from("leads").select("*").ilike("lead_code", q).maybeSingle();
      row = r;
    }
    if (!row) {
      const { data: rs } = await admin.from("leads")
        .select("*")
        .or(`mobile.eq.${q},email.ilike.${q}`)
        .order("created_at", { ascending: false })
        .limit(1);
      row = rs?.[0] ?? null;
    }
    if (!row) throw new Error("No lead found for that ID / code / mobile / email");
    return { lead: row };
  });

export const addLeadNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lead_id: z.string().uuid(), note: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, STAFF_READ_ROLES);
    const admin = await getAdmin();
    const { error } = await admin
      .from("lead_notes")
      .insert({ lead_id: data.lead_id, note: data.note, user_id: context.userId });
    if (error) throw new Error(error.message);

    // C2 — also record to canonical timeline so the Timeline tab shows notes.
    const { data: lead } = await admin
      .from("leads").select("customer_id").eq("id", data.lead_id).maybeSingle();
    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      admin.from("profiles").select("display_name, email").eq("id", context.userId).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    await admin.from("application_events").insert({
      lead_id: data.lead_id,
      customer_id: lead?.customer_id ?? null,
      event_type: "note_added",
      note: data.note,
      created_by: context.userId,
      staff_name: profile?.display_name || profile?.email || "Staff",
      staff_role: roleRows?.[0]?.role ?? "staff",
    } as never);

    return { ok: true };
  });

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, STAFF_MANAGEMENT_ROLES);
    const admin = await getAdmin();
    const adminAny = admin as any;
    
    const [{ data: profiles, error: profilesErr }, { data: superAdminRoles }] = await Promise.all([
      adminAny.from("profiles").select("*"),
      admin.from("user_roles").select("user_id").eq("role", "super_admin"),
    ]);

    if (profilesErr) throw new Error(profilesErr.message);

    const superAdminIds = new Set((superAdminRoles ?? []).map((r: any) => String(r.user_id)));

    // Active workforce only (exclude super_admins and archived/inactive/terminated)
    const activeStaff = (profiles ?? [])
      .filter(
        (p: any) =>
          !superAdminIds.has(String(p.id)) &&
          p.is_active !== false &&
          p.employment_status !== "ARCHIVED" &&
          p.employment_status !== "TERMINATED" &&
          p.employment_status !== "INACTIVE",
      )
      .map((p: any) => ({
        ...p,
        display_name: p.full_name || p.display_name || p.email?.split("@")[0] || "Unknown Employee",
        name: p.full_name || p.display_name || p.email?.split("@")[0] || "Unknown Employee",
        employment_status: p.employment_status || "ACTIVE",
      }));

    activeStaff.sort((a: any, b: any) => (a.display_name || "").localeCompare(b.display_name || ""));
    return { profiles: activeStaff };
  });

/**
 * Returns staff formatted for operational assignment dropdowns:
 * Shows active workforce members with live presence and workload status.
 */
export const listAssignmentStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, STAFF_MANAGEMENT_ROLES);
    const admin = await getAdmin();
    const adminAny = admin as any;

    // 1. Fetch profiles, super_admin roles, and pool configurations
    const [{ data: profiles, error: profErr }, { data: superAdminRoles }, { data: poolRows }] = await Promise.all([
      adminAny.from("profiles").select("*"),
      admin.from("user_roles").select("user_id").eq("role", "super_admin"),
      adminAny.from("assignment_pool").select("user_id, service_id, is_active"),
    ]);

    if (profErr) console.error("[listAssignmentStaff] profiles error:", profErr);

    const superAdminIds = new Set((superAdminRoles ?? []).map((r: any) => String(r.user_id)));

    const poolUserMap = new Map<string, boolean>();
    (poolRows ?? []).forEach((r: any) => {
      if (r.user_id && !superAdminIds.has(String(r.user_id))) {
        poolUserMap.set(String(r.user_id), Boolean(r.is_active));
      }
    });

    // 2. Attach live presence & workload metadata from assignment engine
    const { calculateStaffWorkloads } = await import("./assignment-engine.server");
    const workloads = await calculateStaffWorkloads();
    const workloadMap = new Map(workloads.map((w) => [String(w.employeeId), w]));

    const result = (profiles ?? [])
      .filter((p: any) => {
        if (!p.id || superAdminIds.has(String(p.id))) return false;
        if (p.is_active === false) return false;
        if (p.employment_status === "ARCHIVED" || p.employment_status === "TERMINATED" || p.employment_status === "INACTIVE") return false;
        return true;
      })
      .map((p: any) => {
        const w = workloadMap.get(String(p.id));
        const displayName = p.full_name || p.display_name || p.email?.split("@")[0] || "Staff";
        const isPoolActive = poolUserMap.has(String(p.id)) ? poolUserMap.get(String(p.id)) === true : true;
        const isOnLeave = w?.presenceStatus === "ON_LEAVE";
        const isEligible = isPoolActive && !isOnLeave && (w?.isAutoAssignEligible ?? true);

        let unavailReason = w?.unavailabilityReason;
        if (!isPoolActive) {
          unavailReason = "Auto-assign OFF";
        } else if (w?.presenceStatus === "OFFLINE") {
          unavailReason = "Staff Offline";
        } else if (w?.presenceStatus === "AWAY") {
          unavailReason = "Staff Away";
        } else if (isOnLeave) {
          unavailReason = "On Leave";
        }

        return {
          id: p.id,
          display_name: displayName,
          name: displayName,
          full_name: p.full_name,
          email: p.email,
          role: w?.role || p.role || "operations",
          employment_status: p.employment_status || "ACTIVE",
          is_active: true,
          is_in_pool: true,
          is_pool_active: isPoolActive,
          is_eligible: isEligible,
          is_on_leave: isOnLeave,
          presence_status: w?.presenceStatus || "OFFLINE",
          effective_workload: w?.effectiveWorkload ?? 0,
          unavailability_reason: unavailReason,
        };
      });

    result.sort((a: any, b: any) => (a.display_name || "").localeCompare(b.display_name || ""));

    return { profiles: result };
  });

/**
 * Returns all historical staff (including archived and former employees) for historical filters and past order lookups.
 */
export const listAllHistoricalStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, STAFF_READ_ROLES);
    const admin = await getAdmin();
    const adminAny = admin as any;

    const [profilesRes, superAdminRoles] = await Promise.all([
      adminAny.from("profiles").select("*"),
      admin.from("user_roles").select("user_id").eq("role", "super_admin"),
    ]);

    const superAdminIds = new Set((superAdminRoles.data ?? []).map((r: any) => String(r.user_id)));
    const allProfiles = (profilesRes.data ?? []).filter((p: any) => !superAdminIds.has(String(p.id)));

    return {
      profiles: allProfiles.map((p: any) => ({
        id: p.id,
        display_name: p.full_name || p.display_name || p.email?.split("@")[0] || "Unknown Employee",
        name: p.full_name || p.display_name || p.email?.split("@")[0] || "Unknown Employee",
        full_name: p.full_name || p.display_name || p.email?.split("@")[0] || "Unknown Employee",
        email: p.email,
        is_active:
          p.is_active !== false &&
          p.employment_status !== "ARCHIVED" &&
          p.employment_status !== "TERMINATED" &&
          p.employment_status !== "INACTIVE",
        employment_status: p.employment_status || (p.is_active === false ? "INACTIVE" : "ACTIVE"),
      })),
    };
  });

export const getLeadCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, STAFF_READ_ROLES);
    const admin = await getAdmin();
    const isAdmin = await isUserAdmin(context.supabase, context.userId);

    // Use head-only exact counts (no row transfer) to avoid timeouts on large tables.
    const statuses = LEAD_STATUS_ENUM as readonly string[];
    const scope = (q: any) => (isAdmin ? q : q.eq("assigned_to", context.userId));

    const [allRes, ...perStatus] = await Promise.all([
      scope(admin.from("leads").select("id", { count: "exact", head: true })),
      ...statuses.map((s) =>
        scope(admin.from("leads").select("id", { count: "exact", head: true })).eq("status", s),
      ),
    ]);

    const counts: Record<string, number> = { all: allRes.count ?? 0 };
    statuses.forEach((s, i) => {
      counts[s] = perStatus[i]?.count ?? 0;
    });
    return { counts };
  });


const AddLeadSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, "Mobile must be a 10-digit Indian number"),
  state: z.string().trim().min(2),
  district: z.string().trim().optional(),
  language: z.string().trim().min(2).default("en"),
  service: z.string().trim().min(2),
  lead_source: z.string().trim().default("manual"),
  base_amount: z.number().nonnegative().default(0),
  gst_amount: z.number().nonnegative().default(0),
  total_amount: z.number().nonnegative().default(0),
  notes: z.string().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  website_id: z.string().uuid().optional(),
});

export const addLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AddLeadSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, LEAD_WRITE_ROLES);
    const admin = await getAdmin();

    // Match existing customer by mobile, then email.
    const { data: existing } = await admin
      .from("customers")
      .select("id")
      .or(`primary_mobile.eq.${data.mobile},primary_email.eq.${data.email.toLowerCase()}`)
      .maybeSingle();
    const isReturningCustomer = !!existing?.id;

    // Find or create customer via RPC (handles dedupe + bookkeeping).
    const { data: customerId, error: rpcErr } = await admin.rpc("find_or_create_customer", {
      p_name: data.name,
      p_email: data.email,
      p_mobile: data.mobile,
      p_state: data.state,
      p_language: data.language,
    });
    if (rpcErr) throw new Error(rpcErr.message);

    const { notes, district, ...rest } = data;
    const composedNotes = [notes, district ? `District: ${district}` : null].filter(Boolean).join("\n") || null;

    // Resolve service_id and website_id from the selected service name so downstream views
    // (orders list, invoices, govt portal link) resolve correctly.
    let serviceId: string | null = null;
    let websiteId: string | null = (data as any).website_id ?? null; // admin's explicit selection wins
    if (rest.service) {
      let { data: svc } = await admin
        .from("services")
        .select("id, website_id")
        .eq("service_name", rest.service)
        .maybeSingle();
      if (!svc) {
        const { data: svci } = await admin
          .from("services")
          .select("id, website_id")
          .ilike("service_name", rest.service.trim())
          .maybeSingle();
        svc = svci;
      }
      if (!svc) {
        const { data: svcc } = await admin
          .from("services")
          .select("id, website_id")
          .ilike("service_code", rest.service.trim())
          .maybeSingle();
        svc = svcc;
      }
      serviceId = (svc?.id as string) ?? null;
      if (!websiteId) websiteId = (svc?.website_id as string) ?? null;
    }

    // Final fallback to the default website
    if (!websiteId) {
      const { getDefaultWebsiteId } = await import("@/lib/websites/default-website.server");
      websiteId = await getDefaultWebsiteId().catch(() => null);
    }

    const { data: inserted, error } = await admin
      .from("leads")
      .insert({
        ...rest,
        service_id: serviceId,
        website_id: websiteId,
        customer_id: customerId as string,
        notes: composedNotes,
        status: "new_lead",
        lead_status_v2: "new_lead",
      } as never)
      .select("id, lead_code")
      .single();
    if (error) throw new Error(error.message);

    // Auto-assign lead if assigned_to was not explicitly passed
    if (!rest.assigned_to) {
      try {
        const { autoAssignLeadOrOrder } = await import("@/lib/crm/auto-assign.server");
        await autoAssignLeadOrOrder({ leadId: inserted.id, serviceId });
      } catch (assignErr) {
        console.error("[addLead] Auto-assignment failed:", assignErr);
      }
    }

    // Log lead_created to application_events (canonical Phase 1 timeline).
    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      admin.from("profiles").select("display_name, email").eq("id", context.userId).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    const staff_name = profile?.display_name || profile?.email || "Staff";
    const staff_role = roleRows?.[0]?.role ?? "staff";
    await admin.from("application_events").insert({
      lead_id: inserted.id,
      customer_id: customerId as string,
      event_type: "lead_created",
      note: notes ?? null,
      new_value: "new_lead",
      created_by: context.userId,
      staff_name,
      staff_role,
    } as never);

    await writeAudit({
      supabase: context.supabase,
      entityType: "lead",
      entityId: inserted.id,
      action: "create_lead",
      oldValue: null,
      newValue: data,
      actorId: context.userId,
    });

    return {
      id: inserted.id,
      lead_code: inserted.lead_code,
      isReturningCustomer,
    };
  });

const UpdateAssigneeSchema = z.object({
  leadId: z.string().uuid(),
  assignedTo: z.string().uuid().nullable(),
});

export const updateLeadAssignee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateAssigneeSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "operations", "admin", "manager"]);
    const admin = await getAdmin();
    const { data: prev } = await admin
      .from("leads")
      .select("assigned_to, customer_id, name, lead_code")
      .eq("id", data.leadId)
      .single();
    if (!prev) throw new Error("Lead not found");
    const { error } = await admin
      .from("leads")
      .update({ assigned_to: data.assignedTo } as never)
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);

    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      admin.from("profiles").select("display_name, email").eq("id", context.userId).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    await admin.from("application_events").insert({
      lead_id: data.leadId,
      customer_id: prev.customer_id ?? null,
      event_type: "assignment_change",
      old_value: prev.assigned_to ?? null,
      new_value: data.assignedTo ?? null,
      created_by: context.userId,
      staff_name: profile?.display_name || profile?.email || "Staff",
      staff_role: roleRows?.[0]?.role ?? "staff",
    } as never);

    if (data.assignedTo) {
      const { emitToUsers } = await import("@/lib/notifications/emit.server");
      await emitToUsers([data.assignedTo], {
        kind: "order_assigned",
        title: "New Lead Assigned",
        body: `Lead ${prev.name || prev.lead_code || "New Lead"} has been assigned to your queue.`,
        href: `/admin/leads/${data.leadId}`,
        entityKind: "lead",
        entityId: data.leadId,
      });
    }

    return { ok: true };
  });
