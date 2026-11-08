INSERT INTO public.email_templates (code, name, subject, body_html, body_text, description, variables, is_enabled, is_system, category, dispatch_mode)
VALUES (
  'bhs_order_resumed',
  'Order Resumed',
  'Good news – Your Order is Back in Processing – Order No. {{order_number}}',
  '<p>Dear {{customer_name}},</p><p>Good news! Your order <strong>{{order_number}}</strong> ({{service_name}}) is now back in active processing. The earlier hold has been cleared and our team has resumed work on your application.</p><p>{{resume_note}}</p><p>You will receive further updates as your application moves forward. If you have any questions, reply to this email or reach us at {{support_email}}.</p><p>Warm regards,<br/>{{company_name}}</p>',
  'Dear {{customer_name}},

Good news! Your order {{order_number}} ({{service_name}}) is now back in active processing. The earlier hold has been cleared and our team has resumed work on your application.

{{resume_note}}

You will receive further updates as your application moves forward. Reply to this email or reach us at {{support_email}} with any questions.

Warm regards,
{{company_name}}',
  'Sent to the customer when a paused/held order is resumed by staff.',
  ARRAY['customer_name','order_number','service_name','resume_note','support_email','company_name'],
  true,
  true,
  'bhs',
  'auto'
)
ON CONFLICT (code) DO NOTHING;