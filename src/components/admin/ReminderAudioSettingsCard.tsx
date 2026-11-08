import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Volume2,
  VolumeX,
  Play,
  BellRing,
  Check,
  Upload,
  Music,
  Trash2,
  FileAudio,
  Loader2,
} from "lucide-react";
import { SectionCard } from "@/components/admin/ui";
import {
  getSoundSettings,
  saveSoundSettings,
  syncGlobalSoundSettings,
  playReminderSound,
  showDesktopNotification,
  type SoundTone,
  type SoundSettings,
} from "@/lib/audio/reminder-sounds";
import {
  getGlobalReminderSoundSettings,
  saveGlobalReminderSoundSettings,
  uploadAlertAudioFile,
} from "@/lib/settings/app-settings.functions";

const BUILTIN_SOUND_OPTIONS: { id: SoundTone; label: string; description: string }[] = [
  { id: "chime", label: "Harmonic Chime (Default)", description: "3-note melodic chime (pleasant & clear)" },
  { id: "bell", label: "Crystal Bell", description: "High-resonance ringing alert bell" },
  { id: "digital_ring", label: "Digital Ring", description: "Urgent dual-pulse digital beep" },
  { id: "radar", label: "Radar Pulse", description: "Modern sweeping radar ping" },
  { id: "soft_ping", label: "Soft Ping", description: "Subtle non-intrusive soft tone" },
];

export function ReminderAudioSettingsCard() {
  const qc = useQueryClient();
  const fetchGlobalSettingsFn = useServerFn(getGlobalReminderSoundSettings);
  const saveGlobalSettingsFn = useServerFn(saveGlobalReminderSoundSettings);
  const uploadAudioFn = useServerFn(uploadAlertAudioFile);

  const [settings, setSettings] = useState<SoundSettings>(getSoundSettings);
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch server-persisted settings
  const { data: serverSettings, isLoading } = useQuery({
    queryKey: ["global-reminder-sound-settings"],
    queryFn: () => fetchGlobalSettingsFn(),
    staleTime: 10_000,
  });

  useEffect(() => {
    if (serverSettings) {
      const merged = syncGlobalSoundSettings({
        enabled: serverSettings.enabled,
        tone: serverSettings.tone,
        volume: serverSettings.volume,
        desktopNotifications: serverSettings.desktopNotifications,
        customAudioUrl: serverSettings.customAudioUrl,
        customAudioName: serverSettings.customAudioName,
      });
      setSettings(merged);
    }
  }, [serverSettings]);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setHasPermission(Notification.permission === "granted");
    }
  }, []);

  const handleSave = async (overrideSettings?: SoundSettings) => {
    const toSave = overrideSettings || settings;
    setIsSaving(true);
    try {
      saveSoundSettings(toSave);
      await saveGlobalSettingsFn({
        data: {
          enabled: toSave.enabled,
          tone: toSave.tone,
          volume: toSave.volume,
          desktopNotifications: toSave.desktopNotifications,
          customAudioUrl: toSave.customAudioUrl,
          customAudioName: toSave.customAudioName,
        },
      });
      await qc.invalidateQueries({ queryKey: ["global-reminder-sound-settings"] });
      toast.success("✅ Sound settings saved & synced across all employees!");
    } catch (err: any) {
      console.warn("[ReminderAudioSettingsCard] save error:", err);
      toast.error(err.message || "Failed to save to server");
    } finally {
      setIsSaving(false);
    }
  };

  const update = async (partial: Partial<SoundSettings>) => {
    const updated = saveSoundSettings(partial);
    setSettings(updated);

    try {
      await saveGlobalSettingsFn({
        data: {
          enabled: updated.enabled,
          tone: updated.tone,
          volume: updated.volume,
          desktopNotifications: updated.desktopNotifications,
          customAudioUrl: updated.customAudioUrl,
          customAudioName: updated.customAudioName,
        },
      });
      qc.invalidateQueries({ queryKey: ["global-reminder-sound-settings"] });
      toast.success("Sound settings synced");
    } catch (err) {
      console.warn("[ReminderAudioSettingsCard] server save warning:", err);
    }
  };

  const handleTest = (tone?: SoundTone) => {
    playReminderSound(tone ?? settings.tone, settings.volume, settings.customAudioUrl);
    toast.info(`Playing preview for ${tone ?? settings.tone}`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate audio file type
    if (!file.type.startsWith("audio/") && !file.name.match(/\.(mp3|wav|ogg|m4a|aac)$/i)) {
      toast.error("Please upload a valid audio file (.mp3, .wav, .ogg, .m4a, .aac)");
      return;
    }

    // Limit to 5MB
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Audio file size should be less than 5MB");
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;

      try {
        // Upload to backend storage so all employee devices receive it
        const res = await uploadAudioFn({
          data: {
            fileName: file.name,
            base64Data: dataUrl,
            target: "reminder",
          },
        });

        const updated = saveSoundSettings({
          customAudioUrl: res.url,
          customAudioName: file.name,
          tone: "custom",
        });
        setSettings(updated);
        qc.invalidateQueries({ queryKey: ["global-reminder-sound-settings"] });
        toast.success(`Custom audio "${file.name}" uploaded and synced across all staff!`);
        playReminderSound("custom", updated.volume, res.url);
      } catch (err: any) {
        console.warn("[handleFileUpload] backend upload fallback to dataUrl:", err);
        // Fallback to dataUrl
        const updated = saveSoundSettings({
          customAudioUrl: dataUrl,
          customAudioName: file.name,
          tone: "custom",
        });
        setSettings(updated);
        toast.success(`Custom audio "${file.name}" applied!`);
        playReminderSound("custom", updated.volume, dataUrl);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    reader.onerror = () => {
      setIsUploading(false);
      toast.error("Failed to read audio file");
    };

    reader.readAsDataURL(file);
  };

  const handleRemoveCustomAudio = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await update({
      customAudioUrl: null,
      customAudioName: null,
      tone: "chime",
    });
    toast.info("Custom audio removed. Reset to default Harmonic Chime.");
  };

  const requestPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return toast.error("Desktop notifications are not supported in this browser");
    }
    const res = await Notification.requestPermission();
    setHasPermission(res === "granted");
    if (res === "granted") {
      toast.success("Desktop notifications enabled!");
      showDesktopNotification("🔥 Hot Order Alerts Enabled", {
        body: "You will now receive desktop popup notifications when a customer callback is due.",
      });
    } else {
      toast.error("Notification permission denied in browser");
    }
  };

  return (
    <SectionCard
      title="🔔 Order Callback & Hot Order Audio Alerts"
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleTest()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer shadow-2xs"
          >
            <Play className="size-3.5" /> Test Sound Alert
          </button>
          <button
            type="button"
            disabled={isSaving || isUploading}
            onClick={() => handleSave()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            {isSaving ? "Saving..." : "Save Sound Settings"}
          </button>
        </div>
      }
    >
      <div className="p-5 space-y-6 text-slate-800">
        <div className="text-xs text-slate-600">
          Configure the sound and screen notifications triggered on employee laptops whenever a customer callback reminder ends and the order transitions into a <b className="text-rose-600">🔥 Hot Order</b>. Uploaded ringtones automatically synchronize across all staff browsers.
        </div>

        {/* 1. Tone Selector & Custom Sound Upload */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Alert Sound Tone &amp; Custom Ringtones
            </label>

            <button
              type="button"
              disabled={isUploading || isLoading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg transition shadow-2xs cursor-pointer disabled:opacity-60"
            >
              {isUploading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin text-blue-600" /> Uploading Sound...
                </>
              ) : (
                <>
                  <Upload className="size-3.5" /> Upload Custom Audio (.mp3/.wav)
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Custom Uploaded Tone Card (if uploaded) */}
            {settings.customAudioUrl && (
              <div
                onClick={() => {
                  update({ tone: "custom" });
                  playReminderSound("custom", settings.volume, settings.customAudioUrl);
                }}
                className={`relative flex flex-col justify-between rounded-xl border p-3.5 transition cursor-pointer select-none ${
                  settings.tone === "custom"
                    ? "border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20 shadow-xs"
                    : "border-slate-200 bg-slate-50/40 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-900 truncate">
                      <Music className="size-3.5 text-emerald-600 shrink-0" />
                      {settings.customAudioName || "Custom Audio Ringtone"}
                    </span>
                    {settings.tone === "custom" && <Check className="size-4 text-emerald-600 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Company-wide uploaded alert sound file
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={handleRemoveCustomAudio}
                    className="inline-flex items-center gap-1 text-[10px] text-rose-600 hover:text-rose-700 font-semibold p-1 hover:bg-rose-50 rounded cursor-pointer"
                    title="Remove custom audio"
                  >
                    <Trash2 className="size-3" /> Remove
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTest("custom");
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 shadow-2xs cursor-pointer"
                  >
                    <Play className="size-2.5" /> Play
                  </button>
                </div>
              </div>
            )}

            {/* Built-in Tones */}
            {BUILTIN_SOUND_OPTIONS.map((opt) => {
              const isSelected = settings.tone === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => {
                    update({ tone: opt.id });
                    playReminderSound(opt.id, settings.volume);
                  }}
                  className={`relative flex flex-col justify-between rounded-xl border p-3.5 transition cursor-pointer select-none ${
                    isSelected
                      ? "border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20 shadow-xs"
                      : "border-slate-200 bg-slate-50/40 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${isSelected ? "text-blue-950" : "text-slate-800"}`}>
                        {opt.label}
                      </span>
                      {isSelected && <Check className="size-4 text-blue-600" />}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {opt.description}
                    </p>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTest(opt.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 shadow-2xs cursor-pointer"
                    >
                      <Play className="size-2.5" /> Play
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick upload dropzone hint */}
          {!settings.customAudioUrl && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-3 text-xs text-slate-500 hover:bg-slate-50 hover:border-blue-400 cursor-pointer transition"
            >
              <FileAudio className="size-4 text-slate-400" />
              <span>Want your own sound? Click here to upload an <b>MP3 / WAV / OGG</b> custom ringtone for all employee laptops.</span>
            </div>
          )}
        </div>

        {/* 2. Volume Slider & Enable Toggle */}
        <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                {settings.volume === 0 || !settings.enabled ? <VolumeX className="size-4 text-slate-400" /> : <Volume2 className="size-4 text-slate-700" />}
                Alert Volume ({Math.round(settings.volume * 100)}%)
              </label>
              <button
                type="button"
                onClick={() => update({ enabled: !settings.enabled })}
                className={`text-[11px] font-bold px-2 py-0.5 rounded cursor-pointer transition ${
                  settings.enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                }`}
              >
                {settings.enabled ? "Sound: ON" : "Sound: MUTED"}
              </button>
            </div>

            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(e) => update({ volume: parseFloat(e.target.value) })}
              className="w-full accent-blue-600 cursor-pointer"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <BellRing className="size-4 text-slate-700" />
                Browser Desktop Notifications
              </label>
              {hasPermission ? (
                <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Allowed
                </span>
              ) : (
                <button
                  type="button"
                  onClick={requestPermission}
                  className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-blue-700 cursor-pointer"
                >
                  Enable Notifications
                </button>
              )}
            </div>

            <p className="text-[11px] text-slate-500">
              Allows the browser to pop up system banner alerts when callbacks are due, even if you are working on another tab or window.
            </p>
          </div>
        </div>

        {/* 3. Explicit Bottom Action Bar */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Current Alert Tone: <b className="text-slate-800 font-semibold">{settings.tone === "custom" ? (settings.customAudioName || "Custom Uploaded Audio") : BUILTIN_SOUND_OPTIONS.find((o) => o.id === settings.tone)?.label || settings.tone}</b>
          </div>
          <button
            type="button"
            disabled={isSaving || isUploading}
            onClick={() => handleSave()}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-xs font-bold text-white shadow-md transition cursor-pointer disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {isSaving ? "Saving Settings..." : "Save Sound Settings for All Employees"}
          </button>
        </div>
      </div>
    </SectionCard>
  );
}
