-- Ensure refund email templates bind {{service_name}} for Requested Service instead of hardcoded strings
UPDATE public.email_templates
SET body_html = regexp_replace(
      body_html,
      '(<td[^>]*>[^<]*Requested\s*Service[^<]*</td>\s*<td[^>]*>)(?:(?!\{\{\s*service_name\s*\}\})[\s\S])*?(</td>)',
      '\1{{service_name}}\2',
      'gi'
    ),
    updated_at = now()
WHERE code IN ('R001', 'refund_processed_confirmation', 'workflow_refund_approved')
  AND body_html ~* 'Requested\s*Service'
  AND body_html !~* '\{\{\s*service_name\s*\}\}';
