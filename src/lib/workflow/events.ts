// Pure, client-safe typed event union for the Workflow Engine.
// Any code that mutates order state MUST dispatch one of these events.

export type WorkflowStage =
  | "payment_successful"
  | "form"
  | "verification"
  | "government_portal"
  | "completed"
  | "closed";

export type WorkflowStatus =
  | "not_started"
  | "submitted"
  | "incomplete"
  | "waiting_customer"
  | "verification_pending"
  | "verified"
  | "upload_pending"
  | "uploaded"
  | "under_process"
  | "approved"
  | "rejected"
  | "completed"
  | "closed"
  | "paused";

export type ActorKind = "system" | "customer" | "employee" | "government" | "automation";

export type WorkflowEvent =
  // lifecycle
  | { type: "OrderCreated"; applicationId: string; assignedTo?: string | null }
  | { type: "PaymentReceived"; applicationId: string; amount: number; txnId?: string }
  | { type: "InvoiceGenerated"; applicationId: string; invoiceNumber: string }
  | { type: "WelcomeEmailSent"; applicationId: string }
  // form
  | { type: "FormLinkSent"; applicationId: string; channel: "email" | "sms" | "whatsapp" }
  | { type: "FormOpened"; applicationId: string }
  | { type: "FormSubmitted"; applicationId: string; submissionId: string }
  | { type: "FormTimeout5m"; applicationId: string }
  | { type: "FormTimeout8h"; applicationId: string }
  // verification
  | { type: "VerificationStarted"; applicationId: string; actorId: string }
  | { type: "VerificationCompleted"; applicationId: string; actorId: string }
  // delay / closure
  | {
      type: "DelayReasonSet";
      applicationId: string;
      kind: "customer_side" | "our_side";
      reasonCode: string;
      note?: string;
      actorId: string;
    }
  | { type: "ClosureTimerFired"; applicationId: string }
  | { type: "OrderClosed"; applicationId: string; reason: string }
  // ticket
  | { type: "CustomerEmailReceived"; applicationId: string; ticketId: string; messageId: string }
  | { type: "TicketOpened"; applicationId: string; ticketId: string }
  | { type: "TicketReplied"; applicationId: string; ticketId: string; actorId: string }
  | {
      type: "TicketClosed";
      applicationId: string;
      ticketId: string;
      outcome: "cooperating" | "not_cooperating";
      actorId: string;
    }
  | { type: "WorkflowResumed"; applicationId: string; actorId: string }
  // government portal
  | { type: "GovUploadPending"; applicationId: string }
  | { type: "GovUploaded"; applicationId: string; actorId: string }
  | { type: "GovApproved"; applicationId: string; actorId: string }
  | { type: "GovRejected"; applicationId: string; reason: string; actorId: string }
  | { type: "CertificateUploaded"; applicationId: string; certificateId: string }
  // reminders
  | { type: "ReminderScheduled"; applicationId: string; everyMinutes: number; actorId: string }
  | { type: "ReminderFired"; applicationId: string };

export type WorkflowEventType = WorkflowEvent["type"];
