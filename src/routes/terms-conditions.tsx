import { createFileRoute } from "@tanstack/react-router";
import { WpPage } from "@/components/site/PageHero";
import html from "@/content/wp/terms-conditions.html?raw";

export const Route = createFileRoute("/terms-conditions")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Business Help Services Consultancy" },
      { name: "description", content: "Terms and conditions governing the use of Business Help Services consultancy services on this website." },
      { property: "og:title", content: "Terms & Conditions" },
      { property: "og:description", content: "Terms and conditions for Business Help Services." },
    ],
    links: [
      { rel: "canonical", href: "https://udyamadhar.in/terms-conditions" },
    ],
  }),
  component: () => <WpPage title="Terms & Conditions" html={html} />,
});
