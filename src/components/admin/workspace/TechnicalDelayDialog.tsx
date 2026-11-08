import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2, Server, CheckCircle2, Info, Search, Image as ImageIcon,
  Upload, Trash2, RefreshCw, AlertCircle, ShieldAlert,
} from "lucide-react";
import { setExternalDelay, listDelayReasons } from "@/lib/crm/workflow.functions";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Props {
  applicationId: string;
  open: boolean;
  onClose: () => void;
}

interface EvidenceState {
  file: File;
  fileName: string;
  fileSize: number;
  mimeType: string;
  previewUrl: string;
  base64Data: string;
}

function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function TechnicalDelayDialog({ applicationId, open, onClose }: Props) {
  const qc = useQueryClient();
  const fnReasons = useServerFn(listDelayReasons);
  const fnSubmit = useServerFn(setExternalDelay);

  const { data: reasons, isLoading: reasonsLoading } = useQuery({
    queryKey: ["workflow-delay-reasons"],
    queryFn: () => fnReasons({ data: {} as never }),
    enabled: open,
  });

  const [reasonCode, setReasonCode] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [search, setSearch] = useState("");
  const [evidence, setEvidence] = useState<EvidenceState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allReasons = reasons?.reasons ?? [];
  const filteredReasons = useMemo(() => {
    const s = search.trim().toLowerCase();
    return allReasons
      .filter((r: any) => (r.side ?? "customer") === "internal")
      .filter((r: any) => !s || r.label.toLowerCase().includes(s) || (r.description ?? "").toLowerCase().includes(s))
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [allReasons, search]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setInternalNote("");
      setReasonCode("");
      setEvidence(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open]);

  useEffect(() => {
    if (open && filteredReasons.length && !filteredReasons.find((r: any) => r.code === reasonCode)) {
      setReasonCode(filteredReasons[0].code);
    }
  }, [open, reasons]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = filteredReasons.find((r: any) => r.code === reasonCode) ?? null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      toast.error("Unsupported file type. Please upload a PNG, JPG, or WEBP image.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File exceeds 5 MB limit. Please upload a smaller image.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const base64 = evt.target?.result as string;
      if (base64) {
        setEvidence({
          file,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "image/png",
          previewUrl: base64,
          base64Data: base64,
        });
        toast.success(`Screenshot attached: ${file.name}`);
      }
    };
    reader.onerror = () => {
      toast.error("Failed to read image file.");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveEvidence = () => {
    setEvidence(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    toast.info("Screenshot removed.");
  };

  const mut = useMutation({
    mutationFn: async () => {
      const reason = allReasons.find((r) => r.code === reasonCode);
      if (!reason) throw new Error("Please pick a reason");
      await fnSubmit({
        data: {
          applicationId,
          reasonCode,
          reasonLabel: reason.label,
          internalNote: internalNote || undefined,
          expectedReviewAt: new Date().toISOString(),
          priority: "normal",
          kind: "government_portal_pending",
          evidence: evidence
            ? {
                fileName: evidence.fileName,
                mimeType: evidence.mimeType,
                base64Data: evidence.base64Data,
              }
            : undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success(
        evidence
          ? "Technical delay marked with screenshot evidence attached — customer notified."
          : "Technical delay marked — order placed on hold.",
      );
      qc.invalidateQueries({ queryKey: ["admin.orders.v2"] });
      qc.invalidateQueries({ queryKey: ["orders-v2"] });
      qc.invalidateQueries({ queryKey: ["active-order-callback"] });
      qc.invalidateQueries({ queryKey: ["active-order-callback", applicationId] });
      qc.invalidateQueries({ queryKey: ["due-reminders-summary"] });
      qc.invalidateQueries({ queryKey: ["workflow-events", applicationId] });
      qc.invalidateQueries({ queryKey: ["workflow-reminders", applicationId] });
      qc.invalidateQueries({ queryKey: ["order-detail-v2", applicationId] });
      qc.invalidateQueries({ queryKey: ["order-workflow-state", applicationId] });
      qc.invalidateQueries({ queryKey: ["admin.order", applicationId] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to mark delay"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="shrink-0 px-5 py-4 border-b bg-gradient-to-r from-sky-50 to-white">
          <div className="flex items-center gap-2">
            <div className="grid place-items-center size-9 rounded-full bg-sky-100 text-sky-700 shrink-0">
              <Server className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base">Our-side (technical) delay — internal follow-up</DialogTitle>
              <DialogDescription className="text-xs">
                Marks the order on technical hold and notifies the customer with delay details.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_340px]">
            {/* Left: Reason List */}
            <div className="border-r">
              <div className="px-4 pt-3 pb-2 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="size-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search internal reasons…"
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  {filteredReasons.length} reason{filteredReasons.length === 1 ? "" : "s"}
                </Badge>
              </div>

              <ScrollArea className="h-[280px] px-4 pb-4">
                {reasonsLoading ? (
                  <div className="grid place-items-center h-40 text-sm text-slate-500">
                    <Loader2 className="size-4 animate-spin" />
                  </div>
                ) : filteredReasons.length === 0 ? (
                  <div className="text-sm text-slate-500 py-10 text-center">No internal reasons configured.</div>
                ) : (
                  <div className="space-y-1.5">
                    {filteredReasons.map((r: any) => {
                      const on = r.code === reasonCode;
                      return (
                        <button
                          key={r.code}
                          type="button"
                          onClick={() => setReasonCode(r.code)}
                          className={cn(
                            "w-full text-left rounded-lg border p-2.5 transition",
                            on ? "border-indigo-400 bg-indigo-50/60 ring-1 ring-indigo-200" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <div className={cn("mt-0.5 size-4 rounded-full border grid place-items-center shrink-0", on ? "border-indigo-500 bg-indigo-500 text-white" : "border-slate-300 bg-white")}>
                              {on && <CheckCircle2 className="size-3" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[13px] font-medium text-slate-900 leading-snug">{r.label}</div>
                              {r.description && (
                                <div className="text-[11.5px] text-slate-500 leading-snug mt-0.5 line-clamp-2">{r.description}</div>
                              )}
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <span className="text-[9.5px] font-mono uppercase text-slate-400 tracking-wider">{r.code}</span>
                                {r.email_template_code && (
                                  <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">
                                    {r.email_template_code.toUpperCase().replace("BHS_", "")}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Right: Evidence Screenshot + Info */}
            <div className="p-4 bg-slate-50/40 space-y-3.5 flex flex-col justify-between">
              <div className="space-y-3">
                {/* Evidence Upload Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                      <ImageIcon className="size-3.5 text-indigo-600" />
                      Evidence Screenshot <span className="text-[11px] font-normal text-slate-500">(Optional)</span>
                    </Label>
                    {evidence && (
                      <Badge variant="outline" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
                        {fmtFileSize(evidence.fileSize)}
                      </Badge>
                    )}
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {!evidence ? (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30 rounded-xl p-3.5 text-center transition flex flex-col items-center justify-center gap-1.5 group bg-white"
                    >
                      <div className="size-8 rounded-full bg-slate-100 group-hover:bg-indigo-100 text-slate-500 group-hover:text-indigo-600 grid place-items-center transition">
                        <Upload className="size-4" />
                      </div>
                      <span className="text-xs font-medium text-slate-700 group-hover:text-indigo-900">
                        Click to attach Portal Error Screenshot
                      </span>
                      <span className="text-[10.5px] text-slate-400">
                        PNG, JPG, or WEBP up to 5 MB
                      </span>
                    </button>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-white p-2.5 space-y-2.5 shadow-xs">
                      <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-950 aspect-video flex items-center justify-center">
                        <img
                          src={evidence.previewUrl}
                          alt="Government Portal Error Preview"
                          className="w-full h-full object-contain"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-800 truncate" title={evidence.fileName}>
                            {evidence.fileName}
                          </p>
                          <p className="text-[10.5px] text-slate-400">
                            Attached as customer email attachment
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                            className="h-7 px-2 text-[11px] gap-1 bg-white"
                          >
                            <RefreshCw className="size-3" /> Replace
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleRemoveEvidence}
                            className="h-7 px-2 text-[11px] text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Privacy / Security Notice */}
                  <div className="p-2 rounded-lg bg-amber-50/80 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-1.5 leading-snug">
                    <ShieldAlert className="size-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      Make sure the screenshot does not contain any unnecessary internal information before sending it to the customer.
                    </span>
                  </div>
                </div>

                {/* Info Note */}
                <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-2.5 text-[11px] text-sky-900 flex gap-1.5">
                  <Info className="size-3.5 shrink-0 mt-0.5" />
                  <div className="leading-snug">
                    Customer receives an official delay notification. The order is placed on <b>Technical Delay</b> hold until you <b>Resume</b> it.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Internal note input */}
          <div className="px-5 py-3.5 border-t bg-white">
            <Label className="text-[11px] uppercase tracking-wider text-slate-500">Internal note / instructions for team</Label>
            <Textarea
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              rows={2}
              className="mt-1 text-sm"
              placeholder={selected?.description ? `e.g. ${selected.description}` : "Describe technical issue or next action…"}
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 px-5 py-3 border-t bg-slate-50 gap-2">
          <div className="mr-auto text-[11px] text-slate-500 flex items-center gap-1.5">
            {selected ? (
              <>
                <CheckCircle2 className="size-3 text-sky-600" />
                <span>Selected: <b className="text-slate-700">{selected.label}</b></span>
                {evidence && (
                  <Badge variant="secondary" className="text-[10px] ml-1 bg-indigo-50 text-indigo-700 border-indigo-200">
                    + Screenshot Attached
                  </Badge>
                )}
              </>
            ) : (
              <span>Pick an internal reason to continue</span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending || !reasonCode} className="gap-1.5">
            {mut.isPending && <Loader2 className="size-3 animate-spin" />}
            Mark Technical Delay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
