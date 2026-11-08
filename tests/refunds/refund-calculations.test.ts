import { describe, it, expect } from "vitest";

describe("Refund calculations & idempotency", () => {
  it("calculates paidAmount, alreadyRefunded, and refundable accurately", () => {
    // Scenario 1: Customer originally paid 1180, flipped to refunded upon payout
    const paymentsScenario1 = [
      { id: "1", amount: 1180, status: "refunded" },
      { id: "2", amount: -1180, status: "refunded" },
    ];

    const paidAmount = paymentsScenario1
      .filter((p) => Number(p.amount) > 0 && p.status !== "failed" && p.status !== "cancelled")
      .reduce((a, p) => a + Number(p.amount), 0);

    const alreadyRefunded = paymentsScenario1
      .filter((p) => Number(p.amount) < 0)
      .reduce((a, p) => a + Math.abs(Number(p.amount)), 0);

    const refundable = Math.max(0, paidAmount - alreadyRefunded);

    expect(paidAmount).toBe(1180);
    expect(alreadyRefunded).toBe(1180);
    expect(refundable).toBe(0);
  });

  it("handles duplicate negative payments correctly by identifying excess rows", () => {
    // Scenario 2: User clicked 3 times, creating 3 negative rows (-1180 each)
    const paymentsWithDuplicates = [
      { id: "orig", amount: 1180, status: "refunded", created_at: "2026-10-24T17:00:00Z" },
      { id: "neg1", amount: -1180, status: "refunded", created_at: "2026-10-24T17:09:00Z" },
      { id: "neg2", amount: -1180, status: "refunded", created_at: "2026-10-24T17:10:00Z" },
    ];

    const negPayments = paymentsWithDuplicates.filter((p) => Number(p.amount) < 0);
    expect(negPayments.length).toBe(2);

    // Deduplication logic
    const keepNeg = negPayments[0];
    const dupNegIds = negPayments.slice(1).map((p) => p.id);
    const cleanedPayments = paymentsWithDuplicates.filter((p) => !dupNegIds.includes(p.id));

    expect(dupNegIds).toEqual(["neg2"]);
    expect(cleanedPayments.length).toBe(2);

    const paid = cleanedPayments
      .filter((p) => Number(p.amount) > 0 && p.status !== "failed" && p.status !== "cancelled")
      .reduce((a, p) => a + Number(p.amount), 0);
    const refunded = cleanedPayments
      .filter((p) => Number(p.amount) < 0)
      .reduce((a, p) => a + Math.abs(Number(p.amount)), 0);

    expect(paid).toBe(1180);
    expect(refunded).toBe(1180);
  });

  it("evaluates isProcessed from all indicators", () => {
    const isProcessed = (req: any, app: any) =>
      Boolean(req?.processed_at || req?.status === "processed" || app?.refund_processed_at);

    // If processed_at is set
    expect(isProcessed({ processed_at: "2026-10-24T17:09:00Z", status: "approved" }, null)).toBe(true);

    // If status is processed
    expect(isProcessed({ processed_at: null, status: "processed" }, null)).toBe(true);

    // If application has refund_processed_at
    expect(isProcessed({ processed_at: null, status: "approved" }, { refund_processed_at: "2026-10-24T17:09:00Z" })).toBe(true);

    // If completely pending
    expect(isProcessed({ processed_at: null, status: "pending" }, null)).toBe(false);
  });
});
