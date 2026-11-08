import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TimelineKind =
  | "activity" | "note" | "email" | "payment" | "onboarding" | "document" | "analytics";

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  at: string;
  title: string;
  detail?: string;
  actorId?: string | null;
  meta?: Record<string, string | number | boolean | null>;
}

export const getLeadTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ leadId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { leadId } = data;

    const [acts, notes, emails, payments, onb, docs, analytics, leadRow] = await Promise.all([
      supabase.from("activity_logs")
        .select("id, activity_type, activity_description, user_id, created_at")
        .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(200),
      supabase.from("lead_notes")
        .select("id, note, user_id, created_at")
        .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(200),
      supabase.from("email_logs")
        .select("id, status, subject, to_email, template_code, error_message, created_at")
        .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(200),
      supabase.from("payments")
        .select("id, status, amount, gateway_name, transaction_id, created_at, payment_date")
        .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(100),
      supabase.from("onboarding_submissions")
        .select("id, status, service_code, submitted_at, created_at, updated_at")
        .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(50),
      supabase.from("documents")
        .select("id, file_name, doc_type, status, uploaded_at, verified_at")
        .eq("lead_id", leadId).order("uploaded_at", { ascending: false }).limit(200),
      supabase.from("analytics_events")
        .select("id, event_name, page_url, created_at")
        .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(200),
      supabase.from("leads")
        .select("id, lead_source, created_at, name")
        .eq("id", leadId).maybeSingle(),
    ]);

    const items: TimelineItem[] = [];

    (acts.data ?? []).forEach((r) => items.push({
      id: `a-${r.id}`, kind: "activity", at: r.created_at as string,
      title: r.activity_description as string, actorId: r.user_id as string | null,
      meta: { type: r.activity_type },
    }));
    (notes.data ?? []).forEach((r) => items.push({
      id: `n-${r.id}`, kind: "note", at: r.created_at as string,
      title: "Internal note", detail: r.note as string, actorId: r.user_id as string | null,
    }));
    (emails.data ?? []).forEach((r) => items.push({
      id: `e-${r.id}`, kind: "email", at: r.created_at as string,
      title: `Email ${r.status}: ${r.subject ?? ""}`,
      detail: r.error_message ? `Error: ${r.error_message}` : `To ${r.to_email ?? ""}`,
      meta: { template: r.template_code },
    }));
    (payments.data ?? []).forEach((r) => items.push({
      id: `p-${r.id}`, kind: "payment", at: (r.payment_date ?? r.created_at) as string,
      title: `Payment ${r.status} — ₹${Number(r.amount).toFixed(2)}`,
      detail: r.transaction_id ? `Txn ${r.transaction_id} via ${r.gateway_name}` : `via ${r.gateway_name}`,
    }));
    (onb.data ?? []).forEach((r) => items.push({
      id: `o-${r.id}`, kind: "onboarding", at: (r.submitted_at ?? r.updated_at ?? r.created_at) as string,
      title: `Onboarding ${r.status}`,
      detail: `Service ${r.service_code}`,
    }));
    (docs.data ?? []).forEach((r) => items.push({
      id: `d-${r.id}`, kind: "document", at: (r.verified_at ?? r.uploaded_at) as string,
      title: `Doc ${r.status}: ${r.doc_type}`,
      detail: r.file_name as string,
    }));
    (analytics.data ?? []).forEach((r) => items.push({
      id: `x-${r.id}`, kind: "analytics", at: r.created_at as string,
      title: r.event_name as string,
      detail: r.page_url as string | undefined,
    }));

    // Synthetic "lead created" entry with full source (e.g. "website:/print-udyam-certificate").
    if (leadRow.data) {
      const src = (leadRow.data.lead_source as string | null) ?? "unknown";
      const [channel, ...pathParts] = src.split(":");
      const path = pathParts.join(":");
      items.push({
        id: `src-${leadRow.data.id}`,
        kind: "activity",
        at: leadRow.data.created_at as string,
        title: `Lead created — Source: ${channel || "unknown"}`,
        detail: path ? `Landing page: ${path}` : undefined,
      });
    }

    items.sort((a, b) => (a.at < b.at ? 1 : -1));
    return { items: items.slice(0, 500) };
  });
