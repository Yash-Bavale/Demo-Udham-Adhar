// Client-safe helpers that translate the workflow engine's raw rows
// (workflow_states, workflow_timers, workflow_automations) into the shape the
// admin order UI actually renders: journey node, done/blocked flags, chips,
// next-firing timer, running automations.
//
// No IO here — pure functions so any component can call them without hooks.

import type { WorkflowStage } from "./events";

export type JourneyNodeKey =
  | "lead"
  | "payment"
  | "consultation"
  | "form"
  | "docs"
  | "verification"
  | "govt"
  | "processing"
  | "completed";

/** Engine stage → single journey node. */
export const WORKFLOW_TO_JOURNEY: Record<WorkflowStage, JourneyNodeKey> = {
  payment_successful: "payment",
  form: "form",
  verification: "verification",
  government_portal: "govt",
  completed: "completed",
  closed: "completed",
};

export const STAGE_LABEL: Record<string, string> = {
  payment_successful: "Payment",
  form: "Form",
  verification: "Verification",
  government_portal: "Government Portal",
  completed: "Completed",
  closed: "Closed",
};

export const TIMER_LABEL: Record<string, string> = {
  incomplete_form: "Form nudge",
  closure: "Auto-closure",
  reminder: "Gov reminder",
  custom: "Custom",
};

export const AUTO_LABEL: Record<string, string> = {
  incomplete_form_flow: "Incomplete-form flow",
  closure_flow: "Closure flow",
  gov_reminder_flow: "Government reminder",
};

export type EngineTone = "running" | "paused" | "completed" | "stopped" | "none";

export interface EngineView {
  hasEngine: boolean;
  stage: WorkflowStage | null;
  status: string | null;
  subStatus: string | null;
  paused: boolean;
  pauseReason: string | null;
  activeTicketId: string | null;
  overallTone: EngineTone;
  overallLabel: string;
  activeNode: JourneyNodeKey | null;
  /** Next-firing timer (earliest fires_at among running timers). */
  nextTimer: { kind: string; firesAt: string } | null;
  runningAutomations: { code: string }[];
  timers: any[];
  automations: any[];
}

export function deriveEngineView(input: {
  state: any | null | undefined;
  timers: any[] | null | undefined;
  automations: any[] | null | undefined;
}): EngineView {
  const state = input.state ?? null;
  const timers = input.timers ?? [];
  const automations = input.automations ?? [];

  if (!state) {
    return {
      hasEngine: false,
      stage: null,
      status: null,
      subStatus: null,
      paused: false,
      pauseReason: null,
      activeTicketId: null,
      overallTone: "none",
      overallLabel: "Not initialised",
      activeNode: null,
      nextTimer: null,
      runningAutomations: [],
      timers,
      automations,
    };
  }

  const stage = state.stage as WorkflowStage;
  const activeNode = WORKFLOW_TO_JOURNEY[stage] ?? null;

  const overallTone: EngineTone =
    stage === "completed" ? "completed" : stage === "closed" ? "stopped" : state.paused ? "paused" : "running";
  const overallLabel =
    stage === "completed"
      ? "Completed"
      : stage === "closed"
      ? "Stopped"
      : state.paused
      ? "Paused"
      : "Running";

  const running = timers.filter((t) => t.status === "running" && t.fires_at);
  running.sort((a, b) => new Date(a.fires_at).getTime() - new Date(b.fires_at).getTime());
  const nextTimer = running[0] ? { kind: running[0].kind, firesAt: running[0].fires_at } : null;

  return {
    hasEngine: true,
    stage,
    status: state.status ?? null,
    subStatus: state.sub_status ?? null,
    paused: !!state.paused,
    pauseReason: state.pause_reason ?? null,
    activeTicketId: state.active_ticket_id ?? null,
    overallTone,
    overallLabel,
    activeNode,
    nextTimer,
    runningAutomations: automations.filter((a) => a.status === "running").map((a) => ({ code: a.code })),
    timers,
    automations,
  };
}

/** Node position index for the canonical happy-path (used by ProcessTracker / CustomerJourneyMap). */
export const HAPPY_PATH: JourneyNodeKey[] = [
  "lead",
  "payment",
  "consultation",
  "form",
  "docs",
  "verification",
  "govt",
  "processing",
  "completed",
];
