# Finish CCAvenue: Status & Refund API now that CCAvenue approved the URLs/IP

Good news — the approval changed things. I just re-ran the live Order Status API call with your credentials:

- Before: `enc_error_code=51407` — "Access_code: Invalid Parameter" (API access blocked)
- Now: `enc_error_code=51411` — "JSON request format: Invalid Parameter format"

That means **CCAvenue has let us in**. The access code is accepted and the calling IP is allowed. The only thing left is that our request body is in the wrong shape: we send the old pipe/form style `key=value&key=value` while the API is running in `request_type=JSON` mode and expects an encrypted JSON object.

## What to change

1. **Fix the DoWebTrans request format** in `src/lib/payments/ccavenue.server.ts`
   - Encrypt `JSON.stringify(payload)` instead of the form-encoded string for the Status and Refund commands.
   - Leave the checkout (`transaction.do`) request untouched — that one is correctly form-encoded and already works end to end.
   - Keep the existing response parser, which already handles both JSON and form replies.

2. **Correct the Order Status payload**
   - Send only `order_no` (our order id) or `reference_no` (CCAvenue tracking id), not both empty/duplicated as today.

3. **Verify against live**
   - Run the status call again and confirm a real CCAvenue response (for a non-existent order it should come back with a proper "order not found"-type result rather than a format error).
   - Then run the same call for a real order id once you do the ₹1 test payment.

4. **Re-enable the admin credential self-check**
   - The `/admin/gateways` "Test credentials" button will then report a genuine pass instead of the API-blocked message.
   - Update the copy that currently warns "Status/Refund API is not enabled for this account".

5. **Refunds**
   - With the API reachable, admin refunds for CCAvenue payments go live through `callRefundApi`. I'll confirm the refund payload is also JSON-encoded, but I will not fire a real refund without your go-ahead.

## One thing to watch (IP whitelisting)

The third URL they enabled, `http://35.204.191.216`, is exactly the outbound IP this build/dev environment uses — that is why the call works from here right now. Your **published** site runs on the hosting platform's edge network, which does not always use that same address. So after the format fix I'll check the status call from the deployed environment too. If it fails there with `51407` again, the fix is to ask CCAvenue to allow the API without a fixed IP restriction (or supply their required range) — nothing in our code changes.

## Not touched

PayU, the checkout flow, the webhook/callback handler, the amount-mismatch safety hold, and the gateway priority (PayU 10 default, CCAvenue 20 selectable) all stay exactly as they are.
