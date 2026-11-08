import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Database } from '@/integrations/supabase/types';

export type OrderStatus = Database['public']['Enums']['order_status_enum'];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW_ORDER: 'New Order',
  PAYMENT_RECEIVED: 'Payment Received',
  ORDER_RECEIVED: 'Incomplete Form',
  FORM_PENDING: 'Form Pending',
  FORM_RECEIVED: 'Form Received',
  WAITING_CUSTOMER_INFO: 'Waiting for Customer Info',
  INFO_RECEIVED: 'Info Received',
  IN_PROCESSING: 'In Processing',
  CUSTOMER_HOLD: 'Customer Hold',
  TECHNICAL_HOLD_EXTERNAL: 'Technical Hold — Govt/Portal',
  TECHNICAL_HOLD_INTERNAL: 'Technical Hold — Internal',
  OUR_SIDE_DELAY: 'Our-Side Delay',
  SUBMITTED_TO_GOVT: 'Submitted to Govt',
  AWAITING_GOVT_APPROVAL: 'Awaiting Govt Approval',
  CHECKING_STATUS: 'Checking Status',
  CERTIFICATE_ISSUED: 'Certificate Issued',
  COMPLETED: 'Completed',
  HIGH_PRIORITY: 'High Priority',
  REFUND_REQUESTED: 'Refund Requested',
  REFUND_APPROVED: 'Refund Approved',
  REFUND_PROCESSED: 'Refund Processed',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
};

/** Transition an order to a new status. Enforces the transition map server-side. */
export const transitionOrder = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      orderId: string;
      newStatus: OrderStatus;
      reasonId?: string | null;
      remarks?: string | null;
      force?: boolean;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase.rpc('transition_order_status', {
      _order_id: data.orderId,
      _new_status: data.newStatus,
      _reason_id: data.reasonId ?? undefined,
      _remarks: data.remarks ?? undefined,
      _force: data.force ?? false,
    });
    if (error) throw new Error(error.message);
    return row;
  });

/** Return the list of legal next statuses for an order. */
export const listAllowedTransitions = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: order, error: orderErr } = await supabase
      .from('applications')
      .select('id, order_status')
      .eq('id', data.orderId)
      .single();
    if (orderErr) throw new Error(orderErr.message);

    const current = order.order_status as OrderStatus;
    const { data: allowed, error } = await supabase.rpc('allowed_order_transitions', {
      _from: current,
    });
    if (error) throw new Error(error.message);
    return {
      current,
      allowed: (allowed ?? []) as OrderStatus[],
    };
  });

/** List active delay reasons for the Customer/Our-Side Delay pickers. */
export const getDelayReasons = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from('delay_reasons')
      .select('id, code, category, label, requires_remarks, sort_order')
      .eq('is_active', true)
      .order('category')
      .order('sort_order');
    if (error) throw new Error(error.message);
    return data ?? [];
  });
