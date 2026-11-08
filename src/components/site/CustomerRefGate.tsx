/**
 * Customer pages show a random id in the address bar instead of the order code.
 * The gate maps the URL id to the order code for the page (via context) and,
 * when a page is opened with an order code, swaps the address bar to the
 * random id as soon as the browser proves it holds a valid link.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { customerRefForCode, resolveCustomerRef } from "@/lib/security/customer-access.functions";
import { captureAccessToken, pickAccessToken } from "@/lib/security/customer-access-browser";

const LeadCodeCtx = createContext<string>("");
export const useCustomerLeadCode = () => useContext(LeadCodeCtx);

const REF_RE = /^[a-f0-9]{32}$/;
const CODE_RE = /^[A-Za-z]{2}-\d{4}-\d{6}$/;
const cacheKey = (code: string) => `bhs_ref:${code.toUpperCase()}`;
const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

function swapUrl(from: string, to: string) {
  const { pathname, search, hash } = window.location;
  const next = pathname.replace(encodeURIComponent(from), to).replace(from, to);
  if (next !== pathname) window.history.replaceState(window.history.state, "", next + search + hash);
}

export function CustomerRefGate({ children }: { children: ReactNode }) {
  const { leadCode: param = "" } = useParams({ strict: false }) as { leadCode?: string };
  const isRef = REF_RE.test(param);
  const [code, setCode] = useState<string | null>(isRef ? null : param);
  const resolve = useServerFn(resolveCustomerRef);
  const refFor = useServerFn(customerRefForCode);

  // Opened with a random id: look up the order code.
  useEffect(() => {
    if (!isRef) {
      setCode(param);
      return;
    }
    let live = true;
    setCode(null);
    resolve({ data: { ref: param } })
      .then((r) => {
        if (!live) return;
        if (r.leadCode) {
          try { sessionStorage.setItem(cacheKey(r.leadCode), param); } catch { /* ignore */ }
        }
        setCode(r.leadCode ?? "XX-0000-000000");
      })
      .catch(() => live && setCode("XX-0000-000000"));
    return () => { live = false; };
  }, [param, isRef, resolve]);

  // Opened with an order code: hide it behind the random id.
  useIso(() => {
    if (isRef || !CODE_RE.test(param) || typeof window === "undefined") return;
    let cached: string | null = null;
    try { cached = sessionStorage.getItem(cacheKey(param)); } catch { /* ignore */ }
    if (cached) { swapUrl(param, cached); return; }
    captureAccessToken(param);
    const token = pickAccessToken(param, ["ob", "co"]);
    if (!token) return;
    refFor({ data: { leadCode: param, accessToken: token } })
      .then((r) => {
        if (!r.ref) return;
        try { sessionStorage.setItem(cacheKey(param), r.ref); } catch { /* ignore */ }
        swapUrl(param, r.ref);
      })
      .catch(() => {});
  }, [param, isRef, refFor]);

  if (!code) {
    return <div className="mx-auto max-w-xl px-4 py-20 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  return <LeadCodeCtx.Provider value={code}>{children}</LeadCodeCtx.Provider>;
}
