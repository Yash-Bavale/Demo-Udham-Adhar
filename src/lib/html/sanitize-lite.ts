/**
 * Dependency-free HTML sanitizer (allow-list based).
 *
 * Replaces `sanitize-html`, which drags postcss + source-map into the browser
 * bundle (~250KB raw) purely to render CMS article HTML. This runs identically
 * on the server and in the browser, so SSR output and hydration always match.
 *
 * Strategy: walk the raw markup token by token.
 *  - Text between tags is emitted with `<` escaped so stray brackets can never
 *    start a new element.
 *  - Comments, doctypes and CDATA are dropped.
 *  - Tags outside the allow-list are dropped; their text content is kept,
 *    except for `script`/`style`/`iframe`/`object`/`embed`, whose entire
 *    contents are discarded.
 *  - Allowed tags keep only allow-listed attributes, and URL attributes must
 *    use a safe scheme.
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "blockquote", "code", "pre",
  "ul", "ol", "li", "a", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tr", "th", "td", "hr", "span", "div",
]);

/** Tags whose inner content is removed entirely, not just unwrapped. */
const DROP_CONTENT_TAGS = new Set([
  "script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math",
]);

const VOID_TAGS = new Set(["br", "hr"]);

/** Tags whose closing tag may be omitted in the source markup. */
const IMPLICIT_CLOSE = new Set(["li", "p", "tr", "td", "th"]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
};

const URL_ATTRS = new Set(["href"]);
const SAFE_SCHEMES = ["http:", "https:", "mailto:", "tel:"];

function escapeText(text: string): string {
  return text.replace(/</g, "&lt;");
}

function escapeAttr(value: string): string {
  // Escape bare ampersands only; leave existing entities (&amp; &#39; &x;) intact
  // so URLs with query strings aren't double-encoded.
  return value
    .replace(/&(?!#\d+;|#x[0-9a-fA-F]+;|[a-zA-Z][a-zA-Z0-9]{1,31};)/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function isSafeUrl(raw: string): boolean {
  const value = raw.trim().replace(/[\u0000-\u0020]/g, "");
  if (value.startsWith("//")) return false; // protocol-relative
  if (value.startsWith("#") || value.startsWith("/")) return true;
  const scheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.exec(value);
  if (!scheme) return true; // relative path
  return SAFE_SCHEMES.includes(scheme[0].toLowerCase());
}

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;

function buildAttrs(tag: string, rawAttrs: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return "";
  let out = "";
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(rawAttrs))) {
    const name = m[1].toLowerCase();
    if (!allowed.has(name)) continue;
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    if (URL_ATTRS.has(name) && !isSafeUrl(value)) continue;
    out += ` ${name}="${escapeAttr(value)}"`;
  }
  // Anchors opening a new tab must not leak the opener.
  if (tag === "a" && /\btarget="_blank"/.test(out) && !/\brel="/.test(out)) {
    out += ' rel="noopener noreferrer"';
  }
  return out;
}

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

export function sanitizeHtmlLite(input: string | null | undefined): string {
  if (!input) return "";
  const html = String(input);
  let out = "";
  let last = 0;
  /** Name of the drop-content tag we're currently skipping through, if any. */
  let skipping: string | null = null;
  const openStack: string[] = [];

  // Strip comments / doctypes / CDATA up front — they can't nest meaningfully.
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/<![^>]*>/g, "");

  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(cleaned))) {
    const [full, rawName, rawAttrs = ""] = match;
    const tag = rawName.toLowerCase();
    const isClosing = full.startsWith("</");
    const text = cleaned.slice(last, match.index);
    last = match.index + full.length;

    if (skipping) {
      if (isClosing && tag === skipping) skipping = null;
      continue;
    }

    out += escapeText(text);

    if (DROP_CONTENT_TAGS.has(tag)) {
      if (!isClosing && !/\/\s*$/.test(rawAttrs)) skipping = tag;
      continue;
    }

    if (!ALLOWED_TAGS.has(tag)) continue; // unwrap: keep children, drop the tag

    if (isClosing) {
      if (VOID_TAGS.has(tag)) continue;
      const idx = openStack.lastIndexOf(tag);
      if (idx === -1) continue; // stray close tag
      // Close any still-open descendants first so nesting stays balanced.
      for (let i = openStack.length - 1; i >= idx; i--) out += `</${openStack[i]}>`;
      openStack.length = idx;
      continue;
    }

    if (VOID_TAGS.has(tag)) {
      out += `<${tag} />`;
      continue;
    }

    // Implicitly close the previous sibling for tags that allow omitted end
    // tags (<li>1<li>2), so we don't emit a pile of stray closers at the end.
    if (IMPLICIT_CLOSE.has(tag) && openStack[openStack.length - 1] === tag) {
      openStack.pop();
      out += `</${tag}>`;
    }
    openStack.push(tag);
    out += `<${tag}${buildAttrs(tag, rawAttrs)}>`;
  }

  out += escapeText(cleaned.slice(last));
  // Close anything the source left open so injected markup can't escape.
  for (let i = openStack.length - 1; i >= 0; i--) out += `</${openStack[i]}>`;
  return out;
}
