import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { renderTemplate, renderTemplateHtml } from "./smtp.server";
import { resolveMailProvider, sendViaActiveProvider, senderEmailFor, isProviderThrottleError } from "./transport.server";

/**
 * Legacy → canonical template alias.
 * The ONLY email templates that exist in the DB are the 14 approved
 * BHS templates (E001–E010, T001–T003, R001). Any legacy code passed by
 * older call-sites is resolved here. Codes mapped to `null` are silently
 * dropped (no email is sent) — used to kill off admin/internal notices
 * the product owner has explicitly removed.
 */
const LEGACY_TEMPLATE_ALIAS: Record<string, string | null> = {
  // Order lifecycle
  order_confirmation: "E001",
  topup_payment_received: "E013",
  service_changed: "E012",

  welcome_and_form_link: "E002",
  "client-info-request": "E002",
  docs_required_reminder: "E002",
  payment_link: "E002",
  lead_welcome: "E002",
  bhs_e005_manual_reminder: "E002",
  workflow_external_delay_notice: "E003",
  bhs_e004_our_side_delay: "E003",
  bhs_e003_customer_delay: "E004",
  bhs_e012_submitted_to_govt: "E006",
  bhs_order_resumed: "E006",
  workflow_processing_update_3d: "E006",
  order_completed: "E007",
  certificate_delivery: "E007",
  "certificate-delivered": "E007",
  talk_to_expert_completed: "E009",
  consultation_service_converted: "E009",
  talk_to_expert_request_customer: "E009",
  order_closure_confirmation: "E010",
  order_pending_closure: "E010",
  "cancel-action-required": "E010",
  "cancel-closure-confirmation": "E010",
  workflow_closure_notice: "E010",
  // Tickets
  support_ticket_reply: "T002",
  support_ticket_closed: "T001",
  support_ticket_closed_final: "T003",
  ticket_created: "T002",
  // Refunds
  refund_processed_confirmation: "R001",
  // Explicitly dropped — no customer/admin email should fire
  contact_acknowledgement: null,
  admin_new_lead: null,
  admin_onboarding_submitted: null,
  complaint_admin_notification: null,
  complaint_sla_breach: null,
  talk_to_expert_request_admin: null,
  onboarding_complete: null,
  onboarding_reminder: null,
  payment_success: null,
  service_processing_update: null,
};

/** Resolve a caller-supplied template code to a canonical one, or null to skip. */
function resolveTemplateCode(code: string | null | undefined): { code: string | null; drop: boolean } {
  if (!code) return { code: null, drop: false };
  const trimmed = code.trim();
  if (/^(E0(0[1-9]|1[0-2])|T00[1-3]|R00[1-2])$/.test(trimmed)) return { code: trimmed, drop: false };
  if (Object.prototype.hasOwnProperty.call(LEGACY_TEMPLATE_ALIAS, trimmed)) {
    const mapped = LEGACY_TEMPLATE_ALIAS[trimmed];
    return { code: mapped, drop: mapped === null };
  }
  // Unknown code — let downstream template lookup fail loudly
  return { code: trimmed, drop: false };
}

export const BUILTIN_TEMPLATES: Record<string, { subject: string; body_html: string; body_text?: string; is_enabled: boolean; dispatch_mode: string }> = {
  E011: {
    subject: "Update on Your Order – Technical Issue Resolved (Order No. {{order_number}})",
    body_html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Update on Your Order – Technical Issue Resolved (Order No. {{order_number}})</title></head>
<body style="margin:0; padding:0; background:#F2F4F7;">
<!-- From: help@businesshelpservices.com | Display Name: Care | Business Help Services | Subject: Update on Your Order – Technical Issue Resolved (Order No. {{order_number}}) -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#FFFFFF; border-radius:10px; overflow:hidden; box-shadow:0 2px 10px rgba(18,49,92,0.08);">
      
  <tr><td style="background:#12315C; padding:18px 30px; border-radius:10px 10px 0 0;">
    <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:17px; font-weight:700; color:#ffffff;">Technical Issue Resolved – Processing Resumed</span>
  </td></tr>
    <tr><td style="padding:28px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">
      <p style="margin:0 0 14px 0; font-weight:700; color:#12315C;">Dear {{customer_name}},</p>
      <p style="margin:0 0 12px 0;">Greetings from Business Help Services.</p><p style="margin:0 0 12px 0;">We are pleased to inform you that the technical issue affecting the processing of your Order/Application No. {{order_number}} has now been successfully resolved.</p><p style="margin:0 0 12px 0;">We sincerely appreciate your patience and understanding during this period. The required operational activities relating to your order have now resumed and further processing will continue in accordance with the scope of the selected service.</p>
    </td></tr>
    <tr><td style="padding:26px 30px 8px 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
          <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Order Summary</span>
        </td></tr></table>
    </td></tr>
    <tr><td style="padding:14px 30px 0 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; border:1px solid #E3E6EC; border-radius:6px;">
        <tr><td style="padding:14px 16px 4px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Order/Application No.</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{order_number}}</td></tr><tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Requested Service</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{service_name}}</td></tr><tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Previous Order Status</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">Technical Delay</td></tr><tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Current Order Status</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">In Process – Processing Resumed</td></tr><tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Technical Issue Resolved On</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{resolved_at}}</td></tr><tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Registered Email</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{customer_email}}</td></tr><tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Registered Mobile</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{customer_mobile}}</td></tr></table>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:26px 30px 8px 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
          <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Status Update</span>
        </td></tr></table>
    </td></tr><tr><td style="padding:10px 30px 0 30px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>The previously reported technical issue affecting the processing of your order has now been successfully resolved.</td></tr><tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Further consultancy, coordination, documentation review, verification, application processing assistance, submission assistance, or other applicable service-related activities have resumed.</td></tr><tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Processing timelines may vary depending upon the nature of the requested service and any applicable operational, verification, Government authority, or portal-related requirements.</td></tr><tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Where additional information, documents, confirmations, OTPs, or customer action are required during further processing, our team may contact you through your registered communication channels.</td></tr></table></td></tr>
    <tr><td style="padding:26px 30px 8px 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
          <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Next Step</span>
        </td></tr></table>
    </td></tr><tr><td style="padding:10px 30px 0 30px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Your order is presently under further operational processing.</td></tr><tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Once the next stage of processing is completed or any additional action is required, we will communicate the relevant update through the registered communication channels provided under this order.</td></tr><tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Customers are advised to regularly monitor their registered email address and mobile number for service-related communications and updates.</td></tr></table></td></tr>
    <tr><td style="padding:26px 30px 8px 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
          <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Important Information</span>
        </td></tr></table>
    </td></tr><tr><td style="padding:10px 30px 0 30px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Resolution of the technical issue should not be interpreted as confirmation of Government approval, registration, certificate issuance, or final completion of the requested service.</td></tr><tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Your order shall continue to be processed in accordance with the applicable service scope, operational procedures, and published policies of Business Help Services.</td></tr><tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Further updates relating to your order, wherever applicable, shall be communicated through subsequent email notifications.</td></tr></table></td></tr>
    <tr><td style="padding:26px 30px 8px 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
          <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Support Information</span>
        </td></tr></table>
    </td></tr><tr><td style="padding:4px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">If you have any questions regarding the current status of your order, kindly reply to this email or contact our Customer Care Team during business hours.</td></tr><tr><td style="padding:12px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">Customer Care Availability<br/>Monday to Saturday<br/>10:00 AM to 6:00 PM (IST)<br/>(Excluding National and Public Holidays)</td></tr>
    <tr><td style="padding:24px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14px; line-height:1.7; color:#2B2E33;">
      <p style="margin:0 0 6px 0;">Regards,<br/>{{executive_name}}<br/>Customer Care Team</p>
      <p style="margin:14px 0 0 0; font-weight:700; color:#12315C;">Business Help Services</p>
      <p style="margin:2px 0 0 0; color:#5B6270; font-size:13px;">Private Consultancy &amp; Assistance Services</p>
      <p style="margin:10px 0 0 0; font-size:13.5px;">&#128222; +91-9767870331 &nbsp;&nbsp; &#128231; help@businesshelpservices.com &nbsp;&nbsp; &#127760; www.udyamadhar.in</p>
    </td></tr>
    <tr><td style="padding:22px 30px 0 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; border-radius:6px; border:1px solid #E3E6EC;">
        <tr><td style="padding:14px 16px;">
          <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:11.5px; font-weight:700; letter-spacing:0.6px; color:#12315C; text-transform:uppercase;">Important Notice</span>
          <p style="margin:8px 0 0 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:12px; line-height:1.6; color:#5B6270;">This is an automatically generated system email regarding the current status of your order. This communication confirms only that the previously reported technical issue has been resolved and that further processing of your order has resumed, wherever applicable. It should not be interpreted as confirmation of order completion, Government approval, registration, certificate issuance, or final disposal of the requested service. Business Help Services maintains electronic records of order processing, customer communications, operational activities, and service-related events for operational, compliance, audit, and record-keeping purposes.</p>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:20px 30px 26px 30px; text-align:center; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:11px; color:#5B6270;">&copy; Business Help Services &middot; www.udyamadhar.in</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
    is_enabled: true,
    dispatch_mode: "manual",
  },
  R001: {
    subject: "Refund Request Approved – Order No. {{order_number}}",
    body_html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Refund Request Approved – Order No. {{order_number}}</title></head>
<body style="margin:0; padding:0; background:#F2F4F7;">
<!-- From: help@businesshelpservices.com | Display Name: Care | Business Help Services | Subject: Refund Request Approved – Order No. {{order_number}} -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#FFFFFF; border-radius:10px; overflow:hidden; box-shadow:0 2px 10px rgba(18,49,92,0.08);">

      <tr><td style="background:#12315C; padding:18px 30px; border-radius:10px 10px 0 0;">
        <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:17px; font-weight:700; color:#ffffff;">Refund Request Approved</span>
      </td></tr>

      <tr><td style="padding:28px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">
        <p style="margin:0 0 14px 0; font-weight:700; color:#12315C;">Dear {{customer_name}},</p>
        <p style="margin:0 0 12px 0;">We are pleased to inform you that your refund request relating to Order/Application No. {{order_number}} has been reviewed and approved in accordance with our applicable Refund &amp; Cancellation Policy.</p>
      </td></tr>

      <!-- REFUND SUMMARY -->
      <tr><td style="padding:20px 30px 6px 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
            <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Refund Summary</span>
          </td></tr></table>
      </td></tr>
      <tr><td style="padding:14px 30px 0 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; border:1px solid #E3E6EC; border-radius:6px;">
          <tr><td style="padding:14px 16px 4px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Order/Application No.</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{order_number}}</td></tr>
              <tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Requested Service</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{service_name}}</td></tr>
              <tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Refund Status</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{refund_status}}</td></tr>
              <tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Approved Refund Amount</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{refund_amount_formatted}}</td></tr>
              <tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Refund Approval Date &amp; Time</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{refund_approval_date_and_time}}</td></tr>
              <tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Refund Reference No.</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{refund_reference_no}}</td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>

      <!-- REFUND INFORMATION -->
      <tr><td style="padding:20px 30px 6px 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
            <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Refund Information</span>
          </td></tr></table>
      </td></tr>
      <tr><td style="padding:10px 30px 0 30px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>The approved refund amount has been successfully initiated and processed towards the original payment method used during order placement.</td></tr>
        <tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Depending on your banking institution, card network, or payment gateway settlement cycles, the refund typically reflects in your statement within 5 to 7 business days.</td></tr>
        <tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Please retain the Refund Reference No. mentioned in the summary above for any future tracking or correspondence with your bank.</td></tr>
      </table></td></tr>

      <!-- Support -->
      <tr><td style="padding:18px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14px; line-height:1.7; color:#2B2E33;">
        <p style="margin:0 0 0 0;">For any assistance or questions regarding this refund, kindly reply to this email or contact our Customer Care Team during business hours.</p>
      </td></tr>
      <tr><td style="padding:12px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">Customer Care Availability<br/>Monday to Saturday<br/>10:00 AM to 6:00 PM (IST)<br/>(Excluding National and Public Holidays)</td></tr>

      <!-- Important Links -->
      <tr><td style="padding:14px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; color:#12315C;">IMPORTANT LINKS</td></tr>
      <tr><td style="padding:12px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:12.5px; color:#5B6270; line-height:2;"><a href="https://udyamadhar.in/terms-conditions" style="color:#12315C; text-decoration:none; font-weight:600;">Terms &amp; Conditions</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/refund-cancellation-policy" style="color:#12315C; text-decoration:none; font-weight:600;">Refund &amp; Cancellation Policy</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/privacy-policy" style="color:#12315C; text-decoration:none; font-weight:600;">Privacy Policy</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/disclaimer" style="color:#12315C; text-decoration:none; font-weight:600;">Disclaimer</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/service-delivery-policy" style="color:#12315C; text-decoration:none; font-weight:600;">Service Delivery Policy</a></td></tr>

      <!-- Sign off -->
      <tr><td style="padding:18px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14px; line-height:1.7; color:#2B2E33;">
        <p style="margin:0 0 6px 0;">Regards,<br/>{{executive_name}}<br/>Customer Care Team</p>
        <p style="margin:14px 0 0 0; font-weight:700; color:#12315C;">Business Help Services</p>
        <p style="margin:2px 0 0 0; color:#5B6270; font-size:13px;">Private Consultancy &amp; Assistance Services</p>
        <p style="margin:10px 0 0 0; font-size:13.5px;">&#128222; +91-9767870331 &nbsp;&nbsp; &#128231; help@businesshelpservices.com &nbsp;&nbsp; &#127760; www.udyamadhar.in</p>
      </td></tr>

      <!-- Notice -->
      <tr><td style="padding:22px 30px 0 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; border-radius:6px; border:1px solid #E3E6EC;">
          <tr><td style="padding:14px 16px;">
            <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:11.5px; font-weight:700; letter-spacing:0.6px; color:#12315C; text-transform:uppercase;">Important Notice</span>
            <p style="margin:8px 0 0 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:12px; line-height:1.6; color:#5B6270;">This is an official communication confirming that your refund request has been approved and processed in accordance with the Refund &amp; Cancellation Policy of Business Help Services. Business Help Services maintains electronic records of refund requests, approvals, payment processing references, and customer communications for audit and compliance purposes.</p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 30px 26px 30px; text-align:center; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:11px; color:#5B6270;">&copy; Business Help Services &middot; www.udyamadhar.in</td></tr>

    </table>
  </td></tr>
</table>
</body></html>`,
    is_enabled: true,
    dispatch_mode: "manual",
  },
  R002: {
    subject: "Refund Request Update – Order No. {{order_number}}",
    body_html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Refund Request Update – Order No. {{order_number}}</title></head>
<body style="margin:0; padding:0; background:#F2F4F7;">
<!-- From: help@businesshelpservices.com | Display Name: Care | Business Help Services | Subject: Refund Request Update – Order No. {{order_number}} -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#FFFFFF; border-radius:10px; overflow:hidden; box-shadow:0 2px 10px rgba(18,49,92,0.08);">

      <tr><td style="background:#12315C; padding:18px 30px; border-radius:10px 10px 0 0;">
        <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:17px; font-weight:700; color:#ffffff;">Refund Request Not Approved</span>
      </td></tr>

      <tr><td style="padding:28px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">
        <p style="margin:0 0 14px 0; font-weight:700; color:#12315C;">Dear {{customer_name}},</p>
        <p style="margin:0 0 12px 0;">Thank you for contacting Business Help Services.</p>
        <p style="margin:0 0 12px 0;">We have reviewed your refund request for Order No. {{order_number}} and the associated application/service records.</p>
        <p style="margin:0 0 0 0;">After reviewing the order status, service activity, communication records, and applicable refund terms, we regret to inform you that your refund request cannot be approved.</p>
      </td></tr>

      <!-- Order Summary -->
      <tr><td style="padding:20px 30px 6px 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
            <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Order Summary</span>
          </td></tr></table>
      </td></tr>
      <tr><td style="padding:14px 30px 0 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; border:1px solid #E3E6EC; border-radius:6px;">
          <tr><td style="padding:14px 16px 4px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Order/Application No.</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{order_number}}</td></tr>
              <tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Invoice No.</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{invoice_number}}</td></tr>
              <tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Requested Service</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{service_name}}</td></tr>
              <tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Current Order Status</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">Closed</td></tr>
              <tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Order Created On</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{order_created_at}}</td></tr>
              <tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Order Closure Date &amp; Time</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{closure_date}}</td></tr>
              <tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Registered Email</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{customer_email}}</td></tr>
              <tr><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; vertical-align:top;">Registered Mobile</td><td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; vertical-align:top;">{{customer_mobile}}</td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>

      <!-- Reason for Refund Rejection -->
      <tr><td style="padding:20px 30px 6px 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
            <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Reason for Refund Rejection</span>
          </td></tr></table>
      </td></tr>
      <tr><td style="padding:10px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">
        Your request falls under one or more of the following conditions covered by our service and refund policy:
      </td></tr>
      <tr><td style="padding:8px 30px 0 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Service processing has already started:</b> Our team has initiated processing of your application after receiving the order/payment.</td></tr>
          <tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Application/service work has been performed:</b> Our team may have reviewed, verified, processed, prepared, or submitted information/documents related to your application.</td></tr>
          <tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Customer-side delay or non-cooperation:</b> Required information, documents, confirmation, or responses were not provided within the required timeframe, where applicable.</td></tr>
          <tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Incorrect or incomplete information provided by the customer:</b> Delays or inability to complete the service resulting from incorrect, incomplete, or inconsistent information/documents provided by the customer are not eligible for a refund.</td></tr>
          <tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Government/third-party dependency:</b> Where completion depends on a government portal, authority, department, verification process, or other third party, delays or changes outside our control do not automatically qualify for a refund.</td></tr>
          <tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Application already processed/completed:</b> Refunds are not applicable where the requested service has already been completed or the applicable certificate/document/service output has been delivered.</td></tr>
          <tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Customer-requested cancellation after processing:</b> Cancellation requests received after service processing has commenced may not be eligible for a refund.</td></tr>
          <tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Non-availability/unresponsiveness after order placement:</b> If the application could not proceed because the customer was unavailable, did not provide required information, or did not respond to communication attempts, the order may not qualify for a refund.</td></tr>
          <tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Change of mind:</b> A refund is not applicable solely because the customer subsequently decides not to proceed after service processing has commenced.</td></tr>
          <tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Duplicate or unnecessary service request:</b> Where the service has already been initiated or completed through the same or another order, the duplicate order may not qualify for a refund.</td></tr>
          <tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Third-party/government fee or processing component:</b> Any amount already incurred, paid, committed, or allocated towards third-party/government processing may be non-refundable, where applicable.</td></tr>
          <tr><td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Policy-based exclusion:</b> The particular circumstances of the request do not satisfy the eligibility conditions specified in our applicable refund/cancellation policy.</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:12px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">Additional Remarks (if applicable): {{employee_remarks}}</td></tr>

      <!-- Our Review -->
      <tr><td style="padding:20px 30px 6px 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
            <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Our Review</span>
          </td></tr></table>
      </td></tr>
      <tr><td style="padding:8px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.6; color:#2B2E33;">
        This decision has been made based on the information and records available against your order, including the order status, service activity, application information, documents/information provided, and communication history, as applicable.<br/>
        If you believe that the above decision has been made incorrectly, you may reply to this email with the specific reason for your disagreement and any supporting information/documents. Our support team can review the matter again based on the available records.
      </td></tr>

      <!-- Support -->
      <tr><td style="padding:18px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14px; line-height:1.7; color:#2B2E33;">
        <p style="margin:0 0 0 0;">We appreciate your understanding. For any assistance, kindly reply to this email or contact our Customer Care Team during business hours.</p>
      </td></tr>
      <tr><td style="padding:12px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">Customer Care Availability<br/>Monday to Saturday<br/>10:00 AM to 6:00 PM (IST)<br/>(Excluding National and Public Holidays)</td></tr>

      <!-- Important Links -->
      <tr><td style="padding:14px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; color:#12315C;">IMPORTANT LINKS</td></tr>
      <tr><td style="padding:12px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:12.5px; color:#5B6270; line-height:2;"><a href="https://udyamadhar.in/terms-conditions" style="color:#12315C; text-decoration:none; font-weight:600;">Terms &amp; Conditions</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/refund-cancellation-policy" style="color:#12315C; text-decoration:none; font-weight:600;">Refund &amp; Cancellation Policy</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/privacy-policy" style="color:#12315C; text-decoration:none; font-weight:600;">Privacy Policy</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/disclaimer" style="color:#12315C; text-decoration:none; font-weight:600;">Disclaimer</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/service-delivery-policy" style="color:#12315C; text-decoration:none; font-weight:600;">Service Delivery Policy</a></td></tr>

      <!-- Sign off -->
      <tr><td style="padding:18px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14px; line-height:1.7; color:#2B2E33;">
        <p style="margin:0 0 6px 0;">Regards,<br/>{{executive_name}}<br/>Customer Care Team</p>
        <p style="margin:2px 0 0 0; color:#5B6270; font-size:13px;">Private Consultancy &amp; Assistance Services</p>
        <p style="margin:10px 0 0 0; font-size:13.5px;">&#128222; +91-9767870331 &nbsp;&nbsp; &#128231; help@businesshelpservices.com &nbsp;&nbsp; &#127760; www.udyamadhar.in</p>
      </td></tr>

      <!-- Notice -->
      <tr><td style="padding:22px 30px 0 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; border-radius:6px; border:1px solid #E3E6EC;">
          <tr><td style="padding:14px 16px;">
            <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:11.5px; font-weight:700; letter-spacing:0.6px; color:#12315C; text-transform:uppercase;">Important Notice</span>
            <p style="margin:8px 0 0 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:12px; line-height:1.6; color:#5B6270;">This is an official communication regarding the outcome of your refund request. This decision has been made in accordance with the applicable Refund &amp; Cancellation Policy of Business Help Services, based on a review of the operational status and service activities performed under this order. This communication does not affect the operational status of your order unless separately communicated. Business Help Services maintains electronic records of refund requests, reviews, decisions, and customer communications for operational, compliance, audit, and record-keeping purposes.</p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 30px 26px 30px; text-align:center; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:11px; color:#5B6270;">&copy; Business Help Services &middot; www.udyamadhar.in</td></tr>

    </table>
  </td></tr>
</table>
</body></html>`,
    is_enabled: true,
    dispatch_mode: "manual",
  },
};


/** Strip HTML → plain-text fallback. Lovable email API rejects empty `text`. */
function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|br)>/gi, "\n")
    .replace(/<br\s*\/?>(?!\n)/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


// ─────────────────────────── Public-server helpers ───────────────────────────
// Used internally by other server fns (createLead, payu webhook, etc.).
// Lives in a `.server.ts` file so it can never be imported into the client bundle.

export type EmailAttachment = {
  filename: string;
  content_base64: string;
  content_type: string;
};

async function resolveOrderWebsiteDomain(applicationId?: string | null, leadId?: string | null): Promise<string | null> {
  let websiteId: string | null = null;
  if (applicationId) {
    const { data } = await supabaseAdmin.from("applications").select("website_id, lead_id").eq("id", applicationId).maybeSingle();
    websiteId = (data as any)?.website_id ?? null;
    if (!websiteId && !leadId) leadId = (data as any)?.lead_id ?? null;
  }
  if (!websiteId && leadId) {
    const { data } = await supabaseAdmin.from("leads").select("website_id").eq("id", leadId).maybeSingle();
    websiteId = (data as any)?.website_id ?? null;
  }
  if (!websiteId) return null;
  const { data: site } = await supabaseAdmin.from("websites").select("domain").eq("id", websiteId).maybeSingle();
  return (site as any)?.domain ?? null;
}

export async function enqueueEmailInternal(input: {
  templateCode?: string | null;
  toEmail: string;
  toName?: string | null;
  subject: string;
  bodyHtml: string;
  bodyText?: string | null;
  variables?: Record<string, unknown>;
  leadId?: string | null;
  applicationId?: string | null;
  delaySeconds?: number;
  attachments?: EmailAttachment[];
  requireImmediateSuccess?: boolean;
  allowWithoutTemplate?: boolean;
  /** Set true for genuinely repeatable sends (manual resend, support replies). */
  allowDuplicate?: boolean;
  cc?: string | string[];
  bcc?: string | string[];
}) {
  // Every customer form/payment link in an outgoing email gets a fresh,
  // scoped access token so old guessable /onboarding/<code> links stop working.
  try {
    const { secureCustomerLinksInText } = await import("@/lib/security/customer-access.server");
    input = {
      ...input,
      bodyHtml: await secureCustomerLinksInText(input.bodyHtml, "email"),
      bodyText: input.bodyText ? await secureCustomerLinksInText(input.bodyText, "email") : input.bodyText,
    };
  } catch (e) {
    console.error("[emails] could not secure customer links", e instanceof Error ? e.message : e);
  }
  // Footer website links follow the order's own website (e.g. gstcertificate.in).
  try {
    const domain = await resolveOrderWebsiteDomain(input.applicationId, input.leadId);
    if (domain) {
      const { applyFooterDomain } = await import("./footer-domain");
      input = {
        ...input,
        bodyHtml: applyFooterDomain(input.bodyHtml, domain),
        bodyText: input.bodyText ? applyFooterDomain(input.bodyText, domain) : input.bodyText,
      };
    }
  } catch (e) {
    console.error("[emails] footer domain resolve failed", e instanceof Error ? e.message : e);
  }
  const resolved = resolveTemplateCode(input.templateCode);
  if (resolved.drop) {
    console.warn(`[emails] dropping legacy template '${input.templateCode}' (no longer sent).`);
    return { queueId: null, scheduled: false, sent: false, skipped: true } as const;
  }
  const templateCode = resolved.code;
  if (!templateCode && !input.allowWithoutTemplate) {
    throw new Error("Email template code is required. Use a saved Email Template for this send.");
  }
  if (templateCode) {
    const { data: tpl, error: tplErr } = await supabaseAdmin
      .from("email_templates")
      .select("code")
      .eq("code", templateCode)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (!tpl && !BUILTIN_TEMPLATES[templateCode]) throw new Error(`Email template '${templateCode}' not found.`);
  }


  const variables: Record<string, unknown> = { ...(input.variables ?? {}) };
  if (input.allowWithoutTemplate) variables.__allow_without_template = true;
  if (input.attachments && input.attachments.length > 0) {
    variables.__attachments = input.attachments;
  }
  if (input.cc) variables.__cc = input.cc;
  if (input.bcc) variables.__bcc = input.bcc;
  const scheduled = input.delaySeconds && input.delaySeconds > 0
    ? new Date(Date.now() + input.delaySeconds * 1000).toISOString()
    : null;

  const row: Record<string, unknown> = {
    template_code: templateCode,
    to_email: input.toEmail.toLowerCase().trim(),
    to_name: input.toName ?? null,
    subject: input.subject,
    body_html: input.bodyHtml,
    body_text: input.bodyText ?? null,
    variables,
    lead_id: input.leadId ?? null,
    application_id: input.applicationId ?? null,
  };
  if (scheduled) {
    row.scheduled_at = scheduled;
    row.next_attempt_at = scheduled;
  }

  // ── Duplicate guard ──
  // Same template + same recipient + same order must not be queued twice.
  // One-time-per-order templates (order confirmation, completion) are blocked
  // forever; everything else is blocked inside a short window so that a retry,
  // a double webhook, or a double click can't deliver the same mail twice.
  if (!input.allowDuplicate && templateCode) {
    // Only E001 (initial order confirmation) is strictly once-per-order forever.
    // E007 (certificate delivery / completion) can be legitimately re-issued on reopened orders or manual sends.
    const ONCE_PER_ORDER = new Set(["E001"]);
    const forever = ONCE_PER_ORDER.has(templateCode);
    let q = supabaseAdmin
      .from("email_queue")
      .select("id")
      .eq("template_code", templateCode)
      .eq("to_email", row.to_email as string)
      .in("status", ["queued", "sending", "sent", "failed"])
      .limit(1);
    q = input.applicationId
      ? q.eq("application_id", input.applicationId)
      : input.leadId
        ? q.eq("lead_id", input.leadId)
        : q.eq("subject", input.subject);
    if (!forever) q = q.gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
    const { data: dupe } = await q;
    if (dupe && dupe.length > 0) {
      console.warn(`[emails] duplicate suppressed: ${templateCode} -> ${row.to_email}`);
      return { queueId: null, scheduled: false, sent: false, skipped: true } as const;
    }
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("email_queue")
    .insert(row as never)
    .select("id")
    .single();
  if (error) {
    // Unique index caught a simultaneous duplicate enqueue — treat as skipped.
    if ((error as { code?: string }).code === "23505") {
      console.warn(`[emails] duplicate suppressed (db): ${templateCode} -> ${row.to_email}`);
      if (input.requireImmediateSuccess) {
        throw new Error("Email was blocked as a duplicate — it was NOT sent to the customer.");
      }
      return { queueId: null, scheduled: false, sent: false, skipped: true } as const;
    }
    throw new Error(error.message);
  }

  const baseResult = {
    queueId: (inserted?.id as string | undefined) ?? null,
    scheduled: Boolean(scheduled),
    sent: false,
  };

  // Send immediately unless explicitly scheduled for the future.
  if (!scheduled && inserted?.id) {
    try {
      const sendResult = await sendQueueRowById(inserted.id as string);
      const skipped = Boolean((sendResult as { skipped?: boolean })?.skipped);
      const sent = Boolean((sendResult as { ok?: boolean })?.ok && !skipped);
      if (!sent && input.requireImmediateSuccess) {
        const message = skipped
          ? "Email template is disabled — email was not sent."
          : (sendResult as { error?: string })?.error || "Email was queued but not sent.";
        throw new Error(message);
      }
      return { ...baseResult, sent, sendResult };
    } catch (e) {
      if (input.requireImmediateSuccess) throw e;
      // Failures are already recorded on the row by sendQueueRowById; the
      // background processor (if any) will retry per backoff policy.
    }
  }

  return baseResult;
}


/**
 * Mirror snake_case ↔ camelCase keys so templates render no matter which
 * convention the caller passed. Existing keys win; we only add aliases when
 * the alias slot is empty/undefined.
 */
function withBothCases(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };
  const toCamel = (k: string) => k.replace(/_([a-z0-9])/g, (_m, c) => c.toUpperCase());
  const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null || v === "") continue;
    if (k.includes("_")) {
      const camel = toCamel(k);
      if (out[camel] === undefined || out[camel] === null || out[camel] === "") out[camel] = v;
    } else if (/[A-Z]/.test(k)) {
      const snake = toSnake(k);
      if (out[snake] === undefined || out[snake] === null || out[snake] === "") out[snake] = v;
    }
  }
  return out;
}

async function enforceApplicationOrderNumber(
  input: Record<string, unknown>,
  leadId?: string | null,
  applicationId?: string | null,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...input };
  if (!leadId && !applicationId) return out;

  const { resolveApplicationCode } = await import("@/lib/orders/resolve-order-number.server");
  let effectiveLeadId = leadId ?? null;
  let resolved: string | null = null;
  if (applicationId && !effectiveLeadId) {
    const { data: app } = await supabaseAdmin
      .from("applications")
      .select("lead_id, application_code")
      .eq("id", applicationId)
      .maybeSingle();
    resolved = ((app as { application_code?: string | null } | null)?.application_code ?? null) || null;
    effectiveLeadId = ((app as { lead_id?: string | null } | null)?.lead_id ?? null) || null;
  }
  if (!resolved && effectiveLeadId) {
    resolved = await resolveApplicationCode(effectiveLeadId, { applicationId });
  }

  if (!resolved) {
    const orderNumber = String(out.order_number ?? out.orderNumber ?? "").trim();
    const leadCode = String(out.lead_code ?? out.leadCode ?? "").trim();
    if (!orderNumber || (leadCode && orderNumber === leadCode)) {
      throw new Error("Order number not ready yet — email was not sent.");
    }
    return out;
  }

  out.order_number = resolved;
  out.orderNumber = resolved;
  return out;
}

/**
 * Best-effort backfill of common customer/order/executive placeholders used by
 * the standard BHS templates. Only fills in keys the caller hasn't already
 * provided (non-empty). Never throws — any lookup failure is ignored so email
 * sending continues.
 */
async function backfillCommonVariables(
  vars: Record<string, unknown>,
  leadId?: string | null,
  applicationId?: string | null,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...vars };
  const missing = (k: string) => {
    const v = out[k];
    return v === undefined || v === null || v === "";
  };
  // Always provide {{resolved_at}} = current IST timestamp when caller didn't set it.
  if (missing("resolved_at")) {
    out.resolved_at = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  }
  if (!leadId && !applicationId) return out;
  try {
    type LeadRow = { id?: string; lead_code?: string | null; name?: string | null; email?: string | null; mobile?: string | null; service?: string | null; assigned_to?: string | null; created_at?: string | null };
    type AppRow = { id?: string; application_code?: string | null; lead_id?: string | null; customer_id?: string | null; assigned_to?: string | null; created_at?: string | null; updated_at?: string | null; closure_reason_id?: string | null; closure_remarks?: string | null; fulfillment_status?: string | null };
    let lead: LeadRow | null = null;
    let app: AppRow | null = null;

    if (applicationId) {
      const { data } = await supabaseAdmin
        .from("applications")
        .select("id, application_code, lead_id, customer_id, assigned_to, created_at, updated_at, closure_reason_id, closure_remarks, fulfillment_status, fulfilled_at, certificate_uploaded_at, refund_approved_at, refund_processed_at, refund_gateway_ref, service_id, services(service_name)")
        .eq("id", applicationId)
        .maybeSingle();
      app = (data as AppRow | null) ?? null;
      if (app?.lead_id && !leadId) leadId = app.lead_id;
    }
    if (leadId) {
      const { data } = await supabaseAdmin
        .from("leads")
        .select("id, lead_code, name, email, mobile, service, service_id, assigned_to, created_at")
        .eq("id", leadId)
        .maybeSingle();
      lead = (data as LeadRow | null) ?? null;
    }

    if (app?.customer_id && (missing("customer_name") || missing("customer_email") || missing("customer_mobile"))) {
      const { data: cust } = await supabaseAdmin
        .from("customers")
        .select("name, primary_email, primary_phone")
        .eq("id", app.customer_id)
        .maybeSingle();
      const c = cust as { name?: string; primary_email?: string; primary_phone?: string } | null;
      if (missing("customer_name") && c?.name) out.customer_name = c.name;
      if (missing("customer_email") && c?.primary_email) out.customer_email = c.primary_email;
      if (missing("customer_mobile") && c?.primary_phone) out.customer_mobile = c.primary_phone;
    }

    if (missing("customer_name") && lead?.name) out.customer_name = lead.name;
    if (missing("customer_email") && lead?.email) out.customer_email = lead.email;
    if (missing("customer_mobile") && lead?.mobile) out.customer_mobile = lead.mobile;

    // Resolve accurate selected service name
    let resolvedService = (app as any)?.services?.service_name || lead?.service || null;
    if (!resolvedService && ((app as any)?.service_id || (lead as any)?.service_id)) {
      const svcId = (app as any)?.service_id || (lead as any)?.service_id;
      const { data: svcRow } = await supabaseAdmin
        .from("services")
        .select("service_name")
        .eq("id", svcId)
        .maybeSingle();
      if (svcRow?.service_name) resolvedService = svcRow.service_name;
    }

    const currentSvc = String(out.service_name || out.serviceName || "").trim().toLowerCase();
    const isGenericService =
      !currentSvc ||
      currentSvc === "consultancy" ||
      currentSvc === "consultancy service" ||
      currentSvc === "udyam consultancy service" ||
      currentSvc === "other consultancy";

    if (resolvedService && (missing("service_name") || isGenericService)) {
      out.service_name = resolvedService;
      out.serviceName = resolvedService;
    } else if (missing("service_name")) {
      out.service_name = resolvedService || "UDYAM Registration Service";
      out.serviceName = out.service_name;
    }
    if (missing("customer_mobile")) out.customer_mobile = "—";
    // Order number is ALWAYS the application_code — never fall back to the lead_code.
    // Lead code is a pre-order identifier and must never appear as the order number.
    if (missing("order_number")) out.order_number = app?.application_code ?? "";
    if (missing("lead_code") && lead?.lead_code) out.lead_code = lead.lead_code;
    const created = app?.created_at ?? lead?.created_at ?? null;
    if (missing("order_created_at") && created) {
      out.order_created_at = new Date(created).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true,
      });
    }

    // Executive name via assigned_to → profiles
    const assignedTo = app?.assigned_to ?? lead?.assigned_to ?? null;
    if (missing("executive_name") && assignedTo) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("display_name, full_name, email")
        .eq("id", assignedTo)
        .maybeSingle();
      const name = (prof as { display_name?: string; full_name?: string; email?: string } | null);
      out.executive_name = name?.display_name || name?.full_name || name?.email || "Support Team";
    }
    if (missing("executive_name")) out.executive_name = "Support Team";

    // Invoice number (latest invoice for this app/lead)
    if (missing("invoice_number")) {
      type InvRow = { invoice_number?: string | null };
      let inv: InvRow | null = null;
      if (applicationId) {
        const { data } = await supabaseAdmin
          .from("invoices")
          .select("invoice_number, issued_at")
          .eq("application_id", applicationId)
          .order("issued_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        inv = (data as InvRow | null) ?? null;
      }
      if (!inv && leadId) {
        const { data } = await supabaseAdmin
          .from("invoices")
          .select("invoice_number, issued_at")
          .eq("lead_id", leadId)
          .order("issued_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        inv = (data as InvRow | null) ?? null;
      }
      if (inv?.invoice_number) out.invoice_number = inv.invoice_number;
    }

    // Completion date fields for E007 / order_completed templates.
    const completedAtRaw = (app as any)?.fulfilled_at ?? (app as any)?.certificate_uploaded_at ?? new Date().toISOString();
    const formattedCompletedDate = new Date(completedAtRaw).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
    const completionKeys = [
      "order_completion_date_time",
      "order_completion_date",
      "order_completion_time",
      "order_completion_date_and_time",
      "order_completed_date_time",
      "order_completed_date_and_time",
      "order_completed_date",
      "order_completed_time",
      "order_completed_at",
      "completed_date_time",
      "completed_date_and_time",
      "completed_date",
      "completed_time",
      "completed_at",
      "completion_date_time",
      "completion_date_and_time",
      "completion_date",
      "completion_time",
      "completion_at",
      "order_completion_at",
    ];
    for (const key of completionKeys) {
      if (missing(key)) out[key] = formattedCompletedDate;
      if (missing(`${key}_ist`)) out[`${key}_ist`] = `${formattedCompletedDate} IST`;
    }
    // Completed orders: {{closure_date}} is the completion date & time (E007).
    const completedFs = new Set(["completed", "certificate_delivered", "order_completed", "service_completed"]);
    if (app && completedFs.has(String(app.fulfillment_status ?? "")) && missing("closure_date")) {
      out.closure_date = formattedCompletedDate;
    }
    const closedFs = new Set(["order_closed", "cancelled", "application_rejected", "certificate_rejected"]);
    if (app && closedFs.has(String(app.fulfillment_status ?? ""))) {
      if (missing("closure_date") && app.updated_at) {
        out.closure_date = new Date(app.updated_at).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit", hour12: true,
        });
      }
      if (missing("employee_remarks") || missing("additional_remarks") || missing("remarks")) {
        let defaultRemarks = (app.closure_remarks && String(app.closure_remarks).trim()) || "";
        if (!defaultRemarks && app.closure_reason_id) {
          const { data: r } = await supabaseAdmin
            .from("order_close_reasons")
            .select("standard_reply, label")
            .eq("id", app.closure_reason_id)
            .maybeSingle();
          defaultRemarks = (r as any)?.standard_reply || (r as any)?.label || "";
        }
        if (missing("employee_remarks")) out.employee_remarks = defaultRemarks || "—";
        if (missing("additional_remarks")) out.additional_remarks = defaultRemarks || "—";
        if (missing("remarks")) out.remarks = defaultRemarks || "—";
      }
      if (missing("closure_reason")) {
        let label: string | null = null;
        if (app.closure_reason_id) {
          const { data: r } = await supabaseAdmin
            .from("order_close_reasons")
            .select("label")
            .eq("id", app.closure_reason_id)
            .maybeSingle();
          label = ((r as { label?: string } | null)?.label) ?? null;
        }
        out.closure_reason = label || (app.closure_remarks ? String(app.closure_remarks) : "Order closed");
      }
    }
    // Never leave the date row blank in templates that print {{closure_date}}.
    if (app && missing("closure_date")) out.closure_date = formattedCompletedDate;

    // ── Refund variables backfill ──
    let refReq: any = null;
    if (applicationId) {
      try {
        const { data: rr } = await supabaseAdmin
          .from("refund_requests")
          .select("id, refund_amount, gateway_ref, gateway_name, decided_at, created_at, status, admin_notes")
          .eq("application_id", applicationId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        refReq = rr;
      } catch (err) {
        console.warn("[emails] refund_requests lookup failed:", err);
      }
    }

    // 1. refund_status
    if (missing("refund_status")) {
      out.refund_status = "Approved";
    }
    out.refundStatus = out.refund_status;

    // 2. refund_approval_date_and_time & aliases
    const rawApproval =
      (app as any)?.refund_approved_at ||
      refReq?.decided_at ||
      refReq?.created_at ||
      (app as any)?.refund_processed_at ||
      (app as any)?.updated_at ||
      new Date().toISOString();

    const formattedApprovalDate = new Date(rawApproval).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const refundDateKeys = [
      "refund_approval_date_and_time",
      "refund_approval_date_time",
      "refund_approval_date",
      "refund_approved_at",
      "refund_date",
      "refund_processed_at",
      "refundApprovalDateAndTime",
      "refundApprovalDateTime",
      "refundApprovalDate",
      "refundApprovedAt",
    ];
    for (const k of refundDateKeys) {
      if (missing(k)) out[k] = formattedApprovalDate;
    }

    // 3. refund_reference_no & aliases
    const rawRef =
      out.refund_reference_no ||
      out.refundReferenceNo ||
      out.payment_reference ||
      out.paymentReference ||
      (app as any)?.refund_gateway_ref ||
      refReq?.gateway_ref ||
      "";

    const refVal = String(rawRef || "").trim();
    const refundRefKeys = [
      "refund_reference_no",
      "refund_reference",
      "refund_ref_no",
      "refund_reference_number",
      "refund_gateway_ref",
      "payment_reference",
      "refundReferenceNo",
      "refundGatewayRef",
      "paymentReference",
    ];
    for (const k of refundRefKeys) {
      if (missing(k)) out[k] = refVal;
    }

    // 4. refund_amount & refund_amount_formatted
    let rawAmount = out.refund_amount || out.refundAmount || refReq?.refund_amount;
    if (!rawAmount && applicationId) {
      try {
        const { data: pmt } = await supabaseAdmin
          .from("payments")
          .select("amount")
          .eq("application_id", applicationId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (pmt?.amount) rawAmount = Math.abs(Number(pmt.amount));
      } catch (err) {
        console.warn("[emails] payments amount lookup failed:", err);
      }
    }

    const cleanNum = typeof rawAmount === "number"
      ? rawAmount
      : Number(String(rawAmount || "").replace(/[^0-9.]/g, "") || 0);

    const formattedCleanAmount = cleanNum > 0 ? cleanNum.toFixed(2) : "0.00";
    const formattedRupees = `₹${cleanNum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Strip any leading ₹ so ₹{{refund_amount}} won't result in double ₹₹
    out.refund_amount = formattedCleanAmount;
    out.refundAmount = formattedCleanAmount;
    out.refund_amount_formatted = formattedRupees;
    out.refundAmountFormatted = formattedRupees;

  } catch (e) {
    console.warn("[emails] backfillCommonVariables failed (non-fatal)", e);
  }
  return out;
}

/** Enqueue using a template code; pulls subject/body from email_templates. */
export async function enqueueFromTemplateInternal(
  code: string,
  toEmail: string,
  rawVariables: Record<string, unknown>,
  opts?: { toName?: string; leadId?: string; applicationId?: string; delaySeconds?: number; attachments?: EmailAttachment[]; requireImmediateSuccess?: boolean; trigger?: "auto" | "manual"; allowDuplicate?: boolean; inReplyTo?: string | null; references?: string | null; threadSubject?: string | null; cc?: string | string[]; bcc?: string | string[] },
) {
  const resolved = resolveTemplateCode(code);
  if (resolved.drop) {
    console.warn(`[emails] dropping legacy template '${code}' (no longer sent).`);
    return;
  }
  const effectiveCode = resolved.code ?? code;
  const enriched = await backfillCommonVariables(rawVariables, opts?.leadId, opts?.applicationId);
  const variables = await enforceApplicationOrderNumber(withBothCases(enriched), opts?.leadId, opts?.applicationId);
  type Tpl = { subject: string; body_html: string | null; body_text?: string | null; is_enabled: boolean; dispatch_mode?: string };
  let tpl: Tpl;
  const { data: dbTpl, error } = await supabaseAdmin
    .from("email_templates")
    .select("subject, body_html, body_text, is_enabled, dispatch_mode")
    .eq("code", effectiveCode)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (dbTpl) {
    tpl = dbTpl as Tpl;
  } else if (BUILTIN_TEMPLATES[effectiveCode]) {
    tpl = BUILTIN_TEMPLATES[effectiveCode];
  } else {
    throw new Error(`Email template '${effectiveCode}' not found.`);
  }


  if (!tpl.is_enabled) {
    if (opts?.requireImmediateSuccess) {
      throw new Error(`Email template '${code}' is disabled — email was not sent.`);
    }
    return;
  }
  // Dispatch-mode gate: an "auto" trigger is skipped for manual-mode templates.
  // Manual trigger (from admin UI) always bypasses this gate.
  const trigger = opts?.trigger ?? "auto";
  const mode = (tpl as { dispatch_mode?: string }).dispatch_mode ?? "auto";
  if (trigger === "auto" && mode === "manual") {
    if (opts?.requireImmediateSuccess) {
      throw new Error(`Email template '${code}' is set to manual dispatch — automation skipped.`);
    }
    return;
  }

  let subject = renderTemplate(tpl.subject, variables);
  const finalVars: Record<string, unknown> = { ...variables };

  // Each template is delivered as its own standalone email (no per-order
  // threading). We only set In-Reply-To/References when the caller explicitly
  // asks for a reply (e.g. ticket replies to an inbound message).
  if (opts?.inReplyTo || opts?.references) {
    const baseSubject = opts.threadSubject || subject;
    subject = baseSubject.toLowerCase().startsWith("re:") ? baseSubject : `Re: ${baseSubject}`;
    finalVars.__in_reply_to = opts.inReplyTo ?? opts.references;
    finalVars.__references = opts.references ?? opts.inReplyTo;
  }


  let rawBodyHtml = tpl.body_html ?? "";
  if (effectiveCode === "E001" || effectiveCode === "order_confirmation") {
    rawBodyHtml = rawBodyHtml
      .replace(/You can also access it here\.?/gi, "")
      .replace(/<a[^>]*\{\{invoice_url\}\}[^>]*>.*?<\/a>/gi, "")
      .replace(/<a[^>]*\{\{invoice_download_url\}\}[^>]*>.*?<\/a>/gi, "")
      .replace(/<p[^>]*>\s*\{\{invoice_url\}\}\s*<\/p>/gi, "")
      .replace(/\{\{invoice_url\}\}/gi, "")
      .replace(/\{\{invoice_download_url\}\}/gi, "");
  }

  const allowDuplicate = opts?.allowDuplicate ?? (trigger === "manual");

  return enqueueEmailInternal({
    templateCode: effectiveCode,
    toEmail,
    toName: opts?.toName ?? null,
    subject,
    bodyHtml: renderTemplateHtml(rawBodyHtml, variables),
    bodyText: tpl.body_text ? renderTemplate(tpl.body_text, variables) : null,
    variables: finalVars,
    leadId: opts?.leadId ?? null,
    applicationId: opts?.applicationId ?? null,
    delaySeconds: opts?.delaySeconds,
    attachments: opts?.attachments,
    requireImmediateSuccess: opts?.requireImmediateSuccess,
    allowDuplicate,
    cc: opts?.cc,
    bcc: opts?.bcc,
  });
}

/** Asynchronously clean up legacy invoice URL links from database email templates. */
async function cleanupE001InvoiceLinkInDB() {
  try {
    const { data: tpls } = await supabaseAdmin
      .from("email_templates")
      .select("id, code, body_html")
      .in("code", ["E001", "order_confirmation"]);

    for (const t of tpls ?? []) {
      if (t.body_html && (t.body_html.includes("invoice_url") || t.body_html.includes("You can also access it here"))) {
        const cleaned = t.body_html
          .replace(/You can also access it here\.?/gi, "")
          .replace(/<a[^>]*\{\{invoice_url\}\}[^>]*>.*?<\/a>/gi, "")
          .replace(/<a[^>]*\{\{invoice_download_url\}\}[^>]*>.*?<\/a>/gi, "")
          .replace(/<p[^>]*>\s*\{\{invoice_url\}\}\s*<\/p>/gi, "")
          .replace(/\{\{invoice_url\}\}/gi, "")
          .replace(/\{\{invoice_download_url\}\}/gi, "");

        await supabaseAdmin
          .from("email_templates")
          .update({ body_html: cleaned } as any)
          .eq("id", t.id);
      }
    }
  } catch (e) {
    console.error("[emails.server] cleanupE001InvoiceLinkInDB error", e);
  }
}
cleanupE001InvoiceLinkInDB();

/** Clean up legacy Refund Reason row and prevent double currency symbols in DB email templates. */
async function cleanRefundTemplatesInDB() {
  try {
    const { data: tpls } = await supabaseAdmin
      .from("email_templates")
      .select("id, code, body_html, variables")
      .in("code", ["R001", "refund_processed_confirmation", "workflow_refund_approved"]);

    for (const t of tpls ?? []) {
      if (!t.body_html) continue;
      let cleaned = t.body_html;
      let changed = false;

      // 1. Remove "Refund Reason" table row:
      const refundReasonRowRegex = /<tr[^>]*>\s*<td[^>]*>[^<]*Refund\s*Reason[^<]*<\/td>[\s\S]*?<\/tr>/gi;
      if (refundReasonRowRegex.test(cleaned)) {
        cleaned = cleaned.replace(refundReasonRowRegex, "");
        changed = true;
      }

      // 2. Remove any duplicate rupee symbol: ₹₹ -> ₹
      if (/₹\s*₹/g.test(cleaned)) {
        cleaned = cleaned.replace(/₹\s*₹/g, "₹");
        changed = true;
      }

      // 3. Prevent ₹{{refund_amount_formatted}} which causes duplicate currency
      if (/₹\s*\{\{\s*(refund_amount_formatted|refundAmountFormatted)\s*\}\}/gi.test(cleaned)) {
        cleaned = cleaned.replace(/₹\s*\{\{\s*(refund_amount_formatted|refundAmountFormatted)\s*\}\}/gi, "{{refund_amount_formatted}}");
        changed = true;
      }

      // 4. Ensure Requested Service row uses {{service_name}} instead of hardcoded text
      const requestedServiceRowRegex = /(<tr[^>]*>\s*<td[^>]*>[^<]*Requested\s*Service[^<]*<\/td>\s*<td[^>]*>)([\s\S]*?)(<\/td>\s*<\/tr>)/gi;
      if (requestedServiceRowRegex.test(cleaned)) {
        cleaned = cleaned.replace(requestedServiceRowRegex, (match, prefix, content, suffix) => {
          if (!content.includes("{{service_name}}") && !content.includes("{{serviceName}}")) {
            changed = true;
            return `${prefix}{{service_name}}${suffix}`;
          }
          return match;
        });
      }

      const currentVars = Array.isArray(t.variables) ? t.variables : [];
      const neededVars = [
        "order_number", "customer_name", "service_name", "refund_status",
        "refund_amount", "refund_amount_formatted", "refund_approval_date_and_time",
        "refund_reference_no", "payment_reference", "customer_email", "customer_mobile", "executive_name"
      ];
      const mergedVars = Array.from(new Set([...currentVars.filter((v: string) => v !== "refund_reason"), ...neededVars]));
      if (mergedVars.length !== currentVars.length) {
        changed = true;
      }

      if (changed) {
        await supabaseAdmin
          .from("email_templates")
          .update({
            body_html: cleaned,
            variables: mergedVars,
          } as any)
          .eq("id", t.id);
      }
    }
  } catch (e) {
    console.error("[emails.server] cleanRefundTemplatesInDB error", e);
  }
}
cleanRefundTemplatesInDB();


/**
 * Recover rows stranded in `status='sending'` (e.g. transport crashed mid-send,
 * or an old run hit a 4xx that wasn't reclassified). Flips them back to
 * `queued` with cleared `next_attempt_at` so the batch processor picks them up.
 */
export async function recoverStuckSendingRows(olderThanMinutes = 15) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("email_queue")
    .update({ status: "queued", next_attempt_at: new Date().toISOString(), last_error: "auto-recovered from stuck sending" } as never)
    .eq("status", "sending")
    .is("sent_at", null)
    .lt("created_at", cutoff)
    .select("id");
  if (error) {
    console.error("[emails] recoverStuckSendingRows failed", error);
    return { recovered: 0 };
  }
  return { recovered: data?.length ?? 0 };
}


// ─────────────────────────── Single-row sender ───────────────────────────

const RETRY_BACKOFF_MIN = [1, 5, 15, 60, 240];

type QueueRow = {
  id: string;
  template_code: string | null;
  to_email: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  variables: Record<string, unknown> | null;
  lead_id: string | null;
  application_id: string | null;
  attempts: number | null;
  max_attempts: number | null;
  status: string;
};

export async function sendQueueRowById(rowId: string) {
  const { data: row, error } = await supabaseAdmin
    .from("email_queue")
    .select("*")
    .eq("id", rowId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return { ok: false, error: "row_not_found" };
  return sendQueueRow(row as unknown as QueueRow);
}

async function sendQueueRow(row: QueueRow) {
  // Template-level enable check.
  if (row.template_code) {
    const { data: tpl } = await supabaseAdmin
      .from("email_templates")
      .select("is_enabled")
      .eq("code", row.template_code)
      .maybeSingle();
    if (tpl && tpl.is_enabled === false) {
      await Promise.all([
        supabaseAdmin
          .from("email_queue")
          .update({ status: "sent", sent_at: new Date().toISOString(), last_error: "skipped: template disabled" } as never)
          .eq("id", row.id),
        supabaseAdmin.from("email_logs").insert({
          queue_id: row.id,
          template_code: row.template_code,
          to_email: row.to_email,
          subject: row.subject,
          status: "skipped_disabled",
          smtp_response: "[skipped] template disabled",
          attempt: (row.attempts ?? 0) + 1,
          lead_id: row.lead_id,
          application_id: row.application_id,
        } as never),
      ]);
      return { ok: true, skipped: true };
    }
    if (!tpl) {
      const err = `blocked: email template '${row.template_code}' not found`;
      await Promise.all([
        supabaseAdmin
          .from("email_queue")
          .update({ status: "dlq", last_error: err } as never)
          .eq("id", row.id),
        supabaseAdmin.from("email_logs").insert({
          queue_id: row.id,
          template_code: row.template_code,
          to_email: row.to_email,
          subject: row.subject,
          status: "failed",
          error_message: err,
          attempt: (row.attempts ?? 0) + 1,
          lead_id: row.lead_id,
          application_id: row.application_id,
        } as never),
      ]);
      return { ok: false, error: err };
    }
  } else if (!((row.variables ?? {}) as Record<string, unknown>).__allow_without_template) {
    const err = "blocked: email template code is required";
    await Promise.all([
      supabaseAdmin
        .from("email_queue")
        .update({ status: "dlq", last_error: err } as never)
        .eq("id", row.id),
      supabaseAdmin.from("email_logs").insert({
        queue_id: row.id,
        template_code: null,
        to_email: row.to_email,
        subject: row.subject,
        status: "failed",
        error_message: err,
        attempt: (row.attempts ?? 0) + 1,
        lead_id: row.lead_id,
        application_id: row.application_id,
      } as never),
    ]);
    return { ok: false, error: err };
  }

  const { data: settings } = await supabaseAdmin
    .from("smtp_settings")
    .select("from_email, from_name, reply_to, is_enabled")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!settings?.is_enabled) return { ok: false, error: "smtp_disabled" };

  // Atomic claim — only one worker may move a row out of queued/failed into
  // `sending`. Without this, the cron worker and a manual "process now" can both
  // pick the same row and deliver the same email twice.
  const { data: claimed } = await supabaseAdmin
    .from("email_queue")
    .update({ status: "sending" })
    .eq("id", row.id)
    .in("status", ["queued", "failed"])
    .select("id");
  if (!claimed || claimed.length === 0) {
    return { ok: true, skipped: true, error: "already_claimed" };
  }

  const attempt = (row.attempts ?? 0) + 1;
  const fromName = settings.from_name || process.env.ZOHO_FROM_NAME || "Business Help Services";
  let smtpResponse: string | null = null;
  let lastError: string | null = null;
  let ok = false;
  let sentMessageId: string | null = null;
  let sentInReplyTo: string | null = null;
  let sentReferences: string | null = null;
  let sentCustomerId: string | null = null;
  let sentFromEmail: string | null = null;
  const provider = await resolveMailProvider();

  try {
    const recipient = row.to_email.toLowerCase().trim();
    const variables = (row.variables ?? {}) as Record<string, unknown>;
    const atts = Array.isArray((variables as { __attachments?: EmailAttachment[] }).__attachments)
      ? ((variables as { __attachments?: EmailAttachment[] }).__attachments as EmailAttachment[])
      : [];

    const plainText =
      (row.body_text && row.body_text.trim()) ||
      htmlToPlainText(row.body_html) ||
      row.subject ||
      " ";

    // Resolve customer_id for threading + look up parent thread if this is a reply.
    let customerId: string | null = null;
    if (row.application_id) {
      const { data: app } = await supabaseAdmin
        .from("applications")
        .select("customer_id")
        .eq("id", row.application_id)
        .maybeSingle();
      customerId = (app?.customer_id as string | undefined) ?? null;
    }
    const parentMessageId =
      typeof (variables as { __in_reply_to?: string }).__in_reply_to === "string"
        ? ((variables as { __in_reply_to?: string }).__in_reply_to as string)
        : null;
    const referencesHeader =
      typeof (variables as { __references?: string }).__references === "string"
        ? ((variables as { __references?: string }).__references as string)
        : parentMessageId;
    const forcedMessageId =
      typeof (variables as { __message_id?: string }).__message_id === "string"
        ? ((variables as { __message_id?: string }).__message_id as string)
        : undefined;
    const cc = (variables as { __cc?: string | string[] }).__cc;
    const bcc = (variables as { __bcc?: string | string[] }).__bcc;

    const res = await sendViaActiveProvider({
      to: recipient,
      cc,
      bcc,
      subject: row.subject,
      html: row.body_html,
      text: plainText,
      fromName,
      replyTo: settings.reply_to ?? undefined,
      attachments: atts.length ? atts.map((a) => ({
        filename: a.filename,
        content_base64: a.content_base64,
        content_type: a.content_type,
      })) : undefined,
      messageId: forcedMessageId,
      inReplyTo: parentMessageId,
      references: referencesHeader,
      orderId: row.application_id,
      customerId,
      templateCode: row.template_code,
      queueId: row.id,
      headers: {
        "X-BHS-Attempt": String(attempt),
      },
    });

    if (res.ok) {
      smtpResponse = `[${provider}] ${res.messageId ?? "ok"} :: ${(res.response ?? "").slice(0, 200)}`;
      ok = true;
      sentMessageId = res.messageId ?? null;
      sentInReplyTo = parentMessageId;
      sentReferences = referencesHeader ?? null;
      sentCustomerId = customerId;
      sentFromEmail = senderEmailFor(provider);

      // Mirror to email_send_log (canonical dashboard table).
      try {
        await supabaseAdmin.from("email_send_log").insert({
          message_id: res.messageId ?? `bhs-${row.id}-${attempt}`,
          template_name: row.template_code ?? "ad_hoc",
          recipient_email: recipient,
          status: "sent",
          metadata: {
            queue_id: row.id,
            attempt,
            response: (res.response ?? "").slice(0, 500),
            lead_id: row.lead_id,
            application_id: row.application_id,
          },
        } as never);
      } catch { /* non-fatal */ }
    } else {
      lastError = res.error?.startsWith(`[${provider}]`)
        ? res.error
        : `[${provider}] ${res.error ?? "unknown"}`;
      try {
        await supabaseAdmin.from("email_send_log").insert({
          message_id: `bhs-${row.id}-${attempt}`,
          template_name: row.template_code ?? "ad_hoc",
          recipient_email: recipient,
          status: "failed",
          error_message: lastError.slice(0, 1000),
          metadata: { queue_id: row.id, attempt, lead_id: row.lead_id, application_id: row.application_id },
        } as never);
      } catch { /* non-fatal */ }
    }
  } catch (e) {
    lastError = `[setup] ${e instanceof Error ? e.message : "unknown"}`;
  }

  if (ok) {
    const writes: Array<PromiseLike<unknown>> = [
      supabaseAdmin
        .from("email_queue")
        .update({ status: "sent", attempts: attempt, sent_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id),
      supabaseAdmin.from("email_logs").insert({
        queue_id: row.id,
        template_code: row.template_code,
        to_email: row.to_email,
        subject: row.subject,
        status: "sent",
        smtp_response: smtpResponse,
        attempt,
        lead_id: row.lead_id,
        application_id: row.application_id,
        customer_id: sentCustomerId,
        direction: "outgoing",
        message_id: sentMessageId,
        in_reply_to: sentInReplyTo,
        references_header: sentReferences,
        from_email: sentFromEmail,
        body_html: row.body_html,
        body_text: row.body_text,
      } as never),
    ];
    if (row.application_id) {
      writes.push(
        supabaseAdmin.from("application_events").insert({
          application_id: row.application_id,
          lead_id: row.lead_id,
          event_type: "email_sent",
          new_value: row.template_code ?? row.subject,
          staff_name: "System",
          staff_role: "system",
        }),
      );
    }
    if (row.template_code) {
      const { data: cur } = await supabaseAdmin
        .from("email_templates")
        .select("total_sent")
        .eq("code", row.template_code)
        .maybeSingle();
      writes.push(
        supabaseAdmin
          .from("email_templates")
          .update({
            last_sent_at: new Date().toISOString(),
            total_sent: ((cur?.total_sent as number | undefined) ?? 0) + 1,
          } as never)
          .eq("code", row.template_code),
      );
    }
    await Promise.all(writes);
    return { ok: true };
  }

  const errMsg = (lastError ?? "Unknown error").slice(0, 1000);
  if (isProviderThrottleError(errMsg)) {
    // Provider-side block: defer WITHOUT consuming a retry attempt so the email
    // is never dead-lettered because the mail service was throttling us.
    const next = new Date(Date.now() + 30 * 60_000).toISOString();
    await Promise.all([
      supabaseAdmin
        .from("email_queue")
        .update({ status: "failed", attempts: row.attempts ?? 0, next_attempt_at: next, last_error: errMsg })
        .eq("id", row.id),
      supabaseAdmin.from("email_logs").insert({
        queue_id: row.id,
        template_code: row.template_code,
        to_email: row.to_email,
        subject: row.subject,
        status: "failed",
        smtp_response: `[${provider}] deferred`,
        error_message: errMsg,
        attempt,
        lead_id: row.lead_id,
        application_id: row.application_id,
      }),
    ]);
    return { ok: false, error: errMsg, providerBlocked: true };
  }

  const isDlq = attempt >= (row.max_attempts ?? 5);
  const delayMin = RETRY_BACKOFF_MIN[Math.min(attempt - 1, RETRY_BACKOFF_MIN.length - 1)];
  const next = new Date(Date.now() + delayMin * 60_000).toISOString();
  await Promise.all([
    supabaseAdmin
      .from("email_queue")
      .update({ status: isDlq ? "dlq" : "failed", attempts: attempt, next_attempt_at: next, last_error: errMsg })
      .eq("id", row.id),
    supabaseAdmin.from("email_logs").insert({
      queue_id: row.id,
      template_code: row.template_code,
      to_email: row.to_email,
      subject: row.subject,
      status: "failed",
      smtp_response: `[${provider}] failed`,
      error_message: errMsg,
      attempt,
      lead_id: row.lead_id,
      application_id: row.application_id,
    }),
  ]);
  return { ok: false, error: errMsg };
}

// ─────────────────────────── Batch retry processor ───────────────────────────
// Kept for the existing cron endpoint — picks up any failed/scheduled rows
// (immediate-send already covers the happy path).

export async function processQueueInternal(limit = 20) {
  // First, rescue any rows stuck in `sending` so they re-enter the rotation.
  await recoverStuckSendingRows(15);

  const { data: rows, error } = await supabaseAdmin
    .from("email_queue")
    .select("id")
    .in("status", ["queued", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return { processed: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  for (const r of rows) {
    const res = await sendQueueRowById((r as { id: string }).id);
    if (res.ok) sent++;
    else {
      failed++;
      if ((res as { providerBlocked?: boolean }).providerBlocked) break;
    }
  }
  return { processed: rows.length, sent, failed };
}


