// Chart colors. Categorical order is the validated reference palette (dataviz skill,
// passes CVD/normal-vision/lightness checks in light mode) — assigned in fixed order,
// never cycled: >8 categories fold into "Khác" in the chart components.
export const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
/** single-series magnitude bars use the brand blue */
export const SINGLE = '#154b98';
/** sequential (heatmap) — one hue, light → dark */
export const SEQ = ['#eef3fb', '#d8e3f5', '#b0c6ea', '#7c9fd7', '#4a76bf', '#2a5eab', '#154b98', '#0f3366'];
export function seqColor(t: number): string {
  if (!(t > 0)) return '#f6f8fc';
  return SEQ[Math.min(SEQ.length - 1, Math.max(0, Math.ceil(t * (SEQ.length - 1))))];
}
/** diverging (Likert / agreement): two poles + neutral gray midpoint */
export function divergingScale(n: number): string[] {
  const neg = ['#b8322f', '#e07a6f', '#f2b5ab'];
  const pos = ['#9fbde6', '#4a76bf', '#154b98'];
  const mid = '#c9ced8';
  const half = Math.floor(n / 2);
  const left = neg.slice(3 - half);
  const right = pos.slice(0, half);
  return n % 2 ? [...left, mid, ...right] : [...left, ...right];
}
/** status colors — reserved, always shown with a label */
export const NPS_COLORS = { detractor: '#d64545', passive: '#9aa3b2', promoter: '#1a8f4a' };
export const AXIS = { fontSize: 12, fill: '#5b6780' };
export const GRID = '#eef1f6';

/** pick readable ink (dark/white) for text drawn on a fill */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.36 ? '#0f1b33' : '#ffffff';
}
