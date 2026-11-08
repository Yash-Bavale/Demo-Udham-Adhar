import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}


async function assertFinance(supabase: any, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = (roles ?? []).some(
    (r: any) => r.role === "super_admin" || r.role === "finance" || r.role === "admin" || r.role === "accounts",
  );
  if (!ok) throw new Error("Forbidden");
}

type Row = {
  id: string;
  invoice_number: string | null;
  issued_at: string;
  base_amount: number;
  gst_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  place_of_supply: string | null;
  sac_code: string | null;
  lead_id: string;
  payment_id: string;
};

async function fetchRows(month: string, state?: string, gateway?: string) {
  // IST month boundaries
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1) - 330 * 60000).toISOString();
  const to = new Date(Date.UTC(y, m, 1) - 330 * 60000).toISOString();
  const admin = await getAdmin();

  // Page through all invoices (DB returns max 1000 rows per request)
  const rows: Row[] = [];
  for (let off = 0; ; off += 1000) {
    const { data: page, error } = await admin
      .from("invoices")
      .select(
        "id, invoice_number, issued_at, base_amount, gst_amount, cgst_amount, sgst_amount, igst_amount, total_amount, place_of_supply, sac_code, lead_id, payment_id",
      )
      .gte("issued_at", from)
      .lt("issued_at", to)
      .is("cancelled_at", null)
      .order("issued_at", { ascending: true })
      .order("id", { ascending: true })
      .range(off, off + 999);
    if (error) throw new Error(error.message);
    rows.push(...((page ?? []) as Row[]));
    if (!page || page.length < 1000) break;
  }

  // Hydrate lead state + name + gateway (chunked)
  const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  const leadIds = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))];
  const payIds = [...new Set(rows.map((r) => r.payment_id).filter(Boolean))];
  const leads: any[] = [];
  const pays: any[] = [];
  await Promise.all([
    ...chunk(leadIds, 200).map(async (ids) => {
      const { data } = await admin.from("leads").select("id, name, state, lead_code, service").in("id", ids);
      leads.push(...(data ?? []));
    }),
    ...chunk(payIds, 200).map(async (ids) => {
      const { data } = await admin.from("payments").select("id, gateway_name, transaction_id").in("id", ids);
      pays.push(...(data ?? []));
    }),
  ]);
  const leadMap = new Map(leads.map((l: any) => [l.id, l]));
  const payMap = new Map(pays.map((p: any) => [p.id, p]));

  const enriched = rows.map((r) => {
    const l = leadMap.get(r.lead_id) || {};
    const p = payMap.get(r.payment_id) || {};
    return {
      ...r,
      customer_name: l.name ?? "",
      customer_state: l.state ?? r.place_of_supply ?? "",
      lead_code: l.lead_code ?? "",
      service: l.service ?? "",
      gateway: p.gateway_name ?? "",
      transaction_id: p.transaction_id ?? "",
    };
  });

  let out = enriched;
  if (state) out = out.filter((r) => (r.customer_state || "").toLowerCase() === state.toLowerCase());
  if (gateway) out = out.filter((r) => (r.gateway || "").toLowerCase() === gateway.toLowerCase());
  return out;
}

async function fetchRefundRows(month: string, state?: string, gateway?: string) {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1) - 330 * 60000).toISOString();
  const to = new Date(Date.UTC(y, m, 1) - 330 * 60000).toISOString();
  const admin = await getAdmin();
  const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

  // 1. Applications with refund_processed_at in [from, to] OR payments with status = 'refunded' in [from, to]
  const [{ data: appsInMonth }, { data: pmtRefundsInMonth }] = await Promise.all([
    admin
      .from("applications")
      .select("id, application_code, lead_id, refund_processed_at, refund_gateway_ref")
      .gte("refund_processed_at", from)
      .lt("refund_processed_at", to),
    admin
      .from("payments")
      .select("id, application_id, lead_id, amount, status, gateway_name, transaction_id, created_at, payment_date")
      .eq("status", "refunded")
      .gte("created_at", from)
      .lt("created_at", to),
  ]);

  // 2. Invoices issued in [from, to] (to check if any were refunded)
  const { data: invsInMonth } = await admin
    .from("invoices")
    .select("id, invoice_number, issued_at, base_amount, gst_amount, cgst_amount, sgst_amount, igst_amount, total_amount, cgst_rate, sgst_rate, igst_rate, place_of_supply, customer_state_snapshot, customer_gstin_snapshot, sac_code, lead_id, payment_id")
    .gte("issued_at", from)
    .lt("issued_at", to)
    .is("cancelled_at", null);

  const refundedLeadSet = new Set<string>();
  const refundedAppMap = new Map<string, any>();

  for (const a of appsInMonth ?? []) {
    if (a.lead_id) {
      refundedLeadSet.add(a.lead_id);
      refundedAppMap.set(a.lead_id, a);
    }
  }
  for (const p of pmtRefundsInMonth ?? []) {
    if (p.lead_id) refundedLeadSet.add(p.lead_id);
  }

  // Cross-reference invoices issued in this month with refunded status
  const invLeadIds = [...new Set((invsInMonth ?? []).map((i) => i.lead_id).filter(Boolean))];
  if (invLeadIds.length > 0) {
    await Promise.all(
      chunk(invLeadIds, 200).map(async (batch) => {
        const [{ data: apps }, { data: pmts }] = await Promise.all([
          admin.from("applications").select("id, application_code, lead_id, refund_processed_at, refund_gateway_ref").in("lead_id", batch).not("refund_processed_at", "is", null),
          admin.from("payments").select("id, application_id, lead_id, amount, status, gateway_name, transaction_id, created_at, payment_date").in("lead_id", batch).eq("status", "refunded"),
        ]);
        for (const a of apps ?? []) {
          refundedLeadSet.add(a.lead_id);
          if (!refundedAppMap.has(a.lead_id)) refundedAppMap.set(a.lead_id, a);
        }
        for (const p of pmts ?? []) {
          refundedLeadSet.add(p.lead_id);
        }
      })
    );
  }

  const allRefundedLeadIds = Array.from(refundedLeadSet);
  if (allRefundedLeadIds.length === 0) return [];

  // Invoices for all refunded leads
  const knownInvoicesMap = new Map<string, any>();
  for (const inv of invsInMonth ?? []) {
    if (refundedLeadSet.has(inv.lead_id)) {
      knownInvoicesMap.set(inv.lead_id, inv);
    }
  }

  const missingLeadIds = allRefundedLeadIds.filter((lid) => !knownInvoicesMap.has(lid));
  if (missingLeadIds.length > 0) {
    await Promise.all(
      chunk(missingLeadIds, 200).map(async (batch) => {
        const { data: invs } = await admin
          .from("invoices")
          .select("id, invoice_number, issued_at, base_amount, gst_amount, cgst_amount, sgst_amount, igst_amount, total_amount, cgst_rate, sgst_rate, igst_rate, place_of_supply, customer_state_snapshot, customer_gstin_snapshot, sac_code, lead_id, payment_id")
          .in("lead_id", batch)
          .is("cancelled_at", null)
          .order("issued_at", { ascending: false });
        for (const inv of invs ?? []) {
          if (!knownInvoicesMap.has(inv.lead_id)) {
            knownInvoicesMap.set(inv.lead_id, inv);
          }
        }
      })
    );
  }

  // Applications for all refunded leads
  const missingAppLeadIds = allRefundedLeadIds.filter((lid) => !refundedAppMap.has(lid));
  if (missingAppLeadIds.length > 0) {
    await Promise.all(
      chunk(missingAppLeadIds, 200).map(async (batch) => {
        const { data: apps } = await admin
          .from("applications")
          .select("id, application_code, lead_id, refund_processed_at, refund_gateway_ref")
          .in("lead_id", batch);
        for (const a of apps ?? []) {
          if (!refundedAppMap.has(a.lead_id)) refundedAppMap.set(a.lead_id, a);
        }
      })
    );
  }

  // Hydrate leads & payments metadata
  const leads: any[] = [];
  const pays: any[] = [];
  const payIds = [...new Set(Array.from(knownInvoicesMap.values()).map((i) => i.payment_id).filter(Boolean))];

  await Promise.all([
    ...chunk(allRefundedLeadIds, 200).map(async (ids) => {
      const { data } = await admin.from("leads").select("id, name, state, lead_code, service").in("id", ids);
      leads.push(...(data ?? []));
    }),
    ...chunk(payIds, 200).map(async (ids) => {
      const { data } = await admin.from("payments").select("id, gateway_name, transaction_id, created_at, payment_date").in("id", ids);
      pays.push(...(data ?? []));
    }),
  ]);

  const leadMap = new Map(leads.map((l: any) => [l.id, l]));
  const payMap = new Map(pays.map((p: any) => [p.id, p]));

  // Build combined refund records
  const result: any[] = [];
  for (const leadId of allRefundedLeadIds) {
    const inv = knownInvoicesMap.get(leadId);
    const l = leadMap.get(leadId) || {};
    const app = refundedAppMap.get(leadId) || {};
    const p = inv?.payment_id ? payMap.get(inv.payment_id) : null;

    const total = Number(inv?.total_amount || 0);
    const base = Number(inv?.base_amount || (total > 0 ? total / 1.18 : 0));
    const gst = Number(inv?.gst_amount || (total - base));
    let c = Number(inv?.cgst_amount || 0);
    let s = Number(inv?.sgst_amount || 0);
    let i = Number(inv?.igst_amount || 0);
    if (c === 0 && s === 0 && i === 0 && gst > 0) {
      c = gst / 2;
      s = gst / 2;
    }

    const rateSum = Number(inv?.cgst_rate || 0) + Number(inv?.sgst_rate || 0) + Number(inv?.igst_rate || 0);
    const rate = rateSum > 0 ? rateSum : 18;
    const taxable = base > 0 ? base : Math.round((total / (1 + rate / 100)) * 100) / 100;

    result.push({
      id: inv?.id || app.id || leadId,
      invoice_number: inv?.invoice_number || (app.application_code ? `REF-${app.application_code}` : `REF-${l.lead_code || leadId}`),
      issued_at: inv?.issued_at || p?.payment_date || p?.created_at || app.refund_processed_at || "",
      refund_processed_at: app.refund_processed_at || p?.payment_date || p?.created_at || "",
      refund_gateway_ref: app.refund_gateway_ref || "",
      lead_id: leadId,
      lead_code: l.lead_code ?? "",
      customer_name: l.name ?? "",
      customer_state: l.state ?? inv?.place_of_supply ?? "",
      service: l.service ?? "",
      sac_code: inv?.sac_code ?? "998311",
      base_amount: taxable,
      taxable,
      gst_amount: gst,
      cgst_amount: c,
      sgst_amount: s,
      igst_amount: i,
      cgst: c,
      sgst: s,
      igst: i,
      total_amount: total,
      rate,
      place_of_supply: inv?.place_of_supply || inv?.customer_state_snapshot || l.state || "",
      customer_gstin_snapshot: inv?.customer_gstin_snapshot || "",
      gateway: p?.gateway_name || "",
      transaction_id: p?.transaction_id || "",
    });
  }

  let out = result;
  if (state) out = out.filter((r) => (r.customer_state || "").toLowerCase() === state.toLowerCase());
  if (gateway) out = out.filter((r) => (r.gateway || "").toLowerCase() === gateway.toLowerCase());
  return out;
}

export const getGstReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      state: z.string().max(80).optional(),
      gateway: z.string().max(40).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context.supabase, context.userId);
    const [rows, refundRows] = await Promise.all([
      fetchRows(data.month, data.state, data.gateway),
      fetchRefundRows(data.month, data.state, data.gateway),
    ]);

    let taxable = 0, cgst = 0, sgst = 0, igst = 0, total = 0;
    const byState = new Map<string, { taxable: number; cgst: number; sgst: number; igst: number; total: number; count: number }>();
    for (const r of rows) {
      const b = Number(r.base_amount);
      const c = Number(r.cgst_amount);
      const s = Number(r.sgst_amount);
      const i = Number(r.igst_amount);
      const t = Number(r.total_amount);
      // Back-compat: if cgst/sgst/igst all 0 but gst_amount > 0, split it
      let cVal = c, sVal = s, iVal = i;
      const gst = Number(r.gst_amount);
      if (cVal === 0 && sVal === 0 && iVal === 0 && gst > 0) {
        cVal = gst / 2;
        sVal = gst / 2;
      }
      taxable += b;
      cgst += cVal;
      sgst += sVal;
      igst += iVal;
      total += t;
      const st = (r.customer_state || "Unknown").trim();
      const cur = byState.get(st) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0, count: 0 };
      cur.taxable += b;
      cur.cgst += cVal;
      cur.sgst += sVal;
      cur.igst += iVal;
      cur.total += t;
      cur.count += 1;
      byState.set(st, cur);
    }

    let refTaxable = 0, refCgst = 0, refSgst = 0, refIgst = 0, refTotal = 0;
    for (const r of refundRows) {
      refTaxable += r.taxable;
      refCgst += r.cgst;
      refSgst += r.sgst;
      refIgst += r.igst;
      refTotal += r.total_amount;
    }

    return {
      summary: {
        taxable, cgst, sgst, igst, totalTax: cgst + sgst + igst, total, count: rows.length,
      },
      byState: [...byState.entries()].map(([state, v]) => ({ state, ...v })),
      rows,
      refundSummary: {
        taxable: refTaxable,
        cgst: refCgst,
        sgst: refSgst,
        igst: refIgst,
        totalTax: refCgst + refSgst + refIgst,
        total: refTotal,
        count: refundRows.length,
      },
      refundRows,
    };
  });

export const exportGstReportCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      state: z.string().max(80).optional(),
      gateway: z.string().max(40).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context.supabase, context.userId);
    const rows = await fetchRows(data.month, data.state, data.gateway);

    const header = [
      "invoice_number", "issued_at", "lead_code", "customer_name", "customer_state",
      "service", "sac_code", "base_amount", "cgst", "sgst", "igst", "total_amount",
      "gateway", "transaction_id",
    ];
    const escape = (v: any) => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const r of rows) {
      const gst = Number(r.gst_amount);
      let c = Number(r.cgst_amount), s = Number(r.sgst_amount), i = Number(r.igst_amount);
      if (c === 0 && s === 0 && i === 0 && gst > 0) { c = gst / 2; s = gst / 2; }
      lines.push([
        r.invoice_number,
        r.issued_at,
        r.lead_code,
        r.customer_name,
        r.customer_state,
        r.service,
        r.sac_code ?? "998311",
        r.base_amount,
        c.toFixed(2),
        s.toFixed(2),
        i.toFixed(2),
        r.total_amount,
        r.gateway,
        r.transaction_id,
      ].map(escape).join(","));
    }
    return { csv: lines.join("\n"), filename: `gst_${data.month}.csv` };
  });

// ---------- GSTR-1 (B2B offline utility format) export ----------
const GST_STATES: Array<[string, string, string[]]> = [
  ["01", "Jammu and Kashmir", ["JK"]], ["02", "Himachal Pradesh", ["HP"]], ["03", "Punjab", ["PB"]],
  ["04", "Chandigarh", ["CH"]], ["05", "Uttarakhand", ["UK", "UT"]], ["06", "Haryana", ["HR"]],
  ["07", "Delhi", ["DL", "NEW DELHI"]], ["08", "Rajasthan", ["RJ"]], ["09", "Uttar Pradesh", ["UP"]],
  ["10", "Bihar", ["BR"]], ["11", "Sikkim", ["SK"]], ["12", "Arunachal Pradesh", ["AR"]],
  ["13", "Nagaland", ["NL"]], ["14", "Manipur", ["MN"]], ["15", "Mizoram", ["MZ"]],
  ["16", "Tripura", ["TR"]], ["17", "Meghalaya", ["ML"]], ["18", "Assam", ["AS"]],
  ["19", "West Bengal", ["WB"]], ["20", "Jharkhand", ["JH"]], ["21", "Odisha", ["OD", "OR", "ORISSA"]],
  ["22", "Chhattisgarh", ["CG", "CT"]], ["23", "Madhya Pradesh", ["MP"]], ["24", "Gujarat", ["GJ"]],
  ["26", "Dadra and Nagar Haveli and Daman and Diu", ["DN", "DD", "DAMAN AND DIU"]],
  ["27", "Maharashtra", ["MH"]], ["29", "Karnataka", ["KA"]], ["30", "Goa", ["GA"]],
  ["31", "Lakshadweep", ["LD"]], ["32", "Kerala", ["KL"]], ["33", "Tamil Nadu", ["TN"]],
  ["34", "Puducherry", ["PY", "PONDICHERRY"]], ["35", "Andaman and Nicobar Islands", ["AN"]],
  ["36", "Telangana", ["TS", "TG"]], ["37", "Andhra Pradesh", ["AP", "AD"]], ["38", "Ladakh", ["LA"]],
];
function posLabel(s: string | null | undefined): string {
  if (!s) return "";
  const t = s.trim().toUpperCase().replace(/&/g, "AND").replace(/\s+/g, " ");
  for (const [code, name, alias] of GST_STATES) {
    if (t === name.toUpperCase() || alias.includes(t) || t === code || t.startsWith(`${code}-`)) return `${code}-${name}`;
  }
  return s.trim();
}
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function gstDate(iso: string) {
  const d = new Date(new Date(iso).getTime() + 330 * 60000); // IST
  return `${String(d.getUTCDate()).padStart(2, "0")}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

export const exportGstr1Csv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertFinance(context.supabase, context.userId);
    const [y, m] = data.month.split("-").map(Number);
    // IST month boundaries
    const from = new Date(Date.UTC(y, m - 1, 1) - 330 * 60000).toISOString();
    const to = new Date(Date.UTC(y, m, 1) - 330 * 60000).toISOString();
    const admin = await getAdmin();
    const rows: any[] = [];
    for (let off = 0; ; off += 1000) {
      const { data: page, error } = await admin
        .from("invoices")
        .select("invoice_number, issued_at, base_amount, gst_amount, total_amount, cgst_rate, sgst_rate, igst_rate, place_of_supply, customer_state_snapshot, customer_gstin_snapshot")
        .gte("issued_at", from).lt("issued_at", to)
        .is("cancelled_at", null)
        .order("issued_at", { ascending: true })
        .order("id", { ascending: true })
        .range(off, off + 999);
      if (error) throw new Error(error.message);
      rows.push(...(page ?? []));
      if (!page || page.length < 1000) break;
    }
    const header = ["GSTIN/UIN of Recipient", "Invoice Number", "Invoice date", "Invoice Value", "Place Of Supply", "Reverse Charge", "Applicable % of Tax Rate", "Invoice Type", "Rate", "Taxable Value"];
    const esc = (v: any) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [header.join(",")];
    for (const r of rows) {
      const total = Number(r.total_amount) || 0;
      const rateSum = Number(r.cgst_rate || 0) + Number(r.sgst_rate || 0) + Number(r.igst_rate || 0);
      const rate = rateSum > 0 ? rateSum : 18;
      const taxable = Math.round((total / (1 + rate / 100)) * 100) / 100;
      lines.push([
        (r.customer_gstin_snapshot ?? "").trim().toUpperCase(),
        r.invoice_number,
        gstDate(r.issued_at),
        total.toFixed(2),
        posLabel(r.place_of_supply || r.customer_state_snapshot),
        "N", "", "Regular", rate, taxable.toFixed(2),
      ].map(esc).join(","));
    }
    return { csv: lines.join("\n"), filename: `GSTR1_${data.month}.csv`, count: rows.length };
  });

// ---------- GSTR-1 (Refunds) export ----------
export const exportGstr1RefundsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertFinance(context.supabase, context.userId);
    const rows = await fetchRefundRows(data.month);
    const header = [
      "GSTIN/UIN of Recipient",
      "Invoice Number",
      "Invoice date",
      "Invoice Value",
      "Place Of Supply",
      "Reverse Charge",
      "Applicable % of Tax Rate",
      "Invoice Type",
      "Rate",
      "Taxable Value",
    ];
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const r of rows) {
      const total = Number(r.total_amount) || 0;
      const rate = Number(r.rate) || 18;
      const taxable = Number(r.taxable) || (Math.round((total / (1 + rate / 100)) * 100) / 100);
      lines.push([
        (r.customer_gstin_snapshot ?? "").trim().toUpperCase(),
        r.invoice_number,
        r.issued_at ? gstDate(r.issued_at) : "",
        total.toFixed(2),
        posLabel(r.place_of_supply || r.customer_state),
        "N",
        "",
        "Regular",
        rate,
        taxable.toFixed(2),
      ].map(esc).join(","));
    }
    return { csv: lines.join("\n"), filename: `GSTR1_Refunds_${data.month}.csv`, count: rows.length };
  });

// ---------- Detailed GST Refund CSV export (with both invoice date & refund date) ----------
export const exportGstRefundReportCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      state: z.string().max(80).optional(),
      gateway: z.string().max(40).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context.supabase, context.userId);
    const rows = await fetchRefundRows(data.month, data.state, data.gateway);
    const header = [
      "invoice_number",
      "invoice_date",
      "refund_processed_date",
      "lead_code",
      "customer_name",
      "customer_state",
      "service",
      "sac_code",
      "base_amount",
      "cgst",
      "sgst",
      "igst",
      "total_amount",
      "gateway",
      "transaction_id",
      "refund_gateway_ref",
    ];
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        r.invoice_number,
        r.issued_at,
        r.refund_processed_at,
        r.lead_code,
        r.customer_name,
        r.customer_state,
        r.service,
        r.sac_code ?? "998311",
        Number(r.taxable || 0).toFixed(2),
        Number(r.cgst || 0).toFixed(2),
        Number(r.sgst || 0).toFixed(2),
        Number(r.igst || 0).toFixed(2),
        Number(r.total_amount || 0).toFixed(2),
        r.gateway,
        r.transaction_id,
        r.refund_gateway_ref,
      ].map(esc).join(","));
    }
    return { csv: lines.join("\n"), filename: `gst_refunds_${data.month}.csv`, count: rows.length };
  });

