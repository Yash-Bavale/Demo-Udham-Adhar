import { type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Header } from "./Header";
import { Nav } from "./Nav";
import { DisclaimerBar } from "./DisclaimerBar";
import { Footer } from "./Footer";
import { useBlock } from "@/lib/websites/site-content-context";

export function SiteShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });

  // Detect after-lead submission waiting pages & payment pages
  const isApplyOrPaymentPage =
    path.startsWith("/apply") ||
    path.startsWith("/payment") ||
    path.startsWith("/processing") ||
    path.startsWith("/onboarding") ||
    path.startsWith("/payment-pending") ||
    path.startsWith("/payment-failed");

  // Admin configurable block for waiting & payment pages ("checkout.disclaimer_footer")
  // Enabled by default (true). Can be toggled in Admin Panel -> Website Content / Settings.
  const checkoutBlock = useBlock<{ enabled?: boolean } | null>("checkout.disclaimer_footer", null);
  const checkoutPagesEnabled = checkoutBlock?.enabled ?? true;

  // Disclaimer is ALWAYS visible on main pages (!isApplyOrPaymentPage). On checkout/payment pages, controlled by checkoutPagesEnabled.
  const showDisclaimer = !isApplyOrPaymentPage || checkoutPagesEnabled;
  const showFooter = !isApplyOrPaymentPage || checkoutPagesEnabled;

  return (
    <div className="min-h-screen flex flex-col bg-background bg-[#194170]">
      <Header />
      <Nav />
      {showDisclaimer && <DisclaimerBar />}
      <main className="flex-1">{children}</main>
      {showFooter && <Footer />}
    </div>
  );
}
