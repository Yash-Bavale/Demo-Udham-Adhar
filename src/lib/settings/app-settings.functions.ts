// App-wide settings (single-row public.app_settings).
// Read: any signed-in staff. Write: super_admin only.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAppSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("app_settings")
      .select("customer_delay_autoclose_minutes, updated_at, updated_by")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      customerDelayAutocloseMinutes: (data?.customer_delay_autoclose_minutes as number | undefined) ?? 480,
      updatedAt: (data?.updated_at as string | undefined) ?? null,
      updatedBy: (data?.updated_by as string | undefined) ?? null,
    };
  });

export const updateCustomerDelayAutocloseMinutes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ minutes: z.number().int().min(1).max(10080) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    // Verify super_admin role using the caller's own RLS context.
    const { data: isSuper } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isSuper) throw new Error("Forbidden: super_admin required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert(
        {
          id: 1,
          customer_delay_autoclose_minutes: data.minutes,
          updated_at: new Date().toISOString(),
          updated_by: context.userId,
        } as never,
        { onConflict: "id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, minutes: data.minutes };
  });

const SOUND_CONFIG_STORAGE_PATH = "config/sound-settings.json";

interface GlobalSoundConfig {
  enabled: boolean;
  tone: "chime" | "bell" | "digital_ring" | "radar" | "soft_ping" | "custom";
  volume: number;
  desktopNotifications: boolean;
  customAudioUrl?: string | null;
  customAudioName?: string | null;
  leadsSoundEnabled?: boolean;
  ordersSoundEnabled?: boolean;
  leadsToastEnabled?: boolean;
  ordersToastEnabled?: boolean;
  leadsRingtone?: string;
  leadsCustomUrl?: string | null;
  leadsCustomName?: string | null;
  ordersRingtone?: string;
  ordersCustomUrl?: string | null;
  ordersCustomName?: string | null;
}

const DEFAULT_GLOBAL_SOUND_CONFIG: GlobalSoundConfig = {
  enabled: true,
  tone: "chime",
  volume: 0.8,
  desktopNotifications: true,
  customAudioUrl: null,
  customAudioName: null,
  leadsSoundEnabled: true,
  ordersSoundEnabled: true,
  leadsToastEnabled: true,
  ordersToastEnabled: true,
  leadsRingtone: "chime",
  leadsCustomUrl: null,
  leadsCustomName: null,
  ordersRingtone: "bell",
  ordersCustomUrl: null,
  ordersCustomName: null,
};

async function readSoundConfigFromStorage(): Promise<GlobalSoundConfig | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.storage
      .from("documents")
      .download(SOUND_CONFIG_STORAGE_PATH);

    if (error || !data) return null;
    const text = await data.text();
    return JSON.parse(text) as GlobalSoundConfig;
  } catch {
    return null;
  }
}

async function writeSoundConfigToStorage(config: Partial<GlobalSoundConfig>): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const existing = (await readSoundConfigFromStorage()) || DEFAULT_GLOBAL_SOUND_CONFIG;
    const merged = { ...existing, ...config };
    const buffer = Buffer.from(JSON.stringify(merged, null, 2), "utf-8");

    await supabaseAdmin.storage
      .from("documents")
      .upload(SOUND_CONFIG_STORAGE_PATH, buffer, {
        contentType: "application/json",
        upsert: true,
      });
  } catch (err) {
    console.warn("[writeSoundConfigToStorage] storage config write warning:", err);
  }
}

export const getGlobalReminderSoundSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // 1. Try reading from app_settings
    let dbRow: any = null;
    try {
      const { data } = await (context.supabase as any)
        .from("app_settings")
        .select("alert_sound_tone, custom_audio_url, custom_audio_name, alert_sound_volume, alert_sound_enabled, desktop_notifications, leads_sound_enabled, orders_sound_enabled, leads_ringtone, leads_custom_url, leads_custom_name, orders_ringtone, orders_custom_url, orders_custom_name")
        .eq("id", 1)
        .maybeSingle();

      if (data && (data as any).alert_sound_tone) {
        dbRow = data;
      }
    } catch {}

    // 2. Fallback / supplement from Storage config file
    const storageConfig = await readSoundConfigFromStorage();

    const enabled = dbRow?.alert_sound_enabled ?? storageConfig?.enabled ?? true;
    const tone = (dbRow?.alert_sound_tone || storageConfig?.tone || "chime") as GlobalSoundConfig["tone"];
    const volume = typeof dbRow?.alert_sound_volume === "number"
      ? dbRow.alert_sound_volume
      : (storageConfig?.volume ?? 0.8);
    const desktopNotifications = dbRow?.desktop_notifications ?? storageConfig?.desktopNotifications ?? true;
    const customAudioUrl = dbRow?.custom_audio_url || storageConfig?.customAudioUrl || null;
    const customAudioName = dbRow?.custom_audio_name || storageConfig?.customAudioName || null;

    const leadsSoundEnabled = dbRow?.leads_sound_enabled ?? storageConfig?.leadsSoundEnabled ?? true;
    const ordersSoundEnabled = dbRow?.orders_sound_enabled ?? storageConfig?.ordersSoundEnabled ?? true;
    const leadsToastEnabled = dbRow?.leads_toast_enabled ?? storageConfig?.leadsToastEnabled ?? true;
    const ordersToastEnabled = dbRow?.orders_toast_enabled ?? storageConfig?.ordersToastEnabled ?? true;
    const leadsRingtone = dbRow?.leads_ringtone || storageConfig?.leadsRingtone || "chime";
    const leadsCustomUrl = dbRow?.leads_custom_url || storageConfig?.leadsCustomUrl || null;
    const leadsCustomName = dbRow?.leads_custom_name || storageConfig?.leadsCustomName || null;
    const ordersRingtone = dbRow?.orders_ringtone || storageConfig?.ordersRingtone || "bell";
    const ordersCustomUrl = dbRow?.orders_custom_url || storageConfig?.ordersCustomUrl || null;
    const ordersCustomName = dbRow?.orders_custom_name || storageConfig?.ordersCustomName || null;

    return {
      enabled: enabled !== false,
      tone,
      volume,
      desktopNotifications: desktopNotifications !== false,
      customAudioUrl,
      customAudioName,
      leadsSoundEnabled: leadsSoundEnabled !== false,
      ordersSoundEnabled: ordersSoundEnabled !== false,
      leadsToastEnabled: leadsToastEnabled !== false,
      ordersToastEnabled: ordersToastEnabled !== false,
      leadsRingtone,
      leadsCustomUrl,
      leadsCustomName,
      ordersRingtone,
      ordersCustomUrl,
      ordersCustomName,
    };
  });

export const saveGlobalReminderSoundSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      enabled: z.boolean().optional(),
      tone: z.enum(["chime", "bell", "digital_ring", "radar", "soft_ping", "custom"]).optional(),
      volume: z.number().min(0).max(1).optional(),
      desktopNotifications: z.boolean().optional(),
      customAudioUrl: z.string().nullable().optional(),
      customAudioName: z.string().nullable().optional(),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    // 1. Persist to storage config file (guaranteed across all servers)
    await writeSoundConfigToStorage({
      enabled: data.enabled,
      tone: data.tone,
      volume: data.volume,
      desktopNotifications: data.desktopNotifications,
      customAudioUrl: data.customAudioUrl,
      customAudioName: data.customAudioName,
    });

    // 2. Persist to app_settings table
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const updatePayload: Record<string, any> = {
        id: 1,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      };

      if (data.enabled !== undefined) updatePayload.alert_sound_enabled = data.enabled;
      if (data.tone !== undefined) updatePayload.alert_sound_tone = data.tone;
      if (data.volume !== undefined) updatePayload.alert_sound_volume = data.volume;
      if (data.desktopNotifications !== undefined) updatePayload.desktop_notifications = data.desktopNotifications;
      if (data.customAudioUrl !== undefined) updatePayload.custom_audio_url = data.customAudioUrl;
      if (data.customAudioName !== undefined) updatePayload.custom_audio_name = data.customAudioName;

      await supabaseAdmin
        .from("app_settings")
        .upsert(updatePayload as never, { onConflict: "id" });
    } catch (err) {
      console.warn("[saveGlobalReminderSoundSettings] app_settings write warning:", err);
    }

    return { ok: true, ...data };
  });

export const uploadAlertAudioFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      fileName: z.string().min(1),
      base64Data: z.string().min(1),
      target: z.enum(["reminder", "lead", "order"]).default("reminder"),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Clean base64 string
    const match = data.base64Data.match(/^data:([^;]+);base64,(.+)$/);
    const mimeType = match ? match[1] : "audio/mpeg";
    const rawBase64 = match ? match[2] : data.base64Data;
    const buffer = Buffer.from(rawBase64, "base64");

    const extMatch = data.fileName.match(/\.(mp3|wav|ogg|m4a|aac)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : "mp3";
    const safeName = `${data.target}-sound-latest.${ext}`;
    const storagePath = `audio/${safeName}`;

    // Upload audio binary to 'documents' bucket
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("documents")
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadErr) {
      console.error("[uploadAlertAudioFile] storage error:", uploadErr);
      throw new Error(`Failed to upload audio: ${uploadErr.message}`);
    }

    // Public API route to stream this audio to all devices
    const publicUrl = `/api/public/audio/${safeName}`;

    // Update Storage Config
    const configUpdate: Partial<GlobalSoundConfig> = {};
    if (data.target === "reminder") {
      configUpdate.customAudioUrl = publicUrl;
      configUpdate.customAudioName = data.fileName;
      configUpdate.tone = "custom";
    } else if (data.target === "lead") {
      configUpdate.leadsCustomUrl = publicUrl;
      configUpdate.leadsCustomName = data.fileName;
      configUpdate.leadsRingtone = "custom";
    } else if (data.target === "order") {
      configUpdate.ordersCustomUrl = publicUrl;
      configUpdate.ordersCustomName = data.fileName;
      configUpdate.ordersRingtone = "custom";
    }
    await writeSoundConfigToStorage(configUpdate);

    // Update app_settings table
    try {
      const updatePayload: Record<string, any> = {
        id: 1,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      };

      if (data.target === "reminder") {
        updatePayload.custom_audio_url = publicUrl;
        updatePayload.custom_audio_name = data.fileName;
        updatePayload.alert_sound_tone = "custom";
      } else if (data.target === "lead") {
        updatePayload.leads_custom_url = publicUrl;
        updatePayload.leads_custom_name = data.fileName;
        updatePayload.leads_ringtone = "custom";
      } else if (data.target === "order") {
        updatePayload.orders_custom_url = publicUrl;
        updatePayload.orders_custom_name = data.fileName;
        updatePayload.orders_ringtone = "custom";
      }

      await supabaseAdmin
        .from("app_settings")
        .upsert(updatePayload as never, { onConflict: "id" });
    } catch {}

    return {
      ok: true,
      url: publicUrl,
      fileName: data.fileName,
      storagePath,
    };
  });

export const updateSoundSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      leadsSoundEnabled: z.boolean(),
      ordersSoundEnabled: z.boolean(),
      leadsToastEnabled: z.boolean().optional(),
      ordersToastEnabled: z.boolean().optional(),
      leadsRingtone: z.enum(["chime", "bell", "alert", "ding", "soft", "custom"]),
      leadsCustomUrl: z.string().optional().nullable(),
      leadsCustomName: z.string().optional().nullable(),
      ordersRingtone: z.enum(["chime", "bell", "alert", "ding", "soft", "custom"]),
      ordersCustomUrl: z.string().optional().nullable(),
      ordersCustomName: z.string().optional().nullable(),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    // 1. Storage config
    await writeSoundConfigToStorage({
      leadsSoundEnabled: data.leadsSoundEnabled,
      ordersSoundEnabled: data.ordersSoundEnabled,
      leadsToastEnabled: data.leadsToastEnabled !== false,
      ordersToastEnabled: data.ordersToastEnabled !== false,
      leadsRingtone: data.leadsRingtone,
      leadsCustomUrl: data.leadsCustomUrl || null,
      leadsCustomName: data.leadsCustomName || null,
      ordersRingtone: data.ordersRingtone,
      ordersCustomUrl: data.ordersCustomUrl || null,
      ordersCustomName: data.ordersCustomName || null,
    });

    // 2. DB table
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("app_settings")
        .upsert(
          {
            id: 1,
            leads_sound_enabled: data.leadsSoundEnabled,
            orders_sound_enabled: data.ordersSoundEnabled,
            leads_toast_enabled: data.leadsToastEnabled !== false,
            orders_toast_enabled: data.ordersToastEnabled !== false,
            leads_ringtone: data.leadsRingtone,
            leads_custom_url: data.leadsCustomUrl || null,
            leads_custom_name: data.leadsCustomName || null,
            ordersRingtone: data.ordersRingtone,
            orders_custom_url: data.ordersCustomUrl || null,
            orders_custom_name: data.ordersCustomName || null,
            updated_at: new Date().toISOString(),
            updated_by: context.userId,
          } as never,
          { onConflict: "id" },
        );
    } catch {}

    return { ok: true, ...data };
  });

const CALLBACK_PRESETS_STORAGE_PATH = "config/callback-presets.json";

export interface CallbackReminderPresetConfig {
  quickMinutes: number;
  recommendedHours: number;
  afternoonHours: number; // Slot 3: Afternoon
  beforeShiftEndHours: number; // Slot 4: Before Shift End (X hours)
  tomorrowDefaultTime: string; // "HH:MM" e.g. "10:30"
  eveningHours?: number; // legacy fallback
  laterTodayHours?: number; // legacy fallback
}

export const DEFAULT_CALLBACK_PRESET_CONFIG: CallbackReminderPresetConfig = {
  quickMinutes: 60,
  recommendedHours: 2,
  afternoonHours: 3,
  beforeShiftEndHours: 4,
  tomorrowDefaultTime: "10:30",
};

async function readCallbackPresetsFromStorage(): Promise<CallbackReminderPresetConfig | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.storage
      .from("documents")
      .download(CALLBACK_PRESETS_STORAGE_PATH);

    if (error || !data) return null;
    const text = await data.text();
    return JSON.parse(text) as CallbackReminderPresetConfig;
  } catch {
    return null;
  }
}

async function writeCallbackPresetsToStorage(config: Partial<CallbackReminderPresetConfig>): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const existing = (await readCallbackPresetsFromStorage()) || DEFAULT_CALLBACK_PRESET_CONFIG;
    const merged = { ...existing, ...config };
    const buffer = Buffer.from(JSON.stringify(merged, null, 2), "utf-8");

    await supabaseAdmin.storage
      .from("documents")
      .upload(CALLBACK_PRESETS_STORAGE_PATH, buffer, {
        contentType: "application/json",
        upsert: true,
      });
  } catch (err) {
    console.warn("[writeCallbackPresetsToStorage] storage config write warning:", err);
  }
}

export const getCallbackReminderPresetSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const storageConfig = await readCallbackPresetsFromStorage();
    const afternoonHours = storageConfig?.afternoonHours ?? (storageConfig as any)?.eveningHours ?? DEFAULT_CALLBACK_PRESET_CONFIG.afternoonHours;
    const beforeShiftEndHours = storageConfig?.beforeShiftEndHours ?? (storageConfig as any)?.laterTodayHours ?? DEFAULT_CALLBACK_PRESET_CONFIG.beforeShiftEndHours;
    return {
      quickMinutes: storageConfig?.quickMinutes ?? DEFAULT_CALLBACK_PRESET_CONFIG.quickMinutes,
      recommendedHours: storageConfig?.recommendedHours ?? DEFAULT_CALLBACK_PRESET_CONFIG.recommendedHours,
      afternoonHours,
      eveningHours: afternoonHours, // alias
      beforeShiftEndHours,
      laterTodayHours: beforeShiftEndHours, // alias
      tomorrowDefaultTime: storageConfig?.tomorrowDefaultTime ?? DEFAULT_CALLBACK_PRESET_CONFIG.tomorrowDefaultTime,
    };
  });

export const saveCallbackReminderPresetSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      quickMinutes: z.number().min(1).max(1440),
      recommendedHours: z.number().min(0.1).max(72),
      afternoonHours: z.number().min(0.1).max(72).optional(),
      eveningHours: z.number().min(0.1).max(72).optional(),
      beforeShiftEndHours: z.number().min(0.1).max(72).optional(),
      laterTodayHours: z.number().min(0.1).max(72).optional(),
      tomorrowDefaultTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    }).transform((d) => ({
      quickMinutes: d.quickMinutes,
      recommendedHours: d.recommendedHours,
      afternoonHours: d.afternoonHours ?? d.eveningHours ?? 3,
      beforeShiftEndHours: d.beforeShiftEndHours ?? d.laterTodayHours ?? 4,
      tomorrowDefaultTime: d.tomorrowDefaultTime,
    })).parse(raw),
  )
  .handler(async ({ data }) => {
    await writeCallbackPresetsToStorage(data);
    return { ok: true, ...data };
  });

