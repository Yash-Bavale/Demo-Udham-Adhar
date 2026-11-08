import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MessageSquare, StickyNote, ShieldAlert, ArrowLeft } from "lucide-react";

import { getOrderDetailV2, updateOrderAssignee, addOrderNoteV2 } from "@/lib/crm/orders-v2.functions";
import { listStaff } from "@/lib/crm/leads-admin.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { WorkspaceShell } from "@/components/admin/workspace/WorkspaceShell";
import { ExceptionBanner } from "@/components/admin/workspace/ExceptionBanner";
import { TicketPanel } from "@/components/admin/workspace/TicketPanel";
import { computeOrderStage, type OrderStage } from "@/lib/crm/computeOrderStage";
import { isConvertedConsultationLead, isUnconvertedConsultationLead } from "@/lib/crm/consultation";
import { useRole } from "@/hooks/useRole";

export const Route = createFileRoute("/admin/orders/$orderId")({ component: OrderDetailPage });

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const qc = useQueryClient();
  const role = useRole();
  const detailFn = useServerFn(getOrderDetailV2);
  const staffFn = useServerFn(listStaff);
  const assignFn = useServerFn(updateOrderAssignee);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin.order", orderId],
    queryFn: () => detailFn({ data: { orderId } }),
    retry: false,
  });
  const { data: staffData } = useQuery({
    queryKey: ["admin.staff"],
    queryFn: () => staffFn(),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-16 rounded-2xl bg-gradient-to-r from-indigo-100 to-cyan-100" />
        <div className="h-24 rounded-2xl bg-slate-100" />
        <div className="h-12 rounded-2xl bg-slate-100" />
        <div className="h-96 rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-white rounded-2xl border border-slate-200 mt-6 shadow-xs">
        <div className="p-4 bg-rose-50 text-rose-600 rounded-full mb-4">
          <ShieldAlert className="size-10" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p className="text-sm text-slate-500 max-w-md mb-6 leading-relaxed">
          {(error as any)?.message || "You do not have permission to view this order. Employees can only view orders assigned to them."}
        </p>
        <Link to="/admin/orders">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="size-4" /> Return to Orders
          </Button>
        </Link>
      </div>
    );
  }

  const { application, lead, paymentSuccessfulAt, stageMeta } = data as any;
  const stage: OrderStage = computeOrderStage({ ...(lead ?? {}), payment_successful_at: paymentSuccessfulAt }, application);
  const selectStep = !!lead?.id && !!lead?.lead_code && isUnconvertedConsultationLead(lead);
  const awaitingSecondPayment =
    !!lead?.id && !!lead?.lead_code &&
    isConvertedConsultationLead(lead) &&
    (application as any)?.application_status === "awaiting_payment";
  const showConsultationPanel = selectStep || awaitingSecondPayment;
  const consultationMode: "select" | "awaiting_payment" = selectStep ? "select" : "awaiting_payment";

  const hideAmount = role.hideMoney();

  const timestamps: Partial<Record<OrderStage, string | null>> = {
    lead_received: application.created_at,
    payment_done: paymentSuccessfulAt ?? null,
    form_submitted: application?.form_submitted_at ?? null,
    under_review: stageMeta?.verification_pending?.at ?? null,
    in_progress: stageMeta?.documents_received?.at ?? null,
    submitted_to_govt: stageMeta?.application_submitted?.at ?? null,
    certificate_ready: application?.certificate_uploaded_at ?? null,
    completed: stageMeta?.completed?.at ?? null,
  };

  const setAssignee = async (v: string | null) => {
    try {
      await assignFn({ data: { orderId, assignedTo: v } });
      toast.success("Assignee updated");
      qc.invalidateQueries({ queryKey: ["admin.order", orderId] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  return (
    <WorkspaceShell
      orderId={orderId}
      data={data}
      hideAmount={hideAmount}
      staff={Array.isArray(staffData) ? staffData : (staffData?.profiles ?? [])}
      onAssign={setAssignee}
      stage={stage}
      timestamps={timestamps}
      showConsultationPanel={showConsultationPanel}
      consultationMode={consultationMode}
      canComplete={!role.has("support")}
      notesNode={null}
    />
  );
}

function InternalNotes({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const noteFn = useServerFn(addOrderNoteV2);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await noteFn({ data: { orderId, note: note.trim() } });
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin.order", orderId] });
      toast.success("Note added");
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/40 to-white p-5 space-y-3 shadow-sm">
      <div className="flex items-center gap-2">
        <StickyNote className="size-4 text-amber-600" />
        <h3 className="text-sm font-bold text-slate-900">Add Internal Note</h3>
      </div>
      <Label className="text-[10px] uppercase tracking-wider text-slate-500">
        <MessageSquare className="size-3 inline mr-1" />
        Visible to staff only — appears in the timeline below
      </Label>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Type a note…" rows={3} />
      <div className="flex justify-end">
        <Button size="sm" disabled={busy || !note.trim()} onClick={submit} className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:opacity-90">
          {busy ? "Saving…" : "Add Note"}
        </Button>
      </div>
    </div>
  );
}
