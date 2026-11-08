/**
 * BHS Email Registry — canonical 14-template set (E001–E010, T001–T003, R001).
 *
 * These are the ONLY email templates that exist in the DB. Any older aliases
 * pointing to legacy code names have been removed. Callers should reference
 * templates through this map (`BHS_EMAILS.E001_PAYMENT_RECEIVED`, …) so the
 * physical code can be swapped without touching every call-site.
 *
 * DB row lookup: see `public.email_templates.code`.
 */
export const BHS_EMAILS = {
  /** E001 — Welcome & Tax Invoice (auto on payment success). */
  E001_PAYMENT_RECEIVED: 'E001',
  /** E002 — Incomplete info / form link (manual reminder). */
  E002_FORM_LINK: 'E002',
  /** E003 — Technical / our-side delay hold intimation. */
  E003_TECHNICAL_DELAY: 'E003',
  /** E004 — Customer-side delay hold intimation. */
  E004_CUSTOMER_DELAY: 'E004',
  /** E005 — Consultation completed & application submitted to govt portal. */
  E005_CONSULTATION_SUBMITTED: 'E005',
  /** E006 — Application submitted, awaiting govt approval (status reminder). */
  E006_AWAITING_GOVT: 'E006',
  /** E007 — Order completed + certificate PDF attached. */
  E007_ORDER_COMPLETED: 'E007',
  /** E008 — Application rejected by govt — order closed. */
  E008_APPLICATION_REJECTED: 'E008',
  /** E009 — Talk-to-Expert consultation completed. */
  E009_TALK_TO_EXPERT: 'E009',
  /** E010 — Order closure with previous reason (force close / final closure). */
  E010_ORDER_CLOSED: 'E010',
  /** E011 — Technical (our-side) delay resolved & order resumed. */
  E011_TECHNICAL_DELAY_RESOLVED: 'E011',
  /** T001 — Ticket reply: consultation / support completed. */
  T001_TICKET_COMPLETED: 'T001',
  /** T002 — Ticket reply with reason (manual reply). */
  T002_TICKET_REPLY: 'T002',
  /** T003 — Ticket closed final. */
  T003_TICKET_CLOSED: 'T003',
  /** R001 — Refund approved / processed. */
  R001_REFUND_PROCESSED: 'R001',
  /** R002 — Refund rejected / closed. */
  R002_REFUND_REJECTED: 'R002',

  // ── Backwards-compatible aliases (deprecated names still referenced in
  //    older call-sites). All resolve to the new canonical codes above.
  E002_ORDER_COMPLETED: 'E007',
  E003_FORM_LINK: 'E002',
  E005_OUR_SIDE_DELAY: 'E003',
  E006_ORDER_CLOSED: 'E010',
  E007_TALK_TO_EXPERT: 'E009',
  E008_TICKET_REPLY: 'T002',
  E009_TICKET_RESOLVED: 'T001',
  E010_TICKET_CLOSED_FINAL: 'T003',
  E011_REFUND_PROCESSED: 'R001',
  E012_SUBMITTED_TO_GOVT: 'E006',
} as const;

export type BhsEmailCode = keyof typeof BHS_EMAILS;
