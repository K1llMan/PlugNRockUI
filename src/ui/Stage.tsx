import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useIntlayer,  } from 'react-intlayer';
import { useHTMLRenderer } from "react-intlayer/html";

import { useUi } from '../core/store';
import { onFrame } from '../core/store';
import { STATE, chartTime } from '../core/state';
import { attachCanvas, resize } from '../render/surface';
import { BARS, barAt, barSeek, inBars } from '../render/parts';
import { SEL, barDragEnd, barDragMove, barDragStart, clearLoopBars } from '../core/loop';
import { seek } from '../core/audio';
import { inputLocked } from '../core/store';
import { clamp } from '../core/util';
import { pickFiles } from '../core/files';
import { IconDrop } from './Icons';
import type { LyricBlock } from '../types';

function HighwayCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    attachCanvas(ref.current!);
    const r = () => resize();
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  return <canvas id="hw" ref={ref}
    onPointerMove={(e) => {
      if (inputLocked())
        return;
      const [x, y] = pos(e);
      if (SEL.drag) {
        barDragMove(barAt(x));
        return;
      }

      e.currentTarget.style.cursor = inBars(x, y) ? 'pointer' : 'default';
    }}
    onPointerDown={(e) => {
      if (inputLocked() || e.button !== 0)
        return;
      const [x, y] = pos(e);
      if (!inBars(x, y)) {
        clearLoopBars();
        return;
      }
      barDragStart(barAt(x), x);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      catch { /* не поддерживается */ }
    }}
    onPointerUp={() => barDragEnd(false, barSeek)}
    onPointerCancel={() => barDragEnd(true, barSeek)} />;
}

function Lyrics() {
  const box = useRef<HTMLDivElement>(null), track = useRef<HTMLDivElement>(null);
  const lines = useRef<HTMLDivElement[]>([]);
  const idx = useRef(-1), pending = useRef<{ k: number } | null>(null);
  const [bi, setBi] = useState(-1);
  const block: LyricBlock | null = bi >= 0 ? STATE.lyrPairs[bi] || null : null;
  const place = (b: LyricBlock, k: number, instant: boolean) => {
    const tr = track.current; if (!tr) return;
    const jump = instant || b.k === undefined || b.k < 0 || k !== b.k + 1;
    b.k = k;
    if (jump) { tr.style.transition = 'none'; for (const el of lines.current) el && (el.style.transition = 'none'); }
    lines.current.forEach((el, j) => el && el.classList.toggle('out', j < k || j > k + 1));
    const el = lines.current[k];
    tr.style.transform = `translateY(${el ? -el.offsetTop : 0}px)`;
    if (jump) { void tr.offsetWidth; tr.style.transition = ''; for (const e of lines.current) e && (e.style.transition = ''); }
  };

  const paint = (b: LyricBlock, j: number, t: number) => {
    const el = lines.current[j], line = b.lines[j]; if (!el || !line) return;
    const st = t < line.t - 0.02 ? 'next' : t > line.end + 0.12 ? 'done' : 'live';
    const cls = 'ln ' + st + (j < (b.k ?? 0) || j > (b.k ?? 0) + 1 ? ' out' : '');
    if (el.className !== cls) el.className = cls;
    if (st !== 'live') { for (const sp of Array.from(el.children) as HTMLSpanElement[]) if (sp.className) sp.className = ''; return; }
    let cur = -1;
    for (let i = 0; i < line.syl.length; i++) if (line.syl[i][0] <= t + 0.02) cur = i;
    for (let i = 0; i < el.children.length; i++) {
      const c = i < cur ? 'sung' : i === cur ? 'now' : '', sp = el.children[i] as HTMLSpanElement;
      if (sp.className !== c) sp.className = c;
    }
  };

  useLayoutEffect(() => {
    lines.current = Array.from(track.current?.children || []) as HTMLDivElement[];
    const b = bi >= 0 ? STATE.lyrPairs[bi] : null;
    if (b && pending.current) {
      place(b, pending.current.k, true);
      const t = chartTime();
      for (let j = 0; j < b.lines.length; j++) paint(b, j, t);
      pending.current = null;
    }
  }, [bi]);

  useEffect(() => onFrame(() => {
    const el = box.current;
    if (!el)
      return;
    const hide = () => {
      if (idx.current !== -1) {
        idx.current = -1;
        setBi(-1);
      }
      el.style.display = 'none';
    };

    if (!STATE.showLyrics || !STATE.lyrPairs.length)
      return hide();

    const t = chartTime(), Bs = STATE.lyrPairs;
    let lo = 0, hi = Bs.length - 1, i = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (Bs[m].show <= t) { i = m; lo = m + 1; } else hi = m - 1; }
    if (i < 0)
      return hide();
    const b = Bs[i];
    if (t > b.gone)
      return hide();
    let k = 0;
    while (k < b.adv.length && t >= b.adv[k])
      k++;

    if (i !== idx.current) {
      idx.current = i;
      b.k = -1;
      pending.current = { k };
      el.style.display = 'block';
      setBi(i);
      return;
    }

    if (!lines.current.length)
      return;

    if (k !== b.k)
      place(b, k, false);
    el.style.opacity = (clamp(Math.min((t - b.show) / 0.3, (b.gone - t) / 0.6), 0, 1) * STATE.vis).toFixed(3);
    for (let j = Math.max(0, k - 1); j <= Math.min(b.lines.length - 1, k + 2); j++)
      paint(b, j, t);
  }), []);

  return <div id="lyr" ref={box}><div id="lyrTrack" ref={track}>
    {block?.lines.map((ln, i) => <div className="ln next" key={i}>{ln.syl.map((s, j) => <span key={j}>{s[2]}</span>)}</div>)}
  </div></div>;
}

function Hud() {
  const { arrangement, section, toneStr, toneSwitch, noteSpeed } = useIntlayer("stage");

  const arrs = useUi((s) => s.arrs), arrIdx = useUi((s) => s.arrIdx), secIdx = useUi((s) => s.secIdx);
  const secName = useUi((s) => s.secName), tone = useUi((s) => s.tone), speed = useUi((s) => s.noteSpeed), has = useUi((s) => s.hasSong);

  return <div id="hud">
    <div className="k">{arrangement}</div>
    <div className="v" id="hudArr">{has ? arrs[arrIdx]?.name || '—' : '—'}</div>
    <div id="hudSecRow" style={{ display: secIdx >= 0 ? '' : 'none' }}>
      <div className="k">{section}</div>
      <div className="v" id="hudSec">{secName || '—'}</div>
    </div>
    <div id="hudToneRow" className={tone?.flash ? 'flash' : ''} style={{ display: tone ? '' : 'none' }}>
      <div className="k" id="hudToneK">{tone?.first ? toneStr : toneSwitch}</div>
      <div className="v tone" id="hudTone">{tone?.label}</div>
      <div className="raw" id="hudRaw">{tone?.raw}</div>
    </div>
    <div className="k">{noteSpeed}</div><div className="v" id="hudSpd">{speed}%</div>
  </div>;
}

export default function Stage({ children }: { children?: React.ReactNode }) {
  const { appName } = useIntlayer("common");
  const { 
    lyricError, dropSong, dropMsg1, dropMsg2, chooseFile, legalHint 
  } = useIntlayer("stage");
  const renderHTML = useHTMLRenderer();

  const legalHintText = legalHint.value.replace("{{appName}}", appName);

  const tab = useUi((s) => s.tabView);
  const msg = useUi((s) => s.msg);
  const kind = useUi((s) => s.msgKind);
  const hint = useUi((s) => s.hint);
  const err = useUi((s) => s.lyricError);

  return <div id="stage" className={tab ? 'tabmode' : ''}>
    <HighwayCanvas />
    {children}
    <Lyrics />
    <div id="lyrErr" className={err ? 'show' : ''}><b>[{lyricError}]</b><span id="lyrErrWhy">{err}</span></div>
    <Hud />
    <div id="msg" className={kind === 'hide' ? 'hide' : kind === 'plain' ? 'plain' : ''}>
      <div className="spin" /><span id="msgTxt">{msg}</span>
    </div>
    <div id="hint" className={hint ? '' : 'hide'}>
      <IconDrop />
      <h2>{dropSong}</h2>
      <p>{dropMsg1}</p>
      <p className="sub">{dropMsg2}</p>
      <button id="hintPick" onClick={pickFiles}>{chooseFile}</button>
      <div id="hintLegal">{renderHTML(legalHintText)}</div>
    </div>
  </div>;
}