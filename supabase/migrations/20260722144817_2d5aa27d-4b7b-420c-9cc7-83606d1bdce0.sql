
-- Part 3: Granular RBAC — permission tables, helpers, and seed
CREATE TABLE IF NOT EXISTS public.permission_modules (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permission_modules TO authenticated;
GRANT ALL ON public.permission_modules TO service_role;
ALTER TABLE public.permission_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modules readable by staff" ON public.permission_modules
  FOR SELECT TO authenticated USING (public.has_any_staff_role(auth.uid()));
CREATE POLICY "modules writable by admin" ON public.permission_modules
  FOR ALL TO authenticated
  USING (public.current_user_is_admin() OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.current_user_is_admin() OR public.is_super_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.user_permissions (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL REFERENCES public.permission_modules(key) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  scope_all BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, module_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user reads own permissions" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_is_admin() OR public.is_super_admin(auth.uid()));
CREATE POLICY "admin writes permissions" ON public.user_permissions
  FOR ALL TO authenticated
  USING (public.current_user_is_admin() OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.current_user_is_admin() OR public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_user_permissions_touch
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.user_permission_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL REFERENCES public.permission_modules(key) ON DELETE CASCADE,
  website_id UUID REFERENCES public.websites(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.service_categories(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ups_user_module ON public.user_permission_scopes(user_id, module_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permission_scopes TO authenticated;
GRANT ALL ON public.user_permission_scopes TO service_role;
ALTER TABLE public.user_permission_scopes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user reads own scopes" ON public.user_permission_scopes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_is_admin() OR public.is_super_admin(auth.uid()));
CREATE POLICY "admin writes scopes" ON public.user_permission_scopes
  FOR ALL TO authenticated
  USING (public.current_user_is_admin() OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.current_user_is_admin() OR public.is_super_admin(auth.uid()));

-- Helper: has_permission(_uid, _module, _action)
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _module TEXT, _action TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v RECORD;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF public.current_user_is_admin() OR public.is_super_admin(_user_id) THEN
    RETURN true;
  END IF;
  SELECT can_view, can_create, can_edit, can_delete INTO v
    FROM public.user_permissions
   WHERE user_id = _user_id AND module_key = _module;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN CASE _action
    WHEN 'view' THEN v.can_view
    WHEN 'create' THEN v.can_create
    WHEN 'edit' THEN v.can_edit
    WHEN 'delete' THEN v.can_delete
    ELSE false
  END;
END $$;

-- Seed modules
INSERT INTO public.permission_modules (key, label, description, sort_order) VALUES
  ('leads',        'Leads',            'Lead intake and workspace',           10),
  ('orders',       'Orders',           'Order pipeline and journey',           20),
  ('tickets',      'Support Tickets',  'Customer support inbox',               30),
  ('customers',    'Customers',        'Customer profiles and history',        40),
  ('services',     'Services',         'Service catalogue and pricing',        50),
  ('form_builder', 'Form Builder',     'Edit service intake forms',            55),
  ('websites',     'Websites',         'Websites and categories',              60),
  ('payments',     'Payments',         'Payment links and invoices',           70),
  ('reports',      'Reports',          'Dashboards and analytics',             80),
  ('assignments',  'Assignments',      'Round-robin pool configuration',       90),
  ('settings',     'Settings',         'System settings and integrations',    100),
  ('permissions',  'Permissions',      'Manage employee access',              110)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order;

-- Seed existing staff with full view/create/edit on all modules (rollout compatibility)
INSERT INTO public.user_permissions (user_id, module_key, can_view, can_create, can_edit, can_delete, scope_all)
SELECT ur.user_id, pm.key, true, true, true, false, true
  FROM public.user_roles ur
  CROSS JOIN public.permission_modules pm
 WHERE ur.role::text IN ('operations','support','accounts','finance','manager','executive')
ON CONFLICT (user_id, module_key) DO NOTHING;
