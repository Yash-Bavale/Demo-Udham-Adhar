import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "search_leads",
  title: "Search leads",
  description:
    "Search CRM leads by name, email, mobile or lead code, optionally filtered by status. Returns the most recent matches.",
  inputSchema: {
    query: z.string().optional().describe("Free text: name, email, mobile or lead code."),
    status: z.string().optional().describe("Lead status filter, e.g. new_lead, contacted."),
    limit: z.number().int().min(1).max(50).optional().describe("Max rows (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    let q = supabaseForUser(ctx)
      .from("leads")
      .select(
        "id, lead_code, name, email, mobile, state, service, status, lead_status_v2, total_amount, assigned_to, created_at",
      )
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);

    if (status) q = q.eq("lead_status_v2", status as never);
    if (query?.trim()) {
      const t = `%${query.trim()}%`;
      q = q.or(`name.ilike.${t},email.ilike.${t},mobile.ilike.${t},lead_code.ilike.${t}`);
    }

    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return jsonResult({ leads: data ?? [] });
  },
});
