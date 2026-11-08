import { createFileRoute } from "@tanstack/react-router";

/**
 * Dynamic robots.txt — served with the correct Sitemap URL for each domain.
 * Both udyamadhar.in and udyamregistrations.in get full crawl access for all
 * major bots (search engines, AI crawlers, social, SEO tools, monitoring).
 */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Detect the domain from the incoming request so Sitemap: points at the
        // correct host regardless of which site is serving this request.
        const url = new URL(request.url);
        const origin = `${url.protocol}//${url.host}`;

        const body = `# Allow All Search Engines

User-agent: Googlebot
Allow: /

User-agent: Googlebot-Image
Allow: /

User-agent: Googlebot-News
Allow: /

User-agent: Googlebot-Video
Allow: /

User-agent: GoogleOther
Allow: /

User-agent: Google-InspectionTool
Allow: /

User-agent: AdsBot-Google
Allow: /

User-agent: Mediapartners-Google
Allow: /

User-agent: Bingbot
Allow: /

User-agent: AdIdxBot
Allow: /

User-agent: DuckDuckBot
Allow: /

User-agent: Applebot
Allow: /

User-agent: YandexBot
Allow: /

User-agent: Baiduspider
Allow: /

User-agent: PetalBot
Allow: /

User-agent: SeznamBot
Allow: /

# OpenAI

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: GPTBot
Allow: /

# Anthropic

User-agent: ClaudeBot
Allow: /

User-agent: Claude-SearchBot
Allow: /

# Perplexity

User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

# Meta

User-agent: FacebookBot
Allow: /

User-agent: meta-externalagent
Allow: /

User-agent: meta-externalfetcher
Allow: /

# Social Media

User-agent: Twitterbot
Allow: /

User-agent: LinkedInBot
Allow: /

User-agent: Slackbot
Allow: /

User-agent: Discordbot
Allow: /

User-agent: WhatsApp
Allow: /

User-agent: TelegramBot
Allow: /

User-agent: Pinterestbot
Allow: /

# SEO Crawlers

User-agent: AhrefsBot
Allow: /

User-agent: SemrushBot
Allow: /

User-agent: DotBot
Allow: /

User-agent: MJ12bot
Allow: /

User-agent: Screaming Frog SEO Spider
Allow: /

# Monitoring

User-agent: UptimeRobot
Allow: /

User-agent: Pingdom
Allow: /

User-agent: Better Uptime Bot
Allow: /

User-agent: Lighthouse
Allow: /

User-agent: Google Page Speed Insights
Allow: /

# Block admin / internal paths from all crawlers

User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin-login
Disallow: /seo-admin
Disallow: /onboarding/
Disallow: /payment/
Disallow: /payment-pending/
Disallow: /payment-failed/
Disallow: /processing/
Disallow: /success/
Disallow: /apply/
Disallow: /email/

Sitemap: ${origin}/sitemap.xml
`;

        return new Response(body.trim(), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
