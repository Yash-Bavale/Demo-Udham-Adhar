// Admin CRUD for the Service Workflow Engine — Reason Library + Automation Rules.
// Read = any staff role. Write = admin / super_admin only.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole, writeAudit } from "@/lib/audit";

const STAFF = [
  "super_admin", "admin", "manager", "operations", "executive", "support", "finance", "accounts",
] as const;
const ADMIN = ["super_admin", "admin"] as const;

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

const TableEnum = z.enum(["workflow_delay_reasons", "workflow_closure_reasons"]);

// ───────────── Reason library ─────────────

export const listReasons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ table: TableEnum }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...STAFF]);
    const admin = await getAdmin();
    const select = data.table === "workflow_delay_reasons"
      ? "id,code,label,description,is_active,sort_order,updated_at,side,email_template_code"
      : "id,code,label,description,is_active,sort_order,updated_at";
    const { data: rows, error } = await admin
      .from(data.table)
      .select(select)
      .order("sort_order")
      .order("label");
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

const sanitizeCode = (codeStr: string) => {
  return codeStr
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
};

const ReasonInput = z.preprocess(
  (raw: unknown) => {
    if (raw && typeof raw === "object" && raw !== null) {
      const obj = { ...(raw as Record<string, unknown>) };
      let codeVal = typeof obj.code === "string" ? obj.code : "";
      if (!codeVal.trim() && typeof obj.label === "string") {
        codeVal = obj.label;
      }
      obj.code = sanitizeCode(codeVal);
      return obj;
    }
    return raw;
  },
  z.object({
    table: TableEnum,
    id: z.string().uuid().optional(),
    code: z
      .string()
      .min(1, "Code is required")
      .max(64, "Code must be 64 characters or fewer")
      .regex(/^[a-z0-9_]+$/, "lowercase letters / digits / underscore"),
    label: z.string().trim().min(1, "Label is required").max(160),
    description: z.string().max(2000).optional().nullable(),
    side: z.enum(["customer", "internal"]).optional(),
    emailTemplateCode: z.string().max(160).optional().nullable(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(9999).default(100),
  })
);

export const upsertReason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReasonInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...ADMIN]);
    const admin = await getAdmin();
    const payload: Record<string, unknown> = {
      code: data.code,
      label: data.label,
      description: data.description ?? null,
      is_active: data.isActive,
      sort_order: data.sortOrder,
    };
    if (data.table === "workflow_delay_reasons") {
      payload.side = data.side ?? "customer";
      payload.email_template_code = payload.side === "customer" ? (data.emailTemplateCode || "bhs_e003_customer_delay") : (data.emailTemplateCode || "bhs_e004_our_side_delay");
    }
    if (data.id) {
      const { error } = await admin.from(data.table).update(payload as never).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin.from(data.table).insert(payload as never);
      if (error) throw new Error(error.message);
    }
    await writeAudit({
      supabase: context.supabase,
      entityType: data.table,
      entityId: data.id ?? data.code,
      action: data.id ? "update" : "create",
      newValue: payload,
      actorId: context.userId,
    });
    return { ok: true };
  });

export const deleteReason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ table: TableEnum, id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...ADMIN]);
    const admin = await getAdmin();
    const { error } = await admin.from(data.table).update({ is_active: false } as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit({
      supabase: context.supabase,
      entityType: data.table,
      entityId: data.id,
      action: "deactivate",
      actorId: context.userId,
    });
    return { ok: true };
  });

// ───────────── Automation rules ─────────────

export const listAutomationRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, [...STAFF]);
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("workflow_automation_rules")
      .select("*")
      .order("trigger_status")
      .order("wait_days");
    if (error) throw new Error(error.message);
    return { rules: data ?? [] };
  });

const RuleInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(160),
  triggerStatus: z.string().min(1).max(64),
  waitDays: z.number().int().min(0).max(365),
  actionType: z.enum(["send_template", "create_reminder", "notify_executive", "close_order"]),
  templateCode: z.string().max(160).optional().nullable(),
  repeatCount: z.number().int().min(1).max(50).default(1),
  isActive: z.boolean().default(true),
});

export const upsertAutomationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RuleInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...ADMIN]);
    const admin = await getAdmin();
    const payload = {
      name: data.name,
      trigger_status: data.triggerStatus,
      wait_days: data.waitDays,
      action_type: data.actionType,
      template_code: data.templateCode || null,
      repeat_count: data.repeatCount,
      is_active: data.isActive,
      config: {},
    };
    if (data.id) {
      const { error } = await admin.from("workflow_automation_rules").update(payload as never).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin.from("workflow_automation_rules").insert(payload as never);
      if (error) throw new Error(error.message);
    }
    await writeAudit({
      supabase: context.supabase,
      entityType: "workflow_automation_rules",
      entityId: data.id ?? data.name,
      action: data.id ? "update" : "create",
      newValue: payload,
      actorId: context.userId,
    });
    return { ok: true };
  });

export const deleteAutomationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, [...ADMIN]);
    const admin = await getAdmin();
    const { error } = await admin
      .from("workflow_automation_rules")
      .update({ is_active: false } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit({
      supabase: context.supabase,
      entityType: "workflow_automation_rules",
      entityId: data.id,
      action: "deactivate",
      actorId: context.userId,
    });
    return { ok: true };
  });
