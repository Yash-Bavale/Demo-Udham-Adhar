// Admin-only trigger to poll Zoho inbox on demand.
// Same worker path the pg_cron job hits every 2 min — this is for staff to
// force a run from the Quarantine screen (useful for demos & debugging why a
// reply hasn't shown up yet).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const pollInboxNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Only admin / super_admin may trigger a manual poll.
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const rows = (roles ?? []) as Array<{ role: string }>;
    const isAdmin = rows.some((r) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) throw new Error("Forbidden");

    const { pollZohoInbox } = await import("@/lib/mail/inbox-matcher.server");
    const result = await pollZohoInbox({ limit: 50 });
    return {
      fetched: result.fetched,
      new: result.new,
      matched: result.matched,
      unmatched: result.unmatched,
      duplicates: result.duplicates,
      errors: result.errors,
      foldersScanned: result.foldersScanned,
    };
  });
