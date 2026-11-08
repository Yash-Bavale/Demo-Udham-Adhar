import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole, isUserAdmin } from "@/lib/audit";

const ChannelEnum = z.enum(["whatsapp", "email", "call", "note", "sms"]);
const OutcomeEnum = z.enum([
  "connected",
  "no_answer",
  "wrong_number",
  "not_interested",
  "callback",
  "converted_intent",
  "sent",
]);

export const logLeadContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        channel: ChannelEnum.optional(),
        channels: z.array(ChannelEnum).optional(),
        outcome: OutcomeEnum.optional(),
        outcomes: z.array(OutcomeEnum).optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const channelList = (data.channels && data.channels.length > 0)
      ? data.channels
      : (data.channel ? [data.channel] : ["call"]);
    const outcomeList = (data.outcomes && data.outcomes.length > 0)
      ? data.outcomes
      : (data.outcome ? [data.outcome] : ["connected"]);

    for (const ch of channelList) {
      for (const out of outcomeList) {
        const { error } = await supabase.from("lead_contact_events").insert({
          lead_id: data.leadId,
          user_id: userId,
          channel: ch,
          outcome: out,
          notes: data.notes ?? null,
        });
        if (error) throw new Error(error.message);
      }
    }

    const channelText = channelList.join(", ");
    const outcomeText = outcomeList.join(", ");

    // Mirror into activity_logs so it shows in the lead timeline.
    // Use admin client because RLS on activity_logs blocks user-scope inserts.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("activity_logs").insert({
        lead_id: data.leadId,
        user_id: userId,
        activity_type: "contact_logged",
        activity_description: `${channelText} • ${outcomeText}${data.notes ? ` — ${data.notes}` : ""}`,
      } as never);
    } catch (e) {
      console.warn("[logLeadContact] activity_logs mirror failed", e);
    }

    // Mirror into application_events so the Internal Notes & Activity feed shows it.
    try {
      const [{ data: profile }, { data: roleRow }, { data: lead }] = await Promise.all([
        supabase.from("profiles").select("full_name, display_name, email").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
        supabase.from("leads").select("customer_id").eq("id", data.leadId).maybeSingle(),
      ]);
      await supabase.from("application_events").insert({
        lead_id: data.leadId,
        customer_id: lead?.customer_id ?? null,
        event_type: "contact_logged",
        old_value: data.channel,
        new_value: outcomeText,
        note: data.notes ?? null,
        created_by: userId,
        staff_name: profile?.full_name || profile?.display_name || profile?.email || "Unknown Employee",
        staff_role: (roleRow?.role as string | undefined) ?? "staff",
      } as never);
    } catch { /* non-fatal */ }

    return { ok: true };
  });

export const listContactEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ leadId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("lead_contact_events")
      .select("id, channel, outcome, notes, created_at, user_id")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id).filter(Boolean))) as string[];
    let nameMap = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, display_name, email")
        .in("id", userIds);
      for (const p of profs ?? []) nameMap.set(p.id, p.full_name || p.display_name || p.email || "Unknown Employee");
    }
    return { rows: (rows ?? []).map((r) => ({ ...r, staff_name: nameMap.get(r.user_id) || "Unknown Employee" })) };
  });

const RangeInput = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

type EmployeeRow = {
  userId: string;
  name: string;
  email: string;
  role: string | null;
  leadsAssigned: number;
  leadsContacted: number;
  contactEvents: number;
  avgResponseMinutes: number | null;
  conversionsEmployee: number;
  conversionsSystem: number;
  totalConversions: number;
  conversionRate: number;
  uniqueLeads: number;
  repeatLeads: number;
};

function windowRange(from?: string, to?: string) {
  const now = new Date();
  const toDate = to ? new Date(to) : now;
  const fromDate = from ? new Date(from) : new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  return { fromIso: fromDate.toISOString(), toIso: toDate.toISOString() };
}

export const getPerformanceOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RangeInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin"]);
    const { supabase } = context;
    const { fromIso, toIso } = windowRange(data.from, data.to);

    // Pull staff list
    const [profilesRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, display_name, email"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (profilesRes.error) throw new Error(profilesRes.error.message);
    if (rolesRes.error) throw new Error(rolesRes.error.message);

    const staffRoles = new Set([
      "admin",
      "super_admin",
      "operations",
      "support",
      "accounts",
      "finance",
      "manager",
      "executive",
    ]);
    const roleMap = new Map<string, string>();
    for (const r of rolesRes.data ?? []) {
      if (staffRoles.has(r.role as string) && !roleMap.has(r.user_id))
        roleMap.set(r.user_id, r.role as string);
    }
    const staff = (profilesRes.data ?? []).filter((p) => roleMap.has(p.id));

    const [leadsRes, contactsRes, attrRes] = await Promise.all([
      supabase
        .from("leads")
        .select("id, assigned_to, created_at")
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      supabase
        .from("lead_contact_events")
        .select("lead_id, user_id, created_at")
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      supabase
        .from("lead_attribution")
        .select("lead_id, first_contact_user_id, first_contact_at, converted_user_id, converted_at, conversion_kind, is_unique_lead")
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
    ]);
    if (leadsRes.error) throw new Error(leadsRes.error.message);
    if (contactsRes.error) throw new Error(contactsRes.error.message);
    if (attrRes.error) throw new Error(attrRes.error.message);

    // First-contact latency per lead
    const firstContactByLead = new Map<string, { userId: string; at: string; leadCreated?: string }>();
    for (const l of leadsRes.data ?? []) {
      // seeded below with contacts
      firstContactByLead.set(l.id, { userId: "", at: "", leadCreated: l.created_at });
    }
    const sortedContacts = [...(contactsRes.data ?? [])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const firstByLead = new Map<string, { userId: string; at: string }>();
    for (const c of sortedContacts) {
      if (!firstByLead.has(c.lead_id))
        firstByLead.set(c.lead_id, { userId: c.user_id, at: c.created_at });
    }

    const rows: EmployeeRow[] = staff.map((s) => {
      const leadsAssigned = (leadsRes.data ?? []).filter((l) => l.assigned_to === s.id);
      const myContacts = (contactsRes.data ?? []).filter((c) => c.user_id === s.id);
      const myFirst = [...firstByLead.entries()].filter(([, v]) => v.userId === s.id);
      const contactedLeadIds = new Set(myContacts.map((c) => c.lead_id));

      let latencies: number[] = [];
      for (const [leadId, fc] of myFirst) {
        const lead = (leadsRes.data ?? []).find((l) => l.id === leadId);
        if (lead) {
          latencies.push((new Date(fc.at).getTime() - new Date(lead.created_at).getTime()) / 60000);
        }
      }
      const avgResponseMinutes = latencies.length
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : null;

      const myAttr = (attrRes.data ?? []).filter(
        (a) => a.converted_user_id === s.id || a.first_contact_user_id === s.id,
      );
      const conversionsEmployee = myAttr.filter(
        (a) => a.conversion_kind === "employee_handled" && a.converted_user_id === s.id,
      ).length;
      const conversionsSystem = myAttr.filter(
        (a) => a.conversion_kind === "system_paid" && a.converted_user_id === s.id,
      ).length;
      const totalConversions = conversionsEmployee + conversionsSystem;
      const uniqueLeads = myAttr.filter((a) => a.is_unique_lead).length;
      const repeatLeads = myAttr.filter((a) => !a.is_unique_lead).length;
      const conversionRate = leadsAssigned.length
        ? Math.round((totalConversions / leadsAssigned.length) * 100)
        : 0;

      return {
        userId: s.id,
        name: s.full_name ?? s.display_name ?? s.email ?? "Unknown Employee",
        email: s.email ?? "",
        role: roleMap.get(s.id) ?? null,
        leadsAssigned: leadsAssigned.length,
        leadsContacted: contactedLeadIds.size,
        contactEvents: myContacts.length,
        avgResponseMinutes,
        conversionsEmployee,
        conversionsSystem,
        totalConversions,
        conversionRate,
        uniqueLeads,
        repeatLeads,
      };
    });

    // Totals
    const totals = {
      leads: (leadsRes.data ?? []).length,
      contacts: (contactsRes.data ?? []).length,
      conversions: (attrRes.data ?? []).filter((a) => a.converted_at).length,
      employeeHandled: (attrRes.data ?? []).filter((a) => a.conversion_kind === "employee_handled").length,
      systemPaid: (attrRes.data ?? []).filter((a) => a.conversion_kind === "system_paid").length,
      uniqueLeads: (attrRes.data ?? []).filter((a) => a.is_unique_lead).length,
      repeatLeads: (attrRes.data ?? []).filter((a) => !a.is_unique_lead).length,
    };

    return { rows: rows.sort((a, b) => b.totalConversions - a.totalConversions), totals, fromIso, toIso };
  });

export const getMyPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RangeInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { fromIso, toIso } = windowRange(data.from, data.to);

    const [leadsRes, contactsRes, attrRes] = await Promise.all([
      supabase
        .from("leads")
        .select("id, name, service, status, created_at, assigned_to")
        .eq("assigned_to", userId)
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("lead_contact_events")
        .select("id, lead_id, channel, outcome, notes, created_at")
        .eq("user_id", userId)
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("lead_attribution")
        .select("lead_id, converted_user_id, conversion_kind, converted_at, is_unique_lead")
        .or(`converted_user_id.eq.${userId},first_contact_user_id.eq.${userId}`),
    ]);
    if (leadsRes.error) throw new Error(leadsRes.error.message);
    if (contactsRes.error) throw new Error(contactsRes.error.message);
    if (attrRes.error) throw new Error(attrRes.error.message);

    const contactedLeadIds = new Set((contactsRes.data ?? []).map((c) => c.lead_id));
    const conversions = (attrRes.data ?? []).filter((a) => a.converted_user_id === userId && a.converted_at);

    return {
      counters: {
        leadsAssigned: (leadsRes.data ?? []).length,
        leadsContacted: contactedLeadIds.size,
        contactEvents: (contactsRes.data ?? []).length,
        conversions: conversions.length,
        employeeHandled: conversions.filter((a) => a.conversion_kind === "employee_handled").length,
        systemPaid: conversions.filter((a) => a.conversion_kind === "system_paid").length,
      },
      leads: leadsRes.data ?? [],
      contacts: contactsRes.data ?? [],
      fromIso,
      toIso,
    };
  });

export const getEmployeeDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ userId: z.string().uuid(), from: z.string().optional(), to: z.string().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const isAdmin = await isUserAdmin(context.supabase, context.userId);
    if (!isAdmin && data.userId !== context.userId) throw new Error("Forbidden");

    const { supabase } = context;
    const { fromIso, toIso } = windowRange(data.from, data.to);

    const [contactsRes, attrRes, profileRes] = await Promise.all([
      supabase
        .from("lead_contact_events")
        .select("id, lead_id, channel, outcome, notes, created_at, lead:leads!lead_contact_events_lead_id_fkey(name, service, lead_code)")
        .eq("user_id", data.userId)
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("lead_attribution")
        .select("lead_id, conversion_kind, converted_at, is_unique_lead, lead:leads!lead_attribution_lead_id_fkey(name, service)")
        .eq("converted_user_id", data.userId)
        .not("converted_at", "is", null)
        .gte("converted_at", fromIso)
        .lte("converted_at", toIso)
        .order("converted_at", { ascending: false })
        .limit(200),
      supabase.from("profiles").select("id, display_name, email").eq("id", data.userId).maybeSingle(),
    ]);
    if (contactsRes.error) throw new Error(contactsRes.error.message);
    if (attrRes.error) throw new Error(attrRes.error.message);

    return {
      profile: profileRes.data ?? { id: data.userId, display_name: null, email: null },
      contacts: contactsRes.data ?? [],
      conversions: attrRes.data ?? [],
      fromIso,
      toIso,
    };
  });
