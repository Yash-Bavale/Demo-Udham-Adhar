import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "get_lead",
  title: "Get lead details",
  description:
    "Fetch one CRM lead by its UUID or lead code, including its linked orders (applications).",
  inputSchema: {
    lead: z.string().trim().min(1).describe("Lead UUID or lead code (e.g. LD-1024)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ lead }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lead);

    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq(isUuid ? "id" : "lead_code", lead)
      .maybeSingle();

    if (error) return errorResult(error.message);
    if (!data) return errorResult(`No lead found for "${lead}".`);

    const { data: orders } = await supabase
      .from("applications")
      .select(
        "id, application_code, application_status, fulfillment_status, form_status, document_status, created_at",
      )
      .eq("lead_id", data.id)
      .order("created_at", { ascending: false });

    return jsonResult({ lead: data, orders: orders ?? [] });
  },
});
