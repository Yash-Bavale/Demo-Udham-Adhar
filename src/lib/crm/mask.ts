// Aadhaar masking utility — display only last 4 digits.
// Use anywhere customer-facing strings could contain a 12-digit Aadhaar number.

const AADHAAR_RE = /\b(\d[\s-]?){11}\d\b/g;

export function maskAadhaar(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(AADHAAR_RE, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length !== 12) return m;
    return `XXXX XXXX ${digits.slice(-4)}`;
  });
}

export function maskAadhaarNumber(num: string | null | undefined): string {
  if (!num) return "—";
  const d = num.replace(/\D/g, "");
  if (d.length !== 12) return num;
  return `XXXX XXXX ${d.slice(-4)}`;
}
