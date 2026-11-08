// Phase 3 finish — per-order ticket list. Shows open + historical tickets with
// the reopen indicator introduced in Phase 1 (support_tickets.reopened_count).

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, RefreshCw, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listOrderTickets } from "@/lib/tickets/list-order-tickets.functions";

function decodeEntities(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return _; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return _; } })
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&hellip;/gi, "…").replace(/&mdash;/gi, "—").replace(/&ndash;/gi, "–")
    .replace(/&rsquo;|&lsquo;/gi, "'").replace(/&rdquo;|&ldquo;/gi, '"');
}

interface Props {
  orderId: string;
}

const STATUS_TONE: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  awaiting_customer: "bg-amber-100 text-amber-700",
  resolved: "bg-slate-100 text-slate-600",
  closed: "bg-slate-100 text-slate-500",
};

export function TicketPanel({ orderId }: Props) {
  const fn = useServerFn(listOrderTickets);
  const { data, isLoading } = useQuery({
    queryKey: ["order-tickets", orderId],
    queryFn: () => fn({ data: { orderId } }),
  });

  const tickets = data?.tickets ?? [];

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-indigo-600" />
        <h3 className="text-sm font-bold text-slate-900">Support tickets</h3>
        {tickets.length > 0 && (
          <span className="text-xs text-slate-500">({tickets.length})</span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-slate-500">No tickets for this order.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {tickets.map((t) => {
            const status = (t.status ?? "").toLowerCase();
            const tone = STATUS_TONE[status] ?? "bg-slate-100 text-slate-600";
            const reopened = (t.reopened_count ?? 0) > 0;
            return (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {decodeEntities(t.subject) || t.ticket_number || t.id.slice(0, 8)}
                    </span>
                    {reopened && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                        <RefreshCw className="size-3" />
                        reopened ×{t.reopened_count}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {t.ticket_number ? `#${t.ticket_number} · ` : ""}
                    {new Date(t.created_at).toLocaleString()}
                  </div>
                </div>
                <Badge className={tone}>{t.status ?? "unknown"}</Badge>
                <Link
                  to="/admin/tickets/$ticketId"
                  params={{ ticketId: t.id }}
                  className="text-slate-500 hover:text-indigo-600"
                >
                  <ExternalLink className="size-4" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
