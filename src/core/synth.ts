import { AUDIO, songTime } from './audio';
import { STATE } from './state';
import { clamp, lowerBound, sustained } from './util';
import { HARMONIC, OPEN_BASS, OPEN_GTR } from './const';
import type { Arrangement, RNote, SynEvent } from '../types';

export const SY = { idx: 0, voices: [] as { g: GainNode; osc: AudioScheduledSourceNode; lfo?: OscillatorNode; end: number }[], wave: null as PeriodicWave | null, noise: null as AudioBuffer | null, out: null as GainNode | null };

export function buildSynth(a: Arrangement) {
    const open = STATE.nStr === 4 ? OPEN_BASS : OPEN_GTR, tun = a.tuning || [];
    const midiOf = (n: RNote) => (open[n.s] !== undefined ? open[n.s] : 64) + (+(tun[n.s] || 0)) + (n.f > 0 ? n.f : STATE.capo);
    const last: Record<number, RNote> = {};
    for (let i = STATE.all.length - 1; i >= 0; i--) {
        const n = STATE.all[i], nx = last[n.s];
        n.ring = sustained(n) ? Math.max(n.sus, 0.03) : clamp(nx ? nx.t - n.t : 0.55, 0.1, n.pm ? 0.14 : 0.55);
        last[n.s] = n;
    }
    const ev: SynEvent[] = [];
    for (let i = 0; i < STATE.all.length;) {
        let j = i; while (j < STATE.all.length && STATE.all[j].t === STATE.all[i].t) j++;
        for (let q = i; q < j; q++) ev.push({ t: STATE.all[q].t, n: STATE.all[q], m: midiOf(STATE.all[q]), k: j - i, o: q - i });
        i = j;
    }
    let prev: RNote[] | null = null;
    for (const c of STATE.chords) {
        if (c.notes.length) { prev = c.notes; continue; }
        if (prev) prev.forEach((n, o) => ev.push({ t: c.t, m: midiOf(n), k: prev!.length, o, n: { ...n, t: c.t, sus: 0, sl: -1, slu: -1, bn: 0, ac: false, ring: 0.22, linked: false } }));
    }
    STATE.syn = ev.sort((p, q) => p.t - q.t); SY.idx = 0;
}
export function synInit() {
    if (SY.out || !AUDIO.ctx) return;
    const c = AUDIO.ctx;
    SY.out = c.createGain(); SY.out.gain.value = STATE.synthLevel;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.12;
    SY.out.connect(comp); comp.connect(c.destination);
    const N = 28, re = new Float32Array(N), im = new Float32Array(N);
    for (let h = 1; h < N; h++) im[h] = Math.sin(h * Math.PI * 0.19) / Math.pow(h, 1.25);
    SY.wave = c.createPeriodicWave(re, im);
    const nb = c.createBuffer(1, Math.floor(c.sampleRate * 0.2), c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    SY.noise = nb;
}
function voice(e: SynEvent, when: number) {
    const c = AUDIO.ctx!, n = e.n, t0 = when + e.o * 0.007;
    const soft = n.ho || n.po || n.tp || n.linked;
    const level = (0.3 / Math.sqrt(e.k)) * (n.ac ? 1.3 : 1) * (soft ? 0.72 : 1);
    const g = c.createGain(); g.connect(SY.out!);
    if (n.mt) {
        const src = c.createBufferSource(); src.buffer = SY.noise;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
        bp.frequency.value = clamp(440 * Math.pow(2, (e.m - 69) / 12) * 2, 160, 900);
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(level * 1.1, t0 + 0.002); g.gain.setTargetAtTime(0, t0 + 0.004, 0.022);
        src.connect(bp); bp.connect(g); src.start(t0); src.stop(t0 + 0.16);
        SY.voices.push({ g, osc: src, end: t0 + 0.2 }); return;
    }
    let midi = e.m, pure = false;
    if (n.hm && n.f > 0) { midi = e.m - n.f + (HARMONIC[n.f] || 12); pure = true; }
    else if (n.hp) { midi = e.m + 24; pure = true; }
    const f0 = 440 * Math.pow(2, (midi - 69) / 12);
    const dur = Math.max(0.08, n.ring || 0.3) / STATE.rate, tEnd = t0 + dur;
    const osc = c.createOscillator();
    if (pure) osc.type = 'triangle'; else osc.setPeriodicWave(SY.wave!);
    osc.frequency.value = f0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(Math.min(f0 * (n.pm ? 2.2 : 9) + 400, 9000), t0);
    lp.frequency.exponentialRampToValueAtTime(Math.min(f0 * (n.pm ? 1.2 : 2.2) + 200, 4000), t0 + (n.pm ? 0.05 : 0.35));
    let tau = n.pm ? 0.045 : clamp(1.6 - (midi - 40) * 0.022, 0.45, 1.6);
    if (sustained(n)) tau = Math.max(tau, dur * 0.9);
    const att = soft ? 0.01 : 0.003;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(level, t0 + att); g.gain.setTargetAtTime(0, t0 + att, tau);
    if (n.tr) for (let tt = t0 + 0.075; tt < tEnd - 0.02; tt += 0.075) { g.gain.setValueAtTime(level * 0.9, tt); g.gain.setTargetAtTime(0, tt + 0.002, 0.07); }
    g.gain.setTargetAtTime(0, tEnd, 0.03);
    const tgt = n.sl > 0 ? n.sl : n.slu > 0 ? n.slu : 0;
    if (n.bn > 0) { osc.detune.setValueAtTime(0, t0); osc.detune.linearRampToValueAtTime(n.bn * 100, t0 + Math.max(0.08, dur * 0.45)); }
    else if (tgt && n.f > 0) { osc.detune.setValueAtTime(0, t0 + dur * 0.3); osc.detune.linearRampToValueAtTime((tgt - n.f) * 100, tEnd); }
    let lfo: OscillatorNode | undefined;
    if (n.vb) {
        lfo = c.createOscillator(); lfo.frequency.value = 5.5;
        const depth = c.createGain(); depth.gain.setValueAtTime(0, t0 + 0.1); depth.gain.linearRampToValueAtTime(30, t0 + 0.28);
        lfo.connect(depth); depth.connect(osc.detune); lfo.start(t0); lfo.stop(tEnd + 0.25);
    }
    osc.connect(lp); lp.connect(g); osc.start(t0); osc.stop(tEnd + 0.25);
    SY.voices.push({ g, osc, lfo, end: tEnd + 0.3 });
}
export function synPump() {
    if (!STATE.synthOn || !AUDIO.playing || !AUDIO.ctx || AUDIO.ctx.state !== 'running' || !STATE.syn.length) return;
    synInit();
    const now = songTime() - STATE.offMs / 1000, E = STATE.syn, ct = AUDIO.ctx.currentTime;
    while (SY.idx < E.length) {
        const e = E[SY.idx], dt = e.t - now;
        if (dt > 0.25 * STATE.rate) break;
        SY.idx++;
        if (dt < -0.06) continue;
        voice(e, ct + Math.max(0, dt) / STATE.rate);
    }
    if (SY.voices.length > 48) SY.voices = SY.voices.filter((v) => v.end > ct);
}
export const synSync = () => { SY.idx = lowerBound(STATE.syn, 't', songTime() - STATE.offMs / 1000 - 0.03); };
export function synKill() {
    if (!AUDIO.ctx || !SY.voices.length) return;
    const ct = AUDIO.ctx.currentTime;
    for (const v of SY.voices) {
        try { v.g.gain.cancelScheduledValues(ct); v.g.gain.setTargetAtTime(0, ct, 0.012); v.osc.stop(ct + 0.08); v.lfo?.stop(ct + 0.08); } catch { /* голос снят */ }
    }
    SY.voices = [];
}