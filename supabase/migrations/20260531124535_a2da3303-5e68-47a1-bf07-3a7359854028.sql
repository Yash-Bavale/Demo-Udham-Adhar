-- =========================================================
-- Leads: add CRM columns + indexes
-- =========================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_source text NOT NULL DEFAULT 'website',
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS service_id uuid;

CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads (lower(email));
CREATE INDEX IF NOT EXISTS idx_leads_mobile ON public.leads (mobile);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON public.leads (assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);

-- =========================================================
-- services
-- =========================================================
CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code text NOT NULL UNIQUE,
  service_name text NOT NULL,
  description text,
  base_amount numeric(10,2) NOT NULL,
  gst_amount numeric(10,2) NOT NULL DEFAULT 0,
  total_amount numeric(10,2) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.services TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active services" ON public.services;
CREATE POLICY "Public can read active services"
  ON public.services FOR SELECT
  USING (is_active = true OR public.current_user_is_admin());

DROP POLICY IF EXISTS "Admins manage services" ON public.services;
CREATE POLICY "Admins manage services"
  ON public.services FOR ALL
  TO authenticated
  USING (public.current_user_is_admin() OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.current_user_is_admin() OR public.has_role(auth.uid(),'super_admin'));

DO $$ BEGIN
  ALTER TABLE public.leads
    ADD CONSTRAINT leads_service_id_fkey
    FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================
-- applications
-- =========================================================
CREATE SEQUENCE IF NOT EXISTS public.application_code_seq START 1;

CREATE TABLE IF NOT EXISTS public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_code text UNIQUE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  application_status public.application_status NOT NULL DEFAULT 'awaiting_payment',
  form_status text NOT NULL DEFAULT 'pending',
  document_status text NOT NULL DEFAULT 'pending',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applications_lead_id ON public.applications (lead_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications (application_status);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON public.applications (created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read applications" ON public.applications;
CREATE POLICY "Staff read applications"
  ON public.applications FOR SELECT
  TO authenticated
  USING (
    public.current_user_is_admin()
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'operations')
    OR public.has_role(auth.uid(),'support')
    OR public.has_role(auth.uid(),'accounts')
  );

DROP POLICY IF EXISTS "Admins ops write applications" ON public.applications;
CREATE POLICY "Admins ops write applications"
  ON public.applications FOR ALL
  TO authenticated
  USING (
    public.current_user_is_admin()
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'operations')
  )
  WITH CHECK (
    public.current_user_is_admin()
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'operations')
  );

CREATE OR REPLACE FUNCTION public.set_application_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.application_code IS NULL THEN
    NEW.application_code := 'AP-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.application_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_applications_set_code ON public.applications;
CREATE TRIGGER trg_applications_set_code
  BEFORE INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.set_application_code();

DROP TRIGGER IF EXISTS trg_applications_touch ON public.applications;
CREATE TRIGGER trg_applications_touch
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_leads_set_code ON public.leads;
CREATE TRIGGER trg_leads_set_code
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_lead_code();

DROP TRIGGER IF EXISTS trg_leads_touch ON public.leads;
CREATE TRIGGER trg_leads_touch
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- lead_notes
-- =========================================================
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON public.lead_notes (lead_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_notes TO authenticated;
GRANT ALL ON public.lead_notes TO service_role;

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read lead notes" ON public.lead_notes;
CREATE POLICY "Staff read lead notes"
  ON public.lead_notes FOR SELECT
  TO authenticated
  USING (
    public.current_user_is_admin()
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'operations')
    OR public.has_role(auth.uid(),'support')
    OR public.has_role(auth.uid(),'accounts')
  );

DROP POLICY IF EXISTS "Staff create lead notes" ON public.lead_notes;
CREATE POLICY "Staff create lead notes"
  ON public.lead_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      public.current_user_is_admin()
      OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'operations')
      OR public.has_role(auth.uid(),'support')
      OR public.has_role(auth.uid(),'accounts')
    )
  );

DROP POLICY IF EXISTS "Authors edit own notes" ON public.lead_notes;
CREATE POLICY "Authors edit own notes"
  ON public.lead_notes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.current_user_is_admin());

DROP POLICY IF EXISTS "Admins delete notes" ON public.lead_notes;
CREATE POLICY "Admins delete notes"
  ON public.lead_notes FOR DELETE
  TO authenticated
  USING (public.current_user_is_admin() OR public.has_role(auth.uid(),'super_admin'));

-- =========================================================
-- activity_logs
-- =========================================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.applications(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  activity_description text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_lead_id ON public.activity_logs (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_application_id ON public.activity_logs (application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs (created_at DESC);

GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read activity logs" ON public.activity_logs;
CREATE POLICY "Staff read activity logs"
  ON public.activity_logs FOR SELECT
  TO authenticated
  USING (
    public.current_user_is_admin()
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'operations')
    OR public.has_role(auth.uid(),'support')
    OR public.has_role(auth.uid(),'accounts')
  );

DROP POLICY IF EXISTS "Staff insert activity logs" ON public.activity_logs;
CREATE POLICY "Staff insert activity logs"
  ON public.activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_is_admin()
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'operations')
    OR public.has_role(auth.uid(),'support')
    OR public.has_role(auth.uid(),'accounts')
  );

-- =========================================================
-- profiles
-- =========================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.current_user_is_admin() OR public.has_role(auth.uid(),'super_admin'));

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR public.current_user_is_admin());

DROP POLICY IF EXISTS "Admins create profiles" ON public.profiles;
CREATE POLICY "Admins create profiles"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id OR public.current_user_is_admin());

DROP TRIGGER IF EXISTS trg_profiles_touch ON public.profiles;
CREATE TRIGGER trg_profiles_touch
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- Leads RLS for staff
-- =========================================================
DROP POLICY IF EXISTS "Staff read leads" ON public.leads;
CREATE POLICY "Staff read leads"
  ON public.leads FOR SELECT
  TO authenticated
  USING (
    public.current_user_is_admin()
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'operations')
    OR public.has_role(auth.uid(),'support')
    OR public.has_role(auth.uid(),'accounts')
  );

DROP POLICY IF EXISTS "Staff update leads" ON public.leads;
CREATE POLICY "Staff update leads"
  ON public.leads FOR UPDATE
  TO authenticated
  USING (
    public.current_user_is_admin()
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'operations')
  )
  WITH CHECK (
    public.current_user_is_admin()
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'operations')
  );

DROP POLICY IF EXISTS "Admins delete leads" ON public.leads;
CREATE POLICY "Admins delete leads"
  ON public.leads FOR DELETE
  TO authenticated
  USING (public.current_user_is_admin() OR public.has_role(auth.uid(),'super_admin'));

DROP POLICY IF EXISTS "Admins manage user roles" ON public.user_roles;
CREATE POLICY "Admins manage user roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.current_user_is_admin() OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.current_user_is_admin() OR public.has_role(auth.uid(),'super_admin'));

-- =========================================================
-- Activity log triggers
-- =========================================================
CREATE OR REPLACE FUNCTION public.log_lead_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_logs (lead_id, user_id, activity_type, activity_description)
    VALUES (NEW.id, uid, 'lead_created', 'Lead ' || COALESCE(NEW.lead_code,'') || ' created for ' || NEW.service);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.activity_logs (lead_id, user_id, activity_type, activity_description)
      VALUES (NEW.id, uid, 'status_changed', 'Status: ' || OLD.status || ' → ' || NEW.status);
    END IF;
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      INSERT INTO public.activity_logs (lead_id, user_id, activity_type, activity_description)
      VALUES (NEW.id, uid, 'lead_assigned', 'Lead reassigned');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_activity ON public.leads;
CREATE TRIGGER trg_leads_activity
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.log_lead_activity();

CREATE OR REPLACE FUNCTION public.log_application_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_logs (lead_id, application_id, user_id, activity_type, activity_description)
    VALUES (NEW.lead_id, NEW.id, uid, 'application_created',
      'Application ' || COALESCE(NEW.application_code,'') || ' created');
  ELSIF TG_OP = 'UPDATE' AND NEW.application_status IS DISTINCT FROM OLD.application_status THEN
    INSERT INTO public.activity_logs (lead_id, application_id, user_id, activity_type, activity_description)
    VALUES (NEW.lead_id, NEW.id, uid, 'application_status_changed',
      'Application: ' || OLD.application_status || ' → ' || NEW.application_status);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_applications_activity ON public.applications;
CREATE TRIGGER trg_applications_activity
  AFTER INSERT OR UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.log_application_activity();

CREATE OR REPLACE FUNCTION public.log_note_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity_logs (lead_id, user_id, activity_type, activity_description)
  VALUES (NEW.lead_id, NEW.user_id, 'note_added', 'Internal note added');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_notes_activity ON public.lead_notes;
CREATE TRIGGER trg_lead_notes_activity
  AFTER INSERT ON public.lead_notes
  FOR EACH ROW EXECUTE FUNCTION public.log_note_activity();

-- =========================================================
-- Helper
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_any_staff_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','super_admin','operations','support','accounts')
  )
$$;

-- =========================================================
-- Seed services
-- =========================================================
INSERT INTO public.services (service_code, service_name, base_amount, gst_amount, total_amount, sort_order)
VALUES
  ('new-udyam-registration',          'New Udyam Registration',                1270.34,  228.66, 1499.00, 10),
  ('update-udyam-certificate',        'Update Udyam Certificate',               846.61,  152.39,  999.00, 20),
  ('download-udyam-certificate',      'Download Udyam Certificate',             592.37,  106.63,  699.00, 30),
  ('migrate-udyog-aadhaar-to-udyam',  'Migrate Udyog Aadhaar to Udyam',        1270.34,  228.66, 1499.00, 40),
  ('forgot-mobile-email',             'Forgot Registered Mobile & Email',      1694.07,  304.93, 1999.00, 50),
  ('correct-pan-aadhaar',             'PAN / Aadhaar Name Correction',         1694.07,  304.93, 1999.00, 60),
  ('talk-to-expert',                  'Talk To Expert',                          83.90,   15.10,   99.00, 70)
ON CONFLICT (service_code) DO NOTHING;
