# Move email sending to ZeptoMail (no loss, no downtime)

## What happened
Zoho started refusing our mail at about 2:45 PM today with "unusual sending activity". Nothing in the app broke — the mailbox itself is being throttled because it is a personal-style inbox, not a bulk sending service. Since then 66 emails failed and kept retrying against a blocked mailbox.

## Goal
Keep every pending and failed email safe, switch sending to ZeptoMail, then send the saved backlog. Templates, schedules, order flows, support replies and the admin email screens stay exactly as they are.

## Step 1 — Protect the backlog now
- Stop the failed emails from burning through their retry attempts while Zoho is blocking, so none of them are dropped or dead-lettered.
- Hold them in a paused state that keeps the recipient, subject, content and order/lead links intact.
- Nothing is deleted, nothing is sent twice.

## Step 2 — Add ZeptoMail as a sending option
- Add a ZeptoMail sending path alongside the existing one.
- A single setting decides which service actually sends. Until it is switched, behaviour is unchanged.
- Everything else — templates, the queue, the every-minute processor, logs, the admin email screens, ticket threading and reply matching — is untouched.

## Step 3 — Switch over
- Once the ZeptoMail sending key and verified sender address are added, flip the setting to ZeptoMail.
- Send a single test email first and confirm it arrives.

## Step 4 — Release the backlog
- Release the paused emails back into the queue in controlled batches so the new service is not flooded.
- Confirm in the email records that each one shows as sent, with no duplicates.

## What I need from you
- The ZeptoMail sending key from your ZeptoMail account.
- The verified sender address you want emails to come from (for example help@businesshelpservices.com), and whether replies should keep going to the same inbox.

## Note on incoming mail
This change affects sending only. Incoming email, ticket creation and reply threading continue to work through the existing inbox exactly as today.
