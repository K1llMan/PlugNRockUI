import type { Arrangement, ChordEv, Hold, LyricBlock, PhraseBar, Pill, RAnchor, RNote, SongPayload } from '../types';
import { STATE, currentArr } from './state';
import { ui } from './store';
import { clamp, lowerBound, mkNote, chordLabel } from './util';
import { FING_GAP, FING_IN, FING_MOVE, HOLD_GAP, LYR_GAP, LYR_LEAD, NAMED_TUNINGS, NOTE_NAMES, OPEN_BASS, OPEN_GTR, REPEAT_GAP } from './const';
import { SYNTH, SynthTrack } from './synth';
import { clearLoopBars, SEL } from './loop';
import { syncBeats } from './audio';

let lyricTold = false;
export const resetLyricTold = () => { lyricTold = false; };
let lastSec = -2, lastTone: string | undefined, flashTimer = 0;
export const resetHud = () => { lastSec = -2; lastTone = undefined; };

export function anchorIdx(t: number) {
  const A = STATE.anchors; let lo = 0, hi = A.length - 1, r = 0;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (A[m].t <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}
export function handAt(t: number) {
  const H = STATE.hands; let lo = 0, hi = H.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (H[m].t <= t + 0.004) { r = m; lo = m + 1; } else hi = m - 1; }
  return r >= 0 && t <= H[r].t1 + 0.004 ? r : -1;
}
export function tuningText(a: Arrangement) {
  const open = STATE.nStr === 4 ? OPEN_BASS : OPEN_GTR;
  const t = open.map((_, i) => +((a.tuning || [])[i] || 0));
  const nm = (i: number) => NOTE_NAMES[(((open[i] + t[i]) % 12) + 12) % 12];
  let name = NAMED_TUNINGS[t.join(',')] || 'Custom tuning';
  if (t.every((v) => v === t[0])) name = nm(0) + ' Standard';
  else if (t[0] === t[1] - 2 && t.slice(1).every((v) => v === t[1])) name = 'Drop ' + nm(0);
  return { name, notes: open.map((_, i) => nm(i)).join(' '), capo: STATE.capo > 0 ? 'Capo ' + STATE.capo : '' };
}
export function selectArrangement(i: number) {
  STATE.arrIdx = clamp(i, 0, Math.max(0, STATE.arrs.length - 1));
  const a = currentArr(); if (!a) return;
  STATE.nStr = (a.name || '').toLowerCase().includes('bass') ? 4 : 6;
  STATE.capo = a.capo | 0;
  const tpl = a.templates || [];
  STATE.hands = (a.handshapes || []).map((h) => ({ t: +h.start_time, t1: +h.end_time, arp: !!h.arp, id: h.chord_id | 0 }))
    .filter((h) => h.t1 > h.t).sort((p, q) => p.t - q.t);
  const all: RNote[] = (a.notes || []).map((n) => mkNote(n, n.t, undefined));
  STATE.chords = [];
  let prev: ChordEv | null = null;
  (a.chords || []).forEach((c, ci) => {
    const ns = (c.notes || []).map((cn) => mkNote(cn, c.t, ci));
    const T = tpl[c.id];
    const ev: ChordEv = {
      t: +c.t, notes: ns, rep: false, sig: '', name: T ? chordLabel(T.displayName || T.display_name || T.name) : '',
      mute: ns.length > 0 && ns.every((n) => n.mt), pm: ns.length > 0 && ns.every((n) => n.pm), hold: 0,
    };
    if (!ns.length) { ev.rep = true; if (prev) { ev.mute = prev.mute; ev.pm = prev.pm; } }
    else {
      ev.sig = (c.id | 0) + '|' + ns.map((n) => n.s + ':' + n.f).sort().join(',');
      const plain = ns.every((n) => n.sus < 0.25 && n.sl < 0 && n.slu < 0 && !n.bn);
      if (prev && prev.sig === ev.sig && plain) {
        const h0 = handAt(prev.t), h1 = handAt(ev.t);
        ev.rep = h1 >= 0 ? h0 === h1 && ev.t - prev.t < 2.5 : ev.t - prev.t < 0.6;
      }
      if (c.hd && prev) ev.rep = true;
      const seen = new Set<number>();
      for (const n of ns) { n.hide = ev.rep; n.lab = n.f > 0 && !seen.has(n.f); seen.add(n.f); all.push(n); }
    }
    STATE.chords.push(ev);
    if (ns.length) prev = ev;
  });
  STATE.all = all.sort((p, q) => p.t - q.t || p.s - q.s);
  const last: (RNote | null)[] = new Array(8).fill(null);
  for (const n of STATE.all) { const p = last[n.s]; if (p && p.ln && n.t <= p.t + p.sus + 0.06) n.linked = true; last[n.s] = n; }
  let prevSig: string | null = null, prevT = -Infinity, start = 0;
  for (let i = 1; i <= STATE.all.length; i++) {
    if (i < STATE.all.length && STATE.all[i].t === STATE.all[i - 1].t) continue;
    const parts: string[] = []; let chord = false;
    for (let k = start; k < i; k++) { const n = STATE.all[k]; if (n.ch !== undefined) chord = true; parts.push(n.s + ':' + n.f); }
    const sig = parts.sort().join('|'), t0 = STATE.all[start].t;
    const rep = !chord && prevSig !== null && sig === prevSig && t0 - prevT <= REPEAT_GAP;
    if (!chord) for (let k = start; k < i; k++) { STATE.all[k].rep = rep; STATE.all[k].lab = !rep && STATE.all[k].f > 0; }
    prevSig = chord ? null : sig; prevT = t0; start = i;
  }
  STATE.maxSus = 0; STATE.fMin = 99; STATE.fMax = -1;
  for (const n of STATE.all) {
    if (n.sus > STATE.maxSus) STATE.maxSus = n.sus;
    if (n.f > 0) { if (n.f < STATE.fMin) STATE.fMin = n.f; if (n.f > STATE.fMax) STATE.fMax = n.f; }
  }
  if (STATE.fMax < 0) { STATE.fMin = 1; STATE.fMax = 4; }
  STATE.anchors = (a.anchors || []).map<RAnchor>((x) => ({ t: +x.time, fret: clamp(x.fret | 0, 1, 24), width: clamp((x.width | 0) || 4, 1, 24), row: false })).sort((p, q) => p.t - q.t);
  if (!STATE.anchors.length) STATE.anchors = [{ t: 0, fret: clamp(STATE.fMin, 1, 21), width: 4, row: false }];
  let lastRow = -1e9;
  STATE.anchors.forEach((an, i) => {
    an.row = false; if (i === 0) return;
    const pv = STATE.anchors[i - 1];
    if (an.fret === pv.fret && an.width === pv.width) return;
    if (an.t - lastRow < 0.8) return;
    lastRow = an.t; an.row = true;
  });
  buildHolds(tpl); 

  // Установка громкости треков синтезатора
  SYNTH.list()
    .forEach((t: SynthTrack) => {
      let isCurArr = t.arrangement?.name == a.name;
      let isBass = /bass/i.test(t.arrangement?.name || '');

      if (isBass)
        t.setLevel(isCurArr ? 0.8 : 0.6);
      else
        t.setLevel(isCurArr ? 1 : 0.8);
    });

  clearLoopBars(); 
  buildPhrases();

  if (!STATE.keepCam) STATE.camC = null;
  STATE.tones = { base: a.tones?.base || '', changes: a.tones?.changes || [], names: a.tones?.names || {} };
  const T = tuningText(a); STATE.tuneNames = T.notes.split(' ');
  ui.set({ arrIdx: STATE.arrIdx, tuning: T, toneChanges: STATE.tones.changes.map((c) => ({ t: c.t })), tabRev: ui.get().tabRev + 1, tone: null });
  applyOffset(STATE.offMs);
}
function buildHolds(tpl: Arrangement['templates']) {
  const out: Hold[] = [];
  const played = (a: number, b: number) => { const i = lowerBound(STATE.all, 't', a + 0.03); return i < STATE.all.length && STATE.all[i].t < b - 0.03; };
  for (const h of STATE.hands) {
    const T = tpl[h.id]; if (!T) continue;
    const fr = T.frets || [], fg = T.fingers || [], name = chordLabel(T.displayName || T.display_name || T.name);
    const by = new Map<string, Pill>();
    for (let s = 0; s < fr.length && s < STATE.nStr; s++) {
      if (!(fr[s] > 0) || !(fg[s] >= 0)) continue;
      const k = fg[s] + ':' + fr[s], m = by.get(k);
      if (m) { m.s0 = Math.min(m.s0, s); m.s1 = Math.max(m.s1, s); }
      else by.set(k, { g: fg[s] === 0 ? 'T' : String(fg[s]), f: fr[s], s0: s, s1: s });
    }
    if (!by.size && !name) continue;
    const sig = name + '|' + fr.join(',') + '|' + fg.join(',');
    const p = out[out.length - 1];
    if (p && p.sig === sig && h.t - p.t1 <= HOLD_GAP && !played(p.t1, h.t)) { p.t1 = h.t1; continue; }
    out.push({ t: h.t, t1: h.t1, sig, name, pills: [...by.values()], frets: fr.slice(0, STATE.nStr), link: false, in0: h.t - FING_IN });
  }
  for (let i = 0; i < out.length; i++) {
    const h = out[i], q = out[i - 1], gap = q ? h.t - q.t1 : 1e9;
    h.link = gap <= FING_GAP;
    h.in0 = h.link ? h.t - Math.min(FING_MOVE, Math.max(gap, 0.12)) : h.t - FING_IN;
    if (q && h.in0 <= q.in0) h.in0 = q.in0 + 0.001;
  }
  STATE.holds = out;
  for (const ev of STATE.chords) {
    ev.hold = 0; if (!ev.name) continue;
    const h = out[lowerBound(out, 't', ev.t + 0.01) - 1];
    if (h && ev.t <= h.t1 + 0.01 && h.name === ev.name) ev.hold = ev.t > h.t + 0.02 ? 2 : 1;
  }
  const hs = new Set<number>();
  for (const n of STATE.all) if (!n.linked) hs.add(n.t);
  for (const c of STATE.chords) hs.add(c.t);
  STATE.hits = [...hs].sort((p, q) => p - q);
}
export function hitFlash(t: number) {
  const H = STATE.hits; let lo = 0, hi = H.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (H[m] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  if (r < 0) return 0;
  const d = t - H[r]; return d < 0.12 ? 1 - d / 0.12 : 0;
}
export function buildPhrases() {
  const a = currentArr(); STATE.phrases = []; STATE.phReal = false; if (!a) return;
  const src = (a.phrases || []).filter((p) => +p.end_time > +p.start_time);
  if (src.length > 1) {
    let mx = 1; for (const p of src) mx = Math.max(mx, p.max_difficulty | 0);
    STATE.phrases = src.map<PhraseBar>((p) => ({ t0: +p.start_time, t1: +p.end_time, lv: (p.max_difficulty | 0) > 0 ? (p.max_difficulty | 0) / mx : 0 }));
    STATE.phReal = true; return;
  }
  const D = STATE.duration || (STATE.all.length ? STATE.all[STATE.all.length - 1].t + 4 : 0);
  if (D <= 0) return;
  const cuts = new Set<number>([0]), secT = STATE.sections.map((s) => +s.time);
  let si = 0, cnt = 0;
  const downs = STATE.beats.filter((b) => b.measure >= 0);
  if (downs.length > 4) {
    for (const b of downs) {
      let crossed = false;
      while (si < secT.length && secT[si] <= b.time + 0.02) { si++; crossed = true; }
      if (crossed) { cnt = 0; cuts.add(+b.time.toFixed(3)); } else if (++cnt % 4 === 0) cuts.add(+b.time.toFixed(3));
    }
  } else { for (let x = 8; x < D; x += 8) cuts.add(x); for (const x of secT) cuts.add(x); }
  const ts = [...cuts].filter((x) => x >= 0 && x < D - 0.5).sort((p, q) => p - q);
  const ph: PhraseBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const t0 = ts[i], t1 = i + 1 < ts.length ? ts[i + 1] : D;
    if (t1 - t0 < 0.4) { if (ph.length) ph[ph.length - 1].t1 = t1; continue; }
    ph.push({ t0, t1, lv: 0, w: 0 });
  }
  let pi = 0, lastT = -1;
  for (const n of STATE.all) {
    while (pi < ph.length - 1 && n.t0 >= ph[pi].t1) pi++;
    if (!ph[pi] || n.t0 < ph[pi].t0) continue;
    ph[pi].w = (ph[pi].w || 0) + (n.t0 === lastT ? 0.35 : 1) + (n.ho || n.po || n.tp || n.bn || n.sl > 0 || n.hm || n.hp ? 0.5 : 0);
    lastT = n.t0;
  }
  const dens = ph.map((p) => (p.w || 0) / (p.t1 - p.t0)).filter((x) => x > 0).sort((p, q) => p - q);
  const ref = dens.length ? dens[Math.min(dens.length - 1, Math.floor(dens.length * 0.92))] : 1;
  for (const p of ph) { const d = (p.w || 0) / (p.t1 - p.t0); p.lv = d > 0 ? 0.22 + 0.78 * Math.min(1, d / ref) : 0; }
  STATE.phrases = ph;
}
export function buildLyricPairs() {
  const L = STATE.lyrics, blocks: LyricBlock[] = [];
  for (let i = 0; i < L.length;) {
    const b: LyricBlock = { lines: [L[i++]], show: 0, end: 0, gone: 0, adv: [] };
    while (i < L.length && L[i].t - L[i - 1].end <= LYR_GAP) b.lines.push(L[i++]);
    blocks.push(b);
  }
  for (const b of blocks) {
    const n = b.lines.length;
    b.show = b.lines[0].t - LYR_LEAD; b.end = b.lines[n - 1].end; b.gone = b.end + 1;
    b.adv = b.lines.slice(0, -1).map((ln, i) => Math.max(ln.t, Math.min(ln.end + 0.15, b.lines[i + 1].t)));
  }
  STATE.lyrPairs = blocks;
}
export function loadSongData(d: SongPayload) {
  STATE.meta = d.meta || {};
  STATE.arrs = (d.arrangements || []).filter((a) => (a.notes || []).length || (a.chords || []).length);
  STATE.beats = (d.beats || []).slice().sort((a, b) => a.time - b.time);
  STATE.sections = (d.sections || []).slice().sort((a, b) => a.time - b.time);
  STATE.stems = d.stems || [];
  STATE.lyrics = ((d.lyrics && d.lyrics.lines) || []).slice().sort((a, b) => a.t - b.t);
  const lerr = (d.lyrics && d.lyrics.error) || '';
  if (lerr && !lyricTold) {
    lyricTold = true; STATE.lyrics = [];
    ui.set({ lyricError: lerr.charAt(0).toUpperCase() + lerr.slice(1) + '. Lyrics are hidden - repair them with Sync lyrics.' });
    setTimeout(() => ui.set({ lyricError: '' }), 12000);
  } else { STATE.lyrics = lerr ? [] : STATE.lyrics; ui.set({ lyricError: '' }); }
  for (const ln of STATE.lyrics) {
    if (!ln.syl || !ln.syl.length) ln.syl = [[ln.t, Math.max(0.2, (ln.end || ln.t + 2) - ln.t), ln.text]];
    if (!(ln.end > ln.t)) ln.end = ln.t + 2;
  }
  buildLyricPairs();
  ui.set({ arrs: STATE.arrs.map((a) => ({ name: a.name })), sections: STATE.sections, stems: STATE.stems.map((s) => ({ id: s.id })) });
}
export function applyOffset(ms: number) {
  STATE.offMs = Math.round(ms); ui.set({ offMs: STATE.offMs }); resetHud();
  if (STATE.clickOn) 
    syncBeats();

  SYNTH.kill();
  SYNTH.sync();

  if (STATE.loopSel && SEL.i0 >= 0 && STATE.phrases[SEL.i1]) {
    STATE.loopA = Math.max(0, STATE.phrases[SEL.i0].t0 + STATE.offMs / 1000);
    STATE.loopB = STATE.phrases[SEL.i1].t1 + STATE.offMs / 1000;
  }
}
export const toneKeyAt = (tc: number) => { let k = STATE.tones.base || ''; for (const c of STATE.tones.changes) { if (c.t > tc) break; k = c.name; } return k; };
export const toneLabel = (k: string) => { const n = STATE.tones.names[k]; return n ? n.real || n.raw : k; };
export function updateHud(time: number, tc: number) {
  const s = sectionAt(time), idx = s ? s.idx : -1;
  if (idx !== lastSec) { lastSec = idx; ui.set({ secIdx: idx, secName: s ? secLabelLocal(s.name) || '—' : '' }); }
  const key = toneKeyAt(tc);
  if (key !== lastTone) {
    const first = lastTone === undefined; lastTone = key;
    if (key) {
      const nm = STATE.tones.names[key] || { raw: key, real: '' };
      ui.set({ tone: { label: nm.real || nm.raw, raw: nm.raw, flash: true, first } });
      clearTimeout(flashTimer);
      flashTimer = window.setTimeout(() => { const t = ui.get().tone; if (t) ui.set({ tone: { ...t, flash: false } }); }, 3500);
    } else ui.set({ tone: null });
  }
}
const secLabelLocal = (n: string) => String(n || '').replace(/[_-]+/g, ' ').trim();
export function sectionAt(t: number) {
  const s = STATE.sections; if (!s.length) return null;
  const off = STATE.offMs / 1000; let idx = 0;
  for (let i = 0; i < s.length; i++) if (s[i].time + off <= t + 0.001) idx = i;
  return { idx, start: Math.max(0, s[idx].time + off), end: idx + 1 < s.length ? s[idx + 1].time + off : STATE.duration, name: s[idx].name };
}