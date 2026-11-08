import { describe, it, expect, afterEach, vi } from "vitest";
import {
  parseMemberList, resolveMemberId, campaignId, callSid, mapCallerDeskStatus, verifyCallerDesk, callerDeskClickToCall, callerDeskDirection, reportEnrichment,
} from "@/lib/telephony/callerdesk.server";

const LIVE = { type: "success", getmember: [{ member_id: "122142", member_num: "09561396866", member_name: "Sid" }] };

describe("CallerDesk member lookup", () => {
  it("reads getmember and resolves Sid to 122142 by mobile", () => {
    expect(resolveMemberId(parseMemberList(LIVE), "9561396866", null)).toBe("122142");
  });
  it("ignores the old member/data/members keys", () => {
    expect(parseMemberList({ type: "success", member: LIVE.getmember })).toEqual([]);
  });
  it("does not give Sid's id to another employee", () => {
    expect(resolveMemberId(parseMemberList(LIVE), "9876543210", null)).toBeNull();
  });
  it("rejects an explicit mapping that CallerDesk does not know", () => {
    expect(resolveMemberId(parseMemberList(LIVE), "9561396866", "999")).toBeNull();
  });
});

describe("CallerDesk click-to-call", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("uses click_to_call_v4 with member_id and never v2", async () => {
    vi.stubEnv("CALLERDESK_AUTHCODE", "x"); vi.stubEnv("CALLERDESK_DESKPHONE", "y");
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      urls.push(String(u));
      return new Response(JSON.stringify(String(u).includes("getmemberlist") ? LIVE : { type: "success", campid: 555 }), { status: 200 });
    }));
    const r = await callerDeskClickToCall("9561396866", null, "9767100075");
    expect(r).toEqual({ campid: "555", memberId: "122142" });
    expect(urls[1]).toContain("click_to_call_v4");
    expect(urls[1]).toContain("member_id=122142");
    expect(urls.some((u) => u.includes("click_to_call_v2"))).toBe(false);
  });
  it("fails clearly when no member matches (no fallback call)", async () => {
    vi.stubEnv("CALLERDESK_AUTHCODE", "x"); vi.stubEnv("CALLERDESK_DESKPHONE", "y");
    const f = vi.fn(async () => new Response(JSON.stringify(LIVE), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await expect(callerDeskClickToCall("9876543210", null, "9767100075")).rejects.toThrow(/No CallerDesk member/);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("fails when CallerDesk refuses the call", async () => {
    vi.stubEnv("CALLERDESK_AUTHCODE", "x"); vi.stubEnv("CALLERDESK_DESKPHONE", "y");
    vi.stubGlobal("fetch", vi.fn(async (u: string) => new Response(JSON.stringify(String(u).includes("getmemberlist") ? LIVE : { type: "error", message: "Low balance" }), { status: 200 })));
    await expect(callerDeskClickToCall("9561396866", null, "9767100075")).rejects.toThrow("Call not started: Low balance");
  });
});

describe("CallerDesk webhook parsing", () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each([["Campid"], ["campid"], ["camp_id"]])("reads campaign id from %s", (k) => {
    expect(campaignId({ [k]: "56431323" })).toBe("56431323");
  });
  it("reads CallSid", () => { expect(callSid({ CallSid: "abc" })).toBe("abc"); });
  it("does not treat NOANSWER as a live answered event", () => { expect(mapCallerDeskStatus({ Status: "NOANSWER" })).toBe("ringing"); });
  it("requires explicit known inbound or outbound direction", () => {
    expect(callerDeskDirection({ Direction: "IBD" })).toBe("inbound");
    expect(callerDeskDirection({ Direction: "OBD" })).toBe("outbound");
    expect(callerDeskDirection({ Direction: "unknown" })).toBeNull();
  });
  it("does not persist negative or invalid call duration", () => {
    expect(reportEnrichment({}, { TalkDuration: "-1" })).not.toHaveProperty("duration_seconds");
    expect(reportEnrichment({}, { TalkDuration: "invalid" })).not.toHaveProperty("duration_seconds");
  });
  it("live payload is ringing, answered report is ended, unanswered report is missed", () => {
    expect(mapCallerDeskStatus({ Status: "Ringing" })).toBe("ringing");
    expect(mapCallerDeskStatus({ Status: "ANSWER", EndTime: "2026-10-10 11:00:00", TalkDuration: "30" })).toBe("ended");
    expect(mapCallerDeskStatus({ Status: "NOANSWER", EndTime: "2026-10-10 11:00:00", TalkDuration: "0" })).toBe("missed");
  });
  it("rejects a wrong webhook token", () => {
    vi.stubEnv("CALLERDESK_WEBHOOK_TOKEN", "right-token");
    expect(verifyCallerDesk(new Request("https://x/e?token=wrong-token"))).toBe(false);
    expect(verifyCallerDesk(new Request("https://x/e?token=right-token"))).toBe(true);
  });
});

describe("CallerDesk webhook auth diagnostics", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  const logs = () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    return () => spy.mock.calls.map((c) => String(c[0]));
  };
  it("missing token: rejected, logs no-token from none", () => {
    vi.stubEnv("CALLERDESK_WEBHOOK_TOKEN", "right-token");
    const get = logs();
    expect(verifyCallerDesk(new Request("https://x/e?SourceNumber=9876543210"))).toBe(false);
    const e = JSON.parse(get()[0]);
    expect(e).toEqual({ event: "callerdesk_auth_failure", token_supplied: false, received_length: 0, expected_length: 11, source: "none" });
  });
  it("incorrect token: rejected, logs lengths only, never value/URL/phone", () => {
    vi.stubEnv("CALLERDESK_WEBHOOK_TOKEN", "right-token");
    const get = logs();
    expect(verifyCallerDesk(new Request("https://x/e?token=wrong&SourceNumber=9876543210"))).toBe(false);
    const line = get()[0];
    expect(JSON.parse(line)).toMatchObject({ token_supplied: true, received_length: 5, expected_length: 11, source: "query" });
    expect(line).not.toContain("wrong");
    expect(line).not.toContain("right-token");
    expect(line).not.toContain("9876543210");
    expect(line).not.toContain("https://");
  });
  it("header token is reported as header", () => {
    vi.stubEnv("CALLERDESK_WEBHOOK_TOKEN", "right-token");
    const get = logs();
    expect(verifyCallerDesk(new Request("https://x/e", { headers: { "x-callerdesk-token": "bad" } }))).toBe(false);
    expect(JSON.parse(get()[0]).source).toBe("header");
  });
  it("whitespace-padded token is rejected (no trimming)", () => {
    vi.stubEnv("CALLERDESK_WEBHOOK_TOKEN", "right-token");
    const get = logs();
    expect(verifyCallerDesk(new Request("https://x/e?token=%20right-token%20"))).toBe(false);
    expect(JSON.parse(get()[0]).received_length).toBe(13);
  });
  it("valid token: accepted with no failure log", () => {
    vi.stubEnv("CALLERDESK_WEBHOOK_TOKEN", "right-token");
    const get = logs();
    expect(verifyCallerDesk(new Request("https://x/e?token=right-token"))).toBe(true);
    expect(get()).toEqual([]);
  });
  it("unconfigured secret: rejected with null expected length", () => {
    vi.stubEnv("CALLERDESK_WEBHOOK_TOKEN", "");
    const get = logs();
    expect(verifyCallerDesk(new Request("https://x/e?token=abc"))).toBe(false);
    expect(JSON.parse(get()[0]).expected_length).toBeNull();
  });
});
