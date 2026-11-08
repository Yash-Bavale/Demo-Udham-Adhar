// Thin serverFn wrappers around the workflow engine.
// Callable from client code and admin UI.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WorkflowEvent } from "./events";

const EventInput = z.object({
  applicationId: z.string().uuid(),
  event: z.any(), // typed union enforced at call sites
});

export const dispatchWorkflowEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => EventInput.parse(i))
  .handler(async ({ data, context }) => {
    const { dispatchEvent } = await import("./engine.server");
    const evt = { ...(data.event as object), applicationId: data.applicationId } as WorkflowEvent;
    const next = await dispatchEvent(evt, context.userId);
    return next;
  });

export const getWorkflowState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ applicationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const [state, timers, automations, events] = await Promise.all([
      context.supabase.from("workflow_states").select("*").eq("application_id", data.applicationId).maybeSingle(),
      context.supabase.from("workflow_timers").select("*").eq("application_id", data.applicationId).in("status", ["running", "paused"]),
      context.supabase.from("workflow_automations").select("*").eq("application_id", data.applicationId).in("status", ["running", "paused"]),
      context.supabase.from("workflow_events").select("*").eq("application_id", data.applicationId).order("created_at", { ascending: false }).limit(200),
    ]);
    return {
      state: state.data,
      timers: timers.data ?? [],
      automations: automations.data ?? [],
      events: events.data ?? [],
    };
  });

// ── Timer controls (pause / resume / cancel a single row) ────────────────────
export const controlTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      timerId: z.string().uuid(),
      action: z.enum(["pause", "resume", "cancel"]),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const nowIso = new Date().toISOString();
    if (data.action === "cancel") {
      await context.supabase
        .from("workflow_timers")
        .update({ status: "stopped" })
        .eq("id", data.timerId);
      return { ok: true };
    }
    if (data.action === "pause") {
      const { data: row } = await context.supabase
        .from("workflow_timers")
        .select("fires_at")
        .eq("id", data.timerId)
        .maybeSingle();
      const remaining = row?.fires_at
        ? Math.max(0, new Date(row.fires_at as string).getTime() - Date.now())
        : 0;
      await context.supabase
        .from("workflow_timers")
        .update({ status: "paused", paused_at: nowIso, remaining_ms: remaining })
        .eq("id", data.timerId);
      return { ok: true };
    }
    // resume
    const { data: row } = await context.supabase
      .from("workflow_timers")
      .select("remaining_ms")
      .eq("id", data.timerId)
      .maybeSingle();
    const firesAt = new Date(Date.now() + ((row?.remaining_ms as number) ?? 0)).toISOString();
    await context.supabase
      .from("workflow_timers")
      .update({ status: "running", paused_at: null, remaining_ms: null, fires_at: firesAt })
      .eq("id", data.timerId);
    return { ok: true };
  });

// ── Automation controls ─────────────────────────────────────────────────────
export const controlAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      automationId: z.string().uuid(),
      action: z.enum(["pause", "resume", "stop"]),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (data.action === "stop") {
      await context.supabase
        .from("workflow_automations")
        .update({ status: "stopped", ended_at: new Date().toISOString() })
        .eq("id", data.automationId);
      return { ok: true };
    }
    await context.supabase
      .from("workflow_automations")
      .update({ status: data.action === "pause" ? "paused" : "running" })
      .eq("id", data.automationId);
    return { ok: true };
  });
