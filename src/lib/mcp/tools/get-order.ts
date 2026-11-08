import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "get_order",
  title: "Get order details",
  description: "Fetch one order (application) by UUID or application code, with its lead details.",
  inputSchema: {
    order: z.string().trim().min(1).describe("Order UUID or application code."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ order }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order);

    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .eq(isUuid ? "id" : "application_code", order)
      .maybeSingle();

    if (error) return errorResult(error.message);
    if (!data) return errorResult(`No order found for "${order}".`);

    const { data: lead } = await supabase
      .from("leads")
      .select("id, lead_code, name, email, mobile, service, total_amount, lead_status_v2")
      .eq("id", data.lead_id)
      .maybeSingle();

    return jsonResult({ order: data, lead: lead ?? null });
  },
});
