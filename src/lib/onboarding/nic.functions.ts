import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const Input = z.object({
  q: z.string().trim().max(120).default(""),
  activity: z.enum(["Manufacturing", "Services", "Trading"]).nullable().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export type NicResult = {
  code: string;
  description: string;
  section: string | null;
  division: string | null;
  group_code: string | null;
  class_code: string | null;
  activity_type: string | null;
};

/** Public NIC search — used in onboarding form. */
export const searchNicCodes = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data }): Promise<{ results: NicResult[]; error: string | null }> => {
    try {
      // Use the publishable/anon client, not supabaseAdmin. `nic_codes` has a
      // public-read RLS policy and `search_nic_codes` has EXECUTE for anon,
      // and the Data API rejects new-format service-role keys with
      // "Expected 3 parts in JWT; got 1".
      const url = process.env.SUPABASE_URL!;
      const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
      const supabase = createClient<Database>(url, key, {
        auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      });

      const { data: rows, error } = await supabase.rpc("search_nic_codes", {
        q: data.q,
        activity: data.activity ?? undefined,
        limit_n: data.limit,
      });
      if (error) {
        console.error("[nic.search] rpc error", error);
        return { results: [], error: "NIC search is temporarily unavailable. Please try again." };
      }
      const results = (rows ?? []).map((r: Record<string, unknown>) => ({
        code: String(r.code),
        description: String(r.description),
        section: r.section as string | null,
        division: r.division as string | null,
        group_code: r.group_code as string | null,
        class_code: r.class_code as string | null,
        activity_type: r.activity_type as string | null,
      }));
      return { results, error: null };
    } catch (e) {
      console.error("[nic.search] crash", e);
      return { results: [], error: "Could not load NIC codes. Please try again." };
    }
  });
