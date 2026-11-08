import { createFileRoute } from "@tanstack/react-router";

/**
 * CallerDesk call webhook (Live Call + Call Report payloads, configured in CallerDesk →
 * Webhook configuration with ?token=CALLERDESK_WEBHOOK_TOKEN). Writes to the shared
 * telephony_calls table with provider='callerdesk'; realtime pushes rows to the CRM call panel.
 */
const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const RANK: Record<string, number> = { ringing: 0, answered: 1, ended: 2, missed: 2 };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers });
const ts = (v: string | null) => { if (!v) return null; const d = new Date(v.replace(/n(?=\d{2}:)/, " ").replace(" ", "T") + "+05:30"); return isNaN(d.getTime()) ? null : d.toISOString(); };

async function handle(request: Request): Promise<Response> {
  const cd = await import("@/lib/telephony/callerdesk.server");
  if (!cd.verifyCallerDesk(request)) return json({ error: "unauthorized" }, 401);
  let input: Record<string, unknown>;
  try {
    const url = new URL(request.url);
    input = Object.fromEntries(url.searchParams);
    delete input.token;
    if (request.method === "POST") {
      const raw = await request.text();
      if (raw.length > 20_000) return json({ ok: false, error: "payload_too_large" }, 413);
      const ct = request.headers.get("content-type") ?? "";
      const parsed = ct.includes("json") ? (raw ? JSON.parse(raw) : {}) : Object.fromEntries(new URLSearchParams(raw));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ ok: false, error: "malformed_payload" }, 400);
      input = { ...input, ...parsed };
      delete input.token;
    }
  } catch {
    return json({ ok: false, error: "malformed_payload" }, 400);
  }

  try {
    const { normalizeIndianMobile, dbLookup } = await import("@/lib/telephony/phone.server");
    const { pick } = cd;
    const sid = cd.callSid(input);
    const campid = cd.campaignId(input);
    if (!sid && !campid) return json({ ok: false, error: "missing_call_id" }, 400);
    const direction = cd.callerDeskDirection(input);
    console.log(JSON.stringify({ event: "callerdesk_event_type", type: String(cd.pick(input, "type", "Type") ?? "none").slice(0, 20) }));
    const outbound = direction === "outbound";
    const status = cd.mapCallerDeskStatus(input);
    console.log(JSON.stringify({ event: "callerdesk_call_event", status, outbound, has_sid: !!sid, has_camp: !!campid, fields: Object.keys(input).sort() }));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    let existing: any = null;
    if (sid) ({ data: existing } = await db.from("telephony_calls").select("*").eq("call_id", sid).maybeSingle());
    if (!existing && campid) {
      ({ data: existing } = await db.from("telephony_calls").select("*").eq("provider", "callerdesk")
        .or(`ref_id.eq.${campid},call_id.eq.${campid}`).order("started_at", { ascending: false }).limit(1).maybeSingle());
    }
    if (!existing && direction === "outbound") {
      // Browser (WebRTC) calls are pre-recorded by the dialing employee; adopt that row when exactly one matches.
      const customer = normalizeIndianMobile(pick(input, "DestinationNumber", "DialWhomNumber"));
      if (customer) {
        const since = new Date(Date.now() - cd.WEBRTC_MATCH_WINDOW_MS).toISOString();
        const { data: cands } = await db.from("telephony_calls").select("*").eq("provider", "callerdesk")
          .like("call_id", "webrtc:%").is("provider_uuid", null).eq("called_number", customer).gte("started_at", since).limit(3);
        existing = cd.pickWebRtcCandidate(cands ?? []);
      }
    }
    if (!existing && direction === "inbound") {
      // Browser-answered inbound calls are recorded by the answering employee; adopt only an unambiguous single match.
      const customer = normalizeIndianMobile(pick(input, "SourceNumber"));
      if (customer) {
        const since = new Date(Date.now() - cd.WEBRTC_MATCH_WINDOW_MS).toISOString();
        const { data: cands } = await db.from("telephony_calls").select("*").eq("provider", "callerdesk").eq("direction", "inbound")
          .like("call_id", "webrtc:in:%").is("provider_uuid", null).eq("caller_number", customer).gte("started_at", since).limit(3);
        existing = cd.pickWebRtcCandidate(cands ?? []);
      }
    }
    if (!existing && !direction) return json({ ok: false, error: "unknown_direction" }, 400);
    if (existing && (RANK[existing.status] ?? -1) >= RANK[status]) {
      // A late final Call Report may still carry recording/duration/end time for an ended call.
      const enrich: Record<string, unknown> = (status === "ended" || status === "missed") ? cd.reportEnrichment(existing, input) : {};
      if (sid && String(existing.call_id).startsWith("webrtc:") && !existing.provider_uuid) {
        enrich.provider_uuid = sid;
        const { data: clash } = await db.from("telephony_calls").select("id").eq("call_id", sid).maybeSingle();
        if (!clash) enrich.call_id = sid;
      }
      if (!Object.keys(enrich).length) return json({ ok: true, duplicate: true });
      const { error } = await db.from("telephony_calls").update({ ...enrich, updated_at: new Date().toISOString() }).eq("id", existing.id);
      if (error) throw error;
      return json({ ok: true, enriched: Object.keys(enrich) });
    }

    const now = new Date().toISOString();
    const row: Record<string, unknown> = { status, last_event: status, updated_at: now };
    if (sid && (!existing || existing.call_id !== sid)) {
      // Only adopt CallSid as call_id when no other row already holds it.
      const { data: clash } = await db.from("telephony_calls").select("id").eq("call_id", sid).maybeSingle();
      if (!clash) row.call_id = sid;
      row.provider_uuid = sid;
    }
    if (!existing) {
      const customerRaw = outbound ? pick(input, "DestinationNumber", "DialWhomNumber") : pick(input, "SourceNumber");
      const mobile = normalizeIndianMobile(customerRaw);
      Object.assign(row, {
         provider: "callerdesk", direction, ref_id: campid,
        caller_number: outbound ? pick(input, "SourceNumber") : (mobile ?? customerRaw),
        called_number: outbound ? (mobile ?? customerRaw) : pick(input, "DestinationNumber"),
        started_at: ts(pick(input, "StartTime")) ?? now,
      });
      if (!row.call_id) row.call_id = campid ?? sid;
      if (mobile) {
        try {
          const m = await dbLookup(mobile);
          Object.assign(row, { customer_id: m.customerId, lead_id: m.leadId, application_id: m.applicationId });
          // An order owner is not evidence of who answered an inbound call.
          if (outbound) row.employee_id = m.employeeId;
        } catch { /* best-effort match */ }
      }
    }
    // Inbound: the answering agent becomes the employee when their number matches a staff mobile.
    const agent = normalizeIndianMobile(pick(input, "DialWhomNumber"));
    const agentEmail = pick(input, "agent_email", "AgentEmail")?.trim().toLowerCase() ?? null;
    if ((existing?.direction ?? direction) === "inbound") {
      let pid: string | null = null;
      if (agent) {
        row.agent_id = agent;
        const { data: p } = await db.from("profiles").select("id").ilike("mobile", `%${agent}`).limit(1).maybeSingle();
        pid = p?.id ?? null;
      }
      if (!pid && agent) {
        // Agent number may be a browser-phone SIP login rather than a staff mobile.
        const { data: accs } = await db.from("employee_telephony_accounts").select("employee_id")
          .eq("provider", "callerdesk").eq("status", "active").ilike("sip_username", `%${agent}`).limit(2);
        if (accs?.length === 1) pid = accs[0].employee_id;
      }
      if (!pid && agentEmail && /^[^\s@]+@[^\s@]+$/.test(agentEmail)) {
        const { data: p } = await db.from("profiles").select("id").eq("email", agentEmail).limit(2);
        if (p?.length === 1) pid = p[0].id;
      }
      if (pid) row.employee_id = pid;
      console.log(JSON.stringify({ event: "callerdesk_agent_match", by: pid ? (agent && !agentEmail ? "mobile" : "mobile_or_email") : "none", has_agent_email: !!agentEmail }));
    }
    if ((status === "answered" || status === "ended") && !existing?.answered_at) {
      const answeredAt = ts(pick(input, "LegB_Picked_time"));
      if (answeredAt || status === "answered") row.answered_at = answeredAt ?? now;
    }
    if (status === "ended" || status === "missed") {
      Object.assign(row, cd.reportEnrichment(existing ?? {}, input));
      if (!row.ended_at && !existing?.ended_at) row.ended_at = now;
    }
    const { error } = existing
      ? await db.from("telephony_calls").update(row).eq("id", existing.id)
      : await db.from("telephony_calls").upsert(row, { onConflict: "call_id" });
    if (error) throw error;
    return json({ ok: true });
  } catch (e) {
    console.log(JSON.stringify({ event: "callerdesk_call_event", error: (e as Error)?.message }));
    return json({ ok: false, error: "processing_failed" }, 500);
  }
}

export const Route = createFileRoute("/api/public/telephony/callerdesk/events")({
  server: { handlers: { POST: ({ request }) => handle(request), GET: ({ request }) => handle(request) } },
});
