-- Update E011 Technical Delay Resolved Email Template
UPDATE public.email_templates
SET
  name = 'E011 – Technical Delay Resolved – Processing Resumed',
  subject = 'Update on Your Order – Technical Issue Resolved (Order No. {{order_number}})',
  body_html = '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Update on Your Order – Technical Issue Resolved (Order No. {{order_number}})</title></head>
<body style="margin:0; padding:0; background:#F2F4F7;">
<!-- From: help@businesshelpservices.com | Display Name: Care | Business Help Services | Subject: Update on Your Order – Technical Issue Resolved (Order No. {{order_number}}) -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#FFFFFF; border-radius:10px; overflow:hidden; box-shadow:0 2px 10px rgba(18,49,92,0.08);">
      
  <tr><td style="background:#12315C; padding:18px 30px; border-radius:10px 10px 0 0;">
    <span style="font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:17px; font-weight:700; color:#ffffff;">Technical Issue Resolved – Processing Resumed</span>
  </td></tr>
    <tr><td style="padding:28px 30px 0 30px; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">
      <p style="margin:0 0 14px 0; font-weight:700; color:#12315C;">Dear {{customer_name}},</p>
      <p style="margin:0 0 12px 0;">Greetings from Business Help Services.</p><p style="margin:0 0 12px 0;">We are pleased to inform you that the technical issue affecting the processing of your Order/Application No. {{order_number}} has now been successfully resolved.</p><p style="margin:0 0 12px 0;">We sincerely appreciate your patience and understanding during this period. The required operational activities relating to your order have now resumed and further processing will continue in accordance with the scope of the selected service.</p>
    </td></tr>
    <tr><td style="padding:26px 30px 8px 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
          <span style="font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Order Summary</span>
        </td></tr></table>
    </td></tr>
    <tr><td style="padding:14px 30px 0 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; border:1px solid #E3E6EC; border-radius:6px;">
        <tr><td style="padding:14px 16px 4px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Order/Application No.</td><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{order_number}}</td></tr><tr><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Requested Service</td><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{service_name}}</td></tr><tr><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Previous Order Status</td><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">Technical Delay</td></tr><tr><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Current Order Status</td><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">In Process – Processing Resumed</td></tr><tr><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Technical Issue Resolved On</td><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{resolved_at}}</td></tr><tr><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Registered Email</td><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{customer_email}}</td></tr><tr><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Registered Mobile</td><td style="padding:8px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{customer_mobile}}</td></tr></table>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:26px 30px 8px 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
          <span style="font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Status Update</span>
        </td></tr></table>
    </td></tr><tr><td style="padding:10px 30px 0 30px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>The previously reported technical issue affecting the processing of your order has now been successfully resolved.</td></tr><tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Further consultancy, coordination, documentation review, verification, application processing assistance, submission assistance, or other applicable service-related activities have resumed.</td></tr><tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Processing timelines may vary depending upon the nature of the requested service and any applicable operational, verification, Government authority, or portal-related requirements.</td></tr><tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Where additional information, documents, confirmations, OTPs, or customer action are required during further processing, our team may contact you through your registered communication channels.</td></tr></table></td></tr>
    <tr><td style="padding:26px 30px 8px 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
          <span style="font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Next Step</span>
        </td></tr></table>
    </td></tr><tr><td style="padding:10px 30px 0 30px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Your order is presently under further operational processing.</td></tr><tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Once the next stage of processing is completed or any additional action is required, we will communicate the relevant update through the registered communication channels provided under this order.</td></tr><tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Customers are advised to regularly monitor their registered email address and mobile number for service-related communications and updates.</td></tr></table></td></tr>
    <tr><td style="padding:26px 30px 8px 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
          <span style="font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Important Information</span>
        </td></tr></table>
    </td></tr><tr><td style="padding:10px 30px 0 30px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Resolution of the technical issue should not be interpreted as confirmation of Government approval, registration, certificate issuance, or final completion of the requested service.</td></tr><tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Your order shall continue to be processed in accordance with the applicable service scope, operational procedures, and published policies of Business Help Services.</td></tr><tr><td style="padding:6px 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Further updates relating to your order, wherever applicable, shall be communicated through subsequent email notifications.</td></tr></table></td></tr>
    <tr><td style="padding:26px 30px 8px 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
          <span style="font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Support Information</span>
        </td></tr></table>
    </td></tr><tr><td style="padding:4px 30px 0 30px; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">If you have any questions regarding the current status of your order, kindly reply to this email or contact our Customer Care Team during business hours.</td></tr><tr><td style="padding:12px 30px 0 30px; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">Customer Care Availability<br/>Monday to Saturday<br/>10:00 AM to 6:00 PM (IST)<br/>(Excluding National and Public Holidays)</td></tr>
    <tr><td style="padding:24px 30px 0 30px; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:14px; line-height:1.7; color:#2B2E33;">
      <p style="margin:0 0 6px 0;">Regards,<br/>{{executive_name}}<br/>Customer Care Team</p>
      <p style="margin:14px 0 0 0; font-weight:700; color:#12315C;">Business Help Services</p>
      <p style="margin:2px 0 0 0; color:#5B6270; font-size:13px;">Private Consultancy &amp; Assistance Services</p>
      <p style="margin:10px 0 0 0; font-size:13.5px;">&#128222; +91-9767870331 &nbsp;&nbsp; &#128231; help@businesshelpservices.com &nbsp;&nbsp; &#127760; www.udyamadhar.in</p>
    </td></tr>
    <tr><td style="padding:22px 30px 0 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; border-radius:6px; border:1px solid #E3E6EC;">
        <tr><td style="padding:14px 16px;">
          <span style="font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:11.5px; font-weight:700; letter-spacing:0.6px; color:#12315C; text-transform:uppercase;">Important Notice</span>
          <p style="margin:8px 0 0 0; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:12px; line-height:1.6; color:#5B6270;">This is an automatically generated system email regarding the current status of your order. This communication confirms only that the previously reported technical issue has been resolved and that further processing of your order has resumed, wherever applicable. It should not be interpreted as confirmation of order completion, Government approval, registration, certificate issuance, or final disposal of the requested service. Business Help Services maintains electronic records of order processing, customer communications, operational activities, and service-related events for operational, compliance, audit, and record-keeping purposes.</p>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:20px 30px 26px 30px; text-align:center; font-family:''Segoe UI'', Arial, Helvetica, sans-serif; font-size:11px; color:#5B6270;">&copy; Business Help Services &middot; www.udyamadhar.in</td></tr>
    </table>
  </td></tr>
</table>
</body></html>',
  body_text = 'Dear {{customer_name}},

Greetings from Business Help Services.

We are pleased to inform you that the technical issue affecting the processing of your Order/Application No. {{order_number}} has now been successfully resolved.

We sincerely appreciate your patience and understanding during this period. The required operational activities relating to your order have now resumed and further processing will continue in accordance with the scope of the selected service.

ORDER SUMMARY:
Order/Application No.: {{order_number}}
Requested Service: {{service_name}}
Previous Order Status: Technical Delay
Current Order Status: In Process – Processing Resumed
Technical Issue Resolved On: {{resolved_at}}
Registered Email: {{customer_email}}
Registered Mobile: {{customer_mobile}}

Regards,
{{executive_name}}
Customer Care Team
Business Help Services',
  variables = ARRAY['order_number', 'customer_name', 'service_name', 'resolved_at', 'customer_email', 'customer_mobile', 'executive_name']::text[],
  updated_at = NOW()
WHERE code = 'E011';
