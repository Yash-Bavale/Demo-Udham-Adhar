import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─────────────────────────── Admin server fns ───────────────────────────

export const getEmailDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    type QStatus = "queued" | "sending" | "sent" | "failed" | "dlq";
    const counts = async (status: QStatus) => {
      const { count } = await supabase
        .from("email_queue")
        .select("*", { count: "exact", head: true })
        .eq("status", status);
      return count ?? 0;
    };

    const [queued, sending, failed, dlq, sent24h, sent7d, recentLogs, topErrors, failedRows, queueRows, logRows, templates] = await Promise.all([
      counts("queued"),
      counts("sending"),
      counts("failed"),
      counts("dlq"),
      supabase.from("email_logs").select("*", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", since24h).then((r) => r.count ?? 0),
      supabase.from("email_logs").select("*", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", since7d).then((r) => r.count ?? 0),
      supabase.from("email_logs").select("id, to_email, subject, status, error_message, smtp_response, sent_at, template_code").order("sent_at", { ascending: false }).limit(20),
      supabase.from("email_queue").select("id, to_email, subject, last_error, attempts").eq("status", "dlq").order("updated_at", { ascending: false }).limit(10),
      supabase
        .from("email_queue")
        .select("id, to_email, subject, template_code, attempts, max_attempts, next_attempt_at, last_error, created_at")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("email_queue").select("template_code"),
      supabase.from("email_logs").select("template_code, status"),
      supabase.from("email_templates").select("code"),
    ]);
    const templateSet = new Set((templates.data ?? []).map((t) => t.code));
    const queueUnmatched = (queueRows.data ?? []).filter((r) => !r.template_code || !templateSet.has(r.template_code)).length;
    const sentLogsUnmatched = (logRows.data ?? []).filter((r) => r.status === "sent" && (!r.template_code || !templateSet.has(r.template_code))).length;
    const allLogsUnmatched = (logRows.data ?? []).filter((r) => !r.template_code || !templateSet.has(r.template_code)).length;

    return {
      counts: { queued, sending, failed, dlq, sent24h, sent7d, queueUnmatched, sentLogsUnmatched, allLogsUnmatched },
      recentLogs: recentLogs.data ?? [],
      dlqRows: topErrors.data ?? [],
      failedRows: failedRows.data ?? [],
    };
  });

export const getSmtpSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("smtp_settings")
      .select("id, from_email, from_name, reply_to, daily_quota, is_enabled, notes, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      settings: data,
      hasSmtpHost: Boolean(process.env.SMTP_HOST),
      hasSmtpUser: Boolean(process.env.SMTP_USER),
      hasSmtpPass: Boolean(process.env.SMTP_PASS),
    };
  });

const SmtpInput = z.object({
  from_email: z.string().email().max(160),
  from_name: z.string().trim().min(1).max(120),
  reply_to: z.string().email().max(160).nullable().optional(),
  daily_quota: z.number().int().min(0).max(100_000),
  is_enabled: z.boolean(),
  notes: z.string().max(1000).nullable().optional(),
});

export const saveSmtpSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SmtpInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase.from("smtp_settings").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const payload = { ...data, updated_by: userId };
    if (existing) {
      const { error } = await supabase.from("smtp_settings").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("smtp_settings").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ── Outgoing mail provider switcher (Zoho Mail API ⇄ ZeptoMail) ──
export const getMailProviderSetting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { mailProviderChoice, resolveMailProvider, senderEmailFor } = await import("./transport.server");
    const { zeptoConfigured } = await import("./zeptomail.server");
    const active = await resolveMailProvider();
    return {
      choice: await mailProviderChoice(),
      active,
      senderEmail: senderEmailFor(active),
      zeptoConfigured: zeptoConfigured(),
      zohoConfigured: Boolean(process.env.ZOHO_SMTP_USER || process.env.ZOHO_FROM_EMAIL),
    };
  });

export const setMailProviderSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ choice: z.enum(["auto", "zoho", "zeptomail"]) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert(
        { id: 1, email_provider: data.choice, updated_at: new Date().toISOString(), updated_by: context.userId } as never,
        { onConflict: "id" },
      );
    if (error) throw new Error(error.message);
    const { clearMailProviderCache, resolveMailProvider } = await import("./transport.server");
    clearMailProviderCache();
    return { ok: true, choice: data.choice, active: await resolveMailProvider() };
  });

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ toEmail: z.string().email(), subject: z.string().min(1).max(200).optional() }).parse(i),
  )
  .handler(async ({ data }) => {
    const { enqueueEmailInternal, processQueueInternal } = await import("./emails.server");
    await enqueueEmailInternal({
      templateCode: null,
      toEmail: data.toEmail,
      subject: data.subject ?? "SMTP test from Business Help Services",
      bodyHtml:
        "<p>This is a test email sent from the admin email console.</p><p>If you received this, SMTP is configured correctly.</p>",
      bodyText: "This is a test email. If you received this, SMTP is configured correctly.",
      variables: { purpose: "smtp_test" },
      allowWithoutTemplate: true,
    });
    // Process immediately so admin sees feedback fast
    const result = await processQueueInternal(5);
    return { queued: true, ...result };
  });

export const processEmailQueueNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { processQueueInternal } = await import("./emails.server");
    return await processQueueInternal(50);
  });

/**
 * Release held/parked failed emails and try them again right now.
 * Only rows still in `failed` are touched, and the send path claims each row
 * atomically, so an email that already went out can never be sent twice.
 */
export const retryFailedEmailsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(i ?? {}))
  .handler(async ({ data }) => {
    const { processQueueInternal } = await import("./emails.server");
    const m = await import("@/integrations/supabase/client.server");
    const admin = m.supabaseAdmin;

    const { data: released } = await admin
      .from("email_queue")
      .update({ next_attempt_at: new Date().toISOString() })
      .eq("status", "failed")
      .select("id");

    const result = await processQueueInternal(data.limit ?? 50);
    return { released: released?.length ?? 0, ...result };
  });

// ── Template management ──
export const listEmailTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    let { data, error } = await supabase
      .from("email_templates")
      .select("id, code, name, subject, body_html, body_text, description, variables, is_enabled, is_system, updated_at, disabled_reason, last_toggled_by, last_toggled_at, last_sent_at, total_sent, category, flow_id, sr_no, dispatch_mode")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    const codes = new Set((data ?? []).map((t) => t.code));
    if (!codes.has("R001") || !codes.has("R002") || !codes.has("E011")) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { BUILTIN_TEMPLATES } = await import("./emails.server");
        if (!codes.has("R001") && BUILTIN_TEMPLATES.R001) {
          await supabaseAdmin.from("email_templates").upsert({
            code: "R001",
            name: "R001 – Refund Request Approved",
            subject: BUILTIN_TEMPLATES.R001.subject,
            body_html: BUILTIN_TEMPLATES.R001.body_html,
            category: "Refunds",
            flow_id: "R001",
            sr_no: 1,
            dispatch_mode: "manual",
            is_enabled: true,
            is_system: true,
            variables: ["order_number", "customer_name", "service_name", "refund_status", "refund_amount", "refund_amount_formatted", "refund_approval_date_and_time", "refund_reference_no", "payment_reference", "customer_email", "customer_mobile", "executive_name"],
          } as never, { onConflict: "code" });
        }
        if (!codes.has("R002") && BUILTIN_TEMPLATES.R002) {
          await supabaseAdmin.from("email_templates").upsert({
            code: "R002",
            name: "R002 – Refund Request Not Approved / Rejected",
            subject: BUILTIN_TEMPLATES.R002.subject,
            body_html: BUILTIN_TEMPLATES.R002.body_html,
            category: "Refunds",
            flow_id: "R002",
            sr_no: 2,
            dispatch_mode: "manual",
            is_enabled: true,
            is_system: true,
            variables: ["order_number", "customer_name", "invoice_number", "service_name", "order_created_at", "closure_date", "customer_email", "customer_mobile", "employee_remarks", "executive_name"],
          } as never, { onConflict: "code" });
        }
        if (!codes.has("E011") && BUILTIN_TEMPLATES.E011) {
          await supabaseAdmin.from("email_templates").upsert({
            code: "E011",
            name: "E011 – Technical Delay Resolved",
            subject: BUILTIN_TEMPLATES.E011.subject,
            body_html: BUILTIN_TEMPLATES.E011.body_html,
            category: "Delay & Hold",
            flow_id: "E011",
            sr_no: 11,
            dispatch_mode: "manual",
            is_enabled: true,
            is_system: true,
            variables: ["order_number", "customer_name", "service_name", "resolved_at", "customer_email", "customer_mobile", "executive_name"],
          } as never, { onConflict: "code" });
        }
        const refetch = await supabase
          .from("email_templates")
          .select("id, code, name, subject, body_html, body_text, description, variables, is_enabled, is_system, updated_at, disabled_reason, last_toggled_by, last_toggled_at, last_sent_at, total_sent, category, flow_id, sr_no, dispatch_mode")
          .order("name", { ascending: true });
        if (refetch.data) data = refetch.data;
      } catch (err) {
        console.warn("[listEmailTemplates] Auto-seed error:", err);
      }
    }

    return { rows: data ?? [] };
  });

export const toggleEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        code: z.string().min(1),
        enabled: z.boolean(),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: isAdmin }, { data: isSuper }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
    ]);
    if (!isAdmin && !isSuper) throw new Error("Forbidden");
    const patch: Record<string, unknown> = {
      is_enabled: data.enabled,
      disabled_reason: data.enabled ? null : data.reason ?? null,
      last_toggled_by: userId,
      last_toggled_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("email_templates").update(patch as never).eq("code", data.code);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setEmailTemplateDispatchMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      code: z.string().min(1),
      dispatch_mode: z.enum(["auto", "manual"]),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: isAdmin }, { data: isSuper }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
    ]);
    if (!isAdmin && !isSuper) throw new Error("Forbidden");
    const { error } = await supabase
      .from("email_templates")
      .update({ dispatch_mode: data.dispatch_mode } as never)
      .eq("code", data.code);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Manually send a template email for a given order/lead. Bypasses dispatch_mode
 * gate (that's the whole point of a manual send) but still honors is_enabled.
 * Used from the workspace when an employee chooses to send a customer email.
 */
export const sendOrderTemplateEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      leadId: z.string().uuid(),
      templateCode: z.string().min(1).max(80),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, lead_code, name, email, mobile, service, base_amount, gst_amount, total_amount")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!lead?.email) throw new Error("Lead has no email address on file.");

    const { data: app } = await supabase
      .from("applications")
      .select("id, application_code")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { resolveApplicationCode } = await import("@/lib/orders/resolve-order-number.server");
    const orderNumber = app?.application_code
      ?? (await resolveApplicationCode(data.leadId, { applicationId: app?.id ?? null }));
    if (!orderNumber) throw new Error("Order number not ready yet — please retry in a moment.");

    const appOrigin = process.env.APP_BASE_URL || process.env.SUPABASE_URL || "";
    const onboardingUrl = lead.lead_code ? `${appOrigin}/onboarding/${encodeURIComponent(lead.lead_code)}` : "";
    const vars = {
      customer_name: lead.name ?? "",
      name: lead.name ?? "",
      customer_email: lead.email,
      customer_mobile: lead.mobile ?? "",
      order_number: orderNumber,
      lead_code: lead.lead_code ?? "",
      service_name: lead.service ?? "",
      service: lead.service ?? "",
      form_link: onboardingUrl,
      onboarding_url: onboardingUrl,
      service_fee: Number(lead.base_amount ?? 0).toFixed(2),
      gst_amount: Number(lead.gst_amount ?? 0).toFixed(2),
      total_amount: Number(lead.total_amount ?? 0).toFixed(2),
      support_email: "help@businesshelpservices.com",
    };

    const { enqueueFromTemplateInternal, processQueueInternal } = await import("./emails.server");
    await enqueueFromTemplateInternal(
      data.templateCode,
      lead.email,
      vars,
      {
        toName: lead.name ?? undefined,
        leadId: lead.id,
        applicationId: app?.id ?? undefined,
        trigger: "manual",
        requireImmediateSuccess: true,
      },
    );
    const result = await processQueueInternal(5);
    return { ok: true, template: data.templateCode, ...result };
  });


const TemplateInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9_-]+$/, "code must contain only letters, numbers, hyphens or underscores"),
  name: z.string().trim().min(2).max(120),
  subject: z.string().trim().min(2).max(200),
  body_html: z.string().min(2).max(120_000),
  body_text: z.string().max(50_000).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  variables: z.array(z.string().max(60)).max(50).default([]),
  is_enabled: z.boolean().default(true),
  dispatch_mode: z.enum(["auto", "manual"]).optional(),
});


export const saveEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TemplateInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.id) {
      const { id, ...patch } = data;
      const { error } = await supabase.from("email_templates").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: row, error } = await supabase
      .from("email_templates")
      .insert({ ...data, created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const duplicateEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: src, error } = await supabase.from("email_templates").select("*").eq("id", data.id).single();
    if (error || !src) throw new Error(error?.message ?? "Template not found");
    const newCode = `${src.code}_copy_${Date.now().toString(36)}`.slice(0, 80);
    const { data: row, error: insErr } = await supabase
      .from("email_templates")
      .insert({
        code: newCode,
        name: `${src.name} (copy)`,
        subject: src.subject,
        body_html: src.body_html,
        body_text: src.body_text,
        description: src.description,
        variables: src.variables,
        is_enabled: false,
        is_system: false,
        created_by: userId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    return { ok: true, id: row.id };
  });

export const deleteEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: src } = await supabase.from("email_templates").select("is_system").eq("id", data.id).maybeSingle();
    if (src?.is_system) throw new Error("System templates cannot be deleted. Disable instead.");
    const { error } = await supabase.from("email_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Logs ──
const LogsInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(200).optional(),
  status: z.enum(["sent", "failed", "bounced"]).optional(),
});

export const listEmailLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => LogsInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: tplRows } = await supabase.from("email_templates").select("code");
    const templateSet = new Set((tplRows ?? []).map((t) => t.code));
    let q = supabase
      .from("email_logs")
      .select("id, to_email, subject, status, error_message, smtp_response, attempt, template_code, sent_at", { count: "exact" })
      .order("sent_at", { ascending: false })
      .range(from, to);
    if (data.status) q = q.eq("status", data.status);
    if (data.search) {
      const s = data.search.replace(/[,()]/g, " ").trim();
      q = q.or(`to_email.ilike.%${s}%,subject.ilike.%${s}%`);
    }
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return {
      rows: (rows ?? []).map((r) => ({
        ...r,
        template_exists: Boolean(r.template_code && templateSet.has(r.template_code)),
      })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

// ── Send test by template (per-template end-to-end verification) ──
const TestTplInput = z.object({
  code: z.string().trim().min(1).max(80),
  toEmail: z.string().email(),
  variablesJson: z.string().max(10_000).optional(),
});

export const sendTestTemplateEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TestTplInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tpl, error } = await supabase
      .from("email_templates")
      .select("code, subject, body_html, body_text, variables, is_enabled")
      .eq("code", data.code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!tpl) throw new Error(`Template '${data.code}' not found`);

    // Build variables: user overrides merged onto auto-generated samples.
    const sampleFor = (k: string): string => {
      const lk = k.toLowerCase();
      if (lk.includes("email")) return data.toEmail;
      if (lk.includes("name")) return "Sample Customer";
      if (lk.includes("phone") || lk.includes("mobile")) return "9876543210";
      if (lk.includes("amount") || lk.includes("price") || lk.includes("total")) return "₹1,499";
      if (lk.includes("date") || lk.includes("time")) return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      if (lk.includes("order") || lk.includes("application")) return "AP-2026-000000";
      if (lk.includes("invoice")) return "UA-2026-000000";
      if (lk.includes("transaction") || lk.includes("txn") || lk.includes("reference")) return "TXN-TEST-1234567890";
      if (lk.includes("url") || lk.includes("link")) return "https://udyamadhar.in";
      if (lk.includes("service")) return "Download Udyam Certificate";
      if (lk.includes("certificate")) return "UDYAM-XX-00-0000000";
      if (lk.includes("reason")) return "Sample reason for testing";
      return `[Sample ${k}]`;
    };
    const auto: Record<string, string> = {};
    for (const v of (tpl.variables ?? []) as string[]) auto[v] = sampleFor(v);

    let overrides: Record<string, string> = {};
    if (data.variablesJson?.trim()) {
      try {
        const parsed = JSON.parse(data.variablesJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const [k, v] of Object.entries(parsed)) overrides[k] = String(v ?? "");
        } else throw new Error("Variables JSON must be an object");
      } catch (e) {
        throw new Error(`Invalid variables JSON: ${(e as Error).message}`);
      }
    }
    const variables: Record<string, string> = { ...auto, ...overrides };

    const { enqueueFromTemplateInternal, processQueueInternal } = await import("./emails.server");
    // Temporarily allow disabled templates for testing by setting enable=true in memory only.
    if (!tpl.is_enabled) {
      // enqueueFromTemplateInternal would no-op for disabled templates; bypass with raw render.
      const { renderTemplate, renderTemplateHtml } = await import("./smtp.server");
      // Subject is plain text; body_html gets HTML-escaped variable substitution
      // to prevent injection from user-supplied fields (contact/complaint forms).
      const { enqueueEmailInternal } = await import("./emails.server");
      await enqueueEmailInternal({
        templateCode: `TEST_${tpl.code}`,
        toEmail: data.toEmail,
        subject: `[TEST] ${renderTemplate(tpl.subject, variables)}`,
        bodyHtml: renderTemplateHtml(tpl.body_html, variables),
        bodyText: tpl.body_text ? renderTemplate(tpl.body_text, variables) : null,
        variables,
      });
    } else {
      await enqueueFromTemplateInternal(tpl.code, data.toEmail, variables);
    }
    const result = await processQueueInternal(5);
    return { ok: true, template: tpl.code, variablesUsed: variables, ...result };
  });
