INSERT INTO public.email_templates (code, name, subject, body_html, body_text, is_enabled)
VALUES (
  'consultation_service_converted',
  'Talk to Expert — Order Completed & Payment Link',
  'Your Order No. {{order_number}} has been completed',
  $HTML$<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;line-height:1.55;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:linear-gradient(135deg,#065f46,#0b8a5b);padding:32px;color:#ffffff;text-align:center;">
          <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.9;">Business Help Services</div>
          <div style="font-size:24px;font-weight:700;margin-top:8px;">✓ Order Completed</div>
          <div style="font-size:13px;margin-top:6px;opacity:.92;">Order No. {{order_number}}</div>
        </td></tr>

        <tr><td style="padding:28px 32px 6px 32px;">
          <p style="margin:0 0 12px 0;font-size:15px;">Dear {{customer_name}},</p>
          <p style="margin:0 0 12px 0;font-size:14px;">Greetings from {{business_name}}.</p>
          <p style="margin:0 0 14px 0;font-size:14px;">
            We are pleased to inform you that your Order/Application No. <strong>{{order_number}}</strong>
            for &ldquo;Talk to Expert – Suitable Service Selection&rdquo; consultancy and assistance service
            has been successfully completed.
          </p>
          <p style="margin:0 0 8px 0;font-size:14px;">
            Based on the consultation and discussion conducted by our support team, the following suitable
            service category has been identified for your requirement:
          </p>
        </td></tr>

        <tr><td style="padding:6px 32px 18px 32px;">
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;">
            <div style="font-size:11px;color:#15803d;letter-spacing:.1em;text-transform:uppercase;font-weight:600;">Selected Service</div>
            <div style="font-size:17px;font-weight:700;color:#064e3b;margin-top:4px;">{{service}}</div>
          </div>
        </td></tr>

        <tr><td style="padding:0 32px 6px 32px;">
          <p style="margin:0 0 12px 0;font-size:14px;">
            If you wish to proceed further with the identified service, you may complete the service payment
            using the secure payment link provided below:
          </p>
        </td></tr>

        <tr><td align="center" style="padding:6px 32px 22px 32px;">
          <a href="{{payment_url}}" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:8px;">🔗 Pay Securely Now</a>
          <div style="margin-top:12px;font-size:12px;color:#6b7280;word-break:break-all;">{{payment_url}}</div>
        </td></tr>

        <tr><td style="padding:0 32px 6px 32px;">
          <p style="margin:0 0 12px 0;font-size:14px;">
            After successful payment confirmation, our team may initiate further consultancy, documentation
            support, communication handling, coordination, and processing assistance relating to the selected service.
          </p>
          <p style="margin:0 0 14px 0;font-size:14px;">
            Please review all details carefully before proceeding with payment.
          </p>
        </td></tr>

        <tr><td style="padding:0 32px 14px 32px;">
          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;font-size:13px;color:#334155;">
            <div style="font-weight:600;color:#0f172a;margin-bottom:6px;">For any support regarding this order, please contact:</div>
            📧 <a href="mailto:{{support_email}}" style="color:#0b5cd6;text-decoration:none;">{{support_email}}</a>
            <div style="margin-top:8px;font-size:12px;color:#64748b;">
              Kindly mention your Order/Application Number in all future communications for quicker assistance and verification.
            </div>
          </div>
        </td></tr>

        <tr><td style="padding:0 32px 18px 32px;">
          <div style="font-size:12.5px;color:#475569;border-left:3px solid #cbd5e1;padding:4px 12px;">
            <div style="font-weight:600;color:#0f172a;margin-bottom:6px;">Please note:</div>
            <ul style="margin:0;padding-left:18px;">
              <li style="margin-bottom:4px;">Business Help Services is a private consultancy and assistance service provider.</li>
              <li style="margin-bottom:4px;">Any charges paid are towards consultancy, communication handling, coordination, facilitation, documentation support, and processing assistance services.</li>
              <li style="margin-bottom:4px;">Final approval, registration, verification, issuance, or processing depends upon relevant authorities, portal systems, eligibility conditions, verification requirements, and accuracy of information/documents provided by the User.</li>
              <li style="margin-bottom:4px;">Users are advised to review the applicable Terms &amp; Conditions, Refund &amp; Cancellation Policy, Disclaimer, and related website policies before making payment.</li>
            </ul>
          </div>
        </td></tr>

        <tr><td style="padding:0 32px 22px 32px;">
          <p style="margin:0 0 12px 0;font-size:13px;color:#475569;font-style:italic;">
            In case no response, objection, or discrepancy is reported by the User within a reasonable period
            after this communication, the consultation/service may be treated as completed for operational and
            record purposes.
          </p>
          <p style="margin:0 0 8px 0;font-size:14px;">
            We thank you for choosing our services and appreciate the opportunity to assist you.
          </p>
          <p style="margin:14px 0 0 0;font-size:14px;">Warm Regards,<br/><strong>Team Business Help Services</strong></p>
        </td></tr>

        <tr><td style="background:#0b2545;color:#cbd5e1;padding:16px 32px;font-size:12px;text-align:center;">
          🌐 <a href="https://{{website}}" style="color:#ffffff;text-decoration:none;font-weight:600;">{{website}}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>$HTML$,
  $TXT$Dear {{customer_name}},

Greetings from {{business_name}}.

We are pleased to inform you that your Order/Application No. {{order_number}} for "Talk to Expert – Suitable Service Selection" consultancy and assistance service has been successfully completed.

Based on the consultation and discussion conducted by our support team, the following suitable service category has been identified for your requirement:

Selected Service: {{service}}

If you wish to proceed further with the identified service, you may complete the service payment using the secure payment link provided below:

Payment Link: {{payment_url}}

After successful payment confirmation, our team may initiate further consultancy, documentation support, communication handling, coordination, and processing assistance relating to the selected service.

Please review all details carefully before proceeding with payment.

For any support regarding this order, please contact:
{{support_email}}

Kindly mention your Order/Application Number in all future communications for quicker assistance and verification.

Please note:
- Business Help Services is a private consultancy and assistance service provider.
- Any charges paid are towards consultancy, communication handling, coordination, facilitation, documentation support, and processing assistance services.
- Final approval, registration, verification, issuance, or processing depends upon relevant authorities, portal systems, eligibility conditions, verification requirements, and accuracy of information/documents provided by the User.
- Users are advised to review the applicable Terms & Conditions, Refund & Cancellation Policy, Disclaimer, and related website policies before making payment.

In case no response, objection, or discrepancy is reported by the User within a reasonable period after this communication, the consultation/service may be treated as completed for operational and record purposes.

We thank you for choosing our services and appreciate the opportunity to assist you.

Warm Regards,
Team Business Help Services
{{website}}$TXT$,
  true
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      subject = EXCLUDED.subject,
      body_html = EXCLUDED.body_html,
      body_text = EXCLUDED.body_text,
      is_enabled = true,
      updated_at = now();