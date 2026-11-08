/** Only Udyam Aadhar services are shown to staff for now. Never display partner website domains in the CRM. */
export const VISIBLE_SERVICE_DOMAIN = "udyamadhar.in";
export function isVisibleService(s: any): boolean {
  return s?.is_active !== false && s?.website?.domain === VISIBLE_SERVICE_DOMAIN;
}
