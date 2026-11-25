import { CAM_ELEV, CAM_YAW, FOV, FW, PITCH, YLO } from '../core/const';
import { STATE } from '../core/state';
import type { Pt } from './surface';

export interface Cam { px: number; py: number; pz: number; fx: number; fy: number; fz: number; rx: number; ry: number; rz: number; ux: number; uy: number; uz: number; k: number; cx: number; cy: number; ppf: number }
export interface Axes { ex: [number, number]; ey: [number, number] }
export const fretX = (f: number) => f * FW;
export const fretMid = (f: number) => (f - 0.5) * FW;

export function makeCam(W: number, H: number, cFret: number, span: number, nStr: number, zoom: number): Cam {
  const k = H / 2 / Math.tan(FOV / 2);
  let ppf = 0.164 * H * Math.pow(4 / span, 0.72);
  ppf = Math.min(ppf, 0.6 * W / span) * zoom;
  const d = k * FW / ppf, pitch = 10 * Math.PI / 180 * Math.pow(4 / span, 0.45);
  const sy = Math.sin(CAM_YAW), cy = Math.cos(CAM_YAW), sp = Math.sin(pitch), cp = Math.cos(pitch);
  const ce = Math.cos(CAM_ELEV), se = Math.sin(CAM_ELEV);
  return {
    px: fretX(cFret) + d * ce * sy, py: YLO + (nStr - 1) * PITCH / 2 + d * se, pz: d * ce * cy,
    fx: -sy * cp, fy: -sp, fz: -cy * cp, rx: cy, ry: 0, rz: -sy, ux: -sy * sp, uy: cp, uz: -cy * sp,
    k, cx: W / 2, cy: H * 0.48, ppf,
  };
}
export function project(cam: Cam, x: number, y: number, z: number): Pt | null {
  const dx = x - cam.px, dy = y - cam.py, dz = z - cam.pz;
  const zc = dx * cam.fx + dy * cam.fy + dz * cam.fz;
  if (zc < 0.03) return null;
  const s = cam.k / zc;
  return { x: cam.cx + (STATE.lefty ? -1 : 1) * (dx * cam.rx + dy * cam.ry + dz * cam.rz) * s, y: cam.cy - (dx * cam.ux + dy * cam.uy + dz * cam.uz) * s, s };
}
export function neckAxes(cam: Cam, x: number, y: number, z: number): Axes | null {
  const p = project(cam, x, y, z), q = project(cam, x + FW, y, z), u = project(cam, x, y + PITCH, z);
  if (!p || !q || !u) return null;
  const lx = Math.hypot(q.x - p.x, q.y - p.y), ly = Math.hypot(p.x - u.x, p.y - u.y);
  if (lx < 0.5 || ly < 0.5) return null;
  const k = STATE.lefty ? -1 : 1;
  return { ex: [k * (q.x - p.x) / lx, k * (q.y - p.y) / lx], ey: [(p.x - u.x) / ly, (p.y - u.y) / ly] };
}