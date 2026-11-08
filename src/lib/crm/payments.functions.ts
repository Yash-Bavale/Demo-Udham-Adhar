import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole, writeAudit } from "@/lib/audit";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

/** Sanitized list for ops/support — no amounts. */
export const listPaymentsSafe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payments_safe")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

/** Full payment list — finance / super_admin only. */
export const listPaymentsFull = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const ok = (roles ?? []).some((r) => r.role === "super_admin" || r.role === "finance");
    if (!ok) throw new Error("Forbidden");

    const { data, error } = await (await getAdmin())
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

/** Revenue stats — finance / super_admin only. */
export const revenueStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const ok = (roles ?? []).some((r) => r.role === "super_admin" || r.role === "finance");
    if (!ok) throw new Error("Forbidden");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 86400_000);
    const monthAgo = new Date(Date.now() - 30 * 86400_000);

    const { data: paid } = await (await getAdmin())
      .from("payments")
      .select("amount, gst_amount, base_amount, payment_date, created_at, status")
      .eq("status", "paid");

    const rows = paid ?? [];
    const sum = (xs: typeof rows, key: "amount" | "gst_amount" | "base_amount") =>
      xs.reduce((s, r) => s + Number(r[key] ?? 0), 0);

    const since = (d: Date) =>
      rows.filter((r) => new Date(r.payment_date ?? r.created_at) >= d);

    return {
      total: { count: rows.length, revenue: sum(rows, "amount"), gst: sum(rows, "gst_amount"), base: sum(rows, "base_amount") },
      today: { count: since(today).length, revenue: sum(since(today), "amount") },
      week: { count: since(weekAgo).length, revenue: sum(since(weekAgo), "amount") },
      month: { count: since(monthAgo).length, revenue: sum(since(monthAgo), "amount") },
    };
  });

// ── Refunds ───────────────────────────────────────────────────────────────

const RefundInput = z.object({
  paymentId: z.string().uuid(),
  amount: z.number().positive(),
  reason: z.string().trim().min(3).max(500),
});

/**
 * Issue a refund against a successful payment. Currently routes CCAvenue
 * payments through CCAvenue's refundOrder API. PayU refunds are not wired
 * yet and will throw a clear error. On success we insert a child payments
 * row tagged 'refunded' and flip the parent to 'refunded' once cumulative
 * refunds match the original amount.
 */
export const refundPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RefundInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin", "accounts"]);

    const { data: payment, error } = await (await getAdmin())
      .from("payments")
      .select("id, lead_id, application_id, gateway_name, status, amount, transaction_id, razorpay_order_id, razorpay_payment_id, raw_response, base_amount, gst_amount, currency")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!payment) throw new Error("Payment not found");
    if (payment.status !== "paid") throw new Error("Only paid payments can be refunded");

    // Cap the refund at the original amount minus existing refunds.
    const { data: existingRefunds } = await (await getAdmin())
      .from("payments")
      .select("amount")
      .eq("parent_payment_id", payment.id);
    const refundedSoFar = (existingRefunds ?? []).reduce((s, r) => s + Math.abs(Number(r.amount ?? 0)), 0);
    const remaining = Number(payment.amount) - refundedSoFar;
    if (data.amount > remaining + 0.001) {
      throw new Error(`Refund exceeds refundable balance (₹${remaining.toFixed(2)})`);
    }

    if (payment.gateway_name === "ccavenue") {
      const { callRefundApi } = await import("@/lib/payments/ccavenue.server");
      const refNo =
        (payment.raw_response as any)?.tracking_id ||
        payment.razorpay_payment_id ||
        payment.transaction_id;
      if (!refNo) throw new Error("CCAvenue tracking_id missing on payment");

      const refundRef = `RF-${payment.id.slice(0, 8)}-${Date.now().toString(36)}`.toUpperCase();
      const result = await callRefundApi({
        refNo,
        refundAmount: data.amount,
        refundRef,
      });
      if (!result.ok) {
        throw new Error(`CCAvenue refund failed: ${result.reason ?? result.refundStatus}`);
      }

      const { data: childRow, error: childErr } = await (await getAdmin())
        .from("payments")
        .insert({
          lead_id: payment.lead_id,
          application_id: payment.application_id,
          gateway_name: payment.gateway_name,
          parent_payment_id: payment.id,
          transaction_id: refundRef,
          razorpay_order_id: refundRef,
          razorpay_payment_id: result.refundRef,
          amount: -Math.abs(data.amount),
          base_amount: 0,
          gst_amount: 0,
          currency: payment.currency ?? "INR",
          status: "refunded",
          refund_reason: data.reason,
          payment_date: new Date().toISOString(),
          raw_response: result.raw as any,
        })
        .select("id")
        .single();
      if (childErr) throw new Error(childErr.message);

      const fullyRefunded = (refundedSoFar + data.amount) >= Number(payment.amount) - 0.001;
      if (fullyRefunded) {
        await (await getAdmin()).from("payments").update({ status: "refunded" }).eq("id", payment.id);
      }

      await writeAudit({
        supabase: context.supabase,
        entityType: "payment",
        entityId: payment.id,
        action: fullyRefunded ? "refund_full" : "refund_partial",
        newValue: { amount: data.amount, reason: data.reason, refundRef, child: childRow?.id },
      });

      return { ok: true, fullyRefunded, childPaymentId: childRow?.id, refundRef };
    }

    if (payment.gateway_name === "payu") {
      throw new Error("PayU refunds are not wired yet. Issue the refund from the PayU dashboard.");
    }

    throw new Error(`Refunds for gateway '${payment.gateway_name}' are not supported.`);
  });

// ── Status reconciliation ────────────────────────────────────────────────

const ReconcileInput = z.object({ paymentId: z.string().uuid() });

/**
 * Re-query the gateway for a payment's authoritative status and update the
 * local row. Today only CCAvenue is wired.
 */
export const reconcilePaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ReconcileInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin", "accounts", "finance"]);

    const { data: payment, error } = await (await getAdmin())
      .from("payments")
      .select("id, gateway_name, status, transaction_id, razorpay_order_id, lead_id")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!payment) throw new Error("Payment not found");

    const gateway = String(payment.gateway_name ?? "").toLowerCase();

    // ── PayU ─────────────────────────────────────────────────────────────
    if (gateway === "payu") {
      const { verifyPayUPayment } = await import("@/lib/payments/payu.server");
      const txnid = payment.transaction_id || payment.razorpay_order_id;
      if (!txnid) throw new Error("Payment is missing a transaction id");
      const verified = await verifyPayUPayment(txnid);
      const status = String(verified?.status ?? "").trim().toLowerCase();
      const unmapped = String(verified?.unmappedstatus ?? "").trim().toLowerCase();
      const success = status === "success" || unmapped === "captured";
      const failure = status === "failure" || status === "failed" ||
        ["bounced", "dropped", "failed", "usercancelled"].includes(unmapped);

      const newStatus = success ? "paid" : failure ? "failed" : payment.status;
      if (newStatus === payment.status && !success) {
        return { ok: true, status: newStatus, raw: verified };
      }

      const mihpayid = verified?.mihpayid ? String(verified.mihpayid) : null;
      await (await getAdmin()).from("payments").update({
        status: newStatus,
        payment_date: newStatus === "paid" ? new Date().toISOString() : undefined,
        webhook_received_at: newStatus === "paid" ? new Date().toISOString() : undefined,
        razorpay_payment_id: mihpayid,
        payu_mihpayid: mihpayid,
        payu_bank_ref_num: verified?.bank_ref_num ? String(verified.bank_ref_num) : null,
        raw_response: { verified_payment: verified, source: "admin-reconcile" } as any,
      } as any).eq("id", payment.id);

      if (newStatus === "paid") {
        const { finalizePaidPayment } = await import("@/lib/payments/finalize-paid.server");
        await finalizePaidPayment(payment.id, { source: "reconcile", txnid, mihpayid });
      } else if (newStatus === "failed") {
        await (await getAdmin()).from("leads")
          .update({ status: "payment_pending", lead_status_v2: "payment_failed" } as any)
          .eq("id", payment.lead_id);
      }

      await writeAudit({
        supabase: context.supabase,
        entityType: "payment",
        entityId: payment.id,
        action: "status_reconciled",
        oldValue: { status: payment.status },
        newValue: { status: newStatus, source: "payu.verify_payment" },
      });

      return { ok: true, status: newStatus, raw: verified as any };

    }

    // ── CCAvenue ─────────────────────────────────────────────────────────
    if (gateway === "ccavenue") {
      const { callOrderStatusApi } = await import("@/lib/payments/ccavenue.server");
      const orderId = payment.transaction_id || payment.razorpay_order_id;
      if (!orderId) throw new Error("Payment is missing an order id");

      const result = await callOrderStatusApi(orderId);
      const newStatus = result.status === "paid" ? "paid"
        : result.status === "failed" ? "failed"
        : result.status === "refunded" ? "refunded"
        : result.status === "attempted" ? "attempted"
        : payment.status;

      if (newStatus !== payment.status) {
        await (await getAdmin())
          .from("payments")
          .update({
            status: newStatus,
            payment_date: newStatus === "paid" ? new Date().toISOString() : undefined,
            raw_response: result.raw as any,
          })
          .eq("id", payment.id);

        if (newStatus === "paid") {
          const { finalizePaidPayment } = await import("@/lib/payments/finalize-paid.server");
          await finalizePaidPayment(payment.id, { source: "reconcile", txnid: orderId, mihpayid: result.trackingId || null });
        } else if (newStatus === "failed") {
          await (await getAdmin()).from("leads")
            .update({ status: "payment_pending", lead_status_v2: "payment_failed" } as any)
            .eq("id", payment.lead_id);
        }

        await writeAudit({
          supabase: context.supabase,
          entityType: "payment",
          entityId: payment.id,
          action: "status_reconciled",
          oldValue: { status: payment.status },
          newValue: { status: newStatus, source: "ccavenue.orderStatusTracker" },
        });
      }

      return { ok: true, status: newStatus, raw: result.raw as any };
    }

    // ── Cashfree ─────────────────────────────────────────────────────────
    if (gateway === "cashfree") {
      const { getOrderStatus } = await import("@/lib/payments/cashfree.server");
      const orderId = payment.transaction_id || payment.razorpay_order_id;
      if (!orderId) throw new Error("Payment is missing an order id");

      const { credsForPayment } = await import("@/lib/payments/cashfree-accounts.server");
      const { data: acct } = await (await getAdmin())
        .from("payments").select("payment_account_id").eq("id", payment.id).single();
      const cfOrder = await getOrderStatus(orderId, await credsForPayment((acct as any)?.payment_account_id));
      const cfStatus = String(cfOrder?.order_status ?? "").toUpperCase();
      const newStatus = cfStatus === "PAID" ? "paid"
        : cfStatus === "EXPIRED" || cfStatus === "TERMINATED" ? "failed"
        : payment.status;

      if (newStatus === payment.status) {
        return { ok: true, status: newStatus, raw: cfOrder as any };
      }

      if (newStatus === "paid") {
        const paidAmount = Number(cfOrder.order_amount ?? 0);
        const { data: full } = await (await getAdmin())
          .from("payments").select("amount").eq("id", payment.id).single();
        if (Math.abs(paidAmount - Number(full?.amount ?? 0)) > 0.01) {
          throw new Error(`Amount mismatch at gateway (₹${paidAmount} vs ₹${full?.amount})`);
        }
      }

      await (await getAdmin())
        .from("payments")
        .update({
          status: newStatus,
          payment_date: newStatus === "paid" ? new Date().toISOString() : undefined,
          webhook_received_at: newStatus === "paid" ? new Date().toISOString() : undefined,
          raw_response: { api_confirmed: cfOrder, source: "admin-reconcile" } as any,
        } as any)
        .eq("id", payment.id);

      if (newStatus === "paid") {
        const { finalizePaidPayment } = await import("@/lib/payments/finalize-paid.server");
        await finalizePaidPayment(payment.id, { source: "reconcile", txnid: orderId });
      } else if (newStatus === "failed") {
        await (await getAdmin()).from("leads")
          .update({ status: "payment_pending", lead_status_v2: "payment_failed" } as any)
          .eq("id", payment.lead_id);
      }

      await writeAudit({
        supabase: context.supabase,
        entityType: "payment",
        entityId: payment.id,
        action: "status_reconciled",
        oldValue: { status: payment.status },
        newValue: { status: newStatus, source: "cashfree.orderStatus" },
      });

      return { ok: true, status: newStatus, raw: cfOrder as any };
    }

    throw new Error(`Reconciliation for gateway '${payment.gateway_name}' is not wired.`);
  });

