import { describe, it, expect } from "vitest";
import { applyFooterDomain } from "./footer-domain";

const footer = `<a href="https://udyamadhar.in/terms-conditions">T</a>
<p>&#128231; help@businesshelpservices.com &nbsp;&nbsp; &#127760; www.udyamadhar.in</p>
<td>&copy; Business Help Services &middot; www.udyamadhar.in</td>
help@businesshelpservices.com &nbsp;|&nbsp; udyamadhar.in
<a href="https://udyamadhar.in">https://udyamadhar.in</a>
<a href="https://udyamadhar.in/onboarding/abc">Fill form</a>`;

describe("applyFooterDomain", () => {
  it("GST order footer points to gstcertificate.in", () => {
    const out = applyFooterDomain(footer, "gstcertificate.in");
    expect(out).toContain("https://gstcertificate.in/terms-conditions");
    expect(out).toContain("&#127760; www.gstcertificate.in</p>");
    expect(out).toContain("&middot; www.gstcertificate.in</td>");
    expect(out).toContain("&nbsp;|&nbsp; gstcertificate.in");
    expect(out).toContain('<a href="https://gstcertificate.in">https://gstcertificate.in</a>');
  });
  it("never changes customer form links or support email", () => {
    const out = applyFooterDomain(footer, "gstcertificate.in");
    expect(out).toContain("https://udyamadhar.in/onboarding/abc");
    expect(out).toContain("help@businesshelpservices.com");
  });
  it("Udyam order or unknown website keeps udyamadhar.in", () => {
    expect(applyFooterDomain(footer, "udyamadhar.in")).toBe(footer);
    expect(applyFooterDomain(footer, null)).toBe(footer);
  });
});
