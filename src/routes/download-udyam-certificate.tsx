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

export const URL = "https://udyamadhar.in/download-udyam-certificate";
export const TITLE = "Download Udyam Certificate Online | MSME Certificate";
export const DESC =
  "Download your Udyam (MSME) certificate online with URN or Aadhaar verification. Fast, secure assistance for misplaced or lost Udyam certificates.";

export const FAQS = [
  {
    q: "How can I download my Udyam certificate?",
    a: "You can download your Udyam certificate by providing your Udyam Registration Number (URN) and authenticating via OTP sent to your registered mobile number linked with Aadhaar.",
  },
  {
    q: "What if I forgot my Udyam Registration Number (URN)?",
    a: "If you lost or forgot your URN, our team can help retrieve your Udyam Registration Number using your registered Aadhaar, mobile number, or business details.",
  },
  {
    q: "What if my registered mobile number is no longer active?",
    a: "OTP verification requires an active Aadhaar-linked mobile number. If your mobile number has changed, our experts will assist you with the necessary steps to update your contact details first.",
  },
  {
    q: "Is there a fee for downloading the certificate?",
    a: "The government portal does not charge a download fee. Our fee covers professional consultancy and step-by-step assistance in retrieving, verifying, and delivering your official PDF certificate.",
  },
  {
    q: "How long does it take to receive the downloaded Udyam certificate?",
    a: "Once OTP verification is completed, your official digital Udyam certificate PDF is generated immediately and sent to your registered email address.",
  },
];

export const STEPS = [
  {
    name: "Submit details",
    text: "Provide your Udyam Registration Number (URN) or business details for identification.",
  },
  {
    name: "OTP Verification",
    text: "Coordinate the OTP sent to your Aadhaar-linked mobile number for identity verification.",
  },
  {
    name: "Certificate Retrieval",
    text: "We access and fetch your official Udyam Certificate PDF with complete annexures.",
  },
  {
    name: "Email Delivery",
    text: "Your verified Udyam Certificate is delivered directly to your inbox in high-resolution PDF format.",
  },
];

export const BLOCKS: RichBlock[] = [
  { type: "h2", text: "When do you need to download your Udyam certificate?" },
  {
    type: "ul",
    items: [
      "Misplaced or lost original Udyam Certificate PDF.",
      "Bank loan application, subsidy request, or statutory compliance submission.",
      "Government tender participation requiring verified MSME proof.",
      "Requirement for print copy with Annexure.",
    ],
  },
  { type: "h2", text: "How we assist with your Udyam certificate download" },
  { type: "ol", items: STEPS.map((s) => `${s.name}: ${s.text}`) },
  { type: "h2", text: "Requirements for Udyam Certificate Download" },
  {
    type: "ul",
    items: [
      "Udyam Registration Number (URN) or Registered Business Name.",
      "Aadhaar card details of the proprietor / authorized partner.",
      "Access to the registered mobile number / email for OTP verification.",
    ],
  },
  {
    type: "note",
    text: "Business Help Services is an independent private consultancy service. We assist with retrieval and download support for business owners.",
  },
  { type: "h2", text: "Frequently Asked Questions" },
  { type: "faq", items: FAQS },
];

export const Route = createFileRoute("/download-udyam-certificate")({
  loader: async () => ({ cms: await getContentfulServicePage({ data: { slug: "download-udyam-certificate" } }) }),
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
            name: "Download Udyam Certificate",
            url: URL,
            description: DESC,
          }),
        ),
        jsonLdScript(
          howToSchema({
            name: "How to download Udyam MSME Certificate online",
            totalTime: "PT10M",
            steps: STEPS,
          }),
        ),
        jsonLdScript(faqSchema(FAQS)),
        jsonLdScript(
          breadcrumbSchema([
            { name: "Home", url: "https://udyamadhar.in/" },
            { name: "Download Udyam Certificate", url: URL },
          ]),
        ),
      ],
    };
  },
  component: function DownloadUdyamPage() {
    const { cms } = Route.useLoaderData() as { cms: ContentfulServicePage | null };
    return (
      <RichServicePage
        serviceTitle={cms?.name || "Download Udyam Certificate"}
        h1={cms?.name || "Download Udyam Certificate — Online MSME Download & Retrieval Assistance"}
        intro={cms?.shortDescription || ""}
        longDescriptionHtml={cms?.longDescription}
        blocks={cms?.longDescription ? [] : BLOCKS}
      />
    );
  },
});
