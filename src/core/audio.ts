import { getIntlayer } from 'intlayer';

import { STATE } from './state';
import { ui, idle, busy } from './store';
import { clamp } from './util';
import { LOOP_LEAD } from './const';
import { SYNTH  } from './synth';
import { LOCAL } from './session';

const noticeMessages = getIntlayer('notice');

export const AUDIO = {
  ctx: null as AudioContext | null, buf: null as AudioBuffer | null, src: null as AudioBufferSourceNode | null,
  gain: null as GainNode | null, gainClick: null as GainNode | null, startAt: 0, offset: 0, playing: false,
  mode: 'buf' as 'buf' | 'el', el: null as HTMLAudioElement | null, elUrl: null as string | null, silent: false,
};
export let waitingForGesture = false;
export const setWaiting = (v: boolean) => { waitingForGesture = v; };

export function audioInit() {
  if (AUDIO.ctx) return;
  const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  AUDIO.ctx = new C();
  AUDIO.gain = AUDIO.ctx.createGain(); AUDIO.gainClick = AUDIO.ctx.createGain();
  AUDIO.gain.connect(AUDIO.ctx.destination); AUDIO.gainClick.connect(AUDIO.ctx.destination);
  AUDIO.gain.gain.value = STATE.muted ? 0 : STATE.master;
  AUDIO.gainClick.gain.value = STATE.clickLevel;
  AUDIO.ctx.onstatechange = () => { if (AUDIO.ctx?.state === 'running' && waitingForGesture) { waitingForGesture = false; idle(); } };
}
export function unlockAudio() {
  if (AUDIO.ctx && AUDIO.ctx.state === 'suspended' && STATE.playing) { AUDIO.ctx.resume(); return true; }
  return false;
}
export const slow = () => STATE.rate < 0.999;
export const songTime = () => !AUDIO.playing || !AUDIO.ctx ? AUDIO.offset
  : clamp(AUDIO.mode === 'el' && AUDIO.el ? AUDIO.el.currentTime : AUDIO.ctx.currentTime - AUDIO.startAt + AUDIO.offset, 0, STATE.duration || 1e9);
export function stopSources() {
  if (AUDIO.src) { AUDIO.src.onended = null; try { AUDIO.src.stop(); } catch { /* уже остановлен */ } AUDIO.src = null; }
  AUDIO.el?.pause();
}
const breathe = () => new Promise((r) => setTimeout(r, 0));

async function mixStems(stem: string): Promise<AudioBuffer> {
  const ctx = AUDIO.ctx!;
  if (stem && LOCAL.stems?.has(stem)) return ctx.decodeAudioData(await LOCAL.stems.get(stem)!.arrayBuffer());
  const blobs = [...(LOCAL.stems as Map<string, Blob>).values()];
  const SLICE = 1 << 20, POOL = Math.max(1, Math.min(2, blobs.length));
  let out: AudioBuffer | null = null, done = 0, next = 0, adding: Promise<void> = Promise.resolve();
  busy(`${noticeMessages.mixingStems} 0/${blobs.length}`);
  const add = async (buf: AudioBuffer) => {
    if (!out || buf.length > out.length) {
      const bigger = ctx.createBuffer(2, buf.length, buf.sampleRate);
      if (out) for (let c = 0; c < 2; c++) { bigger.getChannelData(c).set(out.getChannelData(c)); await breathe(); }
      out = bigger;
    }
    const L = out.getChannelData(0), R = out.getChannelData(1);
    const l = buf.getChannelData(0), r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l;
    const n = Math.min(out.length, buf.length);
    for (let k0 = 0; k0 < n; k0 += SLICE) {
      const k1 = Math.min(n, k0 + SLICE);
      for (let k = k0; k < k1; k++) { L[k] += l[k]; R[k] += r[k]; }
      await breathe();
    }
    busy(`${noticeMessages.mixingStems} ${++done}/${blobs.length}`);
  };
  const lane = async () => {
    while (next < blobs.length) {
      const buf = await ctx.decodeAudioData(await blobs[next++].arrayBuffer());
      adding = adding.then(() => add(buf)); await adding;
    }
  };
  await Promise.all(Array.from({ length: POOL }, lane)); await adding;
  return out!;
}

export async function loadAudio(stem: string) {
  audioInit();
  const keep = AUDIO.offset; AUDIO.silent = false;
  if (LOCAL.stems && LOCAL.stems.size) AUDIO.buf = await mixStems(stem);
  else if (LOCAL.payload && !LOCAL.audio) {
    const last = Math.max(STATE.duration || 0, ...STATE.arrs.map((a) => {
      const n = a.notes || [], c = a.chords || [];
      return Math.max(n.length ? n[n.length - 1].t || 0 : 0, c.length ? c[c.length - 1].t || 0 : 0);
    }));
    AUDIO.buf = AUDIO.ctx!.createBuffer(1, Math.ceil((Math.max(10, last) + 3) * 8000), 8000); AUDIO.silent = true;
  } else {
    let raw: ArrayBuffer = await LOCAL.audio!.arrayBuffer();
    AUDIO.buf = await AUDIO.ctx!.decodeAudioData(raw);
  }
  slowForget();
  STATE.duration = Math.max(STATE.duration, AUDIO.buf!.duration);
  AUDIO.offset = keep; AUDIO.playing = false;
  ui.set({ duration: STATE.duration });
}
export function wavBlob(buf: AudioBuffer) {
  const ch = Math.min(2, buf.numberOfChannels), n = buf.length, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVEfmt ');
  out.setUint16(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const d: Float32Array[] = []; for (let c = 0; c < ch; c++) d.push(buf.getChannelData(c));
  const pcm = new Int16Array(out.buffer, 44);
  for (let i = 0, k = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = d[c][i]; pcm[k++] = v < -1 ? -32768 : v > 1 ? 32767 : Math.round(v * 32767); }
  return new Blob([out.buffer], { type: 'audio/wav' });
}
export function slowForget() {
  if (AUDIO.el) { AUDIO.el.pause(); AUDIO.el.removeAttribute('src'); }
  if (AUDIO.elUrl) { URL.revokeObjectURL(AUDIO.elUrl); AUDIO.elUrl = null; }
}
export async function slowReady() {
  if (AUDIO.elUrl || !AUDIO.buf) return;
  busy(noticeMessages.preparingPlayback);
  await new Promise((r) => setTimeout(r, 30));
  AUDIO.elUrl = URL.createObjectURL(wavBlob(AUDIO.buf));
  if (!AUDIO.el) {
    AUDIO.el = new Audio(); AUDIO.el.preservesPitch = true;
    AUDIO.ctx!.createMediaElementSource(AUDIO.el).connect(AUDIO.gain!);
    AUDIO.el.onended = () => { if (AUDIO.playing && AUDIO.mode === 'el') songEnded(); };
  }
  AUDIO.el.src = AUDIO.elUrl;
  await new Promise<void>((res) => { AUDIO.el!.onloadedmetadata = () => res(); AUDIO.el!.onerror = () => res(); });
  idle();
}
export async function setSongSpeed(r: number) {
  r = clamp(r, 0.2, 1);
  if (Math.abs(r - STATE.rate) < 0.001) return;
  const was = AUDIO.playing, t = songTime();
  if (was) stopSources();
  STATE.rate = r; AUDIO.offset = t; ui.set({ songRate: Math.round(r * 100) });
  if (slow()) await slowReady();
  if (was) startAt(t);
}
export function songEnded() {
  if (STATE.loop) { startAt(Math.max(0, STATE.loopA - LOOP_LEAD)); return; }
  AUDIO.playing = false; 
  STATE.playing = false; stopSources(); 
  SYNTH.kill();
  const cam = STATE.camC; seek(0); STATE.camC = cam; ui.set({ playing: false });
}
export function startAt(t: number) {
  audioInit(); if (!AUDIO.buf) return;
  stopSources();
  AUDIO.offset = clamp(t, 0, Math.max(0, STATE.duration - 0.02));
  if (slow() && AUDIO.elUrl && AUDIO.el) {
    AUDIO.mode = 'el'; AUDIO.el.playbackRate = STATE.rate; AUDIO.el.currentTime = AUDIO.offset;
    AUDIO.el.play().catch(() => { /* ждём жеста пользователя */ });
  } else {
    AUDIO.mode = 'buf';
    AUDIO.src = AUDIO.ctx!.createBufferSource(); AUDIO.src.buffer = AUDIO.buf; AUDIO.src.connect(AUDIO.gain!);
    AUDIO.startAt = AUDIO.ctx!.currentTime; AUDIO.src.start(0, AUDIO.offset);
    AUDIO.src.onended = () => { if (AUDIO.playing && AUDIO.mode === 'buf') songEnded(); };
  }
  AUDIO.playing = true; STATE.playing = true; ui.set({ playing: true });
  syncBeats(); 
  SYNTH.kill(); 
  SYNTH.sync();
}
export function play() {
  audioInit();
  if (AUDIO.ctx!.state === 'suspended') AUDIO.ctx!.resume();
  if (AUDIO.playing) return;
  const from = AUDIO.offset >= STATE.duration - 0.05 ? 0 : AUDIO.offset;
  if (slow() && !AUDIO.elUrl) { slowReady().then(() => { if (!AUDIO.playing) startAt(from); }); return; }
  startAt(from);
}
export function pause() {
  if (!AUDIO.playing) return;
  AUDIO.offset = songTime(); AUDIO.playing = false; STATE.playing = false;
  stopSources(); 
  SYNTH.kill();
  ui.set({ playing: false });
}
export function seek(t: number) {
  const was = AUDIO.playing;
  if (Math.abs(t - STATE.time) > 1.5) STATE.camC = null;
  AUDIO.offset = clamp(t, 0, STATE.duration || 0); STATE.time = AUDIO.offset;
  if (was) startAt(AUDIO.offset); else syncBeats();
}
export function togglePlay() {
  if (AUDIO.ctx && AUDIO.ctx.state === 'suspended' && STATE.playing) { AUDIO.ctx.resume(); return; }
  STATE.playing ? pause() : play();
}
export async function fadeOutPlaying() {
  if (!STATE.playing || !AUDIO.ctx) return false;
  const c = AUDIO.ctx, now = c.currentTime;
  for (const g of [AUDIO.gain, AUDIO.gainClick, SYNTH.out]) {
    if (!g) continue;
    g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(0, now + SWITCH_FADE_LOCAL);
  }
  STATE.visDur = SWITCH_FADE_LOCAL; STATE.visTo = 0;
  await new Promise((r) => setTimeout(r, SWITCH_FADE_LOCAL * 1000 + 30));
  pause();
  const t = c.currentTime;
  for (const [g, v] of [[AUDIO.gain, STATE.muted ? 0 : STATE.master], [AUDIO.gainClick, STATE.clickLevel], [SYNTH.out, STATE.synthLevel]] as [GainNode | null, number][]) {
    if (!g) continue; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(v, t);
  }
  STATE.vis = 0; STATE.visDur = 0;
  return true;
}
const SWITCH_FADE_LOCAL = 1;

let beatIdx = 0;
export function syncBeats() {
  const off = STATE.offMs / 1000; beatIdx = 0;
  while (beatIdx < STATE.beats.length && STATE.beats[beatIdx].time + off < STATE.time - 0.05) beatIdx++;
}
export function pump() {
  if (!STATE.clickOn || !AUDIO.ctx || !AUDIO.playing) return;
  const now = STATE.time - STATE.offMs / 1000;
  for (let i = beatIdx; i < STATE.beats.length; i++) {
    const b = STATE.beats[i], dt = b.time - now;
    if (dt > 0.25 * STATE.rate) break;
    if (dt < -0.06) continue;
    click(AUDIO.ctx.currentTime + Math.max(0, dt) / STATE.rate, b.measure >= 0);
    beatIdx = i + 1;
  }
}
function click(when: number, down: boolean) {
  const c = AUDIO.ctx!, o = c.createOscillator(), g = c.createGain();
  o.type = 'square'; o.frequency.value = down ? 1568 : 1046;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(down ? 0.5 : 0.32, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.055);
  o.connect(g); g.connect(AUDIO.gainClick!); o.start(when); o.stop(when + 0.07);
}