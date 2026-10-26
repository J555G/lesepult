/* Pult – Tempora (v432; decisions 785–793): the chronograph. Time runs from left to right; reference systems ("rulers": Julian
   years, Olympiads, years of the city by Varro and by Cato, the consuls, the emperors …) stand at the top; below them the lanes:
   what each work narrates (or when it was written), Diodorus' own years, persons, and your own statements. Each item is what
   one source says about a time – never one authoritative date. Scrolls and zooms in both directions; layers as on the map.
   Data: the Liebenam package (fasti-liebenam: consuls, emperors, the years each book narrates), "Tempora – dates read from the
   texts" (chrono-texts: Diodorus' year headers), the Suda tab's persons, the consular dates found in the text being read (782a),
   and your statements (settings "tmp|…", in the backup).
   Years: data in historical years (−44 = 44 BC, no year 0); the axis is astronomical (1 BC = 0), a year y covers [ax(y), ax(y)+1). */
'use strict';
const TP = { x0: -600, ppy: 1.4, sy: 0, lh: 30, cfg: null, data: null, hit: [], sel: null, cur: null, ptr: new Map(), raf: 0 };
const ax = y => y < 0 ? y + 1 : y;                     // historical -> astronomical
const hy = a => a <= 0 ? a - 1 : a;                    // astronomical -> historical
const yTxt = y => y < 0 ? `${-y} BC` : `AD ${y}`;
const yTxtS = y => y < 0 ? `${-y} BC` : `${y}`;
const RULERS = [['jul', 'Julian years (BC / AD)'], ['ol', 'Olympiads'], ['auc', 'Years of the city (Varro, 753 BC)'], ['cato', 'Years of the city (Cato, 752 BC)'],
  ['cos', 'Consuls (Liebenam, 30 BC – AD 565)'], ['emp', 'Emperors and Caesars (Liebenam)'], ['sel', 'Seleucid era (autumn 312 BC)'],
  ['dio', 'Era of Diocletian (29 Aug. 284)'], ['ind', 'Indictions (from 1 Sept. 312)']];
const RULER_ON = { jul: true, ol: true, auc: true, cato: false, cos: true, emp: true, sel: false, dio: false, ind: false };

async function tmpCfg() {
  if (TP.cfg) return TP.cfg;
  const c = (await setting('tmpCfg')) || {};
  TP.cfg = Object.assign({ rulers: { ...RULER_ON }, hide: {}, persons: [], mode: 'narr' }, c);
  if (c.view) Object.assign(TP, { x0: c.view.x0, ppy: c.view.ppy, lh: c.view.lh || 30 });
  return TP.cfg;
}
let tmpSaveT = 0;
function tmpSave() { clearTimeout(tmpSaveT); tmpSaveT = setTimeout(() => { TP.cfg.view = { x0: TP.x0, ppy: TP.ppy, lh: TP.lh }; setting('tmpCfg', TP.cfg); }, 600); }

// ---------------------------------------------------------------- the limits of the timeline (Settings → Tempora): by default 7777 BC to the
// date the app was last published; nothing beyond them can be scrolled or zoomed to
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
async function pubAxis() {                              // the publication date as a point of the axis (year + its fraction)
  const pd = (await setting('pubDate')) || {}, m = String(pd.date || '').match(/(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})/);
  const d = m ? new Date(+m[3], MONTHS[m[2].toLowerCase()] ?? 0, +m[1]) : new Date();
  return d.getFullYear() + (d - new Date(d.getFullYear(), 0, 1)) / (365.25 * 864e5);
}
async function tmpLimits() {
  const L = (await tmpCfg()).lim || {}, pub = await pubAxis();
  TP.pub = pub; TP.lim = [ax(L.min ?? -7777), L.max != null ? ax(L.max) + 1 : pub];
  if (TP.lim[1] - TP.lim[0] < 2) TP.lim = [ax(-7777), pub];
  return TP.lim;
}
function tmpClampX(W) {
  const [a, b] = TP.lim || [ax(-7777), 2100];
  if (W / TP.ppy > b - a) TP.ppy = W / (b - a);
  TP.x0 = Math.min(Math.max(TP.x0, a), b - W / TP.ppy);
}
function tmpSettingsHTML() {
  const L = TP.cfg?.lim || {}, pubY = Math.floor(TP.pub || new Date().getFullYear());
  return `<div class="tmpset"><label class="srow1"><span>Earliest year<small class="hint">the timeline begins here</small></span><input data-tmplim="min" value="${esc(L.min != null ? yTxt(L.min) : '')}" placeholder="7777 BC" autocomplete="off"></label>`
    + `<label class="srow1"><span>Latest year<small class="hint">empty: the date the app was last published (now AD ${pubY})</small></span><input data-tmplim="max" value="${esc(L.max != null ? yTxt(L.max) : '')}" placeholder="AD ${pubY}" autocomplete="off"></label>`
    + `<small class="hint">Years as 7777 BC, AD 2026, Ol. 1, AUC 1. Tempora cannot be scrolled or zoomed beyond them.</small> <button type="button" data-tmplimreset="1">Back to the defaults</button></div>`;
}
document.addEventListener('change', async ev => {      // Settings → Tempora: the limits
  const t = ev.target; if (!t.dataset?.tmplim) return;
  await tmpCfg(); const v = t.value.trim(), lim = TP.cfg.lim = TP.cfg.lim || {};
  if (!v) lim[t.dataset.tmplim] = null;
  else { const r = parseWhen(v); if (!r || r.y0 == null) { toast('The year was not understood: ' + v, 4000); t.value = lim[t.dataset.tmplim] != null ? yTxt(lim[t.dataset.tmplim]) : ''; return; }
    lim[t.dataset.tmplim] = t.dataset.tmplim === 'max' ? (r.y1 ?? r.y0) : r.y0; t.value = yTxt(lim[t.dataset.tmplim]); }
  if (lim.min != null && lim.max != null && lim.max <= lim.min) { toast('The latest year must come after the earliest.', 4000); lim[t.dataset.tmplim] = null; t.value = ''; }
  tmpSave(); await tmpLimits(); tmpRedraw();
});
document.addEventListener('click', async ev => {
  const b = ev.target.closest?.('[data-tmplimreset]'); if (!b) return;
  await tmpCfg(); TP.cfg.lim = {}; tmpSave(); await tmpLimits(); tmpRedraw();
  b.closest('.tmpset')?.querySelectorAll('[data-tmplim]').forEach(i => { i.value = ''; });
});

// ---------------------------------------------------------------- reading a year in the reference systems
function olOf(a) { const k = Math.floor(a - 0.5 + 775); return k < 0 ? null : { n: Math.floor(k / 4) + 1, y: k % 4 + 1 }; }   // a: axis value
function systemsAt(y) {                                // all readings of the historical year y
  const a = ax(y), out = [['Julian year', yTxt(y)]];
  const o1 = olOf(a + 0.25), o2 = olOf(a + 0.75);
  if (o1 && o1.n <= 293) out.push(['Olympiad', o2 && (o2.n !== o1.n || o2.y !== o1.y) ? `${o1.n}.${o1.y} (to midsummer) / ${o2.n}.${o2.y}` : `${o1.n}.${o1.y}`]);
  if (a + 753 >= 1) out.push(['Year of the city (Varro)', `${a + 752} (to 20 April) / ${a + 753}`]);
  if (a + 752 >= 1) out.push(['Year of the city (Cato)', `${a + 751} (to 20 April) / ${a + 752}`]);
  const F = TP.data?.F, c = F?.c?.[String(y)];
  if (c) { const nm = p => p[0] + (p[1] > 1 ? ' ' + ROMN(p[1]) : ''); out.push(['Consuls', (c.o || []).map(nm).join(' · ') + ((c.s || []).length ? ` (suffecti: ${(c.s).map(nm).join(' · ')})` : '')]); }
  const em = (F?.k || []).filter(e => Math.min(e[4], e[6] ?? e[4]) <= y && e[5] >= y);
  if (em.length) out.push(['Emperors', em.map(e => e[0] + (e[7] === 'U' ? ' (usurper)' : e[7] === 'C' || (e[6] != null && y < e[4]) ? ' (Caesar)' : '')).join(' · ')]);
  if (a >= -311) out.push(['Seleucid era', `${a + 311}/${a + 312} (Macedonian, from autumn)`]);
  if (a >= 284) out.push(['Era of Diocletian', `${a - 284}/${a - 283} (from 29 Aug.)`]);
  if (a >= 313) { const i = ((a - 313) % 15) + 1; out.push(['Indiction', `${i} (to 31 Aug.) / ${i % 15 + 1}`]); }
  return out;
}
const ROMN = n => ['', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'VIIII', 'X', 'XI', 'XII', 'XIII', 'XIIII', 'XV', 'XVI', 'XVII', 'XVIII'][n] || String(n);

// ---------------------------------------------------------------- the data: lanes of items
// item: {t0, t1 (axis), lab, fa, fb (fuzzy start / end), kind, src, go: {w, bi, r} (a passage), ref (a person), ev (event), col}
async function tmpData() {
  const cfg = await tmpCfg(), F = await fastiTab(), lanes = [];
  if (!S.catWork) await cachedCatalog().catch(() => null);
  const works = new Map((await libWorks()).map(w => [w.id, w]));
  const wTitle = id => { const w = works.get(id) || S.catWork?.[id]; return w ? `${w.author ? w.author + ', ' : ''}${w.title}` : id; };
  const bookIx = (id, lab) => { const b = (works.get(id) || S.catWork?.[id])?.books || []; const i = b.indexOf(lab); return i < 0 ? 0 : i; };
  if (cfg.mode === 'narr') {
    // what the books narrate (781a: Ammianus, Tacitus, Suetonius, Historia Augusta, Eutropius)
    for (const [wid, m] of Object.entries(F?.nd || {})) { if (wid === 'b') continue;
      const its = Object.entries(m).map(([lab, [y0, y1]]) => ({ t0: ax(y0), t1: ax(y1) + 1, lab: lab === '*' ? 'the life' : lab.replace(/^Book /, 'Book '), kind: 'book',
        src: wTitle(wid), go: { w: wid, bi: lab === '*' ? 0 : bookIx(wid, lab), r: null }, note: 'the years this part narrates' }));
      lanes.push({ id: 'nd:' + wid, g: 'Texts – the years they narrate', t: wTitle(wid), its, have: works.has(wid) });
    }
    // Diodorus' own years (chrono-texts)
    const ch = Object.values(S.installed || {}).find(d => d.kind === 'chrono');
    if (ch) {
      const L = (await pplRec(ch, '#l'))?.e || [], I = (await pplRec(ch, '#s'))?.e || []; TP.chrono = I;
      for (const [lid, title, wpre, note] of L) {
        const its = I.filter(x => x[0] === lid).map(x => ({ t0: x[1], t1: x[2], lab: x[3], kind: 'year', uneven: x[6]?.uneven, fixed: x[6]?.fixed, ev: x[6]?.ev || null, ref: x[6]?.ref || null,
          src: title, go: { w: x[6]?.w, bi: x[4], r: x[5] }, text: x[6]?.text || null, fa: !!x[6]?.text && !x[6]?.ol?.[1], fb: !!x[6]?.text && !x[6]?.ol?.[1],
          note: x[6]?.text ? (x[6].ol?.[1] ? '' : 'the Olympiad only – any of its four years') : (x[6]?.fixed ? 'an Olympiad named here fixes the year' : 'counted from the Olympiad named before')
            + (x[6]?.uneven ? ' – in a stretch where his headers and his Olympiads disagree' : '') }));
        lanes.push({ id: 'ch:' + lid, g: 'Texts – the years they narrate', t: title, its, note, have: true });
      }
    }
    // consular dates in the text being read (782a)
    if (S.text?.work && S.consDates?.length) {
      const wid = S.text.work.id, its = S.consDates.map(cd => ({ t0: ax(cd.y), t1: ax(cd.y) + 1, lab: `${(cd.names || []).join(' & ')} consuls`, kind: 'date', link: 'cos:' + cd.y,
        src: wTitle(wid), go: { w: wid, bi: S.text.bi, r: cd.ref }, note: `a consular date at ${cd.ref || '?'} – the consuls of ${yTxt(cd.y)} in Liebenam’s list` }));
      lanes.push({ id: 'cd:' + wid, g: 'Texts – the years they narrate', t: `${wTitle(wid)} – consular dates in ${S.text.work.books?.[S.text.bi] || 'this book'}`, its, have: true });
    }
  } else {
    // when the works were written: the author's date in the catalogue (approximate: ± a generation)
    const its = [];
    for (const w of works.values()) { const y = S.catAuthor?.[w.id]?.year; if (y == null) continue;
      its.push({ t0: ax(y) - 12, t1: ax(y) + 13, fa: true, fb: true, lab: wTitle(w.id), kind: 'work', src: 'the catalogue (the author’s date, approximate)', go: { w: w.id, bi: 0, r: null } }); }
    lanes.push({ id: 'wr:lib', g: 'Texts – when they were written', t: 'Your library', its, have: true });
  }
  // persons added from the Suda tab
  if (!TP.chrono) { const ch = Object.values(S.installed || {}).find(d => d.kind === 'chrono'); TP.chrono = ch ? (await pplRec(ch, '#s'))?.e || [] : []; }
  for (const ref of cfg.persons || []) {
    const { d, i } = pplParse(ref); if (!d) continue; const r = await pplRow(d, i); if (!r) continue;
    const its = [];
    if (r.y0 != null) its.push({ t0: ax(r.y0), t1: ax(r.y1 ?? r.y0) + 1, fa: true, fb: true, lab: 'years the article mentions', kind: 'life', src: d.name, ref });
    for (const o of F?.off.get(ref) || []) {
      if (o[0] === 'emp') { const e = F.k[o[1]]; if (!e) continue;
        if (e[6] != null && e[6] < e[4]) its.push({ t0: ax(e[6]), t1: ax(Math.min(e[4], e[5] + 1)), lab: 'Caesar', kind: 'office', src: 'Liebenam', ref });
        if (e[7] !== 'C') its.push({ t0: ax(e[4]), t1: ax(e[5]) + 1, lab: (e[7] === 'U' ? 'usurper ' : 'emperor ') + e[2] + ' – ' + e[3], kind: 'office', src: 'Liebenam', ref }); }
      if (o[0] === 'cos') its.push({ t0: ax(o[1]), t1: ax(o[1]) + 1, lab: 'consul' + (o[2] > 1 ? ' ' + ROMN(o[2]) : '') + (o[3] === 's' ? ' suff.' : ''), kind: 'office', src: 'Liebenam', ref, link: 'cos:' + o[1] });
    }
    for (const x of TP.chrono || []) if (x[6]?.ref === ref) {     // 799a: what Diogenes Laertius dates in his life
      its.push({ t0: x[1], t1: x[2], fa: !x[6].ol?.[1], fb: !x[6].ol?.[1], lab: `${x[6].kind || 'dated'} · Ol. ${x[6].ol[0]}${x[6].ol[1] ? '.' + x[6].ol[1] : ''}`, kind: 'cite', src: 'Diogenes Laertius' + (x[6].sure ? '' : ' (the life probably his)'),
        go: { w: x[6].w, bi: x[4], r: x[5] }, text: x[6].text, ref, ev: x[6].ev || null }); }
    const e = await pplEntry(d, i);                       // the passages citing him, placed where their book's years are known
    for (const p of e?.ps || []) { const m = F?.nd?.[p[0]]; if (!m) continue; const lab = (works.get(p[0]) || S.catWork?.[p[0]])?.books?.[p[1]];
      const yy = m[lab] || m['*']; if (!yy) continue;
      its.push({ t0: ax(yy[0]), t1: ax(yy[1]) + 1, fa: true, fb: true, lab: p[3], kind: 'cite', src: wTitle(p[0]), go: { w: p[0], bi: p[1], r: p[2] }, ref, note: 'cited by ' + d.name + ' – placed at the years its book narrates' }); }
    lanes.push({ id: 'p:' + ref, g: 'Persons', t: r.name + (r.no ? ' ' + r.no : ''), its, ref, have: true });
  }
  // your statements (791a)
  const own = (await getAll('settings', IDBKeyRange.bound('tmp|', 'tmp|￿'))).map(x => x.v).filter(Boolean);
  if (own.length) lanes.push({ id: 'own', g: 'Your chronology', t: 'Your statements', its: own.map(s => ownItem(s)), have: true });
  for (const L of lanes) {                              // rows packed once over all the lane's items: an item keeps its row whatever is in view
    const sh = L.sh || L.t.replace(/ – .*$/, ''), ends = [];
    for (const it of L.its.slice().sort((a, b) => a.t0 - b.t0)) {
      let r = ends.findIndex(e => e <= it.t0 + 1e-6); if (r < 0) { r = ends.length; ends.push(0); } ends[r] = it.t1; it.row = r;
      it.full = (L.id === 'own' || L.id === 'wr:lib' ? '' : sh + ' · ') + it.lab + (L.have ? '' : ' (not on this device)');
    }
  }
  TP.data = { F, lanes };
  return TP.data;
}
function ownItem(s) {
  const fa = s.rel === 'before' || s.rel === 'about', fb = s.rel === 'after' || s.rel === 'about';
  let t0 = ax(s.y0), t1 = ax(s.y1 ?? s.y0) + 1;
  if (s.a0 != null) { t0 = s.a0; t1 = s.a1; }                     // (an Olympiad or a year of the city: its own boundaries)
  if (s.rel === 'before') t0 -= Math.max(5, (t1 - t0) * 2); if (s.rel === 'after') t1 += Math.max(5, (t1 - t0) * 2);
  if (s.rel === 'about') { t0 -= 3; t1 += 3; }
  return { t0, t1, fa, fb, lab: s.ev || '(untitled)', kind: 'own', own: s, src: 'your statement' + (s.src?.title ? ' – ' + s.src.title : ''), ev: s.ev,
    go: s.src?.w ? { w: s.src.w, bi: s.src.bi, r: s.src.r } : null, note: [s.when, s.note].filter(Boolean).join(' · '), place: s.place };
}

// ---------------------------------------------------------------- drawing
function tmpColors() {
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  return { fg: v('--fg'), mut: v('--mut'), line: v('--line'), acc: v('--acc'), acc2: v('--acc2'), card: v('--card'), bar: v('--bar'), bg: v('--bg'), ui: v('--ui') };
}
const evHue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
function laneShown(L) { return !TP.cfg.hide[L.id] && (L.have || TP.cfg.all); }
function tmpLayout(A0, A1) {                             // the lanes with something in view; each as tall as the highest row in view
  const rows = [], away = [], wid = S.text?.work?.id;
  const lanes = TP.data.lanes.filter(laneShown).sort((a, b) => (b.id.endsWith(':' + wid) || b.id.endsWith(wid)) - (a.id.endsWith(':' + wid) || a.id.endsWith(wid)));
  for (const L of lanes) {
    const its = L.its.filter(i => i.t1 > A0 && i.t0 < A1);
    if (!its.length) { away.push(L); continue; }
    rows.push({ L, n: 1 + Math.max(...its.map(i => i.row)), its });
  }
  return { rows, away };
}
function rulerHeight(id) { return id === 'emp' ? 14 * (TP.empRows || 1) + 6 : id === 'cos' ? 20 : 18; }
function tmpDraw() {
  TP.raf = 0;
  const cv = $('#tmpCanvas'); if (!cv || !TP.data) return;
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  tmpClampX(W);                                          // (the limits of Settings → Tempora)
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const C = TP.C = tmpColors(), font = s => `${s}px ${C.ui || 'sans-serif'}`;
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  const X = a => (a - TP.x0) * TP.ppy, A0 = TP.x0, A1 = TP.x0 + W / TP.ppy;
  TP.hit = [];
  // emperor rows (packed once)
  const F = TP.data.F, emps = (F?.k || []).map((e, j) => ({ e, j, a0: ax(Math.min(e[4], e[6] ?? e[4])), a1: ax(e[5]) + 1 })).sort((p, q) => p.a0 - q.a0);
  if (TP.empKey !== F) { TP.empKey = F; TP.empRow = new Map(); const ends = [];   // (packed once: an emperor keeps his row whatever is in view)
    for (const x of emps) { let r = ends.findIndex(v => v <= x.a0); if (r < 0) { r = ends.length; ends.push(0); } ends[r] = x.a1; TP.empRow.set(x.j, r); } }
  for (const x of emps) x.row = TP.empRow.get(x.j);
  TP.empRows = Math.max(1, ...emps.filter(x => x.a1 > A0 && x.a0 < A1).map(x => x.row + 1));
  // ---- lanes (below the rulers, scrolled)
  const SPAN = { auc: [-752, 1e9], cato: [-751, 1e9], ol: [-775, 394], cos: [-29, 566], emp: [-62, 566], sel: [-311, 1e9], dio: [284, 1e9], ind: [312, 1e9] };
  const rulers = RULERS.filter(([id]) => TP.cfg.rulers[id] && (!SPAN[id] || (A1 > SPAN[id][0] && A0 < SPAN[id][1])));
  const RH = rulers.reduce((s, [id]) => s + rulerHeight(id), 0) + 4;
  TP.RH = RH;
  const { rows, away } = tmpLayout(A0, A1), lh = TP.lh;
  let y = RH + 6 - TP.sy, lastG = null; const centers = [];
  g.save(); g.beginPath(); g.rect(0, RH, W, H - RH); g.clip();
  // year grid
  const step = gridStep(TP.ppy);
  g.strokeStyle = C.line; g.lineWidth = 1; g.globalAlpha = 0.5;
  for (let a = Math.ceil(A0 / step) * step; a < A1; a += step) { const x = Math.round(X(a)) + 0.5; g.beginPath(); g.moveTo(x, RH); g.lineTo(x, H); g.stroke(); }
  g.globalAlpha = 1;
  for (const { L, n, its: vis } of rows) {
    const h = n * lh + 6, top = y;
    if (top < H && top + h > RH) {
      if (lastG) { g.strokeStyle = C.line; g.lineWidth = 1; g.beginPath(); g.moveTo(0, top - 2.5); g.lineTo(W, top - 2.5); g.stroke(); }
      for (const it of vis) {
        const x0 = X(it.t0), x1 = Math.max(X(it.t1) - 1, x0 + 3), yy = top + 3 + it.row * lh, bh = lh - 8;
        if (x1 < 0 || x0 > W) continue;
        drawItem(g, C, it, x0, x1, yy, bh, font);
        TP.hit.push({ x0, x1, y0: yy, y1: yy + bh, it, L });
        if (it.ev || it.link) centers.push({ it, x: (Math.max(x0, 0) + Math.min(x1, W)) / 2, y: yy + bh / 2 });
      }
    }
    y += h + 4; lastG = L.id;
  }
  if (away.length) { g.fillStyle = C.mut; g.font = font(11); const s = `Nothing in this span: ${away.map(l => l.t).join(' · ')}`;
    g.save(); g.beginPath(); g.rect(8, y, W - 16, 30); g.clip(); g.fillText(s.length > 400 ? s.slice(0, 400) + ' …' : s, 8, y + 14); g.restore(); y += 30; }
  TP.contentH = y + TP.sy - RH;
  // the same event in several places: one colour, joined by lines (786)
  const byEv = new Map(); for (const c of centers) if (c.it.ev) { const k = c.it.ev.toLowerCase(); if (!byEv.has(k)) byEv.set(k, []); byEv.get(k).push(c); }
  g.lineWidth = 1.6;
  for (const [k, cs] of byEv) { if (cs.length < 2) continue; g.strokeStyle = `hsla(${evHue(k)},60%,50%,.75)`;
    cs.sort((p, q) => p.y - q.y || p.x - q.x); for (let i = 1; i < cs.length; i++) { const p = cs[i - 1], q = cs[i]; g.beginPath(); g.moveTo(p.x, p.y);
      if (Math.abs(p.y - q.y) < 2) { const h = Math.min(26, 6 + Math.abs(q.x - p.x) / 6); g.bezierCurveTo(p.x, p.y - h, q.x, q.y - h, q.x, q.y); }   // (the same row: an arc above)
      else g.bezierCurveTo(p.x, (p.y + q.y) / 2, q.x, (p.y + q.y) / 2, q.x, q.y); g.stroke(); } }
  // the cursor
  if (TP.cur != null) { const x = X(TP.cur); g.strokeStyle = C.acc; g.lineWidth = 1.5; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x, RH); g.lineTo(x, H); g.stroke(); g.setLineDash([]); }
  g.restore();
  // ---- rulers (fixed at the top)
  g.fillStyle = C.bar; g.fillRect(0, 0, W, RH);
  let ry = 0;
  for (const [id] of rulers) { const rh = rulerHeight(id); drawRuler(g, C, id, ry, rh, W, X, A0, A1, emps, font); ry += rh; }
  g.strokeStyle = C.line; g.beginPath(); g.moveTo(0, RH - 0.5); g.lineTo(W, RH - 0.5); g.stroke();
  // links of consular dates to the consul ruler (782a)
  const cosR = rulers.findIndex(([id]) => id === 'cos');
  if (cosR >= 0) { const cy = rulers.slice(0, cosR).reduce((s, [id]) => s + rulerHeight(id), 0) + 20;
    g.strokeStyle = C.acc2; g.globalAlpha = 0.5; g.setLineDash([2, 3]);
    for (const c of centers) if (c.it.link && c.y > RH) { g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(c.x, cy); g.stroke(); }
    g.setLineDash([]); g.globalAlpha = 1; }
  if (TP.cur != null) { const x = X(TP.cur); g.strokeStyle = C.acc; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, RH); g.stroke(); }
}
function drawItem(g, C, it, x0, x1, y, h, font) {
  const sel = TP.sel?.it === it;
  const base = it.ev ? `hsl(${evHue(it.ev.toLowerCase())},55%,52%)` : it.kind === 'own' ? C.acc : it.kind === 'office' ? C.acc : it.kind === 'date' ? C.acc2 : C.acc2;
  const alpha = it.kind === 'book' ? 0.28 : it.kind === 'life' || it.kind === 'cite' ? 0.22 : it.kind === 'work' ? 0.25 : it.uneven ? 0.2 : 0.38;
  // fuzzy ends: a gradient fading out
  const grd = g.createLinearGradient(x0, 0, x1, 0), w = Math.max(1, x1 - x0), fw = Math.min(0.45, 24 / w);
  const col = a => { g.globalAlpha = 1; return a; };
  grd.addColorStop(0, it.fa ? 'transparent' : base); grd.addColorStop(it.fa ? fw : 0, base); grd.addColorStop(it.fb ? 1 - fw : 1, base); grd.addColorStop(1, it.fb ? 'transparent' : base);
  g.globalAlpha = sel ? 0.75 : alpha; g.fillStyle = grd; roundRect(g, x0, y, x1 - x0, h, 4); g.fill(); g.globalAlpha = 1;
  if (it.kind === 'date' || it.kind === 'own' || sel) { g.strokeStyle = sel ? C.fg : base; g.lineWidth = sel ? 1.6 : 1; roundRect(g, x0, y, x1 - x0, h, 4); g.stroke(); }
  if (it.uneven) { g.strokeStyle = C.acc; g.setLineDash([3, 2]); roundRect(g, x0, y, x1 - x0, h, 4); g.stroke(); g.setLineDash([]); }
  const tx = x0 + 4, room = x1 - tx - 3;                    // (the label goes with the bar as it is dragged)
  if (room > 18) { g.fillStyle = C.fg; g.font = font(11); g.save(); g.beginPath(); g.rect(tx, y, room, h); g.clip(); g.fillText(it.full || it.lab, tx, y + h / 2 + 4); g.restore(); }
  col();
}
function roundRect(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function gridStep(ppy) { for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]) if (s * ppy >= 70) return s; return 10000; }
function drawRuler(g, C, id, y, h, W, X, A0, A1, emps, font) {
  g.save(); g.beginPath(); g.rect(0, y, W, h); g.clip();
  const cell = (a0, a1, lab, strong) => {
    const x0 = X(a0), x1 = X(a1); if (x1 < 0 || x0 > W) return;
    g.strokeStyle = C.line; g.beginPath(); g.moveTo(Math.round(x0) + 0.5, y + 2); g.lineTo(Math.round(x0) + 0.5, y + h - 1); g.stroke();
    const room = x1 - x0 - 4; if (room < 12 || !lab) return;
    g.fillStyle = strong ? C.fg : C.mut; g.font = font(10.5); const tw = g.measureText(lab).width;
    const tx = Math.min(Math.max(x0 + 3, 3), x1 - tw - 3);
    if (tw <= room) g.fillText(lab, tx, y + h - 5);
  };
  const ppy = TP.ppy, st = gridStep(ppy), name = RULERS.find(r => r[0] === id)[1];
  if (id === 'jul') {                                  // (round historical years: 600 BC, 400 BC, 200 BC, AD 1 / 200 …)
    const ys = []; for (let Y = Math.floor((hy(Math.floor(A0)) - st) / st) * st; Y <= hy(Math.ceil(A1)) + st; Y += st) ys.push(Y === 0 ? 1 : Y);
    for (let i = 0; i < ys.length - 1; i++) cell(ax(ys[i]), ax(ys[i + 1]), yTxtS(ys[i]), true); }
  if (id === 'ol') {
    if (ppy * 1 >= 26) { for (let a = Math.floor(A0) - 1; a < A1 + 1; a++) { const o = olOf(a + 0.6); if (o && o.n <= 293) cell(a + 0.5, a + 1.5, `${o.n}.${o.y}`, o.y === 1); } }
    else { const s = Math.max(1, Math.ceil(30 / (ppy * 4))); for (let n = Math.max(1, Math.floor((A0 + 775) / 4) - 1); n <= Math.min(293, (A1 + 775) / 4 + 1); n++) if ((n - 1) % s === 0) cell(-775 + 4 * (n - 1) + 0.5, -775 + 4 * (n - 1 + s) + 0.5, 'Ol. ' + n, true); }
  }
  if (id === 'auc' || id === 'cato') { const e = id === 'auc' ? 753 : 752, s = ppy >= 30 ? 1 : st;
    for (let n = Math.max(s, Math.floor((A0 + e) / s) * s); n - e < A1 + s; n += s) cell(n - e + 0.3, n + s - e + 0.3, (s === 1 ? '' : 'AUC ') + n, true); }
  if (id === 'cos') { const c = TP.data.F?.c || {};
    for (let yh = Math.max(-30, hy(Math.floor(A0))); yh <= Math.min(565, hy(Math.ceil(A1))); yh++) { const v = c[String(yh)]; if (!v) continue;
      const short = p => { const w = String(p[0]).replace(/\[[^\]]*\]|\([^)]*\)/g, '').split(/\s+/).filter(x => /^[A-Z][a-z]/.test(x) && !/^(Imp|Flavius|Caesar|Aug)$/.test(x.replace('.', ''))); return (w[w.length - 1] || p[0]) + (p[1] > 1 ? ' ' + ROMN(p[1]) : ''); };
      cell(ax(yh), ax(yh) + 1, ppy >= 60 ? (v.o || []).map(short).join(' · ') : ppy >= 22 ? short(v.o?.[0] || ['']) : '', false); } }
  if (id === 'emp') { for (const x of emps) { if (x.row >= TP.empRows) continue; const x0 = X(x.a0), x1 = Math.max(X(x.a1), x0 + 2); if (x1 < 0 || x0 > W) continue;
      const e = x.e, yy = y + 3 + x.row * 14, cz = e[6] != null && e[6] < e[4] ? X(ax(e[6])) : null;
      g.fillStyle = e[7] === 'U' ? C.mut : C.acc2; g.globalAlpha = e[7] === 'C' ? 0.3 : 0.55;
      if (cz != null && e[7] !== 'C') { g.globalAlpha = 0.25; g.fillRect(cz, yy, X(ax(e[4])) - cz, 11); g.globalAlpha = 0.55; g.fillRect(X(ax(e[4])), yy, x1 - X(ax(e[4])), 11); }
      else g.fillRect(x0, yy, x1 - x0, 11);
      g.globalAlpha = 1; const room = x1 - Math.max(x0, 0) - 4; g.font = font(10); g.fillStyle = C.fg;
      if (room > 20) { g.save(); g.beginPath(); g.rect(Math.max(x0, 0), yy, room + 2, 12); g.clip(); g.fillText(e[0], Math.max(x0, 0) + 2, yy + 9.5); g.restore(); }
      TP.hit.push({ x0, x1, y0: yy, y1: yy + 11, emp: x.j }); } }
  if (id === 'sel') { const s = ppy >= 30 ? 1 : st; for (let n = Math.max(s, Math.floor((A0 + 311) / s) * s); n - 311 < A1 + s; n += s) cell(n - 312 + 0.75, n - 312 + s + 0.75, (s === 1 ? '' : 'SE ') + n, true); }
  if (id === 'dio') { const s = ppy >= 30 ? 1 : st; for (let n = Math.max(s, Math.floor((A0 - 284) / s) * s); n + 283 < A1 + s; n += s) cell(n + 283 + 0.66, n + 283 + s + 0.66, (s === 1 ? '' : 'Diocl. ') + n, true); }
  if (id === 'ind') { if (ppy >= 18) for (let a = Math.max(312, Math.floor(A0)); a < A1 + 1; a++) cell(a + 0.67, a + 1.67, 'ind. ' + (((a - 312) % 15) + 1), (a - 312) % 15 === 0);
    else for (let a = 312 + Math.max(0, Math.floor((A0 - 312) / 15)) * 15; a < A1 + 15; a += 15) cell(a + 0.67, a + 15.67, 'cycle ' + ((a - 312) / 15 + 1), true); }
  g.fillStyle = C.mut; g.globalAlpha = 0.9; g.font = font(9); const nm = name.replace(/ \(.*$/, '');
  g.fillStyle = C.bar; const tw = g.measureText(nm).width; g.fillRect(W - tw - 10, y + 1, tw + 8, 10); g.fillStyle = C.mut; g.fillText(nm, W - tw - 6, y + 9);
  g.globalAlpha = 1; g.strokeStyle = C.line; g.beginPath(); g.moveTo(0, y + h - 0.5); g.lineTo(W, y + h - 0.5); g.stroke();
  g.restore();
}
function tmpRedraw() { if (!TP.raf) TP.raf = requestAnimationFrame(tmpDraw); }

// ---------------------------------------------------------------- the tab
async function showTempora() {
  showTab('tempora');
  const body = $('#temporaBody'); if (!body) return;
  await tmpCfg(); await tmpLimits();
  if (!$('#tmpCanvas')) {
    body.innerHTML = `<div class="tmpbar"><button type="button" data-tmp="layers" title="Layers and filters">☰ Layers</button>`
      + `<span class="tmpseg"><button type="button" data-tmpmode="narr" title="Place texts at the years they narrate">Narrated</button><button type="button" data-tmpmode="writ" title="Place texts at the time they were written">Written</button></span>`
      + `<button type="button" data-tmp="add" title="Add your own statement">＋ Statement</button><span class="sp"></span>`
      + `<button type="button" data-tmp="here" title="The years of the text being read">This text</button>`
      + `</div>`
      + `<div class="tmpwrap"><canvas id="tmpCanvas"></canvas></div><div id="tmpCard" class="tmpcard" hidden></div><div id="tmpPanel" class="tmppanel" hidden></div>`;
    tmpWire($('#tmpCanvas'));
  }
  body.querySelectorAll('[data-tmpmode]').forEach(b => b.classList.toggle('on', b.dataset.tmpmode === TP.cfg.mode));
  const has = Object.values(S.installed || {}).some(d => d.kind === 'fasti');
  if (!has && !$('#tmpHint')) body.querySelector('.tmpwrap').insertAdjacentHTML('afterbegin', `<p class="hint" id="tmpHint">For the consuls, the emperors and the years the books narrate, download “W. Liebenam, Fasti consulares …” and “Tempora – dates read from the library’s texts”: ☰ → Instruments → Suda – Encyclopaedias and Lexica. <button type="button" data-tmpget="1">Download both</button></p>`);
  if (has) $('#tmpHint')?.remove();
  await tmpData(); tmpRedraw();
}
function tmpAt(px, py) { return TP.hit.slice().reverse().find(h => (py < TP.RH) === (h.emp != null) && px >= h.x0 - 3 && px <= h.x1 + 3 && py >= h.y0 - 2 && py <= h.y1 + 2) || null; }
function tmpZoomX(f, px) { const a = TP.x0 + px / TP.ppy; TP.ppy = Math.min(4000, Math.max(0.005, TP.ppy * f)); TP.x0 = a - px / TP.ppy; tmpSave(); tmpRedraw(); }
function tmpZoomY(f) { TP.lh = Math.min(90, Math.max(16, TP.lh * f)); tmpSave(); tmpRedraw(); }
function tmpClampY() { const cv = $('#tmpCanvas'); const max = Math.max(0, (TP.contentH || 0) - (cv.clientHeight - (TP.RH || 0)) + 40); TP.sy = Math.min(max, Math.max(0, TP.sy)); }
function tmpWire(cv) {
  new ResizeObserver(() => tmpRedraw()).observe(cv);
  let down = null, pinch = null, moved = false, lastTap = 0;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); TP.ptr.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (TP.ptr.size === 1) { down = { x: e.offsetX, y: e.offsetY, x0: TP.x0, sy: TP.sy }; moved = false; }
    if (TP.ptr.size === 2) { const [p, q] = [...TP.ptr.values()]; pinch = { dx: Math.abs(p.x - q.x), dy: Math.abs(p.y - q.y), ppy: TP.ppy, lh: TP.lh, mx: (p.x + q.x) / 2, x0: TP.x0 }; down = null; } });
  cv.addEventListener('pointermove', e => { if (!TP.ptr.has(e.pointerId)) return; TP.ptr.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pinch && TP.ptr.size === 2) { const [p, q] = [...TP.ptr.values()], dx = Math.abs(p.x - q.x), dy = Math.abs(p.y - q.y), mx = (p.x + q.x) / 2;
      const a = pinch.x0 + pinch.mx / pinch.ppy;                 // two fingers: across = time, up and down = lane height
      if (pinch.dx > 40) TP.ppy = Math.min(4000, Math.max(0.005, pinch.ppy * dx / pinch.dx));
      if (pinch.dy > 40) TP.lh = Math.min(90, Math.max(16, pinch.lh * dy / pinch.dy));
      TP.x0 = a - mx / TP.ppy; moved = true; tmpSave(); tmpRedraw(); return; }
    if (!down) return; const dx = e.offsetX - down.x, dy = e.offsetY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    if (moved) { TP.x0 = down.x0 - dx / TP.ppy; TP.sy = down.sy - dy; tmpClampY(); tmpSave(); tmpRedraw(); } });
  const up = e => { TP.ptr.delete(e.pointerId); if (TP.ptr.size < 2) pinch = null;
    if (down && !moved && TP.ptr.size === 0) { const now = Date.now();
      if (now - lastTap < 300) { tmpZoomX(2, e.offsetX); lastTap = 0; } else { lastTap = now; tmpTap(e.offsetX, e.offsetY); } }
    if (TP.ptr.size === 0) down = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault();
    if (e.ctrlKey || e.metaKey) tmpZoomX(Math.exp(-e.deltaY / 200), e.offsetX);
    else if (e.shiftKey) tmpZoomY(Math.exp(-e.deltaY / 300));
    else { TP.x0 += e.deltaX / TP.ppy; TP.sy += e.deltaY; tmpClampY(); tmpSave(); tmpRedraw(); } }, { passive: false });
}
function tmpTap(px, py) {
  const h = tmpAt(px, py);
  if (h?.it) { TP.sel = h; TP.cur = null; tmpCardItem(h); }
  else if (h?.emp != null) { const e = TP.data.F.k[h.emp]; TP.sel = null; TP.cur = null; tmpCardEmp(e); }
  else { TP.sel = null; TP.cur = TP.x0 + px / TP.ppy; tmpCardYear(hy(Math.floor(TP.cur))); }
  tmpRedraw();
}
const rangeTxt = (t0, t1) => { const a = hy(Math.floor(t0 + 0.001)), b = hy(Math.ceil(t1 - 0.001) - 1); return a === b ? yTxt(a) : `${yTxt(a)} – ${yTxt(b)}`; };
function tmpCardYear(y) {
  const c = $('#tmpCard'); c.hidden = false;
  c.innerHTML = `<div class="tch"><b>${yTxt(y)}</b><button type="button" data-tmpclose="1" aria-label="Close">✕</button></div><table class="tsys">${systemsAt(y).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
}
function tmpCardEmp(e) {
  const c = $('#tmpCard'); c.hidden = false;
  c.innerHTML = `<div class="tch"><b>${esc(e[0])}</b><button type="button" data-tmpclose="1" aria-label="Close">✕</button></div><p>${e[7] === 'C' ? 'Caesar' : e[7] === 'U' ? 'Usurper' : 'Emperor'}: ${esc(e[2])} – ${esc(e[3])}${e[6] != null && e[6] < e[4] ? ` · Caesar ${yTxt(e[6])}` : ''}${e[8] ? ` · ${e[8] === 'W' ? 'West' : 'East'}` : ''}</p>`
    + `<p class="hint">${e[9] === 'Clinton' ? 'Clinton, Fasti Romani I (1845)' : `Liebenam, Fasti consulares (1909), p. ${e[9]}`}</p>`
    + (e[10]?.length ? `<p><button type="button" data-tmpperson="${esc(e[10][0])}">Person page</button> <button type="button" data-tmpadd="${esc(e[10][0])}">Add as a lane</button></p>` : '');
}
function tmpCardItem(h) {
  const it = h.it, c = $('#tmpCard'); c.hidden = false;
  c.innerHTML = `<div class="tch"><b>${esc(it.lab)}</b><button type="button" data-tmpclose="1" aria-label="Close">✕</button></div>`
    + `<p>${esc(rangeTxt(it.t0, it.t1))}${it.fa || it.fb ? ' <small>(vague)</small>' : ''} · <span class="hint">${esc(it.src || '')}</span></p>`
    + (it.text ? `<p class="gk tmptext">${esc(it.text)}</p>` : '') + (it.note ? `<p class="hint">${esc(it.note)}</p>` : '')
    + `<p class="tact">${it.go?.w ? `<button type="button" data-tmpgo="1">Open the passage</button>` : ''}${it.ref ? `<button type="button" data-tmpperson="${esc(it.ref)}">Person page</button>` : ''}`
    + `${it.place ? `<button type="button" data-tmpmap="1">Show on the map</button>` : ''}${it.own ? `<button type="button" data-tmpedit="${esc(it.own.id)}">Edit</button>` : ''}`
    + `<button type="button" data-tmpyear="${hy(Math.floor(it.t0 + 0.001))}">The year in all systems</button></p>`;
}
async function tmpGo(go) {
  if (!go?.w) return;
  if (go.r) return pplPassage(go.w, go.bi || 0, go.r, '');
  if (!(await libGet('works', go.w))) { try { note('Downloading …'); await downloadWork('work:' + go.w); } catch (e) { return toast('Download failed: ' + e.message, 4000); } }
  await openWork(go.w, go.bi || 0);
}
function tmpHere() {                                     // the years of the book being read, or of its consular dates
  const L = TP.data?.lanes || [], wid = S.text?.work?.id; if (!wid) return toast('Open a text first.');
  const its = L.filter(l => l.id.endsWith(wid) || l.its.some(i => i.go?.w === wid)).flatMap(l => l.its.filter(i => i.go?.w === wid && (i.go.bi === S.text.bi || i.kind === 'date')));
  if (!its.length) return toast('No years known for this text yet.');
  const a = Math.min(...its.map(i => i.t0)), b = Math.max(...its.map(i => i.t1)), W = $('#tmpCanvas').clientWidth;
  TP.ppy = Math.min(400, Math.max(0.05, W * 0.7 / Math.max(1, b - a))); TP.x0 = a - (W * 0.15) / TP.ppy;
  TP.sy = 0; tmpSave(); tmpRedraw();
}

// ---------------------------------------------------------------- layers and filters
function tmpPanel() {
  const p = $('#tmpPanel'); p.hidden = false;
  const L = TP.data?.lanes || [], groups = [...new Set(L.map(l => l.g))];
  p.innerHTML = `<div class="tch"><b>Layers</b><button type="button" data-tmpclose="panel" aria-label="Close">✕</button></div>`
    + `<div class="tpsec"><div class="tph">Reference systems</div>${RULERS.map(([id, n]) => `<label><input type="checkbox" data-tmpr="${id}"${TP.cfg.rulers[id] ? ' checked' : ''}> ${esc(n)}</label>`).join('')}</div>`
    + `<div class="tpsec"><div class="tph">Lanes <input type="search" id="tmpFilt" placeholder="Filter by author, work, person …" autocomplete="off"></div>`
    + groups.map(g => `<div class="tpg">${esc(g)}</div>` + L.filter(l => l.g === g && (l.have || TP.cfg.all)).map(l => `<label data-tl="${esc((l.t + ' ' + l.g).toLowerCase())}"><input type="checkbox" data-tmpl="${esc(l.id)}"${TP.cfg.hide[l.id] ? '' : ' checked'}> ${esc(l.t)}${l.ref ? ` <button type="button" class="tprm" data-tmprm="${esc(l.ref)}" title="Remove">✕</button>` : ''}</label>`).join('')).join('')
    + `<label><input type="checkbox" data-tmpall2="1"${TP.cfg.all ? ' checked' : ''}> Also works not on this device</label>`
    + `<p class="hint">Persons: open one in the Suda tab and choose “Show in Tempora”.</p><p><button type="button" data-tmpall="1">All lanes</button> <button type="button" data-tmpnone="1">None</button></p></div>`;
}

// ---------------------------------------------------------------- your statements (791a)
function parseWhen(s) {                                  // "44 BC", "AD 360", "360", "Ol. 87.1", "Ol 87", "AUC 300", "AUC 300 Cato"
  s = String(s || '').trim(); let m;
  if ((m = s.match(/^ol(?:ympiad)?\.?\s*(\d+)(?:\.(\d))?$/i))) { const n = +m[1], k = m[2] ? +m[2] : null, a = -775 + 4 * (n - 1) + (k ? k - 1 : 0) + 0.5; return { a0: a, a1: a + (k ? 1 : 4), y0: hy(Math.floor(a)), y1: hy(Math.floor(a + (k ? 1 : 4))) }; }
  if ((m = s.match(/^(?:auc|a\.?u\.?c\.?)\s*(\d+)\s*(cato)?$/i))) { const n = +m[1], a = n - (m[2] ? 752 : 753) + 0.3; return { a0: a, a1: a + 1, y0: hy(Math.floor(a)), y1: hy(Math.floor(a + 1)) }; }
  if ((m = s.match(/^(\d+)\s*(bc|bce|v\.?\s*chr\.?)$/i))) return { y0: -(+m[1]) };
  if ((m = s.match(/^(?:ad|ce|n\.?\s*chr\.?)?\s*(-?\d+)\s*(?:ad|ce)?$/i))) { const n = +m[1]; return { y0: n === 0 ? null : n }; }
  return null;
}
async function tmpEdit(id) {
  const s = id ? await setting('tmp|' + id) : null, t = S.text, wi = S.cur?.[0] ?? S.refs?.[0]?.i ?? 0, rr = refAt(wi), here = t?.work ? { w: t.work.id, bi: t.bi, r: rr, title: `${t.work.author ? t.work.author + ', ' : ''}${t.work.title}${t.work.books?.[t.bi] ? ' ' + t.work.books[t.bi].replace(/^Book /, '') : ''}${rr ? ', ' + rr : ''}` } : null;
  const evs = [...new Set((await getAll('settings', IDBKeyRange.bound('tmp|', 'tmp|￿'))).map(x => x.v?.ev).filter(Boolean))];
  const d = document.createElement('dialog'); d.className = 'tmpdlg';
  d.innerHTML = `<form method="dialog"><h3>${s ? 'Your statement' : 'A new statement'}</h3>`
    + `<label>What happened<input name="ev" list="tmpEvs" value="${esc(s?.ev || '')}" placeholder="e.g. Pericles dies" required></label><datalist id="tmpEvs">${evs.map(e => `<option value="${esc(e)}">`).join('')}</datalist>`
    + `<p class="hint small">The same words in several statements make them one event: they are joined by a colour.</p>`
    + `<label>When <select name="rel">${[['in', 'in'], ['before', 'before'], ['after', 'after'], ['about', 'about'], ['between', 'between … and …']].map(([v, l]) => `<option value="${v}"${s?.rel === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`
    + `<label>Year <input name="w0" value="${esc(s?.w0 || '')}" placeholder="431 BC · AD 360 · Ol. 87.1 · AUC 323" required></label>`
    + `<label class="tbtw">and <input name="w1" value="${esc(s?.w1 || '')}" placeholder="(for “between”)"></label>`
    + `<label>Source <select name="src"><option value="">none</option>${here ? `<option value="here"${!s || s.src ? ' selected' : ''}>${esc(here.title)}</option>` : ''}${s?.src && (!here || s.src.title !== here.title) ? `<option value="keep" selected>${esc(s.src.title)}</option>` : ''}</select></label>`
    + `<label>Place <input name="pl" value="${esc(s?.place?.t || '')}" placeholder="optional – a place of the map" list="tmpPls" autocomplete="off"></label><datalist id="tmpPls"></datalist>`
    + `<label>Note <input name="note" value="${esc(s?.note || '')}"></label>`
    + `<p class="dlgbtns">${s ? '<button value="del" class="danger" type="submit">Delete</button>' : ''}<span class="sp"></span><button value="cancel" type="submit" formnovalidate>Cancel</button><button value="ok" type="submit">Save</button></p></form>`;
  document.body.appendChild(d);
  const pl = d.querySelector('[name=pl]'), dl = d.querySelector('#tmpPls'); let plHits = [];
  pl.addEventListener('input', async () => { if (typeof searchPlaces !== 'function') return; if (!M.P) await loadPlaceIndex(true).catch(() => null);
    plHits = pl.value.length >= 2 ? searchPlaces(pl.value).slice(0, 12) : []; dl.innerHTML = plHits.map(p => `<option value="${esc(p.t)}">`).join(''); });
  d.showModal();
  d.addEventListener('close', async () => {
    const v = d.returnValue, f = new FormData(d.querySelector('form')); d.remove();
    if (v === 'del' && s) { await del('settings', 'tmp|' + s.id); tmpMapMarkers(); await tmpData(); tmpRedraw(); return; }
    if (v !== 'ok') return;
    const r0 = parseWhen(f.get('w0')), r1 = f.get('rel') === 'between' ? parseWhen(f.get('w1')) : null;
    if (!r0 || r0.y0 == null) return toast('The year was not understood: ' + f.get('w0'), 4000);
    const rec = { id: s?.id || Date.now().toString(36), ev: String(f.get('ev')).trim(), rel: f.get('rel'), w0: f.get('w0'), w1: f.get('w1') || '',
      y0: r0.y0, y1: r1?.y1 ?? r1?.y0 ?? r0.y1 ?? r0.y0, a0: r0.a0 ?? null, a1: (r1 ? r1.a1 ?? (ax(r1.y0) + 1) : r0.a1) ?? null, note: String(f.get('note') || ''),
      when: `${f.get('rel')} ${f.get('w0')}${r1 ? ' and ' + f.get('w1') : ''}`, at: Date.now() };
    if (rec.a0 == null && rec.a1 != null) rec.a0 = ax(rec.y0);
    if (f.get('src') === 'here') rec.src = here; else if (f.get('src') === 'keep') rec.src = s.src;
    const pt = String(f.get('pl') || '').trim(); const p = pt && (plHits.find(x => x.t === pt) || (s?.place?.t === pt ? s.place : null));
    if (p) rec.place = { id: p.id, t: p.t, lon: p.lon, lat: p.lat };
    await setting('tmp|' + rec.id, rec); await tmpData(); tmpRedraw(); tmpMapMarkers();
  });
}

// ---------------------------------------------------------------- events on the map (your statements with a place)
async function tmpMapMarkers() {
  if (typeof M === 'undefined' || !M.map || typeof maplibregl === 'undefined') return;
  (TP.mk || []).forEach(m => m.remove()); TP.mk = [];
  if ((await tmpCfg()).mapOff) return;
  const own = (await getAll('settings', IDBKeyRange.bound('tmp|', 'tmp|￿'))).map(x => x.v).filter(s => s?.place?.lon != null);
  for (const s of own) {
    const el = document.createElement('div'); el.className = 'tmpmk'; el.style.setProperty('--h', evHue((s.ev || '').toLowerCase()));
    el.innerHTML = `<b>${esc(s.ev)}</b><small>${esc(s.when || '')}</small>`; el.title = `${s.ev} – ${s.when}`;
    el.addEventListener('click', ev => { ev.stopPropagation(); showTempora().then(() => { TP.cur = null; const it = TP.data.lanes.find(l => l.id === 'own')?.its.find(i => i.own.id === s.id);
      if (it) { const W = $('#tmpCanvas').clientWidth; TP.x0 = (it.t0 + it.t1) / 2 - W / 2 / TP.ppy; TP.sel = { it }; tmpCardItem({ it }); tmpRedraw(); } }); });
    TP.mk.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([s.place.lon, s.place.lat]).addTo(M.map));
  }
}

// ---------------------------------------------------------------- clicks
document.addEventListener('click', async ev => {
  const t = ev.target; if (!t.closest?.('#temporaBody')) return;
  const b = t.closest('button,[data-tmpr],[data-tmpl]'); if (!b) return;
  const D = b.dataset;
  if (D.tmpclose) { if (D.tmpclose === 'panel') $('#tmpPanel').hidden = true; else { $('#tmpCard').hidden = true; TP.sel = null; TP.cur = null; tmpRedraw(); } return; }
  if (D.tmp === 'layers') { const p = $('#tmpPanel'); if (!p.hidden) { p.hidden = true; return; } return tmpPanel(); }
  if (D.tmp === 'add') return tmpEdit(null);
  if (D.tmp === 'here') return tmpHere();
  if (D.tmpmode) { TP.cfg.mode = D.tmpmode; tmpSave(); return showTempora(); }
  if (D.tmpz) { const W = $('#tmpCanvas').clientWidth; if (D.tmpz === 'x+') tmpZoomX(1.6, W / 2); if (D.tmpz === 'x-') tmpZoomX(1 / 1.6, W / 2); if (D.tmpz === 'y+') tmpZoomY(1.25); if (D.tmpz === 'y-') tmpZoomY(0.8); return; }
  if (D.tmpgo) return tmpGo(TP.sel?.it?.go);
  if (D.tmpperson) { await showPeople(); return pplGo({ t: 'person', ref: D.tmpperson }); }
  if (D.tmpadd) { if (!TP.cfg.persons.includes(D.tmpadd)) TP.cfg.persons.push(D.tmpadd); tmpSave(); await tmpData(); return tmpRedraw(); }
  if (D.tmprm) { TP.cfg.persons = TP.cfg.persons.filter(r => r !== D.tmprm); tmpSave(); await tmpData(); tmpRedraw(); return tmpPanel(); }
  if (D.tmpedit) return tmpEdit(D.tmpedit);
  if (D.tmpyear) { TP.cur = ax(+D.tmpyear) + 0.5; tmpCardYear(+D.tmpyear); return tmpRedraw(); }
  if (D.tmpmap) { const p = TP.sel?.it?.place; if (!p) return; toggleMapTab(true); setTimeout(() => { if (p.id != null) selectPlace(p.id); else M.map?.easeTo({ center: [p.lon, p.lat], zoom: 7 }); tmpMapMarkers(); }, 700); return; }
  if (D.tmpall || D.tmpnone) { for (const l of TP.data.lanes) TP.cfg.hide[l.id] = !!D.tmpnone; tmpSave(); tmpRedraw(); return tmpPanel(); }
  if (D.tmpget) { for (const id of ['fasti-liebenam', 'chrono-texts']) if (!S.installed?.[id]) queueDownload(id);
    b.disabled = true; b.textContent = 'Downloading …'; const w = setInterval(() => { if (S.installed?.['fasti-liebenam'] && S.installed?.['chrono-texts']) { clearInterval(w); PP.fasti = null; showTempora(); } }, 800); return; }
});
document.addEventListener('change', ev => {
  const t = ev.target; if (!t.closest?.('#tmpPanel')) return;
  if (t.dataset.tmpr) { TP.cfg.rulers[t.dataset.tmpr] = t.checked; tmpSave(); tmpRedraw(); }
  if (t.dataset.tmpl) { TP.cfg.hide[t.dataset.tmpl] = !t.checked; tmpSave(); tmpRedraw(); }
  if (t.dataset.tmpall2) { TP.cfg.all = t.checked; tmpSave(); tmpRedraw(); }
});
document.addEventListener('input', ev => {
  if (ev.target.id !== 'tmpFilt') return; const q = ev.target.value.toLowerCase().trim();
  document.querySelectorAll('#tmpPanel [data-tl]').forEach(l => { l.hidden = q && !l.dataset.tl.includes(q); });
});
document.addEventListener('click', async ev => {          // the Suda tab's person page: "Show in Tempora"
  const b = ev.target.closest?.('#peopleBody [data-tmpshow]'); if (!b) return;
  await tmpCfg(); if (!TP.cfg.persons.includes(b.dataset.tmpshow)) TP.cfg.persons.push(b.dataset.tmpshow);
  TP.cfg.hide['p:' + b.dataset.tmpshow] = false; tmpSave(); await showTempora();
  const L = TP.data.lanes.find(l => l.id === 'p:' + b.dataset.tmpshow), its = L?.its || [];
  if (its.length) { const a = Math.min(...its.map(i => i.t0)), z = Math.max(...its.map(i => i.t1)), W = $('#tmpCanvas').clientWidth;
    TP.ppy = Math.min(200, Math.max(0.05, W * 0.7 / Math.max(1, z - a))); TP.x0 = a - W * 0.15 / TP.ppy; TP.sy = 1e6; tmpClampY(); tmpSave(); tmpRedraw(); }
});
document.addEventListener('DOMContentLoaded', () => {
  const b = $('#tabTempora'); if (!b) return;
  b.addEventListener('click', () => { if (S.tab === 'tempora') return; showTempora(); });
});
