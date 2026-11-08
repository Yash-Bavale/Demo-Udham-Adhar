import { describe, it, expect } from "vitest";
import {
  extractEmailAddress,
  extractDisplayName,
  parseSender,
  isKnownSystemSender,
  normalizeMessageId,
  normalizeReferences,
  normalizeSubject,
  stripHtmlToPlainText,
  extractTicketNumber,
  extractOrderCodes,
} from "@/lib/mail/email-normalizer";

describe("Email Normalizer Unit Tests", () => {
  it("extracts bare and angle-bracketed email addresses cleanly", () => {
    expect(extractEmailAddress("user@example.com")).toBe("user@example.com");
    expect(extractEmailAddress("  USER@EXAMPLE.COM  ")).toBe("user@example.com");
    expect(extractEmailAddress("John Doe <john.doe@example.com>")).toBe("john.doe@example.com");
    expect(extractEmailAddress('"Acme Support" <support@acme.co.in>')).toBe("support@acme.co.in");
    expect(extractEmailAddress("")).toBeNull();
    expect(extractEmailAddress(null)).toBeNull();
  });

  it("extracts display names from formatted senders", () => {
    expect(extractDisplayName("John Doe <john@example.com>")).toBe("John Doe");
    expect(extractDisplayName('"Jane, Doe" <jane@example.com>')).toBe("Jane, Doe");
    expect(extractDisplayName("support@example.com")).toBeNull();
  });

  it("parses sender headers and prefers non-system Reply-To", () => {
    const s1 = parseSender("John Doe <john@example.com>");
    expect(s1.effectiveEmail).toBe("john@example.com");
    expect(s1.fromName).toBe("John Doe");
    expect(s1.isSystemSender).toBe(false);

    const s2 = parseSender("No Reply <noreply@mailer.com>", "Actual Customer <customer@gmail.com>");
    expect(s2.fromEmail).toBe("noreply@mailer.com");
    expect(s2.replyToEmail).toBe("customer@gmail.com");
    expect(s2.effectiveEmail).toBe("customer@gmail.com");
    expect(s2.isSystemSender).toBe(true);
  });

  it("correctly identifies system senders", () => {
    expect(isKnownSystemSender("noreply@service.com")).toBe(true);
    expect(isKnownSystemSender("mailer-daemon@zoho.com")).toBe(true);
    expect(isKnownSystemSender("notifications@udyamadhar.in")).toBe(true);
    expect(isKnownSystemSender("customer@gmail.com")).toBe(false);
    expect(isKnownSystemSender("ceo@businesscompany.in")).toBe(false);
  });

  it("normalizes Message-IDs and References", () => {
    expect(normalizeMessageId("<abc.123@domain.com>")).toBe("abc.123@domain.com");
    expect(normalizeMessageId("  <xyz.789@domain.com>  ")).toBe("xyz.789@domain.com");
    expect(normalizeMessageId("bare-id@domain.com")).toBe("bare-id@domain.com");
    expect(normalizeMessageId(null)).toBeNull();

    const refs = normalizeReferences("<ref1@dom.com>   <ref2@dom.com>\n<ref3@dom.com>");
    expect(refs).toEqual(["ref1@dom.com", "ref2@dom.com", "ref3@dom.com"]);
  });

  it("normalizes subjects, decoding entities and zero-width characters", () => {
    expect(normalizeSubject("Urgent &amp; Important: Order &quot;AP-2026-000123&quot;")).toBe(
      'Urgent & Important: Order "AP-2026-000123"'
    );
    expect(normalizeSubject("Subject with &#x26; and &#39;quotes&#39;")).toBe(
      "Subject with & and 'quotes'"
    );
    expect(normalizeSubject("Hidden\u200B\uFEFFZeroWidth")).toBe("HiddenZeroWidth");
  });

  it("strips HTML to plain text while preserving paragraphs", () => {
    const html = "<p>Hello Support,</p><p>Please find my details below:<br/>Order is pending.</p>";
    const text = stripHtmlToPlainText(html);
    expect(text).toContain("Hello Support,");
    expect(text).toContain("Order is pending.");
    expect(text).not.toContain("<p>");
  });

  it("extracts ticket numbers from subjects", () => {
    expect(extractTicketNumber("[# TKT-20260706-001] Regarding certificate")).toBe("TKT-20260706-001");
    expect(extractTicketNumber("Re: [#TKT-20260706-1234] Issue resolved")).toBe("TKT-20260706-1234");
    expect(extractTicketNumber("Query about TKT-20260706-9999")).toBe("TKT-20260706-9999");
    expect(extractTicketNumber("No ticket in this subject")).toBeNull();
  });

  it("extracts application and lead codes from subject/body", () => {
    expect(extractOrderCodes("Status of AP-2026-001234")).toEqual({
      applicationCode: "AP-2026-001234",
      leadCode: null,
    });
    expect(extractOrderCodes("Registration UA-2026-654321")).toEqual({
      applicationCode: null,
      leadCode: "UA-2026-654321",
    });
    expect(extractOrderCodes("General query", "My application code is AP-2026-998877")).toEqual({
      applicationCode: "AP-2026-998877",
      leadCode: null,
    });
  });
});
