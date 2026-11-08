#!/usr/bin/env node
/**
 * Email & Support System Diagnostic Script
 * Helps verify that help@businesshelpservices.com inbox polling and ticket creation is working.
 * 
 * Usage: npx tsx src/lib/mail/diagnostic.ts
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkEnvVars() {
  console.log("\n📋 Checking Zoho Mail Configuration...");
  const required = [
    "ZOHO_MAIL_REFRESH_TOKEN",
    "ZOHO_MAIL_CLIENT_ID",
    "ZOHO_MAIL_CLIENT_SECRET",
  ];

  const optional = [
    "ZOHO_MAIL_DC",
    "ZOHO_FROM_EMAIL",
    "ZOHO_MAIL_ACCOUNT_ID",
  ];

  for (const key of required) {
    const has = Boolean(process.env[key]);
    console.log(`  ${has ? "✅" : "❌"} ${key}: ${has ? "configured" : "MISSING"}`);
  }

  console.log("\n  Optional:");
  for (const key of optional) {
    const val = process.env[key];
    console.log(`  ${val ? "✅" : "⚠️"} ${key}: ${val ? val.slice(0, 20) + "..." : "not set"}`);
  }
}

async function checkDatabase() {
  console.log("\n📊 Database Tables...");

  const tables = [
    "email_queue",
    "email_logs",
    "email_templates",
    "smtp_settings",
    "support_tickets",
    "ticket_replies",
    "inbound_email_quarantine",
  ];

  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });

    if (error) {
      console.log(`  ❌ ${table}: ${error.message}`);
    } else {
      console.log(`  ✅ ${table}: ${count} rows`);
    }
  }
}

async function checkEmailStats() {
  console.log("\n📧 Email Statistics...");

  // Incoming emails
  const { count: incomingCount } = await supabase
    .from("email_logs")
    .select("*", { count: "exact", head: true })
    .eq("direction", "incoming");

  console.log(`  ✅ Incoming emails: ${incomingCount}`);

  // Recent 24 hours
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recent24h } = await supabase
    .from("email_logs")
    .select("*", { count: "exact", head: true })
    .eq("direction", "incoming")
    .gte("received_at", since24h);

  console.log(`  ✅ Last 24 hours: ${recent24h}`);

  // Email statuses
  const { data: byStatus } = await supabase
    .from("email_logs")
    .select("status");

  const statusCounts = {} as Record<string, number>;
  (byStatus ?? []).forEach((log: any) => {
    const s = log.status || "unknown";
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  });

  console.log("  By status:");
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`    ${status}: ${count}`);
  }

  // Quarantine
  const { count: quarantined } = await supabase
    .from("inbound_email_quarantine")
    .select("*", { count: "exact", head: true });

  console.log(`  ⚠️ Quarantined: ${quarantined}`);
}

async function checkTickets() {
  console.log("\n🎫 Support Tickets...");

  const { count: totalTickets } = await supabase
    .from("support_tickets")
    .select("*", { count: "exact", head: true });

  console.log(`  ✅ Total tickets: ${totalTickets}`);

  // By status
  const { data: byStatus } = await supabase
    .from("support_tickets")
    .select("status");

  const statusCounts = {} as Record<string, number>;
  (byStatus ?? []).forEach((t: any) => {
    const s = t.status || "unknown";
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  });

  console.log("  By status:");
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`    ${status}: ${count}`);
  }

  // Recent ticket
  const { data: recent } = await supabase
    .from("support_tickets")
    .select("id, ticket_number, subject, created_at")
    .order("created_at", { ascending: false })
    .limit(1);

  if (recent?.length) {
    const t = recent[0];
    console.log(
      `  📍 Most recent: ${t.ticket_number} - "${t.subject}" (${new Date(t.created_at).toLocaleString()})`
    );
  }
}

async function checkRecentActivity() {
  console.log("\n⏰ Recent Activity (Last 24 Hours)...");

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Last emails
  const { data: emails } = await supabase
    .from("email_logs")
    .select("id, from_email, subject, received_at")
    .eq("direction", "incoming")
    .gte("received_at", since)
    .order("received_at", { ascending: false })
    .limit(5);

  if (emails?.length) {
    console.log("  Recent incoming emails:");
    emails.forEach((e: any) => {
      const time = new Date(e.received_at).toLocaleTimeString();
      console.log(`    📨 ${time} - ${e.from_email}: "${e.subject}"`);
    });
  } else {
    console.log("  ℹ️ No incoming emails in the last 24 hours");
  }

  // Last tickets
  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("id, ticket_number, subject, created_at, status")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5);

  if (tickets?.length) {
    console.log("\n  Recent tickets:");
    tickets.forEach((t: any) => {
      const time = new Date(t.created_at).toLocaleTimeString();
      console.log(`    🎫 ${time} - ${t.ticket_number} [${t.status}]: "${t.subject}"`);
    });
  } else {
    console.log("  ℹ️ No tickets created in the last 24 hours");
  }
}

async function checkSmtpSettings() {
  console.log("\n🔧 SMTP Settings...");

  const { data: settings, error } = await supabase
    .from("smtp_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    console.log(`  ⚠️ No SMTP settings found: ${error.message}`);
    return;
  }

  if (!settings?.length) {
    console.log("  ⚠️ No SMTP settings configured");
    return;
  }

  const s = settings[0];
  console.log(`  ✅ From Email: ${s.from_email}`);
  console.log(`  ✅ From Name: ${s.from_name}`);
  console.log(`  ✅ Reply-To: ${s.reply_to || "(not set)"}`);
  console.log(`  ${s.is_enabled ? "✅" : "❌"} Status: ${s.is_enabled ? "ENABLED" : "DISABLED"}`);
  console.log(`  📊 Daily Quota: ${s.daily_quota}`);
}

async function checkEmailQueue() {
  console.log("\n📬 Email Queue Status...");

  const statuses = ["queued", "sending", "sent", "failed", "dlq"];

  for (const status of statuses) {
    const { count } = await supabase
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", status);

    const icon =
      status === "queued"
        ? "⏳"
        : status === "sent"
          ? "✅"
          : status === "failed"
            ? "❌"
            : status === "dlq"
              ? "⚠️"
              : "⏳";

    console.log(`  ${icon} ${status}: ${count}`);
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("📬 Email & Support System Diagnostic");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`Inbox: help@businesshelpservices.com`);
  console.log(`Timestamp: ${new Date().toLocaleString()}`);

  try {
    await checkEnvVars();
    await checkDatabase();
    await checkEmailStats();
    await checkTickets();
    await checkSmtpSettings();
    await checkEmailQueue();
    await checkRecentActivity();

    console.log("\n═══════════════════════════════════════════════════════");
    console.log("✅ Diagnostic Complete");
    console.log("\n📌 Next Steps:");
    console.log("  1. Visit /admin/inbox-management to manage emails & tickets");
    console.log("  2. Click 'Poll Now' to manually fetch emails from Zoho inbox");
    console.log("  3. Check the 'Statistics' tab to verify email ingestion");
    console.log("  4. Review 'Quarantine' tab for unmatched emails");
    console.log("\n💡 Automatic polling runs every 2 minutes via cron");
  } catch (err) {
    console.error("\n❌ Diagnostic failed:", err);
    process.exit(1);
  }
}

main();
