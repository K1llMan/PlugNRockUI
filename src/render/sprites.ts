import { FONT } from '../core/const';
import { STATE } from '../core/state';
import { clamp } from '../core/util';
import { rgba, shade, tint } from '../core/util';
import { ctx, dpr, onDprChange, rr } from './surface';
import type { Axes } from './camera';
import type { RNote } from '../types';

interface Sprite { c: HTMLCanvasElement; w: number; h: number; cx: number; cy: number; q: number; tw?: number }
const TEXT = new Map<string, Sprite>(), HEAD = new Map<string, Sprite>();
onDprChange(() => { TEXT.clear(); HEAD.clear(); });
function sprCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * dpr)); c.height = Math.max(1, Math.ceil(h * dpr));
  const g = c.getContext('2d')!; g.scale(dpr, dpr); return [c, g];
}
export function textSprite(txt: string, size: number, color: string, glowCol?: string | null): Sprite {
  const q = size <= 14 ? Math.ceil(size) : size <= 30 ? Math.ceil(size / 2) * 2 : Math.ceil(size / 4) * 4;
  const gl = glowCol && STATE.fx ? glowCol : '';
  const key = `${txt}|${q}|${color}|${gl}|${dpr}`;
  let sp = TEXT.get(key); if (sp) return sp;
  if (TEXT.size > 1200) TEXT.clear();
  const font = '700 ' + q + 'px ' + FONT;
  ctx.font = font;
  const tw = ctx.measureText(txt).width, pad = q * (gl ? 0.75 : 0.25) + 3;
  const w = tw + pad * 2, h = q * 1.35 + pad * 2;
  const [c, g] = sprCanvas(w, h);
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  if (gl) { g.shadowColor = gl; g.shadowBlur = q * 0.45 * dpr; }
  g.lineWidth = Math.max(2, q * 0.16); g.strokeStyle = 'rgba(0,0,0,0.78)'; g.strokeText(txt, w / 2, h / 2);
  g.shadowBlur = 0; g.fillStyle = color; g.fillText(txt, w / 2, h / 2);
  sp = { c, w, h, cx: w / 2, cy: h / 2, q, tw }; TEXT.set(key, sp); return sp;
}
export function stamp(sp: Sprite, x: number, y: number, k: number, a: number, ax?: Axes | null, ox = 0, oy = 0) {
  const w = sp.w * k, h = sp.h * k;
  ctx.globalAlpha = a;
  if (ax) {
    ctx.setTransform(dpr * ax.ex[0], dpr * ax.ex[1], dpr * ax.ey[0], dpr * ax.ey[1], dpr * x, dpr * y);
    ctx.drawImage(sp.c, ox - sp.cx * k, oy - sp.cy * k, w, h);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  } else ctx.drawImage(sp.c, x + ox - sp.cx * k, y + oy - sp.cy * k, w, h);
  ctx.globalAlpha = 1;
}
export function label(txt: string, x: number, y: number, size: number, color: string, a: number, glowCol?: string | null, ax?: Axes | null) {
  if (a <= 0.004 || size < 1) return;
  const sp = textSprite(txt, size, color, glowCol);
  stamp(sp, x, y, size / sp.q, a, ax);
}
export const SK = { x: 0, y: 1, on: false };
export function setSkew(pu: { x: number; y: number } | null, pd: { x: number; y: number } | null) {
  SK.on = false; if (!pu || !pd) return 0;
  const dx = pd.x - pu.x, dy = pd.y - pu.y, L = Math.hypot(dx, dy);
  if (L < 0.5) return 0;
  SK.x = dx / L; SK.y = dy / L; SK.on = true; return L;
}
export function headFrame(x: number, y: number, ang: number) {
  const c = Math.cos(ang), s = Math.sin(ang);
  if (SK.on) ctx.transform(c, s, SK.x, SK.y, x, y); else ctx.transform(c, s, -s, c, x, y);
}
const SIZES = [3, 4, 5.5, 7.5, 10, 13, 17, 22, 28, 36, 46, 60, 80, 110];
export function drawHead(x: number, y: number, ang: number, hw: number, hh: number, col: string, n: RNote, a: number, gk: number) {
  if (a <= 0.004) return;
  const c0 = Math.cos(ang), s0 = Math.sin(ang), ex = SK.on ? SK.x : -s0, ey = SK.on ? SK.y : c0;
  const tech = n.pm || n.mt || n.hm || n.hp || n.ho || n.po || n.tp || n.ac || n.bn > 0;
  if (hw < 2.4 && !tech) {
    ctx.globalAlpha = a; ctx.fillStyle = col;
    ctx.setTransform(dpr * c0, dpr * s0, dpr * ex, dpr * ey, dpr * x, dpr * y);
    ctx.fillRect(-hw, -Math.max(0.8, hh), hw * 2, Math.max(1.6, hh * 2));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; return;
  }
  const marks = STATE.showLabels;
  let q = SIZES[SIZES.length - 1];
  for (const v of SIZES) if (v >= hw) { q = v; break; }
  const bend = n.bn > 0 ? (n.bn < 1.5 ? 1 : n.bn < 2.5 ? 2 : 3) : 0;
  const gl = Math.round(clamp(gk, 0, 1) * 4);
  const key = [col, q, +n.tp, +n.ac, +n.pm, +n.mt, +n.hm, +n.hp, +n.ho, +n.po, bend, +marks, gl, dpr].join('|');
  let sp = HEAD.get(key);
  if (!sp) {
    if (HEAD.size > 900) HEAD.clear();
    const qh = q * hh / hw, mx = q * 0.55 + 3, top = qh * (1.6 + bend * 0.8) + 4, bot = qh * 0.9 + 4;
    const w = (q + mx) * 2, h = qh * 2 + top + bot;
    const [c, g] = sprCanvas(w, h);
    g.translate(q + mx, qh + top); headShape(g, q, qh, col, n, marks, gl / 4);
    sp = { c, w, h, cx: q + mx, cy: qh + top, q }; HEAD.set(key, sp);
  }
  const k = hw / sp.q;
  ctx.globalAlpha = a;
  ctx.setTransform(dpr * c0, dpr * s0, dpr * ex, dpr * ey, dpr * x, dpr * y);
  ctx.drawImage(sp.c, -sp.cx * k, -sp.cy * k, sp.w * k, sp.h * k);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
}
function headShape(g: CanvasRenderingContext2D, hw: number, hh: number, col: string, n: RNote, marks: boolean, gk: number) {
  g.lineJoin = 'round'; g.lineCap = 'round';
  const lw = Math.max(1.2, hh * 0.3), fhm = n.mt, isPM = n.pm && !fhm, harm = n.hm || n.hp;
  if (n.tp) {
    const t = hh * 1.35;
    g.beginPath(); g.moveTo(-hw, -t); g.lineTo(-hw * 0.42, -t); g.lineTo(0, t * 0.05);
    g.lineTo(hw * 0.42, -t); g.lineTo(hw, -t); g.lineTo(0, t); g.closePath();
    g.fillStyle = shade(col, 0.78); g.fill(); g.strokeStyle = tint(col, 0.5); g.lineWidth = lw * 0.8; g.stroke();
  } else {
    if (n.ac) {
      rr(-hw - lw * 1.5, -hh - lw * 1.5, hw * 2 + lw * 3, hh * 2 + lw * 3, hh * 0.6, g);
      g.strokeStyle = rgba(col, 0.25 + 0.3 * gk); g.lineWidth = lw * 1.5; g.stroke();
    }
    rr(-hw, -hh, hw * 2, hh * 2, hh * 0.32, g);
    g.fillStyle = isPM || fhm ? shade(col, 0.22) : n.hp ? shade(col, 0.95) : shade(col, 0.8); g.fill();
    if (isPM) {
      g.save(); g.clip();
      g.strokeStyle = col; g.lineWidth = Math.max(1.4, hh * 0.55); g.lineCap = 'butt';
      g.beginPath(); g.moveTo(-hw, -hh); g.lineTo(hw, hh); g.moveTo(hw, -hh); g.lineTo(-hw, hh); g.stroke(); g.restore();
      rr(-hw, -hh, hw * 2, hh * 2, hh * 0.32, g);
    }
    g.strokeStyle = n.ac ? tint(col, 0.3 + 0.4 * gk) : tint(col, 0.06 + 0.26 * gk); g.lineWidth = lw; g.stroke();
    if (!isPM && !fhm && !harm && !n.ho && !n.po && hw > 6) {
      rr(-hw + lw * 1.25, -hh + lw * 1.15, hw * 2 - lw * 2.5, hh * 2 - lw * 2.3, hh * 0.15, g);
      g.strokeStyle = `rgba(255,255,255,${(0.1 + 0.32 * gk).toFixed(2)})`; g.lineWidth = Math.max(1, lw * 0.42); g.stroke();
    }
  }
  if (!marks) return;
  const u = hh * 0.72;
  if (fhm) {
    g.strokeStyle = '#fff'; g.lineWidth = Math.max(1.3, hh * 0.34); g.beginPath();
    g.moveTo(-u * 1.25, -u); g.lineTo(u * 1.25, u); g.moveTo(u * 1.25, -u); g.lineTo(-u * 1.25, u); g.stroke();
  } else if (harm) {
    const c2 = n.hp ? 'rgba(40,22,0,0.85)' : '#fff';
    g.strokeStyle = c2; g.fillStyle = c2; g.lineWidth = Math.max(1.1, hh * 0.26);
    g.beginPath(); g.ellipse(0, 0, u * 1.15, u * 0.86, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, Math.max(0.8, u * 0.3), 0, Math.PI * 2); g.fill();
  } else if ((n.ho || n.po) && !n.tp) {
    const dir = n.po ? -1 : 1;
    g.fillStyle = '#fff'; g.beginPath();
    g.moveTo(-u * 1.05, -u * 0.85 * dir); g.lineTo(u * 1.05, -u * 0.85 * dir); g.lineTo(0, u * 0.95 * dir); g.closePath(); g.fill();
  }
  if (n.bn > 0) {
    const cnt = n.bn < 1.5 ? 1 : n.bn < 2.5 ? 2 : 3;
    g.strokeStyle = tint(col, 0.35); g.lineWidth = Math.max(1.2, hh * 0.3); g.beginPath();
    for (let i = 0; i < cnt; i++) {
      const yy = -hh - lw - hh * 0.55 - i * hh * 0.75;
      g.moveTo(-hw * 0.5, yy + hh * 0.45); g.lineTo(0, yy - hh * 0.15); g.lineTo(hw * 0.5, yy + hh * 0.45);
    }
    g.stroke();
  }
}