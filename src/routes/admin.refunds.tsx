import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Send,
  Search,
  MessageSquareWarning,
  ArrowUpRight,
  Wallet,
  IndianRupee,
  Clock,
  TrendingUp,
  Timer,
  User2,
  Mail,
  Phone,
  Receipt,
  Activity,
  PenLine,
  Copy,
  Check,
  CreditCard,
} from "lucide-react";
import {
  listRefundsAdvanced,
  refundStats,
  getRefundDetail,
} from "@/lib/crm/refunds-v2.functions";
import {
  approveRefund,
  rejectRefund,
  markRefundProcessed,
  requestRefundInfo,
  escalateRefund,
  addRefundNote,
} from "@/lib/orders/order-actions.functions";
import { listGateways } from "@/lib/payments/gateways.functions";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/refunds")({
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/admin-login" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const roles = (data ?? []).map((r) => r.role);
    if (!roles.some((r) => ["admin", "super_admin", "finance", "operations", "support", "manager", "executive", "accounts"].includes(r))) {
      throw redirect({ to: "/admin/my-work" });
    }
  },
  component: RefundsPage,
});

type Status = "all" | "pending" | "info_needed" | "escalated" | "approved" | "rejected" | "processed";

const STATUS_TABS: { id: Status; label: string }[] = [
  { id: "pending", label: "Pending Review" },
  { id: "info_needed", label: "Info Needed" },
  { id: "escalated", label: "Escalated" },
  { id: "approved", label: "Approved" },
  { id: "processed", label: "Completed" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

const TONE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-700 border-rose-500/30",
  info_needed: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  escalated: "bg-purple-500/15 text-purple-700 border-purple-500/30",
  processed: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
};

const inr = (n: number | string | null | undefined) =>
  n == null || n === "" ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const fmtDate = (v: string | null | undefined) =>
  v ? format(new Date(v), "dd/MM/yyyy hh:mm a") : "—";

function relativeTime(iso: string | null | undefined) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success(label ? `${label} copied` : "Copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors border border-slate-200 shrink-0 cursor-pointer"
      title={`Copy ${label || "text"}`}
    >
      {copied ? <Check className="size-2.5 text-emerald-600" /> : <Copy className="size-2.5 text-slate-500" />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: any;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const toneMap: Record<string, string> = {
    default: "bg-card",
    warning: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900",
    danger: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900",
    success: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900",
  };
  return (
    <div className={`rounded-lg border p-3 ${toneMap[tone]}`}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className="size-3.5" />
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function RefundsPage() {
  const qc = useQueryClient();
  const role = useRole();
  const canDecide = role.hasAny(["admin", "super_admin", "finance"]);
  const [status, setStatus] = useState<Status>("pending");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const fnList = useServerFn(listRefundsAdvanced);
  const fnStats = useServerFn(refundStats);

  const stats = useQuery({
    queryKey: ["refund-stats"],
    queryFn: () => fnStats(),
    refetchInterval: 30_000,
  });

  const list = useQuery({
    queryKey: ["refund-requests", status, search],
    queryFn: () => fnList({ data: { status, search: search || undefined } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["refund-requests"] });
    qc.invalidateQueries({ queryKey: ["refund-stats"] });
    qc.invalidateQueries({ queryKey: ["refund-detail"] });
  };

  const totals = stats.data?.totals;
  const amounts = stats.data?.amounts;
  const aging = stats.data?.agingPending;

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Refund Management</h1>
          <p className="text-sm text-muted-foreground">
            Review, approve, process refund requests and audit every gateway transaction.
          </p>
        </div>
        <button
          onClick={() => {
            list.refetch();
            stats.refetch();
          }}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs"
        >
          <RefreshCw className="size-3" /> Refresh
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <KpiCard
          icon={Clock}
          label="Pending Review"
          value={totals?.pending ?? "—"}
          sub={aging?.over72h ? `${aging.over72h} over 72h` : "Awaiting action"}
          tone={aging && aging.over72h > 0 ? "danger" : "warning"}
        />
        <KpiCard icon={MessageSquareWarning} label="Info Needed" value={totals?.info_needed ?? "—"} tone="default" />
        <KpiCard icon={ArrowUpRight} label="Escalated" value={totals?.escalated ?? "—"} tone="default" />
        <KpiCard
          icon={CheckCircle2}
          label="Approved (Awaiting Payout)"
          value={totals?.approved ?? "—"}
          sub={inr(amounts?.approved)}
          tone="success"
        />
        <KpiCard
          icon={Wallet}
          label="Completed"
          value={totals?.processed ?? "—"}
          sub={`${totals?.all ? Math.round(((totals.processed || 0) / totals.all) * 100) : 0}% completed · ${inr(amounts?.processedThisMonth)} this month`}
          tone="success"
        />
        <KpiCard
          icon={TrendingUp}
          label="Total Refunded (all-time)"
          value={inr(amounts?.totalProcessed)}
          sub={`${totals?.rejected ?? 0} rejected`}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="rounded-md border bg-card p-0.5 flex flex-wrap">
          {STATUS_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setStatus(t.id)}
              className={`rounded px-3 py-1.5 text-xs font-medium ${
                status === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t.label}
              {totals && t.id !== "all" && (
                <span className="ml-1.5 rounded bg-background/20 px-1 py-0.5 text-[10px]">
                  {(totals as any)[t.id] ?? 0}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order / customer / mobile / reason"
            className="w-full rounded-md border bg-background pl-8 pr-2 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* List */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="grid grid-cols-12 gap-2 border-b bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div className="col-span-2">Order</div>
          <div className="col-span-3">Customer</div>
          <div className="col-span-1">Mode</div>
          <div className="col-span-2">Amount</div>
          <div className="col-span-2">Reason</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1 text-right">Created</div>
        </div>
        {list.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto size-4 animate-spin mb-2" /> Loading refunds…
          </div>
        ) : list.isError ? (
          <div className="p-8 text-center text-sm text-rose-600">
            Failed to load refunds: {(list.error as any)?.message || "Unknown error"}.
          </div>
        ) : (list.data?.rows ?? []).length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No refund requests in <b>{status}</b>.
          </div>
        ) : (
          (list.data?.rows ?? []).map((r: any) => (
            <button
              key={r.id}
              onClick={() => setActiveId(r.id)}
              className={`grid w-full grid-cols-12 gap-2 border-b px-3 py-2.5 text-sm text-left hover:bg-muted/40 transition-colors ${
                activeId === r.id ? "bg-primary/5" : ""
              }`}
            >
              <div className="col-span-2">
                <div className="font-mono text-xs font-semibold">{r.application?.application_code ?? "—"}</div>
                <div className="text-[10px] text-muted-foreground truncate">{r.lead?.service ?? ""}</div>
                {r.payment?.transaction_id && (
                  <div className="mt-1 flex items-center gap-1">
                    <span className="font-mono text-[10px] text-slate-700 bg-slate-100 px-1 py-0.5 rounded border border-slate-200 truncate max-w-[110px]" title={r.payment.transaction_id}>
                      {r.payment.transaction_id}
                    </span>
                    <CopyButton text={r.payment.transaction_id} label="Txn ID" />
                  </div>
                )}
              </div>
              <div className="col-span-3">
                <div className="font-medium truncate">{r.lead?.name ?? "—"}</div>
                <div className="text-[11px] text-muted-foreground truncate">{r.lead?.email ?? r.lead?.mobile ?? ""}</div>
              </div>
              <div className="col-span-1">
                <span className="text-[10px] rounded border px-1.5 py-0.5 uppercase tracking-wide">
                  {r.refund_mode ?? "full"}
                </span>
              </div>
              <div className="col-span-2 font-medium">{inr(r.refund_amount)}</div>
              <div className="col-span-2 truncate text-muted-foreground">{r.reason ?? "—"}</div>
              <div className="col-span-1">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] capitalize ${
                    TONE[r.processed_at || r.status === "processed" || r.application?.refund_processed_at ? "processed" : r.status ?? "pending"]
                  }`}
                >
                  {r.processed_at || r.status === "processed" || r.application?.refund_processed_at ? "Completed" : (r.status ?? "pending").replace("_", " ")}
                </span>
              </div>
              <div className="col-span-1 text-right">
                <div className="text-[11px] text-muted-foreground">{relativeTime(r.created_at)}</div>
              </div>
            </button>
          ))
        )}
      </div>

      {activeId && (
        <RefundDetailDrawer
          id={activeId}
          onClose={() => setActiveId(null)}
          canDecide={canDecide}
          onChanged={invalidate}
        />
      )}
    </div>
  );
}

/* ─────────────── Detail Drawer ─────────────── */

type DetailTab = "activity" | "details" | "customer";

function RefundDetailDrawer({
  id,
  onClose,
  canDecide,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  canDecide: boolean;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<DetailTab>("activity");

  const fnDetail = useServerFn(getRefundDetail);
  const fnGateways = useServerFn(listGateways);
  const fnApprove = useServerFn(approveRefund);
  const fnReject = useServerFn(rejectRefund);
  const fnProcess = useServerFn(markRefundProcessed);
  const fnInfo = useServerFn(requestRefundInfo);
  const fnEsc = useServerFn(escalateRefund);
  const fnNote = useServerFn(addRefundNote);

  const qGw = useQuery({
    queryKey: ["admin.gateways.list"],
    queryFn: () => fnGateways(),
  });

  const gatewayOptions = useMemo(() => {
    const rows = (qGw.data?.rows ?? []) as Array<{ id: string; name: string; display_name: string; is_enabled?: boolean }>;
    const set = new Set<string>();
    const list: Array<{ value: string; label: string }> = [];

    // All configured gateways from Gateways module
    for (const g of rows) {
      const val = (g.name || "").toLowerCase().trim();
      if (!val || set.has(val)) continue;
      set.add(val);
      list.push({
        value: val,
        label: g.display_name || g.name,
      });
    }

    // Default fallbacks if not in DB
    const fallbacks = [
      { value: "payu", label: "PayU" },
      { value: "ccavenue", label: "CCAvenue" },
      { value: "razorpay", label: "Razorpay" },
      { value: "cashfree", label: "Cashfree" },
      { value: "manual", label: "Manual / Bank Transfer" },
    ];

    for (const fb of fallbacks) {
      if (!set.has(fb.value)) {
        set.add(fb.value);
        list.push(fb);
      }
    }

    return list;
  }, [qGw.data]);

  const q = useQuery({
    queryKey: ["refund-detail", id],
    queryFn: () => fnDetail({ data: { id } }),
  });

  const req = q.data?.request as any;
  const payments = (q.data?.payments ?? []) as any[];
  const events = (q.data?.events ?? []) as any[];
  const customer = q.data?.customer as any;
  const order = req?.application;
  const lead = req?.lead;

  const paidAmount = payments
    .filter((p) => Number(p.amount) > 0 && p.status !== "failed" && p.status !== "cancelled")
    .reduce((a, p) => a + Number(p.amount), 0);
  const alreadyRefunded = payments
    .filter((p) => Number(p.amount) < 0)
    .reduce((a, p) => a + Math.abs(Number(p.amount)), 0);
  const refundable = Math.max(0, paidAmount - alreadyRefunded);

  const activeStatus = (req?.status ?? "pending") as string;
  const isProcessed = Boolean(
    req?.processed_at ||
    req?.status === "processed" ||
    order?.refund_processed_at
  );

  const [amount, setAmount] = useState<string>("");
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [deduction, setDeduction] = useState<string>("");
  const [deductionReason, setDeductionReason] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [paymentRef, setPaymentRef] = useState<string>("");
  const [gatewayName, setGatewayName] = useState<string>("");
  const [noteInput, setNoteInput] = useState("");

  const paidPayments = payments.filter((p) => Number(p.amount) > 0 && p.status !== "failed" && p.status !== "cancelled");
  const primaryPayment = paidPayments[0] ?? payments[0] ?? null;

  useEffect(() => {
    if (req) {
      setAmount(req.refund_amount ? String(req.refund_amount) : String(refundable || ""));
      setMode(req.refund_mode ?? "full");
      setDeduction(req.deduction_amount ? String(req.deduction_amount) : "");
      setDeductionReason(req.deduction_reason ?? "");
      setNotes(req.admin_notes ?? "");
      setPaymentRef(req.gateway_ref ?? "");
      
      const paidPayment = payments.find((p) => p.status === "paid" || p.status === "success" || Number(p.amount) > 0);
      const gw = (req.gateway_name || paidPayment?.gateway_name || "").toLowerCase().trim();
      setGatewayName(gw);
    }
  }, [req, refundable, payments]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["refund-detail", id] });
    onChanged();
  };

  const approve = useMutation({
    mutationFn: () =>
      fnApprove({
        data: {
          orderId: req.application_id,
          amount: Number(amount),
          adminNotes: notes || undefined,
          mode,
          deductionAmount: deduction ? Number(deduction) : undefined,
          deductionReason: deductionReason || undefined,
        },
      }),
    onSuccess: () => { toast.success("Refund approved"); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const reject = useMutation({
    mutationFn: () => fnReject({ data: { orderId: req.application_id, reason: notes || "Rejected by admin" } }),
    onSuccess: () => { toast.success("Refund rejected"); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const info = useMutation({
    mutationFn: () => fnInfo({ data: { orderId: req.application_id, note: notes } }),
    onSuccess: () => { toast.success("Info request logged"); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const esc = useMutation({
    mutationFn: () => fnEsc({ data: { orderId: req.application_id, note: notes } }),
    onSuccess: () => { toast.success("Escalated to super admin"); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const process = useMutation({
    mutationFn: () =>
      fnProcess({
        data: {
          orderId: req.application_id,
          amount: Number(amount),
          paymentReference: paymentRef,
          gatewayName: gatewayName || undefined,
        },
      }),
    onSuccess: () => { toast.success("Refund completed & customer notified"); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const addNote = useMutation({
    mutationFn: () => fnNote({ data: { orderId: req.application_id, note: noteInput } }),
    onSuccess: () => { toast.success("Note added"); setNoteInput(""); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const busy =
    approve.isPending ||
    reject.isPending ||
    info.isPending ||
    esc.isPending ||
    process.isPending ||
    addNote.isPending;

  return (
    <div className="fixed inset-0 z-50 flex bg-black/60" onClick={onClose}>
      <div className="ml-auto h-full w-full max-w-3xl overflow-y-auto bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {q.isLoading || !req ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div>
            {/* Header */}
            <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                    <Receipt className="size-3" />
                    {order?.application_code ?? id.slice(0, 8)} · Refund Request
                  </div>
                  <div className="mt-1 text-xl font-semibold">{lead?.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{lead?.service ?? ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${
                      TONE[isProcessed ? "processed" : activeStatus]
                    }`}
                  >
                    {isProcessed ? "Completed" : activeStatus.replace("_", " ")}
                  </span>
                  <button onClick={onClose} className="rounded-md border px-2 py-1 text-xs">Close</button>
                </div>
              </div>

              {/* Payment breakup band */}
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <div className="rounded border bg-muted/30 py-1.5">
                  <div className="text-[10px] text-muted-foreground uppercase">Paid</div>
                  <div className="text-sm font-semibold">{inr(paidAmount)}</div>
                </div>
                <div className="rounded border bg-muted/30 py-1.5">
                  <div className="text-[10px] text-muted-foreground uppercase">Already Refunded</div>
                  <div className="text-sm font-semibold">{inr(alreadyRefunded)}</div>
                </div>
                <div className="rounded border bg-muted/30 py-1.5">
                  <div className="text-[10px] text-muted-foreground uppercase">Refundable Now</div>
                  <div className="text-sm font-semibold text-emerald-700">{inr(refundable)}</div>
                </div>
                <div className="rounded border bg-muted/30 py-1.5">
                  <div className="text-[10px] text-muted-foreground uppercase">Requested</div>
                  <div className="text-sm font-semibold">{inr(req.refund_amount)}</div>
                </div>
              </div>

              {/* Tabs */}
              <div className="mt-3 flex gap-1 border-b -mb-4">
                {(["activity", "details", "customer"] as DetailTab[]).map((t) => {
                  const IconT = t === "activity" ? Activity : t === "details" ? IndianRupee : User2;
                  return (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`inline-flex items-center gap-1 px-3 py-2 text-xs font-medium capitalize border-b-2 ${
                        tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <IconT className="size-3" /> {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-5">
              {/* Highlighted Transaction Details (Always visible, specially prominent for approved/review) */}
              {primaryPayment && (
                <div className="rounded-xl border-2 border-amber-300 bg-amber-50/80 p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-amber-200/80 text-amber-900">
                        <CreditCard className="size-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                          Payment Transaction Details
                        </div>
                        <div className="text-[11px] text-amber-800">
                          {activeStatus === "approved"
                            ? "Use transaction ID to issue refund via payment gateway"
                            : "Original transaction recorded for this order"}
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                      {primaryPayment.status || "Paid"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                    <div className="bg-white/90 p-2 rounded-lg border border-amber-200/90 shadow-2xs">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Gateway</div>
                      <div className="font-bold text-slate-900 mt-0.5 capitalize truncate">
                        {primaryPayment.gateway_name || req.gateway_name || "—"}
                      </div>
                    </div>
                    <div className="bg-white/90 p-2 rounded-lg border border-amber-200/90 shadow-2xs">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Amount Paid</div>
                      <div className="font-bold text-emerald-700 mt-0.5">
                        {inr(primaryPayment.amount)}
                      </div>
                    </div>
                    <div className="bg-white/90 p-2 rounded-lg border border-amber-200/90 shadow-2xs">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Payment Date</div>
                      <div className="font-medium text-slate-800 mt-0.5 text-[11px] truncate">
                        {fmtDate(primaryPayment.payment_date || primaryPayment.created_at)}
                      </div>
                    </div>
                    <div className="bg-white/90 p-2 rounded-lg border border-amber-200/90 shadow-2xs">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Refundable Bal</div>
                      <div className="font-bold text-slate-900 mt-0.5">
                        {inr(refundable)}
                      </div>
                    </div>
                  </div>

                  {/* Transaction ID with Copy Button */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-white border border-amber-200 shadow-2xs">
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        Transaction ID / Payment Ref
                      </span>
                      <span className="font-mono font-bold text-sm text-slate-900 truncate block select-all">
                        {primaryPayment.transaction_id || "—"}
                      </span>
                    </div>
                    {primaryPayment.transaction_id && (
                      <CopyButton text={primaryPayment.transaction_id} label="Transaction ID" />
                    )}
                  </div>
                </div>
              )}

              {tab === "activity" && (
                <div>
                  <div className="text-sm font-semibold mb-3">Timeline</div>
                  <div className="relative pl-5 border-l space-y-4">
                    {events.length === 0 && (
                      <div className="text-sm text-muted-foreground">No events yet.</div>
                    )}
                    {events.map((e) => (
                      <div key={e.id} className="relative">
                        <span className="absolute -left-[26px] top-1 size-3 rounded-full border-2 border-primary bg-background" />
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium capitalize">{String(e.action).replace("_", " ")}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {fmtDate(e.created_at)}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {e.actor_name ?? "System"} · {e.actor_role ?? ""}
                        </div>
                        {e.note && (
                          <div className="mt-1 text-sm text-foreground/90 bg-muted/40 rounded px-2 py-1.5">{e.note}</div>
                        )}
                        {e.meta && Object.keys(e.meta ?? {}).length > 0 && (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {Object.entries(e.meta).map(([k, v]) => (
                              <span key={k} className="mr-3">
                                <span className="opacity-70">{k}:</span> {String(v ?? "—")}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add note */}
                  {canDecide && (
                    <div className="mt-5 rounded-md border p-3">
                      <div className="text-xs font-semibold mb-2 inline-flex items-center gap-1">
                        <PenLine className="size-3" /> Add audit note
                      </div>
                      <textarea
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        rows={2}
                        placeholder="Internal note for finance / audit trail…"
                        className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                      />
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={() => addNote.mutate()}
                          disabled={busy || !noteInput.trim()}
                          className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
                        >
                          Save note
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === "details" && (
                <div className="space-y-4">
                  <div className="rounded-md border p-3 space-y-1 text-sm">
                    <Row label="Reason category" value={req.reason_code ?? "—"} />
                    <Row label="Reason" value={req.reason ?? "—"} />
                    <Row label="Customer notes" value={req.customer_notes ?? "—"} />
                    <Row label="Requested at" value={fmtDate(req.created_at)} />
                    <Row label="Decided at" value={fmtDate(req.decided_at)} />
                    <Row label="Completed at" value={fmtDate(req.processed_at)} />
                    {req.gateway_ref && <Row label="Gateway ref" value={req.gateway_ref} />}
                    {req.gateway_name && <Row label="Gateway" value={req.gateway_name} />}
                    {req.deduction_amount && (
                      <Row
                        label="Deduction"
                        value={`${inr(req.deduction_amount)} — ${req.deduction_reason ?? "n/a"}`}
                      />
                    )}
                    {req.info_needed_note && <Row label="Info request" value={req.info_needed_note} />}
                    {req.escalation_note && <Row label="Escalation note" value={req.escalation_note} />}
                  </div>

                  <div>
                    <div className="text-sm font-semibold mb-2">Order Payments</div>
                    <div className="rounded-md border overflow-hidden">
                      <div className="grid grid-cols-6 gap-2 border-b bg-muted/30 px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <div>Date</div>
                        <div>Gateway</div>
                        <div>Txn / UTR</div>
                        <div className="text-right">Amount</div>
                        <div>Status</div>
                        <div>Notes</div>
                      </div>
                      {payments.length === 0 && (
                        <div className="p-3 text-xs text-muted-foreground text-center">No payments on this order.</div>
                      )}
                      {payments.map((p) => (
                        <div key={p.id} className="grid grid-cols-6 gap-2 border-b px-2 py-2 text-xs items-center hover:bg-muted/20">
                          <div>{fmtDate(p.payment_date ?? p.created_at)}</div>
                          <div className="font-medium capitalize">{p.gateway_name ?? "—"}</div>
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="font-mono truncate font-semibold" title={p.transaction_id ?? "—"}>
                              {p.transaction_id ?? "—"}
                            </span>
                            {p.transaction_id && (
                              <CopyButton text={p.transaction_id} label="Txn ID" />
                            )}
                          </div>
                          <div className={`text-right font-bold ${Number(p.amount) < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                            {inr(p.amount)}
                          </div>
                          <div className="capitalize">{p.status}</div>
                          <div className="truncate text-muted-foreground">{p.refund_reason ?? ""}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {tab === "customer" && (
                <div className="rounded-md border p-4 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <User2 className="size-4 text-muted-foreground" />
                    <span className="font-medium">{customer?.name ?? lead?.name ?? "—"}</span>
                    {customer?.customer_code && (
                      <span className="text-[11px] font-mono text-muted-foreground">{customer.customer_code}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="size-3.5" /> {customer?.primary_email ?? lead?.email ?? "—"}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="size-3.5" /> {customer?.primary_mobile ?? lead?.mobile ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    State: {customer?.state ?? lead?.state ?? "—"}
                  </div>
                </div>
              )}
            </div>

            {/* Action bar */}
            {canDecide && !isProcessed && (
              <div className="sticky bottom-0 border-t bg-background/95 backdrop-blur px-5 py-4 space-y-3">
                {(activeStatus === "pending" || activeStatus === "info_needed" || activeStatus === "escalated") && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase">Mode</label>
                      <div className="mt-1 flex rounded-md border p-0.5">
                        {(["full", "partial"] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => setMode(m)}
                            className={`flex-1 rounded px-2 py-1 text-xs capitalize ${mode === m ? "bg-primary text-primary-foreground" : ""}`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase">Refund amount (₹)</label>
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase">Deduction (₹)</label>
                      <input
                        type="number"
                        value={deduction}
                        onChange={(e) => setDeduction(e.target.value)}
                        placeholder="0"
                        className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase">Deduction reason</label>
                      <input
                        value={deductionReason}
                        onChange={(e) => setDeductionReason(e.target.value)}
                        placeholder="e.g. Processing fee"
                        className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                )}

                {activeStatus === "approved" && !isProcessed && (
                  <div className="space-y-2.5">
                    {primaryPayment && (
                      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs shadow-2xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CreditCard className="size-3.5 text-amber-700 shrink-0" />
                          <span className="font-bold text-amber-950 uppercase text-[10px]">Orig Payment:</span>
                          <span className="capitalize font-semibold text-slate-800">{primaryPayment.gateway_name || req.gateway_name || "—"}</span>
                          <span className="text-slate-300">·</span>
                          <span className="font-bold text-emerald-700">{inr(primaryPayment.amount)}</span>
                          <span className="text-slate-300">·</span>
                          <span className="font-mono font-bold text-slate-900">{primaryPayment.transaction_id || "—"}</span>
                        </div>
                        {primaryPayment.transaction_id && (
                          <CopyButton text={primaryPayment.transaction_id} label="Transaction ID" />
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase">Payout amount (₹)</label>
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase">Gateway</label>
                      <select
                        value={(gatewayName || "").toLowerCase()}
                        onChange={(e) => setGatewayName(e.target.value)}
                        className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm font-medium"
                      >
                        <option value="">Select gateway</option>
                        {gatewayOptions.map((gw) => (
                          <option key={gw.value} value={gw.value}>
                            {gw.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase">Gateway ref / UTR</label>
                      <input
                        value={paymentRef}
                        onChange={(e) => setPaymentRef(e.target.value)}
                        className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                        placeholder="e.g. UTR123456 / txn_abc"
                      />
                    </div>
                  </div>
                </div>
              )}

                {(activeStatus === "pending" || activeStatus === "info_needed" || activeStatus === "escalated") && (
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase">Notes to customer / audit</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      placeholder="Reason for approval / rejection / info request…"
                    />
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2">
                  {(activeStatus === "pending" || activeStatus === "info_needed" || activeStatus === "escalated") && (
                    <>
                      <button
                        onClick={() => info.mutate()}
                        disabled={busy || !notes.trim()}
                        className="inline-flex items-center gap-1 rounded-md border border-sky-500/40 px-3 py-1.5 text-sm text-sky-700 disabled:opacity-50"
                      >
                        {info.isPending ? <Loader2 className="size-3 animate-spin" /> : <MessageSquareWarning className="size-3" />}
                        Need Info
                      </button>
                      <button
                        onClick={() => esc.mutate()}
                        disabled={busy || !notes.trim()}
                        className="inline-flex items-center gap-1 rounded-md border border-purple-500/40 px-3 py-1.5 text-sm text-purple-700 disabled:opacity-50"
                      >
                        {esc.isPending ? <Loader2 className="size-3 animate-spin" /> : <ArrowUpRight className="size-3" />}
                        Escalate
                      </button>
                      <button
                        onClick={() => reject.mutate()}
                        disabled={busy || !notes.trim()}
                        className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 px-3 py-1.5 text-sm text-rose-700 disabled:opacity-50"
                      >
                        {reject.isPending ? <Loader2 className="size-3 animate-spin" /> : <XCircle className="size-3" />}
                        Reject
                      </button>
                      <button
                        onClick={() => approve.mutate()}
                        disabled={busy || !amount || Number(amount) <= 0}
                        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                      >
                        {approve.isPending ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                        Approve Refund
                      </button>
                    </>
                  )}

                  {activeStatus === "approved" && !isProcessed && (
                    <button
                      onClick={() => process.mutate()}
                      disabled={busy || !paymentRef.trim() || !amount || Number(amount) <= 0}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                    >
                      {process.isPending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                      Mark Completed & Notify Customer
                    </button>
                  )}
                </div>
              </div>
            )}

            {(isProcessed || activeStatus === "rejected") && (
              <div className="border-t bg-muted/30 px-5 py-3 text-xs text-muted-foreground flex items-center gap-2">
                <Timer className="size-3" />
                This refund is closed. All actions are audit-only from here.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-right">{value}</span>
    </div>
  );
}
