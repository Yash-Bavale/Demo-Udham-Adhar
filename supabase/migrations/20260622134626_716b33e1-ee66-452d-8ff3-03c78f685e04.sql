-- Phase 11: complaints add authority + description + expected update + auto-number

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS authority_name TEXT,
  ADD COLUMN IF NOT EXISTS authority_ref_number TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS expected_update_at TIMESTAMPTZ;

-- Auto-generate complaint_number = CMP-YYYYMMDD-NNNN (per-day counter)
CREATE SEQUENCE IF NOT EXISTS public.complaint_daily_seq;

CREATE OR REPLACE FUNCTION public.set_complaint_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  IF NEW.complaint_number IS NULL THEN
    -- Count today's complaints to derive sequence per day
    SELECT COUNT(*) + 1 INTO n
      FROM public.complaints
     WHERE created_at::date = (now() AT TIME ZONE 'Asia/Kolkata')::date;
    NEW.complaint_number := 'CMP-' || to_char((now() AT TIME ZONE 'Asia/Kolkata'), 'YYYYMMDD') || '-' || lpad(n::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complaint_number ON public.complaints;
CREATE TRIGGER trg_complaint_number
  BEFORE INSERT ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.set_complaint_number();