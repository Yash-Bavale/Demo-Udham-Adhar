import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTelephonyAdmin } from "./ivr.config";
import { LEGACY_ENV_USER_IDS } from "./callerdesk-webrtc.config";

export type TelephonyAccountDto = { employeeId: string; status: "unprovisioned" | "active" | "disabled"; memberId: string | null; sipUsername: string | null; displayName: string | null; hasPassword: boolean; source: string; verifiedAt: string | null; updatedAt: string };
export type StaffDto = { id: string; name: string; email: string | null };

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

/** Account metadata only — never ciphertext or passwords. */
export const listTelephonyAccounts = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireTelephonyAdmin(context);
  const db = await admin();
  const [{ data: rows, error }, { data: staff }] = await Promise.all([
    db.from("employee_telephony_accounts").select("employee_id, status, member_id, sip_username, display_name, sip_password_ciphertext, source, verified_at, updated_at"),
    db.from("profiles").select("id, full_name, email").eq("is_active", true).order("full_name"),
  ]);
  if (error) throw new Error("Could not load browser phone accounts.");
  const result: { accounts: TelephonyAccountDto[]; staff: StaffDto[]; legacyEmployeeIds: string[] } = {
    accounts: (rows ?? []).map((r: any) => ({
      employeeId: r.employee_id, status: r.status, memberId: r.member_id, sipUsername: r.sip_username, displayName: r.display_name,
      hasPassword: !!r.sip_password_ciphertext, source: r.source, verifiedAt: r.verified_at, updatedAt: r.updated_at,
    })),
    staff: (staff ?? []).map((p: any) => ({ id: p.id, name: p.full_name || p.email || "Employee", email: p.email })),
    legacyEmployeeIds: [...LEGACY_ENV_USER_IDS],
  };
  return result;
});

const SaveSchema = z.object({
  employeeId: z.string().uuid(),
  memberId: z.string().trim().regex(/^\d*$/).max(20).optional().default(""),
  sipUsername: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9._@+-]+$/),
  displayName: z.string().trim().max(80).optional().default(""),
  password: z.string().max(128).optional().default(""),
  status: z.enum(["unprovisioned", "active", "disabled"]),
});

/** Creates/updates an account. A new password is encrypted server-side, bound to the employee. */
export const saveTelephonyAccount = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveSchema.parse(d))
  .handler(async ({ context, data }) => {
    await requireTelephonyAdmin(context);
    const { encryptSecret, decryptSecret } = await import("./telephony-crypto.server");
    const db = await admin();
    const { data: existing } = await db.from("employee_telephony_accounts").select("id, sip_password_ciphertext").eq("employee_id", data.employeeId).maybeSingle();
    const row: Record<string, unknown> = {
      employee_id: data.employeeId, member_id: data.memberId || null, sip_username: data.sipUsername,
      display_name: data.displayName || null, status: data.status, updated_by: context.userId,
    };
    if (data.password) {
      const ct = await encryptSecret(data.password, data.employeeId).catch(() => { throw new Error("Credential encryption is not configured on the server."); });
      if ((await decryptSecret(ct, data.employeeId)) !== data.password) throw new Error("Credential verification failed. Nothing was saved.");
      row.sip_password_ciphertext = ct; row.verified_at = new Date().toISOString();
    } else if (!existing?.sip_password_ciphertext && data.status === "active") {
      throw new Error("Enter the SIP password before activating this account.");
    }
    const q = existing
      ? db.from("employee_telephony_accounts").update(row).eq("id", existing.id)
      : db.from("employee_telephony_accounts").insert({ ...row, created_by: context.userId, source: "admin" });
    const { error } = await q;
    if (error?.code === "23505") throw new Error("That SIP username is already assigned to another employee.");
    if (error) throw new Error("Browser phone account could not be saved.");
    return { ok: true };
  });

/**
 * One-time move of the legacy env SIP login into the original test agent's vault row.
 * Reads env on the server, encrypts, verifies by decrypting, then writes. Env stays untouched for rollback.
 */
export const migrateLegacyTelephonyAccount = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireTelephonyAdmin(context);
  const { legacyCredentials, readEnv } = await import("./callerdesk-webrtc.server");
  const { encryptSecret, decryptSecret } = await import("./telephony-crypto.server");
  const creds = legacyCredentials(readEnv());
  if (!creds) throw new Error("The legacy SIP login is not configured, so there is nothing to migrate.");
  const employeeId = LEGACY_ENV_USER_IDS[0];
  const db = await admin();
  const { data: existing } = await db.from("employee_telephony_accounts").select("id").eq("employee_id", employeeId).maybeSingle();
  if (existing) return { ok: true, alreadyMigrated: true };
  const ct = await encryptSecret(creds.password, employeeId).catch(() => { throw new Error("Credential encryption is not configured on the server."); });
  if ((await decryptSecret(ct, employeeId)) !== creds.password) throw new Error("Credential verification failed. Nothing was saved.");
  const { error } = await db.from("employee_telephony_accounts").insert({
    employee_id: employeeId, member_id: "122354", sip_username: creds.username, display_name: creds.displayName,
    sip_password_ciphertext: ct, status: "active", source: "legacy_env_migration", verified_at: new Date().toISOString(),
    created_by: context.userId, updated_by: context.userId,
  });
  if (error) throw new Error("Migration could not be saved.");
  return { ok: true, alreadyMigrated: false };
});
