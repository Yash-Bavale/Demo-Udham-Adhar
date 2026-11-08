// Live workflow widgets: order state, pending timers, automations, email outcomes.
// Refreshes every 30s and re-fetches on window focus.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, AlarmClock, Cog, Mail, PauseCircle, Ticket, Timer, XCircle } from "lucide-react";
import { getWorkflowDashboard, type WorkflowDashboard } from "@/lib/workflow/dashboard.functions";

const STAGE_LABEL: Record<string, string> = {
  payment_successful: "Payment",
  form: "Form",
  verification: "Verification",
  government_portal: "Government",
  completed: "Completed",
  closed: "Closed",
};

const TIMER_LABEL: Record<string, string> = {
  incomplete_form: "Form nudge",
  closure: "Auto-closure",
  reminder: "Gov reminder",
  custom: "Custom",
};

const AUTO_LABEL: Record<string, string> = {
  incomplete_form_flow: "Incomplete-form flow",
  closure_flow: "Closure flow",
  gov_reminder_flow: "Government reminder",
};

import { useDashboardPrivacy } from "@/hooks/useDashboardPrivacy";

function StatRow({ label, value, tone }: { label: string; value: number; tone?: string }) {
  const { isPrivacyEnabled } = useDashboardPrivacy();
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <Badge variant="secondary" className={tone}>{isPrivacyEnabled ? "•••" : value}</Badge>
    </div>
  );
}

export function WorkflowStatusWidgets() {
  const fetchFn = useServerFn(getWorkflowDashboard);
  const q = useQuery({
    queryKey: ["workflow-dashboard"],
    queryFn: () => fetchFn(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  if (q.isLoading || !q.data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  const d: WorkflowDashboard = q.data;
  const stages = Object.entries(d.states.byStage).sort((a, b) => b[1] - a[1]);
  const kinds = Object.entries(d.timers.byKind).sort((a, b) => b[1] - a[1]);
  const autos = Object.entries(d.automations.byCode).sort((a, b) => b[1] - a[1]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Workflow Engine
        </h3>
        <span className="text-xs text-muted-foreground">
          Live · {new Date(d.updatedAt).toLocaleTimeString("en-IN")}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Orders in workflow</CardTitle>
            <Cog className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{d.states.total}</div>
            <div className="text-xs text-muted-foreground mb-2">
              {d.states.paused} paused · {d.states.activeTickets} with active ticket
            </div>
            <div className="mt-2">
              {stages.length === 0 ? (
                <div className="text-xs text-muted-foreground">No active state</div>
              ) : (
                stages.map(([stage, n]) => (
                  <StatRow key={stage} label={STAGE_LABEL[stage] ?? stage} value={n} />
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Pending timers</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{d.timers.running}</div>
            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-3">
              <span className="flex items-center gap-1"><AlarmClock className="h-3 w-3" />
                {d.timers.dueNext1h} in next 1h
              </span>
              <span className="flex items-center gap-1"><PauseCircle className="h-3 w-3" />
                {d.timers.paused} paused
              </span>
            </div>
            <div className="mt-2">
              {kinds.length === 0 ? (
                <div className="text-xs text-muted-foreground">No timers</div>
              ) : (
                kinds.map(([k, n]) => <StatRow key={k} label={TIMER_LABEL[k] ?? k} value={n} />)
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Automations</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{d.automations.running}</div>
            <div className="text-xs text-muted-foreground mb-2">
              {d.automations.paused} paused
            </div>
            <div className="mt-2">
              {autos.length === 0 ? (
                <div className="text-xs text-muted-foreground">No active automation</div>
              ) : (
                autos.map(([c, n]) => <StatRow key={c} label={AUTO_LABEL[c] ?? c} value={n} />)
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Emails (24h)</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{d.emails24h.total}</div>
            <div className="text-xs text-muted-foreground mb-2">
              unique messages (last 24h)
            </div>
            <StatRow label="Sent" value={d.emails24h.sent} tone="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" />
            <StatRow label="Failed / DLQ" value={d.emails24h.failed} tone="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" />
            <StatRow label="Suppressed" value={d.emails24h.suppressed} tone="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" />
            <StatRow label="Pending" value={d.emails24h.pending} />
            {d.emails24h.failed > 0 && (
              <div className="mt-2 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                <XCircle className="h-3 w-3" /> Some sends failed — check Emails admin.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
