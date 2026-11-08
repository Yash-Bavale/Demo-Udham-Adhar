import { createFileRoute } from "@tanstack/react-router";
import { ComplaintFormPage } from "@/components/site/ComplaintFormPage";

export const Route = createFileRoute("/complaint")({
  head: () => ({
    meta: [
      { title: "File a Complaint — Business Help Services Consultancy" },
      { name: "description", content: "Raise a complaint or grievance about your Udyam / MSME registration application. Our team reviews every submission and responds on your registered mobile number." },
      { property: "og:title", content: "File a Complaint — Business Help Services" },
      { property: "og:description", content: "Raise a complaint or grievance about your Udyam / MSME registration. We review every submission and respond on your registered mobile number." },
      { property: "og:url", content: "https://udyamadhar.in/complaint" },
    ],
    links: [
      { rel: "canonical", href: "https://udyamadhar.in/complaint" },
    ],
  }),
  component: ComplaintFormPage,
});

