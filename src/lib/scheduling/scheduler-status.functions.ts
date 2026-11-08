// Read active exception state (schedulers + order status) for the workspace's
// Exception Banner. Read-only, admin/staff-safe (RLS on order_schedulers scopes
// to signed-in staff via existing policies).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getOrderExceptionState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ orderId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: order } = await context.supabase
      .from("applications")
      .select("id, order_status, application_code, closure_remarks")
      .eq("id", data.orderId)
      .maybeSingle();

    const { data: schedulers } = await context.supabase
      .from("order_schedulers")
      .select(
        "id, scheduler_type, status, started_at, fires_at, paused_at, business_seconds_remaining, business_seconds_total, remarks",
      )
      .eq("application_id", data.orderId)
      .in("status", ["active", "paused"])
      .order("started_at", { ascending: false });

    return {
      order: order as {
        id: string;
        order_status: string | null;
        application_code: string | null;
        closure_remarks: string | null;
      } | null,
      schedulers: (schedulers ?? []) as Array<{
        id: string;
        scheduler_type: string;
        status: string;
        started_at: string;
        fires_at: string | null;
        paused_at: string | null;
        business_seconds_remaining: number | null;
        business_seconds_total: number | null;
        remarks: string | null;
      }>,
    };
  });
