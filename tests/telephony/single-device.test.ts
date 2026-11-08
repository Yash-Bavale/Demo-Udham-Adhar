import { describe, it, expect } from "vitest";
import { hasDuplicateRegistration } from "@/lib/telephony/callerdesk-webrtc.engine";

describe("single device per extension", () => {
  it("one signed-in device is not a duplicate", () => {
    expect(hasDuplicateRegistration(["<sip:09561396866@abc.invalid;transport=ws>;expires=600"])).toBe(false);
  });
  it("two different devices on the extension are a duplicate", () => {
    expect(hasDuplicateRegistration([
      "<sip:09561396866@abc.invalid;transport=ws>;expires=600",
      "<sip:09561396866@103.219.140.200:62523>;expires=120",
    ])).toBe(true);
  });
  it("two devices in one comma-joined header are a duplicate", () => {
    expect(hasDuplicateRegistration(["<sip:a@x.invalid>;expires=600, <sip:a@1.2.3.4:5060>;expires=60"])).toBe(true);
  });
  it("no contacts is not a duplicate", () => {
    expect(hasDuplicateRegistration([])).toBe(false);
  });
});
