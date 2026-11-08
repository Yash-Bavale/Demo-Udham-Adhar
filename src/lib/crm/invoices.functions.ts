import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole } from "@/lib/audit";
import type { InvoiceData } from "@/lib/invoices/pdf.server";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

// Place of supply / GSTIN for the seller. Override per-environment.
const COMPANY_STATE = (process.env.COMPANY_STATE ?? "Maharashtra").trim();
const COMPANY_GSTIN = (process.env.COMPANY_GSTIN ?? "27COFPD1743E2ZB").trim() || null;

const DEFAULT_SAC = "998311";
const GST_RATE = 18; // %

const BUCKET = "invoices";

/** Append a lifecycle event for an invoice. Never throws — failures are logged. */
async function logInvoiceEvent(
  invoiceId: string,
  eventType: "generated" | "regenerated" | "replaced" | "emailed" | "email_failed" | "delivery_update" | "preview",
  detail: Record<string, unknown> = {},
  actor?: { id?: string | null; label?: string | null },
): Promise<void> {
  try {
    const admin = await getAdmin();
    await (admin as any).from("invoice_events").insert({
      invoice_id: invoiceId,
      event_type: eventType,
      actor_id: actor?.id ?? null,
      actor_label: actor?.label ?? "system",
      detail,
    });
  } catch (e) {
    console.error("[invoice_events] log failed", e);
  }
}

export async function generateAndStore(paymentId: string, actor?: { id?: string | null; label?: string | null }): Promise<string> {
  const admin = await getAdmin();

  const { data: payment, error: pErr } = await admin
    .from("payments")
    .select("id, lead_id, application_id, amount, base_amount, gst_amount, gateway_name, transaction_id, payment_date, created_at, status")
    .eq("id", paymentId)
    .single();
  if (pErr || !payment) throw new Error(pErr?.message ?? "Payment not found");
  if (payment.status !== "paid") throw new Error("Invoice can only be generated for paid payments");

  const { data: lead } = await admin
    .from("leads")
    .select("id, lead_code, name, email, mobile, state, service, service_id, gstin")
    .eq("id", payment.lead_id)
    .single();
  if (!lead) throw new Error("Lead not found");

  let applicationCode: string | null = null;
  if (payment.application_id) {
    const { data: app } = await admin
      .from("applications")
      .select("application_code")
      .eq("id", payment.application_id)
      .maybeSingle();
    applicationCode = app?.application_code ?? null;
  }

  let sacCode: string = DEFAULT_SAC;
  if (lead.service_id) {
    const { data: svc } = await admin
      .from("services").select("sac_code").eq("id", lead.service_id).maybeSingle();
    if (svc?.sac_code) sacCode = svc.sac_code;
  }

  const { data: existing } = await admin
    .from("invoices")
    .select("id, invoice_number, pdf_path, customer_gstin_snapshot")
    .eq("payment_id", paymentId)
    .is("cancelled_at", null)
    .maybeSingle();

  // GST split — pin SNAPSHOTS so future changes to company state don't alter history.
  const customerState = (lead.state ?? "").trim();
  const isIntraState = !!customerState && customerState.toLowerCase() === COMPANY_STATE.toLowerCase();
  const gstTotal = Number(payment.gst_amount);
  const cgst = isIntraState ? gstTotal / 2 : 0;
  const sgst = isIntraState ? gstTotal / 2 : 0;
  const igst = isIntraState ? 0 : gstTotal;
  const cgstRate = isIntraState ? GST_RATE / 2 : 0;
  const sgstRate = isIntraState ? GST_RATE / 2 : 0;
  const igstRate = isIntraState ? 0 : GST_RATE;

  const snapshotFields: Record<string, any> = {
    cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst,
    cgst_rate: cgstRate, sgst_rate: sgstRate, igst_rate: igstRate,
    place_of_supply: customerState || null,
    company_state_snapshot: COMPANY_STATE,
    customer_state_snapshot: customerState || null,
    company_gstin_snapshot: COMPANY_GSTIN,
    customer_gstin_snapshot: lead.gstin ?? null,
    sac_code: sacCode,
  };

  let invoiceId: string;
  let invoiceNumber: string;
  if (existing) {
    invoiceId = existing.id;
    invoiceNumber = existing.invoice_number!;
    if (!existing.pdf_path) {
      await admin.from("invoices").update(snapshotFields as any).eq("id", invoiceId);
    }
  } else {
    const { data: row, error: invErr } = await (admin as any)
      .from("invoices")
      .insert({
        lead_id: payment.lead_id,
        application_id: payment.application_id,
        payment_id: payment.id,
        base_amount: Number(payment.base_amount),
        gst_amount: gstTotal,
        total_amount: Number(payment.amount),
        ...snapshotFields,
      })
      .select("id, invoice_number")
      .single();
    if (invErr?.code === "23505") {
      // Another confirmation created the invoice at the same moment — reuse it.
      const { data: winner } = await admin
        .from("invoices").select("id, invoice_number")
        .eq("payment_id", paymentId).is("cancelled_at", null).maybeSingle();
      if (!winner) throw new Error(invErr.message);
      invoiceId = winner.id;
      invoiceNumber = winner.invoice_number!;
    } else {
      if (invErr || !row) throw new Error(invErr?.message ?? "Could not create invoice");
      invoiceId = row.id;
      invoiceNumber = row.invoice_number!;
    }
  }

  const data: InvoiceData = {
    invoiceNumber,
    invoiceDate: payment.payment_date ? new Date(payment.payment_date) : new Date(payment.created_at),
    customerName: lead.name,
    customerEmail: lead.email,
    customerMobile: lead.mobile,
    customerState: lead.state,
    serviceName: lead.service,
    leadCode: lead.lead_code!,
    applicationCode,
    baseAmount: Number(payment.base_amount),
    gstAmount: Number(payment.gst_amount),
    totalAmount: Number(payment.amount),
    cgstAmount: cgst,
    sgstAmount: sgst,
    igstAmount: igst,
    sacCode,
    placeOfSupply: customerState || null,
    customerGstin: (existing ? (existing as any).customer_gstin_snapshot : lead.gstin) ?? null,
    paymentId: payment.transaction_id ?? null,
    gatewayName: payment.gateway_name,
  };

  const { renderInvoicePdf } = await import("@/lib/invoices/pdf.server");
  const pdfBytes = await renderInvoicePdf(data);
  const path = `${new Date(payment.payment_date ?? payment.created_at).getFullYear()}/${invoiceNumber}.pdf`;

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

  await admin.from("invoices").update({
    pdf_path: path,
    pdf_generated_at: new Date().toISOString(),
  }).eq("id", invoiceId);

  await logInvoiceEvent(
    invoiceId,
    existing ? "regenerated" : "generated",
    { invoice_number: invoiceNumber, pdf_path: path, payment_id: paymentId },
    actor,
  );

  return invoiceId;
}

export const generateInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ paymentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin", "finance"]);
    const id = await generateAndStore(data.paymentId);
    return { ok: true, invoiceId: id };
  });

// Internal (called from webhook). Same logic, no auth — used right after we
// verify the gateway signature server-to-server.
export async function generateInvoiceInternal(paymentId: string) {
  return generateAndStore(paymentId);
}

/** Load the latest invoice PDF for a payment as a base64 email attachment. */
export async function loadInvoiceAttachmentByPayment(paymentId: string): Promise<
  { filename: string; content_base64: string; content_type: string } | null
> {
  const admin = await getAdmin();
  const { data: inv } = await admin
    .from("invoices")
    .select("invoice_number, pdf_path, application_id, lead_id")
    .eq("payment_id", paymentId)
    .is("cancelled_at", null)
    .maybeSingle();
  if (!inv?.pdf_path) return null;
  const { data: blob, error } = await admin.storage.from(BUCKET).download(inv.pdf_path);
  if (error || !blob) return null;
  const buf = new Uint8Array(await blob.arrayBuffer());
  // base64 encode
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const b64 = btoa(bin);

  // Pretty file name: prefer order/application code if available.
  let orderRef = inv.invoice_number;
  if (inv.application_id) {
    const { data: app } = await admin
      .from("applications").select("application_code").eq("id", inv.application_id).maybeSingle();
    if (app?.application_code) orderRef = app.application_code;
  } else if (inv.lead_id) {
    const { data: l } = await admin
      .from("leads").select("lead_code").eq("id", inv.lead_id).maybeSingle();
    if (l?.lead_code) orderRef = l.lead_code;
  }
  return {
    filename: `Invoice-${orderRef}.pdf`,
    content_base64: b64,
    content_type: "application/pdf",
  };
}

/**
 * Internal helper used by webhooks (and any non-auth server path) to mark an
 * invoice as emailed/failed and log a lifecycle event. Never throws — failures
 * are logged so they don't break the payment-success workflow.
 */
export async function markInvoiceEmailedByPayment(
  paymentId: string,
  opts: {
    recipient: string;
    template: string;
    attachmentFilename?: string | null;
    success: boolean;
    error?: string | null;
    actorLabel?: string;
  },
): Promise<void> {
  try {
    const admin = await getAdmin();
    const { data: inv } = await admin
      .from("invoices")
      .select("id, email_attempts")
      .eq("payment_id", paymentId)
      .is("cancelled_at", null)
      .maybeSingle();
    if (!inv?.id) return;
    const actor = { id: null, label: opts.actorLabel ?? "webhook" };
    if (opts.success) {
      await (admin as any).from("invoices").update({
        last_emailed_at: new Date().toISOString(),
        email_attempts: Number((inv as any).email_attempts ?? 0) + 1,
        last_email_status: "queued",
        delivery_status: "queued",
      }).eq("id", inv.id);
      await logInvoiceEvent(inv.id, "emailed", {
        recipient: opts.recipient,
        attachment: opts.attachmentFilename ?? null,
        template: opts.template,
      }, actor);
    } else {
      await (admin as any).from("invoices").update({
        last_email_status: "failed",
        delivery_status: "failed",
        email_attempts: Number((inv as any).email_attempts ?? 0) + 1,
      }).eq("id", inv.id);
      await logInvoiceEvent(inv.id, "email_failed", {
        recipient: opts.recipient,
        template: opts.template,
        error: opts.error ?? null,
      }, actor);
    }
  } catch (e) {
    console.error("[markInvoiceEmailedByPayment] failed", e);
  }
}

async function resendInvoiceEmailCore(data: { paymentId: string }, context: any) {
    await assertRole(context.supabase, ["super_admin", "admin", "finance"]);
    const admin = await getAdmin();
    const { data: payment } = await admin
      .from("payments")
      .select("id, lead_id, application_id")
      .eq("id", data.paymentId)
      .single();
    if (!payment) throw new Error("Payment not found");

    const { data: profile } = await context.supabase
      .from("profiles").select("display_name, email").eq("id", context.userId).maybeSingle();
    const actor = { id: context.userId, label: profile?.display_name ?? profile?.email ?? "staff" };

    // Ensure invoice exists (regenerate if missing).
    let attachment = await loadInvoiceAttachmentByPayment(data.paymentId);
    if (!attachment) {
      await generateAndStore(data.paymentId, actor);
      attachment = await loadInvoiceAttachmentByPayment(data.paymentId);
    }
    if (!attachment) throw new Error("Invoice PDF unavailable");

    const { data: lead } = await admin
      .from("leads")
      .select("lead_code, name, email, mobile, service, base_amount, gst_amount, total_amount")
      .eq("id", payment.lead_id).single();
    if (!lead?.email) throw new Error("Customer email missing");

    const { data: inv } = await admin
      .from("invoices")
      .select("id, invoice_number, issued_at, sac_code, place_of_supply, cgst_amount, sgst_amount, igst_amount, base_amount, gst_amount, total_amount")
      .eq("payment_id", data.paymentId).is("cancelled_at", null).maybeSingle();

    const { data: appRow } = payment.application_id
      ? await admin.from("applications").select("id, application_code").eq("id", payment.application_id).maybeSingle()
      : await admin.from("applications").select("id, application_code").eq("lead_id", payment.lead_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { resolveApplicationCode } = await import("@/lib/orders/resolve-order-number.server");
    const orderNumber = (appRow as any)?.application_code
      ?? (await resolveApplicationCode(payment.lead_id, { applicationId: payment.application_id ?? (appRow as any)?.id ?? null }));
    if (!orderNumber) throw new Error("Order number not ready yet — please retry in a moment.");

    const { data: pay } = await admin
      .from("payments")
      .select("transaction_id, razorpay_order_id, payment_date")
      .eq("id", data.paymentId).maybeSingle();

    const { amountInWordsINR } = await import("@/lib/invoices/amount-in-words");
    const onboardingUrl = `https://udyamadhar.in/onboarding/${encodeURIComponent(lead.lead_code ?? "")}`;
    const invoiceUrl = `https://udyamadhar.in/api/public/invoice/${encodeURIComponent(lead.lead_code ?? "")}`;
    const total = Number(inv?.total_amount ?? lead.total_amount ?? 0);
    const issued = inv?.issued_at ? new Date(inv.issued_at) : new Date();
    const paidAt = pay?.payment_date ? new Date(pay.payment_date) : new Date();
    const fmtDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const fmtDateTime = (d: Date) =>
      d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) + " IST";

    const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");
    try {
      const queued = await enqueueFromTemplateInternal(
        "order_confirmation",
        lead.email,
        {
          name: lead.name ?? "",
          customer_name: lead.name ?? "",
          customer_email: lead.email,
          customer_mobile: lead.mobile ?? "",
          lead_code: lead.lead_code ?? "",
          leadCode: lead.lead_code ?? "",
          order_number: orderNumber,
          service: lead.service ?? "",
          service_name: lead.service ?? "",
          base_amount: Number(inv?.base_amount ?? lead.base_amount ?? 0).toFixed(2),
          gst_amount: Number(inv?.gst_amount ?? lead.gst_amount ?? 0).toFixed(2),
          total_amount: total.toFixed(2),
          amount: total.toFixed(2),
          amount_in_words: amountInWordsINR(total),
          invoice_number: inv?.invoice_number ?? "",
          invoice_date: fmtDate(issued),
          sac_code: inv?.sac_code ?? "998311",
          place_of_supply: inv?.place_of_supply ?? "Maharashtra",
          cgst_amount: Number(inv?.cgst_amount ?? 0).toFixed(2),
          sgst_amount: Number(inv?.sgst_amount ?? 0).toFixed(2),
          igst_amount: Number(inv?.igst_amount ?? 0).toFixed(2),
          onboarding_url: onboardingUrl,
          form_link: onboardingUrl,
          invoice_url: "",
          invoice_download_url: "",
          invoice_attachment: attachment.filename,
          transaction_id: pay?.transaction_id ?? pay?.razorpay_order_id ?? data.paymentId,
          payment_reference: pay?.transaction_id ?? pay?.razorpay_order_id ?? data.paymentId,
          payment_datetime: fmtDateTime(paidAt),
          payment_date: fmtDateTime(paidAt),
          service_fee: Number(inv?.base_amount ?? lead.base_amount ?? 0).toFixed(2),
          support_email: "help@businesshelpservices.com",
        },
        {
          toName: lead.name ?? undefined,
          leadId: payment.lead_id,
          // Manual resends are linked by lead only: the database's
          // once-per-order E001 unique index (keyed on application_id)
          // otherwise silently drops every resend after the first email.
          attachments: [attachment],
          trigger: "manual",
          allowDuplicate: true,
        },
      );
      if ((queued as any)?.skipped) {
        throw new Error("Invoice email was blocked as a duplicate — it was NOT sent.");
      }
      if (inv?.id) {
        const { data: cur } = await admin.from("invoices").select("email_attempts").eq("id", inv.id).maybeSingle();
        await (admin as any).from("invoices").update({
          last_emailed_at: new Date().toISOString(),
          email_attempts: Number((cur as any)?.email_attempts ?? 0) + 1,
          last_email_status: "queued",
          delivery_status: "queued",
        }).eq("id", inv.id);
        await logInvoiceEvent(inv.id, "emailed", {
          recipient: lead.email,
          attachment: attachment.filename,
          template: "order_confirmation",
          kind: "manual_resend",
        }, actor);
      }

    } catch (e) {
      if (inv?.id) {
        await (admin as any).from("invoices").update({
          last_email_status: "failed",
          delivery_status: "failed",
        }).eq("id", inv.id);
        await logInvoiceEvent(inv.id, "email_failed", {
          recipient: lead.email,
          error: e instanceof Error ? e.message : String(e),
        }, actor);
      }
      throw e;
    }
    return { ok: true };
}

export const resendInvoiceEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ paymentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => resendInvoiceEmailCore(data, context));


export const regenerateInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const ok = (roles ?? []).some((r) => r.role === "super_admin" || r.role === "finance");
    if (!ok) throw new Error("Forbidden");

    const admin = await getAdmin();
    const { data: inv } = await admin
      .from("invoices").select("payment_id, pdf_path").eq("id", data.invoiceId).single();
    if (!inv?.payment_id) throw new Error("Invoice not found");

    // Archive existing pdf path so it's recoverable.
    if (inv.pdf_path) {
      const archivePath = inv.pdf_path.replace(/\.pdf$/, `-${Date.now()}.pdf`).replace(/^/, "archive/");
      try {
        await admin.storage.from(BUCKET).copy(inv.pdf_path, archivePath);
        await (admin as any).rpc("noop").catch(() => null);
        const { data: row } = await admin.from("invoices")
          .select("prev_pdf_paths").eq("id", data.invoiceId).maybeSingle();
        const arr = Array.isArray((row as any)?.prev_pdf_paths) ? (row as any).prev_pdf_paths : [];
        await (admin as any).from("invoices").update({
          prev_pdf_paths: [...arr, archivePath],
        }).eq("id", data.invoiceId);
      } catch (e) {
        console.error("[invoice archive] failed", e);
      }
    }

    const { data: profile } = await context.supabase
      .from("profiles").select("display_name, email").eq("id", context.userId).maybeSingle();
    await generateAndStore(inv.payment_id, {
      id: context.userId,
      label: profile?.display_name ?? profile?.email ?? "staff",
    });
    return { ok: true };
  });

/**
 * Bulk-regenerate every existing invoice PDF using the current renderer.
 * Existing files are upserted in place (same `pdf_path`), so any old layout
 * is replaced by the new Zoho-style layout on the next download.
 * Super-admin only.
 */
export const regenerateAllInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const ok = (roles ?? []).some((r) => r.role === "super_admin");
    if (!ok) throw new Error("Forbidden");

    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("invoices")
      .select("id, payment_id")
      .not("payment_id", "is", null);
    if (error) throw new Error(error.message);

    const { data: profile } = await context.supabase
      .from("profiles").select("display_name, email").eq("id", context.userId).maybeSingle();
    const actor = { id: context.userId, label: profile?.display_name ?? profile?.email ?? "staff" };

    let ok_count = 0; const failed: { id: string; error: string }[] = [];
    for (const r of rows ?? []) {
      try {
        await generateAndStore(r.payment_id as string, actor);
        ok_count++;
      } catch (e) {
        failed.push({ id: r.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { total: (rows ?? []).length, regenerated: ok_count, failed };
  });

export const getInvoiceSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const ok = (roles ?? []).some((r) => r.role === "super_admin" || r.role === "finance" || r.role === "admin");
    if (!ok) throw new Error("Forbidden");

    const { data: inv } = await (await getAdmin())
      .from("invoices").select("pdf_path, invoice_number").eq("id", data.invoiceId).single();
    if (!inv?.pdf_path) throw new Error("Invoice PDF not generated yet");

    const { data: signed, error } = await (await getAdmin()).storage
      .from(BUCKET).createSignedUrl(inv.pdf_path, 60 * 5);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl, invoiceNumber: inv.invoice_number };
  });

export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const ok = (roles ?? []).some((r) => r.role === "super_admin" || r.role === "finance");
    if (!ok) throw new Error("Forbidden");

    const { data, error } = await (await getAdmin())
      .from("invoices")
      .select("id, invoice_number, lead_id, payment_id, total_amount, base_amount, gst_amount, issued_at, pdf_path")
      .order("issued_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

// Customer-facing: get signed URL by leadCode (no auth — scoped to that lead only)
export const getCustomerInvoiceUrl = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ leadCode: z.string().min(3).max(50) }).parse(i))
  .handler(async ({ data }) => {
    const { data: lead } = await (await getAdmin())
      .from("leads").select("id").eq("lead_code", data.leadCode).maybeSingle();
    if (!lead) throw new Error("Lead not found");
    const { data: inv } = await (await getAdmin())
      .from("invoices")
      .select("pdf_path, invoice_number")
      .eq("lead_id", lead.id)
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!inv?.pdf_path) throw new Error("Invoice not ready yet");
    const { data: signed, error } = await (await getAdmin()).storage
      .from(BUCKET).createSignedUrl(inv.pdf_path, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl, invoiceNumber: inv.invoice_number };
  });

// ── Admin list functions for /admin/payments and /admin/invoices ─────────

const PageFilters = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.string().optional(),
  gateway: z.string().optional(),
  serviceId: z.string().uuid().optional(),
  gstType: z.enum(["cgst_sgst", "igst"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});

export const listPaymentsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PageFilters.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin", "finance", "accounts"]);
    const admin = await getAdmin();
    const offset = (data.page - 1) * data.pageSize;

    let q = admin
      .from("payments")
      .select(
        "id, created_at, payment_date, amount, base_amount, gst_amount, status, gateway_name, transaction_id, lead_id, application_id",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (data.status) q = q.eq("status", data.status as any);
    if (data.gateway) q = q.eq("gateway_name", data.gateway);
    if (data.from) q = q.gte("created_at", new Date(data.from).toISOString());
    if (data.to) q = q.lte("created_at", new Date(data.to).toISOString());

    const { data: rows, count, error } = await q.range(offset, offset + data.pageSize - 1);
    if (error) throw new Error(error.message);

    const leadIds = [...new Set((rows ?? []).map((r) => r.lead_id))];
    const appIds = [...new Set((rows ?? []).map((r) => r.application_id).filter(Boolean) as string[])];
    const payIds = (rows ?? []).map((r) => r.id);

    const [{ data: leads }, { data: apps }, { data: invs }] = await Promise.all([
      admin.from("leads").select("id, name, email, mobile, lead_code, service, service_id").in("id", leadIds.length ? leadIds : ["00000000-0000-0000-0000-000000000000"]),
      appIds.length
        ? admin.from("applications").select("id, application_code").in("id", appIds)
        : Promise.resolve({ data: [] as any[] }),
      payIds.length
        ? admin.from("invoices").select("id, payment_id, invoice_number, pdf_path").in("payment_id", payIds).is("cancelled_at", null)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const leadMap = new Map((leads ?? []).map((l: any) => [l.id, l]));
    const appMap = new Map((apps ?? []).map((a: any) => [a.id, a]));
    const invMap = new Map((invs ?? []).map((i: any) => [i.payment_id, i]));

    let enriched = (rows ?? []).map((r) => {
      const l = leadMap.get(r.lead_id) ?? {};
      const a = r.application_id ? appMap.get(r.application_id) : null;
      const inv = invMap.get(r.id) ?? null;
      return {
        id: r.id,
        created_at: r.created_at,
        payment_date: r.payment_date,
        amount: Number(r.amount),
        base_amount: Number(r.base_amount),
        gst_amount: Number(r.gst_amount),
        status: r.status,
        gateway_name: r.gateway_name,
        transaction_id: r.transaction_id,
        lead_id: r.lead_id,
        application_id: r.application_id,
        application_code: a?.application_code ?? null,
        customer_name: l.name ?? "",
        customer_email: l.email ?? "",
        customer_mobile: l.mobile ?? "",
        lead_code: l.lead_code ?? "",
        service: l.service ?? "",
        service_id: l.service_id ?? null,
        invoice_id: inv?.id ?? null,
        invoice_number: inv?.invoice_number ?? null,
        has_pdf: !!inv?.pdf_path,
      };
    });

    if (data.serviceId) enriched = enriched.filter((r) => r.service_id === data.serviceId);
    if (data.q) {
      const needle = data.q.toLowerCase();
      enriched = enriched.filter((r) =>
        [r.customer_name, r.customer_email, r.customer_mobile, r.lead_code, r.application_code, r.transaction_id]
          .some((v) => (v ?? "").toString().toLowerCase().includes(needle)),
      );
    }

    return { rows: enriched, total: count ?? enriched.length, page: data.page, pageSize: data.pageSize };
  });

export const listInvoicesAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PageFilters.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin", "finance", "accounts"]);
    const admin = await getAdmin();
    const offset = (data.page - 1) * data.pageSize;

    let q = admin
      .from("invoices")
      .select(
        "id, invoice_number, issued_at, base_amount, gst_amount, total_amount, cgst_amount, sgst_amount, igst_amount, sac_code, place_of_supply, pdf_path, lead_id, application_id, payment_id, customer_gstin_snapshot",
        { count: "exact" },
      )
      .order("issued_at", { ascending: false });

    if (data.from) q = q.gte("issued_at", new Date(data.from).toISOString());
    if (data.to) q = q.lte("issued_at", new Date(data.to).toISOString());
    if (data.gstType === "igst") q = q.gt("igst_amount", 0);
    if (data.gstType === "cgst_sgst") q = q.gt("cgst_amount", 0);

    // Search across ALL invoices (not just the current page)
    if (data.q && data.q.trim()) {
      const term = data.q.trim().replace(/[%,()]/g, " ");
      const like = `%${term}%`;
      const [{ data: ml }, { data: ma }] = await Promise.all([
        admin.from("leads").select("id").or(`name.ilike.${like},email.ilike.${like},lead_code.ilike.${like},mobile.ilike.${like}`).limit(200),
        admin.from("applications").select("id").ilike("application_code", like).limit(200),
      ]);
      const ors = [`invoice_number.ilike.${like}`];
      const lids = (ml ?? []).map((r: any) => r.id);
      const aids = (ma ?? []).map((r: any) => r.id);
      if (lids.length) ors.push(`lead_id.in.(${lids.join(",")})`);
      if (aids.length) ors.push(`application_id.in.(${aids.join(",")})`);
      q = q.or(ors.join(","));
    }

    const { data: rows, count, error } = await q.range(offset, offset + data.pageSize - 1);
    if (error) throw new Error(error.message);

    const leadIds = [...new Set((rows ?? []).map((r) => r.lead_id))];
    const appIds = [...new Set((rows ?? []).map((r) => r.application_id).filter(Boolean) as string[])];

    const [{ data: leads }, { data: apps }] = await Promise.all([
      leadIds.length
        ? admin.from("leads").select("id, name, email, mobile, lead_code, service, service_id").in("id", leadIds)
        : Promise.resolve({ data: [] as any[] }),
      appIds.length
        ? admin.from("applications").select("id, application_code").in("id", appIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const leadMap = new Map((leads ?? []).map((l: any) => [l.id, l]));
    const appMap = new Map((apps ?? []).map((a: any) => [a.id, a]));

    let enriched = (rows ?? []).map((r) => {
      const l = leadMap.get(r.lead_id) ?? {};
      const a = r.application_id ? appMap.get(r.application_id) : null;
      const gstType: "cgst_sgst" | "igst" | "none" =
        Number(r.igst_amount) > 0 ? "igst" : Number(r.cgst_amount) > 0 ? "cgst_sgst" : "none";
      return {
        ...r,
        base_amount: Number(r.base_amount),
        gst_amount: Number(r.gst_amount),
        total_amount: Number(r.total_amount),
        cgst_amount: Number(r.cgst_amount),
        sgst_amount: Number(r.sgst_amount),
        igst_amount: Number(r.igst_amount),
        application_code: a?.application_code ?? null,
        customer_name: l.name ?? "",
        customer_email: l.email ?? "",
        lead_code: l.lead_code ?? "",
        service: l.service ?? "",
        service_id: l.service_id ?? null,
        gst_type: gstType,
      };
    });

    if (data.serviceId) enriched = enriched.filter((r) => r.service_id === data.serviceId);

    return { rows: enriched, total: count ?? enriched.length, page: data.page, pageSize: data.pageSize };
  });

// Filter dropdown data: distinct gateways + active services
export const getPaymentsFilterMeta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, ["super_admin", "admin", "finance", "accounts"]);
    const admin = await getAdmin();
    const [{ data: services }] = await Promise.all([
      admin.from("services").select("id, service_name").eq("is_active", true).order("service_name"),
    ]);
    return {
      services: (services ?? []) as Array<{ id: string; service_name: string }>,
      gateways: ["razorpay", "payu", "ccavenue"],
      statuses: ["created", "attempted", "paid", "failed", "refunded"],
    };
  });

// ── Lifecycle: preview / replace / events / detail ───────────────────────

const FINANCE_ROLES = ["super_admin", "admin", "finance"] as const;

async function ensureFinanceRole(ctx: any) {
  const { data: roles } = await ctx.supabase
    .from("user_roles").select("role").eq("user_id", ctx.userId);
  const ok = (roles ?? []).some((r: any) => (FINANCE_ROLES as readonly string[]).includes(r.role));
  if (!ok) throw new Error("Forbidden");
}

async function loadActor(ctx: any) {
  const { data: profile } = await ctx.supabase
    .from("profiles").select("display_name, email").eq("id", ctx.userId).maybeSingle();
  return { id: ctx.userId, label: profile?.display_name ?? profile?.email ?? "staff" };
}

/** Generate a fresh, in-memory PDF and put it in a short-lived preview path. */
export const previewInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureFinanceRole(context);
    const admin = await getAdmin();
    const { data: inv } = await admin
      .from("invoices").select("id, payment_id, invoice_number").eq("id", data.invoiceId).maybeSingle();
    if (!inv?.payment_id) throw new Error("Invoice not found");

    // Re-render PDF in memory (does not overwrite stored copy).
    const { data: payment } = await admin
      .from("payments")
      .select("id, lead_id, application_id, amount, base_amount, gst_amount, gateway_name, transaction_id, payment_date, created_at")
      .eq("id", inv.payment_id).single();
    if (!payment) throw new Error("Payment missing");
    const { data: lead } = await admin
      .from("leads").select("name, email, mobile, state, service, lead_code").eq("id", payment.lead_id).single();
    if (!lead) throw new Error("Lead missing");
    const { data: invFull } = await admin
      .from("invoices")
      .select("invoice_number, cgst_amount, sgst_amount, igst_amount, sac_code, place_of_supply, customer_gstin_snapshot")
      .eq("id", inv.id).single();
    let applicationCode: string | null = null;
    if (payment.application_id) {
      const { data: app } = await admin.from("applications").select("application_code").eq("id", payment.application_id).maybeSingle();
      applicationCode = app?.application_code ?? null;
    }
    const { renderInvoicePdf } = await import("@/lib/invoices/pdf.server");
    const pdfBytes = await renderInvoicePdf({
      invoiceNumber: invFull?.invoice_number ?? inv.invoice_number ?? "",
      invoiceDate: payment.payment_date ? new Date(payment.payment_date) : new Date(payment.created_at),
      customerName: lead.name,
      customerEmail: lead.email,
      customerMobile: lead.mobile,
      customerState: lead.state,
      serviceName: lead.service,
      leadCode: lead.lead_code!,
      applicationCode,
      baseAmount: Number(payment.base_amount),
      gstAmount: Number(payment.gst_amount),
      totalAmount: Number(payment.amount),
      cgstAmount: Number(invFull?.cgst_amount ?? 0),
      sgstAmount: Number(invFull?.sgst_amount ?? 0),
      igstAmount: Number(invFull?.igst_amount ?? 0),
      sacCode: invFull?.sac_code ?? DEFAULT_SAC,
      placeOfSupply: invFull?.place_of_supply ?? lead.state ?? null,
      customerGstin: (invFull as any)?.customer_gstin_snapshot ?? null,
      paymentId: payment.transaction_id ?? null,
      gatewayName: payment.gateway_name,
    });

    const path = `preview/${inv.id}-${Date.now()}.pdf`;
    const { error } = await admin.storage.from(BUCKET)
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (error) throw new Error(error.message);
    const { data: signed, error: sErr } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
    if (sErr) throw new Error(sErr.message);
    await logInvoiceEvent(inv.id, "preview", { path }, await loadActor(context));
    return { url: signed.signedUrl, invoiceNumber: inv.invoice_number };
  });

/** Upload a user-supplied PDF that replaces the active invoice PDF. */
export const replaceInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    invoiceId: z.string().uuid(),
    fileBase64: z.string().min(10),
    filename: z.string().max(200).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureFinanceRole(context);
    const admin = await getAdmin();
    const { data: inv } = await admin
      .from("invoices").select("id, invoice_number, pdf_path, prev_pdf_paths").eq("id", data.invoiceId).single();
    if (!inv) throw new Error("Invoice not found");

    // Archive existing PDF.
    let archivePath: string | null = null;
    if (inv.pdf_path) {
      archivePath = `archive/${inv.invoice_number}-${Date.now()}.pdf`;
      try { await admin.storage.from(BUCKET).copy(inv.pdf_path, archivePath); } catch (e) { console.error(e); }
    }

    // Decode base64 (strip data URL prefix if present).
    const b64 = data.fileBase64.replace(/^data:application\/pdf;base64,/, "");
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const path = inv.pdf_path ?? `${new Date().getFullYear()}/${inv.invoice_number}.pdf`;
    const { error: upErr } = await admin.storage.from(BUCKET)
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(upErr.message);

    const prevArr = Array.isArray((inv as any).prev_pdf_paths) ? (inv as any).prev_pdf_paths : [];
    await (admin as any).from("invoices").update({
      pdf_path: path,
      pdf_generated_at: new Date().toISOString(),
      replaced_at: new Date().toISOString(),
      prev_pdf_paths: archivePath ? [...prevArr, archivePath] : prevArr,
    }).eq("id", inv.id);

    await logInvoiceEvent(inv.id, "replaced", {
      filename: data.filename ?? null,
      prev_pdf_path: archivePath,
      size: bytes.byteLength,
    }, await loadActor(context));
    return { ok: true };
  });

export const listInvoiceEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureFinanceRole(context);
    const admin = await getAdmin();
    const { data: rows } = await (admin as any).from("invoice_events")
      .select("id, event_type, actor_label, detail, created_at")
      .eq("invoice_id", data.invoiceId)
      .order("created_at", { ascending: false });
    return { rows: rows ?? [] };
  });

export const getInvoiceDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureFinanceRole(context);
    const admin = await getAdmin();
    const { data: inv } = await admin
      .from("invoices")
      .select("id, invoice_number, issued_at, pdf_path, pdf_generated_at, base_amount, gst_amount, total_amount, cgst_amount, sgst_amount, igst_amount, sac_code, place_of_supply, lead_id, application_id, payment_id, last_emailed_at, email_attempts, last_email_status, delivery_status, replaced_at, prev_pdf_paths")
      .eq("id", data.invoiceId).maybeSingle();
    if (!inv) throw new Error("Invoice not found");

    const [{ data: events }, { data: emailLogs }] = await Promise.all([
      (admin as any).from("invoice_events")
        .select("id, event_type, actor_label, detail, created_at")
        .eq("invoice_id", data.invoiceId)
        .order("created_at", { ascending: false }),
      admin.from("email_logs")
        .select("id, to_email, subject, status, smtp_response, error_message, created_at, template_code")
        .eq("lead_id", inv.lead_id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const attachmentName = `Invoice-${inv.invoice_number}.pdf`;
    return {
      invoice: { ...inv, attachment_name: attachmentName },
      events: events ?? [],
      emailLogs: emailLogs ?? [],
    };
  });


/**
 * Add/replace the customer's GSTIN on an existing invoice (same invoice number),
 * regenerate the PDF and optionally email it again. The GSTIN snapshot drives
 * the GSTR-1 B2B export, so the invoice moves from B2C to B2B automatically.
 */
export const updateInvoiceGstin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    invoiceId: z.string().uuid(),
    gstin: z.string().trim().max(20),
    sendEmail: z.boolean().default(false),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin", "finance"]);
    const { normalizeGstin, isValidGstin } = await import("@/lib/invoices/gstin");
    const gstin = normalizeGstin(data.gstin);
    if (!isValidGstin(gstin)) throw new Error("Invalid GSTIN — please check the 15-character number.");

    const admin = await getAdmin();
    const { data: inv } = await admin
      .from("invoices").select("id, payment_id, lead_id, customer_gstin_snapshot, pdf_path")
      .eq("id", data.invoiceId).is("cancelled_at", null).maybeSingle();
    if (!inv?.payment_id) throw new Error("Invoice not found");

    // Archive current PDF so the earlier copy stays recoverable.
    if (inv.pdf_path) {
      try {
        const archivePath = `archive/${inv.pdf_path.replace(/\.pdf$/, `-${Date.now()}.pdf`)}`;
        await admin.storage.from(BUCKET).copy(inv.pdf_path, archivePath);
        const { data: row } = await admin.from("invoices").select("prev_pdf_paths").eq("id", inv.id).maybeSingle();
        const arr = Array.isArray((row as any)?.prev_pdf_paths) ? (row as any).prev_pdf_paths : [];
        await (admin as any).from("invoices").update({ prev_pdf_paths: [...arr, archivePath] }).eq("id", inv.id);
      } catch (e) { console.error("[invoice archive] failed", e); }
    }

    await (admin as any).from("invoices").update({ customer_gstin_snapshot: gstin }).eq("id", inv.id);
    await admin.from("leads").update({ gstin } as any).eq("id", inv.lead_id);

    const actor = await loadActor(context);
    await logInvoiceEvent(inv.id, "regenerated", {
      reason: "customer_gstin_updated",
      email_sent: false,
      previous_gstin: inv.customer_gstin_snapshot ?? null,
      gstin,
    }, actor);
    await generateAndStore(inv.payment_id, actor);

    // Customer email is intentionally NOT sent here; staff can use Resend later.
    return { ok: true, gstin };
  });
