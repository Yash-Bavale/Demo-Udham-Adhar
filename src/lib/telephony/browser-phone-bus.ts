/** Tiny in-page bus so CRM records can start a browser call through the single mounted browser phone. */
export type DialRequest = { number: string; customerId?: string | null; leadId?: string | null; applicationId?: string | null; label?: string | null };
export type CallControls = { answer: () => void; reject: () => void; hangup: () => void; state: () => string };
type Listener = () => void;

let ready = false;
let handler: ((r: DialRequest) => void) | null = null;
let controls: CallControls | null = null;
const listeners = new Set<Listener>();

export const browserPhone = {
  isReady: () => ready,
  setReady(v: boolean) { if (ready !== v) { ready = v; listeners.forEach((l) => l()); } },
  subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
  register(h: ((r: DialRequest) => void) | null) { handler = h; },
  dial(r: DialRequest): boolean { if (!ready || !handler) return false; handler(r); return true; },
  setControls(c: CallControls | null) { controls = c; },
  /** Current browser phone state, or null when the phone is not mounted. */
  state: () => controls?.state() ?? null,
  answer(): boolean { if (controls?.state() !== "RINGING") return false; controls.answer(); return true; },
  reject(): boolean { if (controls?.state() !== "RINGING") return false; controls.reject(); return true; },
  hangup(): boolean { const s = controls?.state(); if (s !== "CONNECTED" && s !== "CALLING") return false; controls!.hangup(); return true; },
};
