import { DISCLAIMER_TEXT } from "@/lib/constants";
import { useBrand } from "@/lib/websites/brand-context";
import { useBlock } from "@/lib/websites/site-content-context";

export function DisclaimerBar() {
  const brand = useBrand();
  const block = useBlock<{ text?: string } | null>("disclaimer.bar", null);
  const text = block?.text || DISCLAIMER_TEXT;
  return (
    <div className="overflow-hidden">
      {/* Prominent static disclaimer — kept in DOM (sr-only) for crawlers / SEO */}
      <div className="sr-only" aria-hidden="false">
        <strong>Disclaimer:</strong> {brand.legalFooterLine}
      </div>
      {/* Existing marquee strip retained */}
      <div className="bg-[#31547d] text-white">
        <div className="marquee-track py-2 text-xs md:text-sm font-medium">
          <span className="px-12">{text}</span>
          <span className="px-12">{text}</span>
        </div>
      </div>
    </div>
  );
}
