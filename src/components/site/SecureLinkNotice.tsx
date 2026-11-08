import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck } from "lucide-react";
import { requestSecureLink } from "@/lib/security/customer-access.functions";

/**
 * Shown when a customer page is opened without a valid secure link. Offers to
 * email a fresh link to the address already on file (never shown here).
 */
export function SecureLinkNotice({ leadCode, message }: { leadCode: string; message?: string }) {
  const send = useServerFn(requestSecureLink);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  async function onSend() {
    setState("sending");
    try {
      await send({ data: { leadCode } });
    } catch {
      /* same answer either way */
    }
    setState("sent");
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-4 text-xl font-bold text-foreground">Please open your secure link</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {message ??
            "For your privacy, this page only opens from the secure link we email you. Use the latest link in your email, or ask us to send a new one."}
        </p>
        {state === "sent" ? (
          <p className="mt-6 rounded-lg bg-muted p-3 text-sm text-foreground">
            If this application exists, a new secure link has been sent to the email address on file.
          </p>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={state === "sending"}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {state === "sending" && <Loader2 className="h-4 w-4 animate-spin" />}
            Email me a secure link
          </button>
        )}
      </div>
    </div>
  );
}
