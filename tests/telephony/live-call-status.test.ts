import { describe, it, expect } from "vitest";
import { mapCallerDeskStatus } from "@/lib/telephony/callerdesk.server";

describe("CallerDesk live_call / call_report status", () => {
  it("live_call Status=Picked is answered", () => {
    expect(mapCallerDeskStatus({ type: "live_call", Status: "Picked", Direction: "IVR" })).toBe("answered");
  });
  it("live_call Status=Picked stays answered even if a duration field is present", () => {
    expect(mapCallerDeskStatus({ type: "live_call", Status: "Picked", CallDuration: "5" })).toBe("answered");
  });
  it("call_report CANCEL is missed", () => {
    expect(mapCallerDeskStatus({ type: "call_report", Status: "CANCEL", callstatus: "No Answer" })).toBe("missed");
  });
  it("call_report ANSWER is ended", () => {
    expect(mapCallerDeskStatus({ type: "call_report", Status: "ANSWER", TalkDuration: "7" })).toBe("ended");
  });
});
