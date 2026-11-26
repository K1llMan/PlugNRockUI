import { CAM_EASE, FING_MOVE, FING_Z, FW, GREY_NOTE, INLAY, LANE, LOOK, LOOK_BACK, NECK_END, PITCH, YLO, ZFAR } from '../core/const';
import { G, STATE, type EngineState } from '../core/state';
import { clamp, lerp, lowerBound, rgba, sstep, sustained, tint } from '../core/util';
import { dpr, glow, rr } from './surface';
import type { Pt } from './surface';
import { fretMid, fretX, makeCam, neckAxes, project } from './camera';
import type { Cam } from './camera';
import { drawHead, headFrame, label, setSkew } from './sprites';
import { bendY, chordName, drawChordBox, drawChordDiagram, drawHitLight, drawPhraseBars, drawPill, drawTail, fingerPills, nameY, noteX, numFadeIn, vibY } from './parts';
import { anchorIdx } from '../core/chart';
import type { ChordEv, RAnchor, RNote } from '../types';

/** Статическая конфигурация рендера: палитра и константы грифа. */
export interface HighwayConfig {
  /** Цвета струн, от нижней к верхней. */
  laneColors: string[];
  /** Цвет струны, для которой в палитре нет места. */
  fallbackLane: string;
  /** Цвет нот вне активного цикла. */
  greyColor: string;
  /** Лады с декоративными инлеями. */
  inlays: Set<number>;
  /** Номер последнего лада (длина грифа). */
  maxFret: number;
  /** Окно захвата камеры по времени, сек. */
  lookAhead: number;
  lookBack: number;
}

export const DEFAULT_HIGHWAY_CONFIG: HighwayConfig = {
  laneColors: LANE, fallbackLane: '#9aa7b2', greyColor: GREY_NOTE,
  inlays: INLAY, maxFret: 24, lookAhead: LOOK, lookBack: LOOK_BACK,
};

/** Один элемент упорядоченного «слоя» нот/аккордов, летящих к камере. */
interface DrawItem { d: number; n: RNote | null; ev: ChordEv | null }
/** Последняя взятая нота на струне (для колебания и подсветки). */
interface LaneHit { still: boolean; n: RNote; age: number; held: boolean }
/** Горизонтальный кусок грифа между двумя «разрезами» (долями/анкерами). */
interface BoardSeg { f0: number; f1: number; z0: number; z1: number; al: number; k: number }

/** Всё, что посчитано один раз на кадр и передаётся в проходы отрисовки. */
interface View {
  W: number; H: number;
  t: number; tEnd: number; off0: number; nStr: number;
  A: RAnchor[]; ai: number; curA: RAnchor;
  cam: Cam;
  P(x: number, y: number, z: number): Pt | null;
  yOf(s: number): number; yTop: number; yBot: number;
  /** Время → координата глубины. */
  zOf(tau: number): number;
  /** Время → затухание вдали (с учётом общей видимости). */
  fog(tau: number): number;
  outside(tt: number): boolean;
  /** Лады текущего анкера: [zf0, zf1]. */
  zf0: number; zf1: number;
  /** Пикселей на лад у нижней струны возле камеры. */
  ppf: number;
  items: DrawItem[]; act: number[];
}

/**
 * Рендер «хайвэя» в стиле Rocksmith 2014.
 * Конструктор принимает canvas, конфигурацию и объект состояния; `draw(dt)`
 * выполняет кадр как последовательность независимых проходов (см. draw).
 * Примечание: общие примитивы (parts/sprites/surface) рисуют в тот же 2D-контекст,
 * поэтому canvas должен быть тем же элементом, что передан в attachCanvas.
 */
export class Highway {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly cfg: HighwayConfig;
  readonly state: EngineState;

  private W = 1; private H = 1; private cw = -1;

  constructor(canvas: HTMLCanvasElement, cfg: HighwayConfig, state: EngineState) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    this.cfg = cfg;
    this.state = state;
  }

  /** Кадр целиком: подготовить состояние кадра, затем проходы слева направо по глубине. */
  draw(dt: number) {
    const v = this.prep(dt);
    if (!v) return;
    this.drawBackdrop(v);
    this.drawFretGuides(v);
    this.drawBoard(v);
    this.drawHands(v);
    this.drawZoneNumbers(v);
    this.drawInlays(v);
    this.drawFrets(v);
    this.drawCapo(v);
    this.drawStrings(v);
    this.drawNut(v);
    for (const it of v.items) {
      if (it.ev) this.drawChordEv(v, it.ev);
      else this.drawNote(v, it.n as RNote);
    }
    this.drawHeads(v);
    this.drawFingers(v);
    this.drawActiveZone(v);
    this.drawOverlay(v);
  }

  // --- подготовка кадра -------------------------------------------------------

  /** Сбрасывает трансформацию, чистит фон, считает камеру и собирает слой нот. */
  private prep(dt: number): View | null {
    const st = this.state, c = this.ctx;
    this.syncSize();
    const W = this.W, H = this.H;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    if (!st.all.length && !st.resting) {
      c.fillStyle = '#4d5a68'; c.font = "13px 'Segoe UI',system-ui,sans-serif"; c.textAlign = 'center';
      c.fillText('this arrangement has no notes to draw', W / 2, H / 2); c.textAlign = 'left';
      return null;
    }
    const t = st.time - st.offMs / 1000, tEnd = t + G.hor, nStr = st.nStr;
    const yOf = (s: number) => { const k = clamp(s, 0, nStr - 1); return YLO + (st.invert ? k : nStr - 1 - k) * PITCH; };
    const A = st.anchors, ai = anchorIdx(t), curA = A[ai];
    const camC = this.updateCamera(dt, t, curA);
    const cam = makeCam(W, H, camC, st.camS, nStr, st.zoom);
    const zf0 = curA.fret - 1, zf1 = Math.min(this.cfg.maxFret, curA.fret + curA.width - 1);
    const yTop = YLO + (nStr - 1) * PITCH, yBot = YLO;
    const pNear = project(cam, fretX(camC), yBot, 0), ppf = pNear ? pNear.s * FW : cam.ppf;
    const off0 = st.offMs / 1000;
    const lpA = st.loop && st.loopB ? st.loopA - off0 - 0.005 : -Infinity;
    const lpB = st.loop && st.loopB ? st.loopB - off0 - 0.005 : Infinity;
    const v: View = {
      W, H, t, tEnd, off0, nStr, A, ai, curA, cam,
      P: (x, y, z) => project(cam, x, y, z),
      yOf, yTop, yBot,
      zOf: (tau) => -(tau - t) * G.sc,
      fog: (tau) => clamp((tEnd - tau) / (G.hor * 0.3), 0, 1) * st.vis,
      outside: (tt) => tt < lpA || tt >= lpB,
      zf0, zf1, ppf,
      items: [], act: new Array(nStr).fill(0),
    };
    this.collect(v);
    return v;
  }

  /** Пружинное следящее камерой; состояние хранится в state, внешние модули сбрасывают camC. */
  private updateCamera(dt: number, t: number, curA: RAnchor): number {
    const st = this.state, cfg = this.cfg, A = st.anchors;
    let lo: number, hi: number;
    if (st.autoPan) {
      lo = curA.fret - 1; hi = curA.fret + curA.width - 1;
      for (let i = anchorIdx(t - cfg.lookBack); i < A.length && A[i].t < t + cfg.lookAhead; i++) {
        lo = Math.min(lo, A[i].fret - 1); hi = Math.max(hi, A[i].fret + A[i].width - 1);
      }
    } else { lo = Math.max(0, st.fMin - 1); hi = Math.max(lo + 4, st.fMax); }
    const wantC = (lo + hi) / 2, wantS = Math.max(4, hi - lo);
    if (st.camC === null) { st.camC = wantC; st.camS = wantS; st.camCv = st.camSv = 0; }
    else {
      const w = CAM_EASE * st.camRate;
      st.camCv += ((wantC - st.camC) * w * w - 2 * w * st.camCv) * dt; st.camC += st.camCv * dt;
      st.camSv += ((wantS - st.camS) * w * w - 2 * w * st.camSv) * dt; st.camS = Math.max(4, st.camS + st.camSv * dt);
    }
    return st.camC as number;
  }

  /** Собирает видимые ноты/аккорды (от дальних к ближним) и подсветку струн. */
  private collect(v: View) {
    const st = this.state;
    for (let i = lowerBound(st.all, 't', v.t - st.maxSus - 0.3); i < st.all.length; i++) {
      const n = st.all[i];
      if (n.t > v.tEnd) break;
      if (n.hide) continue;
      const d = n.t - v.t;
      if (d < -0.25 && n.t + n.sus < v.t) continue;
      v.items.push({ d, n, ev: null });
      const s = clamp(n.s, 0, v.nStr - 1);
      const lit = d >= 0 ? clamp(1 - d / 1.6, 0, 1) : n.t + n.sus > v.t ? 1 : clamp(1 + d / 0.25, 0, 1);
      if (lit * st.vis > v.act[s]) v.act[s] = lit * st.vis;
    }
    for (let i = lowerBound(st.chords, 't', v.t - 0.16); i < st.chords.length; i++) {
      const ev = st.chords[i];
      if (ev.t > v.tEnd) break;
      v.items.push({ d: ev.t - v.t + 1e-6, n: null, ev });
    }
    v.items.sort((p, q) => q.d - p.d);
  }

  /** Синхронизирует CSS-размеры с буфером canvas (меняется только при resize()). */
  private syncSize() {
    const cv = this.canvas;
    if (cv.width === this.cw) return;
    this.cw = cv.width;
    const r = cv.getBoundingClientRect();
    this.W = Math.max(1, Math.round(r.width)); this.H = Math.max(1, Math.round(r.height));
  }

  // --- мелкие помощники отрисовки ---------------------------------------------

  private lane(s: number) { return this.cfg.laneColors[s] || this.cfg.fallbackLane; }

  private quad(a: Pt | null, b: Pt | null, c: Pt | null, d: Pt | null, fill: string | CanvasGradient) {
    if (!a || !b || !c || !d) return;
    const g = this.ctx;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y);
    g.closePath(); g.fillStyle = fill; g.fill();
  }
  private seg(a: Pt | null, b: Pt | null) {
    if (!a || !b) return;
    const g = this.ctx; g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
  }
  /** Начинает путь по ломаной (stroke выполняет вызывающий код). */
  private poly(L: Pt[]) {
    const g = this.ctx;
    g.beginPath(); g.moveTo(L[0].x, L[0].y);
    for (let i = 1; i < L.length; i++) g.lineTo(L[i].x, L[i].y);
  }

  // --- проходы ----------------------------------------------------------------

  /** Размытое свечение за концом грифа. */
  private drawBackdrop(v: View) {
    const mid = (fretX(v.curA.fret - 1) + fretX(Math.min(this.cfg.maxFret, v.curA.fret + v.curA.width - 1))) / 2;
    const p = v.P(mid, 0, -ZFAR);
    if (p) glow('#0a3a6a', p.x, p.y + v.H * 0.05, v.W * 0.3, v.H * 0.2, 0.55);
  }

  /** Бирюзовые линии ладов, уходящие вглубь. */
  private drawFretGuides(v: View) {
    const c = this.ctx;
    c.lineWidth = 1;
    for (let f = 0; f <= this.cfg.maxFret; f++) {
      const a = v.P(fretX(f), 0, 0), b = v.P(fretX(f), 0, -ZFAR);
      if (!a || !b || Math.max(a.x, b.x) < -60 || Math.min(a.x, b.x) > v.W + 60) continue;
      const g = c.createLinearGradient(a.x, a.y, b.x, b.y);
      g.addColorStop(0, 'rgba(0,176,170,0.46)'); g.addColorStop(0.65, 'rgba(0,150,160,0.20)'); g.addColorStop(1, 'rgba(0,150,160,0)');
      c.strokeStyle = g; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
  }

  /** Гриф: сегменты между долями/анкерами — сначала заливки, затем кромки. */
  private drawBoard(v: View) {
    const segs = this.boardSegs(v);
    for (const s of segs) this.fillBand(v, s);
    for (const s of segs) this.strokeBand(v, s);
  }

  /** Разрезы грифа (доли и начала анкеров), от дальнего края к ближнему. */
  private boardSegs(v: View): BoardSeg[] {
    const st = this.state, A = v.A;
    const cuts: { t: number; k: number }[] = [{ t: v.t, k: 0 }];
    for (let i = lowerBound(st.beats, 'time', v.t + 0.0005); i < st.beats.length && st.beats[i].time < v.tEnd; i++)
      cuts.push({ t: st.beats[i].time, k: st.beats[i].measure >= 0 ? 2 : 1 });
    for (let i = v.ai + 1; i < A.length && A[i].t < v.tEnd; i++) cuts.push({ t: A[i].t, k: 0 });
    cuts.sort((p, q) => p.t - q.t);
    const segs: BoardSeg[] = [];
    for (let i = cuts.length - 1; i >= 0; i--) {
      const ta = cuts[i].t, tb = i + 1 < cuts.length ? cuts[i + 1].t : v.tEnd;
      if (tb - ta < 0.002) continue;
      const al = v.fog((ta + tb) / 2);
      if (al <= 0.01) continue;
      const an = A[anchorIdx((ta + tb) / 2)];
      segs.push({ f0: an.fret, f1: Math.min(this.cfg.maxFret, an.fret + an.width - 1), z0: v.zOf(ta), z1: v.zOf(tb) - 0.004, al, k: cuts[i].k });
    }
    return segs;
  }

  private fillBand(v: View, s: BoardSeg) {
    const c1 = `rgba(7,30,60,${(0.92 * s.al).toFixed(3)})`, c2 = `rgba(26,92,168,${(0.3 * s.al).toFixed(3)})`;
    for (let f = s.f0; f <= s.f1; f++) {
      const xa = fretX(f - 1), xb = fretX(f);
      this.quad(v.P(xa, 0, s.z0), v.P(xb, 0, s.z0), v.P(xb, 0, s.z1), v.P(xa, 0, s.z1), c1);
      if (this.state.fx)
        this.quad(v.P(xa + FW * 0.2, 0, s.z0), v.P(xb - FW * 0.2, 0, s.z0), v.P(xb - FW * 0.2, 0, s.z1), v.P(xa + FW * 0.2, 0, s.z1), c2);
    }
  }

  private strokeBand(v: View, s: BoardSeg) {
    const c = this.ctx;
    const near = v.P(fretX(s.f0 - 1), 0, s.z0), sc = near ? near.s * FW : 20;
    c.lineCap = 'butt';
    c.strokeStyle = `rgba(0,196,232,${(0.85 * s.al).toFixed(3)})`; c.lineWidth = clamp(sc * 0.022, 0.8, 2.2);
    c.beginPath(); for (let f = s.f0; f < s.f1; f++) this.seg(v.P(fretX(f), 0, s.z0), v.P(fretX(f), 0, s.z1)); c.stroke();
    c.strokeStyle = `rgba(70,236,255,${s.al.toFixed(3)})`; c.lineWidth = clamp(sc * 0.045, 1.1, 4.2);
    c.beginPath(); this.seg(v.P(fretX(s.f0 - 1), 0, s.z0), v.P(fretX(s.f0 - 1), 0, s.z1)); this.seg(v.P(fretX(s.f1), 0, s.z0), v.P(fretX(s.f1), 0, s.z1)); c.stroke();
    if (this.state.showCells && s.k) {
      c.strokeStyle = s.k === 2 ? `rgba(150,214,244,${(0.62 * s.al).toFixed(3)})` : `rgba(84,150,196,${(0.34 * s.al).toFixed(3)})`;
      c.lineWidth = s.k === 2 ? clamp(sc * 0.03, 1, 3) : 1;
      c.beginPath(); this.seg(v.P(fretX(s.f0 - 1), 0, s.z0), v.P(fretX(s.f1), 0, s.z0)); c.stroke();
    }
  }

  /** Вертикальные полосы хэнд-шейпов (арпеджио — фиолетовым). */
  private drawHands(v: View) {
    const st = this.state, A = v.A, t = v.t;
    for (let i = Math.max(0, lowerBound(st.hands, 't', t - 30)); i < st.hands.length; i++) {
      const h = st.hands[i];
      if (h.t > v.tEnd) break;
      if (h.t1 < t) continue;
      const ta = Math.max(h.t, t), tb = Math.min(h.t1, v.tEnd);
      if (tb - ta < 0.02) continue;
      const an = A[anchorIdx(h.t + 0.002)], z0 = v.zOf(ta), z1 = v.zOf(tb), wd = FW * 0.085;
      const al = (v.fog(ta) + v.fog(tb)) / 2, col = h.arp ? 'rgba(190,170,255,' : 'rgba(70,240,255,';
      for (const x of [fretX(an.fret - 1), fretX(Math.min(this.cfg.maxFret, an.fret + an.width - 1))])
        this.quad(v.P(x - wd, 0, z0), v.P(x + wd, 0, z0), v.P(x + wd, 0, z1), v.P(x - wd, 0, z1), col + (0.92 * al).toFixed(3) + ')');
    }
  }

  /** Номера ладов на самом грифе (у строк с якорями). */
  private drawZoneNumbers(v: View) {
    const st = this.state, A = v.A, t = v.t, inlay = this.cfg.inlays;
    if (!st.showNums) return;
    for (let i = v.ai + 1; i < A.length && A[i].t < v.tEnd; i++) {
      const an = A[i]; if (!an.row) continue;
      const z = v.zOf(an.t) + FW * 0.3, al = v.fog(an.t) * clamp((an.t - t - 0.25) / 0.5, 0, 1);
      if (al <= 0.02) continue;
      for (let f = Math.max(1, an.fret - 3); f <= Math.min(this.cfg.maxFret, an.fret + an.width + 4); f++) {
        const inZone = f >= an.fret && f < an.fret + an.width;
        if (!inZone && !inlay.has(f)) continue;
        const p = v.P(fretMid(f), 0, z); if (!p) continue;
        const fs = p.s * FW * 0.46, nIn = numFadeIn(fs);
        if (nIn <= 0) continue;
        label(String(f), p.x, p.y, fs, inZone ? '#a9dcec' : '#1f8f88', (inZone ? 0.85 : 0.75) * al * nIn, null, neckAxes(v.cam, fretMid(f), 0, z));
      }
    }
  }

  private drawInlays(v: View) {
    const c = this.ctx, inlay = this.cfg.inlays;
    for (let f = 1; f <= this.cfg.maxFret; f++) {
      if (!inlay.has(f)) continue;
      const inZone = f > v.zf0 && f <= v.zf1;
      const ys = f % 12 === 0 ? [lerp(v.yBot, v.yTop, 0.25), lerp(v.yBot, v.yTop, 0.75)] : [(v.yBot + v.yTop) / 2];
      for (const yy of ys) {
        const p = v.P(fretMid(f), yy, 0);
        if (!p || p.x < -40 || p.x > v.W + 40) continue;
        const r = p.s * FW * 0.105;
        c.globalAlpha = inZone ? 0.95 : 0.8; c.fillStyle = inZone ? '#b08a22' : '#0c5f58';
        c.beginPath(); c.ellipse(p.x, p.y, r, r * 0.92, 0, 0, Math.PI * 2); c.fill();
        c.lineWidth = Math.max(1, r * 0.16); c.strokeStyle = inZone ? '#e2bd4a' : '#17877c'; c.stroke();
      }
    }
    c.globalAlpha = 1;
  }

  /** Ладовые порожки с тенью и градиентом (нулевой — широкий). */
  private drawFrets(v: View) {
    const c = this.ctx;
    c.lineCap = 'round';
    for (let f = 0; f <= this.cfg.maxFret; f++) {
      const a = v.P(fretX(f), v.yBot - PITCH * 0.55, 0), b = v.P(fretX(f), v.yTop + PITCH * 0.55, 0);
      if (!a || !b || a.x < -30 || a.x > v.W + 30) continue;
      const inZone = f >= v.zf0 && f <= v.zf1, lw = clamp(a.s * FW * (f === 0 ? 0.09 : 0.045), 1.2, f === 0 ? 12 : 6);
      c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = lw + 2;
      c.beginPath(); c.moveTo(a.x + 1.5, a.y); c.lineTo(b.x + 1.5, b.y); c.stroke();
      const g = c.createLinearGradient(a.x - lw, 0, a.x + lw, 0);
      if (f === 0) { g.addColorStop(0, '#8d8676'); g.addColorStop(0.5, '#e9e2cf'); g.addColorStop(1, '#7d7666'); }
      else if (inZone) { g.addColorStop(0, '#7a4a1c'); g.addColorStop(0.45, '#e6a35a'); g.addColorStop(1, '#6a3f18'); }
      else { g.addColorStop(0, '#241a12'); g.addColorStop(0.45, '#5b4530'); g.addColorStop(1, '#1e160f'); }
      c.strokeStyle = g; c.lineWidth = lw;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
    c.lineCap = 'butt';
  }

  private drawCapo(v: View) {
    const st = this.state;
    if (st.capo <= 0 || st.capo > this.cfg.maxFret) return;
    const a = v.P(fretMid(st.capo) + FW * 0.2, v.yBot - PITCH * 0.7, 0), b = v.P(fretMid(st.capo) + FW * 0.2, v.yTop + PITCH * 0.7, 0);
    if (!a || !b) return;
    const c = this.ctx;
    c.lineCap = 'round'; c.strokeStyle = 'rgba(210,214,222,0.92)'; c.lineWidth = clamp(a.s * FW * 0.16, 3, 16);
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.lineCap = 'butt';
    label('CAPO', b.x, b.y - v.ppf * 0.22, clamp(v.ppf * 0.16, 9, 16), '#d2d6de', 0.9, null);
  }

  /** Струны: прямые либо с колебанием/изгибом после взятия ноты. */
  private drawStrings(v: View) {
    const st = this.state, c = this.ctx, t = v.t;
    const sxR = Math.max(NECK_END + 3 * FW, v.cam.px + 40 * FW);
    const struck: (LaneHit | null)[] = new Array(v.nStr).fill(null);
    for (let i = lowerBound(st.all, 't', t + 1e-6) - 1; i >= 0; i--) {
      const n = st.all[i], age = t - n.t;
      if (age > Math.max(1, st.maxSus + 0.1)) break;
      const si = clamp(n.s, 0, v.nStr - 1);
      if (struck[si]) continue;
      const held = sustained(n) && age < n.sus;
      struck[si] = { still: !!n.mt || (age > 1 && !held), n, age, held };
    }
    for (let s = 0; s < v.nStr; s++) {
      const y = v.yOf(s), col = this.lane(s), k = v.act[s];
      const lw = clamp(v.ppf * (0.03 - s * 0.0028), 1, 5.5);
      const raw = struck[s], hit = raw && !raw.still ? raw : null;
      const swing = !hit || st.vis < 0.05 ? 0
        : PITCH * (hit.n.pm ? 0.09 : 0.17) * (hit.n.ac ? 1.25 : 1) * Math.exp(-hit.age / (hit.n.pm ? 0.06 : hit.held ? Math.max(0.6, hit.n.sus * 0.7) : 0.3)) * st.vis;
      const u = hit && hit.held ? (t - hit.n.t) / hit.n.sus : 0;
      const push = hit && hit.held ? bendY(hit.n, u) + vibY(hit.n, t) : 0;
      let pts: Pt[];
      let ghost: [Pt[], Pt[]] | null = null;
      if (swing < PITCH * 0.006 && Math.abs(push) < PITCH * 0.01) {
        const a = v.P(fretX(-2.2), y, 0), b = v.P(sxR, y, 0);
        if (!a || !b) continue;
        pts = [a, b];
      } else {
        const n = (hit as LaneHit).n, xp = n.f > 0 ? noteX(n, (hit as LaneHit).held ? u : 0, 0) : fretX(0);
        const ph = Math.sin((hit as LaneHit).age * Math.PI * 2 * (19 + s * 2.3));
        const shape = (x: number) => x <= xp ? 0 : 1 - Math.exp(-(x - xp) / (FW * 1.5));
        const rest = (x: number) => x <= 0 ? 0 : x <= xp ? push * (x / Math.max(xp, 1e-6)) : push * (1 - (x - xp) / (sxR - xp));
        const xs = [fretX(-2.2), 0];
        if (xp > 0.0001) xs.push(xp);
        for (let q = 1; q <= 14; q++) { const x = xp + q * FW * 0.5; if (x < sxR) xs.push(x); }
        xs.push(sxR);
        pts = []; const up: Pt[] = [], dn: Pt[] = [];
        for (const x of xs) {
          const w = shape(x) * swing, r0 = rest(x), q = v.P(x, y + r0 + w * ph, 0);
          if (!q) continue;
          pts.push(q);
          if (swing >= PITCH * 0.02) { const e1 = v.P(x, y + r0 + w, 0), e2 = v.P(x, y + r0 - w, 0); if (e1 && e2) { up.push(e1); dn.push(e2); } }
        }
        if (pts.length < 2) continue;
        if (up.length > 1) ghost = [up, dn];
      }
      if (k > 0.02 && st.fx) {
        c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(col, 0.36 * k); c.lineWidth = lw * 3.8;
        this.poly(pts); c.stroke(); c.globalCompositeOperation = 'source-over';
      }
      if (ghost) {
        c.strokeStyle = rgba(col, 0.3); c.lineWidth = Math.max(1, lw * 0.7); c.lineJoin = 'round';
        this.poly(ghost[0]); c.stroke(); this.poly(ghost[1]); c.stroke();
      }
      c.strokeStyle = k > 0.02 ? tint(col, 0.25 * k) : col;
      c.globalAlpha = 0.5 + 0.5 * k; c.lineWidth = lw * (1 + 0.35 * k); c.lineJoin = 'round';
      this.poly(pts); c.stroke(); c.globalAlpha = 1;
    }
  }

  /** Затемнение у нулевого лада и названия строя. */
  private drawNut(v: View) {
    const st = this.state, c = this.ctx;
    const ym = (v.yTop + v.yBot) / 2, g0 = v.P(fretX(-0.15), ym, 0), g1 = v.P(fretX(-0.95), ym, 0);
    const q = [v.P(fretX(-0.15), v.yBot - PITCH, 0), v.P(fretX(-8), v.yBot - PITCH, 0), v.P(fretX(-8), v.yTop + PITCH, 0), v.P(fretX(-0.15), v.yTop + PITCH, 0)];
    if (!g0 || !g1 || !q.every(Boolean)) return;
    const g = c.createLinearGradient(g0.x, g0.y, g1.x, g1.y);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000');
    c.fillStyle = g; c.beginPath();
    q.forEach((p, i) => (i ? c.lineTo((p as Pt).x, (p as Pt).y) : c.moveTo((p as Pt).x, (p as Pt).y)));
    c.closePath(); c.fill();
    const nm = st.tuneNames;
    for (let s = 0; s < v.nStr; s++) {
      const p = v.P(fretX(-1.2), v.yOf(s), 0), col = this.lane(s);
      if (p && nm[s] && p.x > -20 && p.x < v.W + 20) label(nm[s], p.x, p.y, clamp(v.ppf * 0.17, 10, 20), col, 0.9 * st.vis, col);
    }
  }

  private drawChordEv(v: View, ev: ChordEv) {
    const t = v.t, A = v.A;
    const d = ev.t - t, an = A[anchorIdx(ev.t + 0.002)];
    const x0 = fretX(an.fret - 1), x1 = fretX(Math.min(this.cfg.maxFret, an.fret + an.width - 1));
    const a = d < 0 ? clamp(1 + d / 0.15, 0, 1) : v.fog(ev.t);
    if (a <= 0.01) return;
    let top = YLO + PITCH * 1.25;
    if (!ev.rep) { let hiY = -Infinity; for (const cn of ev.notes) hiY = Math.max(hiY, v.yOf(cn.s)); top = hiY + PITCH * 0.95; }
    ev.landed = d < 0;
    drawChordBox(v.cam, ev, x0, x1, top, d < 0 ? 0 : v.zOf(ev.t), a, clamp(1 - d / 1.2, 0, 1));
  }

  /** Нота в полёте: хвост сустейна, корпус, свечение, номер лада. */
  private drawNote(v: View, n: RNote) {
    const st = this.state, c = this.ctx, A = v.A, t = v.t, cfg = this.cfg;
    const d = n.t - t, s = clamp(n.s, 0, v.nStr - 1), grey = v.outside(n.t);
    const col = grey ? cfg.greyColor : this.lane(s), y = v.yOf(s);
    const an = A[anchorIdx(n.t + 0.002)], ax0 = fretX(an.fret - 1), ax1 = fretX(Math.min(cfg.maxFret, an.fret + an.width - 1));
    const zoneMid = (ax0 + ax1) / 2, open = n.f <= 0;
    if (sustained(n)) drawTail(v.cam, n, t, y, col, zoneMid, open ? (ax1 - ax0) * 0.5 : FW * 0.13, v.fog);
    if (n.linked || d < 0) return;
    const z = v.zOf(n.t), al = v.fog(n.t);
    if (al <= 0.01) return;
    const inChord = n.ch !== undefined;
    if (open) {
      const hh = PITCH * 0.16;
      const a = v.P(ax0, y - hh, z), b = v.P(ax1, y - hh, z), cc = v.P(ax1, y + hh, z), e = v.P(ax0, y + hh, z);
      if (!a || !b || !cc || !e) return;
      if (!inChord) {
        c.strokeStyle = rgba(col, 0.7 * al); c.lineWidth = clamp(a.s * FW * 0.03, 1, 3);
        c.beginPath(); this.seg(v.P(ax0, 0, z), v.P(ax0, y, z)); this.seg(v.P(ax1, 0, z), v.P(ax1, y, z)); c.stroke();
      }
      c.globalAlpha = al;
      this.quad(a, b, cc, e, n.pm || n.mt ? rgba(col, 0.45) : col);
      c.strokeStyle = tint(col, 0.5); c.lineWidth = clamp(a.s * FW * 0.018, 0.8, 2);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(cc.x, cc.y); c.lineTo(e.x, e.y); c.closePath(); c.stroke();
      c.globalAlpha = 1;
      if (d < 0.9) glow(col, (a.x + b.x) / 2, (a.y + e.y) / 2, Math.abs(b.x - a.x) * 0.6, Math.max(6, a.s * PITCH * 1.2), 0.3 * (1 - d / 0.9) * al);
      return;
    }
    const xc = fretMid(n.f), pl = v.P(xc - FW * 0.3, y, z), pr = v.P(xc + FW * 0.3, y, z);
    if (!pl || !pr) return;
    const cx = (pl.x + pr.x) / 2, cy = (pl.y + pr.y) / 2;
    if (cx < -80 || cx > v.W + 80) return;
    const hw = Math.hypot(pr.x - pl.x, pr.y - pl.y) / 2, hh = hw * (PITCH * 0.41) / (FW * 0.3);
    if (!inChord) {
      this.quad(v.P(xc - FW * 0.46, 0, z + FW * 0.22), v.P(xc + FW * 0.46, 0, z + FW * 0.22), v.P(xc + FW * 0.46, 0, z - FW * 0.22), v.P(xc - FW * 0.46, 0, z - FW * 0.22), `rgba(122,176,196,${(0.42 * al).toFixed(3)})`);
      const base = v.P(xc, 0, z);
      if (base) {
        c.strokeStyle = rgba(col, 0.85 * al); c.lineWidth = clamp(hw * 0.11, 1, 4);
        c.beginPath(); c.moveTo(base.x, base.y); c.lineTo(cx, cy + hh); c.stroke();
      }
    }
    setSkew(v.P(xc, y + PITCH * 0.4, z), v.P(xc, y - PITCH * 0.4, z));
    const gk = sstep(1 - d / 1.4);
    if (gk > 0.01 && !grey) glow(col, cx, cy, hw * 2.3, hh * 3.6, 0.4 * gk * gk * al, true);
    drawHead(cx, cy, Math.atan2(pr.y - pl.y, pr.x - pl.x), hw, hh, col, n, al, grey ? 0 : gk);
    if (st.showNums && n.lab) {
      const p = v.P(xc, 0, z + FW * (inChord ? 0.62 : 0.6));
      if (p) {
        const fs = p.s * FW * 0.5, na = al * clamp((d * G.sc - 0.12) / 0.8, 0, 1), nIn = numFadeIn(fs);
        if (nIn > 0 && na * nIn > 0.02)
          label(String(n.f), p.x, p.y, fs, grey ? '#aab2ba' : '#ffab1f', na * nIn,
            !grey && d < 1.2 && na > 0.5 ? 'rgba(255,150,0,0.8)' : null, neckAxes(v.cam, xc, 0, z + FW * (inChord ? 0.62 : 0.6)));
      }
    }
  }

  /** Рамки взятых нот у плоскости камеры (сразу после срабатывания). */
  private drawHeads(v: View) {
    const st = this.state, c = this.ctx, t = v.t, cfg = this.cfg;
    for (const it of v.items) {
      const n = it.n;
      if (!n || n.f <= 0) continue;
      const d = n.t - t, held = d < 0 && n.t + n.sus > t && sustained(n);
      if (!held && (d > 0.75 || d < -0.22)) continue;
      if (n.linked && !held) continue;
      const s = clamp(n.s, 0, v.nStr - 1), col = v.outside(n.t) ? cfg.greyColor : this.lane(s), y = v.yOf(s);
      const u = held ? (t - n.t) / n.sus : 0;
      const xc = noteX(n, u, 0), yy = y + (held ? bendY(n, u) + vibY(n, t) : 0);
      const pl = v.P(xc - FW * 0.34, yy, 0), pr = v.P(xc + FW * 0.34, yy, 0);
      if (!pl || !pr) continue;
      const cx = (pl.x + pr.x) / 2, cy = (pl.y + pr.y) / 2;
      const sk = setSkew(v.P(xc, yy + PITCH * 0.4, 0), v.P(xc, yy - PITCH * 0.4, 0));
      let hw = Math.hypot(pl.x - pr.x, pl.y - pr.y) / 2, hh = sk > 0 ? sk / 2 : hw * (PITCH * 0.4) / (FW * 0.34);
      let a: number;
      if (held) { a = 1; glow(col, cx, cy, hw * 2.6, hh * 4.2, 0.55); }
      else if (d >= 0) a = 0.25 + 0.75 * (1 - d / 0.75);
      else { const k = -d / 0.22; a = 1 - k; hw *= 1 + 0.3 * k; hh *= 1 + 0.22 * k; glow(col, cx, cy, hw * 2.8, hh * 4.6, 0.75 * (1 - k)); }
      c.save(); headFrame(cx, cy, Math.atan2(pr.y - pl.y, pr.x - pl.x));
      c.globalAlpha = a * st.vis; c.lineJoin = 'round';
      rr(-hw, -hh, hw * 2, hh * 2, hh * 0.3, c);
      if (held || d < 0) { c.fillStyle = rgba(col, held ? 0.45 : 0.35); c.fill(); }
      c.strokeStyle = held || d < 0.12 ? tint(col, 0.55) : col; c.lineWidth = Math.max(1.5, hh * 0.34); c.stroke();
      c.restore(); c.globalAlpha = 1;
    }
  }

  /** Пиллюли пальцев (аппликатура) и имя аккорда у держания. */
  private drawFingers(v: View) {
    const st = this.state;
    if (st.showFingers && st.holds.length) for (const m of fingerPills(v.t, v.yOf)) {
      const kk = sstep(m.k) * st.vis, z = (1 - kk) * FING_Z;
      const pa = v.P(m.x, m.ya, z), pb = v.P(m.x, m.yb, z), pt = v.P(m.x, m.yt, z);
      if (pa && pb && pt && pa.x > -40 && pa.x < v.W + 40) drawPill(pa, pb, pt, pt.s * FW * 0.15, m.g, kk, neckAxes(v.cam, m.x, m.yt, z));
    }
    if (st.showChord && st.holds.length) {
      const k = lowerBound(st.holds, 't', v.t + 1e-6) - 1, h = st.holds[k], nx = st.holds[k + 1];
      if (h && h.name && v.t <= h.t1 + 0.3) {
        let a = clamp((h.t1 + 0.3 - v.t) / 0.3, 0, 1);
        if (nx && nx.name) a = Math.min(a, clamp((nx.t - 0.22 - v.t) / 0.2, 0, 1));
        const an = v.A[anchorIdx(h.t + 0.002)], p = v.P(fretX(an.fret - 1), nameY(), 0);
        if (p) chordName(h.name, p, p.s, a * st.vis, neckAxes(v.cam, fretX(an.fret - 1), nameY(), 0));
      }
    }
  }

  /** Подсветка активных ладов + переход зоны к следующему якорю. */
  private drawActiveZone(v: View) {
    const t = v.t, cfg = this.cfg, inlay = cfg.inlays;
    let za = v.zf0, zb = v.zf1;
    const nx = v.A[v.ai + 1];
    if (nx) {
      const n0 = nx.fret - 1, n1 = Math.min(cfg.maxFret, nx.fret + nx.width - 1);
      if (n0 !== v.zf0 || n1 !== v.zf1) {
        const D = Math.min(FING_MOVE, Math.max(nx.t - v.curA.t, 0.12)), u = clamp((t - (nx.t - D)) / D, 0, 1);
        za = lerp(v.zf0, n0, u); zb = lerp(v.zf1, n1, u);
      }
    }
    for (let f = 1; f <= cfg.maxFret; f++) {
      const g = clamp(Math.min(f, zb) - Math.max(f - 1, za), 0, 1);
      if (g <= 0.001 && !inlay.has(f)) continue;
      const p = v.P(fretMid(f), 0, FW * 0.4);
      if (!p || p.x < -30 || p.x > v.W + 30) continue;
      const fs = p.s * FW * 0.4;
      if (fs < 6) continue;
      const ax = neckAxes(v.cam, fretMid(f), 0, FW * 0.4);
      if (g < 0.999 && inlay.has(f)) label(String(f), p.x, p.y, fs * 0.92, '#1c8f86', 0.85 * (1 - g), null, ax);
      if (g > 0.001) label(String(f), p.x, p.y, fs * (0.92 + 0.08 * g), '#ffb01f', g, 'rgba(255,140,0,0.75)', ax);
    }
  }

  /** Экран поверх хайвэя: полоса фраз, индикатор попадания, диаграмма аккорда. */
  private drawOverlay(v: View) {
    const st = this.state;
    drawPhraseBars(v.t, v.off0);
    if (st.showHit) drawHitLight(v.t);
    if (st.showDiagram && st.holds.length) drawChordDiagram(v.t, v.cam, v.curA);
  }
}

let hw: Highway | null = null;

/** Создаёт рендер для данного canvas (config/state по умолчанию — общие). */
export function attachHighway(canvas: HTMLCanvasElement, config: HighwayConfig = DEFAULT_HIGHWAY_CONFIG, state: EngineState = STATE): Highway {
  hw = new Highway(canvas, config, state);
  return hw;
}

/** Один кадр хайвэя; без подключённого canvas ничего не рисует. */
export function draw(dt: number) { hw?.draw(dt); }
