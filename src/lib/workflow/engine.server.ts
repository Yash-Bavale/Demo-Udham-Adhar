// Server-only Workflow Engine dispatcher.
// Applies a WorkflowEvent to persistent state: workflow_states, workflow_timers,
// workflow_automations, workflow_events. Idempotent per (application_id, event) via dedup keys.
//
// Callers: server functions in *.functions.ts must `await import()` this module
// inside their handler (never at module scope) — see cloud-project-info rules.

import type { WorkflowEvent } from "./events";
import { initialState, reduce, type SideEffect, type WorkflowState } from "./state-machine";

type SupabaseAdmin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function getAdmin(): Promise<SupabaseAdmin> {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}

async function loadState(supabase: SupabaseAdmin, applicationId: string): Promise<WorkflowState> {
  const { data } = await supabase
    .from("workflow_states")
    .select("stage,status,sub_status,paused,pause_reason,active_ticket_id,assigned_to")
    .eq("application_id", applicationId)
    .maybeSingle();
  if (!data) return initialState();
  return {
    stage: data.stage as WorkflowState["stage"],
    status: data.status as WorkflowState["status"],
    subStatus: data.sub_status,
    paused: !!data.paused,
    pauseReason: data.pause_reason,
    activeTicketId: data.active_ticket_id,
    assignedTo: data.assigned_to,
  };
}

async function saveState(supabase: SupabaseAdmin, applicationId: string, next: WorkflowState) {
  await supabase.from("workflow_states").upsert(
    {
      application_id: applicationId,
      stage: next.stage,
      status: next.status,
      sub_status: next.subStatus ?? null,
      paused: next.paused,
      pause_reason: next.pauseReason ?? null,
      active_ticket_id: next.activeTicketId ?? null,
      assigned_to: next.assignedTo ?? null,
      last_event_at: new Date().toISOString(),
    },
    { onConflict: "application_id" },
  );
}

async function applyEffect(
  supabase: SupabaseAdmin,
  applicationId: string,
  effect: SideEffect,
  actorId?: string | null,
) {
  switch (effect.kind) {
    case "start_timer": {
      const firesAt = new Date(Date.now() + effect.inMinutes * 60_000).toISOString();
      await supabase
        .from("workflow_timers")
        .upsert(
          {
            application_id: applicationId,
            kind: effect.timer,
            status: "running",
            fires_at: firesAt,
            payload: (effect.payload ?? {}) as never,
            dedup_key: effect.dedupKey ?? null,
          },
          { onConflict: "application_id,kind,dedup_key" },
        );
      return;
    }
    case "cancel_timers":
      await supabase
        .from("workflow_timers")
        .update({ status: "stopped" })
        .eq("application_id", applicationId)
        .in("kind", effect.timers)
        .in("status", ["running", "paused"]);
      return;
    case "pause_timers": {
      const { data: rows } = await supabase
        .from("workflow_timers")
        .select("id,fires_at")
        .eq("application_id", applicationId)
        .in("kind", effect.timers)
        .eq("status", "running");
      const now = Date.now();
      for (const r of rows ?? []) {
        const remaining = Math.max(0, new Date(r.fires_at).getTime() - now);
        await supabase
          .from("workflow_timers")
          .update({ status: "paused", paused_at: new Date().toISOString(), remaining_ms: remaining })
          .eq("id", r.id);
      }
      return;
    }
    case "resume_timers": {
      const { data: rows } = await supabase
        .from("workflow_timers")
        .select("id,remaining_ms")
        .eq("application_id", applicationId)
        .in("kind", effect.timers)
        .eq("status", "paused");
      for (const r of rows ?? []) {
        const firesAt = new Date(Date.now() + (r.remaining_ms ?? 0)).toISOString();
        await supabase
          .from("workflow_timers")
          .update({ status: "running", paused_at: null, remaining_ms: null, fires_at: firesAt })
          .eq("id", r.id);
      }
      return;
    }
    case "start_automation":
      await supabase.from("workflow_automations").upsert(
        {
          application_id: applicationId,
          code: effect.code,
          status: "running",
          context: (effect.context ?? {}) as never,
        },
        { onConflict: "application_id,code" as never },
      );
      return;
    case "stop_automation":
      await supabase
        .from("workflow_automations")
        .update({ status: "stopped", ended_at: new Date().toISOString() })
        .eq("application_id", applicationId)
        .eq("code", effect.code)
        .in("status", ["running", "paused"]);
      return;
    case "pause_automation":
      await supabase
        .from("workflow_automations")
        .update({ status: "paused" })
        .eq("application_id", applicationId)
        .eq("code", effect.code)
        .eq("status", "running");
      return;
    case "resume_automation":
      await supabase
        .from("workflow_automations")
        .update({ status: "running" })
        .eq("application_id", applicationId)
        .eq("code", effect.code)
        .eq("status", "paused");
      return;
    case "send_email": {
      // Map state-machine template names → BHS registry codes.
      const map: Record<string, string> = {
        incomplete_information: "welcome_and_form_link",
        closure_final: "order_closure_confirmation",
        closure_intimation: "bhs_e003_customer_delay",
        gov_delay_notification: "bhs_e004_our_side_delay",
        gov_rejection: "order_closure_confirmation",
        order_completed: "order_completed",
      };
      const code = map[effect.template] ?? effect.template;

      // Resolve recipient from application → customer.
      let toEmail: string | null = null;
      try {
        const { data: app } = await supabase
          .from("applications")
          .select("customer_id, lead_id")
          .eq("id", applicationId)
          .maybeSingle();
        const row = app as { customer_id: string | null; lead_id: string | null } | null;
        if (row?.customer_id) {
          const { data: cust } = await supabase
            .from("customers")
            .select("primary_email")
            .eq("id", row.customer_id)
            .maybeSingle();
          toEmail = (cust as { primary_email: string | null } | null)?.primary_email ?? null;
        }
        if (!toEmail && row?.lead_id) {
          const { data: lead } = await supabase
            .from("leads")
            .select("email")
            .eq("id", row.lead_id)
            .maybeSingle();
          toEmail = (lead as { email: string | null } | null)?.email ?? null;
        }
      } catch (err) {
        console.error("[workflow] recipient lookup failed", err);
      }

      if (!toEmail) {
        await supabase.from("workflow_events").insert({
          application_id: applicationId,
          event_type: "email_skipped",
          title: `Email skipped (${effect.template}): no recipient`,
          actor_id: actorId ?? null,
          actor_name: "System",
          is_system: true,
          metadata: { template: code } as never,
        });
        return;
      }

      try {
        const { enqueueFromTemplateInternal } = await import("@/lib/emails/emails.server");
        await enqueueFromTemplateInternal(
          code,
          toEmail,
          (effect.payload ?? {}) as Record<string, unknown>,
          { applicationId, trigger: "auto" },
        );
        await supabase.from("workflow_events").insert({
          application_id: applicationId,
          event_type: "email_sent",
          title: `Email queued: ${code}`,
          actor_id: actorId ?? null,
          actor_name: "System",
          is_system: true,
          metadata: { template: code, to: toEmail } as never,
        });
      } catch (err) {
        console.error("[workflow] send_email failed", code, err);
        await supabase.from("workflow_events").insert({
          application_id: applicationId,
          event_type: "email_failed",
          title: `Email failed: ${code}`,
          description: String(err),
          actor_id: actorId ?? null,
          actor_name: "System",
          is_system: true,
          metadata: { template: code, to: toEmail } as never,
        });
      }
      return;
    }
    case "record_event":
      await supabase.from("workflow_events").insert({
        application_id: applicationId,
        event_type: "info",
        title: effect.title,
        description: effect.detail ?? null,
        actor_id: actorId ?? null,
        actor_name: "System",
        is_system: true,
        metadata: { icon: effect.icon, category: effect.category } as never,
      });
      return;
  }
}

/** Dispatch a single event through the engine. */
export async function dispatchEvent(event: WorkflowEvent, actorId?: string | null): Promise<WorkflowState> {
  const supabase = await getAdmin();
  const prev = await loadState(supabase, event.applicationId);
  const t = reduce(prev, event);

  await saveState(supabase, event.applicationId, t.next);

  for (const eff of t.effects) {
    try {
      await applyEffect(supabase, event.applicationId, eff, actorId);
    } catch (err) {
      console.error("[workflow] effect failed", eff.kind, err);
    }
  }

  await supabase.from("workflow_events").insert({
    application_id: event.applicationId,
    event_type: event.type,
    title: t.title,
    actor_id: actorId ?? null,
    actor_name: actorId ? "Employee" : "System",
    is_system: !actorId,
    metadata: { icon: t.icon, category: t.category, event } as never,
  });

  return t.next;
}

/** Fire all due timers. Called by the cron endpoint. */
export async function tickDueTimers(now = new Date()): Promise<{ fired: number }> {
  const supabase = await getAdmin();
  const { data: due } = await supabase
    .from("workflow_timers")
    .select("id,application_id,kind,payload")
    .eq("status", "running")
    .lte("fires_at", now.toISOString())
    .limit(200);

  let fired = 0;
  const { handleNewTimer, isNewTimerKind } = await import(
    "@/lib/orders/actions/timers-tick.server"
  );
  for (const t of due ?? []) {
    // Phase 4: new-lifecycle timer kinds are handled outside the legacy state machine.
    if (isNewTimerKind(t.kind)) {
      try {
        const handled = await handleNewTimer({
          id: t.id,
          application_id: t.application_id,
          kind: t.kind,
          payload: (t as any).payload ?? null,
        });
        if (handled) {
          await supabase
            .from("workflow_timers")
            .update({ status: "fired", fired_at: now.toISOString() })
            .eq("id", t.id);
          fired++;
        }
      } catch (err) {
        console.error("[workflow] new-kind timer failed", t.id, err);
      }
      continue;
    }

    let event: WorkflowEvent | null = null;
    if (t.kind === "incomplete_form") event = { type: "FormTimeout5m", applicationId: t.application_id };
    else if (t.kind === "closure") event = { type: "ClosureTimerFired", applicationId: t.application_id };
    else if (t.kind === "reminder") event = { type: "ReminderFired", applicationId: t.application_id };

    if (event) {
      try {
        await dispatchEvent(event);
        await supabase
          .from("workflow_timers")
          .update({ status: "fired", fired_at: now.toISOString() })
          .eq("id", t.id);
        fired++;
      } catch (err) {
        console.error("[workflow] timer dispatch failed", t.id, err);
      }
    }
  }
  return { fired };
}
