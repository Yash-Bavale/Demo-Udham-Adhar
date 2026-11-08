import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "add_lead_note",
  title: "Add a note to a lead",
  description:
    "Append a timestamped internal note to a lead's remarks. Does not change lead status.",
  inputSchema: {
    lead_id: z.string().trim().min(1).describe("Lead UUID."),
    note: z.string().trim().min(1).describe("Note text to append."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ lead_id, note }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);

    const { data: current, error: readError } = await supabase
      .from("leads")
      .select("id, remarks")
      .eq("id", lead_id)
      .maybeSingle();

    if (readError) return errorResult(readError.message);
    if (!current) return errorResult(`No lead found for "${lead_id}".`);

    const stamp = new Date().toISOString();
    const remarks = `${current.remarks ? `${current.remarks}\n` : ""}[${stamp}] ${note}`;

    const { error } = await supabase.from("leads").update({ remarks }).eq("id", lead_id);
    if (error) return errorResult(error.message);

    return jsonResult({ lead_id, remarks });
  },
});
