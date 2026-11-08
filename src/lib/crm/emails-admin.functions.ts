import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole } from "@/lib/audit";
import { render } from "@react-email/components";
import { TEMPLATES } from "../email-templates/registry";
import React from "react";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}


export const listLeadEmails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ leadId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: roleRows } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const roles = new Set((roleRows ?? []).map((r: any) => r.role));
    const allowed = ["super_admin", "admin", "operations", "support", "accounts", "finance", "executive", "manager"];
    if (!allowed.some((r) => roles.has(r))) return { logs: [], queue: [] };

    const admin = await getAdmin();
    const { data: templateRows } = await admin.from("email_templates").select("code");
    const templateSet = new Set((templateRows ?? []).map((t: any) => t.code));

    const { data: logs, error: logErr } = await admin
      .from("email_logs")
      .select("*")
      .eq("lead_id", data.leadId)
      .order("sent_at", { ascending: false });

    if (logErr) throw new Error(logErr.message);

    const { data: queue, error: queueErr } = await admin
      .from("email_queue")
      .select("*")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false });

    if (queueErr) throw new Error(queueErr.message);

    const mark = (row: any) => ({
      ...row,
      template_exists: Boolean(row.template_code && templateSet.has(row.template_code)),
    });
    return { logs: (logs || []).map(mark), queue: (queue || []).map(mark) };
  });

const SendEmailSchema = z.object({
  leadId: z.string().uuid(),
  templateCode: z.string(),
  variables: z.record(z.string(), z.any()),
  toEmail: z.string().email().optional(),
});

export const sendLeadEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SendEmailSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "operations", "admin"]);
    const { leadId, templateCode, variables, toEmail } = data;

    const entry = TEMPLATES[templateCode];
    if (!entry) throw new Error("Invalid template code");

    // Fetch lead details for defaults
    const admin = await getAdmin();
    const { data: lead } = await admin
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (!lead) throw new Error("Lead not found");

    const { data: app } = await admin
      .from("applications")
      .select("id, application_code")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { resolveApplicationCode } = await import("@/lib/orders/resolve-order-number.server");
    const orderNumber = app?.application_code
      ?? (await resolveApplicationCode(leadId, { applicationId: app?.id ?? null }));
    if (!orderNumber) throw new Error("Order number not ready yet — please retry in a moment.");

    const finalTo = toEmail || lead.email;
    const finalVars = {
      customerName: lead.name,
      orderNumber,
      formLink: `https://${process.env.LOVABLE_APP_DOMAIN || 'udyamadhar.in'}/onboarding/${lead.lead_code}`,
      ...variables
    };

    const subject = typeof entry.subject === "function" 
      ? entry.subject(finalVars)
      : entry.subject;

    const html = await render(React.createElement(entry.component, finalVars));

    const { error } = await (await getAdmin())
      .from("email_queue")
      .insert({
        lead_id: leadId,
        to_email: finalTo,
        subject,
        body_html: html,
        template_code: templateCode,
        variables: finalVars,
        created_by: context.userId,
      });

    if (error) throw new Error(error.message);

    return { ok: true };
  });
