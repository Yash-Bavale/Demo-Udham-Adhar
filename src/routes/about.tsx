import { createFileRoute } from "@tanstack/react-router";
import { WpPage } from "@/components/site/PageHero";
import html from "@/content/wp/about-us.html?raw";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Business Help Services — Private Udyam Consultancy" },
      { name: "description", content: "About Business Help Services — an independent private consultancy assisting MSMEs with Udyam registration, updates and certificate downloads across India." },
      { property: "og:title", content: "About Business Help Services — Private Udyam Consultancy" },
      { property: "og:description", content: "Learn about Business Help Services, an independent Udyam & MSME consultancy assisting Indian entrepreneurs." },
      { property: "og:url", content: "https://udyamadhar.in/about" },
    ],
    links: [
      { rel: "canonical", href: "https://udyamadhar.in/about" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: "About Business Help Services",
          url: "https://udyamadhar.in/about",
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
