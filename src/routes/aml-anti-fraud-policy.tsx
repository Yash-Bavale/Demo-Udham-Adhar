import { createFileRoute } from "@tanstack/react-router";
import { WpPage } from "@/components/site/PageHero";
import html from "@/content/wp/aml-anti-fraud-policy.html?raw";

export const Route = createFileRoute("/aml-anti-fraud-policy")({
  head: () => ({
    meta: [
      { title: "AML / Anti-Fraud Policy — Business Help Services Consultancy" },
      { name: "description", content: "Anti-money laundering and anti-fraud policy for Business Help Services." },
      { property: "og:title", content: "AML / Anti-Fraud Policy" },
      { property: "og:description", content: "Read our AML and anti-fraud commitments." },
    ],
    links: [
      { rel: "canonical", href: "https://udyamadhar.in/aml-anti-fraud-policy" },
    ],
  }),
  component: () => <WpPage title="AML / Anti-Fraud Policy" html={html} legal />,
});
