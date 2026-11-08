import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, type ReactNode } from "react";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";

const STORAGE_KEY = "crm_dashboard_privacy_mode";
export const DASHBOARD_PRIVACY_MASK = "•••";

export interface DashboardPrivacyContextValue {
  isPrivacyEnabled: boolean;
  togglePrivacy: () => void;
  setPrivacy: (enabled: boolean) => void;
  maskValue: (value: string | number | null | undefined, maskPlaceholder?: string) => string;
}

const DashboardPrivacyContext = createContext<DashboardPrivacyContextValue | null>(null);

export function DashboardPrivacyProvider({ children }: { children: ReactNode }) {
  const [isPrivacyEnabled, setIsPrivacyEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        setIsPrivacyEnabled(stored === "true");
      }
    } catch {
      // Ignore localStorage errors
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue !== null) {
        setIsPrivacyEnabled(e.newValue === "true");
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setPrivacy = useCallback((enabled: boolean) => {
    setIsPrivacyEnabled(enabled);
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
      window.dispatchEvent(new CustomEvent("dashboard-privacy-changed", { detail: { enabled } }));
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const togglePrivacy = useCallback(() => {
    setPrivacy(!isPrivacyEnabled);
  }, [isPrivacyEnabled, setPrivacy]);

  const maskValue = useCallback(
    (value: string | number | null | undefined, maskPlaceholder: string = DASHBOARD_PRIVACY_MASK): string => {
      if (isPrivacyEnabled) {
        return maskPlaceholder;
      }
      if (value == null) return "—";
      return typeof value === "number" ? value.toLocaleString("en-IN") : String(value);
    },
    [isPrivacyEnabled]
  );

  const value = useMemo<DashboardPrivacyContextValue>(
    () => ({
      isPrivacyEnabled,
      togglePrivacy,
      setPrivacy,
      maskValue,
    }),
    [isPrivacyEnabled, togglePrivacy, setPrivacy, maskValue]
  );

  return (
    <DashboardPrivacyContext.Provider value={value}>
      {children}
    </DashboardPrivacyContext.Provider>
  );
}

export function useDashboardPrivacy(): DashboardPrivacyContextValue {
  const ctx = useContext(DashboardPrivacyContext);
  const role = useRole();
  const userPerms = usePermissions();
  const isSuperAdmin = role.has("super_admin") || role.has("super");
  const isAdminUser = isSuperAdmin || role.has("admin") || Boolean(userPerms.perms?.isAdmin);

  if (!ctx || (!role.loading && !isAdminUser)) {
    return {
      isPrivacyEnabled: false,
      togglePrivacy: () => {},
      setPrivacy: () => {},
      maskValue: (v) => (v != null ? String(v) : "—"),
    };
  }
  return ctx;
}
