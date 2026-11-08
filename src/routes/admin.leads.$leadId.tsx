import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatIST } from "@/lib/datetime";
import { getLead, addLeadNote, listStaff } from "@/lib/crm/leads-admin.functions";
import { LeadTimeline } from "@/components/admin/LeadTimeline";
import { LeadWorkspacePanel } from "@/components/admin/LeadWorkspacePanel";
import { AddTaskDialog } from "@/components/admin/AddTaskDialog";
import { ChangeServiceDialog } from "@/components/admin/ChangeServiceDialog";
import { useRole } from "@/hooks/useRole";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import {
  ChevronLeft,
  User,
  History,
  MessageSquare,
  LayoutGrid,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/leads/$leadId")({ component: LeadDetailPage });

function LeadDetailPage() {
  const { leadId } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getLead);
  const noteFn = useServerFn(addLeadNote);
  const staffFn = useServerFn(listStaff);
  const role = useRole();
  const userPerms = usePermissions();

  const { data, isLoading } = useQuery({
    queryKey: ["admin.lead", leadId],
    queryFn: () => getFn({ data: { id: leadId } }),
    enabled: userPerms.can("leads", "view") || userPerms.isLoading,
  });

  const { data: staffData } = useQuery({
    queryKey: ["admin.staff"],
    queryFn: () => staffFn(),
  });

  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!userPerms.isLoading && !userPerms.can("leads", "view")) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200 space-y-3 my-6">
        <ShieldAlert className="size-10 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">Access Denied</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          You do not have permission to view the Leads module. Please contact your administrator if you need access.
        </p>
      </div>
    );
  }

  if (isLoading) return <div className="p-10 text-center text-slate-500">Loading lead details…</div>;
  if (!data) return null;
  const { lead, applications, notes } = data;
  const canEditLead = role.hasAny(["super_admin", "operations", "admin", "manager", "executive"]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="inline-flex items-center text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to leads
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="font-mono text-[11px]">{lead.lead_code}</Badge>
          <Badge variant="outline" className="font-sans text-[10px] uppercase tracking-wider bg-slate-50">
            {lead.status.replace(/_/g, " ")}
          </Badge>
          <ChangeServiceDialog
            leadId={leadId}
            currentService={lead.service}
            currentAmount={lead.total_amount}
            disabled={!canEditLead}
          />
          <AddTaskDialog defaultLeadId={leadId} />
        </div>
      </div>


      <Tabs defaultValue="workspace" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 bg-slate-100/50 border mb-6">
          <TabsTrigger value="workspace" className="gap-2 py-2 px-4"><LayoutGrid className="w-4 h-4" /> Workspace</TabsTrigger>
          <TabsTrigger value="timeline" className="gap-2 py-2 px-4"><History className="w-4 h-4" /> Timeline</TabsTrigger>
          <TabsTrigger value="notes" className="gap-2 py-2 px-4"><MessageSquare className="w-4 h-4" /> Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="workspace">
          <LeadWorkspacePanel
            lead={lead as any}
            applications={applications}
            staff={((Array.isArray(staffData) ? staffData : staffData?.profiles) ?? []) as any}
          />
        </TabsContent>

        <TabsContent value="timeline">
          <LeadTimeline leadId={leadId} />
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Internal Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add an internal note for staff…"
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
                <Button
                  disabled={busy || !note.trim()}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await noteFn({ data: { lead_id: leadId, note: note.trim() } });
                      setNote("");
                      toast.success("Note added");
                      await qc.invalidateQueries({ queryKey: ["admin.lead", leadId] });
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Add Note
                </Button>
              </div>
              <ul className="space-y-4 pt-4">
                {notes.map((n: any) => (
                  <li key={n.id} className="flex gap-4 pb-4 border-b last:border-0 last:pb-0">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-slate-400 flex items-center gap-2">
                        {n.user_id ? "Staff Member" : "System"} • {formatIST(n.created_at)}
                      </div>
                      <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        {n.note}
                      </div>
                    </div>
                  </li>
                ))}
                {notes.length === 0 && (
                  <li className="text-center py-8 text-sm text-slate-400 italic">No internal notes yet.</li>
                )}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
