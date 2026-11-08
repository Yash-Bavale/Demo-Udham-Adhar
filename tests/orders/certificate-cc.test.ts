import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

describe("Certificate Sending with Optional CC and History Audit", () => {
  // 1. Zod schema validation matching server input validation
  const updateFulfillmentStatusSchema = z.object({
    orderId: z.string().uuid(),
    toStatus: z.string(),
    note: z.string().max(2000).optional(),
    certificateDocumentId: z.string().uuid().optional(),
    certificateNumber: z.string().trim().min(1).max(100).optional(),
    completionNotes: z.string().max(500).optional(),
    ccEmail: z.string().trim().email("Invalid CC email address").optional().or(z.literal("")).nullable(),
    adminOverride: z.boolean().optional(),
  });

  describe("Server-side CC validation", () => {
    const validUuid = "11111111-2222-4333-8444-555555555555";

    it("accepts valid CC email addresses", () => {
      const parsed = updateFulfillmentStatusSchema.parse({
        orderId: validUuid,
        toStatus: "completed",
        certificateNumber: "UDYAM-MH-01-12345",
        ccEmail: "partner@example.com",
      });
      expect(parsed.ccEmail).toBe("partner@example.com");
    });

    it("accepts empty string, null, or undefined as no CC", () => {
      const p1 = updateFulfillmentStatusSchema.parse({
        orderId: validUuid,
        toStatus: "completed",
        certificateNumber: "UDYAM-MH-01-12345",
        ccEmail: "",
      });
      expect(p1.ccEmail).toBe("");

      const p2 = updateFulfillmentStatusSchema.parse({
        orderId: validUuid,
        toStatus: "completed",
        certificateNumber: "UDYAM-MH-01-12345",
        ccEmail: null,
      });
      expect(p2.ccEmail).toBeNull();

      const p3 = updateFulfillmentStatusSchema.parse({
        orderId: validUuid,
        toStatus: "completed",
        certificateNumber: "UDYAM-MH-01-12345",
      });
      expect(p3.ccEmail).toBeUndefined();
    });

    it("rejects invalid CC email addresses", () => {
      expect(() =>
        updateFulfillmentStatusSchema.parse({
          orderId: validUuid,
          toStatus: "completed",
          certificateNumber: "UDYAM-MH-01-12345",
          ccEmail: "not-an-email",
        }),
      ).toThrow("Invalid CC email address");

      expect(() =>
        updateFulfillmentStatusSchema.parse({
          orderId: validUuid,
          toStatus: "completed",
          certificateNumber: "UDYAM-MH-01-12345",
          ccEmail: "@missing-user.com",
        }),
      ).toThrow("Invalid CC email address");

      expect(() =>
        updateFulfillmentStatusSchema.parse({
          orderId: validUuid,
          toStatus: "completed",
          certificateNumber: "UDYAM-MH-01-12345",
          ccEmail: "user@domain",
        }),
      ).toThrow("Invalid CC email address");
    });
  });

  describe("Email dispatch parameters and history logging", () => {
    interface ApplicationEventRow {
      application_id: string;
      lead_id: string | null;
      customer_id: string | null;
      event_type: string;
      new_value: string;
      note: string;
      created_by: string;
      staff_name?: string;
      staff_role?: string;
    }

    interface EmailDispatchCall {
      templateCode: string;
      toEmail: string;
      cc?: string | string[];
      attachments?: Array<{ filename: string; content_type: string; content_base64: string }>;
    }

    function createMockWorkflow() {
      const registeredEmail = "customer@example.com";
      const initialCustomerRecord = { id: "cust-1", primary_email: registeredEmail, name: "Test Customer" };
      let currentCustomerRecord = { ...initialCustomerRecord };
      const events: ApplicationEventRow[] = [];
      const emailDispatches: EmailDispatchCall[] = [];
      let applicationStatus = "under_process";

      async function executeSendCertificate({
        orderId,
        ccEmail,
        failSmtp = false,
        isReissue = false,
        certNumber = "UDYAM-MH-01-9999",
      }: {
        orderId: string;
        ccEmail?: string | null;
        failSmtp?: boolean;
        isReissue?: boolean;
        certNumber?: string;
      }) {
        const normalizedCc = ccEmail?.trim() ? ccEmail.trim().toLowerCase() : undefined;
        const recipientEmail = currentCustomerRecord.primary_email;
        const staffUserId = "staff-user-123";
        const staffName = "Jane Doe";
        const staffRole = "executive";

        try {
          if (failSmtp) {
            throw new Error("SMTP connection timed out (Zoho 550)");
          }

          // Mock email sending
          emailDispatches.push({
            templateCode: "order_completed",
            toEmail: recipientEmail,
            cc: normalizedCc,
            attachments: [
              {
                filename: `${certNumber}.pdf`,
                content_type: "application/pdf",
                content_base64: "JVBERi0xLjQK...",
              },
            ],
          });

          // Application marked completed
          applicationStatus = "completed";

          // Record success remark in application_events
          const historyNote = normalizedCc
            ? `Certificate email sent successfully to the registered email ${recipientEmail}, with CC to ${normalizedCc}.`
            : ((isReissue ? "Certificate re-issued / resent. " : "Application completed. ") +
              `Certificate ${certNumber} sent to ${recipientEmail}.`);

          events.push({
            application_id: orderId,
            lead_id: "lead-123",
            customer_id: currentCustomerRecord.id,
            event_type: isReissue ? "certificate_reissued" : "application_completed",
            new_value: "completed",
            note: historyNote,
            created_by: staffUserId,
            staff_name: staffName,
            staff_role: staffRole,
          });

          return { ok: true };
        } catch (sendErr: any) {
          const failMessage = sendErr?.message || "Failed to submit certificate email";
          events.push({
            application_id: orderId,
            lead_id: "lead-123",
            customer_id: currentCustomerRecord.id,
            event_type: "certificate_send_failed",
            new_value: "failed",
            note: `Certificate email submission failed for registered email ${recipientEmail}${normalizedCc ? `, with CC to ${normalizedCc}` : ""}. Error: ${failMessage}`,
            created_by: staffUserId,
            staff_name: staffName,
            staff_role: staffRole,
          });
          throw new Error(`Certificate email submission failed: ${failMessage}. The order was not marked completed.`);
        }
      }

      return {
        getRegisteredEmail: () => currentCustomerRecord.primary_email,
        getEvents: () => events,
        getDispatches: () => emailDispatches,
        getApplicationStatus: () => applicationStatus,
        executeSendCertificate,
      };
    }

    it("Scenario A: Sends certificate without CC and records normal remark", async () => {
      const workflow = createMockWorkflow();
      const res = await workflow.executeSendCertificate({
        orderId: "order-1",
        ccEmail: undefined,
        certNumber: "UDYAM-001",
      });

      expect(res.ok).toBe(true);
      expect(workflow.getApplicationStatus()).toBe("completed");

      // Verify email dispatch
      const dispatches = workflow.getDispatches();
      expect(dispatches).toHaveLength(1);
      expect(dispatches[0].toEmail).toBe("customer@example.com");
      expect(dispatches[0].cc).toBeUndefined();
      expect(dispatches[0].templateCode).toBe("order_completed");
      expect(dispatches[0].attachments?.[0].filename).toBe("UDYAM-001.pdf");

      // Verify registered customer email was untouched
      expect(workflow.getRegisteredEmail()).toBe("customer@example.com");

      // Verify history remark
      const events = workflow.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe("application_completed");
      expect(events[0].note).toBe("Application completed. Certificate UDYAM-001 sent to customer@example.com.");
      expect(events[0].staff_name).toBe("Jane Doe");
      expect(events[0].created_by).toBe("staff-user-123");
    });

    it("Scenario B: Sends certificate with CC and records explicit CC remark", async () => {
      const workflow = createMockWorkflow();
      const res = await workflow.executeSendCertificate({
        orderId: "order-2",
        ccEmail: "alternate@example.com",
        certNumber: "UDYAM-002",
      });

      expect(res.ok).toBe(true);
      expect(workflow.getApplicationStatus()).toBe("completed");

      // Verify email dispatch has both toEmail and cc in the same email
      const dispatches = workflow.getDispatches();
      expect(dispatches).toHaveLength(1);
      expect(dispatches[0].toEmail).toBe("customer@example.com");
      expect(dispatches[0].cc).toBe("alternate@example.com");
      expect(dispatches[0].templateCode).toBe("order_completed");

      // Verify registered email remains unchanged
      expect(workflow.getRegisteredEmail()).toBe("customer@example.com");

      // Verify history remark matches the required format
      const events = workflow.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe("application_completed");
      expect(events[0].note).toBe(
        "Certificate email sent successfully to the registered email customer@example.com, with CC to alternate@example.com.",
      );
      expect(events[0].staff_name).toBe("Jane Doe");
      expect(events[0].staff_role).toBe("executive");
    });

    it("Scenario C: Normalizes CC email (trims whitespace, converts to lowercase)", async () => {
      const workflow = createMockWorkflow();
      await workflow.executeSendCertificate({
        orderId: "order-3",
        ccEmail: "  AlternateUser@Example.COM  ",
      });

      const dispatches = workflow.getDispatches();
      expect(dispatches[0].cc).toBe("alternateuser@example.com");

      const events = workflow.getEvents();
      expect(events[0].note).toContain("with CC to alternateuser@example.com.");
    });

    it("Scenario D: Failed email submission records failure remark and does NOT mark completed", async () => {
      const workflow = createMockWorkflow();

      await expect(
        workflow.executeSendCertificate({
          orderId: "order-4",
          ccEmail: "backup@example.com",
          failSmtp: true,
        }),
      ).rejects.toThrow("Certificate email submission failed: SMTP connection timed out (Zoho 550)");

      // Order status remains unchanged (not marked completed)
      expect(workflow.getApplicationStatus()).toBe("under_process");

      // No successful dispatch recorded
      expect(workflow.getDispatches()).toHaveLength(0);

      // Failure event recorded in application_events
      const events = workflow.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe("certificate_send_failed");
      expect(events[0].new_value).toBe("failed");
      expect(events[0].note).toBe(
        "Certificate email submission failed for registered email customer@example.com, with CC to backup@example.com. Error: SMTP connection timed out (Zoho 550)",
      );
      expect(events[0].staff_name).toBe("Jane Doe");
    });
  });
});
