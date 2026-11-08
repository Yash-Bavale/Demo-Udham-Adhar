import { createFileRoute } from "@tanstack/react-router";
import { WpPage } from "@/components/site/PageHero";
import html from "@/content/wp/consent-acknowledgment.html?raw";

export const Route = createFileRoute("/consent-acknowledgment")({
  head: () => ({
    meta: [
      { title: "Consents & Acknowledgements — Business Help Services Consultancy" },
      { name: "description", content: "Consents and acknowledgements you provide when using Business Help Services for Business Help Services." },
      { property: "og:title", content: "Consents & Acknowledgements" },
      { property: "og:description", content: "Read the consents and acknowledgements that apply to using our services." },
    ],
    links: [
      { rel: "canonical", href: "https://udyamadhar.in/consent-acknowledgment" },
    ],
  }),
  component: () => <WpPage title="Consent & Acknowledgment" html={html} legal />,
});
