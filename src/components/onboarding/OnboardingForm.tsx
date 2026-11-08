import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { INDIA_STATES, PLANT_UNIT_TYPES, CHECKBOX_ON, clearHiddenFields, isFieldVisible, type FieldDef, type OnboardingSchema } from "@/lib/onboarding/schemas";
import { INDIA_DISTRICTS } from "@/lib/onboarding/india-districts";
import { NicCodePicker, NicCodeSection } from "./NicCodePicker";
import { nicLabel, promoteNicActivities } from "@/lib/onboarding/nic-fill";
import { DateInputDMY } from "@/components/ui/DateInputDMY";


const UPPERCASE_FIELDS = new Set([
  "bank_ifsc",
  "udyam_number",
  "uam_number",
  "pan_number",
  "pan_holder_pan",
  "gstin",
]);

const TITLECASE_FIELDS = new Set([
  "applicant_name",
  "pan_holder_name",
  "authorized_person_name",
  "bank_name",
  "branch_name",
  "enterprise_name",
  "organisation_name",
  "address_flat",
  "address_premises",
  "address_village",
  "address_block",
  "address_road",
  "city",
]);

const PRESERVE_UPPER = new Set([
  "PVT","LTD","LLP","HUF","OPC","INC","CO","PLC","LLC","SSI","MSME","IT","BPO","KPO","HR","R&D","II","III","IV","VI","VII","VIII","IX","XI","XII",
]);

function toTitleCase(input: string): string {
  if (!input) return input;
  return input
    .toLowerCase()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) =>
      word
        .split("-")
        .map((seg) => {
          const upper = seg.toUpperCase();
          if (PRESERVE_UPPER.has(upper)) return upper;
          if (!seg) return seg;
          return seg.charAt(0).toUpperCase() + seg.slice(1);
        })
        .join("-"),
    )
    .join(" ");
}

export function validatePattern(pattern: string, val: string): boolean {
  if (!pattern || !val) return true;
  const trimmed = val.trim();
  if (/^UDYAM-X+-X+-X+$/i.test(pattern.trim())) {
    pattern = "^(UDYAM-[A-Z]{2}-\\d{2}-\\d{7}|[A-Z0-9-]{8,25})$";
  }
  try {
    const anchored = pattern.startsWith("^") && pattern.endsWith("$")
      ? pattern
      : `^(${pattern})$`;
    return new RegExp(anchored, "i").test(trimmed);
  } catch {
    try {
      return new RegExp(pattern, "i").test(trimmed);
    } catch {
      return true;
    }
  }
}

const inputCls =
  "w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow";

function mergeDefaults(initial: Record<string, string>, fields: FieldDef[]): Record<string, string> {
  const merged: Record<string, string> = { ...initial };
  for (const f of fields) {
    const current = merged[f.key];
    if ((current === undefined || current === "") && f.default) {
      merged[f.key] = f.default;
    }
  }
  return merged;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function OnboardingForm({
  schema,
  initial,
  busy,
  onSubmit,
  onSubmitted,
  onSaveDraft,
  submitLabel = "Save & Continue",
  submittingLabel = "Opening next step…",
  successMessage = "Details submitted successfully. Opening next step…",
}: {
  schema: OnboardingSchema;
  initial: Record<string, string>;
  busy: boolean;
  onSubmit: (data: Record<string, string>) => Promise<void> | void;
  onSubmitted?: () => Promise<void> | void;
  onSaveDraft?: (data: Record<string, string>) => Promise<void> | void;
  submitLabel?: string;
  submittingLabel?: string;
  successMessage?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => mergeDefaults(initial, schema.fields));
  const [err, setErr] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Debounced autosave
  const timer = useRef<number | null>(null);
  const lastSavedJson = useRef<string>(JSON.stringify(initial));
  const lastInitialJson = useRef<string>(JSON.stringify(initial));
  const onSaveDraftRef = useRef(onSaveDraft);
  const mounted = useRef(false);

  useEffect(() => {
    onSaveDraftRef.current = onSaveDraft;
  }, [onSaveDraft]);

  useEffect(() => {
    const nextInitialJson = JSON.stringify(initial);
    if (nextInitialJson === lastInitialJson.current) return;
    lastInitialJson.current = nextInitialJson;
    lastSavedJson.current = nextInitialJson;
    mounted.current = false;
    setValues(mergeDefaults(initial, schema.fields));
    setErr(null);
    setSubmitSuccess(false);
    setSaveState("idle");
    setSavedAt(null);
  }, [initial, schema.fields]);

  useEffect(() => {
    if (!onSaveDraftRef.current) return;
    if (busy) {
      if (timer.current) window.clearTimeout(timer.current);
      return;
    }
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const current = JSON.stringify(values);
    if (current === lastSavedJson.current) return;

    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        setSaveState("saving");
        await onSaveDraftRef.current?.(values);
        lastSavedJson.current = current;
        setSavedAt(Date.now());
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 1500);

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [values, busy]);

  function update(k: string, v: string) {
    setValues((s) => {
      const next = { ...s, [k]: v };
      // When state changes, clear district so a stale value can't remain.
      if (k === "state" && s.state !== v) next.district = "";
      // Clear follow-up answers whose "show only when" rule no longer matches.
      const cleared = clearHiddenFields(schema.fields, next);
      const nicFields = schema.fields.filter((field) => /^nic_[245]_digit$/.test(field.key));
      if (nicFields.length && nicFields.every((field) => !isFieldVisible(field, schema.fields, cleared))) {
        cleared.nic_activities = "";
      }
      return cleared;
    });
  }


  const stateValues = values;
  // If the main NIC row is empty but extra activities exist, the first one becomes the main row.
  async function handle(e: React.FormEvent, values: Record<string, string> = promoteNicActivities(stateValues)) {
    e.preventDefault();
    if (timer.current) window.clearTimeout(timer.current);
    setErr(null);
    setSubmitSuccess(false);
    if (values !== stateValues) setValues(values);

    // 1. Validate required fields
    for (const f of schema.fields) {
      if (f.type === "note" || f.type === "section") continue;
      if (!isFieldVisible(f, schema.fields, values)) continue;
      if (f.required) {
        const v = values[f.key];
        if (v === undefined || v === null || String(v).trim() === "") {
          setErr(`Please fill out required field: ${f.label}`);
          setSubmitSuccess(false);
          return;
        }
      }
    }

    // 1b. Validate compulsory Plants/Units details
    const plantsField = schema.fields.find((f) => f.type === "plants" || f.key === "plants");
    if (plantsField && isFieldVisible(plantsField, schema.fields, values)) {
      const parsedPlants = parsePlants(values[plantsField.key] ?? "");
      if (parsedPlants.length === 0) {
        setErr("At least one Plant / Unit detail is required. Please fill in address details for Plant / Unit #1.");
        setSubmitSuccess(false);
        return;
      }
      for (let i = 0; i < parsedPlants.length; i++) {
        const p = parsedPlants[i];
        if (
          !p.unit_name?.trim() ||
          !p.address_flat?.trim() ||
          !p.address_village?.trim() ||
          !p.address_road?.trim() ||
          !p.city?.trim() ||
          !p.pincode?.trim() ||
          !p.state?.trim() ||
          !p.district?.trim()
        ) {
          setErr(`Please complete all required address details for Plant / Unit #${i + 1} (Unit Name, Flat No, Village, Road, City, Pincode, State, District).`);
          setSubmitSuccess(false);
          return;
        }
      }
    }

    // 2. Validate that no date field contains today's date or a future date
    const { isTodayOrFutureIso } = await import("@/components/ui/DateInputDMY");
    for (const f of schema.fields) {
      if (f.type === "date" && values[f.key]) {
        if (isTodayOrFutureIso(values[f.key])) {
          setErr(`${f.label}: Date cannot be today or a future date. Please select a past date.`);
          setSubmitSuccess(false);
          return;
        }
      }
    }

    // 2b. Date of Commencement must not be earlier than Date of Incorporation / Registration
    if (values.incorporation_date && values.commencement_date && values.commencement_date < values.incorporation_date) {
      setErr("Date of Commencement cannot be earlier than Date of Incorporation / Registration.");
      setSubmitSuccess(false);
      return;
    }

    // 3. Validate field regex patterns
    for (const f of schema.fields) {
      if (f.type === "note" || f.type === "section") continue;
      if (f.pattern && values[f.key] && String(values[f.key]).trim() !== "") {
        let val = String(values[f.key]).trim();
        const isEmail = f.type === "email" || f.key.toLowerCase().includes("email") || f.label.toLowerCase().includes("email");
        if (isEmail) {
          val = val.toLowerCase();
          values[f.key] = val;
        }
        if (!validatePattern(f.pattern, val)) {
          const hint = f.help ? ` (${f.help})` : f.placeholder ? ` (e.g. ${f.placeholder})` : "";
          setErr(`Invalid format for ${f.label}${hint}.`);
          setSubmitSuccess(false);
          return;
        }
      }
    }

    try {
      await onSubmit(values);
      setSubmitSuccess(true);
      setSaveState("saved");
      setSavedAt(Date.now());
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      await onSubmitted?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save. Please try again.");
      setSubmitSuccess(false);
    }
  }

  type SectionGroup = {
    key: string;
    label: string;
    isNic: boolean;
    fields: FieldDef[];
  };

  const sectionGroups = useMemo(() => {
    const groups: SectionGroup[] = [];
    let currentGroup: SectionGroup = {
      key: "section_default",
      label: "",
      isNic: false,
      fields: [],
    };

    for (const f of schema.fields) {
      if (f.type === "note") continue;

      const isNicKey = f.key === "nic_2_digit" || f.key === "nic_4_digit" || f.key === "nic_5_digit";

      if (f.type === "section") {
        // Only an explicit NIC heading starts a NIC block; other section names never do.
        const isNic = f.key === "section_nic";
        if (currentGroup.fields.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = {
          key: f.key,
          label: f.label,
          isNic,
          fields: [],
        };
        continue;
      }

      if (isNicKey) {
        if (!currentGroup.isNic) {
          if (currentGroup.fields.length > 0) {
            groups.push(currentGroup);
          }
          currentGroup = {
            key: `section_nic_${f.key}`,
            label: currentGroup.fields.length === 0 && currentGroup.label
              ? currentGroup.label
              : "National Industrial Classification (NIC) Code",
            isNic: true,
            fields: [f],
          };
        } else {
          currentGroup.fields.push(f);
        }
        continue;
      }

      if (currentGroup.isNic) {
        if (currentGroup.fields.length > 0) groups.push(currentGroup);
        currentGroup = {
          key: `section_${f.key}`,
          label: "",
          isNic: false,
          fields: [],
        };
      }

      currentGroup.fields.push(f);
    }

    if (currentGroup.fields.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }, [schema.fields]);

  return (
    <form onSubmit={handle} className="space-y-6">
      <div className="space-y-6">
        {sectionGroups.map((group, groupIdx) => {
          const visibleFields = group.fields.filter((f) => isFieldVisible(f, schema.fields, values));

          // NIC block shows only when its own NIC fields are visible (e.g. "Update NIC Code" ticked).
          if (visibleFields.length === 0) {
            return null;
          }

          const showHeader = Boolean(group.label && (sectionGroups.length > 1 || group.label !== "Details"));

          return (
            <div
              key={group.key}
              className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden transition-all"
            >
              {showHeader && (
                <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-slate-50/70 to-white px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-white text-xs font-bold shadow-xs">
                      {groupIdx + 1}
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
                      {group.label}
                    </h3>
                  </div>
                </div>
              )}

              <div className="p-4 sm:p-5">
                {group.isNic ? (
                  <NicCodeSection
                    sectionLabel={group.label || "National Industrial Classification (NIC) Code for Activities"}
                    hideHeader={showHeader}
                    values={values}
                    onChange={(k, v) => update(k, v)}
                    setMany={(patch) => setValues((s) => clearHiddenFields(schema.fields, { ...s, ...patch }))}
                    activity={
                      values.major_activity === "Manufacturing" ||
                      values.major_activity === "Services" ||
                      values.major_activity === "Trading"
                        ? values.major_activity
                        : null
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {visibleFields.map((f) => (
                      <FieldRenderer
                        key={f.key}
                        field={f}
                        value={values[f.key] ?? ""}
                        allValues={values}
                        onChange={(v) => update(f.key, v)}
                        setMany={(patch) => setValues((s) => ({ ...s, ...patch }))}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {err && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm px-3 py-2">
          {err}
        </div>
      )}

      {submitSuccess && !err && (
        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 text-sm px-3 py-2 flex items-center gap-2">
          <Check className="w-4 h-4" /> {successMessage}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-3 justify-between items-stretch sm:items-center pt-2">
        <SaveIndicator state={saveState} savedAt={savedAt} />
        <button
          type="submit"
          disabled={busy || submitSuccess}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-navy hover:bg-brand-navy-deep text-white font-semibold px-8 py-2.5 transition-colors disabled:opacity-60"
        >
          {(busy || submitSuccess) && <Loader2 className="w-4 h-4 animate-spin" />}
          {busy || submitSuccess ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}

function SaveIndicator({ state, savedAt }: { state: SaveState; savedAt: number | null }) {
  const [, force] = useState(0);
  // Tick once a minute so the relative timestamp stays fresh
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const rel = savedAt ? relativeTime(savedAt) : null;

  return (
    <div className="text-xs text-muted-foreground flex items-center gap-1.5 min-h-[20px]">
      <AnimatePresence mode="wait">
        {state === "saving" && (
          <motion.span
            key="saving"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-center gap-1.5"
          >
            <Loader2 className="w-3 h-3 animate-spin" /> Saving draft…
          </motion.span>
        )}
        {state === "saved" && rel && (
          <motion.span
            key="saved"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-center gap-1.5 text-emerald-600"
          >
            <Check className="w-3 h-3" /> Saved {rel}
          </motion.span>
        )}
        {state === "error" && (
          <motion.span
            key="error"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-destructive"
          >
            Couldn't autosave — your edits stay on this page.
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function relativeTime(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)}h ago`;
}

function FieldRenderer({
  field,
  value,
  allValues,
  onChange,
  setMany,
}: {
  field: FieldDef;
  value: string;
  allValues: Record<string, string>;
  onChange: (v: string) => void;
  setMany?: (patch: Record<string, string>) => void;
}) {
  const nicDigitsFromKey =
    field.key === "nic_2_digit" ? 2
    : field.key === "nic_4_digit" ? 4
    : field.key === "nic_5_digit" ? 5
    : null;
  const isNicField = field.type === "nic" || nicDigitsFromKey !== null;
  const colSpan =
    field.type === "textarea" || isNicField || field.type === "plants"
      ? "md:col-span-2"
      : "";
  const id = `f-${field.key}`;

  const isState = field.type === "state" || field.key === "state";
  const isDistrict = field.type === "district" || field.key === "district";
  const pat = field.pattern ?? "";
  const isPincode = field.key === "pincode" || /^(\^|\()?(\\d|\[0-9\])\{6\}(\$|\))?$/.test(pat);
  const isMobile = field.type === "tel" || /^(\^|\()?\[6-9\](\\d|\[0-9\])\{9\}(\$|\))?$/.test(pat);
  const isAadhaar = field.key === "aadhaar_number" || /^(\^|\()?(\\d|\[0-9\])\{12\}(\$|\))?$/.test(pat);
  const isPan = field.key === "pan_number" || /^(\^|\()?\[A-Z\]\{5\}(\\d|\[0-9\])\{4\}\[A-Z\](\$|\))?$/i.test(pat);
  const isUpper = UPPERCASE_FIELDS.has(field.key);
  const isTitle = TITLECASE_FIELDS.has(field.key);

  // Map (rawValue) -> (storedValue). Lets us auto-uppercase PAN / digits-only Aadhaar etc.
  const transform = (raw: string): string => {
    if (isPincode) return raw.replace(/\D/g, "").slice(0, 6);
    if (isMobile) return raw.replace(/\D/g, "").slice(0, 10);
    if (isAadhaar) return raw.replace(/\D/g, "").slice(0, 12);
    if (isPan) return raw.toUpperCase().replace(/\s/g, "").slice(0, 10);
    if (isUpper) return raw.toUpperCase();
    return raw;
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (isTitle) {
      const titled = toTitleCase(e.target.value);
      if (titled !== e.target.value) onChange(titled);
    }
  };

  const common = {
    id,
    name: field.key,
    required: field.required,
    placeholder: field.placeholder,
    maxLength: field.maxLength,
    pattern: field.pattern,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange(transform(e.target.value)),
    className: inputCls,
  };

  const activityRaw = field.activityFrom ? allValues[field.activityFrom] : isNicField ? allValues.major_activity : undefined;
  const activity =
    activityRaw === "Manufacturing" || activityRaw === "Services" || activityRaw === "Trading"
      ? activityRaw
      : null;

  // Decide input mode + html type so mobile keyboards match.
  let htmlType: string = field.type;
  let inputMode: React.HTMLAttributes<HTMLInputElement>["inputMode"] | undefined;
  if (isPincode || isMobile || isAadhaar) {
    htmlType = "tel";
    inputMode = "numeric";
  } else if (field.type === "number") {
    inputMode = "decimal";
  } else if (isPan || isUpper) {
    htmlType = "text";
  }

  const currentState = allValues.state ?? "";
  const districtOptions = isDistrict ? INDIA_DISTRICTS[currentState] ?? [] : [];

  if (field.type === "checkbox") {
    return (
      <div className="md:col-span-2">
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold text-foreground cursor-pointer">
          <input
            id={id}
            name={field.key}
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={value === CHECKBOX_ON}
            onChange={(e) => onChange(e.target.checked ? CHECKBOX_ON : "")}
          />
          {field.label}
          {field.required && <span className="text-destructive"> *</span>}
        </label>
        {field.help && <p className="mt-1 text-xs text-muted-foreground">{field.help}</p>}
      </div>
    );
  }

  return (
    <div className={colSpan}>
      <label htmlFor={id} className="block text-sm font-semibold text-foreground mb-1.5">
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </label>
      {field.type === "textarea" ? (
        <textarea {...common} onBlur={handleBlur} rows={3} />
      ) : field.type === "date" ? (
        <DateInputDMY
          id={id}
          name={field.key}
          value={value}
          onChange={onChange}
          required={field.required}
          placeholder={field.placeholder ?? "DD/MM/YYYY"}
        />
      ) : field.type === "plants" ? (
        <PlantsField value={value} onChange={onChange} />
      ) : isState ? (
        <select {...common}>
          <option value="" disabled>
            Select state…
          </option>
          {value && !(INDIA_STATES as readonly string[]).includes(value) && (
            <option value={value}>{value}</option>
          )}
          {INDIA_STATES.map((s, i) => (
            <option key={s} value={s}>
              {i + 1}. {s}
            </option>
          ))}
        </select>
      ) : isDistrict ? (
        <select {...common} disabled={!currentState}>
          <option value="" disabled>
            {currentState ? "Select district…" : "Select state first"}
          </option>
          {value && !districtOptions.includes(value) && (
            <option value={value}>{value}</option>
          )}
          {districtOptions.map((d, i) => (
            <option key={d} value={d}>
              {i + 1}. {d}
            </option>
          ))}
        </select>
      ) : field.type === "select" ? (
        <select {...common}>
          <option value="" disabled>
            Select…
          </option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : isNicField ? (
        <NicCodePicker
          id={id}
          value={value}
          onChange={onChange}
          digits={field.nicDigits ?? nicDigitsFromKey ?? 5}
          activity={activity}
          required={field.required}
          onPickCode={
            nicDigitsFromKey !== null && setMany
              ? (code5) => {
                  const patch: Record<string, string> = {};
                  for (const d of [2, 4, 5] as const) {
                    const k = `nic_${d}_digit`;
                    const l = nicLabel(code5, d);
                    if (l && k in allValues) patch[k] = l;
                  }
                  patch[field.key] = nicLabel(code5, nicDigitsFromKey as 2 | 4 | 5) ?? value;
                  setMany(patch);
                }
              : undefined
          }
        />
      ) : (
        <input
          type={htmlType}
          inputMode={inputMode}
          autoCapitalize={isPan || isUpper ? "characters" : isTitle ? "words" : undefined}
          autoComplete={isMobile ? "tel" : field.type === "email" ? "email" : undefined}
          onBlur={handleBlur}
          {...common}
        />
      )}
      {field.help && <p className="mt-1 text-xs text-muted-foreground">{field.help}</p>}
    </div>

  );
}

// ---------- Plants (repeater) ----------

type Plant = {
  unit_name: string;
  address_flat: string;
  address_premises: string;
  address_village: string;
  address_block: string;
  address_road: string;
  city: string;
  pincode: string;
  state: string;
  district: string;
};

function emptyPlant(): Plant {
  return {
    unit_name: "",
    address_flat: "",
    address_premises: "",
    address_village: "",
    address_block: "",
    address_road: "",
    city: "",
    pincode: "",
    state: "",
    district: "",
  };
}

function parsePlants(value: string): Plant[] {
  if (!value) return [];
  try {
    const arr = JSON.parse(value);
    if (!Array.isArray(arr)) return [];
    return arr.map((p) => ({ ...emptyPlant(), ...(p as any) }));
  } catch {
    return [];
  }
}

function PlantsField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parsed = parsePlants(value);
  const plants = parsed.length > 0 ? parsed : [emptyPlant()];

  const commit = (next: Plant[]) => {
    onChange(next.length ? JSON.stringify(next) : "");
  };

  const setField = (idx: number, key: keyof Plant, v: string) => {
    const next = plants.map((p, i) => {
      if (i !== idx) return p;
      const updated = { ...p, [key]: v };
      if (key === "state") updated.district = "";
      if (key === "pincode") updated.pincode = v.replace(/\D/g, "").slice(0, 6);
      return updated;
    });
    commit(next);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground font-medium">
        At least 1 Plant / Unit / Branch address details entry is compulsory.
      </p>
      {plants.map((p, i) => {
        const districtOpts = INDIA_DISTRICTS[p.state] ?? [];
        return (
          <div key={i} className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-brand-navy-deep">
                Plant / Unit #{i + 1} <span className="text-destructive">*</span>
              </h4>
              {plants.length > 1 && (
                <button
                  type="button"
                  onClick={() => commit(plants.filter((_, j) => j !== i))}
                  className="text-xs inline-flex items-center gap-1 text-destructive hover:underline"
                >
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <PlantInput label="Unit / Plant Name *" value={p.unit_name} onChange={(v) => setField(i, "unit_name", v)} />
              <PlantInput label="Flat / Door / Block No. *" value={p.address_flat} onChange={(v) => setField(i, "address_flat", v)} maxLength={20} />
              <PlantInput label="Name of Premises / Building" value={p.address_premises} onChange={(v) => setField(i, "address_premises", v)} maxLength={50} />
              <PlantInput label="Village / Town *" value={p.address_village} onChange={(v) => setField(i, "address_village", v)} maxLength={30} />
              <PlantInput label="Block" value={p.address_block} onChange={(v) => setField(i, "address_block", v)} maxLength={30} />
              <PlantInput label="Road / Street / Lane *" value={p.address_road} onChange={(v) => setField(i, "address_road", v)} maxLength={30} />
              <PlantInput label="City *" value={p.city} onChange={(v) => setField(i, "city", v)} maxLength={25} />
              <PlantInput label="PIN Code *" value={p.pincode} onChange={(v) => setField(i, "pincode", v)} inputMode="numeric" maxLength={6} />
              <PlantSelect label="State *" value={p.state} onChange={(v) => setField(i, "state", v)}
                options={INDIA_STATES as unknown as string[]} placeholder="Select state…" />
              <PlantSelect label="District *" value={p.district} onChange={(v) => setField(i, "district", v)}
                options={districtOpts} placeholder={p.state ? "Select district…" : "Select state first"} disabled={!p.state} />
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => commit([...plants, emptyPlant()])}
        className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
      >
        <Plus className="w-4 h-4" /> Add another plant / unit
      </button>
    </div>
  );
}

function PlantInput({
  label, value, onChange, inputMode, maxLength,
}: {
  label: string; value: string; onChange: (v: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; maxLength?: number;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs text-muted-foreground mb-1 block">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        maxLength={maxLength}
        className={inputCls}
      />
    </label>
  );
}

function PlantSelect({
  label, value, onChange, options, placeholder, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[]; placeholder: string; disabled?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs text-muted-foreground mb-1 block">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={inputCls}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

