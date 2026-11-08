import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole, writeAudit } from "@/lib/audit";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}


export const getComplaintDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin", "operations", "support", "accounts"]);
    const { data: complaint, error } = await (await getAdmin())
      .from("complaints")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !complaint) throw new Error("Complaint not found");

    const admin = await getAdmin();
    const [{ data: lead }, { data: app }, { data: cust }, { data: assignee }, { data: audits }] = await Promise.all([
      complaint.lead_id
        ? admin.from("leads").select("*").eq("id", complaint.lead_id).maybeSingle()
        : Promise.resolve({ data: null as any }),
      complaint.application_id
        ? admin.from("applications").select("id, application_code, application_status, service_id, services(service_name)").eq("id", complaint.application_id).maybeSingle()
        : Promise.resolve({ data: null as any }),
      (complaint.customer_id || complaint.lead_id)
        ? complaint.customer_id
          ? admin.from("customers").select("*").eq("id", complaint.customer_id).maybeSingle()
          : Promise.resolve({ data: null as any })
        : Promise.resolve({ data: null as any }),
      complaint.assigned_to
        ? admin.from("profiles").select("id, full_name, display_name, email").eq("id", complaint.assigned_to).maybeSingle()
        : Promise.resolve({ data: null as any }),
      admin.from("audit_logs").select("*").eq("entity_type", "complaint").eq("entity_id", data.id).order("created_at", { ascending: false }),
    ]);

    const customerObj = cust || (lead?.customer_id ? (await admin.from("customers").select("*").eq("id", lead.customer_id).maybeSingle()).data : null);

    return {
      complaint: {
        ...complaint,
        lead,
        application: app ? { ...app, service_name: (app as any).services?.service_name ?? null } : null,
        customer: customerObj,
        assigned_name: assignee ? (assignee.full_name || assignee.display_name || assignee.email) : null,
      },
      audits: audits ?? [],
    };
  });

export const updateComplaintNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), notes: z.string() }))
  .handler(async ({ data, context }) => {
    const user = await assertRole(context.supabase, ["super_admin", "admin", "operations"]);
    const { data: prev } = await (await getAdmin()).from("complaints").select("notes").eq("id", data.id).single();
    const { error } = await (await getAdmin()).from("complaints").update({ notes: data.notes }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit({
      supabase: context.supabase, entityType: "complaint", entityId: data.id,
      action: "notes_updated", oldValue: { notes: prev?.notes }, newValue: { notes: data.notes },
      actorId: user.id,
    });
    return { ok: true };
  });
