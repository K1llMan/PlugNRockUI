import { useSyncExternalStore } from 'react';
import type { Section } from '../types';

export interface UiState {
  title: string; artist: string; album: string; cover: string; hasArt: boolean; hasSong: boolean;
  tuning: { name: string; notes: string; capo: string } | null;
  arrs: { name: string }[]; arrIdx: number; stems: { id: string }[]; stemId: string;
  sections: Section[]; toneChanges: { t: number }[]; duration: number; bpm: number; fps: number; dynScale: number;
  playing: boolean; loop: boolean; loopSel: boolean; muted: boolean; clickOn: boolean; synthOn: boolean;
  master: number; clickLevel: number; synthLevel: number; songRate: number; noteSpeed: number; camRate: number; zoom: number;
  showCells: boolean; showNums: boolean; showLabels: boolean; showLyrics: boolean; autoPan: boolean; showFingers: boolean;
  invert: boolean; lefty: boolean; showChord: boolean; showDiagram: boolean; showHit: boolean; fx: boolean;
  autoScale: boolean; rscale: number; offMs: number; offMsg: string; tabView: boolean; tabRev: number; cfgOpen: boolean;
  msg: string; msgKind: 'busy' | 'plain' | 'hide'; hint: boolean; locked: boolean; dropActive: boolean;
  server: boolean; serverPack: boolean; lyricError: string; secIdx: number; secName: string;
  tone: { label: string; raw: string; flash: boolean; first: boolean } | null;
}
const initial: UiState = {
  title: 'Play Song', artist: 'no song open', album: '', cover: '', hasArt: false, hasSong: false, tuning: null,
  arrs: [], arrIdx: 0, stems: [], stemId: '', sections: [], toneChanges: [], duration: 0, bpm: 0, fps: 0, dynScale: 1,
  playing: false, loop: false, loopSel: false, muted: false, clickOn: false, synthOn: false,
  master: 100, clickLevel: 40, synthLevel: 60, songRate: 100, noteSpeed: 200, camRate: 50, zoom: 1,
  showCells: true, showNums: true, showLabels: true, showLyrics: true, autoPan: true, showFingers: true,
  invert: false, lefty: false, showChord: true, showDiagram: true, showHit: true, fx: true, autoScale: false, rscale: 1,
  offMs: 0, offMsg: 'Positive offset = chart later than the audio.', tabView: false, tabRev: 0, cfgOpen: false,
  msg: 'Starting…', msgKind: 'busy', hint: false,
  locked: false, dropActive: false, server: false, serverPack: false, lyricError: '', secIdx: -1, secName: '', tone: null,
};
let state = initial;
const subs = new Set<() => void>();
export const ui = {
  get: () => state,
  set(p: Partial<UiState>) {
    let ch = false;
    for (const k in p)
      if (!Object.is(state[k as keyof UiState], p[k as keyof UiState])) {
        ch = true;
        break;
      }
    if (!ch)
      return;
    state = { ...state, ...p }; 
    subs.forEach((f) => f());
  },
  sub(f: () => void) { 
    subs.add(f); 
    return () => { 
      subs.delete(f); 
    }; 
  },
};
export function useUi<T>(sel: (s: UiState) => T): T {
  return useSyncExternalStore(ui.sub, () => sel(state), () => sel(state));
}
const fsubs = new Set<(t: number) => void>();
export const onFrame = (f: (t: number) => void) => { fsubs.add(f); return () => { fsubs.delete(f); }; };
export const emitFrame = (t: number) => { fsubs.forEach((f) => f(t)); };

export const busy = (msg: string) => ui.set({ msg, msgKind: 'busy' });
export const notice = (msg: string) => ui.set({ msg, msgKind: 'plain' });
export const idle = () => ui.set({ msgKind: 'hide' });
export const showHint = (hint: boolean) => ui.set({ hint });
let lock = 0;
export const inputLocked = () => lock > 0;
export function lockInput(on: boolean) {
  lock = Math.max(0, lock + (on ? 1 : -1));
  ui.set({ locked: lock > 0 });
  if (lock > 0) { const el = document.activeElement as HTMLElement | null; if (el && el !== document.body) el.blur?.(); }
}