import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DIAG_TYPE = "webrtc_diag";

/** Diagnostics are limited to the admin and super_admin roles (checked server-side via has_role). */
export const DIAG_ROLES = ["super_admin", "admin"] as const;
export async function isDiagAdmin(ctx: { supabase: any; userId: string }): Promise<boolean> {
  for (const r of DIAG_ROLES) {
    const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: r });
    if (data === true) return true;
  }
  return false;
}

async function requireSuperAdmin(ctx: { supabase: any; userId: string }) {
  if (!(await isDiagAdmin(ctx))) throw new Error("Only admins can use browser phone diagnostics.");
}

const EventSchema = z.object({
  event: z.string().min(1).max(40),
  state: z.string().max(40).optional(),
  sipCode: z.number().int().optional().nullable(),
  reason: z.string().max(500).optional().nullable(),
  number: z.string().max(20).optional().nullable(),
  detail: z.string().max(1000).optional().nullable(),
});

/** Records one browser-phone registration/call event (super admins only). */
export const logWebRtcEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EventSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { redact } = await import("./callerdesk-webrtc.config");
    const secrets = [process.env["CALLERDESK_SIP_PASSWORD"], process.env["CALLERDESK_AUTHCODE"], process.env["CALLERDESK_WEBHOOK_TOKEN"]];
    const safe = { ...data, reason: data.reason ? redact(data.reason, secrets) : data.reason, detail: data.detail ? redact(data.detail, secrets) : data.detail, number: data.number ? redact(data.number, secrets) : data.number };
    const { error } = await supabaseAdmin.from("activity_logs").insert({
      activity_type: DIAG_TYPE,
      activity_description: `${safe.event}${safe.sipCode ? ` (${safe.sipCode})` : ""}${safe.reason ? `: ${safe.reason}` : ""}`.slice(0, 500),
      user_id: context.userId,
      metadata: { ...safe, userAgent: undefined },
    });
    if (error) throw new Error("Browser phone test log could not be saved.");
    return { ok: true };
  });

export const listWebRtcEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("activity_logs").select("id, created_at, activity_description, metadata")
      .eq("activity_type", DIAG_TYPE).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Asks the AI model for troubleshooting steps from status text plus recent logged events. */
export const troubleshootWebRtc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ status: z.string().max(200), details: z.string().max(3000) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context as any);
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.from("activity_logs").select("created_at, activity_description")
      .eq("activity_type", DIAG_TYPE).order("created_at", { ascending: false }).limit(20);
    const recent = (rows ?? []).map((r: any) => `${r.created_at} ${r.activity_description}`).join("\n") || "none";

    const instructions = `You troubleshoot a CRM browser phone: SIP.js over WSS to CallerDesk's Asterisk (wss://app.callerdesk.io:5000/ws), reached through FortiClient VPN on the agent's PC. Outbound calls INVITE sip:<digits>@app.callerdesk.io. Give a short likely cause, then 3-6 numbered concrete next steps (what to check in the CRM, the VPN, the browser, or what to ask CallerDesk support). Interpret SIP codes precisely (401/403/404/408/480/486/488/503 etc). Never ask for passwords. Plain language, under 200 words.`;
    const input = `Status: ${data.status}\nDetails: ${data.details}\nRecent logged events (newest first):\n${recent}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({ model: "openai/gpt-6-astra", instructions, input, stream: true, store: false, reasoning: { effort: "low" } }),
    });
    if (!res.ok || !res.body) {
      let msg = `AI request failed (${res.status}).`;
      try { const j: any = await res.json(); msg = j?.error?.message ?? j?.message ?? msg; } catch { /* ignore */ }
      if (res.status === 402) msg = "AI credits are used up. Add credits in Settings → Plans & credits.";
      if (res.status === 429) msg = "AI is busy right now. Try again in a minute.";
      throw new Error(msg);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") text += ev.delta;
          if (ev.type === "response.failed" || ev.type === "error") throw new Error(ev?.response?.error?.message ?? ev?.message ?? "AI request failed.");
        } catch (e) { if (e instanceof Error && !(e instanceof SyntaxError)) throw e; }
      }
    }
    return { advice: text.trim() || "No advice returned." };
  });
