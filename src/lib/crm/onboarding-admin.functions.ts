import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole, writeAudit } from "@/lib/audit";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}


export const adminUpdateOnboardingField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    submissionId: z.string().uuid(),
    fieldKey: z.string().min(1),
    value: z.any(),
  }))
  .handler(async ({ data, context }) => {
    const user = await assertRole(context.supabase, ["super_admin", "admin", "operations"]);
    const { data: sub } = await (await getAdmin())
      .from("onboarding_submissions")
      .select("*")
      .eq("id", data.submissionId)
      .single();
    if (!sub) throw new Error("Submission not found");
    const newFormData = { ...(sub.form_data as any), [data.fieldKey]: data.value };
    const { error } = await (await getAdmin())
      .from("onboarding_submissions")
      .update({ form_data: newFormData })
      .eq("id", data.submissionId);
    if (error) throw new Error(error.message);
    await writeAudit({
      supabase: context.supabase, entityType: "onboarding", entityId: data.submissionId,
      action: "field_edited",
      oldValue: { [data.fieldKey]: (sub.form_data as any)?.[data.fieldKey] },
      newValue: { [data.fieldKey]: data.value },
      actorId: user.id,
    });
    return { ok: true };
  });

export const requestDocumentReupload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ documentId: z.string().uuid(), reason: z.string().optional() }))
  .handler(async ({ data, context }) => {
    const user = await assertRole(context.supabase, ["super_admin", "admin", "operations"]);
    const { data: doc } = await (await getAdmin())
      .from("documents")
      .select("*")
      .eq("id", data.documentId)
      .single();
    if (!doc) throw new Error("Document not found");

    const { data: lead } = doc.lead_id
      ? await (await getAdmin()).from("leads").select("id, name, email").eq("id", doc.lead_id).single()
      : { data: null as any };

    await (await getAdmin())
      .from("documents")
      .update({ status: "re_upload_requested", remarks: data.reason ?? null })
      .eq("id", data.documentId);

    if (lead?.email) {
      await (await getAdmin()).from("email_queue").insert({
        to_email: lead.email,
        to_name: lead.name,
        subject: `Action Needed: Please re-upload your ${doc.doc_type}`,
        body_html: `<div style="font-family:Arial,sans-serif;padding:20px"><p>Dear ${lead.name},</p><p>We need you to re-upload your <b>${doc.doc_type}</b>.</p>${data.reason ? `<p><b>Reason:</b> ${data.reason}</p>` : ""}<p>Please log in to your application and upload the new document.</p></div>`,
        template_code: "document-reupload-request",
        lead_id: doc.lead_id,
        application_id: doc.application_id,
        created_by: user.id,
        variables: { documentId: doc.id },
      });
    }
    await writeAudit({
      supabase: context.supabase, entityType: "document", entityId: doc.id,
      action: "reupload_requested", newValue: { reason: data.reason }, actorId: user.id,
    });
    return { ok: true };
  });
