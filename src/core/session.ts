import { getIntlayer } from 'intlayer';

import type { Arrangement, SongPayload } from '../types';
import { STATE } from './state';
import { ui, busy, idle, notice, showHint, lockInput } from './store';
import { AUDIO, loadAudio, pause, play, seek, setWaiting } from './audio';
import { buildPhrases, loadSongData, resetLyricTold, selectArrangement, resetHud, applyOffset } from './chart';
import { SEL } from './loop';
import { REST_HEAD_START } from './const';
import { resize } from '../render/surface';
import { startFrames } from './frame';
import { SYNTH } from './synth';
import { loadPrefs } from './prefs';
import { startWorker } from './files';
import { loadStatics } from './files';

export const LOCAL: { payload: SongPayload | null; cover: string; audio: Blob | null; stems: Map<string, Blob> | null; serverPack: boolean } =
  { payload: null, cover: '', audio: null, stems: null, serverPack: false };
let firstSong = true;

const noticeMessages = getIntlayer('notice');

export function fadeTo(v: number) {
  STATE.visTo = v;
  return new Promise<void>((res) => {
    const t0 = performance.now();
    const chk = () => { if (Math.abs(STATE.vis - v) < 0.01 || performance.now() - t0 > 900) { STATE.vis = v; res(); } else setTimeout(chk, 40); };
    chk();
  });
}
export const cameraAtRest = () => new Promise<void>((r) => setTimeout(r, REST_HEAD_START * 1000));
export function restChart() {
  STATE.all = []; STATE.chords = []; STATE.hands = []; STATE.holds = []; STATE.hits = []; STATE.syn = []; STATE.phrases = [];
  STATE.lyrics = []; STATE.lyrPairs = []; STATE.beats = []; STATE.sections = [];
  STATE.tones = { base: '', changes: [], names: {} };
  STATE.anchors = [{ t: 0, fret: 6, width: 4, row: false }];
  STATE.maxSus = 0; STATE.capo = 0; STATE.resting = true; STATE.time = 0; AUDIO.offset = 0;
  SEL.i0 = SEL.i1 = -1; SEL.drag = null;
  STATE.loop = false; STATE.loopSel = false; STATE.loopB = 0;
  resetHud();
  ui.set({ loop: false, loopSel: false, arrs: [], arrIdx: 0, tuning: null, stems: [], stemId: '', sections: [], toneChanges: [], tone: null, secIdx: -1, secName: '', hasSong: false, hasArt: false, cover: '', tabRev: ui.get().tabRev + 1 });
}

export async function showSong(noPlay?: boolean) {
  showHint(false);
  ui.set({ serverPack: false });
  busy(noticeMessages.readingChart);
  const d: SongPayload = LOCAL.payload!;
  if ((d as unknown as { error?: string }).error) throw new Error((d as unknown as { error: string }).error);
  if (AUDIO.playing) pause();
  AUDIO.buf = null; AUDIO.offset = 0; AUDIO.playing = false;
  STATE.time = 0; STATE.playing = false; STATE.offMs = 0; STATE.bpm = 0; STATE.loopB = 0; STATE.loop = false; STATE.loopSel = false;
  SYNTH.kill();
  resetLyricTold(); 
  resetHud();
  ui.set({ playing: false, loop: false, loopSel: false, offMs: 0, lyricError: '' });
  loadSongData(d);
  STATE.duration = +(d.meta && d.meta.duration) || 0;

  if (STATE.beats.length > 3) {
    const gaps: number[] = [];
    for (let i = 1; i < STATE.beats.length; i++) { const g = STATE.beats[i].time - STATE.beats[i - 1].time; if (g > 0.08 && g < 2) gaps.push(g); }
    gaps.sort((a, b) => a - b);
    if (gaps.length) STATE.bpm = 60 / gaps[gaps.length >> 1];
  }
  const coverSrc = LOCAL.payload ? LOCAL.cover : '/api/art?' + Date.now();
  ui.set({
    title: STATE.meta.title || '—', artist: STATE.meta.artist || '—',
    album: [STATE.meta.album, STATE.meta.year].filter(Boolean).join(' · ') || '',
    cover: STATE.meta.cover ? coverSrc : '', hasArt: !!STATE.meta.cover && !!coverSrc,
    hasSong: true, bpm: STATE.bpm, duration: STATE.duration, stemId: '',
  });
  STATE.keepCam = STATE.camC !== null; STATE.resting = false; STATE.vis = 0; STATE.visTo = 1;
  selectArrangement(0); STATE.keepCam = false;
  const q = new URLSearchParams(firstSong ? location.search : ''); firstSong = false;
  if (q.has('arr')) selectArrangement(Math.min(parseInt(q.get('arr')!, 10) || 0, Math.max(0, STATE.arrs.length - 1)));
  if (q.has('t')) seek(Math.min(parseFloat(q.get('t')!) || 0, Math.max(0, STATE.duration - 0.1)));
  if (q.has('cfg')) ui.set({ cfgOpen: true });
  if (q.has('off')) applyOffset(Math.max(-60000, Math.min(60000, Math.round(parseFloat(q.get('off')!) || 0))));
  const cum = +(STATE.meta.note_offset_ms || 0);
  ui.set({ offMsg: cum ? `this pack has already been shifted ${cum > 0 ? '+' : ''}${cum} ms in total` : 'Positive offset = chart later than the audio.' });
  resize(); 
  startFrames();
  busy(noticeMessages.decodingAudio);
  try { 
    await loadAudio(''); 
    buildPhrases(); 
    ui.set({ duration: STATE.duration, tabRev: ui.get().tabRev + 1 }); 
  }
  catch (err) {
    console.warn('audio unavailable:', err);
    notice(noticeMessages.cantDecodeAudio);
    setTimeout(idle, 6000); return;
  }
  idle();
  SYNTH.setAll(d.arrangements.map((v: Arrangement) => ({ a: v })));
  SYNTH.solo(null); 

  if (AUDIO.silent) { 
    notice(noticeMessages.noAudio); 
    setTimeout(idle, 7000); 
  }
  if (noPlay || q.has('paused')) 
    return;
  play();
  if (AUDIO.ctx && AUDIO.ctx.state === 'suspended') {
    setWaiting(true);
    notice(noticeMessages.ready);
  }
}
export async function changeStem(id: string) {
  const keep = STATE.time, was = STATE.playing;
  pause(); 
  busy(noticeMessages.decodingAudio);
  try { await loadAudio(id); } finally { idle(); }
  seek(Math.min(keep, STATE.duration - 0.05));
  ui.set({ stemId: id });
  if (was) play();
}
export async function saveOffset() {
  const ms = STATE.offMs;
  if (!ms) { 
    ui.set({ offMsg: 'offset is 0 - nothing to save.' }); 
  }
}

export async function boot() {
  lockInput(true);
  try {
    busy(noticeMessages.starting);
    await loadPrefs();
    restChart(); 
    resize(); 
    startFrames();

    startWorker().then((w) => { 
      if (!w) return loadStatics(); 
    }).catch(() => { /* откроем в странице */ });
    idle(); 
    ui.set({ title: 'Play Song', artist: 'no song open' }); 
    showHint(true); 
  } catch (err) {
    ui.set({ msg: 'Could not start: ' + (err as Error).message, msgKind: 'plain' });
    console.error(err);
  } 
  finally { 
    lockInput(false); 
  }
}