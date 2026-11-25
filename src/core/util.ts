import { SECCOL, SUS_MIN, SUS_MIN_MOVING } from './const';
import type { RNote, WireNote } from '../types';

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sstep = (u: number) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
export function lowerBound<T>(arr: T[], key: keyof T, v: number) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if ((arr[m][key] as unknown as number) < v) lo = m + 1; else hi = m; }
  return lo;
}
const cc = new Map<string, [number, number, number]>();
export function rgb(hex: string): [number, number, number] {
  let v = cc.get(hex);
  if (!v) { const n = parseInt(hex.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; cc.set(hex, v); }
  return v;
}
export const rgba = (hex: string, a: number) => { const c = rgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`; };
export const shade = (hex: string, k: number) => { const c = rgb(hex); return `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`; };
export const tint = (hex: string, k: number) => { const c = rgb(hex); return `rgb(${Math.round(c[0] + (255 - c[0]) * k)},${Math.round(c[1] + (255 - c[1]) * k)},${Math.round(c[2] + (255 - c[2]) * k)})`; };
export const fmt = (t: number) => { t = Math.max(0, t || 0); return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'); };
export const secLabel = (n: string) => String(n || '').replace(/[_-]+/g, ' ').trim();
export const chordLabel = (s: string) => String(s || '').trim().replace(/(^|\/)([A-G])b/g, '$1$2♭').replace(/#/g, '♯');
export function secColor(name: string) {
  const k = (name || '').toLowerCase();
  for (const key in SECCOL) if (k.includes(key)) return SECCOL[key];
  let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360} 30% 36%)`;
}
export const sustained = (n: { sus: number; sl: number; slu: number; ln?: boolean; linked?: boolean }) =>
  n.sus > SUS_MIN || (n.sus > SUS_MIN_MOVING && (n.sl > 0 || n.slu > 0 || !!n.ln || !!n.linked));
export function mkNote(n: WireNote, t: number, ci: number | undefined): RNote {
  return {
    t: +t, t0: +t, ch: ci, s: n.s | 0, f: n.f | 0, sus: Math.max(0, +(n.sus || 0)),
    ho: !!n.ho, po: !!n.po, sl: ((n.sl ?? -1) | 0) > 0 ? (n.sl as number) | 0 : -1,
    slu: ((n.slu ?? -1) | 0) > 0 ? (n.slu as number) | 0 : -1, bn: +(n.bn || 0),
    hm: !!n.hm, hp: !!n.hp, pm: !!n.pm, mt: !!(n.mt || n.fhm), vb: !!n.vb, tr: !!n.tr,
    ac: !!n.ac, tp: !!n.tp, ln: !!n.ln, rep: false, linked: false, hide: false, lab: true,
  };
}