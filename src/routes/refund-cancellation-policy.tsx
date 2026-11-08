import { createFileRoute } from "@tanstack/react-router";
import { WpPage } from "@/components/site/PageHero";
import html from "@/content/wp/refund-cancellation-policy.html?raw";

export const Route = createFileRoute("/refund-cancellation-policy")({
  head: () => ({
    meta: [
      { title: "Refund & Cancellation Policy — Business Help Services Consultancy" },
      { name: "description", content: "Refund and cancellation policy for Business Help Services consultancy services." },
      { property: "og:title", content: "Refund & Cancellation Policy" },
      { property: "og:description", content: "When and how refunds may be issued for consultancy fees." },
    ],
    links: [
      { rel: "canonical", href: "https://udyamadhar.in/refund-cancellation-policy" },
    ],
  }),
  component: () => <WpPage title="Refund & Cancellation Policy" html={html} />,
});
