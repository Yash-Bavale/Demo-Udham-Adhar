import { supabaseAdmin } from "@/integrations/supabase/client.server";

let cachedId: string | null = null;

/**
 * Resolve the default website id (udyamadhar.in). Cached in-process for the
 * lifetime of the Worker instance. Falls back to first active website if the
 * default domain is missing (should not happen in production).
 */
export async function getDefaultWebsiteId(): Promise<string> {
  if (cachedId) return cachedId;
  const { data, error } = await supabaseAdmin
    .from("websites")
    .select("id")
    .eq("domain", "udyamadhar.in")
    .maybeSingle();
  if (error) throw error;
  if (data?.id) {
    cachedId = data.id;
    return data.id;
  }
  const { data: any, error: err2 } = await supabaseAdmin
    .from("websites")
    .select("id")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (err2) throw err2;
  if (!any?.id) throw new Error("No websites configured");
  cachedId = any.id;
  return any.id;
}

/**
 * Resolve a website id from an incoming Request's Host header. Falls back to
 * the default website when the host does not match any active website
 * (localhost, Lovable preview domains, etc.).
 */
export async function resolveWebsiteIdFromRequest(request: Request | undefined): Promise<string> {
  const host = request?.headers.get("host")?.toLowerCase().split(":")[0] ?? "";
  if (host) {
    const stripped = host.replace(/^www\./, "");
    const { data } = await supabaseAdmin
      .from("websites")
      .select("id")
      .eq("is_active", true)
      .in("domain", [host, stripped])
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return getDefaultWebsiteId();
}
