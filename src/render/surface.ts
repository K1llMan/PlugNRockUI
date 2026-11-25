import { STATE } from '../core/state';

export let canvas: HTMLCanvasElement | null = null;
export let ctx: CanvasRenderingContext2D = null as unknown as CanvasRenderingContext2D;
export let W = 1, H = 1, dpr = 1;
const subs: (() => void)[] = [];
export const onDprChange = (f: () => void) => { subs.push(f); };
export function attachCanvas(el: HTMLCanvasElement) {
  canvas = el; 
  ctx = el.getContext('2d', { alpha: false }) as CanvasRenderingContext2D; 
  resize();
}
export function resize() {
  if (!canvas) 
    return;
  const r = canvas.getBoundingClientRect();
  const nd = (window.devicePixelRatio || 1) * STATE.rscale * (STATE.autoScale ? STATE.dynScale : 1);
  W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
  if (nd !== dpr) { 
    dpr = nd; 
    subs.forEach((f) => f()); 
  }
  
  const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
  if (canvas.width !== cw || canvas.height !== ch) { 
    canvas.width = cw; 
    canvas.height = ch; 
  }
}

const glows = new Map<string, HTMLCanvasElement>();
function glowSprite(color: string) {
  let c = glows.get(color); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, color); rg.addColorStop(0.35, color + '88'); rg.addColorStop(1, color + '00');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64); glows.set(color, c); return c;
}

export function glow(color: string, x: number, y: number, rw: number, rh: number, a: number, plain?: boolean) {
  if (!STATE.fx || a <= 0.004 || rw < 1 || rh < 1) return;
  ctx.globalCompositeOperation = plain ? 'source-over' : 'lighter';
  ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(glowSprite(color), 0, 0, 64, 64, x - rw, y - rh, rw * 2, rh * 2);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

export interface Pt { x: number; y: number; s: number }
export function quad(a: Pt | null, b: Pt | null, c: Pt | null, d: Pt | null, fill: string | CanvasGradient) {
  if (!a || !b || !c || !d) return;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
export const seg = (a: Pt | null, b: Pt | null) => { if (a && b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } };
export function rr(x: number, y: number, w: number, h: number, r: number, c?: CanvasRenderingContext2D) {
  const g = c || ctx; r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y);
  g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}