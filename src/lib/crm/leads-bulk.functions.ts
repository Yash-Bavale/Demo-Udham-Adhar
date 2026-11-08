import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { LEAD_STATUSES, type LeadStatus } from "./types";
import { isUserAdmin } from "@/lib/audit";


async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}


// ─────────────────────── helpers ───────────────────────

async function assertOps(userId: string) {
  const { data } = await (await getAdmin())
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin", "operations"]);
  if (!data || data.length === 0) throw new Error("Forbidden: ops access required.");
}

async function assertAdmin(userId: string) {
  const { data } = await (await getAdmin())
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"]);
  if (!data || data.length === 0) throw new Error("Forbidden: admin access required.");
}

async function logAudit(actorId: string, action: string, entityIds: string[], extra: Record<string, unknown> = {}) {
  await (await getAdmin()).from("audit_logs").insert({
    actor_id: actorId,
    entity_type: "lead",
    entity_id: entityIds.length === 1 ? entityIds[0] : `${entityIds.length} leads`,
    action,
    new_value: { ...extra, ids: entityIds.slice(0, 50) } as never,
  });
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─────────────────────── bulk status / assign / delete ───────────────────────

const IdsStatusInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(2000),
  status: z.enum(LEAD_STATUSES as [string, ...string[]]),
});

export const bulkUpdateLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdsStatusInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertOps(context.userId);
    const admin = await getAdmin();
    const isAdmin = await isUserAdmin(context.supabase, context.userId);

    let finalIds = data.ids;
    if (!isAdmin) {
      const { data: allowedLeads } = await admin
        .from("leads")
        .select("id")
        .in("id", data.ids)
        .eq("assigned_to", context.userId);
      finalIds = (allowedLeads ?? []).map((l: any) => l.id);
      if (finalIds.length === 0) throw new Error("Forbidden: None of the leads are assigned to you.");
    }

    let updated = 0;
    for (const batch of chunk(finalIds, 200)) {
      const { error, count } = await admin
        .from("leads")
        .update({ status: data.status as LeadStatus }, { count: "exact" })
        .in("id", batch);
      if (error) throw new Error(error.message);
      updated += count ?? 0;
    }
    await logAudit(context.userId, "leads.bulk_status", data.ids, { status: data.status, updated });
    return { updated };
  });

const IdsAssignInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(2000),
  assignee: z.string().uuid().nullable(),
});

export const bulkAssignLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdsAssignInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertOps(context.userId);
    let updated = 0;
    for (const batch of chunk(data.ids, 200)) {
      const { error, count } = await (await getAdmin())
        .from("leads")
        .update({ assigned_to: data.assignee }, { count: "exact" })
        .in("id", batch);
      if (error) throw new Error(error.message);
      updated += count ?? 0;
    }
    await logAudit(context.userId, "leads.bulk_assign", data.ids, { assignee: data.assignee, updated });
    return { updated };
  });

const IdsInput = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

export const bulkDeleteLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdsInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Block delete if any selected lead has a payment row (financial record).
    const { data: paid } = await (await getAdmin())
      .from("payments")
      .select("lead_id")
      .in("lead_id", data.ids);
    const blocked = new Set((paid ?? []).map((p) => p.lead_id as string));
    const safe = data.ids.filter((id) => !blocked.has(id));

    let deleted = 0;
    for (const batch of chunk(safe, 200)) {
      const admin = await getAdmin();

      // 1. Get application IDs for this batch of leads
      const { data: apps } = await admin
        .from("applications")
        .select("id")
        .in("lead_id", batch);
      const appIds = (apps ?? []).map((a) => a.id as string).filter(Boolean);

      // 2. Unlink any other leads that reference this batch via duplicate_of
      await (admin as any).from("leads").update({ duplicate_of: null, is_duplicate: false }).in("duplicate_of", batch);

      // 3. Clean up application-scoped child tables
      if (appIds.length > 0) {
        await (admin as any).from("workflow_events").delete().in("application_id", appIds);
        await (admin as any).from("workflow_reminders").delete().in("application_id", appIds);
        await (admin as any).from("workflow_delay_reasons").delete().in("application_id", appIds);
        await (admin as any).from("workflow_closure_reasons").delete().in("application_id", appIds);
        await (admin as any).from("application_events").delete().in("application_id", appIds);
        await (admin as any).from("refund_requests").delete().in("application_id", appIds);
      }

      // 4. Clean up lead-scoped child tables (guarantees application_events_lead_id_fkey and all other FKs are cleared)
      const { error: aeErr } = await (admin as any).from("application_events").delete().in("lead_id", batch);
      if (aeErr) console.error("[bulkDeleteLeads] application_events delete error:", aeErr.message);

      await (admin as any).from("activity_logs").delete().in("lead_id", batch);
      await (admin as any).from("lead_notes").delete().in("lead_id", batch);
      await (admin as any).from("documents").delete().in("lead_id", batch);
      await (admin as any).from("onboarding_submissions").delete().in("lead_id", batch);
      await (admin as any).from("follow_ups").delete().in("lead_id", batch);
      await (admin as any).from("support_tickets").delete().in("lead_id", batch);
      await (admin as any).from("payment_links").delete().in("lead_id", batch);
      await (admin as any).from("analytics_events").delete().in("lead_id", batch);
      await (admin as any).from("email_queue").delete().in("lead_id", batch);
      await (admin as any).from("email_logs").delete().in("lead_id", batch);
      await (admin as any).from("complaints").delete().in("lead_id", batch);
      await (admin as any).from("certificates").delete().in("lead_id", batch);
      await (admin as any).from("invoices").delete().in("lead_id", batch);
      await (admin as any).from("refund_requests").delete().in("lead_id", batch);
      await (admin as any).from("applications").delete().in("lead_id", batch);

      // 5. Finally delete from leads
      const { error, count } = await admin
        .from("leads")
        .delete({ count: "exact" })
        .in("id", batch);

      if (error) {
        console.error("[bulkDeleteLeads] leads delete failed:", error.message);
        throw new Error(error.message);
      }
      deleted += count ?? 0;
    }

    await logAudit(context.userId, "leads.bulk_delete", data.ids, {
      deleted,
      blocked_with_payments: blocked.size,
    });
    return { deleted, blocked: blocked.size };
  });

// ─────────────────────── bulk email ───────────────────────

const BulkEmailInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  templateCode: z.string().min(1).max(80),
});

export const bulkEmailLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => BulkEmailInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertOps(context.userId);
    const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");

    const { data: leads, error } = await (await getAdmin())
      .from("leads")
      .select("id, name, email, lead_code, mobile, service, total_amount")
      .in("id", data.ids);
    if (error) throw new Error(error.message);

    const { data: suppressed } = await (await getAdmin()).from("suppressed_emails").select("email");
    const suppressedSet = new Set((suppressed ?? []).map((s) => (s.email as string).toLowerCase()));

    let queued = 0;
    let skipped = 0;
    let failed = 0;
    for (const lead of leads ?? []) {
      const email = (lead.email as string | null)?.toLowerCase();
      if (!email) { skipped++; continue; }
      if (suppressedSet.has(email)) { skipped++; continue; }
      try {
        await enqueueFromTemplateInternal(
          data.templateCode,
          email,
          {
            name: lead.name,
            lead_code: lead.lead_code,
            mobile: lead.mobile,
            service: lead.service,
            total_amount: lead.total_amount,
          },
          { toName: lead.name as string, leadId: lead.id as string },
        );
        queued++;
      } catch {
        failed++;
      }
    }

    await logAudit(context.userId, "leads.bulk_email", data.ids, {
      template: data.templateCode, queued, skipped, failed,
    });
    return { queued, skipped, failed };
  });

// ─────────────────────── CSV export ───────────────────────

const ExportInput = z.object({
  ids: z.array(z.string().uuid()).optional(),
  search: z.string().max(200).optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  service: z.string().optional(),
  assignedTo: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
}).partial();

function buildCsvContent(headers: string[], dataRows: (string | number | null | undefined)[][]): string {
  const csvEscape = (v: unknown): string => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const headerLine = headers.map(csvEscape).join(",");
  const bodyLines = dataRows.map((r) => r.map(csvEscape).join(","));
  return "\uFEFF" + [headerLine, ...bodyLines].join("\n");
}

function buildExcelXmlContent(headers: string[], dataRows: (string | number | null | undefined)[][]): string {
  const escapeXml = (v: unknown): string => {
    if (v == null) return "";
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  const xmlHeader = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Bottom"/>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="Header">
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="Number">
   <NumberFormat ss:Format="#,##0.00"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Leads Export">
  <Table>`;

  const columns = headers.map(() => `<Column ss:AutoFitWidth="1" ss:Width="140"/>`).join("\n");

  const headerRow = `   <Row ss:Height="24">
` + headers.map((h) => `    <Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join("\n") + `
   </Row>`;

  const rowsXml = dataRows.map((r) => {
    const cells = r.map((val) => {
      if (typeof val === "number") {
        return `    <Cell ss:StyleID="Number"><Data ss:Type="Number">${val}</Data></Cell>`;
      }
      return `    <Cell><Data ss:Type="String">${escapeXml(val)}</Data></Cell>`;
    }).join("\n");
    return `   <Row ss:Height="20">\n${cells}\n   </Row>`;
  }).join("\n");

  const xmlFooter = `  </Table>
 </Worksheet>
</Workbook>`;

  return `${xmlHeader}\n${columns}\n${headerRow}\n${rowsXml}\n${xmlFooter}`;
}

export const exportLeadsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ExportInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertOps(context.userId);
    const admin = await getAdmin();
    const isAdmin = await isUserAdmin(context.supabase, context.userId);

    let q = admin
      .from("leads")
      .select(
        "id, lead_code, created_at, name, email, mobile, state, language, service, status, base_amount, gst_amount, total_amount, assigned_to, lead_source",
      )
      .order("created_at", { ascending: false })
      .limit(50000);

    if (data.ids && data.ids.length > 0) {
      q = q.in("id", data.ids);
    } else {
      if (data.status) q = q.eq("status", data.status as LeadStatus);
      if (data.source) {
        if (data.source.startsWith("__channel:")) {
          const ch = data.source.slice("__channel:".length);
          const prefixMap: Record<string, string> = {
            ads: "Google Ads",
            website: "Website",
            whatsapp: "WhatsApp",
            referral: "Referral",
            manual: "Manual",
            instagram: "Instagram",
            facebook: "Facebook",
          };
          const prefix = prefixMap[ch];
          if (prefix) {
            q = q.ilike("lead_source", `${prefix}%`);
          }
        } else {
          q = q.eq("lead_source", data.source);
        }
      }
      if (!isAdmin) {
        q = q.eq("assigned_to", context.userId);
      } else {
        if (data.assignedTo === "__unassigned") {
          q = q.is("assigned_to", null);
        } else if (data.assignedTo) {
          q = q.eq("assigned_to", data.assignedTo);
        }
      }
      if (data.dateFrom) q = q.gte("created_at", data.dateFrom);
      if (data.dateTo) q = q.lte("created_at", data.dateTo);
      if (data.search) {
        const s = data.search.replace(/[,()]/g, " ").trim();
        q = q.or(`lead_code.ilike.%${s}%,name.ilike.%${s}%,email.ilike.%${s}%,mobile.ilike.%${s}%`);
      }
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Resolve assignee display names from profiles.
    const assigneeIds = Array.from(new Set((rows ?? []).map((r) => r.assigned_to).filter(Boolean) as string[]));
    const nameMap = new Map<string, string>();
    if (assigneeIds.length) {
      const { data: profs } = await (await getAdmin())
        .from("profiles")
        .select("id, display_name, email")
        .in("id", assigneeIds);
      (profs ?? []).forEach((p) => nameMap.set(p.id as string, (p.display_name as string) || (p.email as string) || ""));
    }

    const headers = [
      "Lead Code", "Created At", "Name", "Email", "Mobile", "State", "Language",
      "Service", "Status", "Base Amount", "GST Amount", "Total Amount",
      "Assigned To", "Lead Source",
    ];

    const formattedRows = (rows ?? []).map((r) => [
      r.lead_code || "",
      r.created_at || "",
      r.name || "",
      r.email || "",
      r.mobile || "",
      r.state || "",
      r.language || "",
      r.service || "",
      (r.status || "").replace(/_/g, " "),
      Number(r.base_amount ?? 0),
      Number(r.gst_amount ?? 0),
      Number(r.total_amount ?? 0),
      r.assigned_to ? (nameMap.get(r.assigned_to as string) ?? "") : "",
      r.lead_source || "",
    ]);

    const csvContent = buildCsvContent(headers, formattedRows);
    const excelXmlContent = buildExcelXmlContent(headers, formattedRows);

    await logAudit(context.userId, "leads.export", (rows ?? []).map((r) => r.id as string), {
      count: rows?.length ?? 0,
      filter: data,
    });

    return {
      csv: csvContent,
      excelXml: excelXmlContent,
      count: rows?.length ?? 0,
    };
  });

// ─────────────────────── template list (for email dialog) ───────────────────────

export const listEnabledTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("email_templates")
      .select("code, name, subject, is_enabled")
      .eq("is_enabled", true)
      .order("name");
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

// ─────────────────────── assignable staff list ───────────────────────

export const listAssignableStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOps(context.userId);
    const { data: roles } = await (await getAdmin())
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "super_admin", "operations", "support", "manager", "executive", "accounts", "finance"]);
    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id as string)));
    if (ids.length === 0) return { rows: [] };
    const { data: profs } = await (await getAdmin())
      .from("profiles")
      .select("id, display_name, email")
      .in("id", ids)
      .eq("is_active", true);
    return {
      rows: (profs ?? []).map((p) => ({
        id: p.id as string,
        name: (p.display_name as string) || (p.email as string) || "(unnamed)",
        email: p.email as string,
      })),
    };
  });
