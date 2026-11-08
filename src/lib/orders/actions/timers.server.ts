// Phase 2/4: consolidated workflow_timers helpers.
// All new timers (form-pending, customer-hold reminder, technical-hold reminder,
// awaiting-govt internal reminder) live here. Kept in `workflow_timers` so the
// existing workflow-tick cron is the single executor (see Phase 4).

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type TimerKind =
  | "form_pending_nudge_4h"
  | "form_pending_autoclose_8h"
  | "customer_hold_reminder"
  | "technical_hold_reminder"
  | "awaiting_govt_internal_reminder";

/** Arm (or replace) a workflow_timer for the given order. */
export async function armTimer(input: {
  applicationId: string;
  kind: TimerKind;
  firesInMinutes: number;
  recurring?: boolean;
  /** Only stored when `recurring` — used by the tick to re-arm. */
  intervalMinutes?: number;
  payload?: Record<string, unknown>;
  dedupKey?: string;
}) {
  const firesAt = new Date(Date.now() + input.firesInMinutes * 60_000).toISOString();
  // Cancel any prior active timer of same kind for this order (unique dedup key
  // handles it when provided; otherwise blanket cancel by kind).
  await supabaseAdmin
    .from("workflow_timers")
    .update({ status: "cancelled" })
    .eq("application_id", input.applicationId)
    .eq("kind", input.kind)
    .in("status", ["running", "paused"]);

  const { data, error } = await supabaseAdmin
    .from("workflow_timers")
    .insert({
      application_id: input.applicationId,
      kind: input.kind,
      status: "running",
      fires_at: firesAt,
      recurring: input.recurring ?? false,
      custom_interval_minutes: input.intervalMinutes ?? null,
      payload: input.payload ?? {},
      dedup_key: input.dedupKey ?? null,
    } as never)
    .select("id, fires_at")
    .single();
  if (error) throw new Error(`armTimer(${input.kind}): ${error.message}`);
  return data;
}

/** Cancel all active timers of one or more kinds for an order. */
export async function cancelTimers(applicationId: string, kinds?: TimerKind[]) {
  let q = supabaseAdmin
    .from("workflow_timers")
    .update({ status: "cancelled" })
    .eq("application_id", applicationId)
    .in("status", ["running", "paused"]);
  if (kinds && kinds.length > 0) q = q.in("kind", kinds);
  const { error } = await q;
  if (error) throw new Error(`cancelTimers: ${error.message}`);
}
