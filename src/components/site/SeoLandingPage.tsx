import { useRouterState } from "@tanstack/react-router";
import { LeadForm } from "@/components/site/LeadForm";
import { TrustBlock } from "@/components/site/TrustBlock";
import certImg from "@/assets/udyam-sample-certificate.png.asset.json";

const proseClasses =
  "p-6 md:p-8 space-y-4 text-foreground/85 text-[15px] leading-relaxed " +
  "[&_h1]:font-display [&_h1]:text-brand-navy-deep [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:first:mt-0 [&_h1]:text-center " +
  "[&_h2]:font-display [&_h2]:text-brand-navy-deep [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:first:mt-0 [&_h2]:text-center " +
  "[&_h2_a]:text-brand-navy-deep [&_h2_a]:no-underline hover:[&_h2_a]:underline " +
  "[&_h3]:font-display [&_h3]:text-foreground [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-5 " +
  "[&_h4]:font-display [&_h4]:text-foreground [&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-5 " +
  "[&_a]:text-brand-navy [&_a]:underline " +
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 " +
  "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1 " +
  "[&_img]:rounded-md [&_img]:border [&_img]:border-border [&_img]:my-3 [&_img]:max-w-full [&_img]:h-auto " +
  "[&_svg]:hidden " +
  "[&_p]:my-3 [&_strong]:text-foreground";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Strip duplicate content from imported WordPress HTML.
 * The React layout renders its own form header, content H1, descriptive link,
 * and Sample Certificate card. The WP HTML must contribute only the body copy.
 */
function sanitize(html: string, title: string): string {
  let out = html;
  // Remove all inline <style> and <script> blocks
  out = out.replace(/<style\b[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  // Remove all inline <svg>...</svg>
  out = out.replace(/<svg\b[\s\S]*?<\/svg>/gi, "");
  // Remove the duplicate "Sample Certificate" block (heading + lightbox anchor + caption)
  out = out.replace(
    /<h2[^>]*>\s*Sample Certificate\s*<\/h2>[\s\S]*?<\/a>\s*(?:<p[^>]*>[^<]*reference purposes only\.?[^<]*<\/p>)?/i,
    "",
  );
  // Remove the duplicate "Fill application" / form remnants near the top
  out = out.replace(/<h2[^>]*>\s*Fill application\s*<\/h2>/i, "");
  out = out.replace(/<p[^>]*role=["']status["'][^>]*>[\s\S]*?<\/p>/gi, "");
  out = out.replace(/<ul>\s*<\/ul>/gi, "");
  // Remove the "Click to Connect with Expert" leftover text label
  out = out.replace(/Click to Connect with Expert/gi, "");

  // Remove inline duplicate certificate images
  const dupImagePattern =
    /(udyam-aadhar\.jpe?g|udyam-certificate-design|udyam-certificate\.(?:png|jpe?g|webp))/i;
  out = out.replace(
    /<a\b[^>]*>\s*<img\b[^>]*src="[^"]*"[^>]*>\s*<\/a>/gi,
    (m) => (dupImagePattern.test(m) ? "" : m),
  );
  out = out.replace(
    /<figure\b[^>]*>[\s\S]*?<\/figure>/gi,
    (m) => (dupImagePattern.test(m) ? "" : m),
  );
  out = out.replace(
    /<img\b[^>]*src="[^"]*"[^>]*>/gi,
    (m) => (dupImagePattern.test(m) ? "" : m),
  );

  // Strip EVERY <h1> — we render our own content header from {title}
  out = out.replace(/<h1\b[^>]*>[\s\S]*?<\/h1\s*>/gi, "");

  // Strip <a href="/">...</a> wrappers that contained the now-removed <h1>
  out = out.replace(
    /<a\b[^>]*href=["']\/["'][^>]*>\s*<\/a>/gi,
    "",
  );

  // Strip the linked descriptive heading <h2><a href="/">...</a></h2> —
  // we render that ourselves with the correct same-page href.
  out = out.replace(
    /<h2\b[^>]*>\s*<a\b[^>]*href=["']\/["'][^>]*>[\s\S]*?<\/a>\s*<\/h2\s*>/gi,
    "",
  );

  // Strip the leading bare <h2>{title}</h2> the WP source put at the top
  const titleNorm = title.trim().toLowerCase();
  out = out.replace(/<h2\b[^>]*>\s*([\s\S]*?)\s*<\/h2\s*>/gi, (full, inner) => {
    if (/<a\b/i.test(inner)) return full;
    const txt = String(inner).replace(/<[^>]+>/g, "").trim().toLowerCase();
    return txt === titleNorm ? "" : full;
  });

  // Collapse runs of identical consecutive headings
  out = out.replace(
    /(<h([1-3])[^>]*>\s*([\s\S]*?)\s*<\/h\2>)(\s*<h\2[^>]*>\s*\3\s*<\/h\2>)+/gi,
    "$1",
  );

  // Strip any remaining imported SEO headings at the very start of the body.
  // We render the only intended H1 + linked H2 above the imported HTML.
  out = out.replace(/^\s*(?:<h[12]\b[^>]*>[\s\S]*?<\/h[12]\s*>\s*)+/i, "");

  // Replace "Business Help Services" mentions inside SEO body
  out = out.replace(/Business Help Services/gi, "Udyam Adhar");

  return out;
}

/**
 * SEO landing page layout: lead form + sample certificate on top, prose content below.
 * - `title` is the short page name used for both the form header and content H1.
 * - `linkTitle` is the descriptive heading rendered as an in-content link that
 *   stays on the same route (so clicking it does NOT bounce to the home form).
 */
export function SeoLandingPage({
  title,
  linkTitle,
  html,
  content,
}: {
  title: string;
  linkTitle?: string;
  html: string;
  content?: string;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const cleanHtml = sanitize(html, title);
  const descriptive = linkTitle ?? title;

  return (
    <div>
      <section className="mx-auto max-w-7xl px-4 py-6 md:py-8 grid gap-6 lg:grid-cols-2 items-start">
        <LeadForm title={title} />

        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="bg-form-header text-white text-center py-4">
            <h2 className="text-xl font-bold font-display">Sample Certificate</h2>
          </div>
          <div className="p-6">
            <img
              src={certImg.url}
              alt="Sample Udyam Adhar Certificate"
              className="w-full h-auto rounded-md border border-border"
              loading="eager"
              fetchPriority="high"
            />
            <p className="mt-3 text-center text-sm text-muted-foreground text-slate-950">
              Note: Sample Udyam Adhar Certificate shown for reference purposes only.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-10">
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className={proseClasses}>
            <h1>{title}</h1>
            <h2
              dangerouslySetInnerHTML={{
                __html: `<a href="${escapeHtml(pathname)}">${escapeHtml(descriptive)}</a>`,
              }}
            />
            {content
              ? content
                  .split(/\n{2,}/)
                  .map((p, i) => <p key={i}>{p.trim()}</p>)
              : null}
            {cleanHtml ? (
              <div dangerouslySetInnerHTML={{ __html: cleanHtml }} />
            ) : null}
          </div>
        </div>
      </section>

      <TrustBlock />
    </div>
  );
}
