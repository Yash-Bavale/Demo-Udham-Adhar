import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { exchangeOnboardingAccess } from "@/lib/security/customer-access.functions";
import {
  captureAccessToken,
  readAccessToken,
  storeAccessToken,
} from "@/lib/security/customer-access-browser";

/**
 * Onboarding access token for this browser: `undefined` while resolving,
 * `null` when the customer has no valid link. A paid customer holding only a
 * checkout token gets it exchanged server-side for an onboarding token.
 */
export function useOnboardingAccess(leadCode: string): string | null | undefined {
  const exchange = useServerFn(exchangeOnboardingAccess);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    captureAccessToken(leadCode);
    const ob = readAccessToken(leadCode, "ob");
    if (ob) {
      setToken(ob);
      return;
    }
    const co = readAccessToken(leadCode, "co");
    if (!co) {
      setToken(null);
      return;
    }
    exchange({ data: { leadCode, accessToken: co } })
      .then((r) => {
        if (cancelled) return;
        if (r.ok && r.accessToken) {
          storeAccessToken(leadCode, r.accessToken);
          setToken(r.accessToken);
        } else setToken(null);
      })
      .catch(() => !cancelled && setToken(null));
    return () => {
      cancelled = true;
    };
  }, [leadCode, exchange]);
  return token;
}
