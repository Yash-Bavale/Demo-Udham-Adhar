import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type FolderCheckpoint = {
  id: string;
  mailbox_address: string;
  account_id: string;
  folder_id: string;
  folder_name: string;
  folder_type?: string | null;
  last_received_time_ms: number;
  last_processed_uid: string | null;
  last_sync_at: string;
  status: string;
  error_message: string | null;
  consecutive_failures: number;
};

/** Get the persistent sync checkpoint for a specific mailbox folder. */
export async function getFolderCheckpoint(
  mailboxAddress: string,
  folderId: string,
): Promise<FolderCheckpoint | null> {
  const { data, error } = await (supabaseAdmin.from("email_ingestion_checkpoints" as any) as any)
    .select("*")
    .eq("mailbox_address", mailboxAddress.toLowerCase())
    .eq("folder_id", folderId)
    .maybeSingle();

  if (error) {
    throw new Error(`[checkpoint] getFolderCheckpoint failed for ${mailboxAddress}/${folderId}: ${error.message}`);
  }
  if (!data) return null;
  const d = data as any;
  return {
    ...d,
    last_received_time_ms: Number(d.last_received_time_ms || 0),
  };
}

/** Get all checkpoints for a mailbox to display on the Pipeline Health dashboard. */
export async function getAllCheckpoints(mailboxAddress: string): Promise<FolderCheckpoint[]> {
  const { data, error } = await (supabaseAdmin.from("email_ingestion_checkpoints" as any) as any)
    .select("*")
    .eq("mailbox_address", mailboxAddress.toLowerCase())
    .order("folder_name", { ascending: true });

  if (error) {
    throw new Error(`[checkpoint] getAllCheckpoints failed: ${error.message}`);
  }
  return ((data ?? []) as any[]).map((d) => ({
    ...d,
    last_received_time_ms: Number(d.last_received_time_ms || 0),
  }));
}

/** Save or update the checkpoint after a successful polling run. */
export async function updateFolderCheckpoint(input: {
  mailboxAddress: string;
  accountId: string;
  folderId: string;
  folderName: string;
  folderType?: string;
  lastReceivedTimeMs: number;
  lastProcessedUid?: string | null;
  status?: string;
  errorMessage?: string | null;
  resetFailures?: boolean;
}): Promise<void> {
  const now = new Date().toISOString();
  const mailbox = input.mailboxAddress.toLowerCase();

  // Load existing to prevent moving backwards
  const existing = await getFolderCheckpoint(mailbox, input.folderId);
  const newMaxTime = Math.max(existing?.last_received_time_ms || 0, input.lastReceivedTimeMs);
  const consecutiveFailures = input.resetFailures
    ? 0
    : input.errorMessage
    ? (existing?.consecutive_failures || 0) + 1
    : 0;

  const { error } = await (supabaseAdmin.from("email_ingestion_checkpoints" as any) as any)
    .upsert(
      {
        mailbox_address: mailbox,
        account_id: input.accountId,
        folder_id: input.folderId,
        folder_name: input.folderName,
        folder_type: input.folderType ?? null,
        last_received_time_ms: newMaxTime,
        last_processed_uid: input.lastProcessedUid ?? existing?.last_processed_uid ?? null,
        last_sync_at: now,
        status: input.status || (input.errorMessage ? "error" : "active"),
        error_message: input.errorMessage ?? null,
        consecutive_failures: consecutiveFailures,
        updated_at: now,
      } as never,
      { onConflict: "mailbox_address,folder_id" },
    );
  if (error) {
    throw new Error(`[checkpoint] updateFolderCheckpoint failed for ${mailbox}/${input.folderId}: ${error.message}`);
  }
}

/** Acquire distributed lock for single-instance mailbox polling. */
export async function acquireMailboxLock(
  mailboxAddress: string,
  workerId: string,
  ttlSeconds = 120,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("acquire_email_ingestion_lock" as any, {
    p_mailbox: mailboxAddress.toLowerCase(),
    p_worker_id: workerId,
    p_ttl_seconds: ttlSeconds,
  } as any);
  if (error) {
    throw new Error(`[checkpoint] acquire_email_ingestion_lock failed: ${error.message}`);
  }
  return Boolean(data);
}

/** Release distributed lock when polling completes. */
export async function releaseMailboxLock(mailboxAddress: string, workerId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("release_email_ingestion_lock" as any, {
    p_mailbox: mailboxAddress.toLowerCase(),
    p_worker_id: workerId,
  } as any);
  if (error) {
    throw new Error(`[checkpoint] release_email_ingestion_lock failed: ${error.message}`);
  }
}
