import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole } from "@/lib/audit";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

export type AuditSeverity = "ok" | "warn" | "error";
export type AuditCheck = {
  id: string;
  label: string;
  severity: AuditSeverity;
  detail: string;
};

const num = (v: unknown) => Number(v ?? 0);
const money = (v: unknown) => `₹${num(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * End-to-end payment audit for one AP order (or lead).
 * Read-only: compares gateway references, payments, payment links, invoices,
 * lead status transitions and email sends, and reports mismatches.
 */
export const auditOrderPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ code: z.string().min(3) }))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin", "finance", "accounts"]);
    const db = await getAdmin();
    const code = data.code.trim().toUpperCase();

    // Resolve the order (AP-…) or lead (UA-…)
    let application: Record<string, unknown> | null = null;
    let leadId: string | null = null;

    if (code.startsWith("AP")) {
      const { data: app } = await db
        .from("applications")
        .select("id, application_code, lead_id, customer_id, order_status, fulfillment_status, created_at")
        .eq("application_code", code)
        .maybeSingle();
      if (!app) throw new Error(`No order found for ${code}`);
      application = app as Record<string, unknown>;
      leadId = (app as { lead_id: string | null }).lead_id;
    } else {
      const { data: lead } = await db.from("leads").select("id").eq("lead_code", code).maybeSingle();
      if (!lead) throw new Error(`No lead found for ${code}`);
      leadId = (lead as { id: string }).id;
      const { data: app } = await db
        .from("applications")
        .select("id, application_code, lead_id, customer_id, order_status, fulfillment_status, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      application = (app as Record<string, unknown>) ?? null;
    }

    const applicationId = (application?.["id"] as string | undefined) ?? null;

    const { data: lead } = leadId
      ? await db
          .from("leads")
          .select("id, lead_code, name, email, status, lead_status_v2, created_at")
          .eq("id", leadId)
          .maybeSingle()
      : { data: null };

    const [paymentsRes, linksRes, invoicesRes, emailsRes, historyRes] = await Promise.all([
      db
        .from("payments")
        .select(
          "id, amount, base_amount, gst_amount, status, gateway_name, transaction_id, payu_mihpayid, razorpay_payment_id, parent_payment_id, payment_date, created_at, application_id, lead_id",
        )
        .eq(leadId ? "lead_id" : "application_id", (leadId ?? applicationId) as string)
        .order("created_at", { ascending: true }),
      leadId
        ? db
            .from("payment_links")
            .select("id, txnid, amount, status, payment_id, created_at, paid_at, expires_at")
            .eq("lead_id", leadId)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as unknown[] }),
      leadId
        ? db
            .from("invoices")
            .select("id, invoice_number, payment_id, total_amount, issued_at, last_emailed_at, pdf_path")
            .eq("lead_id", leadId)
            .order("issued_at", { ascending: true })
        : Promise.resolve({ data: [] as unknown[] }),
      db
        .from("email_logs")
        .select("id, template_code, to_email, subject, status, sent_at")
        .or(
          [leadId ? `lead_id.eq.${leadId}` : null, applicationId ? `application_id.eq.${applicationId}` : null]
            .filter(Boolean)
            .join(","),
        )
        .order("sent_at", { ascending: true })
        .limit(200),
      applicationId
        ? db
            .from("application_status_history")
            .select("id, from_status, to_status, reason, created_at")
            .eq("application_id", applicationId)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

    type Payment = {
      id: string;
      amount: number;
      status: string;
      gateway_name: string | null;
      transaction_id: string | null;
      payu_mihpayid: string | null;
      razorpay_payment_id: string | null;
      parent_payment_id: string | null;
      payment_date: string | null;
      created_at: string;
      application_id: string | null;
    };
    type Link = { id: string; txnid: string; amount: number; status: string; payment_id: string | null; created_at: string; expires_at: string | null };
    type Invoice = { id: string; invoice_number: string | null; payment_id: string; total_amount: number; issued_at: string; last_emailed_at: string | null; pdf_path: string | null };
    type EmailLog = { id: string; template_code: string | null; to_email: string; subject: string; status: string; sent_at: string };

    const payments = ((paymentsRes.data ?? []) as unknown as Payment[]).filter(
      (p) => !applicationId || !p.application_id || p.application_id === applicationId,
    );
    const links = (linksRes.data ?? []) as unknown as Link[];
    const invoices = (invoicesRes.data ?? []) as unknown as Invoice[];
    const emails = (emailsRes.data ?? []) as unknown as EmailLog[];
    const history = (historyRes.data ?? []) as unknown as { from_status: string | null; to_status: string; reason: string | null; created_at: string }[];

    const paid = payments.filter((p) => p.status === "paid");
    const paidTotal = paid.reduce((s, p) => s + num(p.amount), 0);
    const invoiceTotal = invoices.reduce((s, i) => s + num(i.total_amount), 0);
    const gatewayRef = (p: Payment) => p.transaction_id || p.payu_mihpayid || p.razorpay_payment_id || null;

    const checks: AuditCheck[] = [];
    const add = (id: string, label: string, severity: AuditSeverity, detail: string) =>
      checks.push({ id, label, severity, detail });

    // 1. Order exists
    add(
      "order",
      "Order record",
      application ? "ok" : "warn",
      application
        ? `${application["application_code"]} · status ${application["order_status"] ?? "—"} / ${application["fulfillment_status"] ?? "—"}`
        : "No AP order linked to this lead yet",
    );

    // 2. Gateway reference on every paid payment
    const missingRef = paid.filter((p) => !gatewayRef(p));
    add(
      "gateway_ref",
      "Gateway reference on paid payments",
      paid.length === 0 ? "warn" : missingRef.length ? "error" : "ok",
      paid.length === 0
        ? "No paid payment recorded"
        : missingRef.length
          ? `${missingRef.length} paid payment(s) have no gateway transaction id — cannot be reconciled with the gateway`
          : paid.map((p) => `${p.gateway_name ?? "?"} ${gatewayRef(p)} (${money(p.amount)})`).join(", "),
    );

    // 3. Every paid payment has an invoice
    const invoiceByPayment = new Map(invoices.map((i) => [i.payment_id, i]));
    const missingInvoice = paid.filter((p) => !invoiceByPayment.has(p.id));
    add(
      "invoice_coverage",
      "Invoice per paid payment",
      paid.length === 0 ? "warn" : missingInvoice.length ? "error" : "ok",
      paid.length === 0
        ? "No paid payment to invoice"
        : missingInvoice.length
          ? `${missingInvoice.length} paid payment(s) without an invoice`
          : `${invoices.length} invoice(s): ${invoices.map((i) => i.invoice_number ?? i.id.slice(0, 8)).join(", ")}`,
    );

    // 4. Amounts reconcile
    const delta = Math.round((paidTotal - invoiceTotal) * 100) / 100;
    add(
      "amount_match",
      "Paid total vs invoiced total",
      paid.length === 0 ? "warn" : Math.abs(delta) > 0.5 ? "error" : "ok",
      `Paid ${money(paidTotal)} · Invoiced ${money(invoiceTotal)}${Math.abs(delta) > 0.5 ? ` · difference ${money(delta)}` : ""}`,
    );

    // 5. Orphan / stale payment links
    const now = Date.now();
    const pendingLinks = links.filter((l) => l.status === "pending");
    const stalePending = pendingLinks.filter((l) => l.expires_at && new Date(l.expires_at).getTime() < now);
    const paidLinksNoPayment = links.filter((l) => l.status === "paid" && !l.payment_id);
    add(
      "payment_links",
      "Payment links",
      paidLinksNoPayment.length ? "error" : pendingLinks.length ? "warn" : "ok",
      [
        `${links.length} link(s)`,
        pendingLinks.length ? `${pendingLinks.length} pending (${money(pendingLinks.reduce((s, l) => s + num(l.amount), 0))})` : null,
        stalePending.length ? `${stalePending.length} expired but still pending` : null,
        paidLinksNoPayment.length ? `${paidLinksNoPayment.length} marked paid with no payment row` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    );

    // 6. Lead status consistency
    const leadStatus = (lead as { status?: string; lead_status_v2?: string } | null)?.status ?? null;
    const leadStatusV2 = (lead as { lead_status_v2?: string } | null)?.lead_status_v2 ?? null;
    let leadSeverity: AuditSeverity = "ok";
    let leadDetail = `status ${leadStatus ?? "—"} / v2 ${leadStatusV2 ?? "—"}`;
    if (paid.length > 0 && pendingLinks.length === 0 && leadStatus !== "payment_successful") {
      leadSeverity = "error";
      leadDetail += " — payment settled but lead is not marked payment_successful";
    } else if (paid.length === 0 && leadStatus === "payment_successful") {
      leadSeverity = "error";
      leadDetail += " — lead marked payment_successful with no settled payment";
    } else if (paid.length > 0 && pendingLinks.length > 0) {
      leadSeverity = "warn";
      leadDetail += " — top-up link outstanding, lead intentionally kept in payment_pending";
    }
    add("lead_status", "Lead status vs payments", leadSeverity, leadDetail);

    // 7. Status transitions recorded
    add(
      "transitions",
      "Order status transitions",
      history.length === 0 && paid.length > 0 ? "warn" : "ok",
      history.length === 0
        ? "No transitions recorded"
        : `${history.length} transition(s), latest: ${history[history.length - 1]?.from_status ?? "—"} → ${history[history.length - 1]?.to_status}`,
    );

    // 8. Emails: E001 for first payment, E013 for each top-up
    const codes = emails.map((e) => e.template_code ?? "");
    const e001 = emails.filter((e) => e.template_code === "E001" || e.template_code === "order_confirmation" || e.template_code === "payment_success");
    const topUps = paid.filter((p) => p.parent_payment_id);
    const e013 = emails.filter((e) => e.template_code === "E013" || e.template_code === "topup_payment_received");
    const emailIssues: string[] = [];
    if (paid.length > 0 && e001.length === 0) emailIssues.push("no order-confirmation (E001) email sent for the settled payment");
    if (e001.length > 1) emailIssues.push(`${e001.length} order-confirmation emails sent (duplicate)`);
    if (topUps.length > e013.length) emailIssues.push(`${topUps.length} top-up payment(s) but only ${e013.length} top-up (E013) email(s)`);
    const failedEmails = emails.filter((e) => e.status !== "sent");
    if (failedEmails.length) emailIssues.push(`${failedEmails.length} email(s) failed/bounced`);
    add(
      "emails",
      "Email sends",
      emailIssues.length ? (paid.length && e001.length === 0 ? "error" : "warn") : "ok",
      emailIssues.length ? emailIssues.join(" · ") : `${emails.length} email(s) logged${codes.length ? ` (${[...new Set(codes.filter(Boolean))].join(", ")})` : ""}`,
    );

    // 9. Invoice delivery
    const undelivered = invoices.filter((i) => !i.last_emailed_at);
    add(
      "invoice_delivery",
      "Invoice delivery",
      invoices.length === 0 ? "warn" : undelivered.length ? "warn" : "ok",
      invoices.length === 0 ? "No invoices" : undelivered.length ? `${undelivered.length} invoice(s) never emailed` : "All invoices emailed",
    );

    const errors = checks.filter((c) => c.severity === "error").length;
    const warnings = checks.filter((c) => c.severity === "warn").length;

    return {
      code,
      verdict: errors ? "mismatch" : warnings ? "review" : "clean",
      errors,
      warnings,
      checks,
      order: application
        ? {
            code: application["application_code"] as string,
            orderStatus: (application["order_status"] as string) ?? null,
            fulfillmentStatus: (application["fulfillment_status"] as string) ?? null,
            createdAt: application["created_at"] as string,
          }
        : null,
      lead: lead
        ? {
            code: (lead as { lead_code: string }).lead_code,
            name: (lead as { name: string | null }).name,
            email: (lead as { email: string | null }).email,
            status: leadStatus,
            statusV2: leadStatusV2,
          }
        : null,
      payments: payments.map((p) => ({
        id: p.id,
        amount: num(p.amount),
        status: p.status,
        gateway: p.gateway_name,
        reference: gatewayRef(p),
        isTopUp: Boolean(p.parent_payment_id),
        at: p.payment_date ?? p.created_at,
        invoice: invoiceByPayment.get(p.id)?.invoice_number ?? null,
      })),
      links: links.map((l) => ({ id: l.id, txnid: l.txnid, amount: num(l.amount), status: l.status, createdAt: l.created_at })),
      invoices: invoices.map((i) => ({
        id: i.id,
        number: i.invoice_number,
        total: num(i.total_amount),
        issuedAt: i.issued_at,
        emailedAt: i.last_emailed_at,
      })),
      transitions: history.map((h) => ({ from: h.from_status, to: h.to_status, reason: h.reason, at: h.created_at })),
      emails: emails.map((e) => ({ id: e.id, code: e.template_code, to: e.to_email, subject: e.subject, status: e.status, at: e.sent_at })),
      totals: { paid: paidTotal, invoiced: invoiceTotal, delta },
    };
  });
