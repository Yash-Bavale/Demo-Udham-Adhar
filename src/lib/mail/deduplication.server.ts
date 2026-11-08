import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Filter an array of Zoho UIDs to return only the ones that have NOT yet been ingested.
 * Uses a single batch query against email_logs and email_ingestion_audit_logs.
 */
export async function filterUnseenUids(uids: string[]): Promise<Set<string>> {
  if (uids.length === 0) return new Set();

  const [logsRes, auditRes] = await Promise.all([
    supabaseAdmin
      .from("email_logs")
      .select("zoho_mail_uid")
      .in("zoho_mail_uid", uids),
    (supabaseAdmin.from("email_ingestion_audit_logs" as any) as any)
      .select("zoho_mail_uid")
      .in("zoho_mail_uid", uids)
      .eq("stage", "COMPLETED"),
  ]);

  const seen = new Set<string>();

  ((logsRes.data ?? []) as Array<{ zoho_mail_uid: string | null }>).forEach((r) => {
    if (r.zoho_mail_uid) seen.add(r.zoho_mail_uid);
  });

  ((auditRes.data ?? []) as Array<{ zoho_mail_uid: string | null }>).forEach((r) => {
    if (r.zoho_mail_uid) seen.add(r.zoho_mail_uid);
  });

  return seen;
}

/**
 * Check if a single message has already been processed using its normalized Message-ID or Zoho UID.
 */
export async function isMessageAlreadyIngested(
  zohoUid: string,
  normalizedMessageId: string | null,
): Promise<{ isDuplicate: boolean; matchedTicketId?: string | null }> {
  // 1. Check by Zoho UID in email_logs
  if (zohoUid) {
    const { data: logByUid } = await supabaseAdmin
      .from("email_logs")
      .select("id, application_id")
      .eq("zoho_mail_uid", zohoUid)
      .limit(1)
      .maybeSingle();

    if (logByUid) return { isDuplicate: true };
  }

  // 2. Check by Message-ID in email_logs
  if (normalizedMessageId) {
    const { data: logByMsgId } = await supabaseAdmin
      .from("email_logs")
      .select("id")
      .eq("message_id", normalizedMessageId)
      .eq("direction", "incoming")
      .limit(1)
      .maybeSingle();

    if (logByMsgId) return { isDuplicate: true };

    // 3. Check by Message-ID in ticket_replies
    const { data: repByMsgId } = await supabaseAdmin
      .from("ticket_replies")
      .select("ticket_id")
      .eq("email_message_id", normalizedMessageId)
      .limit(1)
      .maybeSingle();

    if (repByMsgId) {
      return { isDuplicate: true, matchedTicketId: (repByMsgId as any).ticket_id };
    }
  }

  return { isDuplicate: false };
}
