
CREATE POLICY "form-assets staff insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'form-assets' AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "form-assets staff update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'form-assets' AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')))
  WITH CHECK (bucket_id = 'form-assets' AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "form-assets staff delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'form-assets' AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "form-assets staff read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'form-assets');
