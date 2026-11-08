import React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFinancialVisibility } from "@/hooks/useFinancialVisibility";
import { cn } from "@/lib/utils";

export interface FinancialPrivacySwitchProps {
  className?: string;
  showLabel?: boolean;
  size?: "sm" | "default";
}

export function FinancialPrivacySwitch({
  className,
  showLabel = true,
  size = "default",
}: FinancialPrivacySwitchProps) {
  const { isFinancialPrivacyEnabled, setFinancialPrivacy } = useFinancialVisibility();
  const switchId = "financial-privacy-switch";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 transition-colors select-none",
              isFinancialPrivacyEnabled
                ? "border-amber-300 bg-amber-50/80 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
                : "border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
              size === "sm" && "px-2 py-0.5 text-xs",
              className
            )}
          >
            {isFinancialPrivacyEnabled ? (
              <EyeOff className={cn("size-4 shrink-0 text-amber-600 dark:text-amber-400", size === "sm" && "size-3.5")} aria-hidden="true" />
            ) : (
              <Eye className={cn("size-4 shrink-0 text-slate-500 dark:text-slate-400", size === "sm" && "size-3.5")} aria-hidden="true" />
            )}

            {showLabel && (
              <label
                htmlFor={switchId}
                className={cn(
                  "cursor-pointer text-xs font-medium tracking-tight whitespace-nowrap",
                  isFinancialPrivacyEnabled ? "text-amber-900 dark:text-amber-100 font-semibold" : "text-slate-700 dark:text-slate-300"
                )}
              >
                Financial Privacy
              </label>
            )}

            <Switch
              id={switchId}
              checked={isFinancialPrivacyEnabled}
              onCheckedChange={setFinancialPrivacy}
              aria-label="Financial Privacy"
              className={cn(
                "data-[state=checked]:bg-amber-600 dark:data-[state=checked]:bg-amber-500",
                size === "sm" && "scale-90"
              )}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="max-w-xs text-xs font-normal shadow-md">
          <p className="font-semibold text-[11px] mb-0.5">
            {isFinancialPrivacyEnabled ? "Financial Privacy Active" : "Financial Privacy Off"}
          </p>
          <p className="text-slate-200">Hide revenue, payment and order amounts across the admin panel.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
