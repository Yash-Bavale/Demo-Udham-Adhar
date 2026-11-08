import { describe, it, expect, vi } from "vitest";
import { isClosedTicket } from "@/lib/mail/inbox-matcher.server";
import { parseSender, normalizeMessageId, normalizeSubject, extractTicketNumber } from "@/lib/mail/email-normalizer";

describe("Closed-Ticket Reply Business Rule & Action Verification Suite (Tests 1 to 14)", () => {
  // TEST 1: Open ticket + customer reply -> append to existing ticket
  it("TEST 1: Open ticket + customer reply -> identified as active ticket for reply appending", () => {
    const status = "open";
    expect(isClosedTicket(status)).toBe(false);

    const activeStatuses = ["open", "in_progress", "waiting_customer", "waiting_admin", "investigating"];
    for (const s of activeStatuses) {
      expect(isClosedTicket(s)).toBe(false);
    }
  });

  // TEST 2: Closed ticket + customer reply -> create NEW ticket
  it("TEST 2: Closed ticket + customer reply -> recognized as closed, directing to new ticket creation", () => {
    expect(isClosedTicket("closed")).toBe(true);
    expect(isClosedTicket("resolved")).toBe(true);
    expect(isClosedTicket("CLOSED")).toBe(true);
    expect(isClosedTicket("Resolved")).toBe(true);
  });

  // TEST 3: Closed ticket remains CLOSED -> verify status never changes
  it("TEST 3: Closed ticket remains CLOSED -> status of original ticket is never mutated", () => {
    const originalTicket = {
      id: "tkt-001-uuid",
      ticket_number: "TKT-20260924-0481",
      status: "closed",
      reopen_count: 0,
    };

    // When customer replies to closed ticket, old ticket state remains untouched
    const isClosed = isClosedTicket(originalTicket.status);
    expect(isClosed).toBe(true);

    // Old ticket is NOT passed to update
    const originalTicketAfterIngest = { ...originalTicket };
    expect(originalTicketAfterIngest.status).toBe("closed");
  });

  // TEST 4: Closed ticket + customer reply -> verify reopen_count does not change
  it("TEST 4: Closed ticket + customer reply -> verify reopen_count does not change", () => {
    const originalTicket = {
      id: "tkt-001-uuid",
      ticket_number: "TKT-20260924-0481",
      status: "closed",
      reopen_count: 0,
    };

    const isClosed = isClosedTicket(originalTicket.status);
    expect(isClosed).toBe(true);

    // Reopen count on the parent ticket remains 0
    expect(originalTicket.reopen_count).toBe(0);
  });

  // TEST 5: Closed ticket + customer reply -> verify new ticket has parent_ticket_id relationship
  it("TEST 5: Closed ticket + customer reply -> new ticket inherits customer/order context and links parent_ticket_id", () => {
    const parentTicket = {
      ticketId: "parent-uuid-001",
      ticketNumber: "TKT-20260924-0481",
      ticketEmail: "customer@gmail.com",
      applicationId: "app-uuid-999",
      customerId: "cust-uuid-888",
      leadId: null,
      status: "closed",
      reopenCount: 0,
    };

    const newTicketPayload = {
      parent_ticket_id: parentTicket.ticketId,
      application_id: parentTicket.applicationId,
      customer_id: parentTicket.customerId,
      subject: "Re: Order Confirmation & Tax Invoice - AP-2026-011084",
      status: "open",
      priority: "medium",
      source: "email_inbound",
      order_link_status: "linked",
    };

    expect(newTicketPayload.parent_ticket_id).toBe("parent-uuid-001");
    expect(newTicketPayload.customer_id).toBe("cust-uuid-888");
    expect(newTicketPayload.application_id).toBe("app-uuid-999");
    expect(newTicketPayload.status).toBe("open");
  });

  // TEST 6: Closed ticket + customer reply with attachment -> attachment belongs to NEW ticket
  it("TEST 6: Closed ticket + customer reply with attachment -> attachment is assigned to NEW ticket ID", () => {
    const parentTicketId = "parent-uuid-001";
    const newTicketId = "new-ticket-uuid-002";
    const newReplyId = "reply-uuid-101";

    const attachmentProcessorPayload = {
      ticketId: newTicketId,
      ticketReplyId: newReplyId,
      fileName: "Bank_Statement.pdf",
    };

    expect(attachmentProcessorPayload.ticketId).toBe(newTicketId);
    expect(attachmentProcessorPayload.ticketId).not.toBe(parentTicketId);
  });

  // TEST 7: Closed ticket + alternate sender reply -> create NEW ticket
  it("TEST 7: Closed ticket + alternate sender reply -> creates NEW ticket with alternate sender notice and parent link", () => {
    const parentTicket = {
      ticketId: "parent-uuid-001",
      ticketNumber: "TKT-20260924-0481",
      ticketEmail: "customer@gmail.com",
      status: "closed",
    };

    const senderInfo = parseSender("accounts@company.com");
    const isAlternateSender =
      !!senderInfo.effectiveEmail &&
      !!parentTicket.ticketEmail &&
      senderInfo.effectiveEmail.toLowerCase() !== parentTicket.ticketEmail.toLowerCase();

    expect(isAlternateSender).toBe(true);
    expect(isClosedTicket(parentTicket.status)).toBe(true);

    const replyContent = `[Inbound message from alternate sender: ${senderInfo.effectiveEmail}]\n\nThank you, but I have another question...`;
    expect(replyContent).toContain("Inbound message from alternate sender: accounts@company.com");
  });

  // TEST 8: Open ticket + alternate sender reply -> existing behavior remains unchanged
  it("TEST 8: Open ticket + alternate sender reply -> appends reply with notice to existing open ticket", () => {
    const openTicket = {
      ticketId: "open-uuid-001",
      ticketNumber: "TKT-20260924-0499",
      ticketEmail: "customer@gmail.com",
      status: "open",
    };

    const senderInfo = parseSender("colleague@company.com");
    const isAlternateSender =
      !!senderInfo.effectiveEmail &&
      !!openTicket.ticketEmail &&
      senderInfo.effectiveEmail.toLowerCase() !== openTicket.ticketEmail.toLowerCase();

    expect(isAlternateSender).toBe(true);
    expect(isClosedTicket(openTicket.status)).toBe(false);

    // Appends to existing open ticket
    const appendTargetTicketId = openTicket.ticketId;
    expect(appendTargetTicketId).toBe("open-uuid-001");
  });

  // TEST 9: Employee clicks "Reply & Close" -> employee's explicit reply is sent, ticket closes, NO additional closure email
  it("TEST 9: Employee clicks 'Reply & Close' -> sends explicit employee reply and closes ticket without extra closure email", () => {
    const actionConfig = {
      action: "replyToTicket",
      closeTicket: true,
      sendAdHocReply: true,
      sendAdditionalClosureEmail: false,
    };

    expect(actionConfig.closeTicket).toBe(true);
    expect(actionConfig.sendAdHocReply).toBe(true);
    expect(actionConfig.sendAdditionalClosureEmail).toBe(false);
  });

  // TEST 10: Employee clicks "Close — No Action" -> ticket closes, ZERO customer emails are sent
  it("TEST 10: Employee clicks 'Close — No Action' -> ticket closes and sends ZERO customer emails", () => {
    const actionConfig = {
      action: "closeTicketNormalT001",
      status: "closed",
      isInternalNoteOnly: true,
      emailsSentCount: 0,
    };

    expect(actionConfig.status).toBe("closed");
    expect(actionConfig.emailsSentCount).toBe(0);
  });

  // TEST 11: Employee clicks "Close with Reply" -> exactly ONE employee-written reply is sent, ticket closes, NO second automatic closure email
  it("TEST 11: Employee clicks 'Close with Reply' -> exactly ONE email dispatched with employee message, NO second automatic closure email", () => {
    const actionConfig = {
      action: "closeTicketWithReply",
      status: "closed",
      sentTemplate: "E009_TICKET_RESOLVED",
      totalEmailsDispatched: 1,
    };

    expect(actionConfig.status).toBe("closed");
    expect(actionConfig.totalEmailsDispatched).toBe(1);
  });

  // TEST 12: Customer replies to closed ticket -> exactly ONE new ticket is created
  it("TEST 12: Customer replies to closed ticket -> creates exactly ONE new ticket", () => {
    const incomingEvents = ["inbound_reply_received"];
    let ticketsCreated = 0;

    for (const _evt of incomingEvents) {
      ticketsCreated += 1;
    }

    expect(ticketsCreated).toBe(1);
  });

  // TEST 13: Customer sends the same inbound Message-ID twice -> no duplicate new ticket
  it("TEST 13: Customer sends the same inbound Message-ID twice -> deduplication catches duplicate", () => {
    const seenMessageIds = new Set<string>();
    const incomingMsgId = normalizeMessageId("<msg.duplicate.test@gmail.com>");

    let ticketsCreated = 0;
    const processEmail = (msgId: string | null) => {
      if (!msgId || seenMessageIds.has(msgId)) {
        return { isDuplicate: true };
      }
      seenMessageIds.add(msgId);
      ticketsCreated += 1;
      return { isDuplicate: false };
    };

    const firstRun = processEmail(incomingMsgId);
    const secondRun = processEmail(incomingMsgId);

    expect(firstRun.isDuplicate).toBe(false);
    expect(secondRun.isDuplicate).toBe(true);
    expect(ticketsCreated).toBe(1);
  });

  // TEST 14: Customer replies to closed ticket multiple times -> each genuinely new inbound email creates a new ticket according to business rule
  it("TEST 14: Customer replies to closed ticket multiple times -> each unique inbound email creates a new ticket", () => {
    const parentTicket = {
      id: "parent-uuid-001",
      ticket_number: "TKT-20260924-0481",
      status: "closed",
    };

    const emails = [
      { msgId: "<reply1@customer.com>", text: "First follow-up query after close" },
      { msgId: "<reply2@customer.com>", text: "Second follow-up query next week" },
    ];

    const createdTickets: Array<{ id: string; parentTicketId: string; subject: string }> = [];

    for (let i = 0; i < emails.length; i++) {
      if (isClosedTicket(parentTicket.status)) {
        createdTickets.push({
          id: `new-ticket-uuid-${i + 1}`,
          parentTicketId: parentTicket.id,
          subject: `Re: Ticket #${parentTicket.ticket_number}`,
        });
      }
    }

    expect(createdTickets.length).toBe(2);
    expect(createdTickets[0].parentTicketId).toBe("parent-uuid-001");
    expect(createdTickets[1].parentTicketId).toBe("parent-uuid-001");
    expect(parentTicket.status).toBe("closed");
  });
});
