import { createFileRoute } from "@tanstack/react-router";
import { getContentfulServicePage, type ContentfulServicePage } from "@/lib/contentful/client.functions";
import { RichServicePage } from "@/components/site/RichServicePage";
import { SeoLandingPage } from "@/components/site/SeoLandingPage";
import html from "@/content/wp/msme-registration-process.html?raw";

export const Route = createFileRoute("/other-problem")({
  loader: async () => ({ cms: await getContentfulServicePage({ data: { slug: "other-problem" } }) }),
  head: ({ loaderData }) => {
    const cms = (loaderData as { cms: ContentfulServicePage | null } | undefined)?.cms;
    return {
      meta: [
        { title: cms?.metaTitle || "Other Udyam Problems — Forgot OTP, Mobile, PAN/Aadhaar Issues" },
        { name: "description", content: cms?.metaDescription || "Help with forgotten registered mobile/email, PAN/Aadhaar name mismatch, and other Udyam Adhar issues." },
        { property: "og:title", content: cms?.metaTitle || "Other Udyam Adhar Problems" },
        { property: "og:description", content: cms?.metaDescription || "Get consultancy help for forgotten OTP, mobile/email recovery, PAN/Aadhaar corrections, and more." },
      ],
      links: [
        { rel: "canonical", href: "https://udyamadhar.in/other-problem" },
      ],
    };
  },
  component: function OtherProblemPage() {
    const { cms } = Route.useLoaderData() as { cms: ContentfulServicePage | null };
    if (cms?.longDescription) {
      return (
        <RichServicePage
          serviceTitle={cms.name || "Other Problem"}
          h1={cms.name}
          intro={cms.shortDescription || ""}
          longDescriptionHtml={cms.longDescription}
        />
      );
    }
    return <SeoLandingPage title="Other Problem" linkTitle="Udyog Aadhar Registration" html={html} />;
  },
});
