/**
 * Browser-side storage for customer access tokens. Tokens arrive in the URL
 * fragment (#t=...), are moved into localStorage and removed from the address
 * bar immediately so analytics, history and referrers never see them.
 */
import { useEffect, useState } from "react";
import { parseTokenKind, type TokenKind } from "./customer-access-core";

const key = (leadCode: string, kind: TokenKind) => `bhs_at:${leadCode.toUpperCase()}:${kind}`;

export function storeAccessToken(leadCode: string, token: string | null | undefined): void {
  const kind = parseTokenKind(token);
  if (!kind || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(leadCode, kind), token as string);
  } catch {
    /* storage disabled */
  }
}

/** Move a #t= fragment token into storage and strip it from the URL. */
export function captureAccessToken(leadCode: string): void {
  if (typeof window === "undefined") return;
  const hash = window.location.hash || "";
  const m = hash.match(/[#&]t=([A-Za-z0-9_-]+)/);
  if (!m) return;
  storeAccessToken(leadCode, m[1]);
  const clean = window.location.pathname + window.location.search;
  window.history.replaceState(window.history.state, "", clean);
}

export function readAccessToken(leadCode: string, kind: TokenKind): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key(leadCode, kind));
  } catch {
    return null;
  }
}

/** Best token for a page: preferred kind first, then the other. */
export function pickAccessToken(leadCode: string, prefer: TokenKind[]): string | null {
  for (const k of prefer) {
    const t = readAccessToken(leadCode, k);
    if (t) return t;
  }
  return null;
}

/**
 * Hook: `undefined` until hydrated, then the token or `null`.
 * Captures a fragment token on first render.
 */
export function useAccessToken(leadCode: string, prefer: TokenKind[]): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const preferKey = prefer.join(",");
  useEffect(() => {
    captureAccessToken(leadCode);
    setToken(pickAccessToken(leadCode, prefer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadCode, preferKey]);
  return token;
}

/** Fire a conversion at most once per lead in this browser. */
export function markConversionOnce(leadCode: string): boolean {
  if (typeof window === "undefined") return false;
  const k = `bhs_conv:${leadCode.toUpperCase()}`;
  try {
    if (window.localStorage.getItem(k)) return false;
    window.localStorage.setItem(k, String(Date.now()));
  } catch {
    /* if storage is blocked, still allow once per page load */
  }
  return true;
}
