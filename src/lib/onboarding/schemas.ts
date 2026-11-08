// Per-service onboarding field schemas and required document lists.
// Client-safe (no server imports).

export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "number"
  | "date"
  | "select"
  | "textarea"
  | "nic"
  | "plants"
  | "section"
  | "state"
  | "district"
  | "note"
  | "checkbox";


export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: readonly string[];
  placeholder?: string;
  pattern?: string;
  maxLength?: number;
  help?: string;
  nicDigits?: 2 | 4 | 5;
  /** For nic fields: read activity_type from this sibling field key */
  activityFrom?: string;
  /** Optional default value pre-filled when the form loads. */
  default?: string;
  /** Show this field only when the sibling field equals this value. */
  visibleIf?: { key: string; equals: string };
};

/** Value stored for a ticked checkbox field. */
export const CHECKBOX_ON = "Yes";

/** Built-in rule kept for older saved custom forms. */
function ruleFor(f: FieldDef): FieldDef["visibleIf"] {
  return f.visibleIf ?? (f.key === "major_activity_sub" ? { key: "major_activity", equals: "Services" } : undefined);
}

/**
 * A field is shown when its "show only when" rule matches and the field it
 * depends on is itself shown (so nested follow-up questions hide together).
 */
export function isFieldVisible(
  field: FieldDef,
  fields: readonly FieldDef[],
  values: Record<string, unknown>,
  depth = 0,
): boolean {
  const rule = ruleFor(field);
  if (!rule || !rule.key) return true;
  if (depth > 10) return false;
  if (String(values[rule.key] ?? "") !== rule.equals) return false;
  const parent = fields.find((x) => x.key === rule.key);
  return parent ? isFieldVisible(parent, fields, values, depth + 1) : true;
}

/** Blank out answers for fields that are currently hidden. */
export function clearHiddenFields(fields: readonly FieldDef[], values: Record<string, string>): Record<string, string> {
  const next = { ...values };
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (const f of fields) {
      if (next[f.key] && !isFieldVisible(f, fields, next)) {
        next[f.key] = "";
        changed = true;
      }
    }
    if (!changed) break;
  }
  return next;
}

export type DocDef = {
  key: string;
  label: string;
  required?: boolean;
  help?: string;
  /** Optional URL to a template/sample the customer can download. */
  sample_url?: string;
  /** Label for the sample link; defaults to "Download template". */
  sample_label?: string;
};

export type DocumentsInstructions = {
  /** Short red-highlighted instructions shown above the document uploader. */
  lines: string[];
  /** Optional downloadable standard form PDF. */
  downloadUrl?: string;
  downloadLabel?: string;
};

export type OnboardingSchema = {
  title: string;
  description: string;
  fields: FieldDef[];
  documents: DocDef[];
  documentsInstructions?: DocumentsInstructions;
  /** Optional URL to a printable/sample version of the whole form. */
  sample_form_url?: string;
  /** Optional label for the sample form download button. */
  sample_form_label?: string;
};

/** Retain saved form-builder section boundaries in the flat customer renderer. */
export function withSectionHeadings(sections: readonly { key: string; label: string; fields: readonly FieldDef[] }[]): FieldDef[] {
  return sections.flatMap((section) => {
    if (!section.fields.length) return [];
    if (section.fields[0]?.type === "section") {
      return [{ ...section.fields[0], label: section.label || section.fields[0].label }, ...section.fields.slice(1)];
    }
    // Never mark the whole section as NIC: NIC renders only where its fields sit.
    return [
      { key: `builder_section_${section.key}`, label: section.label, type: "section" as const },
      ...section.fields,
    ];
  });
}

const BUSINESS_TYPES = [
  "Proprietary / एकल स्वामित्व",
  "Hindu Undivided Family / हिंदू अविभाजित परिवार (HUF)",
  "Partnership / पार्टनरशिप",
  "Co-Operative / सहकारी",
  "Private Limited Company / प्राइवेट लिमिटेड कंपनी",
  "Public Limited Company / पब्लिक लिमिटेड कंपनी",
  "Self Help Group / स्वयं सहायता समूह",
  "Limited Liability Partnership / सीमित दायित्व भागीदारी",
  "Society / सोसाइटी",
  "Trust / ट्रस्ट",
  "Others / अन्य",
] as const;

const SOCIAL_CATEGORY = ["General", "SC", "ST", "OBC"] as const;
const GENDER = ["Male", "Female", "Others"] as const;
const YES_NO = ["Yes", "No"] as const;
const GST_OPTIONS = ["Yes", "No", "Exempted"] as const;
const ACTIVITY_TYPES = ["Manufacturing", "Services", "Trading"] as const;
const SERVICES_SUBTYPE = ["Non-Trading", "Trading"] as const;
const REGISTRATION_HISTORY = ["N/A", "EM-II", "Previous UAM"] as const;
export const PLANT_UNIT_TYPES = [
  "Plant",
  "Branch",
  "Warehouse",
  "Head Office",
  "Factory",
  "Other",
] as const;


export const INDIA_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

const COMMON_DOCS: DocDef[] = [
  { key: "aadhaar_front", label: "Aadhaar Card (front)", required: true },
  { key: "aadhaar_back", label: "Aadhaar Card (back)", required: true },
  { key: "pan_card", label: "PAN Card", required: true },
];

const NEW_UDYAM: OnboardingSchema = {
  title: "New Udyam Registration — Incomplete Information",
  description:
    "Fill the Aadhaar, PAN, enterprise, bank and activity details required to prepare your Udyam registration request.",
  fields: [
    { key: "section_details", label: "Details", type: "section" },
    { key: "aadhaar_number", label: "1. Aadhaar Number", type: "text", required: true, pattern: "^\\d{12}$", placeholder: "12 digit Aadhaar number" },
    { key: "applicant_name", label: "2. Your Name (as per Aadhaar)", type: "text", required: true, maxLength: 120 },
    { key: "business_type", label: "3. Type of Organisation / संगठन के प्रकार", type: "select", required: true, options: BUSINESS_TYPES },
    { key: "pan_number", label: "4.1 PAN Number", type: "text", required: true, pattern: "^[A-Z]{5}\\d{4}[A-Z]$", placeholder: "ABCDE1234F", maxLength: 10 },
    { key: "pan_holder_name", label: "4.1.1 Name of PAN Card Holder", type: "text", required: true, maxLength: 120 },
    { key: "pan_dob", label: "4.1.2 Date of Birth as per PAN Card", type: "date", required: true },
    { key: "itr_previous_year", label: "4.2 Have you filed ITR for PY 2024–25?", type: "select", required: true, options: YES_NO },
    { key: "gstin_status", label: "4.3 Do you have GSTIN?", type: "select", required: true, options: GST_OPTIONS },
    { key: "written_down_value", label: "Written Down Value (WDV) as on 31 March 2024–25 (A)", type: "number", required: true, placeholder: "Example: 200000" },
    { key: "exclusion_cost", label: "Exclusion of cost — Pollution Control / R&D / Industrial Safety Devices 2024–25 (B)", type: "number", required: true, placeholder: "Example: 20000" },
    { key: "total_turnover", label: "Total Turnover during 2024–25", type: "number", required: true, placeholder: "Example: 200000" },
    { key: "business_name", label: "8. Name of Enterprise", type: "text", required: true, maxLength: 200 },
    { key: "aadhaar_mobile", label: "9. Mobile Number (+91)", type: "tel", required: true, pattern: "^[6-9]\\d{9}$", placeholder: "10 digit mobile number" },
    { key: "email", label: "10. Email", type: "email", required: true, placeholder: "info@gmail.com" },
    { key: "social_category", label: "11. Social Category", type: "select", required: true, options: SOCIAL_CATEGORY },
    { key: "gender", label: "12. Gender", type: "select", required: true, options: GENDER },
    { key: "specially_abled", label: "13. Specially Abled (Divyang)", type: "select", required: true, options: YES_NO },
    { key: "section_address", label: "14. Official Address of Enterprise", type: "section" },
    { key: "address_flat", label: "Flat / Door / Block No.", type: "text", required: true, maxLength: 20 },
    { key: "address_premises", label: "Name of Premises / Building", type: "text", required: false, maxLength: 50 },
    { key: "address_village", label: "Village / Town", type: "text", required: true, maxLength: 30 },
    { key: "address_block", label: "Block", type: "text", required: false, maxLength: 30 },
    { key: "address_road", label: "Road / Street / Lane", type: "text", required: true, maxLength: 30 },
    { key: "city", label: "City", type: "text", required: true, maxLength: 25 },
    { key: "pincode", label: "PIN Code", type: "text", required: true, pattern: "^\\d{6}$", maxLength: 6 },
    { key: "state", label: "State", type: "select", required: true, options: INDIA_STATES },
    { key: "district", label: "District", type: "select", required: true },
    { key: "section_plants", label: "15. Location of Plant(s) / Unit(s) and Details", type: "section" },
    { key: "plants", label: "Location of Plant(s) / Unit(s) and Details", type: "plants", required: true },
    { key: "previous_registration", label: "16. Previous EM-II / UAM Registration Number, if any", type: "select", required: true, options: REGISTRATION_HISTORY },
    { key: "section_status", label: "17. Status of Enterprise", type: "section" },
    { key: "incorporation_date", label: "a. Date of Incorporation / Registration", type: "date", required: true, placeholder: "DD/MM/YYYY" },
    { key: "business_commenced", label: "b. Whether production / business commenced", type: "select", required: true, options: YES_NO },
    { key: "commencement_date", label: "Date of Commencement", type: "date", required: true, placeholder: "DD/MM/YYYY" },
    { key: "section_bank", label: "18. Bank Details", type: "section" },
    { key: "bank_name", label: "Bank Name", type: "text", required: true, maxLength: 120 },
    { key: "bank_ifsc", label: "IFSC Code", type: "text", required: true, pattern: "^[A-Z]{4}0[A-Z0-9]{6}$", maxLength: 11 },
    { key: "bank_account_no", label: "Bank Account Number", type: "text", required: true, maxLength: 30 },
    { key: "section_major_activity", label: "19. Major Activity of Unit", type: "section" },
    { key: "major_activity", label: "19. Major Activity of Unit", type: "select", required: true, options: ACTIVITY_TYPES },
    { key: "major_activity_sub", label: "19.1 Major Activity Under Services", type: "select", required: false, options: SERVICES_SUBTYPE, visibleIf: { key: "major_activity", equals: "Services" } },
    { key: "section_nic", label: "20. National Industrial Classification (NIC) Code for Activities", type: "section" },
    { key: "nic_2_digit", label: "NIC 2 Digit Code", type: "nic", required: true, nicDigits: 2, activityFrom: "major_activity" },
    { key: "nic_4_digit", label: "NIC 4 Digit Code", type: "nic", required: true, nicDigits: 4, activityFrom: "major_activity" },
    { key: "nic_5_digit", label: "NIC 5 Digit Code", type: "nic", required: true, nicDigits: 5, activityFrom: "major_activity" },
    { key: "section_employees", label: "21. Number of persons employed", type: "section" },
    { key: "employees_male", label: "Male", type: "number", required: true },
    { key: "employees_female", label: "Female", type: "number", required: true },
    { key: "employees_others", label: "Others", type: "number", required: true },
    { key: "gem_registration", label: "22. Interested in Government e-Marketplace (GeM) Portal?", type: "select", required: true, options: YES_NO },
    { key: "treds_registration", label: "23. Interested in TReDS Portals?", type: "select", required: true, options: YES_NO },
    { key: "ncs_registration", label: "24. Interested in National Career Service (NCS) Portal?", type: "select", required: true, options: YES_NO },
    { key: "nsic_b2b_registration", label: "25. Interested in NSIC B2B Portal?", type: "select", required: true, options: YES_NO },
    { key: "skill_india_registration", label: "27. Interested in Skill India Digital Portal?", type: "select", required: true, options: YES_NO },
  ],
  documents: [],
};



const UDYAM_UPDATE: OnboardingSchema = {
  title: "Update Udyam Certificate — Incomplete Information",
  description: "Share your existing Udyam number and registered contact details so our team can process the update request.",
  fields: [
    { key: "applicant_name", label: "Applicant Name", type: "text", required: true, maxLength: 120 },
    { key: "udyam_number", label: "Udyam Registration Number", type: "text", required: true, pattern: "^UDYAM-[A-Z]{2}-\\d{2}-\\d{7}$", maxLength: 19, placeholder: "UDYAM-MH-26-0276396", help: "Format: UDYAM-<State>-<Year>-<7 digits>, e.g. UDYAM-MH-26-0276396" },
    { key: "registered_mobile", label: "Registered Mobile Number", type: "tel", required: true, pattern: "^[6-9]\\d{9}$", placeholder: "10 digit registered mobile" },
    { key: "registered_email", label: "Registered Email ID", type: "email", required: false, placeholder: "Registered email, if available" },
    { key: "fields_to_update", label: "What details need to be updated?", type: "textarea", required: false, maxLength: 1200, help: "Mention any details our team should update or verify." },
  ],
  documents: [],
};

const UDYAM_DOWNLOAD: OnboardingSchema = {
  title: "Download Udyam Certificate — Incomplete Information",
  description: "Provide the existing Udyam number and registered mobile number/email ID so we can assist with certificate download.",
  fields: [
    { key: "applicant_name", label: "Applicant Name", type: "text", required: true, maxLength: 120 },
    { key: "udyam_number", label: "Udyam Registration Number", type: "text", required: true, pattern: "^UDYAM-[A-Z]{2}-\\d{2}-\\d{7}$", maxLength: 19, placeholder: "UDYAM-MH-26-0276396", help: "Format: UDYAM-<State>-<Year>-<7 digits>, e.g. UDYAM-MH-26-0276396" },
    { key: "registered_mobile", label: "Registered Mobile Number", type: "tel", required: true, pattern: "^[6-9]\\d{9}$" },
    { key: "registered_email", label: "Registered Email ID", type: "email", required: false },
  ],
  documents: [],
};

const MIGRATE: OnboardingSchema = {
  title: "Migrate Udyog Aadhaar to Udyam — Full Details",
  description:
    "Share your existing Udyog Aadhaar details, PAN information and enterprise details so our team can prepare your migration to Udyam.",
  fields: [
    { key: "section_existing_uam", label: "Existing Udyog Aadhaar Details", type: "section" },
    { key: "applicant_name", label: "Applicant Name", type: "text", required: true, maxLength: 120 },
    { key: "uam_number", label: "Udyog Aadhaar Number", type: "text", required: true, pattern: "^[A-Z]{2}\\d{2}[A-Z]\\d{7}$", placeholder: "DL05A0000001", maxLength: 12, help: "Format: first 2 alphabets, then 2 digits, then 1 alphabet, then 7 digits." },
    { key: "registered_mobile", label: "Registered Mobile Number", type: "tel", required: false, pattern: "^[6-9]\\d{9}$" },
    { key: "registered_email", label: "Registered Email ID", type: "email", required: false },
    { key: "section_pan_details", label: "PAN Details", type: "section" },
    { key: "pan_number", label: "Customer PAN Number", type: "text", required: true, pattern: "^[A-Z]{5}\\d{4}[A-Z]$", placeholder: "ABCDE1234F", maxLength: 10 },
    { key: "pan_holder_name", label: "Name As Per PAN Card", type: "text", required: true, maxLength: 120 },
    { key: "pan_dob", label: "Date of Birth as per PAN Card", type: "date", required: true },
    { key: "section_new_udyam", label: "Enterprise, Bank & Activity Details", type: "section" },
    ...NEW_UDYAM.fields.filter((f) => f.key !== "pan_number" && f.key !== "pan_holder_name" && f.key !== "pan_dob"),
  ],
  documents: [],
};

const FORGOT_MOBILE: OnboardingSchema = {
  title: "Recover Registered Mobile / Email",
  description: "Help us identify your record so we can reset the registered contact details.",
  fields: [
    { key: "applicant_name", label: "Applicant Name", type: "text", required: true, maxLength: 120 },
    { key: "udyam_number", label: "Udyam Number (if known)", type: "text", required: false, maxLength: 40 },
    { key: "aadhaar_number", label: "Aadhaar Number", type: "text", required: true, pattern: "^\\d{12}$" },
    { key: "new_mobile", label: "New mobile to register", type: "tel", required: true, pattern: "^[6-9]\\d{9}$" },
    { key: "new_email", label: "New email to register", type: "email", required: true },
    { key: "reason", label: "Reason / details", type: "textarea", required: false, maxLength: 600 },
  ],
  documents: [
    { key: "aadhaar_card_pdf", label: "Aadhaar Card PDF", required: true },
    { key: "pan_card_pdf", label: "PAN Card PDF", required: true },
    { key: "signed_application_format", label: "Signed Standard Form (filled & signed)", required: true, help: "Download the standard form below, fill in your information, sign it, then upload it here." },
  ],
  documentsInstructions: {
    lines: [
      "Download this form, fill your information, sign it and upload it here.",
      "Also upload a clear copy of your Aadhaar card and PAN card.",
      "Use PDF, JPG, PNG or WEBP files only. Max size 5 MB per file.",
    ],
    downloadUrl: "/forms/forgot-mobile-email-application.pdf",
    downloadLabel: "Download Standard Form (PDF)",
  },
};

const CORRECT_PAN_AADHAAR: OnboardingSchema = {
  title: "Correct PAN / Aadhaar Name in Udyam — Incomplete Information",
  description:
    "Provide your Udyam number and registered contact details so our team can assist with correction requirements.",
  fields: [
    { key: "applicant_name", label: "Applicant Name", type: "text", required: true, maxLength: 120 },
    { key: "udyam_number", label: "Udyam Registration Number", type: "text", required: true, pattern: "^UDYAM-[A-Z]{2}-\\d{2}-\\d{7}$", maxLength: 19, placeholder: "UDYAM-MH-26-0276396", help: "Format: UDYAM-<State>-<Year>-<7 digits>, e.g. UDYAM-MH-26-0276396" },
    { key: "registered_mobile", label: "Registered Mobile Number", type: "tel", required: true, pattern: "^[6-9]\\d{9}$", placeholder: "10 digit registered mobile" },
    { key: "registered_email", label: "Registered Email ID", type: "email", required: true, placeholder: "Registered email ID" },
    { key: "correction_required", label: "Correction required", type: "textarea", required: false, maxLength: 1200, help: "Mention whether PAN name, Aadhaar name, or both require correction." },
  ],
  documents: [],
};

// Stage 2 of the Correct PAN / Aadhaar flow — full New Udyam form.
export const CORRECT_PAN_AADHAAR_STAGE2: OnboardingSchema = {
  title: "Correct PAN / Aadhaar Name in Udyam — Full Enterprise Details",
  description:
    "Now please fill the complete enterprise details (same as New Udyam Registration) so our team can prepare your correction request.",
  fields: NEW_UDYAM.fields,
  documents: [],
};


// Talk-to-Expert is a paid consultation. After payment we skip the intake form
// and go straight to the thank-you page — but we still register a stub schema
// so getSchema() and the onboarding pipeline have a known mapping.
const TALK_TO_EXPERT: OnboardingSchema = {
  title: "Talk to Expert — Consultation Booked",
  description: "Your consultation request has been received. Our expert will contact you on your registered mobile.",
  fields: [],
  documents: [],
};

// Default fallback used when a lead's service can't be mapped to a known schema.
const DEFAULT: OnboardingSchema = NEW_UDYAM;

export const ONBOARDING_SCHEMAS: Record<string, OnboardingSchema> = {
  "new-udyam-registration": NEW_UDYAM,
  "update-udyam-certificate": UDYAM_UPDATE,
  "download-udyam-certificate": UDYAM_DOWNLOAD,
  "migrate-udyog-aadhaar-to-udyam": MIGRATE,
  "forgot-mobile-email": FORGOT_MOBILE,
  "correct-pan-aadhaar": CORRECT_PAN_AADHAAR,
  "talk-to-expert": TALK_TO_EXPERT,
};

export function getSchema(serviceCode: string | null | undefined): OnboardingSchema {
  if (!serviceCode) return DEFAULT;
  return ONBOARDING_SCHEMAS[serviceCode] ?? DEFAULT;
}

export const MAX_DOC_SIZE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_DOC_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];
