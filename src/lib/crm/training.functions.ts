import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUserAdmin } from "@/lib/audit";

export type TrainingCategory =
  | "General SOPs"
  | "Process & Portals"
  | "Customer Handling"
  | "Technical & NIC Delays"
  | "Compliance & Verification"
  | "Scripts & Templates";

export type TrainingMaterial = {
  id: string;
  title: string;
  description: string;
  category: TrainingCategory;
  content_type: "rich_text" | "document" | "external_link";
  content: string;
  document_url?: string | null;
  file_name?: string | null;
  file_size_bytes?: number | null;
  tags: string[];
  is_pinned: boolean;
  is_published: boolean;
  sort_order: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
};

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

const DEFAULT_TRAINING_MATERIALS: TrainingMaterial[] = [
  {
    id: "sop-udyam-new-reg-01",
    title: "SOP: New Udyam Registration & Document Verification",
    description: "Standard end-to-end operating procedure for processing brand new Udyam MSME registrations, Aadhaar OTP authentication, and PAN validation.",
    category: "Process & Portals",
    content_type: "rich_text",
    content: `## Objective
Guide executive and operations staff on processing new MSME Udyam applications accurately within SLA.

### 1. Initial Verification Checklist
- **Aadhaar Number**: Verify 12-digit Aadhaar of proprietor/partner/director.
- **PAN Card**: Verify PAN is active and matches applicant's legal name.
- **Bank Account Details**: IFSC Code and Account number matching business name.
- **Enterprise Details**: Major activity (Manufacturing / Service), NIC 2-digit & 5-digit codes.

### 2. Processing Steps on National Portal
1. Open official government Udyam registration portal.
2. Enter Aadhaar number and applicant name as per Aadhaar.
3. Call customer immediately for OTP when prompt displays.
4. Validate PAN details and organization type (Proprietary / Partnership / Private Limited).
5. Enter investment details, plant & machinery value, and turnover from previous ITR.
6. Submit final OTP authentication with customer on phone.

### 3. Error Handling
- **Aadhaar Name Mismatch**: Request customer's Aadhaar update or verify spelling.
- **Server Gateway Timeout**: Place order into **Technical Delay** with government portal timestamp.`,
    tags: ["udyam", "sop", "new-registration", "process"],
    is_pinned: true,
    is_published: true,
    sort_order: 1,
    created_by_name: "Super Admin",
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-25T14:30:00.000Z",
  },
  {
    id: "sop-customer-delay-protocol-02",
    title: "SOP: Customer Delay, OTP Follow-up & Holding Protocol",
    description: "Step-by-step guideline on placing orders in Customer Delay, maximum hold durations, and WhatsApp/Call retry schedules.",
    category: "Customer Handling",
    content_type: "rich_text",
    content: `## Customer Delay & OTP Management Rules

### When to mark Customer Delay:
- Customer phone is unreachable, switched off, or not answering after **3 call attempts**.
- Customer is not ready with OTP / Aadhaar linked mobile is with another family member.
- Customer requested to call back at a specific time.
- Missing documents (PAN copy, electricity bill, canceled cheque).

### Execution Flow:
1. Trigger WhatsApp automated document / OTP link from CRM.
2. Select exact **Customer Delay Reason** in CRM workflow.
3. Schedule next **Callback Reminder** with exact date and time requested by customer.
4. Never leave order in untracked state; always record specific notes on customer conversation.

### Maximum Hold Duration:
- Customer Delay is permitted for up to **72 hours** with daily follow-up calls before escalation.`,
    tags: ["customer-delay", "otp", "follow-up", "sop"],
    is_pinned: true,
    is_published: true,
    sort_order: 2,
    created_by_name: "Super Admin",
    created_at: "2026-09-02T11:00:00.000Z",
    updated_at: "2026-09-26T10:00:00.000Z",
  },
  {
    id: "sop-nic-technical-hold-03",
    title: "SOP: Technical Delay & NIC Government Portal Downtime",
    description: "Rules for placing orders into Technical Delay when government servers or gateway APIs are temporarily down.",
    category: "Technical & NIC Delays",
    content_type: "rich_text",
    content: `## Technical Delay Protocol

### Eligibility:
- NIC Government Portal displaying 502/504 Bad Gateway.
- Aadhaar UIDAI e-KYC authentication server downtime.
- Income Tax PAN verification service unreachable.

### Steps:
1. Verify downtime across 2 independent browsers/networks.
2. Update CRM order stage to **Technical Delay**.
3. Select specific technical reason code (e.g. \`NIC_PORTAL_DOWN\`, \`UIDAI_OTP_SERVER_DOWN\`).
4. Re-check government portal every **45 minutes**. Once live, immediately resume and process pending queue.`,
    tags: ["technical-delay", "nic-portal", "uidai", "server-down"],
    is_pinned: false,
    is_published: true,
    sort_order: 3,
    created_by_name: "Super Admin",
    created_at: "2026-09-03T09:30:00.000Z",
    updated_at: "2026-09-20T16:00:00.000Z",
  },
  {
    id: "sop-hot-orders-ticket-escalations-04",
    title: "SOP: Hot Priority Orders & Escalated Ticket Handling",
    description: "Guidelines for processing urgent <15 min SLA hot priority orders received from customer support tickets.",
    category: "Customer Handling",
    content_type: "rich_text",
    content: `## Hot Priority Order Protocol (< 15 Min SLA)

### Criteria:
- Order marked **HOT ORDER NOW** with flame indicator.
- Support team escalated customer ticket (#TICKET-ID).
- Reopened completed order requiring certificate correction or urgent delivery.

### Immediate Actions:
1. Prioritize before any normal queue orders.
2. Call customer within **5 minutes** of assignment.
3. Review ticket remarks attached to order.
4. Deliver updated certificate or resolve modification request immediately.`,
    tags: ["hot-orders", "tickets", "urgent", "sla"],
    is_pinned: true,
    is_published: true,
    sort_order: 4,
    created_by_name: "Super Admin",
    created_at: "2026-09-05T12:00:00.000Z",
    updated_at: "2026-09-26T12:00:00.000Z",
  },
  {
    id: "sop-certificate-delivery-quality-05",
    title: "SOP: Certificate Generation & Quality Audit Checklist",
    description: "Pre-dispatch quality checklist before uploading final Udyam Registration Certificate and marking order completed.",
    category: "Compliance & Verification",
    content_type: "rich_text",
    content: `## Certificate Quality Control Checklist

Before uploading the final PDF certificate:
- [ ] Udyam Registration Number (URN) format is valid (\`UDYAM-XX-00-0000000\`).
- [ ] Enterprise Name is spelled 100% identically to customer application.
- [ ] Major Activity (Manufacturing / Services) correctly classified.
- [ ] PDF is clean, high resolution, with official QR code verifiable.
- [ ] Upload to CRM to trigger automated WhatsApp & Email certificate delivery.`,
    tags: ["certificate", "quality-check", "delivery", "completion"],
    is_pinned: false,
    is_published: true,
    sort_order: 5,
    created_by_name: "Super Admin",
    created_at: "2026-09-06T14:00:00.000Z",
    updated_at: "2026-09-22T11:00:00.000Z",
  },
];

const STORAGE_BLOCK_KEY = "training_library_documents";

function cleanStoragePath(urlOrPath?: string | null): string | null {
  if (!urlOrPath) return null;
  const trimmed = urlOrPath.trim();
  if (!trimmed) return null;

  // Extract storage relative path if a full Supabase storage signed/public URL was passed
  if (trimmed.includes("/documents/")) {
    const extracted = trimmed.split("/documents/")[1].split("?")[0];
    return decodeURIComponent(extracted);
  }
  return trimmed;
}

async function getTargetWebsiteId(admin: any): Promise<string> {
  const { data: websites } = await admin
    .from("websites")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (websites && websites.length > 0 && websites[0].id) {
    return websites[0].id;
  }
  return "00000000-0000-0000-0000-000000000000";
}

async function loadPersistedTrainingMaterials(admin: any): Promise<TrainingMaterial[]> {
  try {
    const { data: block, error } = await admin
      .from("site_content_blocks")
      .select("content")
      .eq("block_key", STORAGE_BLOCK_KEY)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("Could not query training block:", error.message);
    }

    if (block?.content && Array.isArray(block.content) && block.content.length > 0) {
      return block.content as TrainingMaterial[];
    }
  } catch (err) {
    console.error("loadPersistedTrainingMaterials error:", err);
  }
  return DEFAULT_TRAINING_MATERIALS;
}

async function savePersistedTrainingMaterials(admin: any, list: TrainingMaterial[]): Promise<void> {
  // 1. Check if a block with STORAGE_BLOCK_KEY already exists
  const { data: existing, error: findError } = await admin
    .from("site_content_blocks")
    .select("id, website_id")
    .eq("block_key", STORAGE_BLOCK_KEY)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error: updateError } = await admin
      .from("site_content_blocks")
      .update({
        content: list as never,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateError) {
      console.error("Failed to update training site_content_blocks:", updateError);
      throw new Error(`Failed to update training materials: ${updateError.message}`);
    }
    return;
  }

  // 2. Otherwise insert a new record with a valid website_id
  const websiteId = await getTargetWebsiteId(admin);

  const { error: insertError } = await admin.from("site_content_blocks").upsert(
    {
      website_id: websiteId,
      block_key: STORAGE_BLOCK_KEY,
      content: list as never,
      is_active: true,
    },
    { onConflict: "website_id,block_key" }
  );

  if (insertError) {
    console.error("Failed to insert training site_content_blocks:", insertError);
    throw new Error(`Failed to save training materials: ${insertError.message}`);
  }
}

async function attachSignedUrlIfNeeded(admin: any, item: TrainingMaterial): Promise<TrainingMaterial> {
  if (!item.document_url) return item;

  const docUrl = item.document_url;
  // If it's a storage path or contains /documents/
  if (docUrl.startsWith("training/") || docUrl.startsWith("documents/training/")) {
    const path = docUrl.startsWith("documents/") ? docUrl.replace(/^documents\//, "") : docUrl;
    try {
      const { data: signed } = await admin.storage.from("documents").createSignedUrl(path, 60 * 60 * 24 * 7);
      if (signed?.signedUrl) {
        return { ...item, document_url: signed.signedUrl };
      }
    } catch {
      // ignore error, keep original
    }
  }
  return item;
}

// ── 1. List Training Materials (All Staff & Admins) ──
export const listTrainingMaterials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        category: z.string().optional(),
        query: z.string().optional(),
        includeDrafts: z.boolean().default(false),
      })
      .parse(i ?? {})
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const isAdmin = await isUserAdmin(context.supabase, context.userId);
    const rawMaterials = await loadPersistedTrainingMaterials(admin);

    let result = rawMaterials;

    // Non-admins can only see published materials
    if (!isAdmin && !data.includeDrafts) {
      result = result.filter((m) => m.is_published);
    }

    if (data.category && data.category !== "All") {
      result = result.filter((m) => m.category === data.category);
    }

    if (data.query && data.query.trim()) {
      const q = data.query.toLowerCase().trim();
      result = result.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.content.toLowerCase().includes(q) ||
          m.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Sort: Pinned first, then sort_order ascending, then newest updated
    result.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    const enriched = await Promise.all(result.map((m) => attachSignedUrlIfNeeded(admin, m)));

    return {
      materials: enriched,
      isAdmin,
      categories: [
        "All",
        "General SOPs",
        "Process & Portals",
        "Customer Handling",
        "Technical & NIC Delays",
        "Compliance & Verification",
        "Scripts & Templates",
      ],
    };
  });

// ── 2. Get Single Training Material ──
export const getTrainingMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const isAdmin = await isUserAdmin(context.supabase, context.userId);
    const materials = await loadPersistedTrainingMaterials(admin);
    const item = materials.find((m) => m.id === data.id);

    if (!item) throw new Error("Training material not found");
    if (!item.is_published && !isAdmin) throw new Error("Document is currently in draft");

    const enriched = await attachSignedUrlIfNeeded(admin, item);
    return { material: enriched, isAdmin };
  });

// ── 3. Create Training Material (Admin / SuperAdmin) ──
const TrainingCreateSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(200),
  description: z.string().trim().max(1000).default(""),
  category: z.enum([
    "General SOPs",
    "Process & Portals",
    "Customer Handling",
    "Technical & NIC Delays",
    "Compliance & Verification",
    "Scripts & Templates",
  ]),
  content_type: z.enum(["rich_text", "document", "external_link"]).default("rich_text"),
  content: z.string().default(""),
  document_url: z.string().nullable().optional(),
  file_name: z.string().nullable().optional(),
  file_size_bytes: z.number().nullable().optional(),
  tags: z.array(z.string()).default([]),
  is_pinned: z.boolean().default(false),
  is_published: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const createTrainingMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TrainingCreateSchema.parse(i))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const isAdmin = await isUserAdmin(context.supabase, context.userId);
    if (!isAdmin) throw new Error("Forbidden: Only administrators can create training materials.");

    const { data: profile } = await admin
      .from("profiles")
      .select("display_name, email")
      .eq("id", context.userId)
      .maybeSingle();

    const staffName = profile?.display_name || profile?.email?.split("@")[0] || "Admin";
    const materials = await loadPersistedTrainingMaterials(admin);

    const cleanDocUrl = cleanStoragePath(data.document_url);

    const newMaterial: TrainingMaterial = {
      id: `training-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      ...data,
      document_url: cleanDocUrl,
      created_by_name: staffName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    materials.unshift(newMaterial);
    await savePersistedTrainingMaterials(admin, materials);

    return { success: true, material: newMaterial };
  });

// ── 4. Update Training Material (Admin / SuperAdmin) ──
const TrainingUpdateSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  category: z.enum([
    "General SOPs",
    "Process & Portals",
    "Customer Handling",
    "Technical & NIC Delays",
    "Compliance & Verification",
    "Scripts & Templates",
  ]).optional(),
  content_type: z.enum(["rich_text", "document", "external_link"]).optional(),
  content: z.string().optional(),
  document_url: z.string().nullable().optional(),
  file_name: z.string().nullable().optional(),
  file_size_bytes: z.number().nullable().optional(),
  tags: z.array(z.string()).optional(),
  is_pinned: z.boolean().optional(),
  is_published: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

export const updateTrainingMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TrainingUpdateSchema.parse(i))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const isAdmin = await isUserAdmin(context.supabase, context.userId);
    if (!isAdmin) throw new Error("Forbidden: Only administrators can update training materials.");

    const materials = await loadPersistedTrainingMaterials(admin);
    const idx = materials.findIndex((m) => m.id === data.id);
    if (idx === -1) throw new Error("Training material not found");

    const existing = materials[idx];
    const cleanDocUrl =
      data.document_url !== undefined
        ? cleanStoragePath(data.document_url)
        : existing.document_url;

    const updated: TrainingMaterial = {
      ...existing,
      ...data,
      document_url: cleanDocUrl,
      updated_at: new Date().toISOString(),
    };

    materials[idx] = updated;
    await savePersistedTrainingMaterials(admin, materials);

    return { success: true, material: updated };
  });

// ── 5. Delete Training Material (Admin / SuperAdmin) ──
export const deleteTrainingMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const isAdmin = await isUserAdmin(context.supabase, context.userId);
    if (!isAdmin) throw new Error("Forbidden: Only administrators can delete training materials.");

    let materials = await loadPersistedTrainingMaterials(admin);
    materials = materials.filter((m) => m.id !== data.id);
    await savePersistedTrainingMaterials(admin, materials);

    return { success: true };
  });

// ── 6. Direct Upload Training Document (PDF, Word, Images, etc.) ──
export const uploadTrainingDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        fileName: z.string().min(1),
        fileBase64: z.string().min(1),
        contentType: z.string().default("application/pdf"),
      })
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const isAdmin = await isUserAdmin(context.supabase, context.userId);
    if (!isAdmin) throw new Error("Forbidden: Only administrators can upload training documents.");

    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `training/${Date.now()}-${safeName}`;

    // Clean base64 header if present (e.g. data:application/pdf;base64,...)
    const base64Data = data.fileBase64.includes(",")
      ? data.fileBase64.split(",")[1]
      : data.fileBase64;
    const fileBuffer = Buffer.from(base64Data, "base64");

    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(filePath, fileBuffer, {
        contentType: data.contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload failed:", uploadError);
      throw new Error(`Failed to upload document: ${uploadError.message}`);
    }

    // Generate signed download URL (valid for 7 days)
    const { data: signedData } = await admin.storage
      .from("documents")
      .createSignedUrl(filePath, 60 * 60 * 24 * 7);

    return {
      success: true,
      filePath,
      fileName: data.fileName,
      fileSizeBytes: fileBuffer.length,
      downloadUrl: signedData?.signedUrl || filePath,
    };
  });

// ── 7. Request Signed Upload URL for Attachments / PDFs (Fallback) ──
export const getTrainingDocUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ fileName: z.string(), contentType: z.string() }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const isAdmin = await isUserAdmin(context.supabase, context.userId);
    if (!isAdmin) throw new Error("Forbidden: Only administrators can upload training files.");

    const ext = data.fileName.split(".").pop() || "pdf";
    const path = `training/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;

    const { data: signed, error } = await admin.storage
      .from("documents")
      .createSignedUploadUrl(path);

    if (error) throw new Error(error.message);

    const { data: signedView } = await admin.storage
      .from("documents")
      .createSignedUrl(path, 60 * 60 * 24 * 7);

    return {
      path,
      uploadUrl: signed.signedUrl,
      token: signed.token,
      downloadUrl: signedView?.signedUrl || path,
    };
  });

// ── 8. Resolve Fresh Signed Download URL on Demand ──
export const getTrainingDocDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ documentUrlOrPath: z.string().min(1) }).parse(i)
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const target = data.documentUrlOrPath;

    // If it's already an external HTTP/HTTPS URL not in Supabase storage, return as is
    if (
      target.startsWith("http://") ||
      (target.startsWith("https://") &&
        !target.includes("/storage/v1/object/") &&
        !target.includes("supabase.co/storage"))
    ) {
      return { url: target };
    }

    let storagePath = target;
    if (target.includes("/documents/")) {
      storagePath = target.split("/documents/")[1].split("?")[0];
    }

    const { data: signed, error } = await admin.storage
      .from("documents")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

    if (error || !signed?.signedUrl) {
      return { url: target };
    }

    return { url: signed.signedUrl };
  });
