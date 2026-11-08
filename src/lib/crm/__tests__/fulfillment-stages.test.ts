import { describe, expect, it } from "vitest";
import {
  FULFILLMENT_STAGES,
  FULFILLMENT_CODE,
  FULFILLMENT_LABEL,
  FULFILLMENT_TRANSITIONS,
  getAllowedFulfillmentTransitions,
  labelForFulfillment,
} from "@/lib/crm/fulfillment-transitions";

describe("S01–S12 fulfillment catalog", () => {
  it("exposes all 12 canonical stages in order", () => {
    expect(FULFILLMENT_STAGES).toEqual([
      "order_received",
      "awaiting_customer_form",
      "waiting_for_customer_submission",
      "form_submitted",
      "technical_delay",
      "customer_delay",
      "government_processing",
      "consultation_completed",
      "application_approved",
      "application_rejected",
      "order_completed",
      "order_closed",
    ]);
  });

  it("assigns S01…S12 codes to each canonical stage", () => {
    FULFILLMENT_STAGES.forEach((s, idx) => {
      expect(FULFILLMENT_CODE[s]).toBe(`S${String(idx + 1).padStart(2, "0")}`);
    });
  });

  it("labels every stage", () => {
    for (const s of FULFILLMENT_STAGES) {
      expect(FULFILLMENT_LABEL[s]).toBeTruthy();
    }
  });

  it("Form Submitted (S04) is the fan-out hub", () => {
    const nexts = new Set(getAllowedFulfillmentTransitions("form_submitted"));
    for (const target of [
      "technical_delay", "customer_delay", "government_processing",
      "consultation_completed", "application_approved",
      "application_rejected", "order_completed", "order_closed",
    ] as const) {
      expect(nexts.has(target)).toBe(true);
    }
  });

  it("delay stages resume back to S04 Form Submitted", () => {
    expect(FULFILLMENT_TRANSITIONS.technical_delay).toContain("form_submitted");
    expect(FULFILLMENT_TRANSITIONS.customer_delay).toContain("form_submitted");
  });

  it("terminal S11/S12 have no forward moves", () => {
    expect(FULFILLMENT_TRANSITIONS.order_completed).toEqual([]);
    expect(FULFILLMENT_TRANSITIONS.order_closed).toEqual([]);
  });

  it("labelForFulfillment resolves canonical + legacy values", () => {
    expect(labelForFulfillment("order_received")).toBe("Incomplete Form");
    expect(labelForFulfillment("certificate_rejected")).toContain("Rejected");
    expect(labelForFulfillment(null)).toBe("—");
  });
});
