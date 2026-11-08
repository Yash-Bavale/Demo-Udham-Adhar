// Exception Banner — shows when order is in an exception state (customer hold,
// our-side delay, high priority, refund flow, closed, reopened) with any active
// schedulers rendered as business-hours countdown chips.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Clock,
  Pause,
  RefreshCcw,
  ShieldAlert,
  XCircle,
  Undo2,
  Wallet,
} from "lucide-react";
import { getOrderExceptionState } from "@/lib/scheduling/scheduler-status.functions";

interface Props {
  orderId: string;
}

type Tone = {
  wrap: string;
  ring: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  headline: string;
};

const TONE_MAP: Record<string, Tone> = {
  CUSTOMER_HOLD: {
    wrap: "bg-amber-50 border-amber-300 text-amber-900",
    ring: "bg-amber-500/20 text-amber-700",
    icon: Pause,
    label: "Customer Hold",
    headline: "Awaiting information from customer",
  },
  WAITING_CUSTOMER_INFO: {
    wrap: "bg-amber-50 border-amber-300 text-amber-900",
    ring: "bg-amber-500/20 text-amber-700",
    icon: Pause,
    label: "Waiting on Customer",
    headline: "Form/info requested — awaiting customer",
  },
  OUR_SIDE_DELAY: {
    wrap: "bg-orange-50 border-orange-300 text-orange-900",
    ring: "bg-orange-500/20 text-orange-700",
    icon: Clock,
    label: "Our-Side Delay",
    headline: "Pending action from your team",
  },
  HIGH_PRIORITY: {
    wrap: "bg-rose-50 border-rose-300 text-rose-900",
    ring: "bg-rose-500/20 text-rose-700",
    icon: ShieldAlert,
    label: "High Priority",
    headline: "Escalated after repeated reminders",
  },
  REFUND_REQUESTED: {
    wrap: "bg-purple-50 border-purple-300 text-purple-900",
    ring: "bg-purple-500/20 text-purple-700",
    icon: Wallet,
    label: "Refund Requested",
    headline: "Customer requested a refund",
  },
  REFUND_APPROVED: {
    wrap: "bg-purple-50 border-purple-300 text-purple-900",
    ring: "bg-purple-500/20 text-purple-700",
    icon: Wallet,
    label: "Refund Approved",
    headline: "Refund approved — process payment",
  },
  REFUND_PROCESSED: {
    wrap: "bg-emerald-50 border-emerald-300 text-emerald-900",
    ring: "bg-emerald-500/20 text-emerald-700",
    icon: Wallet,
    label: "Refund Processed",
    headline: "Refund paid to customer",
  },
  CLOSED: {
    wrap: "bg-slate-100 border-slate-300 text-slate-800",
    ring: "bg-slate-500/20 text-slate-700",
    icon: XCircle,
    label: "Closed",
    headline: "Order closed",
  },
  REOPENED: {
    wrap: "bg-sky-50 border-sky-300 text-sky-900",
    ring: "bg-sky-500/20 text-sky-700",
    icon: Undo2,
    label: "Reopened",
    headline: "Order reopened",
  },
};

const SCHEDULER_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; hint: string }> = {
  customer_closure_24h: { label: "Auto-close timer", icon: Clock, hint: "closes if no reply" },
  our_side_reminder: { label: "Reminder loop", icon: RefreshCcw, hint: "next nudge to assignee" },
  ticket_autoclose_24h: { label: "Ticket auto-close", icon: Clock, hint: "closes if no reply" },
  feedback_followup: { label: "Feedback follow-up", icon: Clock, hint: "customer feedback nudge" },
};

function formatBusinessDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "due";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 1) return `${h}h ${m}m business time`;
  return `${m}m business time`;
}

function formatWallClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export function ExceptionBanner({ orderId }: Props) {
  const fn = useServerFn(getOrderExceptionState);
  const { data } = useQuery({
    queryKey: ["order-exception-state", orderId],
    queryFn: () => fn({ data: { orderId } }),
    refetchInterval: 60_000,
  });

  if (!data?.order) return null;
  const status = data.order.order_status || "";
  const tone = TONE_MAP[status];
  const schedulers = data.schedulers;
  if (!tone && schedulers.length === 0) return null;

  const Fallback: Tone = {
    wrap: "bg-slate-50 border-slate-200 text-slate-800",
    ring: "bg-slate-500/20 text-slate-700",
    icon: AlertTriangle,
    label: status || "Active timers",
    headline: "Active schedulers on this order",
  };
  const t = tone || Fallback;
  const Icon = t.icon;

  return (
    <div className={`rounded-lg border px-4 py-3 space-y-3 ${t.wrap}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`rounded-full p-2 ${t.ring}`}>
            <Icon className="size-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider opacity-70">Exception</div>
            <div className="text-sm font-semibold">{t.label}</div>
            <div className="text-xs opacity-80">{t.headline}</div>
            {data.order.closure_remarks && status === "CLOSED" && (
              <div className="mt-1 text-xs italic opacity-70">
                {data.order.closure_remarks}
              </div>
            )}
          </div>
        </div>
      </div>

      {schedulers.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {schedulers.map((s) => {
            const meta = SCHEDULER_META[s.scheduler_type] || {
              label: s.scheduler_type,
              icon: Clock,
              hint: "",
            };
            const SIcon = meta.icon;
            const paused = s.status === "paused";
            return (
              <div
                key={s.id}
                className="rounded border border-white/60 bg-white/70 px-3 py-2 text-slate-800"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <SIcon className="size-3.5" /> {meta.label}
                  </span>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase " +
                      (paused
                        ? "bg-slate-200 text-slate-700"
                        : "bg-emerald-100 text-emerald-800")
                    }
                  >
                    {s.status}
                  </span>
                </div>
                <div className="mt-1 text-sm font-medium">
                  {paused
                    ? `Paused — ${formatBusinessDuration(s.business_seconds_remaining)} left`
                    : formatBusinessDuration(s.business_seconds_remaining)}
                </div>
                <div className="text-[11px] text-slate-500">
                  {paused
                    ? `Paused ${formatWallClock(s.paused_at)}`
                    : `Fires ${formatWallClock(s.fires_at)} · ${meta.hint}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
