import { convertWwiseRiffToOgg, getPackedCodebooks, type CodebooksVariant } from "ww2ogg-ts";
import { getIntlayer } from 'intlayer';

import type { DroppedFile, LoadedSong, SongPayload } from '../types';
import { LOCAL, showSong, restChart, fadeTo, cameraAtRest } from './session';
import { STATE, FLAGS } from './state';
import { ui, busy, idle, notice, lockInput, showHint } from './store';
import { audioInit, AUDIO, pause, fadeOutPlaying } from './audio';

const noticeMessages = getIntlayer('notice');

const AUDIO_RX = /\.(ogg|mp3|wav|flac|m4a|aac|opus|webm|wem)$/i;
const IMAGE_RX = /\.(jpe?g|png|webp|gif|bmp|dds)$/i;
export const KEEP = /\.(feedpak|sloppak|xml|json|ya?ml|ogg|mp3|wav|flac|m4a|aac|opus|webm|wem|jpe?g|png|webp|gif|bmp|dds)$/i;
const asset = (p: string) => import.meta.env.BASE_URL + p;

declare global {
  interface Window {
    CDLC_WORKER_SOURCE?: string;
    CDLC?: Record<string, (...a: never[]) => Promise<unknown>>;
  }
}
function loadScript(src: string) {
  return new Promise<void>((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('could not load ' + src));
    document.head.appendChild(s);
  });
}
let statics: Promise<void> | null = null;
export function loadStatics() {
  if (!statics)
    statics = (async () => {
      await loadScript(asset('web/converter.js'));
    })();
  return statics;
}
export function convertWem(bytes: Uint8Array) {
  for (const v of ['aoTuV_603', 'standard']) {
    try {
      return convertWwiseRiffToOgg(bytes, {
        codebooks: getPackedCodebooks(v as CodebooksVariant),
        sourceName: 'audio.wem'
      }).ogg;
    }
    catch (e) { if (v === 'standard') throw e; }
  }
  throw new Error('the audio could not be converted');
}
function coverFromRgba(width: number, height: number, rgba: Uint8Array) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return c.toDataURL('image/jpeg', 0.9);
}
type Result = { payloadJson?: string; payload?: SongPayload; cover?: { blob?: Blob; rgba?: Uint8Array; width?: number; height?: number } | null; ogg?: ArrayBuffer | null; stems?: { id: string; blob: Blob }[] | null };
let workerReady: Promise<Worker | null> | null = null, seq = 0;
const pending = new Map<number, { resolve: (v: Result) => void; reject: (e: Error) => void; onStage: (s: string) => void }>();

export function startWorker(): Promise<Worker | null> {
  if (!workerReady)
    workerReady = (async () => {
      if (typeof Worker === 'undefined')
        return null;
      await loadScript(asset('web/converter.worker.js'));
      const src = window.CDLC_WORKER_SOURCE;
      delete window.CDLC_WORKER_SOURCE;
      
      if (!src)
        return null;
      
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      let w: Worker;
      try { 
        w = new Worker(url); 
      } catch { 
        URL.revokeObjectURL(url); 
        return null; 
      }
      const up = await new Promise<boolean>((res) => {
        const t = setTimeout(() => res(false), 4000);
        w.onmessage = (ev) => { if (ev.data?.pong) { clearTimeout(t); res(true); } };
        w.onerror = (ev) => { ev.preventDefault?.(); clearTimeout(t); res(false); };
        w.postMessage({ ping: true });
      });
      URL.revokeObjectURL(url);
      if (!up) { w.terminate(); return null; }
      w.onmessage = (ev: MessageEvent) => {
        const m = ev.data || {}, job = pending.get(m.id); if (!job) return;
        if (m.stage !== undefined) { job.onStage(m.stage); return; }
        pending.delete(m.id);
        m.ok ? job.resolve(m.result) : job.reject(new Error(m.error));
      };
      w.onerror = (ev) => {
        ev.preventDefault?.();
        const err = new Error(ev.message || 'the converter stopped');
        for (const j of pending.values()) j.reject(err);
        pending.clear(); workerReady = null; try { w.terminate(); } catch { /* уже мёртв */ }
      };
      return w;
    })()
      .catch(() => null);
  return workerReady;
}
function ask(w: Worker, msg: Record<string, unknown>, onStage: (s: string) => void, transfer: Transferable[] = []) {
  return new Promise<Result>((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject, onStage });
    w.postMessage({ id, ...msg }, transfer);
  });
}
const toSong = (r: Result): LoadedSong => {
  let cover = '';
  if (r.cover?.blob) cover = URL.createObjectURL(r.cover.blob);
  else if (r.cover?.rgba) cover = coverFromRgba(r.cover.width!, r.cover.height!, r.cover.rgba);
  return {
    payload: r.payloadJson ? JSON.parse(r.payloadJson) : r.payload!, cover,
    audio: r.ogg ? new Blob([r.ogg], { type: 'audio/ogg' }) : null,
    stems: r.stems ? new Map(r.stems.map((s) => [s.id, s.blob])) : null,
  };
};
export async function openLocal(file: File, onStage: (s: string) => void): Promise<LoadedSong> {
  const w = await startWorker();
  if (w) {
    try { const bytes = await file.arrayBuffer(); return toSong(await ask(w, { name: file.name, bytes }, onStage, [bytes])); }
    catch (e) { console.warn('converter worker failed, opening in the page:', e); }
  }
  await loadStatics();
  const C = window.CDLC as unknown as { convertFeedpak: (b: Uint8Array, o: Record<string, unknown>) => Promise<{ payload: SongPayload; coverBlob: Blob | null; stems: { id: string; blob: Blob }[] }> };
  if (!C?.convertFeedpak) throw new Error('the in-page converter did not load (web/converter.js)');
  onStage('Opening the feedpak…');
  const { payload, coverBlob, stems } = await C.convertFeedpak(new Uint8Array(await file.arrayBuffer()), { name: file.name, onProgress: onStage });
  return { payload, cover: coverBlob ? URL.createObjectURL(coverBlob) : '', audio: null, stems: new Map(stems.map((s) => [s.id, s.blob])) };
}
const baseName = (f: DroppedFile) => (f.relPath || f.name).split('/').pop()!;
function pickBest(list: DroppedFile[], rx: RegExp, good: RegExp) {
  const c = list.filter((f) => rx.test(f.name) && !/preview/i.test(f.name));
  const score = (f: DroppedFile) => { const b = baseName(f).replace(/\.[^.]+$/, '').toLowerCase(); return (good.test(b) ? 2 : 0) - (b.startsWith('_') ? 2 : 0) + f.size / 1e12; };
  c.sort((a, b) => score(b) - score(a));
  return c[0] || null;
}
export function setName(list: DroppedFile[]) {
  const dir = list.find((f) => f.relPath && f.relPath.split('/').filter(Boolean).length > 1);
  if (dir) return dir.relPath!.split('/').filter(Boolean)[0];
  const x = list.find((f) => /\.xml$/i.test(f.name) && !/vocal/i.test(f.name)) || list.find((f) => /\.xml$/i.test(f.name)) || list.find((f) => /\.json$/i.test(f.name) && !/lyrics/i.test(f.name));
  return x ? x.name : 'song';
}
export async function openSet(list: DroppedFile[], json: boolean, onStage: (s: string) => void): Promise<LoadedSong> {
  const name = setName(list);
  const keep = json
    ? list.filter((f) => /\.(json|ya?ml|ogg|mp3|wav|flac|m4a|aac|opus|webm|jpe?g|png|webp|gif|bmp)$/i.test(f.name))
    : list.filter((f) => /\.xml$/i.test(f.name));
  const audioF = pickBest(list, AUDIO_RX, /^(audio|song|guitar|original|mix|full|track)\b/);
  const imageF = pickBest(list, IMAGE_RX, /^(cover|album|art|folder|front)\b/);
  if (!json) {
    if (audioF && /\.wem$/i.test(audioF.name)) keep.push(audioF);
    if (imageF && /\.dds$/i.test(imageF.name)) keep.push(imageF);
  }
  onStage(noticeMessages.reading + name + '…');
  const entries: { name: string; bytes: ArrayBuffer }[] = [];
  for (const f of keep) entries.push({ name: f.relPath || f.name, bytes: await f.arrayBuffer() });
  let r: Result | null = null;
  const w = await startWorker();
  if (w) {
    try { r = await ask(w, { name, jsonSet: json, entries: entries.map((e) => ({ name: e.name, bytes: e.bytes.slice(0) })) }, onStage); }
    catch (e) {
      const m = (e as Error).message;
      if (/no arrangement|no \.xml/i.test(m)) throw e;
      console.warn('converter worker failed, converting in the page:', e); r = null;
    }
  }
  if (r) {
    const song = toSong(r);
    if (!json && !song.cover && imageF && !/\.dds$/i.test(imageF.name)) song.cover = URL.createObjectURL(imageF);
    if (!json && !song.audio && audioF && !/\.wem$/i.test(audioF.name)) song.audio = audioF;
    song.payload.meta.cover = !!song.cover;
    return song;
  }
  await loadStatics();
  const C = window.CDLC as unknown as Record<string, (e: { name: string; bytes: Uint8Array }[], o: Record<string, unknown>) => Promise<{ payload: SongPayload; coverBlob?: Blob | null; stems?: { id: string; blob: Blob }[] }>>;
  const fn = json ? C?.convertFeedpakFiles : C?.convertXmlSet;
  if (!fn) throw new Error('the in-page converter did not load (web/converter.js)');
  const out = await fn(entries.map((e) => ({ name: e.name, bytes: new Uint8Array(e.bytes) })), { name, onProgress: onStage });
  let cover = out.coverBlob ? URL.createObjectURL(out.coverBlob) : '';
  let audio: Blob | null = null;
  if (!json) {
    const dds = entries.find((e) => /\.dds$/i.test(e.name)), wem = entries.find((e) => /\.wem$/i.test(e.name));
    const dec = (window.CDLC as unknown as { decodeDds?: (b: Uint8Array) => { width: number; height: number; rgba: Uint8Array } }).decodeDds;
    if (dds && dec) { try { const d = dec(new Uint8Array(dds.bytes)); cover = coverFromRgba(d.width, d.height, d.rgba); } catch { /* не DDS */ } }
    if (!cover && imageF && !/\.dds$/i.test(imageF.name)) cover = URL.createObjectURL(imageF);
    if (wem) {
      onStage(noticeMessages.convertingAudio);
      await new Promise((res) => setTimeout(res, 20)); audio = new Blob([convertWem(new Uint8Array(wem.bytes))], { type: 'audio/ogg' });
    }
    else if (audioF && !/\.wem$/i.test(audioF.name)) audio = audioF;
  }
  out.payload.meta.cover = !!cover;
  return { payload: out.payload, cover, audio, stems: out.stems?.length ? new Map(out.stems.map((s) => [s.id, s.blob])) : null };
}

export async function openDropped(input: DroppedFile | DroppedFile[]) {
  if (FLAGS.opening)
    return;

  const list = Array.isArray(input) ? input : [input];
  const xmlSet = list.some((f) => /\.xml$/i.test(f.name));
  const jsonSet = !xmlSet && (list.some((f) => /(^|\/)manifest\.ya?ml$/i.test(f.relPath || f.name)) || list.some((f) => /\.json$/i.test(f.name) && !/lyrics/i.test(f.name)))
    && !list.some((f) => /\.(feedpak|sloppak)$/i.test(f.name) && !f.relPath);
  const file = xmlSet || jsonSet ? null : list.find((f) => /\.(feedpak|sloppak)$/i.test(f.name)) || null;
  if (!xmlSet && !jsonSet && !file) {
    notice(noticeMessages.filesConstraints);
    setTimeout(idle, 5000);
    return;
  }
  const label = xmlSet || jsonSet ? setName(list) : file!.name;
  FLAGS.opening = true; lockInput(true);
  let cleared: Promise<void> = Promise.resolve();
  try {
    const faded = await fadeOutPlaying();
    if (STATE.playing) pause();
    showHint(false);
    try { audioInit(); AUDIO.ctx!.resume(); } catch { /* без звука */ }
    let song: LoadedSong | null = null;
    cleared = fadeTo(0).then(() => { restChart(); STATE.visTo = 1; ui.set({ title: label, artist: 'opening…', album: '' }); });
    if (faded) { idle(); await cleared; await cameraAtRest(); }
    busy(`${noticeMessages.reading} ${label}…`);
    try { song = xmlSet || jsonSet ? await openSet(list, jsonSet, busy) : await openLocal(file!, busy); }
    catch (e) {
      if (xmlSet || jsonSet)
        throw e;
    }
    if (song) {
      await cleared;
      const old = LOCAL.cover;
      LOCAL.payload = song.payload; LOCAL.cover = song.cover; LOCAL.audio = song.audio; LOCAL.stems = song.stems; LOCAL.serverPack = false;
      if (old.startsWith('blob:') && old !== LOCAL.cover) setTimeout(() => URL.revokeObjectURL(old), 2000);
      await showSong();
      return;
    }
    LOCAL.payload = null; LOCAL.audio = null; LOCAL.stems = null; LOCAL.serverPack = false;
    await cleared; await showSong();
  } catch (err) {
    let back = false;
    try { await cleared; await showSong(true); back = true; } catch { /* песни не было */ }
    notice(`${noticeMessages.cantOpen} ${(err as Error).message}`);
    setTimeout(idle, 8000);
    if (!back) { ui.set({ title: 'Play Song', artist: 'no song open' }); showHint(true); }
  } finally { FLAGS.opening = false; lockInput(false); }
}
export async function readTree(entries: FileSystemEntry[]) {
  const out: DroppedFile[] = [];
  const walk = async (en: FileSystemEntry, depth: number): Promise<void> => {
    if (out.length >= 400) return;
    if (en.isFile) {
      if (!KEEP.test(en.name)) return;
      const f = await new Promise<File | null>((res) => (en as FileSystemFileEntry).file((v) => res(v), () => res(null)));
      if (f) { const d = f as DroppedFile; d.relPath = en.fullPath.replace(/^\//, ''); out.push(d); }
    } else if (en.isDirectory && depth < 4) {
      const rd = (en as FileSystemDirectoryEntry).createReader();
      for (; ;) {
        const batch = await new Promise<FileSystemEntry[]>((res) => rd.readEntries((v) => res(v), () => res([])));
        if (!batch.length) break;
        for (const c of batch) await walk(c, depth + 1);
      }
    }
  };
  for (const en of entries) await walk(en, 0);
  return out;
}
let input: HTMLInputElement | null = null;
export const registerFileInput = (el: HTMLInputElement | null) => { input = el; };
export const pickFiles = () => { if (input) { input.value = ''; input.click(); } };
