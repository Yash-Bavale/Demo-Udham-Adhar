import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { RichServicePage, type RichBlock } from "@/components/site/RichServicePage";
import { getContentfulServicePage, type ContentfulServicePage } from "@/lib/contentful/client.functions";
import {
  jsonLdScript,
  faqSchema,
  breadcrumbSchema,
} from "@/lib/seo/jsonld";

export const URL = "https://udyamadhar.in/msme-registration-fee";
export const TITLE = "MSME Registration Fee — Government vs Consultancy Charges Explained";
export const DESC =
  "Is MSME (Udyam) registration free? Yes — government fee is ₹0. Understand the difference between official fees and private consultancy charges. Transparent pricing.";

export const FAQS = [
  {
    q: "Is Udyam / MSME registration really free on the government portal?",
    a: "Yes. The Ministry of MSME charges ₹0 for Udyam registration, updates, downloads and migrations on the official portal udyamregistration.gov.in. There is no government fee at any step.",
  },
  {
    q: "Then why do private consultancies charge a fee?",
    a: "Private consultancies like Business Help Services charge a professional service fee for time, document verification, NIC code guidance, application drafting, OTP coordination and delivery — not for the registration itself. This is similar to hiring a CA to file your tax return: the filing portal is free, but the professional service is paid.",
  },
  {
    q: "How much does Business Help Services charge?",
    a: "Our charges are flat fees per service and are published on the Pricing Transparency page. There are no hidden costs and no government fee component embedded in our pricing.",
  },
  {
    q: "Is it safe to pay a consultancy for Udyam registration?",
    a: "Yes, as long as the consultancy is transparent about being private and not government-affiliated. Always confirm: (1) the consultancy clearly states it is private, (2) pricing is published, (3) the consultancy never asks for your Aadhaar OTP outside of the official portal screens.",
  },
  {
    q: "What should I do if someone claims to be a government agent and demands a fee?",
    a: "The Ministry of MSME does not appoint individual agents to collect fees for Udyam. If anyone claims to be from the government and demands payment, treat it as a scam. The official portal is udyamregistration.gov.in and it does not charge.",
  },
];

export const BLOCKS: RichBlock[] = [
  { type: "h2", text: "Government MSME registration fee" },
  {
    type: "p",
    text: "The Government of India, through the Ministry of MSME, has made the Udyam (MSME) registration process completely free of cost on the official Udyam portal. There is no fee for new registration, updates, downloads or Udyog Aadhar migration. This is a deliberate policy to encourage small businesses to formalise.",
  },
  { type: "h2", text: "What you may be paying for — consultancy vs government" },
  {
    type: "table",
    headers: ["Item", "Charged by"],
    rows: [
      ["Udyam registration on the official portal", "Government — ₹0"],
      ["Certificate update on the official portal", "Government — ₹0"],
      ["Certificate download / reprint", "Government — ₹0"],
      ["Professional consultancy time", "Private firm (e.g., Business Help Services)"],
      ["Document verification & error correction", "Private firm"],
      ["NIC code advice & application drafting", "Private firm"],
      ["Coordination & email delivery of PDF", "Private firm"],
    ],
  },
  { type: "h2", text: "How Business Help Services prices its assistance" },
  {
    type: "ul",
    items: [
      "Flat per-service fees — published on our Pricing Transparency page.",
      "No hidden charges, no surprise add-ons.",
      "No government fee component (because there is none to pay).",
      "Refund policy clearly stated for cases where the work has not started.",
    ],
  },
  {
    type: "note",
    text: "Important: Business Help Services is a private consultancy. Our fee is for professional service only. The official Udyam portal at udyamregistration.gov.in does not charge any fee.",
  },
  { type: "h2", text: "Avoiding fake fee scams" },
  {
    type: "p",
    text: "Several websites and SMS scams falsely demand 'government registration fees' for Udyam. The Ministry of MSME has clarified multiple times that no government fee is payable. If any individual or website demands a 'government fee' and is unwilling to clarify whether the amount is a consultancy charge, do not pay.",
  },
  { type: "h2", text: "Frequently Asked Questions" },
  { type: "faq", items: FAQS },
];

export const Route = createFileRoute("/msme-registration-fee")({
  loader: async () => {
    const cms = await getContentfulServicePage({ data: { slug: "msme-registration-fee" } });
    return { cms };
  },
  head: ({ loaderData }) => {
    const cms = (loaderData as { cms: ContentfulServicePage | null } | undefined)?.cms;
    const title = cms?.metaTitle || TITLE;
    const desc = cms?.metaDescription || DESC;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:url", content: URL },
      ],
      links: [{ rel: "canonical", href: URL }],
      scripts: [
        jsonLdScript(faqSchema(FAQS)),
        jsonLdScript(
          breadcrumbSchema([
            { name: "Home", url: "https://udyamadhar.in/" },
            { name: "MSME Registration Fee", url: URL },
          ]),
        ),
      ],
    };
  },
  component: RouteView,
});

function RouteView() {
  const { cms } = useLoaderData({ from: "/msme-registration-fee" }) as {
    cms: ContentfulServicePage | null;
  };
  const intro =
    cms?.longDescription ||
    cms?.shortDescription ||
    "Udyam (MSME) registration on the official government portal is free. There is no government fee for new registration, updates, downloads, or Udyog Aadhar migration. This page explains what is genuinely free and what private consultancies — including Business Help Services — charge for.";
  const h1 = cms?.name || "MSME Registration Fee — What's Free, What's Paid";
  return <RichServicePage h1={h1} intro={intro} blocks={BLOCKS} />;
}
