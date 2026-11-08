-- Fix Refund Email Template: Remove Refund Reason row & update variables
-- 1. Remove Refund Reason table row from existing R001 / refund_processed_confirmation templates
UPDATE public.email_templates
SET body_html = regexp_replace(body_html, '<tr[^>]*>\s*<td[^>]*>[^<]*Refund\s*Reason[^<]*</td>[\s\S]*?</tr>', '', 'gi'),
    updated_at = now()
WHERE code IN ('R001', 'refund_processed_confirmation', 'workflow_refund_approved')
  AND body_html ~* 'Refund\s*Reason';

-- 2. Clean up any duplicate rupee symbols
UPDATE public.email_templates
SET body_html = regexp_replace(body_html, '₹\s*₹', '₹', 'g'),
    updated_at = now()
WHERE code IN ('R001', 'refund_processed_confirmation', 'workflow_refund_approved')
  AND body_html ~ '₹\s*₹';

-- 3. Ensure variables array includes all required refund variables
UPDATE public.email_templates
SET variables = ARRAY[
  'order_number',
  'customer_name',
  'service_name',
  'refund_status',
  'refund_amount',
  'refund_amount_formatted',
  'refund_approval_date_and_time',
  'refund_reference_no',
  'payment_reference',
  'customer_email',
  'customer_mobile',
  'executive_name'
]::text[],
    updated_at = now()
WHERE code IN ('R001', 'refund_processed_confirmation');
