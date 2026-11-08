import { createFileRoute } from "@tanstack/react-router";
import { WpPage } from "@/components/site/PageHero";
import html from "@/content/wp/disclaimer.html?raw";

export const Route = createFileRoute("/disclaimer")({
  head: () => ({
    meta: [
      { title: "Disclaimer — Business Help Services Consultancy" },
      { name: "description", content: "Disclaimer regarding the private consultancy services offered on this website." },
      { property: "og:title", content: "Disclaimer" },
      { property: "og:description", content: "Important disclaimer from Business Help Services." },
    ],
    links: [
      { rel: "canonical", href: "https://udyamadhar.in/disclaimer" },
    ],
  }),
  component: () => <WpPage title="Website Disclaimer" html={html} legal />,
});
