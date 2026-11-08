// Click → copies text → shows checkmark for 2s (Final_CRM Part O).
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export function CopyButton({ value, label = "Copy", className }: CopyButtonProps) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={async (e) => {
        e.stopPropagation();
        e.preventDefault();
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          /* silent */
        }
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors",
        className,
      )}
    >
      {done ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}
