import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useIntlayer } from 'react-intlayer';

import { useUi, onFrame } from '../core/store';
import { buildTabLayout, tabTimeAt } from '../tab/model';
import { createTabDom, tabFollow, tabSvg, type TabDom } from '../tab/svg';
import { STATE } from '../core/state';
import { seek } from '../core/audio';
import { inputLocked } from '../core/store';

export default function TabView() {
  const { tabOpen } = useIntlayer("tab");

  const rev = useUi((s) => s.tabRev), on = useUi((s) => s.tabView);
  const view = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null), cur = useRef<HTMLDivElement>(null);
  const dom = useRef<TabDom | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = view.current!, measure = () => setWidth(Math.max(320, el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => { void rev; return on && width >= 320 ? buildTabLayout(width) : null; }, [rev, on, width]);
  const html = useMemo(() => (layout ? tabSvg(layout) : ''), [layout]);

  useLayoutEffect(() => {
    if (!layout || !view.current || !cur.current || !host.current) { dom.current = null; return; }
    dom.current = createTabDom(view.current, cur.current, host.current, layout);
    tabFollow(dom.current);
  }, [layout, html]);

  useEffect(() => { if (!on) return; return onFrame(() => { if (dom.current) tabFollow(dom.current); }); }, [on]);

  const hold = () => {
    if (dom.current)
      dom.current.holdUntil = performance.now() + 5000;
  };

  return <div id="tabview" ref={view} onWheel={hold} onTouchMove={hold}
    onKeyDown={(e) => { if (/Page|Arrow|Home|End/.test(e.key)) hold(); }}
    onClick={(e) => {
      if (inputLocked() || !layout) 
        return;
      const svg = (e.target as Element).closest?.('svg.tabrow') as SVGElement | null;
      if (!svg) 
        return;
      const row = +(svg.dataset.row || 0), r = svg.getBoundingClientRect();
      const t = tabTimeAt(layout, row, e.clientX - r.left);
      if (dom.current) 
        dom.current.holdUntil = 0;
      seek(Math.max(0, t - 0.05 + STATE.offMs / 1000));
    }}>
    <div id="tabpage" style={{ height: layout ? layout.height : undefined }}>
      {layout ? <div ref={host} dangerouslySetInnerHTML={{ __html: html }} /> : <div className="tabempty">{tabOpen}</div>}
      <div id="tabcur" ref={cur} />
    </div>
  </div>;
}