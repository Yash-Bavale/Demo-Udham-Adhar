import { createContext, useContext, type ReactNode } from "react";
import type { BrandInfo } from "./current-brand.functions";

const BrandContext = createContext<BrandInfo | null>(null);

// Mirrors the server-side fallback so a failed/absent brand load degrades to
// default branding instead of crashing the whole render tree.
const DEFAULT_BRAND: BrandInfo = {
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

export function BrandProvider({
  value,
  children,
}: {
  value: BrandInfo | null | undefined;
  children: ReactNode;
}) {
  return (
    <BrandContext.Provider value={value ?? DEFAULT_BRAND}>{children}</BrandContext.Provider>
  );
}

/**
 * Access the current site's brand info. Falls back to default branding when no
 * provider is present (e.g. error boundaries rendered outside the root tree).
 */
export function useBrand(): BrandInfo {
  return useContext(BrandContext) ?? DEFAULT_BRAND;
}

/**
 * Non-throwing variant for optional brand access (e.g. rare edge cases where
 * a component may render before the provider mounts).
 */
export function useOptionalBrand(): BrandInfo | null {
  return useContext(BrandContext);
}
