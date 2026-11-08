import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  searchDisputeOrder,
  prepareDisputeEvidencePackage,
  saveBrowserDisputeEvidencePackage,
  getDisputeEvidenceSignedUrl,
  deleteDisputeEvidenceRecord,
  deleteAllDisputeEvidenceRecords,
  type DisputeOrderSummary,
} from "@/lib/disputes/dispute-manager.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ShieldAlert,
  Search,
  Loader2,
  Mail,
  Receipt,
  Calendar,
  User,
  CreditCard,
  History,
  FileCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Download,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  FileText,
  ShieldCheck,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { bytesToBase64, createDisputePdfInBrowser } from "@/lib/disputes/dispute-browser-pdf";

export const Route = createFileRoute("/admin/dispute-manager")({
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/admin-login" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const roles = (data ?? []).map((r: any) => r.role);
    const allowed = ["super_admin", "admin", "operations", "finance", "accounts", "manager", "executive"];
    if (!roles.some((r: string) => allowed.includes(r))) {
      throw redirect({ to: "/admin/my-work" });
    }
  },
  component: DisputeManagerPage,
});

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }) + ", " + d.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function DisputeManagerPage() {
  const qc = useQueryClient();
  const searchFn = useServerFn(searchDisputeOrder);
  const prepareFn = useServerFn(prepareDisputeEvidencePackage);
  const saveFn = useServerFn(saveBrowserDisputeEvidencePackage);
  const getUrlFn = useServerFn(getDisputeEvidenceSignedUrl);
  const deleteRecordFn = useServerFn(deleteDisputeEvidenceRecord);
  const deleteAllRecordsFn = useServerFn(deleteAllDisputeEvidenceRecords);

  const [orderQuery, setOrderQuery] = useState("");
  const [currentOrder, setCurrentOrder] = useState<DisputeOrderSummary | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [disputeId, setDisputeId] = useState("");

  // Evidence Selection State
  const [selectedEmailIds, setSelectedEmailIds] = useState<string[]>([]);
  const [includeInvoice, setIncludeInvoice] = useState<boolean>(true);

  // Modals & Preview States
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [activeEmailPreview, setActiveEmailPreview] = useState<any | null>(null);
  const [generatedPdfResult, setGeneratedPdfResult] = useState<{
    recordId: string;
    signedUrl: string | null;
    fileName: string;
    itemCount: number;
  } | null>(null);
  const [pdfSuccessModalOpen, setPdfSuccessModalOpen] = useState(false);

  // Delete Mutations
  const mutDeleteOne = useMutation({
    mutationFn: async (recordId: string) => {
      return await deleteRecordFn({ data: { recordId } });
    },
    onSuccess: () => {
      toast.success("Dispute package removed");
      if (currentOrder) {
        searchFn({ data: { orderQuery: currentOrder.applicationCode } }).then((fresh) => {
          if (fresh) setCurrentOrder(fresh);
        });
      }
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to delete package");
    },
  });

  const mutDeleteAll = useMutation({
    mutationFn: async () => {
      return await deleteAllRecordsFn({
        data: { orderId: currentOrder?.applicationId },
      });
    },
    onSuccess: (res) => {
      toast.success(`Removed ${res.deletedCount ?? 0} past dispute package(s)`);
      if (currentOrder) {
        searchFn({ data: { orderQuery: currentOrder.applicationCode } }).then((fresh) => {
          if (fresh) setCurrentOrder(fresh);
        });
      }
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to remove old dispute packages");
    },
  });

  // Search Action
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = orderQuery.trim();
    if (!q) {
      toast.error("Please enter an Order Number or Application Code");
      return;
    }

    setIsSearching(true);
    setCurrentOrder(null);
    setSelectedEmailIds([]);
    setDisputeId("");
    try {
      const res = await searchFn({ data: { orderQuery: q } });
      if (!res) {
        toast.error(`No order found matching "${q}"`);
      } else {
        setCurrentOrder(res);
        // Default selection: select all verified sent emails
        setSelectedEmailIds(res.sentEmails.map((em) => em.id));
        setIncludeInvoice(Boolean(res.invoice));
        toast.success(`Loaded order #${res.applicationCode}`);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to search order");
    } finally {
      setIsSearching(false);
    }
  };

  // Generate Mutation
  const mutGenerate = useMutation({
    mutationFn: async () => {
      if (!currentOrder) throw new Error("No active order selected");
      const selectedEmails = currentOrder.sentEmails.filter((email) => selectedEmailIds.includes(email.id));
      const prepared = await prepareFn({ data: { orderId: currentOrder.applicationId, includeInvoice: includeInvoice && Boolean(currentOrder.invoice) } });
      const pdfBytes = await createDisputePdfInBrowser({ emails: selectedEmails, invoiceUrl: prepared.invoiceUrl });
      return await saveFn({
        data: {
          orderId: currentOrder.applicationId,
          disputeId: disputeId.trim() || undefined,
          selectedEmailIds,
          invoiceIncluded: includeInvoice && Boolean(currentOrder.invoice),
          pdfBase64: bytesToBase64(pdfBytes),
        },
      });
    },
    onSuccess: (res) => {
      toast.success("Dispute Evidence Package generated successfully");
      setGeneratedPdfResult(res);
      setPdfSuccessModalOpen(true);
      setPreviewModalOpen(false);

      // Refresh order data to show updated history
      if (currentOrder) {
        searchFn({ data: { orderQuery: currentOrder.applicationCode } }).then((fresh) => {
          if (fresh) setCurrentOrder(fresh);
        });
      }
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to generate dispute PDF");
    },
  });

  // Download / View Past Package
  const handleOpenPastEvidence = async (recordId: string) => {
    try {
      const { signedUrl } = await getUrlFn({ data: { recordId } });
      if (signedUrl) {
        window.open(signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to open evidence file");
    }
  };

  // Selected count calculation
  const totalSelectedCount = useMemo(() => {
    let count = selectedEmailIds.length;
    if (includeInvoice && currentOrder?.invoice) count += 1;
    return count;
  }, [selectedEmailIds, includeInvoice, currentOrder]);

  const allEmailsSelected = currentOrder && currentOrder.sentEmails.length > 0 && selectedEmailIds.length === currentOrder.sentEmails.length;

  const toggleSelectAllEmails = () => {
    if (!currentOrder) return;
    if (allEmailsSelected) {
      setSelectedEmailIds([]);
    } else {
      setSelectedEmailIds(currentOrder.sentEmails.map((e) => e.id));
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* ─── Page Header ─── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center shadow-xs">
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Dispute Manager</h1>
              <p className="text-sm text-slate-500">
                Create unified evidence packages for payment and service disputes.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-300 gap-1.5 py-1 px-3">
            <ShieldCheck className="size-3.5 text-indigo-600" />
            Audit-Grade Evidence Generator
          </Badge>
        </div>
      </div>

      {/* ─── Top Section: Order Lookup ─── */}
      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
        <CardContent className="p-6">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                value={orderQuery}
                onChange={(e) => setOrderQuery(e.target.value)}
                placeholder="Enter Order Number / Application Code (e.g. UA-2026-XXXXX, AP-XXXXX)"
                className="pl-10 h-11 text-sm bg-slate-50 border-slate-300 focus:bg-white focus:border-indigo-500 transition font-medium"
              />
            </div>
            <Button
              type="submit"
              disabled={isSearching || !orderQuery.trim()}
              className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2 shadow-xs cursor-pointer w-full sm:w-auto"
            >
              {isSearching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Search Order
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ─── Order Content Area ─── */}
      {currentOrder && (
        <div className="space-y-6">
          {/* 1. Compact Order & Payment Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left 2 Cols: Order Summary */}
            <Card className="lg:col-span-2 border-slate-200 shadow-xs bg-white">
              <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <User className="size-4 text-indigo-600" />
                    Order &amp; Customer Information
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Verified CRM records scoped to order #{currentOrder.applicationCode}
                  </CardDescription>
                </div>
                <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 font-mono text-xs">
                  {currentOrder.applicationCode}
                </Badge>
              </CardHeader>
              <CardContent className="p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6 text-xs">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                      Customer Name
                    </span>
                    <span className="font-bold text-slate-900 text-sm">{currentOrder.customerName}</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                      Mobile
                    </span>
                    <span className="font-semibold text-slate-800 font-mono">{currentOrder.customerMobile}</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                      Email Address
                    </span>
                    <span className="font-semibold text-slate-800 break-all">{currentOrder.customerEmail}</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                      Service
                    </span>
                    <span className="font-semibold text-slate-900">{currentOrder.serviceName}</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                      Order Date
                    </span>
                    <span className="font-semibold text-slate-800">{formatDateTime(currentOrder.orderDate)}</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                      Assigned Employee
                    </span>
                    <span className="font-bold text-indigo-700">
                      {currentOrder.assignedStaff?.name || "Unassigned"}
                      {currentOrder.assignedStaff?.role ? ` (${currentOrder.assignedStaff.role})` : ""}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Right Col: Payment Verification */}
            <Card className="border-slate-200 shadow-xs bg-white">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <CreditCard className="size-4 text-emerald-600" />
                  Payment Verification
                </CardTitle>
                <CardDescription className="text-xs">
                  Gateway transaction confirmation
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-3 text-xs">
                {currentOrder.payment ? (
                  <>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-slate-500 font-medium">Payment Status</span>
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-bold uppercase text-[10px]">
                        {currentOrder.payment.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Amount Paid</span>
                      <span className="text-sm font-black text-slate-900">
                        INR {currentOrder.payment.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Gateway</span>
                      <span className="font-semibold text-slate-800 uppercase">{currentOrder.payment.gatewayName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Payment Date</span>
                      <span className="font-semibold text-slate-800">{formatDateTime(currentOrder.payment.paymentDate)}</span>
                    </div>
                    <div className="pt-1">
                      <span className="text-[10px] text-slate-400 font-medium block uppercase tracking-wider mb-0.5">
                        Transaction / Payment ID
                      </span>
                      <code className="text-[11px] font-mono bg-slate-100 px-2 py-1 rounded text-slate-800 block break-all">
                        {currentOrder.payment.transactionId || currentOrder.payment.id}
                      </code>
                    </div>
                  </>
                ) : (
                  <div className="py-6 text-center text-slate-400">
                    <AlertCircle className="size-6 mx-auto mb-1 text-slate-300" />
                    <p className="font-medium">No payment record found</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Dispute ID / Chargeback Case ID (Optional) */}
          <Card className="border-slate-200 shadow-xs bg-white">
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <label htmlFor="dispute-id-input" className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <ShieldAlert className="size-3.5 text-amber-600" />
                  Dispute ID / Gateway Case Reference (Optional)
                </label>
                <p className="text-[11px] text-slate-500">
                  Enter bank / payment gateway chargeback reference ID to stamp on the cover page and running footer.
                </p>
              </div>
              <div className="w-full sm:w-80">
                <Input
                  id="dispute-id-input"
                  value={disputeId}
                  onChange={(e) => setDisputeId(e.target.value)}
                  placeholder="e.g. DISP-2026-98102 / CASE-4401"
                  className="h-9 text-xs font-mono bg-slate-50 border-slate-300 focus:bg-white focus:border-indigo-500"
                />
              </div>
            </CardContent>
          </Card>

          {/* 2. Evidence Selection Checklist */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left 2 Cols: Email Evidence */}
            <Card className="lg:col-span-2 border-slate-200 shadow-xs bg-white">
              <CardHeader className="pb-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Mail className="size-4 text-indigo-600" />
                      Email Evidence
                    </CardTitle>
                    <Badge variant="secondary" className="text-xs font-bold bg-indigo-50 text-indigo-700">
                      {selectedEmailIds.length} of {currentOrder.sentEmails.length} selected
                    </Badge>
                  </div>
                  <CardDescription className="text-xs mt-0.5">
                    Select verified emails actually transmitted to the customer
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectAllEmails}
                    className="h-8 text-xs font-bold"
                  >
                    {allEmailsSelected ? "Clear All" : "Select All Emails"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {currentOrder.sentEmails.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 space-y-1">
                    <Mail className="size-8 mx-auto text-slate-300 mb-2" />
                    <p className="text-sm font-semibold text-slate-700">No Sent Emails Found</p>
                    <p className="text-xs text-slate-500">
                      Only actually sent emails are included as dispute evidence.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                    {currentOrder.sentEmails.map((email, idx) => {
                      const isSelected = selectedEmailIds.includes(email.id);
                      return (
                        <div
                          key={email.id}
                          className={cn(
                            "p-3.5 flex items-start gap-3 transition hover:bg-slate-50",
                            isSelected ? "bg-indigo-50/30" : "bg-white"
                          )}
                        >
                          <div className="pt-0.5">
                            <Checkbox
                              id={`email-${email.id}`}
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedEmailIds((prev) => [...prev, email.id]);
                                } else {
                                  setSelectedEmailIds((prev) => prev.filter((id) => id !== email.id));
                                }
                              }}
                            />
                          </div>

                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <label
                                htmlFor={`email-${email.id}`}
                                className="text-xs font-bold text-slate-900 cursor-pointer hover:text-indigo-600 transition truncate max-w-md"
                              >
                                #{idx + 1} — {email.subject}
                              </label>
                              <span className="text-[11px] text-slate-500 font-medium">
                                {formatDateTime(email.sent_at)}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                              <span>
                                <strong>To:</strong> {email.to_email}
                              </span>
                              {email.template_code && (
                                <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                                  {email.template_code}
                                </span>
                              )}
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-bold uppercase py-0 px-1.5",
                                  email.status === "sent" || email.status === "delivered"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-rose-50 text-rose-700 border-rose-200"
                                )}
                              >
                                {email.status}
                              </Badge>
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setActiveEmailPreview(email)}
                            className="h-8 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 shrink-0 gap-1"
                          >
                            <Eye className="size-3.5" />
                            Preview
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Right Col: Saved invoice */}
            <div className="space-y-5">
              {/* Document 1: Invoice */}
              <Card className="border-slate-200 shadow-xs bg-white">
                <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Receipt className="size-4 text-indigo-600" />
                    Tax Invoice
                  </CardTitle>
                  {currentOrder.invoice ? (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="check-invoice"
                        checked={includeInvoice}
                        onCheckedChange={(c) => setIncludeInvoice(Boolean(c))}
                      />
                      <label htmlFor="check-invoice" className="text-xs font-bold text-slate-700 cursor-pointer">
                        Include
                      </label>
                    </div>
                  ) : null}
                </CardHeader>
                <CardContent className="p-4 text-xs">
                  {currentOrder.invoice ? (
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Invoice Number</span>
                        <span className="font-bold text-slate-900 font-mono">{currentOrder.invoice.invoiceNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Invoice Amount</span>
                        <span className="font-bold text-slate-900">
                          INR {currentOrder.invoice.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Issued Date</span>
                        <span className="font-semibold text-slate-700">{formatDateTime(currentOrder.invoice.createdAt)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 text-center text-slate-400">
                      <p className="font-medium text-xs">No invoice generated for this order</p>
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>
          </div>

          {/* 3. Order Timeline & State History */}
          <Card className="border-slate-200 shadow-xs bg-white">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <History className="size-4 text-indigo-600" />
                Order Timeline / State History
              </CardTitle>
              <CardDescription className="text-xs">
                Chronological operational lifecycle events for this order (internal notes are strictly excluded from the customer evidence package)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              {currentOrder.orderTimeline.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No historical events recorded.</p>
              ) : (
                <div className="relative pl-6 space-y-3 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {currentOrder.orderTimeline.map((ev) => (
                    <div key={ev.id} className="relative group text-xs">
                      <div className="absolute -left-6 top-1.5 size-2.5 rounded-full border-2 border-indigo-600 bg-white" />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{ev.label}</span>
                          {ev.staffName && (
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              By: {ev.staffName}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 font-medium">{formatDateTime(ev.createdAt)}</span>
                      </div>
                      {ev.note && <p className="text-slate-600 mt-0.5">{ev.note}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 4. Action Banner / Generation Bar */}
          <div className="sticky bottom-4 z-20 rounded-2xl bg-slate-900 text-white p-4 shadow-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-indigo-950 flex items-center justify-center text-indigo-400 border border-indigo-800">
                <FileCheck className="size-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Selected Evidence:</span>
                  <Badge className="bg-indigo-600 text-white font-mono text-xs">{totalSelectedCount} items</Badge>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {selectedEmailIds.length} Emails · {includeInvoice && currentOrder.invoice ? "1 Invoice" : "No Invoice"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPreviewModalOpen(true)}
                disabled={totalSelectedCount === 0}
                className="h-10 bg-slate-800 border-slate-700 text-white hover:bg-slate-700 font-bold gap-2 cursor-pointer"
              >
                <Eye className="size-4 text-indigo-400" />
                Preview Evidence Package
              </Button>

              <Button
                type="button"
                onClick={() => mutGenerate.mutate()}
                disabled={mutGenerate.isPending || totalSelectedCount === 0}
                className="h-10 bg-amber-600 hover:bg-amber-500 text-white font-black gap-2 shadow-md cursor-pointer disabled:opacity-50"
              >
                {mutGenerate.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldAlert className="size-4" />}
                Generate Dispute PDF
              </Button>
            </div>
          </div>

          {/* 5. Dispute Evidence Record History */}
          <Card className="border-slate-200 shadow-xs bg-white">
            <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <History className="size-4 text-slate-600" />
                  Dispute Evidence History
                </CardTitle>
                <CardDescription className="text-xs">
                  Audit log of all generated dispute evidence packages for this order
                </CardDescription>
              </div>
              {currentOrder.evidenceHistory.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (window.confirm("Are you sure you want to remove all previous dispute PDF packages for this order from Supabase?")) {
                      mutDeleteAll.mutate();
                    }
                  }}
                  disabled={mutDeleteAll.isPending}
                  className="h-8 text-xs font-medium text-rose-600 border-rose-200 hover:bg-rose-50 cursor-pointer gap-1.5"
                >
                  {mutDeleteAll.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  Clear All Past PDFs
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {currentOrder.evidenceHistory.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  No evidence packages have been generated yet for this order.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {currentOrder.evidenceHistory.map((pkg) => (
                    <div key={pkg.id} className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{formatDateTime(pkg.generatedAt)}</span>
                          <Badge variant="outline" className="text-[10px] font-bold bg-slate-50 text-slate-700">
                            {pkg.itemCount} Items Included
                          </Badge>
                        </div>
                        <div className="text-slate-500 flex flex-wrap items-center gap-3 text-[11px]">
                          <span>
                            Generated by: <strong>{pkg.generatedByName}</strong>
                          </span>
                          <span>· Emails: {pkg.selectedEmailCount}</span>
                          <span>· Invoice: {pkg.invoiceIncluded ? "Yes" : "No"}</span>
                          <span>· Certificate: {pkg.certificateIncluded ? "Yes" : "No"}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenPastEvidence(pkg.id)}
                          className="h-8 text-xs font-bold gap-1.5 text-indigo-700 border-indigo-200 hover:bg-indigo-50 cursor-pointer"
                        >
                          <Eye className="size-3.5" />
                          View / Download
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (window.confirm("Are you sure you want to delete this dispute PDF package?")) {
                              mutDeleteOne.mutate(pkg.id);
                            }
                          }}
                          disabled={mutDeleteOne.isPending}
                          className="h-8 text-xs font-medium text-rose-600 border-slate-200 hover:bg-rose-50 hover:border-rose-200 cursor-pointer px-2.5"
                          title="Delete this PDF package"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── MODAL 1: Email Content Preview (Exact Print View) ─── */}
      <Dialog open={Boolean(activeEmailPreview)} onOpenChange={(o) => !o && setActiveEmailPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden bg-white">
          <DialogHeader className="p-5 bg-slate-900 text-white border-b border-slate-800 shrink-0">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Mail className="size-4 text-indigo-400" />
              Sent Email Content Preview
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Exact email content recorded in server logs at transmission
            </DialogDescription>
          </DialogHeader>

          {activeEmailPreview && (
            <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs bg-slate-50/50">
              {/* Header Box */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="font-bold text-slate-900 text-sm">{activeEmailPreview.subject}</span>
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 uppercase font-bold text-[10px]">
                    {activeEmailPreview.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-700 pt-1">
                  <div>
                    <span className="text-slate-400 font-medium">From:</span> {activeEmailPreview.from_email || "System Default"}
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">To:</span> {activeEmailPreview.to_email}
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Sent:</span> {formatDateTime(activeEmailPreview.sent_at)}
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Message ID:</span> {activeEmailPreview.message_id || `msg_${activeEmailPreview.id.slice(0, 12)}`}
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Email Body:</span>
                {activeEmailPreview.body_html ? (
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-inner">
                    <iframe
                      title={`preview-${activeEmailPreview.id}`}
                      srcDoc={activeEmailPreview.body_html}
                      sandbox=""
                      className="w-full min-h-[380px] bg-white"
                    />
                  </div>
                ) : activeEmailPreview.body_text ? (
                  <pre className="rounded-xl border border-slate-200 bg-white p-4 font-mono text-xs whitespace-pre-wrap">
                    {activeEmailPreview.body_text}
                  </pre>
                ) : (
                  <p className="italic text-slate-400">No body content captured for this email.</p>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="p-4 bg-slate-100 border-t border-slate-200">
            <Button variant="outline" onClick={() => setActiveEmailPreview(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL 2: Evidence Package Preview ─── */}
      <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden bg-white">
          <DialogHeader className="p-5 bg-slate-900 text-white border-b border-slate-800 shrink-0">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <FileText className="size-4 text-amber-400" />
              Final PDF Contents
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Selected emails are rendered exactly as sent, followed by the saved invoice
            </DialogDescription>
          </DialogHeader>

          {currentOrder && (
            <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs bg-slate-50">
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-slate-700">
                  <div>
                    <span className="text-slate-400 font-medium">Order Number:</span> {currentOrder.applicationCode}
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Customer:</span> {currentOrder.customerName}
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Payment Amount:</span> INR {currentOrder.payment?.amount ?? currentOrder.totalAmount}
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Payment Status:</span> {currentOrder.payment?.status ?? "PAID"}
                  </div>
                  {disputeId.trim() && (
                    <div className="col-span-2 pt-1 border-t border-slate-100">
                      <span className="text-slate-400 font-medium">Dispute ID:</span>{" "}
                      <span className="font-bold text-amber-700 font-mono">{disputeId.trim()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Included Items Order */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                <span className="font-bold text-slate-900 text-sm block border-b border-slate-100 pb-2">
                  Document Order
                </span>
                <ol className="space-y-2 pl-4 list-decimal text-slate-800 font-medium">
                  {selectedEmailIds.map((id, i) => {
                    const em = currentOrder.sentEmails.find((e) => e.id === id);
                    return (
                      <li key={id}>
                        Sent Email: <strong>{em?.subject}</strong> · {formatDateTime(em?.sent_at)}
                      </li>
                    );
                  })}
                  {includeInvoice && currentOrder.invoice && (
                    <li>
                      Tax Invoice: <strong>#{currentOrder.invoice.invoiceNumber}</strong>
                    </li>
                  )}
                </ol>
              </div>

              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
                <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  No summary page, evidence branding, legal statement, page footer, or certificate will be added.
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="p-4 bg-slate-100 border-t border-slate-200 flex justify-between">
            <Button variant="outline" onClick={() => setPreviewModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => mutGenerate.mutate()}
              disabled={mutGenerate.isPending}
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold gap-2"
            >
              {mutGenerate.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldAlert className="size-4" />}
              Generate Final PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL 3: Generation Success ─── */}
      <Dialog open={pdfSuccessModalOpen} onOpenChange={setPdfSuccessModalOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader className="text-center pb-2">
            <div className="size-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center mb-3">
              <CheckCircle2 className="size-6" />
            </div>
            <DialogTitle className="text-lg font-black text-slate-900">
              Dispute Package Ready!
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
               The exact email printouts and saved invoice have been combined and stored securely.
            </DialogDescription>
          </DialogHeader>

          {generatedPdfResult && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Package ID:</span>
                <span className="font-mono font-bold text-slate-800">{generatedPdfResult.recordId.slice(0, 13)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">File Name:</span>
                <span className="font-semibold text-slate-800 truncate max-w-[200px]">{generatedPdfResult.fileName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Items:</span>
                <span className="font-bold text-indigo-700">{generatedPdfResult.itemCount} items merged</span>
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-3">
            <Button variant="outline" onClick={() => setPdfSuccessModalOpen(false)} className="w-full sm:w-auto">
              Close
            </Button>
            {generatedPdfResult?.signedUrl && (
              <Button
                type="button"
                onClick={() => {
                  window.open(generatedPdfResult.signedUrl!, "_blank", "noopener,noreferrer");
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2 w-full sm:w-auto"
              >
                <Download className="size-4" />
                View / Download PDF
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
