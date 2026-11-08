import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole } from "@/lib/audit";

const Input = z.object({ leadCode: z.string().trim().min(3).max(80), accessToken: z.string().trim().min(10).max(200) });

/**
 * Public summary used on /apply/:leadCode/summary.
 * Returns service info, customer contact, full pricing breakdown (base/GST/total)
 * and enabled payment gateways.
 */
export const getApplicationSummary = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.leadCode.trim();
    const cols = "id, lead_code, name, email, mobile, service, base_amount, gst_amount, total_amount, status, lead_status_v2, service_id, website_id";

    // Accept either a lead_code (UA-...) or an application_code (AP-...).
    let lead: any = null;
    if (code.toUpperCase().startsWith("AP-")) {
      const { data: app, error: appErr } = await supabaseAdmin
        .from("applications")
        .select(`lead_id, leads:lead_id (${cols})`)
        .eq("application_code", code)
        .maybeSingle();
      if (appErr) throw new Error(appErr.message);
      lead = (app as any)?.leads ?? null;
    } else {
      const { data: byLead, error } = await supabaseAdmin
        .from("leads")
        .select(cols)
        .eq("lead_code", code)
        .maybeSingle();
      if (error) throw new Error(error.message);
      lead = byLead;
    }
    const { assertCustomerAccess } = await import("@/lib/security/customer-access.server");
    await assertCustomerAccess(data.accessToken, lead?.id ?? null, "summary", code);

    // Fetch service description separately
    let serviceDescription = "";
    if (lead.service_id) {
      const { data: svc } = await supabaseAdmin
        .from("services")
        .select("description")
        .eq("id", lead.service_id)
        .maybeSingle();
      if (svc) serviceDescription = svc.description || "";
    }

    // Fetch payment record separately
    const { data: payments } = await supabaseAdmin
      .from("payments")
      .select("transaction_id, gateway_name, payment_date, status, amount")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false });

    // Check if there is an active pending payment link for a service change / top-up
    const { data: pendingLink } = await supabaseAdmin
      .from("payment_links" as any)
      .select("amount, expires_at, status")
      .eq("lead_id", lead.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const hasPendingLink = !!pendingLink && Number((pendingLink as any).amount) > 0;
    const pendingAmount = hasPendingLink ? Number((pendingLink as any).amount) : 0;

    const isAwaitingConvertedServicePayment =
      hasPendingLink || lead.status === "payment_pending" || lead.lead_status_v2 === "payment_pending";
    const successfulPayment = isAwaitingConvertedServicePayment
      ? null
      : payments?.find(p => p.status === 'paid') || null;

    const effectiveTotal = hasPendingLink ? pendingAmount : Number(lead.total_amount ?? 0);
    const effectiveBase = hasPendingLink ? Math.round((effectiveTotal / 1.18) * 100) / 100 : Number(lead.base_amount ?? 0);
    const effectiveGst = hasPendingLink ? Math.round((effectiveTotal - effectiveBase) * 100) / 100 : Number(lead.gst_amount ?? 0);

    const { data: gateways } = await supabaseAdmin
      .from("payment_gateways")
      .select("id, name, display_name, is_enabled, priority, config")
      .eq("is_enabled", true)
      .order("priority", { ascending: true });

    const globalList = (gateways ?? []).map((g: any) => ({
      id: g.id,
      name: g.name,
      displayName: g.display_name,
      priority: g.priority,
      logoUrl: g.config?.logo_url || null,
      isDefault: Boolean(g.config?.is_default),
      description: g.config?.description || null,
    }));

    const { applyWebsiteGateways } = await import("@/lib/payments/website-gateways");
    const { websiteGatewayRules } = await import("@/lib/payments/website-gateways.server");
    const activeList = applyWebsiteGateways(globalList, await websiteGatewayRules(lead.website_id));
    const defaultGw = activeList.find((g) => g.isDefault) || activeList[0] || null;

    return {
      lead: {
        leadCode: lead.lead_code,
        name: lead.name,
        email: lead.email,
        mobile: lead.mobile,
        service: lead.service,
        serviceDescription,
        baseAmount: effectiveBase,
        gstAmount: effectiveGst,
        totalAmount: effectiveTotal,
        status: lead.status,
        leadStatusV2: lead.lead_status_v2,
        payment: successfulPayment,
      },
      hasPendingLink,
      pendingAmount,
      gateways: activeList,
      defaultGateway: defaultGw?.name || (activeList.length > 0 ? activeList[0].name : ""),
    };
  });

// ── Customer self-edit of contact details (pre-payment only) ──

const UpdateContact = z.object({
  leadCode: z.string().trim().min(3).max(80),
  accessToken: z.string().trim().min(10).max(200),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  currentEmail: z.string().trim().email().max(160).optional(),
  currentMobile: z.string().trim().regex(/^[6-9]\d{9}$/).optional(),
}).refine((v) => v.currentEmail || v.currentMobile, {
  message: "currentEmail or currentMobile is required to prove ownership",
});

export const updateLeadContact = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => UpdateContact.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, status, email, mobile")
      .eq("lead_code", data.leadCode)
      .maybeSingle();
    {
      const { assertCustomerAccess } = await import("@/lib/security/customer-access.server");
      await assertCustomerAccess(data.accessToken, lead?.id ?? null, "contact_update", data.leadCode);
    }
    if (!lead) throw new Error("Application not found");
    if (lead.status === "payment_successful" || lead.status === "completed") {
      throw new Error("Details can't be changed after payment.");
    }

    const emailMatches = data.currentEmail &&
      lead.email && lead.email.toLowerCase() === data.currentEmail.toLowerCase();
    const mobileMatches = data.currentMobile && lead.mobile === data.currentMobile;
    if (!emailMatches && !mobileMatches) {
      throw new Error("Verification failed. Please contact support.");
    }

    const { error } = await supabaseAdmin
      .from("leads")
      .update({
        name: data.name,
        email: data.email.toLowerCase(),
        mobile: data.mobile,
      })
      .eq("id", lead.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ── Admin: gateway management ──

export const listGateways = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { supabase } = context;
    const { data, error } = await supabaseAdmin
      .from("payment_gateways")
      .select("id, name, display_name, is_enabled, priority, config, webhook_secret_name, updated_at")
      .order("priority", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

const GatewayUpdate = z.object({
  id: z.string().uuid(),
  display_name: z.string().trim().min(1).optional(),
  is_enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(999).optional(),
  logo_url: z.string().trim().nullable().optional(),
  is_default: z.boolean().optional(),
  description: z.string().trim().nullable().optional(),
});

export const updateGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => GatewayUpdate.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertRole(supabase, ["super_admin", "admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: current } = await supabaseAdmin
      .from("payment_gateways")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!current) throw new Error("Gateway not found");

    const curConfig = (current.config as Record<string, any>) || {};
    const newConfig = {
      ...curConfig,
      ...(data.logo_url !== undefined ? { logo_url: data.logo_url } : {}),
      ...(data.is_default !== undefined ? { is_default: data.is_default } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
    };

    if (data.is_default === true) {
      const { data: allGws } = await supabaseAdmin.from("payment_gateways").select("id, config");
      for (const g of allGws ?? []) {
        if (g.id !== data.id && (g.config as any)?.is_default) {
          await supabaseAdmin
            .from("payment_gateways")
            .update({ config: { ...(g.config as any), is_default: false } as any })
            .eq("id", g.id);
        }
      }
    }

    const patch: Record<string, any> = {
      config: newConfig,
      updated_at: new Date().toISOString(),
    };
    if (data.display_name !== undefined) patch.display_name = data.display_name;
    if (data.is_enabled !== undefined) patch.is_enabled = data.is_enabled;
    if (data.priority !== undefined) patch.priority = data.priority;

    const { error } = await supabaseAdmin
      .from("payment_gateways")
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const LogoUploadSchema = z.object({
  id: z.string().uuid(),
  fileBase64: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
});

export const uploadGatewayLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => LogoUploadSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertRole(supabase, ["super_admin", "admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let logoUrl = `data:${data.mimeType};base64,${data.fileBase64}`;
    try {
      const buffer = Buffer.from(data.fileBase64, "base64");
      const ext = data.fileName.split(".").pop() || "png";
      const filePath = `gateway-logos/${data.id}-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabaseAdmin.storage
        .from("documents")
        .upload(filePath, buffer, { contentType: data.mimeType, upsert: true });

      if (!uploadErr) {
        const { data: pubUrlData } = supabaseAdmin.storage.from("documents").getPublicUrl(filePath);
        if (pubUrlData?.publicUrl) logoUrl = pubUrlData.publicUrl;
      }
    } catch (e) {
      console.warn("[uploadGatewayLogo] storage upload fallback to data URL", e);
    }

    const { data: current } = await supabaseAdmin
      .from("payment_gateways")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!current) throw new Error("Gateway not found");

    const curConfig = (current.config as Record<string, any>) || {};
    const newConfig = { ...curConfig, logo_url: logoUrl };

    const { error } = await supabaseAdmin
      .from("payment_gateways")
      .update({ config: newConfig, updated_at: new Date().toISOString() } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    return { ok: true, logoUrl };
  });

/**
 * Read-only credential self-check for CCAvenue. Calls the Order Status API
 * with a dummy reference: CCAvenue rejects bad merchant id / access code /
 * working key with an explicit error, while a valid setup replies "order not
 * found". No writes, super-admin only.
 */
export const checkCcavenueCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, ["super_admin"]);
    try {
      const { callOrderStatusApi } = await import("@/lib/payments/ccavenue.server");
      const res = await callOrderStatusApi("CCAV-SELFCHECK-000000");
      const raw = res.raw ?? {};
      const errText = String(
        raw.error_desc ?? raw.reason ?? raw.status_message ?? raw.message ?? "",
      ).toLowerCase();
      const keys = Object.keys(raw);
      if (keys.length === 0) {
        return {
          ok: false,
          message:
            "CCAvenue did not return a readable response. The working key is most likely wrong (decryption failed).",
        };
      }
      if (errText.includes("access code") || errText.includes("merchant") || errText.includes("authentication")) {
        return {
          ok: false,
          message:
            `CCAvenue's optional Merchant Web API (Status/Refund) is not enabled for this account (${errText}). Live checkout, callbacks and payment confirmation are unaffected — only admin-side refunds and manual status re-checks need this API.`,
        };
      }
      if (errText.includes("decrypt")) {
        return { ok: false, message: "Could not decrypt the CCAvenue response — the working key looks wrong." };
      }

      return {
        ok: true,
        message:
          "CCAvenue accepted the credentials (test lookup returned a normal 'order not found' style response).",
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });

// ── Admin: website-wise payment options ──

export const listWebsiteGateways = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, ["super_admin", "admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [sites, rules, globals, cf, cfAccts] = await Promise.all([
      db.from("websites").select("id, name, is_active, is_primary, sort_order, payments_enabled").order("sort_order"),
      db.from("website_payment_gateways").select("website_id, gateway_name, is_enabled, is_default"),
      db.from("payment_gateways").select("name, display_name, is_enabled"),
      db.from("cashfree_website_accounts").select("website_id, account_id, is_enabled"),
      db.from("cashfree_merchant_accounts").select("id, label, is_active"),
    ]);
    if (sites.error || rules.error) throw new Error("Could not load website payment options.");
    const acct = new Map((cfAccts.data ?? []).map((a: any) => [a.id, a]));
    return {
      // Website names only; partner domains are never sent to the screen.
      websites: (sites.data ?? []).map((w: any) => {
        const map = (cf.data ?? []).find((m: any) => m.website_id === w.id && m.is_enabled);
        const a: any = map ? acct.get(map.account_id) : null;
        return { id: w.id, name: w.name, isActive: w.is_active, isPrimary: w.is_primary, paymentsEnabled: w.payments_enabled !== false, cashfreeAccount: a?.is_active ? a.label : null, cashfreeAccountId: a?.is_active ? a.id : null };
      }),
      rules: rules.data ?? [],
      globals: (globals.data ?? []).filter((g: any) => ["cashfree", "payu", "ccavenue"].includes(g.name)),
    };
  });

const WebsiteGatewayInput = z.object({
  websiteId: z.string().uuid(),
  gateway: z.enum(["cashfree", "payu", "ccavenue"]),
  isEnabled: z.boolean(),
  isDefault: z.boolean(),
});

export const setWebsiteGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => WebsiteGatewayInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const isDefault = data.isEnabled && data.isDefault;
    if (isDefault) {
      await db.from("website_payment_gateways").update({ is_default: false, updated_at: new Date().toISOString() })
        .eq("website_id", data.websiteId).neq("gateway_name", data.gateway);
    }
    const { error } = await db.from("website_payment_gateways").upsert({
      website_id: data.websiteId, gateway_name: data.gateway, is_enabled: data.isEnabled, is_default: isDefault,
      updated_by: context.userId, updated_at: new Date().toISOString(),
    }, { onConflict: "website_id,gateway_name" });
    if (error) throw new Error("Could not save the payment option.");
    return { ok: true };
  });

/** Turn payment collection on/off for one website (off = processing timer loops, checkout refused). */
export const setWebsitePaymentsEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ websiteId: z.string().uuid(), enabled: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("websites")
      .update({ payments_enabled: data.enabled }).eq("id", data.websiteId);
    if (error) throw new Error("Could not save the payment setting.");
    return { ok: true };
  });

// ── Cashfree merchant accounts (MIDs) ─────────────────────────────────────────
// Secrets are entered once, encrypted on the server and never sent back to the screen.

export const listCashfreeAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, ["super_admin", "admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [accts, creds, maps] = await Promise.all([
      db.from("cashfree_merchant_accounts").select("id, account_key, label, is_legacy, is_active, created_at").order("created_at"),
      db.from("cashfree_account_credentials").select("account_id, client_id, mode, updated_at"),
      db.from("cashfree_website_accounts").select("account_id, is_enabled"),
    ]);
    if (accts.error) throw new Error("Could not load merchant accounts.");
    return {
      accounts: (accts.data ?? []).map((a: any) => {
        const c = (creds.data ?? []).find((x: any) => x.account_id === a.id);
        const id = String(c?.client_id ?? "");
        return {
          id: a.id, key: a.account_key, label: a.label, isLegacy: a.is_legacy, isActive: a.is_active,
          // Only a masked hint of the App ID; the secret key is never returned.
          credentials: a.is_legacy ? "global" : c ? "saved" : "missing",
          clientIdHint: c ? `${id.slice(0, 4)}…${id.slice(-4)}` : null,
          mode: c?.mode ?? null,
          updatedAt: c?.updated_at ?? null,
          websites: (maps.data ?? []).filter((m: any) => m.account_id === a.id && m.is_enabled).length,
        };
      }),
    };
  });

const SaveAccountInput = z.object({
  accountId: z.string().uuid().optional(),
  label: z.string().trim().min(2).max(80),
  accountKey: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,30}$/, "Use letters, numbers and _ only").optional(),
  clientId: z.string().trim().min(4).max(200),
  clientSecret: z.string().trim().min(8).max(500),
  mode: z.enum(["production", "sandbox"]),
});

export const saveCashfreeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SaveAccountInput.parse(i))
  .handler(async ({ data, context }) => {
    // Only super admins may enter or change payment secrets.
    await assertRole(context.supabase, ["super_admin"]);
    const { testCashfreeCreds, encryptPaymentSecret } = await import("@/lib/payments/cashfree-accounts.server");
    const check = await testCashfreeCreds({ clientId: data.clientId, clientSecret: data.clientSecret, isProd: data.mode === "production" });
    if (!check.ok) return { ok: false, message: check.message };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    let accountId = data.accountId;
    if (accountId) {
      const { data: a } = await db.from("cashfree_merchant_accounts").select("id, is_legacy").eq("id", accountId).maybeSingle();
      if (!a) return { ok: false, message: "Merchant account not found." };
      if (a.is_legacy) return { ok: false, message: "The original account uses the main project keys and cannot be changed here." };
      await db.from("cashfree_merchant_accounts").update({ label: data.label, updated_at: new Date().toISOString() }).eq("id", accountId);
    } else {
      if (!data.accountKey) return { ok: false, message: "Enter a short account code." };
      const { data: created, error } = await db.from("cashfree_merchant_accounts")
        .insert({ account_key: data.accountKey, label: data.label, is_legacy: false, is_active: true })
        .select("id").single();
      if (error || !created) return { ok: false, message: error?.code === "23505" ? "That account code is already used." : "Could not create the account." };
      accountId = created.id as string;
    }
    const ciphertext = await encryptPaymentSecret(data.clientSecret, accountId!);
    const { error: credErr } = await db.from("cashfree_account_credentials").upsert({
      account_id: accountId, client_id: data.clientId, client_secret_ciphertext: ciphertext, mode: data.mode,
      updated_by: context.userId, updated_at: new Date().toISOString(),
    }, { onConflict: "account_id" });
    if (credErr) return { ok: false, message: "Could not save the keys." };
    return { ok: true, message: `${check.message} Saved securely.` };
  });

export const setCashfreeAccountActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ accountId: z.string().uuid(), isActive: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("cashfree_merchant_accounts")
      .update({ is_active: data.isActive, updated_at: new Date().toISOString() }).eq("id", data.accountId);
    if (error) throw new Error("Could not update the account.");
    return { ok: true };
  });

export const setWebsiteCashfreeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ websiteId: z.string().uuid(), accountId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: a } = await db.from("cashfree_merchant_accounts").select("id, is_legacy, is_active").eq("id", data.accountId).maybeSingle();
    if (!a || !a.is_active) throw new Error("Choose an active merchant account.");
    if (!a.is_legacy) {
      const { data: c } = await db.from("cashfree_account_credentials").select("account_id").eq("account_id", a.id).maybeSingle();
      if (!c) throw new Error("Add this account's keys before linking a website.");
    }
    const { error } = await db.from("cashfree_website_accounts").upsert({
      website_id: data.websiteId, account_id: data.accountId, is_enabled: true, updated_at: new Date().toISOString(),
    }, { onConflict: "website_id" });
    if (error) throw new Error("Could not link the website.");
    return { ok: true };
  });
