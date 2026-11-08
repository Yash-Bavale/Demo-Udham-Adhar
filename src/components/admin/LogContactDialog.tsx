import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { logLeadContact } from "@/lib/crm/performance.functions";

const CHANNELS = ["call", "whatsapp", "email", "sms", "note"] as const;
const OUTCOMES = [
  { value: "connected", label: "Connected" },
  { value: "no_answer", label: "No answer" },
  { value: "wrong_number", label: "Wrong number" },
  { value: "not_interested", label: "Not interested" },
  { value: "callback", label: "Callback scheduled" },
  { value: "converted_intent", label: "Ready to pay" },
  { value: "sent", label: "Message sent" },
] as const;

export function LogContactDialog({
  leadId,
  open,
  onOpenChange,
}: {
  leadId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [channels, setChannels] = useState<Array<(typeof CHANNELS)[number]>>(["call"]);
  const [outcomes, setOutcomes] = useState<Array<(typeof OUTCOMES)[number]["value"]>>(["connected"]);
  const [notes, setNotes] = useState("");
  const qc = useQueryClient();
  const fn = useServerFn(logLeadContact);
  const m = useMutation({
    mutationFn: () => fn({ data: { leadId, channel: channels[0], channels, outcomes, notes: notes.trim() || undefined } }),
    onSuccess: () => {
      toast.success("Feedback saved");
      qc.invalidateQueries({ queryKey: ["admin.lead-events", leadId] });
      qc.invalidateQueries({ queryKey: ["admin.lead-contact-events", leadId] });
      qc.invalidateQueries({ queryKey: ["perf.me"] });
      setNotes("");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const toggleChannel = (value: (typeof CHANNELS)[number]) => {
    setChannels((prev) => {
      if (prev.includes(value)) {
        if (prev.length <= 1) return prev; // keep at least 1 channel selected
        return prev.filter((c) => c !== value);
      }
      return [...prev, value];
    });
  };

  const toggleOutcome = (value: (typeof OUTCOMES)[number]["value"]) => {
    setOutcomes((prev) => {
      if (prev.includes(value)) {
        if (prev.length <= 1) return prev; // keep at least 1 outcome selected
        return prev.filter((o) => o !== value);
      }
      return [...prev, value];
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log contact attempt</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Channel (select multiple)</Label>
              <span className="text-[10px] text-slate-400">Click to select multiple</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {CHANNELS.map((c) => {
                const isSelected = channels.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleChannel(c)}
                    className={`px-2.5 py-1 rounded-md border text-xs capitalize transition-colors ${
                      isSelected
                        ? "bg-slate-900 text-white border-slate-900 font-medium"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {c} {isSelected && "✓"}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Outcome (select multiple)</Label>
              <span className="text-[10px] text-slate-400">Click to select multiple</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {OUTCOMES.map((o) => {
                const isSelected = outcomes.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggleOutcome(o.value)}
                    className={`px-2.5 py-1 rounded-md border text-xs transition-colors ${
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-600 font-medium"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {o.label} {isSelected && "✓"}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What did the customer say?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
