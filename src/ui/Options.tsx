import { useIntlayer } from 'react-intlayer';

import { Checkbox } from '../components/Checkbox';
import { useUi } from '../core/store';
import { STATE } from '../core/state';
import { setPref, type PrefKey } from '../core/prefs';
import { applyOffset } from '../core/chart';
import { saveOffset } from '../core/session';
import { clamp } from '../core/util';
import { resetAutoResolution } from '../core/frame';
import { resize } from '../render/surface';

function Toggle({ label, k }: { label: string; k: PrefKey }) {
  const v = useUi((s) => (s as unknown as Record<string, boolean>)[k]);
  return <Checkbox label={label} checked={!!v} onChange={(e) => setPref(k, e.target.checked)} />;
  
  <div className="row">
    <label htmlFor={'f_' + k}>{label}</label>
    <input id={'f_' + k} type="checkbox" checked={!!v} onChange={(e) => setPref(k, e.target.checked)} />
  </div>;
}

export default function Options() {
  const {  
    highwayHeader, noteSpeedTitle, cameraSpeedTitle, beatLinesTitle, fretNumbersTitle, techniqueMarksTitle, lyricsTitle, 
    dynamicCameraTitle, invertStringsTitle, leftHandTitle, fingerPositionTitle, chordNamesTitle, chordDiagramTitle, noteHitLightTitle, 
    performanceHeader, renderScaleTitle, sharpestOption, fastestOption, visualEffectsTitle, autoResolutionTitle,
    syncHeader, noteOffsetTitle, keysHint
  } = useIntlayer("options");

  const open = useUi((s) => s.cfgOpen), speed = useUi((s) => s.noteSpeed), cam = useUi((s) => s.camRate);
  const rscale = useUi((s) => s.rscale), auto = useUi((s) => s.autoScale), dyn = useUi((s) => s.dynScale);
  const off = useUi((s) => s.offMs), msg = useUi((s) => s.offMsg), pack = useUi((s) => s.serverPack), server = useUi((s) => s.server);
  const scales = [1, 0.75, 0.5, 0.35];
  const near = scales.reduce((b, v) => (Math.abs(v - rscale) < Math.abs(b - rscale) ? v : b), scales[0]);
  const nudge = (d: number) => applyOffset(clamp(STATE.offMs + d, -60000, 60000));

  return <div id="cfg" className={open ? 'show' : ''}>
    <h4>{highwayHeader}</h4>
    <div className="row"><label htmlFor="fSpeed">{noteSpeedTitle}<span className="rv" id="rvSpeed">{speed}%</span></label>
      <input id="fSpeed" type="range" min={60} max={200} value={speed} onChange={(e) => setPref('speed', +e.target.value / 100)} />
    </div>
    <div className="row"><label htmlFor="fCam">{cameraSpeedTitle}<span className="rv" id="rvCam">{cam}%</span></label>
      <input id="fCam" type="range" min={30} max={250} value={cam} onChange={(e) => setPref('camRate', +e.target.value / 100)} />
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
    <div className="row"><label htmlFor="fScale">{renderScaleTitle}</label>
      <select id="fScale" value={near} onChange={(e) => setPref('rscale', +e.target.value)}>
        <option value={1}>100% ({sharpestOption})</option>
        <option value={0.75}>75%</option>
        <option value={0.5}>50%</option>
        <option value={0.35}>35% ({fastestOption})</option>
      </select></div>
    <Toggle label={visualEffectsTitle} k="fx" />
    <Checkbox 
      label={`${autoResolutionTitle} ${auto && dyn < 0.999 ? Math.round(dyn * 100) + '%' : ''}`}
      checked={auto}
      onChange={(e) => { resetAutoResolution(); setPref('autoScale', e.target.checked); resize(); }}
    />
    <h4>{syncHeader}</h4>
    <div className="row"><label htmlFor="fOffset">{noteOffsetTitle}</label>
      <div className="offwrap">
        <button className="nudge" onClick={() => nudge(-10)}>−10</button>
        <button className="nudge" onClick={() => nudge(-1)}>−1</button>
        <input id="fOffset" type="number" value={off} min={-60000} max={60000} onChange={(e) => applyOffset(clamp(Math.round(+e.target.value || 0), -60000, 60000))} />
        <button className="nudge" onClick={() => nudge(1)}>+1</button>
        <button className="nudge" onClick={() => nudge(10)}>+10</button>
      </div></div>
    <div className="row" id="saveOffRow" style={{ display: server && pack ? '' : 'none' }}>
      <label>Save into the pack</label><button id="bSaveOff" onClick={() => { void saveOffset(); }}>Save offset</button></div>
    <div className="hint" id="offMsg">{msg}</div>
    <div className="hint">{keysHint}</div>
  </div>;
}