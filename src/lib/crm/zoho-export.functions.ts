import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole } from "@/lib/audit";

/**
 * Zoho Books invoice export — READ-ONLY over existing CRM invoices/leads.
 * Exports only the Zoho template columns the CRM actually has data for.
 */

export const ZOHO_COLUMNS = [
  "Invoice Number",
  "Invoice Date",
  "Invoice Status",
  "Customer Name",
  "GST Treatment",
  "GST Identification Number (GSTIN)",
  "Place of Supply",
  "Currency Code",
  "Exchange Rate",
  "Account",
  "Item Name",
  "Item Desc",
  "Item Type",
  "HSN/SAC",
  "Quantity",
  "Item Price",
  "Is Inclusive Tax",
  "Item Tax",
  "Item Tax Type",
  "Item Tax %",
  "Supply Type",
  "Notes",
] as const;

/** Zoho Books "Customer Payments" import columns (from Zoho's sample_payments template). */
export const ZOHO_PAYMENT_COLUMNS = [
  "Payment Number Prefix",
  "Payment Number Suffix",
  "Customer Name",
  "Place of Supply",
  "GST Treatment",
  "GST Identification Number (GSTIN)",
  "Payment Type",
  "Date",
  "Mode",
  "Exchange Rate",
  "Amount",
  "Description",
  "Deposit To",
  "Reference Number",
  "Invoice Number",
  "Amount Applied to Invoice",
  "Invoice Amount",
  "Withholding Tax Amount",
  "Branch Name",
] as const;
export type ZohoPaymentRow = Record<(typeof ZOHO_PAYMENT_COLUMNS)[number], string>;

const STATE_CODES: Record<string, string> = {
  "andaman and nicobar islands": "AN", "andhra pradesh": "AD", "arunachal pradesh": "AR", assam: "AS",
  bihar: "BR", chandigarh: "CH", chhattisgarh: "CG", "dadra and nagar haveli and daman and diu": "DN",
  "daman and diu": "DD", delhi: "DL", "new delhi": "DL", goa: "GA", gujarat: "GJ", haryana: "HR",
  "himachal pradesh": "HP", "jammu and kashmir": "JK", jharkhand: "JH", karnataka: "KA", kerala: "KL",
  ladakh: "LA", lakshadweep: "LD", "madhya pradesh": "MP", maharashtra: "MH", manipur: "MN",
  meghalaya: "ML", mizoram: "MZ", nagaland: "NL", odisha: "OD", orissa: "OD", puducherry: "PY",
  pondicherry: "PY", punjab: "PB", rajasthan: "RJ", sikkim: "SK", "tamil nadu": "TN", telangana: "TS",
  tripura: "TR", "uttar pradesh": "UP", uttarakhand: "UK", "west bengal": "WB",
};
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function stateCode(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  // Zoho uses "AD" for Andhra Pradesh; CRM/GST data often stores "AP"
  if (t.toUpperCase() === "AP") return "AD";
  if (/^[A-Za-z]{2}$/.test(t) && Object.values(STATE_CODES).includes(t.toUpperCase())) return t.toUpperCase();
  return STATE_CODES[t.toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ")] ?? null;
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (v == null || v === "" ? NaN : Number(v));
const istDate = (iso: string) =>
  new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

export type ZohoIssue = { invoice_number: string; field: string; error: string };
export type ZohoRow = Record<(typeof ZOHO_COLUMNS)[number], string>;

const Input = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const buildZohoInvoiceExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin", "finance", "accounts"] as any);
    if (data.from > data.to) throw new Error("From date must be before To date");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

    // IST day boundaries
    const fromIso = new Date(`${data.from}T00:00:00+05:30`).toISOString();
    const toIso = new Date(`${data.to}T23:59:59.999+05:30`).toISOString();

    const invoices: any[] = [];
    for (let off = 0; ; off += 1000) {
      const { data: page, error } = await (admin as any)
        .from("invoices")
        .select("id, invoice_number, lead_id, payment_id, issued_at, base_amount, gst_amount, total_amount, cgst_amount, sgst_amount, igst_amount, cgst_rate, sgst_rate, igst_rate, sac_code, place_of_supply, customer_state_snapshot, customer_gstin_snapshot, company_state_snapshot, replaced_at")
        .gte("issued_at", fromIso)
        .lte("issued_at", toIso)
        .is("cancelled_at", null)
        .order("issued_at", { ascending: true })
        .range(off, off + 999);
      if (error) throw new Error(error.message);
      invoices.push(...(page ?? []));
      if (!page || page.length < 1000) break;
    }

    // Only invoices backed by a successful, gateway-approved, non-test payment
    const payIds = [...new Set(invoices.map((i) => i.payment_id).filter(Boolean))];
    const approved = new Set<string>();
    const payInfo = new Map<string, any>();
    for (let i = 0; i < payIds.length; i += 200) {
      const { data: ps, error } = await admin
        .from("payments")
        .select("id, status, is_test_payment, razorpay_payment_id, payu_mihpayid, transaction_id, gateway_name, payment_date, created_at")
        .in("id", payIds.slice(i, i + 200));
      if (error) throw new Error(error.message);
      for (const p of ps ?? []) {
        const gw = p.razorpay_payment_id || p.payu_mihpayid || p.transaction_id;
        if (String(p.status).toLowerCase() === "paid" && !p.is_test_payment && gw) { approved.add(p.id); payInfo.set(p.id, p); }
      }
    }
    const allCount = invoices.length;
    const eligible = invoices.filter((i) => i.payment_id && approved.has(i.payment_id));
    invoices.length = 0;
    invoices.push(...eligible);

    const leadIds = [...new Set(invoices.map((i) => i.lead_id).filter(Boolean))];
    const leads = new Map<string, any>();
    for (let i = 0; i < leadIds.length; i += 200) {
      const { data: rows, error } = await admin
        .from("leads")
        .select("id, name, service, state")
        .in("id", leadIds.slice(i, i + 200));
      if (error) throw new Error(error.message);
      for (const l of rows ?? []) leads.set(l.id, l);
    }

    const issues: ZohoIssue[] = [];
    const rows: ZohoRow[] = [];
    const paymentRows: ZohoPaymentRow[] = [];
    const totals = { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
    const validTotals = { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
    let valid = 0;
    let adjusted = 0;

    for (const inv of invoices) {
      const no = inv.invoice_number ?? `(no number ${String(inv.id).slice(0, 8)})`;
      const errs: ZohoIssue[] = [];
      const add = (field: string, error: string) => errs.push({ invoice_number: no, field, error });
      const lead = inv.lead_id ? leads.get(inv.lead_id) : null;

      const total = num(inv.total_amount);
      let base = num(inv.base_amount), gst = num(inv.gst_amount);
      let cg = num(inv.cgst_amount) || 0, sg = num(inv.sgst_amount) || 0, ig = num(inv.igst_amount) || 0;
      const igRate = num(inv.igst_rate) || 0, cgRate = num(inv.cgst_rate) || 0, sgRate = num(inv.sgst_rate) || 0;
      const isIntra = cg > 0 || sg > 0 || cgRate > 0 || sgRate > 0;
      let rate = isIntra ? cgRate + sgRate : igRate;
      // GST charged but rate missing → standard 18% for services
      if (!(rate > 0) && gst > 0) rate = 18;

      // Self-reconcile tax-inclusive amounts: total (amount paid) is the source of truth
      if (total > 0 && (Number.isNaN(base) || Number.isNaN(gst) || Math.abs(r2(base + gst) - r2(total)) > 0.01)) {
        base = r2(total / (1 + rate / 100));
        gst = r2(total - base);
        if (isIntra) { cg = r2(gst / 2); sg = r2(gst - cg); ig = 0; } else { ig = gst; cg = 0; sg = 0; }
        adjusted++;
      }
      totals.taxable += base || 0; totals.cgst += cg; totals.sgst += sg; totals.igst += ig; totals.total += total || 0;

      if (!inv.invoice_number) add("Invoice Number", "Missing invoice number");
      if (!inv.issued_at) add("Invoice Date", "Missing invoice date");
      const customer = (lead?.name ?? "").trim();
      if (!customer) add("Customer Name", "Missing customer name");
      const service = (lead?.service ?? "").trim();
      if (!service) add("Item Name", "Missing service name");
      const pos = stateCode(inv.place_of_supply ?? inv.customer_state_snapshot ?? lead?.state);
      if (!pos) add("Place of Supply", `Unknown/missing state "${inv.place_of_supply ?? inv.customer_state_snapshot ?? ""}"`);
      if (!inv.sac_code || !/^\d{4,8}$/.test(inv.sac_code)) add("HSN/SAC", "Missing or invalid SAC code");
      const gstin = (inv.customer_gstin_snapshot ?? "").trim().toUpperCase();
      if (gstin && !GSTIN_RE.test(gstin)) add("GST Identification Number (GSTIN)", `Invalid GSTIN "${gstin}"`);
      if (!(base > 0)) add("Item Price", "Taxable value must be greater than 0");
      if (Number.isNaN(gst) || Number.isNaN(total)) add("Total", "Missing GST or total amount");
      else {
        if (Math.abs(r2(cg + sg + ig) - r2(gst)) > 0.01)
          add("Item Tax", `CGST+SGST+IGST (${r2(cg + sg + ig)}) ≠ GST amount (${r2(gst)})`);
        if (Math.abs(r2(base + gst) - r2(total)) > 0.01)
          add("Total", `Taxable + GST (${r2(base + gst)}) ≠ invoice total (${r2(total)})`);
        if (isIntra && ig > 0) add("Item Tax", "Invoice has both CGST/SGST and IGST");
        if (base > 0 && rate > 0 && Math.abs(r2((base * rate) / 100) - r2(gst)) > 1)
          add("Item Tax %", `GST ${r2(gst)} does not match ${rate}% of ${r2(base)}`);
        if (gst > 0 && !(rate > 0)) add("Item Tax %", "GST charged but tax rate is 0/missing");
      }

      if (errs.length) { issues.push(...errs); continue; }
      valid++;
      validTotals.taxable += base; validTotals.cgst += cg; validTotals.sgst += sg; validTotals.igst += ig; validTotals.total += total;
      rows.push({
        "Invoice Number": inv.invoice_number,
        "Invoice Date": istDate(inv.issued_at),
        "Invoice Status": "Sent",
        "Customer Name": customer,
        "GST Treatment": gstin ? "business_gst" : "consumer",
        "GST Identification Number (GSTIN)": gstin,
        "Place of Supply": pos!,
        "Currency Code": "INR",
        "Exchange Rate": "1",
        "Account": "Sales",
        "Item Name": service,
        "Item Desc": service,
        "Item Type": "service",
        "HSN/SAC": inv.sac_code,
        "Quantity": "1",
        "Item Price": r2(total).toFixed(2),
        "Is Inclusive Tax": rate > 0 ? "true" : "false",
        "Item Tax": rate > 0 ? (isIntra ? `GST${rate}` : `IGST${rate}`) : "",
        "Item Tax Type": rate > 0 ? (isIntra ? "Tax Group" : "ItemAmount") : "",
        "Item Tax %": rate > 0 ? String(rate) : "",
        "Supply Type": rate > 0 ? "Taxable" : "Exempted",
        "Notes": "",
      });
      // Matching payment row: stable unique number derived from the invoice number (max 16 chars)
      const p = payInfo.get(inv.payment_id);
      const m = String(inv.invoice_number).match(/^([A-Za-z]+)-?(\d{2})?(\d{2})-?(\d+)$/);
      const prefix = m ? `P${m[1].toUpperCase()}-` : "PAY-";
      const suffix = m ? `${m[3]}${m[4]}` : String(paymentRows.length + 1);
      const gwName = String(p?.gateway_name ?? "").toLowerCase();
      const mode = gwName.includes("razor") ? "Razorpay" : gwName.includes("payu") ? "PayU" : (p?.gateway_name || "Online");
      paymentRows.push({
        "Payment Number Prefix": prefix,
        "Payment Number Suffix": suffix,
        "Customer Name": customer,
        "Place of Supply": pos!,
        "GST Treatment": gstin ? "business_gst" : "consumer",
        "GST Identification Number (GSTIN)": gstin,
        "Payment Type": "Invoice Payment",
        "Date": istDate(p?.payment_date ?? inv.issued_at ?? p?.created_at),
        "Mode": mode,
        "Exchange Rate": "1",
        "Amount": r2(total).toFixed(2),
        "Description": `Payment for ${inv.invoice_number}`,
        "Deposit To": "Undeposited Funds",
        "Reference Number": String(p?.razorpay_payment_id || p?.payu_mihpayid || p?.transaction_id || "").slice(0, 50),
        "Invoice Number": inv.invoice_number,
        "Amount Applied to Invoice": r2(total).toFixed(2),
        "Invoice Amount": r2(total).toFixed(2),
        "Withholding Tax Amount": "0",
        "Branch Name": "Head Office",
      });
    }

    const round = (t: typeof totals) => ({
      taxable: r2(t.taxable), cgst: r2(t.cgst), sgst: r2(t.sgst), igst: r2(t.igst), total: r2(t.total),
    });
    return {
      columns: [...ZOHO_COLUMNS],
      summary: { totalInvoices: invoices.length, valid, errors: invoices.length - valid, excludedUnpaid: allCount - invoices.length, autoReconciled: adjusted, ...round(totals) },
      validTotals: round(validTotals),
      issues,
      rows,
      paymentColumns: [...ZOHO_PAYMENT_COLUMNS],
      paymentRows,
    };
  });
