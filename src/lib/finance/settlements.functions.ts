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
    (r: any) => r.role === "super_admin" || r.role === "finance" || r.role === "admin",
  );
  if (!ok) throw new Error("Forbidden");
}

function parseCsv(csv: string): Record<string, string>[] {
  const lines = csv.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const split = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else {
        if (ch === '"') q = true;
        else if (ch === ",") { out.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out;
  };
  const headers = split(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((l) => {
    const cols = split(l);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = (cols[i] ?? "").trim()));
    return row;
  });
}

function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) if (row[k] != null && row[k] !== "") return row[k];
  return "";
}

function num(s: string): number {
  if (!s) return 0;
  const n = Number(String(s).replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export const importSettlementCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      gateway: z.enum(["payu", "razorpay"]),
      csvText: z.string().min(10).max(5_000_000),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context.supabase, context.userId);
    const rows = parseCsv(data.csvText);
    if (rows.length === 0) throw new Error("CSV had no data rows");

    // Group rows by settlement id
    type Group = {
      settlementId: string;
      settledAt: string;
      gross: number;
      fees: number;
      taxOnFees: number;
      net: number;
      txns: { txn: string; amount: number; fee: number; net: number }[];
      raw: any[];
    };
    const groups = new Map<string, Group>();

    for (const r of rows) {
      const sid =
        pick(r, ["settlement_id", "settlement id", "payout_id", "utr", "utr_no", "utr no"]) ||
        pick(r, ["settled on", "settlement_date", "settled_at"]);
      if (!sid) continue;
      const settledAt =
        pick(r, ["settled_at", "settlement_date", "settled on", "date", "txn_date"]) || new Date().toISOString();
      const amount = num(pick(r, ["amount", "txn_amount", "transaction_amount", "gross"]));
      const fee = num(pick(r, ["fee", "fees", "service_fee", "gateway_fee"]));
      const tax = num(pick(r, ["service_tax", "tax", "gst", "tax_on_fees"]));
      const net = num(pick(r, ["net", "net_amount", "settled_amount"])) || (amount - fee - tax);
      const txn =
        pick(r, ["txnid", "txn_id", "transaction_id", "mihpayid", "merchant_txn_id", "order_id"]) || "";

      const g = groups.get(sid) ?? {
        settlementId: sid,
        settledAt,
        gross: 0,
        fees: 0,
        taxOnFees: 0,
        net: 0,
        txns: [],
        raw: [],
      };
      g.gross += amount;
      g.fees += fee;
      g.taxOnFees += tax;
      g.net += net;
      if (txn) g.txns.push({ txn, amount, fee, net });
      g.raw.push(r);
      groups.set(sid, g);
    }

    let settlementsCreated = 0;
    let linksCreated = 0;
    let unmatched = 0;

    for (const g of groups.values()) {
      // Upsert settlement
      const { data: existing } = await (await getAdmin())
        .from("gateway_settlements")
        .select("id")
        .eq("gateway", data.gateway)
        .eq("settlement_id", g.settlementId)
        .maybeSingle();

      let settlementUuid: string;
      if (existing?.id) {
        settlementUuid = existing.id;
        await (await getAdmin()).from("gateway_settlements").update({
          settled_at: new Date(g.settledAt).toISOString(),
          gross: g.gross,
          fees: g.fees,
          tax_on_fees: g.taxOnFees,
          net: g.net,
          raw: { rows: g.raw },
        }).eq("id", settlementUuid);
      } else {
        const { data: ins, error: insErr } = await (await getAdmin())
          .from("gateway_settlements")
          .insert({
            gateway: data.gateway,
            settlement_id: g.settlementId,
            settled_at: new Date(g.settledAt).toISOString(),
            gross: g.gross,
            fees: g.fees,
            tax_on_fees: g.taxOnFees,
            net: g.net,
            raw: { rows: g.raw },
          })
          .select("id")
          .single();
        if (insErr) throw new Error(insErr.message);
        settlementUuid = ins!.id;
        settlementsCreated += 1;
      }

      // Link payments by txn
      if (g.txns.length > 0) {
        const txnIds = g.txns.map((t) => t.txn);
        const { data: matched } = await (await getAdmin())
          .from("payments")
          .select("id, transaction_id, razorpay_payment_id, razorpay_order_id")
          .or(
            `transaction_id.in.(${txnIds.map((x) => `"${x}"`).join(",")}),razorpay_payment_id.in.(${txnIds.map((x) => `"${x}"`).join(",")}),razorpay_order_id.in.(${txnIds.map((x) => `"${x}"`).join(",")})`,
          );
        const byTxn = new Map<string, any>();
        for (const p of matched ?? []) {
          if (p.transaction_id) byTxn.set(p.transaction_id, p);
          if (p.razorpay_payment_id) byTxn.set(p.razorpay_payment_id, p);
          if (p.razorpay_order_id) byTxn.set(p.razorpay_order_id, p);
        }
        for (const t of g.txns) {
          const p = byTxn.get(t.txn);
          if (!p) { unmatched += 1; continue; }
          const { error } = await (await getAdmin()).from("payment_settlements").upsert(
            {
              payment_id: p.id,
              settlement_id: settlementUuid,
              settled_amount: t.amount,
              fee: t.fee,
              net: t.net,
            },
            { onConflict: "payment_id,settlement_id" },
          );
          if (!error) linksCreated += 1;
        }
      }
    }

    // Audit log
    await (await getAdmin()).from("audit_logs").insert({
      action: "settlement_import",
      entity_type: "gateway_settlement",
      actor_id: context.userId,
      new_value: { gateway: data.gateway, settlementsCreated, linksCreated, unmatched, groups: groups.size },
    });

    return { settlementsCreated, linksCreated, unmatched, groups: groups.size };
  });

export const listSettlements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      gateway: z.string().optional(),
      limit: z.number().min(1).max(500).default(100),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context.supabase, context.userId);

    let q = (await getAdmin())
      .from("gateway_settlements")
      .select("id, gateway, settlement_id, settled_at, gross, fees, tax_on_fees, net, currency")
      .order("settled_at", { ascending: false })
      .limit(data.limit);
    if (data.gateway) q = q.eq("gateway", data.gateway);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r) => r.id);
    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const { data: links } = await (await getAdmin())
        .from("payment_settlements")
        .select("settlement_id")
        .in("settlement_id", ids);
      for (const l of links ?? []) {
        counts.set(l.settlement_id, (counts.get(l.settlement_id) ?? 0) + 1);
      }
    }
    return { rows: (rows ?? []).map((r) => ({ ...r, payment_count: counts.get(r.id) ?? 0 })) };
  });

export const getUnreconciledPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinance(context.supabase, context.userId);
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: pays, error } = await (await getAdmin())
      .from("payments")
      .select("id, transaction_id, gateway_name, amount, payment_date, lead_id")
      .eq("status", "paid")
      .lt("payment_date", cutoff)
      .order("payment_date", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const ids = (pays ?? []).map((p) => p.id);
    if (ids.length === 0) return { rows: [] };
    const { data: links } = await (await getAdmin())
      .from("payment_settlements")
      .select("payment_id")
      .in("payment_id", ids);
    const linked = new Set((links ?? []).map((l) => l.payment_id));
    return { rows: (pays ?? []).filter((p) => !linked.has(p.id)) };
  });

export const getLeadFinance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ leadId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertFinance(context.supabase, context.userId);
    const [{ data: pays }, { data: invs }] = await Promise.all([
      (await getAdmin()).from("payments").select("*").eq("lead_id", data.leadId).order("created_at", { ascending: false }),
      (await getAdmin()).from("invoices").select("*").eq("lead_id", data.leadId).order("issued_at", { ascending: false }),
    ]);
    const payIds = (pays ?? []).map((p: any) => p.id);
    let settlements: any[] = [];
    if (payIds.length > 0) {
      const { data: links } = await (await getAdmin())
        .from("payment_settlements")
        .select("payment_id, settled_amount, fee, net, gateway_settlements(settlement_id, settled_at, gateway)")
        .in("payment_id", payIds);
      settlements = links ?? [];
    }
    return { payments: pays ?? [], invoices: invs ?? [], settlements };
  });
