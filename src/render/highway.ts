import { CAM_EASE, FING_MOVE, FING_Z, FW, GREY_NOTE, INLAY, LANE, LOOK, LOOK_BACK, NECK_END, PITCH, YLO, ZFAR } from '../core/const';
import { G, STATE, chartTime } from '../core/state';
import { clamp, lerp, lowerBound, rgba, sstep, sustained, tint } from '../core/util';
import { ctx, dpr, W, H, glow, quad, rr, seg } from './surface';
import { fretMid, fretX, makeCam, neckAxes, project } from './camera';
import { drawHead, headFrame, label, setSkew } from './sprites';
import { BARS, barSeek, bendY, drawChordBox, drawChordDiagram, drawHitLight, drawPhraseBars, drawPill, drawTail, fingerPills, nameY, noteX, numFadeIn, vibY } from './parts';
import { anchorIdx } from '../core/chart';
import type { ChordEv, RNote } from '../types';

export { barSeek };

export function draw(dt: number) {
  const t = chartTime();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (!STATE.all.length && !STATE.resting) {
    ctx.fillStyle = '#4d5a68'; ctx.font = "13px 'Segoe UI',system-ui,sans-serif"; ctx.textAlign = 'center';
    ctx.fillText('this arrangement has no notes to draw', W / 2, H / 2); ctx.textAlign = 'left'; return;
  }
  const nStr = STATE.nStr;
  const yOf = (s: number) => { const k = clamp(s, 0, nStr - 1); return YLO + (STATE.invert ? k : nStr - 1 - k) * PITCH; };
  const yTop = YLO + (nStr - 1) * PITCH, yBot = YLO;
  const HOR = G.hor, tEnd = t + HOR, zOf = (tau: number) => -(tau - t) * G.sc;
  const fog = (tau: number) => clamp((tEnd - tau) / (HOR * 0.3), 0, 1) * STATE.vis;

  const A = STATE.anchors, ai = anchorIdx(t), curA = A[ai];
  let lo: number, hi: number;
  if (STATE.autoPan) {
    lo = curA.fret - 1; hi = curA.fret + curA.width - 1;
    for (let i = anchorIdx(t - LOOK_BACK); i < A.length && A[i].t < t + LOOK; i++) { lo = Math.min(lo, A[i].fret - 1); hi = Math.max(hi, A[i].fret + A[i].width - 1); }
  } else { lo = Math.max(0, STATE.fMin - 1); hi = Math.max(lo + 4, STATE.fMax); }
  const wantC = (lo + hi) / 2, wantS = Math.max(4, hi - lo);
  if (STATE.camC === null) { STATE.camC = wantC; STATE.camS = wantS; STATE.camCv = STATE.camSv = 0; }
  else {
    const w = CAM_EASE * STATE.camRate;
    STATE.camCv += ((wantC - STATE.camC) * w * w - 2 * w * STATE.camCv) * dt; STATE.camC += STATE.camCv * dt;
    STATE.camSv += ((wantS - STATE.camS) * w * w - 2 * w * STATE.camSv) * dt; STATE.camS = Math.max(4, STATE.camS + STATE.camSv * dt);
  }
  const cam = makeCam(W, H, STATE.camC, STATE.camS, nStr, STATE.zoom);
  const P = (x: number, y: number, z: number) => project(cam, x, y, z);
  const zx0 = fretX(curA.fret - 1), zx1 = fretX(Math.min(24, curA.fret + curA.width - 1));
  const v = P((zx0 + zx1) / 2, 0, -ZFAR);
  if (v) glow('#0a3a6a', v.x, v.y + H * 0.05, W * 0.3, H * 0.2, 0.55);

  ctx.lineWidth = 1;
  for (let f = 0; f <= 24; f++) {
    const a = P(fretX(f), 0, 0), b = P(fretX(f), 0, -ZFAR);
    if (!a || !b || Math.max(a.x, b.x) < -60 || Math.min(a.x, b.x) > W + 60) continue;
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    g.addColorStop(0, 'rgba(0,176,170,0.46)'); g.addColorStop(0.65, 'rgba(0,150,160,0.20)'); g.addColorStop(1, 'rgba(0,150,160,0)');
    ctx.strokeStyle = g; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  {
    const cuts: { t: number; k: number }[] = [{ t, k: 0 }];
    for (let i = lowerBound(STATE.beats, 'time', t + 0.0005); i < STATE.beats.length && STATE.beats[i].time < tEnd; i++)
      cuts.push({ t: STATE.beats[i].time, k: STATE.beats[i].measure >= 0 ? 2 : 1 });
    for (let i = ai + 1; i < A.length && A[i].t < tEnd; i++) cuts.push({ t: A[i].t, k: 0 });
    cuts.sort((p, q) => p.t - q.t);
    type Run = { an: (typeof A)[number]; f0: number; f1: number; zNear: number; zFar: number; al?: number };
    let run: Run | null = null;
    const fillRun = (r: Run) => {
      const al = r.al === undefined ? 1 : r.al;
      const c1 = `rgba(7,30,60,${(0.92 * al).toFixed(3)})`, c2 = `rgba(26,92,168,${(0.3 * al).toFixed(3)})`;
      for (let f = r.f0; f <= r.f1; f++) {
        const xa = fretX(f - 1), xb = fretX(f);
        quad(P(xa, 0, r.zNear), P(xb, 0, r.zNear), P(xb, 0, r.zFar), P(xa, 0, r.zFar), c1);
        if (STATE.fx) quad(P(xa + FW * 0.2, 0, r.zNear), P(xb - FW * 0.2, 0, r.zNear), P(xb - FW * 0.2, 0, r.zFar), P(xa + FW * 0.2, 0, r.zFar), c2);
      }
    };
    const lines: { i: number; f0: number; f1: number; z0: number; z1: number; al: number }[] = [];
    for (let i = cuts.length - 1; i >= 0; i--) {
      const ta = cuts[i].t, tb = i + 1 < cuts.length ? cuts[i + 1].t : tEnd;
      if (tb - ta < 0.002) continue;
      const an = A[anchorIdx((ta + tb) / 2)], f0 = an.fret, f1 = Math.min(24, an.fret + an.width - 1);
      const z0 = zOf(ta), z1 = zOf(tb) - 0.004, al = fog((ta + tb) / 2);
      if (al <= 0.01) continue;
      if (al < 0.999 || !run || run.an !== an) {
        if (run) fillRun(run);
        run = al >= 0.999 ? { an, f0, f1, zNear: z0, zFar: z1 } : null;
        if (!run) fillRun({ an, f0, f1, zNear: z0, zFar: z1, al });
      } else run.zNear = z0;
      lines.push({ i, f0, f1, z0, z1, al });
    }
    if (run) fillRun(run);
    for (const L of lines) {
      const near = P(fretX(L.f0 - 1), 0, L.z0), sc = near ? near.s * FW : 20;
      ctx.lineCap = 'butt';
      ctx.strokeStyle = `rgba(0,196,232,${(0.85 * L.al).toFixed(3)})`; ctx.lineWidth = clamp(sc * 0.022, 0.8, 2.2);
      ctx.beginPath(); for (let f = L.f0; f < L.f1; f++) seg(P(fretX(f), 0, L.z0), P(fretX(f), 0, L.z1)); ctx.stroke();
      ctx.strokeStyle = `rgba(70,236,255,${L.al.toFixed(3)})`; ctx.lineWidth = clamp(sc * 0.045, 1.1, 4.2);
      ctx.beginPath(); seg(P(fretX(L.f0 - 1), 0, L.z0), P(fretX(L.f0 - 1), 0, L.z1)); seg(P(fretX(L.f1), 0, L.z0), P(fretX(L.f1), 0, L.z1)); ctx.stroke();
      if (STATE.showCells && cuts[L.i].k) {
        ctx.strokeStyle = cuts[L.i].k === 2 ? `rgba(150,214,244,${(0.62 * L.al).toFixed(3)})` : `rgba(84,150,196,${(0.34 * L.al).toFixed(3)})`;
        ctx.lineWidth = cuts[L.i].k === 2 ? clamp(sc * 0.03, 1, 3) : 1;
        ctx.beginPath(); seg(P(fretX(L.f0 - 1), 0, L.z0), P(fretX(L.f1), 0, L.z0)); ctx.stroke();
      }
    }
  }
  for (let i = Math.max(0, lowerBound(STATE.hands, 't', t - 30)); i < STATE.hands.length; i++) {
    const h = STATE.hands[i];
    if (h.t > tEnd) break;
    if (h.t1 < t) continue;
    const ta = Math.max(h.t, t), tb = Math.min(h.t1, tEnd);
    if (tb - ta < 0.02) continue;
    const an = A[anchorIdx(h.t + 0.002)], z0 = zOf(ta), z1 = zOf(tb), wd = FW * 0.085;
    const al = (fog(ta) + fog(tb)) / 2, col = h.arp ? 'rgba(190,170,255,' : 'rgba(70,240,255,';
    for (const x of [fretX(an.fret - 1), fretX(Math.min(24, an.fret + an.width - 1))])
      quad(P(x - wd, 0, z0), P(x + wd, 0, z0), P(x + wd, 0, z1), P(x - wd, 0, z1), col + (0.92 * al).toFixed(3) + ')');
  }
  if (STATE.showNums) for (let i = ai + 1; i < A.length && A[i].t < tEnd; i++) {
    const an = A[i]; if (!an.row) continue;
    const z = zOf(an.t) + FW * 0.3, al = fog(an.t) * clamp((an.t - t - 0.25) / 0.5, 0, 1);
    if (al <= 0.02) continue;
    for (let f = Math.max(1, an.fret - 3); f <= Math.min(24, an.fret + an.width + 4); f++) {
      const inZone = f >= an.fret && f < an.fret + an.width;
      if (!inZone && !INLAY.has(f)) continue;
      const p = P(fretMid(f), 0, z); if (!p) continue;
      const fs = p.s * FW * 0.46, nIn = numFadeIn(fs);
      if (nIn <= 0) continue;
      label(String(f), p.x, p.y, fs, inZone ? '#a9dcec' : '#1f8f88', (inZone ? 0.85 : 0.75) * al * nIn, null, neckAxes(cam, fretMid(f), 0, z));
    }
  }

  const off0 = STATE.offMs / 1000;
  const lpA = STATE.loop && STATE.loopB ? STATE.loopA - off0 - 0.005 : -Infinity;
  const lpB = STATE.loop && STATE.loopB ? STATE.loopB - off0 - 0.005 : Infinity;
  const outside = (tt: number) => tt < lpA || tt >= lpB;
  const items: { d: number; n: RNote | null; ev: ChordEv | null }[] = [];
  const act = new Array(nStr).fill(0);
  for (let i = lowerBound(STATE.all, 't', t - STATE.maxSus - 0.3); i < STATE.all.length; i++) {
    const n = STATE.all[i];
    if (n.t > tEnd) break;
    if (n.hide) continue;
    const d = n.t - t;
    if (d < -0.25 && n.t + n.sus < t) continue;
    items.push({ d, n, ev: null });
    const s = clamp(n.s, 0, nStr - 1);
    const lit = d >= 0 ? clamp(1 - d / 1.6, 0, 1) : n.t + n.sus > t ? 1 : clamp(1 + d / 0.25, 0, 1);
    if (lit * STATE.vis > act[s]) act[s] = lit * STATE.vis;
  }
  for (let i = lowerBound(STATE.chords, 't', t - 0.16); i < STATE.chords.length; i++) {
    const ev = STATE.chords[i];
    if (ev.t > tEnd) break;
    items.push({ d: ev.t - t + 1e-6, n: null, ev });
  }
  items.sort((p, q) => q.d - p.d);

  const zf0 = curA.fret - 1, zf1 = Math.min(24, curA.fret + curA.width - 1);
  const pNear = P(fretX(STATE.camC), yBot, 0), ppf = pNear ? pNear.s * FW : cam.ppf;
  for (let f = 1; f <= 24; f++) {
    if (!INLAY.has(f)) continue;
    const inZone = f > zf0 && f <= zf1;
    const ys = f % 12 === 0 ? [lerp(yBot, yTop, 0.25), lerp(yBot, yTop, 0.75)] : [(yBot + yTop) / 2];
    for (const yy of ys) {
      const p = P(fretMid(f), yy, 0);
      if (!p || p.x < -40 || p.x > W + 40) continue;
      const r = p.s * FW * 0.105;
      ctx.globalAlpha = inZone ? 0.95 : 0.8; ctx.fillStyle = inZone ? '#b08a22' : '#0c5f58';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.16); ctx.strokeStyle = inZone ? '#e2bd4a' : '#17877c'; ctx.stroke();
    }
  }
  ctx.globalAlpha = 1; ctx.lineCap = 'round';
  for (let f = 0; f <= 24; f++) {
    const a = P(fretX(f), yBot - PITCH * 0.55, 0), b = P(fretX(f), yTop + PITCH * 0.55, 0);
    if (!a || !b || a.x < -30 || a.x > W + 30) continue;
    const inZone = f >= zf0 && f <= zf1, lw = clamp(a.s * FW * (f === 0 ? 0.09 : 0.045), 1.2, f === 0 ? 12 : 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = lw + 2;
    ctx.beginPath(); ctx.moveTo(a.x + 1.5, a.y); ctx.lineTo(b.x + 1.5, b.y); ctx.stroke();
    const g = ctx.createLinearGradient(a.x - lw, 0, a.x + lw, 0);
    if (f === 0) { g.addColorStop(0, '#8d8676'); g.addColorStop(0.5, '#e9e2cf'); g.addColorStop(1, '#7d7666'); }
    else if (inZone) { g.addColorStop(0, '#7a4a1c'); g.addColorStop(0.45, '#e6a35a'); g.addColorStop(1, '#6a3f18'); }
    else { g.addColorStop(0, '#241a12'); g.addColorStop(0.45, '#5b4530'); g.addColorStop(1, '#1e160f'); }
    ctx.strokeStyle = g; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.lineCap = 'butt';
  if (STATE.capo > 0 && STATE.capo <= 24) {
    const a = P(fretMid(STATE.capo) + FW * 0.2, yBot - PITCH * 0.7, 0), b = P(fretMid(STATE.capo) + FW * 0.2, yTop + PITCH * 0.7, 0);
    if (a && b) {
      ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(210,214,222,0.92)'; ctx.lineWidth = clamp(a.s * FW * 0.16, 3, 16);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.lineCap = 'butt';
      label('CAPO', b.x, b.y - ppf * 0.22, clamp(ppf * 0.16, 9, 16), '#d2d6de', 0.9, null);
    }
  }
  const sxR = Math.max(NECK_END + 3 * FW, cam.px + 40 * FW);
  const struck: (null | { still?: boolean; n?: RNote; age?: number; held?: boolean })[] = new Array(nStr).fill(null);
  for (let i = lowerBound(STATE.all, 't', t + 1e-6) - 1; i >= 0; i--) {
    const n = STATE.all[i], age = t - n.t;
    if (age > Math.max(1, STATE.maxSus + 0.1)) break;
    const si = clamp(n.s, 0, nStr - 1);
    if (struck[si]) continue;
    const held = sustained(n) && age < n.sus;
    struck[si] = n.mt || (age > 1 && !held) ? { still: true } : { n, age, held };
  }
  for (let s = 0; s < nStr; s++) {
    const y = yOf(s), col = LANE[s] || '#9aa7b2', k = act[s];
    const lw = clamp(ppf * (0.03 - s * 0.0028), 1, 5.5);
    const raw = struck[s], hit = raw && !raw.still ? (raw as { n: RNote; age: number; held: boolean }) : null;
    let pts: { x: number; y: number }[];
    let ghost: [{ x: number; y: number }[], { x: number; y: number }[]] | null = null;
    const swing = !hit || STATE.vis < 0.05 ? 0
      : PITCH * (hit.n.pm ? 0.09 : 0.17) * (hit.n.ac ? 1.25 : 1) * Math.exp(-hit.age / (hit.n.pm ? 0.06 : hit.held ? Math.max(0.6, hit.n.sus * 0.7) : 0.3)) * STATE.vis;
    const u = hit && hit.held ? (t - hit.n.t) / hit.n.sus : 0;
    const push = hit && hit.held ? bendY(hit.n, u) + vibY(hit.n, t) : 0;
    if (swing < PITCH * 0.006 && Math.abs(push) < PITCH * 0.01) {
      const a = P(fretX(-2.2), y, 0), b = P(sxR, y, 0);
      if (!a || !b) continue;
      pts = [a, b];
    } else {
      const n = hit!.n, xp = n.f > 0 ? noteX(n, hit!.held ? u : 0, 0) : fretX(0);
      const ph = Math.sin(hit!.age * Math.PI * 2 * (19 + s * 2.3));
      const shape = (x: number) => x <= xp ? 0 : 1 - Math.exp(-(x - xp) / (FW * 1.5));
      const rest = (x: number) => x <= 0 ? 0 : x <= xp ? push * (x / Math.max(xp, 1e-6)) : push * (1 - (x - xp) / (sxR - xp));
      const xs = [fretX(-2.2), 0];
      if (xp > 0.0001) xs.push(xp);
      for (let q = 1; q <= 14; q++) { const x = xp + q * FW * 0.5; if (x < sxR) xs.push(x); }
      xs.push(sxR);
      pts = []; const up: { x: number; y: number }[] = [], dn: typeof up = [];
      for (const x of xs) {
        const w = shape(x) * swing, r0 = rest(x), c = P(x, y + r0 + w * ph, 0);
        if (!c) continue;
        pts.push(c);
        if (swing >= PITCH * 0.02) { const e1 = P(x, y + r0 + w, 0), e2 = P(x, y + r0 - w, 0); if (e1 && e2) { up.push(e1); dn.push(e2); } }
      }
      if (pts.length < 2) continue;
      if (up.length > 1) ghost = [up, dn];
    }
    const trace = (L: { x: number; y: number }[]) => { ctx.beginPath(); ctx.moveTo(L[0].x, L[0].y); for (let i = 1; i < L.length; i++) ctx.lineTo(L[i].x, L[i].y); };
    if (k > 0.02 && STATE.fx) {
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(col, 0.36 * k); ctx.lineWidth = lw * 3.8;
      trace(pts); ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
    }
    if (ghost) {
      ctx.strokeStyle = rgba(col, 0.3); ctx.lineWidth = Math.max(1, lw * 0.7); ctx.lineJoin = 'round';
      trace(ghost[0]); ctx.stroke(); trace(ghost[1]); ctx.stroke();
    }
    ctx.strokeStyle = k > 0.02 ? tint(col, 0.25 * k) : col;
    ctx.globalAlpha = 0.5 + 0.5 * k; ctx.lineWidth = lw * (1 + 0.35 * k); ctx.lineJoin = 'round';
    trace(pts); ctx.stroke(); ctx.globalAlpha = 1;
  }
  {
    const ym = (yTop + yBot) / 2, g0 = P(fretX(-0.15), ym, 0), g1 = P(fretX(-0.95), ym, 0);
    const q = [P(fretX(-0.15), yBot - PITCH, 0), P(fretX(-8), yBot - PITCH, 0), P(fretX(-8), yTop + PITCH, 0), P(fretX(-0.15), yTop + PITCH, 0)];
    if (g0 && g1 && q.every(Boolean)) {
      const g = ctx.createLinearGradient(g0.x, g0.y, g1.x, g1.y);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000');
      ctx.fillStyle = g; ctx.beginPath();
      q.forEach((c, i) => (i ? ctx.lineTo(c!.x, c!.y) : ctx.moveTo(c!.x, c!.y)));
      ctx.closePath(); ctx.fill();
      const nm = STATE.tuneNames;
      for (let s = 0; s < nStr; s++) {
        const c = P(fretX(-1.2), yOf(s), 0), col = LANE[s] || '#9aa7b2';
        if (c && nm[s] && c.x > -20 && c.x < W + 20) label(nm[s], c.x, c.y, clamp(ppf * 0.17, 10, 20), col, 0.9 * STATE.vis, col);
      }
    }
  }
  for (const it of items) {
    if (it.ev) {
      const ev = it.ev, d = ev.t - t, an = A[anchorIdx(ev.t + 0.002)];
      const x0 = fretX(an.fret - 1), x1 = fretX(Math.min(24, an.fret + an.width - 1));
      const a = d < 0 ? clamp(1 + d / 0.15, 0, 1) : fog(ev.t);
      if (a <= 0.01) continue;
      let top = YLO + PITCH * 1.25;
      if (!ev.rep) { let hiY = -Infinity; for (const cn of ev.notes) hiY = Math.max(hiY, yOf(cn.s)); top = hiY + PITCH * 0.95; }
      ev.landed = d < 0;
      drawChordBox(cam, ev, x0, x1, top, d < 0 ? 0 : zOf(ev.t), a, clamp(1 - d / 1.2, 0, 1));
      continue;
    }
    const n = it.n!, d = it.d, s = clamp(n.s, 0, nStr - 1), grey = outside(n.t);
    const col = grey ? GREY_NOTE : LANE[s] || '#9aa7b2', y = yOf(s);
    const an = A[anchorIdx(n.t + 0.002)], ax0 = fretX(an.fret - 1), ax1 = fretX(Math.min(24, an.fret + an.width - 1));
    const zoneMid = (ax0 + ax1) / 2, open = n.f <= 0;
    if (sustained(n)) drawTail(cam, n, t, y, col, zoneMid, open ? (ax1 - ax0) * 0.5 : FW * 0.13, fog);
    if (n.linked || d < 0) continue;
    const z = zOf(n.t), al = fog(n.t);
    if (al <= 0.01) continue;
    const inChord = n.ch !== undefined;
    if (open) {
      const hh = PITCH * 0.16;
      const a = P(ax0, y - hh, z), b = P(ax1, y - hh, z), c = P(ax1, y + hh, z), e = P(ax0, y + hh, z);
      if (!a || !b || !c || !e) continue;
      if (!inChord) {
        ctx.strokeStyle = rgba(col, 0.7 * al); ctx.lineWidth = clamp(a.s * FW * 0.03, 1, 3);
        ctx.beginPath(); seg(P(ax0, 0, z), P(ax0, y, z)); seg(P(ax1, 0, z), P(ax1, y, z)); ctx.stroke();
      }
      ctx.globalAlpha = al;
      quad(a, b, c, e, n.pm || n.mt ? rgba(col, 0.45) : col);
      ctx.strokeStyle = tint(col, 0.5); ctx.lineWidth = clamp(a.s * FW * 0.018, 0.8, 2);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(e.x, e.y); ctx.closePath(); ctx.stroke();
      ctx.globalAlpha = 1;
      if (d < 0.9) glow(col, (a.x + b.x) / 2, (a.y + e.y) / 2, Math.abs(b.x - a.x) * 0.6, Math.max(6, a.s * PITCH * 1.2), 0.3 * (1 - d / 0.9) * al);
      continue;
    }
    const xc = fretMid(n.f), pl = P(xc - FW * 0.3, y, z), pr = P(xc + FW * 0.3, y, z);
    if (!pl || !pr) continue;
    const cx = (pl.x + pr.x) / 2, cy2 = (pl.y + pr.y) / 2;
    if (cx < -80 || cx > W + 80) continue;
    const hw = Math.hypot(pr.x - pl.x, pr.y - pl.y) / 2, hh = hw * (PITCH * 0.41) / (FW * 0.3);
    if (!inChord) {
      quad(P(xc - FW * 0.46, 0, z + FW * 0.22), P(xc + FW * 0.46, 0, z + FW * 0.22), P(xc + FW * 0.46, 0, z - FW * 0.22), P(xc - FW * 0.46, 0, z - FW * 0.22), `rgba(122,176,196,${(0.42 * al).toFixed(3)})`);
      const base = P(xc, 0, z);
      if (base) {
        ctx.strokeStyle = rgba(col, 0.85 * al); ctx.lineWidth = clamp(hw * 0.11, 1, 4);
        ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(cx, cy2 + hh); ctx.stroke();
      }
    }
    setSkew(P(xc, y + PITCH * 0.4, z), P(xc, y - PITCH * 0.4, z));
    const gk = sstep(1 - d / 1.4);
    if (gk > 0.01 && !grey) glow(col, cx, cy2, hw * 2.3, hh * 3.6, 0.4 * gk * gk * al, true);
    drawHead(cx, cy2, Math.atan2(pr.y - pl.y, pr.x - pl.x), hw, hh, col, n, al, grey ? 0 : gk);
    if (STATE.showNums && n.lab) {
      const p = P(xc, 0, z + FW * (inChord ? 0.62 : 0.6));
      if (p) {
        const fs = p.s * FW * 0.5, na = al * clamp((d * G.sc - 0.12) / 0.8, 0, 1), nIn = numFadeIn(fs);
        if (nIn > 0 && na * nIn > 0.02)
          label(String(n.f), p.x, p.y, fs, grey ? '#aab2ba' : '#ffab1f', na * nIn,
            !grey && d < 1.2 && na > 0.5 ? 'rgba(255,150,0,0.8)' : null, neckAxes(cam, xc, 0, z + FW * (inChord ? 0.62 : 0.6)));
      }
    }
  }
  for (const it of items) {
    const n = it.n;
    if (!n || n.f <= 0) continue;
    const d = it.d, held = d < 0 && n.t + n.sus > t && sustained(n);
    if (!held && (d > 0.75 || d < -0.22)) continue;
    if (n.linked && !held) continue;
    const s = clamp(n.s, 0, nStr - 1), col = outside(n.t) ? GREY_NOTE : LANE[s], y = yOf(s);
    const u = held ? (t - n.t) / n.sus : 0;
    const xc = noteX(n, u, 0), yy = y + (held ? bendY(n, u) + vibY(n, t) : 0);
    const pl = P(xc - FW * 0.34, yy, 0), pr = P(xc + FW * 0.34, yy, 0);
    if (!pl || !pr) continue;
    const cx = (pl.x + pr.x) / 2, cy2 = (pl.y + pr.y) / 2;
    const lane = setSkew(P(xc, yy + PITCH * 0.4, 0), P(xc, yy - PITCH * 0.4, 0));
    let hw = Math.hypot(pl.x - pr.x, pl.y - pl.y) / 2, hh = lane > 0 ? lane / 2 : hw * (PITCH * 0.4) / (FW * 0.34);
    let a: number;
    if (held) { a = 1; glow(col, cx, cy2, hw * 2.6, hh * 4.2, 0.55); }
    else if (d >= 0) a = 0.25 + 0.75 * (1 - d / 0.75);
    else { const k = -d / 0.22; a = 1 - k; hw *= 1 + 0.3 * k; hh *= 1 + 0.22 * k; glow(col, cx, cy2, hw * 2.8, hh * 4.6, 0.75 * (1 - k)); }
    ctx.save(); headFrame(cx, cy2, Math.atan2(pr.y - pl.y, pr.x - pl.x));
    ctx.globalAlpha = a * STATE.vis; ctx.lineJoin = 'round';
    rr(-hw, -hh, hw * 2, hh * 2, hh * 0.3);
    if (held || d < 0) { ctx.fillStyle = rgba(col, held ? 0.45 : 0.35); ctx.fill(); }
    ctx.strokeStyle = held || d < 0.12 ? tint(col, 0.55) : col; ctx.lineWidth = Math.max(1.5, hh * 0.34); ctx.stroke();
    ctx.restore(); ctx.globalAlpha = 1;
  }
  if (STATE.showFingers && STATE.holds.length) for (const m of fingerPills(t, yOf)) {
    const kk = sstep(m.k) * STATE.vis, z = (1 - kk) * FING_Z;
    const pa = P(m.x, m.ya, z), pb = P(m.x, m.yb, z), pt = P(m.x, m.yt, z);
    if (pa && pb && pt && pa.x > -40 && pa.x < W + 40) drawPill(pa, pb, pt, pt.s * FW * 0.15, m.g, kk, neckAxes(cam, m.x, m.yt, z));
  }
  if (STATE.showChord && STATE.holds.length) {
    const k = lowerBound(STATE.holds, 't', t + 1e-6) - 1, h = STATE.holds[k], nx = STATE.holds[k + 1];
    if (h && h.name && t <= h.t1 + 0.3) {
      let a = clamp((h.t1 + 0.3 - t) / 0.3, 0, 1);
      if (nx && nx.name) a = Math.min(a, clamp((nx.t - 0.22 - t) / 0.2, 0, 1));
      const an = A[anchorIdx(h.t + 0.002)], p = P(fretX(an.fret - 1), nameY(), 0);
      if (p) { const { chordName } = await0(); chordName(h.name, p, p.s, a * STATE.vis, neckAxes(cam, fretX(an.fret - 1), nameY(), 0)); }
    }
  }
  let za = zf0, zb = zf1;
  const nx = A[ai + 1];
  if (nx) {
    const n0 = nx.fret - 1, n1 = Math.min(24, nx.fret + nx.width - 1);
    if (n0 !== zf0 || n1 !== zf1) {
      const D = Math.min(FING_MOVE, Math.max(nx.t - curA.t, 0.12)), u = clamp((t - (nx.t - D)) / D, 0, 1);
      za = lerp(zf0, n0, u); zb = lerp(zf1, n1, u);
    }
  }
  for (let f = 1; f <= 24; f++) {
    const g = clamp(Math.min(f, zb) - Math.max(f - 1, za), 0, 1);
    if (g <= 0.001 && !INLAY.has(f)) continue;
    const p = P(fretMid(f), 0, FW * 0.4);
    if (!p || p.x < -30 || p.x > W + 30) continue;
    const fs = p.s * FW * 0.4;
    if (fs < 6) continue;
    const ax = neckAxes(cam, fretMid(f), 0, FW * 0.4);
    if (g < 0.999 && INLAY.has(f)) label(String(f), p.x, p.y, fs * 0.92, '#1c8f86', 0.85 * (1 - g), null, ax);
    if (g > 0.001) label(String(f), p.x, p.y, fs * (0.92 + 0.08 * g), '#ffb01f', g, 'rgba(255,140,0,0.75)', ax);
  }
  drawPhraseBars(t, STATE.offMs / 1000);
  if (STATE.showHit) drawHitLight(t);
  if (STATE.showDiagram && STATE.holds.length) drawChordDiagram(t, cam, curA);
  void BARS;
}
function await0() { return { chordName: chordNameRef }; }
import { chordName as chordNameRef } from './parts';