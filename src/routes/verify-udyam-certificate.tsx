import { createFileRoute } from "@tanstack/react-router";
import {
  getContentfulServicePage,
  type ContentfulServicePage,
} from "@/lib/contentful/client.functions";
import { RichServicePage, type RichBlock } from "@/components/site/RichServicePage";
import {
  jsonLdScript,
  serviceSchema,
  faqSchema,
  howToSchema,
  breadcrumbSchema,
} from "@/lib/seo/jsonld";

export const URL = "https://udyamadhar.in/verify-udyam-certificate";
export const TITLE = "Verify Udyam Certificate Online | Check Udyam Registration";
export const DESC =
  "Verify a Udyam (MSME) certificate online using the Udyam Registration Number. Confirm enterprise name, type, category and registration date with expert assistance.";

export const FAQS = [
  {
    q: "How do I verify a Udyam certificate?",
    a: "A Udyam certificate is verified using the 19-character Udyam Registration Number (URN) printed on it, along with the mobile number or email registered with that Udyam application for OTP confirmation.",
  },
  {
    q: "What details are confirmed during verification?",
    a: "Verification confirms the enterprise name, type of organisation, major activity, social category, enterprise classification (micro, small or medium), date of incorporation and date of Udyam registration.",
  },
  {
    q: "Can I verify a supplier's or vendor's Udyam certificate?",
    a: "Yes. Buyers, banks and tender authorities commonly verify a vendor's MSME status before extending MSME benefits or processing payments under the MSME payment rules.",
  },
  {
    q: "What if the verification shows no record?",
    a: "If no record appears, the number may be mistyped, the certificate may relate to an old Udyog Aadhaar that was never migrated, or the registration may have been cancelled. Our team can help you check and correct it.",
  },
  {
    q: "Is verification the same as downloading the certificate?",
    a: "No. Verification only confirms the registration details are genuine. Downloading a fresh PDF copy of the certificate is a separate process that requires OTP authentication on the registered contact.",
  },
];

export const STEPS = [
  {
    name: "Share the URN",
    text: "Provide the 19-character Udyam Registration Number shown on the certificate you want verified.",
  },
  {
    name: "Details check",
    text: "We check the registration record for enterprise name, classification and registration date.",
  },
  {
    name: "OTP confirmation",
    text: "Where required, an OTP on the registered mobile or email confirms ownership of the registration.",
  },
  {
    name: "Verification summary",
    text: "You receive a clear summary of what the record shows, plus next steps if anything is incorrect.",
  },
];

export const BLOCKS: RichBlock[] = [
  { type: "h2", text: "Why verify a Udyam certificate?" },
  {
    type: "ul",
    items: [
      "Confirm a supplier or vendor genuinely holds MSME status before allowing MSME benefits.",
      "Support a bank loan, subsidy or tender application that requires proof of registration.",
      "Check that your own enterprise details are recorded correctly after registration or an update.",
      "Detect an outdated Udyog Aadhaar that was never migrated to Udyam.",
    ],
  },
  { type: "h2", text: "How verification works" },
  { type: "ol", items: STEPS.map((s) => `${s.name}: ${s.text}`) },
  { type: "h2", text: "What you need" },
  {
    type: "ul",
    items: [
      "The Udyam Registration Number (URN) from the certificate.",
      "Access to the mobile number or email registered with the Udyam application, when OTP confirmation is needed.",
      "The enterprise name as printed on the certificate, for cross-checking.",
    ],
  },
  {
    type: "note",
    text: "Business Help Services is an independent private consultancy. We assist business owners with verification support and are not affiliated with any government department.",
  },
  { type: "h2", text: "Frequently Asked Questions" },
  { type: "faq", items: FAQS },
];

export const Route = createFileRoute("/verify-udyam-certificate")({
  loader: async () => ({
    cms: await getContentfulServicePage({
      data: { slug: "verify-udyam-certificate" },
    }).catch(() => null),
  }),
  head: ({ loaderData }) => {
    const cms = (loaderData as { cms: ContentfulServicePage | null } | undefined)?.cms;
    return {
      meta: [
        { title: cms?.metaTitle || TITLE },
        { name: "description", content: cms?.metaDescription || DESC },
        { property: "og:title", content: cms?.metaTitle || TITLE },
        { property: "og:description", content: cms?.metaDescription || DESC },
        { property: "og:type", content: "website" },
        { property: "og:url", content: URL },
      ],
      links: [{ rel: "canonical", href: URL }],
      scripts: [
        jsonLdScript(
          serviceSchema({
            name: "Verify Udyam Certificate",
            url: URL,
            description: DESC,
          }),
        ),
        jsonLdScript(
          howToSchema({
            name: "How to verify a Udyam MSME certificate online",
            totalTime: "PT10M",
            steps: STEPS,
          }),
        ),
        jsonLdScript(faqSchema(FAQS)),
        jsonLdScript(
          breadcrumbSchema([
            { name: "Home", url: "https://udyamadhar.in/" },
            { name: "Verify Udyam Certificate", url: URL },
          ]),
        ),
      ],
    };
  },
  component: function VerifyUdyamPage() {
    const { cms } = Route.useLoaderData() as { cms: ContentfulServicePage | null };
    return (
      <RichServicePage
        serviceTitle={cms?.name || "Verify Udyam Certificate"}
        h1={cms?.name || "Verify Udyam Certificate — Check MSME Registration Details Online"}
        intro={
          cms?.shortDescription ||
          "Confirm that a Udyam (MSME) registration is genuine and that the details on the certificate match the official record."
        }
        longDescriptionHtml={cms?.longDescription}
        blocks={cms?.longDescription ? [] : BLOCKS}
      />
    );
  },
});
