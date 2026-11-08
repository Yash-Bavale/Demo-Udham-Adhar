// JSON-LD builders for SEO schema. Inject via route head().scripts as
// `{ type: "application/ld+json", children: JSON.stringify(...) }`.

const SITE = "https://udyamadhar.in";
const ORG_ID = `${SITE}/#organization`;

export const orgSchema = (baseUrl: string = SITE) => {
  const isUdyamRegistrations = baseUrl.toLowerCase().includes("udyamregistration");
  const siteUrl = isUdyamRegistrations ? "https://udyamregistrations.in" : baseUrl.replace(/\/+$/, "");
  const name = isUdyamRegistrations ? "Udyam Registration" : "Udyam Aadhar";

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name: "Business Help Services",
    legalName: "Business Help Services",
    url: `${siteUrl}/`,
    logo: `${siteUrl}/logo.png`,
    description:
      "Udyam Registration portal for MSME services. New Udyam Registration, Download Udyam Certificate, Forgot Udyam Certificate, Forgot Udyog Aadhaar, Udyog Aadhaar to Udyam Migration, MSME Certificate and Udyam Update.",
    areaServed: "India",
    knowsAbout: [
      "Udyam Registration",
      "Udyam Registration Certificate",
      "Udyam Aadhar",
      "Udyam Aadhar Certificate",
      "Udyam Login",
      "Udyam Aadhar Portal",
      "Download Udyam Aadhar",
      "Print Udyam Certificate",
      "Forgot Udyam",
      "Forgot Udyam Certificate",
      "Forgot Udyog Aadhar",
      "MSME Registration",
      "MSME Certificate",
      "Download MSME Certificate",
      "Forgot MSME Certificate",
      "Udyam PAN Aadhar Name Correction",
      "Update Udyam Aadhar",
      "Update MSME",
      "Migrate Udyog to Udyam",
      "Forgot Udyam Register Mobile",
      "Download Udyam Certificate",
      "Reprint Udyam Certificate",
      "Update Udyam Certificate",
      "Update Udyam Registration",
      "Update MSME Registration",
      "Modify Udyam Certificate",
      "Edit Udyam Certificate",
      "Udyam Certificate Correction",
      "Udyam Name Correction",
      "Udyam Mobile Number Update",
      "Udyam PAN Update",
      "Udyam Aadhaar Update",
      "Forgot Udyam Registration",
      "Forgot Udyam Mobile Number",
      "Retrieve Udyam Certificate",
      "Recover Udyam Certificate",
      "Udyam Registration Online",
      "Apply Udyam Registration",
      "Udyam Certificate",
      "MSME Registration Online",
      "Register MSME",
      "Register Udyam",
      "Udyam Portal",
      "Udyam Aadhaar",
      "Udyam Aadhaar Registration",
      "Udyam Aadhaar Certificate",
      "Udyam Number",
      "Udyam Registration Number"
    ],
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+91-9767870331",
      contactType: "customer service",
      areaServed: "IN",
      availableLanguage: [
        "English",
        "Hindi",
        "Marathi",
        "Bengali",
        "Gujarati",
        "Kannada",
        "Malayalam",
        "Punjabi",
        "Sindhi",
        "Tamil",
        "Telugu",
        "Urdu",
      ],
    },
    sameAs: ["https://www.linkedin.com/company/business-help-services"],
    address: {
      "@type": "PostalAddress",
      streetAddress: "Koregaon Bk, Taluka-Khed",
      addressLocality: "Pune",
      addressRegion: "Maharashtra",
      postalCode: "410505",
      addressCountry: "IN",
    },
  };
};

export const websiteSchema = (baseUrl: string = SITE) => {
  const isUdyamRegistrations = baseUrl.toLowerCase().includes("udyamregistration");
  const siteUrl = isUdyamRegistrations ? "https://udyamregistrations.in" : baseUrl.replace(/\/+$/, "");
  const name = isUdyamRegistrations ? "Udyam Registration" : "Udyam Aadhar";
  const alternateName = isUdyamRegistrations ? "Udyam Registration Portal" : "Udyam Aadhar Portal";

  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    alternateName,
    url: `${siteUrl}/`,
  };
};

export const faqSchema = (items: Array<{ q: string; a: string }>) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
});

export const serviceSchema = (s: {
  name: string;
  url: string;
  description: string;
}) => ({
  "@context": "https://schema.org",
  "@type": "Service",
  name: `${s.name} — Business Help Services`,
  serviceType: s.name,
  provider: {
    "@type": "Organization",
    name: "Business Help Services",
    url: `${SITE}/`,
  },
  areaServed: { "@type": "Country", name: "India" },
  url: s.url,
  description: s.description,
});

export const howToSchema = (input: {
  name: string;
  totalTime?: string;
  steps: Array<{ name: string; text: string }>;
}) => ({
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: input.name,
  ...(input.totalTime ? { totalTime: input.totalTime } : {}),
  step: input.steps.map((s, i) => ({
    "@type": "HowToStep",
    position: i + 1,
    name: s.name,
    text: s.text,
  })),
});

export const breadcrumbSchema = (items: Array<{ name: string; url: string }>) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: it.name,
    item: it.url,
  })),
});

export const jsonLdScript = (data: unknown) => ({
  type: "application/ld+json" as const,
  children: JSON.stringify(data),
});
