import { createFileRoute } from "@tanstack/react-router";
import { WpPage } from "@/components/site/PageHero";
import html from "@/content/wp/cookie-policy.html?raw";

export const Route = createFileRoute("/cookie-policy")({
  head: () => ({
    meta: [
      { title: "Cookie Policy — Business Help Services Consultancy" },
      { name: "description", content: "How we use cookies and similar technologies on this website." },
      { property: "og:title", content: "Cookie Policy" },
      { property: "og:description", content: "Cookie policy for Business Help Services." },
    ],
    links: [
      { rel: "canonical", href: "https://udyamadhar.in/cookie-policy" },
    ],
  }),
  component: () => <WpPage title="Cookie Policy" html={html} legal />,
});
