import { createFileRoute } from "@tanstack/react-router";
import { WpPage } from "@/components/site/PageHero";
import html from "@/content/wp/about-us.html?raw";

const TITLE = "About Our Udyam & MSME Consultancy Team — Business Help Services";
const DESC =
  "Meet the Business Help Services team — a private Udyam & MSME consultancy helping Indian entrepreneurs with registration, updates and certificate downloads.";

export const Route = createFileRoute("/about-us")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: "https://udyamadhar.in/about-us" },
    ],
    links: [{ rel: "canonical", href: "https://udyamadhar.in/about-us" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: TITLE,
          description: DESC,
          url: "https://udyamadhar.in/about-us",
          mainEntity: {
            "@type": "Organization",
            name: "Business Help Services",
            legalName: "Business Help Services",
            url: "https://udyamadhar.in",
          },
        }),
      },
    ],
  }),
  component: () => <WpPage title="About Us" html={html} />,
});
