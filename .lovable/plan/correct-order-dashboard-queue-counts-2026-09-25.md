# Correct order dashboard queue counts

## Outcome
- Keep Today’s Orders and other period totals limited to the selected date range.
- Make Need Action, Hot Orders, and Reminders show every currently outstanding order, regardless of creation date.
- Make Backlog show unresolved Need Action orders created before today in IST.
- Ensure clicking each card shows the same orders represented by its count.

## Implementation
1. Update the live order-list routine so operational queues are selected independently of the chosen date range.
2. Keep staff assignment, service, payment, stage, search, and other explicit filters consistent between counts and lists.
3. Align the server fallback with the same rules and remove any stage-definition drift.
4. Add regression coverage for today versus all-time operational queues.
5. Verify live counts, tab results, and the Orders page build.

## Technical details
- Today boundaries remain Asia/Kolkata boundaries.
- Need Action includes all non-terminal untouched action stages.
- Backlog is the subset whose order creation time is earlier than today’s IST midnight.
- Hot Orders and Reminders remain mutually exclusive and include all active records across time.
