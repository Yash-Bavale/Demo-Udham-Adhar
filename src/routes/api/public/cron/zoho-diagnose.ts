// Diagnostic endpoint: probes Zoho OAuth + Mail API on both DCs and returns
// the raw error bodies so we can see exactly why the inbox poll is 401ing.
// Guarded by SUPABASE_PUBLISHABLE_KEY / CRON_SECRET like other cron routes.

import { createFileRoute } from "@tanstack/react-router";

async function probe(dc: "in" | "com" | "eu") {
  const accountsHost = `https://accounts.zoho.${dc}`;
  const mailHost = `https://mail.zoho.${dc}`;
  const out: Record<string, unknown> = { dc, accountsHost, mailHost };

  // 1) Refresh access token on this DC.
  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_MAIL_REFRESH_TOKEN ?? "",
    client_id: process.env.ZOHO_MAIL_CLIENT_ID ?? "",
    client_secret: process.env.ZOHO_MAIL_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
  });
  const tokRes = await fetch(`${accountsHost}/oauth/v2/token?${params.toString()}`, {
    method: "POST",
  });
  const tokBody = await tokRes.text();
  out.refresh = {
    status: tokRes.status,
    body: tokBody.slice(0, 300),
  };
  let accessToken: string | null = null;
  try {
    const parsed = JSON.parse(tokBody) as { access_token?: string; scope?: string };
    accessToken = parsed.access_token ?? null;
    (out.refresh as Record<string, unknown>).scope = parsed.scope;
    // token_prefix intentionally omitted — do not leak any portion of the access token.
  } catch {
    /* ignore */
  }
  if (!accessToken) return out;

  // 2) List accounts on this DC's Mail API using the token minted here.
  const accRes = await fetch(`${mailHost}/api/accounts`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const accBody = await accRes.text();
  out.accounts = {
    status: accRes.status,
    body_preview: accBody.slice(0, 400),
  };
  try {
    const parsed = JSON.parse(accBody) as {
      data?: Array<{ accountId?: string | number; primaryEmailAddress?: string; mailboxAddress?: string }>;
    };
    (out.accounts as Record<string, unknown>).accountIds = (parsed.data ?? []).map((a) => ({
      accountId: a.accountId,
      primaryEmailAddress: a.primaryEmailAddress,
      mailboxAddress: a.mailboxAddress,
    }));
  } catch {
    /* ignore */
  }

  return out;
}

export const Route = createFileRoute("/api/public/cron/zoho-diagnose")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey =
          request.headers.get("apikey") ||
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const expected = process.env.CRON_SECRET;
        if (!apikey || !expected || apikey !== expected) {
          return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const env = {
          ZOHO_MAIL_DC: process.env.ZOHO_MAIL_DC ?? null,
          ZOHO_MAIL_ACCOUNT_ID: process.env.ZOHO_MAIL_ACCOUNT_ID ?? null,
          has_ZOHO_MAIL_CLIENT_ID: Boolean(process.env.ZOHO_MAIL_CLIENT_ID),
          has_ZOHO_MAIL_CLIENT_SECRET: Boolean(process.env.ZOHO_MAIL_CLIENT_SECRET),
          has_ZOHO_MAIL_REFRESH_TOKEN: Boolean(process.env.ZOHO_MAIL_REFRESH_TOKEN),
        };

        const results: Record<string, unknown> = { env };
        for (const dc of ["in", "com", "eu"] as const) {
          try {
            results[dc] = await probe(dc);
          } catch (e) {
            results[dc] = { error: (e as Error).message };
          }
        }
        return Response.json({ ok: true, results });
      },
    },
  },
});
