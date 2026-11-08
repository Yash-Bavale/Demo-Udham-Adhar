import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}


export type Notification = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  entity_kind: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { onlyUnread?: boolean; limit?: number } | undefined) =>
    z
      .object({ onlyUnread: z.boolean().optional(), limit: z.number().int().min(1).max(200).optional() })
      .optional()
      .parse(data ?? {})
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(data?.limit ?? 50);
    if (data?.onlyUnread) q = q.is("read_at", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as Notification[] };
  });

// Polled by the admin bell; must never 500 when the caller has no session
// (sign-out, expired token, SSR) — it simply reports zero unread.
export const getUnreadNotificationCount = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const authHeader = getRequest()?.headers?.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!token || !url || !key) return { count: 0 };

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error: claimsError } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (claimsError || !userId) return { count: 0 };

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) return { count: 0 };
  return { count: count ?? 0 };
});

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("notifications").delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Server-side helper for other server fns to create a notification (uses admin client; bypasses RLS). */
export async function createNotification(input: {
  user_id: string;
  kind: string;
  title: string;
  body?: string;
  href?: string;
  entity_kind?: string;
  entity_id?: string;
}) {
  const { error } = await (await getAdmin()).from("notifications").insert({
    user_id: input.user_id,
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    href: input.href ?? null,
    entity_kind: input.entity_kind ?? null,
    entity_id: input.entity_id ?? null,
  });
  if (error) throw new Error(error.message);
}

export type SidebarNotificationCounts = {
  notifications: number;
  leads: number;
  orders: number;
  docReview: number;
  tasks: number;
  complaints: number;
  tickets: number;
  quarantine: number;
  refunds: number;
};

export const getSidebarNotificationCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SidebarNotificationCounts> => {
    const { userId } = context;
    const admin = await getAdmin();

    const safeCount = (promise: PromiseLike<{ count: number | null; error: any }>) =>
      Promise.resolve(promise)
        .then(({ count, error }) => (error ? 0 : count ?? 0))
        .catch(() => 0);

    const [
      notifications,
      leads,
      orders,
      docReview,
      tasks,
      complaints,
      tickets,
      quarantine,
      refunds,
    ] = await Promise.all([
      safeCount(
        admin
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .is("read_at", null)
      ),
      safeCount(
        admin
          .from("leads")
          .select("id", { count: "exact", head: true })
          .in("status", ["new_lead", "lead_created"])
      ),
      safeCount(
        admin
          .from("applications")
          .select("id", { count: "exact", head: true })
          .eq("fulfillment_status", "awaiting_customer_form")
      ),
      safeCount(
        admin
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
      ),
      safeCount(
        admin
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("is_completed", false)
      ),
      safeCount(
        admin
          .from("complaints")
          .select("id", { count: "exact", head: true })
          .not("status", "in", '("resolved","closed")')
      ),
      safeCount(
        admin
          .from("support_tickets")
          .select("id", { count: "exact", head: true })
          .not("status", "in", '("resolved","closed")')
      ),
      safeCount(
        admin
          .from("inbound_email_quarantine")
          .select("id", { count: "exact", head: true })
          .is("reviewed_at", null)
      ),
      safeCount(
        admin
          .from("refund_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "info_needed", "escalated"])
      ),
    ]);

    return {
      notifications,
      leads,
      orders,
      docReview,
      tasks,
      complaints,
      tickets,
      quarantine,
      refunds,
    };
  });
