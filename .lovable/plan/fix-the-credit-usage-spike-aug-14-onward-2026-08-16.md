# Fix the credit usage spike (Aug 14 onward)

## What's actually happening

The spike is not AI or app code. There have been zero AI Gateway calls in this window. The credit breakdown for Aug 1–16 is:

- Cloud compute large — 29.73 credits (the spike)
- Build mode messages — 14.20
- Project Monitoring — 10.40
- Everything else (worker days, realtime, egress, storage) — under 1.6 combined

The backend is currently running on a **Large** compute instance. Hourly compute billing on Large works out to roughly the 15 credits/day being observed, and it started when the backend was resumed/resized around Aug 14.

The load does not justify Large:

- Memory: 11% used
- Connections: 32 of 160 (low)
- Pool clients: 2 of 800 (low)
- Disk: 16% used
- 0 restarts since boot, no OOM

So the app is paying for roughly 9x the compute it uses.

## The fix

Resize the Lovable Cloud instance down from Large to a small size. Based on the current numbers, **Micro** is sufficient (Small if you want extra headroom for traffic growth). This is the single change that removes ~15 credits/day.

The resize is done through an approval card in chat; it takes a few minutes and briefly restarts the backend, so it's best done outside peak traffic.

## Optional second saving

Project Monitoring accounted for 10.40 credits this period. It's useful, but if you want the spend lower it can be turned down or off in project settings. No code change involved — say the word and I'll point you to it.

## What will NOT change

No application code, schema, RLS, or function changes are needed. Nothing in the app is looping, leaking, or over-querying; the rolled-back-transaction counter is normal for this workload and there is no runaway query pattern in the health snapshot.

## Steps

1. Confirm the target size (Micro recommended, Small for headroom).
2. Run the resize and approve the card.
3. Re-check database health after the resize (memory, connections) to confirm the smaller instance is comfortable.
4. Verify next-day credit usage drops back to the sub-1 credit/day range.
