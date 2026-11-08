import { createFileRoute } from "@tanstack/react-router";
import { generateInvoiceInternal } from "@/lib/crm/invoices.functions";

/**
 * PayU return / S2S endpoint. PayU posts x-www-form-urlencoded with the
 * payment result. We verify the response hash, mark the payment + lead +
 * application, generate the invoice, and redirect the user back to a
 * success/failure page on our domain.
 *
 * This endpoint is idempotent: re-posting the same txn won't double-update.
 */
export const Route = createFileRoute("/api/public/webhooks/payu")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const returnNonce = new URL(request.url).searchParams.get("r");
        const { computeResponseHash, getPayUCreds, verifyPayUPayment } = await import(
          "@/lib/payments/payu.server"
        );
        let creds: ReturnType<typeof getPayUCreds>;
        try {
          creds = getPayUCreds();
        } catch (e) {
          console.error("[payu] not configured", e);
          return new Response("Gateway not configured", { status: 500 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const form = await readFormFields(request);
        if (!form) {
          return new Response("Unsupported payload", { status: 400 });
        }
        const get = (k: string) => (form.get(k)?.toString() ?? "");

        const fields = {
          key: get("key"),
          txnid: get("txnid"),
          amount: get("amount"),
          productinfo: get("productinfo"),
          firstname: get("firstname"),
          email: get("email"),
          status: get("status"),
          udf1: get("udf1"),
          udf2: get("udf2"),
          udf3: get("udf3"),
          udf4: get("udf4"),
          udf5: get("udf5"),
        };
        const receivedHash = get("hash");
        const additionalCharges = get("additionalCharges");
        let mihpayid = get("mihpayid");
        let bankrefnum = get("bankrefnum");
        const normalizedStatus = normalizePayUStatus(fields.status);

        // Detect S2S vs browser-return: PayU's server-to-server webhook
        // doesn't send Accept: text/html. Browser-return POST does.
        const accept = request.headers.get("accept") ?? "";
        const isBrowser = accept.includes("text/html");

        if (!receivedHash || !fields.txnid) {
          return new Response("Invalid payload", { status: 400 });
        }

        let verifiedPayment: Awaited<ReturnType<typeof verifyPayUPayment>> | null = null;

        const expected = computeResponseHash({
          ...fields, salt: creds.salt,
          additionalCharges: additionalCharges || undefined,
        });

        const hashMatches = expected.toLowerCase() === receivedHash.toLowerCase();
        if (!hashMatches) {
          try {
            verifiedPayment = await verifyPayUPayment(fields.txnid);
          } catch (e) {
            console.error("[payu] verification lookup failed after hash mismatch", { txnid: fields.txnid, error: e });
          }

          if (!isPayUSuccess(verifiedPayment)) {
            console.error("[payu] hash mismatch", { txnid: fields.txnid });
            return isBrowser
              ? await redirectToPending(get("udf3") || fields.txnid, returnNonce)
              : new Response("hash-mismatch", { status: 200 });
          }

          console.warn("[payu] callback hash mismatch but PayU verification confirms success", { txnid: fields.txnid });
        }

        if (!verifiedPayment && shouldVerifyWithPayU(normalizedStatus)) {
          try {
            verifiedPayment = await verifyPayUPayment(fields.txnid);
            console.info("[payu] verify_payment result", {
              txnid: fields.txnid,
              postedStatus: fields.status,
              verifiedStatus: verifiedPayment?.status,
              verifiedUnmappedStatus: verifiedPayment?.unmappedstatus,
              mihpayid: verifiedPayment?.mihpayid,
            });
          } catch (e) {
            console.error("[payu] verification lookup failed", { txnid: fields.txnid, postedStatus: fields.status, error: e });
          }
        }

        // Load payment by txnid (we stored it as both transaction_id and razorpay_order_id)
        let payment = (await supabaseAdmin
          .from("payments")
          .select("id, lead_id, application_id, status, amount")
          .or(`transaction_id.eq.${fields.txnid},razorpay_order_id.eq.${fields.txnid}`)
          .maybeSingle()).data;

        if (!payment && (fields.udf1 || fields.udf3)) {
          const leadId = fields.udf1;
          const leadCode = fields.udf3;
          const { data: targetLead } = await supabaseAdmin
            .from("leads")
            .select("id, lead_code")
            .or(`id.eq.${leadId || "invalid-uuid"},lead_code.eq.${leadCode || "invalid-code"}`)
            .maybeSingle();

          if (targetLead) {
            const payAmt = Number(fields.amount || 0);
            const baseAmt = Math.round((payAmt / 1.18) * 100) / 100;
            const gstAmt = Math.round((payAmt - baseAmt) * 100) / 100;
            const { data: createdPmt } = await supabaseAdmin
              .from("payments")
              .insert({
                lead_id: targetLead.id,
                gateway_name: "payu",
                transaction_id: fields.txnid,
                razorpay_order_id: fields.txnid,
                amount: payAmt,
                base_amount: baseAmt,
                gst_amount: gstAmt,
                currency: "INR",
                status: "created",
                idempotency_key: `payu:${fields.txnid}`,
              } as any)
              .select("id, lead_id, application_id, status, amount")
              .maybeSingle();
            if (createdPmt) payment = createdPmt;
          }
        }

        if (!payment) {
          console.error("[payu] payment row missing even after lead lookup", fields.txnid);
          return isBrowser
            ? await redirectToPending(get("udf3") || fields.txnid, returnNonce)
            : new Response("payment-not-found", { status: 200 });
        }

        if (Number(fields.amount) !== Number(payment.amount)) {
          console.warn("[payu] amount mismatch", {
            txnid: fields.txnid,
            expected: payment.amount,
            received: fields.amount,
          });
        }

        // Idempotency: once paid, never let a later browser/S2S retry downgrade it.
        // Still rerun the idempotent finalizer so a callback retry repairs any
        // previously interrupted lead/application workflow.
        if (payment.status === "paid") {
          try {
            const { finalizePaidPayment } = await import("@/lib/payments/finalize-paid.server");
            await finalizePaidPayment(payment.id, {
              source: "webhook",
              txnid: fields.txnid,
              mihpayid: mihpayid || null,
            });
          } catch (e) {
            console.error("[payu] paid payment finalization retry failed", e);
          }
          return isBrowser
            ? await redirectToSuccess(get("udf3") || fields.txnid, returnNonce)
            : new Response("OK", { status: 200 });
        }

        const verifiedSuccess = isPayUSuccess(verifiedPayment);
        const verifiedFailure = isPayUFailure(verifiedPayment);
        if (verifiedPayment?.mihpayid && !mihpayid) mihpayid = String(verifiedPayment.mihpayid);
        if (verifiedPayment?.bank_ref_num && !bankrefnum) bankrefnum = String(verifiedPayment.bank_ref_num);
        const safeVerifiedPayment = verifiedPayment
          ? JSON.parse(JSON.stringify(verifiedPayment))
          : null;

        const newStatus: "paid" | "failed" | "attempted" =
          verifiedSuccess || normalizedStatus === "success" || normalizedStatus === "captured" ? "paid" :
          verifiedFailure ? "failed" :
          "attempted";

        const rawPayload: Record<string, string> = {};
        form.forEach((v, k) => { rawPayload[k] = typeof v === "string" ? v : "[file]"; });

        console.info("[payu] callback decision", {
          txnid: fields.txnid,
          leadCode: get("udf3") || null,
          isBrowser,
          hashMatches,
          expectedHashPrefix: expected.slice(0, 12),
          receivedHashPrefix: receivedHash.slice(0, 12),
          postedStatus: fields.status,
          normalizedStatus,
          verifiedSuccess,
          verifiedFailure,
          newStatus,
        });

        const { error: paymentUpdateError } = await supabaseAdmin.from("payments").update({
          status: newStatus,
          razorpay_payment_id: mihpayid || null,
          razorpay_signature: receivedHash,
          payment_date: newStatus === "paid" ? new Date().toISOString() : null,
          webhook_response: rawPayload,
          raw_response: { mihpayid, bankrefnum, ...fields, verified_payment: safeVerifiedPayment } as any,
          payu_mihpayid: mihpayid || null,
          payu_mode: get("mode") || null,
          payu_bank_ref_num: bankrefnum || null,
          payu_net_amount_debit: get("net_amount_debit") ? Number(get("net_amount_debit")) : null,
          payu_error_message: get("error_Message") || get("field9") || null,
          webhook_received_at: new Date().toISOString(),
          is_test_payment: (await import("@/lib/payments/payu.server")).PAYU_MODE !== "live",
        } as any).eq("id", payment.id);
        if (paymentUpdateError) {
          console.error("[payu] payment update failed", { txnid: fields.txnid, error: paymentUpdateError });
          await logWebhookError("payu", paymentUpdateError.message, rawPayload);
          return isBrowser
            ? await redirectToPending(get("udf3") || fields.txnid, returnNonce)
            : new Response("payment-update-failed", { status: 200 });
        }

        if (newStatus === "paid") {
          try {
            const { finalizePaidPayment } = await import("@/lib/payments/finalize-paid.server");
            await finalizePaidPayment(payment.id, {
              source: "webhook",
              txnid: fields.txnid,
              mihpayid: mihpayid || null,
            });
          } catch (e) {
            console.error("[payu] post-payment workflow failed", e);
            await logWebhookError("payu", `post-paid: ${e instanceof Error ? e.message : "unknown"}`, rawPayload);
          }

          return isBrowser
            ? await redirectToSuccess(get("udf3") || fields.txnid, returnNonce)
            : new Response("OK", { status: 200 });
        }

        if (newStatus === "failed") {
          await supabaseAdmin.from("leads")
            .update({ status: "payment_pending", lead_status_v2: "payment_failed" } as any)
            .eq("id", payment.lead_id);
          await supabaseAdmin
            .from("payment_links" as any)
            .update({ status: "failed" } as any)
            .eq("lead_id", payment.lead_id)
            .eq("status", "pending");
          return isBrowser
            ? await redirectToFailure(get("udf3") || fields.txnid, "Payment failed", returnNonce)
            : new Response("OK", { status: 200 });
        }

        return isBrowser
          ? await redirectToPending(get("udf3") || fields.txnid, returnNonce)
          : new Response("OK", { status: 200 });
      },
    },
  },
});

async function logWebhookError(webhookType: string, errorMessage: string, payload: Record<string, unknown>) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("webhook_error_log" as any).insert({
      webhook_type: webhookType,
      error_message: errorMessage.slice(0, 2000),
      raw_payload: payload as any,
    } as any);
  } catch (e) {
    console.error("[webhook] error-log insert failed", e);
  }
}

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

function isPayUSuccess(payment: Record<string, unknown> | null | undefined) {
  const status = normalizePayUStatus(payment?.status);
  const unmapped = normalizePayUStatus(payment?.unmappedstatus);
  return status === "success" || unmapped === "captured";
}

function isPayUFailure(payment: Record<string, unknown> | null | undefined) {
  const status = normalizePayUStatus(payment?.status);
  const unmapped = normalizePayUStatus(payment?.unmappedstatus);
  return status === "failure" || status === "failed" || ["bounced", "dropped", "failed", "usercancelled"].includes(unmapped);
}

function normalizePayUStatus(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function shouldVerifyWithPayU(status: string) {
  return status === "success" || status === "failure" || status === "failed" || status === "";
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
