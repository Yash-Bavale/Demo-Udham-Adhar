-- 1) Harden current_user_is_admin: SECURITY DEFINER + fixed search_path
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'::public.app_role
  )
$$;

-- 2) Lock down EXECUTE on SECURITY DEFINER helper functions.
-- These should only be callable by authenticated users (used inside RLS policies / triggers).
REVOKE EXECUTE ON FUNCTION public.current_user_is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_finance_viewer(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_staff_role(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_finance_viewer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_staff_role(uuid) TO authenticated;

-- pgmq wrapper helpers — only service_role should call these (used by server functions).
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;

-- 3) Fix search_path on pgmq helpers (they were missing SET search_path)
CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pgmq'
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pgmq'
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pgmq'
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pgmq'
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN PERFORM pgmq.create(dlq_name); EXCEPTION WHEN OTHERS THEN NULL; END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN PERFORM pgmq.delete(source_queue, message_id); EXCEPTION WHEN undefined_table THEN NULL; END;
  RETURN new_id;
END;
$$;

-- 4) email_logs: add INSERT policy for staff so writes through RLS work.
-- Server functions use service_role which bypasses RLS, but staff-initiated logging
-- should also be permitted under RLS.
DROP POLICY IF EXISTS "Staff insert email logs" ON public.email_logs;
CREATE POLICY "Staff insert email logs"
  ON public.email_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_is_admin()
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'operations')
  );

DROP POLICY IF EXISTS "Admins delete email logs" ON public.email_logs;
CREATE POLICY "Admins delete email logs"
  ON public.email_logs FOR DELETE
  TO authenticated
  USING (public.current_user_is_admin() OR public.has_role(auth.uid(),'super_admin'));

-- 5) Storage RLS for the private `invoices` bucket — finance / admins only.
DROP POLICY IF EXISTS "Finance read invoice files" ON storage.objects;
CREATE POLICY "Finance read invoice files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'invoices' AND public.is_finance_viewer(auth.uid()));

DROP POLICY IF EXISTS "Super admin write invoice files" ON storage.objects;
CREATE POLICY "Super admin write invoice files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'invoices' AND public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admin update invoice files" ON storage.objects;
CREATE POLICY "Super admin update invoice files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'invoices' AND public.is_super_admin(auth.uid()))
  WITH CHECK (bucket_id = 'invoices' AND public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admin delete invoice files" ON storage.objects;
CREATE POLICY "Super admin delete invoice files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'invoices' AND public.is_super_admin(auth.uid()));