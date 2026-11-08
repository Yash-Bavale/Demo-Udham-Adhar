import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LeadCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2}-\d{4}-\d{6}$/);
const Token = z.string().trim().min(10).max(200);
const PAID = new Set(["payment_successful", "under_process", "completed"]);

/**
 * Public: after payment, trade a checkout token for an onboarding token.
 * The paid state is read from the database (written only by verified gateway
 * callbacks), never from the URL.
 */
export const exchangeOnboardingAccess = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ leadCode: LeadCode, accessToken: Token }).parse(i))
  .handler(async ({ data }) => {
    const sec = await import("@/lib/security/customer-access.server");
    const leadId = await sec.leadIdByCode(data.leadCode);
    await sec.assertCustomerAccess(data.accessToken, leadId, "status", data.leadCode);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: lead }, { data: paid }] = await Promise.all([
      supabaseAdmin.from("leads").select("status").eq("id", leadId as string).maybeSingle(),
      supabaseAdmin
        .from("payments")
        .select("id")
        .eq("lead_id", leadId as string)
        .eq("status", "paid")
        .limit(1)
        .maybeSingle(),
    ]);
    const isPaid = !!paid || PAID.has(String(lead?.status ?? ""));
    if (!isPaid) return { ok: false as const, paid: false };
    const token = await sec.issueCustomerToken(leadId as string, "ob", { reason: "post_payment_exchange" });
    return { ok: true as const, paid: true, accessToken: token };
  });

/**
 * Public: "Email me a secure link". Always answers the same way so it cannot
 * be used to find out whether an order exists. The link goes only to the
 * email address already on file.
 */
export const requestSecureLink = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ leadCode: LeadCode }).parse(i))
  .handler(async ({ data }) => {
    const generic = { ok: true as const };
    const sec = await import("@/lib/security/customer-access.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, name, email, status, lead_code")
      .eq("lead_code", data.leadCode)
      .maybeSingle();
    await sec.logAccessEvent({ event: "link_requested", leadCode: data.leadCode, leadId: lead?.id ?? null });
    if (!lead?.email) return generic;

    const since = new Date(Date.now() - 60 * 60_000).toISOString();
    const { count } = await (supabaseAdmin as any)
      .from("customer_access_events")
      .select("id", { count: "exact", head: true })
      .eq("event", "link_sent")
      .eq("lead_id", lead.id)
      .gte("created_at", since);
    if ((count ?? 0) >= 3) return generic;

    const { data: paid } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("status", "paid")
      .limit(1)
      .maybeSingle();
    const isPaid = !!paid || PAID.has(String(lead.status ?? ""));
    const origin = process.env.APP_BASE_URL || "https://udyamadhar.in";
    const path = isPaid ? `/onboarding/${lead.lead_code}` : `/payment/${lead.lead_code}`;
    const url = await sec.secureCustomerUrl(origin, path, lead.id, isPaid ? "ob" : "co", "customer_requested");
    const label = isPaid ? "Continue your application" : "Complete your payment";
    const name = String(lead.name ?? "").replace(/[<>&"]/g, "");

    const { enqueueEmailInternal } = await import("@/lib/emails/emails.server");
    await enqueueEmailInternal({
      toEmail: lead.email,
      toName: lead.name,
      subject: `Your secure link for ${lead.lead_code}`,
      bodyHtml: `<p>Hello ${name},</p><p>Here is your secure link. It works only for your application.</p><p><a href="${url}">${label}</a></p><p>If you did not ask for this, you can ignore this email.</p>`,
      bodyText: `Hello ${name},\n\nHere is your secure link: ${url}\n\nIf you did not ask for this, you can ignore this email.`,
      leadId: lead.id,
      allowWithoutTemplate: true,
      allowDuplicate: true,
    }).catch(() => undefined);
    await sec.logAccessEvent({ event: "link_sent", leadCode: lead.lead_code, leadId: lead.id });
    return generic;
  });

/** Staff: mint a fresh secure form/payment link to send to a customer. */
export const mintCustomerLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ leadCode: LeadCode, kind: z.enum(["form", "payment"]) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("has_any_staff_role", { _user_id: context.userId });
    if (!isStaff) throw new Error("Not authorized.");
    const sec = await import("@/lib/security/customer-access.server");
    const leadId = await sec.leadIdByCode(data.leadCode);
    if (!leadId) throw new Error("Order not found.");
    const origin = process.env.APP_BASE_URL || "https://udyamadhar.in";
    const path = data.kind === "form" ? `/onboarding/${data.leadCode}` : `/payment/${data.leadCode}`;
    const token = await sec.issueCustomerToken(leadId, data.kind === "form" ? "ob" : "co", {
      reason: "staff_copied",
      createdBy: context.userId,
    });
    return { url: `${origin}${path}#t=${token}` };
  });

const PublicRef = z.string().trim().regex(/^[a-f0-9]{32}$/);

/** Public: map an opaque URL id to its lead code (ids are unguessable). */
export const resolveCustomerRef = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ ref: PublicRef }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("lead_code")
      .eq("public_ref", data.ref)
      .maybeSingle();
    if (!lead?.lead_code) {
      const sec = await import("@/lib/security/customer-access.server");
      await sec.logAccessEvent({ event: "denied", reason: "bad_ref" });
    }
    return { leadCode: lead?.lead_code ?? null };
  });

/** Public: give the opaque URL id for a lead code, only to a holder of a valid link for it. */
export const customerRefForCode = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ leadCode: LeadCode, accessToken: Token }).parse(i))
  .handler(async ({ data }) => {
    const sec = await import("@/lib/security/customer-access.server");
    const leadId = await sec.leadIdByCode(data.leadCode);
    try {
      await sec.assertCustomerAccess(data.accessToken, leadId, "status", data.leadCode);
    } catch {
      return { ref: null };
    }
    return { ref: leadId ? await sec.publicRefForLeadId(leadId) : null };
  });
