import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  getPipelineHealth,
  getProcessingErrors,
  retryProcessingError,
  createTicketFromProcessingError,
  searchEmailAuditTrace,
  getAllTickets,
  getRecentInboxEmails,
  pollInboxNow,
} from "@/lib/mail/inbox-admin.functions";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Mail,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  ExternalLink,
  ShieldCheck,
  FolderSync,
  Ticket as TicketIcon,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

function StatsCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-center shadow-sm">
      <div className={`text-3xl font-bold ${color}`}>{value.toLocaleString()}</div>
      <div className="text-sm text-slate-600 mt-1">{label}</div>
    </div>
  );
}

// ─── PIPELINE HEALTH TAB ───────────────────────────────────────────────

function PipelineHealthTab() {
  const healthFn = useServerFn(getPipelineHealth);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["inbox.health"],
    queryFn: () => healthFn(),
  });

  if (isLoading || !data) {
    return <div className="p-8 text-center text-sm text-slate-500">Loading pipeline health...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex items-center justify-between p-4 bg-white border rounded-lg shadow-sm">
        <div className="flex items-center gap-3">
          <div className={`h-4 w-4 rounded-full ${data.isHealthy ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
          <div>
            <div className="font-semibold text-slate-900 flex items-center gap-2">
              Status: {data.isHealthy ? "Healthy & Operational" : "Action Required"}
              <Badge variant="outline" className="text-xs font-mono">{data.mailbox}</Badge>
            </div>
            <div className="text-xs text-slate-500">
              Last synchronized: {data.lastSyncAt ? new Date(data.lastSyncAt).toLocaleString() : "Never"}
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Today's Metrics */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Today's Ingestion Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard label="Emails Discovered" value={data.today.discovered} color="text-blue-600" />
          <StatsCard label="Successfully Ingested" value={data.today.completed} color="text-emerald-600" />
          <StatsCard label="New Support Tickets" value={data.today.newTickets} color="text-indigo-600" />
          <StatsCard label="Processing Errors" value={data.today.errors} color={data.today.errors > 0 ? "text-amber-600" : "text-slate-600"} />
        </div>
      </div>

      {/* Discovered Folders & Checkpoints */}
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between bg-slate-50/50">
          <div className="font-medium text-sm flex items-center gap-2">
            <FolderSync className="h-4 w-4 text-blue-600" /> Monitored Folders & Sync Checkpoints
          </div>
          <span className="text-xs text-slate-500">{data.checkpoints.length} folders active</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Folder Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Last Processed Time</TableHead>
              <TableHead>Sync Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.checkpoints.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-6 text-slate-500 text-sm">
                  No checkpoints recorded yet. Click "Poll Now" to discover folders.
                </TableCell>
              </TableRow>
            ) : (
              data.checkpoints.map((cp) => (
                <TableRow key={cp.id}>
                  <TableCell className="font-medium text-sm">{cp.folder_name}</TableCell>
                  <TableCell className="text-xs text-slate-500">{cp.folder_type || "Custom"}</TableCell>
                  <TableCell className="text-xs">
                    {cp.last_received_time_ms > 0
                      ? new Date(cp.last_received_time_ms).toLocaleString()
                      : "Initialized"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={cp.status === "active" ? "default" : "destructive"}>
                      {cp.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── PROCESSING ERRORS TAB ─────────────────────────────────────────────

function ProcessingErrorsTab() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"new" | "retrying" | "resolved" | "failed" | "dismissed" | "all">("new");
  const [selectedError, setSelectedError] = useState<any | null>(null);

  const errorsFn = useServerFn(getProcessingErrors);
  const retryFn = useServerFn(retryProcessingError);
  const createTicketFn = useServerFn(createTicketFromProcessingError);

  const { data, isLoading } = useQuery({
    queryKey: ["inbox.errors", page, status],
    queryFn: () => errorsFn({ data: { page, limit: 30, status } }),
  });

  const retryMut = useMutation({
    mutationFn: (id: string) => retryFn({ data: { id } }),
    onSuccess: (r) => {
      toast.success(r.message);
      qc.invalidateQueries({ queryKey: ["inbox"] });
      setSelectedError(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: (id: string) => createTicketFn({ data: { id } }),
    onSuccess: (r) => {
      toast.success(`Ticket ${r.ticketNumber} created`);
      qc.invalidateQueries({ queryKey: ["inbox"] });
      setSelectedError(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const errorList = (data as any)?.errors as any[] | undefined;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(["new", "retrying", "resolved", "failed", "all"] as const).map((s) => (
          <Button
            key={s}
            variant={status === s ? "default" : "outline"}
            size="sm"
            onClick={() => { setStatus(s); setPage(1); }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sender</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Error Message</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading errors...
                </TableCell>
              </TableRow>
            ) : !errorList || errorList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-slate-500 text-sm">
                  No processing errors matching filter.
                </TableCell>
              </TableRow>
            ) : (
              errorList.map((err: any) => (
                <TableRow key={err.id}>
                  <TableCell className="text-xs font-mono">{err.from_email || "unknown"}</TableCell>
                  <TableCell className="text-sm truncate max-w-[200px]">{err.subject || "(no subject)"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{err.error_stage}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-red-600 truncate max-w-[260px]">
                    {err.error_message}
                  </TableCell>
                  <TableCell>
                    <Badge variant={err.status === "resolved" ? "default" : "destructive"}>
                      {err.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedError(err)}>
                      Inspect
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {selectedError && (
        <Dialog open={!!selectedError} onOpenChange={(v) => !v && setSelectedError(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Email Processing Error</DialogTitle>
              <DialogDescription>
                Technical failure on UID {selectedError.zoho_mail_uid} in folder {selectedError.zoho_folder_name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm max-h-[60vh] overflow-y-auto">
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-xs font-mono whitespace-pre-wrap">
                {selectedError.error_message}
                {selectedError.error_stack && `\n\nStack:\n${selectedError.error_stack}`}
              </div>
              <div>
                <div className="font-semibold text-xs text-slate-600">Subject:</div>
                <div>{selectedError.subject || "(no subject)"}</div>
              </div>
              <div>
                <div className="font-semibold text-xs text-slate-600">Body Preview:</div>
                <div className="p-2 bg-slate-50 border rounded text-xs whitespace-pre-wrap">
                  {selectedError.body_snippet || "(no body snippet)"}
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => retryMut.mutate(selectedError.id)}
                disabled={retryMut.isPending}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${retryMut.isPending ? "animate-spin" : ""}`} /> Retry
              </Button>
              <Button
                variant="secondary"
                onClick={() => createMut.mutate(selectedError.id)}
                disabled={createMut.isPending}
              >
                <TicketIcon className="h-3.5 w-3.5 mr-1.5" /> Create Ticket Manually
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── ADMIN EMAIL AUDIT TRACE SEARCH TAB ────────────────────────────────

function EmailSearchTab() {
  const [query, setQuery] = useState("");
  const searchFn = useServerFn(searchEmailAuditTrace);

  const searchMut = useMutation({
    mutationFn: (q: string) => searchFn({ data: { query: q } }),
  });

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Input
          placeholder="Search by sender email, subject, Message-ID, or Zoho UID..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) searchMut.mutate(query.trim());
          }}
        />
        <Button onClick={() => query.trim() && searchMut.mutate(query.trim())} disabled={searchMut.isPending}>
          {searchMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-2" />} Search
        </Button>
      </div>

      {searchMut.data && (
        <div className="space-y-6">
          {/* Matched Tickets */}
          {searchMut.data.tickets.length > 0 && (
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <h3 className="font-semibold text-sm mb-3">Matched Support Tickets</h3>
              <div className="divide-y text-sm">
                {searchMut.data.tickets.map((t: any) => (
                  <div key={t.id} className="py-2 flex items-center justify-between">
                    <div>
                      <Link to="/admin/tickets/$ticketId" params={{ ticketId: t.id }} className="font-mono text-blue-600 hover:underline">
                        {t.ticket_number}
                      </Link>
                      <span className="ml-2">{t.subject}</span>
                      <span className="text-xs text-slate-500 ml-2">({t.ticket_email})</span>
                    </div>
                    <Badge variant="outline">{t.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audit Lifecycle Trail */}
          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-slate-50/50 font-medium text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Lifecycle Audit Events ({searchMut.data.auditEvents.length})
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Sender</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Folder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchMut.data.auditEvents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-slate-500 text-sm">
                      No audit records found matching "{query}".
                    </TableCell>
                  </TableRow>
                ) : (
                  searchMut.data.auditEvents.map((evt: any) => (
                    <TableRow key={evt.id}>
                      <TableCell className="text-xs text-slate-500">{new Date(evt.created_at).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-mono">{evt.stage}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{evt.sender_normalized}</TableCell>
                      <TableCell className="text-sm truncate max-w-[240px]">{evt.subject}</TableCell>
                      <TableCell className="text-xs text-slate-500">{evt.zoho_folder_name || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TICKETS & INBOX LOGS TAB ──────────────────────────────────────────

function TicketsListTab() {
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const ticketsFn = useServerFn(getAllTickets);

  const { data, isLoading } = useQuery({
    queryKey: ["inbox.allTickets", page, unlinkedOnly],
    queryFn: () => ticketsFn({ data: { page, limit: 30, unlinkedOnly } }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button
          variant={unlinkedOnly ? "default" : "outline"}
          size="sm"
          onClick={() => { setUnlinkedOnly(!unlinkedOnly); setPage(1); }}
        >
          {unlinkedOnly ? "Showing: Needs Review / Unlinked" : "Filter: Needs Review / Unlinked"}
        </Button>
      </div>

      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket #</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Sender Email</TableHead>
              <TableHead>Order Status</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading tickets...
                </TableCell>
              </TableRow>
            ) : (
              data?.tickets?.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-sm">
                    <Link to="/admin/tickets/$ticketId" params={{ ticketId: t.id }} className="text-blue-600 hover:underline">
                      {t.ticket_number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm truncate max-w-[200px]">{t.subject}</TableCell>
                  <TableCell className="text-xs font-mono">{t.ticket_email}</TableCell>
                  <TableCell>
                    {t.order_link_status === "needs_review" ? (
                      <Badge variant="destructive" className="text-[10px]">Needs Order Review</Badge>
                    ) : t.is_unlinked ? (
                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Unlinked</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">Linked</Badge>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="outline">{t.status}</Badge></TableCell>
                  <TableCell className="text-xs text-slate-500">{new Date(t.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────

export function InboxManagementPage() {
  const qc = useQueryClient();
  const pollFn = useServerFn(pollInboxNow);
  const [isPolling, setIsPolling] = useState(false);

  const handlePoll = async () => {
    setIsPolling(true);
    try {
      const res = (await pollFn({ data: { limit: 50 } })) as { message?: string };
      toast.success(res.message || "Inbox polled successfully");
      await qc.invalidateQueries({ queryKey: ["inbox"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Polling failed");
    } finally {
      setIsPolling(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-900">
            <Mail className="h-6 w-6 text-blue-600" /> Support Email Ingestion & Health
          </h1>
          <p className="text-sm text-slate-500">
            Deterministic email pipeline monitoring, multi-folder checkpoints, error queues, and lifecycle audit.
          </p>
        </div>
        <Button onClick={handlePoll} disabled={isPolling} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isPolling ? "animate-spin" : ""}`} />
          {isPolling ? "Scanning all folders..." : "Poll All Folders Now"}
        </Button>
      </div>

      <Tabs defaultValue="health" className="w-full">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="health">Pipeline Health</TabsTrigger>
          <TabsTrigger value="errors">Processing Errors</TabsTrigger>
          <TabsTrigger value="search">Admin Email Search</TabsTrigger>
          <TabsTrigger value="tickets">Support Tickets</TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="mt-4">
          <PipelineHealthTab />
        </TabsContent>

        <TabsContent value="errors" className="mt-4">
          <ProcessingErrorsTab />
        </TabsContent>

        <TabsContent value="search" className="mt-4">
          <EmailSearchTab />
        </TabsContent>

        <TabsContent value="tickets" className="mt-4">
          <TicketsListTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export const Route = createFileRoute("/admin/inbox-management")({
  head: () => ({
    meta: [
      { title: "Email Pipeline Health — BHS Support" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: InboxManagementPage,
});
