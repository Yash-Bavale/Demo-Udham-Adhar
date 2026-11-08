import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const LINK_PURPOSES = ["status", "resume", "pay", "upload", "certificate"] as const;
export type LinkPurpose = (typeof LINK_PURPOSES)[number];

function randToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const CreateInput = z.object({
  leadId: z.string().uuid(),
  applicationId: z.string().uuid().optional(),
  purpose: z.enum(LINK_PURPOSES),
  ttlHours: z.number().min(1).max(24 * 30).default(72),
});

export const createApplicationLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => CreateInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const token = randToken();
    const expires = new Date(Date.now() + data.ttlHours * 3600_000).toISOString();
    const { data: row, error } = await supabase
      .from("application_links")
      .insert({
        lead_id: data.leadId,
        application_id: data.applicationId ?? null,
        purpose: data.purpose,
        token,
        expires_at: expires,
        created_by: userId,
      })
      .select("token, expires_at, purpose")
      .single();
    if (error) throw new Error(error.message);
    return { token: row.token, expiresAt: row.expires_at, purpose: row.purpose, url: `/app/${row.token}` };
  });

const ResolveInput = z.object({ token: z.string().min(8).max(128) });

export const resolveApplicationLink = createServerFn({ method: "POST" })
  .inputValidator((i) => ResolveInput.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link, error } = await supabaseAdmin
      .from("application_links")
      .select("id, lead_id, application_id, purpose, expires_at, used_at")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!link) return { ok: false as const, reason: "not_found" as const };
    if (link.used_at && link.purpose !== "status") {
      return { ok: false as const, reason: "used" as const };
    }
    if (new Date(link.expires_at).getTime() < Date.now()) {
      return { ok: false as const, reason: "expired" as const };
    }

    const [{ data: lead }, { data: app }] = await Promise.all([
      supabaseAdmin
        .from("leads")
        .select("id, lead_code, name, service, total_amount, status")
        .eq("id", link.lead_id)
        .maybeSingle(),
      link.application_id
        ? supabaseAdmin
            .from("applications")
            .select("id, application_code, application_status, form_status, document_status")
            .eq("id", link.application_id)
            .maybeSingle()
        : Promise.resolve({ data: null as null }),
    ]);

    const { issueCustomerToken } = await import("@/lib/security/customer-access.server");
    const accessToken = lead?.id
      ? await issueCustomerToken(lead.id, link.purpose === "pay" ? "co" : "ob", { reason: `app_link_${link.purpose}` })
      : null;

    return {
      ok: true as const,
      accessToken,
      purpose: link.purpose as LinkPurpose,
      lead,
      application: app,
    };
  });
