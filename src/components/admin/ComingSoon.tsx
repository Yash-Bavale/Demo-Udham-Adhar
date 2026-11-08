import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

export function ComingSoon({
  title,
  subtitle,
  phase,
  children,
  fallbackHref,
  fallbackLabel,
}: {
  title: string;
  subtitle: string;
  phase: string;
  children?: ReactNode;
  fallbackHref?: string;
  fallbackLabel?: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--admin-fg)" }}>
          {title}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--admin-fg-muted)" }}>
          {subtitle}
        </p>
      </div>
      <div
        className="rounded-xl border p-8 flex items-start gap-4"
        style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface)" }}
      >
        <div
          className="size-10 shrink-0 rounded-lg flex items-center justify-center"
          style={{ background: "var(--admin-accent-soft)", color: "var(--admin-accent)" }}
        >
          <Sparkles className="size-5" />
        </div>
        <div className="space-y-2 text-sm" style={{ color: "var(--admin-fg-muted)" }}>
          <div className="font-medium" style={{ color: "var(--admin-fg)" }}>
            Shipping in {phase}.
          </div>
          <p>
            The navigation, shell, and routing for this surface are live. The full
            workspace lands as part of {phase} of the Udyam Operations OS rollout.
          </p>
          {fallbackHref && fallbackLabel && (
            <p className="pt-2">
              In the meantime, use{" "}
              <a
                href={fallbackHref}
                className="underline underline-offset-4"
                style={{ color: "var(--admin-accent)" }}
              >
                {fallbackLabel}
              </a>
              .
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
