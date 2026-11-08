/**
 * Per-website service catalogues share the same underlying journeys but need
 * globally unique `service_code` values, so secondary sites carry a suffix
 * (e.g. `correct-pan-aadhaar--ur`). Any logic that keys off the *kind* of
 * service must compare the base code, not the raw one.
 */
const SITE_SUFFIX = /--[a-z0-9]{1,8}$/;

export function baseServiceCode(code: string | null | undefined): string {
  if (!code) return "";
  return code.replace(SITE_SUFFIX, "");
}

/** True when `code` is the given base service, on any website. */
export function isService(code: string | null | undefined, base: string): boolean {
  return baseServiceCode(code) === base;
}
