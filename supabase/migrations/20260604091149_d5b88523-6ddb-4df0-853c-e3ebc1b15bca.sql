
CREATE SEQUENCE IF NOT EXISTS public.customer_code_seq START 1;

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code text UNIQUE,
  name text NOT NULL,
  primary_email text,
  primary_mobile text,
  state text,
  language text DEFAULT 'en',
  status text NOT NULL DEFAULT 'active',
  lifetime_value numeric NOT NULL DEFAULT 0,
  total_applications integer NOT NULL DEFAULT 0,
  completed_applications integer NOT NULL DEFAULT 0,
  pending_applications integer NOT NULL DEFAULT 0,
  last_service_id uuid,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customers_primary_email_idx ON public.customers (lower(primary_email));
CREATE INDEX customers_primary_mobile_idx ON public.customers (primary_mobile);
CREATE INDEX customers_status_idx ON public.customers (status);
CREATE INDEX customers_last_seen_idx ON public.customers (last_seen_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read customers" ON public.customers FOR SELECT TO authenticated
  USING (has_any_staff_role(auth.uid()));
CREATE POLICY "Ops write customers" ON public.customers FOR INSERT TO authenticated
  WITH CHECK (current_user_is_admin() OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'operations'));
CREATE POLICY "Ops update customers" ON public.customers FOR UPDATE TO authenticated
  USING (current_user_is_admin() OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'operations'))
  WITH CHECK (current_user_is_admin() OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'operations'));
CREATE POLICY "Admin delete customers" ON public.customers FOR DELETE TO authenticated
  USING (current_user_is_admin() OR has_role(auth.uid(),'super_admin'));

CREATE TRIGGER customers_touch_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.set_customer_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.customer_code IS NULL THEN
    NEW.customer_code := 'CU-' || to_char(now(),'YYYY') || '-' ||
      lpad(nextval('public.customer_code_seq')::text,6,'0');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER customers_set_code BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_customer_code();

CREATE TABLE public.customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id uuid,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_notes TO authenticated;
GRANT ALL ON public.customer_notes TO service_role;
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read customer notes" ON public.customer_notes FOR SELECT TO authenticated
  USING (has_any_staff_role(auth.uid()));
CREATE POLICY "Staff write customer notes" ON public.customer_notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND has_any_staff_role(auth.uid()));
CREATE POLICY "Authors update own notes" ON public.customer_notes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR current_user_is_admin());
CREATE POLICY "Admin delete notes" ON public.customer_notes FOR DELETE TO authenticated
  USING (current_user_is_admin() OR has_role(auth.uid(),'super_admin'));

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);

CREATE INDEX IF NOT EXISTS leads_customer_id_idx ON public.leads(customer_id);
CREATE INDEX IF NOT EXISTS applications_customer_id_idx ON public.applications(customer_id);
CREATE INDEX IF NOT EXISTS payments_customer_id_idx ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS invoices_customer_id_idx ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS certificates_customer_id_idx ON public.certificates(customer_id);
CREATE INDEX IF NOT EXISTS complaints_customer_id_idx ON public.complaints(customer_id);

-- Backfill
WITH normalized AS (
  SELECT id AS lead_id,
    NULLIF(regexp_replace(coalesce(mobile,''),'\D','','g'),'') AS norm_mobile,
    lower(NULLIF(coalesce(email,''),'')) AS norm_email,
    name, email, mobile, state, language, service_id, created_at
  FROM public.leads
),
groups AS (
  SELECT coalesce(norm_mobile, 'em:'||norm_email, 'lid:'||lead_id::text) AS group_key
  FROM normalized
  GROUP BY 1
),
group_pick AS (
  SELECT DISTINCT ON (g.group_key)
    g.group_key, n.name, n.email, n.mobile, n.state, n.language, n.service_id,
    n.norm_mobile, n.norm_email, n.created_at
  FROM groups g
  JOIN normalized n ON
    coalesce(n.norm_mobile,'em:'||n.norm_email,'lid:'||n.lead_id::text) = g.group_key
  ORDER BY g.group_key, n.created_at DESC
)
INSERT INTO public.customers (
  name, primary_email, primary_mobile, state, language, last_service_id, first_seen_at, last_seen_at
)
SELECT
  gp.name, gp.norm_email, gp.norm_mobile, gp.state, coalesce(gp.language,'en'), gp.service_id, gp.created_at, gp.created_at
FROM group_pick gp;

UPDATE public.leads l
SET customer_id = c.id
FROM public.customers c
WHERE l.customer_id IS NULL
  AND (
    (NULLIF(regexp_replace(coalesce(l.mobile,''),'\D','','g'),'') IS NOT NULL
      AND NULLIF(regexp_replace(coalesce(l.mobile,''),'\D','','g'),'') = c.primary_mobile)
    OR ((l.mobile IS NULL OR l.mobile = '') AND lower(l.email) = lower(c.primary_email))
  );

UPDATE public.applications a SET customer_id = l.customer_id
  FROM public.leads l WHERE a.lead_id = l.id AND a.customer_id IS NULL;
UPDATE public.payments p SET customer_id = l.customer_id
  FROM public.leads l WHERE p.lead_id = l.id AND p.customer_id IS NULL;
UPDATE public.invoices i SET customer_id = l.customer_id
  FROM public.leads l WHERE i.lead_id = l.id AND i.customer_id IS NULL;
UPDATE public.certificates ct SET customer_id = l.customer_id
  FROM public.leads l WHERE ct.lead_id = l.id AND ct.customer_id IS NULL;
UPDATE public.complaints co SET customer_id = l.customer_id
  FROM public.leads l WHERE co.lead_id = l.id AND co.customer_id IS NULL;

UPDATE public.customers c
SET total_applications = coalesce(sub.total,0),
    completed_applications = coalesce(sub.completed,0),
    pending_applications = coalesce(sub.total,0) - coalesce(sub.completed,0)
FROM (
  SELECT customer_id,
    count(*) AS total,
    count(*) FILTER (WHERE application_status = 'completed') AS completed
  FROM public.applications
  WHERE customer_id IS NOT NULL
  GROUP BY customer_id
) sub
WHERE c.id = sub.customer_id;

UPDATE public.customers c
SET lifetime_value = coalesce(sub.ltv, 0)
FROM (
  SELECT customer_id, sum(amount) AS ltv
  FROM public.payments
  WHERE status = 'paid' AND customer_id IS NOT NULL
  GROUP BY customer_id
) sub
WHERE c.id = sub.customer_id;

CREATE OR REPLACE FUNCTION public.find_or_create_customer(
  p_name text,
  p_email text,
  p_mobile text,
  p_state text DEFAULT NULL,
  p_language text DEFAULT 'en'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_mobile text := NULLIF(regexp_replace(coalesce(p_mobile,''),'\D','','g'),'');
  v_email text := lower(NULLIF(coalesce(p_email,''),''));
BEGIN
  IF v_mobile IS NOT NULL THEN
    SELECT id INTO v_id FROM public.customers WHERE primary_mobile = v_mobile LIMIT 1;
  END IF;
  IF v_id IS NULL AND v_email IS NOT NULL THEN
    SELECT id INTO v_id FROM public.customers WHERE lower(primary_email) = v_email LIMIT 1;
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.customers (name, primary_email, primary_mobile, state, language)
    VALUES (coalesce(p_name,'Unnamed'), v_email, v_mobile, p_state, coalesce(p_language,'en'))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.customers SET
      last_seen_at = now(),
      name = coalesce(NULLIF(p_name,''), name),
      state = coalesce(p_state, state),
      language = coalesce(p_language, language),
      primary_email = coalesce(primary_email, v_email),
      primary_mobile = coalesce(primary_mobile, v_mobile)
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.find_or_create_customer(text,text,text,text,text) TO authenticated, anon, service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_notes;
