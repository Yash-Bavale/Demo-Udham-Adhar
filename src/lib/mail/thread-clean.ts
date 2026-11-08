/**
 * Split an email body into the "reply" portion the customer/agent actually
 * wrote, and the quoted history that follows. Works for both plain text and
 * HTML bodies produced by Gmail, Outlook, Zoho, Apple Mail, and Yahoo.
 *
 * The output is intentionally best-effort — if we can't confidently detect
 * the boundary, we return the whole body as `visible` and `hidden = null`
 * so nothing is lost.
 */

export type CleanedBody = {
  visibleHtml: string | null;
  visibleText: string;
  hiddenHtml: string | null;
  hiddenText: string | null;
};

// Markers that always start quoted history (case-insensitive).
const TEXT_QUOTE_MARKERS: RegExp[] = [
  /^\s*On .+ wrote:\s*$/i,
  /^\s*On .+,\s*at .+,.+wrote:\s*$/i,
  /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/i,
  /^\s*-{2,}\s*Forwarded message\s*-{2,}\s*$/i,
  /^\s*From:\s.+$/i,
  /^\s*Sent from my (iPhone|iPad|Android|Samsung).*$/i,
  /^\s*Get Outlook for (iOS|Android).*$/i,
];

function splitPlainText(text: string): { visible: string; hidden: string | null } {
  const lines = text.split(/\r?\n/);
  let cutIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith(">")) { cutIdx = i; break; }
    if (TEXT_QUOTE_MARKERS.some((rx) => rx.test(trimmed))) { cutIdx = i; break; }
  }

  if (cutIdx <= 0) return { visible: text.trim(), hidden: null };
  const visible = lines.slice(0, cutIdx).join("\n").trimEnd();
  const hidden = lines.slice(cutIdx).join("\n").trimEnd();
  return { visible: visible || text.trim(), hidden: hidden || null };
}

/**
 * Split an HTML body. Removes the first quoted block Gmail/Outlook injected
 * (blockquote, gmail_quote wrapper, OutlookMessageHeader, appleMailQuote…)
 * plus everything after it.
 */
function splitHtml(html: string): { visible: string; hidden: string | null } {
  // Common CSS class / element patterns for the quoted history container.
  const cutRegex = new RegExp(
    [
      // Gmail
      '<div[^>]*class="gmail_quote[^"]*"[^>]*>',
      '<div[^>]*class="gmail_attr"[^>]*>',
      // Outlook / Office365
      '<div[^>]*id="?(divRplyFwdMsg|OLK_SRC_BODY_SECTION|appendonsend)"?[^>]*>',
      '<hr[^>]*id="?stopSpelling"?[^>]*>',
      // Apple Mail
      '<blockquote[^>]*type="?cite"?[^>]*>',
      // Zoho, Yahoo, generic reply header
      '<div[^>]*class="?(x_gmail_quote|yahoo_quoted|zmail_quote|zmailShowLess)"?[^>]*>',
      // Fallback: any <blockquote> that starts with "On … wrote:"
    ].join("|"),
    "i",
  );

  const m = cutRegex.exec(html);
  if (!m || m.index < 40) {
    // Try text-marker fallback inside HTML
    const textMarker = /(<br[^>]*>\s*)?(On [^<]+ wrote:|From:\s)/i.exec(html);
    if (textMarker && textMarker.index > 40) {
      return {
        visible: html.slice(0, textMarker.index).trim(),
        hidden: html.slice(textMarker.index).trim(),
      };
    }
    return { visible: html, hidden: null };
  }
  return {
    visible: html.slice(0, m.index).trim(),
    hidden: html.slice(m.index).trim(),
  };
}

export function cleanEmailBody(input: {
  html?: string | null;
  text?: string | null;
}): CleanedBody {
  const html = input.html?.trim() || null;
  const text = input.text?.trim() || "";

  let visibleHtml: string | null = null;
  let hiddenHtml: string | null = null;
  if (html) {
    const s = splitHtml(html);
    visibleHtml = s.visible || html;
    hiddenHtml = s.hidden;
  }

  const s = splitPlainText(text);
  return {
    visibleHtml,
    visibleText: s.visible,
    hiddenHtml,
    hiddenText: s.hidden,
  };
}
