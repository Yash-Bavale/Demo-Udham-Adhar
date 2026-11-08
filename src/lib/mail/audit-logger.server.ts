import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type IngestionStage =
  | "DISCOVERED"
  | "FETCHED"
  | "PARSED"
  | "NORMALIZED"
  | "DEDUP_SKIPPED"
  | "TICKET_MATCHED"
  | "ORDER_MATCHED"
  | "TICKET_CREATED"
  | "REPLY_APPENDED"
  | "ATTACHMENTS_PROCESSED"
  | "CLOSED_TICKET_REPLY_NEW_TICKET"
  | "COMPLETED"
  | "PROCESSING_ERROR";

export type IngestionAuditEvent = {
  zohoMailUid: string;
  zohoFolderId?: string | null;
  zohoFolderName?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  senderRaw?: string | null;
  senderNormalized?: string | null;
  replyToEmail?: string | null;
  toEmail?: string | null;
  subject?: string | null;
  stage: IngestionStage;
  matchedTicketId?: string | null;
  matchedApplicationId?: string | null;
  matchedCustomerId?: string | null;
  isDuplicate?: boolean;
  metadata?: Record<string, unknown>;
  errorDetails?: Record<string, unknown>;
};

/** Record an immutable lifecycle step for an inbound email. */
export async function recordIngestionAudit(event: IngestionAuditEvent): Promise<void> {
  const { error } = await (supabaseAdmin.from("email_ingestion_audit_logs" as any) as any).insert({
      zoho_mail_uid: event.zohoMailUid,
      zoho_folder_id: event.zohoFolderId ?? null,
      zoho_folder_name: event.zohoFolderName ?? null,
      message_id: event.messageId ?? null,
      in_reply_to: event.inReplyTo ?? null,
      sender_raw: event.senderRaw ?? null,
      sender_normalized: event.senderNormalized ?? null,
      reply_to_email: event.replyToEmail ?? null,
      to_email: event.toEmail ?? null,
      subject: event.subject ?? null,
      stage: event.stage,
      matched_ticket_id: event.matchedTicketId ?? null,
      matched_application_id: event.matchedApplicationId ?? null,
      matched_customer_id: event.matchedCustomerId ?? null,
      is_duplicate: event.isDuplicate ?? false,
      metadata: event.metadata ?? null,
      error_details: event.errorDetails ?? null,
  } as never);
  if (error) {
    throw new Error(`[audit] recordIngestionAudit failed for UID ${event.zohoMailUid}: ${error.message}`);
  }
}

export type ProcessingErrorInput = {
  zohoMailUid: string;
  zohoFolderId?: string | null;
  zohoFolderName?: string | null;
  messageId?: string | null;
  fromEmail?: string | null;
  replyToEmail?: string | null;
  subject?: string | null;
  bodySnippet?: string | null;
  rawHeaders?: Record<string, unknown>;
  errorStage: "FETCH" | "PARSE" | "MATCH" | "PERSIST" | "ATTACHMENT";
  errorMessage: string;
  errorStack?: string | null;
};

/** Record a technical or processing failure into the retryable email_processing_errors queue. */
export async function recordProcessingError(input: ProcessingErrorInput): Promise<string | null> {
  const now = new Date().toISOString();
  const { data, error } = await (supabaseAdmin.from("email_processing_errors" as any) as any)
      .upsert(
        {
          zoho_mail_uid: input.zohoMailUid,
          zoho_folder_id: input.zohoFolderId ?? null,
          zoho_folder_name: input.zohoFolderName ?? null,
          message_id: input.messageId ?? null,
          from_email: input.fromEmail ?? null,
          reply_to_email: input.replyToEmail ?? null,
          subject: input.subject ?? null,
          body_snippet: (input.bodySnippet || "").slice(0, 1000),
          raw_headers: input.rawHeaders ?? null,
          error_stage: input.errorStage,
          error_message: input.errorMessage.slice(0, 1000),
          error_stack: input.errorStack?.slice(0, 2000) ?? null,
          status: "new",
          updated_at: now,
        } as never,
        { onConflict: "zoho_mail_uid" },
      )
      .select("id")
      .maybeSingle();

  if (error) {
    throw new Error(`[audit] recordProcessingError failed for UID ${input.zohoMailUid}: ${error.message}`);
  }
  return (data as any)?.id ?? null;
}
