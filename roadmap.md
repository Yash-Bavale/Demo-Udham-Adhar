# Roadmap

- [x] Fix Cashfree checkout availability for websites without a ready explicit merchant-account mapping — 33 tests passed; existing account selectors verified signed-in; no live payment or publishing

- [x] Fix AP-2026-011133 ticket restart visibility — 20 tests pass; signed-in Hot Orders, Need Action, and Zeenat assignee-filtered list verified; publish pending

- [x] Audit existing CallerDesk API, IVR, browser media, webhooks and deployment; implement safe confirmed gaps (190 tests pass; authorised draft save/read verified)
- [ ] Apply IVR settings to CallerDesk — blocked: verified provider configuration API and approved real routing settings required
- [ ] Verify real IVR routing and two-way browser audio — blocked until provider settings and authorised VPN workstation tests

- [x] Match Complete Service reference colors, sizing, upload and send states; verify on the order screen (live delivery intentionally not exercised)

- [x] Match the Complete Service dialog to the supplied UI while preserving real upload and sending states (destructive live send intentionally not exercised)
- [x] Visually separate and highlight customer-facing form sections as shown in the form preview
- [x] Use the New Udyam NIC search and Add Activity as the default NIC field format, including Update Udyam Certificate additional updates
- [x] Add a government-style NIC activity list: first selection saved automatically, Add Activity saves further selections, visible to staff
- [x] Make the main NIC search clearly labeled and allow numbered 2-, 4-, and 5-digit selections without inventing narrower codes
- [x] Add a single government-style NIC activity search above the 2/4/5-digit fields and autofill them on selection
- [x] Preserve all failed emails (74 held safely, no loss, no duplicates)
- [x] Add ZeptoMail as a sending option (templates, queue, schedules untouched)
- [ ] Switch sending to ZeptoMail — blocked: need ZeptoMail send token + verified sender address
- [ ] Release the 74 held emails in batches after the switch and verify delivery
- [x] Smartflo removed; CallerDesk is the only telephony provider. Pending: publish, live webhook + test call verification, delete old SMARTFLO_* secrets after sign-off, WebRTC credentials from CallerDesk
- [x] Rebuild dispute PDF output as exact selected email printouts plus selected invoice, without the summary/evidence cover or evidence branding
- [x] Customer Document Merge (service toggle + Merge PDF on order)

- [x] Database optimization: notifications index bloat fixed (60 MB → 184 kB); lead-insert speed still to review

## Customer link privacy
- [x] Containment: audio address limited to reminder sounds; conversions fire only on server-verified payment once per order; customer data needs a secure link
- [x] P1: secure-link store, scoped keys (checkout vs form), expiry, revocation, denied-attempt log and rate limit; all customer server functions protected
- [x] P2: customer pages, emails (auto), staff copy buttons, partner APIs, staff-made links migrated
- [ ] P2: live PayU / CCAvenue / Cashfree return test — blocked: needs a real payment on the preview/published site
- [ ] P3: publish + watch denied-attempt log for 48h — waits on owner publishing
