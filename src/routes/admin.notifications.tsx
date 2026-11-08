import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bell, Check, CheckCheck, Trash2, ArrowRight, AtSign, UserPlus, Clock, Info, AlertTriangle,
} from "lucide-react";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  deleteNotification,
  type Notification,
} from "@/lib/crm/notifications.functions";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Udyam Ops OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: NotificationsPage,
});

type Filter = "all" | "assignments" | "orders" | "mentions" | "sla" | "system";

function classifyFilter(n: Notification): Filter {
  const k = (n.kind ?? "").toLowerCase();
  if (k.includes("assign")) return "assignments";
  if (
    k.includes("customer_hold") ||
    k.includes("form_link") ||
    k.includes("order_status") ||
    k.includes("order_reminder") ||
    k.includes("workflow") ||
    k.includes("delay") ||
    k.includes("customer_reply") ||
    k.includes("form_submitted") ||
    k.includes("order")
  ) {
    return "orders";
  }
  if (k.includes("mention")) return "mentions";
  if (k.includes("sla") || k.includes("overdue") || k.includes("breach") || k.includes("escalat")) return "sla";
  return "system";
}

function kindIcon(n: Notification) {
  const f = classifyFilter(n);
  if (f === "mentions") return { Icon: AtSign, tone: "text-violet-600 bg-violet-50" };
  if (f === "assignments") return { Icon: UserPlus, tone: "text-indigo-600 bg-indigo-50" };
  if (f === "orders") return { Icon: Clock, tone: "text-blue-600 bg-blue-50" };
  if (f === "sla") return { Icon: AlertTriangle, tone: "text-rose-600 bg-rose-50" };
  return { Icon: Info, tone: "text-sky-600 bg-sky-50" };
}

function dayGroup(iso: string): string {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  const dd = new Date(d); dd.setHours(0, 0, 0, 0);
  if (dd.getTime() === today.getTime()) return "Today";
  if (dd.getTime() === yest.getTime()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function NotificationsPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listMyNotifications);
  const markRead = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const del = useServerFn(deleteNotification);

  const [filter, setFilter] = useState<Filter>("all");

  const { data, refetch, isLoading } = useQuery<{ rows: Notification[] }>({
    queryKey: ["notifications", "all"],
    queryFn: () => fetchList({ data: { limit: 100 } }),
  });

  useRealtimeTable("notifications", () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
  });

  const markMut = useMutation({
    mutationFn: (id: string) => markRead({ data: { id } }),
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["notifications", "unread-count"] }); },
  });
  const markAllMut = useMutation({
    mutationFn: () => markAll(),
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["notifications", "unread-count"] }); },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => refetch(),
  });

  const allRows = data?.rows ?? [];
  const rows = filter === "all" ? allRows : allRows.filter((n) => classifyFilter(n) === filter);
  const unread = allRows.filter((r) => !r.read_at).length;

  const counts = useMemo(() => {
    const c = { all: allRows.length, assignments: 0, orders: 0, mentions: 0, sla: 0, system: 0 };
    for (const n of allRows) c[classifyFilter(n)]++;
    return c;
  }, [allRows]);

  const groups = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const n of rows) {
      const g = dayGroup(n.created_at);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(n);
    }
    return Array.from(map.entries());
  }, [rows]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
            {unread > 0 ? (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-indigo-500 animate-pulse" />
                  <span className="font-medium text-indigo-700">{unread} unread</span>
                </span>
                <span className="text-slate-300">·</span>
                <span>live updates</span>
              </>
            ) : (
              <>All caught up · live updates</>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => markAllMut.mutate()} disabled={unread === 0 || markAllMut.isPending}>
          <CheckCheck className="size-3.5 mr-1.5" /> Mark all read
        </Button>
      </div>

      {/* Filter tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList className="h-auto p-1 bg-slate-100">
          {([
            { id: "all", label: "All" },
            { id: "assignments", label: "Assignments" },
            { id: "orders", label: "Order Updates" },
            { id: "mentions", label: "Mentions" },
            { id: "sla", label: "SLA / Alerts" },
            { id: "system", label: "System" },
          ] as { id: Filter; label: string }[]).map((f) => (
            <TabsTrigger key={f.id} value={f.id} className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <span>{f.label}</span>
              <span className={`inline-flex items-center justify-center rounded-full text-[10px] font-semibold px-1.5 min-w-[20px] ${
                filter === f.id ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-600"
              }`}>{counts[f.id]}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Body */}
      {isLoading ? (
        <Card className="p-10 text-center text-sm text-slate-500">Loading…</Card>
      ) : rows.length === 0 ? (
        <Card className="p-14 text-center">
          <div className="mx-auto size-12 rounded-full bg-slate-100 grid place-items-center mb-3">
            <Bell className="size-5 text-slate-400" />
          </div>
          <div className="text-sm font-medium text-slate-700">You're all caught up</div>
          <div className="text-xs text-slate-500 mt-1">New alerts will appear here in realtime.</div>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(([label, items]) => (
            <div key={label} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-500">{label}</div>
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-[10px] text-slate-400">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((n) => (
                  <NotificationItem
                    key={n.id}
                    n={n}
                    onMark={(id) => markMut.mutate(id)}
                    onDelete={(id) => delMut.mutate(id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationItem({ n, onMark, onDelete }: {
  n: Notification;
  onMark: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { Icon, tone } = kindIcon(n);
  const unread = !n.read_at;
  return (
    <Card className={`p-3 transition-all group hover:border-slate-300 ${unread ? "border-l-4 border-l-indigo-500 bg-indigo-50/20" : ""}`}>
      <div className="flex items-start gap-3">
        <div className={`size-9 rounded-xl grid place-items-center shrink-0 ${tone}`}>
          <Icon className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm font-medium text-slate-900 truncate">{n.title}</div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">{n.kind}</span>
            <span className="ml-auto text-[11px] text-slate-500 inline-flex items-center gap-1">
              <Clock className="size-3" /> {relative(n.created_at)}
            </span>
          </div>
          {n.body && <p className="text-xs text-slate-600 mt-1 line-clamp-2">{n.body}</p>}
          {n.href && (
            <a href={n.href} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
              Open <ArrowRight className="size-3" />
            </a>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {unread && (
            <button
              onClick={() => onMark(n.id)}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
              title="Mark read"
            >
              <Check className="size-3.5" />
            </button>
          )}
          <button
            onClick={() => onDelete(n.id)}
            className="p-1.5 rounded hover:bg-rose-50 text-rose-500"
            title="Delete"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </Card>
  );
}
