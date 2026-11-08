-- Seed / Update R002 Refund Rejected Email Template
INSERT INTO public.email_templates (
  code,
  name,
  subject,
  body_html,
  body_text,
  is_enabled,
  dispatch_mode,
  created_at,
  updated_at
)
VALUES (
  'R002',
  'R002 – Refund Request Not Approved / Closed',
  'Refund Request Update – Order No. {{order_number}}',
  '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Refund Request Update – Order No. {{order_number}}</title></head>
<body style="margin:0; padding:0; background:#F2F4F7;">
<!-- From: help@businesshelpservices.com | Display Name: Care | Business Help Services | Subject: Refund Request Update – Order No. {{order_number}} -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#FFFFFF; border-radius:10px; overflow:hidden; box-shadow:0 2px 10px rgba(18,49,92,0.08);">

      <tr><td style="background:#12315C; padding:18px 30px; border-radius:10px 10px 0 0;">
        <span style="font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:17px; font-weight:700; color:#ffffff;">Refund Request Not Approved</span>
      </td></tr>

      <tr><td style="padding:28px 30px 0 30px; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">
        <p style="margin:0 0 14px 0; font-weight:700; color:#12315C;">Dear {{customer_name}},</p>
        <p style="margin:0 0 12px 0;">Thank you for contacting Business Help Services.</p>
        <p style="margin:0 0 12px 0;">We have reviewed your refund request for Order No. {{order_number}} and the associated application/service records.</p>
        <p style="margin:0 0 0 0;">After reviewing the order status, service activity, communication records, and applicable refund terms, we regret to inform you that your refund request cannot be approved.</p>
      </td></tr>

      <!-- Order Summary -->
      <tr><td style="padding:20px 30px 6px 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
            <span style="font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Order Summary</span>
          </td></tr></table>
      </td></tr>
      <tr><td style="padding:14px 30px 0 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; border:1px solid #E3E6EC; border-radius:6px;">
          <tr><td style="padding:14px 16px 4px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Order/Application No.</td><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{order_number}}</td></tr>
              <tr><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Invoice No.</td><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{invoice_number}}</td></tr>
              <tr><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Requested Service</td><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{service_name}}</td></tr>
              <tr><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Current Order Status</td><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">Closed</td></tr>
              <tr><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Order Created On</td><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{order_created_at}}</td></tr>
              <tr><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Order Closure Date &amp; Time</td><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{closure_date}}</td></tr>
              <tr><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Registered Email</td><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{customer_email}}</td></tr>
              <tr><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; vertical-align:top;">Registered Mobile</td><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; vertical-align:top;">{{customer_mobile}}</td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>

      <!-- Reason for Refund Rejection -->
      <tr><td style="padding:20px 30px 6px 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
            <span style="font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Reason for Refund Rejection</span>
          </td></tr></table>
      </td></tr>
      <tr><td style="padding:10px 30px 0 30px; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">
        Your request falls under one or more of the following conditions covered by our service and refund policy:
      </td></tr>
      <tr><td style="padding:8px 30px 0 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Service processing has already started:</b> Our team has initiated processing of your application after receiving the order/payment.</td></tr>
          <tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Application/service work has been performed:</b> Our team may have reviewed, verified, processed, prepared, or submitted information/documents related to your application.</td></tr>
          <tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Customer-side delay or non-cooperation:</b> Required information, documents, confirmation, or responses were not provided within the required timeframe, where applicable.</td></tr>
          <tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Incorrect or incomplete information provided by the customer:</b> Delays or inability to complete the service resulting from incorrect, incomplete, or inconsistent information/documents provided by the customer are not eligible for a refund.</td></tr>
          <tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Government/third-party dependency:</b> Where completion depends on a government portal, authority, department, verification process, or other third party, delays or changes outside our control do not automatically qualify for a refund.</td></tr>
          <tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Application already processed/completed:</b> Refunds are not applicable where the requested service has already been completed or the applicable certificate/document/service output has been delivered.</td></tr>
          <tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Customer-requested cancellation after processing:</b> Cancellation requests received after service processing has commenced may not be eligible for a refund.</td></tr>
          <tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Non-availability/unresponsiveness after order placement:</b> If the application could not proceed because the customer was unavailable, did not provide required information, or did not respond to communication attempts, the order may not qualify for a refund.</td></tr>
          <tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Change of mind:</b> A refund is not applicable solely because the customer subsequently decides not to proceed after service processing has commenced.</td></tr>
          <tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Duplicate or unnecessary service request:</b> Where the service has already been initiated or completed through the same or another order, the duplicate order may not qualify for a refund.</td></tr>
          <tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Third-party/government fee or processing component:</b> Any amount already incurred, paid, committed, or allocated towards third-party/government processing may be non-refundable, where applicable.</td></tr>
          <tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span><b>Policy-based exclusion:</b> The particular circumstances of the request do not satisfy the eligibility conditions specified in our applicable refund/cancellation policy.</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:12px 30px 0 30px; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">Additional Remarks (if applicable): {{employee_remarks}}</td></tr>

      <!-- Our Review -->
      <tr><td style="padding:20px 30px 6px 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
            <span style="font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Our Review</span>
          </td></tr></table>
      </td></tr>
      <tr><td style="padding:8px 30px 0 30px; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.6; color:#2B2E33;">
        This decision has been made based on the information and records available against your order, including the order status, service activity, application information, documents/information provided, and communication history, as applicable.<br/>
        If you believe that the above decision has been made incorrectly, you may reply to this email with the specific reason for your disagreement and any supporting information/documents. Our support team can review the matter again based on the available records.
      </td></tr>

      <!-- Support -->
      <tr><td style="padding:18px 30px 0 30px; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:14px; line-height:1.7; color:#2B2E33;">
        <p style="margin:0 0 0 0;">We appreciate your understanding. For any assistance, kindly reply to this email or contact our Customer Care Team during business hours.</p>
      </td></tr>
      <tr><td style="padding:12px 30px 0 30px; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">Customer Care Availability<br/>Monday to Saturday<br/>10:00 AM to 6:00 PM (IST)<br/>(Excluding National and Public Holidays)</td></tr>

      <!-- Important Links -->
      <tr><td style="padding:14px 30px 0 30px; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; color:#12315C;">IMPORTANT LINKS</td></tr>
      <tr><td style="padding:12px 30px 0 30px; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:12.5px; color:#5B6270; line-height:2;"><a href="https://udyamadhar.in/terms-conditions" style="color:#12315C; text-decoration:none; font-weight:600;">Terms &amp; Conditions</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/refund-cancellation-policy" style="color:#12315C; text-decoration:none; font-weight:600;">Refund &amp; Cancellation Policy</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/privacy-policy" style="color:#12315C; text-decoration:none; font-weight:600;">Privacy Policy</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/disclaimer" style="color:#12315C; text-decoration:none; font-weight:600;">Disclaimer</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/service-delivery-policy" style="color:#12315C; text-decoration:none; font-weight:600;">Service Delivery Policy</a></td></tr>

      <!-- Sign off -->
      <tr><td style="padding:18px 30px 0 30px; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:14px; line-height:1.7; color:#2B2E33;">
        <p style="margin:0 0 6px 0;">Regards,<br/>{{executive_name}}<br/>Customer Care Team</p>
        <p style="margin:2px 0 0 0; color:#5B6270; font-size:13px;">Private Consultancy &amp; Assistance Services</p>
        <p style="margin:10px 0 0 0; font-size:13.5px;">&#128222; +91-9767870331 &nbsp;&nbsp; &#128231; help@businesshelpservices.com &nbsp;&nbsp; &#127760; www.udyamadhar.in</p>
      </td></tr>

      <!-- Notice -->
      <tr><td style="padding:22px 30px 0 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; border-radius:6px; border:1px solid #E3E6EC;">
          <tr><td style="padding:14px 16px;">
            <span style="font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:11.5px; font-weight:700; letter-spacing:0.6px; color:#12315C; text-transform:uppercase;">Important Notice</span>
            <p style="margin:8px 0 0 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:12px; line-height:1.6; color:#5B6270;">This is an official communication regarding the outcome of your refund request. This decision has been made in accordance with the applicable Refund &amp; Cancellation Policy of Business Help Services, based on a review of the operational status and service activities performed under this order. This communication does not affect the operational status of your order unless separately communicated. Business Help Services maintains electronic records of refund requests, reviews, decisions, and customer communications for operational, compliance, audit, and record-keeping purposes.</p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 30px 26px 30px; text-align:center; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:11px; color:#5B6270;">&copy; Business Help Services &middot; www.udyamadhar.in</td></tr>

    </table>
  </td></tr>
</table>
</body></html>',
  'Dear {{customer_name}},

Thank you for contacting Business Help Services. We have reviewed your refund request for Order No. {{order_number}} and regret to inform you that your refund request cannot be approved at this stage as per our service and refund policy.

Order Summary:
Order/Application No: {{order_number}}
Invoice No: {{invoice_number}}
Service: {{service_name}}
Status: Closed
Created: {{order_created_at}}
Closed: {{closure_date}}

Remarks: {{employee_remarks}}

Regards,
{{executive_name}}
Customer Care Team
Business Help Services',
  true,
  'manual',
  NOW(),
  NOW()
)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  body_text = EXCLUDED.body_text,
  is_enabled = EXCLUDED.is_enabled,
  dispatch_mode = EXCLUDED.dispatch_mode,
  updated_at = NOW();
