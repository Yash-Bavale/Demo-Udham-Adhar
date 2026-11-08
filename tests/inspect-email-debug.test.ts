import { describe, it } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

describe("Inspect application AP-2026-011567", () => {
  it("queries application and events", async () => {
    const { data: app } = await supabaseAdmin
      .from("applications")
      .select("id, application_code, fulfillment_status, order_status, lead_id, customer_id, service_id")
      .eq("application_code", "AP-2026-011567")
      .maybeSingle();

    console.log("=== APPLICATION ===");
    console.log(JSON.stringify(app, null, 2));

    if (app) {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("id, name, email, mobile")
        .eq("id", app.lead_id)
        .maybeSingle();
      console.log("=== LEAD ===");
      console.log(JSON.stringify(lead, null, 2));

      const { data: customer } = await supabaseAdmin
        .from("customers")
        .select("id, name, primary_email, primary_mobile")
        .eq("id", app.customer_id)
        .maybeSingle();
      console.log("=== CUSTOMER ===");
      console.log(JSON.stringify(customer, null, 2));

      const { data: queue } = await supabaseAdmin
        .from("email_queue")
        .select("id, template_code, to_email, subject, status, last_error, created_at, sent_at")
        .eq("application_id", app.id)
        .order("created_at", { ascending: false });
      console.log("=== EMAIL QUEUE BY APP ID ===");
      console.log(JSON.stringify(queue, null, 2));

      const { data: logs } = await supabaseAdmin
        .from("email_logs")
        .select("id, template_code, to_email, subject, status, smtp_response, error_message, created_at, sent_at")
        .eq("application_id", app.id)
        .order("created_at", { ascending: false });
      console.log("=== EMAIL LOGS BY APP ID ===");
      console.log(JSON.stringify(logs, null, 2));
    }
  });
});
