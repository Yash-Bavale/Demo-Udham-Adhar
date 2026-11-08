import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { encryptSecret, decryptSecret, validateKey } from "@/lib/telephony/telephony-crypto.server";
import { webRtcAccess, WEBRTC_CONFIG_NAMES, SHARED_CONFIG_NAMES, LEGACY_ENV_USER_IDS } from "@/lib/telephony/callerdesk-webrtc.config";
import { resolveSession, type AccountRow } from "@/lib/telephony/callerdesk-webrtc.server";
import { pickWebRtcCandidate } from "@/lib/telephony/callerdesk.server";

const KEY = "k".repeat(40) + "Z9";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const SID = LEGACY_ENV_USER_IDS[0];
const val = (n: string) => n === "CALLERDESK_WS_PORT" ? "5000" : n === "CALLERDESK_WS_PATH" ? "/ws" : `${n.toLowerCase()}`;
const shared = Object.fromEntries(SHARED_CONFIG_NAMES.map((n) => [n, val(n)]));
const full = Object.fromEntries(WEBRTC_CONFIG_NAMES.map((n) => [n, val(n)]));
const row = async (id: string, over: Partial<AccountRow> = {}): Promise<AccountRow> => ({
  employee_id: id, status: "active", sip_username: "9000000001", display_name: "Agent", member_id: null,
  sip_password_ciphertext: await encryptSecret("pw-of-" + id, id, KEY), ...over,
});

describe("credential encryption", () => {
  it("round-trips and uses a fresh IV each time", async () => {
    const a = await encryptSecret("s3cret", A, KEY), b = await encryptSecret("s3cret", A, KEY);
    expect(a).not.toBe(b);
    expect(a).not.toContain("s3cret");
    expect(await decryptSecret(a, A, KEY)).toBe("s3cret");
  });
  it("detects tampering", async () => {
    const [v, iv, ct] = (await encryptSecret("s3cret", A, KEY)).split(".");
    const flipped = ct.slice(0, -2) + (ct.at(-2) === "A" ? "B" : "A") + ct.at(-1);
    await expect(decryptSecret(`${v}.${iv}.${flipped}`, A, KEY)).rejects.toThrow("could not be decrypted");
  });
  it("refuses another employee's ciphertext", async () => {
    await expect(decryptSecret(await encryptSecret("s3cret", A, KEY), B, KEY)).rejects.toThrow();
  });
  it("refuses a wrong key", async () => {
    await expect(decryptSecret(await encryptSecret("s3cret", A, KEY), A, "x".repeat(40))).rejects.toThrow();
  });
  it("fails safely when the key is missing or invalid", async () => {
    expect(() => validateKey(undefined)).toThrow("not configured");
    expect(() => validateKey("short")).toThrow("invalid");
    await expect(encryptSecret("s3cret", A, "")).rejects.toThrow("not configured");
  });
});

describe("per-employee access", () => {
  const meta = (status: "active" | "disabled" | "unprovisioned", hasSecret = true) => ({ status, sipUsername: "9000000001", displayName: "A", hasSecret });
  it("employee without an account is not authorised", () => {
    expect(webRtcAccess({ userId: A, account: null, enabledFlag: "true", env: full }).reason).toBe("no_account");
  });
  it("disabled and unprovisioned accounts cannot register", () => {
    expect(webRtcAccess({ userId: A, account: meta("disabled"), enabledFlag: "true", env: shared }).reason).toBe("disabled");
    expect(webRtcAccess({ userId: A, account: meta("unprovisioned"), enabledFlag: "true", env: shared }).reason).toBe("unprovisioned");
    expect(webRtcAccess({ userId: A, account: meta("active", false), enabledFlag: "true", env: shared }).reason).toBe("unprovisioned");
  });
  it("active account registers with only shared server settings", () => {
    expect(webRtcAccess({ userId: A, account: meta("active"), enabledFlag: "true", env: shared }).canRegister).toBe(true);
  });
  it("feature flag still switches everyone off", () => {
    expect(webRtcAccess({ userId: A, account: meta("active"), enabledFlag: "false", env: shared }).reason).toBe("flag_off");
  });
  it("Sid keeps the legacy env login only until his vault row exists", () => {
    expect(webRtcAccess({ userId: SID, account: null, enabledFlag: "true", env: full }).source).toBe("legacy");
    expect(webRtcAccess({ userId: SID, account: meta("disabled"), enabledFlag: "true", env: full }).canRegister).toBe(false);
  });
});

describe("session resolution", () => {
  beforeEach(() => vi.stubEnv("CALLERDESK_WEBRTC_ENABLED", "true"));
  it("returns each employee's own password", async () => {
    expect((await resolveSession(A, await row(A), shared, KEY)).password).toBe("pw-of-" + A);
    expect((await resolveSession(B, await row(B), shared, KEY)).password).toBe("pw-of-" + B);
  });
  it("never releases a row that belongs to someone else", async () => {
    await expect(resolveSession(B, await row(A), shared, KEY)).rejects.toThrow();
  });
  it("legacy rollback uses env credentials for Sid only", async () => {
    vi.stubEnv("CALLERDESK_WEBRTC_ENABLED", "true");
    expect((await resolveSession(SID, null, full, KEY)).extension).toBe("callerdesk_sip_extension");
    await expect(resolveSession(A, null, full, KEY)).rejects.toThrow("no_account");
  });
  afterEach(() => vi.unstubAllEnvs());
});

describe("browser call correlation", () => {
  it("adopts exactly one pending browser call", () => {
    expect(pickWebRtcCandidate([{ call_id: "webrtc:1", provider_uuid: null }])?.call_id).toBe("webrtc:1");
  });
  it("does not guess when two employees dialled the same customer", () => {
    expect(pickWebRtcCandidate([{ call_id: "webrtc:1", provider_uuid: null }, { call_id: "webrtc:2", provider_uuid: null }])).toBeNull();
  });
  it("ignores calls already matched or not from the browser", () => {
    expect(pickWebRtcCandidate([{ call_id: "webrtc:1", provider_uuid: "sid" }, { call_id: "556", provider_uuid: null }])).toBeNull();
  });
});
