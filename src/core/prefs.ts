import { STATE, updGeom } from './state';
import { ui } from './store';
import { clamp } from './util';
import { AUDIO } from './audio';
import { SYNTH } from './synth';
import { syncBeats } from './audio';
import { resize } from '../render/surface';

export const PREFS: Record<string, [number, number] | 0> = {
  speed: [0.6, 2], zoom: [0.55, 3], camRate: [0.3, 2.5], master: [0, 1], clickLevel: [0, 1], synthLevel: [0, 1],
  rscale: [0.2, 1], autoScale: 0, showCells: 0, showNums: 0, showLabels: 0, showLyrics: 0, autoPan: 0,
  showFingers: 0, invert: 0, lefty: 0, tabView: 0, showChord: 0, showDiagram: 0, showHit: 0, clickOn: 0, synthOn: 0, muted: 0, fx: 0,
};
export type PrefKey = keyof typeof PREFS;

let timer = 0;
export function savePrefs() {
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    const o: Record<string, unknown> = {};
    for (const k in PREFS) o[k] = STATE[k];
    try { localStorage.setItem('playsong.prefs', JSON.stringify(o)); } catch { /* приватный режим */ }
  }, 350);
}
export async function loadPrefs() {
  try {
    let p: Record<string, unknown> | null = null;

    if (!p) 
      p = JSON.parse(localStorage.getItem('playsong.prefs') || '{}') || {};
    for (const k in PREFS) {
      const v = p![k], cur = STATE[k];
      if (typeof v !== typeof cur) continue;
      const r = PREFS[k];
      STATE[k] = r ? clamp(v as number, r[0], r[1]) : v;
    }
  } catch { /* значения по умолчанию */ }
  pushPrefs();
}
export function pushPrefs() {
  ui.set({
    noteSpeed: Math.round(STATE.speed * 100), camRate: Math.round(STATE.camRate * 100), zoom: STATE.zoom,
    master: Math.round(STATE.master * 100), clickLevel: Math.round(STATE.clickLevel * 100), synthLevel: Math.round(STATE.synthLevel * 100),
    muted: STATE.muted, clickOn: STATE.clickOn, synthOn: STATE.synthOn, showCells: STATE.showCells, showNums: STATE.showNums,
    showLabels: STATE.showLabels, showLyrics: STATE.showLyrics, autoPan: STATE.autoPan, showFingers: STATE.showFingers,
    invert: STATE.invert, lefty: STATE.lefty, showChord: STATE.showChord, showDiagram: STATE.showDiagram, showHit: STATE.showHit,
    fx: STATE.fx, autoScale: STATE.autoScale, rscale: STATE.rscale, tabView: STATE.tabView,
  });
  updGeom(); resize();
}
export function setPref(key: PrefKey, value: number | boolean) {
  STATE[key] = value;
  switch (key) {
    case 'master': if (!STATE.muted && AUDIO.gain) AUDIO.gain.gain.value = STATE.master; break;
    case 'muted': if (AUDIO.gain) AUDIO.gain.gain.value = STATE.muted ? 0 : STATE.master; break;
    case 'clickLevel': if (AUDIO.gainClick) AUDIO.gainClick.gain.value = STATE.clickLevel; break;
    case 'synthLevel': if (SYNTH.out) SYNTH.out.gain.value = STATE.synthLevel; break;
    case 'clickOn': if (STATE.clickOn) syncBeats(); break;
    case 'synthOn': STATE.synthOn ? SYNTH.sync() : SYNTH.kill(); break;
    case 'rscale': resize(); break;
    case 'autoScale': STATE.dynScale = 1; resize(); break;
    case 'speed': updGeom(); break;
    case 'tabView': if (!value) resize(); break;
    default: break;
  }

  pushPrefs(); 
  savePrefs();
}