import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Upload, AlertTriangle, FileCheck2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

import {
  FULFILLMENT_BADGE, FULFILLMENT_LABEL,
  getAllowedFulfillmentTransitions, type FulfillmentStatus,
} from "@/lib/crm/fulfillment-transitions";
import {
  updateFulfillmentStatus, requestOrderDocumentUpload, confirmOrderDocumentUpload,
  getOrderDetailV2,
} from "@/lib/crm/orders-v2.functions";

export function FulfillmentStatusUpdater({
  orderId, current, adminOverride = false,
}: { orderId: string; current: FulfillmentStatus; adminOverride?: boolean }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateFulfillmentStatus);
  const strictAllowed = getAllowedFulfillmentTransitions(current);
  // With admin override on, expose every stage in the dropdown so the operator
  // can jump to any point in the fulfillment flow.
  const ALL_STAGES: FulfillmentStatus[] = Object.keys(FULFILLMENT_LABEL) as FulfillmentStatus[];
  const allowed = adminOverride
    ? ALL_STAGES.filter((s) => s !== current)
    : strictAllowed;

  const [target, setTarget] = useState<FulfillmentStatus | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [certOpen, setCertOpen] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin.order", orderId] });
  };

  const doUpdate = async (extra?: {
    certificateDocumentId?: string;
    certificateNumber?: string;
    completionNotes?: string;
    ccEmail?: string;
  }) => {
    if (!target) return;
    setBusy(true);
    try {
      await updateFn({
        data: {
          orderId,
          toStatus: target,
          note: note || undefined,
          adminOverride: adminOverride || undefined,
          ...extra,
        },
      });
      toast.success(
        target === "completed"
          ? "Order completed. Certificate emailed to customer."
          : `Status → ${FULFILLMENT_LABEL[target as FulfillmentStatus]}`,
      );
      setTarget(""); setNote(""); setCertOpen(false);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border bg-white p-5 space-y-3" style={{ borderColor: "var(--admin-border)" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Fulfillment Status</div>
          <span className={`inline-flex items-center px-3 py-1.5 rounded-md border text-sm font-semibold ${FULFILLMENT_BADGE[current]}`}>
            {FULFILLMENT_LABEL[current]}
          </span>
        </div>
      </div>

      {allowed.length === 0 ? (
        <div className="text-sm text-slate-500 italic">Terminal status — no further transitions.</div>
      ) : (
        <div className="space-y-2">
          <Label className="text-xs">Move to</Label>
          <div className="flex flex-wrap gap-2">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as FulfillmentStatus)}
              className="flex-1 min-w-[200px] rounded-md border px-2 py-1.5 text-sm bg-white"
            >
              <option value="">Select next stage…</option>
              {allowed.map((s) => (
                <option key={s} value={s}>{FULFILLMENT_LABEL[s]}</option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!target || busy}
              onClick={() => {
                if (target === "completed") setCertOpen(true);
                else doUpdate();
              }}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              {busy && <Loader2 className="size-3 animate-spin mr-1" />}
              Update Status
            </Button>
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for the activity timeline"
            rows={2}
            className="text-xs"
          />
        </div>
      )}

      <CompletionGateDialog
        open={certOpen}
        onOpenChange={setCertOpen}
        orderId={orderId}
        busy={busy}
        onConfirm={(payload) => doUpdate(payload)}
      />
    </div>
  );
}

/**
 * COMPLETION GATE — 3 required steps before an order can move to `completed`:
 *   1. Upload certificate (PDF/JPG/PNG, ≤10MB)
 *   2. Certificate / document number (required)
 *   3. Completion notes (optional)
 * Email is auto-queued to the customer; the order moves to COMPLETED only
 * after the email payload is enqueued successfully.
 */
function CompletionGateDialog({
  open, onOpenChange, orderId, busy, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  busy: boolean;
  onConfirm: (payload: {
    certificateDocumentId: string;
    certificateNumber: string;
    completionNotes?: string;
    ccEmail?: string;
  }) => void;
}) {
  const requestFn = useServerFn(requestOrderDocumentUpload);
  const confirmFn = useServerFn(confirmOrderDocumentUpload);
  const detailFn = useServerFn(getOrderDetailV2);

  const [file, setFile] = useState<File | null>(null);
  const [certNumber, setCertNumber] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Resolve the customer email for the "will be sent to" line.
  const { data: detail } = useQuery({
    enabled: open,
    queryKey: ["admin.order.recipient", orderId],
    queryFn: () => detailFn({ data: { orderId } }),
    staleTime: 30_000,
  });
  const recipientEmail =
    ((detail as any)?.customer?.primary_email ?? "").trim() ||
    ((detail as any)?.lead?.email ?? "").trim() ||
    null;
  const serviceName =
    (detail as any)?.service?.service_name ||
    (detail as any)?.lead?.service ||
    "this service";

  useEffect(() => {
    if (!open) {
      setFile(null); setCertNumber(""); setCompletionNotes(""); setCcEmail(""); setShowCc(false);
      setUploading(false); setDragOver(false);
    }
  }, [open]);

  const MAX_BYTES = 10 * 1024 * 1024;
  const tooBig = file ? file.size > MAX_BYTES : false;
  const isEmpty = file ? file.size === 0 : false;

  const submit = async () => {
    if (!file) { toast.error("Upload the certificate file."); return; }
    if (file.size === 0) {
      toast.error("The selected file is empty (0 bytes). Please re-download or select a valid certificate file.");
      return;
    }
    if (tooBig) { toast.error("File exceeds 10 MB limit."); return; }
    if (!certNumber.trim()) { toast.error("Certificate / document number is required."); return; }
    if (!recipientEmail) {
      toast.error("Customer has no email on file — cannot deliver certificate.");
      return;
    }
    if (ccEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(ccEmail.trim())) {
        toast.error("Please enter a valid CC email address.");
        return;
      }
    }
    setUploading(true);
    try {
      const { path, token } = await requestFn({
        data: {
          orderId,
          docType: "certificate",
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        },
      });
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.storage.from("documents").uploadToSignedUrl(path, token, file, {
        contentType: file.type || undefined,
        upsert: true,
      });
      if (error) throw error;
      const { documentId } = await confirmFn({
        data: {
          orderId,
          docType: "certificate",
          filePath: path,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        },
      });
      onConfirm({
        certificateDocumentId: documentId,
        certificateNumber: certNumber.trim(),
        completionNotes: completionNotes.trim() || undefined,
        ccEmail: ccEmail.trim() || undefined,
      });
    } catch (e: any) {
      let msg = e?.message ?? "Upload failed";
      try {
        const parsed = JSON.parse(msg);
        if (Array.isArray(parsed) && parsed[0]) {
          if (parsed[0]?.path?.includes("sizeBytes")) {
            msg = "The selected file is empty (0 bytes). Please upload a valid certificate file.";
          } else if (parsed[0]?.message) {
            msg = parsed[0].message;
          }
        }
      } catch {}
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck2 className="size-4 text-emerald-600" />
            Complete Service — {serviceName}
          </DialogTitle>
          <DialogDescription>
            Three quick steps. The order will move to <strong>Completed</strong> only after the
            certificate email is queued for the customer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* STEP 1 — File upload */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Step 1 — Upload Certificate
            </Label>
            <label
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) setFile(f);
              }}
              className={`block w-full cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
                dragOver ? "border-[#1e3a5f] bg-blue-50/50" : "border-slate-300 bg-slate-50 hover:bg-slate-100"
              }`}
            >
              <Upload className="size-5 mx-auto mb-1.5 text-slate-500" />
              <div className="text-sm text-slate-700">
                {file ? "Replace file" : "Drag & drop or click to upload"}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">PDF, JPG, PNG — max 10 MB</div>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {file && (
              <div className={`text-xs ${tooBig || isEmpty ? "text-red-600 font-medium" : "text-slate-600"}`}>
                {file.name} · {(file.size / 1024).toFixed(0)} KB
                {tooBig ? " — exceeds 10 MB" : isEmpty ? " — empty file (0 KB), please choose a valid file" : ""}
              </div>
            )}
          </div>

          {/* STEP 2 — Number */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Step 2 — Certificate / Document Number <span className="text-red-500">*</span>
            </Label>
            <Input
              value={certNumber}
              onChange={(e) => setCertNumber(e.target.value)}
              placeholder="e.g. UDYAM-MH-28-0012345"
              autoComplete="off"
            />
          </div>

          {/* STEP 3 — Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Step 3 — Completion Notes <span className="text-slate-400 font-normal lowercase">(optional)</span>
            </Label>
            <Textarea
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              placeholder="Internal notes about this completion (included in the customer email if filled)"
              rows={3}
            />
          </div>

          {/* Recipient panel */}
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex gap-2">
                <Mail className="size-3.5 mt-0.5 text-slate-500 flex-shrink-0" />
                <div className="text-slate-700">
                  <div className="font-medium">Certificate will be emailed to (To):</div>
                  <div className="font-mono text-slate-900">{recipientEmail ?? "— no email on file —"}</div>
                </div>
              </div>
              {!showCc && !ccEmail && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-[#1e3a5f]"
                  onClick={() => setShowCc(true)}
                  disabled={uploading || busy}
                >
                  + Add CC
                </Button>
              )}
            </div>

            {(showCc || ccEmail) && (
              <div className="pt-2 border-t border-slate-200 space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ff-cc-email" className="text-xs font-medium text-slate-700">
                    CC Email <span className="font-normal text-slate-400">(optional)</span>
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] text-slate-400 hover:text-red-600"
                    onClick={() => { setCcEmail(""); setShowCc(false); }}
                    disabled={uploading || busy}
                  >
                    Remove CC
                  </Button>
                </div>
                <Input
                  id="ff-cc-email"
                  type="email"
                  value={ccEmail}
                  onChange={(e) => setCcEmail(e.target.value)}
                  disabled={uploading || busy}
                  placeholder="e.g. partner@example.com"
                  className="h-8 text-xs bg-white"
                />
              </div>
            )}
          </div>

          <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-900 flex gap-2">
            <AlertTriangle className="size-3.5 mt-0.5 flex-shrink-0" />
            <div>
              The application moves to <strong>COMPLETED</strong> only after the certificate email is
              queued. All other customer documents for this order are then permanently deleted
              (only the certificate is kept).
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading || busy}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={uploading || busy || !file || tooBig || !certNumber.trim() || !recipientEmail}
            className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
          >
            {uploading || busy
              ? <><Loader2 className="size-3 animate-spin mr-1" /> Uploading…</>
              : <>Upload &amp; Send Certificate →</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
