DELETE FROM public.invoices WHERE invoice_number='INV-2026-000001';
DELETE FROM public.payments WHERE transaction_id='UA-2026-001021-MPWNAULY-WJ9LGU';
UPDATE public.leads SET status='new_lead' WHERE lead_code='UA-2026-001021';