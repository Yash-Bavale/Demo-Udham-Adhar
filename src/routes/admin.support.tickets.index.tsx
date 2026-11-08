import { isVisibleService } from "@/lib/crm/visible-services";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, ChevronLeft, ChevronRight, RotateCcw, X, Filter, Loader2,
  ArrowUpDown, ArrowUp, ArrowDown, Inbox, Plus, UserCheck, CheckCircle2,
  AlertCircle, Clock, ShieldAlert, Sparkles, MessageSquare, Tag, Flag,
  MoreVertical, Copy, ExternalLink, Eye, Star, Folder, FolderPlus, Trash2, Edit2, Check
} from "lucide-react";
import { formatIST, istDateKey } from "@/lib/datetime";
import { toast } from "sonner";

import {
  listTickets,
  getTicketStats,
  bulkAssignTickets,
  bulkUpdateTicketStatus,
  bulkUpdateTicketPriority,
  bulkMarkTicketsRead,
  type TicketStatus,
  type TicketPriority,
  type ResponseState,
  TICKET_STATUSES,
  PRIORITIES,
} from "@/lib/crm/tickets.functions";
import {
  listSupportFolders,
  createSupportFolder,
  renameSupportFolder,
  deleteSupportFolder,
  toggleTicketStar,
  bulkToggleTicketStar,
  moveTicketsToFolder,
  removeTicketsFromFolder,
} from "@/lib/crm/support-folders.functions";
import { listStaff } from "@/lib/crm/leads-admin.functions";
import { listServices } from "@/lib/crm/services-admin.functions";
import { STAGE_META, type OrderStage } from "@/lib/crm/computeOrderStage";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { AddTicketDialog } from "@/components/admin/AddTicketDialog";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { formatMobile55 } from "@/lib/utils";

export const Route = createFileRoute("/admin/support/tickets/")({
  validateSearch: (
    search: Record<string, unknown>
  ): {
    bucket?: string;
    status?: string;
    responseState?: string;
    priority?: string;
    assignedTo?: string;
    serviceId?: string;
    stage?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    preset?: string;
    isStarred?: boolean;
    folderId?: string;
  } => ({
    bucket: typeof search.bucket === "string" ? search.bucket : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
    responseState: typeof search.responseState === "string" ? search.responseState : undefined,
    priority: typeof search.priority === "string" ? search.priority : undefined,
    assignedTo: typeof search.assignedTo === "string" ? search.assignedTo : undefined,
    serviceId: typeof search.serviceId === "string" ? search.serviceId : undefined,
    stage: typeof search.stage === "string" ? search.stage : undefined,
    search: typeof search.search === "string" ? search.search : undefined,
    dateFrom: typeof search.dateFrom === "string" ? search.dateFrom : undefined,
    dateTo: typeof search.dateTo === "string" ? search.dateTo : undefined,
    preset: typeof search.preset === "string" ? search.preset : undefined,
    isStarred: typeof search.isStarred === "boolean" ? search.isStarred : search.isStarred === "true" ? true : undefined,
    folderId: typeof search.folderId === "string" ? search.folderId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Support Tickets Operations — BHS CRM" },
      { name: "description", content: "Dense operational support ticket management." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SupportTicketsOperationsPage,
});

type RangePreset = "today" | "yesterday" | "7d" | "15d" | "30d" | "mtd" | "custom";
const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7 days" },
  { value: "15d", label: "15 days" },
  { value: "30d", label: "30 days" },
  { value: "mtd", label: "This month" },
  { value: "custom", label: "Custom" },
];

type Bucket = "all" | "need_action" | "backlog" | "reopened" | "refund" | "closed";

const BUCKETS: { id: Bucket; label: string }[] = [
  { id: "all",         label: "All Tickets" },
  { id: "need_action", label: "Need Action" },
  { id: "backlog",     label: "Backlog" },
  { id: "reopened",    label: "Reopened" },
  { id: "refund",      label: "Refund" },
  { id: "closed",      label: "Closed" },
];

const STATUS_PILL: Record<TicketStatus, { bg: string; fg: string; border: string; label: string }> = {
  open:             { bg: "bg-blue-50", fg: "text-blue-700", border: "border-blue-200", label: "Open" },
  in_progress:      { bg: "bg-purple-50", fg: "text-purple-700", border: "border-purple-200", label: "In Progress" },
  waiting_customer: { bg: "bg-amber-50", fg: "text-amber-800", border: "border-amber-200", label: "Waiting Customer" },
  resolved:         { bg: "bg-emerald-50", fg: "text-emerald-700", border: "border-emerald-200", label: "Resolved" },
  closed:           { bg: "bg-slate-100", fg: "text-slate-600", border: "border-slate-200", label: "Closed" },
};

const PRIORITY_PILL: Record<TicketPriority, { bg: string; fg: string; border: string; label: string }> = {
  urgent: { bg: "bg-rose-100", fg: "text-rose-800", border: "border-rose-300", label: "Urgent" },
  high:   { bg: "bg-orange-50", fg: "text-orange-800", border: "border-orange-200", label: "High" },
  medium: { bg: "bg-blue-50", fg: "text-blue-700", border: "border-blue-200", label: "Medium" },
  low:    { bg: "bg-slate-100", fg: "text-slate-600", border: "border-slate-200", label: "Low" },
};

const STAGE_FILTER_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "all", label: "All Order Stages" },
  { id: "payment_done", label: "Incomplete Form" },
  { id: "form_not_submitted", label: "Form Not Submitted Delay" },
  { id: "form_submitted", label: "Form Submitted" },
  { id: "technical_delay", label: "Technical Delay" },
  { id: "customer_delay", label: "Customer Delay" },
  { id: "submitted_to_govt", label: "Submitted to Govt" },
  { id: "certificate_ready", label: "Certificate Ready" },
  { id: "completed", label: "Completed" },
  { id: "closed", label: "Order Closed" },
];

function formatDayHeader(day: string): string {
  const d = new Date(day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const base = d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).toUpperCase();
  if (target.getTime() === today.getTime()) return `${base} · TODAY`;
  if (target.getTime() === yest.getTime()) return `${base} · YESTERDAY`;
  return base;
}

function formatAge(dateInput: string | number | Date): string {
  if (!dateInput) return "just now";
  const d =
    typeof dateInput === "number" && dateInput < 1_000_000_000_000
      ? new Date(Date.now() - dateInput)
      : new Date(dateInput);

  if (isNaN(d.getTime())) return "just now";

  const now = new Date();
  const ms = now.getTime() - d.getTime();
  if (ms < 0) return "just now";

  // Calculate calendar days in IST
  const todayKey = istDateKey(now);
  const targetKey = istDateKey(d);

  if (todayKey === targetKey) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${Math.max(1, s)}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  }

  const [tY, tM, tD] = todayKey.split("-").map(Number);
  const [cY, cM, cD] = targetKey.split("-").map(Number);

  const todayMidnight = Date.UTC(tY, tM - 1, tD);
  const targetMidnight = Date.UTC(cY, cM - 1, cD);
  const calendarDays = Math.max(1, Math.round((todayMidnight - targetMidnight) / (24 * 60 * 60 * 1000)));

  return `${calendarDays}d ago`;
}

function getResponseStateBadge(ticket: {
  response_state: string;
  is_new: boolean;
  is_unread: boolean;
  status: string;
}) {
  if (ticket.status === "closed" || ticket.status === "resolved") {
    return {
      label: "Closed",
      tone: "slate",
      pillClass: "bg-slate-100 text-slate-600 border-slate-200",
      dotClass: "bg-slate-400",
    };
  }

  if (ticket.is_new) {
    return {
      label: "NEW",
      tone: "rose",
      pillClass: "bg-rose-50 text-rose-700 border-rose-200 font-bold",
      dotClass: "bg-rose-600 animate-pulse",
    };
  }

  if (ticket.response_state === "awaiting_action" || ticket.is_unread) {
    return {
      label: "Action Required",
      tone: "rose",
      pillClass: "bg-rose-50 text-rose-700 border-rose-200 font-semibold",
      dotClass: "bg-rose-600 animate-pulse",
    };
  }

  if (ticket.response_state === "awaiting_customer") {
    return {
      label: "Awaiting Customer",
      tone: "amber",
      pillClass: "bg-amber-50 text-amber-800 border-amber-200 font-medium",
      dotClass: "bg-amber-500",
    };
  }

  if (ticket.response_state === "replied") {
    return {
      label: "Replied",
      tone: "emerald",
      pillClass: "bg-emerald-50 text-emerald-700 border-emerald-200 font-medium",
      dotClass: "bg-emerald-500",
    };
  }

  return {
    label: "Open",
    tone: "blue",
    pillClass: "bg-blue-50 text-blue-700 border-blue-200 font-medium",
    dotClass: "bg-blue-500",
  };
}

function SupportTicketsOperationsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = useRole();
  const userPerms = usePermissions();
  const isAdmin = role.hasAny(["admin", "super_admin"]);

  const listFn = useServerFn(listTickets);
  const statsFn = useServerFn(getTicketStats);
  const staffFn = useServerFn(listStaff);
  const svcFn = useServerFn(listServices);
  const bulkAssignFn = useServerFn(bulkAssignTickets);
  const bulkStatusFn = useServerFn(bulkUpdateTicketStatus);
  const bulkPriorityFn = useServerFn(bulkUpdateTicketPriority);
  const bulkReadFn = useServerFn(bulkMarkTicketsRead);

  // Folder & Star server functions
  const foldersFn = useServerFn(listSupportFolders);
  const createFolderFn = useServerFn(createSupportFolder);
  const renameFolderFn = useServerFn(renameSupportFolder);
  const deleteFolderFn = useServerFn(deleteSupportFolder);
  const toggleStarFn = useServerFn(toggleTicketStar);
  const bulkStarFn = useServerFn(bulkToggleTicketStar);
  const moveTicketsFn = useServerFn(moveTicketsToFolder);
  const removeTicketsFromFolderFn = useServerFn(removeTicketsFromFolder);

  const routeSearch = Route.useSearch();
  const todayKey = useMemo(() => istDateKey(new Date()), []);

  // Organization navigation mode: "all" | "starred" | "folder"
  const [viewMode, setViewMode] = useState<"all" | "starred" | "folder">(() => {
    if (routeSearch.isStarred) return "starred";
    if (routeSearch.folderId) return "folder";
    return "all";
  });
  const [activeFolderId, setActiveFolderId] = useState<string | null>(() => routeSearch.folderId ?? null);

  // Folder modal states
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState<string>("slate");

  const [folderToRename, setFolderToRename] = useState<{ id: string; name: string; color: string } | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [renameColor, setRenameColor] = useState("slate");

  const [folderToDelete, setFolderToDelete] = useState<{ id: string; name: string } | null>(null);

  const [datePreset, setDatePreset] = useState<RangePreset>(() => {
    if (routeSearch.preset && ["today", "yesterday", "7d", "15d", "30d", "mtd", "custom"].includes(routeSearch.preset)) {
      return routeSearch.preset as RangePreset;
    }
    if (routeSearch.dateFrom && routeSearch.dateFrom !== istDateKey(new Date())) return "custom";
    return "today";
  });

  const [bucket, setBucketState] = useState<Bucket>(() => {
    if (routeSearch.bucket && ["all", "need_action", "backlog", "reopened", "refund", "closed"].includes(routeSearch.bucket)) {
      return routeSearch.bucket as Bucket;
    }
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("bhs_support_active_bucket");
        if (saved && ["all", "need_action", "backlog", "reopened", "refund", "closed"].includes(saved)) {
          return saved as Bucket;
        }
      } catch {}
    }
    return "need_action";
  });

  const setBucket = useCallback((newBucket: Bucket) => {
    setBucketState(newBucket);
    try {
      sessionStorage.setItem("bhs_support_active_bucket", newBucket);
    } catch {}
    navigate({
      search: ((prev: any) => ({ ...prev, bucket: newBucket })) as any,
      replace: true,
    });
  }, [navigate]);
  const [search, setSearch] = useState<string>(routeSearch.search ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState<string>(routeSearch.search ?? "");
  const [statusFilter, setStatusFilter] = useState<string>(routeSearch.status ?? "all");
  const [responseStateFilter, setResponseStateFilter] = useState<string>(routeSearch.responseState ?? "all");
  const [priorityFilter, setPriorityFilter] = useState<string>(routeSearch.priority ?? "all");
  const [assignedTo, setAssignedTo] = useState<string>(routeSearch.assignedTo ?? "all");
  const [serviceId, setServiceId] = useState<string>(routeSearch.serviceId ?? "all");
  const [stageFilter, setStageFilter] = useState<string>(routeSearch.stage ?? "all");
  const [dateFrom, setDateFrom] = useState<string>(() => {
    if (routeSearch.dateFrom) return routeSearch.dateFrom;
    if (routeSearch.preset === "yesterday") return istDateKey(new Date(Date.now() - 86400000));
    if (routeSearch.preset === "7d") return istDateKey(new Date(Date.now() - 6 * 86400000));
    if (routeSearch.preset === "15d") return istDateKey(new Date(Date.now() - 14 * 86400000));
    if (routeSearch.preset === "30d") return istDateKey(new Date(Date.now() - 29 * 86400000));
    if (routeSearch.preset === "custom") return "";
    return todayKey;
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    if (routeSearch.dateTo) return routeSearch.dateTo;
    if (routeSearch.preset === "yesterday") return istDateKey(new Date(Date.now() - 86400000));
    if (routeSearch.preset === "custom") return "";
    return todayKey;
  });
  const [sortField, setSortField] = useState<"last_activity" | "newest" | "oldest" | "highest_priority" | "unassigned" | "updated">("last_activity");
  const [page, setPage] = useState<number>(1);
  const pageSize = 50;

  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [addTicketOpen, setAddTicketOpen] = useState(false);

  const applyDatePreset = useCallback((p: RangePreset) => {
    setDatePreset(p);
    const now = new Date();
    const tKey = istDateKey(now);
    if (p === "today") {
      setDateFrom(tKey);
      setDateTo(tKey);
    } else if (p === "yesterday") {
      const yKey = istDateKey(new Date(now.getTime() - 86400000));
      setDateFrom(yKey);
      setDateTo(yKey);
    } else if (p === "7d") {
      const startKey = istDateKey(new Date(now.getTime() - 6 * 86400000));
      setDateFrom(startKey);
      setDateTo(tKey);
    } else if (p === "15d") {
      const startKey = istDateKey(new Date(now.getTime() - 14 * 86400000));
      setDateFrom(startKey);
      setDateTo(tKey);
    } else if (p === "30d") {
      const startKey = istDateKey(new Date(now.getTime() - 29 * 86400000));
      setDateFrom(startKey);
      setDateTo(tKey);
    } else if (p === "mtd") {
      const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
      const monthStart = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1));
      setDateFrom(istDateKey(monthStart));
      setDateTo(tKey);
    }
  }, []);

  const dateRangeValue = useMemo(() => ({
    from: dateFrom ? new Date(dateFrom.includes("T") ? dateFrom : `${dateFrom}T00:00:00+05:30`) : undefined,
    to: dateTo ? new Date(dateTo.includes("T") ? dateTo : `${dateTo}T23:59:59+05:30`) : undefined,
  }), [dateFrom, dateTo]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Sync route params
  useEffect(() => {
    if (routeSearch.status) {
      if (routeSearch.status === "closed") setBucket("closed");
      else if (routeSearch.status === "open" || routeSearch.status === "need_action") setBucket("need_action");
      else setStatusFilter(routeSearch.status);
    }
    if (routeSearch.responseState) setResponseStateFilter(routeSearch.responseState);
    if (routeSearch.priority) setPriorityFilter(routeSearch.priority);
    if (routeSearch.assignedTo) setAssignedTo(routeSearch.assignedTo);
    if (routeSearch.serviceId) setServiceId(routeSearch.serviceId);
    if (routeSearch.stage) setStageFilter(routeSearch.stage);
    if (routeSearch.search) setSearch(routeSearch.search);
    if (routeSearch.preset && ["today", "yesterday", "7d", "15d", "30d", "mtd", "custom"].includes(routeSearch.preset)) {
      applyDatePreset(routeSearch.preset as RangePreset);
    }
    if (routeSearch.dateFrom) setDateFrom(routeSearch.dateFrom);
    if (routeSearch.dateTo) setDateTo(routeSearch.dateTo);
  }, [routeSearch, applyDatePreset]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
    setSelectedTicketIds([]);
  }, [bucket, debouncedSearch, statusFilter, responseStateFilter, priorityFilter, assignedTo, serviceId, stageFilter, dateFrom, dateTo, sortField]);

  // Realtime updates
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["support-tickets-ops"] });
    qc.invalidateQueries({ queryKey: ["support-ticket-stats"] });
  };
  useRealtimeTable("support_tickets", invalidate);
  useRealtimeTable("ticket_replies", invalidate);

  // Queries
  const { data: staffData } = useQuery({ queryKey: ["admin.staff"], queryFn: () => staffFn() });
  const staffProfiles: Array<{ id: string; display_name?: string; email?: string; name?: string }> = useMemo(() => {
    if (Array.isArray(staffData)) return staffData;
    if (Array.isArray((staffData as any)?.profiles)) return (staffData as any).profiles;
    if (Array.isArray((staffData as any)?.staff)) return (staffData as any).staff;
    return [];
  }, [staffData]);

  const { data: svcData } = useQuery({ queryKey: ["admin.services.list"], queryFn: () => svcFn() });
  const servicesList = useMemo(() => {
    if (Array.isArray(svcData)) return svcData;
    if (Array.isArray((svcData as any)?.rows)) return (svcData as any).rows;
    if (Array.isArray((svcData as any)?.services)) return (svcData as any).services;
    return [];
  }, [svcData]);

  const groupedServices = useMemo(() => {
    const raw = servicesList;
    const activeOnly = raw.filter((s: any) => isVisibleService(s));
    const map = new Map<string, { websiteName: string; domain: string; services: any[] }>();

    for (const s of activeOnly) {
      const webId = s.website_id || s.website?.id || "main";
      const webName = s.website?.name || s.website?.domain || "Main Website";
      const domain = s.website?.domain || "";

      if (!map.has(webId)) {
        map.set(webId, { websiteName: webName, domain, services: [] });
      }
      map.get(webId)!.services.push(s);
    }

    return Array.from(map.entries()).map(([id, group]) => ({
      id,
      ...group,
    }));
  }, [servicesList]);

  const { data: statsData } = useQuery({
    queryKey: ["support-ticket-stats"],
    queryFn: () => statsFn(),
    refetchInterval: 15000,
  });

  const queryPayload = useMemo(() => {
    const isCustomView = viewMode === "folder" || viewMode === "starred";

    let effectiveStatus: TicketStatus | undefined = undefined;
    let effectiveStatuses: TicketStatus[] | undefined = undefined;
    let effectiveRespState: ResponseState = "all";
    let effectiveDateFrom: string | undefined = dateFrom || undefined;
    let effectiveDateTo: string | undefined = dateTo || undefined;

    if (isCustomView) {
      effectiveStatuses = undefined;
      effectiveStatus = undefined;
      effectiveRespState = "all";
      effectiveDateFrom = datePreset === "custom" ? (dateFrom || undefined) : undefined;
      effectiveDateTo = datePreset === "custom" ? (dateTo || undefined) : undefined;
    } else if (bucket === "all") {
      effectiveStatuses = undefined;
      effectiveStatus = undefined;
      effectiveRespState = "all";
      effectiveDateFrom = dateFrom || undefined;
    } else if (bucket === "need_action") {
      effectiveStatuses = ["open", "in_progress", "waiting_customer"];
      effectiveRespState = "all";
      effectiveDateFrom = undefined; // all open tickets till date
    } else if (bucket === "reopened") {
      effectiveStatuses = undefined;
      effectiveRespState = "all";
      effectiveDateFrom = dateFrom || undefined;
    } else if (bucket === "refund") {
      effectiveStatuses = undefined;
      effectiveRespState = "all";
      effectiveDateFrom = dateFrom || undefined;
    } else if (bucket === "closed") {
      effectiveStatuses = ["resolved", "closed"];
      effectiveDateFrom = dateFrom || undefined;
    }

    if (statusFilter !== "all") {
      effectiveStatus = statusFilter as TicketStatus;
      effectiveStatuses = undefined;
    }
    if (responseStateFilter !== "all") {
      effectiveRespState = responseStateFilter as ResponseState;
    }

    return {
      isStarred: viewMode === "starred" ? true : undefined,
      folderId: viewMode === "folder" && activeFolderId ? activeFolderId : undefined,
      page,
      pageSize,
      q: debouncedSearch,
      bucket: isCustomView ? "all" : bucket,
      status: effectiveStatus,
      statuses: isCustomView ? undefined : effectiveStatuses,
      responseState: effectiveRespState,
      priority: priorityFilter === "all" ? undefined : (priorityFilter as TicketPriority),
      assignedTo: assignedTo === "all" ? undefined : assignedTo,
      serviceId: serviceId === "all" ? undefined : serviceId,
      stage: stageFilter === "all" ? undefined : stageFilter,
      dateFrom: effectiveDateFrom,
      dateTo: effectiveDateTo,
      sort: sortField,
      scope: "all" as const,
    };
  }, [page, pageSize, debouncedSearch, bucket, statusFilter, responseStateFilter, priorityFilter, assignedTo, serviceId, stageFilter, dateFrom, dateTo, datePreset, sortField, viewMode, activeFolderId]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["support-tickets-ops", queryPayload],
    queryFn: () => listFn({ data: queryPayload }),
  });

  const tickets = data?.tickets ?? [];
  const total = data?.total ?? 0;

  // Day grouping (by closed_at when bucket is closed, else by created_at)
  const groups = useMemo(() => {
    const map = new Map<string, typeof tickets>();
    for (const t of tickets) {
      const dateVal = bucket === "closed" ? ((t as any).closed_at || t.updated_at || t.created_at) : t.created_at;
      const key = istDateKey(new Date(dateVal));
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [tickets, bucket]);

  // Folder & Star queries and mutations
  const { data: foldersData, refetch: refetchFolders } = useQuery({
    queryKey: ["support-ticket-folders"],
    queryFn: () => foldersFn(),
  });
  const folders = foldersData?.folders ?? [];
  const starredCount = foldersData?.starredCount ?? 0;

  const toggleStarMutation = useMutation({
    mutationFn: (variables: { ticketId: string; isStarred: boolean }) =>
      toggleStarFn({ data: variables }),
    onSuccess: (res) => {
      invalidate();
      refetchFolders();
      toast.success(res.isStarred ? "Ticket starred" : "Ticket unstarred");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkStarMutation = useMutation({
    mutationFn: (variables: { ticketIds: string[]; isStarred: boolean }) =>
      bulkStarFn({ data: variables }),
    onSuccess: (res) => {
      invalidate();
      refetchFolders();
      setSelectedTicketIds([]);
      const isStarred = (res as any).isStarred ?? (res as any).star;
      toast.success(isStarred ? `${res.count} tickets starred` : `${res.count} tickets unstarred`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveTicketsMutation = useMutation({
    mutationFn: (variables: { ticketIds: string[]; folderId: string }) =>
      moveTicketsFn({ data: variables }),
    onSuccess: (res) => {
      invalidate();
      refetchFolders();
      setSelectedTicketIds([]);
      toast.success(`${res.count} ticket(s) moved to folder`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeTicketsMutation = useMutation({
    mutationFn: (variables: { ticketIds: string[] }) =>
      removeTicketsFromFolderFn({ data: variables }),
    onSuccess: (res) => {
      invalidate();
      refetchFolders();
      setSelectedTicketIds([]);
      toast.success(`${res.count} ticket(s) removed from folder`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createFolderMutation = useMutation({
    mutationFn: (variables: { name: string; color?: string }) =>
      createFolderFn({ data: variables }),
    onSuccess: (res) => {
      refetchFolders();
      setCreateFolderOpen(false);
      setNewFolderName("");
      toast.success(`Folder "${res.folder.name}" created`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameFolderMutation = useMutation({
    mutationFn: (variables: { folderId: string; name: string; color?: string }) =>
      renameFolderFn({ data: variables }),
    onSuccess: (res) => {
      refetchFolders();
      setFolderToRename(null);
      toast.success(`Folder renamed to "${res.folder.name}"`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: string) => deleteFolderFn({ data: { folderId } }),
    onSuccess: () => {
      refetchFolders();
      invalidate();
      if (activeFolderId === folderToDelete?.id) {
        setViewMode("all");
        setActiveFolderId(null);
        navigate({
          search: ((prev: any) => ({ ...prev, isStarred: undefined, folderId: undefined })) as any,
          replace: true,
        });
      }
      setFolderToDelete(null);
      toast.success("Folder deleted (tickets preserved)");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Bulk mutations
  const assignMutation = useMutation({
    mutationFn: (assignedTo: string | null) => bulkAssignFn({ data: { ticketIds: selectedTicketIds, assignedTo } }),
    onSuccess: (r) => {
      toast.success(`${r.count} tickets assigned successfully`);
      setSelectedTicketIds([]);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: (status: TicketStatus) => bulkStatusFn({ data: { ticketIds: selectedTicketIds, status } }),
    onSuccess: (r) => {
      toast.success(`${r.count} tickets status updated`);
      setSelectedTicketIds([]);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const priorityMutation = useMutation({
    mutationFn: (priority: TicketPriority) => bulkPriorityFn({ data: { ticketIds: selectedTicketIds, priority } }),
    onSuccess: (r) => {
      toast.success(`${r.count} tickets priority updated`);
      setSelectedTicketIds([]);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const readMutation = useMutation({
    mutationFn: () => bulkReadFn({ data: { ticketIds: selectedTicketIds } }),
    onSuccess: (r) => {
      toast.success(`${r.count} tickets marked as read`);
      setSelectedTicketIds([]);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleResetFilters = () => {
    setViewMode("all");
    setActiveFolderId(null);
    setBucket("need_action");
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setResponseStateFilter("all");
    setPriorityFilter("all");
    setAssignedTo("all");
    setServiceId("all");
    setStageFilter("all");
    applyDatePreset("today");
    setSortField("last_activity");
    setPage(1);
    setSelectedTicketIds([]);
    navigate({
      search: ((prev: any) => ({ ...prev, isStarred: undefined, folderId: undefined })) as any,
      replace: true,
    });
  };

  const isFiltering =
    viewMode !== "all" ||
    bucket !== "need_action" ||
    search !== "" ||
    statusFilter !== "all" ||
    responseStateFilter !== "all" ||
    priorityFilter !== "all" ||
    assignedTo !== "all" ||
    serviceId !== "all" ||
    stageFilter !== "all" ||
    datePreset !== "today" ||
    (dateFrom !== "" && dateFrom !== todayKey) ||
    (dateTo !== "" && dateTo !== todayKey) ||
    sortField !== "last_activity";

  const colCount = 14;

  return (
    <div className="p-4 md:p-6 space-y-4 w-full min-w-0">
      {/* ── 1. Top Header & Date Range Selector ─────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#1e3a5f] text-white shadow-sm flex items-center justify-center">
            <Inbox className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Support / Tickets
              </h1>
              {isFetching && !isLoading && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full animate-pulse">
                  <Loader2 className="size-3 animate-spin text-indigo-600" /> Updating…
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={datePreset}
            onValueChange={(v) => applyDatePreset(v as RangePreset)}
          >
            <TabsList className="h-9">
              {RANGE_PRESETS.map((p) => (
                <TabsTrigger
                  key={p.value}
                  value={p.value}
                  className="text-xs px-2.5"
                >
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {datePreset === "custom" && (
            <DateRangePicker
              value={dateRangeValue}
              onChange={(range) => {
                if (!range.from) {
                  setDateFrom("");
                  setDateTo("");
                } else {
                  setDateFrom(istDateKey(range.from));
                  setDateTo(range.to ? istDateKey(range.to) : istDateKey(range.from));
                }
              }}
            />
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              invalidate();
              toast.success("Refreshing tickets…");
            }}
            disabled={isFetching}
            className="h-9 gap-1.5 text-xs text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border-slate-200 shadow-2xs"
            title="Refresh tickets"
          >
            <RotateCcw className={`size-3.5 ${isFetching && !isLoading ? "animate-spin text-indigo-600" : "text-slate-500"}`} />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setAddTicketOpen(true)}
            className="h-9 px-4 text-xs font-semibold bg-[#1e3a5f] hover:bg-[#152b47] text-white shadow-xs rounded-lg transition-all"
          >
            <Plus className="size-3.5 mr-1.5" />
            New Ticket
          </Button>

          {isFiltering && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
            >
              <RotateCcw className="size-3.5" /> Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ── 2. Clickable KPI Stat Cards (All Tickets, Need Action, Backlog, Reopened, Refund, Closed) ─────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
        {BUCKETS.map((b) => {
          const active = viewMode === "all" && bucket === b.id;
          let count = 0;
          let subBadge = "";

          if (b.id === "all") {
            count = statsData?.total ?? 0;
          } else if (b.id === "need_action") {
            count = statsData?.need_action ?? statsData?.open ?? 0;
          } else if (b.id === "backlog") {
            count = statsData?.backlog ?? 0;
          } else if (b.id === "reopened") {
            count = statsData?.reopened ?? 0;
          } else if (b.id === "refund") {
            count = statsData?.refund ?? 0;
          } else if (b.id === "closed") {
            count = statsData?.closed ?? 0;
          }

          // Distinct color themes per bucket
          const themeMap: Record<Bucket, { bg: string; border: string; activeBorder: string; text: string; countColor: string; icon: string }> = {
            all: {
              bg: "bg-white",
              border: "border-slate-200",
              activeBorder: "ring-2 ring-slate-900 border-slate-900 bg-slate-50",
              text: "text-slate-600",
              countColor: "text-slate-900",
              icon: "📁",
            },
            need_action: {
              bg: "bg-blue-50/40 hover:bg-blue-50",
              border: "border-blue-100",
              activeBorder: "ring-2 ring-blue-600 border-blue-500 bg-blue-50",
              text: "text-blue-700",
              countColor: "text-blue-700",
              icon: "📬",
            },
            backlog: {
              bg: "bg-orange-50/50 hover:bg-orange-50",
              border: "border-orange-100",
              activeBorder: "ring-2 ring-orange-600 border-orange-500 bg-orange-50",
              text: "text-orange-800",
              countColor: "text-orange-800",
              icon: "⏳",
            },
            reopened: {
              bg: "bg-violet-50/50 hover:bg-violet-50",
              border: "border-violet-100",
              activeBorder: "ring-2 ring-violet-600 border-violet-500 bg-violet-50",
              text: "text-violet-700",
              countColor: "text-violet-700",
              icon: "🔥",
            },
            refund: {
              bg: "bg-amber-50/50 hover:bg-amber-50",
              border: "border-amber-100",
              activeBorder: "ring-2 ring-amber-600 border-amber-500 bg-amber-50",
              text: "text-amber-800",
              countColor: "text-amber-800",
              icon: "💳",
            },
            closed: {
              bg: "bg-emerald-50/40 hover:bg-emerald-50",
              border: "border-emerald-100",
              activeBorder: "ring-2 ring-emerald-600 border-emerald-500 bg-emerald-50",
              text: "text-emerald-700",
              countColor: "text-emerald-700",
              icon: "✅",
            },
          };

          const theme = themeMap[b.id] ?? themeMap.all;

          return (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                setViewMode("all");
                setActiveFolderId(null);
                setBucket(b.id);
                setStatusFilter("all");
                setResponseStateFilter("all");
                setPage(1);
              }}
              className={`p-3 rounded-xl text-left transition-all border shadow-2xs cursor-pointer flex flex-col justify-between ${
                theme.bg
              } ${active ? theme.activeBorder : theme.border}`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className={`text-[11px] font-semibold truncate ${theme.text}`}>
                  {b.label}
                </span>
                <span className="text-xs opacity-75">{theme.icon}</span>
              </div>
              <div className="flex items-baseline justify-between gap-1">
                <div className={`text-xl font-extrabold tracking-tight ${theme.countColor}`}>
                  {count.toLocaleString("en-IN")}
                </div>
                {subBadge && (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100/90 px-1.5 py-0.5 rounded-full border border-amber-200 truncate" title="Unresolved tickets created before today">
                    {subBadge}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── 2.5 Folders / Starred Email Organisation Strip ──────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl border border-slate-200 bg-white shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* All Tickets tab */}
          <button
            type="button"
            onClick={() => {
              setViewMode("all");
              setActiveFolderId(null);
              navigate({
                search: ((prev: any) => ({ ...prev, isStarred: undefined, folderId: undefined })) as any,
                replace: true,
              });
            }}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-all ${
              viewMode === "all"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200"
            }`}
          >
            <Inbox className="size-3.5" />
            <span>All Tickets</span>
          </button>

          {/* Starred tab */}
          <button
            type="button"
            onClick={() => {
              setViewMode("starred");
              setActiveFolderId(null);
              navigate({
                search: ((prev: any) => ({ ...prev, isStarred: true, folderId: undefined })) as any,
                replace: true,
              });
            }}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-all ${
              viewMode === "starred"
                ? "bg-amber-500 text-white shadow-xs"
                : "bg-amber-50/60 text-amber-800 hover:bg-amber-100 hover:text-amber-900 border border-amber-200"
            }`}
          >
            <Star className={`size-3.5 ${viewMode === "starred" ? "fill-white" : "fill-amber-400 text-amber-500"}`} />
            <span>Starred</span>
            {starredCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                viewMode === "starred" ? "bg-white/20 text-white" : "bg-amber-200/80 text-amber-900"
              }`}>
                {starredCount}
              </span>
            )}
          </button>

          <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

          {/* Custom Folders list */}
          {folders.map((f: any) => {
            const isFolderActive = viewMode === "folder" && activeFolderId === f.id;
            return (
              <div key={f.id} className="relative group inline-flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode("folder");
                    setActiveFolderId(f.id);
                    navigate({
                      search: ((prev: any) => ({ ...prev, isStarred: undefined, folderId: f.id })) as any,
                      replace: true,
                    });
                  }}
                  className={`inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-lg text-xs font-semibold transition-all ${
                    isFolderActive
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  <Folder className={`size-3.5 ${isFolderActive ? "text-white" : "text-indigo-500"}`} />
                  <span className="max-w-[130px] truncate">{f.name}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isFolderActive ? "bg-white/20 text-white" : "bg-slate-200/80 text-slate-700"
                  }`}>
                    {f.ticket_count ?? 0}
                  </span>
                </button>

                {/* Folder Actions Menu (Rename / Delete) */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={`h-8 px-1 rounded-r-lg -ml-1 flex items-center justify-center transition-colors ${
                        isFolderActive
                          ? "text-white/80 hover:text-white hover:bg-indigo-700"
                          : "text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
                      }`}
                      title={`Manage folder ${f.name}`}
                    >
                      <MoreVertical className="size-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem
                      onClick={() => {
                        setFolderToRename(f);
                        setRenameInput(f.name);
                        setRenameColor(f.color || "slate");
                      }}
                      className="text-xs cursor-pointer"
                    >
                      <Edit2 className="size-3.5 mr-2 text-slate-500" />
                      Rename Folder
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setFolderToDelete({ id: f.id, name: f.name })}
                      className="text-xs text-rose-600 focus:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="size-3.5 mr-2 text-rose-500" />
                      Delete Folder
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>

        {/* Right side: + New Folder Button */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setNewFolderName("");
              setNewFolderColor("slate");
              setCreateFolderOpen(true);
            }}
            className="h-8 px-2.5 text-xs font-semibold text-slate-700 border-slate-200 hover:bg-slate-50"
          >
            <FolderPlus className="size-3.5 mr-1.5 text-indigo-600" />
            New Folder
          </Button>
        </div>
      </div>

      {/* ── 3. Filters Toolbar (Single Line Toolbar) ─────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Filter Dropdowns + Sort in 1 line */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            {/* Service Filter */}
            <Select value={serviceId} onValueChange={(v) => { setServiceId(v); setPage(1); }}>
              <SelectTrigger className="h-8 w-[150px] text-xs bg-slate-50/60 border-slate-200 hover:bg-slate-50 font-medium">
                <SelectValue placeholder="All Services" />
              </SelectTrigger>
              <SelectContent className="max-h-[380px]">
                <SelectItem value="all" className="font-bold text-slate-700">All Services</SelectItem>
                {groupedServices.map((g) => (
                  <SelectGroup key={g.id}>
                    <SelectLabel className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50/80 rounded-md my-1 flex items-center gap-1">
                      Udyam Aadhar Services
                    </SelectLabel>
                    {g.services.map((svc: any) => (
                      <SelectItem key={svc.id} value={svc.id} className="pl-3 text-xs">
                        {svc.service_name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>

            {/* Order Stage Filter */}
            <Select value={stageFilter} onValueChange={(v) => { setStageFilter(v); setPage(1); }}>
              <SelectTrigger className="h-8 w-[145px] text-xs bg-slate-50/60 border-slate-200 hover:bg-slate-50 font-medium">
                <SelectValue placeholder="All Order Stages" />
              </SelectTrigger>
              <SelectContent>
                {STAGE_FILTER_OPTIONS.map((st) => (
                  <SelectItem key={st.id} value={st.id}>
                    {st.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Priority Filter */}
            <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setPage(1); }}>
              <SelectTrigger className="h-8 w-[125px] text-xs bg-slate-50/60 border-slate-200 hover:bg-slate-50 font-medium">
                <SelectValue placeholder="All Priorities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_PILL[p].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Ticket Status Filter */}
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="h-8 w-[130px] text-xs bg-slate-50/60 border-slate-200 hover:bg-slate-50 font-medium">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {TICKET_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_PILL[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Assigned Staff Filter */}
            <Select value={assignedTo} onValueChange={(v) => { setAssignedTo(v); setPage(1); }}>
              <SelectTrigger className="h-8 w-[130px] text-xs bg-slate-50/60 border-slate-200 hover:bg-slate-50 font-medium">
                <SelectValue placeholder="All Staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                <SelectItem value="unassigned">❌ Unassigned</SelectItem>
                {staffProfiles.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    👤 {s.display_name || s.name || s.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Response State Filter */}
            <Select value={responseStateFilter} onValueChange={(v) => { setResponseStateFilter(v); setPage(1); }}>
              <SelectTrigger className="h-8 w-[140px] text-xs bg-slate-50/60 border-slate-200 hover:bg-slate-50 font-medium">
                <SelectValue placeholder="All Responses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Responses</SelectItem>
                <SelectItem value="new">NEW (Unreplied)</SelectItem>
                <SelectItem value="unread">Unread by Staff</SelectItem>
                <SelectItem value="awaiting_action">Awaiting Action</SelectItem>
                <SelectItem value="awaiting_customer">Awaiting Customer</SelectItem>
                <SelectItem value="replied">Staff Replied</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort Selector */}
            <Select value={sortField} onValueChange={(v: any) => setSortField(v)}>
              <SelectTrigger className="h-8 w-[155px] text-xs bg-slate-50/60 border-slate-200 hover:bg-slate-50 font-medium">
                <ArrowUpDown className="w-3.5 h-3.5 mr-1 text-slate-500 shrink-0" />
                <SelectValue placeholder="Sort order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last_activity">Latest Activity First</SelectItem>
                <SelectItem value="newest">Created (Newest)</SelectItem>
                <SelectItem value="oldest">Created (Oldest)</SelectItem>
                <SelectItem value="highest_priority">Highest Priority</SelectItem>
                <SelectItem value="unassigned">Unassigned First</SelectItem>
                <SelectItem value="updated">Recently Updated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Right End: Ticket Count & Compact Pagination */}
          <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0 ml-auto">
            <span className="font-semibold text-slate-700 whitespace-nowrap">
              {total.toLocaleString("en-IN")} {total === 1 ? "ticket" : "tickets"}
            </span>

            {total > pageSize && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || isLoading}
                  className="size-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-slate-600"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-3.5" />
                </button>

                {/* Page numbers */}
                {Array.from({ length: Math.min(5, Math.ceil(total / pageSize)) }, (_, i) => {
                  const pNum = i + 1;
                  return (
                    <button
                      key={pNum}
                      type="button"
                      onClick={() => setPage(pNum)}
                      className={`size-7 rounded-md text-xs font-medium transition-all ${
                        page === pNum
                          ? "bg-slate-900 text-white font-bold"
                          : "border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      {pNum}
                    </button>
                  );
                })}

                {Math.ceil(total / pageSize) > 5 && (
                  <>
                    <span className="px-1 text-slate-400">…</span>
                    <button
                      type="button"
                      onClick={() => setPage(Math.ceil(total / pageSize))}
                      className={`size-7 rounded-md text-xs font-medium ${
                        page === Math.ceil(total / pageSize)
                          ? "bg-slate-900 text-white font-bold"
                          : "border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      {Math.ceil(total / pageSize)}
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setPage((p) => (p * pageSize < total ? p + 1 : p))}
                  disabled={page * pageSize >= total || isLoading}
                  className="size-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-slate-600"
                  aria-label="Next page"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 4. Bulk Action Bar (Sticky when selected) ──────── */}
      {selectedTicketIds.length > 0 && (
        <div className="sticky top-2 z-30 flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900 text-white rounded-xl shadow-xl border border-slate-700 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <span className="bg-indigo-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
              {selectedTicketIds.length}
            </span>
            <span>{selectedTicketIds.length === 1 ? "Ticket Selected" : "Tickets Selected"}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Bulk Assign */}
            <Select onValueChange={(val) => assignMutation.mutate(val === "unassign" ? null : val)} disabled={assignMutation.isPending}>
              <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-white w-[170px]">
                <UserCheck className="size-3.5 mr-1.5 text-indigo-400" />
                <SelectValue placeholder={assignMutation.isPending ? "Assigning…" : "Assign Staff…"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassign">❌ Unassign</SelectItem>
                {staffProfiles.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    👤 {s.display_name || s.name || s.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Bulk Status */}
            <Select onValueChange={(val: any) => statusMutation.mutate(val)} disabled={statusMutation.isPending}>
              <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-white w-[150px]">
                <Tag className="size-3.5 mr-1.5 text-emerald-400" />
                <SelectValue placeholder={statusMutation.isPending ? "Updating…" : "Set Status…"} />
              </SelectTrigger>
              <SelectContent>
                {TICKET_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_PILL[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Bulk Priority */}
            <Select onValueChange={(val: any) => priorityMutation.mutate(val)} disabled={priorityMutation.isPending}>
              <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-white w-[140px]">
                <Flag className="size-3.5 mr-1.5 text-amber-400" />
                <SelectValue placeholder={priorityMutation.isPending ? "Updating…" : "Set Priority…"} />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_PILL[p].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Bulk Star / Unstar */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkStarMutation.mutate({ ticketIds: selectedTicketIds, isStarred: true })}
              disabled={bulkStarMutation.isPending}
              className="h-8 text-xs bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
            >
              <Star className="size-3.5 mr-1 text-amber-400 fill-amber-400" />
              Star
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkStarMutation.mutate({ ticketIds: selectedTicketIds, isStarred: false })}
              disabled={bulkStarMutation.isPending}
              className="h-8 text-xs bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
            >
              <Star className="size-3.5 mr-1 text-slate-400" />
              Unstar
            </Button>

            {/* Bulk Move to Folder */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={moveTicketsMutation.isPending}
                  className="h-8 text-xs bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
                >
                  <Folder className="size-3.5 mr-1.5 text-indigo-400" />
                  Move to Folder…
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Select Destination Folder
                </div>
                {folders.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-slate-400 italic">No folders created yet</div>
                ) : (
                  folders.map((f: any) => (
                    <DropdownMenuItem
                      key={f.id}
                      onClick={() => moveTicketsMutation.mutate({ ticketIds: selectedTicketIds, folderId: f.id })}
                      className="text-xs cursor-pointer flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Folder className="size-3.5 text-indigo-600" />
                        <span className="truncate">{f.name}</span>
                      </span>
                      <span className="text-[10px] text-slate-400">({f.ticket_count ?? 0})</span>
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => removeTicketsMutation.mutate({ ticketIds: selectedTicketIds })}
                  className="text-xs text-rose-600 cursor-pointer"
                >
                  <X className="size-3.5 mr-2" /> Remove from folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Bulk Mark Read */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => readMutation.mutate()}
              disabled={readMutation.isPending}
              className="h-8 text-xs bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:text-white"
            >
              <CheckCircle2 className="size-3.5 mr-1 text-sky-400" />
              Mark Read
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedTicketIds([])}
              className="h-8 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* ── 5. Operations Table (Desktop) ───────────────────── */}
      <div className="hidden md:block rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1250px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-200">
                <th className="w-10 px-3 py-2.5 text-center">
                  <Checkbox
                    checked={tickets.length > 0 && selectedTicketIds.length === tickets.length}
                    onCheckedChange={(checked) =>
                      setSelectedTicketIds(checked ? tickets.map((r) => r.id) : [])
                    }
                    aria-label="Select all tickets"
                  />
                </th>
                <th className="w-8 px-1 py-2.5 text-center" title="Starred"></th>
                <th className="text-left font-semibold px-3 py-2.5">Ticket #</th>
                <th className="text-left font-semibold px-3 py-2.5">{bucket === "closed" ? "Closed Date" : "Created"}</th>
                <th className="text-left font-semibold px-3 py-2.5">Customer</th>
                <th className="text-left font-semibold px-3 py-2.5 min-w-[220px]">Subject</th>
                <th className="text-left font-semibold px-3 py-2.5">Order & Service</th>
                <th className="text-left font-semibold px-3 py-2.5">Stage</th>
                <th className="text-left font-semibold px-3 py-2.5">Ticket Status</th>
                <th className="text-left font-semibold px-3 py-2.5">Response State</th>
                <th className="text-left font-semibold px-3 py-2.5">Priority</th>
                <th className="text-left font-semibold px-3 py-2.5">Assigned</th>
                <th className="text-left font-semibold px-3 py-2.5">Last Activity</th>
                <th className="w-10 px-2 py-2.5 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={colCount} className="px-4 py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="size-6 animate-spin text-slate-400" />
                      <span className="text-xs font-medium">Loading support tickets…</span>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && tickets.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-4 py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-2">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        <Inbox className="size-6" />
                      </div>
                      <h3 className="text-sm font-semibold text-slate-800">No tickets found</h3>
                      <p className="text-xs text-slate-500">
                        There are no support tickets matching your current filters.
                      </p>
                      {isFiltering && (
                        <Button size="sm" variant="outline" onClick={handleResetFilters} className="mt-2 text-xs">
                          Clear Filters
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading &&
                groups.map(([day, items]) => (
                  <Fragment key={`g-${day}`}>
                    <tr className="bg-slate-900 text-white border-b border-slate-800">
                      <td colSpan={colCount} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider">
                        {formatDayHeader(day)}
                      </td>
                    </tr>
                    {items.map((t) => (
                      <TicketTableRow
                        key={t.id}
                        ticket={t}
                        bucket={bucket}
                        selected={selectedTicketIds.includes(t.id)}
                        folders={folders}
                        onToggleSelect={(id, checked) =>
                          setSelectedTicketIds((prev) =>
                            checked ? [...prev, id] : prev.filter((x) => x !== id)
                          )
                        }
                        onToggleStar={(id, isStarred) =>
                          toggleStarMutation.mutate({ ticketId: id, isStarred })
                        }
                        onMoveToFolder={(id, folderId) =>
                          moveTicketsMutation.mutate({ ticketIds: [id], folderId })
                        }
                        onRemoveFromFolder={(id) =>
                          removeTicketsMutation.mutate({ ticketIds: [id] })
                        }
                        onOpen={(id) => {
                          try {
                            sessionStorage.setItem("bhs_ticket_ids_context", JSON.stringify(tickets.map((x) => x.id)));
                          } catch {}
                          navigate({ to: `/admin/support/tickets/${id}` as any });
                        }}
                      />
                    ))}
                  </Fragment>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 6. Mobile Card View ─────────────────────────────── */}
      <div className="block md:hidden space-y-3">
        {isLoading && (
          <div className="p-8 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200">
            <Loader2 className="size-5 animate-spin mx-auto mb-2 text-slate-400" />
            Loading tickets…
          </div>
        )}
        {!isLoading && tickets.length === 0 && (
          <div className="p-8 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200">
            No tickets match your filters.
          </div>
        )}
        {!isLoading &&
          groups.map(([day, items]) => (
            <div key={`m-g-${day}`} className="space-y-2">
              <div className="sticky top-0 z-10 bg-slate-900 text-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded-lg shadow-xs">
                {formatDayHeader(day)}
              </div>
              <div className="space-y-2">
                {items.map((t) => (
                  <TicketMobileCard
                    key={t.id}
                    ticket={t}
                    bucket={bucket}
                    selected={selectedTicketIds.includes(t.id)}
                    folders={folders}
                    onToggleSelect={(id, checked) =>
                      setSelectedTicketIds((prev) =>
                        checked ? [...prev, id] : prev.filter((x) => x !== id)
                      )
                    }
                    onToggleStar={(id, isStarred) =>
                      toggleStarMutation.mutate({ ticketId: id, isStarred })
                    }
                    onOpen={(id) => {
                      try {
                        sessionStorage.setItem("bhs_ticket_ids_context", JSON.stringify(tickets.map((x) => x.id)));
                      } catch {}
                      navigate({ to: `/admin/support/tickets/${id}` as any });
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
      </div>

      {/* ── 7. Pagination Bar ───────────────────────────────── */}
      {total > pageSize && (
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-600 shadow-xs">
          <div>
            Page {page} of {Math.max(1, Math.ceil(total / pageSize))} · {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, total)} of {total.toLocaleString("en-IN")}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
            >
              <ChevronLeft className="size-3.5" /> Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => (p * pageSize < total ? p + 1 : p))}
              disabled={page * pageSize >= total || isLoading}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
            >
              Next <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Add Ticket Dialog */}
      <AddTicketDialog
        open={addTicketOpen}
        onOpenChange={setAddTicketOpen}
        onCreated={(id) => {
          invalidate();
          navigate({ to: `/admin/support/tickets/${id}` as any });
        }}
      />

      {/* Create Folder Dialog */}
      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FolderPlus className="size-5 text-indigo-600" />
              Create New Folder
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Folder Name
              </label>
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g. VIP Inquiries, Escalated, Urgent GST"
                className="h-9 text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newFolderName.trim()) {
                    createFolderMutation.mutate({ name: newFolderName.trim(), color: newFolderColor });
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCreateFolderOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
              onClick={() => createFolderMutation.mutate({ name: newFolderName.trim(), color: newFolderColor })}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {createFolderMutation.isPending ? "Creating…" : "Create Folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={!!folderToRename} onOpenChange={(open) => !open && setFolderToRename(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Edit2 className="size-5 text-indigo-600" />
              Rename Folder
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Folder Name
              </label>
              <Input
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                placeholder="Folder name"
                className="h-9 text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renameInput.trim() && folderToRename) {
                    renameFolderMutation.mutate({ folderId: folderToRename.id, name: renameInput.trim(), color: renameColor });
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFolderToRename(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!renameInput.trim() || renameFolderMutation.isPending}
              onClick={() => {
                if (folderToRename && renameInput.trim()) {
                  renameFolderMutation.mutate({ folderId: folderToRename.id, name: renameInput.trim(), color: renameColor });
                }
              }}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {renameFolderMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Folder Dialog */}
      <Dialog open={!!folderToDelete} onOpenChange={(open) => !open && setFolderToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Trash2 className="size-5 text-rose-600" />
              Delete Folder
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs text-slate-600">
            <p>
              Are you sure you want to delete folder <strong className="text-slate-900 font-semibold">{folderToDelete?.name}</strong>?
            </p>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs">
              <strong>Safe deletion guarantee:</strong> Deleting this folder will NOT delete any underlying emails, tickets, attachments, or conversation history. Tickets will simply return to the default unorganized view.
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFolderToDelete(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={deleteFolderMutation.isPending}
              onClick={() => {
                if (folderToDelete) {
                  deleteFolderMutation.mutate(folderToDelete.id);
                }
              }}
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
            >
              {deleteFolderMutation.isPending ? "Deleting…" : "Delete Folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TicketTableRow({
  ticket,
  bucket,
  selected,
  folders,
  onToggleSelect,
  onToggleStar,
  onMoveToFolder,
  onRemoveFromFolder,
  onOpen,
}: {
  ticket: any;
  bucket?: Bucket;
  selected?: boolean;
  folders?: any[];
  onToggleSelect?: (id: string, checked: boolean) => void;
  onToggleStar?: (id: string, isStarred: boolean) => void;
  onMoveToFolder?: (id: string, folderId: string) => void;
  onRemoveFromFolder?: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const statusPill = STATUS_PILL[ticket.status as TicketStatus] ?? STATUS_PILL.open;
  const priorityPill = PRIORITY_PILL[ticket.priority as TicketPriority] ?? PRIORITY_PILL.medium;
  const responseBadge = getResponseStateBadge(ticket);

  const stage: OrderStage | null = ticket.order_stage;
  const stageMeta = stage ? STAGE_META[stage] : null;

  const stageToneMap: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber:   "bg-amber-50 text-amber-800 border-amber-200",
    rose:    "bg-rose-50 text-rose-700 border-rose-200",
    slate:   "bg-slate-100 text-slate-700 border-slate-200",
    blue:    "bg-sky-50 text-sky-700 border-sky-200",
    sky:     "bg-sky-50 text-sky-700 border-sky-200",
    indigo:  "bg-indigo-50 text-indigo-700 border-indigo-200",
    violet:  "bg-violet-50 text-violet-700 border-violet-200",
  };
  const stageTone = stageToneMap[stageMeta?.tone ?? "emerald"] ?? "bg-slate-100 text-slate-700 border-slate-200";

  const isUnreadOrNew = ticket.is_unread || ticket.is_new;
  const displayDate = bucket === "closed" && ticket.closed_at ? ticket.closed_at : ticket.created_at;

  return (
    <tr
      className={`border-t border-slate-100 hover:bg-slate-50/70 cursor-pointer transition-colors ${
        selected ? "bg-indigo-50/40" : isUnreadOrNew ? "bg-blue-50/20" : ""
      }`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("input,a,button,select,textarea,label,[data-no-row-click]")) return;
        const sel = typeof window !== "undefined" ? window.getSelection?.() : null;
        if (sel && sel.toString().trim().length > 0) return;
        onOpen(ticket.id);
      }}
    >
      {/* Checkbox */}
      <td className="w-10 px-3 py-2.5 text-center" data-no-row-click onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={!!selected}
          onCheckedChange={(v) => onToggleSelect?.(ticket.id, !!v)}
          aria-label={`Select ticket ${ticket.ticket_number}`}
        />
      </td>

      {/* Star */}
      <td className="w-8 px-1 py-2.5 text-center" data-no-row-click onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onToggleStar?.(ticket.id, !ticket.is_starred)}
          className="size-7 rounded-md flex items-center justify-center transition-colors mx-auto text-slate-300 hover:text-amber-500"
          title={ticket.is_starred ? "Unstar ticket" : "Star ticket"}
        >
          <Star
            className={`size-4 transition-transform hover:scale-110 ${
              ticket.is_starred ? "fill-amber-400 text-amber-500" : "text-slate-300 hover:text-amber-400"
            }`}
          />
        </button>
      </td>

      {/* Ticket # */}
      <td className="px-3 py-2.5 font-mono text-[12px] whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          {ticket.is_unread && (
            <span className="size-2 rounded-full bg-blue-600 shrink-0" title="Unread customer message" />
          )}
          <Link
            to="/admin/support/tickets/$ticketId"
            params={{ ticketId: ticket.id }}
            className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
          >
            {ticket.ticket_number}
          </Link>
          {ticket.is_new && (
            <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase tracking-wide bg-rose-600 text-white">
              NEW
            </span>
          )}
        </div>
      </td>

      {/* Created / Closed Date */}
      <td className="px-3 py-2.5 text-[11px] text-slate-600 whitespace-nowrap leading-tight">
        <div className="flex items-center gap-1.5">
          <div>
            <div>{formatIST(displayDate, { dateOnly: true })}</div>
            <div className="text-slate-400">{formatIST(displayDate, { timeOnly: true })} IST</div>
          </div>
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200"
            title={bucket === "closed" ? "Time since closed" : "Time since ticket created"}
          >
            {formatAge(displayDate)}
          </span>
        </div>
      </td>

      {/* Customer */}
      <td className="px-3 py-2.5 min-w-[170px]">
        <div className="font-semibold text-slate-900 leading-tight text-[13px]">
          {ticket.customer_name ?? "—"}
        </div>
        <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate max-w-[190px]">
          {ticket.customer_email ?? ticket.ticket_email ?? "—"}
        </div>
        {ticket.customer_mobile && (
          <div className="text-[10px] text-slate-400 mt-0.5">
            {formatMobile55(ticket.customer_mobile)}
          </div>
        )}
      </td>

      {/* Subject */}
      <td className="px-3 py-2.5 max-w-[280px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`text-[13px] leading-snug truncate ${
              isUnreadOrNew ? "font-bold text-slate-950" : "font-normal text-slate-700"
            }`}
            title={ticket.subject || "(no subject)"}
          >
            {ticket.subject || "(no subject)"}
          </span>
          {ticket.folder_name && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0"
              title={`In folder: ${ticket.folder_name}`}
            >
              <Folder className="size-2.5 text-indigo-500" />
              {ticket.folder_name}
            </span>
          )}
        </div>
        {ticket.description && (
          <div className="text-[11px] text-slate-400 truncate mt-0.5">
            {ticket.description}
          </div>
        )}
      </td>

      {/* Order & Service */}
      <td className="px-3 py-2.5 min-w-[150px] whitespace-nowrap">
        {ticket.application_code ? (
          <div>
            <Link
              to="/admin/orders/$orderId"
              params={{ orderId: ticket.application_id }}
              className="font-mono text-xs font-semibold text-indigo-600 hover:underline inline-flex items-center gap-1"
              data-no-row-click
              onClick={(e) => e.stopPropagation()}
            >
              {ticket.application_code}
            </Link>
            <div className="text-[11px] text-slate-500 truncate max-w-[170px] mt-0.5">
              {ticket.service_name ?? "—"}
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 italic">No linked order</div>
        )}
      </td>

      {/* Order Stage */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        {stageMeta ? (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${stageTone}`}>
            {stageMeta.label}
          </span>
        ) : (
          <span className="text-slate-400 text-xs">—</span>
        )}
      </td>

      {/* Ticket Status */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusPill.bg} ${statusPill.fg} ${statusPill.border}`}
        >
          {statusPill.label}
        </span>
      </td>

      {/* Response State */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] border ${responseBadge.pillClass}`}
        >
          <span className={`size-1.5 rounded-full ${responseBadge.dotClass}`} />
          {responseBadge.label}
        </span>
      </td>

      {/* Priority */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${priorityPill.bg} ${priorityPill.fg} ${priorityPill.border}`}
        >
          {priorityPill.label}
        </span>
      </td>

      {/* Assigned */}
      <td className="px-3 py-2.5 whitespace-nowrap text-[12px]">
        {ticket.assigned_name ? (
          <span className="font-medium text-slate-800">{ticket.assigned_name}</span>
        ) : (
          <span className="text-slate-400 italic">Unassigned</span>
        )}
      </td>

      {/* Last Activity */}
      <td className="px-3 py-2.5 whitespace-nowrap text-[11px] text-slate-500">
        <div className="flex items-center gap-1">
          <Clock className="size-3 text-slate-400" />
          <span>
            {ticket.last_activity_actor === "customer" ? "Customer " : "Staff "}
            {formatAge(ticket.last_activity_at)}
          </span>
        </div>
      </td>

      {/* Row Actions (3-dots) */}
      <td className="w-10 px-2 py-2.5 text-center whitespace-nowrap" data-no-row-click onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="size-7 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors mx-auto"
              title="Ticket options"
            >
              <MoreVertical className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onOpen(ticket.id)} className="text-xs cursor-pointer">
              <Eye className="size-3.5 mr-2 text-slate-500" /> Open Ticket
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onToggleStar?.(ticket.id, !ticket.is_starred)}
              className="text-xs cursor-pointer"
            >
              <Star className={`size-3.5 mr-2 ${ticket.is_starred ? "fill-amber-400 text-amber-500" : "text-slate-400"}`} />
              {ticket.is_starred ? "Unstar Ticket" : "Star Ticket"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Move to Folder
            </div>
            {folders && folders.length > 0 ? (
              folders.map((f: any) => (
                <DropdownMenuItem
                  key={f.id}
                  onClick={() => onMoveToFolder?.(ticket.id, f.id)}
                  className="text-xs cursor-pointer flex items-center justify-between"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Folder className="size-3 text-indigo-500" />
                    <span className="truncate">{f.name}</span>
                  </span>
                  {ticket.folder_id === f.id && <Check className="size-3 text-emerald-600" />}
                </DropdownMenuItem>
              ))
            ) : (
              <div className="px-2 py-1 text-[11px] text-slate-400 italic">No folders created</div>
            )}
            {ticket.folder_id && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onRemoveFromFolder?.(ticket.id)}
                  className="text-xs text-rose-600 cursor-pointer"
                >
                  <X className="size-3.5 mr-2" /> Remove from folder
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function TicketMobileCard({
  ticket,
  bucket,
  selected,
  folders,
  onToggleSelect,
  onToggleStar,
  onOpen,
}: {
  ticket: any;
  bucket?: Bucket;
  selected?: boolean;
  folders?: any[];
  onToggleSelect?: (id: string, checked: boolean) => void;
  onToggleStar?: (id: string, isStarred: boolean) => void;
  onOpen: (id: string) => void;
}) {
  const statusPill = STATUS_PILL[ticket.status as TicketStatus] ?? STATUS_PILL.open;
  const priorityPill = PRIORITY_PILL[ticket.priority as TicketPriority] ?? PRIORITY_PILL.medium;
  const responseBadge = getResponseStateBadge(ticket);
  const displayDate = bucket === "closed" && ticket.closed_at ? ticket.closed_at : ticket.created_at;

  return (
    <div
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("input,a,button,select,textarea,label,[data-no-row-click]")) return;
        onOpen(ticket.id);
      }}
      className={`p-3.5 bg-white rounded-xl border shadow-xs transition-all space-y-2.5 active:bg-slate-50 cursor-pointer ${
        selected ? "border-indigo-500 bg-indigo-50/40" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div data-no-row-click onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={!!selected}
              onCheckedChange={(v) => onToggleSelect?.(ticket.id, !!v)}
            />
          </div>
          <button
            type="button"
            data-no-row-click
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar?.(ticket.id, !ticket.is_starred);
            }}
            className="p-1 -ml-1 text-slate-300 hover:text-amber-500"
          >
            <Star
              className={`size-3.5 ${
                ticket.is_starred ? "fill-amber-400 text-amber-500" : "text-slate-300"
              }`}
            />
          </button>
          <span className="font-mono text-xs font-bold text-indigo-600">{ticket.ticket_number}</span>
          {ticket.is_new && (
            <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase bg-rose-600 text-white">
              NEW
            </span>
          )}
          {ticket.folder_name && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              <Folder className="size-2 text-indigo-500" />
              {ticket.folder_name}
            </span>
          )}
        </div>
        <span className="text-[11px] text-slate-400">
          {formatAge(displayDate)}
        </span>
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-900">{ticket.customer_name ?? "—"}</div>
        <div className="text-[11px] text-slate-500 font-mono">{ticket.customer_email ?? ticket.ticket_email}</div>
      </div>

      <div className="text-xs text-slate-800 font-medium leading-snug line-clamp-2">
        {ticket.subject || "(no subject)"}
      </div>

      {ticket.application_code && (
        <div className="text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
          <span className="font-mono font-medium text-indigo-600">{ticket.application_code}</span>
          <span className="truncate max-w-[150px]">{ticket.service_name}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border ${responseBadge.pillClass}`}>
            <span className={`size-1.5 rounded-full ${responseBadge.dotClass}`} />
            {responseBadge.label}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusPill.bg} ${statusPill.fg} ${statusPill.border}`}>
            {statusPill.label}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${priorityPill.bg} ${priorityPill.fg} ${priorityPill.border}`}>
            {priorityPill.label}
          </span>
        </div>

        <span className="text-[11px] text-slate-500 font-medium">
          {ticket.assigned_name ? `Assigned: ${ticket.assigned_name}` : "Unassigned"}
        </span>
      </div>
    </div>
  );
}
