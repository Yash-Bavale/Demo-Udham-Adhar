import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function debugData() {
  console.log("--- 1. Querying user_roles ---");
  const { data: roles, error: rErr } = await (supabaseAdmin as any)
    .from("user_roles")
    .select("user_id, role");
  console.log("Roles count:", roles?.length, "Error:", rErr);
  console.log("Sample roles:", roles?.slice(0, 5));

  const roleUserIds = (roles ?? []).map((r: any) => r.user_id);

  console.log("\n--- 2. Querying profiles for those user_ids ---");
  const { data: profiles, error: pErr } = await (supabaseAdmin as any)
    .from("profiles")
    .select("id, full_name, display_name, email, is_active, employment_status")
    .in("id", roleUserIds.length ? roleUserIds : ["00000000-0000-0000-0000-000000000000"]);
  console.log("Profiles found:", profiles?.length, "Error:", pErr);
  console.log("Sample profiles:", profiles?.slice(0, 5));

  console.log("\n--- 3. Querying all profiles ---");
  const { data: allProfiles, error: apErr } = await (supabaseAdmin as any)
    .from("profiles")
    .select("id, full_name, display_name, email, is_active, employment_status")
    .limit(10);
  console.log("All profiles count:", allProfiles?.length, "Error:", apErr);
  console.log("Sample all profiles:", allProfiles);
}

debugData().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
