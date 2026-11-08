import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2, Pencil, X } from "lucide-react";
import {
  listAutomationRules,
  upsertAutomationRule,
  deleteAutomationRule,
} from "@/lib/crm/workflow-settings.functions";
import { SectionCard } from "@/components/admin/ui";
import { toast } from "sonner";

const STATUSES = [
  "external_dependency",
  "government_portal_pending",
  "waiting_for_customer",
  "waiting_for_documents",
  "customer_non_responsive",
  "pending_closure",
];

const ACTIONS = [
  { code: "send_template", label: "Send email template" },
  { code: "create_reminder", label: "Create follow-up reminder" },
  { code: "notify_executive", label: "Notify assignee" },
  { code: "close_order", label: "Auto-close order" },
] as const;

export function AutomationRulesTab() {
  const qc = useQueryClient();
  const fnList = useServerFn(listAutomationRules);
  const fnDel = useServerFn(deleteAutomationRule);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["automation-rules"],
    queryFn: () => fnList({ data: {} as never }),
  });
  const del = useMutation({
    mutationFn: (id: string) => fnDel({ data: { id } }),
    onSuccess: () => {
      toast.success("Deactivated");
      qc.invalidateQueries({ queryKey: ["automation-rules"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <SectionCard
      title="Automation Rules"
      action={
        <button
          onClick={() => { setEditing(null); setOpen(true); }}
          className="inline-flex items-center gap-1 text-xs rounded-md px-2 py-1 border"
          style={{ borderColor: "var(--admin-border)", color: "var(--admin-fg)" }}
        >
          <Plus className="size-3" /> New rule
        </button>
      }
    >
      <div className="px-4 pt-3 text-xs text-muted-foreground">
        Rules override the default 3 / 5 / 7-day follow-up cadence for the chosen status. Email templates must already exist (see Email Templates).
      </div>
      {isLoading ? (
        <div className="p-4 text-sm text-muted-foreground">Loading…</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs" style={{ color: "var(--admin-fg-muted)" }}>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Trigger status</th>
              <th className="text-left px-4 py-2">Wait</th>
              <th className="text-left px-4 py-2">Action</th>
              <th className="text-left px-4 py-2">Template</th>
              <th className="text-left px-4 py-2">Repeat</th>
              <th className="text-left px-4 py-2">Active</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {(data?.rules ?? []).map((r: any) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--admin-border)" }}>
                <td className="px-4 py-2">{r.name}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.trigger_status}</td>
                <td className="px-4 py-2 tabular-nums">{r.wait_days}d</td>
                <td className="px-4 py-2 text-xs">{ACTIONS.find((a) => a.code === r.action_type)?.label ?? r.action_type}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.template_code || "—"}</td>
                <td className="px-4 py-2 tabular-nums">{r.repeat_count}×</td>
                <td className="px-4 py-2">{r.is_active ? "Yes" : "No"}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button onClick={() => { setEditing(r); setOpen(true); }} className="text-xs inline-flex items-center gap-1 px-2 py-1"><Pencil className="size-3" /> Edit</button>
                  {r.is_active && (
                    <button onClick={() => del.mutate(r.id)} className="text-xs inline-flex items-center gap-1 px-2 py-1 text-rose-600"><Trash2 className="size-3" /> Deactivate</button>
                  )}
                </td>
              </tr>
            ))}
            {!data?.rules?.length && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">No automation rules yet — engine will use the default 3 / 5 / 7-day cadence.</td></tr>
            )}
          </tbody>
        </table>
      )}
      {open && <RuleDialog initial={editing} onClose={() => setOpen(false)} />}
    </SectionCard>
  );
}

function RuleDialog({ initial, onClose }: { initial: any | null; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(upsertAutomationRule);
  const [name, setName] = useState(initial?.name ?? "");
  const [triggerStatus, setTriggerStatus] = useState<string>(initial?.trigger_status ?? STATUSES[0]);
  const [waitDays, setWaitDays] = useState<number>(initial?.wait_days ?? 3);
  const [actionType, setActionType] = useState<any>(initial?.action_type ?? "send_template");
  const [templateCode, setTemplateCode] = useState<string>(initial?.template_code ?? "");
  const [repeatCount, setRepeatCount] = useState<number>(initial?.repeat_count ?? 1);
  const [isActive, setIsActive] = useState<boolean>(initial?.is_active ?? true);

  const mut = useMutation({
    mutationFn: () => fn({
      data: {
        id: initial?.id,
        name,
        triggerStatus,
        waitDays,
        actionType,
        templateCode: templateCode || null,
        repeatCount,
        isActive,
      },
    }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["automation-rules"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">{initial ? "Edit rule" : "New automation rule"}</div>
          <button onClick={onClose}><X className="size-4" /></button>
        </div>
        <div className="space-y-3 text-sm">
          <L label="Rule name">
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border bg-background px-2 py-1.5" />
          </L>
          <div className="grid grid-cols-2 gap-3">
            <L label="Trigger status">
              <select value={triggerStatus} onChange={(e) => setTriggerStatus(e.target.value)} className="w-full rounded-md border bg-background px-2 py-1.5">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </L>
            <L label="Wait days">
              <input type="number" min={0} value={waitDays} onChange={(e) => setWaitDays(Number(e.target.value) || 0)} className="w-full rounded-md border bg-background px-2 py-1.5" />
            </L>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <L label="Action">
              <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="w-full rounded-md border bg-background px-2 py-1.5">
                {ACTIONS.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
              </select>
            </L>
            <L label="Repeat count">
              <input type="number" min={1} value={repeatCount} onChange={(e) => setRepeatCount(Number(e.target.value) || 1)} className="w-full rounded-md border bg-background px-2 py-1.5" />
            </L>
          </div>
          <L label="Email template code (only used when action is 'Send email template')">
            <input value={templateCode} onChange={(e) => setTemplateCode(e.target.value)} placeholder="e.g. workflow_processing_update_3d" className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs" />
          </L>
          <L label="Active">
            <select value={isActive ? "y" : "n"} onChange={(e) => setIsActive(e.target.value === "y")} className="w-full rounded-md border bg-background px-2 py-1.5">
              <option value="y">Yes</option>
              <option value="n">No</option>
            </select>
          </L>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending || !name} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground inline-flex items-center gap-2 disabled:opacity-50">
            {mut.isPending && <Loader2 className="size-3 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
