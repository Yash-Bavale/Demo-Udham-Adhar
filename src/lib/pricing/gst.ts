// Inclusive 18% GST breakdown helpers.
// Total (inclusive) = Base + GST, where GST = Base * 0.18.
// So Base = round(Total / 1.18), GST = Total - Base.
export const GST_RATE = 0.18;

const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export function fromTotal(total: number): { base: number; gst: number; total: number } {
  const t = Math.max(0, Number(total) || 0);
  const base = r2(t / (1 + GST_RATE));
  const gst = r2(t - base);
  return { base, gst, total: r2(t) };
}

export function fromBase(base: number): { base: number; gst: number; total: number } {
  const b = Math.max(0, Number(base) || 0);
  const gst = r2(b * GST_RATE);
  const total = r2(b + gst);
  return { base: r2(b), gst, total };
}
