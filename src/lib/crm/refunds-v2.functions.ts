import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

async function requireStaff(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_any_staff_role", { _user_id: userId });
  if (!data) throw new Error("Forbidden");
}

/** Aggregate KPI counts + totals across all refund requests. */
export const refundStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.supabase, context.userId);
    const admin = await getAdmin();
    const { data: rows } = await admin
      .from("refund_requests")
      .select("id, status, refund_amount, processed_at, created_at, application:applications(id, refund_processed_at, order_status)");
    const all = (rows ?? []) as Array<{
      status: string | null;
      refund_amount: number | string | null;
      processed_at: string | null;
      created_at: string | null;
      application?: { id?: string; refund_processed_at?: string | null; order_status?: string | null } | null;
    }>;
    const num = (v: number | string | null | undefined) => (v == null ? 0 : Number(v) || 0);
    const isProc = (r: (typeof all)[number]) =>
      Boolean(
        r.processed_at ||
        r.status === "processed" ||
        r.application?.refund_processed_at ||
        r.application?.order_status === "REFUND_PROCESSED"
      );
    const byStatus = (s: string) => all.filter((r) => !isProc(r) && (r.status ?? "pending") === s);
    const sum = (arr: typeof all) => arr.reduce((a, r) => a + num(r.refund_amount), 0);
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    return {
      totals: {
        all: all.length,
        pending: byStatus("pending").length,
        info_needed: byStatus("info_needed").length,
        escalated: byStatus("escalated").length,
        approved: byStatus("approved").length,
        rejected: byStatus("rejected").length,
        processed: all.filter(isProc).length,
      },
      amounts: {
        pending: sum(byStatus("pending")),
        approved: sum(byStatus("approved")),
        processedThisMonth: all
          .filter(
            (r) =>
              isProc(r) &&
              (r.processed_at || r.application?.refund_processed_at) &&
              new Date(r.processed_at || r.application!.refund_processed_at!).getMonth() === new Date().getMonth() &&
              new Date(r.processed_at || r.application!.refund_processed_at!).getFullYear() === new Date().getFullYear(),
          )
          .reduce((a, r) => a + num(r.refund_amount), 0),
        totalProcessed: all
          .filter(isProc)
          .reduce((a, r) => a + num(r.refund_amount), 0),
      },
      agingPending: {
        under24h: byStatus("pending").filter(
          (r) => r.created_at && now - new Date(r.created_at).getTime() < dayMs,
        ).length,
        over24h: byStatus("pending").filter(
          (r) => r.created_at && now - new Date(r.created_at).getTime() >= dayMs && now - new Date(r.created_at).getTime() < 3 * dayMs,
        ).length,
        over72h: byStatus("pending").filter(
          (r) => r.created_at && now - new Date(r.created_at).getTime() >= 3 * dayMs,
        ).length,
      },
    };
  });

/** Search + filter refund requests. Returns rows joined with lead + application + customer. */
export const listRefundsAdvanced = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      status: z.enum(["all", "pending", "info_needed", "escalated", "approved", "rejected", "processed"]).default("all"),
      search: z.string().max(120).optional(),
      limit: z.number().int().min(1).max(200).default(100),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);
    const admin = await getAdmin();
    const selectFields =
      "id, application_id, lead_id, reason, refund_amount, refund_mode, deduction_amount, deduction_reason, gateway_ref, gateway_name, status, admin_notes, customer_notes, created_at, decided_at, processed_at, info_needed_note, escalation_note, application:applications(id, application_code, order_status, service_id, refund_processed_at), lead:leads(id, name, email, mobile, service, lead_code)";

    let rawRows: any[] = [];

    if (data.status === "processed") {
      // In PostgREST, complex logic trees with negations fail to parse.
      // Candidate processed rows are:
      // 1) Rows where processed_at is not null
      // 2) Rows where status is 'approved' (which may have been processed at the application level)
      const [byProcessedAt, byApproved] = await Promise.all([
        admin
          .from("refund_requests")
          .select(selectFields)
          .not("processed_at", "is", null)
          .order("created_at", { ascending: false })
          .limit(data.limit),
        admin
          .from("refund_requests")
          .select(selectFields)
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .limit(data.limit),
      ]);

      if (byProcessedAt.error) throw new Error(byProcessedAt.error.message);
      if (byApproved.error) throw new Error(byApproved.error.message);

      const map = new Map<string, any>();
      for (const r of byProcessedAt.data ?? []) map.set(r.id, r);
      for (const r of byApproved.data ?? []) map.set(r.id, r);
      rawRows = Array.from(map.values()).sort(
        (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
      );
    } else {
      let q = admin
        .from("refund_requests")
        .select(selectFields)
        .order("created_at", { ascending: false })
        .limit(data.limit);

      if (data.status !== "all") {
        q = q.eq("status", data.status);
      }
      const { data: rowsData, error } = await q;
      if (error) throw new Error(error.message);
      rawRows = rowsData ?? [];
    }

    const isProc = (r: any) =>
      Boolean(
        r.processed_at ||
        r.status === "processed" ||
        r.application?.refund_processed_at ||
        r.application?.order_status === "REFUND_PROCESSED"
      );

    // Normalize and self-heal rows in memory & background DB sync
    const normalizedRows = (rawRows ?? []).map((r: any) => {
      if (isProc(r)) {
        if (!r.processed_at && r.application?.refund_processed_at) {
          r.processed_at = r.application.refund_processed_at;
        }
        if (r.status !== "processed") {
          r.status = "processed";
          // Self-heal in DB in background so future queries find it directly
          Promise.resolve(
            admin
              .from("refund_requests")
              .update({
                processed_at: r.processed_at || new Date().toISOString(),
                status: "processed",
              } as any)
              .eq("id", r.id)
          ).catch((err: any) => {
            if (String(err?.message || "").toLowerCase().includes("enum")) {
              Promise.resolve(
                admin
                  .from("refund_requests")
                  .update({
                    processed_at: r.processed_at || new Date().toISOString(),
                  } as any)
                  .eq("id", r.id)
              ).catch(() => {});
            }
          });
        }
      }
      return r;
    });

    // Enforce mutually exclusive status filters
    let rows = normalizedRows;
    if (data.status === "processed") {
      rows = normalizedRows.filter((r) => isProc(r));
    } else if (data.status === "approved") {
      rows = normalizedRows.filter((r) => !isProc(r) && r.status === "approved");
    } else if (data.status !== "all") {
      rows = normalizedRows.filter((r) => !isProc(r) && r.status === data.status);
    }

    const filtered = data.search?.trim()
      ? rows.filter((r: any) => {
          const s = data.search!.toLowerCase();
          return (
            r.lead?.name?.toLowerCase().includes(s) ||
            r.lead?.email?.toLowerCase().includes(s) ||
            r.lead?.mobile?.includes(s) ||
            r.application?.application_code?.toLowerCase().includes(s) ||
            r.reason?.toLowerCase().includes(s)
          );
        })
      : rows;
    const finalRows = filtered;
    const appIds = Array.from(new Set(finalRows.map((r: any) => r.application_id).filter(Boolean)));
    const paymentMap = new Map<string, { transaction_id: string | null; gateway_name: string | null; amount: number }>();
    if (appIds.length > 0) {
      const { data: pays } = await admin
        .from("payments")
        .select("application_id, transaction_id, gateway_name, amount, status")
        .in("application_id", appIds)
        .order("created_at", { ascending: false });
      for (const p of (pays ?? []) as Array<{ application_id: string | null; transaction_id: string | null; gateway_name: string | null; amount: number; status: string }>) {
        if (p.application_id && !paymentMap.has(p.application_id) && Number(p.amount) > 0) {
          paymentMap.set(p.application_id, {
            transaction_id: p.transaction_id ?? null,
            gateway_name: p.gateway_name ?? null,
            amount: Number(p.amount) || 0,
          });
        }
      }
    }

    const rowsWithPayment = finalRows.map((r: any) => ({
      ...r,
      payment: paymentMap.get(r.application_id) ?? null,
    }));

    return { rows: rowsWithPayment };
  });

/** Full detail for a single refund request: joined data + payments on the order + event timeline. */
export const getRefundDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);
    const admin = await getAdmin();
    const { data: req, error } = await admin
      .from("refund_requests")
      .select(
        "*, application:applications(id, application_code, order_status, fulfillment_status, service_id, customer_id, refund_processed_at, refund_gateway_ref), lead:leads(id, name, email, mobile, service, state, lead_code, base_amount, gst_amount, total_amount)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!req) throw new Error("Refund request not found");
    const appId = (req as any).application_id as string;
    const [{ data: rawPayments }, { data: events }, { data: customer }] = await Promise.all([
      admin
        .from("payments")
        .select("id, amount, currency, status, gateway_name, transaction_id, payment_date, parent_payment_id, refund_reason, created_at")
        .eq("application_id", appId)
        .order("created_at", { ascending: false }),
      admin
        .from("refund_request_events")
        .select("id, action, note, meta, actor_id, actor_name, actor_role, created_at")
        .eq("request_id", data.id)
        .order("created_at", { ascending: true }),
      (req as any).application?.customer_id
        ? admin
            .from("customers")
            .select("id, name, primary_email, primary_mobile, state, customer_code")
            .eq("id", (req as any).application.customer_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // Self-healing: if application has refund_processed_at but refund_requests row has null processed_at
    if (!req.processed_at && (req as any).application?.refund_processed_at) {
      const pAt = (req as any).application.refund_processed_at;
      req.processed_at = pAt;
      if (!req.gateway_ref && (req as any).application.refund_gateway_ref) {
        req.gateway_ref = (req as any).application.refund_gateway_ref;
      }
      admin
        .from("refund_requests")
        .update({
          processed_at: pAt,
          gateway_ref: req.gateway_ref ?? (req as any).application?.refund_gateway_ref,
        } as never)
        .eq("id", req.id)
        .then(() => {});
    }

    // Deduplicate negative payments if multiple identical negative rows were inserted
    const payments = rawPayments ?? [];
    const negPayments = payments.filter((p) => Number(p.amount) < 0);
    let cleanedPayments = payments;
    if (negPayments.length > 1) {
      const dupNegIds = negPayments.slice(1).map((p) => p.id);
      cleanedPayments = payments.filter((p) => !dupNegIds.includes(p.id));
      // Delete superfluous duplicates from DB
      admin.from("payments").delete().in("id", dupNegIds).then(() => {});
    }

    return {
      request: req,
      payments: cleanedPayments,
      events: events ?? [],
      customer: customer ?? null,
    };
  });
