
-- Onboarding submissions
CREATE TABLE public.onboarding_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  application_id uuid,
  service_code text NOT NULL,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_submissions TO authenticated;
GRANT ALL ON public.onboarding_submissions TO service_role;

ALTER TABLE public.onboarding_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read onboarding"
ON public.onboarding_submissions FOR SELECT TO authenticated
USING (current_user_is_admin() OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'operations') OR has_role(auth.uid(),'support') OR has_role(auth.uid(),'accounts'));

CREATE POLICY "Ops write onboarding"
ON public.onboarding_submissions FOR ALL TO authenticated
USING (current_user_is_admin() OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'operations'))
WITH CHECK (current_user_is_admin() OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'operations'));

CREATE TRIGGER touch_onboarding_updated_at
BEFORE UPDATE ON public.onboarding_submissions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Documents
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  application_id uuid,
  doc_type text NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  remarks text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_lead ON public.documents(lead_id);
CREATE INDEX idx_documents_lead_doctype ON public.documents(lead_id, doc_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read documents"
ON public.documents FOR SELECT TO authenticated
USING (current_user_is_admin() OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'operations') OR has_role(auth.uid(),'support') OR has_role(auth.uid(),'accounts'));

CREATE POLICY "Ops write documents"
ON public.documents FOR ALL TO authenticated
USING (current_user_is_admin() OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'operations'))
WITH CHECK (current_user_is_admin() OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'operations'));

CREATE TRIGGER touch_documents_updated_at
BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Private storage bucket for documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: staff only via the SDK; customer uploads use signed URLs (service role).
CREATE POLICY "Staff read document files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents' AND (
    current_user_is_admin() OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'operations') OR has_role(auth.uid(),'support') OR has_role(auth.uid(),'accounts')
  )
);

CREATE POLICY "Staff write document files"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'documents' AND (
    current_user_is_admin() OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'operations')
  )
)
WITH CHECK (
  bucket_id = 'documents' AND (
    current_user_is_admin() OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'operations')
  )
);
