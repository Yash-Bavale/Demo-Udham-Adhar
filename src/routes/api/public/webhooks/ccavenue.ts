import { createFileRoute } from "@tanstack/react-router";
import { generateInvoiceInternal } from "@/lib/crm/invoices.functions";

/**
 * CCAvenue redirect/response endpoint. CCAvenue POSTs `encResp` containing
 * the encrypted key=value payload after a transaction. We decrypt, verify,
 * update the payment + lead + application, and 303-redirect the browser to
 * success / failure / pending pages. Idempotent against repeated callbacks.
 */
export const Route = createFileRoute("/api/public/webhooks/ccavenue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const returnNonce = new URL(request.url).searchParams.get("r");
        const { callOrderStatusApi, decryptResponse, getCcavCreds, normalizeCcavStatus, parseCcavPayload } =
          await import("@/lib/payments/ccavenue.server");
        let creds: ReturnType<typeof getCcavCreds>;
        try {
          creds = getCcavCreds();
        } catch (e) {
          console.error("[ccavenue] not configured", e);
          return new Response("Gateway not configured", { status: 500 });
        }

        const form = await readFormFields(request);
        if (!form) {
          return new Response("Unsupported payload", { status: 400 });
        }
        const encResp = form.get("encResp")?.toString() ?? "";
        if (!encResp) {
          return new Response("Missing encResp", { status: 400 });
        }

        let payload: Record<string, string>;
        try {
          const decrypted = decryptResponse(encResp, creds.workingKey);
          payload = parseCcavPayload(decrypted);
        } catch (e) {
          console.error("[ccavenue] decrypt failed", e);
          return new Response("Invalid payload", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const orderId = payload.order_id || payload.merchant_param0 || "";
        const trackingId = payload.tracking_id || payload.reference_no || "";
        const orderStatus = payload.order_status || payload.status || "";
        const amount = payload.amount || payload.mer_amount || "";
        const failureMessage = payload.failure_message || payload.status_message || "";
        const leadCodeFromParam = payload.merchant_param3 || "";

        if (!orderId) {
          return new Response("Missing order_id", { status: 400 });
        }

        // Browser-return vs server-to-server: CCAvenue's response URL is hit
        // by the user's browser as a form POST, so Accept includes text/html.
        const accept = request.headers.get("accept") ?? "";
        const isBrowser = accept.includes("text/html");

        // Find the payment row by order_id (stored as transaction_id and razorpay_order_id).
        const { data: payment } = await supabaseAdmin
          .from("payments")
          .select("id, lead_id, application_id, status, amount")
          .or(`transaction_id.eq.${orderId},razorpay_order_id.eq.${orderId}`)
          .maybeSingle();

        if (!payment) {
          console.error("[ccavenue] payment row missing", { orderId });
          return isBrowser
            ? await redirectToPending(leadCodeFromParam || orderId, returnNonce)
            : new Response("payment-not-found", { status: 200 });
        }

        let normalized = normalizeCcavStatus(orderStatus);

        // For "attempted" (Awaited / Initiated) or amount mismatch, reconcile
        // via Status API to get the authoritative state.
        const amountMismatch = Boolean(amount) && Number(amount) !== Number(payment.amount);
        let reconciliationFailed = false;
        if (amountMismatch || normalized === "attempted" || normalized === "created") {
          try {
            const reconciled = await callOrderStatusApi(orderId);
            console.info("[ccavenue] reconciled", {
              orderId,
              postedStatus: orderStatus,
              reconciledStatus: reconciled.status,
            });
            normalized = reconciled.status;
            if (reconciled.amount) payload.amount = reconciled.amount;
            if (reconciled.bankRefNo) payload.bank_ref_no = reconciled.bankRefNo;
            if (reconciled.trackingId && !payload.tracking_id) {
              payload.tracking_id = reconciled.trackingId;
            }
            payload._reconciled = JSON.stringify(reconciled.raw);
          } catch (e) {
            reconciliationFailed = true;
            console.error("[ccavenue] status api lookup failed", { orderId, error: e });
          }
        }

        // Never auto-confirm a payment whose amount disagrees with our record
        // when the Status API could not vouch for it — hold it for manual review.
        if (amountMismatch && reconciliationFailed && normalized === "paid") {
          console.error("[ccavenue] amount mismatch unverified, holding as attempted", {
            orderId,
            postedAmount: amount,
            expectedAmount: payment.amount,
          });
          normalized = "attempted";
        }


        // Idempotency: never downgrade a paid record. Rerun the idempotent
        // finalizer so retries repair an interrupted lead/application update.
        if (payment.status === "paid") {
          try {
            const { finalizePaidPayment } = await import("@/lib/payments/finalize-paid.server");
            await finalizePaidPayment(payment.id, {
              source: "webhook",
              txnid: orderId,
              mihpayid: trackingId || null,
            });
          } catch (e) {
            console.error("[ccavenue] paid payment finalization retry failed", e);
          }
          return isBrowser
            ? await redirectToSuccess(leadCodeFromParam || orderId, returnNonce)
            : new Response("OK", { status: 200 });
        }

        const newStatus: "paid" | "failed" | "attempted" =
          normalized === "paid" ? "paid" :
          normalized === "failed" ? "failed" :
          "attempted";

        const rawPayload: Record<string, string> = {};
        form.forEach((v, k) => { rawPayload[k] = typeof v === "string" ? v : "[file]"; });

        console.info("[ccavenue] callback decision", {
          orderId,
          leadCode: leadCodeFromParam || null,
          isBrowser,
          postedStatus: orderStatus,
          normalized,
          newStatus,
        });

        const { error: paymentUpdateError } = await supabaseAdmin
          .from("payments")
          .update({
            status: newStatus,
            razorpay_payment_id: trackingId || null,
            payment_date: newStatus === "paid" ? new Date().toISOString() : null,
            webhook_response: rawPayload,
            raw_response: { tracking_id: trackingId, order_status: orderStatus, ...payload } as any,
          })
          .eq("id", payment.id);
        if (paymentUpdateError) {
          console.error("[ccavenue] payment update failed", { orderId, error: paymentUpdateError });
          return isBrowser
            ? await redirectToPending(leadCodeFromParam || orderId, returnNonce)
            : new Response("payment-update-failed", { status: 200 });
        }

        if (newStatus === "paid") {
          try {
            const { finalizePaidPayment } = await import("@/lib/payments/finalize-paid.server");
            await finalizePaidPayment(payment.id, {
              source: "webhook",
              txnid: orderId,
              mihpayid: trackingId || null,
            });
          } catch (e) {
            console.error("[ccavenue] post-payment workflow failed", e);
          }

          return isBrowser
            ? await redirectToSuccess(leadCodeFromParam || orderId, returnNonce)
            : new Response("OK", { status: 200 });
        }

        if (newStatus === "failed") {
          await supabaseAdmin.from("leads")
            .update({ status: "payment_pending" })
            .eq("id", payment.lead_id);
          return isBrowser
            ? await redirectToFailure(leadCodeFromParam || orderId, failureMessage || "Payment failed", returnNonce)
            : new Response("OK", { status: 200 });
        }

        return isBrowser
          ? await redirectToPending(leadCodeFromParam || orderId, returnNonce)
          : new Response("OK", { status: 200 });
      },
    },
  },
});

const APP_ORIGIN = process.env.APP_BASE_URL ||
  process.env.PUBLIC_SITE_URL ||
  "https://udyamadhar.in";

async function redirectToSuccess(leadCode: string, nonce?: string | null) {
  const { gatewayReturnRedirect } = await import("@/lib/security/customer-access.server");
  return gatewayReturnRedirect(leadCode, "success", APP_ORIGIN, undefined, nonce);
}
async function redirectToPending(leadCode: string, nonce?: string | null) {
  const { gatewayReturnRedirect } = await import("@/lib/security/customer-access.server");
  return gatewayReturnRedirect(leadCode, "payment-pending", APP_ORIGIN, undefined, nonce);
}
async function redirectToFailure(leadCode: string, reason: string, nonce?: string | null) {
  const { gatewayReturnRedirect } = await import("@/lib/security/customer-access.server");
  return gatewayReturnRedirect(leadCode, "payment-failed", APP_ORIGIN, { reason }, nonce);
}

async function readFormFields(request: Request): Promise<URLSearchParams | null> {
  const ct = (request.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
      const fd = await request.formData();
      const params = new URLSearchParams();
      for (const [k, v] of fd.entries()) params.append(k, typeof v === "string" ? v : "");
      return params;
    }
    const body = await request.text();
    if (!body) return new URLSearchParams();
    if (ct.includes("application/json") || body.trimStart().startsWith("{")) {
      const json = JSON.parse(body) as Record<string, unknown>;
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(json)) params.append(k, v == null ? "" : String(v));
      return params;
    }
    return new URLSearchParams(body);
  } catch {
    return null;
  }
}
