
-- Extend template code regex is done in code; here just seed E012
INSERT INTO public.email_templates (code, name, subject, body_html, body_text, description, variables, is_enabled, is_system, category, sr_no, dispatch_mode)
VALUES (
  'E012',
  'E012 – Service Changed',
  'Update Regarding Your Order – Service Changed to {{new_service}} (Order No. {{order_number}})',
$HTML$<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Service Changed – Order No. {{order_number}}</title></head>
<body style="margin:0; padding:0; background:#F2F4F7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#FFFFFF; border-radius:10px; overflow:hidden; box-shadow:0 2px 10px rgba(18,49,92,0.08);">
    <tr><td style="background:#12315C; padding:18px 30px; border-radius:10px 10px 0 0;">
      <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:17px; font-weight:700; color:#ffffff;">Your Service Has Been Updated</span>
    </td></tr>
    <tr><td style="padding:28px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">
      <p style="margin:0 0 14px 0; font-weight:700; color:#12315C;">Dear {{customer_name}},</p>
      <p style="margin:0 0 12px 0;">As per your request / our discussion, the service on your order <strong>{{order_number}}</strong> has been updated. Please review the revised details below.</p>
      <p style="margin:0 0 12px 0;">{{mode_message}}</p>
    </td></tr>

    <tr><td style="padding:26px 30px 8px 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
          <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Service Update Summary</span>
        </td></tr></table>
    </td></tr>
    <tr><td style="padding:14px 30px 0 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; border:1px solid #E3E6EC; border-radius:6px;">
        <tr><td style="padding:14px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC;">Order / Application No.</td>
              <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC;">{{order_number}}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; border-bottom:1px solid #E3E6EC;">Previous Service</td>
              <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; border-bottom:1px solid #E3E6EC;">{{previous_service}}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; border-bottom:1px solid #E3E6EC;">Updated Service</td>
              <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#12315C; font-weight:700; border-bottom:1px solid #E3E6EC;">{{new_service}}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; border-bottom:1px solid #E3E6EC;">Amount Already Paid</td>
              <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC;">&#8377;{{amount_paid}}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; border-bottom:1px solid #E3E6EC;">New Service Total</td>
              <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC;">&#8377;{{new_total}}</td>
            </tr>
            {{balance_row_html}}
          </table>
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:24px 30px 0 30px; text-align:center;">
      <a href="{{cta_url}}" style="display:inline-block; background:#12315C; color:#ffffff; text-decoration:none; padding:12px 26px; border-radius:6px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14px; font-weight:700;">{{cta_label}}</a>
      <p style="margin:10px 0 0 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:12px; color:#8A8F98;">{{cta_note}}</p>
    </td></tr>

    {{upgrade_note_html}}

    <tr><td style="padding:26px 30px 24px 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; line-height:1.7; color:#5B6270;">
      If you have any questions about this change, please reply to this email or write to <a href="mailto:{{support_email}}" style="color:#12315C;">{{support_email}}</a> and our team will assist you.
    </td></tr>

    <tr><td style="background:#F8F9FB; padding:16px 30px; border-top:1px solid #E3E6EC; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:12px; color:#8A8F98;">
      Warm regards,<br/>
      <strong style="color:#12315C;">Team Business Help Services</strong><br/>
      help@businesshelpservices.com &nbsp;|&nbsp; udyamadhar.in
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>$HTML$,
  'Your order service has been updated. See the summary in this email.',
  'Sent when staff changes the service on an order (before form submission). Handles same-price / downgrade / upgrade scenarios via mode_message + balance_row_html + upgrade_note_html.',
  ARRAY['customer_name','order_number','previous_service','new_service','amount_paid','new_total','balance_due','mode_message','cta_url','cta_label','cta_note','balance_row_html','upgrade_note_html','support_email'],
  true,
  true,
  'order',
  16,
  'auto'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  body_text = EXCLUDED.body_text,
  description = EXCLUDED.description,
  variables = EXCLUDED.variables,
  updated_at = now();
