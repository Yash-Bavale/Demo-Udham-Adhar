import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Search, ShieldCheck, Trash2, Plus } from "lucide-react";
import { listStaffUsers } from "@/lib/crm/users-admin.functions";
import {
  listPermissionModules,
  listUserPermissions,
  upsertUserPermission,
  setUserPermissionScopes,
  bulkResetUserPermissions,
  deleteUserPermissions,
} from "@/lib/crm/permissions-admin.functions";
import { listWebsiteTree } from "@/lib/crm/websites-admin.functions";

export const Route = createFileRoute("/admin/permissions")({
  head: () => ({
    meta: [
      { title: "Permissions — Udyam Ops OS" },
      { name: "description", content: "Manage per-employee module and service permissions." },
    ],
  }),
  component: PermissionsPage,
});

type PermRow = {
  module_key: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  scope_all: boolean;
};
type ScopeRow = {
  id: string;
  module_key: string;
  website_id: string | null;
  category_id: string | null;
  service_id: string | null;
};

function PermissionsPage() {
  const qc = useQueryClient();
  const staffFn = useServerFn(listStaffUsers);
  const modulesFn = useServerFn(listPermissionModules);
  const treeFn = useServerFn(listWebsiteTree);

  const staffQ = useQuery({ queryKey: ["perm-staff"], queryFn: () => staffFn() });
  const modulesQ = useQuery({ queryKey: ["perm-modules"], queryFn: () => modulesFn() });
  const treeQ = useQuery({ queryKey: ["perm-tree"], queryFn: () => treeFn() });

  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const staffList = (Array.isArray(staffQ.data) ? staffQ.data : (staffQ.data as any)?.rows ?? []) as any[];
  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staffList.filter((u) => {
      if (!q) return true;
      return (
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.display_name ?? "").toLowerCase().includes(q) ||
        (u.full_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [staffList, search]);

  return (
    <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Permissions</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Grant per-module View / Create / Edit / Delete rights, then optionally restrict access to specific
          websites, categories or services.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          {/* Staff list */}
          <Card className="p-3 h-fit">
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search staff…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="max-h-[70vh] overflow-y-auto divide-y">
              {staffQ.isLoading && (
                <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              )}
              {filteredStaff.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedUser(u.id)}
                  className={`w-full text-left px-2 py-2 hover:bg-muted/50 rounded ${
                    selectedUser === u.id ? "bg-primary/10" : ""
                  }`}
                >
                  <div className="text-sm font-medium truncate">
                    {u.display_name || u.full_name || u.email}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                    {(u.roles ?? []).join(", ") || "no role"}
                  </div>
                </button>
              ))}
              {!staffQ.isLoading && filteredStaff.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">No matching staff.</div>
              )}
            </div>
          </Card>

          {/* Matrix */}
          <Card className="p-4">
            {!selectedUser && (
              <div className="text-sm text-muted-foreground">Select an employee on the left to edit permissions.</div>
            )}
            {selectedUser && (
              <PermissionMatrix
                userId={selectedUser}
                userRoles={(staffList.find((u) => u.id === selectedUser)?.roles ?? []) as string[]}
                modules={modulesQ.data ?? []}
                tree={treeQ.data}
                onSaved={() => qc.invalidateQueries({ queryKey: ["user-permissions", selectedUser] })}
              />
            )}
          </Card>
        </div>
      </div>
  );
}

function defaultViewForUser(roles: string[], moduleKey: string): boolean {
  const isOps = roles.some((r) => ["admin", "super_admin", "manager", "operations", "executive"].includes(r));
  const isFinance = roles.some((r) => ["admin", "super_admin", "finance", "accounts"].includes(r));
  if (["leads", "orders", "documents", "tasks"].includes(moduleKey)) return isOps;
  if (["invoices", "payments"].includes(moduleKey)) return isFinance;
  return roles.some((r) => ["admin", "super_admin"].includes(r));
}

function PermissionMatrix({
  userId,
  userRoles,
  modules,
  tree,
  onSaved,
}: {
  userId: string;
  userRoles: string[];
  modules: Array<{ key: string; label: string; description: string | null }>;
  tree: any;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listUserPermissions);
  const upsertFn = useServerFn(upsertUserPermission);
  const scopesFn = useServerFn(setUserPermissionScopes);
  const resetFn = useServerFn(bulkResetUserPermissions);
  const deleteFn = useServerFn(deleteUserPermissions);

  const q = useQuery({
    queryKey: ["user-permissions", userId],
    queryFn: () => listFn({ data: { userId } }),
  });

  const permsByModule = new Map<string, PermRow>();
  for (const p of (q.data?.permissions ?? []) as PermRow[]) permsByModule.set(p.module_key, p);
  const scopesByModule = new Map<string, ScopeRow[]>();
  for (const s of (q.data?.scopes ?? []) as ScopeRow[]) {
    const arr = scopesByModule.get(s.module_key) ?? [];
    arr.push(s);
    scopesByModule.set(s.module_key, arr);
  }

  const savePerm = useMutation({
    mutationFn: (input: {
      moduleKey: string;
      canView: boolean;
      canCreate: boolean;
      canEdit: boolean;
      canDelete: boolean;
      scopeAll: boolean;
    }) => upsertFn({ data: { userId, ...input } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-permissions", userId] });
      qc.invalidateQueries({ queryKey: ["my-permissions"] });
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const bulkReset = useMutation({
    mutationFn: (grantAll: boolean) => resetFn({ data: { userId, grantAll } }),
    onSuccess: (_r, grantAll) => {
      qc.invalidateQueries({ queryKey: ["user-permissions", userId] });
      qc.invalidateQueries({ queryKey: ["my-permissions"] });
      toast.success(grantAll ? "Granted full access to all modules" : "Revoked all access");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const clearDefaults = useMutation({
    mutationFn: () => deleteFn({ data: { userId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-permissions", userId] });
      qc.invalidateQueries({ queryKey: ["my-permissions"] });
      toast.success("Restored standard role defaults");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.isLoading) {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading permissions…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 pb-3 border-b">
        <Button size="sm" variant="outline" onClick={() => bulkReset.mutate(true)} disabled={bulkReset.isPending}>
          Grant full access
        </Button>

        <Button size="sm" variant="outline" onClick={() => clearDefaults.mutate()} disabled={clearDefaults.isPending}>
          Restore role defaults
        </Button>

        <Button size="sm" variant="outline" onClick={() => bulkReset.mutate(false)} disabled={bulkReset.isPending}>
          Revoke all
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground border-b">
            <tr>
              <th className="text-left py-2 pr-2">Module</th>
              <th className="px-2 text-center">View</th>
              <th className="px-2 text-center">Create</th>
              <th className="px-2 text-center">Edit</th>
              <th className="px-2 text-center">Delete</th>
              <th className="pl-2 text-left">Scope</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => {
              const defaultView = defaultViewForUser(userRoles, m.key);
              const p = permsByModule.get(m.key) ?? {
                module_key: m.key,
                can_view: defaultView,
                can_create: defaultView,
                can_edit: defaultView,
                can_delete: false,
                scope_all: true,
              };
              return (
                <ModuleRow
                  key={m.key}
                  module={m}
                  perm={p}
                  scopes={scopesByModule.get(m.key) ?? []}
                  tree={tree}
                  onChange={(patch) =>
                    savePerm.mutate({
                      moduleKey: m.key,
                      canView: patch.can_view ?? p.can_view,
                      canCreate: patch.can_create ?? p.can_create,
                      canEdit: patch.can_edit ?? p.can_edit,
                      canDelete: patch.can_delete ?? p.can_delete,
                      scopeAll: patch.scope_all ?? p.scope_all,
                    })
                  }
                  onScopesChanged={async (next) => {
                    await scopesFn({ data: { userId, moduleKey: m.key, scopes: next } });
                    qc.invalidateQueries({ queryKey: ["user-permissions", userId] });
                    toast.success(`Updated ${m.label} scopes`);
                  }}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModuleRow({
  module,
  perm,
  scopes,
  tree,
  onChange,
  onScopesChanged,
}: {
  module: { key: string; label: string; description: string | null };
  perm: PermRow;
  scopes: ScopeRow[];
  tree: any;
  onChange: (patch: Partial<PermRow>) => void;
  onScopesChanged: (next: Array<{ websiteId: string | null; categoryId: string | null; serviceId: string | null }>) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<
    Array<{ websiteId: string | null; categoryId: string | null; serviceId: string | null }>
  >(
    scopes.map((s) => ({ websiteId: s.website_id, categoryId: s.category_id, serviceId: s.service_id })),
  );

  const websites = (tree?.websites ?? []) as any[];
  const categories = (tree?.categories ?? []) as any[];
  const services = (tree?.services ?? []) as any[];

  return (
    <>
      <tr className={`border-b ${!perm.can_view ? "opacity-60 bg-rose-50/20" : ""}`}>
        <td className="py-2 pr-2">
          <div className="font-medium flex items-center gap-1.5">
            {module.label}
            {!perm.can_view && (
              <span className="text-[10px] uppercase font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded">
                Disabled
              </span>
            )}
          </div>
          {module.description && (
            <div className="text-xs text-muted-foreground">{module.description}</div>
          )}
        </td>
        <td className="text-center">
          <Checkbox
            checked={perm.can_view}
            onCheckedChange={(v) =>
              onChange({
                can_view: !!v,
                can_create: !!v ? perm.can_create : false,
                can_edit: !!v ? perm.can_edit : false,
                can_delete: !!v ? perm.can_delete : false,
              })
            }
          />
        </td>
        <td className="text-center">
          <Checkbox
            checked={perm.can_create}
            onCheckedChange={(v) => onChange({ can_create: !!v, can_view: !!v ? true : perm.can_view })}
          />
        </td>
        <td className="text-center">
          <Checkbox
            checked={perm.can_edit}
            onCheckedChange={(v) => onChange({ can_edit: !!v, can_view: !!v ? true : perm.can_view })}
          />
        </td>
        <td className="text-center">
          <Checkbox
            checked={perm.can_delete}
            onCheckedChange={(v) => onChange({ can_delete: !!v, can_view: !!v ? true : perm.can_view })}
          />
        </td>
        <td className="pl-2">
          <div className="flex items-center gap-2">
            <Switch
              checked={perm.scope_all}
              onCheckedChange={(v) => onChange({ scope_all: v, can_view: v ? true : perm.can_view })}
              aria-label="Scope all"
            />
            <span className="text-xs text-muted-foreground">{perm.scope_all ? "All" : "Custom"}</span>
            {!perm.scope_all && (
              <Button size="sm" variant="ghost" onClick={() => setExpanded((x) => !x)}>
                {expanded ? "Hide" : `Edit (${draft.length})`}
              </Button>
            )}
          </div>
        </td>
      </tr>
      {!perm.scope_all && expanded && (
        <tr>
          <td colSpan={6} className="bg-muted/30 p-3">
            <div className="space-y-2">
              {draft.map((s, i) => (
                <div key={i} className="flex flex-wrap gap-2 items-center">
                  <select
                    className="border rounded px-2 py-1 text-sm bg-background"
                    value={s.websiteId ?? ""}
                    onChange={(e) => {
                      const v = e.target.value || null;
                      setDraft((d) => d.map((x, ix) => (ix === i ? { ...x, websiteId: v, categoryId: null, serviceId: null } : x)));
                    }}
                  >
                    <option value="">— any website —</option>
                    {websites.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                  <select
                    className="border rounded px-2 py-1 text-sm bg-background"
                    value={s.categoryId ?? ""}
                    onChange={(e) => {
                      const v = e.target.value || null;
                      setDraft((d) => d.map((x, ix) => (ix === i ? { ...x, categoryId: v, serviceId: null } : x)));
                    }}
                  >
                    <option value="">— any category —</option>
                    {categories
                      .filter((c) => !s.websiteId || c.website_id === s.websiteId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </select>
                  <select
                    className="border rounded px-2 py-1 text-sm bg-background"
                    value={s.serviceId ?? ""}
                    onChange={(e) => {
                      const v = e.target.value || null;
                      setDraft((d) => d.map((x, ix) => (ix === i ? { ...x, serviceId: v } : x)));
                    }}
                  >
                    <option value="">— any service —</option>
                    {services
                      .filter((sv) =>
                        (!s.websiteId || sv.website_id === s.websiteId) &&
                        (!s.categoryId || sv.category_id === s.categoryId),
                      )
                      .map((sv) => (
                        <option key={sv.id} value={sv.id}>{sv.service_name}</option>
                      ))}
                  </select>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setDraft((d) => d.filter((_, ix) => ix !== i))}
                    aria-label="Remove scope"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDraft((d) => [...d, { websiteId: null, categoryId: null, serviceId: null }])}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add scope
                </Button>
                <Button size="sm" onClick={() => onScopesChanged(draft)}>Save scopes</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave deeper fields blank to include everything under the chosen level (e.g. website only = every
                category & service on that site).
              </p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
