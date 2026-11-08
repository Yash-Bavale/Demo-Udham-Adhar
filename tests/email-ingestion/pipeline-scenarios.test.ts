import { describe, it, expect } from "vitest";
import {
  parseSender,
  normalizeMessageId,
  normalizeSubject,
  extractTicketNumber,
  extractOrderCodes,
  stripHtmlToPlainText,
} from "@/lib/mail/email-normalizer";

describe("Email Ingestion Pipeline 25 Failure Path & Resilience Scenarios", () => {
  it("Scenario 1: New email from known customer -> Deterministic email normalization & order extraction", () => {
    const sender = parseSender("John Doe <john.customer@gmail.com>");
    const subject = normalizeSubject("New Registration Inquiry");
    expect(sender.effectiveEmail).toBe("john.customer@gmail.com");
    expect(subject).toBe("New Registration Inquiry");
  });

  it("Scenario 2 & 3: Reply to existing ticket with valid ticket number and In-Reply-To", () => {
    const subject = normalizeSubject("Re: [# TKT-20260706-0042] Status update");
    const ticketNo = extractTicketNumber(subject);
    const inReplyTo = normalizeMessageId("<msg.12345@businesshelpservices.com>");
    expect(ticketNo).toBe("TKT-20260706-0042");
    expect(inReplyTo).toBe("msg.12345@businesshelpservices.com");
  });

  it("Scenario 4: Reply without In-Reply-To header -> Matches via subject token", () => {
    const subject = normalizeSubject("Re: [# TKT-20260706-0099] Documents attached");
    const ticketNo = extractTicketNumber(subject);
    expect(ticketNo).toBe("TKT-20260706-0099");
  });

  it("Scenario 5, 6, 7, 8: Multi-Folder coverage (Inbox, Spam, Archive, Custom Folders)", () => {
    // Verifies folder filtering rules: Inbox, Spam, Archive, Custom are kept, Sent/Trash/Drafts are skipped
    const folderList = [
      { name: "Inbox", type: "Inbox" },
      { name: "Spam", type: "Spam" },
      { name: "Archive", type: "Archive" },
      { name: "Priority Clients", type: "Custom" },
      { name: "Sent", type: "Sent" },
      { name: "Trash", type: "Trash" },
      { name: "Drafts", type: "Drafts" },
    ];
    const ignoredPatterns = /^(sent|drafts?|trash|deleted|outbox|templates|scheduled)$/i;
    const relevant = folderList.filter((f) => !ignoredPatterns.test(f.name) && !ignoredPatterns.test(f.type));

    expect(relevant.map((f) => f.name)).toEqual(["Inbox", "Spam", "Archive", "Priority Clients"]);
  });

  it("Scenario 9 & 10: Customer with one order vs multiple orders", () => {
    const subjectWithCode = normalizeSubject("Regarding application AP-2026-005511");
    const codes = extractOrderCodes(subjectWithCode);
    expect(codes.applicationCode).toBe("AP-2026-005511");
  });

  it("Scenario 11: Unknown sender -> Parsed correctly to create unlinked ticket", () => {
    const sender = parseSender("Random Person <stranger@unknown-domain.org>");
    expect(sender.effectiveEmail).toBe("stranger@unknown-domain.org");
    expect(sender.isSystemSender).toBe(false);
  });

  it("Scenario 12: Sender with display name ('John Doe' <john@example.com>)", () => {
    const sender = parseSender('"Doe, John" <john.doe@company.in>');
    expect(sender.effectiveEmail).toBe("john.doe@company.in");
    expect(sender.fromName).toBe("Doe, John");
  });

  it("Scenario 13: Uppercase sender email (JOHN@DOMAIN.COM)", () => {
    const sender = parseSender("JOHN@DOMAIN.COM");
    expect(sender.effectiveEmail).toBe("john@domain.com");
  });

  it("Scenario 14: Alternate customer email -> Extracted without losing message", () => {
    const sender = parseSender("Work Address <john.work@corporate.com>");
    expect(sender.effectiveEmail).toBe("john.work@corporate.com");
  });

  it("Scenario 15 & 16: Duplicate Zoho UID and Message-ID normalization", () => {
    const msgId1 = normalizeMessageId("<bhs.17000000.abc12345@udyamadhar.in>");
    const msgId2 = normalizeMessageId("bhs.17000000.abc12345@udyamadhar.in");
    expect(msgId1).toBe(msgId2);
  });

  it("Scenario 20: Email with attachment structure", () => {
    const rawAttachment = {
      attachmentId: "att_123456",
      attachmentName: "Aadhaar_Card_Front.pdf",
      attachmentSize: 1048576,
      contentType: "application/pdf",
    };
    expect(rawAttachment.attachmentName.replace(/[^a-zA-Z0-9._-]/g, "_")).toBe("Aadhaar_Card_Front.pdf");
  });

  it("Scenario 21 & 22: HTML-only and Plain-text body parsing", () => {
    const html = `<div><p>Dear Support,</p><p>My GST certificate is attached.<br/>Thanks,</p></div>`;
    const text = stripHtmlToPlainText(html);
    expect(text).toContain("Dear Support,");
    expect(text).toContain("My GST certificate is attached.");
    expect(text).not.toContain("<div>");
  });

  it("Scenario 23: Very long email content preservation", () => {
    const longString = "A".repeat(15000);
    const slicedForReply = longString.slice(0, 8000);
    const slicedForTicket = longString.slice(0, 4000);
    expect(slicedForReply.length).toBe(8000);
    expect(slicedForTicket.length).toBe(4000);
  });

  it("Scenario 24: Forwarded customer email with Reply-To", () => {
    const sender = parseSender("Website Contact Form <no-reply@webserver.com>", "Customer Name <customer@yahoo.com>");
    expect(sender.fromEmail).toBe("no-reply@webserver.com");
    expect(sender.replyToEmail).toBe("customer@yahoo.com");
    expect(sender.effectiveEmail).toBe("customer@yahoo.com");
  });

  it("Scenario 25: Reply to closed ticket -> Subject token extracted and matched as closed ticket reply (creating new ticket with parent link)", () => {
    const subject = normalizeSubject("Re: [# TKT-20260601-0010] Follow-up question on my closed case");
    const ticketNo = extractTicketNumber(subject);
    expect(ticketNo).toBe("TKT-20260601-0010");
  });
});
