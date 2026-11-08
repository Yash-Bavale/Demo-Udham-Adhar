// Phase 3 — Reason Picker (14 close reasons grouped A/B/C).
// Shows the standard reply for the selected reason as an editable draft.
import { useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCloseReasons, type OrderCloseReason } from "@/lib/orders/actions/reasons.functions";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const CATEGORY_LABEL: Record<string, string> = {
  "Closure Reasons": "Closure Reasons (Reason Library)",
  A: "Category A – Customer Side Delay / Customer Action Required",
  B: "Category B – Technical Delay (External Dependency)",
  C: "Category C – Technical Delay (Our Internal Operational)",
};

interface Props {
  value: string | null;
  onChange: (reasonId: string, reason: OrderCloseReason | null) => void;
  reply: string;
  onReplyChange: (reply: string) => void;
  /** Hide the reply textarea when the caller only wants the reason id. */
  hideReply?: boolean;
  disabled?: boolean;
}

export function ReasonPicker({ value, onChange, reply, onReplyChange, hideReply, disabled }: Props) {
  const fetchReasons = useServerFn(listCloseReasons);
  const { data: serverReasons = [], isLoading } = useQuery({
    queryKey: ["order-close-reasons"],
    queryFn: () => fetchReasons(),
    staleTime: 5 * 60_000,
  });

  // Only DB-backed reasons (real UUIDs) are selectable — the hardcoded
  // STANDARD_CLOSE_REASONS ids would be rejected by downstream validation.
  const reasons = serverReasons;

  const grouped = useMemo(() => {
    const g = new Map<string, OrderCloseReason[]>();
    for (const r of reasons) {
      if (!g.has(r.category)) g.set(r.category, []);
      g.get(r.category)!.push(r);
    }
    return g;
  }, [reasons]);

  const selected = reasons.find((r) => r.id === value) ?? null;

  // Auto-fill standard reply when selected reason changes
  const lastIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selected && selected.id !== lastIdRef.current) {
      lastIdRef.current = selected.id;
      if (selected.standard_reply) {
        onReplyChange(selected.standard_reply);
      }
    }
  }, [selected?.id, selected?.standard_reply, onReplyChange]);

  const handleSelectReason = (id: string) => {
    const r = reasons.find((item) => item.id === id) ?? null;
    onChange(id, r);
    if (r?.standard_reply) {
      onReplyChange(r.standard_reply);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Reason</Label>
        <Select
          value={value ?? undefined}
          onValueChange={handleSelectReason}
          disabled={disabled || isLoading}
        >
          <SelectTrigger className="w-full text-left">
            <SelectValue placeholder={isLoading ? "Loading reasons…" : "Select a reason"} />
          </SelectTrigger>
          <SelectContent className="max-h-96">
            {[...grouped.entries()].map(([cat, list]) => (
              <SelectGroup key={cat}>
                <SelectLabel className="font-bold text-slate-900 text-xs px-2 py-1.5 bg-slate-100/80 border-y my-1">
                  {CATEGORY_LABEL[cat] ?? cat}
                </SelectLabel>
                {list.map((r) => (
                  <SelectItem key={r.id} value={r.id} className="py-2">
                    <span className="font-medium text-slate-800">{r.label}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!hideReply && (
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
            Reply to customer {selected?.standard_reply ? "(standard reply auto-filled, editable)" : ""}
          </Label>
          <Textarea
            value={reply}
            onChange={(e) => onReplyChange(e.target.value)}
            rows={6}
            placeholder="Standard reply will pre-fill automatically when you pick a reason."
            disabled={disabled}
            className="text-sm font-sans leading-relaxed p-3 border border-slate-300 rounded-md focus:ring-rose-500 focus:border-rose-500"
          />
        </div>
      )}
    </div>
  );
}
