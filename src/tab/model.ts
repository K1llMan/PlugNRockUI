import { STATE } from '../core/state';
import { clamp, lowerBound } from '../core/util';
import type { RNote, Syllable } from '../types';

export const TABK = { MARGIN: 26, PADL: 16, PADR: 8, STR: 13, TOP: 74, RHY: 30, LYR: 22, GAP: 30, W0: 20, W1: 30 };
export type TabValue = [number, number, boolean, boolean];
export interface TabEvent { t: number; notes: RNote[]; name: string; bar: number; beat: number; beats: number; val: TabValue; w: number; idx: number; end: number; x: number; row: number }
export interface TabBar { t0: number; t1: number; num: number; evs: TabEvent[]; lead: number; nat: number; lyr?: number; x0: number; x1: number; row: number; knots: [number, number][] }
export interface TabRow { bars: TabBar[]; nat: number; last?: boolean; top: number; h: number; idx: number; staffTop: number; staffBot: number }
export interface TabSyl { t: number; d: number; sy: Syllable; end: number }
export interface TabLayout { rows: TabRow[]; bars: TabBar[]; evs: TabEvent[]; syls: TabSyl[]; sylIdx: Map<Syllable, number>; width: number; height: number; nStr: number; maxLen: number }
const VALUES: TabValue[] = [[4, 0, false, false], [3, 0, false, true], [2, 0, false, false], [1.5, 0, false, true], [1, 0, false, false], [0.75, 1, false, true], [0.5, 1, false, false], [2 / 3, 1, true, false], [1 / 3, 1, true, false], [0.375, 2, false, true], [0.25, 2, false, false], [1 / 6, 2, true, false], [0.125, 3, false, false], [1 / 12, 3, true, false]];
export function tabBeatPos(t: number) {
  const B = STATE.beats; if (B.length < 2) return t * 2;
  let i = lowerBound(B, 'time', t + 1e-9) - 1;
  i = Math.max(0, Math.min(i, B.length - 2));
  return i + (t - B[i].time) / Math.max(1e-3, B[i + 1].time - B[i].time);
}
export function tabValue(beats: number) {
  let best = VALUES[0], err = 1e9;
  for (const v of VALUES) { const e = Math.abs(Math.log(Math.max(beats, 0.04) / v[0])); if (e < err) { err = e; best = v; } }
  return best;
}
function tabEvents(): TabEvent[] {
  const byT = new Map<number, TabEvent>();
  const add = (t: number, n: RNote) => {
    const k = Math.round(t * 1000);
    let e = byT.get(k);
    if (!e) { e = { t, notes: [], name: '', bar: 0, beat: 0, beats: 0, val: VALUES[4], w: 0, idx: 0, end: 0, x: 0, row: 0 }; byT.set(k, e); }
    if (!e.notes.some((m) => m.s === n.s)) e.notes.push(n);
  };
  for (const n of STATE.all) add(n.t, n);
  let prev: (typeof STATE.chords)[number] | null = null;
  for (const c of STATE.chords) {
    if (c.notes.length) prev = c;
    else if (prev) for (const n of prev.notes) add(c.t, { ...n, t: c.t, sus: 0, sl: -1, slu: -1, bn: 0, vb: false, ho: false, po: false, linked: false, pm: c.pm || n.pm, mt: c.mute || n.mt });
    if (c.name && !c.rep) { const e = byT.get(Math.round(c.t * 1000)); if (e) e.name = c.name; }
  }
  const evs = [...byT.values()].sort((a, b) => a.t - b.t);
  for (const e of evs) e.notes.sort((a, b) => a.s - b.s);
  return evs;
}
export function buildTabLayout(width: number): TabLayout | null {
  const nStr = STATE.nStr, evs = STATE.all.length ? tabEvents() : [];
  if (!evs.length) return null;
  let lastT = 0, firstT = evs[0].t;
  for (const e of evs) for (const n of e.notes) lastT = Math.max(lastT, n.t + n.sus);
  for (const ln of STATE.lyrics) for (const sy of ln.syl) {
    if (!String(sy[2]).trim()) continue;
    firstT = Math.min(firstT, sy[0]); lastT = Math.max(lastT, sy[0] + Math.max(sy[1] || 0, 0.2));
  }
  const downs = STATE.beats.filter((b) => b.measure >= 0);
  let raw: { t0: number; t1: number; num: number }[] = [];
  if (!downs.length) for (let t = 0, n = 1; t < lastT; t += 2, n++) raw.push({ t0: t, t1: t + 2, num: n });
  else for (let i = 0; i < downs.length; i++) {
    const t0 = downs[i].time;
    let t1 = i + 1 < downs.length ? downs[i + 1].time : 0;
    if (i + 1 >= downs.length) t1 = Math.max(t0 + (i > 0 ? t0 - downs[i - 1].time : 2), lastT + 0.05);
    raw.push({ t0, t1, num: downs[i].measure });
  }
  if (raw.length && lastT > 0 && raw[0].t0 > 0.05 && firstT < raw[0].t0 - 0.02)
    raw.unshift({ t0: Math.min(firstT - 0.05, raw[0].t0 - 0.5), t1: raw[0].t0, num: raw[0].num - 1 });
  while (raw.length > 1 && raw[1].t0 <= firstT + 1e-4) raw.shift();
  raw = raw.filter((b) => b.t1 > firstT - 1e-4 || b.t0 > firstT);
  if (!raw.length) return null;
  const bars: TabBar[] = raw.map((b) => ({ ...b, evs: [], lead: 0, nat: 0, x0: 0, x1: 0, row: 0, knots: [] }));
  let bi = 0;
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    while (bi < bars.length - 1 && e.t >= bars[bi].t1 - 1e-4) bi++;
    e.bar = bi;
    const nextT = Math.min(i + 1 < evs.length ? evs[i + 1].t : Infinity, bars[bi].t1);
    e.beat = tabBeatPos(e.t); e.beats = Math.max(0.05, tabBeatPos(nextT) - e.beat); e.val = tabValue(e.beats);
    e.w = TABK.W0 + TABK.W1 * Math.sqrt(clamp(e.beats, 0.125, 4)) + (e.notes.some((n) => n.hm || n.f >= 10) ? 6 : 0);
    e.idx = i;
    e.end = Math.max(Math.max(...e.notes.map((n) => n.t + n.sus)), e.t + Math.min(0.2, Math.max(0.06, (i + 1 < evs.length ? evs[i + 1].t : e.t + 1) - e.t - 0.02)));
    bars[bi].evs.push(e);
  }
  for (const b of bars) {
    const rest = tabBeatPos(b.evs.length ? b.evs[0].t : b.t1) - tabBeatPos(b.t0);
    b.lead = rest > 0.06 ? TABK.W1 * Math.sqrt(Math.min(rest, 4)) : 0;
    b.nat = TABK.PADL + b.lead + b.evs.reduce((s, e) => s + e.w, 0) + TABK.PADR;
    if (!b.evs.length) b.nat = Math.max(b.nat, 70);
  }
  for (const ln of STATE.lyrics) for (const sy of ln.syl) {
    const b = bars.find((q) => sy[0] >= q.t0 - 1e-3 && sy[0] < q.t1);
    if (b) b.lyr = (b.lyr || 0) + String(sy[2]).trim().length * 6.6 + 6;
  }
  for (const b of bars) if (b.lyr) b.nat = Math.max(b.nat, b.lyr + TABK.PADL + 6);
  const avail = width - 2 * TABK.MARGIN, rows: TabRow[] = [];
  let cur: TabBar[] = [], sum = 0;
  for (const b of bars) {
    if (cur.length && sum + b.nat > avail) { rows.push({ bars: cur, nat: sum, top: 0, h: 0, idx: 0, staffTop: 0, staffBot: 0 }); cur = []; sum = 0; }
    cur.push(b); sum += Math.min(b.nat, avail);
  }
  if (cur.length) rows.push({ bars: cur, nat: sum, last: true, top: 0, h: 0, idx: 0, staffTop: 0, staffBot: 0 });
  const staffH = (nStr - 1) * TABK.STR, rowH = TABK.TOP + staffH + TABK.RHY + TABK.LYR + TABK.GAP;
  let top = 10;
  rows.forEach((row, ri) => {
    const k = row.last && row.nat < avail * 0.7 ? 1 : avail / row.nat;
    let x = TABK.MARGIN;
    for (const b of row.bars) {
      const w = Math.min(b.nat, avail) * k, kk = w / b.nat;
      b.x0 = x; b.x1 = x + w; b.row = ri;
      let ex = x + (TABK.PADL + b.lead) * kk;
      b.knots = [[b.t0, x + 4]];
      for (const e of b.evs) { e.x = ex + 7 * kk; e.row = ri; b.knots.push([e.t, e.x]); ex += e.w * kk; }
      b.knots.push([b.t1, x + w]); x += w;
    }
    row.top = top; row.h = rowH; row.idx = ri; row.staffTop = TABK.TOP; row.staffBot = TABK.TOP + staffH;
    top += rowH;
  });
  const syls: TabSyl[] = [], sylIdx = new Map<Syllable, number>();
  for (const ln of STATE.lyrics) for (const sy of ln.syl) if (String(sy[2]).trim()) syls.push({ t: sy[0], d: sy[1], sy, end: 0 });
  syls.sort((a, b) => a.t - b.t);
  syls.forEach((q, k) => {
    const nx = syls[k + 1];
    q.end = Math.max(q.t + Math.max(q.d || 0, 0.15), q.t);
    if (nx && nx.t > q.t) q.end = Math.min(q.end, nx.t);
    sylIdx.set(q.sy, k);
  });
  return { rows, bars, evs, syls, sylIdx, width, height: top + 40, nStr, maxLen: evs.reduce((m, e) => Math.max(m, e.end - e.t), 0) };
}
export function tabXAt(b: TabBar, t: number) {
  const K = b.knots;
  if (t <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) if (t <= K[i][0]) { const [t0, x0] = K[i - 1], [t1, x1] = K[i]; return t1 > t0 ? x0 + (x1 - x0) * (t - t0) / (t1 - t0) : x1; }
  return K[K.length - 1][1];
}
export function tabBarAt(l: TabLayout, t: number) {
  const B = l.bars; if (!B.length) return null;
  let lo = 0, hi = B.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (B[m].t0 <= t) lo = m; else hi = m - 1; }
  return B[lo];
}
export function tabTimeAt(l: TabLayout, rowIdx: number, x: number) {
  const row = l.rows[rowIdx]; if (!row) return 0;
  const b = row.bars.find((q) => x >= q.x0 && x < q.x1) || (x < row.bars[0].x0 ? row.bars[0] : row.bars[row.bars.length - 1]);
  let t = b.t0; const K = b.knots;
  for (let k = 1; k < K.length; k++) {
    if (x <= K[k][1]) { const [t0, x0] = K[k - 1], [t1, x1] = K[k]; t = x1 > x0 ? t0 + (t1 - t0) * (x - x0) / (x1 - x0) : t1; break; }
    t = K[k][0];
  }
  const i = lowerBound(l.evs, 't', t - 0.15);
  if (i < l.evs.length && Math.abs(l.evs[i].x - x) < 10 && l.evs[i].row === rowIdx) t = l.evs[i].t;
  return t;
}