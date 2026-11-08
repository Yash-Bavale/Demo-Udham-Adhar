import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EMPTY_IVR_DRAFT, IvrDraftSchema, requireTelephonyAdmin } from "./ivr.config";

export const getIvrDraft = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireTelephonyAdmin(context);
  const { data, error } = await context.supabase.from("callerdesk_ivr_settings").select("config, revision, sync_status, updated_at").eq("id", "primary").maybeSingle();
  if (error) throw new Error("Could not load IVR settings.");
  return { config: data ? IvrDraftSchema.parse(data.config) : EMPTY_IVR_DRAFT, revision: data?.revision ?? 0, syncStatus: "not_applied" as const, updatedAt: data?.updated_at ?? null };
});

export const saveIvrDraft = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ config: IvrDraftSchema, revision: z.number().int().min(0) }).parse(d))
  .handler(async ({ context, data }) => {
    await requireTelephonyAdmin(context);
    const row = { config: data.config, revision: data.revision + 1, sync_status: "not_applied", updated_by: context.userId, updated_at: new Date().toISOString() };
    const query = data.revision === 0
      ? context.supabase.from("callerdesk_ivr_settings").insert({ id: "primary", ...row })
      : context.supabase.from("callerdesk_ivr_settings").update(row).eq("id", "primary").eq("revision", data.revision);
    const { data: saved, error } = await query.select("revision, updated_at").maybeSingle();
    if (error?.code === "23505" || (!error && !saved)) throw new Error("Another administrator saved changes. Reload settings before saving again.");
    if (error || !saved) throw new Error("IVR settings could not be saved.");
    return { revision: saved.revision, updatedAt: saved.updated_at, syncStatus: "not_applied" as const };
  });

/** Read-only connectivity check. Never initiates a call or returns member identities or secrets. */
export const checkCallerDeskApi = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireTelephonyAdmin(context);
  const authcode = process.env["CALLERDESK_AUTHCODE"];
  if (!authcode) return { ok: false, message: "CALLERDESK_AUTHCODE is missing." };
  const body = new FormData(); body.set("authcode", authcode);
  try {
    const res = await fetch("https://app.callerdesk.io/api/getmemberlist_V2", { method: "POST", body, signal: AbortSignal.timeout(15_000) });
    const payload: any = await res.json().catch(() => null);
    if (res.ok && String(payload?.type).toLowerCase() === "success" && Array.isArray(payload?.getmember)) return { ok: true, message: `CallerDesk API reachable; ${payload.getmember.length} members returned. No call placed.` };
    const message = String(payload?.message ?? "").toLowerCase();
    return { ok: false, message: message.includes("inactive") ? "CallerDesk reports that this API account is inactive." : "CallerDesk refused the member lookup. Verify the API account and auth code in the CallerDesk portal." };
  } catch { return { ok: false, message: "CallerDesk could not be reached. Retry the account check." }; }
});