CREATE OR REPLACE FUNCTION public.log_application_event()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_staff_name TEXT := 'System';
  v_staff_role TEXT := 'system';
  v_uid uuid := auth.uid();
  v_type TEXT;
  -- Explicit context set only by public.assign_application() (server-only).
  v_ctx_type TEXT := NULLIF(current_setting('app.assign_type', true), '');
  v_ctx_actor uuid := NULLIF(current_setting('app.assign_actor', true), '')::uuid;
  v_ctx_actor_type TEXT := NULLIF(current_setting('app.assign_actor_type', true), '');
  v_ctx_source TEXT := NULLIF(current_setting('app.assign_source', true), '');
  v_ctx_reason TEXT := NULLIF(current_setting('app.assign_reason', true), '');
  v_actor uuid;
BEGIN
  v_actor := COALESCE(v_ctx_actor, v_uid);
  BEGIN
    SELECT COALESCE(p.display_name, p.email, 'Staff'), COALESCE(ur.role::TEXT, 'staff')
      INTO v_staff_name, v_staff_role
      FROM public.profiles p LEFT JOIN public.user_roles ur ON ur.user_id = v_actor
     WHERE p.id = v_actor LIMIT 1;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  v_staff_name := COALESCE(v_staff_name, 'System');
  v_staff_role := COALESCE(v_staff_role, 'system');

  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NOT NULL THEN
      v_type := CASE WHEN COALESCE(NEW.auto_assigned, false) OR v_uid IS NULL
                     THEN 'AUTO_ASSIGNMENT' ELSE 'INITIAL_ASSIGNMENT' END;
      INSERT INTO public.application_events
        (application_id, lead_id, customer_id, event_type, old_value, new_value, note, created_by, staff_name, staff_role, created_at)
      VALUES
        (NEW.id, NEW.lead_id, NEW.customer_id, 'assignment_change',
         NULL, NEW.assigned_to::TEXT, 'assignment_type=' || v_type || ';initial=true',
         CASE WHEN v_type = 'AUTO_ASSIGNMENT' THEN NULL ELSE v_uid END,
         CASE WHEN v_type = 'AUTO_ASSIGNMENT' THEN 'Auto-Assign' ELSE v_staff_name END,
         CASE WHEN v_type = 'AUTO_ASSIGNMENT' THEN 'system' ELSE v_staff_role END,
         COALESCE(NEW.assigned_at, now()));
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.fulfillment_status IS DISTINCT FROM NEW.fulfillment_status THEN
    INSERT INTO public.application_events
      (application_id, lead_id, customer_id, event_type, old_value, new_value, created_by, staff_name, staff_role)
    VALUES (NEW.id, NEW.lead_id, NEW.customer_id, 'status_change',
       OLD.fulfillment_status::TEXT, NEW.fulfillment_status::TEXT, v_uid,
       CASE WHEN v_uid IS NULL THEN 'System' ELSE v_staff_name END,
       CASE WHEN v_uid IS NULL THEN 'system' ELSE v_staff_role END);
  END IF;

  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    IF v_ctx_type IS NOT NULL THEN
      v_type := v_ctx_type;
    ELSE
      v_type := CASE
        WHEN NEW.assigned_to IS NULL THEN 'UNASSIGNMENT'
        WHEN OLD.assigned_to IS NULL AND v_uid IS NOT NULL THEN 'MANUAL_ASSIGNMENT'
        WHEN OLD.assigned_to IS NULL THEN 'AUTO_ASSIGNMENT'
        WHEN v_uid IS NOT NULL THEN 'REASSIGNMENT'
        ELSE 'SYSTEM_REBALANCE' END;
    END IF;
    INSERT INTO public.application_events
      (application_id, lead_id, customer_id, event_type, old_value, new_value, note, created_by, staff_name, staff_role)
    VALUES
      (NEW.id, NEW.lead_id, NEW.customer_id, 'assignment_change',
       OLD.assigned_to::TEXT, NEW.assigned_to::TEXT,
       'assignment_type=' || v_type
         || CASE WHEN v_ctx_actor_type IS NOT NULL THEN ';actor_type=' || v_ctx_actor_type ELSE '' END
         || CASE WHEN v_ctx_source IS NOT NULL THEN ';source=' || v_ctx_source ELSE '' END
         || CASE WHEN v_ctx_reason IS NOT NULL THEN ';reason=' || left(replace(v_ctx_reason, ';', ','), 200) ELSE '' END,
       CASE WHEN COALESCE(v_ctx_actor_type, CASE WHEN v_uid IS NULL THEN 'system' ELSE 'employee' END) = 'system' THEN NULL ELSE v_actor END,
       CASE WHEN COALESCE(v_ctx_actor_type, CASE WHEN v_uid IS NULL THEN 'system' ELSE 'employee' END) = 'system' THEN 'System' ELSE v_staff_name END,
       CASE WHEN COALESCE(v_ctx_actor_type, CASE WHEN v_uid IS NULL THEN 'system' ELSE 'employee' END) = 'system' THEN 'system' ELSE v_staff_role END);
  END IF;
  RETURN NEW;
END $function$;

-- Atomic, row-locked, idempotent order assignment. Ownership change and its history
-- row (written by trg_application_events) commit in the same transaction.
CREATE OR REPLACE FUNCTION public.assign_application(
  p_application_id uuid,
  p_new_assignee uuid,
  p_assignment_type text,
  p_actor_type text,
  p_source text,
  p_actor uuid DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_check_expected boolean DEFAULT false,
  p_expected_previous uuid DEFAULT NULL,
  p_auto_assigned boolean DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_current uuid;
  v_lead uuid;
BEGIN
  IF p_assignment_type NOT IN ('INITIAL_ASSIGNMENT','MANUAL_ASSIGNMENT','REASSIGNMENT','AUTO_ASSIGNMENT','SYSTEM_REBALANCE','UNASSIGNMENT') THEN
    RAISE EXCEPTION 'invalid assignment type %', p_assignment_type;
  END IF;
  IF p_actor_type NOT IN ('employee','admin','system') THEN
    RAISE EXCEPTION 'invalid actor type %', p_actor_type;
  END IF;
  IF p_actor_type <> 'system' AND p_actor IS NULL THEN
    RAISE EXCEPTION 'human assignment requires an actor';
  END IF;

  SELECT assigned_to, lead_id INTO v_current, v_lead
    FROM public.applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;
  IF p_check_expected AND v_current IS DISTINCT FROM p_expected_previous THEN
    RETURN jsonb_build_object('status','conflict','previous', v_current);
  END IF;
  IF v_current IS NOT DISTINCT FROM p_new_assignee THEN
    RETURN jsonb_build_object('status','unchanged','previous', v_current);
  END IF;

  PERFORM set_config('app.assign_type', p_assignment_type, true);
  PERFORM set_config('app.assign_actor', COALESCE(p_actor::text, ''), true);
  PERFORM set_config('app.assign_actor_type', p_actor_type, true);
  PERFORM set_config('app.assign_source', COALESCE(p_source, ''), true);
  PERFORM set_config('app.assign_reason', COALESCE(p_reason, ''), true);

  UPDATE public.applications
     SET assigned_to = p_new_assignee,
         assigned_at = now(),
         auto_assigned = COALESCE(p_auto_assigned, auto_assigned),
         updated_at = now()
   WHERE id = p_application_id;

  PERFORM set_config('app.assign_type', '', true);
  PERFORM set_config('app.assign_actor', '', true);
  PERFORM set_config('app.assign_actor_type', '', true);
  PERFORM set_config('app.assign_source', '', true);
  PERFORM set_config('app.assign_reason', '', true);

  RETURN jsonb_build_object('status','assigned','previous', v_current, 'lead_id', v_lead);
END $$;

REVOKE ALL ON FUNCTION public.assign_application(uuid,uuid,text,text,text,uuid,text,boolean,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_application(uuid,uuid,text,text,text,uuid,text,boolean,uuid,boolean) TO service_role;