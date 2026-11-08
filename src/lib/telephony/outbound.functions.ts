import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * CRM Click-to-Call via CallerDesk (the only provider). CallerDesk rings the employee's
 * CallerDesk member device first, then bridges the customer. Lifecycle events arrive on
 * /api/public/telephony/callerdesk/events and are correlated by campid (ref_id).
 */
const Input = z.object({
  destination: z.string().min(6).max(20),
  customerId: z.string().uuid().nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
  applicationId: z.string().uuid().nullable().optional(),
});

export const initiateClickToCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const { normalizeIndianMobile } = await import("@/lib/telephony/phone.server");
    const destination = normalizeIndianMobile(data.destination);
    if (!destination) throw new Error("This phone number is not a valid Indian mobile number.");

    // Agent identity always comes from the authenticated employee's own profile.
    const { data: me, error: meErr } = await (context.supabase as any)
      .from("profiles").select("id, is_active, smartflo_agent_id, mobile")
      .eq("id", context.userId).maybeSingle();
    if (meErr) throw new Error("Could not load your profile.");
    if (!me) throw new Error("Your employee profile was not found.");
    if (me.is_active !== true) throw new Error("Your account is not active, so you cannot place calls.");

    // profiles.smartflo_agent_id is the legacy column now holding the optional CallerDesk Member ID.
    const mappedMemberId = typeof me.smartflo_agent_id === "string" && /^\d+$/.test(me.smartflo_agent_id.trim()) ? me.smartflo_agent_id.trim() : null;
    const agentMobile = normalizeIndianMobile(me.mobile);
    if (!agentMobile && !mappedMemberId) throw new Error("Your profile has no valid mobile number. Ask an admin to add the number you use in CallerDesk.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const since = new Date(Date.now() - 90_000).toISOString();
    const { data: dupe } = await db.from("telephony_calls").select("id, ref_id")
      .eq("employee_id", context.userId).eq("direction", "outbound")
      .eq("called_number", destination).in("status", ["ringing", "answered"])
      .gte("started_at", since).order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (dupe) return { ok: true as const, alreadyInProgress: true as const, refId: dupe.ref_id ?? null };

    const { callerDeskClickToCall } = await import("@/lib/telephony/callerdesk.server");
    const { campid, memberId } = await callerDeskClickToCall(agentMobile, mappedMemberId, destination);
    const refId = campid ?? `cd-${crypto.randomUUID()}`;
    const { data: row, error } = await db.from("telephony_calls").insert({
      provider: "callerdesk", call_id: refId, ref_id: refId, direction: "outbound",
      status: "ringing", last_event: "initiated", employee_id: context.userId, agent_id: memberId,
      customer_id: data.customerId ?? null, lead_id: data.leadId ?? null, application_id: data.applicationId ?? null,
      caller_number: agentMobile, called_number: destination, started_at: new Date().toISOString(),
    }).select("id").maybeSingle();
    if (error) {
      console.log(JSON.stringify({ event: "callerdesk_click_to_call", stage: "insert", error: error.message }));
      return { ok: true as const, refId, recorded: false as const };
    }
    return { ok: true as const, refId, recorded: true as const, callRowId: row?.id ?? null };
  });
