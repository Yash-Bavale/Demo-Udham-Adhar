-- pdf_templates: restrict reads to staff
DROP POLICY IF EXISTS "Staff read pdf templates" ON public.pdf_templates;
CREATE POLICY "Staff read pdf templates"
ON public.pdf_templates
FOR SELECT
TO authenticated
USING (public.has_any_staff_role(auth.uid()));

-- service_form_schemas: restrict reads to staff (admins keep full access via existing manage policy)
DROP POLICY IF EXISTS "Authenticated read active schemas" ON public.service_form_schemas;
CREATE POLICY "Staff read active schemas"
ON public.service_form_schemas
FOR SELECT
TO authenticated
USING (
  public.has_any_staff_role(auth.uid())
  AND (is_active = true OR public.current_user_is_admin())
);

-- service_workflows: restrict reads to staff
DROP POLICY IF EXISTS "Authenticated read active workflows" ON public.service_workflows;
CREATE POLICY "Staff read active workflows"
ON public.service_workflows
FOR SELECT
TO authenticated
USING (
  public.has_any_staff_role(auth.uid())
  AND (is_active = true OR public.current_user_is_admin())
);