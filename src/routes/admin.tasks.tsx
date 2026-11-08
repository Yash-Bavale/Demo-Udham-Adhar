import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  CircleDashed,
  Inbox,
  ListChecks,
  User,
} from "lucide-react";
import { listTasks, completeTask } from "@/lib/crm/tasks.functions";
import { AddTaskDialog } from "@/components/admin/AddTaskDialog";

export const Route = createFileRoute("/admin/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — Udyam Ops OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/admin-login" });
    const { data: rows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user.id);
    const roles = (rows ?? []).map((r) => r.role as string);
    if (!roles.includes("admin") && !roles.includes("super_admin")) {
      throw redirect({ to: "/admin/my-work" });
    }
  },
  component: TasksPage,
});

type ScopeFilter = "mine" | "all";

function TasksPage() {
  const [scope, setScope] = useState<ScopeFilter>("all");
  const fn = useServerFn(listTasks);
  const completeFn = useServerFn(completeTask);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["tasks-board", scope],
    queryFn: () => fn({ data: { scope, includeCompleted: false } }),
    refetchInterval: 60_000,
  });

  const buckets = useMemo(() => bucketize(data?.tasks ?? []), [data]);

  const completeMut = useMutation({
    mutationFn: (id: string) => completeFn({ data: { id, completed: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks-board"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight" style={{ color: "var(--admin-fg)" }}>
            Tasks
          </h1>
          <p className="text-sm" style={{ color: "var(--admin-fg-muted)" }}>
            Manual to-do items linked to leads, orders, and customers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="inline-flex overflow-hidden rounded-md border text-xs font-medium"
            style={{ borderColor: "var(--admin-border)" }}
          >
            <button
              onClick={() => setScope("mine")}
              className="px-3 py-1.5"
              style={{
                background: scope === "mine" ? "var(--admin-accent)" : "var(--admin-surface)",
                color: scope === "mine" ? "var(--admin-accent-fg)" : "var(--admin-fg)",
              }}
            >
              My Tasks
            </button>
            <button
              onClick={() => setScope("all")}
              className="px-3 py-1.5"
              style={{
                background: scope === "all" ? "var(--admin-accent)" : "var(--admin-surface)",
                color: scope === "all" ? "var(--admin-accent-fg)" : "var(--admin-fg)",
              }}
            >
              All Tasks
            </button>
          </div>
          <AddTaskDialog />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Column
          title="Overdue"
          count={buckets.overdue.length}
          tone="danger"
          icon={<AlertCircle className="size-4" />}
          loading={isLoading}
          tasks={buckets.overdue}
          onComplete={(id) => completeMut.mutate(id)}
        />
        <Column
          title="Due Today"
          count={buckets.today.length}
          tone="warn"
          icon={<CircleDashed className="size-4" />}
          loading={isLoading}
          tasks={buckets.today}
          onComplete={(id) => completeMut.mutate(id)}
        />
        <Column
          title="Upcoming (7 days)"
          count={buckets.upcoming.length}
          tone="info"
          icon={<Calendar className="size-4" />}
          loading={isLoading}
          tasks={buckets.upcoming}
          onComplete={(id) => completeMut.mutate(id)}
        />
      </div>
    </div>
  );
}

type Task = Awaited<ReturnType<typeof listTasks>>["tasks"][number];

function bucketize(tasks: Task[]) {
  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(startToday);
  endToday.setDate(endToday.getDate() + 1);
  const in7 = new Date(startToday);
  in7.setDate(in7.getDate() + 8);

  const overdue: Task[] = [];
  const today: Task[] = [];
  const upcoming: Task[] = [];
  tasks.forEach((t) => {
    if (!t.due_date) {
      upcoming.push(t);
      return;
    }
    const d = new Date(t.due_date);
    if (d < startToday) overdue.push(t);
    else if (d < endToday) today.push(t);
    else if (d < in7) upcoming.push(t);
  });
  return { overdue, today, upcoming };
}

function Column({
  title,
  count,
  tone,
  icon,
  loading,
  tasks,
  onComplete,
}: {
  title: string;
  count: number;
  tone: "danger" | "warn" | "info";
  icon: React.ReactNode;
  loading: boolean;
  tasks: Task[];
  onComplete: (id: string) => void;
}) {
  const color =
    tone === "danger"
      ? "var(--admin-danger)"
      : tone === "warn"
        ? "var(--admin-warn)"
        : "#0284c7";
  const bg =
    tone === "danger"
      ? "rgba(220,38,38,0.08)"
      : tone === "warn"
        ? "rgba(217,119,6,0.08)"
        : "rgba(2,132,199,0.08)";
  return (
    <section
      className="flex flex-col rounded-lg border"
      style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface)" }}
    >
      <header
        className="flex items-center justify-between rounded-t-lg border-b px-3 py-2"
        style={{ borderColor: "var(--admin-border)", background: bg }}
      >
        <div className="flex items-center gap-2 text-sm font-medium" style={{ color }}>
          {icon}
          {title}
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ background: "var(--admin-surface)", color }}
        >
          {count}
        </span>
      </header>
      <div className="flex flex-col gap-2 p-2">
        {loading && <ColumnSkeleton />}
        {!loading && tasks.length === 0 && <Empty />}
        {!loading && tasks.map((t) => <TaskCard key={t.id} task={t} onComplete={onComplete} />)}
      </div>
    </section>
  );
}

function ColumnSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-20 animate-pulse rounded border"
          style={{ background: "var(--admin-surface-2)", borderColor: "var(--admin-border)" }}
        />
      ))}
    </>
  );
}

function Empty() {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded border border-dashed py-8 text-center"
      style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg-muted)" }}
    >
      <Inbox className="size-5" />
      <div className="text-xs">No tasks here.</div>
    </div>
  );
}

const PRIORITY_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  high: { color: "#b91c1c", bg: "rgba(220,38,38,0.12)", label: "High" },
  medium: { color: "#b45309", bg: "rgba(217,119,6,0.12)", label: "Medium" },
  low: { color: "#475569", bg: "rgba(100,116,139,0.12)", label: "Low" },
};

function TaskCard({ task, onComplete }: { task: Task; onComplete: (id: string) => void }) {
  const p = PRIORITY_STYLE[task.priority ?? "medium"];
  return (
    <article
      className="group rounded-md border p-3"
      style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)" }}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onComplete(task.id)}
          className="mt-0.5 rounded-full p-0.5 hover:bg-[var(--admin-surface-2)]"
          title="Mark complete"
        >
          <CheckCircle2 className="size-4" style={{ color: "var(--admin-fg-muted)" }} />
        </button>
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-medium leading-snug"
            style={{ color: "var(--admin-fg)" }}
          >
            {task.title}
          </div>
          {task.description && (
            <div
              className="mt-0.5 line-clamp-2 text-xs"
              style={{ color: "var(--admin-fg-muted)" }}
            >
              {task.description}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: p.bg, color: p.color }}
            >
              <span className="size-1.5 rounded-full" style={{ background: p.color }} />
              {p.label}
            </span>
            {task.lead_code && (
              <Link
                to="/admin/leads/$leadId"
                params={{ leadId: task.lead_id! }}
                className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]"
                style={{
                  borderColor: "var(--admin-border)",
                  color: "var(--admin-accent)",
                }}
              >
                <ListChecks className="size-3" />
                {task.lead_code}
              </Link>
            )}
            {task.application_code && (
              <Link
                to="/admin/applications/$applicationId"
                params={{ applicationId: task.application_id! }}
                className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]"
                style={{
                  borderColor: "var(--admin-border)",
                  color: "var(--admin-accent)",
                }}
              >
                {task.application_code}
              </Link>
            )}
            {task.assigned_name && (
              <span
                className="inline-flex items-center gap-1 text-[10px]"
                style={{ color: "var(--admin-fg-muted)" }}
              >
                <User className="size-3" />
                {task.assigned_name}
              </span>
            )}
            {task.due_date && (
              <span
                className="ml-auto inline-flex items-center gap-1 text-[10px]"
                style={{ color: "var(--admin-fg-muted)" }}
              >
                <Calendar className="size-3" />
                {formatIST(task.due_date)}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function formatIST(iso: string): string {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return fmt.format(d).replace(",", "");
}
