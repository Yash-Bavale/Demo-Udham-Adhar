import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { getDocumentSignedUrl } from "@/lib/onboarding/onboarding.functions";
import { requestOrderDocumentUpload, confirmOrderDocumentUpload } from "@/lib/crm/orders-v2.functions";
import { mergeDocumentsInBrowser } from "@/lib/disputes/dispute-browser-pdf";

export type MergeableDoc = { id: string; doc_type: string; file_name: string; mime_type?: string | null; label: string };

/** Default order: signed form → Aadhaar → PAN → everything else. */
function rank(d: MergeableDoc): number {
  const s = `${d.doc_type} ${d.label}`.toLowerCase();
  if (/sign|standard.?form|form/.test(s)) return 0;
  if (/aadha?ar/.test(s)) return 1;
  if (/\bpan\b|pan.?card|pan_/.test(s)) return 2;
  return 3;
}

export function MergeDocumentsDialog({
  open, onOpenChange, applicationId, applicationCode, documents, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  applicationId: string;
  applicationCode?: string | null;
  documents: MergeableDoc[];
  onSaved: () => void;
}) {
  const urlFn = useServerFn(getDocumentSignedUrl);
  const requestFn = useServerFn(requestOrderDocumentUpload);
  const confirmFn = useServerFn(confirmOrderDocumentUpload);
  const [items, setItems] = useState<(MergeableDoc & { selected: boolean })[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    const sorted = [...documents]
      .filter((d) => !/^merged/i.test(d.doc_type))
      .sort((a, b) => rank(a) - rank(b));
    setItems(sorted.map((d) => ({ ...d, selected: rank(d) < 3 || sorted.length <= 3 })));
  }, [open, documents]);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };

  const merge = async () => {
    const chosen = items.filter((d) => d.selected);
    if (chosen.length === 0) { toast.error("Select at least one document"); return; }
    setBusy(true);
    try {
      const files = [];
      for (const d of chosen) {
        const { url } = await urlFn({ data: { id: d.id } });
        files.push({ url, mimeType: d.mime_type, label: d.label });
      }
      const bytes = await mergeDocumentsInBrowser(files);
      const code = String(applicationCode || applicationId.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, "_");
      const fileName = `merged-documents-${code}.pdf`;
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const { path, token } = await requestFn({
        data: { orderId: applicationId, docType: "merged_documents", fileName, mimeType: "application/pdf", sizeBytes: blob.size },
      });
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.storage.from("documents").uploadToSignedUrl(path, token, blob, { contentType: "application/pdf", upsert: true });
      if (error) throw error;
      await confirmFn({
        data: { orderId: applicationId, docType: "merged_documents", filePath: path, fileName, mimeType: "application/pdf", sizeBytes: blob.size },
      });
      setResult({ url: URL.createObjectURL(blob), name: fileName });
      toast.success("Merged PDF saved to the order");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not merge documents");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge PDF</DialogTitle>
          <DialogDescription>Tick the documents to include and arrange the order. Originals stay unchanged.</DialogDescription>
        </DialogHeader>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No customer documents uploaded yet.</p>
        ) : (
          <ol className="space-y-1.5">
            {items.map((d, i) => (
              <li key={d.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                <Checkbox
                  checked={d.selected}
                  onCheckedChange={(v) => setItems(items.map((x, k) => (k === i ? { ...x, selected: !!v } : x)))}
                />
                <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{d.label}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{d.file_name}</div>
                </div>
                <Button size="icon" variant="ghost" className="size-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="size-7" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  <ArrowDown className="size-3.5" />
                </Button>
              </li>
            ))}
          </ol>
        )}

        {result && (
          <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="truncate">{result.name}</span>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => window.open(result.url, "_blank", "noopener")}>
                <Eye className="size-3.5 mr-1" /> View
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={result.url} download={result.name}><Download className="size-3.5 mr-1" /> Download</a>
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
          <Button onClick={merge} disabled={busy || items.every((d) => !d.selected)}>
            {busy ? <><Loader2 className="size-3.5 mr-1 animate-spin" /> Merging…</> : "Merge PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
