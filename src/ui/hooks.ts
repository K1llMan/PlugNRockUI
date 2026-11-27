import { useEffect } from 'react';
import { STATE } from '../core/state';
import { ui, inputLocked } from '../core/store';
import { unlockAudio } from '../core/audio';
import { savePrefs } from '../core/prefs';
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
      if (el.tagName === 'INPUT' && k.startsWith('Arrow')) 
        return;
      if (unlockAudio()) 
        return;
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