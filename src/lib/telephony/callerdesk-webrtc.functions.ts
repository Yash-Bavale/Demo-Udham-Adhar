import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ACCESS_MESSAGE, type AccessReason } from "./callerdesk-webrtc.config";

/** Safe status for the phone panel: reason + names of missing settings only, never values. */
export const getWebRtcStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { accessFor, loadAccount } = await import("./callerdesk-webrtc.server");
    const a = accessFor(context.userId, await loadAccount(context.userId));
    if (!a.authorized) return { authorized: false as const };
    return { authorized: true as const, enabled: a.enabled, missing: a.missing, canRegister: a.canRegister, reason: a.reason, message: ACCESS_MESSAGE[a.reason] };
  });

/** The signed-in employee's own SIP session. Identity comes only from verified auth context. */
export const getWebRtcSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadAccount, readEnv, resolveSession } = await import("./callerdesk-webrtc.server");
    try {
      return await resolveSession(context.userId, await loadAccount(context.userId), readEnv());
    } catch (e) {
      const r = (e as Error).message as AccessReason;
      throw new Error(ACCESS_MESSAGE[r] ?? "Browser phone credentials could not be loaded. Ask an admin to re-save your SIP login.");
    }
  });

/** Creates the pending call row before dialing, so the dialing employee owns the call record. */
export const initiateWebRtcCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    number: z.string().regex(/^\+?\d{8,15}$/),
    customerId: z.string().uuid().nullable().optional(),
    leadId: z.string().uuid().nullable().optional(),
    applicationId: z.string().uuid().nullable().optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { accessFor, loadAccount } = await import("./callerdesk-webrtc.server");
    if (!accessFor(context.userId, await loadAccount(context.userId)).canRegister) throw new Error("Browser calling is not available for your account.");
    const { normalizeIndianMobile, lookupCaller } = await import("./phone.server");
    const mobile = normalizeIndianMobile(data.number);
    const row: Record<string, unknown> = {
      provider: "callerdesk", direction: "outbound", status: "ringing", last_event: "browser_dial",
      call_id: `webrtc:${crypto.randomUUID()}`, employee_id: context.userId,
      called_number: mobile ?? data.number.replace(/\D/g, ""), started_at: new Date().toISOString(),
    };
    if (data.customerId || data.leadId || data.applicationId) {
      // Started from a CRM record: link exactly that record.
      Object.assign(row, { customer_id: data.customerId ?? null, lead_id: data.leadId ?? null, application_id: data.applicationId ?? null });
    } else if (mobile) {
      // Dialled by hand: link only when the number matches a single order/lead, never an arbitrary one.
      try {
        const m = await lookupCaller(mobile);
        if (m.orders.length === 1) row.application_id = m.orders[0].id;
        else if (!m.orders.length && m.lead) row.lead_id = m.lead.id;
      } catch { /* best effort */ }
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: saved, error } = await (supabaseAdmin as any).from("telephony_calls").insert(row).select("id").single();
    if (error) throw new Error("Could not record this call. Please retry.");
    return { callRowId: saved.id as string };
  });

/** Marks the caller's own browser call finished. Webhook reports may still enrich it later. */
export const endWebRtcCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ callRowId: z.string().uuid(), answeredAt: z.number().int().positive().nullable() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    const patch: Record<string, unknown> = { status: data.answeredAt ? "ended" : "missed", last_event: "browser_ended", ended_at: now.toISOString(), updated_at: now.toISOString() };
    if (data.answeredAt) {
      patch.answered_at = new Date(data.answeredAt).toISOString();
      patch.duration_seconds = Math.max(0, Math.round((now.getTime() - data.answeredAt) / 1000));
    }
    await (supabaseAdmin as any).from("telephony_calls").update(patch)
      .eq("id", data.callRowId).eq("employee_id", context.userId).in("status", ["ringing", "answered"]);
    return { ok: true };
  });

/** Identifies an incoming caller for the ringing screen. Staff only; bounded, minimal fields. */
export const lookupIncomingCaller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ number: z.string().max(40) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: staff } = await context.supabase.rpc("has_any_staff_role", { _user_id: context.userId });
    if (!staff) throw new Error("Forbidden");
    const { lookupCaller } = await import("./phone.server");
    return lookupCaller(data.number);
  });

/**
 * Records an inbound browser call once per SIP session (idempotent on the client key).
 * Linking is optional: the employee-selected order is stored only if it truly belongs to this caller.
 */
export const recordInboundWebRtcCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    key: z.string().uuid(), number: z.string().max(40), applicationId: z.string().uuid().nullable(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { accessFor, loadAccount } = await import("./callerdesk-webrtc.server");
    if (!accessFor(context.userId, await loadAccount(context.userId)).canRegister) throw new Error("Browser calling is not available for your account.");
    const { normalizeIndianMobile, lookupCaller } = await import("./phone.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const callId = `webrtc:in:${data.key}`;
    const { data: found } = await db.from("telephony_calls").select("id, employee_id").eq("call_id", callId).maybeSingle();
    const mobile = normalizeIndianMobile(data.number);
    const link: Record<string, unknown> = {};
    if (mobile) {
      try {
        const r = await lookupCaller(mobile);
        const chosen = data.applicationId ? r.orders.find((o) => o.id === data.applicationId) : r.orders.length === 1 ? r.orders[0] : null;
        if (chosen) link.application_id = chosen.id;
        if (r.lead) link.lead_id = r.lead.id;
      } catch { /* best effort */ }
    }
    if (found) {
      if (found.employee_id !== context.userId) throw new Error("Forbidden");
      if (Object.keys(link).length) await db.from("telephony_calls").update({ ...link, updated_at: new Date().toISOString() }).eq("id", found.id);
      return { callRowId: found.id as string };
    }
    const row = {
      provider: "callerdesk", direction: "inbound", status: "ringing", last_event: "browser_ringing", call_id: callId,
      employee_id: context.userId, caller_number: mobile ?? data.number.replace(/\D/g, ""), started_at: new Date().toISOString(), ...link,
    };
    const { data: saved, error } = await db.from("telephony_calls").upsert(row, { onConflict: "call_id", ignoreDuplicates: true }).select("id").maybeSingle();
    if (error) throw new Error("Could not record this call.");
    if (saved) return { callRowId: saved.id as string };
    const { data: again } = await db.from("telephony_calls").select("id").eq("call_id", callId).single();
    return { callRowId: again.id as string };
  });
