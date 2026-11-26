import { useIntlayer } from 'react-intlayer';

import { Checkbox } from '../components/Checkbox';
import { Slider } from '../components/Slider';
import { Select } from '../components/Select';
import { Tabs, type TabItem } from '../components/Tabs';
import { KeybindingsView } from '../components/KeybindingsView';

import { useUi } from '../core/store';
import { STATE } from '../core/state';
import { setPref, type PrefKey } from '../core/prefs';
import { applyOffset } from '../core/chart';
import { clamp } from '../core/util';
import { resetAutoResolution } from '../core/frame';
import { resize } from '../render/surface';

function Toggle({ label, k }: { label: string; k: PrefKey }) {
  const v = useUi((s) => (s as unknown as Record<string, boolean>)[k]);
  return <Checkbox label={label} checked={!!v} onChange={(e) => setPref(k, e.target.checked)} />;
}

function RenderScaleSelect({ selected }: { selected: number }) {
  const { sharpestOption, fastestOption } = useIntlayer("options");

  let opt = [
    { value: 1, name: `100% (${sharpestOption})` },
    { value: 0.75, name: `75%` },
    { value: 0.5, name: `50%` },
    { value: 0.35, name: `35% (${fastestOption})` },
  ];

  return <Select
    options={opt}
    selectedOption={selected}
    onChange={(value) => { setPref('rscale', +value) }}
  />;
}

function HighwayContent() {
  const {
    noteSpeedTitle, cameraSpeedTitle, beatLinesTitle, fretNumbersTitle, techniqueMarksTitle, lyricsTitle,
    dynamicCameraTitle, invertStringsTitle, leftHandTitle, fingerPositionTitle, chordNamesTitle, chordDiagramTitle, noteHitLightTitle,
    performanceHeader, renderScaleTitle, visualEffectsTitle, autoResolutionTitle
  } = useIntlayer("options");

  const speed = useUi((s) => s.noteSpeed), cam = useUi((s) => s.camRate);
  const rscale = useUi((s) => s.rscale), auto = useUi((s) => s.autoScale), dyn = useUi((s) => s.dynScale);
  const scales = [1, 0.75, 0.5, 0.35];
  const near = scales.reduce((b, v) => (Math.abs(v - rscale) < Math.abs(b - rscale) ? v : b), scales[0]);

  return <div className='col'>
    <div className="row">
      <label htmlFor="fSpeed">{noteSpeedTitle}<span className="rv" id="rvSpeed">{speed}%</span></label>
      <Slider id="fSpeed" min={60} max={200} value={speed} onChange={(e) => setPref('speed', +e.target.value / 100)} />
    </div>
    <div className="row">
      <label htmlFor="fCam">{cameraSpeedTitle}<span className="rv" id="rvCam">{cam}%</span></label>
      <Slider id="fCam" min={30} max={250} value={cam} onChange={(e) => setPref('camRate', +e.target.value / 100)} />
    </div>
    <Toggle label={beatLinesTitle} k="showCells" />
    <Toggle label={fretNumbersTitle} k="showNums" />
    <Toggle label={techniqueMarksTitle} k="showLabels" />
    <Toggle label={lyricsTitle} k="showLyrics" />
    <Toggle label={dynamicCameraTitle} k="autoPan" />
    <Toggle label={invertStringsTitle} k="invert" />
    <Toggle label={leftHandTitle} k="lefty" />
    <Toggle label={fingerPositionTitle} k="showFingers" />
    <Toggle label={chordNamesTitle} k="showChord" />
    <Toggle label={chordDiagramTitle} k="showDiagram" />
    <Toggle label={noteHitLightTitle} k="showHit" />
    <h4>{performanceHeader}</h4>
    <div className="row"><label>{renderScaleTitle}</label>
      <RenderScaleSelect selected={near} />
    </div>
    <Toggle label={visualEffectsTitle} k="fx" />
    <Checkbox
      label={`${autoResolutionTitle} ${auto && dyn < 0.999 ? Math.round(dyn * 100) + '%' : ''}`}
      checked={auto}
      onChange={(e) => { resetAutoResolution(); setPref('autoScale', e.target.checked); resize(); }}
    />
  </div>
}

function PerformanceContent() {
  const { renderScaleTitle, visualEffectsTitle, autoResolutionTitle } = useIntlayer("options");

  const rscale = useUi((s) => s.rscale), auto = useUi((s) => s.autoScale), dyn = useUi((s) => s.dynScale);
  const scales = [1, 0.75, 0.5, 0.35];
  const near = scales.reduce((b, v) => (Math.abs(v - rscale) < Math.abs(b - rscale) ? v : b), scales[0]);

  return <div className='col'>
    <div className="row"><label>{renderScaleTitle}</label>
      <RenderScaleSelect selected={near} />
    </div>
    <Toggle label={visualEffectsTitle} k="fx" />
    <Checkbox
      label={`${autoResolutionTitle} ${auto && dyn < 0.999 ? Math.round(dyn * 100) + '%' : ''}`}
      checked={auto}
      onChange={(e) => { resetAutoResolution(); setPref('autoScale', e.target.checked); resize(); }}
    />
  </div>
}

function SyncContent() {
  const { noteOffsetTitle } = useIntlayer("options");

  const off = useUi((s) => s.offMs);
  const msg = useUi((s) => s.offMsg);
  const nudge = (d: number) => applyOffset(clamp(STATE.offMs + d, -60000, 60000));

  return <div className='col'>
    <div className="row"><label htmlFor="fOffset">{noteOffsetTitle}</label>
      <div className="offwrap">
        <button className="nudge" onClick={() => nudge(-10)}>−10</button>
        <button className="nudge" onClick={() => nudge(-1)}>−1</button>
        <input id="fOffset" type="number" value={off} min={-60000} max={60000} onChange={(e) => applyOffset(clamp(Math.round(+e.target.value || 0), -60000, 60000))} />
        <button className="nudge" onClick={() => nudge(1)}>+1</button>
        <button className="nudge" onClick={() => nudge(10)}>+10</button>
      </div>
    </div>
    <div className="hint" id="offMsg">{msg}</div>
  </div>
}

function ControlsContent() {
  return <KeybindingsView />;
}

export default function Options() {
  const open = useUi((s) => s.cfgOpen);

  const {
    highwayHeader, performanceHeader, syncHeader, controlsHeader
  } = useIntlayer("options");

  const tabsData: TabItem[] = [
    {
      id: 'visual',
      label: highwayHeader,
      content: <HighwayContent />,
    },
    {
      id: 'performance',
      label: performanceHeader,
      content: <PerformanceContent />,
    },
    {
      id: 'sync',
      label: syncHeader,
      content: <SyncContent />,
    },
    {
      id: 'controls',
      label: controlsHeader,
      content: <ControlsContent />,
    }
  ];

  return <div id="cfg" className={open ? 'show' : ''}>
    <Tabs items={tabsData} />
  </div>;
}