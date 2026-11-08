// Aggregated live workflow metrics for the admin dashboard.
// Groups by stage/status, counts pending timers by kind, active automations,
// and recent email outcomes (24h) from the shared email_send_log.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WorkflowDashboard = {
  states: {
    total: number;
    paused: number;
    byStage: Record<string, number>;
    byStatus: Record<string, number>;
    activeTickets: number;
  };
  timers: {
    running: number;
    paused: number;
    dueNext1h: number;
    byKind: Record<string, number>;
  };
  automations: {
    running: number;
    paused: number;
    byCode: Record<string, number>;
  };
  emails24h: {
    total: number;
    sent: number;
    failed: number;
    suppressed: number;
    pending: number;
  };
  updatedAt: string;
};

let cachedWorkflow: { expiresAt: number; data: WorkflowDashboard } | null = null;

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

function tallyBy<T extends string>(rows: Array<{ [k: string]: unknown }>, key: string): Record<T, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const v = String(r[key] ?? "unknown");
    out[v] = (out[v] ?? 0) + 1;
  }
  return out as Record<T, number>;
}

export const getWorkflowDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<WorkflowDashboard> => {
    if (cachedWorkflow && Date.now() < cachedWorkflow.expiresAt) {
      return cachedWorkflow.data;
    }

    const admin = await getAdmin();
    const nowIso = new Date().toISOString();
    const in1hIso = new Date(Date.now() + 60 * 60_000).toISOString();
    const dayAgoIso = new Date(Date.now() - 24 * 3600_000).toISOString();

    const [statesRes, timersRes, autosRes, emailsRes] = await Promise.all([
      admin.from("workflow_states").select("stage,status,paused,active_ticket_id"),
      admin
        .from("workflow_timers")
        .select("kind,status,fires_at")
        .in("status", ["running", "paused"]),
      admin.from("workflow_automations").select("code,status").in("status", ["running", "paused"]),
      admin
        .from("email_send_log")
        .select("message_id,status,created_at")
        .gte("created_at", dayAgoIso)
        .limit(2000),
    ]);

    const stateRows = (statesRes.data ?? []) as Array<{
      stage: string | null;
      status: string | null;
      paused: boolean | null;
      active_ticket_id: string | null;
    }>;
    const timerRows = (timersRes.data ?? []) as Array<{
      kind: string;
      status: string;
      fires_at: string | null;
    }>;
    const autoRows = (autosRes.data ?? []) as Array<{ code: string; status: string }>;

    // Dedupe emails by latest row per message_id
    const emailRows = (emailsRes.data ?? []) as Array<{
      message_id: string | null;
      status: string | null;
      created_at: string;
    }>;
    const latestByMsg = new Map<string, string>();
    for (const r of emailRows) {
      if (!r.message_id) continue;
      const prev = latestByMsg.get(r.message_id);
      if (!prev || r.created_at > prev) latestByMsg.set(r.message_id, r.status ?? "unknown");
    }
    const statuses = Array.from(latestByMsg.values());
    const count = (s: string) => statuses.filter((v) => v === s).length;

    const runningTimers = timerRows.filter((t) => t.status === "running");
    const dueNext1h = runningTimers.filter(
      (t) => t.fires_at && t.fires_at >= nowIso && t.fires_at <= in1hIso,
    ).length;

    const result: WorkflowDashboard = {
      states: {
        total: stateRows.length,
        paused: stateRows.filter((r) => r.paused).length,
        byStage: tallyBy(stateRows as never, "stage"),
        byStatus: tallyBy(stateRows as never, "status"),
        activeTickets: stateRows.filter((r) => !!r.active_ticket_id).length,
      },
      timers: {
        running: runningTimers.length,
        paused: timerRows.filter((t) => t.status === "paused").length,
        dueNext1h,
        byKind: tallyBy(timerRows as never, "kind"),
      },
      automations: {
        running: autoRows.filter((a) => a.status === "running").length,
        paused: autoRows.filter((a) => a.status === "paused").length,
        byCode: tallyBy(autoRows as never, "code"),
      },
      emails24h: {
        total: statuses.length,
        sent: count("sent"),
        failed: count("dlq") + count("failed") + count("bounced") + count("complained"),
        suppressed: count("suppressed"),
        pending: count("pending"),
      },
      updatedAt: new Date().toISOString(),
    };

    cachedWorkflow = { expiresAt: Date.now() + 30_000, data: result };
    return result;
  });
