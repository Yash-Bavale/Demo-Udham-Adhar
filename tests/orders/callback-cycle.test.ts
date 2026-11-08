import { describe, expect, it } from "vitest";
import { hasCurrentCycleCompletion } from "../../src/lib/crm/callback-cycle";

describe("reopened order callback cycle", () => {
  const reopenedAt = "2026-10-27T07:06:37.133Z";
  const callback = { created_at: "2026-10-27T07:06:37.272Z" };
  it("does not hide AP-2026-011133 because of its earlier completed call", () => {
    expect(hasCurrentCycleCompletion(reopenedAt, callback, [{
      event_type: "callback_completed", created_at: "2026-10-27T06:02:52.688Z",
      note: "Call completed: Application Accepted",
    }], [{ status: "completed", scheduler_type: "our_side_reminder", created_at: "2026-09-25T07:33:24.261Z" }])).toBe(false);
  });
  it("recognizes completion after the new escalation", () => {
    expect(hasCurrentCycleCompletion(reopenedAt, callback, [{
      event_type: "callback_completed", created_at: "2026-10-27T07:10:00Z",
    }], [])).toBe(true);
  });
  it("recognizes a completed scheduler from the current cycle", () => {
    expect(hasCurrentCycleCompletion(reopenedAt, callback, [], [{
      status: "completed", scheduler_type: "our_side_reminder", created_at: "2026-10-27T07:06:37.272Z",
    }])).toBe(true);
  });
  it("keeps completion behavior for orders without a new cycle", () => {
    expect(hasCurrentCycleCompletion(null, null, [{
      event_type: "callback_completed", created_at: "2026-10-27T06:02:52.688Z",
    }], [])).toBe(true);
  });
});