# Fix strict one-by-one order assignment

## What will change
- Stop the recovery path from copying a lead's employee onto a paid order; every new order will use the independent order rotation.
- Prevent two simultaneous payment callbacks from creating two active orders for the same lead.
- Clean up current duplicate active orders while preserving the order linked to payment when available.
- Keep manual reassignment unchanged.

## Verification
- Confirm only one active order can exist per lead.
- Compare newly created orders in chronological order and verify the three active employees alternate one-by-one.
- Check the admin order list and production build for errors.

## Technical details
- Add a partial unique database index for active applications by `lead_id`.
- Handle a concurrent insert conflict by reusing the order created by the winning request.
- Insert recovery orders with no preselected assignee so the database round-robin trigger makes the selection.
