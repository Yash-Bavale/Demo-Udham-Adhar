/**
 * Formats a raw lead_source value into a clean, human-readable admin label.
 *
 * Handles all formats:
 *  - New clean:   "Google Ads | Campaign: 24100987356 | Page: /download" → shown as-is
 *  - Legacy raw:  "website:/Download-Udyam?Gad_source=1&Gad_campaignid=123&Gclid=..." → parsed
 *  - Short codes: "website" / "manual" / "contact_form" / etc. → friendly label
 */
export function formatLeadSource(raw: string | null | undefined): string {
  if (!raw) return "—";

  // Already a clean new-format label — return directly
  if (raw.startsWith("Google Ads") || raw.startsWith("Website |")) return raw;

  // Legacy format: "website:/path?query"
  if (raw.startsWith("website:")) {
    const after = raw.slice("website:".length);
    if (!after || after === "/") return "Website";
    try {
      const url = new URL(after, "https://placeholder.invalid");
      const params = url.searchParams;
      const isAds =
        params.has("Gad_source") || params.has("gad_source") ||
        params.has("gclid")      || params.has("Gclid")      ||
        params.has("gbraid")     || params.has("Gbraid")     ||
        params.has("wbraid")     || params.has("Wbraid");

      if (isAds) {
        const campaignId =
          params.get("Gad_campaignid") ||
          params.get("gad_campaignid") ||
          params.get("utm_campaign") || null;
        const keyword =
          params.get("utm_term") ||
          params.get("keyword") || null;
        let label = "Google Ads";
        if (campaignId) label += ` | Campaign: ${campaignId}`;
        if (keyword)    label += ` | kw: ${keyword}`;
        label += ` | Page: ${url.pathname || "/"}`;
        return label;
      }
      return `Website | ${url.pathname || "/"}`;
    } catch {
      return `Website | ${after.split("?")[0].slice(0, 80)}`;
    }
  }

  // Known short codes
  const KNOWN: Record<string, string> = {
    website:                   "Website",
    manual:                    "Manual Entry",
    contact_form:              "Contact Form",
    complaint_form:            "Complaint Form",
    talk_to_expert:            "Talk to Expert",
    talk_to_expert_converted:  "Expert → Converted",
  };
  return KNOWN[raw.toLowerCase()] ?? raw;
}
