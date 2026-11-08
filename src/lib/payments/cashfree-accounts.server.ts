// Server-only DB lookups for Cashfree merchant accounts.
import {
  credsFromEnv,
  credsFromStored,
  selectAccountForWebsite,
  CashfreeRoutingError,
  type CashfreeAccountRow,
  type CashfreeCreds,
} from "./cashfree-accounts";

const ACCOUNT_COLS = "id, account_key, is_legacy, is_active";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

/** AAD binds each ciphertext to its account so a copied row cannot be reused elsewhere. */
export function credentialAad(accountId: string) {
  return `cashfree-account:${accountId}`;
}

export async function encryptPaymentSecret(plain: string, accountId: string) {
  const { encryptSecret } = await import("@/lib/telephony/telephony-crypto.server");
  return encryptSecret(plain, credentialAad(accountId), process.env["PAYMENT_CREDENTIAL_KEY"]);
}

/** Legacy account always uses the original global secrets. Others: saved (encrypted) creds, else per-account env secrets. */
async function resolveCreds(account: CashfreeAccountRow): Promise<CashfreeCreds> {
  if (!account.is_legacy) {
    const { data: row } = await (await admin())
      .from("cashfree_account_credentials")
      .select("client_id, client_secret_ciphertext, mode")
      .eq("account_id", account.id)
      .maybeSingle();
    if (row) {
      const { decryptSecret } = await import("@/lib/telephony/telephony-crypto.server");
      let secret: string;
      try {
        secret = await decryptSecret(row.client_secret_ciphertext, credentialAad(account.id), process.env["PAYMENT_CREDENTIAL_KEY"]);
      } catch {
        throw new CashfreeRoutingError(`Cashfree account ${account.account_key} credentials could not be read.`);
      }
      return credsFromStored(account, { clientId: row.client_id, clientSecret: secret, mode: row.mode });
    }
  }
  return credsFromEnv(account, process.env);
}

/** Creds for a NEW payment, chosen strictly by the lead's trusted website_id. */
export async function credsForWebsite(websiteId: string | null | undefined): Promise<CashfreeCreds> {
  let mapping = null;
  if (websiteId) {
    const { data } = await (await admin())
      .from("cashfree_website_accounts")
      .select(`is_enabled, account:account_id (${ACCOUNT_COLS})`)
      .eq("website_id", websiteId)
      .maybeSingle();
    mapping = data;
  }
  return resolveCreds(selectAccountForWebsite(websiteId, mapping));
}

/** Creds for an EXISTING payment: always the account recorded on it; NULL = historical legacy. */
export async function credsForPayment(paymentAccountId: string | null | undefined): Promise<CashfreeCreds> {
  const q = (await admin()).from("cashfree_merchant_accounts").select(ACCOUNT_COLS);
  const { data } = paymentAccountId
    ? await q.eq("id", paymentAccountId).maybeSingle()
    : await q.eq("is_legacy", true).maybeSingle();
  if (!data) throw new CashfreeRoutingError("Cashfree account for this payment was not found.");
  // Existing payments keep verifying even if the account is later deactivated for new payments.
  return resolveCreds(data as CashfreeAccountRow);
}

/** Checks credentials against Cashfree without creating anything: an unknown order returns 404 for valid keys, 401 for bad ones. */
export async function testCashfreeCreds(c: { clientId: string; clientSecret: string; isProd: boolean }) {
  const base = c.isProd ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
  try {
    const res = await fetch(`${base}/orders/bhs-credential-check-${Date.now()}`, {
      headers: { "x-client-id": c.clientId, "x-client-secret": c.clientSecret, "x-api-version": "2023-08-01", accept: "application/json" },
    });
    if (res.status === 401 || res.status === 403) return { ok: false, message: "Cashfree rejected these keys. Check the App ID, Secret Key and Live/Test mode." };
    if (res.status === 404 || res.ok) return { ok: true, message: "Cashfree accepted these keys." };
    return { ok: false, message: `Cashfree could not be reached (status ${res.status}). Try again.` };
  } catch {
    return { ok: false, message: "Cashfree could not be reached. Try again." };
  }
}
