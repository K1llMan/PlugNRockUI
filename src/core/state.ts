import type { Arrangement, Beat, ChordEv, Hold, LyricBlock, LyricLine, PhraseBar, RAnchor, RHand, RNote, Section, SongMeta, SynEvent } from '../types';
import { SCROLL_BASE, ZFAR } from './const';
import { ui } from './store';

export interface EngineState {
  meta: Partial<SongMeta>; arrs: Arrangement[]; arrIdx: number; beats: Beat[]; sections: Section[]; stems: { id: string; file: string }[];
  all: RNote[]; chords: ChordEv[]; anchors: RAnchor[]; hands: RHand[]; phrases: PhraseBar[]; phReal: boolean;
  capo: number; nStr: number; maxSus: number; fMin: number; fMax: number; duration: number; time: number;
  playing: boolean; loop: boolean; muted: boolean; offMs: number; master: number; clickLevel: number; clickOn: boolean; rate: number;
  vis: number; visTo: number; visDur: number; resting: boolean; synthOn: boolean; synthLevel: number; syn: SynEvent[];
  speed: number; zoom: number; showCells: boolean; showNums: boolean; showLabels: boolean; autoPan: boolean; showFingers: boolean;
  invert: boolean; lefty: boolean; tabView: boolean; showChord: boolean; showDiagram: boolean; showHit: boolean; camRate: number;
  holds: Hold[]; hits: number[]; lyrics: LyricLine[]; lyrPairs: LyricBlock[]; showLyrics: boolean;
  camC: number | null; camS: number; camCv: number; camSv: number; keepCam: boolean; fx: boolean; rscale: number;
  autoScale: boolean; dynScale: number; tones: { base: string; changes: { t: number; name: string }[]; names: Record<string, { raw: string; real: string }> };
  fps: number; bpm: number; loopA: number; loopB: number; loopSel: boolean; tuneNames: string[];
  [k: string]: unknown;
}

export const STATE: EngineState = {
  meta: {}, arrs: [], arrIdx: 0, beats: [], sections: [], stems: [], all: [], chords: [], anchors: [], hands: [],
  phrases: [], phReal: false, capo: 0, nStr: 6, maxSus: 0, fMin: 1, fMax: 12, duration: 0, time: 0,
  playing: false, loop: false, muted: false, offMs: 0, master: 1, clickLevel: 0.4, clickOn: false, rate: 1,
  vis: 1, visTo: 1, visDur: 0, resting: false, synthOn: false, synthLevel: 0.6, syn: [],
  speed: 2, zoom: 1, showCells: true, showNums: true, showLabels: true, autoPan: true, showFingers: true,
  invert: false, lefty: false, tabView: false, showChord: true, showDiagram: true, showHit: true, camRate: 0.5,
  holds: [], hits: [], lyrics: [], lyrPairs: [], showLyrics: true,
  camC: null, camS: 4, camCv: 0, camSv: 0, keepCam: false, fx: true, rscale: 1, autoScale: false, dynScale: 1,
  tones: { base: '', changes: [], names: {} }, fps: 0, bpm: 0, loopA: 0, loopB: 0, loopSel: false, tuneNames: [],
};
export const G = { sc: SCROLL_BASE, hor: ZFAR / SCROLL_BASE };
export function updGeom() { G.sc = SCROLL_BASE * STATE.speed; G.hor = ZFAR / G.sc; ui.set({ noteSpeed: Math.round(STATE.speed * 100) }); }
export const chartTime = () => STATE.time - STATE.offMs / 1000;
export const currentArr = () => STATE.arrs[STATE.arrIdx] || null;
export const FLAGS = { opening: false };