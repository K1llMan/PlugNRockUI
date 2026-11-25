import { STATE } from './state';
import { ui } from './store';
import { HOLD_MS, LOOP_LEAD } from './const';
import { clamp } from './util';
import { play, seek } from './audio';
import { sectionAt } from './chart';

export const SEL = { i0: -1, i1: -1, drag: null as null | { a: number; b: number; t0: number; moved: boolean; x: number } };
export function selRange(): [number, number] | null {
  const d = SEL.drag;
  if (d && (d.moved || performance.now() - d.t0 >= HOLD_MS)) return [Math.min(d.a, d.b), Math.max(d.a, d.b)];
  return SEL.i0 >= 0 && SEL.i1 < STATE.phrases.length ? [SEL.i0, SEL.i1] : null;
}
export function loopStartAt(audioT: number) { seek(Math.max(0, audioT - LOOP_LEAD)); if (!STATE.playing) play(); }
export function setLoopBars(i0: number, i1: number) {
  const ph = STATE.phrases, off = STATE.offMs / 1000;
  if (!ph[i0] || !ph[i1]) return;
  SEL.i0 = i0; SEL.i1 = i1;
  STATE.loop = true; STATE.loopSel = true;
  STATE.loopA = Math.max(0, ph[i0].t0 + off); STATE.loopB = ph[i1].t1 + off;
  ui.set({ loop: true, loopSel: true });
  loopStartAt(STATE.loopA);
}
export function clearLoopBars() {
  if (SEL.i0 < 0 && !STATE.loopSel) return;
  SEL.i0 = SEL.i1 = -1;
  if (STATE.loopSel) { STATE.loop = false; STATE.loopSel = false; STATE.loopB = 0; ui.set({ loop: false, loopSel: false }); }
}
export function toggleSectionLoop() {
  if (STATE.loopSel) { clearLoopBars(); return; }
  STATE.loop = !STATE.loop; ui.set({ loop: STATE.loop });
  const s = sectionAt(STATE.time);
  if (STATE.loop && s) { STATE.loopA = s.start; STATE.loopB = s.end; } else STATE.loopB = 0;
}
export const barDragStart = (i: number, x: number) => { SEL.drag = { a: i, b: i, t0: performance.now(), moved: false, x }; };
export const barDragMove = (i: number) => { const d = SEL.drag; if (d && i !== d.b) { d.b = i; d.moved = true; } };
export function barDragEnd(cancelled: boolean, seekTo: (x: number) => number) {
  const d = SEL.drag; if (!d) return;
  SEL.drag = null; if (cancelled) return;
  const held = d.moved || performance.now() - d.t0 >= HOLD_MS;
  const ph = STATE.phrases, off = STATE.offMs / 1000;
  if (held) setLoopBars(Math.min(d.a, d.b), Math.max(d.a, d.b));
  else if (SEL.i0 >= 0) loopStartAt(ph[clamp(d.a, SEL.i0, SEL.i1)].t0 + off);
  else seek(seekTo(d.x));
}