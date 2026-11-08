import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listActivityLogs } from "@/lib/crm/dashboard.functions";
import { SectionCard, TableSkeleton, Timeline } from "@/components/admin/ui";

export const Route = createFileRoute("/admin/activity")({ component: ActivityPage });

function ActivityPage() {
  const fn = useServerFn(listActivityLogs);
  const { data, isLoading } = useQuery({ queryKey: ["admin.activity"], queryFn: () => fn() });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity Log</h1>
        <p className="text-sm" style={{ color: "var(--admin-fg-muted)" }}>Chronological record of all system events.</p>
      </div>
      <SectionCard>
        <div className="p-5">
          {isLoading ? <TableSkeleton rows={8} cols={2} /> : (
            <Timeline items={(data?.rows ?? []).map((a) => ({
              id: a.id,
              time: a.created_at,
              type: a.activity_type,
              description: a.activity_description,
              meta: a.lead_id ? (
                <Link to="/admin/leads/$leadId" params={{ leadId: a.lead_id }} className="text-xs font-medium hover:underline" style={{ color: "var(--admin-accent)" }}>
                  View lead →
                </Link>
              ) : null,
            }))} />
          )}
        </div>
      </SectionCard>
    </div>
  );
}
