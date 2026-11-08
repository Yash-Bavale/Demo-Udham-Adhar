import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole, writeAudit } from "@/lib/audit";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}


// We do NOT use PostgREST nested selects because the DB has no FK constraints.
// Fetch certificates, then hydrate leads/applications manually.

async function hydrate(rows: any[]) {
  if (rows.length === 0) return [];
  const leadIds = Array.from(new Set(rows.map((r) => r.lead_id).filter(Boolean)));
  const appIds = Array.from(new Set(rows.map((r) => r.application_id).filter(Boolean)));
  const [leadsRes, appsRes] = await Promise.all([
    leadIds.length
      ? (await getAdmin()).from("leads").select("id, name, email, mobile, lead_code, service").in("id", leadIds)
      : Promise.resolve({ data: [] as any[] }),
    appIds.length
      ? (await getAdmin()).from("applications").select("id, application_code, application_status").in("id", appIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const leadMap = new Map((leadsRes.data ?? []).map((l: any) => [l.id, l]));
  const appMap = new Map((appsRes.data ?? []).map((a: any) => [a.id, a]));
  return rows.map((r) => ({
    ...r,
    lead: r.lead_id ? leadMap.get(r.lead_id) ?? null : null,
    application: r.application_id ? appMap.get(r.application_id) ?? null : null,
  }));
}

export const listCertificates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    delivered: z.enum(["all", "yes", "no"]).default("all"),
    search: z.string().optional(),
  }))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin"]);
    let q = (await getAdmin()).from("certificates").select("*").order("created_at", { ascending: false });
    if (data.delivered === "yes") q = q.not("delivered_at", "is", null);
    if (data.delivered === "no") q = q.is("delivered_at", null);
    const { data: rows, error } = await q.limit(500);
    if (error) throw new Error(error.message);
    let hydrated = await hydrate(rows ?? []);
    if (data.search) {
      const s = data.search.toLowerCase();
      hydrated = hydrated.filter((r: any) =>
        r.certificate_number?.toLowerCase().includes(s) ||
        r.lead?.name?.toLowerCase().includes(s) ||
        r.lead?.email?.toLowerCase().includes(s) ||
        r.lead?.lead_code?.toLowerCase().includes(s)
      );
    }
    return { rows: hydrated };
  });

export const uploadCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    applicationId: z.string().min(1),
    fileBase64: z.string(),
    fileName: z.string(),
    mimeType: z.string().default("application/pdf"),
    certificateNumber: z.string().optional(),
  }))
  .handler(async ({ data, context }) => {
    const user = await assertRole(context.supabase, ["super_admin", "admin", "operations"]);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.applicationId);
    const lookup = (await getAdmin()).from("applications").select("id, lead_id");
    const { data: app } = isUuid
      ? await lookup.eq("id", data.applicationId).single()
      : await lookup.eq("application_code", data.applicationId).single();
    if (!app) throw new Error("Application not found");

    const buffer = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
    const path = `certificates/${app.id}/${Date.now()}-${data.fileName}`;
    const { error: upErr } = await (await getAdmin()).storage
      .from("documents")
      .upload(path, buffer, { contentType: data.mimeType, upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { data: cert, error: insErr } = await (await getAdmin())
      .from("certificates")
      .insert({
        application_id: app.id,
        lead_id: app.lead_id,
        certificate_number: data.certificateNumber ?? null,
        file_name: data.fileName,
        file_path: path,
        mime_type: data.mimeType,
        uploaded_by: user.id,
        issued_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);

    await writeAudit({
      supabase: context.supabase, entityType: "certificate", entityId: cert.id,
      action: "certificate_uploaded", newValue: { file_path: path }, actorId: user.id,
    });
    return { certificate: cert };
  });

export const deliverCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      certificateId: z.string().uuid(),
      ccEmail: z.string().trim().email("Invalid CC email address").optional().or(z.literal("")).nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    const user = await assertRole(context.supabase, ["super_admin", "admin", "operations"]);
    const normalizedCc = data.ccEmail?.trim() ? data.ccEmail.trim().toLowerCase() : undefined;
    const { data: cert } = await (await getAdmin())
      .from("certificates")
      .select("*")
      .eq("id", data.certificateId)
      .single();
    if (!cert) throw new Error("Certificate not found");
    if (!cert.file_path) throw new Error("Certificate has no file");

    const [{ data: lead }, { data: app }] = await Promise.all([
      cert.lead_id
        ? (await getAdmin()).from("leads").select("id, name, email").eq("id", cert.lead_id).single()
        : Promise.resolve({ data: null as any }),
      cert.application_id
        ? (await getAdmin()).from("applications").select("id, application_code").eq("id", cert.application_id).single()
        : Promise.resolve({ data: null as any }),
    ]);

    const { data: signed } = await (await getAdmin()).storage
      .from("documents")
      .createSignedUrl(cert.file_path, 60 * 60 * 24 * 7);

    if (!lead?.email) {
      throw new Error("No email address on file for this customer — certificate was not delivered.");
    }
    if (!signed?.signedUrl) {
      throw new Error("Could not generate certificate download link — certificate was not delivered.");
    }

    if (lead.email && signed.signedUrl) {
      try {
      // Try to attach the actual file (PDF/JPG/PNG) to the email.
      let attachment: { filename: string; content_type: string; content_base64: string } | null = null;
      try {
        const { data: blob, error: dlErr } = await (await getAdmin()).storage
          .from("documents")
          .download(cert.file_path);
        if (dlErr) throw dlErr;
        if (blob) {
          const buf = Buffer.from(await blob.arrayBuffer());
          if (buf.byteLength <= 9 * 1024 * 1024) {
            const ext = ((cert as any).file_name?.split(".").pop() || "pdf").toLowerCase();
            attachment = {
              filename: `${cert.certificate_number || app?.application_code || "certificate"}.${ext}`,
              content_type: (cert as any).mime_type || "application/octet-stream",
              content_base64: buf.toString("base64"),
            };
          } else {
            console.warn("[certificate.deliver] attachment skipped: file >9MB", buf.byteLength);
          }
        }
      } catch (e) {
        console.warn("[certificate.deliver] attachment skipped: download failed", e);
      }

      const orderId = (app?.application_code ?? "").toString();
      const customerName = (lead.name ?? "Customer").toString();
      const esc = (s: string) => s
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
      const subject = `Your Order No. ${orderId} has been completed`;
      const completedDateFormatted = new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Order Completed</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08)">
        <tr><td style="background:#0f3460;color:#ffffff;padding:22px 32px;font-size:20px;font-weight:700">Order Completed</td></tr>
        <tr><td style="padding:24px 32px 8px 32px;font-size:14px;line-height:1.65">
          <p style="margin:0 0 12px 0">Dear ${esc(customerName)},</p>
          <p style="margin:0 0 12px 0">Greetings from Business Help Services.</p>
          <p style="margin:0 0 12px 0">We are pleased to inform you that your <strong>Order/Application No. ${esc(orderId)}</strong> for UDYAM-related consultancy and assistance services has been processed/completed.</p>

          <!-- Order Summary Card -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;font-size:13px;color:#0f172a">
            <tr>
              <td style="padding:4px 0;color:#64748b;width:160px">Order Number:</td>
              <td style="padding:4px 0;font-weight:600;color:#0f172a">${esc(orderId)}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#64748b">Service Selected:</td>
              <td style="padding:4px 0;font-weight:600;color:#0f172a">${esc(lead.service || "UDYAM Consultancy Service")}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#64748b">Order Completed Date:</td>
              <td style="padding:4px 0;font-weight:700;color:#0f3460">${completedDateFormatted} IST</td>
            </tr>
          </table>

          <p style="margin:0 0 12px 0">Please find the relevant document/certificate attached to this email for your reference and records.</p>
          <p style="margin:0 0 12px 0">Kindly review the attached document carefully and contact us through written communication in case any clarification or assistance is required.</p>
          <p style="margin:0 0 6px 0">For any support regarding this order, please contact:</p>
          <p style="margin:0 0 12px 0"><strong>Team Business Help Services</strong></p>
          <p style="margin:0 0 12px 0">Kindly mention your <strong>Order/Application Number</strong> in all future communications for quicker assistance and verification.</p>
          <p style="margin:0 0 12px 0;color:#475569;font-size:13px">In case no response, objection, or discrepancy is reported by the User within a reasonable period after this communication, the service/delivery may be treated as completed for operational and record purposes.</p>
          <p style="margin:0 0 16px 0">We thank you for choosing our services and appreciate the opportunity to assist you.</p>
          <p style="margin:0 0 4px 0">Warm Regards,</p>
          <p style="margin:0 0 16px 0"><strong>Team Business Help Services</strong></p>
        </td></tr>
        <tr><td style="padding:0 32px 24px 32px;text-align:center">
          <a href="${signed.signedUrl}" style="background:#0f3460;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;font-size:14px">Download Certificate</a>
          <p style="margin:10px 0 0 0;font-size:11px;color:#94a3b8">The download link is valid for 7 days. The certificate is also attached to this email.</p>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;font-size:12px;color:#475569;line-height:1.6">
          📧 <a href="mailto:help@businesshelpservices.com" style="color:#0f3460;text-decoration:none">help@businesshelpservices.com</a><br/>
          🌐 <a href="https://udyamadhar.in" style="color:#0f3460;text-decoration:none">https://udyamadhar.in</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
      const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");
      await enqueueFromTemplateInternal("order_completed", lead.email, {
        customer_name: customerName,
        customerName,
        service_name: lead.service || "Service",
        serviceName: lead.service || "Service",
        order_number: orderId,
        orderNumber: orderId,
        order_completion_date_time: completedDateFormatted,
        order_completion_date: completedDateFormatted,
        order_completion_time: completedDateFormatted,
        order_completed_date_time: completedDateFormatted,
        order_completed_date: completedDateFormatted,
        order_completed_at: completedDateFormatted,
        completed_date_time: completedDateFormatted,
        completed_date: completedDateFormatted,
        completed_at: completedDateFormatted,
        completion_date_time: completedDateFormatted,
        completion_date: completedDateFormatted,
        completion_at: completedDateFormatted,
        certificateId: cert.id,
        certificate_number: cert.certificate_number ?? "",
        certificate_url: signed.signedUrl,
        document_name: attachment?.filename ?? "Certificate",
        order_code: app?.application_code ?? "",
      },
        {
          toName: lead.name,
          leadId: lead.id,
          applicationId: app?.id ?? undefined,
          cc: normalizedCc,
          attachments: attachment ? [attachment] : undefined,
          requireImmediateSuccess: true,
          allowDuplicate: true,
          trigger: "manual",
        },
      );
      } catch (sendErr: any) {
        const failMessage = sendErr?.message || "Failed to submit certificate email";
        console.error("[deliverCertificate] Certificate email sending failed:", sendErr);
        if (app?.id) {
          await (await getAdmin()).from("application_events").insert({
            application_id: app.id,
            lead_id: cert.lead_id,
            customer_id: cert.customer_id ?? null,
            event_type: "certificate_send_failed",
            new_value: "failed",
            note: `Certificate email submission failed for registered email ${lead.email}${normalizedCc ? `, with CC to ${normalizedCc}` : ""}. Error: ${failMessage}`,
            created_by: user.id,
          } as never);
        }
        throw new Error(`Certificate email submission failed: ${failMessage}. Certificate was not marked delivered.`);
      }
    }

    if (app?.id) {
      const historyNote = normalizedCc
        ? `Certificate email sent successfully to the registered email ${lead.email}, with CC to ${normalizedCc}.`
        : `Certificate ${cert.certificate_number ?? ""} sent to ${lead.email}.`;

      await (await getAdmin()).from("application_events").insert({
        application_id: app.id,
        lead_id: cert.lead_id,
        customer_id: cert.customer_id ?? null,
        event_type: "certificate_delivered",
        note: historyNote,
        created_by: user.id,
      } as never);
    }

    await (await getAdmin())
      .from("certificates")
      .update({ delivered_at: new Date().toISOString() })
      .eq("id", data.certificateId);

    if (app?.id) {
      const { transitionStatusSystem } = await import("@/lib/applications/transitions.server");
      // Cascade only after the certificate email has actually been accepted.
      for (const next of ["certificate_uploaded", "certificate_ready", "completed"] as const) {
        const tr = await transitionStatusSystem({
          applicationId: app.id,
          toStatus: next,
          reason: `Certificate delivered (${next})`,
          force: true,
        });
        if (!tr.ok) console.warn("[certificates] cascade step skipped:", next, tr.reason);
      }
    }


    await writeAudit({
      supabase: context.supabase, entityType: "certificate", entityId: cert.id,
      action: "certificate_delivered", newValue: { delivered_at: new Date().toISOString() }, actorId: user.id,
    });
    return { ok: true };
  });

export const getCertificateUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ certificateId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["super_admin", "admin", "operations", "support", "accounts"]);
    const { data: cert } = await (await getAdmin())
      .from("certificates")
      .select("file_path")
      .eq("id", data.certificateId)
      .single();
    if (!cert || !cert.file_path) throw new Error("Not found");
    const { data: signed } = await (await getAdmin()).storage
      .from("documents")
      .createSignedUrl(cert.file_path, 60 * 10);
    return { url: signed?.signedUrl };
  });
