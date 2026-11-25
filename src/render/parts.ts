import { FING_IN, FONT, FW, INLAY, LANE, NUM_FADE0, NUM_FADE1, PITCH, VIB_AMP, VIB_HZ, YLO, ZFAR } from '../core/const';
import { G, STATE } from '../core/state';
import { clamp, lerp, lowerBound, rgba, shade, sstep, tint } from '../core/util';
import { ctx, dpr, glow, quad, rr, seg, W, H } from './surface';
import { fretMid, fretX, neckAxes, project, type Axes, type Cam } from './camera';
import { label, stamp, textSprite } from './sprites';
import { hitFlash } from '../core/chart';
import { selRange, SEL } from '../core/loop';
import { HOLD_MS } from '../core/const';
import type { ChordEv, Hold, RAnchor, RNote } from '../types';

export const nameY = () => YLO + STATE.nStr * PITCH;
export const numFadeIn = (fs: number) => sstep(clamp((fs - NUM_FADE0) / (NUM_FADE1 - NUM_FADE0), 0, 1));
export function noteX(n: RNote, u: number, zoneMid: number) {
  const tgt = n.sl > 0 ? n.sl : n.slu > 0 ? n.slu : 0;
  if (n.f <= 0) return tgt ? zoneMid - FW * tgt * sstep((u - 0.3) / 0.7) : zoneMid;
  if (!tgt) return fretMid(n.f);
  return lerp(fretMid(n.f), fretMid(tgt), sstep((u - 0.3) / 0.7));
}
export const bendY = (n: RNote, u: number) => n.bn > 0 ? Math.min(PITCH * 1.5, n.bn * PITCH * 0.42) * sstep(u / 0.45) : 0;
export const vibY = (n: RNote, tau: number) => n.vb ? Math.sin((tau - n.t) * Math.PI * 2 * VIB_HZ) * VIB_AMP * Math.min(1, (tau - n.t) * 6) : 0;

export function drawTail(cam: Cam, n: RNote, t: number, y: number, col: string, zoneMid: number, halfW: number, fog: (tau: number) => number) {
  const tA = Math.max(n.t, t), tB = Math.min(n.t + n.sus, t + G.hor);
  if (tB - tA < 0.01) return;
  const ts: number[] = [];
  if (n.tr) {
    const step = 1 / 20; ts.push(tA);
    for (let k = Math.ceil((tA - n.t) / step + 0.001); n.t + k * step < tB; k++) ts.push(n.t + k * step);
    ts.push(tB);
  } else {
    const curved = n.sl > 0 || n.slu > 0 || n.bn > 0 || n.vb;
    const N = curved ? clamp(Math.ceil((tB - tA) * (n.vb ? 44 : 16)), 8, 90) : 1;
    for (let i = 0; i <= N; i++) ts.push(lerp(tA, tB, i / N));
  }
  const L: { x: number; y: number; s: number }[] = [], R: typeof L = [];
  for (const tau of ts) {
    const u = (tau - n.t) / n.sus;
    let x = noteX(n, u, zoneMid);
    if (n.tr) x += (Math.round((tau - n.t) * 20) & 1 ? 1 : -1) * FW * 0.1;
    const yy = y + bendY(n, u) + vibY(n, tau), z = -(tau - t) * G.sc;
    const a = project(cam, x - halfW, yy, z), b = project(cam, x + halfW, yy, z);
    if (!a || !b) return;
    L.push(a); R.push(b);
  }
  const p0 = L[0], p1 = L[L.length - 1];
  const a0 = fog(tA), a1 = fog(tB) * (n.slu > 0 && tB >= n.t + n.sus - 0.01 ? 0.15 : 1);
  const k = n.f <= 0 ? 0.16 : 0.62;
  let fill: string | CanvasGradient, edge: string | CanvasGradient;
  if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 2 || Math.abs(a0 - a1) < 0.02) { fill = rgba(col, k * a0); edge = rgba(col, 0.95 * a0); }
  else {
    const gf = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
    gf.addColorStop(0, rgba(col, k * a0)); gf.addColorStop(1, rgba(col, k * a1)); fill = gf;
    const ge = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
    ge.addColorStop(0, rgba(col, 0.95 * a0)); ge.addColorStop(1, rgba(col, 0.95 * a1)); edge = ge;
  }
  ctx.beginPath(); ctx.moveTo(L[0].x, L[0].y);
  for (let i = 1; i < L.length; i++) ctx.lineTo(L[i].x, L[i].y);
  for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i].x, R[i].y);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  ctx.lineJoin = 'round'; ctx.strokeStyle = edge; ctx.lineWidth = clamp(L[0].s * FW * 0.022, 0.8, 2.6);
  ctx.beginPath(); ctx.moveTo(L[0].x, L[0].y);
  for (let i = 1; i < L.length; i++) ctx.lineTo(L[i].x, L[i].y);
  ctx.moveTo(R[0].x, R[0].y);
  for (let i = 1; i < R.length; i++) ctx.lineTo(R[i].x, R[i].y);
  ctx.stroke();
}
export function chordName(name: string, tl: { x: number; y: number }, sc: number, _a: number, ax: Axes | null) {
  const fs = sc * FW * 0.62, a = numFadeIn(fs);
  if (a <= 0.01) return;
  const sp = textSprite(name, fs, '#eef1f3', null), k = fs / sp.q, tw = (sp.tw || 0) * k;
  if (STATE.lefty) stamp(sp, tl.x, tl.y, k, a, ax, Math.min(W - tw - 10, tl.x + fs * 0.45) - tl.x + tw / 2, -fs * 0.36);
  else stamp(sp, tl.x, tl.y, k, a, ax, Math.max(tw + 10, tl.x - fs * 0.45) - tl.x - tw / 2, -fs * 0.36);
}
export function drawChordBox(cam: Cam, ev: ChordEv, x0: number, x1: number, yTop: number, z: number, a: number, near: number) {
  const bl = project(cam, x0, 0, z), br = project(cam, x1, 0, z), tr = project(cam, x1, yTop, z), tl = project(cam, x0, yTop, z);
  if (!bl || !br || !tr || !tl) return;
  const lw = clamp(bl.s * FW * 0.085, 1.2, 9), muted = !!(ev.mute || ev.pm);
  const rim = muted ? '36,160,184' : '64,236,255', rimK = muted ? 0.85 : 0.95, d = FW * 0.3;
  quad(project(cam, x0, 0, z + d), project(cam, x1, 0, z + d), project(cam, x1, 0, z - d), project(cam, x0, 0, z - d),
    `rgba(120,190,205,${((muted ? 0.2 : 0.3) * a).toFixed(3)})`);
  ctx.beginPath(); ctx.moveTo(bl.x, bl.y); ctx.lineTo(br.x, br.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(tl.x, tl.y); ctx.closePath();
  ctx.fillStyle = muted ? `rgba(10,56,70,${((ev.rep ? 0.45 : 0.35) * a).toFixed(3)})` : `rgba(30,200,220,${((ev.rep ? 0.16 : 0.1) * a).toFixed(3)})`;
  ctx.fill();
  if (!muted && lw > 2.5 && near > 0.5) glow('#2fe6ff', (bl.x + br.x) / 2, (bl.y + tl.y) / 2, Math.abs(br.x - bl.x) * 0.75, Math.abs(bl.y - tl.y) * 0.95, 0.1 * a * near);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = `rgba(${rim},${(rimK * a).toFixed(3)})`; ctx.lineWidth = ev.rep ? lw * 0.55 : lw;
  ctx.beginPath(); seg(bl, tl); seg(br, tr); ctx.stroke();
  ctx.lineWidth = Math.max(1, lw * 0.45); ctx.beginPath(); seg(tl, tr); seg(bl, br); ctx.stroke();
  if (ev.rep && muted) {
    ctx.strokeStyle = `rgba(${rim},${(0.55 * a).toFixed(3)})`; ctx.lineWidth = Math.max(1, lw * 0.5);
    ctx.beginPath(); seg(bl, tr); seg(br, tl); ctx.stroke();
  }
  ctx.lineCap = 'butt';
  if (!ev.rep && ev.name && ev.hold !== 2 && !(ev.hold === 1 && ev.landed)) {
    const p = project(cam, x0, nameY(), z);
    if (p) chordName(ev.name, p, p.s, a, neckAxes(cam, x0, nameY(), z));
  }
}
export interface WorldPill { g: string; x: number; ya: number; yb: number; yt: number; k: number }
export function fingerPills(t: number, yOf: (s: number) => number): WorldPill[] {
  const Hd = STATE.holds, k = lowerBound(Hd, 'in0', t + 1e-6) - 1;
  if (k < 0) return [];
  const h = Hd[k], nx = Hd[k + 1], e = PITCH * 0.2;
  const geo = (m: Hold['pills'][number], kk: number): WorldPill => {
    const y0 = yOf(m.s0), y1 = yOf(m.s1), hi = Math.max(y0, y1), lo = Math.min(y0, y1);
    return { g: m.g, x: fretMid(m.f), ya: hi + e, yb: lo - e, yt: m.s1 > m.s0 ? hi : (y0 + y1) / 2, k: kk };
  };
  const u = clamp((t - h.in0) / Math.max(0.01, h.t - h.in0), 0, 1);
  if (u < 1 && h.link) {
    const out: WorldPill[] = [], prev = new Map(Hd[k - 1].pills.map((m) => [m.g, m]));
    for (const m of h.pills) {
      const b = geo(m, 1), o = prev.get(m.g);
      if (o) { const a = geo(o, 1); b.x = lerp(a.x, b.x, u); b.ya = lerp(a.ya, b.ya, u); b.yb = lerp(a.yb, b.yb, u); b.yt = lerp(a.yt, b.yt, u); prev.delete(m.g); }
      else b.k = u;
      out.push(b);
    }
    for (const o of prev.values()) out.push(geo(o, 1 - u));
    return out;
  }
  let kk = u;
  if (t > h.t1 && !(nx && nx.link)) kk = clamp(1 - (t - h.t1) / FING_IN, 0, 1);
  return kk > 0.01 ? h.pills.map((m) => geo(m, kk)) : [];
}
export function drawPill(pa: { x: number; y: number }, pb: { x: number; y: number }, pt: { x: number; y: number }, r: number, txt: string, a: number, ax: Axes | null) {
  const ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
  ctx.globalAlpha = a; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.arc(pa.x, pa.y, r, ang + Math.PI / 2, ang + Math.PI * 1.5);
  ctx.arc(pb.x, pb.y, r, ang - Math.PI / 2, ang + Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = Math.max(3, r * 0.34); ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.4, r * 0.15); ctx.stroke();
  ctx.globalAlpha = 1;
  label(txt, pt.x, pt.y, r * 1.7, '#fff', a, null, ax);
}
export const BARS = { x0: 0, x1: 1, top: 0, h: 1 };
export function drawPhraseBars(t: number, off: number) {
  BARS.x0 = W * 0.126; BARS.x1 = W * 0.895;
  BARS.h = clamp(H * 0.066, 22, 76); BARS.top = Math.max(8, H * 0.048);
  const ph = STATE.phrases, D = STATE.duration || 0;
  if (!ph.length || D <= 0) return;
  const base = BARS.top + BARS.h, span = BARS.x1 - BARS.x0;
  const tick = Math.max(2, Math.round(BARS.h * 0.065)), lineY = base + Math.max(1, Math.round(tick * 0.6));
  const gap = Math.max(1.5, span * 0.0022);
  const X = (tt: number) => BARS.x0 + span * clamp((tt + off) / D, 0, 1);
  const gFut = ctx.createLinearGradient(0, BARS.top, 0, base);
  gFut.addColorStop(0, '#c800ff'); gFut.addColorStop(1, '#6c1a9e');
  let first = -1, last = -1;
  for (let i = 0; i < ph.length; i++) if (ph[i].lv > 0) { if (first < 0) first = i; last = i; }
  ctx.fillStyle = '#4a4e56'; ctx.fillRect(BARS.x0 - span * 0.01, lineY, span * 1.02, tick);
  const sel = selRange();
  for (let pi = 0; pi < ph.length; pi++) {
    const p = ph[pi], xa = X(p.t0), w = Math.max(1, X(p.t1) - xa - gap);
    const picked = !!sel && pi >= sel[0] && pi <= sel[1];
    ctx.globalAlpha = sel && !picked ? 0.38 : 1;
    if (picked) { ctx.fillStyle = 'rgba(120,235,255,0.20)'; ctx.fillRect(xa, BARS.top - 3, w, BARS.h + 3); }
    const cur = t >= p.t0 && t < p.t1, past = t >= p.t1;
    const bh = p.lv > 0 ? Math.max(3, BARS.h * p.lv) : 0;
    if (bh > 0) {
      ctx.fillStyle = past ? '#3a1c4e' : cur ? '#ff5cf4' : gFut;
      ctx.fillRect(xa, base - bh, w, bh);
      if (cur) { ctx.fillStyle = '#4a1fd0'; ctx.fillRect(xa, base - bh, w * clamp((t - p.t0) / (p.t1 - p.t0), 0, 1), bh); }
    }
    if (picked || (pi >= first && pi <= last && !past)) { ctx.fillStyle = picked ? '#7ff0ff' : '#ff7a00'; ctx.fillRect(xa, lineY, w, picked ? tick * 1.6 : tick); }
    if (picked && bh > 0) { ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(xa, base - bh, w, bh); }
  }
  ctx.globalAlpha = 1;
  if (sel) {
    const xa = X(ph[sel[0]].t0), xb = X(ph[sel[1]].t1);
    ctx.strokeStyle = 'rgba(127,240,255,0.95)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(xa - 1.5, BARS.top - 4.5, xb - xa + 1, BARS.h + tick * 3 + 7);
  }
  const lw = Math.max(1.5, BARS.h * 0.035), foot = BARS.h * 0.1, yb = lineY + tick + foot * 0.6;
  const dr = SEL.drag && sel && (SEL.drag.moved || performance.now() - SEL.drag.t0 >= HOLD_MS);
  const pinA = dr ? ph[sel![0]].t0 : STATE.loop && STATE.loopB > 0 ? STATE.loopA - off : null;
  const pinB = dr ? ph[sel![1]].t1 : STATE.loop && STATE.loopB > 0 ? STATE.loopB - off : null;
  if (pinB !== null) {
    const xe = X(pinB) - gap * 0.5;
    ctx.strokeStyle = ctx.fillStyle = '#38c8ee'; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(xe - foot, BARS.top - foot * 0.9); ctx.lineTo(xe, BARS.top - foot * 0.9); ctx.lineTo(xe, yb); ctx.stroke();
    const pw = BARS.h * 0.36, py = yb + BARS.h * 0.02;
    ctx.beginPath(); ctx.moveTo(xe, py); ctx.lineTo(xe + pw * 0.5, py + pw * 0.45); ctx.lineTo(xe + pw * 0.5, py + pw * 1.05);
    ctx.lineTo(xe - pw * 0.5, py + pw * 1.05); ctx.lineTo(xe - pw * 0.5, py + pw * 0.45); ctx.closePath(); ctx.fill();
  }
  if (pinA !== null) {
    const xp = X(pinA) + gap * 0.5;
    ctx.strokeStyle = ctx.fillStyle = '#38c8ee'; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(xp, BARS.top - foot * 0.4); ctx.lineTo(xp, yb); ctx.lineTo(xp + foot, yb); ctx.stroke();
    const pw = BARS.h * 0.38, ph2 = BARS.h * 0.3, py = BARS.top - foot * 0.4 - ph2 * 1.25;
    ctx.beginPath(); ctx.moveTo(xp - pw / 2, py + ph2 * 0.2);
    ctx.quadraticCurveTo(xp - pw / 2, py, xp - pw / 2 + ph2 * 0.2, py);
    ctx.lineTo(xp + pw / 2 - ph2 * 0.2, py);
    ctx.quadraticCurveTo(xp + pw / 2, py, xp + pw / 2, py + ph2 * 0.2);
    ctx.lineTo(xp + pw / 2, py + ph2 * 0.85); ctx.lineTo(xp, py + ph2 * 1.25); ctx.lineTo(xp - pw / 2, py + ph2 * 0.85);
    ctx.closePath(); ctx.fill();
  }
  const tcs = STATE.tones.changes;
  if (tcs.length) {
    const r = clamp(BARS.h * 0.1, 3, 6.5), y0 = BARS.top - r * 2.1;
    ctx.fillStyle = '#ffe9a8';
    for (const c of tcs) {
      const x = BARS.x0 + span * clamp((c.t + off) / D, 0, 1);
      ctx.globalAlpha = t >= c.t ? 0.4 : 1;
      ctx.beginPath(); ctx.moveTo(x - r, y0); ctx.lineTo(x + r, y0); ctx.lineTo(x, y0 + r * 1.7); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
export function drawHitLight(t: number) {
  const r = clamp(H * 0.0105, 5, 11), cx = (BARS.x0 + BARS.x1) / 2;
  const cy = BARS.top + BARS.h + Math.max(2, Math.round(BARS.h * 0.055)) * 2 + r * 2.1;
  const k = hitFlash(t);
  if (k > 0) glow('#49e9ff', cx, cy, r * 4.5, r * 4.5, 0.95 * k);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#0a0d11'; ctx.fill();
  if (k > 0) { ctx.globalAlpha = k; ctx.fillStyle = '#e6fdff'; ctx.fill(); ctx.globalAlpha = 1; }
  ctx.lineWidth = Math.max(1.2, r * 0.22);
  ctx.strokeStyle = k > 0 ? `rgba(120,240,255,${(0.45 + 0.55 * k).toFixed(3)})` : '#3b4753';
  ctx.stroke();
}
export const inBars = (x: number, y: number) => STATE.phrases.length > 0 && y >= BARS.top - 8 && y <= BARS.top + BARS.h + 14 && x >= BARS.x0 - 3 && x <= BARS.x1 + 3;
export function barAt(x: number) {
  const ph = STATE.phrases, D = STATE.duration || 1;
  const tc = clamp((x - BARS.x0) / (BARS.x1 - BARS.x0), 0, 1) * D - STATE.offMs / 1000;
  let i = 0; while (i < ph.length - 1 && ph[i].t1 <= tc) i++;
  return i;
}
export const barSeek = (x: number) => clamp((x - BARS.x0) / (BARS.x1 - BARS.x0), 0, 1) * (STATE.duration || 0);

export function drawChordDiagram(t: number, cam: Cam, curA: RAnchor) {
  const Hd = STATE.holds, k = lowerBound(Hd, 't', t + 1e-6) - 1;
  if (k < 0) return;
  const h = Hd[k], nx = Hd[k + 1];
  if (!h.frets || !h.frets.some((f) => f >= 0)) return;
  let a = nx && nx.link ? (t < nx.t ? 1 : 0) : clamp((h.t1 + 0.3 - t) / 0.3, 0, 1);
  a *= STATE.vis; if (a <= 0.01) return;
  const nS = STATE.nStr, fr = h.frets, fretted = fr.filter((f) => f > 0);
  const lo = fretted.length ? Math.min(...fretted) : 1, hi = fretted.length ? Math.max(...fretted) : 1;
  const base = hi <= 5 ? 1 : lo, nF = clamp(hi - base + 1, 4, 7);
  const cw = clamp(H * 0.055, 22, 58), sp = cw * 0.44;
  const x0 = W * 0.08, yName = Math.max(H * 0.335, BARS.top + BARS.h + cw * 2.2);
  const gx = x0 + cw * 0.75, gy = yName + cw * 0.62, gw = nF * cw, gh = (nS - 1) * sp;
  const MX = STATE.lefty ? (x: number) => 2 * gx + gw - x : (x: number) => x;
  const padR = STATE.lefty ? cw * 0.85 : cw * 0.45;
  const xl = fretX(curA.fret - 1), xr = fretX(Math.min(24, curA.fret + curA.width - 1));
  for (let i = 0; i <= 8 && a > 0.3; i++) for (const xx of [xl, xr]) {
    const p = project(cam, xx, 0, -ZFAR * i / 8);
    if (p && p.x > x0 - cw && p.x < gx + gw + padR + cw * 0.55 && p.y > yName - cw && p.y < gy + gh + cw * 1.3) { a = Math.min(a, 0.28); break; }
  }
  ctx.save(); ctx.globalAlpha = a; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  rr(x0 - cw * 0.35, yName - cw * 0.62, gx + gw + padR - (x0 - cw * 0.35), gy + gh + cw * 1.05 - (yName - cw * 0.62), cw * 0.22); ctx.fill();
  if (h.name) {
    ctx.font = `700 ${(cw * 0.72).toFixed(1)}px ${FONT}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f2f4f5'; ctx.fillText(h.name, x0, yName);
  }
  for (let i = 0; i <= nF; i++) {
    const x = MX(gx + i * cw), nut = base === 1 && i === 0;
    ctx.strokeStyle = nut ? '#e9e2cf' : '#58626e'; ctx.lineWidth = nut ? Math.max(3, cw * 0.12) : 1.5;
    ctx.beginPath(); ctx.moveTo(x, gy - sp * 0.25); ctx.lineTo(x, gy + gh + sp * 0.25); ctx.stroke();
  }
  const yS = (s: number) => gy + (STATE.invert ? nS - 1 - s : s) * sp;
  for (let s = 0; s < nS; s++) {
    const used = fr[s] >= 0, col = LANE[s] || '#9aa7b2', y = yS(s);
    ctx.strokeStyle = used ? col : rgba(col, 0.28); ctx.lineWidth = used ? Math.max(1.6, cw * 0.055) : 1.2;
    ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + gw, y); ctx.stroke();
    const mx = MX(gx - cw * 0.42), r = sp * 0.3;
    if (fr[s] === 0) { ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, r * 0.36); ctx.beginPath(); ctx.arc(mx, y, r, 0, Math.PI * 2); ctx.stroke(); }
    else if (!used) {
      ctx.strokeStyle = '#7b8794'; ctx.lineWidth = Math.max(1.4, r * 0.34); ctx.beginPath();
      ctx.moveTo(mx - r * 0.8, y - r * 0.8); ctx.lineTo(mx + r * 0.8, y + r * 0.8);
      ctx.moveTo(mx + r * 0.8, y - r * 0.8); ctx.lineTo(mx - r * 0.8, y + r * 0.8); ctx.stroke();
    }
  }
  const R = sp * 0.44, cellX = (f: number) => MX(gx + (f - base + 0.5) * cw);
  const num = (txt: string, x: number, y: number) => {
    ctx.font = `700 ${(R * 1.45).toFixed(1)}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(txt, x, y + R * 0.06);
  };
  const pills = h.pills.filter((m) => m.f >= base && m.f < base + nF);
  for (const m of pills) {
    if (m.s1 === m.s0) continue;
    const x = cellX(m.f);
    ctx.strokeStyle = 'rgba(235,240,245,0.92)'; ctx.lineWidth = R * 2;
    ctx.beginPath(); ctx.moveTo(x, yS(m.s0)); ctx.lineTo(x, yS(m.s1)); ctx.stroke();
    ctx.strokeStyle = '#2a323c'; ctx.lineWidth = R * 2 - Math.max(3, R * 0.42);
    ctx.beginPath(); ctx.moveTo(x, yS(m.s0)); ctx.lineTo(x, yS(m.s1)); ctx.stroke();
    num(m.g, x, Math.min(yS(m.s0), yS(m.s1)));
  }
  for (let s = 0; s < nS; s++) {
    const f = fr[s];
    if (!(f > 0) || f < base || f >= base + nF) continue;
    const m = pills.find((q) => q.f === f && s >= q.s0 && s <= q.s1);
    if (m && m.s1 !== m.s0) continue;
    const x = cellX(f), y = yS(s), col = LANE[s] || '#9aa7b2';
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fillStyle = shade(col, 0.62); ctx.fill();
    ctx.strokeStyle = tint(col, 0.55); ctx.lineWidth = Math.max(1.4, R * 0.2); ctx.stroke();
    if (m) num(m.g, x, y);
  }
  ctx.font = `700 ${(cw * 0.36).toFixed(1)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < nF; i++) {
    ctx.fillStyle = i === 0 || INLAY.has(base + i) ? '#ffb01f' : '#7d6a3c';
    ctx.fillText(String(base + i), MX(gx + (i + 0.5) * cw), gy + gh + cw * 0.6);
  }
  ctx.restore();
  void dpr;
}