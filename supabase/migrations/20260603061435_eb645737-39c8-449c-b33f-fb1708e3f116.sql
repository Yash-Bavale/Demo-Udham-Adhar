
-- Phase A1: Dynamic Form Engine foundation tables

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. service_workflows
CREATE TABLE public.service_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  application_statuses jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_assignee_role text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_workflows TO anon;
GRANT SELECT ON public.service_workflows TO authenticated;
GRANT ALL ON public.service_workflows TO service_role;
ALTER TABLE public.service_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active workflows" ON public.service_workflows
  FOR SELECT USING (is_active = true OR current_user_is_admin());
CREATE POLICY "Admins manage workflows" ON public.service_workflows
  FOR ALL TO authenticated
  USING (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role));

-- 2. service_form_schemas (versioned)
CREATE TABLE public.service_form_schemas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  title text NOT NULL,
  description text,
  schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_code, version)
);
CREATE INDEX idx_form_schemas_active ON public.service_form_schemas (service_code, is_active);
GRANT SELECT ON public.service_form_schemas TO anon;
GRANT SELECT ON public.service_form_schemas TO authenticated;
GRANT ALL ON public.service_form_schemas TO service_role;
ALTER TABLE public.service_form_schemas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active schemas" ON public.service_form_schemas
  FOR SELECT USING (is_active = true OR current_user_is_admin());
CREATE POLICY "Admins manage schemas" ON public.service_form_schemas
  FOR ALL TO authenticated
  USING (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role));

-- 3. nic_codes
CREATE TABLE public.nic_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  section text,
  division text,
  group_code text,
  class_code text,
  description text NOT NULL,
  keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  activity_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_nic_desc_trgm ON public.nic_codes USING gin (description gin_trgm_ops);
CREATE INDEX idx_nic_code ON public.nic_codes (code);
CREATE INDEX idx_nic_section ON public.nic_codes (section);
GRANT SELECT ON public.nic_codes TO anon;
GRANT SELECT ON public.nic_codes TO authenticated;
GRANT ALL ON public.nic_codes TO service_role;
ALTER TABLE public.nic_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read nic codes" ON public.nic_codes FOR SELECT USING (true);
CREATE POLICY "Admins manage nic codes" ON public.nic_codes
  FOR ALL TO authenticated
  USING (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role));

-- 4. application_links (secure tokenized public access)
CREATE TABLE public.application_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  application_id uuid,
  lead_id uuid NOT NULL,
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX idx_app_links_token ON public.application_links (token);
CREATE INDEX idx_app_links_lead ON public.application_links (lead_id);
GRANT SELECT ON public.application_links TO anon;
GRANT SELECT ON public.application_links TO authenticated;
GRANT ALL ON public.application_links TO service_role;
ALTER TABLE public.application_links ENABLE ROW LEVEL SECURITY;
-- Anyone can lookup by token (token itself is secret); staff manage
CREATE POLICY "Public lookup by token" ON public.application_links
  FOR SELECT USING (expires_at > now());
CREATE POLICY "Staff manage links" ON public.application_links
  FOR ALL TO authenticated
  USING (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'operations'::app_role))
  WITH CHECK (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'operations'::app_role));

-- 5. complaints
CREATE TABLE public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  application_id uuid,
  complaint_number text,
  status text NOT NULL DEFAULT 'pending',
  submitted_at timestamptz,
  last_reminded_at timestamptz,
  reminder_count integer NOT NULL DEFAULT 0,
  resolved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_complaints_lead ON public.complaints (lead_id);
CREATE INDEX idx_complaints_status ON public.complaints (status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaints TO authenticated;
GRANT ALL ON public.complaints TO service_role;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read complaints" ON public.complaints
  FOR SELECT TO authenticated
  USING (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'operations'::app_role) OR has_role(auth.uid(), 'support'::app_role) OR has_role(auth.uid(), 'accounts'::app_role));
CREATE POLICY "Ops manage complaints" ON public.complaints
  FOR ALL TO authenticated
  USING (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'operations'::app_role))
  WITH CHECK (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'operations'::app_role));

-- 6. certificates
CREATE TABLE public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  certificate_number text,
  file_path text,
  file_name text,
  mime_type text,
  issued_at timestamptz,
  delivered_at timestamptz,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_certs_application ON public.certificates (application_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.certificates TO authenticated;
GRANT ALL ON public.certificates TO service_role;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read certificates" ON public.certificates
  FOR SELECT TO authenticated
  USING (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'operations'::app_role) OR has_role(auth.uid(), 'support'::app_role) OR has_role(auth.uid(), 'accounts'::app_role));
CREATE POLICY "Ops manage certificates" ON public.certificates
  FOR ALL TO authenticated
  USING (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'operations'::app_role))
  WITH CHECK (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'operations'::app_role));

-- 7. pdf_templates
CREATE TABLE public.pdf_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  html_template text NOT NULL,
  variables text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, version)
);
GRANT SELECT ON public.pdf_templates TO authenticated;
GRANT ALL ON public.pdf_templates TO service_role;
ALTER TABLE public.pdf_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read pdf templates" ON public.pdf_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage pdf templates" ON public.pdf_templates
  FOR ALL TO authenticated
  USING (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (current_user_is_admin() OR has_role(auth.uid(), 'super_admin'::app_role));

-- Document mgmt upgrades (Phase H prep)
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_document_id uuid,
  ADD COLUMN IF NOT EXISTS verification_comment text;

-- Timestamps triggers
CREATE TRIGGER tg_workflows_touch BEFORE UPDATE ON public.service_workflows
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tg_schemas_touch BEFORE UPDATE ON public.service_form_schemas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tg_complaints_touch BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tg_certificates_touch BEFORE UPDATE ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tg_pdf_templates_touch BEFORE UPDATE ON public.pdf_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
