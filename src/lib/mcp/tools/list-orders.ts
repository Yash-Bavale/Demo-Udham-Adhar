import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_orders",
  title: "List orders",
  description:
    "List recent orders (applications), optionally filtered by order status or fulfillment stage.",
  inputSchema: {
    status: z.string().optional().describe("Application status, e.g. awaiting_payment, paid."),
    fulfillment_status: z.string().optional().describe("Fulfillment stage, e.g. order_received."),
    limit: z.number().int().min(1).max(50).optional().describe("Max rows (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, fulfillment_status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    let q = supabaseForUser(ctx)
      .from("applications")
      .select(
        "id, application_code, lead_id, application_status, fulfillment_status, form_status, document_status, assigned_to, created_at",
      )
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);

    if (status) q = q.eq("application_status", status as never);
    if (fulfillment_status) q = q.eq("fulfillment_status", fulfillment_status as never);

    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return jsonResult({ orders: data ?? [] });
  },
});
