// Server functions to read / update the business hours configuration.
// Any signed-in staff can read; only Super Admin can update.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_BUSINESS_HOURS,
  type BusinessHoursConfig,
} from "@/lib/scheduling/business-hours";

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const UpdateInput = z.object({
  timezone: z.string().min(3).max(64).default("Asia/Kolkata"),
  openTime: z.string().regex(HM),
  closeTime: z.string().regex(HM),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  holidays: z.array(z.string().regex(ISO_DATE)).max(365),
});

function rowToConfig(row: any): BusinessHoursConfig {
  if (!row) return DEFAULT_BUSINESS_HOURS;
  return {
    timezone: row.timezone ?? "Asia/Kolkata",
    openTime: (row.open_time ?? "10:00:00").slice(0, 5),
    closeTime: (row.close_time ?? "18:00:00").slice(0, 5),
    workingDays: Array.isArray(row.working_days) ? row.working_days : [1, 2, 3, 4, 5, 6],
    holidays: Array.isArray(row.holidays) ? row.holidays : [],
  };
}

export const getBusinessHoursConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("business_hours_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row: any = data;
    return { config: rowToConfig(row), updatedAt: row?.updated_at ?? null };
  });

export const updateBusinessHoursConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UpdateInput.parse(raw))
  .handler(async ({ data, context }) => {
    // Super Admin check (defense in depth — RLS also enforces).
    const { data: isSA } = await context.supabase.rpc("is_super_admin", { _user_id: context.userId });
    if (!isSA) throw new Error("Only Super Admin can update business hours.");

    // Sanity: open < close
    if (data.openTime >= data.closeTime) {
      throw new Error("Open time must be earlier than close time.");
    }

    const { error } = await (context.supabase as any)
      .from("business_hours_config")
      .upsert({
        id: 1,
        timezone: data.timezone,
        open_time: data.openTime,
        close_time: data.closeTime,
        working_days: data.workingDays,
        holidays: data.holidays,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
