import { createFileRoute } from "@tanstack/react-router";
import { ContactPage } from "@/components/site/ContactPage";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Us — Business Help Services" },
      { name: "description", content: "Get in touch with Business Help Services for Udyam registration, MSME certificate updates, downloads and Udyog Aadhaar migration support — phone, email and office address." },
      { property: "og:title", content: "Contact Us — Business Help Services" },
      { property: "og:description", content: "Talk to our consultants about Udyam registration, MSME certificate help and Udyog Aadhaar migration — phone, email and office details." },
    ],

    links: [
      { rel: "canonical", href: "https://udyamadhar.in/contact" },
    ],
  }),
  component: ContactPage,
});
