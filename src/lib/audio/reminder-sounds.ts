// Web Audio API synthesized sound generator & custom audio file upload support.
// 100% reliable in modern browsers with support for custom uploaded audio (.mp3, .wav, .ogg, etc.)

export type SoundTone = "chime" | "bell" | "digital_ring" | "radar" | "soft_ping" | "custom";

export interface SoundSettings {
  enabled: boolean;
  tone: SoundTone;
  volume: number; // 0.0 to 1.0
  desktopNotifications: boolean;
  customAudioUrl?: string | null;
  customAudioName?: string | null;
}

const STORAGE_KEY = "bhs_reminder_sound_settings";

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  tone: "chime",
  volume: 0.8,
  desktopNotifications: true,
  customAudioUrl: null,
  customAudioName: null,
};

let inMemorySettings: SoundSettings = { ...DEFAULT_SOUND_SETTINGS };
let preloadedAudio: HTMLAudioElement | null = null;
let currentPreloadedUrl: string | null = null;

// Audio context singleton
let globalAudioCtx: AudioContext | null = null;

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!globalAudioCtx || globalAudioCtx.state === "closed") {
    globalAudioCtx = new AudioCtx();
  }
  if (globalAudioCtx.state === "suspended") {
    globalAudioCtx.resume().catch(() => {});
  }
  return globalAudioCtx;
}

// Auto-unlock AudioContext and prewarm audio subsystem on first user interaction
if (typeof window !== "undefined") {
  const unlockAudio = () => {
    try {
      const ctx = getOrCreateAudioContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      if (preloadedAudio) {
        preloadedAudio.load();
      }
    } catch {}
  };
  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio, { passive: true });
  window.addEventListener("click", unlockAudio, { passive: true });
}

export function preloadAudio(url: string | null | undefined) {
  if (typeof window === "undefined" || !url) {
    preloadedAudio = null;
    currentPreloadedUrl = null;
    return;
  }

  if (currentPreloadedUrl === url && preloadedAudio) {
    return;
  }

  try {
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.load();
    preloadedAudio = audio;
    currentPreloadedUrl = url;
  } catch (err) {
    console.warn("[preloadAudio] failed to preload:", err);
  }
}

export function getSoundSettings(): SoundSettings {
  if (typeof window === "undefined") return DEFAULT_SOUND_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      inMemorySettings = { ...DEFAULT_SOUND_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // fallback
  }
  return inMemorySettings;
}

export function syncGlobalSoundSettings(settings: Partial<SoundSettings>): SoundSettings {
  const current = getSoundSettings();
  const updated: SoundSettings = { ...current, ...settings };
  inMemorySettings = updated;

  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  } catch (err) {
    console.warn("[syncGlobalSoundSettings] localStorage sync warn:", err);
  }

  if (updated.customAudioUrl) {
    preloadAudio(updated.customAudioUrl);
  }

  return updated;
}

export function saveSoundSettings(settings: Partial<SoundSettings>): SoundSettings {
  return syncGlobalSoundSettings(settings);
}

/**
 * Play a sound tone (either custom uploaded audio file or synthesized Web Audio tone).
 */
export function playReminderSound(toneOverride?: SoundTone, volumeOverride?: number, customUrlOverride?: string | null) {
  if (typeof window === "undefined") return;

  const settings = getSoundSettings();
  if (!settings.enabled && toneOverride === undefined) return;

  const tone = toneOverride ?? settings.tone;
  const volume = volumeOverride !== undefined ? volumeOverride : settings.volume;
  const customUrl = customUrlOverride !== undefined ? customUrlOverride : settings.customAudioUrl;

  const clampedVolume = Math.max(0, Math.min(1, volume));

  // 1. If custom uploaded audio is selected and available
  if (tone === "custom" && customUrl) {
    try {
      const audio = new Audio(customUrl);
      audio.volume = clampedVolume;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn("[playReminderSound] custom audio play failed, falling back to chime:", err);
          playSynthesizedTone("chime", clampedVolume);
        });
      }
      return;
    } catch (err) {
      console.warn("[playReminderSound] custom audio error:", err);
      playSynthesizedTone("chime", clampedVolume);
      return;
    }
  }

  // 2. Otherwise play synthesized tone
  playSynthesizedTone(tone === "custom" ? "chime" : tone, clampedVolume);
}

/**
 * Synthesize audio tones using the Web Audio API.
 */
function playSynthesizedTone(tone: Exclude<SoundTone, "custom">, volume: number) {
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), ctx.currentTime);
    masterGain.connect(ctx.destination);

    const now = ctx.currentTime;

    switch (tone) {
      case "bell": {
        // High resonance crystal bell tone
        const freqs = [880, 1760, 2640];
        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, now);

          const decay = 1.2 - idx * 0.3;
          gain.gain.setValueAtTime(0.3 / (idx + 1), now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now);
          osc.stop(now + decay);
        });
        break;
      }

      case "digital_ring": {
        // Urgent 2-beep digital alert
        [0, 0.18].forEach((startTime) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "square";
          osc.frequency.setValueAtTime(1046.5, now + startTime); // C6

          gain.gain.setValueAtTime(0.2, now + startTime);
          gain.gain.exponentialRampToValueAtTime(0.001, now + startTime + 0.12);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now + startTime);
          osc.stop(now + startTime + 0.12);
        });
        break;
      }

      case "radar": {
        // Modern radar ping
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.35); // A5

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.7);
        break;
      }

      case "soft_ping": {
        // Gentle soft ping
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, now); // C5

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      }

      case "chime":
      default: {
        // 3-note ascending melodic chime (E5 -> G#5 -> B5)
        const notes = [
          { freq: 659.25, time: 0, dur: 0.5 },
          { freq: 830.61, time: 0.12, dur: 0.6 },
          { freq: 987.77, time: 0.24, dur: 0.8 },
        ];

        notes.forEach(({ freq, time, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, now + time);

          gain.gain.setValueAtTime(0.3, now + time);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now + time);
          osc.stop(now + time + dur);
        });
        break;
      }
    }
  } catch (err) {
    console.warn("[playReminderSound] audio error:", err);
  }
}

/**
 * Trigger a native browser notification if granted.
 */
export async function showDesktopNotification(title: string, options?: NotificationOptions, onClickUrl?: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;

  const settings = getSoundSettings();
  if (!settings.desktopNotifications) return;

  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {}
  }

  if (Notification.permission === "granted") {
    try {
      const notif = new Notification(title, {
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        requireInteraction: true,
        ...options,
      });

      if (onClickUrl) {
        notif.onclick = () => {
          window.focus();
          window.location.href = onClickUrl;
          notif.close();
        };
      }
    } catch (err) {
      console.warn("[showDesktopNotification] notification error:", err);
    }
  }
}
