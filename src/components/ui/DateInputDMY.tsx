import { useEffect, useRef, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Return 00:00:00 local time for today. */
export function getTodayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isTodayOrFutureIso(iso: string): boolean {
  if (!iso) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return d >= getTodayStart();
}

// Convert ISO YYYY-MM-DD ↔ DD/MM/YYYY for display.
function isoToDmy(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function dmyToIso(dmy: string, allowFuture = false): { iso: string | null; error?: string } {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy.trim());
  if (!m) return { iso: null };
  const [, dd, mm, yyyy] = m;
  const d = Number(dd), mo = Number(mm), y = Number(yyyy);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return { iso: null };
  const test = new Date(Date.UTC(y, mo - 1, d));
  if (test.getUTCFullYear() !== y || test.getUTCMonth() !== mo - 1 || test.getUTCDate() !== d) return { iso: null };

  const selectedDate = new Date(y, mo - 1, d);
  selectedDate.setHours(0, 0, 0, 0);

  if (!allowFuture && selectedDate >= getTodayStart()) {
    return { iso: null, error: "Date cannot be today or a future date" };
  }

  return { iso: `${yyyy}-${mm}-${dd}` };
}

/** Auto-format the raw digits into DD/MM/YYYY as the user types. */
function maskDmy(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join("/");
}

export type DateInputDMYProps = {
  id?: string;
  name?: string;
  value: string; // ISO YYYY-MM-DD (empty string when unset)
  onChange: (iso: string) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  allowFuture?: boolean; // Defaults to false
};

export function DateInputDMY({
  id,
  name,
  value,
  onChange,
  required,
  placeholder = "DD/MM/YYYY",
  className,
  disabled,
  allowFuture = false,
}: DateInputDMYProps) {
  const [text, setText] = useState<string>(isoToDmy(value));
  const [open, setOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Keep local text in sync when the ISO value is updated externally.
  useEffect(() => {
    setText(isoToDmy(value));
    if (value && !allowFuture && isTodayOrFutureIso(value)) {
      setErrorMsg("Date cannot be today or a future date");
    } else {
      setErrorMsg(null);
    }
  }, [value, allowFuture]);

  const iso = value || "";
  const selected = iso ? new Date(`${iso}T00:00:00`) : undefined;

  const inputCls = cn(
    "w-full rounded-xl border bg-background pl-4 pr-11 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow",
    errorMsg ? "border-destructive focus:ring-destructive" : "border-border",
  );

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        required={required}
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        maxLength={10}
        onChange={(e) => {
          const masked = maskDmy(e.target.value);
          setText(masked);
          const res = dmyToIso(masked, allowFuture);
          if (res.error) {
            setErrorMsg(res.error);
            onChange("");
          } else if (res.iso) {
            setErrorMsg(null);
            onChange(res.iso);
          } else {
            setErrorMsg(null);
            if (!masked) onChange("");
          }
        }}
        onBlur={() => {
          const res = dmyToIso(text, allowFuture);
          if (res.error) {
            setErrorMsg(res.error);
            onChange("");
            setText("");
          } else if (res.iso) {
            setErrorMsg(null);
            onChange(res.iso);
          } else if (!text) {
            setErrorMsg(null);
            onChange("");
          } else {
            setText(isoToDmy(value));
          }
        }}
        className={inputCls}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Open calendar"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <CalendarIcon className="w-4 h-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            disabled={allowFuture ? undefined : (date) => date >= getTodayStart()}
            onSelect={(d) => {
              if (!d) return;
              if (!allowFuture && d >= getTodayStart()) return;
              const y = d.getFullYear();
              const mo = String(d.getMonth() + 1).padStart(2, "0");
              const dd = String(d.getDate()).padStart(2, "0");
              const nextIso = `${y}-${mo}-${dd}`;
              setErrorMsg(null);
              onChange(nextIso);
              setText(isoToDmy(nextIso));
              setOpen(false);
            }}
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
      {errorMsg && (
        <p className="mt-1 text-xs text-destructive font-medium">{errorMsg}</p>
      )}
    </div>
  );
}
