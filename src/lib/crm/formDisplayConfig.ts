// Declarative service-form display config.
// Drives the ServiceFormPanel in the Order Workspace so we don't need per-service JSX.
//
// `path` is a JSON-pointer-style dot path into the submission `payload`.
// Use `mask: "aadhaar"` / `mask: "account"` to gate sensitive values behind a Reveal action.

import { formatDateDMY } from "@/lib/datetime";

export type FieldMask = "aadhaar" | "account" | "pan";

export interface FieldDef {
  label: string;
  path: string;
  mask?: FieldMask;
  format?: "currency" | "date" | "yesno" | "uppercase" | "nic2" | "nic4" | "nic5";
}

export interface SectionDef {
  title: string;
  fields: FieldDef[];
}

export interface ServiceFormDisplay {
  service: string; // matches services.slug
  label: string;
  sections: SectionDef[];
  /** Optional override: render a special message instead of sections (e.g. consultation services). */
  emptyMessage?: string;
}

const NEW_UDYAM: ServiceFormDisplay = {
  service: "new-udyam-registration",
  label: "New Udyam Registration",
  sections: [
    {
      title: "Aadhaar / Identity",
      fields: [
        { label: "Aadhaar Number", path: "aadhaar.number", mask: "aadhaar" },
        { label: "Name on Aadhaar", path: "aadhaar.name", format: "uppercase" },
        { label: "Gender", path: "aadhaar.gender" },
        { label: "Social Category", path: "aadhaar.social_category" },
        { label: "Divyang", path: "aadhaar.divyang", format: "yesno" },
      ],
    },
    {
      title: "PAN & ITR",
      fields: [
        { label: "PAN Number", path: "pan.number", mask: "pan" },
        { label: "Name on PAN", path: "pan.name", format: "uppercase" },
        { label: "ITR Filed", path: "pan.itr_filed", format: "yesno" },
        { label: "ITR Year", path: "pan.itr_year" },
      ],
    },
    {
      title: "Investment & Turnover",
      fields: [
        { label: "Investment (Plant & Machinery)", path: "finance.investment", format: "currency" },
        { label: "Annual Turnover", path: "finance.turnover", format: "currency" },
      ],
    },
    {
      title: "Enterprise Details",
      fields: [
        { label: "Enterprise Name", path: "enterprise.name", format: "uppercase" },
        { label: "Type of Organisation", path: "enterprise.org_type" },
        { label: "Date of Incorporation", path: "enterprise.date_incorporation", format: "date" },
        { label: "Date of Commencement", path: "enterprise.date_commencement", format: "date" },
        { label: "Status", path: "enterprise.status" },
      ],
    },
    {
      title: "Official Address",
      fields: [
        { label: "Flat / Door No.", path: "address.flat" },
        { label: "Building Name", path: "address.building" },
        { label: "Village / Town", path: "address.village" },
        { label: "Block", path: "address.block" },
        { label: "Road / Lane", path: "address.road" },
        { label: "City", path: "address.city" },
        { label: "PIN Code", path: "address.pincode" },
        { label: "State", path: "address.state" },
        { label: "District", path: "address.district" },
      ],
    },
    {
      title: "Bank Details",
      fields: [
        { label: "Bank Name", path: "bank.name" },
        { label: "IFSC Code", path: "bank.ifsc" },
        { label: "Account Number", path: "bank.account_number", mask: "account" },
      ],
    },
    {
      title: "NIC Codes",
      fields: [
        { label: "2-Digit NIC", path: "nic.two_digit", format: "nic2" },
        { label: "4-Digit NIC", path: "nic.four_digit", format: "nic4" },
        { label: "5-Digit NIC", path: "nic.five_digit", format: "nic5" },
      ],
    },
    {
      title: "Employees",
      fields: [
        { label: "Male", path: "employees.male" },
        { label: "Female", path: "employees.female" },
        { label: "Others", path: "employees.others" },
      ],
    },
    {
      title: "Govt Portal Interest",
      fields: [
        { label: "GeM Portal", path: "portals.gem", format: "yesno" },
        { label: "TReDS", path: "portals.treds", format: "yesno" },
        { label: "NCS", path: "portals.ncs", format: "yesno" },
        { label: "NSIC B2B", path: "portals.nsic", format: "yesno" },
        { label: "Skill India", path: "portals.skill_india", format: "yesno" },
      ],
    },
  ],
};

const UPDATE_UDYAM: ServiceFormDisplay = {
  service: "update-udyam-certificate",
  label: "Update Udyam Certificate",
  sections: [
    {
      title: "Existing Certificate",
      fields: [
        { label: "Udyam Number", path: "existing.udyam_number" },
        { label: "Registered Mobile", path: "existing.mobile" },
        { label: "Registered Email", path: "existing.email" },
      ],
    },
    {
      title: "Fields to Update",
      fields: [
        { label: "Update Request", path: "update.notes" },
      ],
    },
  ],
};

const FORGOT_MOBILE_EMAIL: ServiceFormDisplay = {
  service: "forgot-mobile-email",
  label: "Forgot Mobile / Email",
  sections: [
    {
      title: "Customer Identity",
      fields: [
        { label: "Udyam Number", path: "udyam_number" },
        { label: "Aadhaar Number", path: "aadhaar_number", mask: "aadhaar" },
        { label: "Name", path: "name", format: "uppercase" },
        { label: "New Mobile", path: "new_mobile" },
        { label: "New Email", path: "new_email" },
      ],
    },
  ],
};

const CORRECT_PAN_AADHAAR: ServiceFormDisplay = {
  service: "correct-pan-aadhaar",
  label: "Correct PAN / Aadhaar",
  sections: [
    {
      title: "Stage 1 — Correction Request",
      fields: [
        { label: "Udyam Number", path: "stage1.udyam_number" },
        { label: "Current PAN", path: "stage1.current_pan", mask: "pan" },
        { label: "Correct PAN", path: "stage1.correct_pan", mask: "pan" },
        { label: "Current Aadhaar", path: "stage1.current_aadhaar", mask: "aadhaar" },
        { label: "Correct Aadhaar", path: "stage1.correct_aadhaar", mask: "aadhaar" },
        { label: "Reason", path: "stage1.reason" },
      ],
    },
    {
      title: "Stage 2 — Re-registration Data",
      fields: [
        { label: "Name", path: "stage2.name", format: "uppercase" },
        { label: "Enterprise Name", path: "stage2.enterprise_name", format: "uppercase" },
        { label: "Type of Organisation", path: "stage2.org_type" },
        { label: "Annual Turnover", path: "stage2.turnover", format: "currency" },
        { label: "Investment", path: "stage2.investment", format: "currency" },
      ],
    },
  ],
};

const TALK_TO_EXPERT: ServiceFormDisplay = {
  service: "talk-to-expert",
  label: "Talk to Expert",
  sections: [],
  emptyMessage: "Consultation service — no form. Call the customer on the mobile number listed.",
};

export const SERVICE_FORM_CONFIG: Record<string, ServiceFormDisplay> = {
  [NEW_UDYAM.service]: NEW_UDYAM,
  [UPDATE_UDYAM.service]: UPDATE_UDYAM,
  [FORGOT_MOBILE_EMAIL.service]: FORGOT_MOBILE_EMAIL,
  [CORRECT_PAN_AADHAAR.service]: CORRECT_PAN_AADHAAR,
  [TALK_TO_EXPERT.service]: TALK_TO_EXPERT,
};

/** Pluck a value at a dot-path from a JSON payload. */
export function getAtPath(payload: unknown, path: string): unknown {
  if (!payload || typeof payload !== "object") return undefined;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, payload);
}

/** Format a value per FieldDef. Returns "—" for null/empty. */
export function formatValue(raw: unknown, format?: FieldDef["format"]): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  switch (format) {
    case "currency": {
      const n = Number(raw);
      if (Number.isNaN(n)) return String(raw);
      return `₹${n.toLocaleString("en-IN")}`;
    }
    case "date": {
      // DD/MM/YYYY in IST with recovery for legacy bad values like "12021-08-31".
      return formatDateDMY(raw as any);
    }
    case "yesno":
      return raw === true || raw === "true" || raw === "yes" || raw === 1 ? "Yes" : "No";
    case "uppercase":
      return String(raw).toUpperCase();
    case "nic2":
      return padNicCode(String(raw), 2);
    case "nic4":
      return padNicCode(String(raw), 4);
    case "nic5":
      return padNicCode(String(raw), 5);
    default:
      return String(raw);
  }
}

/**
 * Pad the leading numeric code segment of a NIC value to `digits` digits with
 * trailing zeros. Handles "783 — Description" → "7830 — Description" for
 * legacy submissions where the DB group_code dropped a trailing zero.
 */
function padNicCode(raw: string, digits: 2 | 4 | 5): string {
  const m = /^\s*(\d+)(\s*[—\-:]\s*.*)?$/.exec(raw);
  if (!m) return raw;
  const code = m[1].length >= digits ? m[1].slice(0, digits) : m[1].padEnd(digits, "0");
  const rest = m[2] ?? "";
  return `${code}${rest}`;
}

export function maskValue(raw: unknown, _mask: FieldMask): string {
  // Masking disabled — staff always see full sensitive values (Aadhaar, PAN, bank account).
  const str = raw == null ? "" : String(raw);
  return str || "—";
}

