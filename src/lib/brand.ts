// Single source of truth for brand / legal entity / contact info.
// Use these constants instead of hardcoding strings in components and templates.

export const SITE_NAME = "Udyam Aadhar";
export const LEGAL_ENTITY = "Business Help Services";
export const COMPANY_NAME = "Business Help Services";
/** Customer-facing support inbox. Used across email templates and footers. */
export const SUPPORT_EMAIL = "help@businesshelpservices.com";
/** Legacy alias retained for older imports. */
export const CONTACT_EMAIL = SUPPORT_EMAIL;
export const BASE_URL = "https://udyamadhar.in";

export const LEGAL_FOOTER_LINE = `${SITE_NAME} is operated by ${LEGAL_ENTITY}, a private consultancy. We are not affiliated with, authorised by, endorsed by, or associated with any government authority or department.`;
