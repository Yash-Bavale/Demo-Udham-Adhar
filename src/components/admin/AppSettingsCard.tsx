import { useEffect, useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getAppSettings,
  updateCustomerDelayAutocloseMinutes,
  updateSoundSettings,
  getGlobalReminderSoundSettings,
  uploadAlertAudioFile,
  getCallbackReminderPresetSettings,
  saveCallbackReminderPresetSettings,
  type CallbackReminderPresetConfig,
  DEFAULT_CALLBACK_PRESET_CONFIG,
} from "@/lib/settings/app-settings.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Timer, Volume2, VolumeX, Bell, Play, Upload, Music, Check, Loader2, Clock, Calendar, Zap, Sparkles } from "lucide-react";
import { playNotificationSound, type RingtoneTone } from "@/hooks/useNotifications";

function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function hhmmToMinutes(v: string): number | null {
  const m = /^(\d{1,3}):([0-5]?\d)$/.exec(v.trim());
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  if (mins < 1 || mins > 10080) return null;
  return mins;
}

export function AppSettingsCard() {
  const fetchSettings = useServerFn(getAppSettings);
  const fetchGlobalSound = useServerFn(getGlobalReminderSoundSettings);
  const fetchPresetsFn = useServerFn(getCallbackReminderPresetSettings);
  const saveMinutes = useServerFn(updateCustomerDelayAutocloseMinutes);
  const saveSound = useServerFn(updateSoundSettings);
  const savePresetsFn = useServerFn(saveCallbackReminderPresetSettings);
  const uploadAudio = useServerFn(uploadAlertAudioFile);

  const [value, setValue] = useState("08:00");
  const [callbackPresets, setCallbackPresets] = useState<CallbackReminderPresetConfig>(DEFAULT_CALLBACK_PRESET_CONFIG);
  const [savingPresets, setSavingPresets] = useState(false);

  const [leadsToast, setLeadsToast] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("udyam.toast.leads") !== "false";
  });
  const [ordersToast, setOrdersToast] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("udyam.toast.orders") !== "false";
  });

  const [leadsSound, setLeadsSound] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("udyam.sound.leads") !== "false";
  });
  const [ordersSound, setOrdersSound] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("udyam.sound.orders") !== "false";
  });
  const [leadsRingtone, setLeadsRingtone] = useState<RingtoneTone>(() => {
    if (typeof window === "undefined") return "chime";
    return (localStorage.getItem("udyam.sound.leads_ringtone") as RingtoneTone) || "chime";
  });
  const [leadsCustomUrl, setLeadsCustomUrl] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("udyam.sound.leads_custom_url") || "";
  });
  const [ordersRingtone, setOrdersRingtone] = useState<RingtoneTone>(() => {
    if (typeof window === "undefined") return "bell";
    return (localStorage.getItem("udyam.sound.orders_ringtone") as RingtoneTone) || "bell";
  });
  const [ordersCustomUrl, setOrdersCustomUrl] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("udyam.sound.orders_custom_url") || "";
  });

  const [leadFileName, setLeadFileName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("udyam.sound.leads_file_name") || "";
  });
  const [orderFileName, setOrderFileName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("udyam.sound.orders_file_name") || "";
  });

  const leadFileRef = useRef<HTMLInputElement>(null);
  const orderFileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSound, setSavingSound] = useState(false);
  const [uploadingLead, setUploadingLead] = useState(false);
  const [uploadingOrder, setUploadingOrder] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchSettings(), fetchGlobalSound(), fetchPresetsFn()])
      .then(([settingsRes, soundRes, presetsRes]) => {
        if (cancelled) return;
        if (settingsRes.status === "fulfilled") {
          setValue(minutesToHHMM(settingsRes.value.customerDelayAutocloseMinutes));
        }
        if (presetsRes.status === "fulfilled") {
          setCallbackPresets(presetsRes.value);
        }
        if (soundRes.status === "fulfilled") {
          const s = soundRes.value;
          if (s.leadsSoundEnabled !== undefined) setLeadsSound(s.leadsSoundEnabled);
          if (s.ordersSoundEnabled !== undefined) setOrdersSound(s.ordersSoundEnabled);
          if (s.leadsToastEnabled !== undefined) setLeadsToast(s.leadsToastEnabled);
          if (s.ordersToastEnabled !== undefined) setOrdersToast(s.ordersToastEnabled);
          if (s.leadsRingtone) setLeadsRingtone(s.leadsRingtone as RingtoneTone);
          if (s.leadsCustomUrl) setLeadsCustomUrl(s.leadsCustomUrl);
          if (s.leadsCustomName) setLeadFileName(s.leadsCustomName);
          if (s.ordersRingtone) setOrdersRingtone(s.ordersRingtone as RingtoneTone);
          if (s.ordersCustomUrl) setOrdersCustomUrl(s.ordersCustomUrl);
          if (s.ordersCustomName) setOrderFileName(s.ordersCustomName);

          // Sync local storage
          localStorage.setItem("udyam.sound.leads", String(s.leadsSoundEnabled !== false));
          localStorage.setItem("udyam.sound.orders", String(s.ordersSoundEnabled !== false));
          localStorage.setItem("udyam.toast.leads", String(s.leadsToastEnabled !== false));
          localStorage.setItem("udyam.toast.orders", String(s.ordersToastEnabled !== false));
          if (s.leadsRingtone) localStorage.setItem("udyam.sound.leads_ringtone", s.leadsRingtone);
          if (s.leadsCustomUrl) localStorage.setItem("udyam.sound.leads_custom_url", s.leadsCustomUrl);
          if (s.leadsCustomName) localStorage.setItem("udyam.sound.leads_file_name", s.leadsCustomName);
          if (s.ordersRingtone) localStorage.setItem("udyam.sound.orders_ringtone", s.ordersRingtone);
          if (s.ordersCustomUrl) localStorage.setItem("udyam.sound.orders_custom_url", s.ordersCustomUrl);
          if (s.ordersCustomName) localStorage.setItem("udyam.sound.orders_file_name", s.ordersCustomName);
        }
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchSettings, fetchGlobalSound, fetchPresetsFn]);

  async function onSaveCallbackPresets() {
    setSavingPresets(true);
    try {
      await savePresetsFn({ data: callbackPresets });
      toast.success("✅ Callback reminder duration presets saved & synced company-wide!");
    } catch (e) {
      toast.error((e as Error).message || "Failed to save callback presets");
    } finally {
      setSavingPresets(false);
    }
  }

  async function onSaveMinutes() {
    const mins = hhmmToMinutes(value);
    if (mins === null) {
      toast.error("Enter time as HH:MM (min 00:01, max 168:00)");
      return;
    }
    setSaving(true);
    try {
      await saveMinutes({ data: { minutes: mins } });
      toast.success(`Customer-delay auto-close set to ${minutesToHHMM(mins)} (business hours)`);
    } catch (e) {
      toast.error((e as Error).message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveSoundSettings() {
    setSavingSound(true);
    try {
      await saveSound({
        data: {
          leadsSoundEnabled: leadsSound,
          ordersSoundEnabled: ordersSound,
          leadsToastEnabled: leadsToast,
          ordersToastEnabled: ordersToast,
          leadsRingtone,
          leadsCustomUrl,
          leadsCustomName: leadFileName,
          ordersRingtone,
          ordersCustomUrl,
          ordersCustomName: orderFileName,
        },
      });

      // Update local storage for active browser tab
      localStorage.setItem("udyam.sound.leads", String(leadsSound));
      localStorage.setItem("udyam.sound.orders", String(ordersSound));
      localStorage.setItem("udyam.toast.leads", String(leadsToast));
      localStorage.setItem("udyam.toast.orders", String(ordersToast));
      localStorage.setItem("udyam.sound.leads_ringtone", leadsRingtone);
      localStorage.setItem("udyam.sound.leads_custom_url", leadsCustomUrl);
      localStorage.setItem("udyam.sound.leads_file_name", leadFileName);
      localStorage.setItem("udyam.sound.orders_ringtone", ordersRingtone);
      localStorage.setItem("udyam.sound.orders_custom_url", ordersCustomUrl);
      localStorage.setItem("udyam.sound.orders_file_name", orderFileName);

      toast.success("Notification sound & Screen toast settings saved & synced company-wide!");
    } catch (e) {
      toast.error((e as Error).message || "Failed to save sound settings");
    } finally {
      setSavingSound(false);
    }
  }

  const handleLeadFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Audio file size should be less than 10MB");
      return;
    }

    setUploadingLead(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const dataUrl = evt.target?.result as string;
      if (dataUrl) {
        try {
          const res = await uploadAudio({
            data: {
              fileName: file.name,
              base64Data: dataUrl,
              target: "lead",
            },
          });
          setLeadsCustomUrl(res.url);
          setLeadsRingtone("custom");
          setLeadFileName(file.name);
          localStorage.setItem("udyam.sound.leads_custom_url", res.url);
          localStorage.setItem("udyam.sound.leads_ringtone", "custom");
          localStorage.setItem("udyam.sound.leads_file_name", file.name);
          toast.success(`Uploaded & synced Lead MP3 ringtone: ${file.name}`);
          playNotificationSound("preview", "custom", res.url);
        } catch (err: any) {
          setLeadsCustomUrl(dataUrl);
          setLeadsRingtone("custom");
          setLeadFileName(file.name);
          localStorage.setItem("udyam.sound.leads_custom_url", dataUrl);
          localStorage.setItem("udyam.sound.leads_ringtone", "custom");
          localStorage.setItem("udyam.sound.leads_file_name", file.name);
          toast.success(`Applied Lead MP3 ringtone: ${file.name}`);
          playNotificationSound("preview", "custom", dataUrl);
        } finally {
          setUploadingLead(false);
        }
      }
    };
    reader.onerror = () => {
      setUploadingLead(false);
      toast.error("Failed to read audio file");
    };
    reader.readAsDataURL(file);
  };

  const handleOrderFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Audio file size should be less than 10MB");
      return;
    }

    setUploadingOrder(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const dataUrl = evt.target?.result as string;
      if (dataUrl) {
        try {
          const res = await uploadAudio({
            data: {
              fileName: file.name,
              base64Data: dataUrl,
              target: "order",
            },
          });
          setOrdersCustomUrl(res.url);
          setOrdersRingtone("custom");
          setOrderFileName(file.name);
          localStorage.setItem("udyam.sound.orders_custom_url", res.url);
          localStorage.setItem("udyam.sound.orders_ringtone", "custom");
          localStorage.setItem("udyam.sound.orders_file_name", file.name);
          toast.success(`Uploaded & synced Order MP3 ringtone: ${file.name}`);
          playNotificationSound("preview", "custom", res.url);
        } catch (err: any) {
          setOrdersCustomUrl(dataUrl);
          setOrdersRingtone("custom");
          setOrderFileName(file.name);
          localStorage.setItem("udyam.sound.orders_custom_url", dataUrl);
          localStorage.setItem("udyam.sound.orders_ringtone", "custom");
          localStorage.setItem("udyam.sound.orders_file_name", file.name);
          toast.success(`Applied Order MP3 ringtone: ${file.name}`);
          playNotificationSound("preview", "custom", dataUrl);
        } finally {
          setUploadingOrder(false);
        }
      }
    };
    reader.onerror = () => {
      setUploadingOrder(false);
      toast.error("Failed to read audio file");
    };
    reader.readAsDataURL(file);
  };

  const handleTestLeadSound = () => {
    playNotificationSound("preview", leadsRingtone, leadsCustomUrl);
    toast.info(`Playing preview for Lead Sound (${leadsRingtone})`);
  };

  const handleTestOrderSound = () => {
    playNotificationSound("preview", ordersRingtone, ordersCustomUrl);
    toast.info(`Playing preview for Order Sound (${ordersRingtone})`);
  };

  return (
    <div className="space-y-6">
      {/* Sound Settings Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Volume2 className="h-4 w-4 text-amber-500" />
            Notification Sound &amp; Custom Ringtones
          </CardTitle>
          <Button onClick={onSaveSoundSettings} disabled={loading || savingSound} size="sm">
            {savingSound ? "Saving…" : "Save Sound Settings"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* LEADS SOUND CONFIGURATION */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  📢 New Lead Notification Sound
                </Label>
                <p className="text-xs text-slate-500">Alert sound played when a new lead arrives or is assigned</p>
              </div>
              <Switch checked={leadsSound} onCheckedChange={setLeadsSound} disabled={loading} />
            </div>

            {leadsSound && (
              <div className="pt-3 space-y-3 border-t border-slate-200/80">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-5 space-y-1">
                    <Label className="text-xs font-medium text-slate-700">Lead Ringtone Tone</Label>
                    <Select value={leadsRingtone} onValueChange={(v) => setLeadsRingtone(v as RingtoneTone)} disabled={loading}>
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Select tone..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="chime">🎵 Standard Double Chime</SelectItem>
                        <SelectItem value="bell">🔔 Resonant Bell Ring</SelectItem>
                        <SelectItem value="alert">🚨 High Alert Alarm</SelectItem>
                        <SelectItem value="ding">🎶 Soft Marimba Ding</SelectItem>
                        <SelectItem value="soft">🔉 Gentle Double Pulse</SelectItem>
                        <SelectItem value="custom">🎼 Custom MP3 File / Audio</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="md:col-span-4 flex gap-2">
                    <input
                      type="file"
                      ref={leadFileRef}
                      onChange={handleLeadFileUpload}
                      accept="audio/mp3,audio/mpeg,audio/wav,audio/*"
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => leadFileRef.current?.click()}
                      className="w-full gap-1.5 bg-white text-xs"
                    >
                      <Upload className="h-3.5 w-3.5 text-slate-600" /> Upload Lead MP3 File
                    </Button>
                  </div>

                  <div className="md:col-span-3">
                    <Button type="button" variant="outline" size="sm" onClick={handleTestLeadSound} className="w-full gap-1.5 bg-white text-xs">
                      <Play className="h-3.5 w-3.5 fill-current text-amber-500" /> Test Lead Sound
                    </Button>
                  </div>
                </div>

                {leadsRingtone === "custom" && (
                  <div className="space-y-1.5 bg-white p-2.5 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 flex items-center gap-1.5">
                        <Music className="h-3.5 w-3.5 text-amber-500" />
                        {leadFileName ? `MP3 File: ${leadFileName}` : "Direct MP3 Data URL / Link"}
                      </span>
                      {leadsCustomUrl && <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1"><Check className="h-3 w-3" /> Ready</span>}
                    </div>
                    <Input
                      value={leadsCustomUrl}
                      onChange={(e) => {
                        setLeadsCustomUrl(e.target.value);
                        localStorage.setItem("udyam.sound.leads_custom_url", e.target.value);
                      }}
                      placeholder="Upload MP3 file above or paste MP3 URL here (https://.../lead.mp3)"
                      className="text-xs font-mono bg-slate-50"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Lead Screen Toast Popup Switch */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200/80">
              <div className="space-y-0.5">
                <Label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  💬 Lead Screen Toast Popup (Bottom-Right Corner)
                </Label>
                <p className="text-[11px] text-slate-500">Show notification banner popup at the bottom right corner inside CRM when new lead arrives</p>
              </div>
              <Switch checked={leadsToast} onCheckedChange={setLeadsToast} disabled={loading} />
            </div>
          </div>

          {/* ORDERS SOUND CONFIGURATION */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  📦 New Order Notification Sound
                </Label>
                <p className="text-xs text-slate-500">Alert sound played when a new order arrives or status updates</p>
              </div>
              <Switch checked={ordersSound} onCheckedChange={setOrdersSound} disabled={loading} />
            </div>

            {ordersSound && (
              <div className="pt-3 space-y-3 border-t border-slate-200/80">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-5 space-y-1">
                    <Label className="text-xs font-medium text-slate-700">Order Ringtone Tone</Label>
                    <Select value={ordersRingtone} onValueChange={(v) => setOrdersRingtone(v as RingtoneTone)} disabled={loading}>
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Select tone..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="chime">🎵 Standard Double Chime</SelectItem>
                        <SelectItem value="bell">🔔 Resonant Bell Ring</SelectItem>
                        <SelectItem value="alert">🚨 High Alert Alarm</SelectItem>
                        <SelectItem value="ding">🎶 Soft Marimba Ding</SelectItem>
                        <SelectItem value="soft">🔉 Gentle Double Pulse</SelectItem>
                        <SelectItem value="custom">🎼 Custom MP3 File / Audio</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="md:col-span-4 flex gap-2">
                    <input
                      type="file"
                      ref={orderFileRef}
                      onChange={handleOrderFileUpload}
                      accept="audio/mp3,audio/mpeg,audio/wav,audio/*"
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => orderFileRef.current?.click()}
                      className="w-full gap-1.5 bg-white text-xs"
                    >
                      <Upload className="h-3.5 w-3.5 text-slate-600" /> Upload Order MP3 File
                    </Button>
                  </div>

                  <div className="md:col-span-3">
                    <Button type="button" variant="outline" size="sm" onClick={handleTestOrderSound} className="w-full gap-1.5 bg-white text-xs">
                      <Play className="h-3.5 w-3.5 fill-current text-indigo-500" /> Test Order Sound
                    </Button>
                  </div>
                </div>

                {ordersRingtone === "custom" && (
                  <div className="space-y-1.5 bg-white p-2.5 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 flex items-center gap-1.5">
                        <Music className="h-3.5 w-3.5 text-indigo-500" />
                        {orderFileName ? `MP3 File: ${orderFileName}` : "Direct MP3 Data URL / Link"}
                      </span>
                      {ordersCustomUrl && <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1"><Check className="h-3 w-3" /> Ready</span>}
                    </div>
                    <Input
                      value={ordersCustomUrl}
                      onChange={(e) => {
                        setOrdersCustomUrl(e.target.value);
                        localStorage.setItem("udyam.sound.orders_custom_url", e.target.value);
                      }}
                      placeholder="Upload MP3 file above or paste MP3 URL here (https://.../order.mp3)"
                      className="text-xs font-mono bg-slate-50"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Order Screen Toast Popup Switch */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200/80">
              <div className="space-y-0.5">
                <Label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  💬 Order Screen Toast Popup (Bottom-Right Corner)
                </Label>
                <p className="text-[11px] text-slate-500">Show notification banner popup at the bottom right corner inside CRM when new order arrives or updates</p>
              </div>
              <Switch checked={ordersToast} onCheckedChange={setOrdersToast} disabled={loading} />
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Upload any MP3 audio file directly from your computer or choose built-in ringtone chimes for lead & order alerts.
          </p>
        </CardContent>
      </Card>

      {/* Customer Callback & Reminder Duration Presets Card */}
      <Card className="border border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base text-slate-900 font-bold">
              <Clock className="h-5 w-5 text-blue-600" />
              Customer Callback Reminder Duration Presets
            </CardTitle>
            <Button
              type="button"
              onClick={onSaveCallbackPresets}
              disabled={loading || savingPresets}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs"
            >
              {savingPresets ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" /> Save Callback Presets
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure the default time options (Minutes &amp; Hours) displayed in the &ldquo;Schedule Customer Callback &amp; Reminder&rdquo; popup dialog across all employee workspaces.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Quick Preset (Minutes) */}
            <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <Label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>Slot 1: Quick</span>
                <span className="text-[10px] text-blue-600 font-mono font-bold">Minutes</span>
              </Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={callbackPresets.quickMinutes}
                  onChange={(e) =>
                    setCallbackPresets((prev) => ({
                      ...prev,
                      quickMinutes: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                  disabled={loading}
                  className="bg-white font-mono text-xs"
                />
                <span className="text-xs font-semibold text-slate-500">Mins</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Button label: <strong className="text-slate-800">+{callbackPresets.quickMinutes} Mins</strong>
              </p>
            </div>

            {/* Recommended Preset (Hours) */}
            <div className="space-y-1.5 p-3 rounded-xl bg-blue-50/50 border border-blue-200">
              <Label className="text-xs font-bold text-blue-950 flex items-center justify-between">
                <span>Slot 2: Recommended</span>
                <span className="text-[10px] text-blue-700 font-mono font-bold">Hours</span>
              </Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0.1}
                  step={0.5}
                  max={72}
                  value={callbackPresets.recommendedHours}
                  onChange={(e) =>
                    setCallbackPresets((prev) => ({
                      ...prev,
                      recommendedHours: Math.max(0.1, Number(e.target.value) || 1),
                    }))
                  }
                  disabled={loading}
                  className="bg-white font-mono text-xs"
                />
                <span className="text-xs font-semibold text-slate-500">Hours</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Button label: <strong className="text-slate-800">{callbackPresets.recommendedHours} {callbackPresets.recommendedHours === 1 ? "Hour" : "Hours"}</strong>
              </p>
            </div>

            {/* Afternoon Preset (Hours) */}
            <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <Label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>Slot 3: Afternoon</span>
                <span className="text-[10px] text-blue-600 font-mono font-bold">Hours</span>
              </Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0.1}
                  step={0.5}
                  max={72}
                  value={callbackPresets.afternoonHours ?? callbackPresets.eveningHours ?? 3}
                  onChange={(e) =>
                    setCallbackPresets((prev) => {
                      const v = Math.max(0.1, Number(e.target.value) || 1);
                      return { ...prev, afternoonHours: v, eveningHours: v };
                    })
                  }
                  disabled={loading}
                  className="bg-white font-mono text-xs"
                />
                <span className="text-xs font-semibold text-slate-500">Hours</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Button label: <strong className="text-slate-800">{callbackPresets.afternoonHours ?? callbackPresets.eveningHours ?? 3} {(callbackPresets.afternoonHours ?? callbackPresets.eveningHours ?? 3) === 1 ? "Hour" : "Hours"}</strong>
              </p>
            </div>

            {/* Before Shift End Preset (Hours) */}
            <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <Label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>Slot 4: Before Shift End</span>
                <span className="text-[10px] text-blue-600 font-mono font-bold">Hours</span>
              </Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0.1}
                  step={0.5}
                  max={72}
                  value={callbackPresets.beforeShiftEndHours ?? callbackPresets.laterTodayHours ?? 4}
                  onChange={(e) =>
                    setCallbackPresets((prev) => {
                      const v = Math.max(0.1, Number(e.target.value) || 1);
                      return { ...prev, beforeShiftEndHours: v, laterTodayHours: v };
                    })
                  }
                  disabled={loading}
                  className="bg-white font-mono text-xs"
                />
                <span className="text-xs font-semibold text-slate-500">Hours</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Button label: <strong className="text-slate-800">{callbackPresets.beforeShiftEndHours ?? callbackPresets.laterTodayHours ?? 4} {(callbackPresets.beforeShiftEndHours ?? callbackPresets.laterTodayHours ?? 4) === 1 ? "Hour" : "Hours"}</strong>
              </p>
            </div>

            {/* Tomorrow Default Time */}
            <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <Label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>Slot 5: Tomorrow</span>
                <span className="text-[10px] text-blue-600 font-mono font-bold">HH:MM</span>
              </Label>
              <Input
                type="time"
                value={callbackPresets.tomorrowDefaultTime}
                onChange={(e) =>
                  setCallbackPresets((prev) => ({
                    ...prev,
                    tomorrowDefaultTime: e.target.value || "10:30",
                  }))
                }
                disabled={loading}
                className="bg-white font-mono text-xs"
              />
              <p className="text-[11px] text-slate-500">
                Trigger time: <strong className="text-slate-800">{callbackPresets.tomorrowDefaultTime} Tomorrow</strong>
              </p>
            </div>
          </div>

          {/* Live Preview Bar */}
          <div className="p-3 bg-slate-900 rounded-xl text-white space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-teal-400" />
                Live Preview of Dialog Buttons (Section 2)
              </span>
              <span className="text-[11px] text-slate-400">Preview only</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              <div className="p-2 rounded-lg bg-slate-800 text-center border border-slate-700">
                <div className="text-[9px] uppercase font-semibold text-slate-400">Quick</div>
                <div className="text-xs font-bold text-white">+{callbackPresets.quickMinutes} Mins</div>
              </div>
              <div className="p-2 rounded-lg bg-blue-600 text-center border border-blue-500 text-white font-bold">
                <div className="text-[9px] uppercase font-semibold text-blue-100">Recommended</div>
                <div className="text-xs font-bold">{callbackPresets.recommendedHours} {callbackPresets.recommendedHours === 1 ? "Hour" : "Hours"}</div>
              </div>
              <div className="p-2 rounded-lg bg-slate-800 text-center border border-slate-700">
                <div className="text-[9px] uppercase font-semibold text-slate-400">Afternoon</div>
                <div className="text-xs font-bold text-white">{(callbackPresets.afternoonHours ?? callbackPresets.eveningHours ?? 3)} {((callbackPresets.afternoonHours ?? callbackPresets.eveningHours ?? 3) === 1 ? "Hour" : "Hours")}</div>
              </div>
              <div className="p-2 rounded-lg bg-slate-800 text-center border border-slate-700">
                <div className="text-[9px] uppercase font-semibold text-slate-400">Before Shift End</div>
                <div className="text-xs font-bold text-white">{(callbackPresets.beforeShiftEndHours ?? callbackPresets.laterTodayHours ?? 4)} {((callbackPresets.beforeShiftEndHours ?? callbackPresets.laterTodayHours ?? 4) === 1 ? "Hour" : "Hours")}</div>
              </div>
              <div className="p-2 rounded-lg bg-slate-800 text-center border border-slate-700">
                <div className="text-[9px] uppercase font-semibold text-slate-400">Tomorrow</div>
                <div className="text-xs font-bold text-white">{callbackPresets.tomorrowDefaultTime}</div>
              </div>
              <div className="p-2 rounded-lg bg-slate-800 text-center border border-slate-700 flex flex-col items-center justify-center">
                <Calendar className="size-3 text-slate-400 mb-0.5" />
                <div className="text-xs font-bold text-white">Custom</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auto-close Timers Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Timer className="h-4 w-4" />
            Timers &amp; Auto-close
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cust-delay-autoclose">Customer Delay auto-close (HH:MM, business hours)</Label>
            <div className="flex gap-2">
              <Input
                id="cust-delay-autoclose"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="08:00"
                disabled={loading}
                className="max-w-[140px] font-mono"
              />
              <Button onClick={onSaveMinutes} disabled={loading || saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Applies to newly-triggered Customer Delays. Existing timers continue on their original schedule. Also auto-resolves when the customer replies (opens a ticket) or the order is restarted. Range 00:01 – 168:00.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

