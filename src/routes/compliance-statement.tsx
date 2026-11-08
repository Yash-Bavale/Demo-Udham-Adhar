import { createFileRoute } from "@tanstack/react-router";
import { WpPage } from "@/components/site/PageHero";
import html from "@/content/wp/compliance-statement.html?raw";

export const Route = createFileRoute("/compliance-statement")({
  head: () => ({
    meta: [
      { title: "Compliance Statement — Business Help Services Consultancy" },
      { name: "description", content: "Compliance statement for Business Help Services regarding Business Help Services consultancy." },
      { property: "og:title", content: "Compliance Statement" },
      { property: "og:description", content: "Read our compliance commitments and obligations." },
    ],
    links: [
      { rel: "canonical", href: "https://udyamadhar.in/compliance-statement" },
    ],
  }),
  component: () => <WpPage title="Compliance Statement" html={html} legal />,
});
