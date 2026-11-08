import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, X, Check, ChevronsUpDown, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { searchNicCodes, type NicResult } from "@/lib/onboarding/nic.functions";
import {
  extractNicCode,
  getNicClasses,
  getNicDivisions,
  getNicSubclasses,
  nicLabel,
  parseNicActivities,
  searchNicUnified,
  type NicActivity,
  type NicOption,
} from "@/lib/onboarding/nic-fill";
import { Button } from "@/components/ui/button";

const inputCls =
  "w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow";

const selectCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow disabled:bg-muted/50 disabled:text-muted-foreground disabled:cursor-not-allowed";

export type NicSectionProps = {
  sectionLabel?: string;
  hideHeader?: boolean;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  setMany: (patch: Record<string, string>) => void;
  activity?: "Manufacturing" | "Services" | "Trading" | null;
};

/**
 * Intelligent Unified NIC Code Section matching Government Udyam portal behavior:
 * 1. Single unified search combining 2-, 4-, and 5-digit codes without section headers.
 * 2. Automatic parent hierarchy population when 4- or 5-digit codes are selected.
 * 3. Restricted 5-digit selection showing only valid children of the selected hierarchy.
 * 4. Submission of all 3 valid codes (2-digit, 4-digit, 5-digit).
 */
export function NicCodeSection({
  sectionLabel = "20. National Industrial Classification (NIC) Code for Activities",
  hideHeader = false,
  values,
  onChange,
  setMany,
  activity,
}: NicSectionProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({ nic_2_digit: "", nic_4_digit: "", nic_5_digit: "" });
  const [draftActivity, setDraftActivity] = useState<"Manufacturing" | "Services" | "Trading">(activity ?? "Services");
  const [activityError, setActivityError] = useState("");
  const extras = useMemo(() => parseNicActivities(values.nic_activities), [values.nic_activities]);
  const selected = adding ? draft : values;
  const updateSelection = (patch: Record<string, string>) => {
    if (adding) setDraft((previous) => ({ ...previous, ...patch }));
    else setMany(patch);
    setActivityError("");
  };
  const updateField = (key: string, value: string) => {
    if (adding) updateSelection({ [key]: value });
    else onChange(key, value);
  };
  const firstActivity = values.nic_5_digit ? {
    nic_2_digit: values.nic_2_digit,
    nic_4_digit: values.nic_4_digit,
    nic_5_digit: values.nic_5_digit,
    activity_type: activity ?? "",
  } : null;
  const activities = firstActivity ? [firstActivity, ...extras] : extras;

  function addActivity() {
    if (!adding) {
      if (!firstActivity) {
        setActivityError("Select a 5-digit NIC activity first.");
        return;
      }
      setDraft({ nic_2_digit: "", nic_4_digit: "", nic_5_digit: "" });
      setDraftActivity(activity ?? "Services");
      setAdding(true);
      setActivityError("");
      inputRef.current?.focus();
      return;
    }
    const code2 = extractNicCode(draft.nic_2_digit);
    const code4 = extractNicCode(draft.nic_4_digit);
    const code5 = extractNicCode(draft.nic_5_digit);
    if (code2.length !== 2 || code4.length !== 4 || code5.length !== 5 || !code5.startsWith(code4) || !code4.startsWith(code2)) {
      setActivityError("Select a complete 5-digit NIC activity before adding it.");
      return;
    }
    if (activities.some((item) => extractNicCode(item.nic_5_digit) === code5)) {
      setActivityError("This activity has already been added.");
      return;
    }
    const next: NicActivity = { nic_2_digit: draft.nic_2_digit, nic_4_digit: draft.nic_4_digit, nic_5_digit: draft.nic_5_digit, activity_type: draftActivity };
    setMany({ nic_activities: JSON.stringify([...extras, next]) });
    setDraft({ nic_2_digit: "", nic_4_digit: "", nic_5_digit: "" });
    setAdding(false);
    setActivityError("");
  }

  function removeActivity(index: number) {
    const extraIndex = firstActivity ? index - 1 : index;
    if (extraIndex < 0) return;
    setMany({ nic_activities: JSON.stringify(extras.filter((_, i) => i !== extraIndex)) });
  }
  const fetchNic = useServerFn(searchNicCodes);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [dbResults, setDbResults] = useState<NicResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Derived current codes
  const current2Code = extractNicCode(selected.nic_2_digit);
  const current4Code = extractNicCode(selected.nic_4_digit);
  const current5Code = extractNicCode(selected.nic_5_digit);

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Debounced server search to complement instant local master search
  useEffect(() => {
    if (!open || !q.trim() || q.trim().length < 2) {
      setDbResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErr(null);

    const t = window.setTimeout(async () => {
      try {
        const res = await fetchNic({
          data: { q: q.trim(), activity: activity ?? null, limit: 30 },
        });
        if (cancelled) return;
        setDbResults(res.results);
        if (res.error) setErr(res.error);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q, open, activity, fetchNic]);

  // Unified results: instant local master search merged with server DB search
  const unifiedResults = useMemo(() => {
    const needle = q.trim();
    if (!needle) return [];

    // Local ranked search across all 2-, 4-, and 5-digit entries
    const local = searchNicUnified(needle, 35);
    const seenCodes = new Set(local.map((item) => item.code));
    const merged = [...local];

    // Merge any supplementary rows from DB
    for (const r of dbResults) {
      if (!seenCodes.has(r.code)) {
        seenCodes.add(r.code);
        merged.push({
          code: r.code,
          description: r.description,
          level: 5,
          label: `${r.code} — ${r.description}`,
        });
      }
    }

    return merged.slice(0, 35);
  }, [q, dbResults]);

  // Options for cascading hierarchy selects
  const divisionOptions = useMemo(() => getNicDivisions(), []);
  const classOptions = useMemo(() => getNicClasses(current2Code), [current2Code]);
  const subclassOptions = useMemo(() => {
    if (!current4Code) return [];
    const list = getNicSubclasses(current4Code);
    // If an existing value has a custom description or DB row, preserve it
    if (
      selected.nic_5_digit &&
      !list.some((o) => o.code === current5Code || o.label === selected.nic_5_digit)
    ) {
      list.unshift({ code: current5Code, label: selected.nic_5_digit });
    }
    return list;
  }, [current4Code, selected.nic_5_digit, current5Code]);

  function pickOption(option: NicOption) {
    if (option.level === 5) {
      // 5-digit selected: auto-derive 2-digit, 4-digit and 5-digit codes
      const l2 = nicLabel(option.code, 2);
      const l4 = nicLabel(option.code, 4);
      const l5 = nicLabel(option.code, 5, option.description) ?? option.label;
      updateSelection({
        nic_2_digit: l2 ?? "",
        nic_4_digit: l4 ?? "",
        nic_5_digit: l5,
      });
    } else if (option.level === 4) {
      // 4-digit selected: auto-set 2-digit and 4-digit, reset 5-digit to pending
      const l2 = nicLabel(option.code, 2);
      const l4 = nicLabel(option.code, 4, option.description) ?? option.label;
      updateSelection({
        nic_2_digit: l2 ?? "",
        nic_4_digit: l4,
        nic_5_digit: "",
      });
    } else if (option.level === 2) {
      // 2-digit selected: auto-set 2-digit, reset 4-digit and 5-digit
      const l2 = nicLabel(option.code, 2, option.description) ?? option.label;
      updateSelection({
        nic_2_digit: l2,
        nic_4_digit: "",
        nic_5_digit: "",
      });
    }
    setOpen(false);
    setQ("");
  }

  function handleClear() {
    updateSelection({
      nic_2_digit: "",
      nic_4_digit: "",
      nic_5_digit: "",
    });
    setQ("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    const count = unifiedResults.length;
    if (e.key === "ArrowDown" && count > 0) {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, count - 1));
    } else if (e.key === "ArrowUp" && count > 0) {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && count > 0) {
      e.preventDefault();
      if (unifiedResults[activeIndex]) {
        pickOption(unifiedResults[activeIndex]);
      }
    }
  }

  const hasAnySelection = Boolean(selected.nic_2_digit || selected.nic_4_digit || selected.nic_5_digit);
  const displaySummary = selected.nic_5_digit || selected.nic_4_digit || selected.nic_2_digit || "";

  return (
    <div className={`md:col-span-2 space-y-4 ${hideHeader ? "" : "pt-4 mt-2 border-t border-border"}`}>
      {/* Section Header */}
      {!hideHeader && (
        <div>
          <h3 className="text-base md:text-lg font-bold font-display text-brand-navy-deep">
            {sectionLabel}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Search your business activity or choose from the official classification hierarchy below.
          </p>
        </div>
      )}

      {/* 1. Unified Intelligent Search */}
      <div className="relative" ref={wrapRef}>
        <label htmlFor="f-nic-unified-search" className="block text-sm font-semibold text-foreground mb-1.5">
          Search NIC Activity / Code
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
            />
            <input
              ref={inputRef}
              id="f-nic-unified-search"
              value={open ? q : displaySummary}
              onFocus={() => {
                setQ("");
                setActiveIndex(0);
                setOpen(true);
              }}
              onClick={() => setOpen(true)}
              onChange={(e) => {
                setQ(e.target.value);
                setActiveIndex(0);
                setOpen(true);
              }}
              onKeyDown={onSearchKeyDown}
              role="combobox"
              aria-expanded={open}
              aria-controls="f-nic-unified-results"
              aria-autocomplete="list"
              autoComplete="off"
              placeholder="Search by activity or code (e.g. software, wholesale, 4651, 62011)…"
              className={inputCls + " pl-10 pr-9"}
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {(hasAnySelection || q) && (
            <Button
              type="button"
              onClick={handleClear}
              variant="outline"
              size="icon"
              className="h-auto min-h-10 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Clear NIC selection"
              title="Clear NIC selection"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Combined Unified Results List — No artificial section headers */}
        {open && (
          <div
            id="f-nic-unified-results"
            role="listbox"
            className="absolute z-30 mt-1.5 w-full rounded-xl border border-border bg-background shadow-xl overflow-hidden max-h-80 overflow-y-auto"
          >
            {loading && !unifiedResults.length && (
              <div className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-primary" />
                Searching NIC codes…
              </div>
            )}

            {err && <div className="px-4 py-3 text-sm text-destructive">{err}</div>}

            {!loading && !err && unifiedResults.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                {q ? `No NIC codes found for "${q}". Try another keyword or 2/4-digit code.` : "Type a keyword or NIC code to search."}
              </div>
            )}

            {unifiedResults.map((opt, index) => {
              const isSelected =
                selected.nic_5_digit.startsWith(`${opt.code} `) ||
                selected.nic_4_digit.startsWith(`${opt.code} `) ||
                selected.nic_2_digit.startsWith(`${opt.code} `);

              return (
                <button
                  key={`${opt.level}-${opt.code}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => pickOption(opt)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`w-full whitespace-normal text-left px-3.5 py-2.5 flex items-start gap-2.5 border-b border-border/40 last:border-0 transition-colors ${
                    activeIndex === index ? "bg-muted/70 text-foreground" : "text-foreground hover:bg-muted/40"
                  }`}
                >
                  <span className="font-mono text-xs font-bold text-brand-navy bg-brand-navy/10 px-2 py-0.5 rounded shrink-0">
                    {opt.code}
                  </span>
                  <span className="flex-1 text-sm leading-snug">
                    {opt.description}
                  </span>
                  {isSelected && <Check className="mt-0.5 size-4 text-emerald-600 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Status Banner */}
      {selected.nic_5_digit ? (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-2 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
          <span>
            Activity selected: <strong>{selected.nic_5_digit}</strong>
          </span>
        </div>
      ) : selected.nic_4_digit ? (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3.5 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <span>
            4-digit class chosen. <strong>Select a 5-digit activity below</strong> to complete your application.
          </span>
        </div>
      ) : null}

      {/* 2. Hierarchical Fields (2-digit, 4-digit, 5-digit) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* NIC 2 Digit Code */}
        <div>
          <label htmlFor="f-nic_2_digit" className="block text-sm font-semibold text-foreground mb-1.5">
            NIC 2 Digit Code <span className="text-destructive">*</span>
          </label>
          <select
            id="f-nic_2_digit"
            value={current2Code ? (nicLabel(current2Code, 2) ?? selected.nic_2_digit) : ""}
            onChange={(e) => {
              const val = e.target.value;
              updateSelection({
                nic_2_digit: val,
                nic_4_digit: "",
                nic_5_digit: "",
              });
            }}
            className={selectCls}
          >
            <option value="" disabled>
              Select 2 Digit Code…
            </option>
            {divisionOptions.map((opt) => (
              <option key={opt.code} value={opt.label}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* NIC 4 Digit Code */}
        <div>
          <label htmlFor="f-nic_4_digit" className="block text-sm font-semibold text-foreground mb-1.5">
            NIC 4 Digit Code <span className="text-destructive">*</span>
          </label>
          <select
            id="f-nic_4_digit"
            value={current4Code ? (nicLabel(current4Code, 4) ?? selected.nic_4_digit) : ""}
            disabled={!current2Code}
            onChange={(e) => {
              const val = e.target.value;
              updateSelection({
                nic_4_digit: val,
                nic_5_digit: "",
              });
            }}
            className={selectCls}
          >
            <option value="" disabled>
              {current2Code ? "Select 4 Digit Code…" : "Select 2 Digit Code first"}
            </option>
            {classOptions.map((opt) => (
              <option key={opt.code} value={opt.label}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* NIC 5 Digit Code — Strictly restricted to valid children */}
        <div>
          <label htmlFor="f-nic_5_digit" className="block text-sm font-semibold text-foreground mb-1.5">
            NIC 5 Digit Code <span className="text-destructive">*</span>
          </label>
          <select
            id="f-nic_5_digit"
            value={selected.nic_5_digit || ""}
            disabled={!current4Code}
            onChange={(e) => {
              updateField("nic_5_digit", e.target.value);
            }}
            className={selectCls}
          >
            <option value="" disabled>
              {current4Code ? "Select 5 Digit Activity…" : "Select 4 Digit Code first"}
            </option>
            {subclassOptions.map((opt) => (
              <option key={opt.code} value={opt.label}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {adding && (
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="nic-activity-type" className="text-sm font-medium text-foreground">Activity type</label>
          <select id="nic-activity-type" value={draftActivity} onChange={(e) => setDraftActivity(e.target.value as typeof draftActivity)} className={selectCls + " w-auto"}>
            <option value="Manufacturing">Manufacturing</option>
            <option value="Services">Services</option>
            <option value="Trading">Trading</option>
          </select>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={addActivity} className="gap-2">
          <Plus className="size-4" /> {adding ? "Save Activity" : "Add Activity"}
        </Button>
        {adding && <Button type="button" variant="outline" onClick={() => { setAdding(false); setActivityError(""); }}>Cancel</Button>}
      </div>
      {activityError && <p role="alert" className="text-sm text-destructive">{activityError}</p>}
      {activities.length > 0 && (
        <div className="overflow-x-auto border border-border rounded-md">
          <table className="w-full min-w-[580px] text-sm text-left">
            <thead className="bg-muted text-foreground"><tr><th className="p-2">No.</th><th className="p-2">NIC 2 Digit</th><th className="p-2">NIC 4 Digit</th><th className="p-2">NIC 5 Digit</th><th className="p-2">Activity Type</th><th className="p-2">Remove</th></tr></thead>
            <tbody className="divide-y divide-border">
              {activities.map((item, index) => (
                <tr key={`${extractNicCode(item.nic_5_digit)}-${index}`}>
                  <td className="p-2">{index + 1}</td><td className="p-2">{item.nic_2_digit}</td><td className="p-2">{item.nic_4_digit}</td><td className="p-2">{item.nic_5_digit}</td><td className="p-2">{item.activity_type || "—"}</td>
                  <td className="p-2">{index === 0 && firstActivity ? "Primary" : <Button type="button" size="icon" variant="ghost" aria-label={`Remove NIC activity ${index + 1}`} title="Remove activity" onClick={() => removeActivity(index)}><Trash2 className="size-4" /></Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Legacy / Standalone picker fallback if needed */
type LegacyProps = {
  value: string;
  onChange: (v: string) => void;
  activity?: "Manufacturing" | "Services" | "Trading" | null;
  digits?: 2 | 4 | 5;
  required?: boolean;
  id?: string;
  onPickCode?: (code5: string) => void;
  onPickLevel?: (code: string, level: 2 | 4 | 5) => void;
  inlineSearch?: boolean;
};

export function NicCodePicker({
  value,
  onChange,
  digits = 5,
  id,
  onPickCode,
  onPickLevel,
}: LegacyProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const results = useMemo(() => searchNicUnified(q, 25), [q]);

  function pick(opt: NicOption) {
    if (onPickLevel) {
      onPickLevel(opt.code, opt.level);
    } else if (onPickCode) {
      onPickCode(opt.code);
    } else {
      onChange(nicLabel(opt.code, digits) ?? opt.label);
    }
    setOpen(false);
    setQ("");
  }

  return (
    <div className="relative" ref={wrapRef}>
      <div className="flex gap-2">
        <input
          id={id}
          value={open ? q : value}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          placeholder="Search NIC code or activity description…"
          className={inputCls}
        />
        {value && (
          <Button
            type="button"
            onClick={() => onChange("")}
            variant="outline"
            size="icon"
            className="h-auto min-h-10 shrink-0 text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full rounded-xl border border-border bg-background shadow-xl overflow-hidden max-h-72 overflow-y-auto">
          {results.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              {q ? "No NIC codes match your search." : "Type to search NIC codes."}
            </div>
          )}
          {results.map((opt) => (
            <button
              key={`${opt.level}-${opt.code}`}
              type="button"
              onClick={() => pick(opt)}
              className="w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 border-b border-border/40 last:border-0 hover:bg-muted/50"
            >
              <span className="font-mono text-xs font-bold text-brand-navy bg-brand-navy/10 px-2 py-0.5 rounded shrink-0">
                {opt.code}
              </span>
              <span className="flex-1 text-sm">{opt.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

