import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import {
  ArrowLeft, ChevronDown, ChevronUp, CornerDownLeft, Loader2, Mail, MoreHorizontal,
  RotateCcw, Send, StickyNote, X, User, Package, Info, History,
  ExternalLink, AlertTriangle, MessageSquare, CheckCircle2, Clock,
  Paperclip, Link2, Copy, Check, Sparkles, MoreVertical, Eye, Phone,
  MapPin, ShieldAlert, FileText, ChevronLeft, ChevronRight, Plus, Download,
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Quote,
  AlignLeft, AlignCenter, AlignRight, Image as ImageIcon, Search, Tag,
  ChevronRight as ChevronRightIcon, RefreshCw, Flame, Reply, XCircle, ZoomIn,
  Star, Folder, FolderPlus
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
  listSupportFolders, toggleTicketStar, moveTicketsToFolder, removeTicketsFromFolder
} from "@/lib/crm/support-folders.functions";
import { getTicketWorkspace, linkTicketToApplication, unlinkTicketFromApplication, syncTicketAttachmentsFn } from "@/lib/crm/ticket-workspace.functions";
import { computeOrderStage, STAGE_META, STAGE_BADGE_CLASS, type OrderStage } from "@/lib/crm/computeOrderStage";
import {
  replyToTicket, updateTicket, getAdjacentTickets,
  type TicketStatus, type TicketPriority
} from "@/lib/crm/tickets.functions";
import {
  closeTicketNormalT001, closeTicketRestartT001,
  closeTicketConsultationT001, closeTicketReplyReasonT002,
  closeTicketRefundR002,
  getTicketAttachmentUploadUrl, confirmTicketAttachment,
  makeOrderHotFromTicket,
} from "@/lib/tickets/ticket-actions.functions";
import { listCannedResponses } from "@/lib/tickets/canned-responses.functions";
import { listEmailTemplates } from "@/lib/emails/emails.functions";
import { listStaffForAssignment } from "@/lib/crm/tasks.functions";
import { reopenOrder } from "@/lib/orders/order-actions.functions";
import { getOrderDocumentSignedUrl } from "@/lib/crm/orders-v2.functions";
import { ReasonPicker } from "@/components/admin/workspace/ReasonPicker";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { parseEmailMessage, parseEmailReply, decodeHtmlEntities, htmlToPlainText } from "@/lib/support/emailParser";
import { useRole } from "@/hooks/useRole";

function escapeHtml(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const Route = createFileRoute("/admin/support/tickets/$ticketId")({
  head: ({ params }) => ({
    meta: [
      { title: `Ticket ${params.ticketId.slice(0, 8)} — BHS CRM` },
      { name: "description", content: "Support ticket workspace." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TicketWorkspace,
});

// ── formatters & constants ─────────────────────────────────

const STATUS_CONFIG: Record<TicketStatus, { bg: string; fg: string; border: string; label: string }> = {
  open:              { bg: "bg-blue-50", fg: "text-blue-700", border: "border-blue-200", label: "Open" },
  in_progress:       { bg: "bg-purple-50", fg: "text-purple-700", border: "border-purple-200", label: "In Progress" },
  waiting_customer:  { bg: "bg-amber-50", fg: "text-amber-700", border: "border-amber-200", label: "Waiting Customer" },
  resolved:          { bg: "bg-emerald-50", fg: "text-emerald-700", border: "border-emerald-200", label: "Resolved" },
  closed:            { bg: "bg-slate-100", fg: "text-slate-600", border: "border-slate-200", label: "Closed" },
};

const PRIORITY_CONFIG: Record<TicketPriority, { bg: string; fg: string; border: string; label: string; dot: string }> = {
  urgent: { bg: "bg-rose-50", fg: "text-rose-700", border: "border-rose-200", label: "Urgent", dot: "bg-rose-500" },
  high:   { bg: "bg-orange-50", fg: "text-orange-700", border: "border-orange-200", label: "High", dot: "bg-orange-500" },
  medium: { bg: "bg-rose-50", fg: "text-rose-700", border: "border-rose-200", label: "Medium", dot: "bg-rose-500" },
  low:    { bg: "bg-slate-100", fg: "text-slate-600", border: "border-slate-200", label: "Low", dot: "bg-slate-400" },
};

function ist(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

function formatDateDivider(iso: string | null | undefined) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso)).toUpperCase();
}

function formatTimeOnly(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function formatBytes(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "412 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface StageDateInfo {
  label: string;
  timestamp: string | null;
}

function getOrderStageTimestamp(
  stage: OrderStage | null | undefined,
  app: any,
  events?: any[],
  ticket?: any
): StageDateInfo | null {
  if (!app?.id && !ticket?.id) return null;

  const appEvents = Array.isArray(events) ? events : [];

  switch (stage) {
    case "closed": {
      const closeEv = appEvents.find((e: any) => {
        const et = String(e.event_type || "").toLowerCase();
        const nv = String(e.new_value || "").toLowerCase();
        const note = String(e.note || "").toLowerCase();
        return (
          et === "order_closed" ||
          et === "workflow_closed" ||
          nv.includes("close") ||
          nv.includes("cancel") ||
          note.includes("closed")
        );
      });
      const ts = closeEv?.created_at || app?.updated_at || ticket?.closed_at || app?.created_at || null;
      return { label: "Closed At", timestamp: ts };
    }

    case "completed": {
      const compEv = appEvents.find((e: any) => {
        const et = String(e.event_type || "").toLowerCase();
        const nv = String(e.new_value || "").toLowerCase();
        return (
          et === "order_completed" ||
          et === "application_completed" ||
          et === "certificate_uploaded" ||
          et === "certificate_delivered" ||
          nv === "completed" ||
          nv === "order_completed"
        );
      });
      const ts =
        app?.fulfilled_at ||
        app?.certificate_uploaded_at ||
        compEv?.created_at ||
        app?.updated_at ||
        app?.created_at ||
        null;
      return { label: "Completed At", timestamp: ts };
    }

    case "customer_delay": {
      const custEv = appEvents.find((e: any) => {
        const et = String(e.event_type || "").toLowerCase();
        const nv = String(e.new_value || "").toLowerCase();
        return et.includes("customer_delay") || nv.includes("customer_delay");
      });
      const ts = app?.customer_hold_started_at || custEv?.created_at || app?.updated_at || null;
      return { label: "Customer Delay At", timestamp: ts };
    }

    case "technical_delay": {
      const techEv = appEvents.find((e: any) => {
        const et = String(e.event_type || "").toLowerCase();
        const nv = String(e.new_value || "").toLowerCase();
        return et.includes("technical_delay") || nv.includes("technical_delay");
      });
      const ts = app?.technical_hold_started_at || techEv?.created_at || app?.updated_at || null;
      return { label: "Tech Delay At", timestamp: ts };
    }

    case "order_reopened": {
      const reopenEv = appEvents.find((e: any) => {
        const et = String(e.event_type || "").toLowerCase();
        const nv = String(e.new_value || "").toLowerCase();
        return et.includes("reopened") || nv.includes("reopened");
      });
      const ts = app?.reopened_at || reopenEv?.created_at || app?.updated_at || null;
      return { label: "Reopened At", timestamp: ts };
    }

    case "form_submitted": {
      return {
        label: "Form Submitted At",
        timestamp: app?.form_submitted_at || app?.updated_at || null,
      };
    }

    case "refunded": {
      return {
        label: "Refunded At",
        timestamp: app?.refund_processed_at || app?.refund_approved_at || app?.updated_at || null,
      };
    }

    case "refund_requested": {
      return {
        label: "Refund Requested At",
        timestamp: app?.refund_requested_at || app?.updated_at || null,
      };
    }

    case "certificate_ready": {
      return {
        label: "Cert Ready At",
        timestamp: app?.certificate_uploaded_at || app?.updated_at || null,
      };
    }

    case "consultation_completed": {
      const consultEv = appEvents.find((e: any) =>
        String(e.event_type || "").toLowerCase().includes("consultation")
      );
      return {
        label: "Consultation At",
        timestamp: consultEv?.created_at || app?.updated_at || null,
      };
    }

    default: {
      const latestEv = appEvents[0];
      const ts = latestEv?.created_at || app?.updated_at || null;
      if (ts) {
        return { label: "Latest Action", timestamp: ts };
      }
      return null;
    }
  }
}


// ── unified message type ───────────────────────────────────

export type MsgAttachment = {
  id: string;
  file_name?: string;
  fileName?: string;
  file_path?: string;
  storage_path?: string;
  size_bytes?: number;
  file_size?: number;
  url?: string | null;
  isImage?: boolean;
  mime_type?: string;
  mimeType?: string;
  cid?: string | null;
};

type Msg =
  | {
      kind: "inbound";
      id: string;
      created_at: string;
      from_email: string | null;
      subject: string | null;
      body_text: string;
      body_html?: string | null;
      attachments?: Array<MsgAttachment>;
    }
  | {
      kind: "outbound";
      id: string;
      created_at: string;
      from_email: string | null;
      subject: string | null;
      body_html: string | null;
      body_text: string;
      template_hint: string | null;
      status: string | null;
      author_name?: string | null;
      attachments?: Array<MsgAttachment | any>;
    }
  | {
      kind: "note";
      id: string;
      created_at: string;
      author_name: string;
      body_text: string;
      body_html?: string | null;
      attachments?: Array<MsgAttachment | any>;
    };

function extractTemplateHint(subject: string | null, bodyHtml: string | null): string | null {
  const src = `${subject ?? ""} ${bodyHtml ?? ""}`;
  const m = src.match(/\b(E0\d{2}|T0\d{2}|TB0\d{2})\b/i);
  if (m) return m[1].toUpperCase();
  if (/Order Confirmation & Tax Invoice/i.test(src)) return "E001";
  if (/Temporary Processing Hold|Operational Hold/i.test(src)) return "E003";
  if (/Service Changed|Service Has Been Updated/i.test(src)) return "E012";
  if (/Consultation Completed/i.test(src)) return "TB01";
  if (/Reply & Close/i.test(src)) return "TB02";
  return null;
}

// ── main component ─────────────────────────────────────────

function TicketWorkspace() {
  const { ticketId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = useRole();
  const isSupportOnly = role.roles.includes("support") && role.roles.length === 1;

  // Server functions
  const loadFn = useServerFn(getTicketWorkspace);
  const replyFn = useServerFn(replyToTicket);
  const updateFn = useServerFn(updateTicket);
  const cannedFn = useServerFn(listCannedResponses);
  const templatesFn = useServerFn(listEmailTemplates);
  const staffFn = useServerFn(listStaffForAssignment);
  const adjacentFn = useServerFn(getAdjacentTickets);
  const getDocUrlFn = useServerFn(getOrderDocumentSignedUrl);
  const reopenOrderFn = useServerFn(reopenOrder);
  const makeHotOrderFn = useServerFn(makeOrderHotFromTicket);
  const linkOrderFn = useServerFn(linkTicketToApplication);
  const unlinkOrderFn = useServerFn(unlinkTicketFromApplication);
  const getAttachmentUploadUrlFn = useServerFn(getTicketAttachmentUploadUrl);
  const confirmAttachmentFn = useServerFn(confirmTicketAttachment);

  const closeNormal = useServerFn(closeTicketNormalT001);
  const closeRestart = useServerFn(closeTicketRestartT001);
  const closeConsult = useServerFn(closeTicketConsultationT001);
  const closeReply = useServerFn(closeTicketReplyReasonT002);
  const closeRefund = useServerFn(closeTicketRefundR002);
  const syncAttachmentsFn = useServerFn(syncTicketAttachmentsFn);

  const foldersFn = useServerFn(listSupportFolders);
  const toggleStarFn = useServerFn(toggleTicketStar);
  const moveTicketsFn = useServerFn(moveTicketsToFolder);
  const removeTicketsFn = useServerFn(removeTicketsFromFolder);

  const doSyncAttachments = useMutation({
    mutationFn: () => syncAttachmentsFn({ data: { ticketId } }),
    onSuccess: (newAtts) => {
      if (newAtts && newAtts.length > 0) {
        toast.success(`Synced ${newAtts.length} image/attachment(s) from email!`);
      } else {
        toast.info("Checked email: no additional attachments found.");
      }
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Sync failed"),
  });

  // Queries
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["support-workspace", ticketId],
    queryFn: () => loadFn({ data: { ticketId } }),
  });

  const { data: foldersData, refetch: refetchFolders } = useQuery({
    queryKey: ["support-ticket-folders"],
    queryFn: () => foldersFn(),
  });
  const folders = foldersData?.folders ?? [];

  const toggleStarMutation = useMutation({
    mutationFn: (isStarred: boolean) => toggleStarFn({ data: { ticketId, isStarred } }),
    onSuccess: (res) => {
      invalidate();
      refetchFolders();
      toast.success(res.isStarred ? "Ticket starred" : "Ticket unstarred");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveToFolderMutation = useMutation({
    mutationFn: (folderId: string) => moveTicketsFn({ data: { ticketIds: [ticketId], folderId } }),
    onSuccess: () => {
      invalidate();
      refetchFolders();
      toast.success("Ticket moved to folder");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeFromFolderMutation = useMutation({
    mutationFn: () => removeTicketsFn({ data: { ticketIds: [ticketId] } }),
    onSuccess: () => {
      invalidate();
      refetchFolders();
      toast.success("Ticket removed from folder");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: cannedList } = useQuery({
    queryKey: ["canned-responses-active"],
    queryFn: () => cannedFn({ data: { activeOnly: true } }),
  });

  const { data: templatesList } = useQuery({
    queryKey: ["email-templates-active"],
    queryFn: () => templatesFn(),
  });

  const { data: staffData } = useQuery({
    queryKey: ["staff-for-assignment"],
    queryFn: () => staffFn({ data: {} } as any),
  });

  // Previous & Next navigation context
  const [navState, setNavState] = useState<{ prevId: string | null; nextId: string | null }>({
    prevId: null,
    nextId: null,
  });

  useEffect(() => {
    let handled = false;
    try {
      const stored = sessionStorage.getItem("bhs_ticket_ids_context");
      if (stored) {
        const ids: string[] = JSON.parse(stored);
        if (Array.isArray(ids)) {
          const idx = ids.indexOf(ticketId);
          if (idx !== -1) {
            setNavState({
              prevId: idx > 0 ? ids[idx - 1] : null,
              nextId: idx < ids.length - 1 ? ids[idx + 1] : null,
            });
            handled = true;
          }
        }
      }
    } catch {
      /* ignore */
    }

    if (!handled) {
      adjacentFn({ data: { ticketId } })
        .then((res) => {
          if (res) setNavState({ prevId: res.prevId, nextId: res.nextId });
        })
        .catch(() => { });
    }
  }, [ticketId]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["support-workspace", ticketId] });
    qc.invalidateQueries({ queryKey: ["support-tickets-ops"] });
    qc.invalidateQueries({ queryKey: ["support-ticket-stats"] });
    refetch();
  };

  const setLocalTicketStatus = (newStatus: TicketStatus) => {
    qc.setQueryData(["support-workspace", ticketId], (old: any) => {
      if (!old?.ticket) return old;
      return {
        ...old,
        ticket: {
          ...old.ticket,
          status: newStatus,
        },
      };
    });
  };

  // Realtime
  useRealtimeTable("ticket_replies", invalidate, { filter: `ticket_id=eq.${ticketId}` });
  const appId = data?.ticket?.application_id ?? null;
  useRealtimeTable("email_logs", invalidate, appId ? { filter: `application_id=eq.${appId}` } : undefined);

  // Modals & popups
  const [restartConfirm, setRestartConfirm] = useState(false);
  const [reopenConfirm, setReopenConfirm] = useState(false);
  const [consultOpen, setConsultOpen] = useState(false);
  const [consultNote, setConsultNote] = useState("");
  const [reasonOpen, setReasonOpen] = useState(false);
  const [cannedModalOpen, setCannedModalOpen] = useState(false);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const [sendOptionsOpen, setSendOptionsOpen] = useState(false);
  const [sendCopy, setSendCopy] = useState(false);
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  const [hotOrderModalOpen, setHotOrderModalOpen] = useState(false);

  // Composer state
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composeTab, setComposeTab] = useState<"reply" | "note">("reply");
  const [body, setBody] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [ccInput, setCcInput] = useState("");
  const [bccInput, setBccInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<
    Array<{ id: string; file: File; name: string; size: number; mimeType: string }>
  >([]);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const openComposer = (tab: "reply" | "note" = "reply") => {
    setComposeTab(tab);
    setIsComposerOpen(true);
    setTimeout(() => {
      composerRef.current?.focus();
    }, 50);
  };

  const handleAttachmentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const items = files.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file: f,
      name: f.name,
      size: f.size,
      mimeType: f.type || "application/octet-stream",
    }));
    setAttachedFiles((prev) => [...prev, ...items]);
    if (e.target) e.target.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachedFiles((prev) => prev.filter((a) => a.id !== id));
  };

  // Scroll listener for "Jump to latest"
  const handleThreadScroll = () => {
    if (!threadRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = threadRef.current;
    const distFromBottom = scrollHeight - (scrollTop + clientHeight);
    setShowScrollBottom(distFromBottom > 160);
  };

  const scrollToBottom = () => {
    if (threadRef.current) {
      threadRef.current.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
    }
  };

  // Build unified message list with accurate direction detection and email_logs integration
  const messages: Msg[] = useMemo(() => {
    if (!data) return [];
    const out: Msg[] = [];
    const t = data.ticket as any;
    const cust = t?.customers ?? {};
    const docs = (data.documents ?? []) as any[];
    const allTicketAtts = ((data as any).ticketReplyAttachments ?? []) as any[];

    // 1. Initial ticket description
    const desc = (t?.description ?? "").trim();
    const firstReply = data.replies?.[0];
    const firstReplyText = (firstReply?.reply_text ?? "").trim();
    const isFirstReplySameAsDesc =
      Boolean(desc && firstReplyText && (firstReplyText === desc || firstReplyText.includes(desc)));

    if (desc && !isFirstReplySameAsDesc) {
      if (t.source === "staff") {
        out.push({
          kind: "note",
          id: `ticket-desc-${t.id}`,
          created_at: t.created_at,
          author_name: t.assigned_name || "Staff",
          body_text: decodeHtmlEntities(desc),
        });
      } else {
        const initialAtts = allTicketAtts.filter((a: any) => !a.ticket_reply_id);
        out.push({
          kind: "inbound",
          id: `ticket-desc-${t.id}`,
          created_at: t.created_at,
          from_email: t.ticket_email ?? cust.primary_email ?? null,
          subject: t.subject ?? null,
          body_text: decodeHtmlEntities(desc),
          body_html: null,
          attachments: initialAtts.length > 0 ? initialAtts : (docs.length > 0 ? docs.slice(0, 2) : undefined),
        });
      }
    }

    // 2. Replies from ticket_replies
    for (const r of (data.replies ?? []) as any[]) {
      if (r.is_internal || r.direction === "note") {
        out.push({
          kind: "note",
          id: `n-${r.id}`,
          created_at: r.created_at,
          author_name: r.author_name ?? "Staff",
          body_text: decodeHtmlEntities(r.reply_text ?? ""),
        });
      } else if (r.direction === "inbound" || r.direction === "incoming") {
        const text = decodeHtmlEntities(r.reply_text ?? "");
        const hasAttachmentMention = /attach|document|proof|pdf|file/i.test(text);
        const replyAtts = (r.attachments && r.attachments.length > 0)
          ? r.attachments
          : allTicketAtts.filter((a: any) => a.ticket_reply_id === r.id);
        out.push({
          kind: "inbound",
          id: `ri-${r.id}`,
          created_at: r.created_at,
          from_email: r.from_email ?? t.ticket_email ?? cust.primary_email ?? null,
          subject: r.subject ?? null,
          body_text: text,
          body_html: r.body_html ?? null,
          attachments: replyAtts.length > 0 ? replyAtts : (hasAttachmentMention && docs.length > 0 ? docs : undefined),
        });
      } else {
        out.push({
          kind: "outbound",
          id: `ro-${r.id}`,
          created_at: r.emailed_at ?? r.created_at,
          from_email: r.from_email ?? "help@businesshelpservices.com",
          subject: r.subject ?? null,
          body_html: r.body_html ?? null,
          body_text: decodeHtmlEntities(r.reply_text ?? ""),
          template_hint: r.template_code ?? extractTemplateHint(r.subject, r.body_html),
          status: r.email_status ?? (r.emailed_at ? "Sent" : "Sent"),
          author_name: r.author_name ?? "Business Help Services",
          attachments: r.attachments,
        });
      }
    }

    // 3. Merged Email Logs from email_logs (with proper direction detection)
    for (const em of ((data as any).emails ?? []) as any[]) {
      const emCreated = em.sent_at || em.created_at;
      const isInbound = em.direction === "incoming" || em.direction === "inbound";

      const isDuplicate = out.some(
        (m) =>
          m.kind === (isInbound ? "inbound" : "outbound") &&
          (Math.abs(new Date(m.created_at).getTime() - new Date(emCreated).getTime()) < 5000 ||
            (m.subject && em.subject && m.subject === em.subject))
      );

      if (!isDuplicate) {
        if (isInbound) {
          const text = decodeHtmlEntities(em.body_text ?? "");
          const hasAttachmentMention = /attach|document|proof|pdf|file/i.test(text);
          out.push({
            kind: "inbound",
            id: `em-${em.id}`,
            created_at: emCreated,
            from_email: em.from_email ?? t.ticket_email ?? cust.primary_email ?? null,
            subject: em.subject ?? null,
            body_html: em.body_html ?? null,
            body_text: text,
            attachments: hasAttachmentMention && docs.length > 0 ? docs : undefined,
          });
        } else {
          out.push({
            kind: "outbound",
            id: `em-${em.id}`,
            created_at: emCreated,
            from_email: em.from_email ?? "help@businesshelpservices.com",
            subject: em.subject ?? null,
            body_html: em.body_html ?? null,
            body_text: decodeHtmlEntities(em.body_text ?? ""),
            template_hint: em.template_code ?? extractTemplateHint(em.subject, em.body_html),
            status: em.status ?? "Sent",
            author_name: "Business Help Services",
          });
        }
      }
    }

    out.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return out;
  }, [data]);

  // Group messages by IST date divider
  const groupedMessages = useMemo(() => {
    const groups: { dateLabel: string; items: Msg[] }[] = [];
    let currentGroup: { dateLabel: string; items: Msg[] } | null = null;

    for (const m of messages) {
      const label = formatDateDivider(m.created_at);
      if (!currentGroup || currentGroup.dateLabel !== label) {
        currentGroup = { dateLabel: label, items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(m);
    }
    return groups;
  }, [messages]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Mutations
  const sendReply = useMutation({
    mutationFn: async (opts?: { closeAfter?: boolean; armAutoclose?: boolean; cc?: string; bcc?: string }) => {
      let finalMessage = body.trim();

      const emailAttachments: Array<{ filename: string; content_base64: string; content_type: string }> = [];
      const storedFiles: Array<{ storage_path: string; file_name: string; mime_type: string; file_size: number }> = [];
      if (attachedFiles.length > 0) {
        let attachLinksHtml = "";
        for (const item of attachedFiles) {
          if (composeTab === "reply") {
            try {
              const buf = new Uint8Array(await item.file.arrayBuffer());
              let bin = "";
              for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
              emailAttachments.push({ filename: item.name, content_base64: btoa(bin), content_type: item.mimeType || "application/octet-stream" });
            } catch { /* falls back to link only */ }
          }
          try {
            const { path, token } = await getAttachmentUploadUrlFn({
              data: { ticketId, fileName: item.name, mimeType: item.mimeType },
            });
            const { supabase } = await import("@/integrations/supabase/client");
            const { error: upErr } = await supabase.storage
              .from("documents")
              .uploadToSignedUrl(path, token, item.file, {
                contentType: item.mimeType,
                upsert: true,
              });
            if (upErr) throw upErr;

            const confirmed = await confirmAttachmentFn({
              data: {
                ticketId,
                applicationId: data?.ticket?.application_id ?? null,
                filePath: path,
                fileName: item.name,
                mimeType: item.mimeType,
                sizeBytes: item.size,
              },
            });

            storedFiles.push({ storage_path: path, file_name: item.name, mime_type: item.mimeType || "application/octet-stream", file_size: item.size });
            if (confirmed?.url) {
              attachLinksHtml += `<p style="margin:4px 0;">📎 <strong>Attachment:</strong> <a href="${confirmed.url}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">${escapeHtml(item.name)}</a> (${formatBytes(item.size)})</p>`;
            }
          } catch (err: any) {
            toast.error(`Failed to upload ${item.name}: ${err?.message ?? "Upload error"}`);
          }
        }
        if (attachLinksHtml) {
          finalMessage += `<div data-crm-attachments="1" style="margin-top:16px;padding:10px 12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;color:#334155">${attachLinksHtml}</div>`;
        }
      }

      const shouldClose = composeTab === "reply" ? (opts?.closeAfter !== false) : false;

      return replyFn({
        data: {
          ticketId,
          message: finalMessage,
          isInternal: composeTab === "note",
          closeTicket: shouldClose,
          armAutoclose: false,
          cc: (opts && "cc" in opts && opts.cc) ? opts.cc : (ccInput.trim() || undefined),
          bcc: (opts && "bcc" in opts && opts.bcc) ? opts.bcc : (bccInput.trim() || undefined),
          attachments: emailAttachments.length ? emailAttachments : undefined,
          storedFiles: storedFiles.length ? storedFiles : undefined,
        },
      });
    },
    onMutate: () => {
      if (composeTab === "reply") {
        setLocalTicketStatus("closed");
      }
    },
    onSuccess: async (r: any) => {
      if (composeTab === "reply") {
        setLocalTicketStatus("closed");
      }
      if (composeTab === "note") {
        toast.success("Internal note added");
      } else if (r?.emailed === false) {
        toast.warning(`Reply saved: ${r.reason ?? "unknown"}`);
      } else {
        toast.success("Reply sent & ticket closed");
      }

      setBody("");
      setAttachedFiles([]);
      if (composerRef.current) composerRef.current.innerHTML = "";
      setCcInput("");
      setBccInput("");
      setShowCc(false);
      setShowBcc(false);
      setIsComposerOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeStatus = useMutation({
    mutationFn: (status: TicketStatus) => updateFn({ data: { id: ticketId, status } }),
    onMutate: (newStatus) => {
      setLocalTicketStatus(newStatus);
    },
    onSuccess: () => { toast.success("Status updated"); invalidate(); },
    onError: (e: Error) => { toast.error(e.message); invalidate(); },
  });

  const changePriority = useMutation({
    mutationFn: (priority: TicketPriority) => updateFn({ data: { id: ticketId, priority } }),
    onSuccess: () => { toast.success("Priority updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeAssignee = useMutation({
    mutationFn: (userId: string | null) =>
      updateFn({ data: { id: ticketId, assigned_to: userId } }),
    onSuccess: () => { toast.success("Assignee updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const doCloseNormal = useMutation({
    mutationFn: () => closeNormal({ data: { ticketId } }),
    onMutate: () => {
      setLocalTicketStatus("closed");
    },
    onSuccess: () => { toast.success("Ticket closed"); invalidate(); },
    onError: (e: Error) => { toast.error(e.message); invalidate(); },
  });

  const doCloseRestart = useMutation({
    mutationFn: () => closeRestart({ data: { ticketId } }),
    onMutate: () => {
      setLocalTicketStatus("closed");
    },
    onSuccess: () => { toast.success("Order restarted & ticket closed"); invalidate(); },
    onError: (e: Error) => { toast.error(e.message); invalidate(); },
  });

  const doCloseConsult = useMutation({
    mutationFn: (remarks?: string) =>
      closeConsult({ data: { ticketId, remarks: remarks || undefined } }),
    onMutate: () => {
      setLocalTicketStatus("closed");
    },
    onSuccess: () => { toast.success("TB01 Consultation completed — ticket closed"); invalidate(); },
    onError: (e: Error) => { toast.error(e.message); invalidate(); },
  });

  const doCloseReply = useMutation({
    mutationFn: (v: { reasonId: string | null; reasonLabel: string; replyBody: string }) =>
      closeReply({ data: { ticketId, reasonId: v.reasonId, reasonLabel: v.reasonLabel, replyBody: v.replyBody } }),
    onMutate: () => {
      setLocalTicketStatus("waiting_customer");
    },
    onSuccess: () => { toast.success("TB02 sent — 24h auto-close armed"); invalidate(); },
    onError: (e: Error) => { toast.error(e.message); invalidate(); },
  });

  const doCloseRefund = useMutation({
    mutationFn: (v: { reasonLabel?: string; replyBody?: string }) =>
      closeRefund({ data: { ticketId, reasonLabel: v.reasonLabel, replyBody: v.replyBody } }),
    onMutate: () => {
      setLocalTicketStatus("closed");
    },
    onSuccess: () => {
      toast.success("R002 Refund Rejected email sent & ticket closed");
      setReasonOpen(false);
      invalidate();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      invalidate();
    },
  });

  const doReopenOrder = useMutation({
    mutationFn: (orderId: string) => reopenOrderFn({ data: { orderId } }),
    onSuccess: () => {
      toast.success("Order reopened successfully — active in Hot Orders");
      invalidate();
      if (app.id) {
        qc.invalidateQueries({ queryKey: ["admin.order", app.id] });
        qc.invalidateQueries({ queryKey: ["order-workflow-state", app.id] });
        qc.invalidateQueries({ queryKey: ["order-tickets", app.id] });
        qc.invalidateQueries({ queryKey: ["workflow-events", app.id] });
      }
      qc.invalidateQueries({ queryKey: ["admin.orders.v2"] });
      qc.invalidateQueries({ queryKey: ["due-reminders-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doMakeHotOrder = useMutation({
    mutationFn: (args?: { orderId?: string; note?: string } | string) => {
      const orderId = typeof args === "string" ? args : args?.orderId;
      const note = typeof args === "object" ? args?.note : undefined;
      return makeHotOrderFn({ data: { ticketId, orderId: orderId || app.id, note } });
    },
    onSuccess: () => {
      toast.success("🔥 Order reopened & prioritized as Hot Order!");
      setHotOrderModalOpen(false);
      invalidate();
      if (app.id) {
        qc.invalidateQueries({ queryKey: ["admin.order", app.id] });
        qc.invalidateQueries({ queryKey: ["order-workflow-state", app.id] });
        qc.invalidateQueries({ queryKey: ["order-tickets", app.id] });
        qc.invalidateQueries({ queryKey: ["workflow-events", app.id] });
      }
      qc.invalidateQueries({ queryKey: ["admin.orders.v2"] });
      qc.invalidateQueries({ queryKey: ["due-reminders-summary"] });
      qc.invalidateQueries({ queryKey: ["sidebar-notification-counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doLinkOrder = useMutation({
    mutationFn: (targetApplicationId: string) =>
      linkOrderFn({ data: { ticketId, applicationId: targetApplicationId } }),
    onSuccess: () => {
      toast.success("Order linked successfully to ticket");
      invalidate();
      qc.invalidateQueries({ queryKey: ["support-workspace", ticketId] });
      qc.invalidateQueries({ queryKey: ["support-tickets-ops"] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to link order"),
  });

  const doUnlinkOrder = useMutation({
    mutationFn: () => unlinkOrderFn({ data: { ticketId } }),
    onSuccess: () => {
      toast.success("Order unlinked from ticket");
      invalidate();
      qc.invalidateQueries({ queryKey: ["support-workspace", ticketId] });
      qc.invalidateQueries({ queryKey: ["support-tickets-ops"] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to unlink order"),
  });

  // execCommand-based rich text formatting for contenteditable
  const execFmt = (command: string, value?: string) => {
    composerRef.current?.focus();
    document.execCommand(command, false, value ?? "");
    // Sync body state from innerHTML after command
    if (composerRef.current) {
      setBody(composerRef.current.innerHTML);
    }
  };

  const insertOrderDetails = () => {
    const t = data?.ticket as any;
    const app = t?.applications ?? {};
    const serviceName = t?.services?.service_name ?? app?.services?.service_name ?? "Service";
    const lead = app?.leads ?? (t?.customers ? { name: t.customers.name, email: t.customers.primary_email, mobile: t.customers.primary_mobile } : null);
    const orderStage = app?.id ? computeOrderStage(lead, app) : null;
    const stageLabel = orderStage ? STAGE_META[orderStage].label : (app.fulfillment_status ? app.fulfillment_status.replace(/_/g, " ") : "Processing");
    const stageDate = getOrderStageTimestamp(orderStage, app, data?.events, t);
    const stageDateHtml = stageDate?.timestamp ? `<p><strong>${stageDate.label}:</strong> ${ist(stageDate.timestamp)}</p>` : "";
    const details = `<p><strong>Order No:</strong> ${app.application_code || "—"}</p><p><strong>Service:</strong> ${serviceName}</p><p><strong>Order Date:</strong> ${ist(app.created_at || t.created_at)}</p><p><strong>Order Stage:</strong> ${stageLabel}</p>${stageDateHtml}`;

    if (composerRef.current) {
      composerRef.current.focus();
      document.execCommand("insertHTML", false, details);
      setBody(composerRef.current.innerHTML);
    }
    toast.success("Order details inserted");
    composerRef.current?.focus();
  };

  const handleDownloadDoc = async (doc: any) => {
    try {
      const res = await getDocUrlFn({ data: { path: doc.file_path } });
      if (res?.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
      } else {
        toast.error(res?.error ?? "Failed to download document");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to download document");
    }
  };

  // Loading & Error States
  if (isLoading) {
    return (
      <div className="h-[calc(100dvh-3.5rem)] -m-4 md:-m-6 -mb-24 md:-mb-6 flex flex-col bg-slate-50 p-6 space-y-4">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-20 bg-white border border-slate-200 rounded-xl p-4 animate-pulse" />
        <div className="flex-1 flex gap-4">
          <div className="flex-1 bg-white border border-slate-200 rounded-xl p-6 animate-pulse" />
          <div className="w-80 bg-white border border-slate-200 rounded-xl p-6 animate-pulse hidden lg:block" />
        </div>
      </div>
    );
  }

  if (isError || !data?.ticket) {
    return (
      <div className="h-[calc(100dvh-3.5rem)] -m-4 md:-m-6 -mb-24 md:-mb-6 flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <AlertTriangle className="size-10 text-rose-500 mb-2" />
        <h3 className="text-base font-bold text-slate-800">Unable to load ticket workspace</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          The ticket data could not be retrieved. It may have been archived or permissions may be restricted.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => refetch()}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
          >
            Retry
          </button>
          <button
            onClick={() => navigate({ to: "/admin/support/tickets" })}
            className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50"
          >
            Back to Tickets
          </button>
        </div>
      </div>
    );
  }

  const ticket = data.ticket as any;
  const cust = ticket.customers ?? {};
  const app = ticket.applications ?? {};
  const isClosed = ["closed", "resolved"].includes(ticket.status);
  const serviceName = ticket.services?.service_name ?? app.services?.service_name ?? "New Udyam Certificate Registration";
  const customerEmailAddress = ticket.ticket_email ?? cust.primary_email ?? "customer@mail.com";

  // Reopen button is enabled for any linked order
  const canReopenOrder = Boolean(app.id);

  // SLA Calculation
  const slaTargetHours = ticket.priority === "urgent" ? 4 : ticket.priority === "high" ? 8 : ticket.priority === "medium" ? 24 : 48;
  const slaTargetMs = new Date(ticket.created_at).getTime() + slaTargetHours * 3600 * 1000;
  const slaDiffMs = slaTargetMs - Date.now();
  let slaText = "";
  let slaTone: "healthy" | "warning" | "breached" = "healthy";

  if (isClosed) {
    slaText = "Resolved";
    slaTone = "healthy";
  } else if (slaDiffMs <= 0) {
    const bH = Math.floor(Math.abs(slaDiffMs) / 3600000);
    const bM = Math.floor((Math.abs(slaDiffMs) % 3600000) / 60000);
    slaText = `Breached by ${bH}h ${bM}m`;
    slaTone = "breached";
  } else {
    const rH = Math.floor(slaDiffMs / 3600000);
    const rM = Math.floor((slaDiffMs % 3600000) / 60000);
    slaText = `${rH}h ${rM}m remaining`;
    slaTone = rH < 4 ? "warning" : "healthy";
  }

  const staffList = (((staffData as any)?.staff ?? []) as Array<{ id: string; name: string }>).map((s) => ({
    id: s.id,
    full_name: s.name,
  }));

  return (
    <div className="h-[calc(100dvh-3.5rem)] -m-4 md:-m-6 -mb-24 md:-mb-6 p-3 md:p-4 bg-slate-100/70 flex gap-3 md:gap-4 overflow-hidden font-sans min-w-0">
      {/* ── LEFT COLUMN: Ticket Header + Conversation Feed + Reply Composer ── */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        {/* ── 1. Ticket Header Card matching Image 2 ────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs shrink-0 mb-3">
          {/* Row 1: Back to Tickets Link */}
          <div className="flex items-center justify-between mb-1.5">
            <button
              onClick={() => {
                if (typeof window !== "undefined" && window.history.length > 1) {
                  window.history.back();
                } else {
                  navigate({ to: "/admin/support/tickets" });
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <ArrowLeft className="size-3.5" /> Back to Tickets
            </button>

            {/* Mobile context sidebar button */}
            <button
              onClick={() => setSidebarDrawerOpen(true)}
              className="lg:hidden inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700"
            >
              <Info className="size-3.5" /> Info
            </button>
          </div>

          {/* Row 1: Star + Ticket Number + Folder Badge + NEW Badge (Left) & Quick Action Buttons (Right) */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              {/* Star toggle */}
              <button
                type="button"
                onClick={() => toggleStarMutation.mutate(!ticket.is_starred)}
                disabled={toggleStarMutation.isPending}
                className="p-1 rounded-md text-slate-300 hover:text-amber-500 hover:bg-slate-100 transition-colors"
                title={ticket.is_starred ? "Unstar ticket" : "Star ticket"}
              >
                <Star
                  className={`size-5 transition-transform hover:scale-110 ${
                    ticket.is_starred ? "fill-amber-400 text-amber-500" : "text-slate-300 hover:text-amber-400"
                  }`}
                />
              </button>

              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 font-mono shrink-0">
                {ticket.ticket_number}
              </h1>

              {/* Folder Selector Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                    title="Organise in folder"
                  >
                    <Folder className="size-3.5 text-indigo-600" />
                    <span>{ticket.folder_name ? ticket.folder_name : "Move to folder…"}</span>
                    <ChevronDown className="size-3 text-slate-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <div className="px-2 py-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Folders
                  </div>
                  {folders.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-slate-400 italic">No folders created yet</div>
                  ) : (
                    folders.map((f: any) => (
                      <DropdownMenuItem
                        key={f.id}
                        onClick={() => moveToFolderMutation.mutate(f.id)}
                        className="text-xs cursor-pointer flex items-center justify-between"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <Folder className="size-3.5 text-indigo-600" />
                          <span className="truncate">{f.name}</span>
                        </span>
                        {ticket.folder_id === f.id && <Check className="size-3.5 text-emerald-600" />}
                      </DropdownMenuItem>
                    ))
                  )}
                  {ticket.folder_id && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => removeFromFolderMutation.mutate()}
                        className="text-xs text-rose-600 cursor-pointer"
                      >
                        <X className="size-3.5 mr-2" /> Remove from folder
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {ticket.is_new && (
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide bg-[#e11d48] text-white shrink-0 shadow-2xs">
                  NEW
                </span>
              )}
            </div>

            {/* Action Buttons: Close Ticket | TB01 | R002 Refund | Reopen & Hot */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => doCloseNormal.mutate()}
                disabled={isClosed || doCloseNormal.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs shrink-0 cursor-pointer"
              >
                {doCloseNormal.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3.5 text-emerald-600" />
                )}
                Close Ticket
              </button>

              <button
                onClick={() => setConsultOpen(true)}
                disabled={isClosed}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs shrink-0 cursor-pointer"
              >
                <FileText className="size-3.5 text-blue-600" />
                Consultation Completed (TB01)
              </button>

              <button
                onClick={() => setReasonOpen(true)}
                disabled={isClosed}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs shrink-0 cursor-pointer"
              >
                <XCircle className="size-3.5 text-rose-600" />
                Refund Rejected
              </button>

              {Boolean(app.id) && (
                <button
                  onClick={() => setHotOrderModalOpen(true)}
                  disabled={doMakeHotOrder.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/80 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs shrink-0 cursor-pointer"
                  title="Reopen order, escalate to Hot Priority (sounds alarm), and close ticket"
                >
                  {doMakeHotOrder.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Flame className="size-3.5 text-amber-300 fill-amber-300" />
                  )}
                  Reopen &amp; Hot 🔥
                </button>
              )}

              <button
                type="button"
                onClick={() => doSyncAttachments.mutate()}
                disabled={doSyncAttachments.isPending}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all shadow-2xs shrink-0 cursor-pointer disabled:opacity-50"
                title="Fetch any missing customer images, screenshots or attachments directly from email"
              >
                <RefreshCw className={`size-3 text-slate-500 ${doSyncAttachments.isPending ? "animate-spin text-blue-600" : ""}`} />
                <span>{doSyncAttachments.isPending ? "Syncing..." : "Sync Images"}</span>
              </button>
            </div>
          </div>

          {/* Row 2: Subject / Subtitle */}
          <div className="mt-1 text-xs font-semibold text-slate-700 break-words whitespace-normal leading-relaxed">
            {ticket.subject
              ? (ticket.subject.trim().toLowerCase().startsWith("re:")
                  ? ticket.subject
                  : `Re: ${ticket.subject}`)
              : "(no subject)"}
          </div>

          {/* Relationship indicators (Created from closed ticket / follow-up tickets) */}
          {(data as any)?.parentTicket && (
            <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              <Link2 className="size-3.5 text-amber-600 shrink-0" />
              <span>
                Created from closed ticket{" "}
                <Link
                  to="/admin/support/tickets/$ticketId"
                  params={{ ticketId: (data as any).parentTicket.id }}
                  className="font-mono font-bold text-amber-900 underline hover:text-amber-950"
                >
                  {(data as any).parentTicket.ticket_number || (data as any).parentTicket.id.slice(0, 8)}
                </Link>
              </span>
            </div>
          )}

          {(data as any)?.childTickets && (data as any).childTickets.length > 0 && (
            <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 border border-blue-200 text-blue-900 text-xs">
              <Link2 className="size-3.5 text-blue-600 shrink-0" />
              <span>
                Created follow-up ticket{(data as any).childTickets.length > 1 ? "s" : ""}:{" "}
                {(data as any).childTickets.map((ct: any, idx: number) => (
                  <span key={ct.id}>
                    {idx > 0 && ", "}
                    <Link
                      to="/admin/support/tickets/$ticketId"
                      params={{ ticketId: ct.id }}
                      className="font-mono font-bold text-blue-900 underline hover:text-blue-950"
                    >
                      {ct.ticket_number || ct.id.slice(0, 8)}
                    </Link>
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>

        {/* ── 2. Conversation Box + Sticky Reply Composer Container ──────── */}
        <div className="flex-1 min-h-0 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex flex-col overflow-hidden relative">
          {/* Scrollable Conversation Feed */}
          <div
            ref={threadRef}
            onScroll={handleThreadScroll}
            className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50/40"
          >
            {groupedMessages.length === 0 ? (
              <div className="text-center py-20 text-slate-400 flex flex-col items-center gap-2">
                <MessageSquare className="size-10 text-slate-300" />
                <p className="font-semibold text-slate-700 text-sm">No messages yet</p>
                <p className="text-xs text-slate-400">Use the reply composer below to send an email to the customer.</p>
              </div>
            ) : (
              groupedMessages.map((group, gIdx) => (
                <div key={group.dateLabel || gIdx} className="space-y-4">
                  {/* Centered Date Divider matching Screenshot */}
                  {group.dateLabel && (
                    <div className="flex items-center justify-center my-4">
                      <div className="relative flex items-center justify-center w-full">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-slate-200" />
                        </div>
                        <div className="relative bg-slate-100 px-4 py-0.5 rounded-full border border-slate-200/90 text-[11px] font-semibold text-slate-500 uppercase tracking-wider shadow-2xs">
                          {group.dateLabel}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Messages in this date group */}
                  {group.items.map((m) => (
                    <MessageCard
                      key={m.id}
                      msg={m}
                      customerName={cust.name}
                      customerEmail={ticket.ticket_email ?? cust.primary_email}
                      onDownloadDoc={handleDownloadDoc}
                      onReply={() => openComposer("reply")}
                    />
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Jump to latest button */}
          {showScrollBottom && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-64 right-8 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/85 text-white text-xs font-semibold shadow-lg hover:bg-slate-900 transition-all backdrop-blur-xs"
            >
              <ChevronDown className="size-3.5" /> Jump to latest
            </button>
          )}

          {/* ── 3. Sticky Bottom Reply Composer ─────────────── */}
          {!isComposerOpen ? (
            <div className="bg-white border-t border-slate-200 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0 shadow-xs">
              <button
                type="button"
                onClick={() => openComposer("reply")}
                className="flex-1 flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-slate-50 hover:bg-slate-100/90 border border-slate-200 text-slate-500 text-xs font-medium cursor-pointer transition text-left select-none"
              >
                <Reply className="size-4 text-blue-600 shrink-0" />
                <span className="truncate">
                  Click here to reply to <strong className="text-slate-800 font-semibold">{customerEmailAddress || cust?.name || "Customer"}</strong>…
                </span>
              </button>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openComposer("reply")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs cursor-pointer select-none"
                >
                  <Reply className="size-3.5" /> Reply
                </button>
                <button
                  type="button"
                  onClick={() => openComposer("note")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition shadow-xs cursor-pointer select-none"
                >
                  <StickyNote className="size-3.5 text-amber-700" /> Internal Note
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border-t border-slate-200 shrink-0 animate-in slide-in-from-bottom-2 duration-150">
              {/* Tab Header Row: Reply | Internal Note + Recipient chip + Cc / Bcc + Minimize */}
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-1 flex-wrap gap-1.5">
                {/* Left Tabs */}
                <div className="flex items-center">
                  <button
                    onClick={() => setComposeTab("reply")}
                    className={`px-3 py-1.5 text-xs font-bold transition-all relative ${
                      composeTab === "reply"
                        ? "text-blue-600 border-b-2 border-blue-600"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Reply
                  </button>
                  <button
                    onClick={() => setComposeTab("note")}
                    className={`px-3 py-1.5 text-xs font-bold transition-all relative ${
                      composeTab === "note"
                        ? "text-amber-700 border-b-2 border-amber-500"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Internal Note
                  </button>
                </div>

                {/* Right: To Recipient Chip + Cc / Bcc + Minimize button */}
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  {composeTab === "reply" && (
                    <>
                      <span className="text-slate-500 font-medium">To:</span>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-mono text-xs">
                        <span>{customerEmailAddress}</span>
                        <button
                          type="button"
                          onClick={() => toast.info(`Recipient email is bound to ticket (${customerEmailAddress})`)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X className="size-3" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowCc((v) => !v)}
                        className={`px-1.5 py-0.5 rounded text-xs font-semibold transition-colors ${
                          showCc || ccInput.trim()
                            ? "bg-slate-200 text-slate-900"
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        Cc
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowBcc((v) => !v)}
                        className={`px-1.5 py-0.5 rounded text-xs font-semibold transition-colors ${
                          showBcc || bccInput.trim()
                            ? "bg-slate-200 text-slate-900"
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        Bcc
                      </button>
                    </>
                  )}

                  <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

                  <button
                    type="button"
                    onClick={() => setIsComposerOpen(false)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer select-none"
                    title="Minimize Reply Window"
                  >
                    <ChevronDown className="size-3.5" />
                    <span>Minimize</span>
                  </button>
                </div>
              </div>

              {/* Formatting Toolbar — real execCommand WYSIWYG buttons */}
              <div className="flex items-center gap-1 px-3 py-1 bg-white border-b border-slate-200 flex-wrap text-slate-600">
                <button type="button" onMouseDown={(e) => { e.preventDefault(); execFmt("bold"); }} className="p-1 rounded hover:bg-slate-100 text-slate-700 font-bold" title="Bold"><Bold className="size-3.5" /></button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); execFmt("italic"); }} className="p-1 rounded hover:bg-slate-100 text-slate-700 italic" title="Italic"><Italic className="size-3.5" /></button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); execFmt("underline"); }} className="p-1 rounded hover:bg-slate-100 text-slate-700 underline" title="Underline"><Underline className="size-3.5" /></button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); execFmt("strikeThrough"); }} className="p-1 rounded hover:bg-slate-100 text-slate-700 line-through" title="Strikethrough"><Strikethrough className="size-3.5" /></button>

                <div className="h-3 w-px bg-slate-300 mx-1" />

                <button type="button" onMouseDown={(e) => { e.preventDefault(); execFmt("insertUnorderedList"); }} className="p-1 rounded hover:bg-slate-100 text-slate-700" title="Bullet list"><List className="size-3.5" /></button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); execFmt("insertOrderedList"); }} className="p-1 rounded hover:bg-slate-100 text-slate-700" title="Numbered list"><ListOrdered className="size-3.5" /></button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); execFmt("formatBlock", "blockquote"); }} className="p-1 rounded hover:bg-slate-100 text-slate-700" title="Quote"><Quote className="size-3.5" /></button>

                <div className="h-3 w-px bg-slate-300 mx-1" />

                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const url = window.prompt("Enter link URL:");
                    if (url) execFmt("createLink", url);
                  }}
                  className="p-1 rounded hover:bg-slate-100 text-slate-700" title="Insert link"
                >
                  <Link2 className="size-3.5" />
                </button>

                {/* Image: file upload → base64 inline */}
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); imageInputRef.current?.click(); }}
                  className="p-1 rounded hover:bg-slate-100 text-slate-700" title="Insert image"
                >
                  <ImageIcon className="size-3.5" />
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) { toast.error("Image must be under 2MB"); return; }
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const src = ev.target?.result as string;
                      composerRef.current?.focus();
                      document.execCommand("insertHTML", false, `<img src="${src}" style="max-width:100%;height:auto;border-radius:4px;margin:4px 0" />`);
                      if (composerRef.current) setBody(composerRef.current.innerHTML);
                    };
                    reader.readAsDataURL(file);
                    e.target.value = "";
                  }}
                />
              </div>

              {/* Optional Cc input row */}
              {composeTab === "reply" && showCc && (
                <div className="flex items-center gap-2 px-4 py-1.5 border-b border-slate-100 bg-slate-50 text-xs">
                  <span className="font-semibold text-slate-500 w-9 shrink-0">Cc:</span>
                  <input
                    type="text"
                    value={ccInput}
                    onChange={(e) => setCcInput(e.target.value)}
                    placeholder="Enter CC email addresses (comma separated)..."
                    className="flex-1 bg-transparent border-none text-xs text-slate-800 focus:outline-none placeholder:text-slate-400"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => { setShowCc(false); setCcInput(""); }}
                    className="text-slate-400 hover:text-slate-600 p-0.5"
                    title="Clear Cc"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}

              {/* Optional Bcc input row */}
              {composeTab === "reply" && showBcc && (
                <div className="flex items-center gap-2 px-4 py-1.5 border-b border-slate-100 bg-slate-50 text-xs">
                  <span className="font-semibold text-slate-500 w-9 shrink-0">Bcc:</span>
                  <input
                    type="text"
                    value={bccInput}
                    onChange={(e) => setBccInput(e.target.value)}
                    placeholder="Enter BCC email addresses (comma separated)..."
                    className="flex-1 bg-transparent border-none text-xs text-slate-800 focus:outline-none placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => { setShowBcc(false); setBccInput(""); }}
                    className="text-slate-400 hover:text-slate-600 p-0.5"
                    title="Clear Bcc"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}

              {/* Composer — contenteditable WYSIWYG div */}
              <div className="p-3">
                <div
                  ref={composerRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={() => {
                    if (composerRef.current) setBody(composerRef.current.innerHTML);
                  }}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && body.trim()) {
                      sendReply.mutate({});
                    }
                  }}
                  data-placeholder={
                    composeTab === "note"
                      ? "Add an internal note (only visible to staff members)…"
                      : "Type your reply here…"
                  }
                  className={`w-full min-h-[72px] max-h-48 overflow-y-auto text-xs px-3 py-2 rounded-lg border focus:outline-none focus:ring-1 transition-all [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-slate-400 ${
                    composeTab === "note"
                      ? "bg-amber-50/40 border-amber-200 focus:ring-amber-400 text-amber-950"
                      : "bg-white border-slate-200 focus:ring-blue-500 text-slate-800"
                  }`}
                  style={{ lineHeight: "1.5", fontFamily: "inherit" }}
                />

                {/* Attached files pills display */}
                {attachedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-100">
                    {attachedFiles.map((att) => (
                      <div
                        key={att.id}
                        className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-700 shadow-2xs"
                      >
                        <Paperclip className="size-3.5 text-slate-500" />
                        <span className="font-medium truncate max-w-[160px]" title={att.name}>
                          {att.name}
                        </span>
                        <span className="text-[10px] text-slate-400">({formatBytes(att.size)})</span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(att.id)}
                          className="text-slate-400 hover:text-slate-700 p-0.5"
                          title="Remove file"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Bottom Quick Tools & Action Bar matching screenshot */}
                <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                  {/* Left quick insert buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => attachmentInputRef.current?.click()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold shadow-2xs transition-colors cursor-pointer"
                    >
                      <Paperclip className="size-3 text-slate-500" /> Attach File
                    </button>

                    <input
                      ref={attachmentInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                      className="hidden"
                      onChange={handleAttachmentSelect}
                    />

                    <button
                      type="button"
                      onClick={() => setTemplatesModalOpen(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold shadow-2xs transition-colors cursor-pointer"
                    >
                      <FileText className="size-3 text-slate-500" /> Templates
                    </button>

                    <button
                      type="button"
                      onClick={insertOrderDetails}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold shadow-2xs transition-colors cursor-pointer"
                    >
                      <Package className="size-3 text-slate-500" /> Insert Order Details
                    </button>

                    <button
                      type="button"
                      onClick={() => setCannedModalOpen(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold shadow-2xs transition-colors cursor-pointer"
                    >
                      <Sparkles className="size-3 text-slate-500" /> Canned Responses
                    </button>
                  </div>

                  {/* Right Send button */}
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 font-medium cursor-pointer select-none mr-1.5">
                      <input
                        type="checkbox"
                        checked={sendCopy}
                        onChange={(e) => setSendCopy(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-0"
                      />
                      <span>Send me a copy</span>
                    </label>

                    {composeTab === "reply" ? (
                      <button
                        type="button"
                        onClick={() => sendReply.mutate({})}
                        disabled={!body.replace(/<[^>]*>/g, "").trim() || sendReply.isPending}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-emerald-500 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs shrink-0 cursor-pointer"
                        title="Sends reply email to customer and instantly closes ticket in CRM"
                      >
                        {sendReply.isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-3.5 text-white" />
                        )}
                        <span>Send &amp; Close Ticket</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => sendReply.mutate({})}
                        disabled={!body.replace(/<[^>]*>/g, "").trim() || sendReply.isPending}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs shrink-0 cursor-pointer"
                      >
                        {sendReply.isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Send className="size-3.5" />
                        )}
                        <span>Add Note</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── RIGHT COLUMN: Context Sidebar Cards Starting From The Top (Matching Image 2) ── */}
      <aside
        className={`w-[300px] xl:w-[320px] shrink-0 flex flex-col h-full overflow-y-auto space-y-3 pb-2 ${
          sidebarDrawerOpen
            ? "fixed inset-y-0 right-0 z-50 bg-slate-50 shadow-2xl p-4 w-[320px] max-w-full"
            : "hidden lg:flex"
        }`}
      >
        {sidebarDrawerOpen && (
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 lg:hidden">
            <span className="font-bold text-slate-800 text-xs">Context Information</span>
            <button
              onClick={() => setSidebarDrawerOpen(false)}
              className="p-1 rounded hover:bg-slate-200 text-slate-500"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Card 1: Customer Information */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-blue-50 text-blue-600">
                <User className="size-3.5" />
              </div>
              <h2 className="text-xs font-bold text-slate-900 tracking-tight">
                Customer Information
              </h2>
            </div>
            {cust.id && (
              <Link
                to="/admin/customers/$customerId"
                params={{ customerId: cust.id } as any}
                className="text-[11px] font-semibold text-blue-600 hover:underline"
              >
                View Profile
              </Link>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs shrink-0 border border-emerald-200">
                {initials(cust.name)}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-slate-900 text-xs truncate">
                  {cust.name || "Customer"}
                </div>
                <div className="text-[11px] text-slate-500 font-mono truncate flex items-center gap-1" title={ticket.ticket_email ?? cust.primary_email}>
                  <Mail className="size-3 text-slate-400 shrink-0" />
                  <span className="truncate">{ticket.ticket_email ?? cust.primary_email ?? "—"}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5 pt-1 text-xs text-slate-600 border-t border-slate-50">
              {cust.primary_mobile && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Phone className="size-3 text-slate-400 shrink-0" />
                    <span className="font-mono text-slate-800 text-[11px]">{cust.primary_mobile}</span>
                  </div>
                  <a
                    href={`tel:${cust.primary_mobile}`}
                    className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-700 font-bold text-[11px] hover:underline cursor-pointer"
                    title={`Call ${cust.primary_mobile}`}
                  >
                    <span>Call</span>
                  </a>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <MapPin className="size-3 text-slate-400 shrink-0" />
                <span className="text-slate-700 truncate text-[11px]">
                  {cust.state ? `${cust.state}, India` : "Tamil Nadu, India"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Order Information */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-blue-50 text-blue-600">
                <Package className="size-3.5" />
              </div>
              <h2 className="text-xs font-bold text-slate-900 tracking-tight">
                Order Information
              </h2>
            </div>
            {app?.id && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => doUnlinkOrder.mutate()}
                  disabled={doUnlinkOrder.isPending}
                  className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 transition-colors cursor-pointer disabled:opacity-50"
                  title="Unlink this order from ticket"
                >
                  {doUnlinkOrder.isPending ? "Unlinking…" : "Unlink"}
                </button>
                <Link
                  to="/admin/orders/$orderId"
                  params={{ orderId: app.id } as any}
                  className="text-[11px] font-semibold text-blue-600 hover:underline"
                >
                  View Order
                </Link>
              </div>
            )}
          </div>

          {app?.id ? (
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2 py-0.5">
                <span className="text-slate-500 text-[11px]">Order No.</span>
                <div className="flex items-center gap-1">
                  <Link
                    to="/admin/orders/$orderId"
                    params={{ orderId: app.id } as any}
                    className="font-mono font-bold text-blue-700 hover:underline text-[11px]"
                  >
                    {app.application_code || "—"}
                  </Link>
                  {app.application_code && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(app.application_code);
                        toast.success("Order number copied");
                      }}
                      className="text-slate-400 hover:text-slate-700 p-0.5"
                      title="Copy order number"
                    >
                      <Copy className="size-2.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 py-0.5">
                <span className="text-slate-500 text-[11px]">Service</span>
                <span className="font-medium text-slate-800 text-right truncate max-w-[170px] text-[11px]">
                  {serviceName || "—"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 py-0.5">
                <span className="text-slate-500 text-[11px]">Order Date</span>
                <span className="text-slate-700 text-right text-[11px]">
                  {ist(app.created_at || ticket.created_at)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 py-0.5">
                <span className="text-slate-500 text-[11px]">Order Stage</span>
                {(() => {
                  const lead = app.leads ?? (ticket.customers ? { name: ticket.customers.name, email: ticket.customers.primary_email, mobile: ticket.customers.primary_mobile } : null);
                  const orderStage = computeOrderStage(lead, app);
                  const stageMeta = STAGE_META[orderStage];
                  const stageBadgeClass = STAGE_BADGE_CLASS[orderStage] || "bg-slate-100 text-slate-700 border-slate-200";
                  return (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${stageBadgeClass}`}>
                      {stageMeta?.label || (app.order_status || "Processing")}
                    </span>
                  );
                })()}
              </div>

              {(() => {
                const lead = app.leads ?? (ticket.customers ? { name: ticket.customers.name, email: ticket.customers.primary_email, mobile: ticket.customers.primary_mobile } : null);
                const orderStage = computeOrderStage(lead, app);
                const stageDate = getOrderStageTimestamp(orderStage, app, data?.events, ticket);
                if (!stageDate?.timestamp) return null;
                return (
                  <div className="flex items-center justify-between gap-2 py-0.5">
                    <span className="text-slate-500 text-[11px]">{stageDate.label}</span>
                    <span className="text-slate-700 text-right text-[11px] font-medium">
                      {ist(stageDate.timestamp)}
                    </span>
                  </div>
                );
              })()}

              <div className="flex items-center justify-between gap-2 py-0.5">
                <span className="text-slate-500 text-[11px]">Order Assignee</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                  <User className="size-2.5 text-slate-400" />
                  <span>{ticket.executive_name || "Unassigned"}</span>
                </span>
              </div>

              {Boolean(app.is_hot) ? (
                <div className="flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-lg bg-rose-50 border border-rose-200">
                  <span className="text-rose-700 text-[11px] font-bold flex items-center gap-1.5">
                    <Flame className="size-3.5 text-rose-600 fill-rose-600 animate-pulse shrink-0" />
                    🔥 Hot Priority Active
                  </span>
                  <span className="text-[10px] font-semibold text-rose-600 bg-rose-100/80 px-1.5 py-0.5 rounded uppercase tracking-wider">
                    Needs Action
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setHotOrderModalOpen(true)}
                  className="w-full mt-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-semibold transition-all cursor-pointer shadow-2xs"
                >
                  <Flame className="size-3 text-rose-600" />
                  <span>Escalate to Hot Order 🔥</span>
                </button>
              )}
            </div>
          ) : ticket.order_link_status === "needs_review" && (data?.candidateOrders ?? []).length > 0 ? (
            /* ── Multi-Order Review: employee picks which order to link ── */
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="size-3.5 text-amber-600 shrink-0" />
                <p className="text-[11px] text-amber-800 font-semibold">
                  Multiple active orders found. Select which order this ticket belongs to:
                </p>
              </div>
              <div className="space-y-1.5">
                {(data.candidateOrders as any[]).map((candidate: any) => {
                  const candStage = computeOrderStage(candidate.lead, candidate);
                  const candMeta = STAGE_META[candStage];
                  return (
                    <button
                      key={candidate.id}
                      onClick={() => doLinkOrder.mutate(candidate.id)}
                      disabled={doLinkOrder.isPending}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-left transition-all cursor-pointer disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <div className="font-mono font-bold text-blue-700 text-[11px]">
                          {candidate.application_code || "—"}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                          {candMeta?.label || (candidate.order_status || "Processing")}
                          {" · "}{ist(candidate.created_at)}
                        </div>
                      </div>
                      {doLinkOrder.isPending ? (
                        <Loader2 className="size-3.5 animate-spin text-blue-600 shrink-0" />
                      ) : (
                        <Link2 className="size-3.5 text-slate-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="py-3 px-2 text-center space-y-1">
              <p className="text-xs font-semibold text-slate-600">
                No order found for this ticket
              </p>
              <p className="text-[11px] text-slate-400">
                No connected order is linked to this ticket.
              </p>
            </div>
          )}
        </div>

        {/* Card 3: Ticket Information */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-blue-50 text-blue-600">
                <Info className="size-3.5" />
              </div>
              <h2 className="text-xs font-bold text-slate-900 tracking-tight">
                Ticket Information
              </h2>
            </div>
            <span className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer">
              Edit
            </span>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-2 py-0.5">
              <span className="text-slate-500 text-[11px]">Created</span>
              <span className="text-slate-700 text-[11px]">{ist(ticket.created_at)}</span>
            </div>

            <div className="flex items-center justify-between gap-2 py-0.5">
              <span className="text-slate-500 text-[11px]">Channel</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[10px]">
                <Mail className="size-2.5 text-slate-400" /> {ticket.source || "Email"}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 py-0.5">
              <span className="text-slate-500 text-[11px]">Priority</span>
              <PriorityDropdownBadge
                priority={(ticket.priority as TicketPriority) ?? "medium"}
                onChange={(p) => changePriority.mutate(p)}
              />
            </div>

            <div className="flex items-center justify-between gap-2 py-0.5">
              <span className="text-slate-500 text-[11px]">Status</span>
              <StatusDropdownBadge
                status={ticket.status as TicketStatus}
                onChange={(s) => changeStatus.mutate(s)}
              />
            </div>

            <div className="flex items-center justify-between gap-2 py-0.5">
              <span className="text-slate-500 text-[11px]">Assigned To</span>
              <AssigneeDropdownBadge
                currentId={ticket.assigned_to}
                currentName={ticket.assigned_name}
                staff={staffList}
                onPick={(id) => changeAssignee.mutate(id)}
              />
            </div>

            <div className="flex items-center justify-between gap-2 py-0.5">
              <span className="text-slate-500 text-[11px]">SLA</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                  slaTone === "healthy"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : slaTone === "warning"
                    ? "bg-amber-50 text-amber-800 border-amber-200"
                    : "bg-rose-50 text-rose-800 border-rose-200"
                }`}
              >
                <span className={`size-1.5 rounded-full ${slaTone === "healthy" ? "bg-emerald-500" : slaTone === "warning" ? "bg-amber-500" : "bg-rose-500"}`} />
                {slaText}
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Recent Activity matching Image 2 */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h2 className="text-xs font-bold text-slate-900 tracking-tight">Recent Activity</h2>
            <span className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer">
              View All
            </span>
          </div>

          <div className="space-y-2 pt-0.5">
            <div className="flex items-start gap-2.5">
              <div className="size-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                <Mail className="size-2.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900 text-[11px] leading-tight">
                  Customer email received
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {ticket.first_response_at ? ist(ticket.first_response_at) : ist(ticket.created_at)}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="size-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                <Mail className="size-2.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900 text-[11px] leading-tight">
                  Email sent to customer
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {ticket.last_staff_message_at ? ist(ticket.last_staff_message_at) : ist(ticket.created_at)}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="size-5 rounded-full bg-slate-400 text-white flex items-center justify-center shrink-0 mt-0.5">
                <Clock className="size-2.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900 text-[11px] leading-tight">
                  Ticket created
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {ist(ticket.created_at)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Dialogs & Popups ──────────────────────────────── */}

      {/* Restart Order Confirmation Dialog */}
      {restartConfirm && (
        <ConfirmDialog
          title="Restart Order?"
          body="This will close the ticket and return the order to Form Submitted stage. Any pending customer-delay closure timer will be cancelled."
          confirmLabel="Restart Order"
          confirmTone="emerald"
          onConfirm={() => {
            setRestartConfirm(false);
            doCloseRestart.mutate();
          }}
          onClose={() => setRestartConfirm(false)}
        />
      )}

      {/* Reopen Order Confirmation Dialog */}
      {reopenConfirm && (
        <ConfirmDialog
          title="Reopen Order?"
          body="This will reopen the closed order and resume operational processing for the customer."
          confirmLabel="Reopen Order"
          confirmTone="emerald"
          onConfirm={() => {
            setReopenConfirm(false);
            if (app.id) doReopenOrder.mutate(app.id);
          }}
          onClose={() => setReopenConfirm(false)}
        />
      )}

      {/* Consultation Completed (TB01) Dialog */}
      {consultOpen && (
        <ConsultDialog
          value={consultNote}
          onChange={setConsultNote}
          onCancel={() => {
            setConsultOpen(false);
            setConsultNote("");
          }}
          onSend={() => {
            setConsultOpen(false);
            doCloseConsult.mutate(consultNote);
            setConsultNote("");
          }}
        />
      )}

      {/* Refund Reject Dialog (R002) */}
      {reasonOpen && (
        <RefundRejectDialog
          onCancel={() => setReasonOpen(false)}
          onSend={(v) => {
            setReasonOpen(false);
            doCloseRefund.mutate(v);
          }}
          isPending={doCloseRefund.isPending}
        />
      )}

      {/* Canned Responses Searchable Modal */}
      {cannedModalOpen && (
        <CannedResponsesModal
          items={(cannedList ?? []) as any[]}
          onClose={() => setCannedModalOpen(false)}
          onSelect={(item) => {
            const filled = (item.body ?? "")
              .replace(/\{\{customer_name\}\}/gi, cust.name ?? "[Customer]")
              .replace(/\{\{order_number\}\}/gi, app.application_code ?? "[Order No]")
              .replace(/\{\{ticket_number\}\}/gi, ticket.ticket_number ?? "");
            
            const formatted = filled
              .split(/\n{2,}/)
              .map((p: string) => `<p style="margin: 0 0 8px 0;">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
              .join("");

            if (composerRef.current) {
              const currentContent = composerRef.current.innerHTML.trim();
              if (!currentContent || currentContent === "<br>" || currentContent === "<p><br></p>") {
                composerRef.current.innerHTML = formatted;
              } else {
                composerRef.current.innerHTML = `${currentContent}<br /><br />${formatted}`;
              }
              setBody(composerRef.current.innerHTML);
              composerRef.current.focus();
            } else {
              setBody((prev) => (prev.trim() ? `${prev}\n\n${filled}` : filled));
            }
            setCannedModalOpen(false);
            toast.success(`Inserted canned response: ${item.title}`);
          }}
        />
      )}

      {/* Email Templates Searchable Modal */}
      {templatesModalOpen && (
        <TemplatesModal
          items={(templatesList ?? []) as any[]}
          onClose={() => setTemplatesModalOpen(false)}
          onSelect={(item) => {
            const rawBody = item.body_html || item.body_text || "";
            const isHtml = /<[a-z][\s\S]*>/i.test(rawBody);
            const filled = rawBody
              .replace(/\{\{customer_name\}\}/gi, cust.name ?? "[Customer]")
              .replace(/\{\{order_number\}\}/gi, app.application_code ?? "[Order No]")
              .replace(/\{\{ticket_number\}\}/gi, ticket.ticket_number ?? "");
            
            let formatted = filled;
            if (!isHtml) {
              formatted = filled
                .split(/\n{2,}/)
                .map((p: string) => `<p style="margin: 0 0 8px 0;">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
                .join("");
            }

            if (composerRef.current) {
              const currentContent = composerRef.current.innerHTML.trim();
              if (!currentContent || currentContent === "<br>" || currentContent === "<p><br></p>") {
                composerRef.current.innerHTML = formatted;
              } else {
                composerRef.current.innerHTML = `${currentContent}<br /><br />${formatted}`;
              }
              setBody(composerRef.current.innerHTML);
              composerRef.current.focus();
            } else {
              setBody((prev) => (prev.trim() ? `${prev}\n\n${filled}` : filled));
            }
            setTemplatesModalOpen(false);
            toast.success(`Inserted template: ${item.template_name || item.template_code}`);
          }}
        />
      )}

      {/* Hot Order Escalation Modal with Custom Note for Assignee */}
      {hotOrderModalOpen && Boolean(app.id) && (
        <HotOrderModal
          order={{
            id: app.id,
            application_code: app.application_code,
            service_name: serviceName,
          }}
          customerName={cust.name}
          assigneeName={ticket.executive_name || "Unassigned"}
          ticketNumber={ticket.ticket_number ?? undefined}
          isPending={doMakeHotOrder.isPending}
          onClose={() => setHotOrderModalOpen(false)}
          onConfirm={(note) => {
            doMakeHotOrder.mutate({ orderId: app.id, note });
          }}
        />
      )}
    </div>
  );
}

// ── Message Card Component with Left/Right Chat Thread Hierarchy ─────────────────

function MessageCard({
  msg,
  customerName,
  customerEmail,
  onDownloadDoc,
  onReply,
}: {
  msg: Msg;
  customerName?: string | null;
  customerEmail?: string | null;
  onDownloadDoc: (doc: any) => void;
  onReply?: () => void;
}) {
  const [showRawText, setShowRawText] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null);
  // Default compact view so messages open cleanly and agent reads fresh reply first
  const [isExpanded, setIsExpanded] = useState(false);
  const parsed = useMemo(
    () =>
      parseEmailMessage({
        bodyHtml: (msg as any).body_html,
        bodyText: msg.body_text,
        attachments: msg.attachments as any,
      }),
    [(msg as any).body_html, msg.body_text, msg.attachments]
  );

  // 1. Internal Note Card (Centered with amber highlight)
  if (msg.kind === "note") {
    return (
      <div className="w-full flex justify-center">
        <div className="w-full max-w-[90%] sm:max-w-[85%] rounded-xl p-4 shadow-2xs border border-amber-200/90 bg-amber-50/70 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-bold text-amber-950 flex items-center gap-2">
              <span className="size-5 rounded-full bg-amber-200 text-amber-950 text-[10px] flex items-center justify-center font-bold">
                👁
              </span>
              <span>{msg.author_name}</span>
              <span className="text-[10px] font-bold bg-amber-200/90 text-amber-950 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Internal Note
              </span>
            </span>
            <span className="text-amber-800/80 text-[11px] font-medium">{formatTimeOnly(msg.created_at)}</span>
          </div>
          <div className="text-xs text-amber-950 whitespace-pre-wrap leading-relaxed">
            {msg.body_text}
          </div>
        </div>
      </div>
    );
  }

  // 2. Customer Inbound Message Card (LEFT ALIGNED)
  if (msg.kind === "inbound") {
    const rawContent = msg.body_text || parsed.rawText || (msg as any).body_html || "";
    const hasLongBody = (parsed.content && parsed.content.length > 300) || parsed.hasQuoted || Boolean(parsed.quotedContent) || Boolean((msg as any).body_html);

    return (
      <div className="w-full flex justify-start">
        <div className="w-full max-w-[92%] sm:max-w-[88%] lg:max-w-[84%] mr-auto bg-white rounded-xl shadow-2xs border border-slate-200/90 overflow-hidden">
          {/* Header Bar matching Screenshot */}
          <div className="px-3 py-2 flex items-center justify-between flex-wrap gap-1.5 border-b border-slate-100/80 bg-white">
            <div className="flex items-center gap-2 min-w-0">
              <div className="size-7 rounded-full bg-[#10b981] text-white flex items-center justify-center text-[10px] font-bold shrink-0 shadow-2xs">
                {initials(customerName || "RK")}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900 text-xs truncate">
                    {customerName || "Customer"}
                  </span>
                  <span className="text-slate-400 text-xs font-mono truncate">
                    {customerEmail || msg.from_email || ""}
                  </span>
                  <span className="text-[10px] font-bold uppercase bg-[#ecfdf5] text-[#059669] border border-emerald-200 px-1.5 py-0.5 rounded">
                    Customer
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-xs font-medium" title={ist(msg.created_at)}>
                {formatTimeOnly(msg.created_at)}
              </span>
              {onReply && (
                <button
                  type="button"
                  onClick={onReply}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer shadow-2xs select-none"
                  title="Reply to this message"
                >
                  <Reply className="size-3 text-blue-600" />
                  <span>Reply</span>
                </button>
              )}
              <button className="text-slate-400 hover:text-slate-600 p-1">
                <MoreHorizontal className="size-4" />
              </button>
            </div>
          </div>

          {/* Message Content Body */}
          <div className="px-3.5 py-3 space-y-2">
            {/* Subject if present */}
            {msg.subject && (
              <div className="text-xs font-bold text-slate-800 pb-1">
                {decodeHtmlEntities(msg.subject)}
              </div>
            )}

            {/* Clean Customer Message Body (compact view by default) */}
            {showRawText ? (
              <div className="p-3 bg-slate-900 text-slate-100 font-mono text-xs rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {rawContent}
              </div>
            ) : (
              <div>
                <div className="relative">
                  <div
                    className={`text-sm text-slate-800 leading-relaxed font-normal overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_td]:p-2 [&_th]:p-2 [&_img]:max-w-full [&_a]:text-blue-600 [&_a]:underline font-sans ${
                      hasLongBody && !isExpanded ? "max-h-56 overflow-hidden" : ""
                    }`}
                  >
                    {parsed.isHtml ? (
                      <div>
                        <div
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(parsed.content, {
                              WHOLE_DOCUMENT: false,
                              ADD_ATTR: ["target", "style", "class"],
                            }),
                          }}
                        />
                        {isExpanded && parsed.quotedContent && (
                          <div
                            className="mt-3 pt-3 border-t border-slate-200 text-slate-600"
                            dangerouslySetInnerHTML={{
                              __html: DOMPurify.sanitize(parsed.quotedContent, {
                                WHOLE_DOCUMENT: false,
                                ADD_ATTR: ["target", "style", "class"],
                              }),
                            }}
                          />
                        )}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">
                        {isExpanded && parsed.quotedContent
                          ? `${parsed.content}\n\n${parsed.quotedContent}`
                          : parsed.content || rawContent || "(no content)"}
                      </div>
                    )}
                  </div>

                  {hasLongBody && !isExpanded && (
                    <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white via-white/85 to-transparent pointer-events-none" />
                  )}
                </div>

                {hasLongBody && (
                  <div className="pt-2 flex items-center justify-between border-t border-slate-100 mt-2 z-10 relative">
                    <button
                      type="button"
                      onClick={() => setIsExpanded((v) => !v)}
                      className="text-xs font-bold text-blue-700 hover:text-blue-900 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded-lg px-3.5 py-1.5 transition-colors inline-flex items-center gap-1.5 shadow-xs cursor-pointer select-none"
                    >
                      {isExpanded ? (
                        <>Show less <ChevronUp className="size-3.5" /></>
                      ) : (
                        <>Show full email <ChevronDown className="size-3.5" /></>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowRawText((v) => !v)}
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition-colors ml-auto cursor-pointer select-none"
                      title="Toggle raw original email text"
                    >
                      {showRawText ? "Show Formatted" : "Raw Text"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Attachments & Image Gallery */}
            {msg.attachments && msg.attachments.length > 0 && (() => {
              const imageAttachments = msg.attachments.filter(
                (a: any) =>
                  a.isImage ||
                  a.mimeType?.startsWith("image/") ||
                  a.mime_type?.startsWith("image/") ||
                  /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(a.fileName || a.file_name || "")
              );
              const nonImageAttachments = msg.attachments.filter(
                (a: any) => !imageAttachments.includes(a)
              );

              return (
                <div className="pt-2.5 space-y-3">
                  {/* Image Gallery with High-Quality Previews & Lightbox Zoom */}
                  {imageAttachments.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <ImageIcon className="size-3.5 text-blue-600 shrink-0" />
                        <span>Customer Images & Screenshots ({imageAttachments.length})</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {imageAttachments.map((img: any, idx: number) => {
                          const imgUrl = img.url;
                          const imgName = img.fileName || img.file_name || `image_${idx + 1}.png`;
                          const imgSize = img.fileSize || img.file_size || img.size_bytes || 0;

                          return (
                            <div
                              key={img.id || idx}
                              className="group relative rounded-xl border border-slate-200/90 bg-slate-50 overflow-hidden shadow-2xs hover:shadow-xs transition-all"
                            >
                              <div
                                className="relative aspect-video max-h-56 bg-slate-100 flex items-center justify-center overflow-hidden cursor-pointer"
                                onClick={() => imgUrl && setLightboxImage({ url: imgUrl, name: imgName })}
                              >
                                {imgUrl ? (
                                  <img
                                    src={imgUrl}
                                    alt={imgName}
                                    className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-200"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="flex flex-col items-center gap-1 text-slate-400 p-4">
                                    <ImageIcon className="size-8" />
                                    <span className="text-xs">Image loading...</span>
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/25 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 text-slate-900 font-semibold text-xs shadow-md">
                                    <ZoomIn className="size-3.5" /> Enlarge
                                  </span>
                                </div>
                              </div>

                              <div className="p-2 bg-white border-t border-slate-100 flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-medium text-slate-800 truncate" title={imgName}>
                                    {imgName}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    {imgSize ? formatBytes(imgSize) : "Image file"}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {imgUrl && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setLightboxImage({ url: imgUrl, name: imgName })}
                                        className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                                        title="View full image"
                                      >
                                        <Eye className="size-3.5" />
                                      </button>
                                      <a
                                        href={imgUrl}
                                        download={imgName}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                                        title="Download image"
                                      >
                                        <Download className="size-3.5" />
                                      </a>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Document Attachments (PDFs, Docs, etc.) */}
                  {nonImageAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {nonImageAttachments.map((doc: any) => {
                        const docName = doc.fileName || doc.file_name || "document.pdf";
                        const docSize = doc.fileSize || doc.file_size || doc.size_bytes || 0;
                        const docUrl = doc.url;
                        const isPdf = /\.pdf$/i.test(docName);

                        return (
                          <div
                            key={doc.id}
                            className="p-2 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between gap-3 min-w-[220px] max-w-sm transition-colors shadow-2xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`size-7 rounded border flex items-center justify-center shrink-0 font-bold text-[10px] ${
                                  isPdf
                                    ? "bg-rose-50 border-rose-200 text-rose-600"
                                    : "bg-blue-50 border-blue-200 text-blue-600"
                                }`}
                              >
                                {isPdf ? "PDF" : "DOC"}
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-slate-800 truncate" title={docName}>
                                  {docName}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {formatBytes(docSize)}
                                </div>
                              </div>
                            </div>

                            {docUrl ? (
                              <a
                                href={docUrl}
                                download={docName}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
                                title="Download attachment"
                              >
                                <Download className="size-3.5" />
                              </a>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onDownloadDoc(doc)}
                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
                                title="Download attachment"
                              >
                                <Download className="size-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Fullscreen Lightbox Modal for Image Inspection */}
        {lightboxImage && (
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setLightboxImage(null)}
          >
            <div
              className="relative max-w-5xl max-h-[92vh] w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-slate-700"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white text-xs">
                <span className="font-semibold truncate pr-4 text-slate-200">{lightboxImage.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={lightboxImage.url}
                    download={lightboxImage.name}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-1 transition-colors"
                  >
                    <Download className="size-3" /> Download
                  </a>
                  <button
                    onClick={() => setLightboxImage(null)}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
              <div className="p-3 flex items-center justify-center overflow-auto max-h-[calc(92vh-60px)] bg-slate-950/50">
                <img
                  src={lightboxImage.url}
                  alt={lightboxImage.name}
                  className="max-w-full max-h-[82vh] object-contain rounded-lg shadow-lg"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. Outbound Staff/System Reply Card (RIGHT ALIGNED)
  const isHtml = parsed.isHtml || Boolean((msg as any).body_html);
  const isLongHtml = Boolean(
    (parsed.content && parsed.content.length > 300) ||
    parsed.hasQuoted ||
    parsed.quotedContent ||
    ((msg as any).body_html && (msg as any).body_html.length > 300)
  );

  return (
    <div className="w-full flex justify-end">
      <div className="w-full max-w-[92%] sm:max-w-[88%] lg:max-w-[84%] ml-auto bg-[#f8fafc] rounded-xl shadow-2xs border border-slate-200/90 overflow-hidden">
        {/* Header Bar matching Screenshot */}
        <div className="px-3 py-2 flex items-center justify-between flex-wrap gap-1.5 border-b border-slate-200/70 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <div className="size-7 rounded-full bg-[#3b82f6] text-white flex items-center justify-center text-[10px] font-bold shrink-0 shadow-2xs">
              BH
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-900 text-xs truncate">
                  {msg.author_name || "Business Help Services"}
                </span>
                <span className="text-[10px] font-bold uppercase bg-[#eff6ff] text-[#2563eb] border border-blue-200 px-1.5 py-0.2 rounded">
                  Email
                </span>
                <span className="text-[10px] font-bold uppercase bg-[#ecfdf5] text-[#059669] border border-emerald-200 px-1.5 py-0.2 rounded flex items-center gap-1">
                  <Check className="size-2.5" /> Sent
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono truncate">
                {msg.from_email || "help@businesshelpservices.com"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-xs font-medium" title={ist(msg.created_at)}>
              {formatTimeOnly(msg.created_at)}
            </span>
            <button className="text-slate-400 hover:text-slate-600 p-1">
              <MoreHorizontal className="size-4" />
            </button>
          </div>
        </div>

        {/* Message Content Body matching Screenshot 2 & 3 */}
        <div className="px-3.5 py-3 space-y-2">
          {msg.subject && (
            <div className="text-xs font-semibold text-slate-800 pb-1">
              {decodeHtmlEntities(msg.subject)}
            </div>
          )}

          {parsed.isHtml ? (
            <div>
              <div className="relative">
                <div
                  className={`text-sm text-slate-800 leading-relaxed font-normal overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_td]:p-2 [&_th]:p-2 [&_img]:max-w-full [&_a]:text-blue-600 [&_a]:underline font-sans ${
                    isLongHtml && !isExpanded ? "max-h-56 overflow-hidden" : ""
                  }`}
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(
                      isExpanded && parsed.quotedContent
                        ? `${parsed.content}<div class="mt-3 pt-3 border-t border-slate-200">${parsed.quotedContent}</div>`
                        : parsed.content,
                      {
                        WHOLE_DOCUMENT: false,
                        ADD_ATTR: ["target", "style", "class"],
                      }
                    ),
                  }}
                />
                {isLongHtml && !isExpanded && (
                  <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white via-white/85 to-transparent pointer-events-none" />
                )}
              </div>
              {isLongHtml && (
                <div className="pt-2 flex justify-start border-t border-slate-100 mt-2 z-10 relative">
                  <button
                    type="button"
                    onClick={() => setIsExpanded((v) => !v)}
                    className="text-xs font-bold text-blue-700 hover:text-blue-900 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded-lg px-3.5 py-1.5 transition-colors inline-flex items-center gap-1.5 shadow-xs cursor-pointer select-none"
                  >
                    {isExpanded ? (
                      <>Show less <ChevronUp className="size-3.5" /></>
                    ) : (
                      <>Show full email <ChevronDown className="size-3.5" /></>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed font-normal">
              {parsed.content || (
                <div className="space-y-2">
                  <p>Dear {customerName || "Customer"},</p>
                  <p>
                    Thank you for reaching out. We have received your request regarding the Udyam certificate. Our team is already checking the status and we will get back to you shortly.
                  </p>
                  <p>If you have any additional details, please share.</p>
                  <p>Regards,<br />Business Help Services</p>
                </div>
              )}
            </div>
          )}

          {msg.attachments && msg.attachments.length > 0 && (
            <div className="pt-2.5 flex flex-wrap gap-2 border-t border-slate-100 mt-2">
              {msg.attachments.map((doc: any, idx: number) => {
                const docName = doc.fileName || doc.file_name || "attachment";
                const docSize = doc.fileSize || doc.file_size || doc.size_bytes || 0;
                const isPdf = /\.pdf$/i.test(docName);
                return (
                  <div key={doc.id || idx} className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between gap-3 min-w-[220px] max-w-sm shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`size-7 rounded border flex items-center justify-center shrink-0 font-bold text-[10px] ${isPdf ? "bg-rose-50 border-rose-200 text-rose-600" : "bg-blue-50 border-blue-200 text-blue-600"}`}>
                        {isPdf ? "PDF" : "FILE"}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-800 truncate" title={docName}>{docName}</div>
                        <div className="text-[10px] text-slate-400">{formatBytes(docSize)}</div>
                      </div>
                    </div>
                    {doc.url ? (
                      <a href={doc.url} download={docName} target="_blank" rel="noopener noreferrer" className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0" title="Download attachment">
                        <Download className="size-3.5" />
                      </a>
                    ) : (
                      <button type="button" onClick={() => onDownloadDoc(doc)} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0" title="Download attachment">
                        <Download className="size-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Dropdown Badges ────────────────────────────────────────

function StatusDropdownBadge({
  status,
  onChange,
}: {
  status: TicketStatus;
  onChange: (s: TicketStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${cfg.bg} ${cfg.fg} ${cfg.border}`}
      >
        <span>★</span> {cfg.label} <ChevronDown className="size-3 ml-0.5 opacity-70" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-30 text-xs py-1 min-w-[130px]"
          onMouseLeave={() => setOpen(false)}
        >
          {(Object.keys(STATUS_CONFIG) as TicketStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => {
                setOpen(false);
                onChange(s);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-700 font-medium"
            >
              {STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PriorityDropdownBadge({
  priority,
  onChange,
}: {
  priority: TicketPriority;
  onChange: (p: TicketPriority) => void;
}) {
  const [open, setOpen] = useState(false);
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${cfg.bg} ${cfg.fg} ${cfg.border}`}
      >
        <span className={`size-1.5 rounded-full ${cfg.dot}`} /> {cfg.label}{" "}
        <ChevronDown className="size-3 ml-0.5 opacity-70" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-30 text-xs py-1 min-w-[120px]"
          onMouseLeave={() => setOpen(false)}
        >
          {(Object.keys(PRIORITY_CONFIG) as TicketPriority[]).map((p) => (
            <button
              key={p}
              onClick={() => {
                setOpen(false);
                onChange(p);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-2"
            >
              <span className={`size-1.5 rounded-full ${PRIORITY_CONFIG[p].dot}`} />
              {PRIORITY_CONFIG[p].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AssigneeDropdownBadge({
  currentId,
  currentName,
  staff,
  onPick,
}: {
  currentId: string | null;
  currentName: string | null;
  staff: Array<{ id: string; full_name?: string }>;
  onPick: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors"
      >
        <User className="size-3 text-slate-500" />
        <span>{currentName || "Unassigned"}</span>
        <ChevronDown className="size-3 ml-0.5 opacity-70" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-xl z-30 text-xs py-1 max-h-56 overflow-y-auto"
          onMouseLeave={() => setOpen(false)}
        >
          <button
            onClick={() => {
              setOpen(false);
              onPick(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-500 font-medium"
          >
            Unassigned
          </button>
          {staff.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setOpen(false);
                onPick(s.id);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-700 font-medium truncate"
            >
              {s.full_name || "Staff Member"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Searchable Canned Responses Modal ──────────────────────

function CannedResponsesModal({
  items,
  onClose,
  onSelect,
}: {
  items: any[];
  onClose: () => void;
  onSelect: (item: any) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      if (it.category) set.add(it.category);
    });
    return ["all", ...Array.from(set)];
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      const matchCat = category === "all" || it.category === category;
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        it.title?.toLowerCase().includes(q) ||
        it.body?.toLowerCase().includes(q) ||
        it.shortcut?.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [items, search, category]);

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-2xs"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl p-5 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">Canned Responses</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-700">
            <X className="size-4" />
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="pt-3 pb-2 space-y-2">
          <div className="relative">
            <Search className="size-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search canned responses..."
              className="w-full text-xs pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {categories.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-2.5 py-1 rounded-full capitalize font-semibold shrink-0 text-[11px] transition-colors ${
                    category === cat
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Responses List */}
        <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-400">
              No canned responses found.
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelect(item)}
                className="p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 cursor-pointer transition-all space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs">{item.title}</span>
                  {item.category && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">
                      {item.category}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                  {item.body}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Searchable Email Templates Modal ───────────────────────

function TemplatesModal({
  items,
  onClose,
  onSelect,
}: {
  items: any[];
  onClose: () => void;
  onSelect: (item: any) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return items.filter((it) => {
      const q = search.toLowerCase();
      return (
        !search ||
        it.template_code?.toLowerCase().includes(q) ||
        it.template_name?.toLowerCase().includes(q) ||
        it.subject?.toLowerCase().includes(q)
      );
    });
  }, [items, search]);

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-2xs"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl p-5 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">Email Templates</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-700">
            <X className="size-4" />
          </button>
        </div>

        <div className="pt-3 pb-2">
          <div className="relative">
            <Search className="size-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search email templates by code, name, subject..."
              className="w-full text-xs pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-400">
              No email templates found.
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelect(item)}
                className="p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 cursor-pointer transition-all space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs">
                    {item.template_code} — {item.template_name || item.name}
                  </span>
                  <span className="text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                    {item.dispatch_mode || "Automated"}
                  </span>
                </div>
                {item.subject && (
                  <div className="text-xs font-semibold text-slate-700">
                    Subject: {item.subject}
                  </div>
                )}
                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                  {item.body_text || stripHtml(item.body_html || "")}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Shared Dialogs ─────────────────────────────────────────

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  confirmTone,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  confirmTone: "emerald" | "rose";
  onConfirm: () => void;
  onClose: () => void;
}) {
  const tone =
    confirmTone === "emerald"
      ? "bg-emerald-600 hover:bg-emerald-700"
      : "bg-rose-600 hover:bg-rose-700";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-2xs" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 animate-in zoom-in-95 duration-100" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <p className="mt-2 text-xs text-slate-600 leading-relaxed">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100">
            Cancel
          </button>
          <button onClick={onConfirm} className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white ${tone}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConsultDialog({
  value,
  onChange,
  onCancel,
  onSend,
}: {
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSend: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-2xs" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 animate-in zoom-in-95 duration-100" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-900">Consultation Completed (TB01)</h3>
        <p className="mt-1 text-xs text-slate-600 leading-relaxed">
          Sends the T001 consultation-completed confirmation email to the customer and closes the ticket.
        </p>
        <label className="block mt-3 text-xs font-semibold text-slate-700">Remarks (optional)</label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          placeholder="Anything to include in the email or audit record…"
          className="mt-1 w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100">
            Cancel
          </button>
          <button onClick={onSend} className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700">
            Send &amp; Close Ticket
          </button>
        </div>
      </div>
    </div>
  );
}

function RefundRejectDialog({
  onCancel,
  onSend,
  isPending,
}: {
  onCancel: () => void;
  onSend: (v: { reasonLabel: string; replyBody: string }) => void;
  isPending?: boolean;
}) {
  const [reasonLabel, setReasonLabel] = useState<string>("Refund Request Reviewed & Closed");
  const [reply, setReply] = useState<string>(
    "Dear Customer,\n\nWe have thoroughly reviewed your refund request. As per our service terms and policy, this service has already been initiated/processed, and therefore your refund request cannot be approved at this stage.\n\nIf you have any further questions, please reply to this message.\n\nRegards,\nSupport Team"
  );

  const presetReasons = [
    "Service already initiated / processed with government portal",
    "Application under active verification / processing",
    "Customer requested cancellation post document submission",
    "Non-refundable government statutory fee already incurred",
  ];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-2xs" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5 animate-in zoom-in-95 duration-100 flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-100 text-rose-600 shadow-2xs">
              <XCircle className="size-4 text-rose-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Refund Rejected (R002)</h3>
              <p className="text-[11px] text-slate-500">
                Sends official R002 refund rejection email to the customer and closes this ticket under Refund KPI
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1 rounded-md text-slate-400 hover:text-slate-700 transition-colors">
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        <div className="py-3.5 space-y-3.5 text-xs">
          {/* Reason Selection */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-800 text-xs">Rejection / Review Reason</label>
            <input
              type="text"
              value={reasonLabel}
              onChange={(e) => setReasonLabel(e.target.value)}
              className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              placeholder="e.g. Service already initiated / processed"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {presetReasons.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setReasonLabel(preset)}
                  className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-rose-50 hover:text-rose-700 border border-slate-200 text-slate-600 transition-all text-left cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Email Body */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-800 text-xs flex items-center justify-between">
              <span>Customer Email Message (Standard R002)</span>
              <span className="text-[10px] text-slate-400 font-normal">{reply.length} chars</span>
            </label>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={6}
              className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 font-sans leading-relaxed resize-none"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onCancel} disabled={isPending} className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={() => onSend({ reasonLabel: reasonLabel.trim(), replyBody: reply.trim() })}
            disabled={isPending || !reply.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Sending &amp; Closing...</span>
              </>
            ) : (
              <>
                <XCircle className="size-3.5" />
                <span>Send R002 &amp; Close Ticket</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hot Order Escalation Modal with Custom Note for Assignee ────────────

function HotOrderModal({
  order,
  customerName,
  assigneeName,
  ticketNumber,
  isPending,
  onClose,
  onConfirm,
}: {
  order: { id: string; application_code?: string; service_name?: string };
  customerName?: string;
  assigneeName?: string;
  ticketNumber?: string;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");

  const presetReasons = [
    "Urgent: Customer called requesting immediate filing / status update",
    "Customer submitted requested OTP / documents — please verify & file",
    "Customer requested correction / rework on certificate",
    "VIP / High priority escalation — please process on priority",
  ];

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-2xs"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-100 text-rose-600 shadow-2xs">
              <Flame className="size-4 text-rose-600 fill-rose-600 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Reopen Order &amp; Escalate to Hot 🔥</h3>
              <p className="text-[11px] text-slate-500">
                Reopens the linked order, prioritizes it in Hot Orders with sound alerts, and closes this ticket
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        <div className="py-3.5 space-y-3.5 text-xs">
          {/* Order Details Summary */}
          <div className="rounded-xl bg-slate-50/80 border border-slate-200/90 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 text-[11px]">Order No:</span>
              <span className="font-mono font-bold text-slate-900">{order.application_code || "—"}</span>
            </div>
            {order.service_name && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-[11px]">Service:</span>
                <span className="font-medium text-slate-800 text-right truncate max-w-[220px]">
                  {order.service_name}
                </span>
              </div>
            )}
            {customerName && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-[11px]">Customer:</span>
                <span className="font-medium text-slate-800">{customerName}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-500 text-[11px]">Assigned Employee:</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold text-[10px]">
                <User className="size-3 text-blue-500" />
                {assigneeName || "Unassigned"}
              </span>
            </div>
            {ticketNumber && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-[11px]">Source Ticket:</span>
                <span className="font-mono text-slate-700">#{ticketNumber}</span>
              </div>
            )}
          </div>

          {/* Note / Remarks for Employee */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-800 flex items-center justify-between text-xs">
              <span>Share Note / Instructions with Employee</span>
              <span className="text-[10px] font-normal text-slate-400">{note.length}/1000</span>
            </label>
            <p className="text-[11px] text-slate-500 leading-snug">
              This note will be notified to <strong>{assigneeName || "the assigned staff"}</strong> and attached to the Hot Order alert &amp; activity history.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 1000))}
              placeholder="e.g., Customer called requesting urgent verification. Please process right away."
              rows={3}
              className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition-all resize-none leading-relaxed"
              autoFocus
            />
          </div>

          {/* Preset Suggestions */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Quick Suggestions:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {presetReasons.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setNote(preset)}
                  className="text-[10px] px-2.5 py-1 rounded-md bg-slate-100 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 border border-slate-200 text-slate-600 transition-all text-left cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(note.trim())}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Escalating...</span>
              </>
            ) : (
              <>
                <Flame className="size-3.5 fill-current" />
                <span>Confirm &amp; Reopen Order Hot 🔥</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

