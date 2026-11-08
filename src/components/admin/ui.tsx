import { motion } from "motion/react";
import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  delta,
  icon,
  gradient,
  index = 0,
  loading,
  hint,
}: {
  label: string;
  value: number | string;
  delta?: { value: number; positive?: boolean };
  icon?: ReactNode;
  gradient?: "primary" | "success" | "warn" | "danger";
  index?: number;
  loading?: boolean;
  hint?: string;
}) {
  const tone =
    gradient === "success" ? "var(--admin-success)" :
    gradient === "warn" ? "var(--admin-warn)" :
    gradient === "danger" ? "var(--admin-danger)" :
    "var(--admin-primary)";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: "easeOut" }}
      className="relative rounded-lg border p-4"
      style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--admin-fg-muted)" }}>
          {label}
        </div>
        {icon && (
          <div className="rounded-md p-1.5" style={{ background: "var(--admin-surface-2)", color: tone }}>
            {icon}
          </div>
        )}
      </div>
      {loading ? (
        <div className="mt-3 h-7 w-20 animate-pulse rounded" style={{ background: "var(--admin-surface-2)" }} />
      ) : (
        <div className="mt-2 text-2xl font-medium tabular-nums" style={{ color: "var(--admin-fg)" }}>
          {typeof value === "number" ? value.toLocaleString("en-IN") : value}
        </div>
      )}
      {hint && !loading && (
        <div className="mt-1 text-[11px]" style={{ color: "var(--admin-fg-muted)" }}>{hint}</div>
      )}
      {delta && !loading && (
        <div className="mt-1 text-xs font-medium" style={{ color: delta.positive ? "var(--admin-success)" : "var(--admin-danger)" }}>
          {delta.positive ? "▲" : "▼"} {Math.abs(delta.value)}%
        </div>
      )}
    </motion.div>
  );
}

export function SectionCard({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`rounded-lg border ${className}`}
      style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)" }}
    >
      {(title || action) && (
        <header className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--admin-border)" }}>
          {title && <h3 className="text-sm font-medium" style={{ color: "var(--admin-fg)" }}>{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </motion.section>
  );
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y" style={{ borderColor: "var(--admin-border)" }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 px-3 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="h-3 flex-1 animate-pulse rounded"
              style={{ background: "var(--admin-surface-2)", animationDelay: `${(r * cols + c) * 30}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  new: "bg-rose-100 text-rose-800 border border-rose-300 font-semibold dark:bg-rose-950 dark:text-rose-200",
  new_lead: "bg-rose-100 text-rose-800 border border-rose-300 font-semibold dark:bg-rose-950 dark:text-rose-200",
  lead_created: "bg-rose-100 text-rose-800 border border-rose-300 font-semibold dark:bg-rose-950 dark:text-rose-200",
  contacted: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  payment_pending: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  payment_successful: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  payment_received: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  cancelled: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  pending: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
        active ? "shadow-sm" : "hover:bg-[var(--admin-surface-2)]"
      }`}
      style={{
        borderColor: active ? "var(--admin-accent)" : "var(--admin-border)",
        background: active ? "var(--admin-accent)" : "var(--admin-surface)",
        color: active ? "var(--admin-accent-fg)" : "var(--admin-fg)",
      }}
    >
      {children}
    </button>
  );
}

export function Timeline({ items }: { items: Array<{ id: string; time: string; type?: string; description: string; meta?: ReactNode }> }) {
  return (
    <ol className="relative ml-3 border-l" style={{ borderColor: "var(--admin-border)" }}>
      {items.map((it, i) => (
        <motion.li
          key={it.id}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, delay: i * 0.02 }}
          className="relative pl-5 pb-5"
        >
          <span
            className="absolute -left-[5px] top-1.5 size-2.5 rounded-full ring-4"
            style={{ background: "var(--admin-accent)", boxShadow: "0 0 0 3px var(--admin-surface)" }}
          />
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <time className="text-[11px] font-medium" style={{ color: "var(--admin-fg-muted)" }}>
              {new Date(it.time).toLocaleString("en-IN")}
            </time>
            {it.type && (
              <span className="rounded bg-[var(--admin-surface-2)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--admin-fg-muted)" }}>
                {it.type}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--admin-fg)" }}>{it.description}</p>
          {it.meta && <div className="mt-1">{it.meta}</div>}
        </motion.li>
      ))}
    </ol>
  );
}
