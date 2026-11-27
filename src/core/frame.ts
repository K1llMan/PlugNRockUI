import { STATE, FLAGS, chartTime } from './state';
import { emitFrame, ui } from './store';
import { songTime, seek, pump } from './audio';
import { SYNTH } from './synth';
import { sectionAt, updateHud } from './chart';
import { LOOP_LEAD } from './const';
import { draw } from '../render/highway';
import { resize } from '../render/surface';

const AR = { peak: 0, low: 0, high: 0, ceil: 1, ceilUntil: 0, upAt: 0 };
const STEPS = [1, 0.85, 0.72, 0.6, 0.5];

export const resetAutoResolution = () => { 
  AR.ceil = 1; 
  STATE.dynScale = 1; 
};

function autoResolution(span: number) {
  if (!STATE.autoScale || !STATE.playing || document.hidden || STATE.fps < 4) { AR.low = AR.high = 0; return; }
  const now = performance.now();
  AR.peak = Math.max(AR.peak * 0.999, Math.min(STATE.fps, 240));
  if (AR.peak < 20) return;
  AR.low = STATE.fps < AR.peak * 0.8 ? AR.low + span : 0;
  AR.high = STATE.fps > AR.peak * 0.95 ? AR.high + span : 0;
  const i = STEPS.findIndex((v) => v <= STATE.dynScale + 0.001);
  if (AR.low >= 1 && i < STEPS.length - 1) {
    if (now - AR.upAt < 4000) { AR.ceil = STEPS[i + 1]; AR.ceilUntil = now + 30000; }
    STATE.dynScale = STEPS[i + 1]; AR.low = AR.high = 0; resize();
  } else if (AR.high >= 4 && i > 0) {
    if (now > AR.ceilUntil) AR.ceil = 1;
    if (STEPS[i - 1] <= AR.ceil + 0.001) { 
      STATE.dynScale = STEPS[i - 1]; 
      AR.low = AR.high = 0; 
      AR.upAt = now; 
      resize(); 
    }
  }
}
let running = false, last = performance.now(), acc = 0, n = 0, fpsT = 0, skip = 0;

export function startFrames() { 
  if (running) 
    return; 

  running = true; 
  last = performance.now(); 
  requestAnimationFrame(frame); 
}

function frame(now: number) {
  if (FLAGS.opening && !STATE.playing && ++skip & 1) { 
    requestAnimationFrame(frame); 
    return; 
  }

  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  STATE.time = songTime();
  if (STATE.vis !== STATE.visTo) {
    const step = dt / (STATE.visDur || 0.42);
    STATE.vis = STATE.visTo > STATE.vis ? Math.min(STATE.visTo, STATE.vis + step) : Math.max(STATE.visTo, STATE.vis - step);
  }
  if (STATE.loop && STATE.playing && STATE.duration) {
    if (!STATE.loopSel && (!STATE.loopB || STATE.time < STATE.loopA - LOOP_LEAD - 0.3 || STATE.time > STATE.loopB + 0.3)) {
      const s = sectionAt(STATE.time); if (s) { STATE.loopA = s.start; STATE.loopB = s.end; }
    }
    if (STATE.loopB && STATE.time >= STATE.loopB - 0.02) 
      seek(Math.max(0, STATE.loopA - LOOP_LEAD));
  }

  if (!STATE.tabView) 
    draw(dt);

  emitFrame(STATE.time);
  updateHud(STATE.time, chartTime());
  pump(); 
  SYNTH.pump();

  acc += dt; 
  n++;

  if (now - fpsT > 250) {
    STATE.fps = n / Math.max(0.001, acc);
    autoResolution((now - fpsT) / 1000);
    ui.set({ fps: Math.round(STATE.fps), dynScale: STATE.dynScale });
    acc = 0; n = 0; fpsT = now;
  }

  requestAnimationFrame(frame);
}