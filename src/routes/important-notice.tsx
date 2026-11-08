import { createFileRoute } from "@tanstack/react-router";
import { WpPage } from "@/components/site/PageHero";
import html from "@/content/wp/notice.html?raw";

export const Route = createFileRoute("/important-notice")({
  head: () => ({
    meta: [
      { title: "Important Notice — Business Help Services Consultancy" },
      { name: "description", content: "Important notice and disclaimer regarding the consultancy services offered on this website." },
      { property: "og:title", content: "Important Notice" },
      { property: "og:description", content: "Important notice and disclaimer from Business Help Services." },
    ],
    links: [
      { rel: "canonical", href: "https://udyamadhar.in/important-notice" },
    ],
  }),
  component: () => <WpPage title="Important Notice" html={html} />,
});
