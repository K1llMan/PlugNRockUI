(() => {
  // js/xml.js
  function elementFromDom(el) {
    xmlStats.count = (xmlStats.count || 0) + 1;
    const attrs = {};
    for (const a of el.attributes) attrs[a.name] = a.value;
    const children = [];
    let text = "";
    for (const c of el.childNodes) {
      if (c.nodeType === 1) children.push(elementFromDom(c));
      else if (c.nodeType === 3 || c.nodeType === 4) text += c.nodeValue;
    }
    return { tag: el.tagName, attrs, children, text };
  }
  var xmlStats = { parses: 0, elements: 0, domMs: 0, convertMs: 0 };
  function parseXml(text) {
    const t0 = performance.now();
    try {
      const root = parseXmlLite(text);
      xmlStats.parses++;
      xmlStats.domMs += performance.now() - t0;
      return root;
    } catch (e) {
      if (typeof DOMParser === "undefined") throw e;
      const doc = new DOMParser().parseFromString(text.replace(/^\uFEFF/, ""), "application/xml");
      const err = doc.getElementsByTagName("parsererror")[0];
      if (err) throw new Error("xml parse error: " + err.textContent.slice(0, 200));
      if (!doc.documentElement) throw new Error("xml parse error: no root element");
      const t1 = performance.now();
      const root = elementFromDom(doc.documentElement);
      const t2 = performance.now();
      xmlStats.parses++;
      xmlStats.domMs += t1 - t0;
      xmlStats.convertMs += t2 - t1;
      xmlStats.elements += xmlStats.count;
      return root;
    }
  }
  var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  function unescapeXml(s) {
    if (s.indexOf("&") < 0) return s;
    return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, g) => {
      if (g[0] === "#") {
        const code = g[1] === "x" || g[1] === "X" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[g] ?? m;
    });
  }
  var TAG_RE = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  var ATTR_RE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  function parseXmlLite(text) {
    const body = text.replace(/^\uFEFF/, "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
    const root = { tag: "#doc", attrs: {}, children: [], text: "" };
    const stack = [root];
    let last = 0;
    TAG_RE.lastIndex = 0;
    let m;
    while (m = TAG_RE.exec(body)) {
      if (m.index > last) {
        const t = body.slice(last, m.index);
        if (t.trim()) stack[stack.length - 1].text += unescapeXml(t);
      }
      last = TAG_RE.lastIndex;
      const [, closing, tag, attrText, selfClose] = m;
      if (closing) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const attrs = {};
      ATTR_RE.lastIndex = 0;
      let a;
      while (a = ATTR_RE.exec(attrText)) attrs[a[1]] = unescapeXml(a[2] ?? a[3] ?? "");
      const node = { tag, attrs, children: [], text: "" };
      stack[stack.length - 1].children.push(node);
      if (!selfClose) stack.push(node);
    }
    if (stack.length !== 1) throw new Error("xml parse error: unclosed element");
    const top = root.children.find((c) => c.tag !== "#comment");
    if (!top) throw new Error("xml parse error: no root element");
    return top;
  }
  function find(el, tag) {
    return el ? el.children.find((c) => c.tag === tag) || null : null;
  }
  function findAll(el, tag) {
    return el ? el.children.filter((c) => c.tag === tag) : [];
  }
  function getAttr(el, name, dflt = null) {
    if (!el) return dflt;
    const v = el.attrs[name];
    return v === void 0 ? dflt : v;
  }
  function textOf(el) {
    return el ? el.text.trim() : "";
  }
  var archiveCache = /* @__PURE__ */ new Map();
  function parseArchiveXml(files, name) {
    const hit = archiveCache.get(name);
    if (hit) return hit;
    const root = parseXml(new TextDecoder("utf-8", { fatal: false }).decode(files.get(name)));
    archiveCache.set(name, root);
    return root;
  }
  function clearXmlCache() {
    archiveCache.clear();
  }

  // js/song.js
  var r3 = (v) => Math.round(v * 1e3) / 1e3;
  function noteToWire(n) {
    const out = {
      t: r3(n.time ?? 0),
      s: n.string ?? 0,
      f: n.fret ?? 0,
      sus: r3(n.sustain ?? 0),
      sl: n.slide_to ?? -1,
      slu: n.slide_unpitch_to ?? -1,
      bn: n.bend ? Math.round(n.bend * 10) / 10 : 0,
      ho: !!n.hammer_on,
      po: !!n.pull_off,
      hm: !!n.harmonic,
      hp: !!n.harmonic_pinch,
      pm: !!n.palm_mute,
      mt: !!n.mute,
      vb: !!n.vibrato,
      tr: !!n.tremolo,
      ac: !!n.accent,
      tp: !!n.tap
    };
    if (n.link_next) out.ln = true;
    if (n.fret_hand_mute) out.fhm = true;
    if (n.pluck) out.plk = true;
    if (n.slap) out.slp = true;
    if (n.right_hand !== void 0 && n.right_hand !== -1) out.rh = n.right_hand;
    if (n.pick_direction !== void 0 && n.pick_direction !== -1) out.pkd = n.pick_direction;
    if (n.ignore) out.ig = true;
    return out;
  }
  function chordNoteToWire(cn) {
    const d = noteToWire(cn);
    delete d.t;
    return d;
  }
  var chordToWire = (c) => ({
    t: r3(c.time),
    id: c.chord_id,
    hd: c.high_density,
    notes: c.notes.map(chordNoteToWire)
  });
  var anchorToWire = (a) => ({ time: a.time, fret: a.fret, width: a.width });
  var handShapeToWire = (h) => ({
    chord_id: h.chord_id,
    start_time: h.start_time,
    end_time: h.end_time,
    arp: h.arpeggio
  });
  var chordTemplateToWire = (ct) => ({
    name: ct.name,
    displayName: ct.display_name || ct.name,
    arp: ct.arpeggio,
    fingers: [...ct.fingers],
    frets: [...ct.frets]
  });
  function arrangementToWire(arr) {
    const out = {
      name: arr.name,
      tuning: [...arr.tuning],
      capo: arr.capo,
      notes: arr.notes.map(noteToWire),
      chords: arr.chords.map(chordToWire),
      anchors: arr.anchors.map(anchorToWire),
      handshapes: arr.hand_shapes.map(handShapeToWire),
      templates: arr.chord_templates.map(chordTemplateToWire)
    };
    if (arr.phrases && arr.phrases.length) {
      out.phrases = arr.phrases.map((p) => ({
        start_time: r3(p.start_time),
        end_time: r3(p.end_time),
        max_difficulty: p.max_difficulty
      }));
    }
    if (arr.tones) out.tones = arr.tones;
    return out;
  }
  var FALSE_LITERALS = /* @__PURE__ */ new Set(["", "0", "false", "False", "FALSE"]);
  var num = (el, attr, dflt = 0) => {
    const v = getAttr(el, attr);
    return v === null ? dflt : parseFloat(v);
  };
  var int = (el, attr, dflt = 0) => {
    const v = getAttr(el, attr);
    if (v === null) return dflt;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? Math.trunc(parseFloat(v)) || 0 : n;
  };
  var intOpt = (el, attr, dflt = -1) => {
    const v = getAttr(el, attr);
    if (v === null || !v.trim()) return dflt;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? dflt : n;
  };
  var bool = (el, attr) => {
    const v = getAttr(el, attr);
    return v !== null && !FALSE_LITERALS.has(v);
  };
  var handShapeArp = (el) => ["arpeggio", "Arpeggio", "arp", "Arp"].some((a) => bool(el, a));
  var templateArp = (el) => {
    if (["arpeggio", "Arpeggio", "arp", "Arp"].some((a) => bool(el, a))) return true;
    const dn = (getAttr(el, "displayName", "") || "").toLowerCase();
    return dn.includes("-arp") || dn.includes("arpeggio");
  };
  var chordHighDensity = (el) => ["highDensity", "highdensity", "HighDensity"].some((a) => bool(el, a));
  function parseNoteEl(n) {
    return {
      time: num(n, "time"),
      string: int(n, "string"),
      fret: int(n, "fret"),
      sustain: num(n, "sustain"),
      slide_to: int(n, "slideTo", -1),
      slide_unpitch_to: int(n, "slideUnpitchTo", -1),
      bend: num(n, "bend"),
      hammer_on: bool(n, "hammerOn"),
      pull_off: bool(n, "pullOff"),
      harmonic: bool(n, "harmonic"),
      harmonic_pinch: bool(n, "harmonicPinch"),
      palm_mute: bool(n, "palmMute"),
      mute: bool(n, "mute"),
      vibrato: bool(n, "vibrato"),
      tremolo: bool(n, "tremolo"),
      accent: bool(n, "accent"),
      link_next: bool(n, "linkNext"),
      tap: bool(n, "tap"),
      fret_hand_mute: bool(n, "fretHandMute"),
      pluck: bool(n, "pluck"),
      slap: bool(n, "slap"),
      right_hand: intOpt(n, "rightHand", -1),
      pick_direction: intOpt(n, "pickDirection", -1),
      ignore: bool(n, "ignore")
    };
  }
  var lowerBound = (arr, v) => {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const m = lo + hi >> 1;
      if (arr[m] < v) lo = m + 1;
      else hi = m;
    }
    return lo;
  };
  var upperBound = (arr, v) => {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const m = lo + hi >> 1;
      if (arr[m] <= v) lo = m + 1;
      else hi = m;
    }
    return lo;
  };
  function parseArrangement(root, topOnly = true) {
    const arrName = textOf(find(root, "arrangement"));
    const tuning = [0, 0, 0, 0, 0, 0];
    const tunEl = find(root, "tuning");
    if (tunEl) {
      for (let i2 = 0; i2 < 6; i2++) tuning[i2] = int(tunEl, `string${i2}`);
      let i = 6;
      while (getAttr(tunEl, `string${i}`) !== null) {
        tuning.push(int(tunEl, `string${i}`));
        i++;
      }
    }
    let capo = 0;
    const capoEl = find(root, "capo");
    if (capoEl && textOf(capoEl)) {
      const c = parseInt(textOf(capoEl), 10);
      if (!Number.isNaN(c)) capo = c;
    }
    const chordTemplates = [];
    const ctContainer = find(root, "chordTemplates");
    if (ctContainer) {
      for (const ct of findAll(ctContainer, "chordTemplate")) {
        const name = getAttr(ct, "chordName", "");
        const display = (getAttr(ct, "displayName", "") || "").trim() || name;
        let width = 6;
        while (getAttr(ct, `fret${width}`) !== null || getAttr(ct, `finger${width}`) !== null) width++;
        chordTemplates.push({
          name,
          display_name: display,
          arpeggio: templateArp(ct),
          fingers: Array.from({ length: width }, (_, i) => int(ct, `finger${i}`, -1)),
          frets: Array.from({ length: width }, (_, i) => int(ct, `fret${i}`, -1))
        });
      }
    }
    const levelsEl = find(root, "levels");
    const phrasesEl = find(root, "phrases");
    const itersEl = find(root, "phraseIterations");
    const allLevels = /* @__PURE__ */ new Map();
    if (levelsEl) for (const lv of findAll(levelsEl, "level")) allLevels.set(int(lv, "difficulty"), lv);
    const nAuthored = allLevels.size;
    const parseLevelFully = (levelEl) => {
      const lvNotes = findAll(find(levelEl, "notes"), "note").map(parseNoteEl).sort((a, b) => a.time - b.time);
      const lvChords = [];
      for (const c of findAll(find(levelEl, "chords"), "chord")) {
        const t = num(c, "time");
        const cnElems = findAll(c, "chordNote");
        let chordNotes = cnElems.map(parseNoteEl);
        const cid = int(c, "chordId");
        const chPm = bool(c, "palmMute"), chMt = bool(c, "mute");
        const chFhm = bool(c, "fretHandMute"), chAcc = bool(c, "accent");
        if (cid >= 0 && cid < chordTemplates.length) {
          const ct = chordTemplates[cid];
          const fretted = [];
          for (let s = 0; s < ct.frets.length; s++) if (ct.frets[s] >= 0) fretted.push([s, ct.frets[s]]);
          if (!chordNotes.length) {
            for (const [s, f] of fretted) {
              chordNotes.push({
                time: t,
                string: s,
                fret: f,
                palm_mute: chPm,
                mute: chMt,
                fret_hand_mute: chFhm,
                accent: chAcc
              });
            }
          } else if (chordNotes.length < fretted.length) {
            const have = new Set(chordNotes.map((n) => n.string));
            for (const [s, f] of fretted) {
              if (!have.has(s)) {
                chordNotes.push({
                  time: t,
                  string: s,
                  fret: f,
                  palm_mute: chPm,
                  mute: chMt,
                  fret_hand_mute: chFhm,
                  accent: chAcc
                });
              }
            }
          }
        }
        if (chordNotes.length && (chPm || chMt || chFhm || chAcc)) {
          for (let i = 0; i < chordNotes.length && i < cnElems.length; i++) {
            const cn = chordNotes[i], el = cnElems[i];
            if (chPm && getAttr(el, "palmMute") === null) cn.palm_mute = true;
            if (chMt && getAttr(el, "mute") === null) cn.mute = true;
            if (chFhm && getAttr(el, "fretHandMute") === null) cn.fret_hand_mute = true;
            if (chAcc && getAttr(el, "accent") === null) cn.accent = true;
          }
        }
        chordNotes.sort((a, b) => a.string - b.string);
        lvChords.push({ time: t, chord_id: cid, notes: chordNotes, high_density: chordHighDensity(c) });
      }
      lvChords.sort((a, b) => a.time - b.time);
      const lvAnchors = findAll(find(levelEl, "anchors"), "anchor").map((a) => ({ time: num(a, "time"), fret: int(a, "fret"), width: int(a, "width", 4) })).sort((a, b) => a.time - b.time);
      const lvHs = findAll(find(levelEl, "handShapes"), "handShape").map((hs) => ({
        chord_id: int(hs, "chordId"),
        start_time: num(hs, "startTime"),
        end_time: num(hs, "endTime"),
        arpeggio: handShapeArp(hs)
      })).sort((a, b) => a.start_time - b.start_time);
      return {
        notes: lvNotes,
        note_times: lvNotes.map((n) => n.time),
        chords: lvChords,
        chord_times: lvChords.map((c) => c.time),
        anchors: lvAnchors,
        anchor_times: lvAnchors.map((a) => a.time),
        hand_shapes: lvHs,
        hs_times: lvHs.map((h) => h.start_time)
      };
    };
    if (topOnly && nAuthored > 1 && phrasesEl && itersEl) {
      const keys = [...allLevels.keys()].sort((a, b) => a - b);
      const plist = findAll(phrasesEl, "phrase");
      const need = /* @__PURE__ */ new Set();
      for (const it of findAll(itersEl, "phraseIteration")) {
        const pid = int(it, "phraseId");
        if (pid >= plist.length) continue;
        const i = upperBound(keys, int(plist[pid], "maxDifficulty"));
        if (i) need.add(keys[i - 1]);
      }
      if (need.size) {
        for (const k of [...allLevels.keys()]) if (!need.has(k)) allLevels.delete(k);
      }
    }
    const parsed = /* @__PURE__ */ new Map();
    for (const [d, el] of allLevels) parsed.set(d, parseLevelFully(el));
    const sliceOf = (p, t0, t1) => {
      const s = (items, times) => items.slice(lowerBound(times, t0), lowerBound(times, t1));
      return [s(p.notes, p.note_times), s(p.chords, p.chord_times), s(p.anchors, p.anchor_times), s(p.hand_shapes, p.hs_times)];
    };
    let notes = [], chords = [], anchors = [], handShapes = [];
    const collect = (p, t0, t1) => {
      const [a, b, c, d] = sliceOf(p, t0, t1);
      notes = notes.concat(a);
      chords = chords.concat(b);
      anchors = anchors.concat(c);
      handShapes = handShapes.concat(d);
    };
    const bestLevelFallback = () => {
      let best = null, bestN = -1;
      for (const p of parsed.values()) {
        const n = p.notes.length + p.chords.length;
        if (n > bestN) {
          bestN = n;
          best = p;
        }
      }
      collect(best, 0, Infinity);
    };
    let phrases = null;
    if (nAuthored === 1) {
      collect(parsed.values().next().value, 0, Infinity);
    } else if (phrasesEl && itersEl && parsed.size) {
      const phraseList = findAll(phrasesEl, "phrase");
      const iterations = findAll(itersEl, "phraseIteration");
      let lastEvent = 0;
      for (const p of parsed.values()) {
        for (const n of p.notes) lastEvent = Math.max(lastEvent, n.time + (n.sustain || 0));
        if (p.chord_times.length) lastEvent = Math.max(lastEvent, p.chord_times[p.chord_times.length - 1]);
        if (p.anchor_times.length) lastEvent = Math.max(lastEvent, p.anchor_times[p.anchor_times.length - 1]);
        for (const h of p.hand_shapes) lastEvent = Math.max(lastEvent, h.end_time);
      }
      for (const it of iterations) lastEvent = Math.max(lastEvent, num(it, "time"));
      const songEnd = lastEvent + 1;
      phrases = [];
      for (let i = 0; i < iterations.length; i++) {
        const it = iterations[i];
        const pid = int(it, "phraseId");
        if (pid >= phraseList.length) continue;
        const maxDiff = int(phraseList[pid], "maxDifficulty");
        const tStart = num(it, "time");
        const tEnd = i + 1 < iterations.length ? num(iterations[i + 1], "time") : songEnd;
        const slices = /* @__PURE__ */ new Map();
        for (const diff of [...parsed.keys()].sort((a2, b2) => a2 - b2)) {
          if (diff > maxDiff) continue;
          slices.set(diff, sliceOf(parsed.get(diff), tStart, tEnd));
        }
        if (!slices.size) continue;
        phrases.push({ start_time: tStart, end_time: tEnd, max_difficulty: maxDiff });
        const flatDiff = slices.has(maxDiff) ? maxDiff : Math.max(...slices.keys());
        const [a, b, c, d] = slices.get(flatDiff);
        notes = notes.concat(a);
        chords = chords.concat(b);
        anchors = anchors.concat(c);
        handShapes = handShapes.concat(d);
      }
      if (!phrases.length) {
        phrases = null;
        bestLevelFallback();
      }
    } else if (parsed.size) {
      bestLevelFallback();
    }
    notes.sort((a, b) => a.time - b.time);
    chords.sort((a, b) => a.time - b.time);
    anchors.sort((a, b) => a.time - b.time);
    handShapes.sort((a, b) => a.start_time - b.start_time);
    let path_lead = false, path_rhythm = false, path_bass = false, bonus_arr = false, represent = 0;
    const props = find(root, "arrangementProperties");
    if (props) {
      path_lead = bool(props, "pathLead");
      path_rhythm = bool(props, "pathRhythm");
      path_bass = bool(props, "pathBass");
      bonus_arr = bool(props, "bonusArr");
      represent = int(props, "represent", 0);
    }
    return {
      name: arrName,
      tuning,
      capo,
      notes,
      chords,
      anchors,
      hand_shapes: handShapes,
      chord_templates: chordTemplates,
      phrases,
      tones: null,
      path_lead,
      path_rhythm,
      path_bass,
      bonus_arr,
      represent
    };
  }
  var stem = (n) => {
    const b = n.slice(n.lastIndexOf("/") + 1);
    const i = b.lastIndexOf(".");
    return (i < 0 ? b : b.slice(0, i)).toLowerCase();
  };
  var decodeText = (b) => new TextDecoder("utf-8", { fatal: false }).decode(b);
  function hasArrangementXml(files) {
    for (const name of files.keys()) {
      if (!name.toLowerCase().endsWith(".xml")) continue;
      let root;
      try {
        root = parseArchiveXml(files, name);
      } catch {
        continue;
      }
      if (root.tag !== "song") continue;
      const el = find(root, "arrangement");
      const low = el ? textOf(el).toLowerCase() : "";
      if (!["vocals", "showlights", "jvocals"].includes(low)) return true;
    }
    return false;
  }
  function loadSong(files, topOnly = true) {
    const song = {
      title: "",
      artist: "",
      album: "",
      year: 0,
      song_length: 0,
      offset: 0,
      beats: [],
      sections: [],
      arrangements: []
    };
    const manifestNames = /* @__PURE__ */ new Map();
    const manifestFlags = /* @__PURE__ */ new Map();
    for (const name of files.keys()) {
      if (!name.toLowerCase().endsWith(".json")) continue;
      let data;
      try {
        data = JSON.parse(decodeText(files.get(name)));
      } catch {
        continue;
      }
      const entries = data.Entries || {};
      for (const v of Object.values(entries)) {
        const attrs = v.Attributes || {};
        const arrName = attrs.ArrangementName || "";
        if (arrName && !["Vocals", "ShowLights", "JVocals"].includes(arrName)) {
          const key = stem(name);
          manifestNames.set(key, arrName);
          const props = attrs.ArrangementProperties || {};
          const prop = (k) => {
            const v2 = props[k];
            const n = parseInt(v2, 10);
            return Number.isNaN(n) ? 0 : n;
          };
          manifestFlags.set(key, {
            path_lead: !!prop("pathLead"),
            path_rhythm: !!prop("pathRhythm"),
            path_bass: !!prop("pathBass"),
            bonus_arr: !!prop("bonusArr"),
            represent: prop("represent")
          });
        }
      }
    }
    let metadataLoaded = false;
    const xmlNames = [...files.keys()].filter((n) => n.toLowerCase().endsWith(".xml")).sort();
    for (const name of xmlNames) {
      let root;
      try {
        root = parseArchiveXml(files, name);
      } catch {
        continue;
      }
      if (root.tag !== "song") continue;
      const el = find(root, "arrangement");
      if (el && textOf(el)) {
        const low = textOf(el).toLowerCase().trim();
        if (["vocals", "showlights", "jvocals"].includes(low)) continue;
      }
      if (!metadataLoaded) {
        for (const [tag, attr] of [["title", "title"], ["artistName", "artist"], ["albumName", "album"]]) {
          const node = find(root, tag);
          if (node && textOf(node)) song[attr] = node.text.trim();
        }
        const yearEl = find(root, "albumYear");
        if (yearEl && textOf(yearEl)) {
          const y = parseInt(textOf(yearEl), 10);
          if (!Number.isNaN(y)) song.year = y;
        }
        const lenEl = find(root, "songLength");
        if (lenEl && textOf(lenEl)) song.song_length = parseFloat(textOf(lenEl));
        const offEl = find(root, "offset");
        if (offEl && textOf(offEl)) song.offset = parseFloat(textOf(offEl));
        const beatsEl = find(root, "ebeats");
        if (beatsEl) for (const eb of findAll(beatsEl, "ebeat")) song.beats.push({ time: num(eb, "time"), measure: int(eb, "measure", -1) });
        const secEl = find(root, "sections");
        if (secEl) for (const s of findAll(secEl, "section")) {
          song.sections.push({ name: getAttr(s, "name", ""), number: int(s, "number"), time: num(s, "startTime") });
        }
        metadataLoaded = true;
      }
      const arrangement = parseArrangement(root, topOnly);
      const flags = manifestFlags.get(stem(name));
      if (flags) Object.assign(arrangement, flags);
      const mname = manifestNames.get(stem(name));
      if (mname) arrangement.name = mname;
      else {
        const map2 = {
          "part real_guitar": "Lead",
          "part real_guitar_22": "Rhythm",
          "part real_bass": "Bass",
          "part real_guitar_bonus": "Bonus Lead",
          "part real_bass_22": "Bass 2"
        };
        const low = arrangement.name.toLowerCase().trim();
        if (low in map2) arrangement.name = map2[low];
        else if (!arrangement.name || low.startsWith("part ")) {
          const fname = stem(name);
          if (fname.includes("lead")) arrangement.name = "Lead";
          else if (fname.includes("rhythm")) arrangement.name = "Rhythm";
          else if (fname.includes("bass")) arrangement.name = "Bass";
          else if (fname.includes("combo")) arrangement.name = "Combo";
          else arrangement.name = stem(name);
        }
      }
      song.arrangements.push(arrangement);
    }
    const prio = { lead: 0, combo: 1, rhythm: 2, bass: 3 };
    song.arrangements.sort((a, b) => (prio[a.name.toLowerCase()] ?? 99) - (prio[b.name.toLowerCase()] ?? 99));
    if (!song.title || !song.artist) loadManifestMetadata(song, files);
    return song;
  }
  function loadManifestMetadata(song, files) {
    for (const name of files.keys()) {
      if (!name.toLowerCase().endsWith(".json")) continue;
      let data;
      try {
        data = JSON.parse(decodeText(files.get(name)));
      } catch {
        continue;
      }
      const entries = data.Entries || data.entries || {};
      if (entries && Object.keys(entries).length) {
        for (const val of Object.values(entries)) {
          const attrs2 = val.Attributes || val.attributes || {};
          if (!song.title && attrs2.SongName) song.title = attrs2.SongName;
          if (!song.artist && attrs2.ArtistName) song.artist = attrs2.ArtistName;
          if (!song.album && attrs2.AlbumName) song.album = attrs2.AlbumName;
          if (!song.year && attrs2.SongYear) song.year = parseInt(attrs2.SongYear, 10) || 0;
          if (!song.song_length && attrs2.SongLength) song.song_length = parseFloat(attrs2.SongLength) || 0;
          if (song.title && song.artist) return;
        }
      }
      const attrs = data.Attributes || data.attributes || {};
      if (attrs && Object.keys(attrs).length) {
        if (!song.title && attrs.SongName) song.title = attrs.SongName;
        if (!song.artist && attrs.ArtistName) song.artist = attrs.ArtistName;
        if (!song.album && attrs.AlbumName) song.album = attrs.AlbumName;
        if (!song.year && attrs.SongYear) song.year = parseInt(attrs.SongYear, 10) || 0;
        if (!song.song_length && attrs.SongLength) song.song_length = parseFloat(attrs.SongLength) || 0;
        if (song.title && song.artist) return;
      }
    }
  }

  // js/tones.js
  var NON_TONE = /* @__PURE__ */ new Set(["vocals", "showlights", "jvocals"]);
  var tokens = (s) => new Set((s || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  var stemOf = (n) => {
    const b = n.slice(n.lastIndexOf("/") + 1);
    const i = b.lastIndexOf(".");
    return (i < 0 ? b : b.slice(0, i)).toLowerCase();
  };
  var decodeText2 = (b) => new TextDecoder("utf-8", { fatal: false }).decode(b);
  function manifestToneData(jsonNames, files, arrName) {
    const target = (arrName || "").trim().toLowerCase();
    for (const name of jsonNames) {
      let data;
      try {
        data = JSON.parse(decodeText2(files.get(name)));
      } catch {
        continue;
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) continue;
      const entries = data.Entries;
      if (!entries || typeof entries !== "object" || Array.isArray(entries)) continue;
      for (const entry of Object.values(entries)) {
        if (!entry || typeof entry !== "object") continue;
        const attrs = entry.Attributes;
        if (!attrs || typeof attrs !== "object") continue;
        const raw = attrs.ArrangementName;
        const name2 = typeof raw === "string" ? raw.trim() : "";
        if (!name2 || name2.toLowerCase() !== target) continue;
        const definitions = [];
        const seen = /* @__PURE__ */ new Set();
        const rawTones = Array.isArray(attrs.Tones) ? attrs.Tones : [];
        for (const tone of rawTones) {
          if (!tone || typeof tone !== "object") continue;
          const key = tone.Key;
          if (typeof key === "string" && key) {
            if (seen.has(key)) continue;
            seen.add(key);
          }
          definitions.push(tone);
        }
        const idName = /* @__PURE__ */ new Map();
        ["Tone_A", "Tone_B", "Tone_C", "Tone_D"].forEach((k, i) => {
          const v = attrs[k];
          if (typeof v === "string" && v) idName.set(i, v);
        });
        return { definitions, idName, jsonStem: stemOf(name) };
      }
    }
    return { definitions: [], idName: /* @__PURE__ */ new Map(), jsonStem: null };
  }
  function xmlToneChanges(files, name, idName) {
    let root;
    try {
      root = parseArchiveXml(files, name);
    } catch {
      return { base: "", changes: [] };
    }
    if (root.tag !== "song") return { base: "", changes: [] };
    let base = "";
    const tb = find(root, "tonebase");
    if (tb && textOf(tb)) base = textOf(tb);
    const changes = [];
    const tonesEl = find(root, "tones");
    if (tonesEl) {
      for (const t of findAll(tonesEl, "tone")) {
        const time = getAttr(t, "time");
        let name2 = getAttr(t, "name", "");
        const id = getAttr(t, "id", "");
        if ((!name2 || name2 === "N/A") && id) {
          const n = parseInt(id, 10);
          if (!Number.isNaN(n)) name2 = idName.get(n) ?? `Tone ${id}`;
        }
        if (time && name2) {
          const tv = parseFloat(time);
          if (!Number.isFinite(tv)) continue;
          changes.push({ t: Math.round(tv * 1e3) / 1e3, name: name2 });
        }
      }
    }
    return { base, changes };
  }
  function extractOne(arrName, jsonNames, xmlNames, files) {
    if (NON_TONE.has((arrName || "").trim().toLowerCase())) return null;
    const { definitions, idName, jsonStem } = manifestToneData(jsonNames, files, arrName);
    let xmlName = null;
    if (jsonStem) xmlName = xmlNames.find((n) => stemOf(n) === jsonStem) || null;
    if (!xmlName) {
      const target = tokens(arrName);
      if (target.size) {
        const candidates = [];
        for (const n of xmlNames) {
          const st = tokens(stemOf(n));
          const subset = [...target].every((t) => st.has(t));
          if (!subset) continue;
          let extra = 0;
          for (const t of st) if (!target.has(t)) extra++;
          candidates.push([extra, n]);
        }
        if (candidates.length) {
          const best = Math.min(...candidates.map((c) => c[0]));
          const tied = candidates.filter((c) => c[0] === best).map((c) => c[1]);
          if (tied.length === 1) xmlName = tied[0];
        }
      }
    }
    let base = "", changes = [];
    if (xmlName) ({ base, changes } = xmlToneChanges(files, xmlName, idName));
    if (!base && idName.has(0)) base = idName.get(0);
    if (!base && !changes.length && !definitions.length) return null;
    const result = {};
    if (base) result.base = base;
    if (changes.length) result.changes = changes.sort((a, b) => a.t - b.t);
    if (definitions.length) result.definitions = definitions;
    return result;
  }
  function extractTonesForSong(files, arrNames) {
    const names = [...files.keys()].sort();
    const jsonNames = names.filter((n) => n.toLowerCase().endsWith(".json"));
    const xmlNames = names.filter((n) => n.toLowerCase().endsWith(".xml"));
    const out = /* @__PURE__ */ new Map();
    for (const name of arrNames) {
      const block = extractOne(name, jsonNames, xmlNames, files);
      if (block) out.set(name, block);
    }
    return out;
  }

  // js/convert.js
  var r32 = (v) => Math.round(v * 1e3) / 1e3;
  function arrId(name, used) {
    let base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "arr";
    let cand = base, i = 2;
    while (used.has(cand)) cand = `${base}${i++}`;
    used.add(cand);
    return cand;
  }
  var GAME_LYRIC_LEAD = 0.1;
  async function parseLyrics(files) {
    const names = [...files.keys()].sort();
    for (const n of names) {
      if (!n.toLowerCase().endsWith(".xml")) continue;
      let root;
      try {
        root = parseArchiveXml(files, n);
      } catch {
        continue;
      }
      if (root.tag !== "vocals") continue;
      const toks = root.children.filter((c) => c.tag === "vocal").map((v) => ({
        t: r32(parseFloat(v.attrs.time || "0")),
        d: r32(parseFloat(v.attrs.length || "0")),
        w: v.attrs.lyric || ""
      }));
      if (toks.length) return { tokens: toks, source: "xml" };
    }
    return { tokens: [], source: "" };
  }
  function joinWords(parts) {
    let out = "", prevSyl = false;
    for (const [w, syl] of parts) {
      if (!out) out = w;
      else if (prevSyl) out += w;
      else out += " " + w;
      prevSyl = syl;
    }
    return out;
  }
  var LYRIC_LINE_GAP = 10;
  function lyricsFromTokens(tokens2) {
    const lines = [];
    let cur = [], syl = [], start = null, last = 0, prevT = null;
    const flush = () => {
      if (cur.length) lines.push({ t: r32(start), end: r32(last), text: joinWords(cur), syl });
      cur = [];
      syl = [];
      start = null;
      last = 0;
    };
    for (const tok of tokens2) {
      if (!tok || typeof tok !== "object") continue;
      let w = String(tok.w ?? "");
      const t = Number(tok.t || 0), d = Number(tok.d || 0);
      const eol = w.endsWith("+");
      if (eol) w = w.slice(0, -1);
      const cont = w.endsWith("-");
      if (cont) w = w.slice(0, -1);
      if (w.trim()) {
        if (cur.length && prevT !== null && t - prevT > LYRIC_LINE_GAP) flush();
        if (start === null) start = t;
        const glue = !cur.length || cur[cur.length - 1][1] ? "" : " ";
        cur.push([w, cont]);
        syl.push([r32(t), r32(d), glue + w]);
        last = Math.max(last, d > 0 ? t + d : t + 0.3);
        prevT = t;
      }
      if (eol) flush();
    }
    flush();
    return lines;
  }
  var isWide = (ch) => /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch);
  function textWidth(s) {
    let n = 0;
    for (const ch of s) n += isWide(ch) ? 2 : 1;
    return n;
  }
  function lyricsProblem(lines) {
    for (const ln of lines) {
      const n = (ln.syl || []).length;
      if (n > 45) return lines.length === 1 ? `the lyrics have no line breaks (${n} words in one line)` : `one lyric line holds ${n} words`;
      const w = textWidth(ln.text || "");
      if (w > 110) return `one lyric line is ${w} characters wide`;
      if (n > 1 && (ln.end || 0) - (ln.t || 0) > 45) return `one lyric line lasts ${Math.trunc(ln.end - ln.t)} seconds`;
    }
    return "";
  }
  var DESCRIPTOR_RE = /^\$\[\d+\]\s*/;
  function toneRealName(defn, title) {
    const words = [];
    for (const d of defn.ToneDescriptors || []) {
      if (typeof d !== "string") continue;
      const w = d.replace(DESCRIPTOR_RE, "").trim();
      if (w) words.push(w.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()));
    }
    if (!words.length) return "";
    let sep = defn.NameSeparator;
    sep = typeof sep === "string" && sep.trim() ? sep : " - ";
    return title ? `${title}${sep}${words.join(" ")}` : words.join(" ");
  }
  function tonesForPage(tones, title) {
    const out = { base: "", changes: [], names: {} };
    if (!tones || typeof tones !== "object") return out;
    const defs = (tones.definitions || []).filter((d) => d && typeof d === "object");
    for (const d of defs) {
      const key = d.Key || d.Name || "";
      if (typeof key !== "string" || !key) continue;
      const entry = { raw: key, real: toneRealName(d, title) };
      out.names[key] = entry;
      if (typeof d.Name === "string" && d.Name) {
        if (!(d.Name in out.names)) out.names[d.Name] = entry;
      }
    }
    if (typeof tones.base === "string" && tones.base.trim()) out.base = tones.base.trim();
    else if (defs.length === 1) out.base = defs[0].Key || "";
    for (const c of tones.changes || []) {
      if (!c || typeof c.name !== "string") continue;
      const tv = Number(c.t);
      if (!Number.isFinite(tv)) continue;
      out.changes.push({ t: r32(tv), name: c.name });
    }
    out.changes.sort((a, b) => a.t - b.t);
    return out;
  }
  async function convertXmlSet(entries, { name = "song", onProgress = () => {
  } } = {}) {
    onProgress("Reading the XML\u2026");
    const files = /* @__PURE__ */ new Map();
    for (const e of entries) {
      if (!/\.(xml|json)$/i.test(e.name)) continue;
      const base = e.name.split(/[\\/]/).join("/");
      let key = base, i = 2;
      while (files.has(key)) key = base.replace(/(\.[^.]+)$/, `_${i++}$1`);
      files.set(key, e.bytes instanceof Uint8Array ? e.bytes : new Uint8Array(e.bytes));
    }
    if (!files.size) throw new Error("no .xml file among the dropped files");
    if (!hasArrangementXml(files)) {
      throw new Error("no arrangement XML found - a chart XML has a <song> root (vocals alone cannot be played)");
    }
    const payload = await buildPayload(files, { name, hasCover: false, onProgress });
    if (!payload.meta.title) payload.meta.title = name.replace(/\.[^.]+$/, "");
    return { payload };
  }
  async function buildPayload(files, { name, hasCover, onProgress }) {
    onProgress("Parsing the arrangements\u2026");
    const song = loadSong(files, true);
    if (!song.arrangements.length) throw new Error("no playable arrangements found");
    onProgress("Reading tones and lyrics\u2026");
    const tonesByArr = extractTonesForSong(files, song.arrangements.map((a) => a.name));
    const parsed = await parseLyrics(files), source = parsed.source;
    const tokens2 = parsed.tokens.map((tk) => ({ ...tk, t: r32(Math.max(0, (tk.t || 0) - GAME_LYRIC_LEAD)) }));
    let lines = lyricsFromTokens(tokens2);
    let lyricError = "";
    if (lines.length) {
      const problem = lyricsProblem(lines);
      if (problem) {
        lyricError = problem;
        lines = [];
      }
    } else if (tokens2.length === 0 && source === "") {
      lines = [];
    }
    const used = /* @__PURE__ */ new Set();
    clearXmlCache();
    const arrs = [];
    let first = true;
    const wires = [];
    for (const arr of song.arrangements) {
      const aid = arrId(arr.name, used);
      arr.tones = tonesByArr.get(arr.name) || null;
      const wire = arrangementToWire(arr);
      if (first) {
        wire.beats = song.beats.map((b) => ({ time: r32(b.time), measure: b.measure }));
        wire.sections = song.sections.map((s) => ({ name: s.name, number: s.number, time: r32(s.time) }));
        first = false;
      }
      wires.push({ arr, aid, wire });
      arrs.push({
        id: aid,
        name: arr.name,
        tuning: arr.tuning,
        capo: arr.capo,
        notes: wire.notes,
        chords: wire.chords,
        templates: wire.templates,
        anchors: wire.anchors,
        handshapes: wire.handshapes,
        phrases: (wire.phrases || []).map((p) => ({
          start_time: p.start_time,
          end_time: p.end_time,
          max_difficulty: p.max_difficulty
        })),
        tones: tonesForPage(wire.tones, song.title || "")
      });
    }
    const firstWire = wires[0].wire;
    const payload = {
      meta: {
        title: song.title || "",
        artist: song.artist || "",
        album: song.album || "",
        year: song.year || 0,
        author: "",
        duration: r32(song.song_length || 0),
        pack: name,
        converted: true,
        cover: !!hasCover,
        note_offset_ms: 0
      },
      arrangements: arrs,
      beats: firstWire.beats || [],
      sections: firstWire.sections || [],
      lyrics: lyricError ? { lines: [], source, error: lyricError } : { lines, source },
      stems: [{ id: "full", file: "stems/full.wav" }]
    };
    return payload;
  }

  // vendor/js-yaml.mjs
  /*! js-yaml 4.1.0 https://github.com/nodeca/js-yaml @license MIT */
  function isNothing(subject) {
    return typeof subject === "undefined" || subject === null;
  }
  function isObject(subject) {
    return typeof subject === "object" && subject !== null;
  }
  function toArray(sequence) {
    if (Array.isArray(sequence)) return sequence;
    else if (isNothing(sequence)) return [];
    return [sequence];
  }
  function extend(target, source) {
    var index, length, key, sourceKeys;
    if (source) {
      sourceKeys = Object.keys(source);
      for (index = 0, length = sourceKeys.length; index < length; index += 1) {
        key = sourceKeys[index];
        target[key] = source[key];
      }
    }
    return target;
  }
  function repeat(string, count) {
    var result = "", cycle;
    for (cycle = 0; cycle < count; cycle += 1) {
      result += string;
    }
    return result;
  }
  function isNegativeZero(number) {
    return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
  }
  var isNothing_1 = isNothing;
  var isObject_1 = isObject;
  var toArray_1 = toArray;
  var repeat_1 = repeat;
  var isNegativeZero_1 = isNegativeZero;
  var extend_1 = extend;
  var common = {
    isNothing: isNothing_1,
    isObject: isObject_1,
    toArray: toArray_1,
    repeat: repeat_1,
    isNegativeZero: isNegativeZero_1,
    extend: extend_1
  };
  function formatError(exception2, compact) {
    var where = "", message = exception2.reason || "(unknown reason)";
    if (!exception2.mark) return message;
    if (exception2.mark.name) {
      where += 'in "' + exception2.mark.name + '" ';
    }
    where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
    if (!compact && exception2.mark.snippet) {
      where += "\n\n" + exception2.mark.snippet;
    }
    return message + " " + where;
  }
  function YAMLException$1(reason, mark) {
    Error.call(this);
    this.name = "YAMLException";
    this.reason = reason;
    this.mark = mark;
    this.message = formatError(this, false);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error().stack || "";
    }
  }
  YAMLException$1.prototype = Object.create(Error.prototype);
  YAMLException$1.prototype.constructor = YAMLException$1;
  YAMLException$1.prototype.toString = function toString(compact) {
    return this.name + ": " + formatError(this, compact);
  };
  var exception = YAMLException$1;
  function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
    var head = "";
    var tail = "";
    var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
    if (position - lineStart > maxHalfLength) {
      head = " ... ";
      lineStart = position - maxHalfLength + head.length;
    }
    if (lineEnd - position > maxHalfLength) {
      tail = " ...";
      lineEnd = position + maxHalfLength - tail.length;
    }
    return {
      str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
      pos: position - lineStart + head.length
      // relative position
    };
  }
  function padStart(string, max) {
    return common.repeat(" ", max - string.length) + string;
  }
  function makeSnippet(mark, options) {
    options = Object.create(options || null);
    if (!mark.buffer) return null;
    if (!options.maxLength) options.maxLength = 79;
    if (typeof options.indent !== "number") options.indent = 1;
    if (typeof options.linesBefore !== "number") options.linesBefore = 3;
    if (typeof options.linesAfter !== "number") options.linesAfter = 2;
    var re = /\r?\n|\r|\0/g;
    var lineStarts = [0];
    var lineEnds = [];
    var match;
    var foundLineNo = -1;
    while (match = re.exec(mark.buffer)) {
      lineEnds.push(match.index);
      lineStarts.push(match.index + match[0].length);
      if (mark.position <= match.index && foundLineNo < 0) {
        foundLineNo = lineStarts.length - 2;
      }
    }
    if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
    var result = "", i, line;
    var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
    var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
    for (i = 1; i <= options.linesBefore; i++) {
      if (foundLineNo - i < 0) break;
      line = getLine(
        mark.buffer,
        lineStarts[foundLineNo - i],
        lineEnds[foundLineNo - i],
        mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
        maxLineLength
      );
      result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
    }
    line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
    result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
    result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
    for (i = 1; i <= options.linesAfter; i++) {
      if (foundLineNo + i >= lineEnds.length) break;
      line = getLine(
        mark.buffer,
        lineStarts[foundLineNo + i],
        lineEnds[foundLineNo + i],
        mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
        maxLineLength
      );
      result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + "\n";
    }
    return result.replace(/\n$/, "");
  }
  var snippet = makeSnippet;
  var TYPE_CONSTRUCTOR_OPTIONS = [
    "kind",
    "multi",
    "resolve",
    "construct",
    "instanceOf",
    "predicate",
    "represent",
    "representName",
    "defaultStyle",
    "styleAliases"
  ];
  var YAML_NODE_KINDS = [
    "scalar",
    "sequence",
    "mapping"
  ];
  function compileStyleAliases(map2) {
    var result = {};
    if (map2 !== null) {
      Object.keys(map2).forEach(function(style) {
        map2[style].forEach(function(alias) {
          result[String(alias)] = style;
        });
      });
    }
    return result;
  }
  function Type$1(tag, options) {
    options = options || {};
    Object.keys(options).forEach(function(name) {
      if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
        throw new exception('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
      }
    });
    this.options = options;
    this.tag = tag;
    this.kind = options["kind"] || null;
    this.resolve = options["resolve"] || function() {
      return true;
    };
    this.construct = options["construct"] || function(data) {
      return data;
    };
    this.instanceOf = options["instanceOf"] || null;
    this.predicate = options["predicate"] || null;
    this.represent = options["represent"] || null;
    this.representName = options["representName"] || null;
    this.defaultStyle = options["defaultStyle"] || null;
    this.multi = options["multi"] || false;
    this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
    if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
      throw new exception('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
    }
  }
  var type = Type$1;
  function compileList(schema2, name) {
    var result = [];
    schema2[name].forEach(function(currentType) {
      var newIndex = result.length;
      result.forEach(function(previousType, previousIndex) {
        if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
          newIndex = previousIndex;
        }
      });
      result[newIndex] = currentType;
    });
    return result;
  }
  function compileMap() {
    var result = {
      scalar: {},
      sequence: {},
      mapping: {},
      fallback: {},
      multi: {
        scalar: [],
        sequence: [],
        mapping: [],
        fallback: []
      }
    }, index, length;
    function collectType(type2) {
      if (type2.multi) {
        result.multi[type2.kind].push(type2);
        result.multi["fallback"].push(type2);
      } else {
        result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
      }
    }
    for (index = 0, length = arguments.length; index < length; index += 1) {
      arguments[index].forEach(collectType);
    }
    return result;
  }
  function Schema$1(definition) {
    return this.extend(definition);
  }
  Schema$1.prototype.extend = function extend2(definition) {
    var implicit = [];
    var explicit = [];
    if (definition instanceof type) {
      explicit.push(definition);
    } else if (Array.isArray(definition)) {
      explicit = explicit.concat(definition);
    } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
      if (definition.implicit) implicit = implicit.concat(definition.implicit);
      if (definition.explicit) explicit = explicit.concat(definition.explicit);
    } else {
      throw new exception("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
    }
    implicit.forEach(function(type$1) {
      if (!(type$1 instanceof type)) {
        throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      }
      if (type$1.loadKind && type$1.loadKind !== "scalar") {
        throw new exception("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
      }
      if (type$1.multi) {
        throw new exception("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
      }
    });
    explicit.forEach(function(type$1) {
      if (!(type$1 instanceof type)) {
        throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      }
    });
    var result = Object.create(Schema$1.prototype);
    result.implicit = (this.implicit || []).concat(implicit);
    result.explicit = (this.explicit || []).concat(explicit);
    result.compiledImplicit = compileList(result, "implicit");
    result.compiledExplicit = compileList(result, "explicit");
    result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
    return result;
  };
  var schema = Schema$1;
  var str = new type("tag:yaml.org,2002:str", {
    kind: "scalar",
    construct: function(data) {
      return data !== null ? data : "";
    }
  });
  var seq = new type("tag:yaml.org,2002:seq", {
    kind: "sequence",
    construct: function(data) {
      return data !== null ? data : [];
    }
  });
  var map = new type("tag:yaml.org,2002:map", {
    kind: "mapping",
    construct: function(data) {
      return data !== null ? data : {};
    }
  });
  var failsafe = new schema({
    explicit: [
      str,
      seq,
      map
    ]
  });
  function resolveYamlNull(data) {
    if (data === null) return true;
    var max = data.length;
    return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
  }
  function constructYamlNull() {
    return null;
  }
  function isNull(object) {
    return object === null;
  }
  var _null = new type("tag:yaml.org,2002:null", {
    kind: "scalar",
    resolve: resolveYamlNull,
    construct: constructYamlNull,
    predicate: isNull,
    represent: {
      canonical: function() {
        return "~";
      },
      lowercase: function() {
        return "null";
      },
      uppercase: function() {
        return "NULL";
      },
      camelcase: function() {
        return "Null";
      },
      empty: function() {
        return "";
      }
    },
    defaultStyle: "lowercase"
  });
  function resolveYamlBoolean(data) {
    if (data === null) return false;
    var max = data.length;
    return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
  }
  function constructYamlBoolean(data) {
    return data === "true" || data === "True" || data === "TRUE";
  }
  function isBoolean(object) {
    return Object.prototype.toString.call(object) === "[object Boolean]";
  }
  var bool2 = new type("tag:yaml.org,2002:bool", {
    kind: "scalar",
    resolve: resolveYamlBoolean,
    construct: constructYamlBoolean,
    predicate: isBoolean,
    represent: {
      lowercase: function(object) {
        return object ? "true" : "false";
      },
      uppercase: function(object) {
        return object ? "TRUE" : "FALSE";
      },
      camelcase: function(object) {
        return object ? "True" : "False";
      }
    },
    defaultStyle: "lowercase"
  });
  function isHexCode(c) {
    return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
  }
  function isOctCode(c) {
    return 48 <= c && c <= 55;
  }
  function isDecCode(c) {
    return 48 <= c && c <= 57;
  }
  function resolveYamlInteger(data) {
    if (data === null) return false;
    var max = data.length, index = 0, hasDigits = false, ch;
    if (!max) return false;
    ch = data[index];
    if (ch === "-" || ch === "+") {
      ch = data[++index];
    }
    if (ch === "0") {
      if (index + 1 === max) return true;
      ch = data[++index];
      if (ch === "b") {
        index++;
        for (; index < max; index++) {
          ch = data[index];
          if (ch === "_") continue;
          if (ch !== "0" && ch !== "1") return false;
          hasDigits = true;
        }
        return hasDigits && ch !== "_";
      }
      if (ch === "x") {
        index++;
        for (; index < max; index++) {
          ch = data[index];
          if (ch === "_") continue;
          if (!isHexCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && ch !== "_";
      }
      if (ch === "o") {
        index++;
        for (; index < max; index++) {
          ch = data[index];
          if (ch === "_") continue;
          if (!isOctCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && ch !== "_";
      }
    }
    if (ch === "_") return false;
    for (; index < max; index++) {
      ch = data[index];
      if (ch === "_") continue;
      if (!isDecCode(data.charCodeAt(index))) {
        return false;
      }
      hasDigits = true;
    }
    if (!hasDigits || ch === "_") return false;
    return true;
  }
  function constructYamlInteger(data) {
    var value = data, sign = 1, ch;
    if (value.indexOf("_") !== -1) {
      value = value.replace(/_/g, "");
    }
    ch = value[0];
    if (ch === "-" || ch === "+") {
      if (ch === "-") sign = -1;
      value = value.slice(1);
      ch = value[0];
    }
    if (value === "0") return 0;
    if (ch === "0") {
      if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
      if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
      if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
    }
    return sign * parseInt(value, 10);
  }
  function isInteger(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common.isNegativeZero(object));
  }
  var int2 = new type("tag:yaml.org,2002:int", {
    kind: "scalar",
    resolve: resolveYamlInteger,
    construct: constructYamlInteger,
    predicate: isInteger,
    represent: {
      binary: function(obj) {
        return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
      },
      octal: function(obj) {
        return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
      },
      decimal: function(obj) {
        return obj.toString(10);
      },
      /* eslint-disable max-len */
      hexadecimal: function(obj) {
        return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
      }
    },
    defaultStyle: "decimal",
    styleAliases: {
      binary: [2, "bin"],
      octal: [8, "oct"],
      decimal: [10, "dec"],
      hexadecimal: [16, "hex"]
    }
  });
  var YAML_FLOAT_PATTERN = new RegExp(
    // 2.5e4, 2.5 and integers
    "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
  );
  function resolveYamlFloat(data) {
    if (data === null) return false;
    if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
    // Probably should update regexp & check speed
    data[data.length - 1] === "_") {
      return false;
    }
    return true;
  }
  function constructYamlFloat(data) {
    var value, sign;
    value = data.replace(/_/g, "").toLowerCase();
    sign = value[0] === "-" ? -1 : 1;
    if ("+-".indexOf(value[0]) >= 0) {
      value = value.slice(1);
    }
    if (value === ".inf") {
      return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    } else if (value === ".nan") {
      return NaN;
    }
    return sign * parseFloat(value, 10);
  }
  var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
  function representYamlFloat(object, style) {
    var res;
    if (isNaN(object)) {
      switch (style) {
        case "lowercase":
          return ".nan";
        case "uppercase":
          return ".NAN";
        case "camelcase":
          return ".NaN";
      }
    } else if (Number.POSITIVE_INFINITY === object) {
      switch (style) {
        case "lowercase":
          return ".inf";
        case "uppercase":
          return ".INF";
        case "camelcase":
          return ".Inf";
      }
    } else if (Number.NEGATIVE_INFINITY === object) {
      switch (style) {
        case "lowercase":
          return "-.inf";
        case "uppercase":
          return "-.INF";
        case "camelcase":
          return "-.Inf";
      }
    } else if (common.isNegativeZero(object)) {
      return "-0.0";
    }
    res = object.toString(10);
    return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
  }
  function isFloat(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
  }
  var float = new type("tag:yaml.org,2002:float", {
    kind: "scalar",
    resolve: resolveYamlFloat,
    construct: constructYamlFloat,
    predicate: isFloat,
    represent: representYamlFloat,
    defaultStyle: "lowercase"
  });
  var json = failsafe.extend({
    implicit: [
      _null,
      bool2,
      int2,
      float
    ]
  });
  var core = json;
  var YAML_DATE_REGEXP = new RegExp(
    "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
  );
  var YAML_TIMESTAMP_REGEXP = new RegExp(
    "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
  );
  function resolveYamlTimestamp(data) {
    if (data === null) return false;
    if (YAML_DATE_REGEXP.exec(data) !== null) return true;
    if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
    return false;
  }
  function constructYamlTimestamp(data) {
    var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
    match = YAML_DATE_REGEXP.exec(data);
    if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
    if (match === null) throw new Error("Date resolve error");
    year = +match[1];
    month = +match[2] - 1;
    day = +match[3];
    if (!match[4]) {
      return new Date(Date.UTC(year, month, day));
    }
    hour = +match[4];
    minute = +match[5];
    second = +match[6];
    if (match[7]) {
      fraction = match[7].slice(0, 3);
      while (fraction.length < 3) {
        fraction += "0";
      }
      fraction = +fraction;
    }
    if (match[9]) {
      tz_hour = +match[10];
      tz_minute = +(match[11] || 0);
      delta = (tz_hour * 60 + tz_minute) * 6e4;
      if (match[9] === "-") delta = -delta;
    }
    date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
    if (delta) date.setTime(date.getTime() - delta);
    return date;
  }
  function representYamlTimestamp(object) {
    return object.toISOString();
  }
  var timestamp = new type("tag:yaml.org,2002:timestamp", {
    kind: "scalar",
    resolve: resolveYamlTimestamp,
    construct: constructYamlTimestamp,
    instanceOf: Date,
    represent: representYamlTimestamp
  });
  function resolveYamlMerge(data) {
    return data === "<<" || data === null;
  }
  var merge = new type("tag:yaml.org,2002:merge", {
    kind: "scalar",
    resolve: resolveYamlMerge
  });
  var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
  function resolveYamlBinary(data) {
    if (data === null) return false;
    var code, idx, bitlen = 0, max = data.length, map2 = BASE64_MAP;
    for (idx = 0; idx < max; idx++) {
      code = map2.indexOf(data.charAt(idx));
      if (code > 64) continue;
      if (code < 0) return false;
      bitlen += 6;
    }
    return bitlen % 8 === 0;
  }
  function constructYamlBinary(data) {
    var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map2 = BASE64_MAP, bits = 0, result = [];
    for (idx = 0; idx < max; idx++) {
      if (idx % 4 === 0 && idx) {
        result.push(bits >> 16 & 255);
        result.push(bits >> 8 & 255);
        result.push(bits & 255);
      }
      bits = bits << 6 | map2.indexOf(input.charAt(idx));
    }
    tailbits = max % 4 * 6;
    if (tailbits === 0) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    } else if (tailbits === 18) {
      result.push(bits >> 10 & 255);
      result.push(bits >> 2 & 255);
    } else if (tailbits === 12) {
      result.push(bits >> 4 & 255);
    }
    return new Uint8Array(result);
  }
  function representYamlBinary(object) {
    var result = "", bits = 0, idx, tail, max = object.length, map2 = BASE64_MAP;
    for (idx = 0; idx < max; idx++) {
      if (idx % 3 === 0 && idx) {
        result += map2[bits >> 18 & 63];
        result += map2[bits >> 12 & 63];
        result += map2[bits >> 6 & 63];
        result += map2[bits & 63];
      }
      bits = (bits << 8) + object[idx];
    }
    tail = max % 3;
    if (tail === 0) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    } else if (tail === 2) {
      result += map2[bits >> 10 & 63];
      result += map2[bits >> 4 & 63];
      result += map2[bits << 2 & 63];
      result += map2[64];
    } else if (tail === 1) {
      result += map2[bits >> 2 & 63];
      result += map2[bits << 4 & 63];
      result += map2[64];
      result += map2[64];
    }
    return result;
  }
  function isBinary(obj) {
    return Object.prototype.toString.call(obj) === "[object Uint8Array]";
  }
  var binary = new type("tag:yaml.org,2002:binary", {
    kind: "scalar",
    resolve: resolveYamlBinary,
    construct: constructYamlBinary,
    predicate: isBinary,
    represent: representYamlBinary
  });
  var _hasOwnProperty$3 = Object.prototype.hasOwnProperty;
  var _toString$2 = Object.prototype.toString;
  function resolveYamlOmap(data) {
    if (data === null) return true;
    var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
    for (index = 0, length = object.length; index < length; index += 1) {
      pair = object[index];
      pairHasKey = false;
      if (_toString$2.call(pair) !== "[object Object]") return false;
      for (pairKey in pair) {
        if (_hasOwnProperty$3.call(pair, pairKey)) {
          if (!pairHasKey) pairHasKey = true;
          else return false;
        }
      }
      if (!pairHasKey) return false;
      if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
      else return false;
    }
    return true;
  }
  function constructYamlOmap(data) {
    return data !== null ? data : [];
  }
  var omap = new type("tag:yaml.org,2002:omap", {
    kind: "sequence",
    resolve: resolveYamlOmap,
    construct: constructYamlOmap
  });
  var _toString$1 = Object.prototype.toString;
  function resolveYamlPairs(data) {
    if (data === null) return true;
    var index, length, pair, keys, result, object = data;
    result = new Array(object.length);
    for (index = 0, length = object.length; index < length; index += 1) {
      pair = object[index];
      if (_toString$1.call(pair) !== "[object Object]") return false;
      keys = Object.keys(pair);
      if (keys.length !== 1) return false;
      result[index] = [keys[0], pair[keys[0]]];
    }
    return true;
  }
  function constructYamlPairs(data) {
    if (data === null) return [];
    var index, length, pair, keys, result, object = data;
    result = new Array(object.length);
    for (index = 0, length = object.length; index < length; index += 1) {
      pair = object[index];
      keys = Object.keys(pair);
      result[index] = [keys[0], pair[keys[0]]];
    }
    return result;
  }
  var pairs = new type("tag:yaml.org,2002:pairs", {
    kind: "sequence",
    resolve: resolveYamlPairs,
    construct: constructYamlPairs
  });
  var _hasOwnProperty$2 = Object.prototype.hasOwnProperty;
  function resolveYamlSet(data) {
    if (data === null) return true;
    var key, object = data;
    for (key in object) {
      if (_hasOwnProperty$2.call(object, key)) {
        if (object[key] !== null) return false;
      }
    }
    return true;
  }
  function constructYamlSet(data) {
    return data !== null ? data : {};
  }
  var set = new type("tag:yaml.org,2002:set", {
    kind: "mapping",
    resolve: resolveYamlSet,
    construct: constructYamlSet
  });
  var _default = core.extend({
    implicit: [
      timestamp,
      merge
    ],
    explicit: [
      binary,
      omap,
      pairs,
      set
    ]
  });
  var _hasOwnProperty$1 = Object.prototype.hasOwnProperty;
  var CONTEXT_FLOW_IN = 1;
  var CONTEXT_FLOW_OUT = 2;
  var CONTEXT_BLOCK_IN = 3;
  var CONTEXT_BLOCK_OUT = 4;
  var CHOMPING_CLIP = 1;
  var CHOMPING_STRIP = 2;
  var CHOMPING_KEEP = 3;
  var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
  var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
  var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
  var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
  var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
  function _class(obj) {
    return Object.prototype.toString.call(obj);
  }
  function is_EOL(c) {
    return c === 10 || c === 13;
  }
  function is_WHITE_SPACE(c) {
    return c === 9 || c === 32;
  }
  function is_WS_OR_EOL(c) {
    return c === 9 || c === 32 || c === 10 || c === 13;
  }
  function is_FLOW_INDICATOR(c) {
    return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
  }
  function fromHexCode(c) {
    var lc;
    if (48 <= c && c <= 57) {
      return c - 48;
    }
    lc = c | 32;
    if (97 <= lc && lc <= 102) {
      return lc - 97 + 10;
    }
    return -1;
  }
  function escapedHexLen(c) {
    if (c === 120) {
      return 2;
    }
    if (c === 117) {
      return 4;
    }
    if (c === 85) {
      return 8;
    }
    return 0;
  }
  function fromDecimalCode(c) {
    if (48 <= c && c <= 57) {
      return c - 48;
    }
    return -1;
  }
  function simpleEscapeSequence(c) {
    return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
  }
  function charFromCodepoint(c) {
    if (c <= 65535) {
      return String.fromCharCode(c);
    }
    return String.fromCharCode(
      (c - 65536 >> 10) + 55296,
      (c - 65536 & 1023) + 56320
    );
  }
  var simpleEscapeCheck = new Array(256);
  var simpleEscapeMap = new Array(256);
  for (i = 0; i < 256; i++) {
    simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
    simpleEscapeMap[i] = simpleEscapeSequence(i);
  }
  var i;
  function State$1(input, options) {
    this.input = input;
    this.filename = options["filename"] || null;
    this.schema = options["schema"] || _default;
    this.onWarning = options["onWarning"] || null;
    this.legacy = options["legacy"] || false;
    this.json = options["json"] || false;
    this.listener = options["listener"] || null;
    this.implicitTypes = this.schema.compiledImplicit;
    this.typeMap = this.schema.compiledTypeMap;
    this.length = input.length;
    this.position = 0;
    this.line = 0;
    this.lineStart = 0;
    this.lineIndent = 0;
    this.firstTabInLine = -1;
    this.documents = [];
  }
  function generateError(state, message) {
    var mark = {
      name: state.filename,
      buffer: state.input.slice(0, -1),
      // omit trailing \0
      position: state.position,
      line: state.line,
      column: state.position - state.lineStart
    };
    mark.snippet = snippet(mark);
    return new exception(message, mark);
  }
  function throwError(state, message) {
    throw generateError(state, message);
  }
  function throwWarning(state, message) {
    if (state.onWarning) {
      state.onWarning.call(null, generateError(state, message));
    }
  }
  var directiveHandlers = {
    YAML: function handleYamlDirective(state, name, args) {
      var match, major, minor;
      if (state.version !== null) {
        throwError(state, "duplication of %YAML directive");
      }
      if (args.length !== 1) {
        throwError(state, "YAML directive accepts exactly one argument");
      }
      match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
      if (match === null) {
        throwError(state, "ill-formed argument of the YAML directive");
      }
      major = parseInt(match[1], 10);
      minor = parseInt(match[2], 10);
      if (major !== 1) {
        throwError(state, "unacceptable YAML version of the document");
      }
      state.version = args[0];
      state.checkLineBreaks = minor < 2;
      if (minor !== 1 && minor !== 2) {
        throwWarning(state, "unsupported YAML version of the document");
      }
    },
    TAG: function handleTagDirective(state, name, args) {
      var handle, prefix;
      if (args.length !== 2) {
        throwError(state, "TAG directive accepts exactly two arguments");
      }
      handle = args[0];
      prefix = args[1];
      if (!PATTERN_TAG_HANDLE.test(handle)) {
        throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
      }
      if (_hasOwnProperty$1.call(state.tagMap, handle)) {
        throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
      }
      if (!PATTERN_TAG_URI.test(prefix)) {
        throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
      }
      try {
        prefix = decodeURIComponent(prefix);
      } catch (err) {
        throwError(state, "tag prefix is malformed: " + prefix);
      }
      state.tagMap[handle] = prefix;
    }
  };
  function captureSegment(state, start, end, checkJson) {
    var _position, _length, _character, _result;
    if (start < end) {
      _result = state.input.slice(start, end);
      if (checkJson) {
        for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
          _character = _result.charCodeAt(_position);
          if (!(_character === 9 || 32 <= _character && _character <= 1114111)) {
            throwError(state, "expected valid JSON character");
          }
        }
      } else if (PATTERN_NON_PRINTABLE.test(_result)) {
        throwError(state, "the stream contains non-printable characters");
      }
      state.result += _result;
    }
  }
  function mergeMappings(state, destination, source, overridableKeys) {
    var sourceKeys, key, index, quantity;
    if (!common.isObject(source)) {
      throwError(state, "cannot merge mappings; the provided source object is unacceptable");
    }
    sourceKeys = Object.keys(source);
    for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
      key = sourceKeys[index];
      if (!_hasOwnProperty$1.call(destination, key)) {
        destination[key] = source[key];
        overridableKeys[key] = true;
      }
    }
  }
  function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
    var index, quantity;
    if (Array.isArray(keyNode)) {
      keyNode = Array.prototype.slice.call(keyNode);
      for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
        if (Array.isArray(keyNode[index])) {
          throwError(state, "nested arrays are not supported inside keys");
        }
        if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
          keyNode[index] = "[object Object]";
        }
      }
    }
    if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
      keyNode = "[object Object]";
    }
    keyNode = String(keyNode);
    if (_result === null) {
      _result = {};
    }
    if (keyTag === "tag:yaml.org,2002:merge") {
      if (Array.isArray(valueNode)) {
        for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
          mergeMappings(state, _result, valueNode[index], overridableKeys);
        }
      } else {
        mergeMappings(state, _result, valueNode, overridableKeys);
      }
    } else {
      if (!state.json && !_hasOwnProperty$1.call(overridableKeys, keyNode) && _hasOwnProperty$1.call(_result, keyNode)) {
        state.line = startLine || state.line;
        state.lineStart = startLineStart || state.lineStart;
        state.position = startPos || state.position;
        throwError(state, "duplicated mapping key");
      }
      if (keyNode === "__proto__") {
        Object.defineProperty(_result, keyNode, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: valueNode
        });
      } else {
        _result[keyNode] = valueNode;
      }
      delete overridableKeys[keyNode];
    }
    return _result;
  }
  function readLineBreak(state) {
    var ch;
    ch = state.input.charCodeAt(state.position);
    if (ch === 10) {
      state.position++;
    } else if (ch === 13) {
      state.position++;
      if (state.input.charCodeAt(state.position) === 10) {
        state.position++;
      }
    } else {
      throwError(state, "a line break is expected");
    }
    state.line += 1;
    state.lineStart = state.position;
    state.firstTabInLine = -1;
  }
  function skipSeparationSpace(state, allowComments, checkIndent) {
    var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      while (is_WHITE_SPACE(ch)) {
        if (ch === 9 && state.firstTabInLine === -1) {
          state.firstTabInLine = state.position;
        }
        ch = state.input.charCodeAt(++state.position);
      }
      if (allowComments && ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 10 && ch !== 13 && ch !== 0);
      }
      if (is_EOL(ch)) {
        readLineBreak(state);
        ch = state.input.charCodeAt(state.position);
        lineBreaks++;
        state.lineIndent = 0;
        while (ch === 32) {
          state.lineIndent++;
          ch = state.input.charCodeAt(++state.position);
        }
      } else {
        break;
      }
    }
    if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
      throwWarning(state, "deficient indentation");
    }
    return lineBreaks;
  }
  function testDocumentSeparator(state) {
    var _position = state.position, ch;
    ch = state.input.charCodeAt(_position);
    if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
      _position += 3;
      ch = state.input.charCodeAt(_position);
      if (ch === 0 || is_WS_OR_EOL(ch)) {
        return true;
      }
    }
    return false;
  }
  function writeFoldedLines(state, count) {
    if (count === 1) {
      state.result += " ";
    } else if (count > 1) {
      state.result += common.repeat("\n", count - 1);
    }
  }
  function readPlainScalar(state, nodeIndent, withinFlowCollection) {
    var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
    ch = state.input.charCodeAt(state.position);
    if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
      return false;
    }
    if (ch === 63 || ch === 45) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
        return false;
      }
    }
    state.kind = "scalar";
    state.result = "";
    captureStart = captureEnd = state.position;
    hasPendingContent = false;
    while (ch !== 0) {
      if (ch === 58) {
        following = state.input.charCodeAt(state.position + 1);
        if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
          break;
        }
      } else if (ch === 35) {
        preceding = state.input.charCodeAt(state.position - 1);
        if (is_WS_OR_EOL(preceding)) {
          break;
        }
      } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
        break;
      } else if (is_EOL(ch)) {
        _line = state.line;
        _lineStart = state.lineStart;
        _lineIndent = state.lineIndent;
        skipSeparationSpace(state, false, -1);
        if (state.lineIndent >= nodeIndent) {
          hasPendingContent = true;
          ch = state.input.charCodeAt(state.position);
          continue;
        } else {
          state.position = captureEnd;
          state.line = _line;
          state.lineStart = _lineStart;
          state.lineIndent = _lineIndent;
          break;
        }
      }
      if (hasPendingContent) {
        captureSegment(state, captureStart, captureEnd, false);
        writeFoldedLines(state, state.line - _line);
        captureStart = captureEnd = state.position;
        hasPendingContent = false;
      }
      if (!is_WHITE_SPACE(ch)) {
        captureEnd = state.position + 1;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, captureEnd, false);
    if (state.result) {
      return true;
    }
    state.kind = _kind;
    state.result = _result;
    return false;
  }
  function readSingleQuotedScalar(state, nodeIndent) {
    var ch, captureStart, captureEnd;
    ch = state.input.charCodeAt(state.position);
    if (ch !== 39) {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      if (ch === 39) {
        captureSegment(state, captureStart, state.position, true);
        ch = state.input.charCodeAt(++state.position);
        if (ch === 39) {
          captureStart = state.position;
          state.position++;
          captureEnd = state.position;
        } else {
          return true;
        }
      } else if (is_EOL(ch)) {
        captureSegment(state, captureStart, captureEnd, true);
        writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
        throwError(state, "unexpected end of the document within a single quoted scalar");
      } else {
        state.position++;
        captureEnd = state.position;
      }
    }
    throwError(state, "unexpected end of the stream within a single quoted scalar");
  }
  function readDoubleQuotedScalar(state, nodeIndent) {
    var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
    ch = state.input.charCodeAt(state.position);
    if (ch !== 34) {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      if (ch === 34) {
        captureSegment(state, captureStart, state.position, true);
        state.position++;
        return true;
      } else if (ch === 92) {
        captureSegment(state, captureStart, state.position, true);
        ch = state.input.charCodeAt(++state.position);
        if (is_EOL(ch)) {
          skipSeparationSpace(state, false, nodeIndent);
        } else if (ch < 256 && simpleEscapeCheck[ch]) {
          state.result += simpleEscapeMap[ch];
          state.position++;
        } else if ((tmp = escapedHexLen(ch)) > 0) {
          hexLength = tmp;
          hexResult = 0;
          for (; hexLength > 0; hexLength--) {
            ch = state.input.charCodeAt(++state.position);
            if ((tmp = fromHexCode(ch)) >= 0) {
              hexResult = (hexResult << 4) + tmp;
            } else {
              throwError(state, "expected hexadecimal character");
            }
          }
          state.result += charFromCodepoint(hexResult);
          state.position++;
        } else {
          throwError(state, "unknown escape sequence");
        }
        captureStart = captureEnd = state.position;
      } else if (is_EOL(ch)) {
        captureSegment(state, captureStart, captureEnd, true);
        writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
        throwError(state, "unexpected end of the document within a double quoted scalar");
      } else {
        state.position++;
        captureEnd = state.position;
      }
    }
    throwError(state, "unexpected end of the stream within a double quoted scalar");
  }
  function readFlowCollection(state, nodeIndent) {
    var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch;
    ch = state.input.charCodeAt(state.position);
    if (ch === 91) {
      terminator = 93;
      isMapping = false;
      _result = [];
    } else if (ch === 123) {
      terminator = 125;
      isMapping = true;
      _result = {};
    } else {
      return false;
    }
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = _result;
    }
    ch = state.input.charCodeAt(++state.position);
    while (ch !== 0) {
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === terminator) {
        state.position++;
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = isMapping ? "mapping" : "sequence";
        state.result = _result;
        return true;
      } else if (!readNext) {
        throwError(state, "missed comma between flow collection entries");
      } else if (ch === 44) {
        throwError(state, "expected the node content, but found ','");
      }
      keyTag = keyNode = valueNode = null;
      isPair = isExplicitPair = false;
      if (ch === 63) {
        following = state.input.charCodeAt(state.position + 1);
        if (is_WS_OR_EOL(following)) {
          isPair = isExplicitPair = true;
          state.position++;
          skipSeparationSpace(state, true, nodeIndent);
        }
      }
      _line = state.line;
      _lineStart = state.lineStart;
      _pos = state.position;
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      keyTag = state.tag;
      keyNode = state.result;
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if ((isExplicitPair || state.line === _line) && ch === 58) {
        isPair = true;
        ch = state.input.charCodeAt(++state.position);
        skipSeparationSpace(state, true, nodeIndent);
        composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
        valueNode = state.result;
      }
      if (isMapping) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
      } else if (isPair) {
        _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
      } else {
        _result.push(keyNode);
      }
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === 44) {
        readNext = true;
        ch = state.input.charCodeAt(++state.position);
      } else {
        readNext = false;
      }
    }
    throwError(state, "unexpected end of the stream within a flow collection");
  }
  function readBlockScalar(state, nodeIndent) {
    var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch;
    ch = state.input.charCodeAt(state.position);
    if (ch === 124) {
      folding = false;
    } else if (ch === 62) {
      folding = true;
    } else {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    while (ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
      if (ch === 43 || ch === 45) {
        if (CHOMPING_CLIP === chomping) {
          chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
        } else {
          throwError(state, "repeat of a chomping mode identifier");
        }
      } else if ((tmp = fromDecimalCode(ch)) >= 0) {
        if (tmp === 0) {
          throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
        } else if (!detectedIndent) {
          textIndent = nodeIndent + tmp - 1;
          detectedIndent = true;
        } else {
          throwError(state, "repeat of an indentation width identifier");
        }
      } else {
        break;
      }
    }
    if (is_WHITE_SPACE(ch)) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (is_WHITE_SPACE(ch));
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (!is_EOL(ch) && ch !== 0);
      }
    }
    while (ch !== 0) {
      readLineBreak(state);
      state.lineIndent = 0;
      ch = state.input.charCodeAt(state.position);
      while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
      if (!detectedIndent && state.lineIndent > textIndent) {
        textIndent = state.lineIndent;
      }
      if (is_EOL(ch)) {
        emptyLines++;
        continue;
      }
      if (state.lineIndent < textIndent) {
        if (chomping === CHOMPING_KEEP) {
          state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        } else if (chomping === CHOMPING_CLIP) {
          if (didReadContent) {
            state.result += "\n";
          }
        }
        break;
      }
      if (folding) {
        if (is_WHITE_SPACE(ch)) {
          atMoreIndented = true;
          state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        } else if (atMoreIndented) {
          atMoreIndented = false;
          state.result += common.repeat("\n", emptyLines + 1);
        } else if (emptyLines === 0) {
          if (didReadContent) {
            state.result += " ";
          }
        } else {
          state.result += common.repeat("\n", emptyLines);
        }
      } else {
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      }
      didReadContent = true;
      detectedIndent = true;
      emptyLines = 0;
      captureStart = state.position;
      while (!is_EOL(ch) && ch !== 0) {
        ch = state.input.charCodeAt(++state.position);
      }
      captureSegment(state, captureStart, state.position, false);
    }
    return true;
  }
  function readBlockSequence(state, nodeIndent) {
    var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = _result;
    }
    ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      if (ch !== 45) {
        break;
      }
      following = state.input.charCodeAt(state.position + 1);
      if (!is_WS_OR_EOL(following)) {
        break;
      }
      detected = true;
      state.position++;
      if (skipSeparationSpace(state, true, -1)) {
        if (state.lineIndent <= nodeIndent) {
          _result.push(null);
          ch = state.input.charCodeAt(state.position);
          continue;
        }
      }
      _line = state.line;
      composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
      _result.push(state.result);
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
        throwError(state, "bad indentation of a sequence entry");
      } else if (state.lineIndent < nodeIndent) {
        break;
      }
    }
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "sequence";
      state.result = _result;
      return true;
    }
    return false;
  }
  function readBlockMapping(state, nodeIndent, flowIndent) {
    var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = _result;
    }
    ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (!atExplicitKey && state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      following = state.input.charCodeAt(state.position + 1);
      _line = state.line;
      if ((ch === 63 || ch === 58) && is_WS_OR_EOL(following)) {
        if (ch === 63) {
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = true;
          allowCompact = true;
        } else if (atExplicitKey) {
          atExplicitKey = false;
          allowCompact = true;
        } else {
          throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
        }
        state.position += 1;
        ch = following;
      } else {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
        if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
          break;
        }
        if (state.line === _line) {
          ch = state.input.charCodeAt(state.position);
          while (is_WHITE_SPACE(ch)) {
            ch = state.input.charCodeAt(++state.position);
          }
          if (ch === 58) {
            ch = state.input.charCodeAt(++state.position);
            if (!is_WS_OR_EOL(ch)) {
              throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
            }
            if (atExplicitKey) {
              storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
              keyTag = keyNode = valueNode = null;
            }
            detected = true;
            atExplicitKey = false;
            allowCompact = false;
            keyTag = state.tag;
            keyNode = state.result;
          } else if (detected) {
            throwError(state, "can not read an implicit mapping pair; a colon is missed");
          } else {
            state.tag = _tag;
            state.anchor = _anchor;
            return true;
          }
        } else if (detected) {
          throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      }
      if (state.line === _line || state.lineIndent > nodeIndent) {
        if (atExplicitKey) {
          _keyLine = state.line;
          _keyLineStart = state.lineStart;
          _keyPos = state.position;
        }
        if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
          if (atExplicitKey) {
            keyNode = state.result;
          } else {
            valueNode = state.result;
          }
        }
        if (!atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
      }
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
        throwError(state, "bad indentation of a mapping entry");
      } else if (state.lineIndent < nodeIndent) {
        break;
      }
    }
    if (atExplicitKey) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
    }
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "mapping";
      state.result = _result;
    }
    return detected;
  }
  function readTagProperty(state) {
    var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch;
    ch = state.input.charCodeAt(state.position);
    if (ch !== 33) return false;
    if (state.tag !== null) {
      throwError(state, "duplication of a tag property");
    }
    ch = state.input.charCodeAt(++state.position);
    if (ch === 60) {
      isVerbatim = true;
      ch = state.input.charCodeAt(++state.position);
    } else if (ch === 33) {
      isNamed = true;
      tagHandle = "!!";
      ch = state.input.charCodeAt(++state.position);
    } else {
      tagHandle = "!";
    }
    _position = state.position;
    if (isVerbatim) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 0 && ch !== 62);
      if (state.position < state.length) {
        tagName = state.input.slice(_position, state.position);
        ch = state.input.charCodeAt(++state.position);
      } else {
        throwError(state, "unexpected end of the stream within a verbatim tag");
      }
    } else {
      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        if (ch === 33) {
          if (!isNamed) {
            tagHandle = state.input.slice(_position - 1, state.position + 1);
            if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
              throwError(state, "named tag handle cannot contain such characters");
            }
            isNamed = true;
            _position = state.position + 1;
          } else {
            throwError(state, "tag suffix cannot contain exclamation marks");
          }
        }
        ch = state.input.charCodeAt(++state.position);
      }
      tagName = state.input.slice(_position, state.position);
      if (PATTERN_FLOW_INDICATORS.test(tagName)) {
        throwError(state, "tag suffix cannot contain flow indicator characters");
      }
    }
    if (tagName && !PATTERN_TAG_URI.test(tagName)) {
      throwError(state, "tag name cannot contain such characters: " + tagName);
    }
    try {
      tagName = decodeURIComponent(tagName);
    } catch (err) {
      throwError(state, "tag name is malformed: " + tagName);
    }
    if (isVerbatim) {
      state.tag = tagName;
    } else if (_hasOwnProperty$1.call(state.tagMap, tagHandle)) {
      state.tag = state.tagMap[tagHandle] + tagName;
    } else if (tagHandle === "!") {
      state.tag = "!" + tagName;
    } else if (tagHandle === "!!") {
      state.tag = "tag:yaml.org,2002:" + tagName;
    } else {
      throwError(state, 'undeclared tag handle "' + tagHandle + '"');
    }
    return true;
  }
  function readAnchorProperty(state) {
    var _position, ch;
    ch = state.input.charCodeAt(state.position);
    if (ch !== 38) return false;
    if (state.anchor !== null) {
      throwError(state, "duplication of an anchor property");
    }
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
      throwError(state, "name of an anchor node must contain at least one character");
    }
    state.anchor = state.input.slice(_position, state.position);
    return true;
  }
  function readAlias(state) {
    var _position, alias, ch;
    ch = state.input.charCodeAt(state.position);
    if (ch !== 42) return false;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
      throwError(state, "name of an alias node must contain at least one character");
    }
    alias = state.input.slice(_position, state.position);
    if (!_hasOwnProperty$1.call(state.anchorMap, alias)) {
      throwError(state, 'unidentified alias "' + alias + '"');
    }
    state.result = state.anchorMap[alias];
    skipSeparationSpace(state, true, -1);
    return true;
  }
  function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
    var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type2, flowIndent, blockIndent;
    if (state.listener !== null) {
      state.listener("open", state);
    }
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
    if (allowToSeek) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      }
    }
    if (indentStatus === 1) {
      while (readTagProperty(state) || readAnchorProperty(state)) {
        if (skipSeparationSpace(state, true, -1)) {
          atNewLine = true;
          allowBlockCollections = allowBlockStyles;
          if (state.lineIndent > parentIndent) {
            indentStatus = 1;
          } else if (state.lineIndent === parentIndent) {
            indentStatus = 0;
          } else if (state.lineIndent < parentIndent) {
            indentStatus = -1;
          }
        } else {
          allowBlockCollections = false;
        }
      }
    }
    if (allowBlockCollections) {
      allowBlockCollections = atNewLine || allowCompact;
    }
    if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
      if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
        flowIndent = parentIndent;
      } else {
        flowIndent = parentIndent + 1;
      }
      blockIndent = state.position - state.lineStart;
      if (indentStatus === 1) {
        if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
          hasContent = true;
        } else {
          if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
            hasContent = true;
          } else if (readAlias(state)) {
            hasContent = true;
            if (state.tag !== null || state.anchor !== null) {
              throwError(state, "alias node should not have any properties");
            }
          } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
            hasContent = true;
            if (state.tag === null) {
              state.tag = "?";
            }
          }
          if (state.anchor !== null) {
            state.anchorMap[state.anchor] = state.result;
          }
        }
      } else if (indentStatus === 0) {
        hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
      }
    }
    if (state.tag === null) {
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    } else if (state.tag === "?") {
      if (state.result !== null && state.kind !== "scalar") {
        throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
      }
      for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
        type2 = state.implicitTypes[typeIndex];
        if (type2.resolve(state.result)) {
          state.result = type2.construct(state.result);
          state.tag = type2.tag;
          if (state.anchor !== null) {
            state.anchorMap[state.anchor] = state.result;
          }
          break;
        }
      }
    } else if (state.tag !== "!") {
      if (_hasOwnProperty$1.call(state.typeMap[state.kind || "fallback"], state.tag)) {
        type2 = state.typeMap[state.kind || "fallback"][state.tag];
      } else {
        type2 = null;
        typeList = state.typeMap.multi[state.kind || "fallback"];
        for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
          if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
            type2 = typeList[typeIndex];
            break;
          }
        }
      }
      if (!type2) {
        throwError(state, "unknown tag !<" + state.tag + ">");
      }
      if (state.result !== null && type2.kind !== state.kind) {
        throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
      }
      if (!type2.resolve(state.result, state.tag)) {
        throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
      } else {
        state.result = type2.construct(state.result, state.tag);
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    }
    if (state.listener !== null) {
      state.listener("close", state);
    }
    return state.tag !== null || state.anchor !== null || hasContent;
  }
  function readDocument(state) {
    var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
    state.version = null;
    state.checkLineBreaks = state.legacy;
    state.tagMap = /* @__PURE__ */ Object.create(null);
    state.anchorMap = /* @__PURE__ */ Object.create(null);
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if (state.lineIndent > 0 || ch !== 37) {
        break;
      }
      hasDirectives = true;
      ch = state.input.charCodeAt(++state.position);
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      directiveName = state.input.slice(_position, state.position);
      directiveArgs = [];
      if (directiveName.length < 1) {
        throwError(state, "directive name must not be less than one character in length");
      }
      while (ch !== 0) {
        while (is_WHITE_SPACE(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 35) {
          do {
            ch = state.input.charCodeAt(++state.position);
          } while (ch !== 0 && !is_EOL(ch));
          break;
        }
        if (is_EOL(ch)) break;
        _position = state.position;
        while (ch !== 0 && !is_WS_OR_EOL(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        directiveArgs.push(state.input.slice(_position, state.position));
      }
      if (ch !== 0) readLineBreak(state);
      if (_hasOwnProperty$1.call(directiveHandlers, directiveName)) {
        directiveHandlers[directiveName](state, directiveName, directiveArgs);
      } else {
        throwWarning(state, 'unknown document directive "' + directiveName + '"');
      }
    }
    skipSeparationSpace(state, true, -1);
    if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    } else if (hasDirectives) {
      throwError(state, "directives end mark is expected");
    }
    composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
    skipSeparationSpace(state, true, -1);
    if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
      throwWarning(state, "non-ASCII line breaks are interpreted as content");
    }
    state.documents.push(state.result);
    if (state.position === state.lineStart && testDocumentSeparator(state)) {
      if (state.input.charCodeAt(state.position) === 46) {
        state.position += 3;
        skipSeparationSpace(state, true, -1);
      }
      return;
    }
    if (state.position < state.length - 1) {
      throwError(state, "end of the stream or a document separator is expected");
    } else {
      return;
    }
  }
  function loadDocuments(input, options) {
    input = String(input);
    options = options || {};
    if (input.length !== 0) {
      if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
        input += "\n";
      }
      if (input.charCodeAt(0) === 65279) {
        input = input.slice(1);
      }
    }
    var state = new State$1(input, options);
    var nullpos = input.indexOf("\0");
    if (nullpos !== -1) {
      state.position = nullpos;
      throwError(state, "null byte is not allowed in input");
    }
    state.input += "\0";
    while (state.input.charCodeAt(state.position) === 32) {
      state.lineIndent += 1;
      state.position += 1;
    }
    while (state.position < state.length - 1) {
      readDocument(state);
    }
    return state.documents;
  }
  function loadAll$1(input, iterator, options) {
    if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
      options = iterator;
      iterator = null;
    }
    var documents = loadDocuments(input, options);
    if (typeof iterator !== "function") {
      return documents;
    }
    for (var index = 0, length = documents.length; index < length; index += 1) {
      iterator(documents[index]);
    }
  }
  function load$1(input, options) {
    var documents = loadDocuments(input, options);
    if (documents.length === 0) {
      return void 0;
    } else if (documents.length === 1) {
      return documents[0];
    }
    throw new exception("expected a single document in the stream, but found more");
  }
  var loadAll_1 = loadAll$1;
  var load_1 = load$1;
  var loader = {
    loadAll: loadAll_1,
    load: load_1
  };
  var _toString = Object.prototype.toString;
  var _hasOwnProperty = Object.prototype.hasOwnProperty;
  var CHAR_BOM = 65279;
  var CHAR_TAB = 9;
  var CHAR_LINE_FEED = 10;
  var CHAR_CARRIAGE_RETURN = 13;
  var CHAR_SPACE = 32;
  var CHAR_EXCLAMATION = 33;
  var CHAR_DOUBLE_QUOTE = 34;
  var CHAR_SHARP = 35;
  var CHAR_PERCENT = 37;
  var CHAR_AMPERSAND = 38;
  var CHAR_SINGLE_QUOTE = 39;
  var CHAR_ASTERISK = 42;
  var CHAR_COMMA = 44;
  var CHAR_MINUS = 45;
  var CHAR_COLON = 58;
  var CHAR_EQUALS = 61;
  var CHAR_GREATER_THAN = 62;
  var CHAR_QUESTION = 63;
  var CHAR_COMMERCIAL_AT = 64;
  var CHAR_LEFT_SQUARE_BRACKET = 91;
  var CHAR_RIGHT_SQUARE_BRACKET = 93;
  var CHAR_GRAVE_ACCENT = 96;
  var CHAR_LEFT_CURLY_BRACKET = 123;
  var CHAR_VERTICAL_LINE = 124;
  var CHAR_RIGHT_CURLY_BRACKET = 125;
  var ESCAPE_SEQUENCES = {};
  ESCAPE_SEQUENCES[0] = "\\0";
  ESCAPE_SEQUENCES[7] = "\\a";
  ESCAPE_SEQUENCES[8] = "\\b";
  ESCAPE_SEQUENCES[9] = "\\t";
  ESCAPE_SEQUENCES[10] = "\\n";
  ESCAPE_SEQUENCES[11] = "\\v";
  ESCAPE_SEQUENCES[12] = "\\f";
  ESCAPE_SEQUENCES[13] = "\\r";
  ESCAPE_SEQUENCES[27] = "\\e";
  ESCAPE_SEQUENCES[34] = '\\"';
  ESCAPE_SEQUENCES[92] = "\\\\";
  ESCAPE_SEQUENCES[133] = "\\N";
  ESCAPE_SEQUENCES[160] = "\\_";
  ESCAPE_SEQUENCES[8232] = "\\L";
  ESCAPE_SEQUENCES[8233] = "\\P";
  var DEPRECATED_BOOLEANS_SYNTAX = [
    "y",
    "Y",
    "yes",
    "Yes",
    "YES",
    "on",
    "On",
    "ON",
    "n",
    "N",
    "no",
    "No",
    "NO",
    "off",
    "Off",
    "OFF"
  ];
  var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
  function compileStyleMap(schema2, map2) {
    var result, keys, index, length, tag, style, type2;
    if (map2 === null) return {};
    result = {};
    keys = Object.keys(map2);
    for (index = 0, length = keys.length; index < length; index += 1) {
      tag = keys[index];
      style = String(map2[tag]);
      if (tag.slice(0, 2) === "!!") {
        tag = "tag:yaml.org,2002:" + tag.slice(2);
      }
      type2 = schema2.compiledTypeMap["fallback"][tag];
      if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
        style = type2.styleAliases[style];
      }
      result[tag] = style;
    }
    return result;
  }
  function encodeHex(character) {
    var string, handle, length;
    string = character.toString(16).toUpperCase();
    if (character <= 255) {
      handle = "x";
      length = 2;
    } else if (character <= 65535) {
      handle = "u";
      length = 4;
    } else if (character <= 4294967295) {
      handle = "U";
      length = 8;
    } else {
      throw new exception("code point within a string may not be greater than 0xFFFFFFFF");
    }
    return "\\" + handle + common.repeat("0", length - string.length) + string;
  }
  var QUOTING_TYPE_SINGLE = 1;
  var QUOTING_TYPE_DOUBLE = 2;
  function State(options) {
    this.schema = options["schema"] || _default;
    this.indent = Math.max(1, options["indent"] || 2);
    this.noArrayIndent = options["noArrayIndent"] || false;
    this.skipInvalid = options["skipInvalid"] || false;
    this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
    this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
    this.sortKeys = options["sortKeys"] || false;
    this.lineWidth = options["lineWidth"] || 80;
    this.noRefs = options["noRefs"] || false;
    this.noCompatMode = options["noCompatMode"] || false;
    this.condenseFlow = options["condenseFlow"] || false;
    this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
    this.forceQuotes = options["forceQuotes"] || false;
    this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
    this.implicitTypes = this.schema.compiledImplicit;
    this.explicitTypes = this.schema.compiledExplicit;
    this.tag = null;
    this.result = "";
    this.duplicates = [];
    this.usedDuplicates = null;
  }
  function indentString(string, spaces) {
    var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
    while (position < length) {
      next = string.indexOf("\n", position);
      if (next === -1) {
        line = string.slice(position);
        position = length;
      } else {
        line = string.slice(position, next + 1);
        position = next + 1;
      }
      if (line.length && line !== "\n") result += ind;
      result += line;
    }
    return result;
  }
  function generateNextLine(state, level) {
    return "\n" + common.repeat(" ", state.indent * level);
  }
  function testImplicitResolving(state, str2) {
    var index, length, type2;
    for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
      type2 = state.implicitTypes[index];
      if (type2.resolve(str2)) {
        return true;
      }
    }
    return false;
  }
  function isWhitespace(c) {
    return c === CHAR_SPACE || c === CHAR_TAB;
  }
  function isPrintable(c) {
    return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
  }
  function isNsCharOrWhitespace(c) {
    return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
  }
  function isPlainSafe(c, prev, inblock) {
    var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
    var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
    return (
      // ns-plain-safe
      (inblock ? (
        // c = flow-in
        cIsNsCharOrWhitespace
      ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
    );
  }
  function isPlainSafeFirst(c) {
    return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
  }
  function isPlainSafeLast(c) {
    return !isWhitespace(c) && c !== CHAR_COLON;
  }
  function codePointAt(string, pos) {
    var first = string.charCodeAt(pos), second;
    if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
      second = string.charCodeAt(pos + 1);
      if (second >= 56320 && second <= 57343) {
        return (first - 55296) * 1024 + second - 56320 + 65536;
      }
    }
    return first;
  }
  function needIndentIndicator(string) {
    var leadingSpaceRe = /^\n* /;
    return leadingSpaceRe.test(string);
  }
  var STYLE_PLAIN = 1;
  var STYLE_SINGLE = 2;
  var STYLE_LITERAL = 3;
  var STYLE_FOLDED = 4;
  var STYLE_DOUBLE = 5;
  function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
    var i;
    var char = 0;
    var prevChar = null;
    var hasLineBreak = false;
    var hasFoldableLine = false;
    var shouldTrackWidth = lineWidth !== -1;
    var previousLineBreak = -1;
    var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
    if (singleLineOnly || forceQuotes) {
      for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (!isPrintable(char)) {
          return STYLE_DOUBLE;
        }
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
    } else {
      for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (char === CHAR_LINE_FEED) {
          hasLineBreak = true;
          if (shouldTrackWidth) {
            hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
            i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
            previousLineBreak = i;
          }
        } else if (!isPrintable(char)) {
          return STYLE_DOUBLE;
        }
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
      hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
    }
    if (!hasLineBreak && !hasFoldableLine) {
      if (plain && !forceQuotes && !testAmbiguousType(string)) {
        return STYLE_PLAIN;
      }
      return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
    }
    if (indentPerLevel > 9 && needIndentIndicator(string)) {
      return STYLE_DOUBLE;
    }
    if (!forceQuotes) {
      return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  function writeScalar(state, string, level, iskey, inblock) {
    state.dump = function() {
      if (string.length === 0) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
      }
      if (!state.noCompatMode) {
        if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
          return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
        }
      }
      var indent = state.indent * Math.max(1, level);
      var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
      var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
      function testAmbiguity(string2) {
        return testImplicitResolving(state, string2);
      }
      switch (chooseScalarStyle(
        string,
        singleLineOnly,
        state.indent,
        lineWidth,
        testAmbiguity,
        state.quotingType,
        state.forceQuotes && !iskey,
        inblock
      )) {
        case STYLE_PLAIN:
          return string;
        case STYLE_SINGLE:
          return "'" + string.replace(/'/g, "''") + "'";
        case STYLE_LITERAL:
          return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
        case STYLE_FOLDED:
          return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
        case STYLE_DOUBLE:
          return '"' + escapeString(string) + '"';
        default:
          throw new exception("impossible error: invalid scalar style");
      }
    }();
  }
  function blockHeader(string, indentPerLevel) {
    var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
    var clip = string[string.length - 1] === "\n";
    var keep = clip && (string[string.length - 2] === "\n" || string === "\n");
    var chomp = keep ? "+" : clip ? "" : "-";
    return indentIndicator + chomp + "\n";
  }
  function dropEndingNewline(string) {
    return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
  }
  function foldString(string, width) {
    var lineRe = /(\n+)([^\n]*)/g;
    var result = function() {
      var nextLF = string.indexOf("\n");
      nextLF = nextLF !== -1 ? nextLF : string.length;
      lineRe.lastIndex = nextLF;
      return foldLine(string.slice(0, nextLF), width);
    }();
    var prevMoreIndented = string[0] === "\n" || string[0] === " ";
    var moreIndented;
    var match;
    while (match = lineRe.exec(string)) {
      var prefix = match[1], line = match[2];
      moreIndented = line[0] === " ";
      result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
      prevMoreIndented = moreIndented;
    }
    return result;
  }
  function foldLine(line, width) {
    if (line === "" || line[0] === " ") return line;
    var breakRe = / [^ ]/g;
    var match;
    var start = 0, end, curr = 0, next = 0;
    var result = "";
    while (match = breakRe.exec(line)) {
      next = match.index;
      if (next - start > width) {
        end = curr > start ? curr : next;
        result += "\n" + line.slice(start, end);
        start = end + 1;
      }
      curr = next;
    }
    result += "\n";
    if (line.length - start > width && curr > start) {
      result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
    } else {
      result += line.slice(start);
    }
    return result.slice(1);
  }
  function escapeString(string) {
    var result = "";
    var char = 0;
    var escapeSeq;
    for (var i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      escapeSeq = ESCAPE_SEQUENCES[char];
      if (!escapeSeq && isPrintable(char)) {
        result += string[i];
        if (char >= 65536) result += string[i + 1];
      } else {
        result += escapeSeq || encodeHex(char);
      }
    }
    return result;
  }
  function writeFlowSequence(state, level, object) {
    var _result = "", _tag = state.tag, index, length, value;
    for (index = 0, length = object.length; index < length; index += 1) {
      value = object[index];
      if (state.replacer) {
        value = state.replacer.call(object, String(index), value);
      }
      if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
        if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = "[" + _result + "]";
  }
  function writeBlockSequence(state, level, object, compact) {
    var _result = "", _tag = state.tag, index, length, value;
    for (index = 0, length = object.length; index < length; index += 1) {
      value = object[index];
      if (state.replacer) {
        value = state.replacer.call(object, String(index), value);
      }
      if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
        if (!compact || _result !== "") {
          _result += generateNextLine(state, level);
        }
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
          _result += "-";
        } else {
          _result += "- ";
        }
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = _result || "[]";
  }
  function writeFlowMapping(state, level, object) {
    var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
    for (index = 0, length = objectKeyList.length; index < length; index += 1) {
      pairBuffer = "";
      if (_result !== "") pairBuffer += ", ";
      if (state.condenseFlow) pairBuffer += '"';
      objectKey = objectKeyList[index];
      objectValue = object[objectKey];
      if (state.replacer) {
        objectValue = state.replacer.call(object, objectKey, objectValue);
      }
      if (!writeNode(state, level, objectKey, false, false)) {
        continue;
      }
      if (state.dump.length > 1024) pairBuffer += "? ";
      pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
      if (!writeNode(state, level, objectValue, false, false)) {
        continue;
      }
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = "{" + _result + "}";
  }
  function writeBlockMapping(state, level, object, compact) {
    var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
    if (state.sortKeys === true) {
      objectKeyList.sort();
    } else if (typeof state.sortKeys === "function") {
      objectKeyList.sort(state.sortKeys);
    } else if (state.sortKeys) {
      throw new exception("sortKeys must be a boolean or a function");
    }
    for (index = 0, length = objectKeyList.length; index < length; index += 1) {
      pairBuffer = "";
      if (!compact || _result !== "") {
        pairBuffer += generateNextLine(state, level);
      }
      objectKey = objectKeyList[index];
      objectValue = object[objectKey];
      if (state.replacer) {
        objectValue = state.replacer.call(object, objectKey, objectValue);
      }
      if (!writeNode(state, level + 1, objectKey, true, true, true)) {
        continue;
      }
      explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
      if (explicitPair) {
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
          pairBuffer += "?";
        } else {
          pairBuffer += "? ";
        }
      }
      pairBuffer += state.dump;
      if (explicitPair) {
        pairBuffer += generateNextLine(state, level);
      }
      if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
        continue;
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += ":";
      } else {
        pairBuffer += ": ";
      }
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = _result || "{}";
  }
  function detectType(state, object, explicit) {
    var _result, typeList, index, length, type2, style;
    typeList = explicit ? state.explicitTypes : state.implicitTypes;
    for (index = 0, length = typeList.length; index < length; index += 1) {
      type2 = typeList[index];
      if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
        if (explicit) {
          if (type2.multi && type2.representName) {
            state.tag = type2.representName(object);
          } else {
            state.tag = type2.tag;
          }
        } else {
          state.tag = "?";
        }
        if (type2.represent) {
          style = state.styleMap[type2.tag] || type2.defaultStyle;
          if (_toString.call(type2.represent) === "[object Function]") {
            _result = type2.represent(object, style);
          } else if (_hasOwnProperty.call(type2.represent, style)) {
            _result = type2.represent[style](object, style);
          } else {
            throw new exception("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
          }
          state.dump = _result;
        }
        return true;
      }
    }
    return false;
  }
  function writeNode(state, level, object, block, compact, iskey, isblockseq) {
    state.tag = null;
    state.dump = object;
    if (!detectType(state, object, false)) {
      detectType(state, object, true);
    }
    var type2 = _toString.call(state.dump);
    var inblock = block;
    var tagStr;
    if (block) {
      block = state.flowLevel < 0 || state.flowLevel > level;
    }
    var objectOrArray = type2 === "[object Object]" || type2 === "[object Array]", duplicateIndex, duplicate;
    if (objectOrArray) {
      duplicateIndex = state.duplicates.indexOf(object);
      duplicate = duplicateIndex !== -1;
    }
    if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
      compact = false;
    }
    if (duplicate && state.usedDuplicates[duplicateIndex]) {
      state.dump = "*ref_" + duplicateIndex;
    } else {
      if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
        state.usedDuplicates[duplicateIndex] = true;
      }
      if (type2 === "[object Object]") {
        if (block && Object.keys(state.dump).length !== 0) {
          writeBlockMapping(state, level, state.dump, compact);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + state.dump;
          }
        } else {
          writeFlowMapping(state, level, state.dump);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + " " + state.dump;
          }
        }
      } else if (type2 === "[object Array]") {
        if (block && state.dump.length !== 0) {
          if (state.noArrayIndent && !isblockseq && level > 0) {
            writeBlockSequence(state, level - 1, state.dump, compact);
          } else {
            writeBlockSequence(state, level, state.dump, compact);
          }
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + state.dump;
          }
        } else {
          writeFlowSequence(state, level, state.dump);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + " " + state.dump;
          }
        }
      } else if (type2 === "[object String]") {
        if (state.tag !== "?") {
          writeScalar(state, state.dump, level, iskey, inblock);
        }
      } else if (type2 === "[object Undefined]") {
        return false;
      } else {
        if (state.skipInvalid) return false;
        throw new exception("unacceptable kind of an object to dump " + type2);
      }
      if (state.tag !== null && state.tag !== "?") {
        tagStr = encodeURI(
          state.tag[0] === "!" ? state.tag.slice(1) : state.tag
        ).replace(/!/g, "%21");
        if (state.tag[0] === "!") {
          tagStr = "!" + tagStr;
        } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
          tagStr = "!!" + tagStr.slice(18);
        } else {
          tagStr = "!<" + tagStr + ">";
        }
        state.dump = tagStr + " " + state.dump;
      }
    }
    return true;
  }
  function getDuplicateReferences(object, state) {
    var objects = [], duplicatesIndexes = [], index, length;
    inspectNode(object, objects, duplicatesIndexes);
    for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
      state.duplicates.push(objects[duplicatesIndexes[index]]);
    }
    state.usedDuplicates = new Array(length);
  }
  function inspectNode(object, objects, duplicatesIndexes) {
    var objectKeyList, index, length;
    if (object !== null && typeof object === "object") {
      index = objects.indexOf(object);
      if (index !== -1) {
        if (duplicatesIndexes.indexOf(index) === -1) {
          duplicatesIndexes.push(index);
        }
      } else {
        objects.push(object);
        if (Array.isArray(object)) {
          for (index = 0, length = object.length; index < length; index += 1) {
            inspectNode(object[index], objects, duplicatesIndexes);
          }
        } else {
          objectKeyList = Object.keys(object);
          for (index = 0, length = objectKeyList.length; index < length; index += 1) {
            inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
          }
        }
      }
    }
  }
  function dump$1(input, options) {
    options = options || {};
    var state = new State(options);
    if (!state.noRefs) getDuplicateReferences(input, state);
    var value = input;
    if (state.replacer) {
      value = state.replacer.call({ "": value }, "", value);
    }
    if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
    return "";
  }
  var dump_1 = dump$1;
  var dumper = {
    dump: dump_1
  };
  function renamed(from, to) {
    return function() {
      throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
    };
  }
  var Type = type;
  var Schema = schema;
  var FAILSAFE_SCHEMA = failsafe;
  var JSON_SCHEMA = json;
  var CORE_SCHEMA = core;
  var DEFAULT_SCHEMA = _default;
  var load = loader.load;
  var loadAll = loader.loadAll;
  var dump = dumper.dump;
  var YAMLException = exception;
  var types = {
    binary,
    float,
    map,
    null: _null,
    pairs,
    set,
    timestamp,
    bool: bool2,
    int: int2,
    merge,
    omap,
    seq,
    str
  };
  var safeLoad = renamed("safeLoad", "load");
  var safeLoadAll = renamed("safeLoadAll", "loadAll");
  var safeDump = renamed("safeDump", "dump");
  var jsYaml = {
    Type,
    Schema,
    FAILSAFE_SCHEMA,
    JSON_SCHEMA,
    CORE_SCHEMA,
    DEFAULT_SCHEMA,
    load,
    loadAll,
    dump,
    YAMLException,
    types,
    safeLoad,
    safeLoadAll,
    safeDump
  };
  var js_yaml_default = jsYaml;

  // js/zip.js
  var SIG_EOCD = 101010256;
  var SIG_CENTRAL = 33639248;
  var SIG_LOCAL = 67324752;
  var u16 = (dv, o) => dv.getUint16(o, true);
  var u32 = (dv, o) => dv.getUint32(o, true);
  var utf8 = new TextDecoder("utf-8", { fatal: false });
  async function inflateRaw(bytes) {
    const ds = new DecompressionStream("deflate-raw");
    const w = ds.writable.getWriter();
    const r = ds.readable.getReader();
    const chunks = [];
    let total = 0;
    const write = (async () => {
      try {
        await w.write(bytes);
        await w.close();
        return null;
      } catch (e) {
        return e;
      }
    })();
    let readErr = null;
    try {
      for (; ; ) {
        const { done, value } = await r.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
      }
    } catch (e) {
      readErr = e;
    }
    const writeErr = await write;
    if (readErr) throw readErr;
    if (writeErr) throw writeErr;
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
  var Zip = class {
    constructor(bytes) {
      this.bytes = bytes;
      this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      this.entries = /* @__PURE__ */ new Map();
      this._readCentralDirectory();
    }
    _readCentralDirectory() {
      const len = this.bytes.length;
      let eocd = -1;
      for (let i = len - 22; i >= Math.max(0, len - 65557); i--) {
        if (u32(this.dv, i) === SIG_EOCD) {
          eocd = i;
          break;
        }
      }
      if (eocd < 0) throw new Error("not a zip file (no central directory)");
      const count = u16(this.dv, eocd + 10);
      const cdOffset = u32(this.dv, eocd + 16);
      let p = cdOffset;
      for (let i = 0; i < count; i++) {
        if (u32(this.dv, p) !== SIG_CENTRAL) throw new Error("corrupt zip central directory");
        const method = u16(this.dv, p + 10);
        const compSize = u32(this.dv, p + 20);
        const size = u32(this.dv, p + 24);
        const nameLen = u16(this.dv, p + 28);
        const extraLen = u16(this.dv, p + 30);
        const commentLen = u16(this.dv, p + 32);
        const localOffset = u32(this.dv, p + 42);
        const name = utf8.decode(this.bytes.subarray(p + 46, p + 46 + nameLen));
        this.entries.set(name, { method, compSize, size, localOffset });
        p += 46 + nameLen + extraLen + commentLen;
      }
    }
    get names() {
      return [...this.entries.keys()];
    }
    has(name) {
      return this.entries.has(name);
    }
    async read(name) {
      const e = this.entries.get(name);
      if (!e) return null;
      const dv = this.dv;
      if (u32(dv, e.localOffset) !== SIG_LOCAL) throw new Error("corrupt zip local header: " + name);
      const nameLen = u16(dv, e.localOffset + 26);
      const extraLen = u16(dv, e.localOffset + 28);
      const start = e.localOffset + 30 + nameLen + extraLen;
      const raw = this.bytes.subarray(start, start + e.compSize);
      if (e.method === 0) return raw;
      if (e.method === 8) {
        const out = await inflateRaw(raw);
        if (e.size && out.length !== e.size) throw new Error(`zip entry ${name}: ${out.length} of ${e.size} bytes`);
        return out;
      }
      throw new Error(`zip entry ${name}: unsupported compression ${e.method}`);
    }
  };

  // js/feedpak.js
  var r33 = (v) => Math.round(v * 1e3) / 1e3;
  var utf82 = new TextDecoder("utf-8", { fatal: false });
  var LYRIC_LINE_RE = /^\s*\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/;
  function lyricsFromText(text) {
    const out = [];
    for (const ln of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
      const m = LYRIC_LINE_RE.exec(ln);
      if (!m) continue;
      const txt = m[3].trim();
      if (txt) out.push({ t: r33(parseInt(m[1], 10) * 60 + parseFloat(m[2])), end: 0, text: txt, syl: [] });
    }
    for (let i = 0; i < out.length; i++) {
      const next = i + 1 < out.length ? out[i + 1].t : out[i].t + 4;
      out[i].end = r33(Math.min(next, out[i].t + 8));
    }
    return out;
  }
  async function convertFeedpak(bytes, { name = "song.feedpak", onProgress = () => {
  } } = {}) {
    onProgress("Opening the feedpak\u2026");
    const zip = new Zip(bytes);
    const manifestName = zip.has("manifest.yaml") ? "manifest.yaml" : zip.has("manifest.yml") ? "manifest.yml" : null;
    if (!manifestName) throw new Error("not a .feedpak (no manifest.yaml inside)");
    const m = js_yaml_default.load(utf82.decode(await zip.read(manifestName))) || {};
    return packFrom(zip, m, name, onProgress);
  }
  var AUDIO_RX = /\.(ogg|mp3|wav|flac|m4a|aac|opus|webm)$/i;
  var IMAGE_RX = /\.(jpe?g|png|webp|gif|bmp)$/i;
  function isArrangementJson(text) {
    try {
      const w = JSON.parse(text);
      return !!w && typeof w === "object" && !Array.isArray(w) && (Array.isArray(w.notes) || Array.isArray(w.chords));
    } catch {
      return false;
    }
  }
  async function convertFeedpakFiles(entries, { name = "song", onProgress = () => {
  } } = {}) {
    onProgress("Reading the arrangements\u2026");
    const norm = (n) => String(n).split(/[\\/]/).filter(Boolean).join("/");
    const all = entries.map((e) => ({ name: norm(e.name), bytes: e.bytes instanceof Uint8Array ? e.bytes : new Uint8Array(e.bytes) }));
    const man = all.find((e) => /(^|\/)manifest\.ya?ml$/i.test(e.name));
    let root = "";
    if (man) root = man.name.includes("/") ? man.name.slice(0, man.name.lastIndexOf("/") + 1) : "";
    else {
      const dirs = all.map((e) => e.name.includes("/") ? e.name.split("/")[0] + "/" : "");
      if (dirs.length && dirs.every((d) => d && d === dirs[0])) root = dirs[0];
    }
    const files = /* @__PURE__ */ new Map();
    for (const e of all) files.set(e.name.startsWith(root) ? e.name.slice(root.length) : e.name, e.bytes);
    const byBase = /* @__PURE__ */ new Map();
    for (const k of files.keys()) {
      const b = k.split("/").pop().toLowerCase();
      byBase.set(b, byBase.has(b) ? null : k);
    }
    const find2 = (n) => files.has(norm(n)) ? norm(n) : byBase.get(String(n).split("/").pop().toLowerCase()) || null;
    const src = { has: (n) => !!find2(n), read: async (n) => files.get(find2(n)) };
    let m;
    if (man) m = js_yaml_default.load(utf82.decode(man.bytes)) || {};
    else {
      m = { title: "", artist: "", arrangements: [], stems: [] };
      const used = /* @__PURE__ */ new Set();
      for (const [k, b] of files) {
        if (!/\.json$/i.test(k)) continue;
        const text = utf82.decode(b);
        if (!isArrangementJson(text)) {
          try {
            const d = JSON.parse(text);
            if (Array.isArray(d) && d.length && d[0] && "w" in d[0]) m.lyrics = k;
          } catch {
          }
          continue;
        }
        const w = JSON.parse(text);
        const stem2 = k.split("/").pop().replace(/\.json$/i, "");
        let id = stem2.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "arr", i = 2;
        while (used.has(id)) id = `${id}${i++}`;
        used.add(id);
        const fromFile = stem2.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const taken = (x) => m.arrangements.some((a) => a.name.toLowerCase() === String(x).toLowerCase());
        const nm = w.name && !taken(w.name) ? w.name : fromFile;
        m.arrangements.push({ id, name: nm, file: k, tuning: w.tuning || [0, 0, 0, 0, 0, 0], capo: w.capo || 0 });
      }
      if (!m.arrangements.length) throw new Error('no arrangement JSON among the files (a chart JSON holds "notes" or "chords")');
      const order = (a) => /lead/i.test(a.name) ? 0 : /rhythm/i.test(a.name) ? 1 : /bass/i.test(a.name) ? 2 : 3;
      m.arrangements.sort((a, b) => order(a) - order(b));
      const audio = [...files.keys()].filter((k) => AUDIO_RX.test(k) && !/preview/i.test(k));
      const stems = audio.filter((k) => /(^|\/)stems\//i.test(k));
      const pick = stems.length ? stems : audio.sort((a, b) => files.get(b).length - files.get(a).length).slice(0, 1);
      m.stems = pick.map((k) => ({ id: k.split("/").pop().replace(/\.[^.]+$/, ""), file: k }));
      const img = [...files.keys()].filter((k) => IMAGE_RX.test(k)).sort((a, b) => (/cover|album|art|folder/i.test(b) ? 1 : 0) - (/cover|album|art|folder/i.test(a) ? 1 : 0));
      if (img.length) m.cover = img[0];
    }
    if (!m.title) m.title = String(name).replace(/\.[^.]+$/, "");
    return packFrom(src, m, name, onProgress);
  }
  async function packFrom(zip, m, name, onProgress) {
    const arrangements = [];
    let firstWire = null;
    for (const a of m.arrangements || []) {
      if (!a || !a.file) continue;
      const wire = JSON.parse(utf82.decode(await zip.read(a.file)));
      if (!firstWire || !(firstWire.beats || []).length && (wire.beats || []).length) firstWire = wire;
      arrangements.push({
        id: a.id,
        name: a.name || a.id,
        tuning: a.tuning || [0, 0, 0, 0, 0, 0],
        capo: a.capo || 0,
        notes: wire.notes || [],
        chords: wire.chords || [],
        templates: wire.templates || [],
        anchors: wire.anchors || [],
        handshapes: wire.handshapes || [],
        phrases: (wire.phrases || []).map((p) => ({
          start_time: p.start_time,
          end_time: p.end_time,
          max_difficulty: p.max_difficulty
        })),
        tones: tonesForPage(wire.tones, m.title || "")
      });
    }
    if (!arrangements.length) throw new Error("the feedpak has no arrangements");
    let lyrics = { lines: [], source: m.lyrics_source || "" };
    if (m.lyrics && zip.has(m.lyrics)) {
      const text = utf82.decode(await zip.read(m.lyrics));
      let lines = [];
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data) && data.length && data[0] && typeof data[0] === "object" && "w" in data[0]) {
          lines = lyricsFromTokens(data);
        } else {
          lines = lyricsFromText(text);
        }
      } catch {
        lines = lyricsFromText(text);
      }
      const problem = lines.length ? lyricsProblem(lines) : "";
      lyrics = problem ? { lines: [], source: lyrics.source, error: problem } : { lines, source: lyrics.source };
    }
    let coverBlob = null;
    if (m.cover && zip.has(m.cover)) {
      const raw = await zip.read(m.cover);
      coverBlob = new Blob([raw], { type: /\.png$/i.test(m.cover) ? "image/png" : "image/jpeg" });
    }
    const stems = [];
    for (const s of m.stems || []) {
      if (!s || !s.file || !zip.has(s.file)) continue;
      onProgress("Reading " + s.file + "\u2026");
      const raw = await zip.read(s.file);
      const type2 = /\.mp3$/i.test(s.file) ? "audio/mpeg" : /\.wav$/i.test(s.file) ? "audio/wav" : /\.flac$/i.test(s.file) ? "audio/flac" : "audio/ogg";
      stems.push({ id: s.id || s.file, blob: new Blob([raw], { type: type2 }) });
    }
    const payload = {
      meta: {
        title: m.title || "",
        artist: m.artist || "",
        album: m.album || "",
        year: m.year || 0,
        author: m.author || "",
        duration: r33(Number(m.duration) || 0),
        pack: name,
        converted: false,
        cover: Boolean(coverBlob),
        note_offset_ms: Number(m.note_offset_ms) || 0
      },
      arrangements,
      beats: firstWire && firstWire.beats || [],
      sections: firstWire && firstWire.sections || [],
      lyrics,
      stems: (m.stems || []).filter((s) => s && s.file).map((s) => ({ id: s.id, file: s.file }))
    };
    return { payload, coverBlob, stems };
  }

  // js/cover.js
  function decodeDds(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "DDS ") {
      throw new Error("not a DDS file");
    }
    const height = dv.getUint32(12, true);
    const width = dv.getUint32(16, true);
    const fourCC = String.fromCharCode(bytes[84], bytes[85], bytes[86], bytes[87]);
    const bitCount = dv.getUint32(88, true);
    const data = bytes.subarray(128);
    const rgba = new Uint8Array(width * height * 4);
    if (fourCC === "DXT1" || fourCC === "DXT5") {
      decodeBlocks(data, width, height, rgba, fourCC === "DXT5");
      return { width, height, rgba };
    }
    if (!fourCC.trim() && (bitCount === 24 || bitCount === 32)) {
      const rMask = dv.getUint32(92, true), gMask = dv.getUint32(96, true);
      const bMask = dv.getUint32(100, true), aMask = dv.getUint32(104, true);
      const shift = (m) => m ? 31 - Math.clz32(m) : 0;
      const scale = (m) => m ? 255 / (m >>> shift(m)) : 0;
      const step = bitCount / 8;
      const rd = (v, m) => Math.round(((v & m) >>> shift(m)) * scale(m));
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const o = (y * width + x) * step;
          const v = dv.getUint32(o, true);
          const q = (y * width + x) * 4;
          rgba[q] = rd(v, rMask);
          rgba[q + 1] = rd(v, gMask);
          rgba[q + 2] = rd(v, bMask);
          rgba[q + 3] = aMask ? rd(v, aMask) : 255;
        }
      }
      return { width, height, rgba };
    }
    throw new Error(`unsupported DDS format ${JSON.stringify(fourCC || bitCount)}`);
  }
  function decodeBlocks(data, width, height, rgba, hasAlpha) {
    const bw = Math.max(1, Math.ceil(width / 4));
    const bh = Math.max(1, Math.ceil(height / 4));
    const blockBytes = hasAlpha ? 16 : 8;
    const pal = new Uint8Array(16);
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        let p = (by * bw + bx) * blockBytes;
        let alphas = null;
        if (hasAlpha) {
          alphas = decodeAlphaBlock(data, p);
          p += 8;
        }
        decodeColorBlock(data, p, pal);
        for (let y = 0; y < 4; y++) {
          const py = by * 4 + y;
          if (py >= height) break;
          for (let x = 0; x < 4; x++) {
            const px = bx * 4 + x;
            if (px >= width) break;
            const idx = y * 4 + x;
            const ci = data[p + 4 + (idx >> 2)] >> (idx & 3) * 2 & 3;
            const q = (py * width + px) * 4;
            rgba[q] = pal[ci * 4];
            rgba[q + 1] = pal[ci * 4 + 1];
            rgba[q + 2] = pal[ci * 4 + 2];
            rgba[q + 3] = alphas ? alphas[idx] : pal[ci * 4 + 3];
          }
        }
      }
    }
  }
  function rgb565(v) {
    const r = v >> 11 & 31, g = v >> 5 & 63, b = v & 31;
    return [r << 3 | r >> 2, g << 2 | g >> 4, b << 3 | b >> 2];
  }
  function decodeColorBlock(data, p, pal) {
    const c0 = data[p] | data[p + 1] << 8;
    const c1 = data[p + 2] | data[p + 3] << 8;
    const a = rgb565(c0), b = rgb565(c1);
    pal.set([a[0], a[1], a[2], 255, b[0], b[1], b[2], 255], 0);
    if (c0 > c1) {
      for (let i = 0; i < 3; i++) {
        pal[8 + i] = Math.round((2 * a[i] + b[i]) / 3);
        pal[12 + i] = Math.round((a[i] + 2 * b[i]) / 3);
      }
      pal[11] = 255;
      pal[15] = 255;
    } else {
      for (let i = 0; i < 3; i++) pal[8 + i] = Math.round((a[i] + b[i]) / 2);
      pal[11] = 255;
      pal[12] = pal[13] = pal[14] = 0;
      pal[15] = 0;
    }
  }
  function decodeAlphaBlock(data, p) {
    const a0 = data[p], a1 = data[p + 1];
    const table = new Uint8Array(8);
    table[0] = a0;
    table[1] = a1;
    if (a0 > a1) {
      for (let i = 1; i < 7; i++) table[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7);
    } else {
      for (let i = 1; i < 5; i++) table[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5);
      table[6] = 0;
      table[7] = 255;
    }
    const out = new Uint8Array(16);
    let bits = 0, nbits = 0, bi = p + 2;
    for (let i = 0; i < 16; i++) {
      while (nbits < 3) {
        bits |= data[bi++] << nbits;
        nbits += 8;
      }
      out[i] = table[bits & 7];
      bits >>= 3;
      nbits -= 3;
    }
    return out;
  }

  // converter.entry.js
  window.CDLC = { convertFeedpakFiles, convertXmlSet, convertFeedpak, decodeDds, clearXmlCache, xmlStats };
})();
