import { useEffect } from 'react';
import { STATE } from '../core/state';
import { ui, inputLocked } from '../core/store';
import { seek, togglePlay } from '../core/audio';
import { unlockAudio } from '../core/audio';
import { sectionAt, applyOffset, selectArrangement } from '../core/chart';
import { setPref, savePrefs } from '../core/prefs';
import { clamp } from '../core/util';
import { openDropped, readTree } from '../core/files';
import { SERVER } from '../core/session';
import type { DroppedFile } from '../types';

export function useGlobalInput() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (inputLocked()) { e.preventDefault(); return; }
      const el = e.target as HTMLElement;
      if (el.tagName === 'SELECT' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range')) return;
      const k = e.key;
      if (el.tagName === 'INPUT' && k.startsWith('Arrow')) return;
      if (k === ' ') { e.preventDefault(); togglePlay(); }
      else if (unlockAudio()) return;
      else if (k === 'm' || k === 'M') setPref('muted', !STATE.muted);
      else if (k === 'c' || k === 'C') setPref('clickOn', !STATE.clickOn);
      else if (k === 'n' || k === 'N') setPref('synthOn', !STATE.synthOn);
      else if (k === 't' || k === 'T') setPref('tabView', !STATE.tabView);
      else if (k === 'ArrowLeft') seek(STATE.time - (e.shiftKey ? 5 : 1));
      else if (k === 'ArrowRight') seek(STATE.time + (e.shiftKey ? 5 : 1));
      else if (k === '[') {
        const s = sectionAt(STATE.time - 0.25);
        seek(s ? (s.start > STATE.time - 0.6 ? (sectionAt(s.start - 0.1) || s).start : s.start) : 0);
      } else if (k === ']') {
        const s = sectionAt(STATE.time + 0.05);
        if (s && s.idx + 1 < STATE.sections.length) seek(STATE.sections[s.idx + 1].time);
      } else if (k === 'l' || k === 'L') document.getElementById('bLoop')?.click();
      else if (k === 'r' || k === 'R') seek(0);
      else if (k === 'o' || k === 'O') ui.set({ cfgOpen: !ui.get().cfgOpen });
      else if (k === ',') applyOffset(STATE.offMs - 1);
      else if (k === '.') applyOffset(STATE.offMs + 1);
      else if (k >= '1' && k <= '6') { const i = +k - 1; if (i < STATE.arrs.length) selectArrangement(i); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (inputLocked()) { e.preventDefault(); return; }
      const t = e.target as HTMLElement;
      if (t.closest?.('#bar, #cfg')) return;
      e.preventDefault();
      STATE.zoom = clamp(STATE.zoom * (e.deltaY < 0 ? 1.06 : 0.94), 0.55, 3);
      ui.set({ zoom: STATE.zoom }); savePrefs();
    };
    const unlock = () => { unlockAudio(); };
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointerdown', unlock, true);
    return () => { window.removeEventListener('wheel', onWheel); window.removeEventListener('pointerdown', unlock, true); };
  }, []);

  useEffect(() => {
    let depth = 0;
    const has = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const enter = (e: DragEvent) => { if (!has(e)) return; e.preventDefault(); if (inputLocked()) return; depth++; ui.set({ dropActive: true }); };
    const over = (e: DragEvent) => { if (!has(e)) return; e.preventDefault(); e.dataTransfer!.dropEffect = inputLocked() ? 'none' : 'copy'; };
    const leave = (e: DragEvent) => { if (!has(e)) return; if (--depth <= 0) { depth = 0; ui.set({ dropActive: false }); } };
    const drop = (e: DragEvent) => {
      if (!has(e)) return;
      e.preventDefault(); depth = 0; ui.set({ dropActive: false });
      if (inputLocked()) return;
      const ents = [...(e.dataTransfer!.items || [])].map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean) as FileSystemEntry[];
      if (ents.some((x) => x.isDirectory)) { readTree(ents).then((l) => { if (l.length) void openDropped(l, SERVER.on); }); return; }
      const files = [...(e.dataTransfer!.files || [])] as DroppedFile[];
      if (files.length) void openDropped(files, SERVER.on);
    };
    window.addEventListener('dragenter', enter); window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave); window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter); window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop);
    };
  }, []);
}