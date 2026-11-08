# Close overdue orders with a proper reason + E010

## Goal

Auto-close currently picks the *first* reason in the close-reason list — "Customer requested cancellation" — which is wrong and misleading in the closure email. Fix the reason mapping, then close every order that is already past its 8-hour deadline and send them the closure email (E010) with the correct reason.

## Reason mapping (stage-specific)

| Stage | Close reason stored | Remark stored |
|---|---|---|
| Form not submitted (payment done, form never received) | A2 — Customer unresponsive after multiple attempts | "Form not received within 8 hours of payment" |
| Customer-side delay (info/documents requested, no response) | A2 — Customer unresponsive after multiple attempts | "No response from customer within 8 hours of request" |

Both stages are genuine non-response cases, so they share reason A2 but carry distinct remarks so staff can tell them apart in the timeline and order record.

## E010 email content

The closure email will state both lines:

- Reason: Customer unresponsive after multiple attempts
- Details: the stage remark above

## Backfill (one-time)

- Scope: **all paid orders** past the 8-hour deadline in either stage, no age limit. Never-paid / hidden lead rows are excluded.
- Each order gets: status closed, reason A2, the stage remark, a timeline entry marked "System (backfill)", any leftover timers cancelled.
- **E010 is sent to all of them**, including older orders, as requested.
- Orders whose form actually arrived, or that already moved past the stage, are skipped.

## Ongoing behaviour

Future auto-closes use the same reason mapping and the same email wording, so backfilled and future closures look identical.

## Technical notes

- `autoCloseForm` in `src/lib/orders/actions/timers-tick.server.ts` currently selects `order_close_reasons` ordered by `number LIMIT 1`. Replace with a lookup of the A2 reason (`Customer unresponsive after multiple attempts`) and a stage parameter that supplies the remark.
- Extend the same closure path to the customer-delay timer so both stages close through one helper (status `CLOSED` / `order_closed` / `cancelled`, `closure_reason_id`, `closure_remarks`, clear `active_reason_*`).
- E010 payload gains `reason` (label) and `reasonDetails` (remark); template renders both.
- Backfill runs as a one-off script against paid orders using the same helper, so it cannot drift from the live logic.
- Verification: report counts of closed orders per stage and confirm queued E010 rows.
