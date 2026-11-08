import { z } from "zod";

/** Post-call outcomes offered to employees. */
export const CALL_OUTCOMES = [
  "Interested", "Follow-up Required", "No Answer", "Busy", "Call Back Later", "Customer Not Reachable",
  "Wrong Number", "Not Interested", "Issue Resolved", "Other",
] as const;
/** Older outcomes kept valid so earlier saved calls and edits still work. */
export const LEGACY_OUTCOMES = ["Customer Query", "Payment Related", "Documents Required", "Technical Issue", "Completed"] as const;
export const ALL_OUTCOMES = [...CALL_OUTCOMES, ...LEGACY_OUTCOMES] as const;

/** Outcomes that always need a follow-up date. */
export const OUTCOMES_NEEDING_FOLLOW_UP = new Set<string>(["Follow-up Required", "Call Back Later"]);

export const wrapUpInput = z.object({
  id: z.string().uuid(),
  disposition: z.enum(ALL_OUTCOMES),
  notes: z.string().max(2000).optional(),
  nextAction: z.string().trim().max(300).optional(),
  followUpAt: z.string().datetime({ offset: true }).nullable().optional(),
  applicationId: z.string().uuid().nullable().optional(),
}).superRefine((v, ctx) => {
  if (OUTCOMES_NEEDING_FOLLOW_UP.has(v.disposition) && !v.followUpAt)
    ctx.addIssue({ code: "custom", path: ["followUpAt"], message: "Pick a follow-up date and time for this outcome." });
});
export type WrapUpInput = z.infer<typeof wrapUpInput>;

/** Normalises a dial-pad entry: keeps digits and one leading +; Indian 10-digit mobiles get no prefix change. */
export function cleanDialInput(raw: string): string {
  const t = raw.trim();
  const plus = t.startsWith("+");
  const body = t.replace(/[^\d*#]/g, "");
  return (plus ? "+" : "") + body.slice(0, 15);
}

/** Digits sent to CallerDesk: +91XXXXXXXXXX / 91XXXXXXXXXX / 0XXXXXXXXXX → 10-digit Indian mobile; other international kept as digits. */
export function dialTarget(raw: string): string | null {
  if (/[*#]/.test(raw)) return null;
  const d = raw.replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(d)) return d;
  if (/^91[6-9]\d{9}$/.test(d)) return d.slice(2);
  if (raw.trim().startsWith("+") && /^\d{8,15}$/.test(d)) return d;
  if (/^0\d{9,11}$/.test(d)) return d; // landline with STD code
  return null;
}
