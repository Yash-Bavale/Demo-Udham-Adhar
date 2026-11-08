import { LeadForm } from "@/components/site/LeadForm";
import { TrustBlock } from "@/components/site/TrustBlock";
import certImg from "@/assets/udyam-sample-certificate.png.asset.json";

export type RichBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "note"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "faq"; items: Array<{ q: string; a: string }> };

export interface RichServicePageProps {
  h1: string;
  intro: string; // TLDR text
  blocks?: RichBlock[];
  longDescriptionHtml?: string;
  /** Optional service slug; used for the LeadForm preselect. */
  serviceTitle?: string;
}

function Block({ b }: { b: RichBlock }) {
  switch (b.type) {
    case "p":
      return <p className="my-3 leading-relaxed">{b.text}</p>;
    case "h2":
      return (
        <h2 className="mt-8 font-display text-brand-navy-deep text-2xl font-bold">
          {b.text}
        </h2>
      );
    case "h3":
      return (
        <h3 className="mt-6 font-display text-foreground text-lg font-semibold">
          {b.text}
        </h3>
      );
    case "ul":
      return (
        <ul className="my-3 list-disc pl-6 space-y-1">
          {b.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="my-3 list-decimal pl-6 space-y-1">
          {b.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ol>
      );
    case "note":
      return (
        <aside className="my-4 rounded-md border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-950">
          {b.text}
        </aside>
      );
    case "table":
      return (
        <div className="my-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/60">
                {b.headers.map((h, i) => (
                  <th
                    key={i}
                    className="border border-border px-3 py-2 text-left font-semibold"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, ri) => (
                <tr key={ri} className="odd:bg-card even:bg-muted/20">
                  {row.map((c, ci) => (
                    <td key={ci} className="border border-border px-3 py-2 align-top">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "faq":
      return (
        <section className="my-6">
          {/* Visible HTML — answers must be in the DOM on load for crawlers & AI */}
          <dl className="space-y-4">
            {b.items.map((it, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-card p-4"
              >
                <dt className="font-display text-base font-semibold text-foreground">
                  {it.q}
                </dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-foreground/85">
                  {it.a}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      );
  }
}

export function RichServicePage({
  h1,
  intro,
  blocks = [],
  longDescriptionHtml,
  serviceTitle,
}: RichServicePageProps) {
  // Deduplicate intro if it's identical or redundant with h1
  const normH1 = (h1 ?? "").trim().toLowerCase();
  const normIntro = (intro ?? "").trim().toLowerCase();
  const showIntro = normIntro && normIntro !== normH1;

  // Deduplicate leading heading inside longDescriptionHtml if it duplicates h1
  let cleanHtml = longDescriptionHtml;
  if (cleanHtml && normH1) {
    cleanHtml = cleanHtml.replace(/^\s*<h[12][^>]*>(.*?)<\/h[12]>/i, (match, p1) => {
      const headingText = p1.replace(/<[^>]+>/g, "").trim().toLowerCase();
      if (headingText === normH1 || normH1.includes(headingText) || headingText.includes(normH1)) {
        return ""; // Strip redundant duplicate heading
      }
      return match;
    });
  }

  return (
    <div>
      <section className="mx-auto max-w-7xl px-4 py-6 md:py-8 grid gap-6 lg:grid-cols-2 items-start">
        <LeadForm title={serviceTitle} />
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="bg-form-header text-white text-center py-4">
            <h2 className="text-xl font-bold font-display">Sample Certificate</h2>
          </div>
          <div className="p-6">
            <img
              src={certImg.url}
              alt="Sample Udyam Certificate"
              className="w-full h-auto rounded-md border border-border"
              loading="eager"
              fetchPriority="high"
            />
            <p className="mt-3 text-center text-sm text-slate-950">
              Note: Sample Udyam Certificate shown for reference purposes only.
            </p>
          </div>
        </div>
      </section>

      <section className="w-full bg-white border-y border-border py-10 md:py-14 my-6">
        <div className="mx-auto max-w-7xl px-4 text-foreground/90 text-[15px]">
          {h1 && (
            <h1 className="font-display text-brand-navy-deep text-3xl md:text-4xl font-bold leading-tight">
              {h1}
            </h1>
          )}
          {showIntro && (
            <p className="mt-4 text-base leading-relaxed text-foreground/85">
              {intro}
            </p>
          )}
          {cleanHtml ? (
            <div
              className="space-y-4 text-foreground/90 text-[15px] [&_h1]:font-display [&_h1]:text-brand-navy-deep [&_h1]:text-3xl [&_h1]:md:text-4xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:mb-6 [&_h2]:font-display [&_h2]:text-brand-navy-deep [&_h2]:text-2xl [&_h2]:md:text-3xl [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-4 [&_h2]:pb-2 [&_h2]:border-b [&_h2]:border-border/50 [&_h3]:font-display [&_h3]:text-foreground [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-3 [&_h4]:font-display [&_h4]:text-foreground [&_h4]:text-lg [&_h4]:font-semibold [&_h4]:mt-4 [&_h4]:mb-2 [&_p]:my-3.5 [&_p]:leading-relaxed [&_p]:text-foreground/85 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-4 [&_ul]:space-y-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-4 [&_ol]:space-y-2 [&_a]:text-brand-navy [&_a]:font-medium [&_a]:underline [&_a]:hover:text-brand-navy-deep [&_strong]:font-semibold [&_strong]:text-foreground [&_blockquote]:border-l-4 [&_blockquote]:border-brand-navy [&_blockquote]:bg-muted/30 [&_blockquote]:p-4 [&_blockquote]:rounded-r-md [&_blockquote]:italic [&_blockquote]:my-4"
              dangerouslySetInnerHTML={{ __html: cleanHtml }}
            />
          ) : (
            <>
              {blocks.map((b, i) => (
                <Block key={i} b={b} />
              ))}
            </>
          )}
        </div>
      </section>

      <TrustBlock />
    </div>
  );
}
