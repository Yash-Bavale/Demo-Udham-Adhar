# CallerDesk implementation audit — 23 October 2026

## Verification boundary

No production call placed, number changed, route activated, or SIP credential revealed. The only provider request was read-only `getmemberlist_V2`. A successful compile or mocked test is not proof of audible two-way audio.

## Phase 1 status

| Area | Status | Evidence |
|---|---|---|
| CallerDesk API connectivity | FAIL | Sandbox `getmemberlist_V2`: HTTP 200, provider refused; response categorized as inactive account. This tests sandbox credentials, not published credentials. New authenticated Check API control tests the running CRM environment. |
| SIP registration | BLOCKED BY PROVIDER CONFIGURATION | Last stored `REGISTER_SUCCESS` on 13 October; no fresh workstation registration verified. `callerdesk-webrtc.engine.ts:start`, `callerdesk-webrtc.functions.ts:getWebRtcSession`. |
| Outbound call setup | BLOCKED BY PROVIDER CONFIGURATION | User reports successful dialing; latest stored diagnostics instead show a 403 rejection, not a connected call. `dial`, `callerDeskClickToCall`. |
| Two-way audio / quality | FAIL | User observed one-way audio. No `MEDIA_PROBE` records in database; therefore failing RTP/playback layer cannot yet be identified. `summarizeSdp`, `summarizeStats`, `watchPeer`. |
| Incoming INVITE, answer/reject, busy | BLOCKED BY PROVIDER CONFIGURATION | Implemented `onInvite`, `answer`, `reject`; requires CallerDesk routing the DID to the registered SIP agent. No live incoming test. |
| Mute, DTMF, hangup | BLOCKED BY PROVIDER CONFIGURATION | Existing engine controls; mocked regression coverage added. Audible/live behavior still unverified. |
| Business DID and IVR journey | BLOCKED BY PROVIDER CONFIGURATION | CallerDesk panel setup documented; no current account journey or DID verified. |
| Greeting / menu / routing / queues | NOT IMPLEMENTED | No provider configuration calls in existing repository; IVR drafts now persisted but do not execute or configure routing. |
| Hours / after-hours / retries / timeout / fallback | NOT IMPLEMENTED | Validated draft fields available; not connected to provider execution. Actual provider support for each setting needs confirmation. |
| Authenticated webhook parsing/enrichment | PASS | `verifyCallerDesk`, webhook `handle`, `reportEnrichment`; regression tests cover authentication and parsing helpers. This is code evidence, not production delivery proof. |
| Concurrent/out-of-order event processing | FAIL | Ranking prevents most sequential regressions, but separate read/write operations do not guarantee atomic ordering under concurrent delivery or correlation when both IDs vary. No concurrency claim. |
| Recordings / talk duration / timestamps | BLOCKED BY PROVIDER CONFIGURATION | 25 stored calls, 15 recording URLs; latest stored call 8 October. Late report enrichment exists, actual TalkDuration now corrects prior total duration. Fresh delivery unverified. |
| Caller / order matching | PASS | `phone.server.ts:dbLookup` matches existing records read-only; webhook distinguishes customer association from inbound answering employee. |
| Employee association | BLOCKED BY PROVIDER CONFIGURATION | Inbound DialWhomNumber matched to staff mobile; no longer assigns inbound call to customer/order owner. Requires matching provider agent field. |
| Call history / disposition / live calls | PASS | `calls.functions.ts`, `TelephonyPanel`, `/admin/live-calls`; real recent calls are needed for end-to-end validation. Supervisor controls remain disabled. |
| IVR administration | PASS | Admin-only validated CRM draft save/read, optimistic revision check, explicit not-applied status. No provider synchronization claim. |
| Active Smartflo dependencies | PASS | Only compatibility field `profiles.smartflo_agent_id` and historical references retained. Active calling uses CallerDesk only. |
| VPN / media recovery | BLOCKED BY PROVIDER CONFIGURATION | ICE and transport errors surfaced; manual reconnect exposed and prior transport cleaned up. No fresh VPN interruption test. |
| Preview vs published configuration | BLOCKED BY PROVIDER CONFIGURATION | Build scripts use 6 GB heap; generated auth attachment preserved. Secret names present in sandbox; published values and live routes not independently verified. |

## Verified provider documentation

- https://docs.callerdesk.io/setup-ivr-journey/ — select business number and routing strategy in CallerDesk panel; missed-call, welcome-sound, direct, DTMF and voicemail routing described.
- https://api.callerdesk.io/ and https://docs.callerdesk.io/api-reference/ — reviewed public material does not establish an API for applying IVR configuration.
- https://docs.callerdesk.io/how-does-callerdesk-work/ — product-level IVR/time-routing capability descriptions are not an API contract.

## Code-level work

- `ivr.config.ts`, `ivr.functions.ts`, `IvrSettings.tsx`: validated admin-only draft management, safe provider account check, save conflicts, honest provider status. No invented routing destinations; timeout/retry values are editable planning defaults, not verified account settings. Audio fields accept references only; no audio was invented or uploaded.
- `admin.live-calls.tsx`: IVR administration alongside existing calls.
- `callerdesk-webrtc.config.ts` / `.server.ts`: editable member mappings no longer grant SIP credentials; existing CRM test-user allowlist remains. Updated historical member constant to supplied ID 122354; narrowed secret fields without non-null assertions.
- `callerdesk-webrtc.engine.ts`: serializes connect attempts, cleans prior transport, stops media sampling on disconnect, retries blocked playback via explicit user action, logs incoming/answer/reject/busy events, catches inbound answer failures.
- `WebRtcPhone.tsx`: Enable call audio recovery and manual reconnect after transport loss.
- `WebRtcDiagnostics.tsx` / `webrtc-diag.functions.ts`: show safe media detail, redact current known secrets and full numbers before persistence; detect insert failure.
- `callerdesk.server.ts` / webhook: live NOANSWER no longer counts as answered; reject unknown new-call direction rather than invent inbound direction; don't assign inbound employee from order ownership; avoid fabricated historical answer time; prefer authoritative talk duration in late reports; remove body token before logging field names.
- Existing telephony tests plus new `ivr.test.ts`: regression checks for changed validation, authorization, playback, controls, transport cleanup, status and duration rules.
- Migration `drizzle/migrations/0034_callerdesk_ivr_drafts.sql`: one admin-protected draft table, grants, RLS, revision and not-applied marker. No historical call changes.

## Required provider actions and evidence

1. Verify the new account's API auth code is active: run Check API in CRM. Sandbox lookup currently reports inactive; do not assume published credentials match.
2. In CallerDesk panel, confirm the real business DID and review the existing IVR journey before any changes. Obtain explicit approval for live routing changes.
3. Supply approved greeting/menu/after-hours audio, menu key-to-destination mapping, real business hours, queues, and safe fallback. The CRM draft is not live configuration.
4. Ask CallerDesk for exact documented API endpoints, authentication, request/response schemas and field support for greeting/menu/queue/hours/retries/fallback if CRM synchronization is required. Until then configure only in CallerDesk's panel and retain CRM draft as a reference.
5. Confirm the selected agent destination routes incoming calls to the SIP username rather than SIM/click-to-call only. Confirm account permissions for inbound/outbound WebRTC.
6. Confirm Live Call and final Call Report callbacks use the existing `/api/public/telephony/callerdesk/events` endpoint and existing secret token. Request actual sanitized payloads for Direction, CallSid, Campid, DialWhomNumber, EndTime, TalkDuration and CallRecordingUrl; IVR choice/event fields are not yet documented or stored.

## Environment names only

`CALLERDESK_AUTHCODE`, `CALLERDESK_DESKPHONE`, `CALLERDESK_WEBHOOK_TOKEN`, `CALLERDESK_WEBRTC_ENABLED`, `CALLERDESK_ASTERISK_HOST`, `CALLERDESK_WS_PORT`, `CALLERDESK_WS_PATH`, `CALLERDESK_SIP_DOMAIN`, `CALLERDESK_SIP_EXTENSION`, `CALLERDESK_SIP_PASSWORD`, `CALLERDESK_DISPLAY_NAME`.

All names were present in the sandbox; presence is not validity or proof of published configuration. No new telephony secrets requested.

## Exact manual live tests

Use the authorized Help account, connected FortiClient VPN and a headset; refresh before connecting. Obtain approval before dialing production numbers.

1. Register: expect Ready and one fresh REGISTER_SUCCESS.
2. Approved outbound call to a different mobile: alternate speaking for 20 seconds. Both participants must confirm audible speech. Read MEDIA_SDP, REMOTE_TRACK, MEDIA_PROBE and MEDIA_FINAL. Increasing received packets plus audio level distinguish reception from playback; zero packets alone requires provider/network corroboration.
3. If playback is blocked, press Enable call audio and verify AUDIO_PLAYING. This fixes only browser playback rejection, not missing RTP.
4. Mute/unmute: customer must lose/recover employee audio. Test agreed DTMF destination. Hang up from each end separately.
5. Incoming approved DID call: greeting, each configured key, correct agent, Answer and two-way audio; separate Reject and second-call/busy tests.
6. Test invalid input/no input, retry limits, no-answer, unavailable queue, fallback and after-hours with the provider-approved journey; ensure final termination without loops.
7. Inspect CRM call history: one row, correct caller/direction/customer/employee, final talk duration and supplied recording URL. Replay a sanitized report in a non-production test harness, not against a live customer record.
8. Disconnect/reconnect VPN while idle, then during an approved test call; verify visible error, released microphone, explicit reconnect and a subsequent successful call.

## Still not complete

No live activation, two-way audio confirmation, inbound routing execution, provider synchronization, IVR event ingestion or concurrent webhook transaction guarantee. No second phone system or infrastructure introduced.

## Actual verification results

- `bunx vitest run tests/telephony`: 4 files, **55 tests passed**.
- `bunx vitest run`: 15 files, **190 tests passed**. Existing diagnostic tests printed customer data into the sandbox log; that data is not included in this report or chat.
- Latest harness build entry: **build OK** (23 October 05:02:33 UTC). Separate TypeScript checks were not manually run; the harness controls app compilation.
- Authenticated browser at `/admin/live-calls`: IVR fields rendered; **Check API returned “CallerDesk reports that this API account is inactive.”** This corroborates the sandbox request in the running preview environment, but still does not verify published credentials.
- Saved the initial **disabled, empty draft only**, then reloaded it through the UI. Database readback: revision 1, `sync_status=not_applied`. No live routing changed. Screenshot visually confirmed fields and states; **zero browser page errors**.
- Remaining production activation and VPN/two-way audio checks require the provider and an approved real workstation call; these were not attempted.