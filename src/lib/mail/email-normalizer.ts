/**
 * Central deterministic email header and string normalizer.
 * Provides idempotent parsing of senders, message IDs, subjects, and reference headers.
 */

/** Parse an email address from raw "Name <email@domain.com>" or bare "email@domain.com" strings. */
export function extractEmailAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const str = String(raw).trim();
  if (!str) return null;

  // Check for angle bracketed address
  const angleMatch = str.match(/<([^>]+)>/);
  const target = angleMatch ? angleMatch[1] : str;

  // Clean and normalize
  const cleaned = target.replace(/["']/g, "").trim().toLowerCase();
  // Basic sanity check for valid email format
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    return cleaned;
  }
  return cleaned || null;
}

/** Extract display name from "Display Name <email@domain.com>". */
export function extractDisplayName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const str = String(raw).trim();
  const angleIdx = str.indexOf("<");
  if (angleIdx > 0) {
    const name = str.slice(0, angleIdx).replace(/^["'\s]+|["'\s]+$/g, "").trim();
    return name || null;
  }
  return null;
}

export type ParsedSenderInfo = {
  rawFrom: string;
  rawReplyTo: string | null;
  fromEmail: string | null;
  fromName: string | null;
  replyToEmail: string | null;
  /** The most actionable email to use for customer communication (Reply-To if present and valid, otherwise From). */
  effectiveEmail: string | null;
  isSystemSender: boolean;
};

/** Parse From and Reply-To headers into normalized addresses and metadata. */
export function parseSender(
  fromHeader: string | null | undefined,
  replyToHeader?: string | null | undefined,
): ParsedSenderInfo {
  const rawFrom = String(fromHeader || "").trim();
  const rawReplyTo = replyToHeader ? String(replyToHeader).trim() : null;

  const fromEmail = extractEmailAddress(rawFrom);
  const fromName = extractDisplayName(rawFrom);
  const replyToEmail = extractEmailAddress(rawReplyTo);

  // If Reply-To is provided and differs from From, and is not a system no-reply address, prefer it for customer communications
  let effectiveEmail = fromEmail;
  if (replyToEmail && !isKnownSystemSender(replyToEmail)) {
    effectiveEmail = replyToEmail;
  }

  const isSystem = isKnownSystemSender(fromEmail);

  return {
    rawFrom,
    rawReplyTo,
    fromEmail,
    fromName,
    replyToEmail,
    effectiveEmail,
    isSystemSender: isSystem,
  };
}

/** Check if an email address belongs to automated mailers or internal notifications. */
export function isKnownSystemSender(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  return (
    /(^|[.@])(noreply|no-reply|mailer-daemon|postmaster|welcome|notifications?|mailer|bounce|donotreply)@/i.test(lower) ||
    lower.endsWith("@zohoaccounts.in") ||
    lower.endsWith("@zoho.in") ||
    lower.endsWith("@zoho.com") ||
    lower.endsWith("@zeptomail.in") ||
    lower.endsWith("@zeptomail.com") ||
    lower.endsWith("@businesshelpservices.com") ||
    lower.endsWith("@udyamadhar.in")
  );
}

/** Extract an angle-bracketed Message-ID (or raw token), stripping enclosing brackets and whitespace. */
export function normalizeMessageId(id: string | undefined | null): string | null {
  if (!id) return null;
  const str = String(id).trim();
  if (!str) return null;
  const m = str.match(/<([^>]+)>/);
  const unwrapped = m ? m[1].trim() : str.replace(/^<|>$/g, "").trim();
  return unwrapped || null;
}

/** Parse and normalize a References header into a list of clean Message-IDs. */
export function normalizeReferences(refs: string | undefined | null): string[] {
  if (!refs) return [];
  return String(refs)
    .split(/\s+/)
    .map(normalizeMessageId)
    .filter(Boolean) as string[];
}

/** Decode HTML entities, strip zero-width characters, and normalize whitespace in subjects. */
export function normalizeSubject(subject: string | null | undefined): string {
  if (!subject) return "";
  return decodeEntities(String(subject))
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Decode decimal, hex, and named HTML entities that occur in email headers and text bodies. */
export function decodeEntities(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      try {
        return String.fromCodePoint(parseInt(h, 16));
      } catch {
        return _;
      }
    })
    .replace(/&#(\d+);/g, (_, d) => {
      try {
        return String.fromCodePoint(parseInt(d, 10));
      } catch {
        return _;
      }
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&hellip;/gi, "…")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&rsquo;|&lsquo;/gi, "'")
    .replace(/&rdquo;|&ldquo;/gi, '"');
}

/** Strip HTML formatting from an HTML body, preserving structure and paragraph breaks. */
export function stripHtmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  const withBreaks = String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n\s+\n/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return decodeEntities(withBreaks);
}

/** Extract support ticket token from subject (e.g. [# TKT-20260706-001] or TKT-20260706-001). */
export function extractTicketNumber(subject: string | null | undefined): string | null {
  if (!subject) return null;
  const norm = normalizeSubject(subject);
  // Match bracketed format [# TKT-YYYYMMDD-XXXX]
  const bracketMatch = norm.match(/\[#\s*(TKT-\d{8}-\d{3,6})\s*\]/i);
  if (bracketMatch) return bracketMatch[1].toUpperCase();

  // Match standalone format TKT-YYYYMMDD-XXXX
  const bareMatch = norm.match(/\b(TKT-\d{8}-\d{3,6})\b/i);
  if (bareMatch) return bareMatch[1].toUpperCase();

  return null;
}

/** Extract application (AP-YYYY-XXXXXX) or lead (UA-YYYY-XXXXXX) code from subject or body text. */
export function extractOrderCodes(
  subject: string | null | undefined,
  bodySnippet?: string | null | undefined,
): {
  applicationCode: string | null;
  leadCode: string | null;
} {
  const text = `${subject || ""} ${bodySnippet || ""}`;
  // Customers often type codes without hyphens ("AP2026011900") or with
  // spaces/slashes ("AP 2026 011900"). Accept those and normalise to the
  // canonical AP-YYYY-XXXXXX form.
  const apMatch = text.match(/\bAP[-\s_/.]?(\d{4})[-\s_/.]?(\d{6})\b/i);
  const uaMatch = text.match(/\bUA[-\s_/.]?(\d{4})[-\s_/.]?(\d{6})\b/i);

  return {
    applicationCode: apMatch ? `AP-${apMatch[1]}-${apMatch[2]}` : null,
    leadCode: uaMatch ? `UA-${uaMatch[1]}-${uaMatch[2]}` : null,
  };
}
