import { useEffect, useLayoutEffect, useRef } from 'react';
import { useIntlayer } from 'react-intlayer';

import { 
  IconClick, IconGear, IconHeadstock, IconLoop, IconMute, IconNext, IconOpen, IconPause, IconPlay, IconPrev, IconRestart, IconSpeed, IconStem, IconSynth, IconTab 
} from './Icons';
import { Slider } from '../components/Slider';
import { useShortcuts } from '../components/ShortcutsContext';
import { Select } from '../components/Select';

import { useUi, onFrame, ui } from '../core/store';
import { STATE } from '../core/state';
import { clamp, fmt, secColor, secLabel } from '../core/util';
import { seek, setSongSpeed, togglePlay } from '../core/audio';
import { sectionAt, toneKeyAt, toneLabel } from '../core/chart';
import { toggleSectionLoop } from '../core/loop';
import { selectArrangement } from '../core/chart';
import { setPref } from '../core/prefs';
import { changeStem } from '../core/session';
import { pickFiles } from '../core/files';
import { inputLocked } from '../core/store';


function SeekBar() {
  const { noSection } = useIntlayer("bar");

  const sections = useUi((s) => s.sections), tones = useUi((s) => s.toneChanges);
  const duration = useUi((s) => s.duration), offMs = useUi((s) => s.offMs), secIdx = useUi((s) => s.secIdx);
  const tl = useRef<HTMLDivElement>(null), head = useRef<HTMLDivElement>(null), played = useRef<HTMLDivElement>(null);
  const curT = useRef<HTMLDivElement>(null), durT = useRef<HTMLDivElement>(null), hint = useRef<HTMLDivElement>(null), box = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  useEffect(() => onFrame((t) => {
    if (curT.current) curT.current.textContent = fmt(t);
    if (durT.current) durT.current.textContent = fmt(STATE.duration);
    if (!tl.current || !head.current || !played.current) return;
    const x = Math.round(clamp(t / (STATE.duration || 1), 0, 1) * tl.current.clientWidth);
    head.current.style.transform = `translateX(${x}px)`;
    played.current.style.width = x + 'px';
  }), []);
  useLayoutEffect(() => {
    const fit = () => {
      for (const el of Array.from(box.current?.children || []) as HTMLDivElement[]) {
        const sp = el.firstElementChild as HTMLElement | null; if (!sp) continue;
        el.classList.remove('tight');
        if (sp.offsetWidth > el.clientWidth - 8) el.classList.add('tight');
      }
    };
    fit();
    if (!tl.current) return;
    const ro = new ResizeObserver(fit); ro.observe(tl.current);
    return () => ro.disconnect();
  }, [sections, duration, offMs]);
  const D = duration || (STATE.beats.length ? STATE.beats[STATE.beats.length - 1].time + 2 : 1), off = offMs / 1000;
  const cells = sections.map((s, i) => ({ s, i, t0: Math.max(0, s.time + off), t1: i + 1 < sections.length ? sections[i + 1].time + off : D })).filter((c) => c.t1 > c.t0);
  const seekTo = (cx: number) => { const r = tl.current!.getBoundingClientRect(); seek(clamp((cx - r.left) / r.width, 0, 1) * (STATE.duration || 0)); };

  return <div id="seek">
    <div className="t" id="tcur" ref={curT}>0:00</div>
    <div id="tl" ref={tl}
      onPointerDown={(e) => {
        if (inputLocked())
          return;
        drag.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        seekTo(e.clientX);
      }}
      onPointerMove={(e) => {
        const r = tl.current!.getBoundingClientRect(), h = hint.current!;
        const tt = clamp((e.clientX - r.left) / r.width, 0, 1) * (STATE.duration || 0), sec = sectionAt(tt);
        h.style.display = 'block';
        h.style.left = clamp(e.clientX, 60, window.innerWidth - 60) + 'px';
        h.style.top = r.top - 7 + 'px';
        const tone = STATE.tones.changes.length ? toneLabel(toneKeyAt(tt - STATE.offMs / 1000)) : '';
        (h.firstElementChild as HTMLElement).textContent = fmt(tt);
        (h.lastElementChild as HTMLElement).textContent = [sec ? secLabel(sec.name) : '', tone].filter(Boolean).join(' · ');
        if (drag.current)
          seekTo(e.clientX);
      }}
      onPointerUp={() => { drag.current = false; }}
      onPointerLeave={() => { if (hint.current) hint.current.style.display = 'none'; drag.current = false; }}>
      <div id="tlsec" ref={box}>
        {cells.length ? cells.map(({ s, t0, t1, i }) =>
          <div key={i} className={'s' + (i === secIdx ? ' cur' : '')} title={secLabel(s.name)}
            style={{ left: 100 * t0 / D + '%', width: 100 * (t1 - t0) / D + '%', background: secColor(s.name) }}>
            <span>{secLabel(s.name)}</span></div>)
          : <div className="s gap" style={{ left: '0%', width: '100%' }}><span style={{ color: 'var(--on-surface)' }}>{noSection}</span></div>}
      </div>
      <div id="tlplayed" ref={played} />
      <div id="tltone">{tones.map((c, i) => {
        const x = (c.t + off) / D;
        return x < 0 || x > 1
          ? null
          : <div className="tn" key={i} style={{ left: 100 * x + '%' }} />;
      }
      )}</div>
      <div id="tlhead" ref={head} />
    </div>
    <div className="t" id="tdur" ref={durT}>0:00</div>
    <div id="syncoff" className={offMs ? 'on' : ''}>{offMs ? (offMs > 0 ? '+' : '') + offMs + 'ms' : ''}</div>
    <div id="tlhint" ref={hint}><b /><span /></div>
  </div>;
}

function ArrangementSelect({ arrangements, selected }: { arrangements: { name: string }[], selected: number }) {
  let opt = [{ value: 0, name: '-' }];
  if (arrangements.length)
    opt = arrangements
      .map((a: { name: string }, i: number) => {
        return {
          name: a.name || 'arr ' + i,
          value: i
        }
      });

  return <div id="path" className={arrangements.length < 2 ? 'one' : ''}>
    <IconHeadstock />
    <Select
      options={opt}
      selectedOption={selected}
      onChange={(value) => { selectArrangement(+value); }}
    />
  </div>
}

function StemSelect({ stems, selected }: { stems: { id: string }[], selected: string }) {
  let opt = [{ value: "", name: "Full mix" }];

  if (stems.length)
    opt.push(...stems
      .map((s: { id: string }, i: number) => {
        return {
          value: s.id,
          name: s.id.charAt(0).toUpperCase() + s.id.slice(1)
        }
      })
    );

  return <div id="stem" style={{ display: stems.length > 1 ? 'flex' : 'none' }}>
    <IconStem />
    <Select
      options={opt}
      selectedOption={selected}
      onChange={(value) => { void changeStem(value); }}
    />
  </div>
}

export default function Bar() {
  const {
    tuningHint, tabTitle, songSpeedHint, openSongHint, openTitle
  } = useIntlayer("bar");

  const shortcuts = useShortcuts();

  const s = useUi((x) => x);
  return <div id="bar">
    <SeekBar />
    <div id="ctl">
      <div id="song">
        <div id="cover">{s.hasArt && s.cover ? <img src={s.cover} alt="" /> : <div className="ph">NO ART</div>}</div>
        <div id="meta">
          <div id="title">{s.title}</div>
          <div id="sub"><span id="artist">{s.artist}</span><span id="album">{s.album}</span></div>
          <div id="tuning" title={tuningHint}>
            {s.tuning ? <><b>{s.tuning.name}</b>{' · ' + s.tuning.notes + (s.tuning.capo ? ' · ' + s.tuning.capo : '')}</> : ''}
          </div>
        </div>
      </div>
      <div id="btns">
        <div className="stack">
          <ArrangementSelect arrangements={s.arrs} selected={s.arrIdx} />
          <StemSelect stems={s.stems} selected={s.stemId} />
        </div>
        <button className="ib" id="bRestart" title={shortcuts.tooltip('restart')} onClick={() => seek(0)}><IconRestart /></button>
        <button className="ib" id="bPrev" title={shortcuts.tooltip('prevSection')} onClick={() => { const x = sectionAt(STATE.time - 0.25); seek(x ? x.start : 0); }}><IconPrev /></button>
        <button className={'ib' + (s.playing ? ' on' : '')} id="bPlay" title={shortcuts.tooltip('playPause')} onClick={togglePlay}>{s.playing ? <IconPause /> : <IconPlay />}</button>
        <button className="ib" id="bNext" title={shortcuts.tooltip('nextSection')} onClick={() => {
          const x = sectionAt(STATE.time + 0.05);
          if (x && x.idx + 1 < STATE.sections.length)
            seek(STATE.sections[x.idx + 1].time);
          else
            seek(STATE.duration - 0.05);
        }}><IconNext /></button>
        <button className={'ib' + (s.loop ? ' on' : '')} id="bLoop" title={shortcuts.tooltip('loopSection')} onClick={toggleSectionLoop}><IconLoop /></button>
        <button className={'ib' + (s.tabView ? ' on' : '')} id="bTab" title={shortcuts.tooltip('tabView')} onClick={() => setPref('tabView', !STATE.tabView)}><IconTab /><span>{tabTitle}</span></button>
      </div>

      <div id="tools">
        <div className="stack">
          <div className="vol">
            <button className={'ib' + (s.muted ? ' on' : '')} id="bMute" title={shortcuts.tooltip('mute')} onClick={() => setPref('muted', !STATE.muted)}><IconMute on={s.muted} /></button>
            <Slider min={0} max={100} value={s.master} onChange={(e) => setPref('master', +e.target.value / 100)} />
            <span className="val" id="lMaster">{s.master}</span>
          </div>
          <div className="vol" id="spd">
            <button className="ib" id="bSpeed" title={songSpeedHint} onClick={() => { void setSongSpeed(1); }}><IconSpeed /></button>
            <Slider min={20} max={100} value={s.songRate} onChange={(e) => { void setSongSpeed(+e.target.value / 100); }} />
            <span className="val" id="lSpeed">{s.songRate}%</span>
          </div>
        </div>
        <div className="stack">
          <div className="vol">
            <button className={'ib' + (s.clickOn ? ' on' : '')} id="bClick" title={shortcuts.tooltip('metronome')} onClick={() => setPref('clickOn', !STATE.clickOn)}><IconClick /></button>
            <Slider min={0} max={100} value={s.clickLevel} onChange={(e) => setPref('clickLevel', +e.target.value / 100)} />
            <span className="val" id="lClick">{s.clickLevel}</span>
          </div>
          <div className="vol">
            <button className={'ib' + (s.synthOn ? ' on' : '')} id="bSynth" title={shortcuts.tooltip('noteSynth')} onClick={() => setPref('synthOn', !STATE.synthOn)}><IconSynth /></button>
            <Slider min={0} max={100} value={s.synthLevel} onChange={(e) => setPref('synthLevel', +e.target.value / 100)} />
            <span className="val" id="lSynth">{s.synthLevel}</span>
          </div>
        </div>
        <div id="stats">
          <div id="bpm">{s.bpm ? s.bpm.toFixed(1) : '—'}</div>
          <div id="fps">{s.fps} FPS{s.autoScale && s.dynScale < 0.999 ? ' · ' + Math.round(s.dynScale * 100) + '%' : ''}</div>
        </div>
        <button className="ib" id="bOpen" title={openSongHint} onClick={pickFiles}><IconOpen /><span>{openTitle}</span></button>
        <button className={'ib' + (s.cfgOpen ? ' on' : '')} id="bCfg" title={shortcuts.tooltip('options')} onClick={() => ui.set({ cfgOpen: !s.cfgOpen })}><IconGear /></button>
      </div>
    </div>
  </div>;
}