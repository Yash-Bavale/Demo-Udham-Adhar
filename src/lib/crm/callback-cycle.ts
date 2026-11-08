// Completion belongs to the current callback/reopen cycle, never an older one.
type TimedRecord = { created_at?: string | null };
type CallbackEvent = TimedRecord & { event_type?: string | null; note?: string | null };
type CallbackScheduler = TimedRecord & { status?: string | null; scheduler_type?: string | null; updated_at?: string | null };

export function hasCurrentCycleCompletion(
  reopenedAt: string | null | undefined,
  activeCallback: TimedRecord | null | undefined,
  events: CallbackEvent[],
  schedulers: CallbackScheduler[],
): boolean {
  const time = (value: string | null | undefined) => {
    const parsed = value ? Date.parse(value) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const cycleStart = Math.max(time(reopenedAt), time(activeCallback?.created_at));
  return events.some((event) => {
    if (time(event.created_at) < cycleStart) return false;
    const type = String(event.event_type ?? "").toLowerCase();
    const note = String(event.note ?? "").toLowerCase();
    return type.includes("callback_completed") || type.includes("consultation_completed") ||
      note.includes("callback marked completed") || note.includes("call completed");
  }) || schedulers.some((scheduler) => {
    // A scheduler created in an older cycle cannot resolve a later escalation.
    if (scheduler.status !== "completed" || time(scheduler.created_at) < cycleStart) return false;
    const type = String(scheduler.scheduler_type ?? "").toLowerCase();
    return type.includes("reminder") || type.includes("callback") || type.includes("our_side");
  });
}