export interface Beat { time: number; measure: number }
export interface Section { name: string; number: number; time: number }
export interface WireNote { t: number; s: number; f: number; sus: number; sl?: number; slu?: number; bn?: number; ho?: boolean; po?: boolean; hm?: boolean; hp?: boolean; pm?: boolean; mt?: boolean; fhm?: boolean; vb?: boolean; tr?: boolean; ac?: boolean; tp?: boolean; ln?: boolean }
export interface WireChord { t: number; id: number; hd?: boolean; notes: WireNote[] }
export interface ChordTemplate { name: string; displayName?: string; display_name?: string; arp?: boolean; fingers: number[]; frets: number[] }
export interface Arrangement {
  id: string; name: string; tuning: number[]; capo: number;
  notes: WireNote[]; chords: WireChord[]; templates: ChordTemplate[];
  anchors: { time: number; fret: number; width: number }[];
  handshapes: { chord_id: number; start_time: number; end_time: number; arp?: boolean }[];
  phrases: { start_time: number; end_time: number; max_difficulty: number }[];
  tones: { base?: string; changes?: { t: number; name: string }[]; names?: Record<string, { raw: string; real: string }> } | null;
}
export type Syllable = [number, number, string];
export interface LyricLine { t: number; end: number; text: string; syl: Syllable[] }
export interface SongMeta { title: string; artist: string; album: string; year: number; duration: number; pack: string; cover: boolean; note_offset_ms: number }
export interface SongPayload {
  meta: SongMeta; arrangements: Arrangement[]; beats: Beat[]; sections: Section[];
  lyrics: { lines: LyricLine[]; source?: string; error?: string }; stems: { id: string; file: string }[];
}
export interface RNote {
  t: number; t0: number; ch: number | undefined; s: number; f: number; sus: number;
  ho: boolean; po: boolean; sl: number; slu: number; bn: number; hm: boolean; hp: boolean;
  pm: boolean; mt: boolean; vb: boolean; tr: boolean; ac: boolean; tp: boolean; ln: boolean;
  rep: boolean; linked: boolean; hide: boolean; lab: boolean; ring?: number;
}
export interface ChordEv { t: number; notes: RNote[]; rep: boolean; sig: string; name: string; mute: boolean; pm: boolean; hold: number; landed?: boolean }
export interface RAnchor { t: number; fret: number; width: number; row: boolean }
export interface RHand { t: number; t1: number; arp: boolean; id: number }
export interface Pill { g: string; f: number; s0: number; s1: number }
export interface Hold { t: number; t1: number; sig: string; name: string; pills: Pill[]; frets: number[]; link: boolean; in0: number }
export interface PhraseBar { t0: number; t1: number; lv: number; w?: number }
export interface LyricBlock { lines: LyricLine[]; show: number; end: number; gone: number; adv: number[]; k?: number }
export interface SynEvent { t: number; n: RNote; m: number; k: number; o: number }
export interface LoadedSong { payload: SongPayload; cover: string; audio: Blob | null; stems: Map<string, Blob> | null }
export type DroppedFile = File & { relPath?: string };