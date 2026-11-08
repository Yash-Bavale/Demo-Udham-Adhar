/**
 * Resolve the customer-facing order number (applications.application_code)
 * for a given lead. Retries briefly if the application row hasn't been
 * created yet (payment webhook race, etc.). Returns null if it still
 * cannot be found — callers MUST NOT fall back to lead_code for the
 * {{order_number}} variable in any customer email.
 */
export async function resolveApplicationCode(
  leadId: string,
  opts: { applicationId?: string | null; timeoutMs?: number; intervalMs?: number } = {},
): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const timeoutMs = opts.timeoutMs ?? 3000;
  const intervalMs = opts.intervalMs ?? 400;
  const deadline = Date.now() + timeoutMs;

  const readOnce = async (): Promise<string | null> => {
    if (opts.applicationId) {
      const { data } = await supabaseAdmin
        .from("applications")
        .select("application_code")
        .eq("id", opts.applicationId)
        .maybeSingle();
      const code = (data as any)?.application_code;
      if (code) return code as string;
    }
    const { data } = await supabaseAdmin
      .from("applications")
      .select("application_code")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return ((data as any)?.application_code as string | null) ?? null;
  };

  // First read is immediate; then poll until timeout.
  let code = await readOnce();
  while (!code && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    code = await readOnce();
  }
  return code;
}
