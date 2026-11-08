import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import faqIllustration from "@/assets/faq-illustration.png.asset.json";

export type HomeFaq = { q: string; a: string };

const PAGE_SIZE = 10;

export function HomeFaqSection({ faqs }: { faqs: HomeFaq[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(faqs.length / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, faqs.length);

  return (
    <section id="faqs" className="bg-brand-navy/5 scroll-mt-24">
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="grid gap-10 md:grid-cols-2 md:gap-12 md:items-start">
          {/* Illustration */}
          <div className="order-1 md:sticky md:top-24">
            <img
              src={faqIllustration.url}
              alt="Two people standing beside a large question mark, illustrating frequently asked questions about Udyam registration"
              className="w-full max-w-md mx-auto h-auto"
              loading="lazy"
              width={857}
              height={598}
            />
          </div>

          {/* Questions */}
          <div className="order-2">
            <h2 className="text-2xl md:text-3xl font-bold font-display text-foreground leading-tight">
              Frequently Asked Questions
            </h2>
            <p className="mt-3 text-xs md:text-sm tracking-widest uppercase text-muted-foreground">
              Udyam &amp; MSME Registration — Apply, Update, Download
            </p>

            <Accordion type="multiple" className="mt-6 divide-y divide-border">
              {faqs.map((f, i) => (
                <div key={`${i}-${f.q}`} hidden={i < start || i >= end}>
                  <AccordionItem value={`faq-${i}`} className="border-0">
                    <AccordionTrigger className="text-left text-base md:text-lg font-semibold font-display text-foreground hover:no-underline py-4">
                      {f.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-foreground/85 leading-relaxed text-sm md:text-base pb-5">
                      {f.a}
                    </AccordionContent>
                  </AccordionItem>
                </div>
              ))}
            </Accordion>

            {faqs.length > PAGE_SIZE && (
              <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                  </Button>
                  <Button
                    type="button"
                    className="bg-brand-navy text-white hover:bg-brand-navy-deep"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    Read more <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
