import { describe, expect, it } from "vitest";
import { credsFromStored } from "@/lib/payments/cashfree-accounts";
import { encryptSecret, decryptSecret } from "@/lib/telephony/telephony-crypto.server";

const acct = { id: "a1", account_key: "GST_MID", is_legacy: false, is_active: true };
const KEY = "k".repeat(64);

describe("saved Cashfree merchant keys", () => {
  it("live keys use the live Cashfree address", () => {
    expect(credsFromStored(acct, { clientId: "id", clientSecret: "sec", mode: "production" }).apiUrl).toBe("https://api.cashfree.com/pg");
  });
  it("test keys use the sandbox address", () => {
    expect(credsFromStored(acct, { clientId: "id", clientSecret: "sec", mode: "sandbox" }).isProd).toBe(false);
  });
  it("empty keys are refused", () => {
    expect(() => credsFromStored(acct, { clientId: "", clientSecret: "sec", mode: "production" })).toThrow();
  });
  it("a saved secret cannot be read under another account", async () => {
    const blob = await encryptSecret("secret", "cashfree-account:a1", KEY);
    expect(await decryptSecret(blob, "cashfree-account:a1", KEY)).toBe("secret");
    await expect(decryptSecret(blob, "cashfree-account:a2", KEY)).rejects.toThrow();
  });
});
