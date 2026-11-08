import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, UploadCloud, AlertTriangle, FileCheck2, Mail, Check, FileText, Send, CircleCheck, Info, X, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

import {
  requestOrderDocumentUpload, confirmOrderDocumentUpload, getOrderDetailV2,
} from "@/lib/crm/orders-v2.functions";

export function CompletionGateDialogStandalone({
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
  }) => Promise<void>;
}) {
  const requestFn = useServerFn(requestOrderDocumentUpload);
  const confirmFn = useServerFn(confirmOrderDocumentUpload);
  const detailFn = useServerFn(getOrderDetailV2);

  const [file, setFile] = useState<File | null>(null);
  const [certNumber, setCertNumber] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [stage, setStage] = useState<"idle" | "uploading" | "preparing" | "sending" | "success">("idle");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numberTouched, setNumberTouched] = useState(false);
  const [uploaded, setUploaded] = useState<{ file: File; documentId: string } | null>(null);
  const [sendingConfirmed, setSendingConfirmed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    (detail as any)?.service?.service_name || (detail as any)?.lead?.service || "this service";

  useEffect(() => {
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  }, []);

  useEffect(() => {
    if (!open) {
      setFile(null); setCertNumber(""); setCompletionNotes(""); setCcEmail(""); setShowCc(false);
      setStage("idle"); setDragOver(false); setError(null);
      setNumberTouched(false); setUploaded(null); setSendingConfirmed(false);
    }
  }, [open]);

  const MAX_BYTES = 10 * 1024 * 1024;
  const tooBig = file ? file.size > MAX_BYTES : false;
  const isEmpty = file ? file.size === 0 : false;
  const invalidType = file ? !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type) : false;
  const working = stage === "uploading" || stage === "preparing" || stage === "sending";
  const locked = working || busy || stage === "success";
  const fileError = file && (isEmpty || tooBig || invalidType);
  const chooseFile = (next: File | null) => {
    if (locked) return;
    setFile(next); setUploaded(null); setError(null);
  };
  const formatSize = (bytes: number) => bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;

  const submit = async () => {
    if (!file) { setError("Upload the certificate file."); return; }
    if (file.size === 0) {
      setError("The selected file is empty (0 bytes). Please choose a valid certificate file.");
      return;
    }
    if (tooBig || invalidType) { setError(tooBig ? "File exceeds 10 MB limit." : "Choose a PDF, JPG, PNG or WEBP file."); return; }
    if (!certNumber.trim()) { setNumberTouched(true); setError("Certificate / document number is required."); return; }
    if (!recipientEmail) { setError("Customer has no email on file."); return; }
    if (ccEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(ccEmail.trim())) {
        setError("Please enter a valid CC email address.");
        return;
      }
    }
    setError(null);
    try {
      let documentId = uploaded?.file === file ? uploaded.documentId : null;
      if (!documentId) {
        setStage("uploading");
        const { path, token } = await requestFn({
          data: {
            orderId, docType: "certificate", fileName: file.name,
            mimeType: file.type || "application/octet-stream", sizeBytes: file.size,
          },
        });
        const { supabase } = await import("@/integrations/supabase/client");
        const { error: uploadError } = await supabase.storage.from("documents").uploadToSignedUrl(path, token, file, {
          contentType: file.type || undefined, upsert: true,
        });
        if (uploadError) throw uploadError;
        setStage("preparing");
        const confirmed = await confirmFn({
          data: {
            orderId, docType: "certificate", filePath: path, fileName: file.name,
            mimeType: file.type || "application/octet-stream", sizeBytes: file.size,
          },
        });
        documentId = confirmed.documentId;
        setUploaded({ file, documentId });
      }
      setStage("sending");
      await onConfirm({
        certificateDocumentId: documentId,
        certificateNumber: certNumber.trim(),
        completionNotes: completionNotes.trim() || undefined,
        ccEmail: ccEmail.trim() || undefined,
      });
      setSendingConfirmed(true);
      setStage("success");
      closeTimer.current = setTimeout(() => onOpenChange(false), 1800);
    } catch (e: any) {
      let msg = e?.message ?? "Could not send the certificate. Please retry.";
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
      setError(msg);
      toast.error(msg);
      setStage("idle");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && locked) return; onOpenChange(next); }}>
      <DialogContent onEscapeKeyDown={(e) => { if (locked) e.preventDefault(); }} onPointerDownOutside={(e) => { if (locked) e.preventDefault(); }} className={`flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[540px] flex-col gap-0 overflow-hidden border-admin-border bg-admin-surface p-0 text-admin-fg shadow-xl sm:rounded-lg [&>button]:text-admin-fg-muted ${locked ? "[&>button]:pointer-events-none [&>button]:opacity-40" : ""}`} aria-describedby="completion-description">
        {stage === "success" ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 px-6 py-12 text-center" role="status" aria-live="polite">
            <CircleCheck className="size-12 text-admin-success motion-safe:animate-in motion-safe:zoom-in-75" />
            <DialogTitle className="text-xl">Certificate sent successfully</DialogTitle>
            <DialogDescription id="completion-description">The order has been marked Completed.</DialogDescription>
            <p className="max-w-full break-all text-sm font-medium text-admin-fg">{recipientEmail}</p>
          </div>
        ) : (
          <>
            <DialogHeader className="shrink-0 px-6 pb-2 pt-5 pr-12">
              <div className="flex items-start gap-4 text-left">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-completion-soft text-completion-primary"><FileCheck2 className="size-5" /></div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg leading-6">Complete Service</DialogTitle>
                  <p className="text-sm font-semibold text-admin-fg">{serviceName}</p>
                  <DialogDescription id="completion-description" className="mt-1 text-xs">Upload the certificate, add document number and we’ll send it to the customer.</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 pb-3 sm:px-6">
              <div className="grid grid-cols-3 gap-1 pb-2 pt-3 text-center" aria-label="Completion steps">
                {(["Upload Certificate", "Certificate Number", "Send to Customer"] as const).map((label, index) => {
                   const done = index === 0 ? Boolean(uploaded) : index === 1 ? Boolean(uploaded && certNumber.trim()) : sendingConfirmed;
                   const active = index === 0 ? !uploaded : index === 1 ? Boolean(uploaded && !certNumber.trim()) : Boolean(uploaded && certNumber.trim());
                  return <div key={label} className="relative min-w-0 text-[11px]">
                    {index < 2 && <span aria-hidden="true" className="absolute left-[calc(50%+15px)] right-[calc(-50%+15px)] top-3 h-px bg-completion-border" />}
                    <span className={`relative mx-auto flex size-6 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-admin-success text-primary-foreground" : active ? "bg-completion-primary text-admin-surface shadow-sm" : "bg-admin-surface-2 text-admin-fg-muted"}`}>{done ? <Check className="size-3.5" /> : index + 1}</span>
                    <span className={`mt-1 block leading-tight ${active ? "font-semibold text-admin-fg" : "text-admin-fg-muted"}`}>{label}</span>
                  </div>;
                })}
              </div>

              <section className="space-y-2 rounded-md border border-admin-border p-2.5" aria-label="Upload Certificate">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><h3 className="text-sm font-semibold"><span className="mr-2 rounded-md bg-completion-soft px-2 py-1 text-[10px] text-completion-primary">STEP 1</span>Upload Certificate</h3><p className="mt-1.5 text-[11px] text-admin-fg-muted">Upload the final certificate issued by the government.</p></div>
                  <div className="rounded-md border border-completion-border bg-completion-soft px-2.5 py-1.5 text-[10px] text-completion-primary"><span className="flex items-center gap-1 font-semibold"><Info className="size-3" />Accepted formats</span><span>PDF, JPG, PNG, WEBP · Max 10 MB</span></div>
                </div>
                <div
                  role="button"
                  tabIndex={locked ? -1 : 0}
                  onClick={() => {
                    if (!locked) fileInput.current?.click();
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && !locked) {
                      e.preventDefault();
                      fileInput.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!locked) setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    chooseFile(e.dataTransfer.files?.[0] ?? null);
                  }}
                  className={`group flex min-h-24 flex-col items-center justify-center rounded-md border border-dashed p-3 text-center transition-all ${
                    locked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-completion-primary hover:bg-completion-soft/60"
                  } ${dragOver ? "border-completion-primary bg-completion-soft" : "border-completion-border bg-admin-surface-2/40"}`}
                >
                  <UploadCloud className="mb-1 size-8 text-completion-primary transition-transform group-hover:scale-110" />
                  <p className="text-xs font-semibold text-admin-fg group-hover:text-completion-primary transition-colors">
                    Drag &amp; drop your certificate here
                  </p>
                  <span className="text-[11px] text-admin-fg-muted group-hover:underline">
                    or click to browse
                  </span>
                </div>
                {file && <div className={`flex items-center gap-2 rounded-md border p-2 ${fileError ? "border-admin-danger bg-destructive/5" : uploaded?.file === file ? "border-admin-success/30 bg-admin-success/5" : "border-completion-border bg-completion-soft/40"}`}>
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-admin-surface text-completion-primary"><FileText className="size-5" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold" title={file.name}>{file.name}</p>
                      <p className="text-[11px] text-admin-fg-muted">{formatSize(file.size)} · {uploaded?.file === file ? "Uploaded just now" : "Selected for upload"}</p>
                    </div>
                    <span className={`hidden items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold sm:inline-flex ${uploaded?.file === file ? "bg-admin-success/10 text-admin-success" : "bg-completion-soft text-completion-primary"}`}><Check className="size-3" />{uploaded?.file === file ? "File uploaded" : "File selected"}</span>
                    <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => chooseFile(null)} disabled={locked} title="Remove file" aria-label="Remove file"><X className="size-4" /></Button>
                  </div>}
                {fileError && <p className="text-xs text-admin-danger" role="alert">{isEmpty ? "This file is empty. Choose another." : tooBig ? "This file exceeds 10 MB." : "Choose a PDF, JPG, PNG or WEBP file."}</p>}
                <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} disabled={locked} onChange={(e) => { chooseFile(e.target.files?.[0] ?? null); e.target.value = ""; }} aria-label="Certificate file" />
              </section>

              <section className="space-y-2 rounded-md border border-admin-border p-2.5">
                <div><Label htmlFor="completion-cert-number" className="text-sm font-semibold"><span className="mr-2 rounded-md bg-completion-soft px-2 py-1 text-[10px] text-completion-primary">STEP 2</span>Certificate / Document Number</Label><p className="mt-1.5 text-[11px] text-admin-fg-muted">Enter the certificate number as mentioned on the document.</p></div>
                <div className="relative"><FileText className="absolute left-3 top-3 size-4 text-admin-fg-muted" /><Input id="completion-cert-number" value={certNumber} onChange={(e) => { setCertNumber(e.target.value); setError(null); }} onBlur={() => setNumberTouched(true)} disabled={locked} aria-invalid={numberTouched && !certNumber.trim()} aria-describedby={numberTouched && !certNumber.trim() ? "completion-number-error" : undefined} placeholder="e.g. UDYAM-MH-28-0012345" autoComplete="off" className="h-10 border-admin-border-strong bg-admin-surface pl-9 pr-9" />{certNumber.trim() && <CircleCheck className="absolute right-3 top-3 size-4 text-admin-success" />}</div>
                {numberTouched && !certNumber.trim() && <p id="completion-number-error" className="text-xs text-admin-danger" role="alert">Enter the certificate / document number.</p>}
              </section>

              <section className="space-y-2 rounded-md border border-admin-border p-2.5">
                <div><Label htmlFor="completion-notes" className="text-sm font-semibold"><span className="mr-2 rounded-md bg-completion-soft px-2 py-1 text-[10px] text-completion-primary">STEP 3</span>Completion Notes <span className="font-normal text-admin-fg-muted">(Optional)</span></Label><p className="mt-1.5 text-[11px] text-admin-fg-muted">Add any important notes that will be included in the customer email.</p></div>
                <Textarea id="completion-notes" value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} disabled={locked} rows={2} maxLength={500} placeholder="E.g. Certificate downloaded and verified. Sent to customer." className="resize-y border-admin-border-strong bg-admin-surface" />
                <p className="text-right text-[10px] text-admin-fg-muted">{completionNotes.length}/500</p>
              </section>

              <div className="rounded-md border border-completion-border bg-completion-soft/50 p-3 text-[11px] space-y-2">
                <div className="flex items-center gap-3">
                  <Mail className="size-4 shrink-0 text-completion-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-admin-fg-muted">The certificate will be emailed to (To):</p>
                    <p className="break-all font-semibold text-admin-fg">{recipientEmail ?? "No email on file"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!showCc && !ccEmail && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[10px] text-completion-primary hover:bg-completion-soft"
                        onClick={() => setShowCc(true)}
                        disabled={locked}
                      >
                        + Add CC
                      </Button>
                    )}
                  </div>
                </div>

                {(showCc || ccEmail) && (
                  <div className="pt-2 border-t border-completion-border/60">
                    <div className="flex items-center justify-between pb-1">
                      <Label htmlFor="completion-cc-email" className="text-[11px] font-semibold text-admin-fg">
                        CC Email <span className="font-normal text-admin-fg-muted">(Optional)</span>
                      </Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px] text-admin-fg-muted hover:text-admin-danger"
                        onClick={() => { setCcEmail(""); setShowCc(false); setError(null); }}
                        disabled={locked}
                      >
                        Remove CC
                      </Button>
                    </div>
                    <Input
                      id="completion-cc-email"
                      type="email"
                      value={ccEmail}
                      onChange={(e) => { setCcEmail(e.target.value); setError(null); }}
                      disabled={locked}
                      placeholder="e.g. partner@example.com"
                      autoComplete="off"
                      className="h-8 text-xs border-admin-border-strong bg-admin-surface"
                    />
                    <p className="mt-1 text-[10px] text-admin-fg-muted">
                      Certificate email will be sent to both the registered customer email and this CC address.
                    </p>
                  </div>
                )}
              </div>
              <div className="flex items-start gap-2 rounded-md border border-admin-warn/30 bg-admin-warn/5 p-2.5 text-[11px] text-admin-fg">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-admin-warn" />
                <p>After the certificate email is sent, the order will move to <strong>COMPLETED</strong>. All other customer documents for this order will then be permanently deleted.</p>
              </div>
              {(working || error) && <div role={error ? "alert" : "status"} aria-live="polite" className={`flex items-start gap-2 rounded-md border p-3 text-sm ${error ? "border-admin-danger/40 bg-destructive/5 text-admin-danger" : "border-admin-border bg-admin-accent-soft text-admin-primary"}`}>
                {error ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />}
                <span>{error || (stage === "uploading" ? "Uploading certificate…" : stage === "preparing" ? "Preparing certificate email…" : "Sending to customer…")}</span>
              </div>}
            </div>
             <DialogFooter className="shrink-0 flex-row justify-between gap-3 border-t border-admin-border px-5 py-3 sm:px-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={locked}>Cancel</Button>
                <Button type="button" onClick={() => void submit()} disabled={locked || !file || Boolean(fileError) || !certNumber.trim() || !recipientEmail} className="min-w-0 bg-completion-primary px-3 text-admin-surface hover:bg-completion-primary/90 sm:min-w-44">
                {working ? <><Loader2 className="animate-spin" />{stage === "uploading" ? "Uploading certificate…" : stage === "preparing" ? "Preparing email…" : "Sending to customer…"}</> : <>Upload &amp; Send Certificate <ArrowRight className="size-4" /></>}
              </Button>
            </DialogFooter>
             {working && (
               <div className="fixed inset-0 z-[60] flex items-center justify-center bg-admin-fg/30 p-4" role="status" aria-live="polite">
               <div className="w-full max-w-72 rounded-md border border-admin-border bg-admin-surface p-5 text-center text-admin-fg shadow-xl">
                 <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-completion-soft text-completion-primary"><Send className="size-6" /></div>
                 <h3 className="mb-1 text-sm font-semibold">Sending Certificate to Customer</h3>
                 <p className="mb-4 text-xs text-admin-fg-muted">Please wait while we upload the file and send the email to the customer.</p>
                 {([
                   ["Uploading file", stage !== "uploading", stage === "uploading" && !uploaded],
                   ["Processing document", stage === "sending", stage === "preparing"],
                   ["Sending email to customer", false, stage === "sending"],
                   ["Updating order status", false, false],
                   ["Finalizing", false, false],
                 ] as const).map(([label, done, active]) => (
                   <div key={label} className="flex items-center gap-2 py-2 text-left text-xs">
                     {done ? <Check className="size-4 shrink-0 text-admin-success" /> : active ? <Loader2 className="size-4 shrink-0 animate-spin text-completion-primary" /> : <span className="size-4 shrink-0 rounded-full border border-admin-border-strong" />}
                     <span className="flex-1">{label}</span>
                     <span className="text-admin-fg-muted">{done ? "Completed" : active ? "In progress" : "Pending"}</span>
                   </div>
                 ))}
                 <div className="mt-3 h-1 overflow-hidden rounded-full bg-completion-soft"><div className={`h-full bg-completion-primary transition-all duration-300 ${stage === "uploading" && !uploaded ? "w-0" : stage === "preparing" ? "w-1/5" : "w-2/5"}`} /></div>
                 <p className="mt-2 text-xs text-admin-fg-muted">{stage === "uploading" && !uploaded ? "0" : stage === "preparing" ? "1" : "2"} of 5 completed</p>
               </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
