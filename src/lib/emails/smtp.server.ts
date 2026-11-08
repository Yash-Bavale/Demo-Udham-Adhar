// Server-only template renderer. (SMTP/nodemailer removed — Lovable Emails only.)

/** Replace {{var}} placeholders with values; missing vars become empty string.
 *  Plain-text substitution — do NOT use for HTML output (use renderTemplateHtml).
 */
export function renderTemplate(
  source: string,
  variables: Record<string, unknown>,
): string {
  const res = source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => {
    const v = variables[k];
    if (v === null || v === undefined) return "";
    return String(v);
  });
  return res.replace(/₹\s*₹/g, "₹");
}

/** HTML-escape a value before inserting into an HTML document. */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Render a template intended for HTML output. All interpolated variable
 *  values are HTML-escaped to prevent injection of tags or links from
 *  untrusted (customer-supplied) fields.
 *
 *  Variables whose name starts with `__` (internal, e.g. `__in_reply_to`) or
 *  ends with `_html` / `_raw` (explicitly pre-built safe HTML like links
 *  built by our own server code) are inserted verbatim.
 */
export function renderTemplateHtml(
  source: string,
  variables: Record<string, unknown>,
): string {
  const res = source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => {
    const v = variables[k];
    if (v === null || v === undefined) return "";
    const raw = String(v);
    const isTrustedRaw = k.startsWith("__") || /_(html|raw)$/i.test(k);
    return isTrustedRaw ? raw : escapeHtml(raw);
  });
  return res.replace(/₹\s*₹/g, "₹");
}
