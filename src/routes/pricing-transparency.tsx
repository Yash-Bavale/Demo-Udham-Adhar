import { createFileRoute } from "@tanstack/react-router";
import { WpPage } from "@/components/site/PageHero";
import html from "@/content/wp/pricing-transparency.html?raw";

export const Route = createFileRoute("/pricing-transparency")({
  head: () => ({
    meta: [
      { title: "Pricing Transparency — Business Help Services Consultancy" },
      { name: "description", content: "Transparent pricing for our Business Help Services consultancy and assistance services." },
      { property: "og:title", content: "Pricing Transparency" },
      { property: "og:description", content: "How our consultancy fees are structured and disclosed." },
    ],
    links: [
      { rel: "canonical", href: "https://udyamadhar.in/pricing-transparency" },
    ],
  }),
  component: () => <WpPage title="Pricing Transparency" html={html} />,
});
