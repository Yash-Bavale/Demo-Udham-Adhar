import { createFileRoute } from "@tanstack/react-router";
import { WpPage } from "@/components/site/PageHero";
import html from "@/content/wp/notice.html?raw";

export const Route = createFileRoute("/notice")({
  head: () => ({
    meta: [
      { title: "Notice — Business Help Services Consultancy" },
      { name: "description", content: "Important notice and service information for Business Help Services consultancy users." },
      { property: "og:title", content: "Notice — Business Help Services" },
      { property: "og:description", content: "Important notice and service information from Business Help Services." },
    ],
    links: [{ rel: "canonical", href: "https://www.udyamadhar.in/notice" }],
  }),
  component: () => <WpPage title="Important Notice" html={html} />,
});