---
name: Definition of "Order"
description: Order = application with at least one successful payment. Never count all assigned applications as orders.
type: feature
---
**Order** in this CRM strictly means an application that has a successful payment
(payments.status = 'paid'). Assigned-but-unpaid applications are NOT orders —
they are leads/applications.

Anywhere the UI says "Orders" (counters, cards, filters, dashboards):
- Filter applications by JOIN payments WHERE status='paid'.
- For "open/paid orders — process now" also exclude fulfillment_status IN
  ('completed','order_closed','certificate_issued') and application_status='completed'.

Do NOT use fulfillment_status alone (e.g. ACT_NOW list) as the definition of an order — that produced wrong counts (e.g. 67+ on employee dashboard).
