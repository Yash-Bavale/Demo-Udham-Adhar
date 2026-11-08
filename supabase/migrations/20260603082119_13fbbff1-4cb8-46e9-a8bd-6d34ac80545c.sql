-- application_links: drop overly permissive public lookup; server code uses service role
DROP POLICY IF EXISTS "Public lookup by token" ON public.application_links;

-- service_form_schemas: restrict reads to authenticated users (server uses admin client)
DROP POLICY IF EXISTS "Public read active schemas" ON public.service_form_schemas;
CREATE POLICY "Authenticated read active schemas"
  ON public.service_form_schemas
  FOR SELECT
  TO authenticated
  USING (is_active = true OR current_user_is_admin());

-- service_workflows: restrict reads to authenticated users
DROP POLICY IF EXISTS "Public read active workflows" ON public.service_workflows;
CREATE POLICY "Authenticated read active workflows"
  ON public.service_workflows
  FOR SELECT
  TO authenticated
  USING (is_active = true OR current_user_is_admin());

-- Revoke any lingering anon SELECT grants on these tables
REVOKE SELECT ON public.application_links FROM anon;
REVOKE SELECT ON public.service_form_schemas FROM anon;
REVOKE SELECT ON public.service_workflows FROM anon;