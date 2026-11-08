import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMobile55(mobile?: string | null): string {
  if (!mobile) return "—";
  const raw = String(mobile).trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    const main = digits.slice(2);
    return `+91 ${main.slice(0, 5)} ${main.slice(5)}`;
  }
  return raw;
}
