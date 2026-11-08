import { createFileRoute } from "@tanstack/react-router";
import { ComplaintFormPage } from "@/components/site/ComplaintFormPage";

export const Route = createFileRoute("/complaint-grievance-policy")({
  head: () => ({
    meta: [
      { title: "Raise a Complaint — Business Help Services" },
      { name: "description", content: "Submit a complaint or grievance to Business Help Services. Our team will review and respond within working hours." },
      { property: "og:title", content: "Raise a Complaint — Business Help Services" },
      { property: "og:description", content: "Submit a complaint or grievance to Business Help Services." },
    ],
    links: [
      { rel: "canonical", href: "https://udyamadhar.in/complaint-grievance-policy" },
    ],
  }),
  component: ComplaintFormPage,
});
