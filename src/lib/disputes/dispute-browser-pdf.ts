import { PDFDocument } from "pdf-lib";

export interface PrintableEmail {
  id: string;
  subject: string;
  from_email: string;
  to_email: string;
  sent_at: string | null;
  status: string;
  body_html: string | null;
  body_text: string | null;
  message_id: string | null;
  attachment_names?: string[];
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function decodeStoredHtml(value: string) {
  if (!/^\s*&lt;(?:!doctype|html|table|div|body)\b/i.test(value)) return value;
  return value
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
}

async function buildEmailDocument(email: PrintableEmail) {
  const DOMPurify = (await import("dompurify")).default;
  const rawHtml = email.body_html?.trim();
  const body = rawHtml
    ? DOMPurify.sanitize(decodeStoredHtml(rawHtml), {
        FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
        FORBID_ATTR: ["onerror", "onload", "onclick"],
      })
    : `<pre class="plain">${escapeHtml(email.body_text || "No email content recorded.")}</pre>`;
  const from = email.from_email || "help@businesshelpservices.com";
  const to = email.to_email || "—";
  const messageId = email.message_id || `msg_${email.id.slice(0, 16)}@businesshelpservices.com`;
  const attachments = email.attachment_names?.length ? email.attachment_names.join(", ") : "None";

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;background:#fff}body{width:794px;padding:38px 42px 48px;color:#111;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    table.meta{width:100%;border-collapse:collapse;border:1px solid #edc98e;margin:0 0 10px;font-size:14px;line-height:1.25}
    .meta td{padding:2px 8px;border-bottom:1px solid #f3dfbc;vertical-align:top}.meta tr:nth-child(even){background:#fff5df}.meta-label{width:116px;text-align:right;white-space:nowrap}.meta-value{overflow-wrap:anywhere}.meta a{color:#0000ee;text-decoration:underline}
    .email-body{width:100%;overflow:visible}.email-body table{max-width:100%!important}.email-body img{max-width:100%!important;height:auto!important}.plain{white-space:pre-wrap;font:13px/1.6 Arial,sans-serif}
  </style></head><body><table class="meta">
    <tr><td class="meta-label">From:</td><td class="meta-value">&quot;Business Help Services&quot; &lt;<a href="mailto:${escapeHtml(from)}">${escapeHtml(from)}</a>&gt;</td></tr>
    <tr><td class="meta-label">To:</td><td class="meta-value"><a href="mailto:${escapeHtml(to)}">${escapeHtml(to)}</a></td></tr>
    <tr><td class="meta-label">Date:</td><td class="meta-value">${escapeHtml(formatDate(email.sent_at))}</td></tr>
    <tr><td class="meta-label">Subject:</td><td class="meta-value">${escapeHtml(email.subject)}</td></tr>
    <tr><td class="meta-label">Attachments:</td><td class="meta-value">${escapeHtml(attachments)}</td></tr>
    <tr><td class="meta-label">Message ID:</td><td class="meta-value">${escapeHtml(messageId)}</td></tr>
    <tr><td class="meta-label">Status:</td><td class="meta-value">${escapeHtml(email.status || "sent")}</td></tr>
  </table><div class="email-body">${body}</div></body></html>`;
}

async function renderEmailCanvas(email: PrintableEmail) {
  // @ts-ignore - html2canvas runtime import in browser
  const html2canvas = (await import("html2canvas")).default;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-same-origin");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;pointer-events:none";
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("Could not create the email print view");
    doc.open();
    doc.write(await buildEmailDocument(email));
    doc.close();
    await new Promise<void>((resolve) => {
      if (doc.readyState === "complete") resolve();
      else iframe.addEventListener("load", () => resolve(), { once: true });
    });
    await doc.fonts?.ready;
    const images = Array.from(doc.images);
    await Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    })));
    iframe.style.height = `${Math.max(1123, doc.documentElement.scrollHeight)}px`;
    return await html2canvas(doc.body, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: 794,
      windowHeight: Math.max(1123, doc.documentElement.scrollHeight),
    });
  } finally {
    iframe.remove();
  }
}

export async function createDisputePdfInBrowser(params: {
  emails: PrintableEmail[];
  invoiceUrl?: string | null;
}) {
  const output = await PDFDocument.create();
  for (const email of [...params.emails].sort((a, b) => new Date(a.sent_at || 0).getTime() - new Date(b.sent_at || 0).getTime())) {
    const canvas = await renderEmailCanvas(email);
    const pagePixelHeight = Math.floor(canvas.width * (A4_HEIGHT / A4_WIDTH));
    for (let y = 0; y < canvas.height; y += pagePixelHeight) {
      const sliceHeight = Math.min(pagePixelHeight, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceHeight;
      const context = slice.getContext("2d");
      if (!context) throw new Error("Could not assemble the email pages");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, slice.width, slice.height);
      context.drawImage(canvas, 0, y, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      const image = await output.embedPng(slice.toDataURL("image/png"));
      const page = output.addPage([A4_WIDTH, A4_HEIGHT]);
      const renderedHeight = A4_WIDTH * (sliceHeight / canvas.width);
      page.drawImage(image, { x: 0, y: A4_HEIGHT - renderedHeight, width: A4_WIDTH, height: renderedHeight });
    }
  }
  if (params.invoiceUrl) {
    await appendFileToPdf(output, params.invoiceUrl, "application/pdf", "the saved invoice PDF");
  }
  if (output.getPageCount() === 0) throw new Error("Select at least one email or invoice");
  return output.save();
}

/**
 * Shared merge step: appends a stored PDF or image (JPG/PNG/WEBP) to `output`.
 * Used by the Dispute Manager (invoice) and Customer Document Merge.
 */
export async function appendFileToPdf(output: PDFDocument, url: string, mimeType: string | null | undefined, label: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${label}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const type = String(mimeType || response.headers.get("content-type") || "").toLowerCase();
  const isPdf = type.includes("pdf") || new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (isPdf) {
    const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
    return;
  }
  let image;
  if (type.includes("png")) image = await output.embedPng(bytes);
  else if (type.includes("jpeg") || type.includes("jpg")) image = await output.embedJpg(bytes);
  else {
    // WEBP/other images: convert through a canvas to PNG
    const bitmap = await createImageBitmap(new Blob([bytes], { type: type || "image/*" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(`Could not read ${label}`);
    ctx.drawImage(bitmap, 0, 0);
    image = await output.embedPng(canvas.toDataURL("image/png"));
  }
  const margin = 24;
  const scale = Math.min((A4_WIDTH - margin * 2) / image.width, (A4_HEIGHT - margin * 2) / image.height, 1);
  const w = image.width * scale;
  const h = image.height * scale;
  const page = output.addPage([A4_WIDTH, A4_HEIGHT]);
  page.drawImage(image, { x: (A4_WIDTH - w) / 2, y: A4_HEIGHT - margin - h, width: w, height: h });
}

/** Merge stored customer documents, in the given order, into one PDF. */
export async function mergeDocumentsInBrowser(files: { url: string; mimeType?: string | null; label: string }[]) {
  const output = await PDFDocument.create();
  for (const file of files) await appendFileToPdf(output, file.url, file.mimeType, file.label);
  if (output.getPageCount() === 0) throw new Error("Select at least one document");
  return output.save();
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 32_768;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}