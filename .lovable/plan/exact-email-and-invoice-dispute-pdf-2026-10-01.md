# Exact email and invoice dispute PDF

## Result
Generate one PDF containing only the selected sent emails and selected invoice, matching the attached `communication_proof.pdf` format.

## Changes
- Remove the dispute summary/manifest first page completely.
- Remove “Evidence Item”, “Authenticated Sent Record”, dispute labels, legal statements, and evidence footers from email pages.
- Start each selected email with a plain mail-print header matching the reference: From, To, Date, Subject, Attachments, plus the stored message identifier and delivery status when available.
- Render the stored `body_html` as HTML, not as visible source code, so the result is the exact email design the customer received.
- Preserve each email’s original sender, recipient, sent time, subject, body, and recorded attachment name. Do not regenerate email copy from the current template.
- Keep selected emails in chronological order and begin every selected email on a new page.
- Append the selected stored invoice PDF exactly as saved, after the email pages. Do not redesign or wrap the invoice as evidence.
- Keep certificate inclusion unchanged when selected.

## Safety and verification
- Do not change email sending, stored email records, invoice generation, or past generated files.
- Generate a test package from existing saved data, render every page to images, and compare the metadata header, email body, page order, and invoice against the supplied reference.
- Run the project typecheck and production build.

## Technical details
- Restrict implementation to the dispute PDF renderer unless existing stored fields need a small read-only mapping adjustment.
- Existing generated dispute PDFs remain unchanged; only newly generated PDFs use this format.
