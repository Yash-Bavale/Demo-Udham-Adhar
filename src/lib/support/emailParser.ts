/**
 * Email Parser & Content Sanitization Pipeline
 *
 * Provides:
 * 1. decodeHtmlEntities — converts &amp;, &nbsp;, numeric entities, etc.
 * 2. htmlToPlainText — safely converts rich HTML to formatted plain text preserving newlines
 * 3. parseEmailText — separates current reply text from quoted historical email chains
 * 4. parseEmailHtml — separates current reply HTML from quoted historical email blocks (gmail_quote, Outlook divs, blockquotes)
 * 5. parseEmailMessage — unified handler taking body_html and/or body_text and returning clean renderable content
 */

export interface ParsedEmailText {
  newContent: string;
  quotedContent: string;
  hasQuotedContent: boolean;
}

export interface ParsedEmailHtml {
  newHtml: string;
  quotedHtml: string;
  hasQuotedHtml: boolean;
}

export interface ParsedEmailMessage {
  isHtml: boolean;
  content: string;
  quotedContent: string;
  hasQuoted: boolean;
  rawHtml: string | null;
  rawText: string | null;
}

/** Decode common and numerical HTML entities */
export function decodeHtmlEntities(input: string | null | undefined): string {
  if (!input) return "";
  return input
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

/** Convert HTML to readable plain text while maintaining paragraph/line structure */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  const withBreaks = html
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
  return decodeHtmlEntities(withBreaks);
}

const GMAIL_QUOTE = /(?:\n|\.\s+|\s{2,}|\b)On\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|\d{1,2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\s\S]{1,250}?\bwrote\s*:\s*/i;
const GENERIC_ON_WROTE = /\bOn\s+[\s\S]{1,200}?\bwrote\s*:\s*/i;
const OUTLOOK_QUOTE = /(?:\r?\n|\s{2,})[-]{0,}\s*From:\s.+?(?:Sent|Date):\s/i;
const ORIGINAL_MSG = /[-]{2,}\s*Original Message\s*[-]{2,}/i;
const FORWARDED_MSG = /[-]{2,}\s*Forwarded message\s*[-]{2,}/i;
const ORDER_RECEIPT_QUOTE = /(?:\bOrder Successfully Received\b|\bThank you for choosing Business Help Services\b)/i;
const SIG_DIVIDER = /\n[-_]{3,}\s*\n/;
const SENT_FROM_DEVICE = /\n\s*(Sent from my (iPhone|iPad|Android|Samsung|BlackBerry)|Get Outlook for (iOS|Android))[^\n]*/i;

function trimBody(s: string): string {
  return s.replace(/\s+$/g, "").replace(/^\s+/g, "");
}

/**
 * Parse plain text email body and separate new reply text from quoted history
 */
export function parseEmailReply(rawBody: string | null | undefined): ParsedEmailText {
  const body = (rawBody ?? "").replace(/\r\n/g, "\n");
  if (!body.trim()) {
    return { newContent: "", quotedContent: "", hasQuotedContent: false };
  }

  let cutAt = -1;

  const patterns: RegExp[] = [GMAIL_QUOTE, GENERIC_ON_WROTE, OUTLOOK_QUOTE, ORIGINAL_MSG, FORWARDED_MSG];
  for (const rx of patterns) {
    const m = rx.exec(body);
    if (m && (cutAt === -1 || m.index < cutAt)) cutAt = m.index;
  }

  // Fallback: If "Order Successfully Received" is present further down in a customer reply
  if (cutAt === -1) {
    const m = ORDER_RECEIPT_QUOTE.exec(body);
    if (m && m.index > 10) cutAt = m.index;
  }

  // Generic "> quoted" block: cut at the first quoted line that is followed by more quoted lines
  if (cutAt === -1) {
    const lines = body.split("\n");
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^\s*>/.test(lines[i]) && /^\s*>/.test(lines[i + 1])) {
        cutAt = lines.slice(0, i).join("\n").length;
        break;
      }
    }
  }

  let newContent = cutAt >= 0 ? body.slice(0, cutAt) : body;
  const quotedContent = cutAt >= 0 ? body.slice(cutAt) : "";

  // Drop "Sent from my iPhone"-style tail on the visible portion only
  newContent = newContent.replace(SENT_FROM_DEVICE, "");
  // Drop signature separators from the visible portion
  const sigIdx = newContent.search(SIG_DIVIDER);
  if (sigIdx > 40) newContent = newContent.slice(0, sigIdx);

  // Clean any leading metadata lines like "From: ..." or "Subject: ..." prepended during ingestion
  newContent = newContent.replace(/^\s*From:\s*[^\n]+\n*/i, "");
  newContent = newContent.replace(/^\s*(?:Sent|To|Subject):\s*[^\n]+\n*/gi, "");

  newContent = trimBody(newContent);

  return {
    newContent: newContent || trimBody(body),
    quotedContent: trimBody(quotedContent),
    hasQuotedContent: quotedContent.trim().length > 0,
  };
}

// Regex patterns for detecting quoted containers inside HTML emails
const HTML_QUOTE_PATTERNS = [
  /<(?:div|blockquote)[^>]*class=["'][^"']*\bgmail_quote\b[^"']*["'][^>]*>[\s\S]*$/i,
  /<div[^>]*id=["']divRplyFwdMsg["'][^>]*>[\s\S]*$/i,
  /<div[^>]*id=["']appendonsend["'][^>]*>[\s\S]*$/i,
  /<hr[^>]*id=["']stopSpelling["'][^>]*>[\s\S]*$/i,
  /<div[^>]*style=["'][^"']*border-top:\s*solid\s*#?[a-f0-9]{3,6}[^"']*["'][^>]*>[\s\S]*$/i,
  /<blockquote[^>]*>[\s\S]*<\/blockquote>$/i,
];

/**
 * Parse HTML email body and isolate quoted blocks
 */
export function parseEmailHtml(rawHtml: string | null | undefined): ParsedEmailHtml {
  if (!rawHtml || !rawHtml.trim()) {
    return { newHtml: "", quotedHtml: "", hasQuotedHtml: false };
  }

  const html = rawHtml.trim();

  for (const pattern of HTML_QUOTE_PATTERNS) {
    const match = pattern.exec(html);
    if (match && match.index > 0) {
      const newHtml = html.slice(0, match.index).trim();
      const quotedHtml = html.slice(match.index).trim();
      // Ensure newHtml actually has visible text or media
      const textPreview = htmlToPlainText(newHtml);
      if (textPreview.length > 5) {
        return {
          newHtml,
          quotedHtml,
          hasQuotedHtml: true,
        };
      }
    }
  }

  return {
    newHtml: html,
    quotedHtml: "",
    hasQuotedHtml: false,
  };
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace cid: references in HTML email bodies with accessible URLs from attachments
 */
export function resolveInlineImages(
  html: string,
  attachments?: Array<{
    fileName?: string;
    file_name?: string;
    url?: string | null;
    cid?: string | null;
    zoho_attachment_id?: string | null;
  }> | null,
): string {
  if (!html) return html;
  let out = html;

  if (attachments && attachments.length > 0) {
    const imagesWithUrls = attachments.filter((a) => a.url);

    for (const att of imagesWithUrls) {
      if (!att.url) continue;
      const identifiers = [
        att.cid,
        att.zoho_attachment_id,
        att.fileName,
        att.file_name,
      ].filter(Boolean) as string[];

      for (const id of identifiers) {
        const cidRegex = new RegExp(`src=["']cid:${escapeRegex(id)}["']`, "gi");
        out = out.replace(cidRegex, `src="${att.url}" data-resolved-cid="true"`);

        const bareCidRegex = new RegExp(`cid:${escapeRegex(id)}`, "gi");
        out = out.replace(bareCidRegex, att.url);
      }
    }

    // If there is only one unresolved cid and exactly one image attachment, map them directly
    const remainingCids = out.match(/cid:[^"'\s>]+/gi);
    if (remainingCids && remainingCids.length === 1 && imagesWithUrls.length === 1) {
      out = out.replace(remainingCids[0], imagesWithUrls[0].url!);
    }
  }

  // Gracefully handle any remaining unresolvable cid:... images to prevent native broken image icons
  out = out.replace(
    /<img([^>]*?)src=["']cid:([^"']+)["']([^>]*?)>/gi,
    '<div class="inline-flex items-center gap-1.5 px-2.5 py-1.5 my-2 rounded-md bg-amber-50 text-amber-900 border border-amber-200 text-xs font-medium"><span>📷 Customer Screenshot / Embedded Image</span></div>',
  );

  return out;
}

/**
 * High-level helper to produce clean display content for any email record
 */
export function parseEmailMessage(input: {
  bodyHtml?: string | null;
  bodyText?: string | null;
  attachments?: Array<{
    fileName?: string;
    file_name?: string;
    url?: string | null;
    cid?: string | null;
    zoho_attachment_id?: string | null;
  }> | null;
}): ParsedEmailMessage {
  const rawHtml = input.bodyHtml && input.bodyHtml.trim() ? input.bodyHtml : null;
  const rawText = input.bodyText && input.bodyText.trim() ? input.bodyText : null;

  if (rawHtml) {
    const htmlWithImages = resolveInlineImages(rawHtml, input.attachments);
    const parsedHtml = parseEmailHtml(htmlWithImages);
    return {
      isHtml: true,
      content: parsedHtml.newHtml || htmlWithImages,
      quotedContent: parsedHtml.quotedHtml,
      hasQuoted: parsedHtml.hasQuotedHtml,
      rawHtml: htmlWithImages,
      rawText: rawText ? decodeHtmlEntities(rawText) : htmlToPlainText(htmlWithImages),
    };
  }

  const decodedText = decodeHtmlEntities(rawText || "");
  const parsedText = parseEmailReply(decodedText);

  return {
    isHtml: false,
    content: parsedText.newContent || decodedText,
    quotedContent: parsedText.quotedContent,
    hasQuoted: parsedText.hasQuotedContent,
    rawHtml: null,
    rawText: decodedText,
  };
}
