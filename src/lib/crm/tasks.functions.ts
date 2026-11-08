import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  priority: "high" | "medium" | "low" | null;
  due_date: string | null;
  is_completed: boolean;
  assigned_to: string | null;
  assigned_name: string | null;
  lead_id: string | null;
  lead_code: string | null;
  application_id: string | null;
  application_code: string | null;
  created_by: string | null;
  created_at: string;
};

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        scope: z.enum(["mine", "all"]).default("all"),
        includeCompleted: z.boolean().default(false),
      })
      .parse(i ?? {})
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    let q = admin
      .from("tasks")
      .select(
        "id, title, description, priority, due_date, is_completed, assigned_to, lead_id, application_id, created_by, created_at, leads(lead_code), applications(application_code)"
      )
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(500);

    if (!data.includeCompleted) q = q.eq("is_completed", false);
    if (data.scope === "mine") q = q.eq("assigned_to", context.userId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const assigneeIds = Array.from(
      new Set((rows ?? []).map((r) => r.assigned_to).filter((v): v is string => !!v))
    );
    let nameMap = new Map<string, string>();
    if (assigneeIds.length > 0) {
      const { data: profs } = await admin
        .from("profiles")
        .select("id, full_name, display_name, email")
        .in("id", assigneeIds);
      (profs ?? []).forEach((p: any) =>
        nameMap.set(p.id, p.full_name ?? p.display_name ?? p.email ?? "Staff")
      );
    }

    const tasks: TaskRow[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      priority: r.priority,
      due_date: r.due_date,
      is_completed: !!r.is_completed,
      assigned_to: r.assigned_to,
      assigned_name: r.assigned_to ? nameMap.get(r.assigned_to) ?? null : null,
      lead_id: r.lead_id,
      lead_code: r.leads?.lead_code ?? null,
      application_id: r.application_id,
      application_code: r.applications?.application_code ?? null,
      created_by: r.created_by,
      created_at: r.created_at,
    }));

    return { tasks };
  });

export const listStaffForAssignment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const admin = await getAdmin();
    const { data: roleRows, error } = await admin
      .from("user_roles")
      .select("user_id");
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((roleRows ?? []).map((r: any) => r.user_id)));
    if (ids.length === 0) return { staff: [] as { id: string; name: string }[] };
    const { data: profs } = await admin
      .from("profiles")
      .select("id, full_name, display_name, email, is_active")
      .in("id", ids);
    const staff = (profs ?? [])
      .filter((p: any) => p.is_active !== false)
      .map((p: any) => ({
        id: p.id,
        name: p.full_name ?? p.display_name ?? p.email ?? "Staff",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { staff };
  });

export const searchLeadOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ q: z.string().default("") }).parse(i ?? {}))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const q = data.q.trim();
    let query = admin
      .from("leads")
      .select("id, lead_code, name, mobile, service")
      .order("created_at", { ascending: false })
      .limit(15);
    if (q.length >= 1) {
      const like = `%${q}%`;
      query = query.or(
        `name.ilike.${like},mobile.ilike.${like},email.ilike.${like},lead_code.ilike.${like}`
      );
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const searchOrderOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ q: z.string().default(""), leadId: z.string().uuid().optional() }).parse(i ?? {})
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    let query = admin
      .from("applications")
      .select("id, application_code, lead_id, service_id, fulfillment_status, services(service_name)")
      .order("created_at", { ascending: false })
      .limit(15);
    if (data.leadId) query = query.eq("lead_id", data.leadId);
    const q = data.q.trim();
    if (q.length >= 1) {
      query = query.ilike("application_code", `%${q}%`);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return {
      rows: (rows ?? []).map((r: any) => {
        const service = Array.isArray(r.services) ? r.services[0] : r.services;
        return {
          id: r.id,
          application_code: r.application_code,
          lead_id: r.lead_id,
          service_id: r.service_id,
          fulfillment_status: r.fulfillment_status,
          service_name: service?.service_name ?? null,
        };
      }),
    };
  });

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        title: z.string().trim().min(2).max(200),
        description: z.string().trim().max(2000).optional(),
        assignedTo: z.string().uuid().nullable().optional(),
        dueAt: z.string().min(1), // ISO from datetime-local
        priority: z.enum(["high", "medium", "low"]).default("medium"),
        leadId: z.string().uuid().nullable().optional(),
        applicationId: z.string().uuid().nullable().optional(),
      })
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();

    let customerId: string | null = null;
    if (data.leadId) {
      const { data: lead } = await admin
        .from("leads")
        .select("customer_id")
        .eq("id", data.leadId)
        .maybeSingle();
      customerId = (lead?.customer_id as string | null) ?? null;
    }

    const { data: ins, error } = await admin
      .from("tasks")
      .insert({
        title: data.title,
        description: data.description ?? null,
        assigned_to: data.assignedTo ?? null,
        due_date: new Date(data.dueAt).toISOString(),
        priority: data.priority,
        lead_id: data.leadId ?? null,
        application_id: data.applicationId ?? null,
        customer_id: customerId,
        created_by: context.userId,
        is_completed: false,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (data.applicationId) {
      await admin.from("application_events").insert({
        application_id: data.applicationId,
        lead_id: data.leadId ?? null,
        customer_id: customerId,
        event_type: "task_created",
        new_value: data.title,
        created_by: context.userId,
      } as never);
    }

    return { id: ins!.id };
  });

export const completeTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), completed: z.boolean().default(true) }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const patch = data.completed
      ? {
          is_completed: true,
          completed_at: new Date().toISOString(),
          completed_by: context.userId,
        }
      : { is_completed: false, completed_at: null, completed_by: null };
    const { error } = await admin.from("tasks").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
