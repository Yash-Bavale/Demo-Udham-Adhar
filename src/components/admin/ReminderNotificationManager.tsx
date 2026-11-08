import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Flame, PhoneCall, ArrowRight, X, Server } from "lucide-react";
import { getDueRemindersSummary } from "@/lib/orders/actions/callback-reminder.functions";
import { getGlobalReminderSoundSettings } from "@/lib/settings/app-settings.functions";
import { playReminderSound, showDesktopNotification, syncGlobalSoundSettings, preloadAudio } from "@/lib/audio/reminder-sounds";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";

const NOTIFIED_STORAGE_KEY = "bhs.notified.reminders.v2";

function loadNotifiedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(NOTIFIED_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveNotifiedId(id: string) {
  if (typeof window === "undefined" || !id) return;
  try {
    const current = loadNotifiedIds();
    current.add(id);
    const arr = Array.from(current).slice(-500);
    localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(arr));
  } catch {}
}

export function ReminderNotificationManager() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const getSummaryFn = useServerFn(getDueRemindersSummary);
  const getSoundSettingsFn = useServerFn(getGlobalReminderSoundSettings);

  // Set of notified scheduler IDs persisted across reloads
  const notifiedIdsRef = useRef<Set<string>>(loadNotifiedIds());
  const scheduledTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const isInitialLoadRef = useRef<boolean>(true);

  // Fetch and synchronize global audio settings across all employee sessions
  const { data: globalSound } = useQuery({
    queryKey: ["global-reminder-sound-settings"],
    queryFn: () => getSoundSettingsFn(),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  useEffect(() => {
    if (globalSound) {
      syncGlobalSoundSettings({
        enabled: globalSound.enabled,
        tone: globalSound.tone,
        volume: globalSound.volume,
        desktopNotifications: globalSound.desktopNotifications,
        customAudioUrl: globalSound.customAudioUrl,
        customAudioName: globalSound.customAudioName,
      });
      if (globalSound.customAudioUrl) {
        preloadAudio(globalSound.customAudioUrl);
      }
    }
  }, [globalSound]);

  const triggerDueAlert = (reminder: {
    id: string;
    application_id: string | null;
    application_code: string;
    customer_name: string;
    customer_mobile: string;
    remarks?: { reasonLabel?: string; note?: string | null; channel?: string | null } | null;
  }) => {
    if (!reminder.id || notifiedIdsRef.current.has(reminder.id)) return;
    notifiedIdsRef.current.add(reminder.id);
    saveNotifiedId(reminder.id);

    // 1. Play alert audio (custom uploaded audio if set, or configured tone)
    playReminderSound(
      globalSound?.tone,
      globalSound?.volume,
      globalSound?.customAudioUrl
    );

    // 2. Invalidate order queries so table immediately promotes this order to the top with red HOT badge
    qc.invalidateQueries({ queryKey: ["admin.orders.v2"] });
    qc.invalidateQueries({ queryKey: ["active-order-callback"] });
    qc.invalidateQueries({ queryKey: ["due-reminders-summary"] });
    qc.invalidateQueries({ queryKey: ["orders-v2"] });

    const isTechDelay = reminder.remarks?.channel === "technical_delay";
    const reasonText = reminder.remarks?.reasonLabel || (isTechDelay ? "Technical Delay Follow-Up" : "Customer Follow-Up");
    const customerInfo = `${reminder.customer_name} ${reminder.customer_mobile ? `(${reminder.customer_mobile})` : ""}`.trim();
    const orderCode = reminder.application_code || "Order";

    // 3. Desktop Browser Notification
    showDesktopNotification(
      `🔥 Hot Order: ${isTechDelay ? "Technical Delay Reminder Due!" : "Callback Due Now!"}`,
      {
        body: `${orderCode} · ${customerInfo} · Reason: ${reasonText}`,
      },
      `/admin/orders/${reminder.application_id}`
    );

    // 4. Rich Screen Toast Popup
    toast.custom(
      (t) => (
        <div className="flex w-full max-w-md items-start justify-between gap-3 rounded-2xl border-2 border-rose-500 bg-gradient-to-br from-rose-950 via-rose-900 to-slate-900 p-4 text-white shadow-2xl animate-in slide-in-from-top-4 duration-300">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-rose-500/30 border border-rose-400/50 text-rose-300 shadow-inner">
            <Flame className="size-6 animate-bounce text-rose-400" />
          </div>

          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow-xs tracking-wider">
                🔥 HOT ORDER NOW
              </span>
              <span className="text-xs font-bold text-slate-200">
                {orderCode}
              </span>
            </div>

            <div className="text-sm font-bold text-white">
              {customerInfo}
            </div>

            <div className="text-xs text-rose-200 font-medium">
              Reason: <span className="font-semibold text-white">{reasonText}</span>
            </div>

            {reminder.remarks?.note && (
              <div className="text-[11px] text-slate-300 italic line-clamp-2">
                "{reminder.remarks.note}"
              </div>
            )}

            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  toast.dismiss(t);
                  if (reminder.application_id) {
                    navigate({ to: `/admin/orders/${reminder.application_id}` as any });
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-xs font-bold text-slate-900 shadow-md hover:bg-slate-100 transition cursor-pointer"
              >
                {isTechDelay ? (
                  <>
                    <Server className="size-3.5 text-rose-600" /> Open &amp; View Technical Delay <ArrowRight className="size-3" />
                  </>
                ) : (
                  <>
                    <PhoneCall className="size-3.5 text-rose-600" /> Open &amp; Call Customer <ArrowRight className="size-3" />
                  </>
                )}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => toast.dismiss(t)}
            className="grid size-6 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
      ),
      {
        duration: 45_000, // Stay visible for 45s
        id: `due-reminder-${reminder.id}`,
      }
    );
  };

  // Listen for realtime changes to order_schedulers table
  useRealtimeTable("order_schedulers", () => {
    qc.invalidateQueries({ queryKey: ["due-reminders-summary"] });
    qc.invalidateQueries({ queryKey: ["admin.orders.v2"] });
    qc.invalidateQueries({ queryKey: ["active-order-callback"] });
  });

  // Realtime invalidates on changes; upcoming reminders fire via local timers.
  // A slow safety poll only catches missed realtime events.
  const { data } = useQuery({
    queryKey: ["due-reminders-summary"],
    queryFn: () => getSummaryFn({ data: {} }),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!data) return;
    const dueList = data.dueReminders ?? [];
    const upcomingList = data.upcomingReminders ?? [];

    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      // On initial mount / page reload, mark any reminders that were already overdue as notified
      // so screen reload never blasts multiple repeat bells or popups for existing hot orders!
      for (const reminder of dueList) {
        if (reminder.id) {
          notifiedIdsRef.current.add(reminder.id);
          saveNotifiedId(reminder.id);
        }
      }
    } else {
      // For any reminder that newly transitions to due in this active session
      for (const reminder of dueList) {
        if (reminder.id && !notifiedIdsRef.current.has(reminder.id)) {
          triggerDueAlert(reminder);
        }
      }
    }

    // Schedule client-side high-precision timers for upcoming items
    for (const upcoming of upcomingList) {
      if (!upcoming.id || !upcoming.fires_at) continue;
      if (notifiedIdsRef.current.has(upcoming.id)) continue;
      if (scheduledTimeoutsRef.current.has(upcoming.id)) continue;

      const diffMs = new Date(upcoming.fires_at).getTime() - Date.now();
      if (diffMs <= 0) {
        triggerDueAlert(upcoming);
      } else if (diffMs <= 24 * 60 * 60_000) {
        // Schedule exact timeout to fire precisely when timer reaches 0
        const timerId = setTimeout(() => {
          scheduledTimeoutsRef.current.delete(upcoming.id);
          triggerDueAlert(upcoming);
        }, diffMs);
        scheduledTimeoutsRef.current.set(upcoming.id, timerId);
      }
    }

    return () => {
      // Clean up timers on unmount
    };
  }, [data]);

  return null;
}
