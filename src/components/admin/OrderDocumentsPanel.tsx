import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Upload, Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

import {
  requestOrderDocumentUpload, confirmOrderDocumentUpload, getOrderDocumentSignedUrl,
} from "@/lib/crm/orders-v2.functions";

export function OrderDocumentsPanel({
  orderId, documents, deletedAt, deletedReason, hideMoney = false,
}: {
  orderId: string;
  documents: any[];
  deletedAt?: string | null;
  deletedReason?: string | null;
  hideMoney?: boolean;
}) {
  const qc = useQueryClient();
  const urlFn = useServerFn(getOrderDocumentSignedUrl);
  const [uploadOpen, setUploadOpen] = useState(false);
  const visibleDocs = hideMoney
    ? documents.filter((d) => !/invoice/i.test(String(d.doc_type ?? "")))
    : documents;

  const open = async (path: string) => {
    try {
      const { url, error } = await urlFn({ data: { path } });
      if (!url) {
        toast.error(error ?? "Failed to open document");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to open document");
    }
  };

  return (
    <div className="rounded-lg border bg-white p-5 space-y-3" style={{ borderColor: "var(--admin-border)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-slate-600" />
          <h3 className="text-sm font-semibold">Documents</h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
          <Upload className="size-3 mr-1" /> Upload
        </Button>
      </div>

      {deletedAt && (
        <div className="rounded-md bg-rose-50 border border-rose-200 p-2 text-xs text-rose-800">
          Customer documents deleted on{" "}
          <b>{new Date(deletedAt).toLocaleString("en-IN")}</b>
          {deletedReason ? <> — reason: <b>{deletedReason}</b></> : null}.
          <div className="mt-0.5 text-rose-700/80">Privacy policy compliance — only the certificate is retained.</div>
        </div>
      )}

      {visibleDocs.length === 0 ? (
        <div className="text-xs text-slate-500 italic">No documents on file.</div>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--admin-border)" }}>
          {visibleDocs.map((d) => (
            <li key={d.id} className="py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{d.file_name}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                  {d.doc_type} · {(Number(d.size_bytes ?? 0) / 1024).toFixed(0)} KB ·{" "}
                  {new Date(d.uploaded_at ?? d.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => open(d.file_path)} className="text-blue-600">
                <Download className="size-3 mr-1" /> Open
              </Button>
            </li>
          ))}
        </ul>
      )}

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        orderId={orderId}
        onDone={() => qc.invalidateQueries({ queryKey: ["admin.order", orderId] })}
      />
    </div>
  );
}

function UploadDialog({
  open, onOpenChange, orderId, onDone,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; orderId: string; onDone: () => void;
}) {
  const requestFn = useServerFn(requestOrderDocumentUpload);
  const confirmFn = useServerFn(confirmOrderDocumentUpload);
  const [docType, setDocType] = useState("acknowledgement");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!file) { toast.error("Pick a file"); return; }
    if (file.size === 0) {
      toast.error("The selected file is empty (0 bytes). Please select a valid file.");
      return;
    }
    if (!docType.trim()) { toast.error("Doc type required"); return; }
    setBusy(true);
    try {
      const { path, token } = await requestFn({
        data: {
          orderId, docType: docType.trim(), fileName: file.name,
          mimeType: file.type || "application/octet-stream", sizeBytes: file.size,
        },
      });
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.storage.from("documents").uploadToSignedUrl(path, token, file, {
        contentType: file.type || undefined, upsert: true,
      });
      if (error) throw error;
      await confirmFn({
        data: {
          orderId, docType: docType.trim(), filePath: path, fileName: file.name,
          mimeType: file.type || "application/octet-stream", sizeBytes: file.size,
        },
      });
      toast.success("Document uploaded");
      onDone(); onOpenChange(false); setFile(null);
    } catch (e: any) {
      let msg = e?.message ?? "Upload failed";
      try {
        const parsed = JSON.parse(msg);
        if (Array.isArray(parsed) && parsed[0]) {
          if (parsed[0]?.path?.includes("sizeBytes")) {
            msg = "The selected file is empty (0 bytes). Please upload a valid document.";
          } else if (parsed[0]?.message) {
            msg = parsed[0].message;
          }
        }
      } catch {}
      toast.error(msg);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Document type</Label>
            <Input value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="acknowledgement" />
          </div>
          <div>
            <Label className="text-xs">File (PDF, JPG, PNG, WEBP — max 15 MB)</Label>
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !file}>
            {busy ? <><Loader2 className="size-3 animate-spin mr-1" />Uploading…</> : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
