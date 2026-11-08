INSERT INTO public.email_templates (code, name, subject, body_html, body_text, is_enabled)
VALUES (
  'consultation_service_converted',
  'Consultation → Service Conversion (Payment Link)',
  'Your service & secure payment link — {{service}}',
  $HTML$<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:linear-gradient(135deg,#0b2545,#13315c);padding:28px 32px;color:#ffffff;">
          <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.85;">Udyam Registration Consultancy &amp; Assistance Services</div>
          <div style="font-size:22px;font-weight:700;margin-top:6px;">Your service is ready — complete your payment</div>
        </td></tr>
        <tr><td style="padding:28px 32px 8px 32px;">
          <p style="margin:0 0 12px 0;font-size:15px;">Dear {{customer_name}},</p>
          <p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;">
            Thank you for speaking with our expert. Based on our conversation, we have set up
            <strong>{{service}}</strong> for you. Please complete the payment using the secure link below
            to begin processing your application.
          </p>
        </td></tr>
        <tr><td align="center" style="padding:8px 32px 28px 32px;">
          <a href="{{payment_url}}" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 34px;border-radius:8px;">Pay Securely Now</a>
          <div style="margin-top:14px;font-size:12px;color:#6b7280;word-break:break-all;">{{payment_url}}</div>
        </td></tr>
        <tr><td style="padding:0 32px 24px 32px;">
          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;font-size:13px;color:#475569;">
            Need help? Reply to this email or call our support team. Our team is available 10 AM – 7 PM IST.
          </div>
        </td></tr>
        <tr><td style="background:#0b2545;color:#cbd5e1;padding:18px 32px;font-size:12px;text-align:center;">
          © Udyam Registration Consultancy &amp; Assistance Services
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>$HTML$,
  'Dear {{customer_name}},

Thank you for speaking with our expert. We have set up {{service}} for you.
Please complete payment using this secure link: {{payment_url}}

— Udyam Registration Consultancy & Assistance Services',
  true
)
ON CONFLICT (code) DO UPDATE
  SET subject = EXCLUDED.subject,
      body_html = EXCLUDED.body_html,
      body_text = EXCLUDED.body_text,
      is_enabled = true,
      updated_at = now();