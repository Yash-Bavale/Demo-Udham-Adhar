import { createClient, type SanityClient } from "@sanity/client";

export const SANITY_API_VERSION = "2024-01-01";
export const DEFAULT_SANITY_PROJECT_ID = "519jq1ws";
export const DEFAULT_SANITY_DATASET = "production";

/** Fallback host → dataset map, used when the website row has no config yet. */
const HOST_DATASETS: Record<string, string> = {
  "udyamadhar.in": "production",
  "udyamregistrations.in": "udyamregistrations",
};

type Creds = { projectId: string; dataset: string };

const clients = new Map<string, SanityClient>();

function getClient({ projectId, dataset }: Creds): SanityClient {
  const key = `${projectId}:${dataset}`;
  let client = clients.get(key);
  if (!client) {
    client = createClient({
      projectId,
      dataset,
      apiVersion: SANITY_API_VERSION,
      useCdn: true,
      perspective: "published",
      // The datasets require an authenticated read; fall back to the write
      // token (server-only) so a missing read token can never blank the site.
      token:
        process.env["SANITY_READ_TOKEN"] ||
        process.env["SANITY_WRITE_TOKEN"] ||
        undefined,
    });
    clients.set(key, client);
  }
  return client;
}

/**
 * Resolve the Sanity project + dataset for the current request host.
 * Falls back to the project defaults so a missing website row can never
 * blank the site.
 */
export async function resolveSanityCreds(request?: Request): Promise<Creds> {
  let projectId = process.env["SANITY_PROJECT_ID"] || DEFAULT_SANITY_PROJECT_ID;
  let dataset = DEFAULT_SANITY_DATASET;
  const host = request?.headers.get("host")?.toLowerCase().split(":")[0]?.replace(/^www\./, "") ?? "";
  if (host && HOST_DATASETS[host]) dataset = HOST_DATASETS[host];
  try {
    const { resolveCurrentWebsite } = await import("@/lib/websites/current-website.server");
    const site = (await resolveCurrentWebsite(request)) as unknown as {
      domain?: string | null;
      sanity_project_id?: string | null;
      sanity_dataset?: string | null;
    };
    if (site.sanity_project_id) projectId = site.sanity_project_id;
    if (site.sanity_dataset) dataset = site.sanity_dataset;
    else if (site.domain && HOST_DATASETS[site.domain.replace(/^www\./, "")]) {
      dataset = HOST_DATASETS[site.domain.replace(/^www\./, "")]!;
    }
  } catch {
    // ignore — use defaults
  }
  return { projectId, dataset };
}

const cache = new Map<string, { expiresAt: number; data: unknown }>();
const TTL_MS = 5 * 60 * 1000;

/**
 * Run a GROQ query for the current site. Serves the last good value when
 * Sanity is unreachable so a CMS outage can never blank a page.
 */
export async function sanityQuery<T>(
  request: Request | undefined,
  query: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const creds = await resolveSanityCreds(request);
  const cacheKey = `${creds.projectId}:${creds.dataset}:${query}:${JSON.stringify(params)}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.data as T;
  try {
    const data = await getClient(creds).fetch<T>(query, params);
    cache.set(cacheKey, { expiresAt: now + TTL_MS, data });
    return data;
  } catch (err) {
    if (cached) return cached.data as T;
    throw err;
  }
}
