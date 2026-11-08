import { UserSquare2, Fingerprint, Share2, Download, ArrowRight } from "lucide-react";
import mapImg from "@/assets/india-map.svg.asset.json";


const STEPS = [
  { icon: UserSquare2, label: "Fill Form & Make Payment", color: "text-brand-navy" },
  { icon: Fingerprint, label: "Submit Required Information", color: "text-brand-red" },
  { icon: Share2, label: "Expert Assistance & Verification", color: "text-brand-navy" },
  { icon: Download, label: "Updates Shared via Email", color: "text-green-600" },
];

const FACTS: [string, string][] = [
  ["Country", "India"],
  ["Area", "3,287,263 sq. km."],
  ["States", "28"],
  ["Population", "1,46,39,00,000"],
  ["Literacy", "80.9%"],
];

export function TrustBlock() {
  // Note: FAQPage JSON-LD intentionally NOT emitted here — every page that
  // mounts TrustBlock already declares its own FAQPage schema. Emitting a
  // second one triggers Google's "Duplicate field FAQPage" warning.



  return (
    <div>
      {/* Process Steps */}
      <section className="bg-brand-navy/10">
        <div className="mx-auto max-w-6xl px-4 py-10 md:py-12">
          <h2 className="text-center text-2xl md:text-3xl font-bold font-display text-foreground">
            Udyam Assistance Process – Fast &amp; Simple
          </h2>

          <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-4 md:gap-4 items-start">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="relative flex flex-col items-center text-center">
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white shadow-md flex items-center justify-center">
                    <Icon className={`w-9 h-9 md:w-11 md:h-11 ${s.color}`} strokeWidth={2} />
                  </div>
                  <p className="mt-4 font-bold text-foreground text-sm md:text-base leading-snug max-w-[12ch]">
                    {s.label}
                  </p>
                  {i < STEPS.length - 1 && (
                    <ArrowRight
                      className="hidden md:block absolute top-10 -right-3 w-6 h-6 text-foreground"
                      strokeWidth={2.5}
                      aria-hidden
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* India Coverage */}
      <section className="mx-auto max-w-5xl px-4 py-10 md:py-12">
        <div className="rounded-lg border border-border overflow-hidden bg-card">
          <div className="bg-muted/40 px-6 py-5 border-b border-border">
            <h2 className="text-center text-2xl md:text-3xl font-bold font-display text-foreground">
              A Vision on India
            </h2>
          </div>
          <div className="p-4 md:p-6 flex justify-center">
            <img
              src={mapImg.url}
              alt="Map of India showing all states where consultancy services are provided"
              className="w-full max-w-xl h-auto"
              loading="lazy"
            />
          </div>
          <table className="w-full border-t border-border text-sm md:text-base">
            <tbody>
              {FACTS.map(([k, v]) => (
                <tr key={k} className="border-b border-border last:border-b-0">
                  <th
                    scope="row"
                    className="w-1/2 text-left font-normal text-foreground px-4 md:px-6 py-4 border-r border-border"
                  >
                    {k}
                  </th>
                  <td className="px-4 md:px-6 py-4 text-foreground">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
