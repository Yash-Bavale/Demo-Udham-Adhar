import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  fetchMessageAttachmentsList,
  downloadZohoAttachment,
  type ZohoAttachmentMeta,
} from "./zoho-inbox.server";
import { recordProcessingError } from "./audit-logger.server";

export type IngestedAttachmentResult = {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  zohoAttachmentId: string;
  cid?: string;
  isInline?: boolean;
};

/**
 * Process and upload all attachments for an inbound Zoho message to Supabase Storage,
 * linking them to the ticket and ticket reply.
 */
export async function processInboundAttachments(input: {
  accountId: string;
  folderId: string;
  folderName: string;
  zohoUid: string;
  ticketId: string;
  ticketReplyId: string;
}): Promise<IngestedAttachmentResult[]> {
  const results: IngestedAttachmentResult[] = [];
  let attachmentList: ZohoAttachmentMeta[] = [];

  try {
    attachmentList = await fetchMessageAttachmentsList(input.zohoUid, input.folderId);
  } catch (e) {
    console.warn(`[attachments] Failed to list attachments for UID ${input.zohoUid}:`, e);
    return [];
  }

  if (attachmentList.length === 0) return [];

  for (const meta of attachmentList) {
    try {
      const downloaded = await downloadZohoAttachment(
        input.zohoUid,
        input.folderId,
        meta.attachmentId,
        meta.attachmentName,
        meta.isInline,
        meta.cid,
      );

      if (!downloaded || !downloaded.buffer) {
        throw new Error(`Empty attachment buffer for ${meta.attachmentName}`);
      }

      const safeFilename = meta.attachmentName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `support-tickets/${input.ticketId}/${input.ticketReplyId}/${Date.now()}_${safeFilename}`;
      const bucket = "documents";

      const { error: uploadErr } = await supabaseAdmin.storage
        .from(bucket)
        .upload(storagePath, downloaded.buffer, {
          contentType: downloaded.contentType || meta.contentType || "application/octet-stream",
          upsert: true,
        });

      if (uploadErr) {
        throw new Error(`Storage upload error: ${uploadErr.message}`);
      }

      const identifier = meta.cid || meta.attachmentId;

      await (supabaseAdmin.from("ticket_reply_attachments" as any) as any).insert({
        ticket_id: input.ticketId,
        ticket_reply_id: input.ticketReplyId,
        file_name: meta.attachmentName,
        file_size: Number(meta.attachmentSize || downloaded.buffer.length),
        mime_type: downloaded.contentType || meta.contentType || "application/octet-stream",
        storage_bucket: bucket,
        storage_path: storagePath,
        zoho_attachment_id: identifier,
      } as never);

      results.push({
        fileName: meta.attachmentName,
        fileSize: Number(meta.attachmentSize || downloaded.buffer.length),
        mimeType: downloaded.contentType || meta.contentType || "application/octet-stream",
        storagePath,
        zohoAttachmentId: identifier,
        cid: meta.cid,
        isInline: meta.isInline,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Attachment upload failed";
      console.error(`[attachments] Error processing ${meta.attachmentName} for UID ${input.zohoUid}:`, msg);

      await recordProcessingError({
        zohoMailUid: input.zohoUid,
        zohoFolderId: input.folderId,
        zohoFolderName: input.folderName,
        errorStage: "ATTACHMENT",
        errorMessage: `Failed attachment '${meta.attachmentName}': ${msg}`,
        errorStack: err instanceof Error ? err.stack : null,
      });
    }
  }

  return results;
}
