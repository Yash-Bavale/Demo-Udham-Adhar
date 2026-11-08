# Generate exact dispute PDFs without an external service

## Outcome
- Keep the current backend and stored email/invoice records.
- Generate the PDF inside the authorised CRM browser, which already has the rendering engine needed for the exact email design.
- Download one combined PDF containing only the selected emails followed by the selected saved invoice.

## Changes
1. Add an authenticated preparation action that returns only the selected email HTML, seven metadata fields, and a short-lived link to the saved invoice.
2. Render each selected email in an isolated, script-disabled frame using the exact stored HTML and metadata.
3. Capture those rendered A4 pages in the browser, build their PDF pages, and append the original invoice PDF pages unchanged.
4. Upload the completed PDF through an authenticated action so the existing dispute history and download flow remain unchanged.
5. Remove the server-browser conversion and its plain-text source-code fallback.
6. Update the preview wording so it accurately says: selected emails first, saved invoice last; no summary, evidence branding, footer, or certificate.

## Safety
- Only existing authorised dispute-management roles can prepare or save a package.
- Stored email content is rendered in a sandbox that cannot run scripts or access the CRM session.
- Invoice access uses a short-lived authorised link.
- No email, invoice, or dispute record is deleted or changed.

## Verification
- Generate the reference order package and compare every page with the supplied PDF/screenshots.
- Confirm seven metadata fields, exact email body, no summary page, and the original invoice appended unchanged.
- Check type validation, production build, and the full download/history flow.
