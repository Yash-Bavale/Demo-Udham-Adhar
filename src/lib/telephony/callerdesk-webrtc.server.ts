import { buildWssUrl, missingConfig, webRtcAccess, SHARED_CONFIG_NAMES, WEBRTC_CONFIG_NAMES, type AccountMeta, type AccountStatus, type Env } from "./callerdesk-webrtc.config";
import { decryptSecret } from "./telephony-crypto.server";

/** Reads CallerDesk WebRTC config from server secrets. Values never leave here except via resolveSession(). */
export function readEnv(): Env {
  const e = process.env;
  const out: Env = {};
  for (const n of WEBRTC_CONFIG_NAMES) out[n] = e[n];
  return out;
}

export type AccountRow = {
  employee_id: string; status: AccountStatus; sip_username: string | null; display_name: string | null;
  sip_password_ciphertext: string | null; member_id: string | null;
};

export function toMeta(row: AccountRow | null): AccountMeta | null {
  if (!row) return null;
  return { status: row.status, sipUsername: row.sip_username, displayName: row.display_name, hasSecret: !!row.sip_password_ciphertext };
}

/** Loads ONLY the given employee's row with the service role (the table has no client access). */
export async function loadAccount(employeeId: string): Promise<AccountRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).from("employee_telephony_accounts")
    .select("employee_id, status, sip_username, display_name, sip_password_ciphertext, member_id")
    .eq("employee_id", employeeId).maybeSingle();
  if (error) throw new Error("Could not load browser phone account.");
  return (data as AccountRow) ?? null;
}

export function accessFor(userId: string, row: AccountRow | null, env: Env = readEnv()) {
  return webRtcAccess({ userId, account: toMeta(row), enabledFlag: process.env["CALLERDESK_WEBRTC_ENABLED"], env });
}

export type SessionConfig = { wssUrl: string; sipDomain: string; extension: string; password: string; displayName: string };

function shared(env: Env) {
  if (missingConfig(env, SHARED_CONFIG_NAMES).length) return null;
  const wssUrl = buildWssUrl(env.CALLERDESK_ASTERISK_HOST!, env.CALLERDESK_WS_PORT!, env.CALLERDESK_WS_PATH!);
  return wssUrl ? { wssUrl, sipDomain: env.CALLERDESK_SIP_DOMAIN!.trim() } : null;
}

/** Legacy single-agent env credentials (rollback source and one-time migration input). */
export function legacyCredentials(env: Env) {
  const u = env.CALLERDESK_SIP_EXTENSION?.trim(), p = env.CALLERDESK_SIP_PASSWORD, d = env.CALLERDESK_DISPLAY_NAME?.trim();
  return u && p && d ? { username: u, password: p, displayName: d } : null;
}

/**
 * Builds the SIP session for the verified employee. SIP digest auth runs in the browser,
 * so the employee's own password is returned to that employee only, for in-memory use by SIP.js.
 * Never logged, never persisted client-side.
 */
export async function resolveSession(userId: string, row: AccountRow | null, env: Env, rawKey?: string): Promise<SessionConfig> {
  const a = accessFor(userId, row, env);
  if (!a.canRegister) throw new Error(a.reason);
  const s = shared(env);
  if (!s) throw new Error("config_missing");
  if (a.source === "legacy") {
    const l = legacyCredentials(env);
    if (!l) throw new Error("config_missing");
    return { ...s, extension: l.username, password: l.password, displayName: l.displayName };
  }
  const r = row!;
  if (r.employee_id !== userId) throw new Error("no_account");
  const password = await decryptSecret(r.sip_password_ciphertext!, userId, rawKey);
  return { ...s, extension: r.sip_username!.trim(), password, displayName: (r.display_name || r.sip_username!).trim() };
}
