// Pure Cashfree merchant-account logic (no I/O) so routing rules are unit-testable.
// Credentials are never stored in the database: the legacy account uses the
// original global CASHFREE_* secrets; every other account uses
// CASHFREE_<ACCOUNT_KEY>_CLIENT_ID / _CLIENT_SECRET / _MODE.

export interface CashfreeAccountRow {
  id: string;
  account_key: string;
  is_legacy: boolean;
  is_active: boolean;
}

export interface CashfreeMappingRow {
  is_enabled: boolean;
  account: CashfreeAccountRow | null;
}

export interface CashfreeCreds {
  accountId: string;
  clientId: string;
  clientSecret: string;
  isProd: boolean;
  apiUrl: string;
}

export class CashfreeRoutingError extends Error {}

/** New payments: an explicit, enabled mapping to an active account is required. Never falls back. */
export function selectAccountForWebsite(
  websiteId: string | null | undefined,
  mapping: CashfreeMappingRow | null | undefined,
): CashfreeAccountRow {
  if (!websiteId) throw new CashfreeRoutingError("Payment cannot start: order has no website.");
  if (!mapping || !mapping.account)
    throw new CashfreeRoutingError("Cashfree is not set up for this website.");
  if (!mapping.is_enabled) throw new CashfreeRoutingError("Cashfree is disabled for this website.");
  if (!mapping.account.is_active)
    throw new CashfreeRoutingError("The Cashfree account for this website is inactive.");
  return mapping.account;
}

export interface StoredCashfreeCreds {
  clientId: string;
  clientSecret: string;
  mode: "production" | "sandbox";
}

/** Credentials saved from the admin screen (decrypted on the server). Mode is always explicit. */
export function credsFromStored(account: CashfreeAccountRow, stored: StoredCashfreeCreds): CashfreeCreds {
  const clientId = stored.clientId.trim();
  const clientSecret = stored.clientSecret.trim();
  if (!clientId || !clientSecret) {
    throw new CashfreeRoutingError(`Cashfree account ${account.account_key} has no credentials configured.`);
  }
  const isProd = stored.mode === "production";
  return {
    accountId: account.id,
    clientId,
    clientSecret,
    isProd,
    apiUrl: isProd ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg",
  };
}

export function credsFromEnv(
  account: CashfreeAccountRow,
  env: Record<string, string | undefined>,
): CashfreeCreds {
  const prefix = account.is_legacy ? "CASHFREE_" : `CASHFREE_${account.account_key}_`;
  const clientId = String(env[`${prefix}CLIENT_ID`] ?? "").trim();
  const clientSecret = String(env[`${prefix}CLIENT_SECRET`] ?? "").trim();
  const mode = String(env[`${prefix}MODE`] ?? "").trim().toLowerCase();
  if (!clientId || !clientSecret) {
    throw new CashfreeRoutingError(`Cashfree account ${account.account_key} has no credentials configured.`);
  }
  let isProd: boolean;
  if (mode) isProd = mode === "production" || mode === "live" || mode === "prod";
  else if (account.is_legacy)
    isProd = !(clientId.toUpperCase().startsWith("TEST") || clientSecret.toLowerCase().includes("test"));
  else throw new CashfreeRoutingError(`Cashfree account ${account.account_key} has no mode configured.`);
  return {
    accountId: account.id,
    clientId,
    clientSecret,
    isProd,
    apiUrl: isProd ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg",
  };
}
