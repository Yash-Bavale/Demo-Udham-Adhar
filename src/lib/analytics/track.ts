// Client-side analytics tracker — fire-and-forget insert into analytics_events.

const SESSION_KEY = "bhs_session_id";

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "no-session";
  }
}

export type EventName =
  | "page_view_landing"
  | "form_started"
  | "form_field_filled"
  | "form_submitted"
  | "lead_created"
  | "processing_viewed"
  | "payment_page_viewed"
  | "payment_gateway_selected"
  | "payment_initiated"
  | "payment_success"
  | "payment_failed"
  | "contact_form_submitted";

// Noisy, low-value events that fire repeatedly on a single page — never stored.
const IGNORED_EVENTS = new Set<string>(["form_field_filled"]);

const DEDUPE_KEY = "bhs_tracked_events";

/** Record each event at most once per browser session to keep write volume low. */
function shouldRecord(event_name: string): boolean {
  try {
    const raw = window.sessionStorage.getItem(DEDUPE_KEY);
    const seen: string[] = raw ? JSON.parse(raw) : [];
    if (seen.includes(event_name)) return false;
    seen.push(event_name);
    window.sessionStorage.setItem(DEDUPE_KEY, JSON.stringify(seen.slice(-40)));
    return true;
  } catch {
    return true;
  }
}

export function trackEvent(
  event_name: EventName | string,
  metadata: Record<string, unknown> = {},
  refs?: { lead_id?: string | null; application_id?: string | null }
) {
  if (typeof window === "undefined") return;
  if (IGNORED_EVENTS.has(event_name)) return;
  if (!shouldRecord(event_name)) return;
  const payload = {
    event_name,
    session_id: getSessionId(),
    lead_id: refs?.lead_id ?? null,
    application_id: refs?.application_id ?? null,
    page_url: window.location.pathname + window.location.search,
    metadata: metadata as never,
    user_agent: window.navigator.userAgent.slice(0, 500),
  };
  // Fire-and-forget; never block UI on analytics.
  // Lazy import keeps the database SDK out of the initial page bundle.
  void import("@/integrations/supabase/client").then(({ supabase }) =>
    supabase.from("analytics_events").insert(payload).then(({ error }) => {
      if (error && import.meta.env.DEV) console.warn("[trackEvent]", error.message);
    }),
  );
}
