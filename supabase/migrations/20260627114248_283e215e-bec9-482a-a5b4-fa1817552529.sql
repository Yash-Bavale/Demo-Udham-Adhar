ALTER TYPE public.closure_stage ADD VALUE IF NOT EXISTS 'concern_reply_sent';
ALTER TYPE public.closure_stage ADD VALUE IF NOT EXISTS 'refund_reviewed';
ALTER TYPE public.closure_stage ADD VALUE IF NOT EXISTS 'final_ticket_closed';
ALTER TYPE public.closure_stage ADD VALUE IF NOT EXISTS 'acknowledged';

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS closure_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS closure_reason_text TEXT;

ALTER TABLE public.workflow_settings
  ADD COLUMN IF NOT EXISTS cancel_wait_hours INTEGER NOT NULL DEFAULT 24;

INSERT INTO public.email_templates (code, name, subject, body_html, body_text, description, is_enabled, is_system, variables)
VALUES
('cancel-action-required',
 'Cancellation — Action Required (Step 1)',
 'Update Regarding Order No. {{order_number}}',
 $HTML$<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#1f2937;line-height:1.55">
<div style="background:linear-gradient(135deg,#fb923c,#ef4444);color:#fff;padding:18px 22px;border-radius:10px 10px 0 0;font-weight:700;font-size:18px">Action Required for Your Order</div>
<div style="background:#ffffff;border:1px solid #fde2cc;border-top:none;padding:22px 24px;border-radius:0 0 10px 10px">
<p>Dear {{customer_name}},</p>
<p>This email is regarding your Order/Application No. <strong>{{order_number}}</strong> placed for <strong>{{service_name}}</strong> through our platform.</p>
<p>As part of our standard service process, our support/service expert attempted to assist you using the contact details provided during order submission.</p>
<p>During the communication and verification process, the following status/reason was recorded:</p>
<div style="background:#fff7ed;border-left:4px solid #f97316;padding:12px 14px;margin:14px 0;border-radius:4px;white-space:pre-wrap">{{reason_block}}</div>
<p>Based on the current status of the request and communication received, the order is presently marked as <strong>Pending Closure/Inactive</strong> in our system for operational purposes.</p>
<p>If you wish to continue the service within the scope of the existing order, you may reply to this email within a reasonable period for further assistance, subject to operational feasibility and applicable conditions.</p>
<p>Please note that at the time of placing the order, the applicable Terms &amp; Conditions, Refund &amp; Cancellation Policy, and related policies published on the website were acknowledged and accepted.</p>
<p>As per the applicable policies:</p>
<ul>
<li>Certain services may become non-refundable once consultation, expert allocation, coordination, processing assistance, documentation work, or related service activities have commenced.</li>
<li>Refund eligibility, wherever applicable, shall be governed strictly in accordance with the policies published on the website.</li>
</ul>
<p>In case no response or further communication is received within a reasonable period, the order may be treated as closed for operational and record purposes.</p>
<p>We appreciate your time and cooperation.</p>
<p style="margin-top:18px">Warm Regards,<br/><strong>Team Business Help Services</strong><br/>🌐 <a href="https://udyamadhar.in" style="color:#2563eb">udyamadhar.in</a></p>
</div></div>$HTML$,
 'Dear {{customer_name}}, This email is regarding your Order/Application No. {{order_number}} placed for {{service_name}}. Reason: {{reason_block}}. Please reply within a reasonable period if you wish to continue. — Team Business Help Services, udyamadhar.in',
 'Step 1 of cancellation workflow — sent immediately when staff records a cancellation/refund request.',
 true, true, ARRAY['customer_name','order_number','service_name','reason_block']),

('cancel-closure-confirmation',
 'Cancellation — Closure Confirmation (Step 2)',
 'Final Update Order Closure Confirmation – Order No. {{order_number}}',
 $HTML$<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#1f2937;line-height:1.55">
<div style="background:linear-gradient(135deg,#7f1d1d,#dc2626);color:#fff;padding:18px 22px;border-radius:10px 10px 0 0;font-weight:700;font-size:18px">Order Closure Confirmation</div>
<div style="background:#ffffff;border:1px solid #fecaca;border-top:none;padding:22px 24px;border-radius:0 0 10px 10px">
<p>Dear {{customer_name}},</p>
<p>This email is regarding your Order/Application No. <strong>{{order_number}}</strong> placed for <strong>{{service_name}}</strong> through our platform.</p>
<p>As part of our standard service process, our support/service team previously attempted to contact and assist you regarding the processing requirements associated with your requested service.</p>
<p>However, despite earlier communication attempts, follow-up coordination, and operational assistance, the required response, confirmation, verification, communication, documentation, or processing requirements could not be completed for the following reason:</p>
<div style="border-top:2px solid #1f2937;border-bottom:2px solid #1f2937;padding:14px 0;margin:18px 0">
<div style="font-weight:700;text-align:center;letter-spacing:.1em;font-size:12px;color:#7f1d1d;margin-bottom:8px">REASON FOR ORDER CLOSURE</div>
<div style="white-space:pre-wrap;text-align:center">{{reason_block}}</div>
</div>
<div style="border-top:2px solid #1f2937;border-bottom:2px solid #1f2937;padding:14px 0;margin:18px 0">
<div style="font-weight:700;text-align:center;letter-spacing:.1em;font-size:12px;color:#7f1d1d;margin-bottom:8px">ORDER STATUS</div>
<div style="text-align:center">
Order/Application No.: <strong>{{order_number}}</strong><br/>
Current Status: <strong>CLOSED</strong><br/>
Requested Service: <strong>{{service_name}}</strong>
</div>
</div>
<div style="border-top:2px solid #1f2937;border-bottom:2px solid #1f2937;padding:14px 0;margin:18px 0">
<div style="font-weight:700;text-align:center;letter-spacing:.1em;font-size:12px;color:#7f1d1d;margin-bottom:8px">IMPORTANT INFORMATION</div>
<p>Accordingly, due to the operational circumstances and/or absence of the required response or processing requirements within a reasonable period, the above order has now been marked as <strong>CLOSED</strong> in our operational system for record and service-management purposes in accordance with the applicable website policies.</p>
<p>Please note:</p>
<ul>
<li>No further operational activities, consultation, coordination, verification, communication, documentation handling, or processing assistance shall continue under this order unless separately reviewed by the Company.</li>
<li>Certain services may become non-cancellable or non-refundable once consultation, expert allocation, coordination, processing assistance, documentation work, communication handling, verification support, or related service activities have commenced.</li>
<li>Refund eligibility, wherever applicable, shall be governed strictly in accordance with the applicable Refund &amp; Cancellation Policy, Terms &amp; Conditions, Service Delivery Policy, and related website policies.</li>
<li>External delays, technical interruptions, portal downtime, eligibility conditions, verification requirements, communication limitations, user-side issues, or third-party system dependencies may affect service continuity, timelines, or completion.</li>
</ul>
</div>
<div style="border-top:2px solid #1f2937;border-bottom:2px solid #1f2937;padding:14px 0;margin:18px 0">
<div style="font-weight:700;text-align:center;letter-spacing:.1em;font-size:12px;color:#7f1d1d;margin-bottom:8px">RECORD &amp; COMMUNICATION MANAGEMENT</div>
<p>For operational, compliance, security, service-management, and record-maintenance purposes, the Company may retain records relating to:</p>
<ul>
<li>Order and payment details</li>
<li>Communication logs and email correspondence</li>
<li>Service-processing activity and operational remarks</li>
<li>Verification, coordination, and consultation records</li>
<li>Support, grievance, or follow-up communication</li>
</ul>
</div>
<div style="border-top:2px solid #1f2937;border-bottom:2px solid #1f2937;padding:14px 0;margin:18px 0">
<div style="font-weight:700;text-align:center;letter-spacing:.1em;font-size:12px;color:#7f1d1d;margin-bottom:8px">FURTHER ASSISTANCE</div>
<p>If you wish to seek clarification or communicate further regarding this matter, you may reply to this email for operational review.</p>
<p>Any future continuation, reopening, or fresh processing request shall remain subject to operational feasibility, policy applicability, verification requirements, and Company review.</p>
</div>
<p>We appreciate your time and cooperation.</p>
<p style="margin-top:18px">Warm Regards,<br/><strong>Team Business Help Services</strong><br/>🌐 <a href="https://udyamadhar.in" style="color:#2563eb">udyamadhar.in</a></p>
</div></div>$HTML$,
 'Order {{order_number}} for {{service_name}} has been marked CLOSED. Reason: {{reason_block}}. — Team Business Help Services, udyamadhar.in',
 'Step 2 — sent 24h after Step 1 when no customer response was received; moves application to cancelled.',
 true, true, ARRAY['customer_name','order_number','service_name','reason_block']),

('cancel-concern-reply',
 'Cancellation — Customer Concern Reply (Step 3)',
 'Regarding Your Concern for Order No. {{order_number}}',
 $HTML$<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#1f2937;line-height:1.55">
<div style="background:linear-gradient(135deg,#4f46e5,#2563eb);color:#fff;padding:18px 22px;border-radius:10px 10px 0 0;font-weight:700;font-size:18px">Regarding Your Concern</div>
<div style="background:#ffffff;border:1px solid #dbeafe;border-top:none;padding:22px 24px;border-radius:0 0 10px 10px">
<p>Dear {{customer_name}},</p>
<p>Thank you for your email and for sharing your concern regarding Order/Application No. <strong>{{order_number}}</strong>.</p>
<p>We would like to respectfully clarify that our platform operates as a private consultancy and assistance service provider offering consultancy, coordination, documentation support, facilitation, and related process assistance services.</p>
<p>As per our operational records, our team had already initiated service-related activities associated with your order, including communication attempts, consultation support, expert allocation, verification coordination, and/or processing assistance based on the selected service requirement.</p>
<p>During the course of communication and processing, the following issue affected further continuation of the requested service:</p>
<div style="background:#eff6ff;border-left:4px solid #2563eb;padding:12px 14px;margin:14px 0;border-radius:4px;white-space:pre-wrap">{{reason_block}}</div>
<p>We further wish to clarify that the applicable Terms &amp; Conditions, Refund &amp; Cancellation Policy, Disclaimer, and related website policies were made available prior to payment and form part of the service agreement accepted during order submission.</p>
<p>Please note:</p>
<ul>
<li>Certain services may require OTP verification, communication support, documents, confirmations, or timely response from the User for successful processing.</li>
<li>Service timelines and outcomes may also depend upon external systems, relevant authorities, verification procedures, technical conditions, and operational factors beyond direct control.</li>
<li>Fees charged on the platform are towards consultancy, coordination, facilitation, documentation assistance, and related professional service efforts.</li>
</ul>
<p>We sincerely regret any inconvenience caused and appreciate your understanding regarding the operational limitations and policy conditions applicable to the requested service.</p>
<p>If you wish to share any additional clarification or require further assistance, you may continue communication through this email thread.</p>
<p style="margin-top:18px">Warm Regards,<br/><strong>Team Business Help Services</strong><br/>🌐 <a href="https://udyamadhar.in" style="color:#2563eb">udyamadhar.in</a></p>
</div></div>$HTML$,
 'Thank you for your concern regarding Order {{order_number}}. Reason: {{reason_block}}. — Team Business Help Services, udyamadhar.in',
 'Step 3 — sent manually when customer argues for refund/cancel after Step 2.',
 true, true, ARRAY['customer_name','order_number','reason_block']),

('cancel-ticket-closed',
 'Cancellation — Ticket Closed (Step 4)',
 'Ticket Closed - Order No. {{order_number}}',
 $HTML$<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#1f2937;line-height:1.55">
<div style="background:linear-gradient(135deg,#64748b,#334155);color:#fff;padding:18px 22px;border-radius:10px 10px 0 0;font-weight:700;font-size:18px">Support Request Closed</div>
<div style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;padding:22px 24px;border-radius:0 0 10px 10px">
<p>Dear {{customer_name}},</p>
<p>This email is regarding your Order/Application No. <strong>{{order_number}}</strong> placed for <strong>{{service_name}}</strong> through our platform.</p>
<p><strong>Reference Details:</strong></p>
<ul>
<li>Order/Application No.: <strong>{{order_number}}</strong></li>
<li>Support Ticket No.: <strong>{{ticket_id}}</strong></li>
<li>Ticket Status: <strong>Closed</strong></li>
<li>Closure Date: <strong>{{date_ist}}</strong></li>
</ul>
<p>Our team previously attempted to coordinate with you regarding the processing requirements, communication, verification, confirmation, and/or assistance necessary for continuation of the requested service.</p>
<p>However, despite earlier communication attempts and reasonable operational time provided, the required response/confirmation could not be completed due to the following reason:</p>
<div style="background:#f1f5f9;border-left:4px solid #64748b;padding:12px 14px;margin:14px 0;border-radius:4px;white-space:pre-wrap">{{reason_block}}</div>
<p>Accordingly, the support request/order has now been treated as <strong>Closed</strong> for operational and record-management purposes in accordance with the applicable website policies and operational procedures.</p>
<p>Please note:</p>
<ul>
<li>Certain services may become non-refundable once consultation, coordination, expert allocation, documentation assistance, processing support, or related operational activities have commenced.</li>
<li>Service processing may require communication support, OTP verification, documents, confirmations, or timely response from the User.</li>
<li>Processing timelines and outcomes may also depend upon external portals, relevant authorities, verification procedures, technical conditions, and operational factors beyond direct control.</li>
</ul>
<p>If you wish to seek clarification or request further assistance, you may continue communication through this email thread, subject to operational feasibility and applicable conditions.</p>
<p>We appreciate your time and cooperation.</p>
<p style="margin-top:18px">Warm Regards,<br/><strong>Team Business Help Services</strong><br/>🌐 <a href="https://udyamadhar.in" style="color:#2563eb">udyamadhar.in</a></p>
</div></div>$HTML$,
 'Support ticket for Order {{order_number}} is now CLOSED. — Team Business Help Services, udyamadhar.in',
 'Step 4 — sent 24h after Step 3 when no further customer response.',
 true, true, ARRAY['customer_name','order_number','service_name','reason_block','ticket_id','date_ist']),

('cancel-refund-reviewed',
 'Cancellation — Refund Request Reviewed (Step 5)',
 'Regarding Your Refund Request – Order No. {{order_number}}',
 $HTML$<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#1f2937;line-height:1.55">
<div style="background:linear-gradient(135deg,#ea580c,#b91c1c);color:#fff;padding:18px 22px;border-radius:10px 10px 0 0;font-weight:700;font-size:18px">Refund Request Reviewed</div>
<div style="background:#ffffff;border:1px solid #fecaca;border-top:none;padding:22px 24px;border-radius:0 0 10px 10px">
<p>Dear {{customer_name}},</p>
<p>Thank you for your communication regarding Order/Application No. <strong>{{order_number}}</strong>.</p>
<p>We understand your concern regarding the refund request and have reviewed the matter based on the operational records, communication history, and applicable website policies associated with the order.</p>
<p>As per our review, service-related operational activities associated with the requested service had already been initiated, including communication handling, consultation support, coordination, expert allocation, processing assistance, and/or related operational efforts.</p>
<p>We further note that the applicable Terms &amp; Conditions, Refund &amp; Cancellation Policy, Disclaimer, and related service policies were made available prior to payment and form part of the service agreement accepted during the order process.</p>
<p><strong>Based on the operational review and applicable policy conditions, the present request does not fall under refundable conditions.</strong></p>
<p>Nevertheless, your communication and concerns have been duly recorded in our support system for review and compliance purposes.</p>
<p>We appreciate your understanding and cooperation.</p>
<p style="margin-top:18px">Regards,<br/><strong>Team Business Help Services</strong><br/>🌐 <a href="https://udyamadhar.in" style="color:#2563eb">udyamadhar.in</a></p>
</div></div>$HTML$,
 'Your refund request for Order {{order_number}} has been reviewed and does not fall under refundable conditions. — Team Business Help Services, udyamadhar.in',
 'Step 5 — sent manually when customer argues again for refund after Step 4.',
 true, true, ARRAY['customer_name','order_number']),

('cancel-ticket-closed-final',
 'Cancellation — Final Ticket Closure (Step 6)',
 'Ticket Closed – Order No. {{order_number}}',
 $HTML$<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#1f2937;line-height:1.55">
<div style="background:linear-gradient(135deg,#475569,#1e293b);color:#fff;padding:18px 22px;border-radius:10px 10px 0 0;font-weight:700;font-size:18px">Support Ticket Closed</div>
<div style="background:#ffffff;border:1px solid #cbd5e1;border-top:none;padding:22px 24px;border-radius:0 0 10px 10px">
<p>Dear {{customer_name}},</p>
<p>This email is regarding the support communication associated with your Order/Application No. <strong>{{order_number}}</strong>.</p>
<p>As no further response, clarification, or additional communication has been received within a reasonable period following our previous correspondence, the related support ticket has now been marked as <strong>CLOSED</strong> in our system for operational and record-management purposes.</p>
<div style="border-top:2px solid #1f2937;border-bottom:2px solid #1f2937;padding:14px 0;margin:18px 0">
<div style="font-weight:700;text-align:center;letter-spacing:.1em;font-size:12px;color:#475569;margin-bottom:8px">TICKET STATUS</div>
<div style="text-align:center">
Order/Application No.: <strong>{{order_number}}</strong><br/>
Support Ticket Status: <strong>CLOSED</strong><br/>
Requested Service: <strong>{{service_name}}</strong>
</div>
</div>
<div style="border-top:2px solid #1f2937;border-bottom:2px solid #1f2937;padding:14px 0;margin:18px 0">
<div style="font-weight:700;text-align:center;letter-spacing:.1em;font-size:12px;color:#475569;margin-bottom:8px">IMPORTANT INFORMATION</div>
<ul>
<li>The support ticket closure is based on the current communication status and operational records available with the Company.</li>
<li>The underlying order/service status shall continue to remain governed in accordance with the applicable operational records, Terms &amp; Conditions, Refund &amp; Cancellation Policy, Disclaimer, Service Delivery Policy, and related website policies.</li>
<li>Operational, communication, verification, consultation, coordination, or processing-related records associated with the order may continue to be retained for compliance, security, support, and record-management purposes.</li>
</ul>
</div>
<div style="border-top:2px solid #1f2937;border-bottom:2px solid #1f2937;padding:14px 0;margin:18px 0">
<div style="font-weight:700;text-align:center;letter-spacing:.1em;font-size:12px;color:#475569;margin-bottom:8px">FURTHER COMMUNICATION</div>
<p>If you wish to communicate further regarding this matter, you may reply to this email for operational review.</p>
<p>Any future review, reopening, or assistance request shall remain subject to operational feasibility, policy applicability, and Company discretion.</p>
</div>
<p>We appreciate your time and cooperation.</p>
<p style="margin-top:18px">Regards,<br/><strong>Team Business Help Services</strong><br/>🌐 <a href="https://udyamadhar.in" style="color:#2563eb">udyamadhar.in</a></p>
</div></div>$HTML$,
 'Support ticket for Order {{order_number}} has been finally CLOSED. — Team Business Help Services, udyamadhar.in',
 'Step 6 — sent 24h after Step 5 when no further customer response.',
 true, true, ARRAY['customer_name','order_number','service_name']),

('cancel-post-closure-ack',
 'Cancellation — Post-Closure Acknowledgement (Step 7)',
 'Re: Order No. {{order_number}}',
 $HTML$<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#1f2937;line-height:1.55">
<div style="background:#f8fafc;border:1px solid #e2e8f0;padding:22px 24px;border-radius:10px">
<p>Dear {{customer_name}},</p>
<p>We acknowledge your recent communication regarding Order/Application No. <strong>{{order_number}}</strong>.</p>
<p>The matter associated with the above order has already been reviewed in accordance with the applicable operational records, communication history, and website policies. Accordingly, the previous response communicated by our team continues to remain applicable.</p>
<p>Nevertheless, your communication has been duly recorded in our system for operational, compliance, and record-management purposes.</p>
<p>If any further operational review becomes necessary, the same shall remain subject to Company review, policy applicability, and operational feasibility.</p>
<p style="margin-top:18px">Regards,<br/><strong>Team Business Help Services</strong><br/>🌐 <a href="https://udyamadhar.in" style="color:#2563eb">udyamadhar.in</a></p>
</div></div>$HTML$,
 'Your message regarding Order {{order_number}} has been recorded. The previous response continues to remain applicable. — Team Business Help Services, udyamadhar.in',
 'Step 7 — sent manually whenever the customer replies again after the final closure.',
 true, true, ARRAY['customer_name','order_number'])
ON CONFLICT (code) DO UPDATE
SET subject = EXCLUDED.subject,
    body_html = EXCLUDED.body_html,
    body_text = EXCLUDED.body_text,
    description = EXCLUDED.description,
    is_enabled = EXCLUDED.is_enabled,
    is_system = EXCLUDED.is_system,
    variables = EXCLUDED.variables,
    updated_at = now();