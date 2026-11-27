import type { Arrangement, SongPayload } from '../types';
import { STATE } from './state';
import { ui, busy, idle, notice, showHint, lockInput } from './store';
import { AUDIO, loadAudio, pause, play, seek, setWaiting, slowForget } from './audio';
import { buildPhrases, loadSongData, resetLyricTold, selectArrangement, resetHud, applyOffset } from './chart';
import { SEL } from './loop';
import { REST_HEAD_START } from './const';
import { resize } from '../render/surface';
import { startFrames } from './frame';
import { SYNTH } from './synth';
import { loadPrefs, setServerFlag } from './prefs';
import { openLocal, startWorker } from './files';
import { loadStatics } from './files';

export const LOCAL: { payload: SongPayload | null; cover: string; audio: Blob | null; stems: Map<string, Blob> | null; serverPack: boolean } =
  { payload: null, cover: '', audio: null, stems: null, serverPack: false };
export const SERVER = { on: false };
let firstSong = true, probe: Promise<boolean> | null = null;

async function probeServer() {
  // Никаких серверов!
  return false;

  try {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch('/api/status', { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return false;
    JSON.parse(await r.text()); return true;
  } catch { return false; }
}
export function serverAvailable() {
  if (!probe) probe = (async () => {
    const ok = (await probeServer()) || (await new Promise((r) => setTimeout(r, 250), 0), await probeServer());
    SERVER.on = ok; setServerFlag(ok); ui.set({ server: ok }); return ok;
  })();
  return probe;
}
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
interface Status { stage?: string; message?: string; error?: string; open_error?: string; source?: { name: string }; generation?: boolean }
export async function waitForPack(): Promise<Status> {
  for (;;) {
    let st: Status;
    try { st = await (await fetch('/api/status')).json(); }
    catch { st = { stage: 'starting', message: 'Waiting for the Play Song server…' }; }
    if (st.stage === 'ready' || st.stage === 'empty') return st;
    if (st.stage === 'standby') fetch('/api/load', { method: 'POST' }).catch(() => { /* сервер сам откроет */ });
    if (st.stage === 'error') throw new Error(st.error || 'the pack could not be opened');
    busy(st.message || 'Processing…');
    await new Promise((r) => setTimeout(r, 400));
  }
}
export async function showSong(noPlay?: boolean) {
  showHint(false);
  ui.set({ serverPack: SERVER.on && LOCAL.serverPack });
  busy('Reading the chart…');
  const d: SongPayload = LOCAL.payload || await (await fetch('/api/song')).json();
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
  if (SERVER.on) {
    const m = d.meta || ({} as SongPayload['meta']);
    fetch('/api/now', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: m.title || '', artist: m.artist || '', pack: m.pack || '' }) }).catch(() => { /* сервер не слушает */ });
  }
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
  busy('Decoding the audio…');
  try { 
    await loadAudio(''); 
    buildPhrases(); 
    ui.set({ duration: STATE.duration, tabRev: ui.get().tabRev + 1 }); 
  }
  catch (err) {
    console.warn('audio unavailable:', err);
    notice('The audio could not be decoded - the highway still plays, silently.');
    setTimeout(idle, 6000); return;
  }
  idle();
  SYNTH.setAll(d.arrangements.map((v: Arrangement) => ({ a: v })));
  SYNTH.solo(null); 

  if (AUDIO.silent) { 
    notice('No audio came with this chart - it plays silently. Drop the chart together with the song\'s audio to hear it.'); 
    setTimeout(idle, 7000); 
  }
  if (noPlay || q.has('paused')) 
    return;
  play();
  if (AUDIO.ctx && AUDIO.ctx.state === 'suspended') {
    setWaiting(true);
    notice('Ready - click anywhere or press Space to start' + (AUDIO.silent ? ' (no audio came with this chart: it plays silently)' : ''));
  }
}
export async function changeStem(id: string) {
  const keep = STATE.time, was = STATE.playing;
  pause(); busy('Decoding the audio…');
  try { await loadAudio(id); } finally { idle(); }
  seek(Math.min(keep, STATE.duration - 0.05));
  ui.set({ stemId: id });
  if (was) play();
}
export async function saveOffset() {
  const ms = STATE.offMs;
  if (!ms) { 
    ui.set({ offMsg: 'offset is 0 - nothing to save.' }); 
    return; 
  }
  ui.set({ offMsg: `saving ${ms > 0 ? '+' : ''}${ms} ms into the pack…` });
  try {
    const r = await fetch('/api/note-offset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ms }) });
    const d = await r.json();
    if (!r.ok || d.error) { ui.set({ offMsg: 'save failed: ' + (d.error || r.status) }); return; }
    const fresh: SongPayload = await (await fetch('/api/song')).json();
    if (LOCAL.payload) LOCAL.payload = fresh;
    loadSongData(fresh); STATE.offMs = 0; ui.set({ offMs: 0 });
    selectArrangement(STATE.arrIdx); slowForget();
    ui.set({ tabRev: ui.get().tabRev + 1, offMsg: `saved ${ms > 0 ? '+' : ''}${ms} ms (${d.moved} times moved${d.clamped ? ', ' + d.clamped + ' clamped at 0' : ''})` });
  } catch (err) { ui.set({ offMsg: 'save failed: ' + (err as Error).message }); }
}

export async function boot() {
  lockInput(true);
  try {
    busy('Starting…');
    await loadPrefs();
    restChart(); 
    resize(); 
    startFrames();
    await serverAvailable();

    if (!SERVER.on) {
      startWorker().then((w) => { 
        if (!w) return loadStatics(); 
      }).catch(() => { /* откроем в странице */ });
      idle(); 
      ui.set({ title: 'Play Song', artist: 'no song open' }); 
      showHint(true); 
      return;
    }

    // Никаких серверов!
    fetch('/api/limits').then((r) => r.json()).then((L) => ui.set({
      hintNote: `The file is sent to this server to be converted (up to ${L.max_upload_mb} MB), and deleted after ${L.idle_minutes} minutes without use. Nothing is changed in your file.`,
    })).catch(() => { /* лимиты не обязательны */ });
    let st0: Status | null = null;
    try { st0 = await (await fetch('/api/status', { cache: 'no-store' })).json(); } catch { /* нет статуса */ }
    const src = st0?.source;
    if (src && /\.(feedpak|sloppak)$/i.test(src.name)) {
      try {
        busy('Reading ' + src.name + '…'); ui.set({ title: src.name, artist: 'opening…' });
        const res = await fetch('/api/source');
        if (!res.ok) throw new Error('the server did not send the file (' + res.status + ')');
        const song = await openLocal(new File([await res.blob()], src.name), busy);
        LOCAL.payload = song.payload; LOCAL.cover = song.cover; LOCAL.audio = song.audio; LOCAL.stems = song.stems; LOCAL.serverPack = true;
        await showSong(); return;
      } catch (e) {
        console.warn('the server opens it:', e);
        LOCAL.payload = null; LOCAL.audio = null; LOCAL.stems = null; LOCAL.cover = '';
        await fetch('/api/load', { method: 'POST' }).catch(() => { /* сервер сам */ });
      }
    }
    LOCAL.serverPack = !!(st0 && !st0.generation);
    const st = await waitForPack();
    if (st.stage === 'empty') { 
      idle(); 
      ui.set({ title: 'Play Song', artist: 'no song open' }); 
      showHint(true); 
      return; 
    }
    await showSong();
  } catch (err) {
    ui.set({ msg: 'Could not start: ' + (err as Error).message, msgKind: 'plain' });
    console.error(err);
  } finally { lockInput(false); }
}