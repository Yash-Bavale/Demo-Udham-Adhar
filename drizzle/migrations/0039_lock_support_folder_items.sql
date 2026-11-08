REVOKE ALL ON public.support_ticket_folders FROM anon;
REVOKE ALL ON public.support_ticket_folder_items FROM anon;
REVOKE ALL ON public.support_ticket_stars FROM anon;

DROP POLICY IF EXISTS "Staff can view folder items" ON public.support_ticket_folder_items;
DROP POLICY IF EXISTS "Staff can manage folder items" ON public.support_ticket_folder_items;

CREATE POLICY "View items in own or shared folders"
  ON public.support_ticket_folder_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.support_ticket_folders f
    WHERE f.id = folder_id AND (f.user_id = auth.uid() OR f.is_shared = true)));

CREATE POLICY "Folder owner manages items"
  ON public.support_ticket_folder_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.support_ticket_folders f
    WHERE f.id = folder_id AND f.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.support_ticket_folders f
    WHERE f.id = folder_id AND f.user_id = auth.uid()));