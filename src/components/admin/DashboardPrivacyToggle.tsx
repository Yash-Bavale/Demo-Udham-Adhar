import React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDashboardPrivacy } from "@/hooks/useDashboardPrivacy";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

export interface DashboardPrivacyToggleProps {
  className?: string;
}

export function DashboardPrivacyToggle({ className }: DashboardPrivacyToggleProps) {
  const { isPrivacyEnabled, togglePrivacy } = useDashboardPrivacy();
  const role = useRole();
  const userPerms = usePermissions();
  const isSuperAdmin = role.has("super_admin") || role.has("super");
  const isAdminUser = isSuperAdmin || role.has("admin") || Boolean(userPerms.perms?.isAdmin);

  if (!isAdminUser) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={togglePrivacy}
            aria-label={isPrivacyEnabled ? "Reveal dashboard and order values" : "Hide dashboard and order values"}
            aria-pressed={isPrivacyEnabled}
            className={cn(
              "relative size-8 inline-flex items-center justify-center rounded-lg border transition-all duration-150 cursor-pointer select-none shrink-0 shadow-2xs active:scale-95",
              isPrivacyEnabled
                ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-400 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
              className
            )}
          >
            {isPrivacyEnabled ? (
              <>
                <EyeOff className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
              </>
            ) : (
              <Eye className="size-4 text-slate-500 dark:text-slate-400 shrink-0" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="text-xs">
          {isPrivacyEnabled
            ? "Values Hidden — Click to reveal"
            : "Hide values & KPI counts"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default DashboardPrivacyToggle;
