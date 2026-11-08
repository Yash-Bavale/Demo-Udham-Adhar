import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listLeadEmails, sendLeadEmail } from "@/lib/crm/emails-admin.functions";
import { listEmailTemplates, sendOrderTemplateEmail } from "@/lib/emails/emails.functions";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail, Send, History, Loader2, CheckCircle2, XCircle, Clock,
  ChevronDown, ChevronRight, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";


export function LeadEmailsTab({ leadId, leadService, orderId }: { leadId: string; leadService: string; orderId?: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listLeadEmails);
  const sendFn = useServerFn(sendLeadEmail);

  useRealtimeTable("email_logs", () => qc.invalidateQueries({ queryKey: ["admin.lead.emails", leadId] }), {
    filter: `lead_id=eq.${leadId}`,
  });
  useRealtimeTable("email_queue", () => qc.invalidateQueries({ queryKey: ["admin.lead.emails", leadId] }), {
    filter: `lead_id=eq.${leadId}`,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin.lead.emails", leadId],
    queryFn: () => listFn({ data: { leadId } }),
  });

  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  
  // Map service names to the uploaded template's keys
  const getInitialServiceKey = () => {
    const s = leadService.toLowerCase();
    if (s.includes("new")) return "new_udyam";
    if (s.includes("update")) return "update_udyam";
    if (s.includes("download")) return "download_udyam";
    if (s.includes("migrate")) return "migrate_udyam";
    if (s.includes("forgot")) return "forgot_contact";
    if (s.includes("correct")) return "correct_pan";
    return "talk_expert";
  };

  const [serviceKey, setServiceKey] = useState(getInitialServiceKey());

  const handleSend = async () => {
    setSending(true);
    try {
      await sendFn({
        data: {
          leadId,
          templateCode: "client-info-request",
          variables: { serviceKey },
        },
      });
      toast.success("Email queued for delivery");
      setSendOpen(false);
      qc.invalidateQueries({ queryKey: ["admin.lead.emails", leadId] });
      if (orderId) qc.invalidateQueries({ queryKey: ["admin.order", orderId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;

  // Dedupe: every successful send creates a row in BOTH email_queue and email_logs.
  // Prefer the email_logs row (it has the final sent status); key by queue_id when present.
  // Bodies are merged in BOTH directions: an empty body on either side is treated as
  // missing, so whichever copy still holds the rendered email is the one displayed.
  const pick = (...vals: any[]) => vals.find((v) => typeof v === "string" && v.trim() !== "") ?? null;
  const queueById = new Map<string, any>();
  for (const q of (data?.queue || [])) queueById.set(q.id, q);
  const logByQueueId = new Map<string, any>();
  for (const l of (data?.logs || [])) if (l.queue_id) logByQueueId.set(l.queue_id, l);
  const dedupMap = new Map<string, any>();
  const ccOf = (q: any): string | null => {
    const raw = q?.variables?.__cc;
    if (!raw) return null;
    const list = Array.isArray(raw) ? raw : String(raw).split(/[,;\s]+/);
    const out = list.map((s: any) => String(s).trim()).filter(Boolean);
    return out.length ? out.join(", ") : null;
  };
  for (const q of (data?.queue || [])) {
    const l = logByQueueId.get(q.id);
    dedupMap.set(`q:${q.id}`, l
      ? { ...q, cc_email: ccOf(q), body_html: pick(q.body_html, l.body_html), body_text: pick(q.body_text, l.body_text) }
      : { ...q, cc_email: ccOf(q) });
  }
  for (const l of (data?.logs || [])) {
    const key = l.queue_id ? `q:${l.queue_id}` : `l:${l.id}`;
    const q = l.queue_id ? queueById.get(l.queue_id) : null;
    const merged = q
      ? { ...l, cc_email: ccOf(q), body_html: pick(l.body_html, q.body_html), body_text: pick(l.body_text, q.body_text) }
      : l;
    dedupMap.set(key, merged);
  }
  const history = Array.from(dedupMap.values()).sort(
    (a: any, b: any) => new Date(b.sent_at || b.created_at || 0).getTime() - new Date(a.sent_at || a.created_at || 0).getTime()
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <History className="w-4 h-4" /> Email History
        </h3>
        <Dialog open={sendOpen} onOpenChange={setSendOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Send className="w-4 h-4" /> Send Email
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Client Info Request</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Template Variant</label>
                <Select value={serviceKey} onValueChange={setServiceKey}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select variant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new_udyam">New Udyam Registration</SelectItem>
                    <SelectItem value="update_udyam">Update Udyam Certificate</SelectItem>
                    <SelectItem value="download_udyam">Download Udyam Certificate</SelectItem>
                    <SelectItem value="migrate_udyam">Udyog Aadhaar to Udyam Migration</SelectItem>
                    <SelectItem value="forgot_contact">Forgot Mobile / Email Recovery</SelectItem>
                    <SelectItem value="correct_pan">PAN / Aadhaar Correction</SelectItem>
                    <SelectItem value="talk_expert">Talk to Expert</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  This uses the high-converting template you provided. Pre-fills order number, name, and form link.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSendOpen(false)} disabled={sending}>
                Cancel
              </Button>
              <Button onClick={handleSend} disabled={sending}>
                {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                Queue Email
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <ManualTemplateSender leadId={leadId} orderId={orderId} />
      </div>


      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Status</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No emails sent yet.
                </TableCell>
              </TableRow>
            ) : (
              history.map((item: any) => (
                <EmailRow key={item.id} item={item} />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function stripReplyPrefix(s: string | null | undefined): string {
  if (!s) return "";
  return String(s).replace(/^\s*(re|fwd|fw)\s*:\s*/i, "");
}

function EmailRow({ item }: { item: any }) {
  const [open, setOpen] = useState(false);
  // Only surface a "delivery error" when the send actually failed. SMTP
  // responses like "250 Message received" are success acknowledgements from
  // Zoho and should not be shown as an error, even though they land in the
  // `smtp_response` column.
  const isFailure = ["failed", "bounced", "dlq"].includes(String(item.status || "").toLowerCase());
  const err = isFailure ? (item.error_message || item.last_error || item.smtp_response) : null;
  const providerNote = !isFailure && item.smtp_response ? String(item.smtp_response) : null;
  const bodyHtml = item.body_html as string | null | undefined;
  const bodyText = item.body_text as string | null | undefined;
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen((v) => !v)}>
        <TableCell className="w-8">
          {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </TableCell>
        <TableCell><StatusIcon status={item.status} /></TableCell>
        <TableCell className="max-w-xs font-medium">
          <div className="truncate">{stripReplyPrefix(item.subject)}</div>
          <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] font-mono text-slate-500 truncate">{item.template_code || "NO_TEMPLATE"}</span>
            {item.template_exists === false && (
              <span className="shrink-0 rounded bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 border border-rose-200">
                unmatched
              </span>
            )}
          </div>
        </TableCell>
        <TableCell className="text-xs">
          <div>{item.to_email}</div>
          {item.cc_email && <div className="text-[10px] text-muted-foreground">CC: {item.cc_email}</div>}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {new Date(item.sent_at || item.created_at || Date.now()).toLocaleString("en-IN")}
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={5} className="bg-slate-50/60 p-0">
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
                <MetaCell label="From" value={item.from_email || "system default"} />
                <MetaCell label="To" value={item.to_email} />
                <MetaCell label="CC" value={item.cc_email || "—"} />
                <MetaCell label="Template" value={item.template_code || "—"} mono />
                <MetaCell label="Template Match" value={item.template_exists === false ? "Missing from Email Templates" : "Matched"} />
                <MetaCell label="Attempts" value={String(item.attempt ?? item.attempts ?? 1)} />
                <MetaCell label="Message ID" value={item.message_id || "—"} mono />
                <MetaCell label="Direction" value={item.direction || "outbound"} />
                <MetaCell label="Queued" value={item.created_at ? new Date(item.created_at).toLocaleString("en-IN") : "—"} />
                <MetaCell label="Sent" value={item.sent_at ? new Date(item.sent_at).toLocaleString("en-IN") : "—"} />
              </div>

              {err && (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-700 mb-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Delivery error
                  </div>
                  <pre className="text-[11px] text-rose-900 whitespace-pre-wrap font-mono">{err}</pre>
                </div>
              )}

              {providerNote && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 mb-0.5">Provider response</div>
                  <pre className="text-[11px] text-emerald-900 whitespace-pre-wrap font-mono">{providerNote}</pre>
                </div>
              )}

              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5">
                  Email body
                </div>
                {bodyHtml ? (
                  <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
                    <iframe
                      title={`email-${item.id}`}
                      srcDoc={bodyHtml}
                      sandbox=""
                      className="w-full min-h-[360px] bg-white"
                    />
                  </div>
                ) : bodyText ? (
                  <pre className="rounded-md border border-slate-200 bg-white p-3 text-[12px] whitespace-pre-wrap">{bodyText}</pre>
                ) : (
                  <div className="text-[12px] text-slate-500 italic">No body captured for this record.</div>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function MetaCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wider font-bold text-slate-500 mb-0.5">{label}</div>
      <div className={`text-[11px] text-slate-800 break-all ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "sent":
      return (
        <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200 gap-1 font-medium">
          <CheckCircle2 className="w-3 h-3" /> Sent
        </Badge>
      );
    case "failed":
    case "bounced":
    case "dlq":
      return (
        <Badge variant="outline" className="text-rose-600 bg-rose-50 border-rose-200 gap-1 font-medium">
          <XCircle className="w-3 h-3" /> Failed
        </Badge>
      );
    case "queued":
    case "sending":
      return (
        <Badge variant="outline" className="text-amber-600 bg-amber-50 border-amber-200 gap-1 font-medium">
          <Clock className="w-3 h-3" /> {status}
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function ManualTemplateSender({ leadId, orderId }: { leadId: string; orderId?: string }) {
  const qc = useQueryClient();
  const listTpl = useServerFn(listEmailTemplates);
  const sendTpl = useServerFn(sendOrderTemplateEmail);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin.email-templates.picker"],
    queryFn: () => listTpl({ data: {} as never }),
    enabled: open,
  });
  const rows = ((data?.rows as any[]) ?? []).filter((r) => r.is_enabled);

  const submit = async () => {
    if (!code) return;
    setBusy(true);
    try {
      await sendTpl({ data: { leadId, templateCode: code } });
      toast.success("Email queued for delivery");
      setOpen(false);
      setCode("");
      qc.invalidateQueries({ queryKey: ["admin.lead.emails", leadId] });
      if (orderId) qc.invalidateQueries({ queryKey: ["admin.order", orderId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2 ml-2">
          <Mail className="w-4 h-4" /> Send Template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send a template to this customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-3">
          <label className="text-sm font-medium">Template</label>
          <Select value={code} onValueChange={setCode}>
            <SelectTrigger><SelectValue placeholder="Choose a template…" /></SelectTrigger>
            <SelectContent className="max-h-80">
              {rows.map((r: any) => (
                <SelectItem key={r.code} value={r.code}>
                  <span className="flex items-center gap-2">
                    {r.sr_no != null && <span className="font-mono text-[10px] text-slate-500">#{r.sr_no}</span>}
                    <span>{r.name}</span>
                    <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${r.dispatch_mode === "manual" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>
                      {r.dispatch_mode === "manual" ? "Manual" : "Auto"}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Manual-dispatch templates are never sent automatically. Use this to send them (or any other template) with this order's context filled in.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !code}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Send now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

