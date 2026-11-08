// Server-only system transition helper for backend cascades (webhooks, cron, etc.)
// Unlike `transitionStatus` server fn, this does not require an authenticated user.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { APPLICATION_STATUSES, type ApplicationStatus } from "./transitions.functions";

const ALLOWED: Record<ApplicationStatus, ApplicationStatus[]> = {
  awaiting_payment: ["payment_received", "cancelled"],
  payment_received: ["details_pending", "consultation_pending"],
  details_pending: ["form_submitted", "on_hold"],
  form_submitted: ["documents_pending", "under_review", "completed"],
  documents_pending: ["documents_submitted", "on_hold"],
  documents_submitted: ["under_review"],
  under_review: ["under_process", "rejected", "on_hold"],
  under_process: ["certificate_uploaded", "rejected", "on_hold"],
  certificate_uploaded: ["certificate_ready"],
  certificate_ready: ["completed"],
  completed: [],
  on_hold: ["under_review", "under_process", "cancelled"],
  rejected: ["refund_pending"],
  cancelled: ["refund_pending"],
  refund_pending: ["refunded"],
  refunded: [],
  consultation_pending: ["consultation_scheduled", "cancelled"],
  consultation_scheduled: ["details_pending", "completed"],
};

const TERMINAL_OK: ApplicationStatus[] = ["on_hold", "cancelled", "refund_pending"];

export type SystemTransitionInput = {
  applicationId: string;
  toStatus: ApplicationStatus;
  reason?: string;
  metadata?: Record<string, unknown>;
  actorId?: string | null;
  force?: boolean;
};

export type SystemTransitionResult =
  | { ok: true; noop: true; from: ApplicationStatus; to: ApplicationStatus }
  | { ok: true; noop: false; from: ApplicationStatus; to: ApplicationStatus }
  | { ok: false; reason: string };

/**
 * System-level status transition. Bypasses user auth (uses service role).
 * Returns a result instead of throwing so callers (webhooks) can decide.
 */
export async function transitionStatusSystem(
  input: SystemTransitionInput,
): Promise<SystemTransitionResult> {
  if (!APPLICATION_STATUSES.includes(input.toStatus)) {
    return { ok: false, reason: `Unknown status: ${input.toStatus}` };
  }

  const { data: app, error: fetchErr } = await supabaseAdmin
    .from("applications")
    .select("id, application_status")
    .eq("id", input.applicationId)
    .maybeSingle();
  if (fetchErr) return { ok: false, reason: fetchErr.message };
  if (!app) return { ok: false, reason: "Application not found" };

  const from = app.application_status as ApplicationStatus;
  const to = input.toStatus;
  if (from === to) return { ok: true, noop: true, from, to };

  if (!input.force) {
    const allowed = ALLOWED[from] ?? [];
    if (!allowed.includes(to) && !TERMINAL_OK.includes(to)) {
      return { ok: false, reason: `Invalid transition ${from} → ${to}` };
    }
  }

  const { error: updErr } = await supabaseAdmin
    .from("applications")
    .update({ application_status: to, updated_at: new Date().toISOString() })
    .eq("id", input.applicationId);
  if (updErr) return { ok: false, reason: updErr.message };

  await supabaseAdmin.from("application_status_history").insert({
    application_id: input.applicationId,
    from_status: from,
    to_status: to,
    reason: input.reason ?? null,
    actor_id: input.actorId ?? null,
    metadata: (input.metadata ?? {}) as never,
  });

  return { ok: true, noop: false, from, to };
}
