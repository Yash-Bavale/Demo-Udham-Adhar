import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Users, FileText, LayoutDashboard, Briefcase, UserCog, Receipt, MessageSquareWarning,
  Award, Mail, Activity, ShieldCheck, CreditCard, Settings, LifeBuoy,
} from "lucide-react";
import { globalSearch, type SearchHit } from "@/lib/crm/global-search.functions";

const QUICK_NAV: { to: string; label: string; icon: React.ComponentType<{ className?: string }>; group: string; shortcut?: string }[] = [
  { to: "/admin/my-work", label: "My Work", icon: LayoutDashboard, group: "Go to", shortcut: "g w" },
  { to: "/admin/dashboard", label: "Executive Dashboard", icon: LayoutDashboard, group: "Go to", shortcut: "g d" },
  { to: "/admin/notifications", label: "Notifications", icon: Mail, group: "Go to" },
  { to: "/admin/customers", label: "Customer Directory", icon: Users, group: "Go to", shortcut: "g c" },
  { to: "/admin/leads", label: "Leads", icon: Users, group: "Go to", shortcut: "g l" },
  { to: "/admin/pipeline", label: "Application Pipeline", icon: FileText, group: "Applications" },
  { to: "/admin/applications", label: "Application Queue", icon: FileText, group: "Applications", shortcut: "g a" },
  { to: "/admin/review", label: "Document Review", icon: FileText, group: "Applications" },
  { to: "/admin/submissions", label: "Submissions", icon: FileText, group: "Applications" },
  { to: "/admin/tasks", label: "Tasks", icon: Activity, group: "Operations" },
  { to: "/admin/support/tickets", label: "Support Tickets", icon: LifeBuoy, group: "Operations", shortcut: "g t" },
  { to: "/admin/complaints", label: "Complaints", icon: MessageSquareWarning, group: "Operations" },
  { to: "/admin/certificates", label: "Certificates", icon: Award, group: "Operations" },
  { to: "/admin/services", label: "Service Catalog", icon: Briefcase, group: "Services" },
  { to: "/admin/finance", label: "Revenue Dashboard", icon: Receipt, group: "Finance" },
  { to: "/admin/finance/gst", label: "GST Reports", icon: Receipt, group: "Finance" },
  { to: "/admin/finance/settlements", label: "Settlements", icon: Receipt, group: "Finance" },
  { to: "/admin/emails", label: "Email Center", icon: Mail, group: "Communications" },
  { to: "/admin/employees", label: "Employees", icon: UserCog, group: "People" },
  { to: "/admin/gateways", label: "Payment Gateways", icon: CreditCard, group: "System" },
  { to: "/admin/activity", label: "Activity Logs", icon: Activity, group: "System" },
  { to: "/admin/audit", label: "Audit Logs", icon: ShieldCheck, group: "System" },
  { to: "/admin/seo", label: "SEO Pages", icon: Settings, group: "System" },
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const search = useServerFn(globalSearch);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    if (!open) { setQ(""); setHits([]); return; }
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await search({ data: { q } });
        setHits(r.hits);
      } catch { /* ignore */ }
    }, 200);
    return () => clearTimeout(t);
  }, [q, search]);

  const go = useCallback((href: string) => {
    onOpenChange(false);
    navigate({ to: href });
  }, [navigate, onOpenChange]);

  const grouped = QUICK_NAV.reduce<Record<string, typeof QUICK_NAV>>((acc, n) => {
    (acc[n.group] ||= []).push(n);
    return acc;
  }, {});

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search orders, leads, invoices… or jump to a page"
        value={q}
        onValueChange={setQ}
      />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {hits.length > 0 && (
          <>
            <CommandGroup heading="Results">
              {hits.map((h) => (
                <CommandItem key={`${h.kind}-${h.id}`} value={`${h.kind}-${h.title}-${h.id}`} onSelect={() => go(h.href)}>
                  <KindIcon kind={h.kind} />
                  <span>{h.title}</span>
                  {h.subtitle && <span className="ml-auto text-xs opacity-60">{h.subtitle}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        {Object.entries(grouped).map(([group, items]) => (
          <CommandGroup key={group} heading={group}>
            {items.map((n) => (
              <CommandItem key={n.to} value={`${group}-${n.label}`} onSelect={() => go(n.to)}>
                <n.icon className="size-4" />
                <span>{n.label}</span>
                {n.shortcut && <span className="ml-auto text-[10px] opacity-50">{n.shortcut}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

function KindIcon({ kind }: { kind: SearchHit["kind"] }) {
  const map = {
    customer: Users,
    lead: Users,
    application: FileText,
    invoice: Receipt,
    certificate: Award,
    complaint: MessageSquareWarning,
    ticket: LifeBuoy,
  } as const;
  const Icon = (map as Record<string, any>)[kind] || FileText;
  return <Icon className="size-4" />;
}
