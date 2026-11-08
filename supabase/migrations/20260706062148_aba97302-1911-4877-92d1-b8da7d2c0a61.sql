
-- 1) Copy staged 12 templates into email_templates (decode base64)
UPDATE public.email_templates t
   SET subject   = s.subject,
       body_html = convert_from(decode(s.body_b64,'base64'),'UTF8'),
       category  = s.category,
       flow_id   = NULLIF(s.flow_id,''),
       sr_no     = s.sr_no,
       is_enabled = TRUE,
       updated_at = now()
  FROM public.email_templates_stage s
 WHERE t.code = s.code;

-- 2) Backfill categories for the remaining rows
UPDATE public.email_templates SET category = 'Onboarding & Payment' WHERE category IS NULL AND code IN
 ('payment_success','lead_welcome','onboarding_complete','onboarding_reminder','docs_required_reminder','final-notice-before-closure');
UPDATE public.email_templates SET category = 'Fulfillment' WHERE category IS NULL AND code IN
 ('certificate_delivery','service_started_notification');
UPDATE public.email_templates SET category = 'Delay & Hold' WHERE category IS NULL AND code IN
 ('bhs_e003_customer_delay','bhs_e005_manual_reminder','workflow_external_delay_notice','workflow_processing_update_3d','order_pending_closure');
UPDATE public.email_templates SET category = 'Closure' WHERE category IS NULL AND code IN
 ('cancel-closure-confirmation','cancel-post-closure-ack','post_closure_acknowledgement','order-closed-notice','workflow_closure_notice');
UPDATE public.email_templates SET category = 'Support / Tickets' WHERE category IS NULL AND code IN
 ('ticket_created','support_ticket_closed','cancel-ticket-closed','cancel-ticket-closed-final','bhs_e010_ticket_autoclose');
UPDATE public.email_templates SET category = 'Refunds' WHERE category IS NULL AND code IN
 ('customer_uninterested_reason_request','cancellation-request-received','cancel-concern-reply','cancel-refund-reviewed','refund_concern_response','refund_rejected_notice','refund_request_reviewed','workflow_refund_approved','workflow_refund_escalated','workflow_refund_info_needed','workflow_refund_received','workflow_refund_rejected');
UPDATE public.email_templates SET category = 'Complaints' WHERE category IS NULL AND code IN
 ('complaint_acknowledgement','complaint_filed','complaint_sla_breach','complaint_submitted');
UPDATE public.email_templates SET category = 'Internal / Admin' WHERE category IS NULL AND code IN
 ('admin_new_lead','admin_onboarding_submitted','lead_assigned','contact_acknowledgement','payment_failed','document_rejected','bhs_e007_feedback');
UPDATE public.email_templates SET category = 'Workflow Automation' WHERE category IS NULL;

-- 3) Auto sr_no for rows still lacking one
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY category ORDER BY code) AS rn
    FROM public.email_templates WHERE sr_no IS NULL
)
UPDATE public.email_templates t
   SET sr_no = 100 + ranked.rn
  FROM ranked WHERE t.id = ranked.id;

-- 4) Drop staging
DROP TABLE public.email_templates_stage;
