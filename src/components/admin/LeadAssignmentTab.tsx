import { isVisibleService } from "@/lib/crm/visible-services";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, UserMinus, Power, Shuffle } from "lucide-react";
import {
  getAssignmentConfig,
  setAutoAssignEnabled,
  listAssignmentPool,
  listEligibleEmployees,
  addToPool,
  togglePoolActive,
  removeFromPool,
} from "@/lib/crm/assignment.functions";
import { listServices } from "@/lib/crm/services-admin.functions";
import { SectionCard } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function formatIST(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const fmt = new Intl.DateTimeFormat("en-IN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
      timeZone: "Asia/Kolkata",
    }).formatToParts(d);
    const get = (t: string) => fmt.find((p) => p.type === t)?.value ?? "";
    return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()}`;
  } catch { return "—"; }
}

export function LeadAssignmentTab() {
  const qc = useQueryClient();
  const cfgFn = useServerFn(getAssignmentConfig);
  const setEnabledFn = useServerFn(setAutoAssignEnabled);
  const poolFn = useServerFn(listAssignmentPool);
  const eligibleFn = useServerFn(listEligibleEmployees);
  const svcFn = useServerFn(listServices);
  const addFn = useServerFn(addToPool);
  const toggleFn = useServerFn(togglePoolActive);
  const removeFn = useServerFn(removeFromPool);

  const { data: cfg } = useQuery({ queryKey: ["assign.cfg"], queryFn: () => cfgFn() });
  const { data: pool, isLoading } = useQuery({ queryKey: ["assign.pool"], queryFn: () => poolFn() });
  const { data: eligible } = useQuery({ queryKey: ["assign.eligible"], queryFn: () => eligibleFn() });
  const { data: services } = useQuery({ queryKey: ["admin.services"], queryFn: () => svcFn() });

  const [addOpen, setAddOpen] = useState(false);
  const isEnabled = cfg?.config?.is_active ?? false;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["assign.cfg"] });
    qc.invalidateQueries({ queryKey: ["assign.pool"] });
  };

  return (
    <div className="space-y-5">
      <SectionCard>
        <div className="p-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium flex items-center gap-2">
              <Shuffle className="size-4 text-indigo-600" /> Round-Robin Auto-Assignment for Orders & Leads
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--admin-fg-muted)" }}>
              When ON, every new lead and paid order is automatically assigned to a dedicated active employee with order access.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-xs">{isEnabled ? "ON" : "OFF"}</Label>
            <Switch
              checked={isEnabled}
              onCheckedChange={async (v) => {
                try {
                  await setEnabledFn({ data: { enabled: v } });
                  toast.success(v ? "Auto-assignment enabled" : "Auto-assignment disabled");
                  refresh();
                } catch (e) { toast.error((e as Error).message); }
              }}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <div className="p-4 flex items-center justify-between">
          <div className="text-sm font-medium">Assignment Pool</div>
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" /> Add to Pool
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "var(--admin-fg-muted)" }}>
                <th className="px-4 py-2">Employee</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Service</th>
                <th className="px-4 py-2">Active</th>
                <th className="px-4 py-2">Last Assigned</th>
                <th className="px-4 py-2">Total Assigned</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-xs" style={{ color: "var(--admin-fg-muted)" }}>Loading…</td></tr>
              )}
              {!isLoading && (pool?.rows ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center">
                  <div className="text-sm">No one in the pool yet.</div>
                  <Button size="sm" className="mt-3 gap-1.5" onClick={() => setAddOpen(true)}>
                    <Plus className="size-3.5" /> Add to Pool
                  </Button>
                </td></tr>
              )}
              {(pool?.rows ?? []).map((r, i) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--admin-border)", background: i % 2 ? "var(--admin-surface-2)" : "transparent" }}>
                  <td className="px-4 py-2.5">{r.user_name}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {(r.user_roles[0] ?? "—").replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-2.5">{r.service_name}</td>
                  <td className="px-4 py-2.5">
                    <Switch
                      checked={r.is_active}
                      onCheckedChange={async (v) => {
                        try {
                          await toggleFn({ data: { id: r.id, isActive: v } });
                          refresh();
                        } catch (e) { toast.error((e as Error).message); }
                      }}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: "var(--admin-fg-muted)" }}>{formatIST(r.last_assigned_at)}</td>
                  <td className="px-4 py-2.5">{r.total_assigned}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button size="sm" variant="ghost" className="h-7 gap-1"
                      style={{ color: "#b91c1c" }}
                      onClick={async () => {
                        if (!confirm(`Remove ${r.user_name} from the assignment pool?`)) return;
                        try {
                          await removeFn({ data: { id: r.id } });
                          toast.success("Removed from pool");
                          refresh();
                        } catch (e) { toast.error((e as Error).message); }
                      }}>
                      <UserMinus className="size-3.5" /> Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <AddToPoolDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        employees={eligible?.rows ?? []}
        services={(services?.rows ?? []).filter((s: any) => isVisibleService(s)).map((s: any) => ({ id: s.id, name: s.service_name }))}
        onAdded={() => { setAddOpen(false); refresh(); }}
      />
    </div>
  );
}

function AddToPoolDialog({
  open, onClose, employees, services, onAdded,
}: {
  open: boolean;
  onClose: () => void;
  employees: { id: string; name: string; role: string }[];
  services: { id: string; name: string }[];
  onAdded: () => void;
}) {
  const addFn = useServerFn(addToPool);
  const [userId, setUserId] = useState<string>("");
  const [serviceId, setServiceId] = useState<string>("__all");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!userId) { toast.error("Pick an employee"); return; }
    setBusy(true);
    try {
      await addFn({ data: { userId, serviceId: serviceId === "__all" ? null : serviceId } });
      toast.success("Added to pool");
      setUserId(""); setServiceId("__all");
      onAdded();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Employee to Pool</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Employee (executives / managers)</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {employees.length === 0 && <SelectItem value="__none" disabled>No eligible employees</SelectItem>}
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name} · {e.role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Service</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All Services</SelectItem>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Adding…" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
