# Make payment finalization top-up safe

The false "payment successful" on AP-2026-008007 came from three bugs, all now patched in code but not yet published:
strict link↔payment matching, no blanket lead-status sync, and one order-confirmation email per payment.

Reviewing the finalize pipeline for the top-up case shows it is still unsafe: it treats every paid
payment as if it were the first payment of a brand-new order.

## What breaks today when a top-up is paid on an older order

For a service-change top-up (order placed yesterday, delta paid today), `finalizePaidPayment` currently:

1. Pushes the order back to "payment received", undoing whatever stage it had reached (form submitted, processing).
2. Re-arms the 4h nudge and 8h auto-close form timers — a live, already-submitted order can get auto-closed.
3. Sends E001 "Order Confirmation & Tax Invoice" again, as if it were a new order.
4. Leaves the lead's headline amounts unchanged, so the CRM shows only the original amount as due/paid.

## Fix

Detect whether a payment is the order's **first settled payment** or a **top-up** (any earlier `paid`
payment exists for the same lead/application), then branch:

First payment (unchanged behaviour)
- Create/attach order, transition to payment received, invoice, E001, arm form timers.

Top-up payment
- Do not transition the order status and do not touch fulfillment stage.
- Do not arm or re-arm the form timers.
- Generate the supplementary invoice for that payment only (existing per-payment invoice logic).
- Send a top-up/balance receipt instead of E001 (reuse the existing template registry; if no top-up
  template exists, send the invoice-only variant with the supplementary invoice attached).
- Mark the top-up `payment_links` row paid and set the lead back to `payment_successful` only when no
  other pending link remains.
- Stamp `parent_payment_id` on the top-up payment so the payment history shows the linkage.

Guards that make this permanent for all future payments
- One confirmation email per payment, keyed on that payment's invoice `last_emailed_at` (already in place).
- A payment may only settle a payment link created before it and matching its amount (already in place).
- Lead status is derived from actual paid payments plus outstanding pending links, never from "an
  application exists" (already in place).

## How top-ups will read in the CRM afterwards

- **Order**: stays one order (`AP-…`), keeps its current stage; no reset, no duplicate order.
- **Payments tab**: two rows — the original payment and the top-up, each with its own gateway ref.
- **Invoices tab**: original invoice plus a supplementary invoice for the delta.
- **Lead/payment status**: `payment_pending` from the moment the top-up link is issued until the delta
  settles, then `payment_successful`.
- **Revenue**: sum of settled payments, so the top-up adds to today's revenue while the original stays on
  its own date — no double counting.

## Verification

- Replay the finalizer against the AP-2026-008007 top-up scenario in the DB and confirm no status
  regression, no new timers, no duplicate E001.
- Re-scan `payment_links` and `leads` for any other link marked paid without a matching payment.
- Publish so production reconcile/webhook paths use the corrected logic.

## Technical notes

Files touched: `src/lib/payments/finalize-paid.server.ts` (branching, timers, email choice),
`src/lib/crm/orders-v2.functions.ts` (top-up link creation stamps intent), and the email template
lookup in `src/lib/emails/emails.server.ts` only if a top-up receipt template must be registered.
No schema change needed — `payments.parent_payment_id` already exists.
