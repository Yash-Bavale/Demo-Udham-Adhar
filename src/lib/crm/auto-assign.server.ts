import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Round-robin assignment.
 *
 * The database triggers (auto_assign_lead / auto_assign_application) already
 * assign on INSERT using assign_pool_pick(), which locks the chosen pool row so
 * two simultaneous orders can never land on the same employee. This helper is
 * only for rows that arrived WITHOUT an owner (e.g. created before the pool
 * existed, or inserted with assigned_to pre-set to null by an import).
 *
 * It never re-assigns an already-owned lead/order — doing so used to bump the
 * pool counters a second time and pushed the queue out of order.
 */
export async function autoAssignLeadOrOrder(opts: {
  leadId?: string | null;
  applicationId?: string | null;
  serviceId?: string | null;
  websiteId?: string | null;
}): Promise<string | null> {
  try {
    const { data: config } = await supabaseAdmin
      .from("lead_assignment_config")
      .select("is_active")
      .is("service_id", null)
      .maybeSingle();

    if (!config || config.is_active === false) return null;

    // Skip rows that already have an owner (the insert trigger normally did it).
    if (opts.applicationId) {
      const { data: app } = await supabaseAdmin
        .from("applications")
        .select("assigned_to, service_id, website_id")
        .eq("id", opts.applicationId)
        .maybeSingle();
      if (!app) return null;
      if ((app as any).assigned_to) return (app as any).assigned_to as string;
      opts.serviceId = opts.serviceId ?? (app as any).service_id ?? null;
      opts.websiteId = opts.websiteId ?? (app as any).website_id ?? null;
    } else if (opts.leadId) {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("assigned_to, service_id, website_id")
        .eq("id", opts.leadId)
        .maybeSingle();
      if (!lead) return null;
      if ((lead as any).assigned_to) return (lead as any).assigned_to as string;
      opts.serviceId = opts.serviceId ?? (lead as any).service_id ?? null;
      opts.websiteId = opts.websiteId ?? (lead as any).website_id ?? null;
    } else {
      return null;
    }

    const { data: picked, error: pickErr } = await supabaseAdmin.rpc("assign_pool_pick", {
      _service_id: opts.serviceId ?? null,
      _website_id: opts.websiteId ?? null,
      _module: opts.applicationId ? "work.orders" : "work.leads",
    } as never);
    if (pickErr) {
      console.error("[autoAssignLeadOrOrder] pick failed:", pickErr);
      return null;
    }

    let staffUserId = (picked as unknown as string | null) ?? null;
    if (!staffUserId) {
      let poolQ = supabaseAdmin
        .from("assignment_pool")
        .select("id, user_id, last_assigned_at, total_assigned")
        .eq("is_active", true);

      if (opts.serviceId) {
        poolQ = poolQ.or(`service_id.eq.${opts.serviceId},service_id.is.null`);
      }
      const { data: fallbackPool } = await poolQ
        .order("last_assigned_at", { ascending: true, nullsFirst: true })
        .order("total_assigned", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fallbackPool?.user_id) {
        const { data: prof } = await (supabaseAdmin as any)
          .from("profiles")
          .select("id, is_active, employment_status, auto_assign_enabled")
          .eq("id", fallbackPool.user_id)
          .maybeSingle();

        const isProfValid =
          prof &&
          prof.is_active !== false &&
          (prof.employment_status === "ACTIVE" || !prof.employment_status) &&
          prof.auto_assign_enabled !== false;

        if (isProfValid) {
          staffUserId = fallbackPool.user_id;
          const curCount = Number((fallbackPool as any).total_assigned || 0) + 1;
          await supabaseAdmin
            .from("assignment_pool")
            .update({ last_assigned_at: new Date().toISOString(), total_assigned: curCount } as never)
            .eq("id", fallbackPool.id);
        }
      }
    }

    if (!staffUserId) return null;

    const nowIso = new Date().toISOString();

    if (opts.applicationId) {
      // Atomic, row-locked; only assigns if still unassigned. History is written in the same transaction.
      const { data: rpcRes } = await (supabaseAdmin as any).rpc("assign_application", {
        p_application_id: opts.applicationId,
        p_new_assignee: staffUserId,
        p_assignment_type: "AUTO_ASSIGNMENT",
        p_actor_type: "system",
        p_source: "auto_assignment:round_robin",
        p_check_expected: true,
        p_expected_previous: null,
        p_auto_assigned: true,
      });
      const updatedApp = (rpcRes as any)?.status === "assigned" ? { lead_id: (rpcRes as any).lead_id as string | null } : null;

      if (updatedApp?.lead_id) {
        await supabaseAdmin
          .from("leads")
          .update({ assigned_to: staffUserId, assigned_at: nowIso, auto_assigned: true, updated_at: nowIso } as never)
          .eq("id", updatedApp.lead_id);
      }

      try {
        const { logEmployeeOrderAction } = await import("@/lib/orders/order-action-logger.server");
        await logEmployeeOrderAction({
          orderId: opts.applicationId,
          employeeId: staffUserId,
          actionType: "ORDER_ASSIGNED",
          notes: "Auto-assigned via round-robin pool",
          source: "system",
          supabase: supabaseAdmin,
        });
      } catch (logErr) {
        console.warn("[autoAssignLeadOrOrder] Audit log warning:", logErr);
      }
    } else if (opts.leadId) {
      await supabaseAdmin
        .from("leads")
        .update({ assigned_to: staffUserId, assigned_at: nowIso, auto_assigned: true, updated_at: nowIso } as never)
        .eq("id", opts.leadId)
        .is("assigned_to", null);
    }

    try {
      const { emitToUsers } = await import("@/lib/notifications/emit.server");
      await emitToUsers([staffUserId], {
        kind: "order_assigned",
        title: opts.applicationId ? "New Order Assigned" : "New Lead Assigned",
        body: opts.applicationId
          ? "A new order has been automatically assigned to your queue."
          : "A new lead has been automatically assigned to your queue.",
        href: opts.applicationId ? `/admin/orders/${opts.applicationId}` : `/admin/leads`,
        entityKind: opts.applicationId ? "application" : "lead",
        entityId: (opts.applicationId || opts.leadId) ?? "",
      });
    } catch (notifyErr) {
      console.error("[autoAssignLeadOrOrder] Notification emit failed:", notifyErr);
    }

    return staffUserId;
  } catch (err) {
    console.error("[autoAssignLeadOrOrder] Failed:", err);
    return null;
  }
}
