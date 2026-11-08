DELETE FROM public.invoices WHERE invoice_number='INV-2026-000002';
DELETE FROM public.payments WHERE transaction_id='UA-2026-001021-MPWO1V91-K6E0RO';
UPDATE public.leads SET status='new_lead' WHERE lead_code='UA-2026-001021';