// Browser push/local notifications (Final_CRM Part E).
// Registers /sw.js, owns permission state, and exposes a notify() helper.
// Notifications are triggered locally from realtime events (no VAPID/Web Push
// server) so they work without backend keys yet still feel like push to staff.
import { useCallback, useEffect, useState } from "react";

const LS_KEY = "udyam.notifications.dismissed";

type Permission = NotificationPermission | "unsupported";

export interface NotifyPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

function playSingleRing(ctx: AudioContext, startOffset: number) {
  const now = ctx.currentTime + startOffset;
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(587.33, now);
  osc1.frequency.setValueAtTime(880, now + 0.12);
  gain1.gain.setValueAtTime(0.001, now);
  gain1.gain.linearRampToValueAtTime(0.9, now + 0.03);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.46);

  const now2 = now + 0.5;
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(659.25, now2);
  osc2.frequency.setValueAtTime(987.77, now2 + 0.12);
  gain2.gain.setValueAtTime(0.001, now2);
  gain2.gain.linearRampToValueAtTime(1.0, now2 + 0.03);
  gain2.gain.exponentialRampToValueAtTime(0.001, now2 + 0.5);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now2);
  osc2.stop(now2 + 0.51);
}

export type RingtoneTone = "chime" | "bell" | "alert" | "ding" | "soft" | "custom";

export function playRingtonePattern(tone: RingtoneTone, ctx: AudioContext, offset: number) {
  const now = ctx.currentTime + offset;
  
  if (tone === "bell") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(783.99, now);
    osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.3);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(1.0, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.71);
  } else if (tone === "alert") {
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const t = now + idx * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.8, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  } else if (tone === "ding") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.7, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.51);
  } else if (tone === "soft") {
    [440, 554.37].forEach((freq, idx) => {
      const t = now + idx * 0.2;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.5, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  } else {
    playSingleRing(ctx, offset);
  }
}

let globalAudioCtx: AudioContext | null = null;

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!globalAudioCtx || globalAudioCtx.state === "closed") {
    globalAudioCtx = new AudioContextClass();
  }
  if (globalAudioCtx.state === "suspended") {
    globalAudioCtx.resume().catch(() => {});
  }
  return globalAudioCtx;
}

// Auto-unlock AudioContext on any user interaction in the portal window
if (typeof window !== "undefined") {
  const unlockAudio = () => {
    const ctx = getOrCreateAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  };
  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio, { passive: true });
  window.addEventListener("click", unlockAudio, { passive: true });
}

export function playNotificationSound(
  kind: "lead" | "order" | "preview",
  forceRingtone?: string,
  forceCustomUrl?: string
) {
  try {
    if (typeof window === "undefined") return;

    if (kind === "lead") {
      const leadsEnabled = localStorage.getItem("udyam.sound.leads") !== "false";
      if (!leadsEnabled) return;
    } else if (kind === "order") {
      const ordersEnabled = localStorage.getItem("udyam.sound.orders") !== "false";
      if (!ordersEnabled) return;
    }

    // Cross-tab deduplication (avoid multiple open tabs ringing simultaneously for the same event)
    if (kind !== "preview") {
      const dedupeKey = `udyam.sound.dedupe.${kind}`;
      const now = Date.now();
      const lastPlayed = Number(localStorage.getItem(dedupeKey) || 0);
      if (now - lastPlayed < 2000) {
        return; // Another tab or rapid event already played within the last 2s
      }
      localStorage.setItem(dedupeKey, String(now));
    }

    const ringtoneKey = kind === "order" ? "udyam.sound.orders_ringtone" : "udyam.sound.leads_ringtone";
    const customUrlKey = kind === "order" ? "udyam.sound.orders_custom_url" : "udyam.sound.leads_custom_url";

    const ringtone = (forceRingtone || localStorage.getItem(ringtoneKey) || localStorage.getItem("udyam.sound.ringtone") || (kind === "order" ? "bell" : "chime")) as RingtoneTone;
    const customUrl = forceCustomUrl !== undefined ? forceCustomUrl : (localStorage.getItem(customUrlKey) || "");

    if (ringtone === "custom" && customUrl.trim()) {
      const audio = new Audio(customUrl.trim());
      audio.volume = 1.0;
      audio.play().catch((err) => {
        console.warn("[playNotificationSound] Custom MP3 audio play error:", err);
      });
      return;
    }

    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const playPattern = () => {
      const toneToPlay = ringtone === "custom" ? "chime" : ringtone;
      if (kind === "preview") {
        playRingtonePattern(toneToPlay, ctx, 0);
      } else {
        const CYCLE = 0.9;
        playRingtonePattern(toneToPlay, ctx, 0);
        playRingtonePattern(toneToPlay, ctx, CYCLE);
      }
    };

    if (ctx.state === "suspended") {
      ctx.resume().then(playPattern).catch(playPattern);
    } else {
      playPattern();
    }
  } catch (err) {
    console.warn("[playNotificationSound] error:", err);
  }
}

export function playLeadRingSound() {
  playNotificationSound("lead");
}

export function playOrderRingSound() {
  playNotificationSound("order");
}

export function useNotifications() {
  const [permission, setPermission] = useState<Permission>("default");
  const [registered, setRegistered] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    setDismissed(localStorage.getItem(LS_KEY) === "1");

    navigator.serviceWorker
      .register("/sw.js")
      .then(() => setRegistered(true))
      .catch(() => setRegistered(false));
  }, []);

  const request = useCallback(async () => {
    if (!("Notification" in window)) return "unsupported" as const;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const dismissBanner = useCallback(() => {
    localStorage.setItem(LS_KEY, "1");
    setDismissed(true);
  }, []);

  const notify = useCallback(
    async (payload: NotifyPayload) => {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      
      // Auto-request permission if still default
      let currentPermission = Notification.permission;
      if (currentPermission === "default") {
        currentPermission = await Notification.requestPermission();
        setPermission(currentPermission);
      }
      
      if (currentPermission !== "granted") return;

      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.active) {
          reg.active.postMessage({ type: "notify", payload });
        } else {
          new Notification(payload.title, { body: payload.body, tag: payload.tag, icon: "/favicon.ico" });
        }
      } catch {
        try {
          new Notification(payload.title, { body: payload.body, tag: payload.tag, icon: "/favicon.ico" });
        } catch { /* noop */ }
      }
    },
    [],
  );

  return {
    permission,
    registered,
    supported: permission !== "unsupported",
    canPrompt: permission === "default",
    granted: permission === "granted",
    dismissed,
    request,
    dismissBanner,
    notify,
  };
}
