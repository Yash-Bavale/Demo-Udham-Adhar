/**
 * Compatibility layer.
 *
 * Content now lives in Sanity (see `@/lib/sanity/client.functions`). This module
 * keeps the historical export names so every page, route and admin tool that
 * already imports them keeps working unchanged.
 */
export {
  getSanityFaqs as getContentfulFaqs,
  getSanityServicePage as getContentfulServicePage,
  getSanitySeoArticle as getContentfulSeoArticle,
  getSanityLandingPage as getContentfulLandingPage,
  listSanitySeoPages as listContentfulSeoPages,
  listSanitySeoSlugs as listContentfulSeoSlugs,
} from "@/lib/sanity/client.functions";

export type {
  SanityFaq as ContentfulFaq,
  SanityServicePage as ContentfulServicePage,
  SanitySeoArticle as ContentfulSeoArticle,
  SanityLandingPage as ContentfulLandingPage,
  SanitySeoPage as ContentfulSeoPage,
  SanitySeoSlug as ContentfulSeoSlug,
} from "@/lib/sanity/client.functions";
