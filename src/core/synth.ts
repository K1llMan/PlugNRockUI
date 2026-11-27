import { AUDIO, songTime } from './audio';
import { STATE } from './state';
import { clamp, lowerBound, mkNote, sustained } from './util';
import { HARMONIC, OPEN_BASS, OPEN_GTR } from './const';
import type { Arrangement, RNote, SynEvent, WireNote } from '../types';

/* ------------------------------- типы ------------------------------- */

export interface SynthVoice {
  g: GainNode;
  osc: AudioScheduledSourceNode;
  lfo?: OscillatorNode;
  end: number;
}

/** аккорд, подготовленный к синтезу (как элемент STATE.chords) */
export interface SynthChord { t: number; notes: RNote[] }

export interface TrackOpts {
  id?: string;
  level?: number;        // относительная громкость партии (0..2)
  muted?: boolean;
  capo?: number;         // по умолчанию STATE.capo
  transpose?: number;    // полутоны
  notes?: RNote[];       // уже подготовленные ноты (например STATE.all)
  chords?: SynthChord[]; // уже подготовленные аккорды (например STATE.chords)
}

const AHEAD = 0.25;      // окно упреждения, сек (масштабируется STATE.rate)
const LATE = -0.06;      // позже этого — событие пропускаем
const STRUM = 0.007;     // разнос нот аккорда
const MAX_VOICES = 48;   // лимит голосов на партию
const KILL_TAU = 0.012;

/* --------------------- общая шина (одна на контекст) --------------------- */

class Bus {
  readonly out: GainNode;
  readonly wave: PeriodicWave;
  readonly noise: AudioBuffer;
  private readonly comp: DynamicsCompressorNode;

  constructor(c: AudioContext, level: number) {
    this.out = c.createGain();
    this.out.gain.value = level;

    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.12;

    this.out.connect(this.comp);
    this.comp.connect(c.destination);

    const N = 28, re = new Float32Array(N), im = new Float32Array(N);
    for (let h = 1; h < N; h++) im[h] = Math.sin(h * Math.PI * 0.19) / Math.pow(h, 1.25);
    this.wave = c.createPeriodicWave(re, im);

    const nb = c.createBuffer(1, Math.floor(c.sampleRate * 0.2), c.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;
  }

  dispose() {
    try { this.out.disconnect(); this.comp.disconnect(); } catch { /* уже отключено */ }
  }
}

/* --------------------------- одна аранжировка --------------------------- */

export class SynthTrack {
  readonly id: string;
  events: SynEvent[] = [];
  idx = 0;
  voices: SynthVoice[] = [];

  level: number;
  muted: boolean;
  transpose: number;
  capo: number;

  private arr: Arrangement | null = null;
  private open: number[] = OPEN_GTR;
  private tuning: number[] = [];
  private gain: GainNode | null = null;
  private capoOpt?: number;

  constructor(id: string, o: TrackOpts = {}) {
    this.id = id;
    this.level = clamp(o.level ?? 1, 0, 2);
    this.muted = !!o.muted;
    this.transpose = o.transpose ?? 0;
    this.capoOpt = o.capo;
    this.capo = o.capo ?? STATE.capo;
  }

  get arrangement() { return this.arr; }
  get volume() { return this.muted ? 0 : this.level; }

  configure(o: TrackOpts) {
    if (o.level !== undefined) this.level = clamp(o.level, 0, 2);
    if (o.muted !== undefined) this.muted = o.muted;
    if (o.transpose !== undefined) this.transpose = o.transpose;
    if (o.capo !== undefined) this.capoOpt = o.capo;
    this.applyGain();
    return this;
  }

  /** сборка событий партии;.notes/chords — уже подготовленные данные, иначе берём из Arrangement */
  build(a: Arrangement, notes?: RNote[], chords?: SynthChord[]): this {
    this.arr = a;
    this.tuning = (a.tuning || []) as number[];
    this.capo = this.capoOpt ?? (a as { capo?: number }).capo ?? STATE.capo;

    const chs = chords ?? normChords(a);
    const src = (notes ?? wireNotes(a, chs)).slice().sort((p, q) => p.t - q.t);

    const nStr = this.tuning.length || maxString(src) + 1 || STATE.nStr;
    this.open = nStr === 4 ? OPEN_BASS : OPEN_GTR;

    // длительность звучания: сустейн либо расстояние до следующей ноты на этой струне
    const last: Record<number, RNote> = {};
    for (let i = src.length - 1; i >= 0; i--) {
      const n = src[i], nx = last[n.s];
      n.ring = sustained(n)
        ? Math.max(n.sus, 0.03)
        : clamp(nx ? nx.t - n.t : 0.55, 0.1, n.pm ? 0.14 : 0.55);
      last[n.s] = n;
    }

    const ev: SynEvent[] = [];
    for (let i = 0; i < src.length;) {
      let j = i;
      while (j < src.length && src[j].t === src[i].t) j++;
      for (let q = i; q < j; q++)
        ev.push({ t: src[q].t, n: src[q], m: this.midi(src[q]), k: j - i, o: q - i });
      i = j;
    }

    // аккорды без собственных нот — повтор предыдущего аккорда короткими нотами
    let prev: RNote[] | null = null;
    for (const c of chs) {
      if (c.notes?.length) { prev = c.notes; continue; }
      if (!prev) continue;
      prev.forEach((n, o) => ev.push({
        t: c.t, m: this.midi(n), k: prev!.length, o,
        n: { ...n, t: c.t, sus: 0, sl: -1, slu: -1, bn: 0, ac: false, ring: 0.22, linked: false },
      }));
    }

    this.events = ev.sort((p, q) => p.t - q.t);
    this.idx = 0;
    return this;
  }

  private midi(n: RNote) {
    const open = this.open[n.s] !== undefined ? this.open[n.s] : 64;
    return open + (+(this.tuning[n.s] || 0)) + (n.f > 0 ? n.f : this.capo) + this.transpose;
  }

  /* ---- аудио-граф партии ---- */

  node(c: AudioContext, dest: AudioNode): GainNode {
    if (!this.gain) {
      this.gain = c.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(dest);
    }
    return this.gain;
  }

  private applyGain(ramp = 0.02) {
    const g = this.gain, c = AUDIO.ctx;
    if (!g || !c) return;
    const t = c.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(this.volume, t + ramp);
  }

  setLevel(v: number) { this.level = clamp(v, 0, 2); this.applyGain(); return this; }
  setMuted(m: boolean) { this.muted = m; if (m) this.kill(); this.applyGain(); return this; }

  detach() {
    this.kill();
    try { this.gain?.disconnect(); } catch { /* уже отключён */ }
    this.gain = null;
  }

  /* ---- планирование ---- */

  sync(t: number) { this.idx = lowerBound(this.events, 't', t); }

  pump(now: number, ct: number, bus: Bus) {
    if (this.muted || this.idx >= this.events.length) return;
    const c = AUDIO.ctx!;
    const dest = this.node(c, bus.out);
    const E = this.events, ahead = AHEAD * STATE.rate;

    while (this.idx < E.length) {
      const e = E[this.idx], dt = e.t - now;
      if (dt > ahead) break;
      this.idx++;
      if (dt < LATE) continue;
      this.voice(e, ct + Math.max(0, dt) / STATE.rate, bus, dest);
    }
    if (this.voices.length > MAX_VOICES) this.voices = this.voices.filter((v) => v.end > ct);
  }

  kill() {
    const c = AUDIO.ctx;
    if (!c || !this.voices.length) { this.voices = []; return; }
    const ct = c.currentTime;
    for (const v of this.voices) {
      try {
        v.g.gain.cancelScheduledValues(ct);
        v.g.gain.setTargetAtTime(0, ct, KILL_TAU);
        v.osc.stop(ct + 0.08);
        v.lfo?.stop(ct + 0.08);
      } catch { /* голос уже снят */ }
    }
    this.voices = [];
  }

  dispose() { this.detach(); this.events = []; this.idx = 0; this.arr = null; }

  /* ---- один голос (бывшая функция voice) ---- */

  private voice(e: SynEvent, when: number, bus: Bus, dest: AudioNode) {
    const c = AUDIO.ctx!, n = e.n, t0 = when + e.o * STRUM;
    const soft = n.ho || n.po || n.tp || n.linked;
    const level = (0.3 / Math.sqrt(e.k)) * (n.ac ? 1.3 : 1) * (soft ? 0.72 : 1);

    const g = c.createGain();
    g.connect(dest);
    const keep = (osc: AudioScheduledSourceNode, end: number, lfo?: OscillatorNode) => {
      osc.onended = () => { try { g.disconnect(); } catch { /* уже отключён */ } };
      this.voices.push({ g, osc, lfo, end });
    };

    if (n.mt) {
      const src = c.createBufferSource(); src.buffer = bus.noise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
      bp.frequency.value = clamp(440 * Math.pow(2, (e.m - 69) / 12) * 2, 160, 900);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(level * 1.1, t0 + 0.002);
      g.gain.setTargetAtTime(0, t0 + 0.004, 0.022);
      src.connect(bp); bp.connect(g); src.start(t0); src.stop(t0 + 0.16);
      keep(src, t0 + 0.2);
      return;
    }

    let midi = e.m, pure = false;
    if (n.hm && n.f > 0) { midi = e.m - n.f + (HARMONIC[n.f] || 12); pure = true; }
    else if (n.hp) { midi = e.m + 24; pure = true; }

    const f0 = 440 * Math.pow(2, (midi - 69) / 12);
    const dur = Math.max(0.08, n.ring || 0.3) / STATE.rate, tEnd = t0 + dur;

    const osc = c.createOscillator();
    if (pure) osc.type = 'triangle'; else osc.setPeriodicWave(bus.wave);
    osc.frequency.value = f0;

    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(Math.min(f0 * (n.pm ? 2.2 : 9) + 400, 9000), t0);
    lp.frequency.exponentialRampToValueAtTime(Math.min(f0 * (n.pm ? 1.2 : 2.2) + 200, 4000), t0 + (n.pm ? 0.05 : 0.35));

    let tau = n.pm ? 0.045 : clamp(1.6 - (midi - 40) * 0.022, 0.45, 1.6);
    if (sustained(n)) tau = Math.max(tau, dur * 0.9);
    const att = soft ? 0.01 : 0.003;

    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(level, t0 + att);
    g.gain.setTargetAtTime(0, t0 + att, tau);
    if (n.tr) for (let tt = t0 + 0.075; tt < tEnd - 0.02; tt += 0.075) {
      g.gain.setValueAtTime(level * 0.9, tt);
      g.gain.setTargetAtTime(0, tt + 0.002, 0.07);
    }
    g.gain.setTargetAtTime(0, tEnd, 0.03);

    const tgt = n.sl > 0 ? n.sl : n.slu > 0 ? n.slu : 0;
    if (n.bn > 0) {
      osc.detune.setValueAtTime(0, t0);
      osc.detune.linearRampToValueAtTime(n.bn * 100, t0 + Math.max(0.08, dur * 0.45));
    } else if (tgt && n.f > 0) {
      osc.detune.setValueAtTime(0, t0 + dur * 0.3);
      osc.detune.linearRampToValueAtTime((tgt - n.f) * 100, tEnd);
    }

    let lfo: OscillatorNode | undefined;
    if (n.vb) {
      lfo = c.createOscillator(); lfo.frequency.value = 5.5;
      const depth = c.createGain();
      depth.gain.setValueAtTime(0, t0 + 0.1);
      depth.gain.linearRampToValueAtTime(30, t0 + 0.28);
      lfo.connect(depth); depth.connect(osc.detune);
      lfo.start(t0); lfo.stop(tEnd + 0.25);
    }

    osc.connect(lp); lp.connect(g);
    osc.start(t0); osc.stop(tEnd + 0.25);
    keep(osc, tEnd + 0.3, lfo);
  }
}

/* ------------------------- движок: много партий ------------------------- */

export class Synth {
  private bus: Bus | null = null;
  private ctx: AudioContext | null = null;
  private tracks = new Map<string, SynthTrack>();

  get out() { return this.bus?.out ?? null; }
  get wave() { return this.bus?.wave ?? null; }
  get noise() { return this.bus?.noise ?? null; }
  get size() { return this.tracks.size; }
  get voices(): SynthVoice[] {
    const all: SynthVoice[] = [];
    for (const t of this.tracks.values()) all.push(...t.voices);
    return all;
  }

  /** ленивая инициализация общей шины (пересоздаётся при смене AudioContext) */
  init(): Bus | null {
    const c = AUDIO.ctx;
    if (!c) return null;
    if (this.bus && this.ctx === c) return this.bus;
    for (const t of this.tracks.values()) t.detach();
    this.bus?.dispose();
    this.ctx = c;
    this.bus = new Bus(c, STATE.synthLevel);
    return this.bus;
  }

  /** добавить/пересобрать партию; играет одновременно с остальными */
  add(a: Arrangement, o: TrackOpts = {}): SynthTrack {
    const id = o.id ?? idOf(a, this.tracks.size);
    let t = this.tracks.get(id);
    if (!t) { t = new SynthTrack(id, o); this.tracks.set(id, t); }
    else t.configure(o);
    t.build(a, o.notes, o.chords);
    if (AUDIO.playing) t.sync(songTime() - STATE.offMs / 1000 - 0.03);
    this.publish();
    return t;
  }

  /** заменить весь набор партий за один вызов */
  setAll(items: { a: Arrangement; opts?: TrackOpts }[]) {
    this.clear();
    for (const it of items) 
        this.add(it.a, it.opts);
    return this;
  }

  get(id: string) { return this.tracks.get(id); }
  has(id: string) { return this.tracks.has(id); }
  list() { return [...this.tracks.values()]; }

  remove(id: string) {
    const t = this.tracks.get(id);
    if (!t) return false;
    t.dispose();
    this.tracks.delete(id);
    this.publish();
    return true;
  }

  clear() {
    for (const t of this.tracks.values()) t.dispose();
    this.tracks.clear();
    this.publish();
  }

  /** соло одной партии; null — снять соло */
  solo(id: string | null) {
    for (const t of this.tracks.values()) t.setMuted(id !== null && t.id !== id);
  }

  /** мастер-громкость синтеза (STATE.synthLevel) */
  setMaster(v: number) {
    const g = this.bus?.out, c = AUDIO.ctx;
    if (!g || !c) return;
    const t = c.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(v, t + 0.02);
  }

  sync() {
    const t = songTime() - STATE.offMs / 1000 - 0.03;
    for (const tr of this.tracks.values()) tr.sync(t);
  }

  pump() {
    const c = AUDIO.ctx;
    if (!STATE.synthOn || !AUDIO.playing || !c || c.state !== 'running' || !this.tracks.size) return;
    const bus = this.init();
    if (!bus) return;
    const now = songTime() - STATE.offMs / 1000, ct = c.currentTime;
    for (const tr of this.tracks.values()) tr.pump(now, ct, bus);
  }

  kill() { for (const t of this.tracks.values()) t.kill(); }

  dispose() {
    this.clear();
    this.bus?.dispose();
    this.bus = null;
    this.ctx = null;
  }

  /** совместимость: STATE.syn — события основной (активной) партии */
  private publish() {
    STATE.syn = this.tracks.get(MAIN_ID)?.events ?? this.list()[0]?.events ?? [];
  }
}

/* ------------------------------ утилиты ------------------------------ */

const maxString = (ns: RNote[]) => ns.reduce((m, n) => Math.max(m, n.s), -1);

function chordAt(chs: SynthChord[], t: number): number | undefined {
  if (!chs.length) return undefined;
  const i = lowerBound(chs, 't', t + 1e-4) - 1;
  return i >= 0 ? i : undefined;
}

function normChords(a: Arrangement): SynthChord[] {
  const raw = (a.chords || []) as unknown as { t: number; notes?: WireNote[] }[];
  return raw.map((c) => ({ t: +c.t, notes: (c.notes || []).map((n) => mkNote(n, +c.t, undefined)) }));
}

function wireNotes(a: Arrangement, chs: SynthChord[]): RNote[] {
  const raw = (a.notes || []) as unknown as WireNote[];
  return raw.map((n) => mkNote(n, +n.t, chordAt(chs, +n.t)));
}

function idOf(a: Arrangement, i: number) {
  const m = a as { id?: string | number; name?: string };
  return String(m.id ?? m.name ?? 'arr' + i);
}

/* ------------------- экземпляр по умолчанию + совместимость ------------------- */

export const MAIN_ID = 'main';
export const SYNTH = new Synth();
