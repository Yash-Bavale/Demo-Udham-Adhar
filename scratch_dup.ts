import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

async function run() {
  const { data: apps } = await admin
    .from("applications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  console.log("Latest 10 applications:", apps?.map(a => ({
    id: a.id,
    application_code: a.application_code,
    lead_id: a.lead_id,
    customer_id: a.customer_id,
    created_at: a.created_at,
    application_status: a.application_status
  })));

  const { data: leads } = await admin
    .from("leads")
    .select("*")
    .eq("mobile", "9822603934");

  console.log("Leads for 9822603934:", leads);

  const { data: payments } = await admin
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  console.log("Latest 10 payments:", payments?.map(p => ({
    id: p.id,
    lead_id: p.lead_id,
    application_id: p.application_id,
    status: p.status,
    amount: p.amount,
    gateway_name: p.gateway_name,
    transaction_id: p.transaction_id,
    created_at: p.created_at
  })));
}

run().catch(console.error);
