import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Public brand shape safe to expose to the client. No tokens, no secrets.
 */
export interface BrandInfo {
  websiteId: string;
  domain: string;
  siteName: string;
  legalEntity: string;
  companyName: string;
  supportEmail: string;
  supportPhone: string | null;
  whatsappNumber: string | null;
  businessHours: string | null;
  primaryColor: string | null;
  logoAssetUrl: string | null;
  faviconAssetUrl: string | null;
  sampleCertificateAssetUrl: string | null;
  legalFooterLine: string;
  postalAddress: string | null;
  footerUnlockCode: string | null;
  googleSiteVerification: string | null;
  gtagId: string | null;
  baseUrl: string;
  isPrimary: boolean;
  /** When false, /admin routes are hidden on this domain (public site only). */
  allowAdmin: boolean;
}

// Fallback constants mirror src/lib/brand.ts for local dev / preview hosts
// that don't match any websites row.
const FALLBACK: BrandInfo = {
  websiteId: "",
  domain: "udyamadhar.in",
  siteName: "Udyam Aadhar",
  legalEntity: "Business Help Services",
  companyName: "Business Help Services",
  supportEmail: "help@businesshelpservices.com",
  supportPhone: null,
  whatsappNumber: null,
  businessHours: null,
  primaryColor: "#1e3a8a",
  logoAssetUrl: null,
  faviconAssetUrl: null,
  sampleCertificateAssetUrl: null,
  postalAddress: null,
  footerUnlockCode: null,
  legalFooterLine:
    "Udyam Aadhar is operated by Business Help Services, a private consultancy. We are not affiliated with, authorised by, endorsed by, or associated with any government authority or department.",
  googleSiteVerification: null,
  gtagId: null,
  baseUrl: "https://udyamadhar.in",
  isPrimary: true,
  allowAdmin: true,
};

export const getCurrentBrand = createServerFn({ method: "GET" }).handler(
  async (): Promise<BrandInfo> => {
    try {
      const { resolveCurrentWebsite } = await import("./current-website.server");
      const request = getRequest();
      const row = await resolveCurrentWebsite(request);
      return {
        websiteId: row.id,
        domain: row.domain,
        siteName: row.brand_name || row.name || FALLBACK.siteName,
        legalEntity: row.legal_entity || FALLBACK.legalEntity,
        companyName: row.company_name || FALLBACK.companyName,
        supportEmail: row.support_email || FALLBACK.supportEmail,
        supportPhone: row.support_phone,
        whatsappNumber: row.whatsapp_number,
        businessHours: row.business_hours,
        primaryColor: row.primary_color,
        logoAssetUrl: row.logo_asset_url,
        faviconAssetUrl: row.favicon_asset_url,
        sampleCertificateAssetUrl: row.sample_certificate_asset_url,
        legalFooterLine: row.legal_footer_line || FALLBACK.legalFooterLine,
        postalAddress: row.postal_address,
        footerUnlockCode: row.footer_unlock_code,
        googleSiteVerification: row.google_site_verification,
        gtagId: row.gtag_id,
        baseUrl: `https://${row.domain}`,
        isPrimary: !!row.is_primary,
        allowAdmin: row.allow_admin !== false,
      };
    } catch (err) {
      console.warn("[getCurrentBrand] falling back to defaults", err);
      return FALLBACK;
    }
  },
);
