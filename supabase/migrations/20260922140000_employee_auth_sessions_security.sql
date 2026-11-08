-- =========================================================
-- MIGRATION: Employee Authentication, Sessions, Security & Activity
-- =========================================================

-- 1. EMPLOYEE SESSIONS TABLE
CREATE TABLE IF NOT EXISTS public.employee_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id text UNIQUE NOT NULL,
  login_method text NOT NULL DEFAULT 'password', -- 'password' | 'google'
  login_at timestamptz NOT NULL DEFAULT now(),
  logout_at timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  active_seconds integer NOT NULL DEFAULT 0,
  idle_seconds integer NOT NULL DEFAULT 0,
  away_seconds integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active', -- 'active' | 'idle' | 'away' | 'logged_out' | 'expired' | 'force_logged_out'
  ip_address text,
  user_agent text,
  browser text,
  browser_version text,
  operating_system text,
  device_type text,
  device_name text,
  current_page text,
  current_module text,
  current_order_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  current_order_code text,
  last_action_text text,
  logout_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emp_sessions_employee_id ON public.employee_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_sessions_auth_user_id ON public.employee_sessions(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_emp_sessions_session_id ON public.employee_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_emp_sessions_active_heartbeat ON public.employee_sessions(is_active, last_heartbeat_at DESC);
CREATE INDEX IF NOT EXISTS idx_emp_sessions_login_at ON public.employee_sessions(login_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_sessions TO authenticated;
GRANT ALL ON public.employee_sessions TO service_role;

ALTER TABLE public.employee_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees view own sessions" ON public.employee_sessions;
CREATE POLICY "Employees view own sessions"
  ON public.employee_sessions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = auth_user_id
    OR public.current_user_is_admin()
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'manager')
  );

DROP POLICY IF EXISTS "Employees insert own sessions" ON public.employee_sessions;
CREATE POLICY "Employees insert own sessions"
  ON public.employee_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "Employees update own sessions" ON public.employee_sessions;
CREATE POLICY "Employees update own sessions"
  ON public.employee_sessions FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = auth_user_id
    OR public.current_user_is_admin()
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    auth.uid() = auth_user_id
    OR public.current_user_is_admin()
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- 2. EMPLOYEE LOGIN HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.employee_login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  login_method text NOT NULL DEFAULT 'password', -- 'password' | 'google'
  login_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT true,
  failure_reason text,
  ip_address text,
  user_agent text,
  browser text,
  browser_version text,
  operating_system text,
  device_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_hist_emp_id ON public.employee_login_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_login_hist_login_at ON public.employee_login_history(login_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_hist_email ON public.employee_login_history(email);

GRANT SELECT, INSERT ON public.employee_login_history TO authenticated;
GRANT ALL ON public.employee_login_history TO service_role;

ALTER TABLE public.employee_login_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees view own login history" ON public.employee_login_history;
CREATE POLICY "Employees view own login history"
  ON public.employee_login_history FOR SELECT
  TO authenticated
  USING (
    auth.uid() = auth_user_id
    OR public.current_user_is_admin()
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'manager')
  );

DROP POLICY IF EXISTS "System insert login history" ON public.employee_login_history;
CREATE POLICY "System insert login history"
  ON public.employee_login_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 3. EMPLOYEE SECURITY EVENTS TABLE (Append-Only)
CREATE TABLE IF NOT EXISTS public.employee_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  event_type text NOT NULL, -- 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'FORCE_LOGOUT', 'FORCE_LOGOUT_ALL', 'SESSION_EXPIRED', 'PASSWORD_CHANGED', 'UNAUTHORIZED_ACCESS', 'ACCOUNT_SUSPENDED', etc.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sec_events_emp_id ON public.employee_security_events(employee_id);
CREATE INDEX IF NOT EXISTS idx_sec_events_type ON public.employee_security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_sec_events_created_at ON public.employee_security_events(created_at DESC);

GRANT SELECT, INSERT ON public.employee_security_events TO authenticated;
GRANT ALL ON public.employee_security_events TO service_role;

ALTER TABLE public.employee_security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees view own security events" ON public.employee_security_events;
CREATE POLICY "Employees view own security events"
  ON public.employee_security_events FOR SELECT
  TO authenticated
  USING (
    auth.uid() = auth_user_id
    OR public.current_user_is_admin()
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "Authenticated insert security events" ON public.employee_security_events;
CREATE POLICY "Authenticated insert security events"
  ON public.employee_security_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 4. EMPLOYEE ACTIVITY LOG TABLE
CREATE TABLE IF NOT EXISTS public.employee_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id text,
  action_type text NOT NULL,
  order_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  ticket_id uuid,
  previous_status text,
  new_status text,
  previous_stage text,
  new_stage text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emp_act_log_emp_created ON public.employee_activity_log(employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emp_act_log_order ON public.employee_activity_log(order_id);
CREATE INDEX IF NOT EXISTS idx_emp_act_log_action ON public.employee_activity_log(action_type);
CREATE INDEX IF NOT EXISTS idx_emp_act_log_created_at ON public.employee_activity_log(created_at DESC);

GRANT SELECT, INSERT ON public.employee_activity_log TO authenticated;
GRANT ALL ON public.employee_activity_log TO service_role;

ALTER TABLE public.employee_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees view own activity log" ON public.employee_activity_log;
CREATE POLICY "Employees view own activity log"
  ON public.employee_activity_log FOR SELECT
  TO authenticated
  USING (
    auth.uid() = auth_user_id
    OR public.current_user_is_admin()
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'manager')
  );

DROP POLICY IF EXISTS "Employees insert own activity log" ON public.employee_activity_log;
CREATE POLICY "Employees insert own activity log"
  ON public.employee_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = auth_user_id OR public.current_user_is_admin() OR public.has_role(auth.uid(), 'super_admin'));

-- =========================================================
-- 5. RPCs & STORED FUNCTIONS
-- =========================================================

-- Function: record_employee_heartbeat_v2
CREATE OR REPLACE FUNCTION public.record_employee_heartbeat_v2(
  p_session_id text,
  p_presence_status text,
  p_current_page text DEFAULT '/admin',
  p_current_module text DEFAULT 'General',
  p_current_order_id uuid DEFAULT NULL,
  p_current_order_code text DEFAULT NULL,
  p_last_action_text text DEFAULT NULL,
  p_active_seconds_delta integer DEFAULT 0,
  p_idle_seconds_delta integer DEFAULT 0,
  p_away_seconds_delta integer DEFAULT 0,
  p_browser text DEFAULT 'Chrome',
  p_browser_version text DEFAULT NULL,
  p_os text DEFAULT 'Windows',
  p_device_type text DEFAULT 'Desktop',
  p_ip_address text DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(p_employee_id, auth.uid());
  v_session record;
  v_now timestamptz := now();
  v_profile_id uuid;
BEGIN
  -- Check existing session first
  SELECT * INTO v_session FROM public.employee_sessions WHERE session_id = p_session_id;

  IF v_uid IS NULL AND v_session.id IS NOT NULL THEN
    v_uid := v_session.auth_user_id;
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized: User ID could not be determined');
  END IF;

  -- Find profile ID
  SELECT id INTO v_profile_id FROM public.profiles WHERE id = v_uid LIMIT 1;
  IF v_profile_id IS NULL THEN
    v_profile_id := v_uid;
  END IF;

  IF v_session.id IS NOT NULL THEN
    -- Check if session was terminated remotely
    IF v_session.is_active = false OR v_session.status = 'force_logged_out' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'terminated', true,
        'logout_reason', COALESCE(v_session.logout_reason, 'Force logged out by administrator')
      );
    END IF;

    -- Update existing session
    UPDATE public.employee_sessions
    SET
      last_heartbeat_at = v_now,
      last_activity_at = CASE WHEN p_presence_status = 'ACTIVE' THEN v_now ELSE last_activity_at END,
      status = lower(p_presence_status),
      active_seconds = active_seconds + GREATEST(0, p_active_seconds_delta),
      idle_seconds = idle_seconds + GREATEST(0, p_idle_seconds_delta),
      away_seconds = away_seconds + GREATEST(0, p_away_seconds_delta),
      current_page = COALESCE(p_current_page, current_page),
      current_module = COALESCE(p_current_module, current_module),
      current_order_id = COALESCE(p_current_order_id, current_order_id),
      current_order_code = COALESCE(p_current_order_code, current_order_code),
      last_action_text = COALESCE(p_last_action_text, last_action_text),
      browser = COALESCE(p_browser, browser),
      browser_version = COALESCE(p_browser_version, browser_version),
      operating_system = COALESCE(p_os, operating_system),
      device_type = COALESCE(p_device_type, device_type),
      ip_address = COALESCE(p_ip_address, ip_address),
      updated_at = v_now
    WHERE session_id = p_session_id
    RETURNING * INTO v_session;

    RETURN jsonb_build_object(
      'ok', true,
      'terminated', false,
      'active_seconds', v_session.active_seconds,
      'idle_seconds', v_session.idle_seconds,
      'away_seconds', v_session.away_seconds,
      'status', v_session.status
    );
  ELSE
    -- Insert new session
    INSERT INTO public.employee_sessions (
      employee_id,
      auth_user_id,
      session_id,
      login_method,
      login_at,
      last_activity_at,
      last_heartbeat_at,
      active_seconds,
      idle_seconds,
      away_seconds,
      is_active,
      status,
      current_page,
      current_module,
      current_order_id,
      current_order_code,
      last_action_text,
      browser,
      browser_version,
      operating_system,
      device_type,
      ip_address
    ) VALUES (
      v_profile_id,
      v_uid,
      p_session_id,
      'password',
      v_now,
      v_now,
      v_now,
      GREATEST(0, p_active_seconds_delta),
      GREATEST(0, p_idle_seconds_delta),
      GREATEST(0, p_away_seconds_delta),
      true,
      lower(p_presence_status),
      p_current_page,
      p_current_module,
      p_current_order_id,
      p_current_order_code,
      p_last_action_text,
      p_browser,
      p_browser_version,
      p_os,
      p_device_type,
      p_ip_address
    )
    RETURNING * INTO v_session;

    RETURN jsonb_build_object(
      'ok', true,
      'terminated', false,
      'active_seconds', v_session.active_seconds,
      'idle_seconds', v_session.idle_seconds,
      'away_seconds', v_session.away_seconds,
      'status', v_session.status
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_employee_heartbeat_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_employee_heartbeat_v2 TO service_role;

-- Function: admin_force_logout_session
CREATE OR REPLACE FUNCTION public.admin_force_logout_session(
  p_session_id text,
  p_reason text DEFAULT 'Force logged out by administrator'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_session record;
  v_is_admin boolean;
BEGIN
  -- Verify caller is admin / super_admin
  SELECT (public.current_user_is_admin() OR public.has_role(v_actor_id, 'super_admin'))
  INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: Admin privilege required');
  END IF;

  SELECT * INTO v_session FROM public.employee_sessions WHERE session_id = p_session_id;
  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Session not found');
  END IF;

  UPDATE public.employee_sessions
  SET
    is_active = false,
    status = 'force_logged_out',
    logout_at = now(),
    logout_reason = p_reason,
    updated_at = now()
  WHERE session_id = p_session_id;

  -- Insert security event
  INSERT INTO public.employee_security_events (
    employee_id,
    auth_user_id,
    actor_id,
    session_id,
    event_type,
    metadata
  ) VALUES (
    v_session.employee_id,
    v_session.auth_user_id,
    v_actor_id,
    p_session_id,
    'FORCE_LOGOUT',
    jsonb_build_object('reason', p_reason, 'target_session', p_session_id)
  );

  RETURN jsonb_build_object('ok', true, 'session_id', p_session_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_force_logout_session TO authenticated;

-- Function: admin_force_logout_all_sessions
CREATE OR REPLACE FUNCTION public.admin_force_logout_all_sessions(
  p_employee_id uuid,
  p_reason text DEFAULT 'Force logged out of all devices by administrator'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_admin boolean;
  v_count integer;
  v_auth_uid uuid;
BEGIN
  -- Verify caller is admin / super_admin
  SELECT (public.current_user_is_admin() OR public.has_role(v_actor_id, 'super_admin'))
  INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: Admin privilege required');
  END IF;

  SELECT id INTO v_auth_uid FROM public.profiles WHERE id = p_employee_id LIMIT 1;

  UPDATE public.employee_sessions
  SET
    is_active = false,
    status = 'force_logged_out',
    logout_at = now(),
    logout_reason = p_reason,
    updated_at = now()
  WHERE employee_id = p_employee_id AND is_active = true;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Insert security event
  INSERT INTO public.employee_security_events (
    employee_id,
    auth_user_id,
    actor_id,
    event_type,
    metadata
  ) VALUES (
    p_employee_id,
    v_auth_uid,
    v_actor_id,
    'FORCE_LOGOUT_ALL',
    jsonb_build_object('reason', p_reason, 'terminated_sessions_count', v_count)
  );

  RETURN jsonb_build_object('ok', true, 'terminated_count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_force_logout_all_sessions TO authenticated;
