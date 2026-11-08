// Client/server-safe helpers for Talk-to-Expert consultation detection.
// The CRM has received these leads with slightly different labels over time,
// so never rely on one exact DB value when deciding whether to show the UI.

export function normalizeConsultationText(value?: string | null) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function isConsultationSource(source?: string | null) {
  const s = normalizeConsultationText(source);
  return s.includes("talktoexpert") || s.includes("expertconsultation");
}

export function isConsultationServiceName(serviceName?: string | null) {
  const s = normalizeConsultationText(serviceName);
  return (
    s.includes("expertconsultation") ||
    s.includes("talktoexpert") ||
    s.includes("suitableserviceselection")
  );
}

export function isTalkToExpertLead(input?: {
  lead_source?: string | null;
  source?: string | null;
  service?: string | null;
  service_name?: string | null;
} | null) {
  return isConsultationSource(input?.lead_source ?? input?.source) ||
    isConsultationServiceName(input?.service ?? input?.service_name);
}

export function isUnconvertedConsultationLead(input?: {
  lead_source?: string | null;
  source?: string | null;
  service?: string | null;
  service_name?: string | null;
} | null) {
  return isTalkToExpertLead(input) &&
    isConsultationServiceName(input?.service ?? input?.service_name);
}

export function isConvertedConsultationLead(input?: {
  lead_source?: string | null;
  source?: string | null;
  service?: string | null;
  service_name?: string | null;
} | null) {
  return isConsultationSource(input?.lead_source ?? input?.source) &&
    !isConsultationServiceName(input?.service ?? input?.service_name);
}