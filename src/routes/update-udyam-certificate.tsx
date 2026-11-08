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

export const URL = "https://udyamadhar.in/update-udyam-certificate";
export const TITLE = "Update Udyam Certificate Online | Edit MSME Details";
export const DESC =
  "Update your Udyam (MSME) certificate — change business name, address, NIC activity, bank or contact details. Professional consultancy assistance, pan-India.";

export const FAQS = [
  {
    q: "What details can I update on my Udyam certificate?",
    a: "You can update business name, registered address, additional activities (NIC codes), bank account, contact details, organisation type, investment and turnover. Every update is OTP-verified and reflected in a freshly signed certificate.",
  },
  {
    q: "What if my registered mobile number is no longer active?",
    a: "If the mobile linked to your Udyam (or to Aadhaar) is inactive, you cannot receive the OTP. Our team will guide you through the official process to update the Aadhaar mobile first, and then proceed with the Udyam edit.",
  },
  {
    q: "Is updating Udyam a paid government service?",
    a: "The government does not charge a fee for updates. Our charge is a professional consultancy fee for handling the documentation, OTP coordination, submission and certificate delivery.",
  },
  {
    q: "How long does an update take?",
    a: "Most updates are completed within 1 to 2 business days. Updates that involve mobile-number changes or Aadhaar correction can take longer because of the upstream dependencies.",
  },
  {
    q: "Will updating change my Udyam Registration Number (URN)?",
    a: "No. The URN remains the same for the lifetime of your business. Only the details on the certificate change, and a new digitally signed certificate is issued with the same URN.",
  },
];

export const STEPS = [
  {
    name: "Specify what you want to change",
    text: "Share the exact fields to be updated (e.g., new address, additional NIC code).",
  },
  {
    name: "Document verification",
    text: "Our team checks that the new details match your Aadhaar, PAN, GST and supporting proofs.",
  },
  {
    name: "Portal edit & OTP",
    text: "We submit the edit on the official portal and coordinate the OTP with your registered mobile/email.",
  },
  {
    name: "Updated certificate delivery",
    text: "The freshly signed Udyam certificate is emailed to you with the same URN.",
  },
];

export const BLOCKS: RichBlock[] = [
  { type: "h2", text: "When you should update your Udyam certificate" },
  {
    type: "ul",
    items: [
      "Business name change or rebrand.",
      "Shift of registered office address.",
      "Adding or removing a business activity (NIC code).",
      "Change of bank account.",
      "Change of contact mobile or email.",
      "Change of organisation type (e.g., proprietorship to LLP).",
    ],
  },
  { type: "h2", text: "How we handle your update" },
  { type: "ol", items: STEPS.map((s) => `${s.name}: ${s.text}`) },
  { type: "h2", text: "Documents you should keep ready" },
  {
    type: "ul",
    items: [
      "Existing Udyam certificate (or URN).",
      "Aadhaar of the registered proprietor / signatory.",
      "Proof of new detail being updated (e.g., new address proof).",
      "Active access to the registered mobile / email for OTP.",
    ],
  },
  {
    type: "note",
    text: "Government fee for updating the Udyam certificate is ₹0. We charge a transparent professional fee published on our Pricing Transparency page.",
  },
  { type: "h2", text: "Frequently Asked Questions" },
  { type: "faq", items: FAQS },
];

export const Route = createFileRoute("/update-udyam-certificate")({
  loader: async () => ({ cms: await getContentfulServicePage({ data: { slug: "update-udyam-certificate" } }) }),
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
            name: "Update Udyam Certificate",
            url: URL,
            description: DESC,
          }),
        ),
        jsonLdScript(
          howToSchema({
            name: "How to update Udyam (MSME) certificate details",
            totalTime: "P2D",
            steps: STEPS,
          }),
        ),
        jsonLdScript(faqSchema(FAQS)),
        jsonLdScript(
          breadcrumbSchema([
            { name: "Home", url: "https://udyamadhar.in/" },
            { name: "Update Udyam Certificate", url: URL },
          ]),
        ),
      ],
    };
  },
  component: function UpdateUdyamPage() {
    const { cms } = Route.useLoaderData() as { cms: ContentfulServicePage | null };
    return (
      <RichServicePage
        serviceTitle={cms?.name || "Update Udyam Certificate"}
        h1={cms?.name || "Update Udyam Certificate — Edit MSME Registration Details"}
        intro={cms?.shortDescription || ""}
        longDescriptionHtml={cms?.longDescription}
        blocks={cms?.longDescription ? [] : BLOCKS}
      />
    );
  },
});
