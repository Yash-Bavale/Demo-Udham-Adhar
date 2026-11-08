import { isFieldVisible } from "@/lib/onboarding/schemas";
import { createServerFn } from "@tanstack/react-start";
import { baseServiceCode } from "@/lib/services/base-code";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MAX_DOC_SIZE_BYTES,
  ALLOWED_DOC_MIME,
  type OnboardingSchema,
} from "./schemas";
import { SERVICES } from "@/lib/constants";

const DEFAULT_ADMIN_EMAIL = "help@businesshelpservices.com";

const LeadCode = z.string().trim().regex(/^[A-Z]{2}-\d{4}-\d{6}$/, "Invalid reference code");

async function loadLeadByCode(admin: any, leadCode: string) {
  const { data, error } = await admin
    .from("leads")
    .select("id, lead_code, name, email, mobile, service, service_id, status, total_amount")
    .eq("lead_code", leadCode)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("We couldn't find that reference. Please double-check the link.");
  return data;
}

const AccessToken = z.string().trim().min(10).max(200);

/** Load a lead only after the customer's access token is verified for `scope`. */
async function loadAuthorizedLead(admin: any, leadCode: string, token: string, scope: import("@/lib/security/customer-access-core").AccessScope) {
  const { assertCustomerAccess, leadIdByCode } = await import("@/lib/security/customer-access.server");
  const { GENERIC_LINK_ERROR } = await import("@/lib/security/customer-access-core");
  const leadId = await leadIdByCode(leadCode);
  await assertCustomerAccess(token, leadId, scope, leadCode);
  try {
    return await loadLeadByCode(admin, leadCode);
  } catch {
    throw new Error(GENERIC_LINK_ERROR);
  }
}


/**
 * Resolve the correct service_code for a lead.
 *
 * Resolution order (most reliable → least reliable):
 * 1. service_id FK — look up service_code from services table. Immune to renames.
 * 2. onboarding_submissions.service_code — saved when form was first loaded/submitted. Also immune to renames.
 * 3. Text match against current service_name values in DB (catches unlinked leads whose service name still matches).
 * 4. Hardcoded legacy aliases — very old leads with old name labels.
 * 5. SERVICES constant slug match.
 * 6. Ultimate fallback: "new-udyam-registration" (with console warning).
 */
async function resolveServiceCode(
  admin: any,
  serviceId: string | null | undefined,
  leadId: string | null | undefined,
  serviceLabel: string | null | undefined,
): Promise<string> {
  // 1️⃣ service_id FK — the gold standard, unaffected by any name or label change
  if (serviceId) {
    const { data } = await admin
      .from("services")
      .select("service_code")
      .eq("id", serviceId)
      .maybeSingle();
    if (data?.service_code) return data.service_code as string;
  }

  // 2️⃣ onboarding_submissions.service_code — stored at form load time, never re-derived
  //    Reliable even for old leads without service_id, after their first visit
  if (leadId) {
    const { data: sub } = await admin
      .from("onboarding_submissions")
      .select("service_code")
      .eq("lead_id", leadId)
      .not("service_code", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sub?.service_code) return sub.service_code as string;
  }

  // 3️⃣ Current DB service_name match — for old leads with no service_id and no prior submission
  if (serviceLabel) {
    const normalized = serviceLabel.trim().toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
    const { data: svcRows } = await admin
      .from("services")
      .select("service_code, service_name")
      .limit(200);
    if (svcRows?.length) {
      const match = (svcRows as Array<{ service_code: string; service_name: string }>).find(
        (r) => r.service_name.trim().toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ") === normalized,
      );
      if (match) return match.service_code;
    }
  }

  // 4️⃣ Hardcoded legacy aliases — very old leads with old name labels that no longer exist in DB
  if (serviceLabel) {
    const normalized = serviceLabel.trim().toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
    const aliases: Record<string, string> = {
      "new udyam registration": "new-udyam-registration",
      "new business help services": "new-udyam-registration",
      "update udyam certificate": "update-udyam-certificate",
      "download udyam certificate": "download-udyam-certificate",
      "udyam registration certificate download": "download-udyam-certificate",
      "download old udyam certificate": "download-udyam-certificate",
      "3 page udyam certificate download": "download-udyam-certificate",
      migrate: "migrate-udyog-aadhaar-to-udyam",
      "udyog aadhaar to udyam migration": "migrate-udyog-aadhaar-to-udyam",
      "udyog aadhar to udyam migration": "migrate-udyog-aadhaar-to-udyam",
      "forgot registered mobile / email": "forgot-mobile-email",
      "forgot registered mobile/email": "forgot-mobile-email",
      "correct pan / aadhaar name in udyam": "correct-pan-aadhaar",
      "correct pan / aadhar name in udyam": "correct-pan-aadhaar",
      "talk to expert": "talk-to-expert",
      "talk to expert - suitable service selection": "talk-to-expert",
      "expert consultation": "talk-to-expert",
    };
    if (aliases[normalized]) return aliases[normalized];

    // 5️⃣ SERVICES constant slug match
    const match = SERVICES.find(
      (s) => s.label.trim().toLowerCase().replace(/[–—]/g, "-") === normalized,
    );
    if (match?.slug) return match.slug;
  }

  // 6️⃣ Ultimate fallback
  console.warn(`[resolveServiceCode] Could not resolve service code for label="${serviceLabel}" id="${serviceId}" leadId="${leadId}" — falling back to new-udyam-registration`);
  return "new-udyam-registration";
}

/** Public: read everything needed to render the onboarding form. */
export const getOnboarding = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ leadCode: LeadCode, accessToken: AccessToken }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadServiceSchema } = await import("@/lib/forms/schema-loader.server");
    const lead = await loadAuthorizedLead(supabaseAdmin, data.leadCode, data.accessToken, "onboarding");
    const serviceCode = await resolveServiceCode(supabaseAdmin, (lead as any).service_id, lead.id, lead.service);
    const schema: OnboardingSchema = await loadServiceSchema(serviceCode);

    const [submissionRes, docsRes, paidPaymentRes] = await Promise.all([
      supabaseAdmin
        .from("onboarding_submissions")
        .select("id, form_data, status, submitted_at, updated_at")
        .eq("lead_id", lead.id)
        .maybeSingle(),
      supabaseAdmin
        .from("documents")
        .select("id, doc_type, file_name, mime_type, size_bytes, status, remarks, uploaded_at")
        .eq("lead_id", lead.id)
        .order("uploaded_at", { ascending: false }),
      supabaseAdmin
        .from("payments")
        .select("id")
        .eq("lead_id", lead.id)
        .eq("status", "paid")
        .limit(1)
        .maybeSingle(),
    ]);

    if (submissionRes.error) throw new Error(submissionRes.error.message);
    if (docsRes.error) throw new Error(docsRes.error.message);

    const paid =
      !!paidPaymentRes.data ||
      lead.status === "payment_successful" ||
      lead.status === "under_process" ||
      lead.status === "completed";

    return {
      lead: {
        leadCode: lead.lead_code,
        name: lead.name,
        email: lead.email,
        mobile: lead.mobile,
        service: lead.service,
        status: lead.status,
        paid,
      },
      serviceCode,
      schema,
      submission: submissionRes.data,
      documents: docsRes.data ?? [],
    };
  });

const SubmitInput = z.object({
  leadCode: LeadCode,
  accessToken: AccessToken,
  // List-type answers (NIC activities, plants, bank details) are JSON strings and can be long.
  data: z.record(z.string().min(1).max(80), z.union([z.string().max(50000), z.number(), z.boolean(), z.null()])),
  draft: z.boolean().optional(),
});

/** Public: save / submit the form data. Validates against the service schema. */
export const submitOnboarding = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => SubmitInput.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadServiceSchema } = await import("@/lib/forms/schema-loader.server");
    const lead = await loadAuthorizedLead(supabaseAdmin, data.leadCode, data.accessToken, "onboarding");
    const serviceCode = await resolveServiceCode(supabaseAdmin, (lead as any).service_id, lead.id, lead.service);
    const schema = await loadServiceSchema(serviceCode);

    // Merge with any previously-saved draft values
    let mergedData: Record<string, any> = { ...data.data };
    const { data: prev } = await supabaseAdmin
      .from("onboarding_submissions")
      .select("form_data")
      .eq("lead_id", lead.id)
      .maybeSingle();
    if (prev?.form_data) {
      mergedData = { ...(prev.form_data as Record<string, any>), ...mergedData };
    }
    {
      const { promoteNicActivities } = await import("@/lib/onboarding/nic-fill");
      mergedData = promoteNicActivities(mergedData);
    }
    const validationFields = schema.fields;

    // Validate required fields on submit
    if (!data.draft) {
      const missing: string[] = [];
      for (const f of validationFields) {
        if (!f.required) continue;
        if (!isFieldVisible(f, validationFields, mergedData)) continue;
        const v = mergedData[f.key];
        if (v === undefined || v === null || String(v).trim() === "") missing.push(f.label);
      }
      if (missing.length) throw new Error("Please fill: " + missing.slice(0, 4).join(", ") + (missing.length > 4 ? "…" : ""));

      // Date of Commencement must not be later than Date of Incorporation / Registration
      const incDate = mergedData.incorporation_date;
      const comDate = mergedData.commencement_date;
      if (incDate && comDate && String(comDate) < String(incDate)) {
        throw new Error("Date of Commencement cannot be earlier than Date of Incorporation / Registration.");
      }

      // Sanitize inputs (e.g. lowercase emails)
      for (const f of validationFields) {
        const key = f.key;
        if (typeof mergedData[key] === "string") {
          const isEmail = f.type === "email" || key.toLowerCase().includes("email") || f.label.toLowerCase().includes("email");
          if (isEmail) {
            mergedData[key] = String(mergedData[key]).trim().toLowerCase();
          }
        }
      }

      // Check Plants requirement on server
      const plantsField = validationFields.find((f) => String(f.type) === "plants" || f.key === "plants");
      if (plantsField && isFieldVisible(plantsField, validationFields, mergedData)) {
        const rawPlants = mergedData[plantsField.key || "plants"];
        let plantArr: any[] = [];
        if (typeof rawPlants === "string" && rawPlants.trim()) {
          try { plantArr = JSON.parse(rawPlants); } catch {}
        } else if (Array.isArray(rawPlants)) {
          plantArr = rawPlants;
        }
        if (!Array.isArray(plantArr) || plantArr.length === 0) {
          throw new Error("At least one Plant / Unit detail is required.");
        }
        for (let i = 0; i < plantArr.length; i++) {
          const p = plantArr[i] || {};
          if (!p.unit_name || !p.city || !p.state || !p.pincode) {
            throw new Error(`Plant / Unit #${i + 1} is missing required address details.`);
          }
          const limits: Array<[string, string, number]> = [
            ["address_flat", "Flat / Door / Block No.", 20],
            ["address_premises", "Name of Premises / Building", 50],
            ["address_village", "Village / Town", 30],
            ["address_block", "Block", 30],
            ["address_road", "Road / Street / Lane", 30],
            ["city", "City", 25],
          ];
          for (const [k, label, max] of limits) {
            if (p[k] && String(p[k]).length > max) {
              throw new Error(`Plant / Unit #${i + 1}: ${label} can be at most ${max} characters.`);
            }
          }
        }
      }

      // Pattern validation (case-insensitive flag "i")
      for (const f of validationFields) {
        if (!f.pattern) continue;
        if (!isFieldVisible(f, validationFields, mergedData)) continue;
        const v = mergedData[f.key];
        if (v === undefined || v === null || String(v).trim() === "") continue;
        const valStr = String(v).trim();
        const rawPat = /^UDYAM-X+-X+-X+$/i.test(f.pattern.trim())
          ? "^(UDYAM-[A-Z]{2}-\\d{2}-\\d{7}|[A-Z0-9-]{8,25})$"
          : f.pattern;
        const pat = rawPat.startsWith("^") && rawPat.endsWith("$")
          ? rawPat
          : `^(${rawPat})$`;
        try {
          if (!new RegExp(pat, "i").test(valStr)) {
            throw new Error(`Invalid format for ${f.label}.`);
          }
        } catch (err) {
          if (err instanceof Error && err.message.startsWith("Invalid format")) throw err;
          try {
            if (!new RegExp(f.pattern, "i").test(valStr)) {
              throw new Error(`Invalid format for ${f.label}.`);
            }
          } catch (e2) {
            if (e2 instanceof Error && e2.message.startsWith("Invalid format")) throw e2;
          }
        }
      }
    }


    // Find latest application (if any) to link — fetch status fields so we can
    // detect terminal orders and prevent a closed order from being re-opened.
    const { data: app } = await supabaseAdmin
      .from("applications")
      .select("id, order_status, fulfillment_status, closure_stage, workflow_status, form_status, form_submitted_at")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Determine whether the linked order is in a terminal state.
    // A closed/completed/refunded order must NEVER be re-opened by a customer
    // form submission — the form data is saved below, but status fields are left untouched.
    const TERMINAL_ORDER_STATUSES = new Set(["CLOSED", "COMPLETED", "REFUNDED", "CANCELLED"]);
    const CLOSED_FULFILLMENT = new Set([
      "order_closed", "cancelled", "application_rejected", "certificate_rejected",
      "order_completed", "completed", "certificate_delivered", "service_completed",
      "application_approved", "approved", "refunded",
    ]);
    const isTerminalOrder = Boolean(
      app &&
      (
        TERMINAL_ORDER_STATUSES.has((app.order_status ?? "").toUpperCase()) ||
        CLOSED_FULFILLMENT.has(app.fulfillment_status ?? "") ||
        app.closure_stage === "closed" ||
        app.closure_stage === "final_ticket_closed" ||
        app.workflow_status === "closed" ||
        app.workflow_status === "refund_closed"
      )
    );

    const now = new Date().toISOString();

    const { data: existingSub } = await supabaseAdmin
      .from("onboarding_submissions")
      .select("id, status, submitted_at")
      .eq("lead_id", lead.id)
      .maybeSingle();

    const isAlreadySubmitted =
      existingSub?.status === "submitted" ||
      Boolean(app?.form_submitted_at) ||
      app?.form_status === "submitted" ||
      isTerminalOrder;

    const targetStatus = data.draft && !isAlreadySubmitted ? "draft" : "submitted";
    const targetSubmittedAt =
      data.draft && !isAlreadySubmitted
        ? null
        : (existingSub?.submitted_at || app?.form_submitted_at || now);

    const { error } = await supabaseAdmin
      .from("onboarding_submissions")
      .upsert(
        {
          lead_id: lead.id,
          application_id: app?.id ?? null,
          service_code: serviceCode,
          form_data: mergedData,
          status: targetStatus,
          submitted_at: targetSubmittedAt,
        },
        { onConflict: "lead_id" },
      );
    if (error) throw new Error(error.message);

    if (!data.draft && app?.id && !isTerminalOrder) {
      // form_status is a free-text column managed alongside the audited status transition.
      // Only runs for active (non-terminal) orders — closed orders keep their status unchanged.
      await supabaseAdmin
        .from("applications")
        .update({
          form_status: "submitted",
          form_submitted_at: now,
          order_status: "FORM_RECEIVED",
          fulfillment_status: "form_submitted",
          customer_hold_started_at: null,
          workflow_status: "processing",
          workflow_delay_reason: null,
          active_reason_id: null,
          active_reason_text: null,
        } as never)
        .eq("id", app.id);

      const { transitionStatusSystem } = await import("@/lib/applications/transitions.server");
      const tr = await transitionStatusSystem({
        applicationId: app.id,
        toStatus: "details_pending",
        reason: "Onboarding details submitted",
      });
      if (!tr.ok) console.warn("[onboarding] transition skipped:", tr.reason);

      // Form is in — stop the nudge / auto-close countdown.
      try {
        const { cancelTimers } = await import("@/lib/orders/actions/timers.server");
        await cancelTimers(app.id, ["form_pending_nudge_4h", "form_pending_autoclose_8h", "customer_hold_reminder"]);
        await supabaseAdmin
          .from("workflow_reminders")
          .update({ status: "cancelled" } as never)
          .eq("application_id", app.id)
          .eq("kind", "pending_closure_followup")
          .in("status", ["pending", "failed"]);
        const { cancelAllForOrder } = await import("@/lib/scheduling/schedulers.server");
        await cancelAllForOrder(app.id, "form_submitted");
      } catch (e) {
        console.error("[onboarding] cancelling form timers failed", e);
      }
    } else if (!data.draft && app?.id && isTerminalOrder) {
      // Order is closed/completed — log for visibility but do not touch any status fields.
      console.warn(
        `[onboarding] Skipped status update for terminal order ${app.id} ` +
        `(order_status=${app.order_status}, fulfillment_status=${app.fulfillment_status}). ` +
        `Form data has been saved to onboarding_submissions.`
      );
    }

    // Fire completion emails on final submit (best-effort, never blocks)
    if (!data.draft) {
      const { count: docCount } = await supabaseAdmin
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", lead.id);

      const { data: smtp } = await supabaseAdmin
        .from("smtp_settings")
        .select("reply_to")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const adminTo = smtp?.reply_to ?? DEFAULT_ADMIN_EMAIL;

      const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");
      await enqueueFromTemplateInternal("admin_onboarding_submitted", adminTo, {
        customer_name: lead.name ?? "",
        name: lead.name ?? "",
        lead_code: lead.lead_code ?? "",
        service_name: lead.service ?? "",
        service: lead.service ?? "",
        document_count: docCount ?? 0,
      }, {
        leadId: lead.id,
        applicationId: app?.id ?? undefined,
      }).catch((e: unknown) => console.error("admin onboarding notification failed:", e));

      // Emit internal CRM notification to assigned employee and admins
      try {
        const { emitToRole, emitNotification } = await import("@/lib/notifications/emit.server");
        if (lead.assigned_to) {
          await emitNotification({
            userId: lead.assigned_to,
            kind: "form_submitted",
            title: "Form Details Submitted",
            body: `${lead.name ?? "Customer"} submitted details for ${lead.service ?? ""}`,
            href: `/admin/leads/${lead.id}`,
            entityKind: "lead",
            entityId: lead.id,
          });
        }
        await emitToRole("admin", {
          kind: "form_submitted",
          title: "Form Details Submitted",
          body: `${lead.name ?? "Customer"} submitted details for ${lead.service ?? ""}`,
          href: `/admin/leads/${lead.id}`,
          entityKind: "lead",
          entityId: lead.id,
        });
        await emitToRole("super_admin", {
          kind: "form_submitted",
          title: "Form Details Submitted",
          body: `${lead.name ?? "Customer"} submitted details for ${lead.service ?? ""}`,
          href: `/admin/leads/${lead.id}`,
          entityKind: "lead",
          entityId: lead.id,
        });
      } catch (e: unknown) {
        console.error("Internal notification emitting failed:", e);
      }
    }

    return { ok: true };
  });

const UploadReqInput = z.object({
  leadCode: LeadCode,
  accessToken: AccessToken,
  docType: z.string().trim().min(1).max(60),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().min(1).max(MAX_DOC_SIZE_BYTES, `File too large. Max ${Math.round(MAX_DOC_SIZE_BYTES / 1024 / 1024)} MB.`),
});

/** Public: get a short-lived signed upload URL. Validates type + size first. */
export const requestDocumentUpload = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => UploadReqInput.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!ALLOWED_DOC_MIME.includes(data.mimeType.toLowerCase())) {
      throw new Error("Unsupported file type. Use PDF, JPG, PNG or WEBP.");
    }
    const lead = await loadAuthorizedLead(supabaseAdmin, data.leadCode, data.accessToken, "documents");
    const ext = (data.fileName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "bin";
    const safeDocType = data.docType.replace(/[^a-z0-9_-]/gi, "_").slice(0, 40);
    const path = `${lead.id}/${safeDocType}-${Date.now()}.${ext}`;

    const { data: signed, error } = await supabaseAdmin
      .storage
      .from("documents")
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "Could not start upload.");

    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

const ConfirmInput = z.object({
  leadCode: LeadCode,
  accessToken: AccessToken,
  docType: z.string().min(1).max(60),
  filePath: z.string().min(1).max(400),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().min(1).max(MAX_DOC_SIZE_BYTES),
});

/** Public: after upload completes, register the file row. Replaces any earlier row for the same doc_type. */
export const confirmDocumentUpload = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ConfirmInput.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const lead = await loadAuthorizedLead(supabaseAdmin, data.leadCode, data.accessToken, "documents");
    if (!data.filePath.startsWith(`${lead.id}/`) || data.filePath.includes("..")) {
      throw new Error("Upload could not be verified. Please try again.");
    }

    // Find any existing doc of same type to replace (keeps storage tidy)
    const { data: existing } = await supabaseAdmin
      .from("documents")
      .select("id, file_path")
      .eq("lead_id", lead.id)
      .eq("doc_type", data.docType);

    if (existing && existing.length) {
      const oldPaths = existing.map((r) => r.file_path);
      await supabaseAdmin.storage.from("documents").remove(oldPaths);
      await supabaseAdmin.from("documents").delete().in("id", existing.map((r) => r.id));
    }

    const { data: app } = await supabaseAdmin
      .from("applications")
      .select("id")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("documents").insert({
      lead_id: lead.id,
      application_id: app?.id ?? null,
      doc_type: data.docType,
      file_path: data.filePath,
      file_name: data.fileName,
      mime_type: data.mimeType,
      size_bytes: data.sizeBytes,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ───────────────────────────────────── Admin ─────────────────────────────────────

export const listOnboardingForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ leadId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [subRes, docRes] = await Promise.all([
      supabase
        .from("onboarding_submissions")
        .select("id, service_code, form_data, status, submitted_at, updated_at")
        .eq("lead_id", data.leadId)
        .maybeSingle(),
      supabase
        .from("documents")
        .select("id, doc_type, file_name, file_path, mime_type, size_bytes, status, remarks, uploaded_at, verified_at")
        .eq("lead_id", data.leadId)
        .order("uploaded_at", { ascending: false }),
    ]);
    if (subRes.error) throw new Error(subRes.error.message);
    if (docRes.error) throw new Error(docRes.error.message);
    return { submission: subRes.data, documents: docRes.data ?? [] };
  });

export const getDocumentSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { supabase } = context;
    // Staff-only: verify the caller is signed-in staff, then read with the
    // admin client. Reading through RLS returned 0 rows for some staff roles,
    // which surfaced as "Cannot coerce the result to a single JSON object".
    const { data: isStaff } = await supabase.rpc("has_any_staff_role", {
      _user_id: context.userId,
    });
    if (!isStaff) throw new Error("Not authorized.");
    const { data: doc, error } = await supabaseAdmin
      .from("documents")
      .select("file_path")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Document not found.");
    const { data: signed, error: sErr } = await supabaseAdmin
      .storage
      .from("documents")
      .createSignedUrl(doc.file_path, 60 * 10);
    if (sErr || !signed) throw new Error(sErr?.message ?? "Could not generate link.");
    return { url: signed.signedUrl };
  });

export const setDocumentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "approved", "rejected"]),
      remarks: z.string().max(500).optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const verified = data.status === "approved";
    const { error } = await supabase
      .from("documents")
      .update({
        status: data.status,
        remarks: data.remarks ?? null,
        verified_by: verified ? userId : null,
        verified_at: verified ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Public: customer pressed "Contact our team for help" on the onboarding shell.
 *  Logs an activity so the CRM lead timeline shows the request. Best-effort. */
export const requestFormHelp = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ leadCode: LeadCode, accessToken: AccessToken }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const lead = await loadAuthorizedLead(supabaseAdmin, data.leadCode, data.accessToken, "help");
    await supabaseAdmin.from("activity_logs").insert({
      lead_id: lead.id,
      activity_type: "form_help_requested",
      activity_description:
        "Customer requested help submitting the onboarding form. Please contact them on the registered mobile number.",
    });
    return { ok: true };
  });
