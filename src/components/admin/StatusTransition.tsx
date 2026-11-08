import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getAllowed, statusTone, type EntityKind } from "@/lib/crm/status-engine";
import {
  transitionLead,
  transitionApplication,
  transitionComplaint,
  getMyRoles,
} from "@/lib/crm/status-engine.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export function StatusTransition({
  kind,
  entityId,
  current,
  onChanged,
}: {
  kind: EntityKind;
  entityId: string;
  current: string;
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const rolesFn = useServerFn(getMyRoles);
  const transitionFn = useServerFn(
    kind === "lead" ? transitionLead :
    kind === "application" ? transitionApplication :
    transitionComplaint
  );
  const { data: roleData } = useQuery({ queryKey: ["my.roles"], queryFn: () => rolesFn() });
  const roles = (roleData?.roles ?? []) as any[];
  const allowed = getAllowed(kind, current as any, roles);
  const [busy, setBusy] = useState(false);

  const run = async (to: string) => {
    setBusy(true);
    try {
      await (transitionFn as any)({ data: { id: entityId, to } });
      toast.success(`Moved to ${to.replace(/_/g, " ")}`);
      onChanged?.();
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to transition");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className={`uppercase text-[10px] tracking-wider ${statusTone(current)}`}>
        {current.replace(/_/g, " ")}
      </Badge>
      {allowed.length === 0 ? (
        <span className="text-xs text-slate-400 italic">No transitions available</span>
      ) : (
        allowed.map((t) => (
          <Button
            key={t.to}
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run(t.to)}
            className="h-8 gap-1.5 text-xs"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
            {t.label}
          </Button>
        ))
      )}
    </div>
  );
}
