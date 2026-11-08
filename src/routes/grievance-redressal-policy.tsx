import { createFileRoute } from "@tanstack/react-router";
import { WpPage } from "@/components/site/PageHero";
import html from "@/content/wp/grievance-redressal-policy.html?raw";

export const Route = createFileRoute("/grievance-redressal-policy")({
  head: () => ({
    meta: [
      { title: "Grievance Redressal Policy — Business Help Services" },
      { name: "description", content: "Complaint and grievance redressal policy for Business Help Services consultancy users." },
      { property: "og:title", content: "Grievance Redressal Policy" },
      { property: "og:description", content: "Complaint and grievance redressal policy from Business Help Services." },
    ],
    links: [{ rel: "canonical", href: "https://www.udyamadhar.in/grievance-redressal-policy" }],
  }),
  component: () => <WpPage title="Grievance Redressal Policy" html={html} legal />,
});