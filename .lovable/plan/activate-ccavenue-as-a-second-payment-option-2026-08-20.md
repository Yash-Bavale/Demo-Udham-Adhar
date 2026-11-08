# Activate CCAvenue as a second payment option

Most of the CCAvenue integration already exists in the codebase (order creation, AES crypto, callback handler, status/refund API, customer-facing gateway picker). It is simply switched off and a few paths still hardcode PayU. This plan turns it on safely, without touching PayU behaviour.

## What already exists (verified)

- Order creation server function with idempotency and duplicate-payment guard.
- AES-128-CBC request/response crypto, order-id builder, status normalisation, Order Status API and Refund API helpers.
- Public callback route `/api/public/webhooks/ccavenue` — decrypts, reconciles via Status API, updates payment/lead/application, generates invoice, sends the order-confirmation email, redirects to success/failed/pending.
- Gateway-agnostic `initiatePayment` that dispatches to PayU or CCAvenue.
- Customer summary page `/apply/:leadCode/summary` already lists CCAvenue as a supported gateway.
- Live credentials are saved: CCAV_MERCHANT_ID, CCAV_ACCESS_CODE, CCAV_WORKING_KEY.
- Database row `payment_gateways.ccavenue` exists, `is_enabled = false`, priority 20.

## What will change

1. **Enable the gateway** — set `payment_gateways.ccavenue.is_enabled = true`, keep priority 20 so PayU (10) stays the default and pre-selected option. CCAvenue appears as a selectable second card on the payment summary page.

2. **Run against live** — no `CCAV_ENV` is set, and the code already defaults to `live` (secure.ccavenue.com). No change needed; the plan just confirms it.

3. **Fix the legacy payment page** — `/payment/:leadCode` calls `createPayUOrder` directly. Switch it to `initiatePayment` so it honours the enabled/priority order like the main summary page does. Same PayU result today; no behaviour change while PayU is priority 10.

4. **Admin gateway page copy** — `/admin/gateways` still says "Only PayU is wired end-to-end today". Update that text to reflect that CCAvenue is live, and keep the existing note that CCAvenue callbacks are not HMAC-signed (verified instead by decrypting CCAvenue's encrypted response plus an Order Status API re-check).

5. **Credential self-check** — add a small read-only admin action on `/admin/gateways` that calls the CCAvenue Order Status API with a dummy reference and reports whether the merchant id / access code / working key are accepted. This surfaces a wrong working key immediately instead of after a failed customer payment. Super-admin only, no writes.

6. **Refund path** — `/admin/refunds` already references CCAvenue; confirm the refund action routes CCAvenue payments to `callRefundApi` and log a clear error if credentials are missing. No refund logic rewrite.

## Safety / no-harm guarantees

- PayU code path, webhook, and salt handling are untouched.
- No schema migration; only a single `is_enabled` flag update on an existing row.
- Order creation already marks stale CCAvenue attempts as failed and blocks a second payment for an already-paid lead.
- Callback handler already refuses to downgrade a `paid` payment (idempotent on repeat callbacks).

## Verification after build

- Confirm the gateway row shows Enabled in `/admin/gateways` and the self-check passes.
- Open a real pending lead's summary page and confirm both PayU and CCAvenue cards render with PayU pre-selected.
- Run one small live CCAvenue transaction end-to-end and confirm: payment row goes `paid`, lead moves to `payment_successful`, invoice generates, order-confirmation email sends, browser lands on `/success/:leadCode`.

## Technical notes

Files touched: `src/routes/payment.$leadCode.tsx` (use `initiatePayment`), `src/routes/admin.gateways.tsx` (copy + self-check button), `src/lib/payments/gateways.functions.ts` (new super-admin `checkCcavenueCredentials` server fn), plus one data update to `payment_gateways`. CCAvenue response URL configured in the CCAvenue dashboard must be `https://udyamadhar.in/api/public/webhooks/ccavenue` (both redirect and cancel URL) — the code already sends these per transaction.
