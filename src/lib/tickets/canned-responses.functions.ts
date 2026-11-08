import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

export type CannedResponse = {
  id: string;
  title: string;
  body: string;
  category: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export const listCannedResponses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        activeOnly: z.boolean().default(false),
        category: z.string().optional(),
      })
      .parse(i ?? {})
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    let q = admin
      .from("canned_responses")
      .select("id, title, body, category, sort_order, is_active, created_at, updated_at")
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true });
    if (data.activeOnly) q = q.eq("is_active", true);
    if (data.category) q = q.eq("category", data.category);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as CannedResponse[];
  });

export const createCannedResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        title: z.string().trim().min(2).max(100),
        body: z.string().trim().min(2).max(8000),
        category: z.string().trim().max(50).optional(),
        sort_order: z.number().int().min(0).default(0),
        is_active: z.boolean().default(true),
      })
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: row, error } = await admin
      .from("canned_responses")
      .insert({
        title: data.title,
        body: data.body,
        category: data.category ?? null,
        sort_order: data.sort_order,
        is_active: data.is_active,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row as { id: string };
  });

export const updateCannedResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().trim().min(2).max(100).optional(),
        body: z.string().trim().min(2).max(8000).optional(),
        category: z.string().trim().max(50).nullable().optional(),
        sort_order: z.number().int().min(0).optional(),
        is_active: z.boolean().optional(),
      })
      .parse(i)
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { id, ...patch } = data;
    const { error } = await admin
      .from("canned_responses")
      .update(patch as never)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCannedResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { error } = await admin.from("canned_responses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
