// Replaces alert/confirm/prompt across admin (Final_CRM Part J + O).
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** When set, user must type this exact word to enable the confirm button. */
  confirmWord?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmWord,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger,
  loading,
  onConfirm,
}: ConfirmModalProps) {
  const [typed, setTyped] = useState("");
  useEffect(() => { if (!open) setTyped(""); }, [open]);

  if (!open) return null;
  const armed = !confirmWord || typed.trim() === confirmWord;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={() => !loading && onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="rounded-2xl bg-white shadow-2xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {description && (
          <div className="mt-2 text-sm text-slate-600">{description}</div>
        )}
        {confirmWord && (
          <div className="mt-4">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Type <span className="font-mono">{confirmWord}</span> to confirm
            </label>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              disabled={loading}
            />
          </div>
        )}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => onOpenChange(false)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading || !armed}
            onClick={() => onConfirm()}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50",
              danger ? "bg-red-600 hover:bg-red-700" : "bg-slate-900 hover:bg-slate-800",
            )}
          >
            {loading ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
