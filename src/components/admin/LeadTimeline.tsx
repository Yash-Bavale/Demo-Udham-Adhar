import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Activity, CreditCard, FileText, Mail, MessageSquare, FilePenLine, BarChart2 } from "lucide-react";
import { getLeadTimeline, type TimelineItem, type TimelineKind } from "@/lib/crm/lead-timeline.functions";

const ICONS: Record<TimelineKind, React.ReactNode> = {
  activity: <Activity className="size-3.5" />,
  note: <MessageSquare className="size-3.5" />,
  email: <Mail className="size-3.5" />,
  payment: <CreditCard className="size-3.5" />,
  onboarding: <FilePenLine className="size-3.5" />,
  document: <FileText className="size-3.5" />,
  analytics: <BarChart2 className="size-3.5" />,
};

const COLOR: Record<TimelineKind, string> = {
  activity: "bg-slate-500",
  note: "bg-violet-500",
  email: "bg-sky-500",
  payment: "bg-emerald-500",
  onboarding: "bg-amber-500",
  document: "bg-indigo-500",
  analytics: "bg-rose-500",
};

export function LeadTimeline({ leadId }: { leadId: string }) {
  const fn = useServerFn(getLeadTimeline);
  const { data, isLoading } = useQuery({
    queryKey: ["admin.lead.timeline", leadId],
    queryFn: () => fn({ data: { leadId } }),
  });

  if (isLoading) return <div className="text-sm" style={{ color: "var(--admin-fg-muted)" }}>Loading timeline…</div>;
  const items = data?.items ?? [];
  if (items.length === 0) return <div className="text-sm" style={{ color: "var(--admin-fg-muted)" }}>No activity yet.</div>;

  return (
    <ol className="relative space-y-3 pl-5">
      <span className="absolute left-1.5 top-1 bottom-1 w-px" style={{ background: "var(--admin-border)" }} />
      {items.map((it: TimelineItem, idx) => (
        <motion.li
          key={it.id}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: Math.min(idx * 0.015, 0.4) }}
          className="relative"
        >
          <span className={`absolute -left-[14px] top-1.5 size-3 rounded-full ring-2 ring-[var(--admin-surface)] ${COLOR[it.kind]} flex items-center justify-center text-white`}>
            <span className="scale-[0.75]">{ICONS[it.kind]}</span>
          </span>
          <div className="text-xs" style={{ color: "var(--admin-fg-muted)" }} title={new Date(it.at).toLocaleString("en-IN")}>
            {new Date(it.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </div>
          <div className="text-sm font-medium" style={{ color: "var(--admin-fg)" }}>{it.title}</div>
          {it.detail && <div className="text-xs mt-0.5" style={{ color: "var(--admin-fg-muted)" }}>{it.detail}</div>}
        </motion.li>
      ))}
    </ol>
  );
}
