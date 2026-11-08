import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";

const ROUTES: Record<string, string> = {
  d: "/admin/dashboard",
  c: "/admin/customers",
  l: "/admin/leads",
  a: "/admin/applications",
  s: "/admin/services",
  e: "/admin/users",
  t: "/admin/complaints",
  f: "/admin/finance/gst",
};

/** Adds Linear-style "g {x}" navigation shortcuts and "?" help. Skipped while typing. */
export function useKeyboardShortcuts(openPalette: () => void, openHelp: () => void) {
  const navigate = useNavigate();
  const lastG = useRef(0);

  useEffect(() => {
    function isTyping(t: EventTarget | null) {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return;
      // ⌘K / Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        openHelp();
        return;
      }
      if (e.key.toLowerCase() === "g") {
        lastG.current = Date.now();
        return;
      }
      if (Date.now() - lastG.current < 1200) {
        const route = ROUTES[e.key.toLowerCase()];
        if (route) {
          e.preventDefault();
          lastG.current = 0;
          navigate({ to: route });
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, openPalette, openHelp]);
}
