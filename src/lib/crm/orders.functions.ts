import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole, writeAudit, isUserAdmin } from "@/lib/audit";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

export type OrderPaymentStatus = "Pending" | "Paid" | "Partially Paid" | "Refunded" | "Cancelled";

function rollupPaymentStatus(payments: Array<{ status: string; amount: number }>, total: number): OrderPaymentStatus {
  if (!payments.length) return "Pending";
  const refunded = payments.filter((p) => p.status === "refunded");
  if (refunded.length && payments.every((p) => p.status === "refunded")) return "Refunded";
  const paid = payments.filter((p) => p.status === "paid" || p.status === "success" || p.status === "successful");
  const paidSum = paid.reduce((s, p) => s + Number(p.amount || 0), 0);
  if (paidSum <= 0) {
    if (payments.some((p) => p.status === "cancelled" || p.status === "failed")) return "Cancelled";
    return "Pending";
  }
  if (total > 0 && paidSum < total - 0.01) return "Partially Paid";
  return "Paid";
}

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
        status: z.string().optional(),
        paymentStatus: z.string().optional(),
        search: z.string().max(120).optional(),
        assignedTo: z.string().uuid().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "operations", "admin", "support", "accounts"]);
    const admin = await getAdmin();
    const isAdmin = await isUserAdmin(context.supabase, context.userId);

    let q = admin
      .from("applications")
      .select("id, application_code, application_status, created_at, assigned_to, lead_id", { count: "exact" })
      .order("created_at", { ascending: false });
    if (data.status) q = q.eq("application_status", data.status as never);
    if (!isAdmin) {
      q = q.eq("assigned_to", context.userId);
    } else if (data.assignedTo) {
      q = q.eq("assigned_to", data.assignedTo);
    }

    const { data: apps, count, error } = await q.range(
      (data.page - 1) * data.pageSize,
      data.page * data.pageSize - 1,
    );
    if (error) throw new Error(error.message);
    const appList = apps ?? [];

    const leadIds = Array.from(new Set(appList.map((a) => a.lead_id).filter(Boolean))) as string[];
    const appIds = appList.map((a) => a.id);
    const staffIds = Array.from(new Set(appList.map((a) => a.assigned_to).filter(Boolean))) as string[];

    const [leadsRes, paymentsRes, staffRes] = await Promise.all([
      leadIds.length
        ? admin.from("leads").select("id, name, email, mobile, service, total_amount, lead_code").in("id", leadIds)
        : Promise.resolve({ data: [] as any[] }),
      appIds.length
        ? admin.from("payments").select("application_id, status, amount").in("application_id", appIds)
        : Promise.resolve({ data: [] as any[] }),
      staffIds.length
        ? admin.from("profiles").select("id, display_name, email").in("id", staffIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const leadMap = new Map((leadsRes.data ?? []).map((l: any) => [l.id, l]));
    const staffMap = new Map((staffRes.data ?? []).map((s: any) => [s.id, s]));
    const payByApp = new Map<string, Array<{ status: string; amount: number }>>();
    for (const p of paymentsRes.data ?? []) {
      const arr = payByApp.get(p.application_id) ?? [];
      arr.push({ status: p.status, amount: Number(p.amount || 0) });
      payByApp.set(p.application_id, arr);
    }

    let rows = appList.map((a) => {
      const lead = leadMap.get(a.lead_id) as any;
      const payments = payByApp.get(a.id) ?? [];
      const paidSum = payments
        .filter((p) => ["paid", "success", "successful"].includes(String(p.status)))
        .reduce((s, p) => s + Number(p.amount || 0), 0);
      const total = paidSum > 0 ? paidSum : Number(lead?.total_amount || 0);
      const staff = a.assigned_to ? (staffMap.get(a.assigned_to) as any) : null;
      return {
        id: a.id,
        application_code: a.application_code,
        application_status: a.application_status,
        created_at: a.created_at,
        lead_id: a.lead_id,
        customer_name: lead?.name ?? "—",
        customer_email: lead?.email ?? null,
        customer_mobile: lead?.mobile ?? null,
        service: lead?.service ?? null,
        total,
        payment_status: rollupPaymentStatus(payments, total) as OrderPaymentStatus,
        assigned_to: a.assigned_to,
        assigned_name: staff?.display_name ?? staff?.email ?? null,
      };
    });

    if (data.paymentStatus) rows = rows.filter((r) => r.payment_status === data.paymentStatus);
    if (data.search) {
      const s = data.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.application_code?.toLowerCase().includes(s) ||
          r.customer_name?.toLowerCase().includes(s) ||
          r.customer_email?.toLowerCase().includes(s) ||
          r.customer_mobile?.includes(s),
      );
    }
    return { rows, total: count ?? 0 };
  });

export const getOrderDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ applicationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "operations", "admin", "support", "accounts"]);
    const admin = await getAdmin();

    const { data: app, error } = await admin
      .from("applications")
      .select("*, lead:leads(*), certificates(*)")
      .eq("id", data.applicationId)
      .single();
    if (error || !app) throw new Error("Order not found");

    const [paymentsRes, complaintsRes, emailsRes, staffRes] = await Promise.all([
      admin
        .from("payments")
        .select("id, status, amount, base_amount, gst_amount, gateway_name, transaction_id, payment_date, created_at")
        .eq("application_id", data.applicationId)
        .order("created_at", { ascending: false }),
      admin
        .from("complaints")
        .select("id, complaint_number, status, severity, category, created_at, sla_due_at")
        .eq("application_id", data.applicationId)
        .order("created_at", { ascending: false }),
      admin
        .from("email_logs")
        .select("id, template_code, subject, status, created_at")
        .eq("lead_id", (app as any).lead_id)
        .ilike("template_code", "%welcome%")
        .order("created_at", { ascending: false })
        .limit(1),
      (app as any).assigned_to
        ? admin.from("profiles").select("id, display_name, email").eq("id", (app as any).assigned_to).maybeSingle()
        : Promise.resolve({ data: null as any }),
    ]);

    const payments = paymentsRes.data ?? [];
    const lead = (app as any).lead;
    const total = Number(lead?.total_amount || 0);
    const paymentStatus = rollupPaymentStatus(
      payments.map((p) => ({ status: p.status as string, amount: Number(p.amount) })),
      total,
    );
    const firstPaid = [...payments]
      .reverse()
      .find((p) => ["paid", "success", "successful"].includes(String(p.status)));

    const journey = {
      created_at: app.created_at as string,
      payment_received_at: firstPaid?.payment_date ?? firstPaid?.created_at ?? null,
      info_submitted_at:
        ["submitted", "completed", "approved"].includes(String((app as any).form_status))
          ? (app.updated_at as string)
          : null,
      welcome_mail_at: (emailsRes.data?.[0] as any)?.created_at ?? null,
      expert_allocated_at: (app as any).assigned_to ? (app.updated_at as string) : null,
      completed_at: app.application_status === "completed" ? (app.updated_at as string) : null,
    };

    return {
      application: app,
      lead,
      certificates: (app as any).certificates ?? [],
      payments,
      paymentStatus,
      total,
      complaints: complaintsRes.data ?? [],
      assignedStaff: (staffRes as any).data ?? null,
      journey,
    };
  });

export const getOrderNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ applicationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "operations", "admin", "support", "accounts"]);
    const admin = await getAdmin();
    const { data: app } = await admin.from("applications").select("lead_id").eq("id", data.applicationId).single();
    if (!app) return { items: [] };

    const [actsRes, notesRes] = await Promise.all([
      admin
        .from("activity_logs")
        .select("id, activity_type, activity_description, user_id, created_at")
        .eq("application_id", data.applicationId)
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("lead_notes")
        .select("id, note, user_id, created_at")
        .eq("lead_id", (app as any).lead_id)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const userIds = Array.from(
      new Set([
        ...(actsRes.data ?? []).map((a: any) => a.user_id).filter(Boolean),
        ...(notesRes.data ?? []).map((n: any) => n.user_id).filter(Boolean),
      ]),
    ) as string[];
    const { data: profiles } = userIds.length
      ? await admin.from("profiles").select("id, display_name, email").in("id", userIds)
      : { data: [] as any[] };
    const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name ?? p.email ?? "Staff"]));

    const items = [
      ...(actsRes.data ?? []).map((a: any) => ({
        id: `a-${a.id}`,
        kind: "auto" as const,
        at: a.created_at as string,
        author: a.user_id ? pmap.get(a.user_id) ?? "System" : "System",
        text: a.activity_description as string,
        type: a.activity_type as string,
      })),
      ...(notesRes.data ?? []).map((n: any) => ({
        id: `n-${n.id}`,
        kind: "manual" as const,
        at: n.created_at as string,
        author: n.user_id ? pmap.get(n.user_id) ?? "Staff" : "Staff",
        text: n.note as string,
        type: "note",
      })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));

    return { items };
  });

export const addOrderNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ applicationId: z.string().uuid(), note: z.string().trim().min(1).max(2000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "operations", "admin", "support", "accounts"]);
    const admin = await getAdmin();
    const { data: app, error: appErr } = await admin
      .from("applications")
      .select("lead_id")
      .eq("id", data.applicationId)
      .single();
    if (appErr || !app) throw new Error("Order not found");

    const { error } = await admin.from("lead_notes").insert({
      lead_id: (app as any).lead_id,
      user_id: context.userId,
      note: data.note,
    });
    if (error) throw new Error(error.message);

    await writeAudit({
      supabase: context.supabase,
      entityType: "application",
      entityId: data.applicationId,
      action: "note_added",
      newValue: { note: data.note },
      actorId: context.userId,
    });
    return { ok: true };
  });

const BulkAssignInput = z.object({
  applicationIds: z.array(z.string().uuid()).min(1),
  assignedTo: z.string().uuid().nullable(),
});

export const bulkAssignOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => BulkAssignInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin", "manager"]);
    const { assignOrderCanonical } = await import("./assignment-engine.server");

    for (const orderId of data.applicationIds) {
      await assignOrderCanonical({
        orderId,
        newEmployeeId: data.assignedTo,
        changeType: "MANUAL_BULK",
        reason: `Bulk reassigned by operator (${data.applicationIds.length} orders in batch)`,
        source: "admin",
        actorId: context.userId,
        skipNotification: true, // We emit one batch notification below
      });
    }

    // Emit single grouped notification to recipient
    if (data.assignedTo) {
      try {
        const { emitToUsers } = await import("@/lib/notifications/emit.server");
        await emitToUsers([data.assignedTo], {
          kind: "order_assigned",
          title: "🎯 Orders Assigned to You",
          body: `${data.applicationIds.length} order(s) have been assigned to your queue.`,
          href: "/admin/orders",
          entityKind: "application",
          entityId: data.applicationIds[0],
        });
      } catch (notifErr) {
        console.warn("[bulkAssignOrders] Failed to emit notification:", notifErr);
      }
    }

    return { ok: true, count: data.applicationIds.length };
  });
