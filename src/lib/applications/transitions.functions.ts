import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Canonical status lifecycle for an application.
 * Used by Phase D auto-transitions and by Phases E/F/G/H/I/J.
 */
export const APPLICATION_STATUSES = [
  "awaiting_payment",
  "payment_received",
  "details_pending",
  "form_submitted",
  "documents_pending",
  "documents_submitted",
  "under_review",
  "under_process",
  "certificate_uploaded",
  "certificate_ready",
  "completed",
  "on_hold",
  "rejected",
  "cancelled",
  "refund_pending",
  "refunded",
  "consultation_pending",
  "consultation_scheduled",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * Allowed forward transitions. Backwards moves are allowed only for
 * on_hold/cancelled/refund flows, which any status can move to.
 */
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

const Input = z.object({
  applicationId: z.string().uuid(),
  toStatus: z.enum(APPLICATION_STATUSES),
  reason: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  /** Skip the allow-list check (system cascades only). */
  force: z.boolean().optional(),
});

export const transitionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: app, error: fetchErr } = await supabase
      .from("applications")
      .select("id, application_status")
      .eq("id", data.applicationId)
      .maybeSingle();

    if (fetchErr) throw new Error(fetchErr.message);
    if (!app) throw new Error("Application not found");

    const from = app.application_status as ApplicationStatus;
    const to = data.toStatus;

    if (from === to) {
      return { ok: true, noop: true as const, from, to };
    }

    if (!data.force) {
      const allowed = ALLOWED[from] ?? [];
      const canMoveToTerminal = TERMINAL_OK.includes(to);
      if (!allowed.includes(to) && !canMoveToTerminal) {
        throw new Error(
          `Invalid transition: ${from} → ${to}. Allowed: ${allowed.join(", ") || "none"}`,
        );
      }
    }

    const { error: updErr } = await supabase
      .from("applications")
      .update({
        application_status: to,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.applicationId);
    if (updErr) throw new Error(updErr.message);

    await supabase.from("application_status_history").insert({
      application_id: data.applicationId,
      from_status: from,
      to_status: to,
      reason: data.reason ?? null,
      actor_id: userId,
      metadata: (data.metadata ?? {}) as never,
    });

    return { ok: true, noop: false as const, from, to };
  });

const HistoryInput = z.object({ applicationId: z.string().uuid() });

export const getStatusHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => HistoryInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("application_status_history")
      .select("id, from_status, to_status, reason, actor_id, metadata, created_at")
      .eq("application_id", data.applicationId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { history: rows ?? [] };
  });
