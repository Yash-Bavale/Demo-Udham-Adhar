import type { SupabaseClient } from '@supabase/supabase-js';

export type ActionType =
  | 'ORDER_ASSIGNED'
  | 'ORDER_REASSIGNED'
  | 'ORDER_OPENED'
  | 'CALL_ATTEMPTED'
  | 'CALL_CONNECTED'
  | 'CUSTOMER_CONTACTED'
  | 'CUSTOMER_DELAY_ADDED'
  | 'TECHNICAL_DELAY_ADDED'
  | 'CUSTOMER_DELAY_RESUMED'
  | 'TECHNICAL_DELAY_RESUMED'
  | 'CALLBACK_SCHEDULED'
  | 'CALLBACK_COMPLETED'
  | 'FORM_REVIEWED'
  | 'FORM_REQUESTED'
  | 'DOCUMENT_REVIEWED'
  | 'DOCUMENT_REQUESTED'
  | 'PAYMENT_VERIFIED'
  | 'PROCESSING_STARTED'
  | 'PROCESSING_UPDATED'
  | 'CERTIFICATE_GENERATED'
  | 'CERTIFICATE_DELIVERED'
  | 'ORDER_COMPLETED'
  | 'ORDER_CLOSED'
  | 'ORDER_REOPENED'
  | 'TICKET_REPLIED'
  | 'TICKET_CREATED'
  | 'HOT_ORDER_ADDED'
  | 'HOT_ORDER_REMOVED'
  | 'INTERNAL_NOTE_ADDED'
  | 'STATUS_CHANGED'
  | 'STAGE_CHANGED';

export interface LogActionParams {
  orderId: string;
  leadId?: string | null;
  customerId?: string | null;
  employeeId?: string | null;
  employeeName?: string | null;
  employeeRole?: string | null;
  actionType: ActionType;
  previousStatus?: string | null;
  newStatus?: string | null;
  previousStage?: string | null;
  newStage?: string | null;
  notes?: string | null;
  source?: 'employee' | 'admin' | 'super_admin' | 'system' | 'customer';
  customMetadata?: Record<string, any>;
  supabase?: SupabaseClient | any;
}

/**
 * Format date to IST string
 */
function getIstString(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Centralized audit logger for employee actions on orders.
 * Computes latency intervals and SLA adherence automatically.
 *
 * NOTE: Uses the 'applications' table (not 'orders') — this is the correct
 * table name for this CRM.
 */
export async function logEmployeeOrderAction(
  params: LogActionParams,
): Promise<{ success: boolean; actionId?: string; error?: string }> {
  try {
    const {
      orderId,
      leadId,
      customerId,
      employeeId,
      employeeName,
      employeeRole,
      actionType,
      previousStatus,
      newStatus,
      previousStage,
      newStage,
      notes,
      source = 'employee',
      customMetadata = {},
      supabase,
    } = params;

    if (!orderId) {
      console.warn('[logEmployeeOrderAction] Skipping log: missing orderId');
      return { success: false, error: 'Missing orderId' };
    }

    const client = supabase;
    if (!client) {
      console.warn('[logEmployeeOrderAction] No Supabase client provided');
      return { success: false, error: 'No Supabase client' };
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const nowIst = getIstString(now);

    // 1. Fetch the order metadata from the CORRECT 'applications' table
    const { data: order } = await client
      .from('applications')
      .select(
        'id, application_code, assigned_to, assigned_at, created_at, order_status, fulfillment_status, application_status, customer_id, lead_id',
      )
      .eq('id', orderId)
      .maybeSingle();

    // 2. Fetch the most recent prior action on this order to calculate time since previous action
    const { data: lastAction } = await client
      .from('order_action_logs')
      .select('created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let timeSpentSinceAssignmentMs: number | null = null;
    if (order?.assigned_at) {
      const assignedTime = new Date(order.assigned_at).getTime();
      timeSpentSinceAssignmentMs = Math.max(0, now.getTime() - assignedTime);
    }

    let timeSpentSincePreviousActionMs: number | null = null;
    if (lastAction?.created_at) {
      const prevActionTime = new Date(lastAction.created_at).getTime();
      timeSpentSincePreviousActionMs = Math.max(0, now.getTime() - prevActionTime);
    }

    // 3. Compute SLA Status (lowercase to match DB CHECK constraint)
    // Hot Order Action SLA: 30 minutes (1_800_000 ms)
    // First-Action SLA: 2 hours (7_200_000 ms) from assignment
    // General Completion SLA: 24 hours (86_400_000 ms)
    let slaStatus: 'compliant' | 'at_risk' | 'breached' = 'compliant';
    let isSlaBreached = false;

    const isHotOrder = order?.fulfillment_status === 'order_reopened' || order?.order_status === 'REOPENED';

    if (isHotOrder) {
      if (timeSpentSinceAssignmentMs !== null) {
        if (timeSpentSinceAssignmentMs > 1_800_000) {
          // > 30 mins
          slaStatus = 'breached';
          isSlaBreached = true;
        } else if (timeSpentSinceAssignmentMs > 1_200_000) {
          // > 20 mins
          slaStatus = 'at_risk';
        }
      }
    } else if (actionType === 'ORDER_COMPLETED' || actionType === 'ORDER_CLOSED') {
      if (timeSpentSinceAssignmentMs !== null && timeSpentSinceAssignmentMs > 86_400_000) {
        slaStatus = 'breached';
        isSlaBreached = true;
      }
    } else {
      if (timeSpentSinceAssignmentMs !== null) {
        if (timeSpentSinceAssignmentMs > 7_200_000) {
          // > 2 hours
          slaStatus = 'breached';
          isSlaBreached = true;
        } else if (timeSpentSinceAssignmentMs > 5_400_000) {
          // > 1.5 hours
          slaStatus = 'at_risk';
        }
      }
    }

    // 4. Resolve Employee Name / Role if not provided
    let finalEmpName = employeeName;
    let finalEmpRole = employeeRole;
    if (employeeId && (!finalEmpName || !finalEmpRole)) {
      const { data: profile } = await client
        .from('profiles')
        .select('id, full_name, display_name, email')
        .eq('id', employeeId)
        .maybeSingle();

      if (profile) {
        finalEmpName =
          finalEmpName || profile.full_name || profile.display_name || profile.email || 'Employee';
      }
    }

    // Also resolve role from user_roles if missing
    if (employeeId && !finalEmpRole) {
      const { data: roleRow } = await client
        .from('user_roles')
        .select('role')
        .eq('user_id', employeeId)
        .limit(1)
        .maybeSingle();
      finalEmpRole = roleRow?.role || 'employee';
    }

    // Normalize source — 'super_admin' is not a valid source value in DB
    const normalizedSource: 'employee' | 'admin' | 'system' | 'customer' =
      source === 'super_admin' ? 'admin' : (source as any) || 'employee';

    // 5. Insert into order_action_logs
    const insertPayload = {
      order_id: orderId,
      lead_id: leadId || order?.lead_id || null,
      customer_id: customerId || order?.customer_id || null,
      employee_id: employeeId || order?.assigned_to || null,
      employee_name: finalEmpName || 'Admin / System',
      employee_role: finalEmpRole || 'system',
      action_type: actionType,
      previous_status: previousStatus || null,
      new_status: newStatus || order?.order_status || order?.fulfillment_status || null,
      previous_stage: previousStage || null,
      new_stage: newStage || order?.fulfillment_status || null,
      timestamp: nowIso,
      created_at_ist: nowIst,
      time_spent_since_assignment_ms: timeSpentSinceAssignmentMs,
      time_spent_since_previous_action_ms: timeSpentSincePreviousActionMs,
      sla_status: slaStatus,
      is_sla_breached: isSlaBreached,
      notes: notes || null,
      source: normalizedSource,
      created_at: nowIso,
    };

    const { data: inserted, error: insertErr } = await client
      .from('order_action_logs')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insertErr) {
      console.error('[logEmployeeOrderAction] Error logging order action:', insertErr);
      return { success: false, error: insertErr.message };
    }

    // Also append to immutable employee_activity_log if an employee is involved
    const effectiveEmpId = employeeId || order?.assigned_to;
    if (effectiveEmpId) {
      try {
        await client.from('employee_activity_log').insert({
          employee_id: effectiveEmpId,
          auth_user_id: effectiveEmpId,
          action_type: actionType,
          order_id: orderId,
          previous_status: previousStatus || null,
          new_status: newStatus || order?.order_status || null,
          previous_stage: previousStage || null,
          new_stage: newStage || order?.fulfillment_status || null,
          metadata: {
            notes: notes || null,
            slaStatus,
            source: normalizedSource,
            ...customMetadata,
          },
        });
      } catch {
        // Non-blocking best-effort activity audit
      }
    }

    return { success: true, actionId: inserted?.id };
  } catch (err: any) {
    console.error('[logEmployeeOrderAction] Unexpected error:', err);
    return { success: false, error: err.message || 'Unknown error' };
  }
}
