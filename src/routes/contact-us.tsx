import { createFileRoute } from "@tanstack/react-router";
import { ContactPage } from "@/components/site/ContactPage";

export const Route = createFileRoute("/contact-us")({
  head: () => ({
    meta: [
      { title: "Contact Us — Business Help Services Consultancy" },
      { name: "description", content: "Contact Business Help Services for Udyam and MSME consultancy assistance by email, phone, or contact form." },
      { property: "og:title", content: "Contact Us — Business Help Services" },
      { property: "og:description", content: "Reach Business Help Services for support with Udyam and MSME services." },
    ],
    links: [{ rel: "canonical", href: "https://www.udyamadhar.in/contact-us" }],
  }),
  component: ContactPage,
});