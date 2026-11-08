# Fix overdue form and customer-delay closures

## Confirmed problems

- The active Customer Side Delay button uses `setExternalDelay` and `workflow_reminders`, not the `workflow_timers` path fixed previously.
- There are currently **10 overdue customer-delay orders still open**. Their closure reminders are already marked `sent`, so the current cron will not retry them.
- That active path updates only `workflow_status`; it does not consistently stamp `fulfillment_status = customer_delay`, `customer_hold_started_at`, or `order_status = CUSTOMER_HOLD`, which explains the previous-stage labels.
- The reminder cron sends E010 and marks the reminder sent before closing the order. Its closure code selects the first close reason (A1), not A2, and duplicates closure logic instead of using the shared helper.
- The current B01 form-link action updates the visible fulfillment stage but does not arm the 4-hour reminder and 8-hour auto-close timers.
- Final form submission already moves the application to `FORM_RECEIVED` / `form_submitted`, but it must also clear both form and customer-delay countdowns/state.

## Implementation

1. **Make each action persist its real stage**
  - B01 form link: stamp the form-link time, set the form-pending stage, and arm the 4-hour nudge plus 8-hour close timer.
  - Customer Side Delay: stamp `CUSTOMER_HOLD`, `customer_delay`, and `customer_hold_started_at`, then create one 8-hour wall-clock closure timer.
  - Remove the duplicate customer-delay scheduling path so one action cannot create conflicting timers/reminders.
2. **Use one closure implementation**
  - Route both form-pending and customer-delay expiry through the existing shared auto-close helper.
  - Resolve the valid A2 reason by its exact label:(which is sent while sending hold email)
  - Store a stage-specific remark and send E010 only after the order is successfully closed.
  - Make expiry processing retry-safe: failed closure/email work must not be permanently marked complete, and repeated ticks must not send duplicate E010 messages.
3. **Fix positive-path submission/resume cleanup**
  - On successful form submission, move to `FORM_RECEIVED` / `form_submitted`, clear customer-delay metadata, and cancel all form/customer-delay timers and reminders.
  - Keep Resume Order moving Customer Delay back to Form Submitted and cancel the same active countdown records.
4. **Correct stage display source**
  - Update the shared stage computation so Form Not Submitted and Customer Delay display as their actual active states instead of Payment Done/Form Submitted.
  - Keep all admin surfaces using the same computed stage and journey phase.
5. **Backfill and verify**
  - Close every currently overdue Form Not Submitted and Customer Delay order that is still unresolved.
  - Apply A2 plus the correct stage-specific remark, log the system closure event, and send E010 once per order.
  - Do not close orders whose form was submitted, delay was resumed, or order already completed/closed/refunded.
  - Verify no overdue eligible rows remain, E010 logs exist once per closed order, fresh actions create the correct 8-hour timer, and form submission cancels it.

## Technical scope

- Reuse `auto-close.server.ts`; remove closure SQL duplication from cron processing.
- Update the real action paths in `order-actions.functions.ts` and `workflow.functions.ts`, their cron executors, submission cleanup, and shared stage computation.
- Apply the data repair through a tracked database migration/backfill with idempotent guards and explicit audit events.