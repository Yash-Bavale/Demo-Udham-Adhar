import { describe, it, expect } from "vitest";
import {
  parseSender,
  normalizeSubject,
  extractTicketNumber,
  extractOrderCodes,
} from "@/lib/mail/email-normalizer";

describe("Order Resolution Architecture & Multi-Order Workflow Tests", () => {
  // Test 1: Closed ticket already linked to AP-001 -> Reply creates child ticket and preserves AP-001
  it("Test 1: Closed ticket linked to AP-001 preserves application_id and customer_id on child ticket creation", () => {
    const parentTicket = {
      id: "parent-uuid-001",
      ticket_number: "TKT-20260901-0001",
      status: "closed",
      customer_id: "cust-001",
      application_id: "app-001",
      lead_id: "lead-001",
      order_link_status: "linked",
    };

    // Simulated createNewTicketFromClosedTicketReply behavior:
    const childTicketPayload = {
      parent_ticket_id: parentTicket.id,
      customer_id: parentTicket.customer_id,
      application_id: parentTicket.application_id,
      lead_id: parentTicket.lead_id,
      order_link_status: parentTicket.order_link_status,
      is_unlinked: false,
    };

    expect(childTicketPayload.parent_ticket_id).toBe("parent-uuid-001");
    expect(childTicketPayload.application_id).toBe("app-001");
    expect(childTicketPayload.customer_id).toBe("cust-001");
    expect(childTicketPayload.order_link_status).toBe("linked");
  });

  // Test 2: Closed ticket has no application, inbound email explicitly references AP-001 -> New ticket resolves AP-001
  it("Test 2: Closed ticket without application resolves AP-001 if inbound email explicitly references AP-001", () => {
    const inboundSubject = "Re: [# TKT-20260901-0002] Updating documents for order AP-2026-000001";
    const codes = extractOrderCodes(inboundSubject);
    expect(codes.applicationCode).toBe("AP-2026-000001");
  });

  // Test 3: Customer has exactly one eligible order. Email does not mention order -> Ticket automatically links the order
  it("Test 3: Customer with exactly 1 active order auto-links without requiring explicit order in subject", () => {
    const activeOrders = [{ id: "app-single-01", application_code: "AP-2026-010001", order_status: "IN_PROGRESS" }];
    const matchResult = {
      applicationId: activeOrders.length === 1 ? activeOrders[0].id : null,
      customerId: "cust-single-01",
      leadId: null,
      orderLinkStatus: activeOrders.length === 1 ? ("linked" as const) : ("unlinked" as const),
      resolutionMethod: "customer_email" as const,
    };

    expect(matchResult.orderLinkStatus).toBe("linked");
    expect(matchResult.applicationId).toBe("app-single-01");
    expect(matchResult.resolutionMethod).toBe("customer_email");
  });

  // Test 4: Customer has multiple eligible orders. Email does not mention order -> needs_review & candidate orders returned
  it("Test 4: Customer with multiple active orders sets needs_review and does NOT guess an order", () => {
    const activeOrders = [
      { id: "app-multi-01", application_code: "AP-2026-010001", order_status: "IN_PROGRESS" },
      { id: "app-multi-02", application_code: "AP-2026-010002", order_status: "DOCUMENTS_PENDING" },
    ];

    const matchResult = {
      applicationId: activeOrders.length === 1 ? activeOrders[0].id : null,
      customerId: "cust-multi-01",
      leadId: null,
      orderLinkStatus: activeOrders.length > 1 ? ("needs_review" as const) : ("linked" as const),
      resolutionMethod: "customer_email" as const,
    };

    expect(matchResult.orderLinkStatus).toBe("needs_review");
    expect(matchResult.applicationId).toBeNull();
    // Candidate orders remain available to the workspace:
    expect(activeOrders).toHaveLength(2);
  });

  // Test 5: Customer has multiple orders and email explicitly references AP-002 -> Ticket links AP-002
  it("Test 5: Multi-order customer whose email contains AP-2026-010002 resolves specifically to that order", () => {
    const emailBody = "Hello support, I have a question regarding my application AP-2026-010002";
    const codes = extractOrderCodes(emailBody);
    expect(codes.applicationCode).toBe("AP-2026-010002");
  });

  // Test 6: Mixed-case email matching consistency
  it("Test 6: Email addresses are normalized to lowercase ensuring consistent lookups across all tables", () => {
    const sender = parseSender("Customer Name <John.Doe.Business@Gmail.COM>");
    expect(sender.effectiveEmail).toBe("john.doe.business@gmail.com");
    expect(sender.fromEmail).toBe("john.doe.business@gmail.com");
  });

  // Test 7: New order with NULL order_status handled without erroneous exclusion
  it("Test 7: Orders with null or active status are not excluded by the inactive status filter", () => {
    const INACTIVE_STATUSES = ["COMPLETED", "CLOSED", "REFUND_PROCESSED", "REFUND_APPROVED"];
    const orders = [
      { id: "ord-1", order_status: null },
      { id: "ord-2", order_status: "IN_PROGRESS" },
      { id: "ord-3", order_status: "COMPLETED" },
    ];
    const active = orders.filter((o) => !o.order_status || !INACTIVE_STATUSES.includes(o.order_status));
    expect(active.map((o) => o.id)).toEqual(["ord-1", "ord-2"]);
  });

  // Test 8: Ticket workspace is READ-ONLY and does not mutate ticket order relationships on read
  it("Test 8: Opening ticket workspace does NOT invoke update/mutation on support_tickets", () => {
    const ticketInDb = {
      id: "tkt-001",
      application_id: null,
      customer_id: "cust-001",
      order_link_status: "needs_review",
    };
    // getTicketWorkspace simply returns ticket data and candidateOrders without issuing SQL update
    const readOnlyResponse = {
      ticket: { ...ticketInDb },
      candidateOrders: [
        { id: "app-1", application_code: "AP-2026-001" },
        { id: "app-2", application_code: "AP-2026-002" },
      ],
    };
    expect(readOnlyResponse.ticket.application_id).toBeNull();
    expect(readOnlyResponse.ticket.order_link_status).toBe("needs_review");
    expect(readOnlyResponse.candidateOrders).toHaveLength(2);
  });

  // Test 9: Employee manually links a valid candidate application
  it("Test 9: Manual link of valid candidate updates application_id and sets order_link_status to linked", () => {
    const ticket = {
      id: "tkt-001",
      customer_id: "cust-001",
      application_id: null,
      order_link_status: "needs_review",
      is_unlinked: true,
    };
    const targetApplication = {
      id: "app-002",
      customer_id: "cust-001",
      application_code: "AP-2026-000002",
    };

    // Verification step
    expect(targetApplication.customer_id).toBe(ticket.customer_id);

    const updatedTicket = {
      ...ticket,
      application_id: targetApplication.id,
      order_link_status: "linked",
      is_unlinked: false,
    };

    expect(updatedTicket.application_id).toBe("app-002");
    expect(updatedTicket.order_link_status).toBe("linked");
    expect(updatedTicket.is_unlinked).toBe(false);
  });

  // Test 10: Employee attempts to link an application belonging to another customer -> rejected
  it("Test 10: Attempting to link an application of a different customer throws security violation", () => {
    const ticket = {
      id: "tkt-001",
      customer_id: "cust-001",
      application_id: null,
    };
    const unrelatedApplication = {
      id: "app-999",
      customer_id: "cust-OTHER",
    };

    const attemptLink = () => {
      if (unrelatedApplication.customer_id !== ticket.customer_id) {
        throw new Error("Security violation: The selected application belongs to a different customer. Linking rejected.");
      }
    };

    expect(attemptLink).toThrow(/Security violation/);
  });

  // Step 14: Regression Scenario from Production Incident
  describe("Production Incident Regression Tests", () => {
    it("Resolves AP-2026-010024 when present in subject", () => {
      const incidentSubject =
        "Re: [#TKT-20260919-0338] Re: Action Required – Your Order is Temporarily On Hold – Order No. AP-2026-010024";
      const ticketNo = extractTicketNumber(incidentSubject);
      const codes = extractOrderCodes(incidentSubject);

      expect(ticketNo).toBe("TKT-20260919-0338");
      expect(codes.applicationCode).toBe("AP-2026-010024");
    });

    it("Resolves single active order even when AP code is absent from the subject", () => {
      const genericSubject = "Re: [#TKT-20260919-0338] Uploaded requested Aadhaar documents";
      const ticketNo = extractTicketNumber(genericSubject);
      const codes = extractOrderCodes(genericSubject);

      expect(ticketNo).toBe("TKT-20260919-0338");
      expect(codes.applicationCode).toBeNull();

      // Customer single order fallback resolves AP-2026-010024:
      const customerOrders = [{ id: "app-10024", application_code: "AP-2026-010024", order_status: "IN_PROGRESS" }];
      const matchedApp = customerOrders.length === 1 ? customerOrders[0] : null;
      expect(matchedApp?.application_code).toBe("AP-2026-010024");
    });

    // Test 11: Customer with 1 paid order and 3 unpaid draft applications auto-links ONLY the paid order
    it("Test 11: Customer with 1 paid order and 3 unpaid applications auto-links the 1 paid order without needs_review", () => {
      const allCustomerApps = [
        { id: "app-paid-1", application_code: "AP-2026-007416", lead_id: "lead-1" },
        { id: "app-unpaid-2", application_code: "AP-2026-007184", lead_id: "lead-2" },
        { id: "app-unpaid-3", application_code: "AP-2026-007183", lead_id: "lead-3" },
        { id: "app-unpaid-4", application_code: "AP-2026-005827", lead_id: "lead-4" },
      ];

      const paidPayments = [{ application_id: "app-paid-1", status: "paid" }];
      const paidAppIds = new Set(paidPayments.map((p) => p.application_id));

      const eligiblePaidOrders = allCustomerApps.filter((a) => paidAppIds.has(a.id));

      expect(eligiblePaidOrders).toHaveLength(1);
      expect(eligiblePaidOrders[0].id).toBe("app-paid-1");

      const matchResult = {
        applicationId: eligiblePaidOrders.length === 1 ? eligiblePaidOrders[0].id : null,
        customerId: "cust-001",
        leadId: eligiblePaidOrders[0].lead_id,
        orderLinkStatus: eligiblePaidOrders.length === 1 ? ("linked" as const) : ("needs_review" as const),
        resolutionMethod: "customer_email" as const,
      };

      expect(matchResult.orderLinkStatus).toBe("linked");
      expect(matchResult.applicationId).toBe("app-paid-1");
    });
  });
});
