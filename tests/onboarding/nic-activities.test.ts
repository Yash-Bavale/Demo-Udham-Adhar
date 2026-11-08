import { describe, expect, it } from "vitest";
import { parseNicActivities } from "../../src/lib/onboarding/nic-fill";

describe("additional NIC activities", () => {
  it("loads saved activities in their original order", () => {
    const activities = [
      { nic_2_digit: "30 — Transport", nic_4_digit: "3091 — Motorcycles", nic_5_digit: "30911 — Motorcycles", activity_type: "Manufacturing" },
      { nic_2_digit: "62 — Software", nic_4_digit: "6201 — Programming", nic_5_digit: "62011 — Programming", activity_type: "Services" },
    ];
    expect(parseNicActivities(JSON.stringify(activities))).toEqual(activities);
  });

  it("ignores malformed and mismatched NIC codes", () => {
    expect(parseNicActivities("not JSON")).toEqual([]);
    expect(parseNicActivities(JSON.stringify([
      { nic_2_digit: "30", nic_4_digit: "3091", nic_5_digit: "62011", activity_type: "Manufacturing" },
      { nic_2_digit: "62", nic_4_digit: "6201", nic_5_digit: "62011", activity_type: "Services" },
    ]))).toEqual([{ nic_2_digit: "62", nic_4_digit: "6201", nic_5_digit: "62011", activity_type: "Services" }]);
  });
});