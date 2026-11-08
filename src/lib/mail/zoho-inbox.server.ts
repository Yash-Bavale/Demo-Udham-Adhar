// Zoho Mail REST API client (server-only).
// Provides OAuth2 authentication, multi-folder discovery, paginated message fetching,
// header parsing, body extraction, and attachment downloads.

import {
  extractEmailAddress,
  normalizeMessageId as normMsgId,
} from "./email-normalizer";

const DC = (process.env.ZOHO_MAIL_DC || "in").trim(); // "in" | "com" | "eu" | "com.au" | "jp"
const ACCOUNTS_HOST = `https://accounts.zoho.${DC}`;
const MAIL_HOST = `https://mail.zoho.${DC}`;

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;
let accountIdCache: string | null = null;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Zoho inbox: missing env ${name}`);
  return v.trim();
}

/** Resolve the numeric Zoho account ID. Cached per-worker. */
export async function resolveAccountId(forceRefresh = false): Promise<string> {
  if (accountIdCache && !forceRefresh) return accountIdCache;
  const raw = (process.env.ZOHO_MAIL_ACCOUNT_ID || "").trim();
  if (raw && /^\d+$/.test(raw) && !forceRefresh) {
    accountIdCache = raw;
    return raw;
  }
  const token = await getZohoAccessToken();
  const res = await fetch(`${MAIL_HOST}/api/accounts`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Zoho GET /api/accounts failed: ${res.status} host=${MAIL_HOST} dc=${DC} body=${body.slice(0, 300)}`,
    );
  }
  const j = (await res.json()) as {
    data?: Array<{ accountId?: string | number; primaryEmailAddress?: string; mailboxAddress?: string }>;
  };
  const list = j?.data ?? [];
  if (list.length === 0) throw new Error("Zoho: no mail accounts on this token");
  const wanted = raw.toLowerCase();
  const match = wanted && !/^\d+$/.test(raw)
    ? list.find(
        (a) =>
          (a.primaryEmailAddress || "").toLowerCase() === wanted ||
          (a.mailboxAddress || "").toLowerCase() === wanted,
      )
    : null;
  const chosen = match ?? list[0];
  if (!chosen?.accountId) throw new Error("Zoho: account has no accountId");
  accountIdCache = String(chosen.accountId);
  return accountIdCache;
}

/** Exchange refresh token for a 1h access token; cached in-memory per worker. */
export async function getZohoAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }
  const params = new URLSearchParams({
    refresh_token: requireEnv("ZOHO_MAIL_REFRESH_TOKEN"),
    client_id: requireEnv("ZOHO_MAIL_CLIENT_ID"),
    client_secret: requireEnv("ZOHO_MAIL_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
  const res = await fetch(`${ACCOUNTS_HOST}/oauth/v2/token?${params.toString()}`, {
    method: "POST",
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !j.access_token) {
    throw new Error(`Zoho token refresh failed: ${j.error || res.status}`);
  }
  tokenCache = {
    token: j.access_token,
    expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000,
  };
  return j.access_token;
}

export async function zohoFetch<T>(path: string): Promise<T> {
  const token = await getZohoAccessToken();
  const res = await fetch(`${MAIL_HOST}${path}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (res.status === 401) {
    // Force token refresh once and retry.
    tokenCache = null;
    const token2 = await getZohoAccessToken();
    const res2 = await fetch(`${MAIL_HOST}${path}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token2}` },
    });
    if (!res2.ok) {
      const body = await res2.text().catch(() => "");
      throw new Error(`Zoho GET ${path} failed: ${res2.status} ${body.slice(0, 200)}`);
    }
    return (await res2.json()) as T;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Zoho GET ${path} failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export type ZohoFolderInfo = {
  folderId: string;
  folderName: string;
  folderType?: string;
  isRelevantInbound: boolean;
};

export type ZohoMessageListItem = {
  messageId: string;   // Zoho's internal numeric ID (per-account)
  folderId: string;
  subject: string;
  fromAddress: string;
  toAddress?: string;
  sender?: string;
  receivedTime: string; // epoch ms as string
  summary?: string;
  hasAttachment?: string;
  status2?: string;    // "0" = unread
};

export type ZohoHeaders = {
  "Message-ID"?: string;
  "In-Reply-To"?: string;
  References?: string;
  Subject?: string;
  From?: string;
  To?: string;
  "Reply-To"?: string;
  Date?: string;
  "X-BHS-Order"?: string;
  "X-BHS-Customer"?: string;
  "X-BHS-Ticket"?: string;
  [k: string]: string | undefined;
};

export type ZohoAttachmentMeta = {
  attachmentId: string;
  attachmentName: string;
  attachmentSize: string | number;
  contentType?: string;
  cid?: string;
  isInline?: boolean;
};

/** Discover all folders in Zoho and filter for relevant inbound folders.
 *  Includes: Inbox, Spam, Junk, Archive, and custom user folders.
 *  Excludes: Sent, Drafts, Trash, Outbox, Templates. */
export async function discoverZohoFolders(): Promise<ZohoFolderInfo[]> {
  const accountId = await resolveAccountId();
  let data: { data?: Array<{ folderId: string; folderName: string; folderType?: string }> };
  try {
    data = await zohoFetch<{ data: Array<{ folderId: string; folderName: string; folderType?: string }> }>(
      `/api/accounts/${accountId}/folders`,
    );
  } catch (e) {
    const msg = String((e as Error).message || "");
    if (/ 401| 404/.test(msg)) {
      accountIdCache = null;
      const freshAcc = await resolveAccountId(true);
      data = await zohoFetch<{ data: Array<{ folderId: string; folderName: string; folderType?: string }> }>(
        `/api/accounts/${freshAcc}/folders`,
      );
    } else {
      throw e;
    }
  }

  const list = data?.data ?? [];
  const ignoredPatterns = /^(sent|drafts?|trash|deleted|outbox|templates|scheduled)$/i;

  return list.map((f) => {
    const name = (f.folderName || "").trim();
    const type = (f.folderType || "").trim();
    const isIgnored = ignoredPatterns.test(name) || ignoredPatterns.test(type);
    return {
      folderId: String(f.folderId),
      folderName: name,
      folderType: type || undefined,
      isRelevantInbound: !isIgnored,
    };
  });
}

/** Find the Inbox folder ID for this account (backward-compatibility helper). */
export async function getInboxFolderId(): Promise<string> {
  const folders = await discoverZohoFolders();
  const inbox = folders.find((f) => f.folderType === "Inbox" || /inbox/i.test(f.folderName));
  if (!inbox) throw new Error("Zoho: Inbox folder not found");
  return inbox.folderId;
}

/** Fetch a single paginated page of messages from a specific folder. */
export async function fetchFolderMessagesPage(
  folderId: string,
  start = 1,
  limit = 50,
): Promise<ZohoMessageListItem[]> {
  const accountId = await resolveAccountId();
  const data = await zohoFetch<{ data?: ZohoMessageListItem[] }>(
    `/api/accounts/${accountId}/messages/view?folderId=${folderId}&start=${start}&limit=${limit}&sortBy=date&sortorder=false`,
  );
  return data?.data ?? [];
}

/** List recent messages in Inbox (most recent first, backward-compatibility). */
export async function listInboxMessages(limit = 50): Promise<ZohoMessageListItem[]> {
  const folderId = await getInboxFolderId();
  return fetchFolderMessagesPage(folderId, 1, limit);
}

/** Fetch the raw RFC-822 headers for a message as a lookup map. */
export async function getMessageHeaders(messageId: string, folderId: string): Promise<ZohoHeaders> {
  const accountId = await resolveAccountId();
  const data = await zohoFetch<{ data?: string | Record<string, string> }>(
    `/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/header`,
  );
  const raw = data?.data;
  if (!raw) return {};
  if (typeof raw === "object") return raw as ZohoHeaders;

  // Parse raw RFC-822 header block
  const out: ZohoHeaders = {};
  const lines = String(raw).split(/\r?\n/);
  let lastKey: string | null = null;
  for (const line of lines) {
    if (/^\s/.test(line) && lastKey) {
      out[lastKey] = (out[lastKey] || "") + " " + line.trim();
      continue;
    }
    const m = line.match(/^([A-Za-z0-9-]+):\s*(.*)$/);
    if (m) {
      lastKey = m[1];
      out[lastKey] = m[2];
    }
  }
  return out;
}

/** Fetch the plaintext/HTML body of a message. */
export async function getMessageContent(
  messageId: string,
  folderId: string,
): Promise<{ html: string | null; text: string | null }> {
  const accountId = await resolveAccountId();
  const data = await zohoFetch<{ data?: { content?: string; contentType?: string } }>(
    `/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/content`,
  );
  const c = data?.data?.content ?? null;
  const ct = data?.data?.contentType ?? "text/html";
  if (!c) return { html: null, text: null };
  if (ct.includes("html")) return { html: c, text: null };
  return { html: null, text: c };
}

/** List attachments associated with an inbound message (including inline screenshots). */
export async function fetchMessageAttachmentsList(
  messageId: string,
  folderId: string,
): Promise<ZohoAttachmentMeta[]> {
  const accountId = await resolveAccountId();
  try {
    const data = await zohoFetch<{ data?: unknown }>(
      `/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/attachmentinfo?includeInline=true`,
    );
    const payload = data?.data;
    const rawList: any[] = [];
    if (Array.isArray(payload)) {
      rawList.push(...payload);
    } else if (payload && typeof payload === "object") {
      const obj = payload as Record<string, any>;
      if (Array.isArray(obj.attachments)) rawList.push(...obj.attachments);
      if (Array.isArray(obj.inline)) rawList.push(...obj.inline);
      if (Array.isArray(obj.attachment)) rawList.push(...obj.attachment);
    }

    return rawList
      .map((a: any) => ({
        attachmentId: String(a.attachmentId || a.attachment_id || a.id || ""),
        attachmentName: a.attachmentName || a.fileName || a.name || "attachment",
        attachmentSize: a.attachmentSize || a.size || 0,
        contentType: a.contentType || a.mimeType || "application/octet-stream",
        cid: a.cid || a.contentId || a.content_id || undefined,
        isInline: Boolean(a.isInline || a.inline || a.cid || a.contentId),
      }))
      .filter((a) => a.attachmentId);
  } catch (e) {
    console.warn(`[zoho-inbox] fetchMessageAttachmentsList error for msg ${messageId}:`, e);
    return [];
  }
}

/** Download raw attachment bytes from Zoho Mail API. Handles regular and inline parts. */
export async function downloadZohoAttachment(
  messageId: string,
  folderId: string,
  attachmentId: string,
  attachmentName: string,
  isInline?: boolean,
  cid?: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const accountId = await resolveAccountId();
  const token = await getZohoAccessToken();
  const encodedName = encodeURIComponent(attachmentName || "attachment");
  const primaryUrl = `${MAIL_HOST}/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/attachments/${attachmentId}?fileName=${encodedName}`;

  let res = await fetch(primaryUrl, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });

  // If standard attachment URL fails and this is inline or has CID, attempt inline download endpoint
  if (!res.ok && (isInline || cid || attachmentId)) {
    const inlineParam = encodeURIComponent(cid || attachmentId);
    const inlineUrl = `${MAIL_HOST}/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/inline?contentId=${inlineParam}`;
    try {
      const inlineRes = await fetch(inlineUrl, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      });
      if (inlineRes.ok) {
        res = inlineRes;
      }
    } catch {
      // Fall through to error handler below
    }
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Zoho download attachment failed: ${res.status} ${errText.slice(0, 200)}`);
  }

  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  return { buffer, contentType };
}

// Re-export common normalizer functions for backward-compatibility
export function normalizeMessageId(id: string | undefined | null): string | null {
  return normMsgId(id);
}

export function extractEmail(v: string | undefined | null): string | null {
  return extractEmailAddress(v);
}
