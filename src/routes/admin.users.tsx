import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listStaffUsers, grantRole, revokeRole } from "@/lib/crm/users-admin.functions";
import { STAFF_ROLES } from "@/lib/crm/types";

export const Route = createFileRoute("/admin/users")({
  beforeLoad: async () => {
    // Lazy import keeps the auth SDK out of the bundle public visitors download.
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/admin-login" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "super_admin"]);
    if (!data || data.length === 0) throw redirect({ to: "/admin/my-work" });
  },
  component: UsersPage,
});

function UsersPage() {
  const listFn = useServerFn(listStaffUsers);
  const grantFn = useServerFn(grantRole);
  const revokeFn = useServerFn(revokeRole);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["admin.users"], queryFn: () => listFn() });

  if (error) return <div className="text-sm text-red-700">{(error as Error).message}</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Users & Roles</h1>
      <p className="text-sm text-slate-500">Only admins can manage staff roles. Users sign up at <code>/admin-login</code>; first signup auto-becomes admin.</p>

      <div className="rounded-lg border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Roles</th>
              <th className="px-3 py-2 text-left">Add Role</th>
              <th className="px-3 py-2 text-left">Created</th>
              <th className="px-3 py-2 text-left">Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr>}
            {data?.rows.map((u: any) => (
              <tr key={u.id} className="border-t align-top">
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r: string) => (
                      <span key={r} className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs">
                        {r}
                        <button
                          onClick={async () => {
                            if (!confirm(`Revoke ${r} from ${u.email}?`)) return;
                            await revokeFn({ data: { user_id: u.id, role: r as never } });
                            await qc.invalidateQueries({ queryKey: ["admin.users"] });
                          }}
                          className="text-red-600 hover:text-red-800"
                        >×</button>
                      </span>
                    ))}
                    {u.roles.length === 0 && <span className="text-xs text-slate-400">no roles</span>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <select
                    defaultValue=""
                    onChange={async (e) => {
                      if (!e.target.value) return;
                      await grantFn({ data: { user_id: u.id, role: e.target.value as never } });
                      await qc.invalidateQueries({ queryKey: ["admin.users"] });
                      e.currentTarget.value = "";
                    }}
                    className="rounded border px-2 py-1 text-xs"
                  >
                    <option value="">+ Add role…</option>
                    {STAFF_ROLES.filter((r) => !u.roles.includes(r)).map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{new Date(u.created_at).toLocaleDateString("en-IN")}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("en-IN") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
