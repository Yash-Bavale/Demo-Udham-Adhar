import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb, type RGB } from "pdf-lib";
import { BHS_LOGO_BASE64 } from "./bhs-logo";

// ────────────────────────────────────────────────────────────────────────────────
// Shared brand palette + helpers
// ────────────────────────────────────────────────────────────────────────────────

const NAVY = rgb(0.07, 0.13, 0.27);
const NAVY_SOFT = rgb(0.14, 0.22, 0.4);
const ACCENT = rgb(0.95, 0.62, 0.07);
const GRAY = rgb(0.35, 0.38, 0.45);
const MUTED = rgb(0.55, 0.58, 0.63);
const LINE = rgb(0.85, 0.87, 0.9);
const SOFT_LINE = rgb(0.92, 0.93, 0.96);
const ZEBRA = rgb(0.97, 0.98, 0.995);
const HEADBG = rgb(0.95, 0.96, 0.99);
const GREEN = rgb(0.05, 0.55, 0.25);
const RED = rgb(0.78, 0.12, 0.18);
const WHITE = rgb(1, 1, 1);

const COMPANY_NAME = "Business Help Services";
const COMPANY_ADDRESS = "Koregaon Bk, Taluka-Khed, Pune, Maharashtra - 410505, India";
const COMPANY_EMAIL = "help@businesshelpservices.com";
const COMPANY_PHONE = "+91-9767870331";
const COMPANY_WEB = "businesshelpservices.com";
const COMPANY_GSTIN = "27COFPD1743E2ZB";
const COMPANY_STATE_NAME = "Maharashtra";
const COMPANY_STATE_CODE = "27";

const IN_STATE_CODES: Record<string, string> = {
  "andhra pradesh": "37", "arunachal pradesh": "12", "assam": "18", "bihar": "10",
  "chhattisgarh": "22", "goa": "30", "gujarat": "24", "haryana": "06",
  "himachal pradesh": "02", "jharkhand": "20", "karnataka": "29", "kerala": "32",
  "madhya pradesh": "23", "maharashtra": "27", "manipur": "14", "meghalaya": "17",
  "mizoram": "15", "nagaland": "13", "odisha": "21", "punjab": "03",
  "rajasthan": "08", "sikkim": "11", "tamil nadu": "33", "telangana": "36",
  "tripura": "16", "uttar pradesh": "09", "uttarakhand": "05", "west bengal": "19",
  "delhi": "07", "jammu and kashmir": "01", "ladakh": "38", "puducherry": "34",
  "chandigarh": "04", "andaman and nicobar islands": "35",
  "dadra and nagar haveli and daman and diu": "26", "lakshadweep": "31",
};
function stateCode(name?: string | null): string {
  if (!name) return "-";
  return IN_STATE_CODES[name.toLowerCase().trim()] ?? "-";
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}


function rupees(n: number): string {
  return `INR ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function safePdfText(value: string): string {
  return String(value ?? "")
    .replace(/₹/g, "Rs.")
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/…/g, "...")
    .replace(/·/g, "|")
    .replace(/\u00a0/g, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "?");
}

function textWidth(font: PDFFont, text: string, size: number): number {
  return font.widthOfTextAtSize(safePdfText(text), size);
}

// Indian numbering: amount-in-words for INR
function amountInWords(n: number): string {
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  const word = numberToWordsIndian(rupees);
  const paiseWord = paise > 0 ? ` and ${numberToWordsIndian(paise)} Paise` : "";
  return `Rupees ${word}${paiseWord} Only`;
}

function numberToWordsIndian(num: number): string {
  if (num === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const twoDigits = (n: number): string => {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  };
  const threeDigits = (n: number): string => {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return (h ? ones[h] + " Hundred" + (r ? " " : "") : "") + (r ? twoDigits(r) : "");
  };
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const rest = num % 1000;
  let out = "";
  if (crore) out += threeDigits(crore) + " Crore ";
  if (lakh) out += twoDigits(lakh) + " Lakh ";
  if (thousand) out += twoDigits(thousand) + " Thousand ";
  if (rest) out += threeDigits(rest);
  return out.trim();
}

function drawText(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; size: number; font: PDFFont; color?: RGB },
) {
  page.drawText(safePdfText(text), { x: opts.x, y: opts.y, size: opts.size, font: opts.font, color: opts.color ?? NAVY });
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = safePdfText(text).split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (textWidth(font, trial, size) <= maxWidth) cur = trial;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

async function brandHeader(
  page: PDFPage,
  helv: PDFFont,
  helvBold: PDFFont,
  opts: { title: string; rightLabel?: string; rightValue?: string },
) {
  const w = 595.28;
  // Navy bar
  page.drawRectangle({ x: 0, y: 790, width: w, height: 52, color: NAVY });
  // Accent strip
  page.drawRectangle({ x: 0, y: 786, width: w, height: 4, color: ACCENT });
  drawText(page, opts.title, { x: 40, y: 810, size: 18, font: helvBold, color: WHITE });
  drawText(page, COMPANY_NAME, { x: 40, y: 795, size: 9, font: helv, color: rgb(0.85, 0.9, 1) });
  if (opts.rightLabel && opts.rightValue) {
    drawText(page, opts.rightLabel, { x: 410, y: 819, size: 8, font: helv, color: rgb(0.75, 0.83, 0.97) });
    drawText(page, opts.rightValue, { x: 410, y: 803, size: 13, font: helvBold, color: WHITE });
  }
}

function brandFooter(page: PDFPage, helv: PDFFont, note?: string) {
  page.drawLine({ start: { x: 40, y: 70 }, end: { x: 555, y: 70 }, thickness: 0.5, color: LINE });
  drawText(page, note ?? "This is a computer-generated document and does not require a signature.",
    { x: 40, y: 55, size: 8, font: helv, color: MUTED });
  drawText(page, `${COMPANY_NAME}  |  ${COMPANY_WEB}  |  ${COMPANY_EMAIL}`,
    { x: 40, y: 42, size: 8, font: helv, color: MUTED });
}

// ────────────────────────────────────────────────────────────────────────────────
// 1. INVOICE
// ────────────────────────────────────────────────────────────────────────────────

export type InvoiceData = {
  invoiceNumber: string;
  invoiceDate: Date;
  customerName: string;
  customerEmail: string;
  customerMobile: string;
  customerState?: string | null;
  serviceName: string;
  leadCode: string;
  applicationCode?: string | null;
  baseAmount: number;
  gstAmount: number;
  totalAmount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  sacCode?: string;
  placeOfSupply?: string | null;
  customerGstin?: string | null;
  paymentId?: string | null;
  gatewayName: string;
  companyName?: string;
  companyAddress?: string;
};

export async function renderInvoicePdf(d: InvoiceData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(base64ToBytes(BHS_LOGO_BASE64));

  const W = 595.28;
  const MX = 36;
  const RX = W - MX;
  const sac = d.sacCode ?? "998311";
  const cgst = d.cgstAmount ?? 0;
  const sgst = d.sgstAmount ?? 0;
  const igst = d.igstAmount ?? 0;
  const isIntra = cgst + sgst > 0;
  const gstRate = 18;
  const subtotal = d.baseAmount;
  const totalTax = cgst + sgst + igst;
  const grand = d.totalAmount;
  const placeOfSupply = d.placeOfSupply ?? d.customerState ?? "-";
  const posCode = stateCode(placeOfSupply);

  // Light border around the page (Zoho style is mostly whitespace)
  const TEXT = rgb(0.15, 0.18, 0.25);
  const LABEL = rgb(0.45, 0.48, 0.55);
  const BORDER = rgb(0.82, 0.84, 0.88);
  const ROWLINE = rgb(0.9, 0.91, 0.94);

  // ─── Header: Company (left) + TAX INVOICE (right)
  let y = 805;
  page.drawImage(logo, { x: MX, y: y - 60, width: 60, height: 60 });
  const cx = MX + 72;
  drawText(page, COMPANY_NAME.toUpperCase(), { x: cx, y: y - 6, size: 12, font: helvBold, color: TEXT });
  drawText(page, "Koregaon Bk, Taluka-Khed", { x: cx, y: y - 20, size: 8.5, font: helv, color: TEXT });
  drawText(page, "Pune, Maharashtra 410505", { x: cx, y: y - 31, size: 8.5, font: helv, color: TEXT });
  drawText(page, "India", { x: cx, y: y - 42, size: 8.5, font: helv, color: TEXT });
  drawText(page, COMPANY_PHONE, { x: cx, y: y - 53, size: 8.5, font: helv, color: TEXT });
  drawText(page, COMPANY_EMAIL, { x: cx, y: y - 64, size: 8.5, font: helv, color: TEXT });
  drawText(page, `GSTIN: ${COMPANY_GSTIN}`, { x: cx, y: y - 75, size: 8.5, font: helvBold, color: TEXT });

  // TAX INVOICE title (right)
  drawText(page, "TAX INVOICE", { x: RX - textWidth(helvBold, "TAX INVOICE", 18), y: y - 6, size: 18, font: helvBold, color: TEXT });

  // ─── Meta rows (label : value | label : value)
  y -= 100;
  const labelCol1 = MX;
  const valCol1 = MX + 110;
  const labelCol2 = MX + 290;
  const valCol2 = MX + 400;
  const metaLine = (l1: string, v1: string, l2: string, v2: string) => {
    drawText(page, l1, { x: labelCol1, y, size: 9, font: helv, color: LABEL });
    drawText(page, `: ${v1}`, { x: valCol1 - 6, y, size: 9, font: helvBold, color: TEXT });
    if (l2) {
      drawText(page, l2, { x: labelCol2, y, size: 9, font: helv, color: LABEL });
      drawText(page, `: ${v2}`, { x: valCol2 - 6, y, size: 9, font: helvBold, color: TEXT });
    }
    y -= 14;
  };
  metaLine("Invoice Number", d.invoiceNumber, "Place Of Supply", `${placeOfSupply} (${posCode})`);
  metaLine("Invoice Date", fmtDate(d.invoiceDate), "Order No.", d.applicationCode ?? d.leadCode);
  metaLine("Payment Date", fmtDate(d.invoiceDate), "Payment Status", "PAID");
  metaLine("Gateway", (d.gatewayName ?? "-").toUpperCase(), "Service", d.serviceName);
  metaLine("Terms", "Due on Receipt", "", "");

  // Transaction ID — full width, wraps onto a second line if needed
  const txnId = d.paymentId ?? "-";
  drawText(page, "Transaction ID", { x: labelCol1, y, size: 9, font: helv, color: LABEL });
  const txnStartX = valCol1 - 6;
  const txnMaxW = RX - txnStartX;
  const txnPrefix = ": ";
  const full = `${txnPrefix}${txnId}`;
  if (textWidth(helvBold, full, 9) <= txnMaxW) {
    drawText(page, full, { x: txnStartX, y, size: 9, font: helvBold, color: TEXT });
    y -= 14;
  } else {
    // split into two lines on character boundary
    let i = txnId.length;
    while (i > 1 && textWidth(helvBold, txnPrefix + txnId.slice(0, i), 9) > txnMaxW) i--;
    drawText(page, txnPrefix + txnId.slice(0, i), { x: txnStartX, y, size: 9, font: helvBold, color: TEXT });
    y -= 12;
    drawText(page, txnId.slice(i), { x: txnStartX, y, size: 9, font: helvBold, color: TEXT });
    y -= 14;
  }


  // ─── Bill To
  y -= 6;
  drawText(page, "Bill To", { x: MX, y, size: 10, font: helvBold, color: TEXT });
  y -= 14;
  drawText(page, d.customerName, { x: MX, y, size: 11, font: helvBold, color: TEXT });
  y -= 12;
  drawText(page, d.customerEmail, { x: MX, y, size: 9, font: helv, color: TEXT }); y -= 11;
  drawText(page, `+91 ${d.customerMobile}`, { x: MX, y, size: 9, font: helv, color: TEXT }); y -= 11;
  drawText(page, placeOfSupply, { x: MX, y, size: 9, font: helv, color: TEXT });
  if (d.customerGstin) {
    y -= 11;
    drawText(page, `GSTIN: ${d.customerGstin}`, { x: MX, y, size: 9, font: helvBold, color: TEXT });
  }
  y -= 18;

  // ─── Items table header
  const tableTop = y;
  // Column positions
  const cNo = MX + 4;
  const cDesc = MX + 28;
  const cQty = MX + 280;
  const cRate = MX + 330;
  const cGstPct = MX + 390;
  const cGstAmt = MX + 430;
  const cAmt = RX - 4;

  // Header band
  page.drawRectangle({ x: MX, y: tableTop - 20, width: RX - MX, height: 20, color: NAVY });
  drawText(page, "#", { x: cNo, y: tableTop - 13, size: 9, font: helvBold, color: WHITE });
  drawText(page, "Item & Description", { x: cDesc, y: tableTop - 13, size: 9, font: helvBold, color: WHITE });
  drawText(page, "Qty", { x: cQty, y: tableTop - 13, size: 9, font: helvBold, color: WHITE });
  drawText(page, "Rate", { x: cRate, y: tableTop - 13, size: 9, font: helvBold, color: WHITE });
  const gstHdr = isIntra ? "GST" : "IGST";
  drawText(page, `${gstHdr} %`, { x: cGstPct, y: tableTop - 13, size: 9, font: helvBold, color: WHITE });
  drawText(page, "Amt", { x: cGstAmt, y: tableTop - 13, size: 9, font: helvBold, color: WHITE });
  const amtLbl = "Amount";
  drawText(page, amtLbl, { x: cAmt - textWidth(helvBold, amtLbl, 9), y: tableTop - 13, size: 9, font: helvBold, color: WHITE });

  // Row
  y = tableTop - 20 - 4;
  drawText(page, "1", { x: cNo, y: y - 12, size: 10, font: helv, color: TEXT });
  drawText(page, d.serviceName, { x: cDesc, y: y - 12, size: 10, font: helvBold, color: TEXT });
  drawText(page, "Consultation Service Fee", { x: cDesc, y: y - 24, size: 8.5, font: helv, color: LABEL });
  drawText(page, `SAC - ${sac}`, { x: cDesc, y: y - 35, size: 8.5, font: helv, color: LABEL });
  const qtyStr = "1.00";
  drawText(page, qtyStr, { x: cQty, y: y - 12, size: 10, font: helv, color: TEXT });
  drawText(page, subtotal.toFixed(2), { x: cRate, y: y - 12, size: 10, font: helv, color: TEXT });
  drawText(page, `${gstRate}%`, { x: cGstPct, y: y - 12, size: 10, font: helv, color: TEXT });
  drawText(page, totalTax.toFixed(2), { x: cGstAmt, y: y - 12, size: 10, font: helv, color: TEXT });
  const amtStr = subtotal.toFixed(2);
  drawText(page, amtStr, { x: cAmt - textWidth(helvBold, amtStr, 10), y: y - 12, size: 10, font: helvBold, color: TEXT });

  y -= 50;
  page.drawLine({ start: { x: MX, y }, end: { x: RX, y }, thickness: 0.5, color: BORDER });

  // ─── Totals on right column
  const totLabelX = MX + 330;
  const totValRight = RX - 4;
  y -= 14;
  const totRow = (label: string, val: string, opts?: { bold?: boolean; color?: RGB; line?: boolean; bg?: RGB }) => {
    if (opts?.bg) page.drawRectangle({ x: totLabelX - 8, y: y - 5, width: totValRight - totLabelX + 12, height: 20, color: opts.bg });
    const f = opts?.bold ? helvBold : helv;
    const col = opts?.color ?? TEXT;
    drawText(page, label, { x: totLabelX, y, size: 10, font: f, color: col });
    drawText(page, val, { x: totValRight - textWidth(f, val, 10), y, size: 10, font: f, color: col });
    if (opts?.line) page.drawLine({ start: { x: totLabelX - 4, y: y - 4 }, end: { x: totValRight, y: y - 4 }, thickness: 0.4, color: ROWLINE });
    y -= 16;
  };
  const totalsTopY = y;
  totRow("Sub Total", subtotal.toFixed(2));
  if (isIntra) {
    totRow(`CGST (${gstRate / 2}%)`, cgst.toFixed(2));
    totRow(`SGST (${gstRate / 2}%)`, sgst.toFixed(2), { line: true });
  } else {
    totRow(`IGST (${gstRate}%)`, igst.toFixed(2), { line: true });
  }
  totRow("Total", `INR ${grand.toFixed(2)}`, { bold: true, bg: rgb(0.95, 0.96, 0.99) });
  totRow("Payment Made", `(-) ${grand.toFixed(2)}`, { color: GREEN });
  totRow("Balance Due", `INR 0.00`, { bold: true, line: true });

  // ─── Amount in Words (left side, aligned with totals start)
  let leftY = totalsTopY;
  drawText(page, "Total In Words", { x: MX, y: leftY, size: 9, font: helvBold, color: TEXT });
  leftY -= 14;
  const wordLines = wrap(`Indian ${amountInWords(grand)}`, helv, 10, 290);
  for (const ln of wordLines) {
    drawText(page, ln, { x: MX, y: leftY, size: 10, font: helv, color: TEXT });
    leftY -= 13;
  }

  // ─── Notes + Terms (left), Signature (right)
  y -= 6;
  let notesY = y;
  drawText(page, "Notes", { x: MX, y: notesY, size: 9, font: helvBold, color: TEXT });
  notesY -= 12;
  const noteLines = [
    "Thank you for the payment. Your order has been successfully received.",
    "Our experts shall process your application during business hours",
    "(Monday to Saturday, 10:00 AM - 6:00 PM).",
  ];
  for (const n of noteLines) {
    drawText(page, n, { x: MX, y: notesY, size: 9, font: helv, color: TEXT });
    notesY -= 11;
  }
  notesY -= 8;
  drawText(page, "Terms & Conditions", { x: MX, y: notesY, size: 9, font: helvBold, color: TEXT });
  notesY -= 12;
  const terms = [
    "1. Orders once received are Non-Cancellable & Non-Refundable.",
    "2. Refund Policy available on our website.",
    "3. All disputes are subject to Pune, Maharashtra jurisdiction.",
    "4. Computer Generated Invoice - Signature Not Required.",
  ];
  for (const t of terms) {
    drawText(page, t, { x: MX, y: notesY, size: 8.5, font: helv, color: TEXT });
    notesY -= 11;
  }

  // Signature (right)
  const sigY = y - 50;
  page.drawLine({ start: { x: RX - 140, y: sigY }, end: { x: RX, y: sigY }, thickness: 0.4, color: BORDER });
  const sigText = "Authorized Signature";
  drawText(page, sigText, { x: RX - textWidth(helv, sigText, 9), y: sigY - 12, size: 9, font: helv, color: LABEL });

  // ─── HSN/SAC Summary
  let sy = Math.min(notesY, 220) - 12;
  drawText(page, "HSN/SAC Summary", { x: MX, y: sy, size: 10, font: helvBold, color: TEXT });
  sy -= 14;

  // Header
  page.drawRectangle({ x: MX, y: sy - 18, width: RX - MX, height: 18, color: rgb(0.95, 0.96, 0.99), borderColor: BORDER, borderWidth: 0.4 });
  const sCols = [
    { x: MX + 6, label: "HSN/SAC" },
    { x: MX + 110, label: "Taxable Amount" },
    { x: MX + 230, label: isIntra ? "CGST %" : "IGST %" },
    { x: MX + 290, label: isIntra ? "CGST Amt" : "IGST Amt" },
    { x: MX + 360, label: isIntra ? "SGST Amt" : "" },
    { x: MX + 430, label: "Total Tax" },
  ];
  for (const c of sCols) if (c.label) drawText(page, c.label, { x: c.x, y: sy - 12, size: 8.5, font: helvBold, color: TEXT });
  sy -= 18;

  page.drawRectangle({ x: MX, y: sy - 18, width: RX - MX, height: 18, borderColor: BORDER, borderWidth: 0.4 });
  drawText(page, sac, { x: MX + 6, y: sy - 12, size: 9, font: helv, color: TEXT });
  drawText(page, subtotal.toFixed(2), { x: MX + 110, y: sy - 12, size: 9, font: helv, color: TEXT });
  drawText(page, `${gstRate}%`, { x: MX + 230, y: sy - 12, size: 9, font: helv, color: TEXT });
  drawText(page, (isIntra ? cgst : igst).toFixed(2), { x: MX + 290, y: sy - 12, size: 9, font: helv, color: TEXT });
  if (isIntra) drawText(page, sgst.toFixed(2), { x: MX + 360, y: sy - 12, size: 9, font: helv, color: TEXT });
  drawText(page, totalTax.toFixed(2), { x: MX + 430, y: sy - 12, size: 9, font: helvBold, color: TEXT });
  sy -= 18;

  page.drawRectangle({ x: MX, y: sy - 18, width: RX - MX, height: 18, color: rgb(0.97, 0.98, 1), borderColor: BORDER, borderWidth: 0.4 });
  drawText(page, "Total", { x: MX + 6, y: sy - 12, size: 9, font: helvBold, color: TEXT });
  drawText(page, subtotal.toFixed(2), { x: MX + 110, y: sy - 12, size: 9, font: helvBold, color: TEXT });
  drawText(page, (isIntra ? cgst : igst).toFixed(2), { x: MX + 290, y: sy - 12, size: 9, font: helvBold, color: TEXT });
  if (isIntra) drawText(page, sgst.toFixed(2), { x: MX + 360, y: sy - 12, size: 9, font: helvBold, color: TEXT });
  drawText(page, totalTax.toFixed(2), { x: MX + 430, y: sy - 12, size: 9, font: helvBold, color: TEXT });

  // Footer
  drawText(page, "This is a computer-generated tax invoice and does not require a signature.",
    { x: MX, y: 40, size: 8, font: helv, color: LABEL });
  const footRight = `${COMPANY_NAME}  |  ${COMPANY_WEB}`;
  drawText(page, footRight, { x: RX - textWidth(helv, footRight, 8), y: 40, size: 8, font: helv, color: LABEL });

  return await pdf.save();
}


// ────────────────────────────────────────────────────────────────────────────────
// 2. GRIEVANCE APPLICATION
// ────────────────────────────────────────────────────────────────────────────────

export type GrievanceData = {
  complaintNumber: string;
  submittedAt: Date;
  customerName: string;
  customerEmail: string;
  customerMobile: string;
  leadCode?: string | null;
  applicationCode?: string | null;
  serviceName?: string | null;
  category?: string | null;
  severity?: string | null;
  description: string;
};

export async function renderGrievancePdf(d: GrievanceData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  await brandHeader(page, helv, helvBold, {
    title: "GRIEVANCE APPLICATION",
    rightLabel: "COMPLAINT NO.",
    rightValue: d.complaintNumber,
  });

  let y = 760;
  drawText(page, "Filed on", { x: 40, y, size: 8, font: helv, color: MUTED });
  drawText(page, fmtDate(d.submittedAt), { x: 40, y: y - 13, size: 11, font: helvBold });
  if (d.category) {
    drawText(page, "Category", { x: 220, y, size: 8, font: helv, color: MUTED });
    drawText(page, d.category, { x: 220, y: y - 13, size: 11, font: helvBold });
  }
  if (d.severity) {
    drawText(page, "Severity", { x: 400, y, size: 8, font: helv, color: MUTED });
    drawText(page, d.severity.toUpperCase(), { x: 400, y: y - 13, size: 11, font: helvBold, color: ACCENT });
  }

  // Complainant card
  y = 700;
  page.drawRectangle({ x: 40, y: y - 90, width: 515, height: 100, color: ZEBRA });
  drawText(page, "COMPLAINANT", { x: 50, y: y - 4, size: 8, font: helvBold, color: MUTED });
  drawText(page, d.customerName, { x: 50, y: y - 24, size: 13, font: helvBold });
  drawText(page, `Email: ${d.customerEmail}`, { x: 50, y: y - 42, size: 10, font: helv, color: GRAY });
  drawText(page, `Mobile: ${d.customerMobile}`, { x: 50, y: y - 58, size: 10, font: helv, color: GRAY });
  if (d.leadCode) drawText(page, `Reference: ${d.leadCode}`, { x: 50, y: y - 74, size: 10, font: helv, color: GRAY });
  if (d.applicationCode) drawText(page, `Application: ${d.applicationCode}`, { x: 300, y: y - 74, size: 10, font: helv, color: GRAY });
  if (d.serviceName) drawText(page, `Service: ${d.serviceName}`, { x: 300, y: y - 58, size: 10, font: helv, color: GRAY });

  // Description block
  y = 575;
  drawText(page, "DESCRIPTION OF GRIEVANCE", { x: 40, y, size: 9, font: helvBold, color: MUTED });
  y -= 18;
  page.drawLine({ start: { x: 40, y: y + 8 }, end: { x: 555, y: y + 8 }, thickness: 0.5, color: LINE });
  const descLines = wrap(d.description || "-", helv, 11, 515);
  for (const ln of descLines) {
    if (y < 140) break;
    drawText(page, ln, { x: 40, y, size: 11, font: helv, color: NAVY_SOFT });
    y -= 16;
  }

  // Acknowledgement strip
  y = 120;
  page.drawRectangle({ x: 40, y: y - 28, width: 515, height: 44, color: NAVY });
  drawText(page, "We acknowledge receipt of this grievance.", { x: 50, y: y, size: 10, font: helvBold, color: WHITE });
  drawText(page, "Our team will respond within 48 working hours with an update on resolution.",
    { x: 50, y: y - 14, size: 9, font: helv, color: rgb(0.85, 0.9, 1) });

  brandFooter(page, helv);
  return await pdf.save();
}

// ────────────────────────────────────────────────────────────────────────────────
// 3. SERVICE ACKNOWLEDGEMENT LETTER
// ────────────────────────────────────────────────────────────────────────────────

export type AcknowledgementData = {
  customerName: string;
  customerEmail: string;
  leadCode: string;
  applicationCode?: string | null;
  serviceName: string;
  issuedAt: Date;
  expectedDays?: number;
};

export async function renderAcknowledgementPdf(d: AcknowledgementData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  await brandHeader(page, helv, helvBold, {
    title: "SERVICE ACKNOWLEDGEMENT",
    rightLabel: "REFERENCE",
    rightValue: d.applicationCode ?? d.leadCode,
  });

  let y = 760;
  drawText(page, "Issued on", { x: 40, y, size: 8, font: helv, color: MUTED });
  drawText(page, fmtDate(d.issuedAt), { x: 40, y: y - 13, size: 11, font: helvBold });
  drawText(page, "Lead Code", { x: 220, y, size: 8, font: helv, color: MUTED });
  drawText(page, d.leadCode, { x: 220, y: y - 13, size: 11, font: helvBold });
  if (d.applicationCode) {
    drawText(page, "Application", { x: 400, y, size: 8, font: helv, color: MUTED });
    drawText(page, d.applicationCode, { x: 400, y: y - 13, size: 11, font: helvBold });
  }

  y = 700;
  drawText(page, `Dear ${d.customerName},`, { x: 40, y, size: 12, font: helvBold });
  y -= 24;
  const body = [
    `Thank you for choosing ${COMPANY_NAME} for your ${d.serviceName} application. We confirm that your request has been received and assigned to our operations team for processing.`,
    "",
    `Your application has been registered under the reference shown above. Our team will review the details, verify the documents on record and proceed with filing within ${d.expectedDays ?? 3} working days.`,
    "",
    "You will receive email updates at every stage of processing. Should we require additional information, our support team will reach out using your registered contact details.",
    "",
    "If you have any questions, please reply to this email or contact our support desk.",
  ];
  for (const para of body) {
    const lines = para === "" ? [""] : wrap(para, helv, 11, 515);
    for (const ln of lines) {
      drawText(page, ln, { x: 40, y, size: 11, font: helv, color: NAVY_SOFT });
      y -= 16;
    }
  }

  // Signature block
  y = 200;
  drawText(page, "Warm regards,", { x: 40, y, size: 11, font: helv, color: GRAY });
  drawText(page, "Operations Team", { x: 40, y: y - 18, size: 12, font: helvBold });
  drawText(page, COMPANY_NAME, { x: 40, y: y - 32, size: 10, font: helv, color: GRAY });

  // Note card
  page.drawRectangle({ x: 40, y: 110, width: 515, height: 50, color: ZEBRA });
  drawText(page, "NOTE", { x: 50, y: 140, size: 8, font: helvBold, color: MUTED });
  drawText(page, "This acknowledgement does not constitute the final certificate. The official",
    { x: 50, y: 126, size: 9, font: helv, color: GRAY });
  drawText(page, "certificate will be issued upon successful approval by the concerned authority.",
    { x: 50, y: 114, size: 9, font: helv, color: GRAY });

  brandFooter(page, helv);
  return await pdf.save();
}
