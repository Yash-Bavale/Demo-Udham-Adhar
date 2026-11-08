import { createFileRoute } from "@tanstack/react-router";
import { getContentfulServicePage, type ContentfulServicePage } from "@/lib/contentful/client.functions";
import { RichServicePage, type RichBlock } from "@/components/site/RichServicePage";
import {
  jsonLdScript,
  serviceSchema,
  faqSchema,
  howToSchema,
  breadcrumbSchema,
} from "@/lib/seo/jsonld";

export const URL = "https://udyamadhar.in/new-udyam-registration";
export const TITLE = "New Udyam Registration Online | MSME Certificate Assistance";
export const DESC =
  "Apply for new Udyam (MSME) registration with professional consultancy assistance. Eligibility, documents, fees and timelines explained. Private service — pan-India.";

export const FAQS = [
  {
    q: "Is new Udyam registration mandatory for my business?",
    a: "It is not legally mandatory, but it is strongly recommended for any business that qualifies as an MSME. Without Udyam registration, you cannot avail MSME-specific benefits such as collateral-free loans, government tender participation, subsidies and protection under the MSMED Act for delayed payments.",
  },
  {
    q: "Can I register for Udyam if I do not have a GST number?",
    a: "Yes. GST is not mandatory for businesses below the GST threshold. For such businesses, Udyam registration is done using PAN and Aadhaar alone. If your business is required to have GST under the GST Act, then your GSTIN must match the PAN provided in your Udyam application.",
  },
  {
    q: "What is the validity of a Udyam registration certificate?",
    a: "The Udyam certificate is valid for the lifetime of the business and does not require renewal. However, if your investment or turnover changes such that your enterprise category changes (for example, from Micro to Small), the system updates this automatically based on annual data from GST and Income Tax filings.",
  },
  {
    q: "What if my Aadhaar mobile number is not active?",
    a: "Aadhaar OTP is mandatory for the registration process. If your registered mobile number is inactive, you must first update it at the nearest Aadhaar enrolment centre before proceeding. Our team can guide you through this prerequisite step.",
  },
  {
    q: "How does Business Help Services assist with new registration?",
    a: "We collect your documents, verify them for mismatches, file the application on your behalf, handle the OTP coordination with you and deliver the digitally signed Udyam certificate to your email. Our consultancy fee covers professional time and is separate from any government cost (which is zero for Udyam).",
  },
];

export const STEPS = [
  {
    name: "Eligibility & document review",
    text: "Our team checks your business type, Aadhaar, PAN and bank details to confirm MSME eligibility and identify any document mismatches.",
  },
  {
    name: "Application drafting",
    text: "We capture business activity (NIC code), investment, turnover and address details accurately to avoid rejection.",
  },
  {
    name: "OTP-based submission",
    text: "We coordinate the Aadhaar-OTP step with the registered mobile holder and submit the application on the official portal.",
  },
  {
    name: "Certificate delivery",
    text: "The digitally signed Udyam certificate is shared with you via email, typically within 1 to 2 business days of full document submission.",
  },
];

export const BLOCKS: RichBlock[] = [
  { type: "h2", text: "Who needs new Udyam registration?" },
  {
    type: "p",
    text: "New Udyam registration is meant for any business — sole proprietorship, partnership, LLP, private limited or HUF — that has never been registered under Udyam or Udyog Aadhar before and qualifies as a Micro, Small, or Medium Enterprise under the Ministry of MSME's investment and turnover thresholds.",
  },
  { type: "h2", text: "Documents required" },
  {
    type: "ul",
    items: [
      "Aadhaar card of the proprietor / authorised signatory (with active mobile linked for OTP).",
      "PAN card of the business (or proprietor for sole proprietorships).",
      "Bank account details — account number, IFSC.",
      "Business address proof, GSTIN (if applicable) and NIC code for primary activity.",
    ],
  },
  { type: "h2", text: "Step-by-step process we handle for you" },
  { type: "ol", items: STEPS.map((s) => `${s.name}: ${s.text}`) },
  { type: "h2", text: "Fees & timeline" },
  {
    type: "p",
    text: "Government fee for Udyam registration is ₹0. Our professional consultancy fee is a flat charge published on the Pricing Transparency page. Most applications are completed within 1 to 2 business days from receipt of all verified documents.",
  },
  {
    type: "note",
    text: "We are a private consultancy. We do not represent the Government of India. Any fee we collect is for professional service only and is not paid to the government.",
  },
  { type: "h2", text: "Frequently Asked Questions" },
  { type: "faq", items: FAQS },
];

export const Route = createFileRoute("/new-udyam-registration")({
  loader: async () => ({ cms: await getContentfulServicePage({ data: { slug: "new-udyam-registration" } }) }),
  head: ({ loaderData }) => {
    const cms = (loaderData as { cms: ContentfulServicePage | null } | undefined)?.cms;
    return {
      meta: [
        { title: cms?.metaTitle || TITLE },
        { name: "description", content: cms?.metaDescription || DESC },
        { property: "og:title", content: cms?.metaTitle || TITLE },
        { property: "og:description", content: cms?.metaDescription || DESC },
        { property: "og:url", content: URL },
      ],
      links: [{ rel: "canonical", href: URL }],
      scripts: [
        jsonLdScript(
          serviceSchema({
            name: "New Udyam Registration",
            url: URL,
            description: DESC,
          }),
        ),
        jsonLdScript(
          howToSchema({
            name: "How to register for Udyam (MSME) — step by step",
            totalTime: "P2D",
            steps: STEPS,
          }),
        ),
        jsonLdScript(faqSchema(FAQS)),
        jsonLdScript(
          breadcrumbSchema([
            { name: "Home", url: "https://udyamadhar.in/" },
            { name: "New Udyam Registration", url: URL },
          ]),
        ),
      ],
    };
  },
  component: function NewUdyamPage() {
    const { cms } = Route.useLoaderData() as { cms: ContentfulServicePage | null };
    return (
      <RichServicePage
        serviceTitle={cms?.name || "Udyam New Registration"}
        h1={cms?.name || "New Udyam Registration — Online MSME Certificate Application"}
        intro={cms?.shortDescription || ""}
        longDescriptionHtml={cms?.longDescription}
        blocks={cms?.longDescription ? [] : BLOCKS}
      />
    );
  },
});
