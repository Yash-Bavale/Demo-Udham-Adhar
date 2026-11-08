import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, type ReactNode } from "react";

const STORAGE_KEY = "crm_financial_privacy";
export const FINANCIAL_PRIVACY_MASK = "••••••";

export interface FinancialFormatOptions {
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  prefix?: string;
  suffix?: string;
  isShort?: boolean;
  mask?: string;
}

/**
 * Pure formatting functions that accept the privacy state explicitly.
 */
export function formatINRRaw(
  value: number | string | null | undefined,
  isPrivacyEnabled = false,
  options?: { maximumFractionDigits?: number; minimumFractionDigits?: number; prefix?: string; suffix?: string }
): string {
  const prefix = options?.prefix ?? "₹";
  const suffix = options?.suffix ?? "";

  if (isPrivacyEnabled) {
    return `${prefix}${FINANCIAL_PRIVACY_MASK}${suffix}`;
  }

  if (value == null || value === "") {
    return `${prefix}0${suffix}`;
  }

  const num = typeof value === "number" ? value : Number(value);
  if (isNaN(num)) {
    return `${prefix}0${suffix}`;
  }

  const maxDigits = options?.maximumFractionDigits ?? 0;
  const minDigits = options?.minimumFractionDigits ?? 0;

  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  }).format(num);

  return `${prefix}${formatted}${suffix}`;
}

export function formatShortINRRaw(
  value: number | string | null | undefined,
  isPrivacyEnabled = false,
  options?: { prefix?: string }
): string {
  const prefix = options?.prefix ?? "₹";

  if (isPrivacyEnabled) {
    return `${prefix}${FINANCIAL_PRIVACY_MASK}`;
  }

  if (value == null || value === "") {
    return `${prefix}0`;
  }

  const num = typeof value === "number" ? value : Number(value);
  if (isNaN(num)) {
    return `${prefix}0`;
  }

  if (num >= 10_000_000) {
    return `${prefix}${(num / 10_000_000).toFixed(2)}Cr`;
  }
  if (num >= 100_000) {
    return `${prefix}${(num / 100_000).toFixed(2)}L`;
  }
  if (num >= 1000) {
    return `${prefix}${(num / 1000).toFixed(1)}k`;
  }
  return `${prefix}${Math.round(num)}`;
}

export function formatFinancialAmountRaw(
  value: number | string | null | undefined,
  isPrivacyEnabled = false,
  options?: FinancialFormatOptions
): string {
  if (options?.isShort) {
    return formatShortINRRaw(value, isPrivacyEnabled, { prefix: options.prefix });
  }
  return formatINRRaw(value, isPrivacyEnabled, options);
}

export function maskFinancialAmountRaw(
  value: string | number | null | undefined,
  isPrivacyEnabled = false,
  maskPlaceholder = FINANCIAL_PRIVACY_MASK
): string {
  if (isPrivacyEnabled) {
    return maskPlaceholder;
  }
  return value != null ? String(value) : "—";
}

export interface FinancialVisibilityContextValue {
  isFinancialPrivacyEnabled: boolean;
  toggleFinancialPrivacy: () => void;
  setFinancialPrivacy: (enabled: boolean) => void;
  formatINR: (
    value: number | string | null | undefined,
    options?: { maximumFractionDigits?: number; minimumFractionDigits?: number; prefix?: string; suffix?: string }
  ) => string;
  formatShortINR: (value: number | string | null | undefined, options?: { prefix?: string }) => string;
  formatFinancialAmount: (value: number | string | null | undefined, options?: FinancialFormatOptions) => string;
  maskAmount: (value: string | number | null | undefined, maskPlaceholder?: string) => string;
}

const FinancialVisibilityContext = createContext<FinancialVisibilityContextValue | null>(null);

export function FinancialVisibilityProvider({ children }: { children: ReactNode }) {
  const [isFinancialPrivacyEnabled, setIsFinancialPrivacyEnabled] = useState<boolean>(false);

  // Initialize from localStorage safely in browser
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        setIsFinancialPrivacyEnabled(stored === "true");
      }
    } catch {
      // Ignore localStorage errors (e.g. private mode)
    }
  }, []);

  const setFinancialPrivacy = useCallback((enabled: boolean) => {
    setIsFinancialPrivacyEnabled(enabled);
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const toggleFinancialPrivacy = useCallback(() => {
    setFinancialPrivacy(!isFinancialPrivacyEnabled);
  }, [isFinancialPrivacyEnabled, setFinancialPrivacy]);

  const formatINR = useCallback(
    (
      value: number | string | null | undefined,
      options?: { maximumFractionDigits?: number; minimumFractionDigits?: number; prefix?: string; suffix?: string }
    ) => {
      return formatINRRaw(value, isFinancialPrivacyEnabled, options);
    },
    [isFinancialPrivacyEnabled]
  );

  const formatShortINR = useCallback(
    (value: number | string | null | undefined, options?: { prefix?: string }) => {
      return formatShortINRRaw(value, isFinancialPrivacyEnabled, options);
    },
    [isFinancialPrivacyEnabled]
  );

  const formatFinancialAmount = useCallback(
    (value: number | string | null | undefined, options?: FinancialFormatOptions) => {
      return formatFinancialAmountRaw(value, isFinancialPrivacyEnabled, options);
    },
    [isFinancialPrivacyEnabled]
  );

  const maskAmount = useCallback(
    (value: string | number | null | undefined, maskPlaceholder?: string) => {
      return maskFinancialAmountRaw(value, isFinancialPrivacyEnabled, maskPlaceholder);
    },
    [isFinancialPrivacyEnabled]
  );

  const value = useMemo<FinancialVisibilityContextValue>(
    () => ({
      isFinancialPrivacyEnabled,
      toggleFinancialPrivacy,
      setFinancialPrivacy,
      formatINR,
      formatShortINR,
      formatFinancialAmount,
      maskAmount,
    }),
    [
      isFinancialPrivacyEnabled,
      toggleFinancialPrivacy,
      setFinancialPrivacy,
      formatINR,
      formatShortINR,
      formatFinancialAmount,
      maskAmount,
    ]
  );

  return (
    <FinancialVisibilityContext.Provider value={value}>
      {children}
    </FinancialVisibilityContext.Provider>
  );
}

/**
 * Hook to access and control the global financial privacy state in the admin/CRM panel.
 * Fallback values are safe to use even if rendered outside provider.
 */
export function useFinancialVisibility(): FinancialVisibilityContextValue {
  const ctx = useContext(FinancialVisibilityContext);
  if (!ctx) {
    return {
      isFinancialPrivacyEnabled: false,
      toggleFinancialPrivacy: () => {},
      setFinancialPrivacy: () => {},
      formatINR: (v, opts) => formatINRRaw(v, false, opts),
      formatShortINR: (v, opts) => formatShortINRRaw(v, false, opts),
      formatFinancialAmount: (v, opts) => formatFinancialAmountRaw(v, false, opts),
      maskAmount: (v, mask) => maskFinancialAmountRaw(v, false, mask),
    };
  }
  return ctx;
}
