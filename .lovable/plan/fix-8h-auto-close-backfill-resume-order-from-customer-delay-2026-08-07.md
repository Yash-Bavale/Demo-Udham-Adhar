# Fix 8h auto-close backfill + Resume Order from customer delay

## Why old orders never closed

Checked the database: only 4 timer rows have ever existed (`workflow_timers`), all cancelled. The 4h nudge / 8h auto-close timers are only armed when a payment is finalised or "Mark Form Pending" is pressed — both shipped recently. Every older order that received the form-link email (`E003` / `welcome_and_form_link`) was created before that, so no 8h timer was ever armed and nothing closed them.

There are currently **10 open orders** in that state: form email sent weeks ago, `form_status = pending`, still `NEW_ORDER` / Order Received (e.g. AP-2026-006922, AP-2026-006785, AP-2026-006764, AP-2026-006766, AP-2026-006760, AP-2026-006701, AP-2026-006700, AP-2026-006668, AP-2026-006630, AP-2026-006625).

## What I'll do

### 1. Backfill the missed auto-closes
- One-off backfill closing exactly those orders: form-link email older than 8 hours, form still not submitted, order not already closed/completed/refunded.
- Each one gets: `order_status = CLOSED`, stage `Order Closed (S12)`, the standard "form not received" close reason, remark "Backfill: form not received within 8h", and a timeline event so it's auditable.
- **No emails sent** for the backfill — these orders are weeks old, so a fresh "ticket closed" mail would confuse customers. (Say the word if you'd rather they get E010.)
- Any lingering form timers on those orders are cancelled.

### 2. Resume Order button on Customer Side Delay
- Today the Customer Side Delay stage (S06) shows no buttons, so an order parked there is stuck.
- Add a **Resume Order** button that appears when the order is in Customer Side Delay: it moves the order back to **Form Submitted (S04)**, cancels the customer-hold reminder timers, and logs the resume in the timeline.
- Reuses the existing resume action; no new email is sent.

## Technical notes
- Backfill runs as a single SQL migration over the matching `applications` rows plus `application_events` inserts — no new tables.
- `PHASE_ENABLED_BUTTONS.customer_delay` gains the resume button; handler calls the existing `resumeFromHold` path with target Form Received and sets `fulfillment_status = form_submitted`, plus `cancelTimers` for `customer_hold_reminder`.
- Going forward the 8h auto-close works on its own for new orders (timers are armed at payment/form-pending), so this backfill is one-time.
