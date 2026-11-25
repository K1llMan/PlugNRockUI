import { STATE, chartTime } from '../core/state';
import { clamp, lowerBound, secLabel } from '../core/util';
import { TABK, tabBarAt, tabXAt, type TabLayout, type TabRow } from './model';

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const wave = (xa: number, xb: number, y: number) => {
  let d = `M${xa},${y}`;
  for (let x = xa, k = 0; x < xb; x += 4, k++) d += `L${x + 2},${y + (k & 1 ? 2 : -2)} L${x + 4},${y}`;
  return `<path d="${d}" class="tthin"/>`;
};
function nextOn(l: TabLayout, idx: number, s: number, tEnd: number, fret: number) {
  for (let i = idx + 1; i < l.evs.length && l.evs[i].t <= tEnd + 0.25; i++) {
    const m = l.evs[i].notes.find((n) => n.s === s);
    if (m) return m.f === fret ? l.evs[i] : null;
  }
  return null;
}
export function tabRowSvg(row: TabRow, width: number, nStr: number, l: TabLayout) {
  const ST = TABK.STR, sTop = row.staffTop, sBot = row.staffBot;
  const yS = (s: number) => sTop + (nStr - 1 - s) * ST;
  const L: string[] = [], x0 = row.bars[0].x0, x1 = row.bars[row.bars.length - 1].x1;
  for (let s = 0; s < nStr; s++) L.push(`<line x1="${x0}" x2="${x1}" y1="${yS(s)}" y2="${yS(s)}" class="tl"/>`);
  for (const b of row.bars) {
    L.push(`<line x1="${b.x0}" x2="${b.x0}" y1="${sTop}" y2="${sBot}" class="tb"/>`);
    L.push(`<text x="${b.x0 + 2}" y="${sTop - 6}" class="tn">${b.num}</text>`);
  }
  L.push(`<line x1="${x1}" x2="${x1}" y1="${sTop}" y2="${sBot}" class="tb"/>`);
  const rt0 = row.bars[0].t0, rt1 = row.bars[row.bars.length - 1].t1;
  let lastSecX = -1e9;
  for (const sec of STATE.sections) {
    if (sec.time < rt0 - 1e-3 || sec.time >= rt1) continue;
    const b = tabBarAt(l, sec.time); if (!b || b.row !== row.idx) continue;
    const x = Math.max(tabXAt(b, sec.time) - 6, lastSecX + 70); lastSecX = x;
    L.push(`<text x="${x}" y="14" class="tsec">${esc(secLabel(sec.name))}</text>`);
  }
  const evs = row.bars.flatMap((b) => b.evs), yPM = 42, yVib = 53, yBend = 63;
  let run: { x0: number; x1: number } | null = null;
  const flush = () => {
    if (!run) return;
    L.push(`<text x="${run.x0 - 9}" y="${yPM}" class="tpml">P.M.</text>`);
    if (run.x1 - run.x0 > 22) {
      L.push(`<line x1="${run.x0 + 18}" x2="${run.x1 + 8}" y1="${yPM - 4}" y2="${yPM - 4}" class="tdash"/>`);
      L.push(`<line x1="${run.x1 + 8}" x2="${run.x1 + 8}" y1="${yPM - 8}" y2="${yPM}" class="tthin"/>`);
    }
    run = null;
  };
  for (const e of evs) {
    const pm = e.notes.every((n) => n.pm && !n.mt) || (e.notes.some((n) => n.pm) && e.notes.every((n) => n.pm || n.mt));
    if (pm) { if (run && e.x - run.x1 < 70) run.x1 = e.x; else { flush(); run = { x0: e.x, x1: e.x }; } } else flush();
  }
  flush();
  const lastOn: ({ x: number; n: (typeof evs)[number]['notes'][number] } | null)[] = new Array(8).fill(null);
  for (const e of evs) {
    const x = e.x;
    if (e.name) L.push(`<text x="${x}" y="28" class="tch">${esc(e.name)}</text>`);
    let ya = Infinity, yb = -Infinity, wmax = 1;
    for (const n of e.notes) {
      const y = yS(clamp(n.s, 0, nStr - 1));
      ya = Math.min(ya, y); yb = Math.max(yb, y);
      wmax = Math.max(wmax, n.hm || n.linked ? String(n.f).length + 2 : String(n.f).length);
    }
    const hw0 = 3.8 * wmax + 5;
    L.push(`<g class="te" data-e="${e.idx}"><rect class="thl" x="${x - hw0}" y="${ya - 8}" width="${hw0 * 2}" height="${yb - ya + 16}" rx="4"/>`);
    const marks: string[] = [];
    for (const n of e.notes) {
      const s = clamp(n.s, 0, nStr - 1), y = yS(s), prev = lastOn[s];
      let txt = n.mt ? 'X' : String(n.f);
      if (n.hm && !n.mt) txt = '<' + n.f + '>';
      if (n.linked && prev && prev.n.f === n.f && !n.mt) txt = '(' + n.f + ')';
      L.push(`<text x="${x}" y="${y + 4.5}" class="tf">${esc(txt)}</text>`);
      const hw = 3.6 * txt.length + 1;
      if ((n.ho || n.po) && prev && x - prev.x < 160) {
        const xa = prev.x + 3, xb = x - 3;
        L.push(`<path d="M${xa},${y - 7} Q${(xa + xb) / 2},${y - 16} ${xb},${y - 7}" class="tarc"/>`);
      }
      const tgt = n.sl > 0 ? n.sl : n.slu > 0 ? n.slu : 0;
      if (tgt && n.f > 0) {
        const dy = tgt > n.f ? -3.5 : 3.5, nx = nextOn(l, e.idx, s, n.t + n.sus, n.sl);
        if (n.sl > 0 && nx && nx.row === row.idx && nx.x - x < 220) L.push(`<line x1="${x + hw + 1}" y1="${y - dy}" x2="${nx.x - hw - 1}" y2="${y + dy}" class="tslide"/>`);
        else L.push(`<line x1="${x + hw + 1}" y1="${y - dy}" x2="${x + hw + 10}" y2="${y + dy}" class="tslide"/>`);
      }
      if (n.bn > 0) {
        const lbl = n.bn === 2 ? 'full' : n.bn === 1 ? '½' : n.bn === 0.5 ? '¼' : n.bn === 3 ? '1½' : n.bn === 4 ? '2' : String(n.bn / 2);
        const xt = x + hw + 8;
        L.push(`<path d="M${x + hw},${y - 3} Q${xt},${y - 3} ${xt},${sTop - 9}" class="tbend"/>`);
        L.push(`<path d="M${xt - 3},${sTop - 5} L${xt},${sTop - 11} L${xt + 3},${sTop - 5} Z" class="tarrow"/>`);
        L.push(`<text x="${xt}" y="${yBend - 1}" class="tbl">${lbl}</text>`);
      }
      if (n.vb) {
        const be = tabBarAt(l, n.t + Math.max(n.sus, 0.2));
        const xe = be && be.row === row.idx ? Math.max(x + 18, tabXAt(be, n.t + Math.max(n.sus, 0.2))) : Math.max(x + 18, l.bars[e.bar].x1 - 4);
        marks.push(wave(x - 4, xe, yVib));
      }
      if (n.tr) marks.push(`<path d="M${x - 5},${yVib + 4} l4,-6 M${x - 1},${yVib + 4} l4,-6 M${x + 3},${yVib + 4} l4,-6" class="tthin"/>`);
      if (n.tp) marks.push(`<text x="${x}" y="${yPM}" class="tpm">T</text>`);
      if (n.hp) marks.push(`<text x="${x}" y="${yPM}" class="tpm">P.H.</text>`);
      if (n.ac) marks.push(`<text x="${x}" y="${yVib + 3}" class="tacc">&gt;</text>`);
      lastOn[s] = { x, n };
    }
    L.push('</g>');
    for (const m of [...new Set(marks)]) L.push(m);
  }
  const rTop = sBot + 9, rBot = rTop + 19;
  for (const e of evs) {
    L.push(`<line x1="${e.x}" x2="${e.x}" y1="${rTop}" y2="${rBot}" class="tstem"/>`);
    if (e.val[3]) L.push(`<circle cx="${e.x + 4}" cy="${rBot - 2}" r="1.3" class="tdot"/>`);
  }
  for (let i = 0; i < evs.length;) {
    const e = evs[i];
    if (!e.val[1]) { i++; continue; }
    const beat = Math.floor(e.beat + 1e-3);
    let j = i;
    while (j + 1 < evs.length && evs[j + 1].val[1] && Math.floor(evs[j + 1].beat + 1e-3) === beat && evs[j + 1].bar === e.bar) j++;
    const grp = evs.slice(i, j + 1);
    for (let lv = 1; lv <= 3; lv++) {
      const y = rBot - (lv - 1) * 4;
      for (let g = 0; g < grp.length; g++) {
        if (grp[g].val[1] < lv) continue;
        if (g + 1 < grp.length && grp[g + 1].val[1] >= lv) L.push(`<line x1="${grp[g].x}" x2="${grp[g + 1].x}" y1="${y}" y2="${y}" class="tbeam"/>`);
        else if (!(g > 0 && grp[g - 1].val[1] >= lv)) {
          const dir = g + 1 < grp.length ? 1 : -1;
          L.push(`<line x1="${grp[g].x}" x2="${grp[g].x + 7 * dir}" y1="${y}" y2="${y}" class="tbeam"/>`);
        }
      }
    }
    if (grp.length > 1 && grp.every((q) => q.val[2])) {
      const xa = grp[0].x, xb = grp[grp.length - 1].x;
      L.push(`<path d="M${xa},${rBot + 4} v3 H${xb} v-3" class="tthin"/><text x="${(xa + xb) / 2}" y="${rBot + 14}" class="ttri">3</text>`);
    }
    i = j + 1;
  }
  const yL = rBot + TABK.LYR + 4;
  let lastEnd = -1e9;
  for (const ln of STATE.lyrics) {
    if (ln.end < rt0 || ln.t >= rt1) continue;
    for (const sy of ln.syl) {
      const [t, , text] = sy;
      if (t < rt0 - 1e-3 || t >= rt1) continue;
      const b = tabBarAt(l, t); if (!b || b.row !== row.idx) continue;
      const w = String(text).trim(); if (!w) continue;
      let x = tabXAt(b, t);
      const cont = !/^\s/.test(text) && sy !== ln.syl[0];
      if (x < lastEnd + 4) x = lastEnd + 4;
      const tw = (w.length + (cont ? 1 : 0)) * 6.4, si = l.sylIdx.get(sy);
      L.push(`<g class="tsy"${si !== undefined ? ` data-s="${si}"` : ''}><rect class="tsh" x="${(x - 4).toFixed(1)}" y="${yL - 12}" width="${(tw + 8).toFixed(1)}" height="16" rx="3"/>`
        + `<text x="${(x + tw / 2).toFixed(1)}" y="${yL}" class="tly" text-anchor="middle">${cont ? '-' : ''}${esc(w)}</text></g>`);
      lastEnd = x + tw;
    }
  }
  return `<svg class="tabrow" data-row="${row.idx}" style="top:${row.top}px" width="${width}" height="${row.h}" viewBox="0 0 ${width} ${row.h}">${L.join('')}</svg>`;
}
export const tabSvg = (l: TabLayout) => l.rows.map((r) => tabRowSvg(r, l.width, l.nStr, l)).join('');

export interface TabDom { view: HTMLElement; cur: HTMLElement; groups: (SVGGElement | undefined)[]; sylEls: (SVGGElement | undefined)[]; lit: Set<number>; sylOn: number; curRow: number; holdUntil: number; snap: boolean; layout: TabLayout }
export function createTabDom(view: HTMLElement, cur: HTMLElement, host: HTMLElement, layout: TabLayout): TabDom {
  const groups: (SVGGElement | undefined)[] = [];
  host.querySelectorAll<SVGGElement>('g.te').forEach((g) => { groups[+g.dataset.e!] = g; });
  const sylEls: (SVGGElement | undefined)[] = [];
  host.querySelectorAll<SVGGElement>('g.tsy[data-s]').forEach((g) => { sylEls[+g.dataset.s!] = g; });
  const gs = [...host.querySelectorAll<SVGGElement>('g.tsy')];
  gs.forEach((g) => g.classList.add('on', 'measure'));
  const boxes = gs.map((g) => { try { return (g.querySelector('text') as SVGTextElement).getBBox(); } catch { return null; } });
  gs.forEach((g, k) => {
    g.classList.remove('on', 'measure');
    const bb = boxes[k], r = g.querySelector('rect');
    if (!bb || !bb.width || !r) return;
    r.setAttribute('x', (bb.x - 4).toFixed(1)); r.setAttribute('width', (bb.width + 8).toFixed(1));
    r.setAttribute('y', (bb.y - 2).toFixed(1)); r.setAttribute('height', (bb.height + 4).toFixed(1));
  });
  return { view, cur, groups, sylEls, lit: new Set(), sylOn: -1, curRow: -1, holdUntil: 0, snap: true, layout };
}
export function tabFollow(d: TabDom) {
  const l = d.layout; if (!l.evs.length) return;
  const t = chartTime(), b = tabBarAt(l, t);
  if (!b || t < l.bars[0].t0) d.cur.style.display = 'none';
  else {
    const row = l.rows[b.row], x = tabXAt(b, Math.min(t, b.t1));
    d.cur.style.display = 'block';
    d.cur.style.height = row.staffBot - row.staffTop + 20 + 'px';
    d.cur.style.transform = `translate(${x.toFixed(1)}px, ${Math.round(row.top + row.staffTop - 10)}px)`;
    if (b.row !== d.curRow) {
      d.curRow = b.row;
      if (performance.now() > d.holdUntil) {
        const want = row.top - d.view.clientHeight * 0.22;
        const snap = d.snap || Math.abs(d.view.scrollTop - want) > d.view.clientHeight * 2;
        d.view.scrollTo({ top: Math.max(0, want), behavior: snap ? 'auto' : 'smooth' });
        d.snap = false;
      }
    }
  }
  const now = new Set<number>();
  for (let k = lowerBound(l.evs, 't', t + 0.005) - 1; k >= 0 && l.evs[k].t > t - l.maxLen - 0.01; k--) if (l.evs[k].end > t) now.add(k);
  for (const k of d.lit) if (!now.has(k)) d.groups[k]?.classList.remove('on');
  for (const k of now) if (!d.lit.has(k)) d.groups[k]?.classList.add('on');
  d.lit = now;
  let sOn = -1;
  if (l.syls.length && STATE.showLyrics) {
    const k = lowerBound(l.syls, 't', t + 0.005) - 1;
    if (k >= 0 && t < l.syls[k].end) sOn = k;
  }
  if (sOn !== d.sylOn) {
    if (d.sylOn >= 0) d.sylEls[d.sylOn]?.classList.remove('on');
    if (sOn >= 0) d.sylEls[sOn]?.classList.add('on');
    d.sylOn = sOn;
  }
}