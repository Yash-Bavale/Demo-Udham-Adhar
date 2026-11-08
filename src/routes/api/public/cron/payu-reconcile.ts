// Periodic sweep for PayU payments that never received a webhook callback.
// Every 5 minutes we look at payments in 'created' or 'attempted' state that
// are 3-1440 minutes old, call PayU's verify_payment API for each one, and
// finalize (or fail) accordingly. This makes lost webhooks self-heal within
// a few minutes so operations doesn't need to manually reconcile.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/payu-reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        const auth = request.headers.get("authorization") ?? "";
        const apikey = request.headers.get("apikey") ?? "";
        if (!secret || (auth !== `Bearer ${secret}` && apikey !== secret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { verifyPayUPayment } = await import("@/lib/payments/payu.server");
          const { finalizePaidPayment } = await import("@/lib/payments/finalize-paid.server");

          // Candidates: PayU rows still 'created' or 'attempted' that are older
          // than 3 min (allow the real webhook to arrive first) and younger
          // than 24h (older ones are stale — surface them to ops instead).
          const cutOff = new Date(Date.now() - 1 * 60_000).toISOString();
          const lookback = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
          const { data: candidates } = await supabaseAdmin
            .from("payments")
            .select("id, transaction_id, razorpay_order_id, status")
            .eq("gateway_name", "payu")
            .in("status", ["created", "attempted"])
            .lt("created_at", cutOff)
            .gt("created_at", lookback)
            .limit(100);

          const results: any[] = [];
          for (const p of candidates ?? []) {
            const txnid = p.transaction_id || p.razorpay_order_id;
            if (!txnid) continue;
            try {
              const verified = await verifyPayUPayment(txnid);
              const status = String(verified?.status ?? "").trim().toLowerCase();
              const unmapped = String(verified?.unmappedstatus ?? "").trim().toLowerCase();
              const success = status === "success" || unmapped === "captured";
              const failure = status === "failure" || status === "failed" ||
                ["bounced", "dropped", "failed", "usercancelled"].includes(unmapped);

              if (success) {
                await supabaseAdmin.from("payments").update({
                  status: "paid",
                  payment_date: new Date().toISOString(),
                  webhook_received_at: new Date().toISOString(),
                  razorpay_payment_id: verified?.mihpayid ? String(verified.mihpayid) : null,
                  payu_mihpayid: verified?.mihpayid ? String(verified.mihpayid) : null,
                  payu_bank_ref_num: verified?.bank_ref_num ? String(verified.bank_ref_num) : null,
                  raw_response: { verified_payment: verified, source: "cron-reconcile" } as any,
                } as any).eq("id", p.id);
                const r = await finalizePaidPayment(p.id, {
                  source: "cron",
                  txnid,
                  mihpayid: verified?.mihpayid ? String(verified.mihpayid) : null,
                });
                results.push({ id: p.id, status: "paid", applicationId: r.applicationId });
              } else if (failure) {
                await supabaseAdmin.from("payments").update({
                  status: "failed",
                  raw_response: { verified_payment: verified, source: "cron-reconcile" } as any,
                } as any).eq("id", p.id);
                await supabaseAdmin.from("leads")
                  .update({ status: "payment_pending", lead_status_v2: "payment_failed" } as any)
                  .eq("id", (await supabaseAdmin.from("payments").select("lead_id").eq("id", p.id).single()).data?.lead_id ?? "");
                results.push({ id: p.id, status: "failed" });
              } else {
                results.push({ id: p.id, status: "still_pending", gatewayStatus: status || unmapped });
              }
            } catch (e) {
              console.error("[payu-reconcile] verify failed", { id: p.id, txnid, error: e });
              results.push({ id: p.id, error: e instanceof Error ? e.message : String(e) });
            }
          }

          return Response.json({ ok: true, scanned: candidates?.length ?? 0, results });
        } catch (err) {
          console.error("[payu-reconcile] failed", err);
          return Response.json({ ok: false, error: String(err) }, { status: 500 });
        }
      },
      GET: async () => Response.json({ ok: true, hint: "POST to run" }),
    },
  },
});
