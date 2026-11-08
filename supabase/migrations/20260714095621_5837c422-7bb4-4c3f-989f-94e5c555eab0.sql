ALTER TABLE public.applications DROP CONSTRAINT IF EXISTS applications_closure_reason_id_fkey;
ALTER TABLE public.applications
  ADD CONSTRAINT applications_closure_reason_id_fkey
  FOREIGN KEY (closure_reason_id) REFERENCES public.order_close_reasons(id) ON DELETE SET NULL;