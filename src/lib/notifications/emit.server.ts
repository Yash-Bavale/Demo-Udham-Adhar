// Server-only helper for creating notifications for staff users.
// Import inside a server-fn handler: `const { emitNotification } = await import('@/lib/notifications/emit.server')`
// (module-level admin import must NOT ship to client bundles).

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type NotificationKind =
  | "order_assigned"
  | "order_status_change"
  | "form_submitted"
  | "ticket_created"
  | "ticket_reply"
  | "email_inbound"
  | "our_side_delay_start"
  | "our_side_delay_reminder"
  | "high_priority"
  | "refund_requested"
  | "customer_hold_started"
  | "order_auto_closed"
  | "system";

export interface EmitNotificationInput {
  userId: string;
  kind: NotificationKind | string;
  title: string;
  body?: string;
  href?: string;
  entityKind?: string;
  entityId?: string;
}

/**
 * Only hot-order and new-order alerts are stored. Every other event is already
 * visible in the Orders queues, so persisting it only bloated the notifications
 * table (382k rows) and slowed the unread-count query.
 */
const STORED_KINDS = new Set<string>([
  "hot_order_callback",
  "hot_order_alert",
  "order_reminder",
  "order_assigned",
]);

export function isStoredNotificationKind(kind: string): boolean {
  return STORED_KINDS.has(kind);
}

export async function emitNotification(input: EmitNotificationInput): Promise<void> {
  if (!isStoredNotificationKind(input.kind)) return;
  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    href: input.href ?? null,
    entity_kind: input.entityKind ?? null,
    entity_id: input.entityId ?? null,
  });
  if (error) throw new Error(`emitNotification failed: ${error.message}`);
}

/** Fan-out to many users at once (Super Admin escalations etc). Silently swallows individual errors. */
export async function emitToUsers(userIds: string[], base: Omit<EmitNotificationInput, "userId">): Promise<void> {
  if (userIds.length === 0) return;
  if (!isStoredNotificationKind(base.kind)) return;
  const rows = userIds.map((userId) => ({
    user_id: userId,
    kind: base.kind,
    title: base.title,
    body: base.body ?? null,
    href: base.href ?? null,
    entity_kind: base.entityKind ?? null,
    entity_id: base.entityId ?? null,
  }));
  const { error } = await supabaseAdmin.from("notifications").insert(rows);
  if (error) {
    // Best-effort: don't crash the calling business flow on notification failure.
    console.warn("[emitToUsers] insert failed:", error.message);
  }
}

/** Convenience: emit to every user holding a given app_role. */
export async function emitToRole(role: string, base: Omit<EmitNotificationInput, "userId">): Promise<void> {
  if (!isStoredNotificationKind(base.kind)) return;
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", role as any);
  if (error) {
    console.warn("[emitToRole] role lookup failed:", error.message);
    return;
  }
  const ids = Array.from(new Set((data ?? []).map((r: any) => r.user_id as string)));
  await emitToUsers(ids, base);
}
