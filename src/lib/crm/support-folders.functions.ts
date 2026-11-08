import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

const MISSING_MIGRATION_MSG =
  "Database tables for support folders and stars have not been applied to Supabase yet. Please run migration 'supabase/migrations/20261025140000_support_ticket_folders_and_stars.sql' in the Supabase SQL Editor.";

function handleDbError(error: any, actionDesc: string): never {
  if (error?.code === "PGRST205") {
    throw new Error(MISSING_MIGRATION_MSG);
  }
  throw new Error(`${actionDesc}: ${error?.message || error?.code || "Unknown database error"}`);
}

/**
 * Returns mapping of starred status and folder membership for a given list of ticket IDs.
 * Strictly checks permissions: staff only see private folders they own or shared team folders.
 */
export async function getTicketOrganizationMeta(
  userId: string,
  ticketIds: string[]
): Promise<{
  starredSet: Set<string>;
  ticketFolderMap: Map<string, { folderId: string; folderName: string; color: string }>;
  starredCount: number;
}> {
  const admin = await getAdmin();
  const starredSet = new Set<string>();
  const ticketFolderMap = new Map<string, { folderId: string; folderName: string; color: string }>();

  if (!ticketIds.length) {
    return { starredSet, ticketFolderMap, starredCount: 0 };
  }

  try {
    // 1. Fetch user's starred tickets for this page
    const { data: starRows, error: sErr } = await admin
      .from("support_ticket_stars" as any)
      .select("ticket_id")
      .eq("user_id", userId)
      .in("ticket_id", ticketIds);

    if (sErr && sErr.code !== "PGRST205") {
      console.warn("[getTicketOrganizationMeta] starRows warning:", sErr);
    } else if (starRows) {
      (starRows as any[]).forEach((r) => starredSet.add(r.ticket_id));
    }

    // 2. Fetch folder items for these tickets
    const { data: itemRows, error: iErr } = await admin
      .from("support_ticket_folder_items" as any)
      .select("ticket_id, folder_id")
      .in("ticket_id", ticketIds);

    if (iErr && iErr.code !== "PGRST205") {
      console.warn("[getTicketOrganizationMeta] itemRows warning:", iErr);
    } else if (itemRows && (itemRows as any[]).length > 0) {
      const folderIds = Array.from(new Set((itemRows as any[]).map((r) => r.folder_id).filter(Boolean)));
      if (folderIds.length > 0) {
        // Fetch folder details, enforcing user isolation (own folders or shared)
        const { data: folderRows, error: fErr } = await admin
          .from("support_ticket_folders" as any)
          .select("id, name, color, is_shared, user_id")
          .in("id", folderIds)
          .or(`user_id.eq.${userId},is_shared.eq.true`);

        if (!fErr && folderRows) {
          const folderMap = new Map((folderRows as any[]).map((f) => [f.id, f]));
          (itemRows as any[]).forEach((r: any) => {
            const f = folderMap.get(r.folder_id);
            if (f) {
              ticketFolderMap.set(r.ticket_id, {
                folderId: f.id,
                folderName: f.name,
                color: f.color || "slate",
              });
            }
          });
        }
      }
    }

    // 3. Total starred count for this user
    let starTotal = starredSet.size;
    const { count, error: countErr } = await admin
      .from("support_ticket_stars" as any)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (!countErr && typeof count === "number") {
      starTotal = count;
    }

    return { starredSet, ticketFolderMap, starredCount: starTotal };
  } catch (err: any) {
    if (err?.code === "PGRST205") {
      return { starredSet, ticketFolderMap, starredCount: 0 };
    }
    return { starredSet, ticketFolderMap, starredCount: 0 };
  }
}

/**
 * Returns all starred ticket IDs for a user.
 */
export async function getUserStarredTicketIds(userId: string): Promise<string[]> {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("support_ticket_stars" as any)
    .select("ticket_id")
    .eq("user_id", userId);

  if (error) {
    if (error.code === "PGRST205") return [];
    handleDbError(error, "Failed to fetch starred tickets");
  }
  return ((data as any[]) ?? []).map((r) => r.ticket_id);
}

/**
 * Returns all ticket IDs in a specific folder.
 * Enforces ownership/shared permission if userId is supplied.
 */
export async function getFolderTicketIds(folderId: string, userId?: string): Promise<string[]> {
  const admin = await getAdmin();

  if (userId) {
    const { data: folder, error: fErr } = await admin
      .from("support_ticket_folders" as any)
      .select("id, is_shared, user_id")
      .eq("id", folderId)
      .maybeSingle();

    if (fErr) {
      if (fErr.code === "PGRST205") return [];
      handleDbError(fErr, "Failed to verify folder permission");
    }
    const f: any = folder;
    if (f && !f.is_shared && f.user_id !== userId) {
      return [];
    }
  }

  const { data, error } = await admin
    .from("support_ticket_folder_items" as any)
    .select("ticket_id")
    .eq("folder_id", folderId);

  if (error) {
    if (error.code === "PGRST205") return [];
    handleDbError(error, "Failed to fetch tickets in folder");
  }
  return ((data as any[]) ?? []).map((r) => r.ticket_id);
}

// ─────────────────────────────────────────────────────────────
// CORE REUSABLE WORKER FUNCTIONS
// ─────────────────────────────────────────────────────────────

export async function coreListFolders(userId: string) {
  const admin = await getAdmin();

  const { data: folders, error: fErr } = await admin
    .from("support_ticket_folders" as any)
    .select("id, name, color, is_shared, user_id, created_at, updated_at")
    .or(`user_id.eq.${userId},is_shared.eq.true`)
    .order("created_at", { ascending: true });

  if (fErr) {
    if (fErr.code === "PGRST205") {
      return { folders: [], starredCount: 0 };
    }
    handleDbError(fErr, "Failed to list folders");
  }

  const folderList = (folders ?? []) as any[];
  const folderIds = folderList.map((f) => f.id);

  const countMap = new Map<string, number>();
  if (folderIds.length > 0) {
    const { data: items, error: iErr } = await admin
      .from("support_ticket_folder_items" as any)
      .select("folder_id")
      .in("folder_id", folderIds);

    if (!iErr && items) {
      (items as any[]).forEach((item) => {
        countMap.set(item.folder_id, (countMap.get(item.folder_id) ?? 0) + 1);
      });
    }
  }

  const { count: starCount, error: sErr } = await admin
    .from("support_ticket_stars" as any)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  return {
    folders: folderList.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color ?? "slate",
      is_shared: !!f.is_shared,
      is_owner: f.user_id === userId,
      ticket_count: countMap.get(f.id) ?? 0,
      count: countMap.get(f.id) ?? 0,
      created_at: f.created_at,
    })),
    starredCount: (!sErr && typeof starCount === "number") ? starCount : 0,
  };
}

export async function coreCreateFolder({
  name,
  color = "slate",
  isShared = false,
  userId,
}: {
  name: string;
  color?: string;
  isShared?: boolean;
  userId: string;
}) {
  const admin = await getAdmin();
  const now = new Date().toISOString();

  const { data: row, error } = await admin
    .from("support_ticket_folders" as any)
    .insert({
      name,
      color,
      user_id: userId,
      is_shared: isShared,
      created_at: now,
      updated_at: now,
    })
    .select("id, name, color, is_shared, created_at")
    .single();

  if (error) {
    handleDbError(error, "Failed to create folder");
  }

  return { ok: true, folder: row as any };
}

export async function coreRenameFolder({
  folderId,
  name,
  color,
  userId,
}: {
  folderId: string;
  name: string;
  color?: string;
  userId: string;
}) {
  const admin = await getAdmin();
  const now = new Date().toISOString();

  const patch: any = { name, updated_at: now };
  if (color) patch.color = color;

  const { data: updated, error } = await admin
    .from("support_ticket_folders" as any)
    .update(patch)
    .eq("id", folderId)
    .eq("user_id", userId)
    .select()
    .maybeSingle();

  if (error) {
    handleDbError(error, "Failed to rename folder");
  }
  if (!updated) {
    throw new Error("Folder not found or unauthorized");
  }

  return { ok: true, folder: updated as any };
}

export async function coreDeleteFolder({
  folderId,
  userId,
}: {
  folderId: string;
  userId: string;
}) {
  const admin = await getAdmin();

  const { data: folder, error: fErr } = await admin
    .from("support_ticket_folders" as any)
    .select("id, user_id")
    .eq("id", folderId)
    .maybeSingle();

  if (fErr) {
    handleDbError(fErr, "Failed to verify folder");
  }
  const f: any = folder;
  if (!f || f.user_id !== userId) {
    throw new Error("Folder not found or unauthorized");
  }

  await admin
    .from("support_ticket_folder_items" as any)
    .delete()
    .eq("folder_id", folderId);

  const { error: delErr } = await admin
    .from("support_ticket_folders" as any)
    .delete()
    .eq("id", folderId)
    .eq("user_id", userId);

  if (delErr) {
    handleDbError(delErr, "Failed to delete folder");
  }

  return { ok: true, deletedFolderId: folderId };
}

export async function coreToggleStar({
  ticketId,
  isStarred,
  userId,
}: {
  ticketId: string;
  isStarred?: boolean;
  userId: string;
}) {
  const admin = await getAdmin();

  const { data: existing, error: cErr } = await admin
    .from("support_ticket_stars" as any)
    .select("id")
    .eq("ticket_id", ticketId)
    .eq("user_id", userId)
    .maybeSingle();

  if (cErr) {
    handleDbError(cErr, "Failed to check star status");
  }

  let newStarred = false;
  if (existing) {
    if (isStarred === true) return { ok: true, isStarred: true };
    const { error: delErr } = await admin
      .from("support_ticket_stars" as any)
      .delete()
      .eq("ticket_id", ticketId)
      .eq("user_id", userId);
    if (delErr) {
      handleDbError(delErr, "Failed to unstar ticket");
    }
    newStarred = false;
  } else {
    if (isStarred === false) return { ok: true, isStarred: false };
    const { error: insErr } = await admin
      .from("support_ticket_stars" as any)
      .insert({
        ticket_id: ticketId,
        user_id: userId,
        created_at: new Date().toISOString(),
      });
    if (insErr) {
      handleDbError(insErr, "Failed to star ticket");
    }
    newStarred = true;
  }
  return { ok: true, isStarred: newStarred };
}

export async function coreBulkToggleStar({
  ticketIds,
  isStarred = true,
  userId,
}: {
  ticketIds: string[];
  isStarred?: boolean;
  userId: string;
}) {
  const admin = await getAdmin();

  if (isStarred) {
    const rows = ticketIds.map((tId) => ({
      ticket_id: tId,
      user_id: userId,
      created_at: new Date().toISOString(),
    }));
    const { error: upsertErr } = await admin
      .from("support_ticket_stars" as any)
      .upsert(rows, { onConflict: "ticket_id,user_id" });
    if (upsertErr) {
      handleDbError(upsertErr, "Bulk star failed");
    }
  } else {
    const { error: delErr } = await admin
      .from("support_ticket_stars" as any)
      .delete()
      .in("ticket_id", ticketIds)
      .eq("user_id", userId);
    if (delErr) {
      handleDbError(delErr, "Bulk unstar failed");
    }
  }
  return { ok: true, count: ticketIds.length, isStarred, star: isStarred };
}

export async function coreMoveTickets({
  ticketIds,
  folderId,
  userId,
}: {
  ticketIds: string[];
  folderId: string;
  userId: string;
}) {
  const admin = await getAdmin();
  const now = new Date().toISOString();

  // 1. Verify destination folder exists and current employee has access
  const { data: folder, error: fErr } = await admin
    .from("support_ticket_folders" as any)
    .select("id, is_shared, user_id")
    .eq("id", folderId)
    .maybeSingle();

  if (fErr) {
    handleDbError(fErr, "Failed to verify destination folder");
  }
  const f: any = folder;
  if (!f || f.user_id !== userId) {
    throw new Error("Only the folder owner can add tickets to this folder");
  }

  // 2. Remove existing items for these tickets, only from folders this user owns
  const ownIds = await ownedFolderIds(userId);
  const { error: delErr } = await admin
    .from("support_ticket_folder_items" as any)
    .delete()
    .in("ticket_id", ticketIds)
    .in("folder_id", ownIds.length ? ownIds : [folderId]);

  if (delErr) {
    handleDbError(delErr, "Failed to remove tickets from previous folder");
  }

  // 3. Insert new folder items
  const rows = ticketIds.map((tId) => ({
    folder_id: folderId,
    ticket_id: tId,
    user_id: userId,
    created_at: now,
  }));

  const { error: insErr } = await admin
    .from("support_ticket_folder_items" as any)
    .insert(rows);

  if (insErr) {
    handleDbError(insErr, "Failed to move tickets to destination folder");
  }

  return { ok: true, count: ticketIds.length, folderId };
}

async function ownedFolderIds(userId: string): Promise<string[]> {
  const admin = await getAdmin();
  const { data } = await admin
    .from("support_ticket_folders" as any)
    .select("id")
    .eq("user_id", userId);
  return ((data as any[]) ?? []).map((r) => r.id);
}

export async function coreRemoveTickets({
  ticketIds,
  userId,
}: {
  ticketIds: string[];
  userId: string;
}) {
  const admin = await getAdmin();
  const ownIds = await ownedFolderIds(userId);
  if (!ownIds.length) return { ok: true, count: 0 };
  const { error: delErr } = await admin
    .from("support_ticket_folder_items" as any)
    .delete()
    .in("ticket_id", ticketIds)
    .in("folder_id", ownIds);

  if (delErr) {
    handleDbError(delErr, "Failed to remove tickets from folder");
  }

  return { ok: true, count: ticketIds.length };
}

// ─────────────────────────────────────────────────────────────
// SERVER FUNCTIONS (Exposed to UI with session middleware)
// ─────────────────────────────────────────────────────────────

export const listSupportFolders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => coreListFolders(context.userId));

export const createSupportFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(60),
        color: z.enum(["slate", "blue", "indigo", "emerald", "amber", "rose", "purple"]).default("slate"),
        isShared: z.boolean().default(false),
      })
      .parse(raw)
  )
  .handler(async ({ data, context }) => coreCreateFolder({ ...data, userId: context.userId }));

export const renameSupportFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        folderId: z.string().uuid(),
        name: z.string().trim().min(1).max(60),
        color: z.enum(["slate", "blue", "indigo", "emerald", "amber", "rose", "purple"]).optional(),
      })
      .parse(raw)
  )
  .handler(async ({ data, context }) => coreRenameFolder({ ...data, userId: context.userId }));

export const deleteSupportFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ folderId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => coreDeleteFolder({ folderId: data.folderId, userId: context.userId }));

export const toggleTicketStar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ ticketId: z.string().uuid(), isStarred: z.boolean().optional() }).parse(raw)
  )
  .handler(async ({ data, context }) => coreToggleStar({ ...data, userId: context.userId }));

export const bulkToggleTicketStar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        ticketIds: z.array(z.string().uuid()).min(1),
        isStarred: z.boolean().optional(),
        star: z.boolean().optional(),
      })
      .parse(raw)
  )
  .handler(async ({ data, context }) =>
    coreBulkToggleStar({
      ticketIds: data.ticketIds,
      isStarred: data.isStarred ?? data.star ?? true,
      userId: context.userId,
    })
  );

export const moveTicketsToFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        ticketIds: z.array(z.string().uuid()).min(1),
        folderId: z.string().uuid(),
      })
      .parse(raw)
  )
  .handler(async ({ data, context }) => coreMoveTickets({ ...data, userId: context.userId }));

export const removeTicketsFromFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ ticketIds: z.array(z.string().uuid()).min(1) }).parse(raw)
  )
  .handler(async ({ data, context }) => coreRemoveTickets({ ticketIds: data.ticketIds, userId: context.userId }));
