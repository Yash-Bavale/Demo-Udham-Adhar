// Outgoing email transport selector (server-only).
// Keeps templates, queue, retries, threading and logging untouched — it only
// decides WHICH service physically delivers the message.

import { isZohoAuthOrRateLimitError, sendViaZoho, type ZohoSendInput, type ZohoSendResult } from "./zoho-smtp.server";
import { sendViaZepto, zeptoConfigured, zeptoFromEmail } from "./zeptomail.server";

export type MailProvider = "zoho" | "zeptomail";

/**
 * Active provider:
 *  - EMAIL_PROVIDER=zeptomail  -> ZeptoMail (requires ZEPTOMAIL_TOKEN)
 *  - EMAIL_PROVIDER=zoho       -> Zoho
 *  - unset                     -> ZeptoMail when configured, otherwise Zoho
 */
export function activeMailProvider(): MailProvider {
  const pref = (process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  if (pref === "zoho") return "zoho";
  if (pref === "zeptomail" || pref === "zepto") return zeptoConfigured() ? "zeptomail" : "zoho";
  return zeptoConfigured() ? "zeptomail" : "zoho";
}

export type MailProviderChoice = "auto" | MailProvider;

// Small cache so the queue loop doesn't hit the DB for every single email.
let cached: { value: MailProviderChoice; at: number } | null = null;
const CACHE_MS = 15_000;

export function clearMailProviderCache() {
  cached = null;
}

/** Admin-selected provider stored in public.app_settings.email_provider. */
export async function mailProviderChoice(): Promise<MailProviderChoice> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  let value: MailProviderChoice = "auto";
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("app_settings").select("email_provider").eq("id", 1).maybeSingle();
    const v = (data as { email_provider?: string } | null)?.email_provider;
    if (v === "zoho" || v === "zeptomail" || v === "auto") value = v;
  } catch {
    value = "auto";
  }
  cached = { value, at: Date.now() };
  return value;
}

/** Provider actually used for the next send. */
export async function resolveMailProvider(): Promise<MailProvider> {
  const choice = await mailProviderChoice();
  if (choice === "zoho") return "zoho";
  if (choice === "zeptomail") return zeptoConfigured() ? "zeptomail" : "zoho";
  return activeMailProvider();
}

export async function sendViaActiveProvider(input: ZohoSendInput): Promise<ZohoSendResult> {
  return (await resolveMailProvider()) === "zeptomail" ? sendViaZepto(input) : sendViaZoho(input);
}

export function senderEmailFor(provider: MailProvider): string {
  return provider === "zeptomail"
    ? zeptoFromEmail()
    : (process.env.ZOHO_FROM_EMAIL || process.env.ZOHO_SMTP_USER || "help@businesshelpservices.com").trim().toLowerCase();
}

export async function activeSenderEmail(): Promise<string> {
  return senderEmailFor(await resolveMailProvider());
}

/**
 * Provider-side throttling / blocking that must pause the whole batch instead of
 * burning retry attempts on individual emails.
 */
export function isProviderThrottleError(error: string | null | undefined): boolean {
  const value = (error || "").toLowerCase();
  return (
    isZohoAuthOrRateLimitError(value) ||
    value.includes("unusual sending activity") ||
    value.includes("try after sometime") ||
    value.includes("5.4.6") ||
    value.includes("sending limit") ||
    value.includes("quota") ||
    value.includes("429") ||
    value.includes("temporarily blocked") ||
    value.includes("sm_133") // ZeptoMail: sending blocked / credits exhausted
  );
}
