/* Pult – Tempora (v432; decisions 785–793; v468: 991–1001): the chronograph. Time runs from left to right; reference systems ("rulers":
   Julian years, Olympiads, years of the city by Varro and by Cato, the consuls, the sky …) stand at the top or at the bottom (994);
   between them the lanes: what each work narrates (with, for the work selected, when it was written – 991a), Diodorus' own years,
   the persons (all dated persons as thin bars, 997a; a tapped one opens his panel and his full lane, 999a), your own statements.
   Each item is what one source says about a time – never one authoritative date. Scrolls and zooms in both directions.
   Data: the Liebenam package (fasti-liebenam: consuls, the years each book narrates), "Tempora – dates read from the texts"
   (chrono-texts), "Tempora – persons" (tempora-persons: every statement read, and each person's life as the toolkit estimates it),
   Smith's index (the years an article mentions), the consular dates found in the text being read (782a), and your statements
   (settings "tmp|…", in the backup).
   Years: data in historical years (−44 = 44 BC, no year 0); the axis is astronomical (1 BC = 0), a year y covers [ax(y), ax(y)+1). */
'use strict';
const TP = { x0: -600, ppy: 1.4, sy: 0, lh: 30, cfg: null, data: null, hit: [], sel: null, cur: null, ptr: new Map(), raf: 0 };
const ax = y => y < 0 ? y + 1 : y;                     // historical -> astronomical
const hy = a => a <= 0 ? a - 1 : a;                    // astronomical -> historical
const yTxt = y => y < 0 ? `${-y} BC` : `AD ${y}`;
const yTxtS = y => y < 0 ? `${-y} BC` : `${y}`;
const RULERS = [['jul', 'Julian calendar (BC / AD; Gregorian from 1582)'], ['sky', 'Sky (eclipses, new and full moons, equinoxes, solstices)'], ['sky2', 'Sky (planets meeting, comets, the rising of Sirius)'],
  ['anc', 'Seasons of the ancient authors (Thucydides, Hesiod, Vegetius)'], ['rom', 'Roman calendar (Kalends, Nones, Ides)'], ['att', 'Athenian months (computed)'], ['ol', 'Olympiads'], ['auc', 'Years of the city (Varro, 753 BC)'], ['cato', 'Years of the city (Cato, 752 BC)'],
  ['cos', 'Consuls (Liebenam, 30 BC – AD 565)'], ['sel', 'Seleucid era (autumn 312 BC)'],
  ['dio', 'Era of Diocletian (29 Aug. 284)'], ['ind', 'Indictions (from 1 Sept. 312)']];
const RULER_ON = { jul: true, sky: true, sky2: true, anc: true, rom: false, att: false, ol: true, auc: true, cato: false, cos: true, sel: false, dio: false, ind: false };
// 994: the reference rows above the divider '|' stand at the top, those below it at the bottom of the screen (996a: the emperors are persons now)
const RORDER0 = ['sky', 'sky2', 'anc', 'rom', 'att', 'ol', 'auc', 'cato', 'cos', 'sel', 'dio', 'ind', '|', 'jul'];

async function tmpCfg() {
  if (TP.cfg) return TP.cfg;
  const c = (await setting('tmpCfg')) || {};
  TP.cfg = Object.assign({ rulers: { ...RULER_ON }, hide: {}, persons: [], pop: true, popy: true }, c);
  if (TP.cfg.rv !== 2) {                                   // (994: once – the sky on top, the Julian years at the bottom)
    const o = (TP.cfg.rorder || RORDER0).filter(id => !['emp', 'jul', 'sky', 'sky2', '|'].includes(id));
    TP.cfg.rorder = ['sky', 'sky2', ...o, '|', 'jul']; TP.cfg.rv = 2; delete TP.cfg.written; }
  if (c.view) Object.assign(TP, { x0: c.view.x0, ppy: c.view.ppy, lh: Math.max(12, c.view.lh || 30) });
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
    + `<small class="hint">Years as 7777 BC, AD 2026, Ol. 1, AUC 1. Tempora cannot be scrolled or zoomed beyond them.</small> <button type="button" data-tmplimreset="1">Back to the defaults</button>`
    + `<label class="srow1"><span>What the filter leaves out<small class="hint">dimmed: still there, faint · hidden: gone</small></span><span class="tmpseg"><button type="button" data-tmpfm="dim" class="${TP.cfg?.fmode !== 'hide' ? 'on' : ''}">Dimmed</button><button type="button" data-tmpfm="hide" class="${TP.cfg?.fmode === 'hide' ? 'on' : ''}">Hidden</button></span></label>`
    + `</div>`;
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
  const ws = ev.target.closest?.('[data-tmpws]'); if (ws) { await tmpCfg(); TP.cfg.wsrc = TP.cfg.wsrc || {}; const v = ws.dataset.tmpws; TP.cfg.wsrc[v] = TP.cfg.wsrc[v] === false; ws.classList.toggle('on', TP.cfg.wsrc[v]); tmpSave(); if (TP.data) await tmpData(); return tmpRedraw(); }
  const wl = ev.target.closest?.('[data-tmpwl]'); if (wl) { await tmpCfg(); TP.cfg.wlines = wl.dataset.tmpwl; tmpSave(); wl.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === wl)); return tmpRedraw(); }
  const fm = ev.target.closest?.('[data-tmpfm]'); if (fm) { await tmpCfg(); const an = tmpAnchorGet(); TP.cfg.fmode = fm.dataset.tmpfm; tmpSave(); fm.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === fm)); return tmpAnchorKeep(an); }
  const b = ev.target.closest?.('[data-tmplimreset]'); if (!b) return;
  await tmpCfg(); TP.cfg.lim = {}; tmpSave(); await tmpLimits(); tmpRedraw();
  b.closest('.tmpset')?.querySelectorAll('[data-tmplim]').forEach(i => { i.value = ''; });
});

// ---------------------------------------------------------------- calendar and sky (Meeus, Astronomical Algorithms, 2nd ed.: ch. 7, 27, 49, 54)
// the axis: a year y (astronomical) runs from its 1 January to the next, days evenly – Julian calendar to 4 Oct. 1582, Gregorian after
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const D2R = Math.PI / 180, sn = x => Math.sin(x * D2R), cs = x => Math.cos(x * D2R);
function calToJd(y, m, d) {                               // (astronomical year; before 4712 BC by whole 4-year Julian cycles)
  if (y < -4700) { const n = Math.ceil((-4700 - y) / 4); return calToJd(y + 4 * n, m, d) - 1461 * n; }
  if (m <= 2) { y--; m += 12; } let B = 0; if (y > 1582 || (y === 1582 && (m > 10 || (m === 10 && d >= 15)))) { const A = Math.floor(y / 100); B = 2 - A + Math.floor(A / 4); }
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5; }
function jdToCal(jd) {
  if (jd < 1000) { const n = Math.ceil((1000 - jd) / 1461); const c = jdToCal(jd + 1461 * n); c.y -= 4 * n; return c; }
  const Z = Math.floor(jd + 0.5), F = jd + 0.5 - Z; let A = Z;
  if (Z >= 2299161) { const al = Math.floor((Z - 1867216.25) / 36524.25); A = Z + 1 + al - Math.floor(al / 4); }
  const B = A + 1524, C = Math.floor((B - 122.1) / 365.25), D = Math.floor(365.25 * C), E = Math.floor((B - D) / 30.6001);
  const day = B - D - Math.floor(30.6001 * E) + F, m = E < 14 ? E - 1 : E - 13; return { y: m > 2 ? C - 4716 : C - 4715, m, d: Math.floor(day), f: day - Math.floor(day) }; }
const jdY0 = Y => calToJd(Y, 1, 1);
function axOfJd(jd) { let Y = jdToCal(jd).y, j0 = jdY0(Y); if (jd < j0) { Y--; j0 = jdY0(Y); } return Y + (jd - j0) / (jdY0(Y + 1) - j0); }
function jdOfAx(a) { const Y = Math.floor(a), j0 = jdY0(Y); return j0 + (a - Y) * (jdY0(Y + 1) - j0); }
function jdTxt(jd, time) { const c = jdToCal(jd), h = Math.floor(c.f * 24), mi = Math.floor((c.f * 24 - h) * 60);
  return `${c.d} ${MON[c.m - 1]} ${yTxt(hy(c.y))}` + (time ? `, ${h}:${String(mi).padStart(2, '0')} UT` : ''); }
function deltaT(y) { let u, t;                           // seconds (Espenak & Meeus); before about AD 1000 uncertain by hours
  if (y < -500) { u = (y - 1820) / 100; return -20 + 32 * u * u; }
  if (y < 500) { u = y / 100; return 10583.6 - 1014.41 * u + 33.78311 * u ** 2 - 5.952053 * u ** 3 - 0.1798452 * u ** 4 + 0.022174192 * u ** 5 + 0.0090316521 * u ** 6; }
  if (y < 1600) { u = (y - 1000) / 100; return 1574.2 - 556.01 * u + 71.23472 * u ** 2 + 0.319781 * u ** 3 - 0.8503463 * u ** 4 - 0.005050998 * u ** 5 + 0.0083572073 * u ** 6; }
  if (y < 1700) { t = y - 1600; return 120 - 0.9808 * t - 0.01532 * t * t + t ** 3 / 7129; }
  if (y < 1800) { t = y - 1700; return 8.83 + 0.1603 * t - 0.0059285 * t * t + 0.00013336 * t ** 3 - t ** 4 / 1174000; }
  if (y < 1860) { t = y - 1800; return 13.72 - 0.332447 * t + 0.0068612 * t * t + 0.0041116 * t ** 3 - 0.00037436 * t ** 4 + 0.0000121272 * t ** 5 - 0.0000001699 * t ** 6 + 0.000000000875 * t ** 7; }
  if (y < 1900) { t = y - 1860; return 7.62 + 0.5737 * t - 0.251754 * t * t + 0.01680668 * t ** 3 - 0.0004473624 * t ** 4 + t ** 5 / 233174; }
  if (y < 1920) { t = y - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t ** 3 - 0.000197 * t ** 4; }
  if (y < 1941) { t = y - 1920; return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t ** 3; }
  if (y < 1961) { t = y - 1950; return 29.07 + 0.407 * t - t * t / 233 + t ** 3 / 2547; }
  if (y < 1986) { t = y - 1975; return 45.45 + 1.067 * t - t * t / 260 - t ** 3 / 718; }
  if (y < 2005) { t = y - 2000; return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5; }
  t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
const ut = (jde, y) => jde - deltaT(y) / 86400;
function moonPhase(k) {                                  // k whole: new moon, k + .5: full moon – its time (JDE) and the eclipse, if any (ch. 49, 54)
  const T = k / 1236.85, E = 1 - 0.002516 * T - 0.0000074 * T * T;
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T - 0.00000015 * T ** 3 + 0.00000000073 * T ** 4;
  const M = 2.5534 + 29.1053567 * k - 0.0000014 * T * T - 0.00000011 * T ** 3, Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T * T + 0.00001238 * T ** 3 - 0.000000058 * T ** 4;
  const F = 160.7108 + 390.67050284 * k - 0.0016118 * T * T - 0.00000227 * T ** 3 + 0.000000011 * T ** 4, Om = 124.7746 - 1.56375588 * k + 0.0020672 * T * T + 0.00000215 * T ** 3;
  const full = Math.abs(k % 1) > 0.25, F1 = F - 0.02665 * sn(Om), A1 = 299.77 + 0.107408 * k - 0.009173 * T * T;
  jde += (full ? -0.4065 * sn(Mp) + 0.1727 * E * sn(M) : -0.4075 * sn(Mp) + 0.1721 * E * sn(M))
    + 0.0161 * sn(2 * Mp) - 0.0097 * sn(2 * F1) + 0.0073 * E * sn(Mp - M) - 0.0050 * E * sn(Mp + M) - 0.0023 * sn(Mp - 2 * F1) + 0.0021 * E * sn(2 * M)
    + 0.0012 * sn(Mp + 2 * F1) + 0.0006 * E * sn(2 * Mp + M) - 0.0004 * sn(3 * Mp) - 0.0003 * E * sn(M + 2 * F1) + 0.0003 * sn(A1) - 0.0002 * E * sn(M - 2 * F1) - 0.0002 * E * sn(2 * Mp - M) - 0.0002 * sn(Om);
  const out = { full, jde };
  if (Math.abs(sn(F)) > 0.36) return out;
  const P = 0.2070 * E * sn(M) + 0.0024 * E * sn(2 * M) - 0.0392 * sn(Mp) + 0.0116 * sn(2 * Mp) - 0.0073 * E * sn(Mp + M) + 0.0067 * E * sn(Mp - M) + 0.0118 * sn(2 * F1);
  const Q = 5.2207 - 0.0048 * E * cs(M) + 0.0020 * E * cs(2 * M) - 0.3299 * cs(Mp) - 0.0060 * E * cs(Mp + M) + 0.0041 * E * cs(Mp - M);
  const W = Math.abs(cs(F1)), g = (P * cs(F1) + Q * sn(F1)) * (1 - 0.0048 * W), u = 0.0059 + 0.0046 * E * cs(M) - 0.0182 * cs(Mp) + 0.0004 * cs(2 * Mp) - 0.0005 * cs(M + Mp), ag = Math.abs(g);
  if (!full) {
    if (ag > 1.5433 + u) return out;
    if (ag < 0.9972) out.ecl = { sun: true, ty: u < 0 ? 'total' : u > 0.0047 || u >= 0.00464 * Math.sqrt(1 - g * g) ? 'annular' : 'hybrid', central: true };
    else if (ag < 0.9972 + Math.abs(u)) out.ecl = { sun: true, ty: u < 0 ? 'total' : 'annular', central: false };
    else out.ecl = { sun: true, ty: 'partial', mag: (1.5433 + u - ag) / (0.5461 + 2 * u) };
  } else {
    const pm = (1.5573 + u - ag) / 0.5450, um = (1.0128 - u - ag) / 0.5450;
    if (pm > 0) out.ecl = { sun: false, ty: um >= 1 ? 'total' : um > 0 ? 'partial' : 'penumbral', mag: um > 0 ? um : pm };
  }
  return out;
}
const EQ_A = [485, 203, 199, 182, 156, 136, 77, 74, 70, 58, 52, 50, 45, 44, 29, 18, 17, 16, 14, 12, 12, 12, 9, 8];
const EQ_B = [324.96, 337.23, 342.08, 27.85, 73.14, 171.52, 222.54, 296.72, 243.58, 119.81, 297.17, 21.02, 247.54, 325.15, 60.93, 155.12, 288.79, 198.04, 199.76, 95.39, 287.11, 320.81, 227.73, 15.45];
const EQ_C = [1934.136, 32964.467, 20.186, 445267.112, 45036.886, 22518.443, 65928.934, 3034.906, 9037.513, 33718.147, 150.678, 2281.226, 29929.562, 31555.956, 4443.417, 67555.328, 4562.452, 62894.029, 31436.921, 14577.848, 31931.756, 34777.259, 1222.114, 16859.074];
const SEASONS = ['spring equinox', 'summer solstice', 'autumn equinox', 'winter solstice'];
function seasonJde(y, i) {                                 // ch. 27: astronomical year y; 0 March equinox, 1 June solstice, 2 September equinox, 3 December solstice
  const lo = [[1721139.29189, 365242.13740, 0.06134, 0.00111, -0.00071], [1721233.25401, 365241.72562, -0.05323, 0.00907, 0.00025], [1721325.70455, 365242.49558, -0.11677, -0.00297, 0.00074], [1721414.39987, 365242.88257, -0.00769, -0.00933, -0.00006]];
  const hi = [[2451623.80984, 365242.37404, 0.05169, -0.00411, -0.00057], [2451716.56767, 365241.62603, 0.00325, 0.00888, -0.00030], [2451810.21715, 365242.01767, -0.11575, 0.00337, 0.00078], [2451900.05952, 365242.74049, -0.06223, -0.00823, 0.00032]];
  const [c, Y] = y < 1000 ? [lo[i], y / 1000] : [hi[i], (y - 2000) / 1000];
  const j0 = c[0] + c[1] * Y + c[2] * Y * Y + c[3] * Y ** 3 + c[4] * Y ** 4, T = (j0 - 2451545) / 36525, W = 35999.373 * T - 2.47, dl = 1 + 0.0334 * cs(W) + 0.0007 * cs(2 * W);
  let S = 0; for (let k = 0; k < 24; k++) S += EQ_A[k] * cs(EQ_B[k] + EQ_C[k] * T); return j0 + 0.00001 * S / dl; }
const kOfJd = jd => (jd - 2451550.09766) / 29.530588861;
function tmpEclipses() {                                   // every eclipse from 2000 BC to AD 2100, computed once (about 10 000)
  if (TP.ecl) return TP.ecl; const out = [];
  for (let k = Math.floor(kOfJd(jdY0(-1999))); k < kOfJd(jdY0(2101)); k += 0.5) { const p = moonPhase(k); if (!p.ecl) continue;
    const y = Math.floor(axOfJd(p.jde)), j = ut(p.jde, y); out.push(Object.assign({ jd: j, a: axOfJd(j) }, p.ecl)); }
  return TP.ecl = out;
}
const eclName = e => `${e.ty === 'hybrid' ? 'hybrid (annular–total)' : e.ty} ${e.sun ? 'solar' : 'lunar'} eclipse`;
function drawSky(g, C, y, h, W, X, A0, A1, font) {
  const ppy = TP.ppy, cy = y + h / 2 + 1, mk = [];            // (markers: drawn by importance, none on top of another; a label runs to the next one)
  // eclipses (2000 BC – AD 2100)
  if (ppy >= 3) { const E = tmpEclipses(); let lo = 0, hi = E.length; while (lo < hi) { const m = (lo + hi) >> 1; if (E[m].a < A0 - 0.01) lo = m + 1; else hi = m; }
    for (let i = lo; i < E.length && E[i].a <= A1 + 0.01; i++) { const e = E[i]; if (e.ty === 'penumbral' && ppy < 120) continue;
      mk.push({ x: X(e.a), pr: e.sun ? (e.central ? 0 : e.ty === 'partial' ? 3 : 1) : e.ty === 'total' ? 1 : e.ty === 'partial' ? 3 : 5, lab: ppy >= 400 ? eclName(e) : '', e, sky: Object.assign({ kind: 'ecl' }, e) }); } }
  // new and full moons (not where an eclipse marks the same moment)
  if (ppy >= 250) { const j0 = jdOfAx(A0), j1 = jdOfAx(A1);
    for (let k = Math.floor(kOfJd(j0) * 2) / 2 - 0.5; k <= kOfJd(j1) + 0.5; k += 0.5) { const p = moonPhase(k); if (p.ecl && p.ecl.ty !== 'penumbral' && axOfJd(p.jde) >= -1999) continue;
      const j = ut(p.jde, Math.floor(axOfJd(p.jde))); mk.push({ x: X(axOfJd(j)), pr: 6, moon: p.full, lab: ppy >= 3000 ? (p.full ? 'full moon' : 'new moon') : '', sky: { kind: 'moon', full: p.full, jd: j } }); } }
  // equinoxes and solstices
  if (ppy >= 60) for (let Y = Math.floor(A0); Y <= Math.ceil(A1); Y++) for (let i = 0; i < 4; i++) {
    const j = ut(seasonJde(Y, i), Y), a = axOfJd(j); if (a < A0 - 0.05 || a > A1 + 0.05) continue;
    mk.push({ x: X(a), pr: 2, season: i, lab: ppy >= 600 ? SEASONS[i] : '', sky: { kind: 'season', i, jd: j } }); }
  const shown = [];
  for (const m of mk.slice().sort((p, q) => p.pr - q.pr)) { if (m.x < -8 || m.x > W + 8) continue; if (shown.some(s => Math.abs(s.x - m.x) < 11)) continue; shown.push(m); }
  shown.sort((p, q) => p.x - q.x);
  shown.forEach((m, i) => { const x = m.x, e = m.e;
    if (e) { const r = e.ty === 'partial' || e.ty === 'penumbral' ? 3.6 : 5; g.beginPath(); g.arc(x, cy, r, 0, 7);
      if (e.sun) { if (e.ty === 'annular' || e.ty === 'hybrid') { g.fillStyle = '#e8b33a'; g.fill(); g.beginPath(); g.arc(x, cy, r - 1.6, 0, 7); g.fillStyle = C.fg; g.fill(); } else { g.fillStyle = C.fg; g.globalAlpha = e.ty === 'partial' ? 0.5 : 1; g.fill(); g.globalAlpha = 1; } }
      else { g.fillStyle = '#b5523b'; g.globalAlpha = e.ty === 'total' ? 0.95 : e.ty === 'partial' ? 0.55 : 0.25; g.fill(); g.globalAlpha = 1; } }
    else if (m.season != null) { g.fillStyle = m.season % 2 ? C.acc : C.acc2; g.globalAlpha = 0.8; g.beginPath(); g.moveTo(x, y + 4); g.lineTo(x + 3.5, y + h - 4); g.lineTo(x - 3.5, y + h - 4); g.closePath(); g.fill(); g.globalAlpha = 1; }
    else { g.beginPath(); g.arc(x, cy, 3.4, 0, 7); if (m.moon) { g.fillStyle = C.card; g.fill(); g.strokeStyle = C.mut; g.lineWidth = 1; g.stroke(); } else { g.fillStyle = C.mut; g.fill(); } }
    if (m.lab) { const room = (i + 1 < shown.length ? shown[i + 1].x - 8 : W) - (x + 8); if (room > 20) { g.save(); g.beginPath(); g.rect(x + 7, y, room, h); g.clip(); g.font = font(9.5); g.fillStyle = e ? C.fg : C.mut; g.fillText(m.lab, x + 8, y + h - 5); g.restore(); } }
    TP.hit.push({ x0: x - 6, x1: x + 6, y0: y, y1: y + h, sky: m.sky }); });
  if (ppy < 3 && A1 > -1999) { g.font = font(9.5); g.fillStyle = C.mut; g.fillText('zoom in for eclipses, moons, equinoxes and solstices', 6, y + h - 5); }
}
function tmpCardSky(s) {
  const c = $('#tmpCard'); c.hidden = false; const y = hy(Math.floor(axOfJd(s.jd)));
  if (s.kind === 'anc') { const a = ANC.find(x => x[0] === s.k); c.innerHTML = `<div class="tch"><b>${esc(a[1])}</b><button type="button" data-tmpclose="1" aria-label="Close">✕</button></div><p class="hint">${esc(a[2])}</p>`; return; }
  const t = s.kind === 'ecl' ? eclName(s).replace(/^./, x => x.toUpperCase()) : s.kind === 'moon' ? (s.full ? 'Full moon' : 'New moon') : s.kind === 'comet' ? s.name : s.kind === 'conj' ? `${s.a} meets ${s.b}` : s.kind === 'sirius' ? 'Sirius rises before the sun' : SEASONS[s.i].replace(/^./, x => x.toUpperCase());
  const unc = y < 1000 ? ' Before about AD 1000 the hour is uncertain – the earth’s rotation slowed unevenly (ΔT, after Espenak and Meeus); before 2000 BC the eclipses are left out.' : '';
  c.innerHTML = `<div class="tch"><b>${esc(t)}</b><button type="button" data-tmpclose="1" aria-label="Close">✕</button></div>`
    + `<p>${esc(jdTxt(s.jd, true))} <small class="hint">(${y < 1583 ? 'Julian' : 'Gregorian'} calendar; hour of greatest eclipse or of the moment itself)</small></p>`
    + (s.kind === 'ecl' ? `<p class="hint">${s.sun ? (s.central === false ? 'not central – ' : '') : ''}${s.mag != null ? `magnitude ${s.mag.toFixed(2)}` : 'central'}.</p><div class="tmploc"><p class="hint small">Where it was seen …</p></div>` : '')
    + (s.kind === 'comet' ? `<p class="hint">${esc(s.note)}.</p>` : s.kind === 'conj' ? `<p class="hint">${s.a} and ${s.b} ${s.s < 0.2 ? 'almost touching' : 'close together'}: ${s.s.toFixed(2)}° apart (as seen from the earth), ${Math.round(s.el)}° from the sun${s.el < 12 ? ' – too near the sun to be seen' : ''}.</p>`
      : s.kind === 'sirius' ? `<p class="hint">The first morning Sirius was seen again before sunrise at Memphis – the start of the Nile flood and of the Egyptian “Sothic” year. At Alexandria, further north: ${(() => { const j = sirius(s.Y, [31.20, 29.92]); return j ? esc(jdTxt(j)) : '?'; })()}.</p><p class="hint small">A model, not a sighting: the sun 7.5° below the horizon, the star 1.5° above it. What the ancient sources say about the day (Censorinus for AD 139, the Canopus decree, papyri) will stand beside it as their own statements, as they are read in.</p>` : '')
    + (s.kind === 'comet' ? '' : `<p class="hint small">Computed in the app – ${s.kind === 'conj' || s.kind === 'sirius' ? 'with astronomy-engine (D. Cross)' : `after J. Meeus, Astronomical Algorithms (2nd ed. 1998), ch. ${s.kind === 'ecl' ? 54 : s.kind === 'moon' ? 49 : 27}${s.kind === 'ecl' ? '; where it was seen, with astronomy-engine (D. Cross)' : ''}`}.${unc}</p>`)
    + `<p class="tact">${s.kind === 'ecl' && s.sun ? '<button type="button" data-tmpeclmap="1">The shadow on the map</button>' : ''}<button type="button" data-tmpyear="${y}">The year in all systems</button></p>`;
  TP.skySel = s;
  if (s.kind === 'ecl') tmpAstro().then(() => { const box = c.querySelector('.tmploc'); if (!box || TP.skySel !== s) return; const L = eclLocal(s);
    box.innerHTML = `<p class="hint small"><b>Where it was seen</b> (time by the sun there):</p><ul class="tmplocl">${L.map(([n, v]) => `<li><b>${n}</b>: ${esc(v)}</li>`).join('')}</ul>`; }).catch(() => {});
}
// ---- astronomy-engine (Don Cross, MIT) for what Meeus' short formulas do not give: where an eclipse was seen, its track, the planets, Sirius
function tmpAstro() {
  if (window.Astronomy) return Promise.resolve(window.Astronomy);
  return TP.astroP ??= new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'astronomy.min.js'; s.onload = () => { ok(window.Astronomy); tmpRedraw(); }; s.onerror = no; document.head.appendChild(s); });
}
const AT = jd => window.Astronomy.MakeTime(jd - 2451545);               // (UT)
const PLACES = [['Athens', 37.97, 23.72], ['Rome', 41.89, 12.49], ['Alexandria', 31.20, 29.92], ['Syracuse', 37.07, 15.29], ['Babylon', 32.54, 44.42], ['Jerusalem', 31.78, 35.23], ['Miletus', 37.53, 27.28], ['Constantinople', 41.01, 28.98]];
function eclLocal(e) {                                    // 830a: how each place saw it (local time = time by the sun there)
  const A = window.Astronomy; if (!A) return null; const out = [];
  for (const [n, la, lo] of PLACES) { const ob = new A.Observer(la, lo, 0), lt = jd => { const c = jdToCal(jd + lo / 360); const h = c.f * 24; return `${Math.floor(h)}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; };
    try {
      if (e.sun) { const r = A.SearchLocalSolarEclipse(AT(e.jd - 1), ob); const pj = r.peak.time.ut + 2451545;
        out.push([n, Math.abs(pj - e.jd) < 1 && r.peak.altitude > 0 ? `${r.kind === 'partial' ? 'partial' : r.kind}, ${Math.round(r.obscuration * 100)}% of the sun covered, about ${lt(pj)}, the sun ${Math.round(r.peak.altitude)}° high` : 'not seen']); }
      else { const t = AT(e.jd), eq = A.Equator(A.Body.Moon, t, ob, true, true), hz = A.Horizon(t, ob, eq.ra, eq.dec, 'normal');
        out.push([n, hz.altitude > 0 ? `seen, about ${lt(e.jd)}, the moon ${Math.round(hz.altitude)}° high` : 'the moon below the horizon at the middle of the eclipse']); }
    } catch (_) { out.push([n, '?']); }
  }
  return out;
}
function eclTrack(e) {                                    // the centre of the moon's shadow on the earth, every 3 minutes
  const A = window.Astronomy, Re = 6378.137 / 149597870.7, pts = [];
  for (let m = -240; m <= 240; m += 3) { const t = AT(e.jd + m / 1440), S = A.GeoVector(A.Body.Sun, t, true), Mo = A.GeoVector(A.Body.Moon, t, true);
    let dx = Mo.x - S.x, dy = Mo.y - S.y, dz = Mo.z - S.z; const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
    const b = Mo.x * dx + Mo.y * dy + Mo.z * dz, c = Mo.x ** 2 + Mo.y ** 2 + Mo.z ** 2 - Re * Re, D = b * b - c; if (D < 0) continue;
    const s = -b - Math.sqrt(D), P = new A.Vector(Mo.x + s * dx, Mo.y + s * dy, Mo.z + s * dz, t), o = A.VectorObserver(P, false); pts.push([o.longitude, o.latitude]); }
  return pts;
}
async function tmpEclMap(e) {
  await tmpAstro(); const pts = eclTrack(e); if (pts.length < 2) return toast('The centre of the shadow does not touch the earth – a partial eclipse only.', 4000);
  toggleMapTab(true);
  setTimeout(() => { const m = M.map; if (!m) return; const segs = [[]];   // (split where it crosses the date line)
    pts.forEach((p, i) => { if (i && Math.abs(p[0] - pts[i - 1][0]) > 180) segs.push([]); segs[segs.length - 1].push(p); });
    const gj = { type: 'FeatureCollection', features: segs.filter(s => s.length > 1).map(s => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: s } })) };
    if (m.getSource('tmpEcl')) m.getSource('tmpEcl').setData(gj); else { m.addSource('tmpEcl', { type: 'geojson', data: gj });
      m.addLayer({ id: 'tmpEcl', type: 'line', source: 'tmpEcl', paint: { 'line-color': '#222', 'line-width': 3, 'line-opacity': 0.75, 'line-dasharray': [2, 1] } }); }
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); m.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 60, maxZoom: 5 });
    toast(`${eclName(e)}, ${jdTxt(e.jd)}: the centre line of the shadow (computed; before about AD 1000 it may lie some degrees east or west – ΔT)`, 6000); }, 700);
}
// 831: Halley's comet at perihelion (Sitarski 1988; Julian calendar to 1531)
const HALLEY = [[-239, 3, 30], [-163, 11, 17], [-86, 8, 2], [-11, 10, 5], [66, 1, 26], [141, 3, 22], [218, 5, 17], [295, 4, 20], [374, 2, 17], [451, 6, 24], [530, 9, 26], [607, 3, 13], [684, 10, 28], [760, 5, 22], [837, 2, 28], [912, 7, 9], [989, 9, 9], [1066, 3, 23], [1145, 4, 21], [1222, 9, 30], [1301, 10, 24], [1378, 11, 9], [1456, 6, 9], [1531, 8, 25], [1607, 10, 27], [1682, 9, 15], [1758, 3, 13], [1835, 11, 16], [1910, 4, 20], [1986, 2, 9]];
// the rising of Sirius before the sun at Memphis (the Egyptian calendar's anchor): the first morning it is seen again
function sirius(Y, pl = [29.85, 31.25]) {                // (Memphis; Alexandria: [31.20, 29.92])
  const A = window.Astronomy, key = Y + '|' + pl[0]; if (!A) return null; TP.sir ??= new Map(); if (TP.sir.has(key)) return TP.sir.get(key);
  const dy = Y - 2000, ra = 6.752477 + (-0.54601 / 3600 / Math.cos(-16.716 * D2R)) * dy / 15, dec = -16.716117 - 1.22307 / 3600 * dy;
  A.DefineStar(A.Body.Star1, ra, dec, 8.6); const ob = new A.Observer(pl[0], pl[1], 0); let seen = null, prev = true;
  for (let d = 0; d < 40; d++) { const t0 = AT(calToJd(Y, 7, 1) + d); const tw = A.SearchAltitude(A.Body.Sun, ob, +1, t0, 1, -7.5); if (!tw) continue;
    const eq = A.Equator(A.Body.Star1, tw, ob, true, true), alt = A.Horizon(tw, ob, eq.ra, eq.dec, 'normal').altitude, vis = alt >= 1.5;
    if (vis && !prev) { seen = tw.ut + 2451545; break; } prev = vis; }
  TP.sir.set(key, seen); return seen;
}
// close meetings of the planets (under 1°), year by year, computed when first in view
const PLAN = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
function conjYear(Y) {
  const A = window.Astronomy; if (!A) return null; TP.cj ??= new Map(); if (TP.cj.has(Y)) return TP.cj.get(Y);
  const j0 = calToJd(Y, 1, 1), j1 = calToJd(Y + 1, 1, 1), out = [], pos = jd => PLAN.map(p => A.GeoVector(p, AT(jd), true)), sep = (jd, a, b) => A.AngleBetween(A.GeoVector(a, AT(jd), true), A.GeoVector(b, AT(jd), true));
  const st = []; for (let jd = j0 - 4; jd < j1 + 4; jd += 2) st.push([jd, pos(jd)]);       // (all five every second day, then each pair)
  for (let i = 0; i < 5; i++) for (let k = i + 1; k < 5; k++) { const s = st.map(([jd, P]) => A.AngleBetween(P[i], P[k]));
    for (let n = 1; n < s.length - 1; n++) if (s[n] < s[n - 1] && s[n] <= s[n + 1] && s[n] < 2) { const a = PLAN[i], b = PLAN[k]; let lo = st[n - 1][0], hi = st[n + 1][0];
      for (let r = 0; r < 16; r++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (sep(m1, a, b) < sep(m2, a, b)) hi = m2; else lo = m1; }
      const tj = (lo + hi) / 2, sp = sep(tj, a, b); if (sp < 1 && tj >= j0 && tj < j1) out.push({ jd: tj, a, b, s: sp, el: A.AngleFromSun(a, AT(tj)) }); } }
  TP.cj.set(Y, out); return out;
}
function drawSky2(g, C, y, h, W, X, A0, A1, font) {
  const ppy = TP.ppy, cy = y + h / 2 + 1, mk = [];
  for (const [yy, m, d] of HALLEY) { const jd = calToJd(yy, m, d), a = axOfJd(jd); if (a < A0 - 1 || a > A1 + 1) continue;
    mk.push({ x: X(a), pr: 0, kind: 'comet', lab: ppy >= 2 ? 'Halley’s comet' : '', sky: { kind: 'comet', jd, name: 'Halley’s comet', note: 'at its nearest to the sun (perihelion), after Sitarski (1988); it was seen for some weeks around this' } }); }
  const A = window.Astronomy; if (!A && ppy >= 15) tmpAstro();
  if (A && ppy >= 15 && A1 - A0 < 60) { let n = 0;
    for (let Y = Math.floor(A0); Y <= Math.floor(A1); Y++) {
      if (!TP.cj?.has(Y) && n++ > 1) { TP.moving = true; continue; }           // (a year or two per frame: the rest on the next ones)
      for (const c of conjYear(Y)) { const a = axOfJd(c.jd); if (a < A0 || a > A1) continue;
        mk.push({ x: X(a), pr: c.el < 12 ? 3 : 1, kind: 'conj', lab: ppy >= 300 ? `${c.a} and ${c.b}` : '', sky: Object.assign({ kind: 'conj' }, c) }); }
      if (Y >= -2500 && Y <= 2100) { if (!TP.sir?.has(Y + '|29.85') && n++ > 1) { TP.moving = true; continue; }
        const j = sirius(Y); if (j) { const a = axOfJd(j); if (a >= A0 && a <= A1) mk.push({ x: X(a), pr: 2, kind: 'sirius', lab: ppy >= 300 ? 'Sirius rises (Memphis)' : '', sky: { kind: 'sirius', jd: j, Y } }); } }
    } }
  const shown = []; for (const m of mk.sort((p, q) => p.pr - q.pr)) { if (m.x < -8 || m.x > W + 8 || shown.some(s => Math.abs(s.x - m.x) < 11)) continue; shown.push(m); }
  shown.sort((p, q) => p.x - q.x);
  shown.forEach((m, i) => { const x = m.x;
    if (m.kind === 'comet') { g.fillStyle = C.acc2; g.beginPath(); g.arc(x, cy, 3.5, 0, 7); g.fill(); g.strokeStyle = C.acc2; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x - 3, cy - 1); g.lineTo(x - 13, cy - 5); g.moveTo(x - 3, cy + 1); g.lineTo(x - 12, cy + 2); g.stroke(); }
    else if (m.kind === 'conj') { g.fillStyle = '#c08a2b'; g.globalAlpha = m.pr === 3 ? 0.45 : 1; g.beginPath(); g.arc(x - 2.5, cy, 2.6, 0, 7); g.arc(x + 2.5, cy, 2.6, 0, 7); g.fill(); g.globalAlpha = 1; }
    else { g.fillStyle = '#4a74b8'; g.beginPath(); for (let k = 0; k < 8; k++) { const r = k % 2 ? 1.6 : 5, an = k * Math.PI / 4; g.lineTo(x + r * Math.cos(an), cy + r * Math.sin(an)); } g.closePath(); g.fill(); }
    if (m.lab) { const room = (i + 1 < shown.length ? shown[i + 1].x - 8 : W) - (x + 8); if (room > 20) { g.save(); g.beginPath(); g.rect(x + 7, y, room, h); g.clip(); g.font = font(9.5); g.fillStyle = C.mut; g.fillText(m.lab, x + 8, y + h - 5); g.restore(); } }
    TP.hit.push({ x0: x - 6, x1: x + 6, y0: y, y1: y + h, sky: m.sky }); });
  if (ppy < 15) { g.font = font(9.5); g.fillStyle = C.mut; const s = 'zoom in for the planets and Sirius'; const tw = g.measureText(s).width; g.fillText(s, Math.max(6, W - tw - 190), y + h - 5); }
}
// 834a: the seasons – summer and winter fading into each other behind the lanes (warmest about a month after the summer solstice,
// coldest a month after the winter one, as in the Mediterranean), and the seasons the ancient authors reckon by
const WARM = [214, 140, 60], COOL = [70, 120, 200];
function seasonTint(g, X, A0, A1, top, W, H) {
  const f = Math.min(1, Math.max(0, (TP.ppy - 25) / 60)); if (!f) return;                 // (it comes in as the months open up)
  const step = 3, sum = Y => ut(seasonJde(Y, 1), Y) + 30;
  let Y = Math.floor(A0), s0 = sum(Y), s1 = sum(Y + 1);
  for (let x = 0; x < W; x += step) { const jd = jdOfAx(TP.x0 + (x + step / 2) / TP.ppy); while (jd > s1) { Y++; s0 = s1; s1 = sum(Y + 1); } while (jd < s0) { Y--; s1 = s0; s0 = sum(Y); }
    const w = Math.cos(2 * Math.PI * (jd - s0) / (s1 - s0)), c = w > 0 ? WARM : COOL;
    g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${(Math.abs(w) * 0.085 * f).toFixed(3)})`; g.fillRect(x, top, step, H - top); }
}
const ANC = [
  ['thuc', 'Thucydides’ war year', 'Thucydides counts the war by summers and winters (2.1; 5.20): the summer from about the beginning of spring, the winter from about the setting of the Pleiades in early November. Here: from the spring equinox, and from 8 November – approximately; the exact boundaries are disputed.'],
  ['hes', 'Hesiod: the time to sail', 'Hesiod, Works and Days 663–665: “fifty days after the turning of the sun” in summer is the time for sailing – then the sea is gentle; hurry home before the new wine and the autumn rains. Here: from 50 to 90 days after the summer solstice.'],
  ['veg', 'Vegetius: the sea open, doubtful, closed', 'Vegetius, Epitome of Military Science 4.39: safe from the rising of the Pleiades (27 May) to the rising of Arcturus (14 September); doubtful from then to 11 November and from 10 March to 27 May; closed from 11 November to 10 March (Julian calendar).'],
];
function drawAncient(g, C, y, h, W, X, A0, A1, font) {
  const ppy = TP.ppy, bh = 8, rows = [y + 2, y + 11.5, y + 21];
  if (ppy < 20) { g.font = font(9.5); g.fillStyle = C.mut; g.fillText('zoom in for the seasons of Thucydides, Hesiod and Vegetius', 6, y + 19); return; }
  const band = (r, a, b, col, alpha, lab, key) => { const x0 = X(a), x1 = X(b); if (x1 < 0 || x0 > W) return; g.fillStyle = col; g.globalAlpha = alpha; g.fillRect(x0, rows[r], x1 - x0, bh); g.globalAlpha = 1;
    if (lab && x1 - Math.max(x0, 0) > 60) { g.save(); g.beginPath(); g.rect(Math.max(x0, 0), rows[r] - 1, x1 - Math.max(x0, 0), bh + 2); g.clip(); g.font = font(8.5); g.fillStyle = C.fg; g.fillText(lab, Math.max(x0, 0) + 3, rows[r] + 7); g.restore(); }
    TP.hit.push({ x0, x1, y0: rows[r] - 1, y1: rows[r] + bh + 1, sky: { kind: 'anc', k: key } }); };
  const warm = `rgb(${WARM})`, cool = `rgb(${COOL})`;
  for (let Y = Math.floor(A0) - 1; Y <= Math.ceil(A1); Y++) {
    const eq = axOfJd(ut(seasonJde(Y, 0), Y)), pl = axOfJd(calToJd(Y, 11, 8)), eqn = axOfJd(ut(seasonJde(Y + 1, 0), Y + 1)), sol = ut(seasonJde(Y, 1), Y);
    band(0, eq, pl, warm, 0.55, 'summer (Thucydides)', 'thuc'); band(0, pl, eqn, cool, 0.45, 'winter (Thucydides)', 'thuc');
    band(1, axOfJd(sol + 50), axOfJd(sol + 90), '#3f8f8a', 0.6, 'Hesiod: sail now', 'hes');
    const v = (m, d) => axOfJd(calToJd(Y, m, d));
    band(2, v(3, 10), v(5, 27), '#3f8f8a', 0.3, 'doubtful', 'veg'); band(2, v(5, 27), v(9, 14), '#3f8f8a', 0.65, 'the sea open (Vegetius)', 'veg');
    band(2, v(9, 14), v(11, 11), '#3f8f8a', 0.3, 'doubtful', 'veg'); band(2, v(11, 11), axOfJd(calToJd(Y + 1, 3, 10)), C.mut, 0.3, 'the sea closed', 'veg');
  }
}

// 832a: the Roman calendar – Kalends, Nones, Ides (Julian calendar from 45 BC; before it the Republican calendar ran differently)
const RMON = ['Ian.', 'Feb.', 'Mart.', 'Apr.', 'Mai.', 'Iun.', 'Iul.', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const RMONN = ['Ianuarius', 'Februarius', 'Martius', 'Aprilis', 'Maius', 'Iunius', 'Iulius', 'Augustus', 'September', 'October', 'November', 'December'];
const ROMN2 = n => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX'][n] || String(n);
function romMonth(y, m, full) { const old = m === 7 && y < -43 ? ['Quinct.', 'Quinctilis'] : m === 8 && y < -7 ? ['Sext.', 'Sextilis'] : [RMON[m - 1], RMONN[m - 1]]; return full ? old[1] : old[0]; }
function romDay(y, m, d) {                              // (y astronomical, Julian calendar)
  const big = [3, 5, 7, 10].includes(m), N = big ? 7 : 5, I = big ? 15 : 13, leap = y % 4 === 0;
  if (d === 1) return 'Kal. ' + romMonth(y, m);
  if (d === N) return 'Non. ' + romMonth(y, m); if (d === I) return 'Id. ' + romMonth(y, m);
  if (d < N) return (d === N - 1 ? 'pr.' : `a.d. ${ROMN2(N - d + 1)}`) + ' Non. ' + romMonth(y, m);
  if (d < I) return (d === I - 1 ? 'pr.' : `a.d. ${ROMN2(I - d + 1)}`) + ' Id. ' + romMonth(y, m);
  const nm = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y, len = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  let n = len - d + 2; if (m === 2 && leap) { if (d === 25) return 'a.d. bis VI Kal. ' + romMonth(ny, nm); n = d < 25 ? 30 - d : 31 - d; }   // (the doubled 24 February)
  return (n === 2 ? 'pr.' : `a.d. ${ROMN2(n)}`) + ' Kal. ' + romMonth(ny, nm);
}
function drawRoman(g, C, y, h, W, X, A0, A1, font, cell) {
  const ppy = TP.ppy;
  if (A1 < -44) { g.font = font(9.5); g.fillStyle = C.mut; g.fillText('before 45 BC the Roman year ran ahead of or behind these dates – its reconstruction is not in Pult yet', 6, y + h - 5); return; }
  if (ppy < 150) { g.font = font(9.5); g.fillStyle = C.mut; g.fillText('zoom in for the months and days', Math.max(6, X(-44) + 6), y + h - 5); return; }
  if (ppy < 6000) { for (const c of julCells(A0, A1, ppy)) { const cc = jdToCal(jdOfAx(c.a + 1e-9)); if (cc.y < -44) continue; cell(c.a, c.b, romMonth(cc.y, cc.m, ppy >= 600), false); } return; }
  for (const c of julCells(A0, A1, Math.min(ppy, 149999))) { const cc = jdToCal(jdOfAx(c.a + 1e-9)); if (cc.y < -44) continue; const lab = romDay(cc.y, cc.m, cc.d), key = /^(Kal|Non|Id)\./.test(lab);
    cell(c.a, c.b, ppy >= 40000 || key ? (ppy >= 40000 ? lab : lab.replace(/ \S+$/, '')) : '', key); }
}
// 832b: the Athenian months – the year begins with the first new moon after the summer solstice; a month with the first crescent
// (about a day and a half after the new moon); a 13th month (Poseideon II) when the year has 13. Computed – the archons often did otherwise.
const ATT = ['Hekatombaion', 'Metageitnion', 'Boedromion', 'Pyanepsion', 'Maimakterion', 'Poseideon', 'Gamelion', 'Anthesterion', 'Elaphebolion', 'Mounichion', 'Thargelion', 'Skirophorion'];
function atticYear(Y) {
  TP.att ??= new Map(); if (TP.att.has(Y)) return TP.att.get(Y);
  const start = Y => { const s = ut(seasonJde(Y, 1), Y); let k = Math.ceil(kOfJd(s)); let nm = ut(moonPhase(k).jde, Y); if (nm < s) nm = ut(moonPhase(++k).jde, Y); return { k, jd: nm }; };
  const a = start(Y), b = start(Y + 1), n = b.k - a.k, ms = [];
  for (let i = 0; i < n; i++) { const k = a.k + i, j = Math.floor(ut(moonPhase(k).jde, Y) + 1.5 - 0.5) + 0.5, j2 = Math.floor(ut(moonPhase(k + 1).jde, Y) + 1.5 - 0.5) + 0.5;
    const nm = n === 13 ? (i < 6 ? ATT[i] : i === 6 ? 'Poseideon II' : ATT[i - 1]) : ATT[i]; ms.push({ j, j2, nm }); }
  TP.att.set(Y, ms); return ms;
}
function drawAttic(g, C, y, h, W, X, A0, A1, font, cell) {
  const ppy = TP.ppy; if (A1 < -700 || A0 > 401) return; if (ppy < 40) { g.font = font(9.5); g.fillStyle = C.mut; g.fillText('zoom in for the Athenian months', Math.max(6, X(-700) + 6), y + h - 5); return; }
  for (let Y = Math.max(-700, Math.floor(A0) - 1); Y <= Math.min(400, Math.ceil(A1)); Y++) for (const m of atticYear(Y)) { const a = axOfJd(m.j), b = axOfJd(m.j2); if (b < A0 || a > A1) continue;
    const lab = ppy >= 1200 ? m.nm : ppy >= 300 ? m.nm.slice(0, m.nm === 'Poseideon II' ? 99 : 4) + (m.nm === 'Poseideon II' ? '' : '.') : '';
    if (ppy >= 6000 && ppy < 150000) { for (let d = m.j, n = 1; d < m.j2 && n < 31; d++, n++) cell(axOfJd(d), axOfJd(d + 1), n === 1 ? lab || m.nm : String(n), n === 1); }
    else cell(a, b, lab, m.nm === 'Hekatombaion'); }
}

// the Julian calendar under the year: months, days, hours as you zoom in
function julCells(A0, A1, ppy) {
  const out = [], j0 = jdOfAx(A0), j1 = jdOfAx(A1);
  if (ppy < 6000) { let { y, m } = jdToCal(j0);
    for (let n = 0; n < 400; n++) { const a = axOfJd(calToJd(y, m, 1)), ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1, b = axOfJd(calToJd(ny, nm, 1));
      if (a > A1) break; out.push({ a, b, lab: m === 1 ? `Jan ${yTxtS(hy(y))}` : MON[m - 1], strong: m === 1 }); y = ny; m = nm; } }
  else if (ppy < 150000) for (let d = Math.floor(j0 - 0.5) + 0.5, n = 0; d < j1 && n < 800; d++, n++) { const c = jdToCal(d); out.push({ a: axOfJd(d), b: axOfJd(d + 1), lab: c.d === 1 ? `1 ${MON[c.m - 1]}` : String(c.d), strong: c.d === 1 }); }
  else for (let h = Math.floor((j0 - 0.5) * 24) / 24 + 0.5, n = 0; h < j1 && n < 800; h += 1 / 24, n++) { const c = jdToCal(h + 1e-6), hr = Math.round(c.f * 24) % 24;
    out.push({ a: axOfJd(h), b: axOfJd(h + 1 / 24), lab: hr === 0 ? `${c.d} ${MON[c.m - 1]}` : hr + 'h', strong: hr === 0 }); }
  return out;
}

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
// when the works that have lanes were written (814a+b): [work id prefix, from, to, label, note, vague, source]. Two sources side by side:
// the usual dates of today's handbooks (a first table, by hand) and what Smith's Dictionary (1849) says – the sentences its articles
// give, found by a search of the articles for writing, composing, publishing, dedicating with a year, and read by hand.
const SM = 'Smith’s Dictionary: ';
const COLL = [['phi2331', 'Scriptores Historiae Augustae', 'Hist. Aug.', 'Historia Augusta'], ['phi1348.abo', 'Suetonius', 'Suetonius', 'De vita Caesarum']];   // (856a: lane = author, bar = the work)
// 992a, 1010a: when the works were written – statements in the toolkit (tempora-persons, bucket "wr": on W-<work>), each with its
// source's own words: the handbooks (Teuffel–Schwabe, Schanz, Christ), Smith's Dictionary, what the work itself claims, and the
// views a handbook reports (Dessau, Mommsen …). Here they become rows: [work, from, to (null: open), label, words and place,
// vague, source, short label, the statement]
const WSRC = [['teuffel', 'Teuffel–Schwabe (1892)'], ['schanz', 'Schanz (1914)'], ['christ', 'Christ (1898)'], ['claim', 'What the work claims'], ['smith', 'Smith’s Dictionary (1849)']];
const WSRCT = { teuffel: 'Teuffel–Schwabe, History of Roman Literature, tr. Warr, II (1892) ', schanz: 'Schanz, Geschichte der römischen Litteratur IV 1² (1914) ', christ: 'W. Christ, Geschichte der griechischen Litteratur³ (1898) ' };
let WRITTEN = [];
async function tmpWritten() {
  const d = tsPkg(); const r = d ? await pplRec(d, 'wr').catch(() => null) : null; const out = [];
  for (const [w, cs] of Object.entries(r?.e || {})) for (const c of cs) {
    const t = c.t || {}, e = c.e || [], claim = c.k === 'work:text', so = claim ? 'claim' : e[0];
    const where = e[0] === 'smith' ? `${SM}${e[1]} ${e[2]}: ` : e[0] === 'texts' ? `${e[2]}: ` : `${WSRCT[e[0]] || ''}${e[2]}: `;
    const note = `${where}“${e[3] || ''}”${c.n ? ' – ' + c.n : ''}${c.w?.[1] ? ` (the view of ${c.w[0]}, reported there)` : ''}${c.st === 'rejects' ? ' – Smith rejects this' : ''}`;
    const short = claim ? 'written (as it claims)' : c.w?.[1] ? c.w[0] : e[0] === 'smith' ? (/ to /.test(t.orig || '') ? t.orig.replace(/^Smith: (inscribed |addressed )?/, 'Smith: ').replace(/ – .*$/, '') : 'Smith') : (WSRC.find(x => x[0] === so)?.[1] || so).replace(/ \(.*$/, '').replace(/–Schwabe/, '');
    out.push([w, hy(t.lo), t.open === 'hi' ? null : hy(t.hi - 1), t.orig || '', note, t.w === 'triangular', so, short + (c.st === 'rejects' ? ' (rejected)' : ''), c]); }
  WRITTEN = out; return out;
}
async function tmpPersonIts(ref, F, works = new Map(), wTitle = id => id) {    // a person's items: life, offices, Diogenes' dates, passages citing him
  const TS = await tsPerson(ref); if (TS) return TS;                                // (read from the texts: the statements – tempora-persons)
  const { d, i } = pplParse(ref); if (!d) return null; const r = await pplRow(d, i); if (!r) return null;
  const its = [];
  if (r.y0 != null) its.push({ t0: ax(r.y0), t1: ax(r.y1 ?? r.y0) + 1, fa: true, fb: true, lab: 'years the article mentions', kind: 'life', k2: 'life', sid: d.id, src: d.name, ref });
  for (const o of F?.off.get(ref) || []) {
    if (o[0] === 'emp') { const e = F.k[o[1]]; if (!e) continue;
      if (e[6] != null && e[6] < e[4]) its.push({ t0: ax(e[6]), t1: ax(Math.min(e[4], e[5] + 1)), lab: 'Caesar', kind: 'office', k2: 'office', sid: 'liebenam', src: 'Liebenam', ref });
      if (e[7] !== 'C') its.push({ t0: ax(e[4]), t1: ax(e[5]) + 1, lab: (e[7] === 'U' ? 'usurper ' : 'emperor ') + e[2] + ' – ' + e[3], kind: 'office', k2: 'office', sid: 'liebenam', src: 'Liebenam', ref }); }
    if (o[0] === 'cos') its.push({ t0: ax(o[1]), t1: ax(o[1]) + 1, lab: 'consul' + (o[2] > 1 ? ' ' + ROMN(o[2]) : '') + (o[3] === 's' ? ' suff.' : ''), kind: 'office', k2: 'office', sid: 'liebenam', src: 'Liebenam', ref, link: 'cos:' + o[1] });
  }
  if (!TP.chrono) { const ch = Object.values(S.installed || {}).find(d => d.kind === 'chrono'); TP.chrono = ch ? (await pplRec(ch, '#s'))?.e || [] : []; }
  for (const x of TP.chrono || []) if (x[6]?.ref === ref) {     // 799a: what Diogenes Laertius dates in his life
    its.push({ t0: x[1], t1: x[2], fa: !x[6].ol?.[1], fb: !x[6].ol?.[1], lab: `${x[6].kind || 'dated'} · Ol. ${x[6].ol[0]}${x[6].ol[1] ? '.' + x[6].ol[1] : ''}`, kind: 'cite', k2: 'ol', sid: 'diogenes', src: 'Diogenes Laertius' + (x[6].sure ? '' : ' (the life probably his)'),
      go: { w: x[6].w, bi: x[4], r: x[5] }, text: x[6].text, ref, ev: x[6].ev || null }); }
  const e = await pplEntry(d, i);                         // the passages citing him, placed where their book's years are known
  for (const p of e?.ps || []) { const m = F?.nd?.[p[0]]; if (!m) continue; const lab = (works.get(p[0]) || S.catWork?.[p[0]])?.books?.[p[1]];
    const yy = m[lab] || m['*']; if (!yy) continue;
    its.push({ t0: ax(yy[0]), t1: ax(yy[1]) + 1, fa: true, fb: true, lab: p[3], kind: 'cite', k2: 'cite', sid: d.id, src: wTitle(p[0]), go: { w: p[0], bi: p[1], r: p[2] }, ref, note: 'cited by ' + d.name + ' – placed at the years its book narrates' }); }
  return { r, its };
}
// ---------------------------------------------------------------- persons read from the texts (tempora-persons, kind "tstmt")
// Every statement about a person, as the readers wrote it down from Smith and from the texts, with its words and its witness. The
// data stay as they are; what is drawn here is only their presentation: the life bar estimated from them (and explained), each
// dated statement as a bar or mark, the witness's colour (an ancient text – filled; Smith – lighter), a violent end red.
const tsPkg = () => Object.values(S.installed || {}).find(d => d.kind === 'tstmt' && !S.dictPrefs?.off?.includes(d.id)) || null;
async function tsIx() { const d = tsPkg(); return d ? await pplRec(d, '#ix') : null; }
const tsPid = n => 'P-' + String(n).padStart(6, '0');
const tsName = n => String(n || '').replace(/>/g, '').replace(/\b([IVX])([ivx]+)\./g, (m, a, b) => a + b.toUpperCase() + '.').replace(/\s+/g, ' ').trim();   // ("Flavius Julius> Constantius Ii." → "… Constantius II.")
async function tsRefP(ref) {                                   // 'people-smith|4781' or 'tp|P-019460' -> the person record P-…
  const ix = await tsIx(); if (!ix) return null;
  let P = ref.startsWith('tp|') ? ref.slice(3) : ref.startsWith('people-smith|') ? tsPid(+ref.split('|')[1]) : null;
  if (P && !ix.p[P] && ix.same?.[P]) P = ix.same[P];              // (987a: a cross-reference stands for its main article)
  return P && ix.p[P] ? P : null;
}
async function tsStatements(P) { const d = tsPkg(); if (!d) return null; const r = await pplRec(d, 'p:' + (+P.slice(2) >> 6)); return r?.e?.[P] || null; }
const TSV = v => TS_IX?.vocab?.[v] || String(v).replace(/^[a-z]+:/, '').replace(/-/g, ' ');
let TS_IX = null;
// 1044a: a detail that begins with the office's own word (“comes (defending Seleucia …)” under “count (comes)”) – that word only once.
// Presentation only: the statement keeps its words (917)
function tsDedup(id, cl, det) {
  const low = s => s.toLowerCase(), slug = id.replace(/^[a-z]+:/, '').replace(/-/g, ' '), d = det.trim();
  const after = (t) => { const r = d.slice(t.length).replace(/^[\s,:–-]+/, ''); const m = r.match(/^\((.*)\)$/); return m ? m[1] : r; };
  if (low(d).startsWith(low(slug)) && (d.length === slug.length || /[\s,(]/.test(d[slug.length]))) {
    if (!low(cl).includes(low(slug))) cl += ' (' + slug + ')'; return [cl, after(slug)]; }
  const w = d.match(/^[^\s,(]+/)?.[0]; if (w && low(cl).match(/[a-zà-ÿ]+/g)?.includes(low(w))) return [cl, after(w)];
  return [cl, d];
}
function tsVal(v) {                                             // a value as words
  if (v == null) return '';
  if (typeof v === 'string') return /^[a-z]+:/.test(v) ? TSV(v) : v.startsWith('P-') ? tsName(TS_IX?.p?.[v]?.[0] || v) : v;
  if (typeof v !== 'object') return String(v);
  const parts = [];
  let det = v.detail;
  if (v.concept) { let cl = TSV(v.concept); if (det) [cl, det] = tsDedup(v.concept, cl, det); parts.push(cl); } if (v.name) parts.push(tsName(v.P && TS_IX?.p?.[v.P] ? TS_IX.p[v.P][0] : v.name)); if (v.title) parts.push('“' + v.title + '”');
  if (v.event) parts.push(v.event); if (v.age != null) parts.push('aged ' + v.age); if (det) parts.push(det); if (v.iter) parts.push('(' + v.iter + ')');
  if (v.gen) parts.push(v.gen === 2 ? '' : `(${v.gen} generations)`); if (v.list) parts.push(v.list.join('; ')); if (v.text) parts.push(v.text); if (v.place) parts.push(v.place);
  if (v.kind && v.name) parts.push(`(${v.kind})`); if (v.reading) parts.push(`– read: ${v.reading.orig || v.reading.y}`);
  return parts.filter(Boolean).join(' ');
}
const TS_PL = { kind: 'kind', gender: 'gender', origin: 'origin', citizenship: 'citizen of', 'place-born': 'born at', 'place-active': 'at', 'place-died': 'died at', 'place-buried': 'buried at',
  role: '', office: '', reign: 'reigned', born: 'born', died: 'died', floruit: 'flourished', attested: 'attested', 'age-at': 'age', 'death-manner': 'death', phase: '', honour: '', 'took-part': '',
  wrote: 'wrote', 'wrote-against': 'wrote against', killed: 'killed', 'killed-by': 'killed by', name: 'name', character: 'character', school: 'school', family: 'family', status: '', religion: '',
  sources: 'sources', issue: 'problem in the source', varro: 'Varro', see: 'see', 'same-person': 'same person as', 'influenced-by': 'drew on', ancestor: 'ancestor of', descendant: 'descendant of' };
const tsLab = c => { const l = TS_PL[c.p] ?? TS_IX?.vocab?.['prop:' + c.p]; const v = tsVal(c.v); return l == null ? (c.p.replace(/-/g, ' ') + (v ? ': ' + v : '')) : l ? (l + (v ? (c.p === 'age-at' || /\b(of|by|at|against|to|from|with)$/.test(l) ? ' ' : ': ') + v : '')) : v; };
const tsWit = c => c.w?.[0] || '';
const tsAncient = c => c.e?.[0] === 'texts';                       // (the witness is an ancient text itself)
function tsTime(c) {                                             // → [t0, t1, fuzzy start, fuzzy end] on the axis, or null
  const t = c.tr || c.t; if (!t || t.rel) return null;
  let a = t.lo ?? t.start?.lo, b = t.hi ?? t.end?.hi;
  if (a == null && b == null) return null;
  let fa = false, fb = false;
  if (a == null) { a = b - 5; fa = true; } if (b == null) { b = a + 5; fb = true; }
  if (t.open === 'lo') fa = true; if (t.open === 'hi') fb = true; if (t.w === 'triangular') { fa = fb = true; }
  return [a, b, fa, fb];
}
async function tsPerson(ref) {
  const P = await tsRefP(ref); if (!P) return null;
  TS_IX = await tsIx(); const L = await tsStatements(P); if (!L?.length) return null;
  const row = TS_IX.p[P], its = [], name = row[0];
  const dated = L.map(c => ({ c, tm: tsTime(c) })).filter(x => x.tm && !['issue', 'sources', 'varro', 'stance'].includes(x.c.p));
  for (const { c, tm } of dated) {
    if (c.st === 'rejects') continue;                              // (a view the witness rejects: in the card, not on the bar)
    its.push({ t0: tm[0], t1: Math.max(tm[1], tm[0] + 0.25), fa: tm[2], fb: tm[3], lab: (c.alt ? 'another view: ' : '') + tsLab(c), alt: !!c.alt, kind: 'st', k2: 'st', sid: c.e?.[0] || 'smith', st: c, P, ref,
      anc: tsAncient(c), src: tsWit(c) + (c.w?.[1] ? ' – via ' + c.w[1] : ''), note: c.n || '', read: !!c.tr });
  }
  // the life: estimated (and said so) from what the statements give
  const one = p => dated.filter(x => x.c.p === p && x.c.st !== 'rejects' && !x.c.alt).sort((x, y) => (y.c.c ?? .8) - (x.c.c ?? .8) || (tsAncient(y.c) - tsAncient(x.c)))[0];
  const born = one('born'), died = one('died'), ages = L.filter(c => c.p === 'age-at' && c.v?.age != null && /death|died/i.test(JSON.stringify(c.v) + (c.e?.[3] || '')));
  const why = []; let a = null, b = null, fa = false, fb = false;
  if (died) { b = died.tm[1]; why.push('died ' + (died.c.t?.orig || rangeTxt(died.tm[0], died.tm[1])) + ' (' + tsWit(died.c) + ')'); }
  if (born) { a = born.tm[0]; why.push('born ' + (born.c.t?.orig || rangeTxt(born.tm[0], born.tm[1])) + ' (' + tsWit(born.c) + ')'); }
  else if (died && ages.length) { a = died.tm[0] - ages[0].v.age; fa = true; why.push(`born worked back from the age at death, ${ages[0].v.age}`); }
  const act = dated.filter(x => !['born', 'died'].includes(x.c.p) && x.c.p !== 'same-person' && !x.c.alt && x.c.st !== 'rejects'), mn = act.length ? Math.min(...act.map(x => x.tm[0])) : null, mx = act.length ? Math.max(...act.map(x => x.tm[1])) : null;
  if (a == null && mn != null) { a = mn - 18; fa = true; why.push('start: 18 years before the first dated activity (no birth given)'); }
  if (b == null && mx != null) { b = mx + 5; fb = true; why.push('end: after the last dated activity (no death given)'); }
  const lv = TS_IX.life?.[P];                                       // (the toolkit's estimate – the same rules, and activities after a death given left out)
  if (lv) { [a, b] = lv; fa = !!lv[2]; fb = !!lv[3]; why.length = 0; why.push(lv[8]); }
  if (a != null && b != null && b > a) {
    const dm = L.filter(c => c.p === 'death-manner' && c.st !== 'rejects').map(c => c.v), blood = lv ? !!lv[4] : dm.includes('death:violent') || dm.includes('death:suicide');
    const life = { t0: a, t1: b, fa, fb, lab: tsName(name), kind: 'life', k2: 'life', sid: 'tempora-persons', P, ref, life: true, blood, dm, src: 'estimated from the statements', note: why.join(' · '), lv: 0,
      segs: lv?.[5] || [], roles: lv?.[6] || [], wit: lv?.[7] || [], ticks: lv?.[9] || [], sts: L, nojoin: !!lv?.[10]?.nojoin, alts: lv?.[10]?.alts || null };
    for (const i of its) { i.lv = 1; i.par = life; } life.kids = its.slice(); its.unshift(life);   // (zoomed out: the life; pinched apart: every statement)
  }
  return { r: { name: tsName(name), ref }, its, P, levels: its[0]?.lv === 0 };
}
function tsCard(it) {                                            // the card of one statement: what, when, whose words, which source
  const c = it.st, e = c.e || [], wit = c.w || [];
  const tm = tsTime(c), when = c.t?.orig ? esc(c.t.orig) + (tm ? ` <small class="hint">(${esc(rangeTxt(tm[0], tm[1]))})</small>` : '') : tm ? esc(rangeTxt(tm[0], tm[1])) : '';
  const srcTxt = e[0] === 'texts' ? `${esc(wit[0] || '')}, ${esc(e[2] || '')}` : `Smith, Dictionary (1849), ${esc(e[1] || '')}${e[2] ? ' · ' + esc(e[2]) : ''}`;
  const st = c.st ? `<p><b>${{ accepts: 'Smith accepts this view', doubts: 'Smith doubts this view', rejects: 'Smith rejects this view' }[c.st] || c.st}</b></p>` : '';
  return `<p>${when}${c.tr ? ` <small class="tsread">read: ${esc(c.tr.why)}</small>` : ''}</p>`
    + (wit[0] && wit[0] !== 'Smith' && e[0] !== 'texts' ? `<p>The view of <b>${esc(wit[0])}</b>${wit[1] ? `, reported by ${esc(wit[1])}` : ''}</p>` : '') + st
    + (e[3] ? `<blockquote class="tsq">${esc(e[3])}</blockquote>` : '')
    + `<p class="hint small">${srcTxt}${e[4]?.length ? ' · cites ' + e[4].map(esc).join('; ') : ''}${c.b ? ' · basis: ' + esc(TSV(c.b)) : ''}${c.c != null ? ' · confidence ' + c.c : ''}</p>`
    + (c.r?.length ? `<p class="hint small">${c.r.map(r => esc(r[0] + ' ' + r[1] + (r[2] ? ' (block)' : ''))).join(' · ')}</p>` : '')
    + (c.inf ? `<p class="hint small"><b>inferred</b> – not stated in words</p>` : '') + (c.n ? `<p class="hint small">${esc(c.n)}</p>` : '')
    + (c.alt ? `<p class="hint small"><b>another view</b> – not used for the life (1058a)</p>` : '') + (c.rv ? `<p class="hint small">checked: ${esc(c.rv)}</p>` : '');
}
// 999a: a person's panel at the side – who, when (estimated, with the reason), an overview composed by rule from the statements
// (each fact linked to its statement), the statements by section, the sources; below, folded, the encyclopaedias as in the Suda tab
const TS_ORDER = ['kind', 'name', 'gender', 'origin', 'citizenship', 'family', 'status', 'born', 'place-born', 'died', 'place-died', 'place-buried', 'death-manner', 'killed-by', 'age-at', 'reign', 'office', 'role', 'honour', 'phase',
  'floruit', 'attested', 'took-part', 'place-active', 'parent', 'child', 'spouse', 'sibling', 'grandparent', 'grandchild', 'ancestor', 'descendant', 'uncle-aunt', 'nephew-niece', 'cousin', 'parent-in-law', 'child-in-law', 'sibling-in-law',
  'step-parent', 'step-child', 'adoptive-parent', 'adoptive-child', 'partner', 'teacher', 'pupil', 'school', 'influenced-by', 'colleague', 'ally', 'opponent', 'killed', 'patron', 'client', 'associate', 'correspondent',
  'wrote', 'wrote-against', 'religion', 'character', 'varro', 'same-person', 'see', 'issue', 'sources'];
const TS_SEC = [['life', 'Life'], ['fam', 'Family and associates'], ['off', 'Offices'], ['works', 'Works'], ['char', 'Character'], ['prob', 'Problems'], ['src', 'Sources']];
const TS_SECOF = c => ['reign', 'office'].includes(c.p) ? 'off' : ['wrote', 'wrote-against'].includes(c.p) ? 'works' : c.p === 'character' ? 'char'
  : ['issue', 'varro'].includes(c.p) || c.st === 'rejects' || c.st === 'doubts' ? 'prob' : ['sources', 'see', 'same-person'].includes(c.p) ? 'src'
  : ['family', 'parent', 'child', 'spouse', 'sibling', 'grandparent', 'grandchild', 'ancestor', 'descendant', 'uncle-aunt', 'nephew-niece', 'cousin', 'parent-in-law', 'child-in-law', 'sibling-in-law', 'step-parent', 'step-child',
     'adoptive-parent', 'adoptive-child', 'partner', 'teacher', 'pupil', 'colleague', 'ally', 'opponent', 'patron', 'client', 'associate', 'correspondent', 'influenced-by', 'killed', 'killed-by'].includes(c.p) ? 'fam' : 'life';
const tsWitCls = c => tsAncient(c) ? 'anc' : (c.w?.[0] && c.w[0] !== 'Smith') ? 'rep' : String(c.m || '').startsWith('helper:') ? 'smith' : 'rule';
const tsWitBadge = c => { const k = tsWitCls(c);
  return `<span class="tswit ${k}">${esc(k === 'anc' ? (c.w?.[0] || '').replace(/ Marcellinus/, '') + ' ' + (c.e?.[2] || '') : k === 'rep' ? c.w[0] + ' (Smith)' : k === 'rule' ? (/fasti|liebenam/.test(c.m) ? 'Liebenam' : /xref/.test(c.m || c.i) ? 'cross-ref.' : 'Smith, by rule') : 'Smith ' + (c.e?.[2] || ''))}</span>`; };
const tsRow = c => { const tm = tsTime(c);
  return `<details class="tsrow${c.st === 'rejects' ? ' rej' : ''}${c.inf ? ' inf' : ''}" data-tsr="${esc(c.i)}"><summary>${esc(tsLab(c) || '–')}${c.t?.orig || tm ? ` <small class="hint">${esc(c.t?.orig || rangeTxt(tm[0], tm[1]))}</small>` : ''} ${tsWitBadge(c)}${c.st ? ` <small class="tsst">${esc(c.st)}</small>` : ''}${c.alt ? ' <small class="tsst">another view</small>' : ''}${c.inf ? ' <small class="tsst">inferred</small>' : ''}</summary>${tsCard({ st: c })}</details>`; };
const tsRefOf = P => TS_IX?.p?.[P]?.[1] != null ? 'people-smith|' + TS_IX.p[P][1] : 'tp|' + P;
function tsOverview(L, name) {                                    // composed by rule from the statements; every fact links to its statement
  const ok = L.filter(c => c.st !== 'rejects'), first = p => ok.find(c => c.p === p), all = p => ok.filter(c => c.p === p);
  const f = (c, txt) => c ? `<a href="#" data-tsf="${esc(c.i)}">${esc(txt)}</a>` : '';
  const when = c => c.t?.orig || (tsTime(c) ? rangeTxt(...tsTime(c)) : '');
  const out = [], roles = all('role').slice(0, 5), orig = first('origin');
  out.push(`<b>${esc(name)}</b>${orig || roles.length ? ' – ' : ''}${[orig ? f(orig, tsVal(orig.v)) : '', ...roles.map(c => f(c, tsVal(c.v)))].filter(Boolean).join(', ')}.`);
  const bo = first('born'), pb = first('place-born'), di = first('died'), pd = first('place-died'), dm = first('death-manner'), kb = first('killed-by');
  if (bo || pb) out.push(`Born ${bo ? f(bo, when(bo)) : ''}${pb ? ' at ' + f(pb, tsVal(pb.v)) : ''}.`);
  if (di || pd || dm) out.push(`Died ${di ? f(di, when(di)) : ''}${pd ? ' at ' + f(pd, tsVal(pd.v)) : ''}${dm ? ' – ' + f(dm, tsVal(dm.v)) : ''}${kb ? ', killed by ' + f(kb, tsVal(kb.v)) : ''}.`);
  const rg = all('reign'); if (rg.length) out.push(rg.slice(0, 3).map(c => f(c, tsVal(c.v) + ' ' + when(c))).join('; ') + '.');
  const of = all('office'); if (of.length) out.push('Offices: ' + of.slice(0, 8).map(c => f(c, tsVal(c.v) + (when(c) ? ' ' + when(c) : ''))).join(', ') + (of.length > 8 ? ` and ${of.length - 8} more` : '') + '.');
  const kin = ['child', 'spouse', 'parent', 'sibling'].map(p => [p, all(p)]).filter(x => x[1].length);   // ("child" = this person is the child of v: v is a parent)
  if (kin.length) out.push(kin.map(([p, cs]) => ({ parent: 'Children', spouse: 'Married', child: 'Parents', sibling: 'Siblings' })[p] + ': ' + cs.slice(0, 5).map(c => f(c, tsVal(c.v))).join(', ')).join('. ') + '.');
  const wr = all('wrote'); if (wr.length) out.push('Wrote: ' + wr.slice(0, 6).map(c => f(c, tsVal(c.v))).join('; ') + (wr.length > 6 ? ` and ${wr.length - 6} more` : '') + '.');
  const ch = first('character'); if (ch) out.push('Character: ' + f(ch, tsVal(ch.v)) + '.');
  return `<p class="tsov">${out.join(' ')}</p>`;
}
// 1002a: one renderer for the person – in Tempora's panel (with the encyclopaedias folded below it) and at the top of the Suda
// tab's person page (open, above the encyclopaedias)
async function tsPersonHTML(ref, where = 'tempora') {
  TS_IX = await tsIx(); const P = await tsRefP(ref);
  const L = P ? await tsStatements(P) || [] : [], lv = P ? TS_IX?.life?.[P] : null, { d, i } = pplParse(ref), r = d ? await pplRow(d, i) : null;
  const name = P ? tsName(TS_IX.p[P][0]) : tsName(r?.name || ref), on = (TP.cfg?.persons || []).includes(ref);
  const roles = (lv?.[6] || []).filter(x => /^(role|off|status):/.test(x)).map(x => `<span class="tskind">${esc(TSV(x))}</span>`).join(' ');
  const og = (lv?.[6] || []).filter(x => /^(orig|gender):/.test(x)).map(TSV).join(', ');
  let h = `<p class="tsdates">${lv ? `<b>${esc(rangeTxt(lv[0], lv[1]))}</b> <small class="hint">estimated – ${esc(lv[8])}</small>` : r?.y0 != null ? `<small class="hint">no life dated yet · the years Smith’s article mentions: ${esc(yearsTxt(r.y0, r.y1))}</small>` : '<small class="hint">no dates yet</small>'}</p>`
    + (roles || og ? `<p>${roles}${og ? ` <small class="hint">${esc(og)}</small>` : ''}</p>` : '')
    + (where === 'tempora' ? `<p class="tact"><button type="button" data-tslane="${esc(ref)}">${on ? 'Close the full lane' : 'Open the full lane'}</button>${L.length ? ` <small class="hint">${L.length} statements · ${P}</small>` : ''}</p>`
      : L.length ? `<p class="hint small">${L.length} statements · ${P}</p>` : '');
  if (L.length) {
    h += tsOverview(L, name);
    const by = new Map(TS_SEC.map(([k]) => [k, []])); for (const c of L) by.get(TS_SECOF(c)).push(c);
    const ord = (x, y) => ((TS_ORDER.indexOf(x.p) + 1 || 99) - (TS_ORDER.indexOf(y.p) + 1 || 99)) || ((tsTime(x)?.[0] ?? 1e9) - (tsTime(y)?.[0] ?? 1e9));
    for (const [k, t] of TS_SEC) { const cs = by.get(k).sort(ord); if (!cs.length && k !== 'src') continue;
      let extra = '';
      if (k === 'src') { const pas = new Map(); for (const c of L) if (tsAncient(c) && c.e?.[2]) pas.set(c.e[1] + '|' + c.e[2], [c.e[1], c.e[2], c.w?.[0]]);
        extra = (where === 'tempora' && (d?.id === 'people-smith' || TS_IX.p[P]?.[1] != null) ? `<p><button type="button" data-tmpperson="${esc(ref)}">Smith’s article (Suda tab)</button></p>` : '')
          + (pas.size ? `<p class="tchips">${[...pas.values()].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true })).map(([w, l, a]) => `<button type="button" class="tpadd sm" data-tsloc="${esc(w + '|' + l)}">${esc((a || '').replace(/ Marcellinus/, ''))} ${esc(l)}</button>`).join('')}</p>` : '');
        if (!cs.length && !extra) continue; }
      h += `<details class="tssec" open data-sec="${k}"><summary>${t} <small class="hint">${cs.length || ''}</small></summary>${extra}${cs.map(tsRow).join('')}</details>`; }
    h += `<p class="hint small"><span class="tswit anc">ancient text</span> <span class="tswit smith">Smith</span> <span class="tswit rep">a view Smith reports</span> <span class="tswit rule">lists and rules</span></p>`;
  }
  return { h, name, P, n: L.length, d };
}
async function tsPanel(refOrP) {
  TS_IX = await tsIx(); const ref = String(refOrP).startsWith('P-') ? tsRefOf(refOrP) : refOrP;
  const p = $('#tmpSide'); p.hidden = false; p.dataset.k = 'person'; p.dataset.ref = ref; p.scrollTop = 0;
  const x = await tsPersonHTML(ref, 'tempora');
  p.innerHTML = `<div class="tch"><b>${esc(x.name)}</b><button type="button" data-tmpclose="side" aria-label="Close">✕</button></div><div class="tsbody">${x.h}</div>`
    + (x.d ? `<details class="tssec tsenc" data-encref="${esc(ref)}"><summary>Smith and the other encyclopaedias <small class="hint">as in the Suda tab</small></summary><div class="tsencb"></div></details>` : '');
}
function tsFact(a) {                                               // an overview's fact: its statement opened, in the same page
  const root = a.closest('.tsbody') || document, r = root.querySelector(`[data-tsr="${CSS.escape(a.dataset.tsf)}"]`); if (!r) return;
  r.open = true; r.closest('details.tssec')?.setAttribute('open', ''); r.scrollIntoView({ block: 'center', behavior: 'smooth' }); r.classList.add('flash'); setTimeout(() => r.classList.remove('flash'), 1200);
}
async function tsOpenLoc(v) { const [wid, loc] = v.split('|'), [bk, ...r] = loc.split('.'); const w = await libGet('works', wid); if (!w) return libMenu(wid);
  return pplPassage(wid, Math.max(0, (w.books || []).indexOf(bk)), r.join('.'), ''); }
document.addEventListener('click', ev => {                          // (the same in the Suda tab's person page)
  if (!ev.target.closest?.('#peopleBody .tsbody')) return;
  const a = ev.target.closest('a[data-tsf]'); if (a) { ev.preventDefault(); ev.stopPropagation(); return tsFact(a); }
  const l = ev.target.closest('[data-tsloc]'); if (l) { ev.stopPropagation(); return tsOpenLoc(l.dataset.tsloc); }
}, true);
document.addEventListener('toggle', async ev => {                   // the encyclopaedias' section: filled when first opened
  const s = ev.target; if (!s.matches?.('details.tsenc') || !s.open) return; const b = s.querySelector('.tsencb'); if (b.dataset.done) return;
  b.dataset.done = 1; b.innerHTML = '<p class="hint">…</p>'; b.innerHTML = await pplPersonHTML(s.dataset.encref, null, { noTempora: true }).catch(() => '<p class="hint">Not available.</p>');
}, true);

async function tmpData() {
  const cfg = await tmpCfg(), F = await fastiTab(), lanes = [];
  if (!S.catWork) await cachedCatalog().catch(() => null);
  const works = new Map((await libWorks()).map(w => [w.id, w]));
  TP.instW = new Set(works.keys());
  const wTitle = id => { const w = works.get(id) || S.catWork?.[id]; return w ? `${w.author ? w.author + ', ' : ''}${w.title}` : id; };
  const auShort = id => { const a = (works.get(id) || S.catWork?.[id])?.author || S.catAuthor?.[id]?.name || ''; return a.split(',')[0].trim(); };   // (“Tacitus, Cornelius” → “Tacitus”)
  const wOnly = id => (works.get(id) || S.catWork?.[id])?.title || id;
  const bookIx = (id, lab) => { const b = (works.get(id) || S.catWork?.[id])?.books || []; const i = b.indexOf(lab); return i < 0 ? 0 : i; };
  {
    // what the books narrate (781a: Ammianus, Tacitus, Suetonius, Historia Augusta, Eutropius)
    for (const [wid, m] of Object.entries(F?.nd || {})) { if (wid === 'b') continue;
      const col = COLL.find(c => wid.startsWith(c[0]));
      if (col) {                                           // (829a: a collection of lives is one lane; the lives are its parts, shown as you zoom in)
        let L = lanes.find(l => l.id === 'col:' + col[0]);
        if (!L) { L = { id: 'col:' + col[0], g: 'Texts – the years they narrate', t: col[1], sh: col[2], wt: col[3], its: [], have: false, wid: col[0], col: true, seen: new Set() }; lanes.push(L); }
        const core = wid.split('.').slice(0, 2).join('.'); if (L.seen.has(core)) continue; L.seen.add(core);    // (one edition of each life)
        for (const [, [y0, y1]] of Object.entries(m)) L.its.push({ t0: ax(y0), t1: ax(y1) + 1, lab: (works.get(wid) || S.catWork?.[wid])?.title || wid, kind: 'book', k2: 'narr', sid: 'narr', lv: 1, cw: col[0],
          src: wTitle(wid), go: { w: wid, bi: 0, r: null }, note: 'the years this life narrates' });
        L.have = L.have || works.has(wid); continue;
      }
      const its = Object.entries(m).map(([lab, [y0, y1]]) => ({ t0: ax(y0), t1: ax(y1) + 1, lab: lab === '*' ? 'the life' : lab.replace(/^Book /, 'Book '), kind: 'book', k2: 'narr', sid: 'narr', lv: 1,
        src: wTitle(wid), go: { w: wid, bi: lab === '*' ? 0 : bookIx(wid, lab), r: null }, note: 'the years this part narrates' }));
      lanes.push({ id: 'nd:' + wid, g: 'Texts – the years they narrate', t: auShort(wid), wt: wOnly(wid), its, have: works.has(wid), wid });
    }
    // Diodorus' own years (chrono-texts)
    const ch = Object.values(S.installed || {}).find(d => d.kind === 'chrono');
    if (ch) {
      const L = (await pplRec(ch, '#l'))?.e || [], I = (await pplRec(ch, '#s'))?.e || []; TP.chrono = I;
      for (const [lid, title, wpre, note] of L) {
        const its = I.filter(x => x[0] === lid).map(x => ({ t0: x[1], t1: x[2], lab: x[3], kind: 'year', k2: lid === 'diodorus' ? 'dyear' : 'ol', sid: lid, uneven: x[6]?.uneven, fixed: x[6]?.fixed, ev: x[6]?.ev || null, ref: x[6]?.ref || null,
          src: title, go: { w: x[6]?.w, bi: x[4], r: x[5] }, text: x[6]?.text || null, fa: !!x[6]?.text && !x[6]?.ol?.[1], fb: !!x[6]?.text && !x[6]?.ol?.[1],
          note: x[6]?.text ? (x[6].ol?.[1] ? '' : 'the Olympiad only – any of its four years') : (x[6]?.fixed ? 'an Olympiad named here fixes the year' : 'counted from the Olympiad named before')
            + (x[6]?.uneven ? ' – in a stretch where his headers and his Olympiads disagree' : '') }));
        for (const it of its) it.lv = 2;
        const byB = new Map(); for (const it of its) { const k = it.go.w + '#' + (it.go.bi ?? 0); if (!byB.has(k)) byB.set(k, []); byB.get(k).push(it); }   // (the books: the passages grouped – by edition and book, since Diodorus is in three editions)
        for (const ps of byB.values()) { const w0 = ps[0].go.w, bi = ps[0].go.bi ?? 0, bl = (works.get(w0) || S.catWork?.[w0])?.books?.[bi];
          its.push({ t0: Math.min(...ps.map(i => i.t0)), t1: Math.max(...ps.map(i => i.t1)), lab: (bl ? (/^\d/.test(bl) ? 'Book ' + bl : bl) : 'Book') + ` · ${ps.length} dates`, kind: 'book', k2: ps[0].k2, sid: lid, lv: 1, kids: ps,
            src: title, go: { w: w0, bi, r: null }, note: 'the dates of this book – pinch the rows apart for each' }); for (const q of ps) q.par = its[its.length - 1]; }
        const w1 = Object.keys(S.catWork || {}).find(k => k.startsWith(wpre + '.')) || wpre;
        lanes.push({ id: 'ch:' + lid, g: 'Texts – the years they narrate', t: auShort(w1) || title.replace(/ – .*$/, ''), wt: wOnly(w1), its, note, have: true, wid: wpre });
      }
    }
    // 822a: levels – the work as one bar, its books (or lives), their passages – shown as there is room, across and up and down
    for (const L of lanes) { if (!L.wid) continue;
      const l1 = L.its.filter(i => i.lv === 1); if (l1.length < 2) { for (const i of L.its) delete i.lv; continue; }
      const l2 = L.its.filter(i => i.lv === 2), bn = l1.map(i => i.lab.match(/^Book (\S+)/)?.[1]);
      L.levels = l2.length ? [0, 1, 2] : [0, 1];
      L.avg = [0, 1, 2].map(k => { const s = L.its.filter(i => i.lv === k); return s.reduce((z, i) => z + i.t1 - i.t0, 0) / Math.max(1, s.length); });
      const s1 = l1.slice().sort((p, q) => p.t0 - q.t0);
      L.its.push({ t0: Math.min(...l1.map(i => i.t0)), t1: Math.max(...l1.map(i => i.t1)), kind: 'book', k2: l1[0].k2, sid: l1[0].sid, lv: 0, lw: L.wid, src: L.t, kids: l2.length ? l2 : l1,   // (856a: labelled with the work's title)
        lab: L.wt || (L.col ? `${l1.length} lives` : `${l1.length} books`), note: 'pinch the rows apart for the parts: ' + s1.map(i => i.lab.replace(/ ·.*$/, '')).join(' · ') });
      for (const i of l1) i.par = L.its[L.its.length - 1];
    }
    // consular dates in the text being read (782a)
    if (S.text?.work && S.consDates?.length) {
      const wid = S.text.work.id, its = S.consDates.map(cd => ({ t0: ax(cd.y), t1: ax(cd.y) + 1, lab: `${(cd.names || []).join(' & ')} consuls`, kind: 'date', k2: 'cdate', sid: 'cdate', link: 'cos:' + cd.y,
        src: wTitle(wid), go: { w: wid, bi: S.text.bi, r: cd.ref }, note: `a consular date at ${cd.ref || '?'} – the consuls of ${yTxt(cd.y)} in Liebenam’s list` }));
      lanes.push({ id: 'cd:' + wid, g: 'Texts – the years they narrate', t: auShort(wid) + ' · ' + wOnly(wid) + ' – consular dates', its, have: true });
    }
  }
  // "Written": when each work was written, in its own lane, joined to what it narrates by thin lines (drawn in tmpDraw)
  {                                                       // (always built – shown only with “Written”, so that switching it moves nothing)
    await tmpWritten();
    const wl = wid => WRITTEN.filter(([p]) => wid.startsWith(p));
    const src = cfg.wsrc || {}, pick = cfg.wpick || {};                   // (which dates: by source – Settings – and, for a work, the one you chose)
    const short = r => r[7] || (r[6] === 'claim' ? 'written (as it claims)' : r[6] === 'smith' ? 'Smith' : 'written');   // (829b: the full text in the card)
    for (const L of lanes) { if (!L.wid) continue;
      let ws = (L.col ? WRITTEN.filter(r => r[0].startsWith(L.wid) || L.wid.startsWith(r[0])) : wl(L.wid)).filter(r => src[r[6]] !== false);
      const all = ws.length, ww = L.its.find(i => i.go?.w)?.go.w;
      if (pick[L.wid] && ws.some(r => r[3] === pick[L.wid])) ws = ws.filter(r => r[3] === pick[L.wid]);
      const groups = new Map();                            // (the same date for several lives: one mark)
      for (const r of ws) { const k = [r[1], r[2], short(r)].join('|'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
      for (const rs of groups.values()) { const [p, y0, y1, lab, note, fz, so] = rs[0], per = L.col && p.length > L.wid.length;
        const names = per ? rs.map(r => L.its.find(i => i.go?.w?.startsWith(r[0]))?.lab).filter(Boolean) : [];
        L.its.push({ t0: ax(y0), t1: y1 == null ? ax(y0) + 15 : ax(y1) + 1, fa: !!fz, fb: !!fz || y1 == null, lab: short(rs[0]), kind: 'work', k2: 'written', wr: true, wks: rs.map(r => per ? r[0] : L.wid), wk: L.wid, wlab: lab, wn: all, lv: per ? 1 : undefined,
          sid: so === 'smith' ? 'people-smith' : 'written', src: WSRC.find(s => s[0] === so)?.[1] || so, wso: so,
          note: per ? note.replace(/this life is/, 'these lives are') + ': ' + names.join(', ') : lab + ' – ' + note, go: ww && !L.col ? { w: ww, bi: 0, r: null } : null }); }
    }
    // the other works of your library: only the author's century in the catalogue
    const done = new Set(lanes.filter(L => L.wid).map(L => L.wid)), its = [];
    for (const w of works.values()) { if (wl(w.id).length || [...done].some(p => w.id.startsWith(p))) continue;
      const a = S.catAuthor?.[w.id], y = a?.year; if (y == null) continue;
      const core = w.id.split('.').slice(0, 2).join('.'); if (its.some(i => i.core === core)) continue;     // (one edition of each work)
      its.push({ t0: ax(y) - 50, t1: ax(y) + 50, fa: true, fb: true, lab: wTitle(w.id) + (a.date ? ' · ' + a.date : ''), kind: 'work', k2: 'written', sid: 'catalogue', wr: true, wk: w.id, wks: [w.id], core, lv: 1, au: a.name,
        src: 'the catalogue (the author’s century only)', go: { w: w.id, bi: 0, r: null } }); }
    if (its.length) {                                        // (zoomed out – also up and down – each author as one bar)
      const by = new Map(); for (const i of its) { if (!by.has(i.au)) by.set(i.au, []); by.get(i.au).push(i); }
      for (const [au, ws] of by) its.push({ t0: Math.min(...ws.map(i => i.t0)), t1: Math.max(...ws.map(i => i.t1)), fa: true, fb: true, lab: au + (ws.length > 1 ? ` · ${ws.length} works` : ''), kind: 'work', k2: 'written', sid: 'catalogue',
        wr: true, wk: ws[0].wk, wks: ws.map(i => i.wk), lv: 0, kids: ws, src: 'the catalogue (the author’s century only)', note: ws.map(i => i.lab.replace(/^[^,]*, /, '').replace(/ · .*$/, '')).join(' · ') });
      for (const [au, ws] of by) { const P = its.find(i => i.lv === 0 && i.kids === ws); for (const w of ws) w.par = P; }
      for (const i of its) i.lib = true;
      const L = { id: 'wr:lib', g: 'Texts – when they were written', t: 'Your library – authors by century', its, have: true, levels: [0, 1], wronly: true, bare: true };   // (860, 991a: no box, no name – Filter → Display)
      L.avg = [0, 100, 0]; lanes.push(L);
    }
  }
  // persons added from the Suda tab
  if (!TP.chrono) { const ch = Object.values(S.installed || {}).find(d => d.kind === 'chrono'); TP.chrono = ch ? (await pplRec(ch, '#s'))?.e || [] : []; }
  for (const ref of cfg.persons || []) { const P = await tmpPersonIts(ref, F, works, wTitle); if (!P) continue;
    const L = { id: 'p:' + ref, g: 'Persons', t: P.r.name, sh: P.r.name, its: P.its, ref, have: true };
    if (P.levels) { L.levels = [0, 1]; L.avg = [0, 1].map(k => { const s = P.its.filter(i => i.lv === k); return s.reduce((z, i) => z + i.t1 - i.t0, 0) / Math.max(1, s.length); }); }
    lanes.push(L); }
  // 997a: all dated persons, by default – thin bars packed in rows, no boxes; names as you zoom in; a tap opens the person
  const tix = TS_IX = await tsIx(), sd = S.installed?.['people-smith'], six = sd ? await pplIx(sd) : null;
  TP.popN = { dated: 0, yrs: 0, undated: 0, all: six?.p?.length || 0 };
  if (tix?.life) {
    const its = [];
    for (const [P, v] of Object.entries(tix.life)) { const row = tix.p[P]; if (!row) continue; const ref = tsRefOf(P), sk = row[1] != null ? six?.p?.[row[1]]?.[3] : '';
      its.push({ t0: v[0], t1: v[1], fa: !!v[2], fb: !!v[3], blood: !!v[4], segs: v[5], roles: v[6], wit: v[7], note: v[8], ticks: v[9] || [], sk: sk ? sk.split(',') : [], nojoin: !!v[10]?.nojoin, alts: v[10]?.alts || null,
        lab: tsName(row[0]), kind: 'life', k2: 'pop', sid: 'tempora-persons', P, ref, life: true, pop: true, src: 'estimated from the statements' }); }
    TP.popN.dated = its.length;
    if (cfg.pop !== false) lanes.push({ id: 'pop', g: 'Persons', t: `Persons – ${its.length} with dated statements (the life estimated)`, its, have: true, dense: true, bare: true });
  }
  if (six?.p) {                                            // 997b(i): the persons of whom only the years Smith's article mentions are known – faint, dashed
    const its = [], seen = new Set(Object.keys(tix?.life || {})); let und = 0;
    six.p.forEach((p, i) => { if (!p || p[7] != null || seen.has(tsPid(i))) return; if (p[4] == null) { und++; return; } const ks = p[3] ? p[3].split(',') : []; if (ks.some(k => MYTHK.has(k))) { und++; return; }
      its.push({ t0: ax(p[4]), t1: ax(p[5] ?? p[4]) + 1, fa: true, fb: true, lab: tsName(p[0]), kind: 'life', k2: 'popy', yrs: true, sk: ks, ref: 'people-smith|' + i, sid: 'people-smith',
        src: 'the years Smith’s article mentions', note: 'not a life – only the earliest and the latest year Smith’s article mentions' }); });
    TP.popN.yrs = its.length; TP.popN.undated = und;
    if (cfg.popy !== false) lanes.push({ id: 'popy', g: 'Persons', t: `Persons – ${its.length} known only by the years Smith’s article mentions (faint, dashed)`, its, have: true, dense: true, bare: true, faint: true });
  }
  for (const L of lanes) if (L.id.startsWith('p:')) for (const it of L.its) { const lv = it.P && tix?.life?.[it.P]; if (lv) { it.roles = lv[6]; it.wit2 = lv[7]; } }   // (the kinds of a person: also on his statements, for the filter)
  // words of the filter: the books they occur in (the index of all texts), at the years the books narrate
  for (const f of (cfg.flt || []).filter(f => f.t === 'word')) {
    const its = [], by = typeof idxLookup === 'function' ? await idxLookup(f.keys || [f.v]).catch(() => new Map()) : new Map();
    for (const [pid, pos] of by) { const m = pid.match(/^w:(.+):(\d+)$/); if (!m) continue; const nd = F?.nd?.[m[1]]; if (!nd) continue;
      const lab = (works.get(m[1]) || S.catWork?.[m[1]])?.books?.[+m[2]]; const yy = nd[lab] || nd['*']; if (!yy) continue;
      its.push({ t0: ax(yy[0]), t1: ax(yy[1]) + 1, fa: true, fb: true, lab: `${f.lab}: ${pos.length}× in ${lab || 'the work'}`, kind: 'word', k2: 'word', sid: 'index', src: wTitle(m[1]), go: { w: m[1], bi: +m[2], r: null }, word: f.v,
        note: 'the word in this part, placed at the years it narrates (the index of all texts: Settings → Search)' }); }
    lanes.push({ id: 'wd:' + f.v, g: 'Words', t: `${wTitle('')}`.replace(/^$/, '') || 'Word', sh: '“' + f.lab + '”', its, have: true });
  }
  // your statements (791a)
  const own = (await getAll('settings', IDBKeyRange.bound('tmp|', 'tmp|￿'))).map(x => x.v).filter(Boolean);
  if (own.length) lanes.push({ id: 'own', g: 'Your chronology', t: 'Your statements', its: own.map(s => ownItem(s)), have: true });
  for (const L of lanes) { let a = Infinity, b = -Infinity; for (const it of L.its) { a = Math.min(a, it.t0); b = Math.max(b, it.t1); } L.a = a; L.b = b;   // (the span a lane covers – with its dates of writing: room is kept for them)
    let na = Infinity, nb = -Infinity; for (const it of L.its) if (!it.wr) { na = Math.min(na, it.t0); nb = Math.max(nb, it.t1); } L.na = isFinite(na) ? na : a; L.nb = isFinite(nb) ? nb : b; }   // (its box: without them)
  for (const L of lanes) {                              // rows packed once over all the lane's items: an item keeps its row whatever is in view
    const sh = L.sh || L.t.replace(/ – .*$/, '');
    if (!L.levels) { const ends = [];
      for (const it of L.its.slice().sort((a, b) => a.t0 - b.t0)) { let r = ends.findIndex(e => e <= it.t0 + 1e-6); if (r < 0) { r = ends.length; ends.push(0); } ends[r] = it.t1; it.row = r; } }
    else {                                               // 861a: laid out from the top down – the top bars packed tightly; when a bar opens, its parts get a
      const pack = its => { const occ = []; for (const it of its.slice().sort((a, b) => a.t0 - b.t0)) {   // block of rows right beneath it, and all below moves down by that block
        let r = 0; while ((occ[r] || []).some(([a, b]) => it.t0 < b - 1e-6 && it.t1 > a + 1e-6)) r++; (occ[r] ??= []).push([it.t0, it.t1]); it._loc = r; } return occ.length; };
      const top = L.its.filter(i => i.lv === L.levels[0]); pack(top); for (const i of top) i.row = i['row' + L.levels[0]] = i._loc;
      for (const k of L.levels.slice(1)) {
        const kids = L.its.filter(i => i.lv === k), by = new Map(); for (const i of kids) { const p = i.par; if (!by.has(p)) by.set(p, []); by.get(p).push(i); }
        const H = []; for (const [p, cs] of by) { const n = pack(cs), R = p ? p['row' + (k - 1)] : 0; H[R] = Math.max(H[R] || 1, n); }
        const nPrev = 1 + Math.max(0, ...L.its.filter(i => i.lv === k - 1).map(i => i['row' + (k - 1)]));
        const start = []; let s = 0; for (let R = 0; R < nPrev; R++) { start[R] = s; s += H[R] || 1; }
        for (const i of kids) { const R = i.par ? i.par['row' + (k - 1)] : 0; i.row = i['row' + k] = (start[R] ?? 0) + i._loc; }
      }
      // 1042a: a person's own lane – pinched apart, his life bar stays as the first row; the statements open beneath it
      const life = L.ref && L.its.find(i => i.life && i.lv === 0);
      if (life) { life.keep = true; for (const i of L.its) if (i.lv === 1) { i.row1 += 1; if (i.kind === 'st') i.fr = life; } life.row1 = 0; }
      for (const k of L.levels) {                        // (the dates of writing and the like: in the first free row at each level)
        const occ = []; for (const i of L.its.filter(i => i.lv === k)) (occ[i['row' + k]] ??= []).push([i.t0, i.t1]);
        for (const it of L.its.filter(i => i.lv == null).sort((a, b) => a.t0 - b.t0)) { let r = 0; while ((occ[r] || []).some(([a, b]) => it.t0 < b - 1e-6 && it.t1 > a + 1e-6)) r++; (occ[r] ??= []).push([it.t0, it.t1]); it['row' + k] = r; it.row = r; } }
    }
    for (const it of L.its) it.full = (L.id === 'own' || L.id === 'wr:lib' || it.wr ? '' : sh + ' · ') + it.lab;
  }
  // 1052c: persons opened in the persons' layer (a tap on the bar) – their statements beneath their row, inside the layer
  const popL = lanes.find(L => L.id === 'pop');
  if (popL) for (const P of cfg.popen || []) { const pi = popL.its.find(i => i.P === P); if (!pi) continue; const r = await tsPerson('tp|' + P); if (!r) continue;
    for (const i of r.its) if (i.kind === 'st') { i.fr = pi; i.oP = true; i.full = pi.lab + ' · ' + i.lab; popL.its.push(i); } }
  if (TP.sel?.it) {                                       // (the lanes are new objects: the selection moves to the same item in them)
    const o = TP.sel.it, k = i => [i.k2, i.ref || '', i.lab, i.t0, i.t1, i.st?.i || ''].join('|'), ko = k(o);
    for (const L of lanes) { const n = L.its.find(i => k(i) === ko); if (n) { n._lid = L.id; TP.sel = Object.assign({}, TP.sel, { it: n, L }); break; } } }
  TP.data = { F, lanes };
  return TP.data;
}
function ownItem(s) {
  const fa = s.rel === 'before' || s.rel === 'about', fb = s.rel === 'after' || s.rel === 'about';
  let t0 = ax(s.y0), t1 = ax(s.y1 ?? s.y0) + 1;
  if (s.a0 != null) { t0 = s.a0; t1 = s.a1; }                     // (an Olympiad or a year of the city: its own boundaries)
  if (s.rel === 'before') t0 -= Math.max(5, (t1 - t0) * 2); if (s.rel === 'after') t1 += Math.max(5, (t1 - t0) * 2);
  if (s.rel === 'about') { t0 -= 3; t1 += 3; }
  return { t0, t1, fa, fb, lab: s.ev || '(untitled)', kind: 'own', k2: 'own', sid: 'own', own: s, src: 'your statement' + (s.src?.title ? ' – ' + s.src.title : ''), ev: s.ev,
    go: s.src?.w ? { w: s.src.w, bi: s.src.bi, r: s.src.r } : null, note: [s.when, s.note].filter(Boolean).join(' · '), place: s.place };
}

// ---------------------------------------------------------------- drawing
function tmpColors() {
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  return { fg: v('--fg'), mut: v('--mut'), line: v('--line'), acc: v('--acc'), acc2: v('--acc2'), card: v('--card'), bar: v('--bar'), bg: v('--bg'), ui: v('--ui') };
}
const evHue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
// the view stays anchored when lanes are rearranged (switching “Written”, a filter that hides, …): the lane at the middle of the
// screen stays where it was on the screen; what changes, changes around it
function tmpAnchorGet() {
  const cv = $('#tmpCanvas'); if (!cv || !TP.laneTop) return null;
  const itY = it => TP.laneTop?.[it._lid] != null ? TP.laneTop[it._lid] - TP.sy + 14 + 3 + (it._y ?? it.row) * (it.pop || it.yrs ? denseRH() : TP.lh) : null;   // (where an item is, on screen or not)
  TP.itY = itY; const s = TP.sel?.it; if (s && itY(s) != null) return { it: s, y: itY(s) };   // (an item selected: it stays fixed)
  const mid = (TP.RH + cv.clientHeight) / 2;
  let best = null; for (const [id, top] of Object.entries(TP.laneTop)) { const y = top - TP.sy, d = y <= mid && mid <= y + (TP.laneH?.[id] || 0) ? 0 : Math.abs(y - mid); if (!best || d < best.d) best = { id, y, d }; }
  return best;
}
function tmpAnchorKeep(an) {
  TP.prevLay = null; tmpDraw();
  if (an?.it) { const y = TP.itY?.(an.it); if (y != null) { TP.sy += y - an.y; TP.over = Math.max(TP.over || 0, TP.sy); TP.under = Math.max(0, -TP.sy); tmpClampY(); TP.prevLay = null; } return tmpRedraw(); }
  if (an && TP.laneTop?.[an.id] != null) { TP.sy = TP.laneTop[an.id] - an.y; TP.over = Math.max(TP.over || 0, TP.sy); TP.under = Math.max(0, -TP.sy); tmpClampY(); TP.prevLay = null; }
  tmpRedraw();
}
// 843a: a level opens with the zoom, not at one point – the parts grow out of their bar as you widen or pinch apart, and fold back
const sm = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
function tmpLevels(L) {                                     // → { la, lb, f }: between level la and lb, f of the way
  if (!L.levels) return null; const lh = TP.lh;              // (only the vertical zoom opens or folds the levels – widening never makes a lane taller)
  const two = L.levels.includes(2), f1 = sm(lh, 17, 24), t = f1 < 1 || !two ? f1 : 1 + sm(lh, 24, 29);
  // 1057a: the parts grow out of their bar (or fold back) gliding – at most about 10 px a frame, however fast the fingers
  let v = L._lvv ?? t; const cap = 10 / Math.max(10, (L._nMax || 1) * laneRH(L)); v += Math.max(-cap, Math.min(cap, t - v));
  if (Math.abs(t - v) < 1e-3) v = t; else TP.moving = true; L._lvv = v;
  const la = Math.floor(v + 1e-9), lb = Math.min(two ? 2 : 1, Math.ceil(v - 1e-9)), f = lb > la ? v - la : 0;
  return { la, lb: Math.max(la, lb), f };
}
function laneShown(L) { return (L.have || TP.cfg.all) && !TP.cfg.lhide?.[L.id] && (!L.wronly || TP.cfg.libw); }
// 828: the order of the lanes – pinned ones first in your order; then the text being read, what passes the filter, the rest by time
function laneOrder(lanes) {
  const pin = TP.cfg.lpin || [], wid = S.text?.work?.id, cur = L => !!wid && (L.id.endsWith(':' + wid) || L.id.endsWith(wid) || (L.col && wid.startsWith(L.wid)));
  const rank = L => { const p = pin.indexOf(L.id); return L.wronly ? [9, 0] : p >= 0 ? [0, p] : cur(L) ? [1, 0] : L.id.startsWith('p:') ? [1, 1] : L.dense ? [8, L.faint ? 1 : 0]   // (997a: the persons' layer below the texts)
    : TP.fOn && L.its.some(i => i.pass) ? [2, L.a] : [3, isFinite(L.a) ? L.a : 1e9]; };
  return lanes.map(L => [rank(L), L]).sort((p, q) => p[0][0] - q[0][0] || p[0][1] - q[0][1]).map(x => x[1]);
}
// 991a: the dates of writing only of the work selected (in its card, and as its line); your library's authors by century: Filter → Display
const wrOn = it => !!TP.wsel && (it.wks || [it.wk]).some(w => w && (TP.wsel.startsWith(w) || w.startsWith(TP.wsel)));
const wrVis = it => !it.wr || it.lib || wrOn(it);
// 997a, 1024a: the persons' rows – their height from the time zoom, scaled by the vertical zoom (pinching apart up and down);
// what the rows show (names, ages, marks) still needs the time zoom too: it appears only where it fits
// 1034a: growing smoothly with the time zoom (no steps – a step made the whole layer jump): 3 px far out, 15 px from about 30 px a year
const DRH = [[0.75, 3], [3, 6], [11, 10], [30, 15]];
const denseBase = () => { const l = Math.log(TP.ppy); let base = DRH[0][1];
  for (let i = 1; i < DRH.length; i++) { const [p0, b0] = DRH[i - 1], [p1, b1] = DRH[i]; if (TP.ppy >= p1) base = b1; else if (TP.ppy > p0) { base = b0 + (b1 - b0) * (l - Math.log(p0)) / (Math.log(p1) - Math.log(p0)); break; } else break; }
  return base; };
const denseRH = () => Math.min(40, Math.max(2, denseBase() * TP.lh / 30));
// 1056: every lane slims down as you zoom out in time, by the same curve as the persons' rows (full height from about 30 px a year);
// the strip with a lane's name narrows with it, its name fading – the bars' own names fade as they get too thin (1035a)
const slimF = () => denseBase() / 15;
const laneRH = L => L.dense ? denseRH() : TP.lh * slimF();
const laneBH = L => { const rl = laneRH(L); return L.dense || rl < 12 ? Math.max(2, rl - 1) : BH(rl); };
const ttOf = () => 6 + 8 * sm(slimF(), 0.2, 0.6);
// 1042a, 1045a–1050a, 1053a, 1054c: a person's statements stand each in a box as wide as its words, as near beneath its own time
// as there is room – to the left or the right of it in a row (as far as would still let a box reach within 7 px of the pane's edge
// with its time in the middle), else in the next row; packed over all his statements (so nothing moves as you pan), and gliding to
// a new place when the zoom makes them meet. Zoomed in, a second line: when, and whose words; tapped, the box opens in place with
// all the card would say. Each is joined to its exact time on the life bar by a bending line
const stMC = document.createElement('canvas').getContext('2d');
const stKey = it => (it.P || '') + '|' + (it.st?.i ?? (it.lab + '|' + it.t0));
const stF = fs => `${fs}px ${TP.C?.ui || 'sans-serif'}`;
function stWrap(txt, w, font) { stMC.font = font; const out = []; let line = '';
  for (const word of String(txt).split(/\s+/)) { const t = line ? line + ' ' + word : word; if (stMC.measureText(t).width <= w || !line) line = t; else { out.push(line); line = word; } }
  if (line) out.push(line); return out; }
function stCut(txt, w, font) { stMC.font = font; if (stMC.measureText(txt).width <= w) return txt; let t = txt; while (t.length > 3 && stMC.measureText(t + '…').width > w) t = t.slice(0, -1); return t.trimEnd() + '…'; }
function stInfo(it) {                                             // (what the card says, as lines: when, whose words, the words, the source)
  const c = it.st || {}, e = c.e || [], wit = c.w || [], tm = tsTime(c), rt = tm ? rangeTxt(tm[0], tm[1]) : rangeTxt(it.t0, it.t1);
  const when = c.t?.orig ? c.t.orig + (tm && c.t.orig !== rt ? ` (${rt})` : '') : rt, who = e[0] === 'texts' ? (wit[0] || 'the text') : wit[0] && wit[0] !== 'Smith' ? wit[0] + (wit[1] ? ', via ' + wit[1] : '') + ' (Smith)' : 'Smith';
  const L = [{ t: when + (c.tr ? ' · read: ' + c.tr.why : ''), k: '' }];
  if (wit[0] && wit[0] !== 'Smith' && e[0] !== 'texts') L.push({ t: `The view of ${wit[0]}${wit[1] ? ', reported by ' + wit[1] : ''}`, k: '' });
  if (c.st) L.push({ t: { accepts: 'Smith accepts this view', doubts: 'Smith doubts this view', rejects: 'Smith rejects this view' }[c.st] || c.st, k: 'b' });
  if (e[3]) L.push({ t: '“' + e[3] + '”', k: 'q' });
  L.push({ t: (e[0] === 'texts' ? `${wit[0] || ''}, ${e[2] || ''}` : `Smith, Dictionary (1849), ${e[1] || ''}${e[2] ? ' · ' + e[2] : ''}`) + (e[4]?.length ? ' · cites ' + e[4].join('; ') : '') + (c.b ? ' · basis: ' + TSV(c.b) : '') + (c.c != null ? ' · confidence ' + c.c : ''), k: 's' });
  if (c.r?.length) L.push({ t: c.r.map(r => r[0] + ' ' + r[1] + (r[2] ? ' (block)' : '')).join(' · '), k: 's' });
  if (c.inf) L.push({ t: 'inferred – not stated in words', k: 's' }); if (c.n) L.push({ t: c.n, k: 's' });
  if (c.alt) L.push({ t: 'another view – not used for the life', k: 's' }); if (c.rv) L.push({ t: 'checked: ' + c.rv, k: 's' });
  const B = [['All about ' + tsName(TS_IX?.p?.[it.P]?.[0] || 'the person'), 'all']]; if (e[0] === 'texts') B.push(['Open the passage', 'go']); if (it.ref?.startsWith('people-') || it.fr?.ref?.startsWith('people-')) B.push(['Smith’s article', 'smith']);
  return { l2: when + ' · ' + who, L, B };
}
// the size of a statement's box: its words (cut to the widest a box may be), a second line from 30 px rows, all of it when opened
function stSize(it, bh, rl, maxW) {
  const fs = Math.max(9, Math.min(11, bh - 2)), f2 = sm(bh, 30, 36), ex = TP.stx === stKey(it), key = [fs, maxW, f2 > 0, ex, rl].join('|');
  if (it._szK === key) return; it._szK = key; const inf = it._inf || (it._inf = stInfo(it));
  it._stTxt = stCut(it.lab, maxW - 12, stF(fs)); stMC.font = stF(fs); let w = stMC.measureText(it._stTxt).width;
  if (f2 > 0) { it._st2 = stCut(inf.l2, maxW - 12, stF(fs - 1.5)); stMC.font = stF(fs - 1.5); w = Math.max(w, stMC.measureText(it._st2).width); } else it._st2 = null;
  if (!ex) { it._bw = Math.ceil(w) + 12; it._span = 1; it._exL = null; return; }
  const iw = maxW - 12, lines = []; lines.push(...stWrap(it.lab, iw, 'bold ' + stF(fs)).map(t => ({ t, k: 'h' })));
  for (const l of inf.L) lines.push(...stWrap(l.t, iw, (l.k === 'q' ? 'italic ' : '') + stF(l.k === 's' ? fs - 1.5 : fs)).map(t => ({ t, k: l.k })));
  it._exL = lines; it._bw = maxW; const hpx = 6 + lines.reduce((z, l) => z + (l.k === 's' ? fs + 1.5 : fs + 4), 0) + 6 + fs + 10 + 6;
  it._exH = hpx; it._span = Math.max(1, Math.ceil((hpx + (rl - bh)) / rl));
}
function stGlide(i, k, t, cap, fol) { const pv = i['_' + k + 'T'], v0 = i['_' + k]; let v = v0 == null ? t : v0 + (pv != null && Math.abs(t - pv) <= fol ? t - pv : 0);
  v += Math.max(-cap, Math.min(cap, (t - v) * 0.35)); if (Math.abs(t - v) < 0.02) v = t; else TP.moving = true; i['_' + k + 'T'] = t; i['_' + k] = v; return v; }
// → the rows they take (gliding); on each: _dx (from its time's middle), _sr (its row), _spE (rows it spans)
function stPack(kids, rl, bh, owner) {
  if (!kids.length) return 0;
  const W = $('#tmpCanvas')?.clientWidth || 800, maxW = Math.max(80, Math.min(340, W * 0.6)), GAP = 6;
  for (const i of kids) stSize(i, bh, rl, maxW);
  const ck = [TP.ppy, bh, rl, W, TP.stx, kids.length].join('|');
  if (owner._stK !== ck) { owner._stK = ck; const occ = [], T = new Map();          // (laid out again only when the zoom or the opened box changes)
    const P = kids.map(i => ({ i, xm: (i.t0 + i.t1) / 2 * TP.ppy })).sort((a, b) => a.xm - b.xm || a.i.t0 - b.i.t0);
    const free = (r, k, p, w) => { for (let q = r; q < r + k; q++) for (const iv of occ[q] || []) if (p < iv[1] + GAP && p + w + GAP > iv[0]) return false; return true; };
    for (const { i, xm } of P) { const w = i._bw, k = i._span, a = xm - w / 2, lim = Math.max(0, W / 2 - 7 - w / 2);
      for (let r = 0; ; r++) { const cand = [a]; for (let q = r; q < r + k; q++) for (const iv of occ[q] || []) cand.push(iv[0] - GAP - w, iv[1] + GAP);
        const c = cand.filter(p => Math.abs(p - a) <= lim + 0.01).sort((p, q) => Math.abs(p - a) - Math.abs(q - a)).find(p => free(r, k, p, w));
        if (c != null) { for (let q = r; q < r + k; q++) (occ[q] ??= []).push([c, c + w]); T.set(i, [c - xm, r]); break; } } }
    owner._stT = T; }
  let n = 0;
  for (const i of kids) { const [dx, r] = owner._stT.get(i) || [0, 0];
    i._dx = stGlide(i, 'sx', dx, 10, 4); i._sr = stGlide(i, 'sr', r, 10 / rl, 0); i._spE = stGlide(i, 'sp', i._span, 10 / rl, 0); n = Math.max(n, i._sr + i._spE); }
  return n;
}
// 1052c: the persons' layer with persons opened in it – a block of rows beneath each, opening and closing gliding, all below moving down
function tmpPopOpen(L, on) {
  const rl = laneRH(L), bh = Math.max(2, rl - 1), by = new Map(); TP.blk ??= new Map(); TP.blkRow ??= new Map();
  for (const i of L.its) if (i.oP) { if (!by.has(i.fr)) by.set(i.fr, []); by.get(i.fr).push(i); }
  const tgt = new Map();
  for (const [pi, ks] of by) { tgt.set(pi.P, stPack(ks, rl, bh, pi) + 0.4); TP.blkRow.set(pi.P, [pi.row, pi.t0]); }
  for (const P of TP.blk.keys()) if (!tgt.has(P)) tgt.set(P, 0);
  const blocks = [];
  for (const [P, t] of tgt) { let v = TP.blk.get(P) ?? 0; const cap = 10 / rl; v += Math.max(-cap, Math.min(cap, (t - v) * 0.35)); if (Math.abs(t - v) < 0.02) v = t; else TP.moving = true;
    if (v <= 0 && t === 0) { TP.blk.delete(P); continue; } TP.blk.set(P, v); const rr = TP.blkRow.get(P); if (rr) blocks.push({ P, row: rr[0], t0: rr[1], v }); }
  blocks.sort((a, b) => a.row - b.row || a.t0 - b.t0); let s = 0; for (const b of blocks) { b.start = b.row + 1 + s; s += b.v; }
  const off = r => { let o = 0; for (const b of blocks) { if (b.row >= r) break; o += b.v; } return o; };
  let n = 0;
  for (const i of L.its) { if (i.oP) continue; i._y = i.row + off(i.row); i._al = 1; i._lab = true; if (on(i)) n = Math.max(n, i._y + 1); }
  for (const b of blocks) { n = Math.max(n, b.start + b.v); const ks = [...by].find(([pi]) => pi.P === b.P)?.[1] || [];
    for (const i of ks) { i._y = b.start + i._sr; i._al = sm(b.v - i._sr, 0, 1); i._lab = true; } }
  return n;
}
function tmpLayout(A0, A1) {
  // 810a/812a: lanes keep their place; the space before and after a lane is free for others – lanes whose spans do not meet share
  // a slot (packed once over the whole spans, so nothing moves while you pan); a lane with nothing in view thins to a strip
  const hide = TP.cfg.fmode === 'hide', GAP = 2;
  const lanes = laneOrder(TP.data.lanes.filter(laneShown));
  const slots = [];
  for (const L of lanes) {
    if (hide && TP.fOn && !L.its.some(i => i.pass)) continue;           // (hidden: a lane with nothing that passes goes)
    const Lv = tmpLevels(L), on = i => !(hide && !i.pass) && wrVis(i);
    if (Lv && L.ref && Lv.lb >= 1) { const ks = L.its.filter(i => i.fr && i.lv === 1); stPack(ks, laneRH(L), laneBH(L), L); for (const i of ks) i.row1 = 1 + i._sr; }   // (1045a: a person's statements, each in its own place – for this zoom)   // (816a: room for the dates of writing only while they are shown)
    let atLv = () => true, n;
    if (!Lv && L.id === 'pop' && (TP.blk?.size || L.its.some(i => i.oP))) n = tmpPopOpen(L, on);
    else if (!Lv) { for (const i of L.its) { i._y = i.row; i._al = 1; i._lab = true; } const all = L.its.filter(on); n = all.length ? 1 + Math.max(...all.map(i => i.row)) : 0; }
    else { const { la, lb, f } = Lv, rw = (i, k) => i['row' + k] ?? i.row, all = i => i.lv == null || i.keep;
      for (const i of L.its) { i._al = 0; i._lab = all(i) || (i.lv === la ? f <= 0.5 : f > 0.5);
        if (all(i)) { i._y = rw(i, la) + f * (rw(i, lb) - rw(i, la)); i._al = 1; }
        else if (i.lv === la && la !== lb) { i._y = rw(i, la); i._al = 1 - f; }
        else if (i.lv === lb && la !== lb) { const p = i.par?.lv === la ? rw(i.par, la) : rw(i, lb); i._y = p + f * (rw(i, lb) - p); i._al = f; }
        else if (i.lv === la) { i._y = rw(i, la); i._al = 1; } }
      const nOf = k => { const s = L.its.filter(i => (all(i) || i.lv === k) && on(i)); return s.length ? 1 + Math.max(...s.map(i => rw(i, k) + (i.fr && i._spE ? i._spE - 1 : 0))) : 0; };
      n = nOf(la) + f * (nOf(lb) - nOf(la)); L._nMax = Math.max(nOf(la), nOf(lb));
      atLv = i => all(i) || i.lv === (f < 0.5 ? la : lb); }
    const its = L.its.filter(i => i._al > 0.01 && i.t1 > A0 && i.t0 < A1 && on(i));   // (the dates of writing: only the selected work's)
    const wx = L.its.some(i => i.wr && wrVis(i)), a0 = wx ? L.a : L.na, b0 = wx ? L.b : L.nb, a = isFinite(a0) ? a0 : -1e9, b = isFinite(b0) ? b0 : 1e9;
    let s = L.wronly ? -1 : slots.findIndex(S => S.every(M => b + GAP <= M.a || M.b + GAP <= a));   // (your library's dates of writing: below all, sharing no level)
    if (s < 0) { s = slots.length; slots.push([]); }
    slots[s].push({ L, a, b, n, its, atLv });                            // (its height: the rows of all its items at this level, wherever they are – it changes only as you zoom)
  }
  for (const S of slots) S.sort((p, q) => p.a - q.a);
  return { slots };
}
function rulerHeight(id) { return id === 'anc' ? 31 : id === 'cos' || id === 'sky' || id === 'sky2' ? 20 : 18; }
// heights glide to their new values instead of jumping (a lane's row count, the emperor band, a reference row coming or going)
function tmpEase(k, v) { const E = TP.ease || (TP.ease = new Map()); let c = E.get(k);
  if (c == null) c = v; else { c += (v - c) * 0.35; if (Math.abs(v - c) < 0.02) c = v; else TP.moving = true; } E.set(k, c); return c; }
function tmpDraw() {
  TP.raf = 0; TP.moving = false;
  const cv = $('#tmpCanvas'); if (!cv || !TP.data) return;
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  tmpClampX(W);                                          // (the limits of Settings → Tempora)
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const C = TP.C = tmpColors(), font = s => `${s}px ${C.ui || 'sans-serif'}`;
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  const X = a => (a - TP.x0) * TP.ppy, A0 = TP.x0, A1 = TP.x0 + W / TP.ppy;
  TP.hit = [];
  const emps = [];
  // ---- the reference rows: each fades in or out over its span
  const SPAN = { att: [-700, 400], auc: [-752, 1e9], cato: [-751, 1e9], ol: [-775, 394], cos: [-29, 566], emp: [-62, 566], sel: [-311, 1e9], dio: [284, 1e9], ind: [312, 1e9] };
  const ro = rulerOrder(), dv = ro.indexOf('|'), row = id => ({ id, h: rulerHeight(id) });   // (every row switched on keeps its height – empty outside its span)
  let rulers = ro.slice(0, dv).filter(id => TP.cfg.rulers[id]).map(row), rulersB = ro.slice(dv + 1).filter(id => TP.cfg.rulers[id]).map(row);
  if (TP.cfg.rcoll) rulers = rulers.slice(0, 1);                    // (995: folded – only the uppermost row at the top, the lowest at the bottom)
  if (TP.cfg.rcollB) rulersB = rulersB.slice(-1);
  const RH = rulers.reduce((s, r) => s + r.h, 0), RB = rulersB.reduce((s, r) => s + r.h, 0);
  TP.RH = RH; TP.RB = RB; TP.H = H;
  tmpFilterApply();
  // ---- the lanes: their slots, heights (eased), and where each lies in the scrolled content
  const { slots } = tmpLayout(A0, A1), lh = TP.lh, TT = ttOf(), tA = sm(slimF(), 0.35, 0.6);                 // (TT: the strip with the lane's name, once, at the top of its box)
  const laneH = (n, L) => TT + Math.max(0, n) * laneRH(L) + (n > 0.02 ? 6 : 4);
  const lay = []; let off = 0;
  for (const SL of slots) { const ls = SL.map(r => Object.assign(r, { box: r.L.na < A1 && r.L.nb > A0, h: 0 })).map(r => Object.assign(r, { h: laneH(r.n, r.L) })), hs = Math.max(8, ...ls.map(r => r.h));
    lay.push({ ls, off, hs, key: ls.map(r => r.L.id).join('|'), rh: Math.max(...ls.map(r => laneRH(r.L))) }); off += hs + 4; }
  TP.contentH = off;
  // anchoring: the point under the fingers or the cursor (or the top of the lanes) keeps its place on screen while heights change
  const P = TP.prevLay, PIN = TP.pin;
  // 1029a: a pinch is solved from where it began – the spot (or the selected item) it took hold of is put under the point it is
  // to be at now, whatever the frames before did; putting the fingers back gives back the view it began with
  let pinned = false;
  if (PIN) { let cyN = null;
    if (PIN.it) for (const s of lay) { const r = s.ls.find(r => r.L === PIN.L); if (r) { const rl = laneRH(r.L), bh = laneBH(r.L); cyN = s.off + TT + 3 + (PIN.it._y ?? PIN.it.row) * rl + bh / 2 + (PIN.fr || 0) * rl; break; } }
    if (cyN == null) { const s = lay.find(s => s.key === PIN.key); if (s) cyN = s.off + (PIN.rho == null ? PIN.d0 : TT + 3 + PIN.rho * s.rh); }
    if (cyN != null) { TP.sy = cyN + RH + 6 - PIN.ty; pinned = true; } }
  const FY = TP.focusY ?? (PIN ? PIN.ty : null);
  if (!pinned && P && P.slots.length) { const fy = FY ?? (P.RH + 6), cy = fy - (P.RH + 6) + P.sy;
    const p = P.slots.find(s => cy < s.off + s.hs + 4) || P.slots[P.slots.length - 1], q = p && lay.find(s => s.key === p.key);
    if (q && FY != null) {                          // (zooming: the row under the fingers stays under them – rows are counted, not the slot's fraction)
      const d = cy - p.off - (P.TT ?? 14) - 3, rho = d / (p.rh || P.lh || TP.lh);
      TP.sy += d <= 0 ? q.off - p.off : (q.off + TT + 3 + rho * (q.rh || TP.lh)) - cy; }
    else if (q) { const f = Math.min(1, Math.max(0, (cy - p.off) / (p.hs + 4))); TP.sy += (q.off + f * (q.hs + 4)) - (p.off + f * (p.hs + 4)); }
    if (P.sy > 0 && Date.now() - (TP.userMove || 0) < 500) { TP.sy += RH - P.RH; TP.over = Math.max(0, (TP.over || 0) + RH - P.RH); } }   // (only while you move it yourself, and not at the very top)                                                    // (820a: the header grows over the lanes – they stay where they are)
  tmpClampY();
  TP.prevLay = TP.lastLay = { RH, TT, lh: TP.lh, sy: TP.sy, slots: lay.map(s => ({ key: s.key, off: s.off, hs: s.hs, rh: s.rh })) };
  if (PIN && !pinned) Object.assign(PIN, tmpPinAt(PIN.ty));   // (its lane gone from where it was: held from here on)
  const y0 = RH + 6 - TP.sy, centers = [], marks = new Map(), from = [];
  TP.laneTop = {};
  g.save(); g.beginPath(); g.rect(0, RH, W, H - RH - RB); g.clip();
  // year grid
  const step = gridStep(TP.ppy);
  g.strokeStyle = C.line; g.lineWidth = 1; g.globalAlpha = 0.5;
  for (const a of TP.ppy >= 150 ? julCells(A0, A1, TP.ppy).map(c => c.a) : (() => { const r = []; for (let a = Math.ceil(A0 / step) * step; a < A1; a += step) r.push(a); return r; })()) { const x = Math.round(X(a)) + 0.5; g.beginPath(); g.moveTo(x, RH); g.lineTo(x, H); g.stroke(); }
  g.globalAlpha = 1;
  seasonTint(g, X, A0, A1, RH, W, H);
  const selIt = TP.sel?.it && !TP.sel.it.wr ? TP.sel.it : null;
  lay.forEach(({ ls, off, hs }, si) => {
    const top = y0 + off;
    ls.forEach(({ L, a, b, n, h, its: vis, atLv }, k) => {
      TP.laneTop[L.id] = top + TP.sy; (TP.laneH ??= {})[L.id] = h;
      const rl = laneRH(L), bhL = laneBH(L);
      const ry = it => n ? top + TT + 3 + Math.min(it._y ?? it.row, Math.max(0, n - 1)) * rl + bhL / 2 : top + 3;   // (an item's middle, kept within the lane as drawn)
      if (TP.wsel) { for (const it of L.its) if (it.wr && !it.lib && wrOn(it) && atLv(it)) { const m = { x: X(it.t0), y: ry(it) }; for (const wk of it.wks || [it.wk]) { if (!marks.has(wk)) marks.set(wk, []); marks.get(wk).push(m); } }
        if (selIt && L.its.includes(selIt) && tmpWorkOf(selIt)) from.push({ w: tmpWorkOf(selIt), x: X(selIt.t1) - 1, y: ry(selIt), sel: true }); }   // (991a: the selected one's line to its dates of writing)
      if (top >= H || top + hs <= RH) return;
      // 811a: alternate lanes faintly tinted or outlined – only over the span the lane covers
      if (L.dense && isFinite(L.na)) { g.font = font(10.5); g.fillStyle = C.mut; const nm = L.t + (TP.fOn ? ` · ${L.nPass || 0} found` : ''), tw = g.measureText(nm).width;   // (997a: no box – only its name, 1023a: moving with it)
        for (const cp of nameCopies(L, L.na, L.nb, X(L.na), X(L.nb), tw, W, W, 4, rowPh(si))) { g.globalAlpha = cp.a * tA; g.fillText(nm, cp.x, top + TT * 0.68); } g.globalAlpha = 1; }
      if (isFinite(L.na) && !L.bare) { const xa = Math.max(-10, X(L.na) - 3), xb = Math.min(W + 10, X(L.nb) + 3);       // (the box: what the work narrates, not when it was written)
        if (xb > xa) { if ((si + k) % 2 === 0) { g.fillStyle = C.fg; g.globalAlpha = 0.045; g.fillRect(xa, top - 2, xb - xa, h + 4); }
          else { g.strokeStyle = C.line; g.globalAlpha = 0.6; g.strokeRect(xa + 0.5, top - 1.5, xb - xa - 1, h + 2); } g.globalAlpha = 1;
          // its name, once – at the box's left edge, or held at the screen's edge while the box runs on
          // a work not on this device: a dashed box and a small download arrow before its name (no words)
          if (!L.have) { g.strokeStyle = C.mut; g.globalAlpha = 0.7; g.setLineDash([4, 3]); g.strokeRect(xa + 0.5, top - 1.5, xb - xa - 1, h + 2); g.setLineDash([]); g.globalAlpha = 1; }
          g.font = font(10.5); const lb = L.ref && L.its.find(i => i.life && i.lv === 0), onBar = lb && atLv(lb) && (lb._al ?? 1) >= 0.5;   // (a person's lane: while his bar is drawn, his name is on it – not twice)
          const nm = (onBar ? '' : fitName(g, L.t, Math.max(60, X(L.nb) - X(L.na)))[0]) + (TP.fOn ? `${onBar ? '' : ' · '}${L.nPass || 0} found` : ''); const tw = g.measureText(nm).width;
          const room = Math.min(W, k + 1 < ls.length ? X(ls[k + 1].L.na ?? ls[k + 1].a) - 6 : W), end = Math.max(xb, room);   // (855a: past a narrow box, up to the next one)
          g.fillStyle = C.mut; if (nm) for (const cp of nameCopies(L, L.na, L.nb, xa, xb, tw, end, W, 4, rowPh(si))) { g.globalAlpha = cp.a * tA; g.fillText(nm, cp.x, top + TT * 0.68); } g.globalAlpha = 1; } }   // (1023a)
      // how far a label may run on (807a): to the next item in its row, and never into the next lane of the slot
      const stop = k + 1 < ls.length ? X(ls[k + 1].a) - 6 : W + 4000;
      const cutX = new Map(), byLv = new Map(), lean = L.dense && bhL < 7;   // (854a: bars sharing a row – overlapping books – cut where the next one begins; the persons' thin rows need none of it)
      if (!lean) for (const it of vis) { if (it.fr) continue; const k = Math.round(it._y ?? it.row) + '|' + (it.lv ?? 'm'); if (!byLv.has(k)) byLv.set(k, []); byLv.get(k).push(it); }
      for (const r of byLv.values()) { r.sort((p, q) => p.t0 - q.t0); r.forEach((it, j) => { const nx = r[j + 1]; if (nx && nx.t0 < it.t1) cutX.set(it, X(nx.t0)); }); }
      const byRow = new Map(); if (!lean) for (const it of vis) { if (it._al < 0.5 || it.fr) continue; const r = Math.round(it._y ?? it.row); if (!byRow.has(r)) byRow.set(r, []); byRow.get(r).push(it); }
      const nextX = new Map(); for (const r of byRow.values()) { r.sort((p, q) => p.t0 - q.t0); r.forEach((it, j) => nextX.set(it, Math.min(stop, j + 1 < r.length ? X(r[j + 1].t0) - 6 : W + 4000))); }
      g.save(); g.beginPath(); g.rect(0, top - 2, W, h + 4); g.clip();                     // (a lane still growing shows only what fits)
      const free = it => it.fr && it._bw != null, boxH = it => Math.max(bhL, (it._spE || 1) * rl - (rl - bhL));
      {                                                   // (1047a, 1048a: its exact time marked on the life bar, and a bending line to its box)
        for (const it of vis) { if (!free(it) || (it._al ?? 1) < 0.02) continue; const yl = top + TT + 3 + (it.fr._y ?? it.fr.row ?? 0) * rl;
          const a = X(it.t0), b = Math.max(X(it.t1), a + 2), xm = (a + b) / 2, yy = top + TT + 3 + (it._y ?? it.row) * rl;
          const bx = X((it.t0 + it.t1) / 2) + it._dx, cx = Math.min(Math.max(xm, bx + 6), bx + it._bw - 6), sel = TP.sel?.it === it, col = it.anc ? C.acc : C.acc2;
          if (Math.max(bx + it._bw, b) < -20 || Math.min(bx, a) > W + 20 || yy < RH - 400 || yl > H) continue;
          g.globalAlpha = (it.pass === false ? 0.15 : 0.9) * (it._al ?? 1); g.fillStyle = col; g.fillRect(a, yl + bhL - Math.min(3, bhL / 2), b - a, Math.min(3, bhL / 2));
          g.strokeStyle = sel ? C.fg : col; g.lineWidth = sel ? 1.8 : 1; g.globalAlpha = (it.pass === false ? 0.12 : sel ? 0.95 : 0.6) * (it._al ?? 1);
          const y0 = yl + bhL, y1 = yy, m = (y1 - y0) * 0.5; g.beginPath(); g.moveTo(xm, y0); g.bezierCurveTo(xm, y0 + m, cx, y1 - m, cx, y1); g.stroke(); }
        g.globalAlpha = 1; g.lineWidth = 1; }
      for (const it of vis) {
        if (free(it)) { const x0 = X((it.t0 + it.t1) / 2) + it._dx, x1 = x0 + it._bw, yy = top + TT + 3 + (it._y ?? it.row) * rl, hb = boxH(it);
          if (x1 < 0 || x0 > W || yy > H - RB || yy + hb < RH || (it._al ?? 1) < 0.02) continue;
          const ok = (it.pass !== false || TP.cfg.fmode === 'hide') && yy < top + h && (it._al ?? 1) >= 0.5;
          if (ok) TP.hit.push({ x0, x1, y0: yy, y1: yy + hb, it, L });
          drawStBox(g, C, it, x0, x1, yy, hb, bhL, font, ok ? L : null); continue; }
        const x0 = X(it.t0), x1 = Math.max(Math.min(X(it.t1), cutX.get(it) ?? Infinity) - 1, x0 + (L.dense ? 1.5 : 3)), yy = top + TT + 3 + (it._y ?? it.row) * rl, bh = bhL;
        if (x1 < 0 && (lean || nextX.get(it) < 0)) continue; if (x0 > W || yy > H - RB || yy + bh < RH) continue;   // (only what is on the screen)
        if (it.life || it.yrs) drawLife(g, C, it, x0, x1, yy, bh, font, nextX.get(it), W, !!L.dense); else drawItem(g, C, it, x0, x1, yy, bh, font, nextX.get(it), W);
        if ((it.pass !== false || TP.cfg.fmode === 'hide') && yy < top + h && (it._al ?? 1) >= 0.5) TP.hit.push({ x0, x1, y0: yy, y1: yy + bh, it, L });
        if ((it.ev || it.link) && it.pass !== false) centers.push({ it, x: (Math.max(x0, 0) + Math.min(x1, W)) / 2, y: yy + bh / 2 });
      }
      g.restore();
    });
  });
  // "Written" (815, 819, 991a): a thin line from the selected item to when its work was written
  if (marks.size && from.length) {
    g.lineWidth = 1; g.strokeStyle = C.mut; g.fillStyle = C.mut;
    const keys = [...marks.keys()];
    for (const f of from) for (const wk of keys) { if (!f.w.startsWith(wk)) continue;
      for (const m of marks.get(wk)) {
        if (Math.max(f.x, m.x) < 0 || Math.min(f.x, m.x) > W || Math.max(f.y, m.y) < RH - 60 || Math.min(f.y, m.y) > H + 60) continue;
        g.globalAlpha = 0.9; g.strokeStyle = g.fillStyle = f.sel ? C.acc : C.mut; g.lineWidth = f.sel ? 1.8 : 1; const hgt = Math.min(22, 5 + Math.abs(m.x - f.x) / 10), c = Math.min(30, Math.abs(m.x - f.x) / 3) * Math.sign(m.x - f.x || 1);
        g.beginPath(); g.moveTo(f.x, f.y); g.bezierCurveTo(f.x + c, f.y - hgt, m.x - c, m.y - hgt, m.x, m.y); g.stroke();
        g.beginPath(); g.arc(m.x, m.y, 1.8, 0, 7); g.fill(); } }
    g.globalAlpha = 1;
  }
  // the same event in several places: one colour, joined by lines (786)
  const byEv = new Map(); for (const c of centers) if (c.it.ev) { const k = c.it.ev.toLowerCase(); if (!byEv.has(k)) byEv.set(k, []); byEv.get(k).push(c); }
  g.lineWidth = 1.6;
  for (const [k, cs] of byEv) { if (cs.length < 2) continue; g.strokeStyle = `hsla(${evHue(k)},60%,50%,.75)`;
    cs.sort((p, q) => p.y - q.y || p.x - q.x); for (let i = 1; i < cs.length; i++) { const p = cs[i - 1], q = cs[i]; g.beginPath(); g.moveTo(p.x, p.y);
      if (Math.abs(p.y - q.y) < 2) { const h = Math.min(26, 6 + Math.abs(q.x - p.x) / 6); g.bezierCurveTo(p.x, p.y - h, q.x, q.y - h, q.x, q.y); }   // (the same row: an arc above)
      else g.bezierCurveTo(p.x, (p.y + q.y) / 2, q.x, (p.y + q.y) / 2, q.x, q.y); g.stroke(); } }
  // the cursor
  if (TP.cur != null) { const x = X(TP.cur); g.strokeStyle = C.acc; g.lineWidth = 1.5; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x, RH); g.lineTo(x, H - RB); g.stroke(); g.setLineDash([]); }
  g.restore();
  // ---- rulers (fixed at the top and at the bottom – 994a); 995: a chevron at the right end of the lowest top row and of the highest bottom row
  g.fillStyle = C.bar; g.fillRect(0, 0, W, RH); g.fillRect(0, H - RB, W, RB);
  const chev = (y, h, up) => { const cx = W - 11, cy = y + h / 2; g.strokeStyle = C.mut; g.lineWidth = 1.5; g.beginPath();
    if (up) { g.moveTo(cx - 5, cy + 2.5); g.lineTo(cx, cy - 2.5); g.lineTo(cx + 5, cy + 2.5); } else { g.moveTo(cx - 5, cy - 2.5); g.lineTo(cx, cy + 2.5); g.lineTo(cx + 5, cy - 2.5); } g.stroke(); g.lineWidth = 1; };
  let ry = 0; TP.chevT = TP.chevB = null;
  rulers.forEach((r, k) => { const last = k === rulers.length - 1; drawRuler(g, C, r.id, ry, r.h, W, X, A0, A1, emps, font, last ? 22 : 0);
    if (last) { chev(ry, r.h, !TP.cfg.rcoll); TP.chevT = [ry, ry + r.h]; } ry += r.h; });
  if (RH) { g.strokeStyle = C.line; g.beginPath(); g.moveTo(0, RH - 0.5); g.lineTo(W, RH - 0.5); g.stroke(); }
  let by = H - RB;
  rulersB.forEach((r, k) => { drawRuler(g, C, r.id, by, r.h, W, X, A0, A1, emps, font, k === 0 ? 22 : 0);
    if (k === 0) { chev(by, r.h, !!TP.cfg.rcollB); TP.chevB = [by, by + r.h]; } by += r.h; });
  if (RB) { g.strokeStyle = C.line; g.beginPath(); g.moveTo(0, H - RB + 0.5); g.lineTo(W, H - RB + 0.5); g.stroke(); }
  // links of consular dates to the consul ruler (782a)
  const cosR = rulers.findIndex(r => r.id === 'cos'), cosB = rulersB.findIndex(r => r.id === 'cos');
  if (cosR >= 0 || cosB >= 0) { const cy = cosR >= 0 ? rulers.slice(0, cosR).reduce((s, r) => s + r.h, 0) + rulers[cosR].h : H - RB + rulersB.slice(0, cosB).reduce((s, r) => s + r.h, 0);
    g.strokeStyle = C.acc2; g.globalAlpha = 0.5; g.setLineDash([2, 3]);
    for (const c of centers) if (c.it.link && c.y > RH && c.y < H - RB) { g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(c.x, cy); g.stroke(); }
    g.setLineDash([]); g.globalAlpha = 1; }
  if (TP.cur != null) { const x = X(TP.cur); g.strokeStyle = C.acc; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, RH); g.moveTo(x, H - RB); g.lineTo(x, H); g.stroke(); }
  if (TP.focusY != null && TP.sel?.it && !TP.pin) {                  // (zooming with something selected: it is held exactly at its place – also in the persons' thin rows)
    const h = TP.hit.find(h => h.it === TP.sel.it); if (h) { const d = (h.y0 + h.y1) / 2 - TP.focusY; if (Math.abs(d) > 0.5) { TP.sy += d; tmpClampY(); TP.prevLay = null; TP.moving = true; } } }
  if (TP.pin?.rel && (!TP.moving || Date.now() - TP.pin.relT > 1500)) TP.pin = null;           // (a pinch let go: held until what glides has settled)
  if (TP.moving) tmpRedraw();                              // (until every height has reached its value)
}
function drawStBox(g, C, it, x0, x1, y, h, bh, font, L) {      // (1050a, 1054c: a statement's box – as wide as its words; its time is on the life bar)
  const sel = TP.sel?.it === it, dim = it.pass === false, fa = it._al ?? 1, base = it.anc ? C.acc : C.acc2, fs = Math.max(9, Math.min(11, bh - 2));
  g.globalAlpha = fa * (dim ? 0.5 : 1); g.fillStyle = C.bg; roundRect(g, x0, y, x1 - x0, h, 4); g.fill();   // (an opaque ground: the other statements' lines pass behind it)
  g.globalAlpha = (dim ? 0.07 : sel ? 0.75 : it.anc ? 0.5 : 0.3) * fa; g.fillStyle = base; roundRect(g, x0, y, x1 - x0, h, 4); g.fill();
  if (dim) { g.globalAlpha = 1; return; }
  g.globalAlpha = fa; if (sel) { g.strokeStyle = C.fg; g.lineWidth = 1.6; roundRect(g, x0, y, x1 - x0, h, 4); g.stroke(); }
  if (TP.fOn && it.pass && !sel) { g.strokeStyle = C.acc; g.lineWidth = 1.6; roundRect(g, x0 - 0.5, y - 0.5, x1 - x0 + 1, h + 1, 4); g.stroke(); }
  if (it.read || it.st?.inf) { g.strokeStyle = it.read ? '#c0392b' : C.acc; g.lineWidth = 1; g.setLineDash([3, 2]); roundRect(g, x0, y, x1 - x0, h, 4); g.stroke(); g.setLineDash([]); }
  if (it._lab === false || bh < 8) { g.globalAlpha = 1; g.lineWidth = 1; return; }
  const nA = sm(bh, 8, 10); g.fillStyle = C.fg;
  if (it._exL && h > bh + 2) {                                    // (opened: all of it, and the card's buttons)
    g.save(); g.beginPath(); g.rect(x0, y, x1 - x0, h); g.clip(); let yy = y + 6;
    for (const l of it._exL) { const f = l.k === 's' ? fs - 1.5 : fs; g.font = (l.k === 'h' ? 'bold ' : l.k === 'q' ? 'italic ' : '') + font(f); g.fillStyle = C.fg; g.globalAlpha = fa * (l.k === 's' ? 0.72 : 1);
      yy += l.k === 's' ? f + 3 : f + 4; g.fillText(l.t, x0 + 6, yy - 3); }
    let bx = x0 + 6; const by = y + h - fs - 14; g.font = font(fs - 1);
    for (const [lab, act] of stInfo(it).B) { const w = g.measureText(lab).width + 12; if (bx + w > x1 - 4) break;
      g.globalAlpha = fa * 0.9; g.strokeStyle = C.fg; g.lineWidth = 1; roundRect(g, bx, by, w, fs + 8, 4); g.stroke(); g.fillStyle = C.fg; g.fillText(lab, bx + 6, by + fs + 2);
      if (L) TP.hit.push({ x0: bx, x1: bx + w, y0: by, y1: by + fs + 8, it, L, btn: act }); bx += w + 6; }
    g.restore(); g.globalAlpha = 1; g.lineWidth = 1; return; }
  const f2 = it._st2 ? sm(bh, 30, 36) : 0; g.font = font(fs); g.globalAlpha = fa * nA;
  if (f2 > 0) { const y1 = y + (bh - (fs + fs - 1.5 + 3)) / 2 + fs; g.fillText(it._stTxt || it.lab, x0 + 6, y1 - 1); g.font = font(fs - 1.5); g.fillStyle = C.fg; g.globalAlpha = fa * nA * f2 * 0.75; g.fillText(it._st2, x0 + 6, y1 + fs + 1); }
  else g.fillText(it._stTxt || it.lab, x0 + 6, y + bh / 2 + fs * 0.36);
  g.globalAlpha = 1; g.lineWidth = 1;
}
function drawItem(g, C, it, x0, x1, y, h, font, lim = Infinity, W = 1e9) {
  const sel = TP.sel?.it === it, dim = it.pass === false;
  const base = it.ev ? `hsl(${evHue(it.ev.toLowerCase())},55%,52%)` : it.kind === 'own' ? C.acc : it.kind === 'office' ? C.acc : it.kind === 'st' ? (it.anc ? C.acc : C.acc2) : it.kind === 'date' ? C.acc2 : C.acc2;
  const alpha = dim ? 0.07 : it.kind === 'book' ? 0.28 : it.kind === 'st' ? (it.anc ? 0.5 : 0.3) : it.kind === 'life' || it.kind === 'cite' || it.kind === 'word' ? 0.22 : it.kind === 'work' ? 0.25 : it.uneven ? 0.2 : 0.38;
  // fuzzy ends: a gradient fading out
  const grd = g.createLinearGradient(x0, 0, x1, 0), w = Math.max(1, x1 - x0), fw = Math.min(0.45, 24 / w);
  const nil = clear(base); grd.addColorStop(0, it.fa ? nil : base); grd.addColorStop(it.fa ? fw : 0, base); grd.addColorStop(it.fb ? 1 - fw : 1, base); grd.addColorStop(1, it.fb ? nil : base);
  const fa = it._al ?? 1;                                     // (843a: a part growing out of its bar, or folding back into it)
  g.globalAlpha = (sel ? 0.75 : alpha) * fa; g.fillStyle = grd; roundRect(g, x0, y, x1 - x0, h, 4); g.fill(); g.globalAlpha = fa;
  if (dim || it._lab === false || h < 8) { g.globalAlpha = 1; return; }  // (too thin for a name: none, 1056); (while folding: only the level more than half there keeps its names)
  if (it.kind === 'date' || it.kind === 'own' || sel) { g.strokeStyle = sel ? C.fg : base; g.lineWidth = sel ? 1.6 : 1; roundRect(g, x0, y, x1 - x0, h, 4); g.stroke(); }
  if (TP.fOn && it.pass && !sel) { g.strokeStyle = C.acc; g.lineWidth = 1.6; roundRect(g, x0 - 0.5, y - 0.5, x1 - x0 + 1, h + 1, 4); g.stroke(); }   // (848a: what passes the filter, outlined)
  if (it.uneven || it.read || it.st?.inf) { g.strokeStyle = it.read ? '#c0392b' : C.acc; g.setLineDash([3, 2]); roundRect(g, x0, y, x1 - x0, h, 4); g.stroke(); g.setLineDash([]); }   // (983a: a misprint's reading; an inference: dotted)
  if (it.blood && !it.fb) { g.fillStyle = '#b3261e'; g.globalAlpha = fa * 0.85; g.fillRect(Math.max(x0, x1 - 5), y, Math.min(5, x1 - x0), h); g.globalAlpha = fa; }   // (920a: a violent end – the bar ends in red)
  // the label, once: at the bar's start – or, while the bar runs on past the screen's left edge, held at that edge, and pushed
  // off with the bar's end; past a short bar it may run on up to the next item in its row (807a)
  const fs = Math.max(9, Math.min(11, h - 2)); g.font = font(fs);   // (rows pinched small: smaller type)
  const fz = it.fa ? Math.min(0.45 * Math.max(1, x1 - x0), 24) : 0;   // (1039a: a faded start – the name begins after it)
  const nl = nameLay(g, it.lab, !!it.ref, x0, x1, fz, 4, Math.min(Math.max(x1 - 3, lim), W + 2000), W), txt = nl.txt, tw = nl.tw;
  g.fillStyle = C.fg;
  const cps = nameCopies(it, it.t0, it.t1, x0, x1, tw, nl.end, W, 4, rowPh(it._y ?? it.row), fz, nl.so);
  const nA = sm(h, 8, 10); for (const cp of cps) { g.globalAlpha = fa * cp.a * nA; g.fillText(txt, cp.x, y + h / 2 + fs * 0.36); }
  if (!cps.length && nl.cx != null) { const cut = cutName(g, txt, nl.cr); if (cut) { g.globalAlpha = fa * nA; g.fillText(cut, nl.cx, y + h / 2 + fs * 0.36); } }
  g.globalAlpha = 1;
}
// 998a: a life bar in three degrees. Far: a plain bar – the origin's colour at its start, imperial purple from the accession, a red end.
// Middle: the offices as coloured segments inside it, events ticked above, works below. Near: symbols and short labels with the
// witness's dot (filled: the ancient text itself; a ring: Smith repeating a source; half: Smith, no source named).
const clear = c => /^#[0-9a-f]{6}$/i.test(c) ? c + '00' : /^#[0-9a-f]{3}$/i.test(c) ? c + '0' : /^hsl\(/.test(c) ? c.replace(/^hsl\((.*)\)$/, 'hsla($1,0)') : 'transparent';   // (a fuzzy end fades in its own colour)
const PURPLE = '#7b3fa0', ORIG = { 'orig:greek': '#2f6db5', 'orig:roman': '#b03a2e' };
const origCol = r => { const o = (r || []).find(x => x.startsWith('orig:')); return o ? ORIG[o] || `hsl(${evHue(o)},45%,45%)` : null; };
const lifeDeg = () => TP.ppy < 1.5 ? 0 : TP.ppy < 20 ? 1 : 2;
// 1035a: what each degree adds fades in with the zoom itself, never all at once – half there halfway (and back as you zoom out)
const degF1 = () => sm(TP.ppy, 1.2, 1.8), degF2 = () => sm(TP.ppy, 16, 24);
const TS_ST = new Map(), TS_WANT = new Set();
function tsWant(P) {                                              // (the near degree: a person's statements, loaded when first in view)
  if (TS_ST.has(P) || TS_WANT.has(P)) return; TS_WANT.add(P);
  tsStatements(P).then(L => { TS_ST.set(P, L || []); TS_WANT.delete(P); tmpRedraw(); }).catch(() => TS_WANT.delete(P));
}
const TS_SYM = { born: '*', died: '†', wrote: '✎', 'wrote-against': '✎', killed: '⚔', 'killed-by': '⚔', 'took-part': '•', 'event-date': '•', attested: '·', honour: '★', 'place-active': '•', floruit: '•', phase: '•' };
// 1020b, 1021: the ages along a life bar as you zoom in – ticks, and their numbers where the bar is tall enough; counted from the
// birth, "ca." and fainter where the birth is only estimated; none where the start itself is unknown
function lifeAges(g, C, it, x0, x1, y, h, font, W, avoid) {
  const f1 = degF1() * sm(h, 8, 10); if (f1 <= 0 || h < 5 || /start unknown/.test(it.note || '')) return;
  const est = !!it.fa, X = a => (a - TP.x0) * TP.ppy, minS = est ? 54 : 40, AST = [1, 2, 5, 10, 20, 25, 50];
  const st = AST.find(s => s * TP.ppy >= minS * 0.6); if (!st) return;
  g.font = font(8); const fN = degF2() * sm(h, 11, 13);   // (the numbers only when zoomed in in time as well)
  // 1035a: finer ticks fade in between the coarser ones as the room for them grows; their numbers once there is room to read them
  for (let age = st; it.t0 + age < it.t1 - 0.01; age += st) { const x = X(it.t0 + age); if (x < -30 || x > W + 30) continue;
    const lv = AST.reduce((m, s) => age % s === 0 ? s : m, st) * TP.ppy, base = (est ? 0.35 : 0.6) * (it._al ?? 1);
    g.globalAlpha = base * f1 * sm(lv, minS * 0.6, minS * 0.85); g.fillStyle = C.fg; g.fillRect(x - 0.5, y + h - 3, 1, 3);
    const aN = fN * sm(lv, minS * 0.85, minS); if (aN <= 0) continue; const lab = (est ? 'ca. ' : '') + age, w = g.measureText(lab).width;
    if (avoid.some(([a, b]) => x + 2 < b && x + 2 + w > a)) continue; g.globalAlpha = base * aN; g.fillText(lab, x + 2, y + h - 2.5); }
  g.globalAlpha = 1;
}
function drawLife(g, C, it, x0, x1, y, h, font, lim, W, dense) {
  const sel = TP.sel?.it === it || (TP.sel?.it?.P && TP.sel.it.P === it.P && it.pop), dim = it.pass === false, fa = it._al ?? 1, X = a => (a - TP.x0) * TP.ppy, f1 = degF1(), f2 = degF2();
  if (it.yrs) {                                                   // 997b(i): only the years the article mentions – faint, dashed
    g.globalAlpha = (dim ? 0.06 : sel ? 0.8 : 0.32) * fa;
    if (x1 - x0 < 14) { g.fillStyle = C.mut; g.fillRect(x0, y + (h > 6 ? 1 : 0), x1 - x0, Math.max(1, h - (h > 6 ? 2 : 0))); }   // (too short for dashes)
    else { g.strokeStyle = C.mut; g.lineWidth = Math.max(1, h - (h > 6 ? 2 : 0)); g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x0, y + h / 2); g.lineTo(x1, y + h / 2); g.stroke(); g.setLineDash([]); g.lineWidth = 1; }
    g.globalAlpha = fa;
  } else if (it.nojoin && it.alts) {                              // 1058a: the statements disagree and none is preferred – only the datings, faint, no life
    g.globalAlpha = (dim ? 0.06 : sel ? 0.8 : 0.35) * fa; g.strokeStyle = C.acc2; g.lineWidth = Math.max(1, h - (h > 6 ? 2 : 0)); g.setLineDash([4, 3]);
    for (const [a, b] of it.alts) { const xa = X(a), xb = Math.max(X(b), xa + 2); g.beginPath(); g.moveTo(xa, y + h / 2); g.lineTo(xb, y + h / 2); g.stroke(); }
    g.setLineDash([]); g.lineWidth = 1; g.globalAlpha = fa;
  } else {
    const base = C.acc2, w = Math.max(1, x1 - x0); let fill = base;
    if ((it.fa || it.fb) && w > 30) { const nil = clear(base), grd = g.createLinearGradient(x0, 0, x1, 0), fw = Math.min(0.45, 24 / w); fill = grd;   // (fuzzy ends – where there is room to see them)
      grd.addColorStop(0, it.fa ? nil : base); grd.addColorStop(it.fa ? fw : 0, base); grd.addColorStop(it.fb ? 1 - fw : 1, base); grd.addColorStop(1, it.fb ? nil : base); }
    g.globalAlpha = (dim ? 0.07 : sel ? 0.7 : dense ? 0.42 : 0.3) * fa; g.fillStyle = fill; g.fillRect(x0, y, x1 - x0, h); g.globalAlpha = (dim ? 0.15 : 1) * fa;
    for (const sg of it.segs || []) {                             // the reigns always (purple from the accession); offices from the middle degree on
      if (sg[2] === 'off' && f1 <= 0) continue; const a = Math.max(X(sg[0]), x0), b = Math.min(Math.max(X(sg[1]), X(sg[0]) + 2), x1); if (b <= a) continue;
      g.fillStyle = sg[2] === 'emp' ? PURPLE : sg[2] === 'caesar' ? '#b58ad0' : sg[2] === 'king' ? '#8a6d1d' : C.acc; g.globalAlpha = (dim ? 0.15 : sg[2] === 'off' ? 0.7 * f1 : 0.9) * fa;
      if (sg[2] === 'off') g.fillRect(a, y + h * 0.25, b - a, Math.max(1, h * 0.5)); else g.fillRect(a, y, b - a, h); }
    const oc = origCol(it.roles); if (oc && !it.fa) { g.fillStyle = oc; g.globalAlpha = (dim ? 0.15 : 0.9) * fa; g.fillRect(x0, y, Math.min(4, x1 - x0), h); }
    if (it.blood && !it.fb) { g.fillStyle = '#b3261e'; g.globalAlpha = (dim ? 0.15 : 0.9) * fa; g.fillRect(Math.max(x0, x1 - 5), y, Math.min(5, x1 - x0), h); }
    if (f1 > 0 && !dim) for (const [t, k, anc] of it.ticks || []) { const x = X(t); if (x < x0 - 1 || x > x1 + 1) continue;   // events above, works below
      g.fillStyle = anc ? C.acc : C.fg; g.globalAlpha = 0.75 * fa * f1; if (k === 'w') g.fillRect(x - 0.6, y + h - 1, 1.2, 3); else g.fillRect(x - 0.6, y - 2, 1.2, 3); }
    g.globalAlpha = fa;
    if (sel) { g.strokeStyle = C.fg; g.lineWidth = 1.4; g.strokeRect(x0, y, x1 - x0, h); g.lineWidth = 1; }
    if (TP.fOn && it.pass && !sel && h >= 5) { g.strokeStyle = C.acc; g.lineWidth = 1.4; g.strokeRect(x0 - 0.5, y - 0.5, x1 - x0 + 1, h + 1); g.lineWidth = 1; }
  }
  if (dim || it._lab === false || h < 8) { g.globalAlpha = 1; return; }
  const nA = sm(h, 8, 10);                                          // (1035a: the name fades in as its row grows)
  // the name: its copies fixed on the bar, one drawn at a time (1017b–1019a)
  const fs = Math.max(8.5, Math.min(11, h - 3)); g.font = font(fs); const end = Math.min(Math.max(x1 - 3, lim), W + 2000);
  const fz = !it.yrs && it.fa && x1 - x0 > 30 ? Math.min(0.45 * (x1 - x0), 24) : 0;   // (the birth unknown: the names begin after its faded part)
  const nl = nameLay(g, it.lab, true, x0, x1, fz, 5, end, W), nm = nl.txt, tw = nl.tw;       // (the longest form of the name that fits)
  const cps = nameCopies(it, it.t0, it.t1, x0, x1, tw, nl.end, W, 5, rowPh(it._y ?? it.row), fz, nl.so), p = cps[0]?.x ?? -1e9;
  if (!it.yrs && !it.nojoin) lifeAges(g, C, it, x0, x1, y, h, font, W, cps.map(c => [c.x - 3, c.x + tw + 3]));
  g.font = font(fs); g.fillStyle = C.fg; for (const cp of cps) { g.globalAlpha = fa * nA * cp.a; g.fillText(nm, cp.x, y + h / 2 + fs * 0.36); }
  if (!cps.length && nl.cx != null) { const cut = cutName(g, nm, nl.cr); if (cut) { g.globalAlpha = fa * nA; g.fillText(cut, nl.cx, y + h / 2 + fs * 0.36); } }
  g.globalAlpha = fa;
  if (f2 <= 0 || it.yrs || !it.P) { g.globalAlpha = 1; return; }
  const L = it.sts || TS_ST.get(it.P); if (!L) { tsWant(it.P); g.globalAlpha = 1; return; }
  const ms = []; for (const c of L) { if (!TS_SYM[c.p] || c.st === 'rejects' || c.alt) continue; const tm = tsTime(c); if (!tm) continue; const x = X((tm[0] + tm[1]) / 2); if (x < Math.max(x0, 0) || x > Math.min(x1, W) || (x > p - 4 && x < p + tw + 6)) continue; ms.push({ x, c }); }   // (not over the name)
  ms.sort((a, b) => a.x - b.x); g.font = font(8.5);
  ms.forEach((m, k) => { const c = m.c, cls = tsWitCls(c), r = 2.3, cy = y + h / 2, nx = k + 1 < ms.length ? ms[k + 1].x : x1;
    if (k && m.x - ms[k - 1].x < 9) return;
    g.globalAlpha = fa * f2; g.fillStyle = C.fg; g.fillText(TS_SYM[c.p], m.x - 3, cy + 3.5);
    g.beginPath(); g.arc(m.x + 6, cy - h / 2 + 3, r, 0, 7); g.strokeStyle = C.acc; g.lineWidth = 1;   // (the witness: filled, ring, half)
    if (cls === 'anc') { g.fillStyle = C.acc; g.fill(); } else if (cls === 'rep' || c.e?.[4]?.length) g.stroke(); else { g.stroke(); g.beginPath(); g.arc(m.x + 6, cy - h / 2 + 3, r, Math.PI / 2, Math.PI * 1.5); g.fillStyle = C.acc; g.fill(); }
    const lab = tsLab(c).slice(0, 22), lw = g.measureText(lab).width; if (nx - m.x - 12 > lw + 4) { g.fillStyle = C.mut; g.fillText(lab, m.x + 10, cy + 3.5); } });
  g.globalAlpha = 1;
}
// a name as long as there is room for it: in full, then its first form (before "or"), then without the rest after the comma
// ("CONSTANTINUS I., FLAVIUS VALERIUS AURELIUS or Constantine the Great" → "Constantinus I.") – Smith's capitals in ordinary case
const ROMANUM = /^(?:[IVXL]+\.?|[IVXL]+[,.]?)$/;
const tcase = s => s.replace(/[A-ZÀ-Þ][A-ZÀ-Þ'’]{2,}\.?/g, w => ROMANUM.test(w) ? w : w[0] + w.slice(1).toLowerCase());
const NAMEF = new Map();
function nameForms(lab) {
  let f = NAMEF.get(lab); if (f) return f; const full = tcase(String(lab || '')), first = full.split(/\s+or\s+/)[0], bare = first.split(/,\s*/)[0];
  f = [...new Set([full, first, bare])]; NAMEF.set(lab, f); return f; }
// a bar too short for even the shortest form of its name: as much of it as fits ("Mag" for Magnentius), at the bar's start
// 1043a: a name stays inside its box whenever the box can hold it (copies only where all of it fits; a box showing too little of
// itself: as much of the name as fits, from where the box comes into view); only a box too short for its name lets it run on
// past its end (807a), from its start. → the form of the name, its width, how far it may reach, and where a shortened one stands
function nameLay(g, lab, forms, x0, x1, fz, pad, end, W) {
  const x00 = x0 + fz + pad, inEnd = x1 - 3, fit = r => forms ? fitName(g, lab, r) : [lab, g.measureText(lab).width];
  const sw = g.measureText(forms ? nameForms(lab).slice(-1)[0] : lab).width;
  if (inEnd - x00 >= sw) { const [txt, tw] = fit(Math.min(inEnd, W) - Math.max(x00, 0) - 2), cx = Math.max(x00, 4);
    return { txt, tw, end: inEnd, cx: cx < W ? cx : null, cr: Math.min(inEnd, W) - cx - 2 }; }
  const [txt, tw] = fit(Math.min(end, W) - Math.max(x00, 0) - 2);
  return { txt, tw, end, so: true, cx: x00 >= 0 ? x00 : null, cr: Math.min(end, W) - x00 - 2 };
}
function cutName(g, txt, room) { if (g.measureText(txt.slice(0, 2)).width > room) return ''; let n = txt.length; while (n > 2 && g.measureText(txt.slice(0, n)).width > room) n--; return txt.slice(0, n); }
function fitName(g, lab, room) { const fs = nameForms(lab); for (const n of fs) { const w = g.measureText(n).width; if (w <= room) return [n, w]; } const n = fs[fs.length - 1]; return [n, g.measureText(n).width]; }
// 1017b–1019a: a name is never pinned to the screen. It stands at points fixed on its bar – the start, then every so many years
// (at most two thirds of a screen apart, so one always fits) – and moves with the bar; of the copies that fit whole on the screen only the one nearest
// the middle of the bar's visible part is drawn; when another comes nearer the middle it takes over, crossfading
const NSTEP = [0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
// 1036a–1038a: neighbouring rows take turns between three positions (ph = 0, ⅓, ⅔ of the spacing), so names of bars that begin
// in the same year never stand in one column; still fixed on the bar – the row, not the view, decides the shift
const rowPh = r => (((Math.round(r) || 0) % 3) + 3) % 3 / 3;
function nameCopies(o, t0, t1, x0, x1, tw, end, W, pad = 5, ph = 0, fz = 0, so = false) {   // (so: a box too short for its name – only from its start)   // (fz: the fuzzy start's width – no name over it)
  const X = a => (a - TP.x0) * TP.ppy, A0 = TP.x0, A1 = TP.x0 + W / TP.ppy, c = (Math.max(x0, 0) + Math.min(x1, W)) / 2, lim = Math.min(W, end), x00 = x0 + fz + pad;
  // 1040: the copy shown stays as long as it is more than 7 px from both edges of the pane – only there it gives way to another
  const M = 7, free = x => x >= M && x + tw <= Math.min(lim, W - M), seen = x => x >= 0 && x + tw <= lim;
  const xs = x00 + ph * Math.max(0, Math.min(x1 - 3, end) - x00 - tw);   // (1037a: a short bar – shifted within the room it has left)
  const xOf = (t, k) => k === 's' ? xs : k === 'b' ? x00 : Math.max(X(t) + (Math.abs(t - t0) < 1e-9 ? pad : 2), x00);
  let best = null;
  if (o._nt != null && o._nk && !(so && o._nk !== 'b') && o._nt >= t0 - 1e-6 && o._nt <= t1 + 1e-6) { const x = xOf(o._nt, o._nk); if (free(x)) best = { t: o._nt, x, k: o._nk }; }
  const pick = ok => { let b = null, si = NSTEP.length - 1; while (si > 0 && NSTEP[si] * TP.ppy > 0.67 * W) si--;
    for (; !so && si >= 0 && !b && NSTEP[si] * TP.ppy >= 24; si--) {   // (where a bar shows too little of itself for these points, the finer ones between them)
      const step = NSTEP[si], n = Math.floor((t1 - t0) / step - ph + 1e-9);
      for (let k = Math.max(0, Math.floor((A0 - t0) / step - ph) - 1); k <= Math.min(n, Math.ceil((A1 - t0) / step) + 1); k++) {
        const t = t0 + (k + ph) * step, x = xOf(t, 'g'); if (!ok(x)) continue;
        const d = Math.abs(x + tw / 2 - c); if (!b || d < b.d) b = { t, x, d, k: 'g' }; } }
    if (!b && x0 >= 0) { if (ph && !so && ok(xs)) b = { t: t0 + 1e-7, x: xs, k: 's' }; else if (ok(x00)) b = { t: t0, x: x00, k: 'b' }; }   // (no room on screen for that: its start)
    return b; };
  if (!best) best = pick(free) || pick(seen);                       // (the new one: clear of the edges too, where there is one)
  if (best) { o._nk = best.k; o._tw = tw; } o._lim = Math.min(lim, W);
  const now = performance.now();
  if ((best?.t ?? null) !== (o._nt ?? null)) { o._pt = o._nt ?? null; o._px = o._nx; o._pT = now; o._nt = best?.t ?? null; }
  if (best) o._nx = best.x - X(best.t);                     // (its offset from its point: the copy moves with the bar)
  const f = o._pT ? Math.min(1, (now - o._pT) / 220) : 1, out = [];
  if (best) out.push({ x: best.x, a: o._pt == null && o._pT && f < 1 && !o._seen ? 1 : f });
  if (f < 1 && o._pt != null) { out.push({ x: X(o._pt) + (o._px ?? 2), a: 1 - f }); TP.moving = true; }
  if (best) o._seen = true; return out;
}
function roundRect(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function gridStep(ppy) { for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]) if (s * ppy >= 70) return s; return 10000; }
function drawRuler(g, C, id, y, h, W, X, A0, A1, emps, font, chevW = 0) {
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
  if (id === 'jul' && ppy < 150) {                     // (round historical years: 600 BC, 400 BC, 200 BC, AD 1 / 200 …)
    const ys = []; for (let Y = Math.floor((hy(Math.floor(A0)) - st) / st) * st; Y <= hy(Math.ceil(A1)) + st; Y += st) ys.push(Y === 0 ? 1 : Y);
    for (let i = 0; i < ys.length - 1; i++) cell(ax(ys[i]), ax(ys[i + 1]), yTxtS(ys[i]), true); }
  if (id === 'jul' && ppy >= 150) {                    // (zoomed in: months, then days, then hours – and where you are, held at the left)
    for (const c of julCells(A0, A1, ppy)) cell(c.a, c.b, c.lab, c.strong);
    const c = jdToCal(jdOfAx(A0 + 2 / ppy)), ctx = ppy < 6000 ? yTxt(hy(c.y)) : `${ppy >= 150000 ? c.d + ' ' : ''}${MON[c.m - 1]} ${yTxt(hy(c.y))}`;
    g.font = font(10.5); const tw = g.measureText(ctx).width; g.fillStyle = C.bar; g.fillRect(0, y + 1, tw + 10, h - 2); g.fillStyle = C.fg; g.fillText(ctx, 4, y + h - 5); }
  if (id === 'sky') drawSky(g, C, y, h, W, X, A0, A1, font);
  if (id === 'sky2') drawSky2(g, C, y, h, W, X, A0, A1, font);
  if (id === 'anc') drawAncient(g, C, y, h, W, X, A0, A1, font);
  if (id === 'rom') drawRoman(g, C, y, h, W, X, A0, A1, font, cell);
  if (id === 'att') drawAttic(g, C, y, h, W, X, A0, A1, font, cell);
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
  if (id === 'sel') { const s = ppy >= 30 ? 1 : st; for (let n = Math.max(s, Math.floor((A0 + 311) / s) * s); n - 311 < A1 + s; n += s) cell(n - 312 + 0.75, n - 312 + s + 0.75, (s === 1 ? '' : 'SE ') + n, true); }
  if (id === 'dio') { const s = ppy >= 30 ? 1 : st; for (let n = Math.max(s, Math.floor((A0 - 284) / s) * s); n + 283 < A1 + s; n += s) cell(n + 283 + 0.66, n + 283 + s + 0.66, (s === 1 ? '' : 'Diocl. ') + n, true); }
  if (id === 'ind') { if (ppy >= 18) for (let a = Math.max(312, Math.floor(A0)); a < A1 + 1; a++) cell(a + 0.67, a + 1.67, 'ind. ' + (((a - 312) % 15) + 1), (a - 312) % 15 === 0);
    else for (let a = 312 + Math.max(0, Math.floor((A0 - 312) / 15)) * 15; a < A1 + 15; a += 15) cell(a + 0.67, a + 15.67, 'cycle ' + ((a - 312) / 15 + 1), true); }
  g.fillStyle = C.mut; g.globalAlpha = 0.9; g.font = font(9); const nm = name.replace(/ \(.*$/, '');
  g.fillStyle = C.bar; const tw = g.measureText(nm).width; g.fillRect(W - tw - 10 - chevW, y + 1, tw + 8 + chevW, chevW ? h - 2 : 10); g.fillStyle = C.mut; g.fillText(nm, W - tw - 6 - chevW, y + 9);
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
    body.innerHTML = `<div class="tmpbar"><button type="button" class="tmpib" data-tmp="ref" title="Reference systems – which rows stand at the top, in what order" aria-label="Reference systems">${ROD_ICON}</button>`
      + `<button type="button" class="tmpib" id="tmpFiltBtn" data-tmp="filter" title="Filter" aria-label="Filter">${sieveIcon(0, 'tf')}</button>`
      + `<span class="tmpq"><input id="tmpQ" type="search" enterkeyhint="search" placeholder="Find an event …" autocomplete="off" autocapitalize="off" spellcheck="false"><div id="tmpRes" class="tmpres" hidden></div></span>`
      + `<button type="button" data-tmp="add" title="Add your own statement">＋ Statement</button></div>`
      + `<div class="tmprow"><div class="tmpwrap"><canvas id="tmpCanvas"></canvas><div id="tmpNav" class="tmpnav" hidden></div></div><aside id="tmpSide" class="tmppanel tmpside" hidden></aside></div><div id="tmpCard" class="tmpcard" hidden></div><div id="tmpPanel" class="tmppanel" hidden></div>`;
    tmpWire($('#tmpCanvas'));
  }
  const has = Object.values(S.installed || {}).some(d => d.kind === 'fasti');
  if (!has && !$('#tmpHint')) body.querySelector('.tmpwrap').insertAdjacentHTML('afterbegin', `<p class="hint" id="tmpHint">For the consuls, the emperors and the years the books narrate, download “W. Liebenam, Fasti consulares …” and “Tempora – dates read from the library’s texts”: ☰ → Instruments → Suda – Encyclopaedias and Lexica. <button type="button" data-tmpget="1">Download both</button></p>`);
  if (has) $('#tmpHint')?.remove();
  await tmpData(); tmpChipsUpd(); tmpRedraw();
}
const inRef = py => py < (TP.RH || 0) || py > (TP.H || 1e9) - (TP.RB || 0);
function tmpAt(px, py) { const r = inRef(py), dense = h => h.it && (h.it.pop || h.it.yrs);       // (the persons' thin rows: exactly, no margin)
  return TP.hit.slice().reverse().find(h => r === (h.emp != null || h.sky != null) && (dense(h) ? px >= h.x0 - 1 && px <= h.x1 + 1 && py >= h.y0 - 1 && py <= h.y1 + 1 : px >= h.x0 - 3 && px <= h.x1 + 3 && py >= h.y0 - 2 && py <= h.y1 + 2)) || null; }
// zooming while something is selected: it stays where it is on the screen, wherever the fingers or the cursor are
function selPt() { const it = TP.sel?.it; if (!it) return null; const h = TP.hit.find(h => h.it === it); const cv = $('#tmpCanvas'); if (!h || !cv) return null;
  const W = cv.clientWidth, x0 = Math.max(h.x0, 0), x1 = Math.min(h.x1, W); if (x1 < 0 || x0 > W || h.y1 < (TP.RH || 0) || h.y0 > cv.clientHeight - (TP.RB || 0)) return null;
  return { x: (x0 + x1) / 2, y: (h.y0 + h.y1) / 2 }; }
function tmpZoomX(f, px) { const sp = selPt(); if (sp) { px = sp.x; TP.focusY = sp.y; clearTimeout(TP.fyT); TP.fyT = setTimeout(() => { TP.focusY = null; }, 400); }
  const a = TP.x0 + px / TP.ppy; TP.ppy = Math.min(400000, Math.max(0.005, TP.ppy * f)); TP.x0 = a - px / TP.ppy; tmpSave(); tmpRedraw(); }
const BH = lh => Math.max(11, Math.min(lh - 1, Math.max(13, lh - 8)));   // (1026a: rows down to 12 px, bars down to 11 px – still the height of their name in 9 px type)
function tmpZoomY(f) { const sp = selPt(); if (sp) { TP.focusY = sp.y; clearTimeout(TP.fyT); TP.fyT = setTimeout(() => { TP.focusY = null; }, 400); } TP.lh = Math.min(90, Math.max(12, TP.lh * f)); tmpSave(); tmpRedraw(); }
// what lies at the height y of the screen as last drawn: a slot, and how many of its rows down (or, in its name strip, pixels)
function tmpPinAt(y) { const P = TP.lastLay, TT = P?.TT ?? 14; if (!P || !P.slots.length) return { key: null, d0: 0 };
  const cy = y - (P.RH + 6) + P.sy, p = P.slots.find(s => cy < s.off + s.hs + 4) || P.slots[P.slots.length - 1], d = cy - p.off - TT - 3;
  return d <= 0 ? { key: p.key, d0: cy - p.off, rho: null } : { key: p.key, d0: null, rho: d / (p.rh || TP.lh) }; }
function tmpClampY() { const cv = $('#tmpCanvas'); const max = Math.max(0, (TP.contentH || 0) - 40, TP.over || 0);   // (the lowest lane can be pulled up to the top)
  TP.sy = Math.min(max, Math.max(-(TP.under || 0), TP.sy)); TP.over = Math.min(TP.over || 0, TP.sy); TP.under = Math.max(0, Math.min(TP.under || 0, -TP.sy)); }   // (TP.under: room left above the first lane by an anchoring – it closes as you scroll)   // (TP.over: how far the header has grown over the lanes)
function tmpWire(cv) {
  new ResizeObserver(() => tmpRedraw()).observe(cv);
  let down = null, pinch = null, moved = false, lastTap = 0;
  const pair = () => [...TP.ptr.values()].slice(0, 2);
  // 1027b–1032a: two fingers zoom both ways at once – across: time, up and down: the rows – each by how far the fingers move apart
  // in that direction; what they took hold of (the spot between them, or the selected item) keeps its place relative to them,
  // so moving them together pans in any direction meanwhile. Each frame is worked out from where the pinch began (1029a)
  const pinchStart = () => { const [p, q] = pair(), m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, sp = selPt(), h = sp && TP.hit.find(h => h.it === TP.sel.it), f = sp || m;
    pinch = { dx: Math.abs(p.x - q.x), dy: Math.abs(p.y - q.y), ppy: TP.ppy, lh: TP.lh, m, f, a: TP.x0 + f.x / TP.ppy };
    // what the fingers hold: the selected item; else the bar nearest the point between them (its parts may open or fold meanwhile),
    // and only where there is none, the row of the lanes there
    const near = sp ? null : TP.hit.filter(x => x.it && x.L && Math.abs((x.y0 + x.y1) / 2 - f.y) < 40 && f.x >= x.x0 - 60 && f.x <= x.x1 + 60)
      .sort((p, q) => Math.abs((p.y0 + p.y1) / 2 - f.y) - Math.abs((q.y0 + q.y1) / 2 - f.y))[0];
    TP.pin = Object.assign(tmpPinAt(f.y), { ty: f.y, it: sp ? TP.sel.it : near?.it || null, L: (sp ? h?.L : near?.L) || null, rel: false,
      fr: near ? (f.y - (near.y0 + near.y1) / 2) / laneRH(near.L) : 0 }); TP.focusY = null; down = null; moved = true; };
  const ratio = (d, d0, k) => { const c = Math.max(0, k - d0); return (d + c) / (d0 + c); };   // (1028a: fingers set down close together in that direction: gentler)
  cv.addEventListener('pointerdown', e => { if (TP.ptr.size >= 2) return;                  // (a third finger: ignored)
    cv.setPointerCapture(e.pointerId); TP.ptr.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (TP.ptr.size === 1) { down = { x: e.offsetX, y: e.offsetY, x0: TP.x0, ly: e.offsetY, arm: true }; moved = false; TP.pin = null; }
    if (TP.ptr.size === 2) pinchStart(); });
  cv.addEventListener('pointermove', e => { if (!TP.ptr.has(e.pointerId)) return; TP.userMove = Date.now(); TP.ptr.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pinch && TP.ptr.size === 2) { const [p, q] = pair(), m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      TP.ppy = Math.min(400000, Math.max(0.005, pinch.ppy * ratio(Math.abs(p.x - q.x), pinch.dx, 60)));
      TP.lh = Math.min(90, Math.max(12, pinch.lh * ratio(Math.abs(p.y - q.y), pinch.dy, 120)));   // (up and down gentler still)
      TP.x0 = pinch.a - (pinch.f.x + m.x - pinch.m.x) / TP.ppy; TP.pin.ty = pinch.f.y + m.y - pinch.m.y;
      tmpSave(); tmpRedraw(); return; }
    if (!down) return; const dx = e.offsetX - down.x;
    if (down.arm) { if (Math.abs(dx) + Math.abs(e.offsetY - down.y) <= 6) return;            // (6 px before it moves – and then from there, without a jump)
      Object.assign(down, { x: e.offsetX, y: e.offsetY, x0: TP.x0, ly: e.offsetY, arm: false }); moved = true; return; }
    TP.x0 = down.x0 - dx / TP.ppy; TP.sy += down.ly - e.offsetY; down.ly = e.offsetY; tmpClampY(); tmpSave(); tmpRedraw(); });
  const up = e => { if (!TP.ptr.has(e.pointerId)) return; TP.ptr.delete(e.pointerId);
    if (pinch && TP.ptr.size === 1) { const [r] = TP.ptr.values(); down = { x: r.x, y: r.y, x0: TP.x0, ly: r.y, arm: true }; }   // (1031a: the other finger carries on as a drag)
    if (TP.ptr.size < 2) { pinch = null; if (TP.pin) { TP.pin.rel = true; TP.pin.relT = Date.now(); } }   // (1057a: held until what glides has settled – 1.5 s at most)
    if (down && !moved && TP.ptr.size === 0) { const now = Date.now();
      if (now - lastTap < 300) { TP.focusY = selPt()?.y ?? e.offsetY; tmpZoomX(2, e.offsetX); setTimeout(() => { TP.focusY = null; }, 400); lastTap = 0; } else { lastTap = now; tmpTap(e.offsetX, e.offsetY); } }
    if (TP.ptr.size === 0) down = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  let wt = 0;
  cv.addEventListener('wheel', e => { e.preventDefault(); TP.userMove = Date.now(); TP.pin = null;
    if (e.ctrlKey || e.metaKey || e.shiftKey) { TP.focusY = selPt()?.y ?? e.offsetY; clearTimeout(wt); wt = setTimeout(() => { TP.focusY = null; }, 400); }   // (the spot under the cursor stays put)
    if (e.ctrlKey || e.metaKey) tmpZoomX(Math.exp(-e.deltaY / 200), e.offsetX);
    else if (e.shiftKey) tmpZoomY(Math.exp(-e.deltaY / 300));
    else { TP.x0 += e.deltaX / TP.ppy; TP.sy += e.deltaY; tmpClampY(); tmpSave(); tmpRedraw(); } }, { passive: false });
}
function tmpTap(px, py) {
  const W = $('#tmpCanvas').clientWidth;                     // (995: the chevrons fold and unfold – a row's name does not)
  if (px > W - 26 && TP.chevT && py >= TP.chevT[0] && py < TP.chevT[1]) { TP.cfg.rcoll = !TP.cfg.rcoll; tmpSave(); return tmpRedraw(); }
  if (px > W - 26 && TP.chevB && py >= TP.chevB[0] && py < TP.chevB[1]) { TP.cfg.rcollB = !TP.cfg.rcollB; tmpSave(); return tmpRedraw(); }
  const h = tmpAt(px, py);
  if (h?.btn) { const it = h.it;                                  // (an opened statement's buttons)
    if (h.btn === 'all') return tsPanel(it.P); if (h.btn === 'go') return tsGoSt(it.st);
    if (h.btn === 'smith') { const ref = it.ref?.startsWith('people-') ? it.ref : it.fr?.ref; return showPeople().then(() => pplGo({ t: 'person', ref })); } }
  if (h?.it?.fr && h.it.kind === 'st') {                          // 1054c: a statement – its box opens in place (or closes again)
    const k = stKey(h.it); TP.sel = h; TP.cur = null; $('#tmpCard').hidden = true; TP.stx = TP.stx === k ? null : k; tmpHold(py); return tmpRedraw(); }
  if (h?.it?.pop && h.it.P) {                                     // 1052c: a person of the layer – opened in place, beneath his row (a tap again: closed)
    const P = h.it.P, o = TP.cfg.popen = TP.cfg.popen || [], j = o.indexOf(P); TP.sel = h; TP.cur = null; $('#tmpCard').hidden = true; tmpSelWork(null); tsPanel(h.it.ref);
    if (j >= 0) o.splice(j, 1); else o.push(P); tmpSave(); tmpHold(py); tmpData().then(() => tmpRedraw()); return; }
  if (h?.it && (h.it.life || h.it.yrs || h.it.kind === 'life') && h.it.ref) {        // 999a: a life bar – the person's panel; from the persons' layer also his full lane (997a)
    TP.sel = h; TP.cur = null; $('#tmpCard').hidden = true; tmpSelWork(null); tsPanel(h.it.ref);
    if ((h.it.pop || h.it.yrs) && !(TP.cfg.persons || []).includes(h.it.ref)) { const an = tmpAnchorGet(); TP.cfg.persons.push(h.it.ref); tmpSave(); tmpData().then(() => tmpAnchorKeep(an)); return; }
    return tmpRedraw(); }
  if (h?.it) { TP.sel = h; TP.cur = null; tmpCardItem(h); tmpSelWork(h.it.wr ? h.it.wk : tmpWorkOf(h.it)); return; }
  else if (h?.sky) { TP.sel = null; TP.cur = h.sky.jd != null ? axOfJd(h.sky.jd) : null; tmpCardSky(h.sky); }
  else if (h?.emp != null) { const e = TP.data.F.k[h.emp]; TP.sel = null; TP.cur = null; tmpCardEmp(e); }
  else if (inRef(py)) { TP.sel = null; TP.cur = TP.x0 + px / TP.ppy; tmpCardYear(hy(Math.floor(TP.cur))); }   // (a reference row: what that year is called)
  else { TP.sel = null; TP.cur = null; const c = $('#tmpCard'); if (c) c.hidden = true; }                               // (an empty place: nothing opens)
  if (TP.wsel && !TP.sel) return tmpSelWork(null);
  tmpRedraw();
}
function tmpHold(y) { TP.focusY = y; clearTimeout(TP.fyT); TP.fyT = setTimeout(() => { TP.focusY = null; }, 1200); }   // (what was tapped stays where it is while things glide)
function tsGoSt(c) { const loc = c?.e?.[2]; if (!loc) return; const [bk, ...r] = loc.split('.'), wid = c.e[1];
  libGet('works', wid).then(w => { if (!w) return libMenu(wid); const bi = Math.max(0, (w.books || []).indexOf(bk)); pplPassage(wid, bi, r.join('.'), ''); }); }
function tmpSelWork(w) {                                     // 991a: the selected work's dates of writing come in (the selected item stays where it is)
  if ((TP.wsel || null) === (w || null)) return tmpRedraw();
  const an = tmpAnchorGet(); TP.wsel = w || null; tmpAnchorKeep(an);
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
const tmpWorkOf = it => it.go?.w || it.kids?.find(k => k.go?.w)?.go.w || null;   // (the work an item belongs to – for a whole work's bar, from its parts)
function tmpCardItem(h) {
  const it = h.it, c = $('#tmpCard'); c.hidden = false;
  if (it.st) {                                                   // (a statement about a person)
    c.innerHTML = `<div class="tch"><b>${esc(it.st ? it.lab : it.lab + ' – life (estimated)')}</b><button type="button" data-tmpclose="1" aria-label="Close">✕</button></div>`
      + (it.st ? tsCard(it) : `<p>${esc(rangeTxt(it.t0, it.t1))} <small>(estimated)</small>${it.blood ? ' · <b>violent end</b>' : ''}</p><p class="hint small">${esc(it.note)}</p>`)
      + `<p class="tact"><button type="button" data-tsall="${it.P}">All about ${esc(tsName(TS_IX?.p?.[it.P]?.[0] || 'the person'))}</button>${it.st?.e?.[0] === 'texts' ? `<button type="button" data-tsgo="1">Open the passage</button>` : ''}${it.ref?.startsWith('people-') ? `<button type="button" data-tmpperson="${esc(it.ref)}">Smith’s article</button>` : ''}</p>`;
    return; }
  c.innerHTML = `<div class="tch"><b>${esc(it.lab)}</b><button type="button" data-tmpclose="1" aria-label="Close">✕</button></div>`
    + `<p>${esc(rangeTxt(it.t0, it.t1))}${it.fa || it.fb ? ' <small>(vague)</small>' : ''} · <span class="hint">${esc(it.src || '')}</span></p>`
    + (it.text ? `<p class="gk tmptext">${esc(it.text)}</p>` : '') + (it.note ? `<p class="hint">${esc(it.note)}</p>` : '')
    + (() => { const w = it.wr ? null : tmpWorkOf(it), rs = w ? WRITTEN.filter(r => w.startsWith(r[0]) || (r[0].startsWith(w) && it.lv === 0)) : [];   // (991a, 992a: each date of writing with its source)
      return rs.length ? `<div class="tswr"><b>Written</b>${rs.map(r => `<p class="small">${esc(r[2] == null ? 'after ' + yTxt(r[1]) : rangeTxt(ax(r[1]), ax(r[2]) + 1))} · <b>${esc(r[3])}</b> · <span class="hint">${esc(WSRC.find(x => x[0] === r[6])?.[1] || r[6])}</span><br><small class="hint">${esc(r[4])}</small></p>`).join('')}</div>` : ''; })()
    + (it.wr && it.wn > 1 ? `<p class="tact">${TP.cfg.wpick?.[it.wk] ? `<button type="button" data-tmpwpick="" data-wid="${esc(it.wk)}">Show all its dates of writing</button>` : `<button type="button" data-tmpwpick="${esc(it.wlab)}" data-wid="${esc(it.wk)}">Show only this date for this work</button>`}</p>` : '')
    + `<p class="tact">${it.go?.w && TP.instW?.has(it.go.w) ? `<button type="button" data-tmpgo="1">Open the passage</button>` : ''}${tmpWorkOf(it) ? `<button type="button" data-tmpwork="${esc(tmpWorkOf(it))}">The work’s page</button>` : ''}${it.ref ? `<button type="button" data-tmpperson="${esc(it.ref)}">Person page</button>` : ''}`
    + `${it.place ? `<button type="button" data-tmpmap="1">Show on the map</button>` : ''}${it.own ? `<button type="button" data-tmpedit="${esc(it.own.id)}">Edit</button>` : ''}`
    + `<button type="button" data-tmpyear="${hy(Math.floor(it.t0 + 0.001))}">The year in all systems</button></p>`;
}
async function tmpGo(go) {
  if (!go?.w) return;
  if (go.r) return pplPassage(go.w, go.bi || 0, go.r, '');
  if (!(await libGet('works', go.w))) return libMenu(go.w);       // (not on this device: its page in the library, where it can be downloaded – nothing downloads by itself)
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

// ---------------------------------------------------------------- reference systems (801a): which rows stand at the top, in what order
// the icon: a measuring rod with ticks (802)
const ROD_ICON = '<svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round"><rect x="2.5" y="8.5" width="19" height="7" rx="1.2" stroke-width="1.3"/><path d="M5.5 8.5v3M8.5 8.5v2M11.5 8.5v3.6M14.5 8.5v2M17.5 8.5v3" stroke-width="1.1"/></g></svg>';
function rulerOrder() {                                    // (with the divider '|': above it the top, below it the bottom of the screen)
  const o = (TP.cfg.rorder || RORDER0).filter(id => id === '|' || RULERS.some(r => r[0] === id)); if (!o.includes('|')) o.push('|');
  for (const [id] of RULERS) if (!o.includes(id)) o.splice(o.indexOf('|'), 0, id); return o; }
function tmpDragList(box, onEnd) {                         // rows dragged by their ⠿ into a new order
  let drag = null;
  box.addEventListener('pointerdown', e => { const g = e.target.closest('.tgrip'); if (!g) return; e.preventDefault(); drag = g.closest('.trow'); drag.classList.add('drag'); g.setPointerCapture(e.pointerId); });
  box.addEventListener('pointermove', e => { if (!drag) return;
    const rows = [...box.children].filter(r => r !== drag && r.classList.contains('trow')), after = rows.find(r => e.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
    if (after) box.insertBefore(drag, after); else box.appendChild(drag); });
  const end = () => { if (!drag) return; const d = drag; drag.classList.remove('drag'); drag = null; onEnd(d); };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
}
function tmpRefPanel(keep) {
  const p = $('#tmpSide'); p.hidden = false; const scroll = keep && p.dataset.k === 'ref' ? p.scrollTop : 0; p.dataset.k = 'ref';   // (853a: at the side, like the filter)
  const all = (TP.data?.lanes || []).filter(L => L.have || TP.cfg.all), pin = TP.cfg.lpin || [];
  const order = [...laneOrder(all.filter(L => !TP.cfg.lhide?.[L.id])), ...all.filter(L => TP.cfg.lhide?.[L.id])];
  p.innerHTML = `<div class="tch"><b>Reference systems and lanes</b><button type="button" data-tmpclose="side" aria-label="Close">✕</button></div><p class="hint small">Drag ⠿ to change their order. Above the line: at the top of the screen; below it: at the bottom. The chevron at the end of the row next to the lanes folds them.</p>`
    + `<div class="tref">${rulerOrder().map(id => id === '|' ? `<div class="trow tdiv" data-rid="|"><span class="tgrip" aria-label="Drag">⠿</span><span>▲ at the top · at the bottom ▼</span></div>`
      : `<div class="trow" data-rid="${id}"><span class="tgrip" aria-label="Drag">⠿</span><label><input type="checkbox" data-tmpr="${id}"${TP.cfg.rulers[id] ? ' checked' : ''}> ${esc(RULERS.find(r => r[0] === id)[1])}</label></div>`).join('')}</div>`
    + `<div class="tph tplanes">Lanes</div><p class="hint small">Pinned lanes stay at the top, in your order – drag ⠿ to place a lane (it and those above it are pinned), or pin it. The others follow the text being read, then what passes the filter, then time. Lanes that do not meet in time share a level.</p>`
    + `<div class="tlanes">${order.map(L => { const pi = pin.includes(L.id), hid = !!TP.cfg.lhide?.[L.id];
        return `<div class="trow${hid ? ' off' : ''}" data-lid="${esc(L.id)}"><span class="tgrip" aria-label="Drag">⠿</span><label><input type="checkbox" data-tmplh="${esc(L.id)}"${hid ? '' : ' checked'}> ${esc(L.t)}${isFinite(L.a) ? ` <small class="hint">${esc(rangeTxt(L.a, L.b))}</small>` : ''}</label><button type="button" class="tpin${pi ? ' on' : ''}" data-tmppin="${esc(L.id)}">${pi ? 'Pinned' : 'Pin'}</button></div>`; }).join('')}</div>`
    + (pin.length ? `<p><button type="button" data-tmpunpin="1">Unpin all</button></p>` : '');
  p.scrollTop = scroll;
  tmpDragList(p.querySelector('.tref'), () => { TP.cfg.rorder = [...p.querySelectorAll('.tref .trow')].map(r => r.dataset.rid); tmpSave(); tmpRedraw(); });
  tmpDragList(p.querySelector('.tlanes'), d => { const ids = [...p.querySelectorAll('.tlanes .trow')].map(r => r.dataset.lid); TP.cfg.lpin = ids.slice(0, ids.indexOf(d.dataset.lid) + 1).filter(id => !TP.cfg.lhide?.[id]);
    tmpSave(); tmpRedraw(); tmpRefPanel(true); });
}

// ---------------------------------------------------------------- the filter (803a, 844a–852a): texts, persons, places, words
// Like a shop's filter: choices of one kind combine with "or" (Socrates or Plato), different kinds with "and" (Socrates … in
// Diogenes Laertius); a chip set to "not" leaves its items out. What does not pass is dimmed or hidden; what passes is outlined.
// The filter stands at the side of the timeline (not over it); its chips stand in the bar under the top bar.
const tfold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f\u0342\u0343\u0345]/g, '').toLowerCase().replace(/ς/g, 'σ').replace(/j/g, 'i').replace(/[^a-zα-ω0-9]+/g, ' ');   // (accents, case, ς/σ, j/i ignored)
const FCAT = { work: 'text', book: 'text', person: 'person', pset: 'person', place: 'place', word: 'word', pkind: 'kind', wit: 'wit', time: 'time' };
const FCATN = { text: 'Texts', person: 'Persons', place: 'Places', word: 'Words', kind: 'Kinds', wit: 'Witnesses', time: 'Time' };
const FCAT1 = { text: 'text', person: 'person', place: 'place', word: 'word', kind: 'kind', wit: 'witness', time: 'time' };
const WITN = [['anc', 'An ancient text itself'], ['hb', 'Modern handbooks – Teuffel, Schanz, Christ'], ['smith', 'Smith’s Dictionary – read by the helpers'], ['rep', 'A view Smith reports (another author’s)'], ['rule', 'Lists and rules – the fasti, Smith’s years by rule, cross-references'], ['yrs', 'Smith’s index – only the years an article mentions']];
function itWit(it) {                                               // the witnesses an item rests on (993a)
  if (it.st) return [tsWitCls(it.st)]; if (it.yrs) return ['yrs']; if (it.life) return it.wit || it.wit2 || [];
  if (it.sid === 'liebenam') return ['rule'];
  if (it.wr && it.wso) return [it.wso === 'claim' ? 'anc' : it.wso === 'smith' ? 'smith' : 'hb'];   // (1010a: the dates of writing by their witness)
  return [];
}
const itKinds = it => it._k ??= new Set([...(it.roles || it.par?.roles || []), ...((it.segs || it.par?.segs || []).some(x => x[2] === 'emp') ? ['off:emperor'] : []), ...(it.sk || []).map(k => 'sk:' + k)]);
function fMatch(it, f) {
  const txt = () => it._t ??= tfold([it.full, it.lab, it.text, it.note, it.own?.note].filter(Boolean).join(' '));
  switch (f.t) {
    case 'work': return it.go?.w === f.v || (it.go?.w || '').startsWith(f.v + '.') || it.own?.src?.w === f.v || (it.lw && f.v.startsWith(it.lw)) || fRelHit(it, f, f.v);
    case 'book': return (it.go?.w === f.v.w && it.go?.bi === f.v.bi) || fRelHit(it, f, f.v.w);
    case 'person': return it.ref === f.v;                                         // (852a: only what is tied to him)
    case 'place': return it.place?.id === f.v || (f.keys || []).some(k => k.length > 2 && txt().includes(k));
    case 'word': return it.word === f.v || (f.keys || []).some(k => k.length > 2 && txt().includes(k));
    case 'pkind': { const k = itKinds(it); return k.has(f.v) || (f.v === 'off:emperor' && k.has('role:emperor')); }
    case 'wit': return itWit(it).includes(f.v);
    case 'time': return it.t1 > f.v[0] && it.t0 < f.v[1];
    case 'pset': return !!it.P && ((TP.psetC ??= {})[f.v] ??= new Set(TS_IX?.sets?.[f.v]?.p || [])).has(it.P);
  }
  return true;
}
// a text in the filter brings with it all that has to do with it: the persons it speaks of (Smith's citations of it, the
// statements read from it) – their bars, and of their statements those read from this text
const FREL = new WeakMap();
function fRelHit(it, f, w) {
  if (it.st) return String(it.st.e?.[1] || '').startsWith(w) && (f.t !== 'book' || !f.bl || String(it.st.e?.[2] || '').split('.')[0] === f.bl);
  if (!it.ref || !f.rel) return false; let set = FREL.get(f); if (!set) FREL.set(f, set = new Set(f.rel)); return set.has(it.ref);
}
async function fRelOf(f) {
  const w = f.t === 'work' ? f.v : f.v.w, bi = f.t === 'book' ? f.v.bi : null, refs = new Set();
  const wk = (await libGet('works', w).catch(() => null)) || S.catWork?.[w], bl = bi != null && wk?.books?.[bi] != null ? String(wk.books[bi]).replace(/^Book /, '') : null;
  const sd = S.installed?.['people-smith'];
  if (sd) { const r = await pplRec(sd, 'w:' + w).catch(() => null); for (const [b, , i] of r?.r || []) if (bi == null || b === bi) refs.add('people-smith|' + i); }
  const ix = await tsIx(); if (ix?.wk) for (const [rec, books] of Object.entries(ix.wk)) { if (!rec.startsWith(w) && !w.startsWith(rec)) continue;
    for (const [b, Ps] of Object.entries(books)) if (bi == null || b === bl || b === '#' + bi) for (const P of Ps) refs.add(tsRefOf(P)); }
  f.rel = [...refs]; if (bl) f.bl = bl; FREL.delete(f); return f;
}
function fNorm(fl) {                                              // 1001a: every chip after the first has its word – or, and, not (older filters: by kind)
  fl.forEach((f, i) => { if (f.op == null) f.op = f.not ? 'not' : !i ? '' : FCAT[f.t] === FCAT[fl[i - 1].t] ? 'or' : 'and'; delete f.not; if (!i && f.op !== 'not') f.op = ''; if (i && !f.op) f.op = 'and'; });
  return fl;
}
function fPass(it, fl) {                                          // read from left to right: ((a or b) and c) and not d
  let r = true;
  fl.forEach((f, i) => { const m = fMatch(it, f); if (!i) r = f.op === 'not' ? !m : m; else if (f.op === 'or') r = r || m; else if (f.op === 'not') r = r && !m; else r = r && m; });
  return r;
}
function tmpFilterApply() {
  const fl = (TP.cfg.flt || []).filter(f => FCAT[f.t]); TP.fOn = fl.length > 0; let n = 0, m = 0; const ms = [];
  for (const L of TP.data?.lanes || []) { L.nPass = 0;
    for (const it of L.its) { if (it.kids) continue; it._lid = L.id; it.pass = !fl.length || fPass(it, fl); n++; if (it.pass) { m++; L.nPass++; if (fl.length) ms.push(it); } }
    for (const it of L.its) if (it.kids) { it._lid = L.id; it.pass = it.kids.some(k => k.pass); } }   // (a book or a work passes when one of its parts does)
  TP.fCount = [m, n]; TP.matches = ms.sort((p, q) => p.t0 - q.t0);
}
function sieveN() { const [m, n] = TP.fCount || [0, 0]; if (!TP.fOn) return 0; return !m ? 7 : Math.min(7, 1 + Math.floor(Math.log2(n / m) + 1e-9)); }
const sideOpen = () => !!$('#tmpSide') && !$('#tmpSide').hidden;
const filtOpen = () => !!document.querySelector('#dlg[open] .tmpfilt');
function tmpChipsUpd() {                                    // the sieve's fill, the pill that steps through the matches, the chips in the filter
  TP.cfg.flt = fNorm((TP.cfg.flt || []).filter(f => FCAT[f.t]));
  const old = TP.cfg.flt.filter(f => (f.t === 'work' || f.t === 'book') && !f.rel);   // (texts chosen before: their persons are looked up once)
  if (old.length) Promise.all(old.map(fRelOf)).then(() => { tmpSave(); tmpChipsUpd(); tmpRedraw(); });
  tmpFilterApply();
  const b = $('#tmpFiltBtn'); if (b) { b.innerHTML = sieveIcon(sieveN(), 'tf'); b.classList.toggle('active', !!TP.fOn); }
  const fl = TP.cfg.flt, [m] = TP.fCount || [0], nav = $('#tmpNav');
  if (nav) { nav.hidden = !fl.length;
    nav.innerHTML = fl.length ? `<button type="button" data-tfnav="-1" aria-label="Previous match">‹</button><button type="button" data-tmp="filter" class="tnc">${TP.mi != null && m ? `${TP.mi + 1} / ` : ''}${m} found</button><button type="button" data-tfnav="1" aria-label="Next match">›</button><button type="button" data-tfnav="all">Show all</button>` : ''; }
  const c = document.querySelector('.tmpfilt .tfchips');
  if (c) c.innerHTML = fl.length ? fl.map((f, i) => chipHTML(f, i)).join('') + `<button type="button" class="tclr" data-tfclear="1">Clear all</button>` : '<p class="hint">Nothing chosen yet – search above, or open a section below.</p>';
}
const chipHTML = (f, i) => `<span class="tchip${f.op === 'not' ? ' not' : ''}" title="${FCATN[FCAT[f.t]]}"><button type="button" class="top${i && f.op !== 'not' ? ' op' : ''}" data-tfop="${i}" title="${i ? 'Tap: or · and · not' : 'Tap: keep these / leave them out'}">${i ? (f.op === 'not' ? 'and not' : f.op) : f.op === 'not' ? 'not' : esc(FCAT1[FCAT[f.t]])}</button><span class="tcl">${i && f.op !== 'not' ? `<small class="hint">${esc(FCAT1[FCAT[f.t]])}</small> ` : ''}${esc(f.lab)}</span><button type="button" class="tx" data-tfrm="${i}" aria-label="Remove">✕</button></span>`;
async function tmpAddWord(w) {                             // a word: the books it occurs in (its lemmas too)
  let keys = [gkey(w)]; try { const A = await analyses(w); keys = [...new Set([gkey(w), ...A.lemmas.map(x => gkey(x.lemma))])]; } catch (_) { }
  return tmpAddFilter({ t: 'word', v: keys[keys.length > 1 ? 1 : 0], keys, lab: w });
}
async function tmpAddFilter(f) {
  const fl = TP.cfg.flt = TP.cfg.flt || [];
  if (fl.some(x => x.t === f.t && JSON.stringify(x.v) === JSON.stringify(f.v))) return;
  delete f.not; f.op = fl.length ? (FCAT[fl[fl.length - 1].t] === FCAT[f.t] ? 'or' : 'and') : '';
  if (f.t === 'work' || f.t === 'book') await fRelOf(f);          // (what the text speaks of comes with it)
  fl.push(f); TP.mi = null;
  TP.cfg.recent = [f, ...(TP.cfg.recent || []).filter(x => !(x.t === f.t && JSON.stringify(x.v) === JSON.stringify(f.v)))].slice(0, 12);
  if (f.t === 'person' && !TP.cfg.persons.includes(f.v)) TP.cfg.persons.push(f.v);   // (a person: also his lane)
  tmpSave(); if (f.t === 'person' || f.t === 'word') await tmpData(); tmpChipsUpd(); tmpRedraw();
  const q = document.querySelector('.tmpfilt [data-tfs="all"]'); if (q) { q.value = ''; document.querySelector('.tmpfilt [data-tfr="all"]').innerHTML = ''; }   // (845a: added – the search is cleared)
  if (filtOpen()) { tmpFilterHead(); tmpFilterSecs(); }
}
function tmpFilterHead() { const h = document.querySelector('.tmpfilt .tfcount'); if (!h) return; const [m, n] = TP.fCount || [0, 0]; h.textContent = TP.fOn ? `${m} of ${n} items pass` : `${n} items in Tempora`; }
async function tmpFilterPanel() {                          // 1001a: search on top; the chips; one-line sections that open
  const works = new Map();                                   // the works Tempora knows something about (for the search)
  for (const L of TP.data?.lanes || []) for (const it of L.its) if (it.go?.w) { const w = works.get(it.go.w) || { id: it.go.w, t: it.src || it.go.w, books: new Map() }; if (it.kind === 'book' || it.kind === 'year') w.books.set(it.go.bi, it.lab.replace(/ ·.*$/, '')); works.set(it.go.w, w); }
  TP.fWorks = works;
  const pr = dialog(dlgHead('Tempora – filter') + `<div class="tmpfilt"><div class="tfhead"><input type="search" data-tfs="all" class="tfq" placeholder="Texts, persons, places, words, events, kinds …" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false">`
    + (S.text?.work ? `<button type="button" class="tfhere" data-tfhere="1" title="The text being read: as the filter, and its years in view">This text</button>` : '') + `</div><div class="tpres" data-tfr="all"></div>`
    + `<div class="tfs"><div class="tph">Your filter <small class="tfcount hint"></small></div><div class="tfchips"></div><p class="hint small">Read from left to right. Tap the word before a chip: <b>or</b> · <b>and</b> · <b>not</b>.</p></div>`
    + `<div class="tfsecs"></div></div>`, [['ok', 'Done']]);
  const dl = $('#dlg'); dl.classList.add('lmdlg'); pr.then(() => dl.classList.remove('lmdlg'));   // (on the whole screen, as the library)
  tmpFilterHead(); tmpChipsUpd(); tmpFilterSecs(); setTimeout(() => document.querySelector('.tmpfilt .tfq')?.focus(), 80);
  await pr; tmpChipsUpd(); tmpRedraw();
}
const fKey = f => f.t + '|' + JSON.stringify(f.v);
async function tmpFilterSecs() {                             // the sections, each one line until opened; a count on every choice, empty ones grey
  const box = document.querySelector('.tmpfilt .tfsecs'); if (!box) return;
  const open = new Set([...box.querySelectorAll('details[open]')].map(d => d.dataset.sec)), fl = TP.cfg.flt || [], on = new Set(fl.map(fKey));
  const ch = (f, lab, n) => { const o = on.has(fKey(f)); return `<button type="button" class="tpadd sm${!n ? ' none' : ''}${o ? ' on' : ''}" data-tfadd="${esc(JSON.stringify(f))}"${o || !n ? ' disabled' : ''}>${esc(lab)} <small class="tfn">${o ? '✓' : n || 0}</small></button>`; };
  const sec = (k, t, sub, body) => `<details class="tfsec" data-sec="${k}"${open.has(k) ? ' open' : ''}><summary>${t}${sub ? ` <small class="hint">${sub}</small>` : ''}</summary><div class="tfsb">${body}</div></details>`;
  const prs = (TP.data?.lanes || []).filter(L => L.dense).flatMap(L => L.its), all = (TP.data?.lanes || []).flatMap(L => L.its.filter(i => !i.kids));
  let h = '';
  // This text: the work, its book, the persons named in it
  const w = S.text?.work; if (w) { const t = (S.catWork?.[w.id]?.author ? S.catWork[w.id].author + ', ' : '') + (w.title || w.id), bl = w.books?.[S.text.bi], out = [];
    out.push(ch({ t: 'work', v: w.id, lab: t }, t, fCount({ t: 'work', v: w.id })));
    if (bl && (w.books?.length || 0) > 1) out.push(ch({ t: 'book', v: { w: w.id, bi: S.text.bi }, lab: t + ' · ' + bl }, bl, fCount({ t: 'book', v: { w: w.id, bi: S.text.bi } })));
    const n = new Map(); for (const x of S.prs?.values() || []) if (x?.pick) n.set(x.pick, (n.get(x.pick) || 0) + 1);
    const ps = []; for (const [ref] of [...n].sort((a, b) => b[1] - a[1]).slice(0, 12)) { const { d, i } = pplParse(ref), r = d && await pplRow(d, i); if (r) ps.push(ch({ t: 'person', v: ref, lab: r.name }, r.name, prs.filter(x => x.ref === ref).length || 1)); }
    h += sec('text', 'This text', esc(t), `<div class="tchips">${out.join('')}</div><p><button type="button" data-tmp="here">Its years in view</button></p>${ps.length ? `<div class="tph">Named in it</div><div class="tchips">${ps.join('')}</div>` : ''}`); }
  // Persons by kind (996a: the emperors first)
  const kn = new Map(); for (const it of prs) for (const k of itKinds(it)) kn.set(k, (kn.get(k) || 0) + 1);
  const emp = prs.filter(it => fMatch(it, { t: 'pkind', v: 'off:emperor' })).length;
  const grp = (pre, t) => { const ks = [...kn].filter(([k]) => pre.some(p => k.startsWith(p))).sort((a, b) => b[1] - a[1]);
    return ks.length ? `<div class="tph">${t}</div><div class="tchips">${ks.slice(0, 40).map(([k, n]) => ch({ t: 'pkind', v: k, lab: k.startsWith('sk:') ? 'Smith: ' + k.slice(3) : TSV(k) }, k.startsWith('sk:') ? k.slice(3) : TSV(k), n)).join('')}</div>` : ''; };
  const sets = Object.entries(TS_IX?.sets || {}).map(([k, x]) => ch({ t: 'pset', v: k, lab: x.t }, x.t, x.p.length));
  const N = TP.popN || {};
  h += sec('pkind', 'Persons by kind', `${N.dated || 0} dated · ${N.yrs || 0} only years · ${N.undated || 0} undated`,
    `<div class="tchips">${ch({ t: 'pkind', v: 'off:emperor', lab: 'Emperors' }, 'Emperors', emp)}</div>` + grp(['role:'], 'Roles') + grp(['off:'], 'Offices') + grp(['orig:', 'gender:', 'status:'], 'Origin, sex, status') + grp(['sk:'], 'Smith’s index (also the persons known only by years)')
    + (sets.length ? `<div class="tph">Read together</div><div class="tchips">${sets.join('')}</div>` : '')
    + `<p class="hint small">${N.undated || 0} persons of Smith’s index have no dates at all – they are not drawn; search their names above to open them.</p>`);
  // Witnesses (993a)
  const wn = new Map(); for (const it of all) for (const k of itWit(it)) wn.set(k, (wn.get(k) || 0) + 1);
  h += sec('wit', 'Witnesses', '', `<div class="tchips tcol">${WITN.map(([k, t]) => ch({ t: 'wit', v: k, lab: t.replace(/ –.*$/, '') }, t, wn.get(k))).join('')}</div>`);
  // Time
  h += sec('time', 'Time', '', `<p class="tftime"><input data-tft="0" placeholder="from: 400 BC" autocomplete="off"> <input data-tft="1" placeholder="to: AD 100" autocomplete="off"> <button type="button" data-tftime="1">Add</button></p><p class="hint small">Years as 400 BC, AD 100, Ol. 87, AUC 300. What overlaps the span passes.</p>`);
  // Display
  const cb = (k, on, t, sub) => `<label class="tpall"><input type="checkbox" data-tmpdisp="${k}"${on ? ' checked' : ''}> ${t}${sub ? ` <small class="hint">${sub}</small>` : ''}</label>`;
  h += sec('disp', 'Display', '', `<div class="tph">What does not pass</div><span class="tmpseg"><button type="button" data-tmpfm="dim" class="${TP.cfg?.fmode !== 'hide' ? 'on' : ''}">Dimmed</button><button type="button" data-tmpfm="hide" class="${TP.cfg?.fmode === 'hide' ? 'on' : ''}">Hidden</button></span>`
    + cb('pop', TP.cfg.pop !== false, 'The persons with dated statements', `${N.dated || 0}, their lives estimated`) + cb('popy', TP.cfg.popy !== false, 'The persons known only by the years Smith’s article mentions', `${N.yrs || 0}, faint and dashed`)
    + cb('libw', !!TP.cfg.libw, 'Your library – authors by century', 'only the author’s century, from the catalogue') + cb('all', !!TP.cfg.all, 'Also works not on this device'));
  // Recent
  const rec = (TP.cfg.recent || []).filter(f => !on.has(fKey(f))).slice(0, 12).map((f, i) => `<button type="button" class="tpadd sm" data-tfrec="${i}">${esc(f.lab)}</button>`);
  h += sec('recent', 'Recent', rec.length ? String(rec.length) : '', rec.length ? `<div class="tchips">${rec.join('')}</div>` : '<p class="hint small">Nothing yet.</p>');
  box.innerHTML = h;
}
async function tmpPersonHits(q, max = 12) {               // as the Suda tab's search: names beginning so
  const k = gkey(q), out = []; if (k.length < 2) return out;
  for (const d of pplPkgs(false)) { const ix = await pplIx(d); if (!ix) continue;
    for (const [key, exact] of nameKeys(ix, k)) for (const i of ix.n[key]) out.push({ d, ix, i, key, exact }); }
  out.sort(pplRank(k));                                     // (as the Suda tab: “Caesar, C. Julius” before “Imp. Caesar …”, the longest articles first)
  const rows = [], seen = new Set();
  for (const x of await pplProminent(out, k)) { const ref = pref(x.d, x.i); if (seen.has(ref)) continue; seen.add(ref); const r = await pplRow(x.d, x.i); if (r) rows.push(r); if (rows.length >= max) break; }
  const ix = TS_IX || await tsIx(); if (ix) for (const [P, r] of Object.entries(ix.p)) if (r[1] == null && rows.length < max + 6 && tfold(r[0]).includes(tfold(q).trim()))   // (our own records: persons Smith has no article on)
    rows.push({ ref: 'tp|' + P, name: tsName(r[0]), d: { id: 'tempora-persons', name: 'Tempora' }, desc: 'read from the texts (no article in Smith)' });
  return rows;
}
const fCount = f => { let n = 0; for (const L of TP.data?.lanes || []) for (const it of L.its) if (!it.kids && fMatch(it, f)) n++; return n; };
const srcName = d => d.id === 'people-smith' ? 'Smith' : d.id === 'people-pir' ? 'PIR' : d.id === 'tempora-persons' ? 'Tempora' : d.id === 'people-suda' || /suda/i.test(d.id) ? 'Suda' : (d.name || '').replace(/^.*?, /, '').slice(0, 24);
let tfT = 0;
async function tmpFilterSearch(t, all) {                    // 1001a: texts, persons, places, words, events, kinds – Enter shows all the results
  const box = t.closest('.tmpfilt')?.querySelector('.tpres'), q = t.value.trim(), k = tfold(q).trim(); if (!box) return;
  if (k.length < 2) { box.innerHTML = ''; return; }
  const fl = TP.cfg.flt || [], has = (ty, v) => fl.some(f => f.t === ty && JSON.stringify(f.v) === JSON.stringify(v)), lim = n => all ? 400 : n;
  const btn = (attrs, inner, n, on) => `<button type="button" class="tpadd${on ? ' on' : ''}${n === 0 ? ' none' : ''}" ${attrs}${on ? ' disabled' : ''}>${inner} <small class="tfn">${on ? '✓ in the filter' : n == null ? '' : n === 0 ? 'nothing dated yet' : n + (n === 1 ? ' item' : ' items')}</small></button>`;
  const sec = (h, rows, more) => rows.length ? `<div class="tfgrp"><span class="tftag">${h}</span>${rows.join('')}${more ? `<p class="hint small">${more}</p>` : ''}</div>` : '';
  const tx = [];                                          // texts and their books
  for (const w of (TP.fWorks || new Map()).values()) { if (tfold(w.t).includes(k)) tx.push(btn(`data-tfw="${esc(w.id)}" data-l="${esc(w.t)}"`, esc(w.t), fCount({ t: 'work', v: w.id }), has('work', w.id)));
    for (const [bi, l] of w.books) if (tx.length < lim(14) && tfold(w.t + ' ' + l).includes(k) && !tfold(w.t).includes(k)) tx.push(btn(`data-tfb="${esc(w.id)}" data-bi="${bi}" data-l="${esc(w.t + ' · ' + l)}"`, `${esc(w.t)} · ${esc(l)}`, fCount({ t: 'book', v: { w: w.id, bi } }), has('book', { w: w.id, bi }))); }
  const prs = await tmpPersonHits(q, all ? 150 : 8).catch(() => []), ps = [], dn = new Map();
  for (const L of TP.data?.lanes || []) if (L.dense) for (const it of L.its) dn.set(it.ref, it);
  for (const r of prs) { const it = dn.get(r.ref), n = it ? (it.pop ? 'dated' : 'years only') : 'no dates';   // (845a: whose, when, how much Tempora has of him)
    ps.push(btn(`data-tfp="${esc(r.ref)}" data-l="${esc(r.name)}"`, `<b>${esc(tsName(r.name))}</b>${r.no ? ` <small>${r.no}</small>` : ''} <small class="ppsrc">${esc(srcName(r.d))}</small>${it ? ` <small class="hint">${esc(rangeTxt(it.t0, it.t1))}</small>` : r.y0 != null ? ` <small class="hint">${esc(yearsTxt(r.y0, r.y1))}</small>` : ''}<br><small class="hint">${esc((r.desc || '').slice(0, 70))}</small>`, null, has('person', r.ref)).replace('<small class="tfn"></small>', `<small class="tfn">${n}</small>`)); }
  let pl = []; if (typeof searchPlaces === 'function') { if (!M.P?.full) await loadPlaceIndex(true).catch(() => null);
    TP.plHits = searchPlaces(q).slice(0, lim(6)); pl = TP.plHits.map((p, i) => { const keys = [...new Set([p.t, ...(p.names || []).map(n => n[0])].map(n => tfold(n).trim()).filter(Boolean).map(k => k.length > 5 ? k.slice(0, -2) : k))];
      return btn(`data-tfpl="${i}"`, `<b>${esc(p.t)}</b> <small class="hint">${esc(typeLabel?.(p) || '')}</small>`, fCount({ t: 'place', v: p.id, keys }), has('place', p.id)); }); }
  const ev = [];                                         // events: what the lanes hold (not the persons' bars – they are under Persons)
  for (const L of TP.data?.lanes || []) { if (L.dense) continue; for (const it of L.its) { if (it.kids || (it.wr && !it.lib)) continue; it._t ??= tfold([it.full, it.lab, it.text, it.note, it.own?.note].filter(Boolean).join(' ')); if (it._t.includes(k)) ev.push(it); } }
  ev.sort((a, b) => a.t0 - b.t0); TP.fEv = ev.slice(0, lim(10));
  const kinds = new Set(); for (const L of TP.data?.lanes || []) if (L.dense) for (const it of L.its) for (const x of itKinds(it)) kinds.add(x);
  const kd = [...kinds].filter(x => tfold(x.startsWith('sk:') ? x.slice(3) : TSV(x)).includes(k)).slice(0, lim(8)).map(x => btn(`data-tfadd="${esc(JSON.stringify({ t: 'pkind', v: x, lab: x.startsWith('sk:') ? 'Smith: ' + x.slice(3) : TSV(x) }))}"`, esc(x.startsWith('sk:') ? 'Smith’s kind: ' + x.slice(3) : TSV(x)), fCount({ t: 'pkind', v: x }), has('pkind', x)));
  if (t.value.trim() !== q) return;
  box.innerHTML = sec('Texts', tx.slice(0, lim(14))) + sec('Persons', ps, !all && prs.length >= 8 ? 'Enter: all the persons of the name' : '') + sec('Kinds', kd) + sec('Places', pl)
    + sec('Events', TP.fEv.map((it, i) => btn(`data-tfev="${i}"`, `${esc(it.full || it.lab)} <small class="hint">${esc(rangeTxt(it.t0, it.t1))}</small>`, null, false)), !all && ev.length > TP.fEv.length ? `${ev.length - TP.fEv.length} more – Enter shows all` : '')
    + sec('Word', [btn(`data-tfword="${esc(q)}"`, `“${esc(q)}” <small class="hint">– the books it occurs in</small>`, null, false)]);
}
document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.dataset?.tfs === 'all') { clearTimeout(tfT); tfT = setTimeout(() => tmpFilterSearch(t, false), 220); }
  if (t.id === 'tmpQ') { clearTimeout(tfT); tfT = setTimeout(() => tmpSearch(t.value, false), 160); }
});
document.addEventListener('keydown', async ev => {
  const t = ev.target; if (ev.key !== 'Enter') return;
  if (t.dataset?.tfs === 'all') { ev.preventDefault(); clearTimeout(tfT); if (!t.value.trim()) return; t.blur(); return tmpFilterSearch(t, true); }   // (1001a: Enter – all the results)
  if (t.id === 'tmpQ') { ev.preventDefault(); tmpSearch(t.value, true); }
});
// 848a: to the matches – all of them, or one after another
function tmpToMatch(it) {
  tmpGoTo(it.t0, it.t1); TP.sel = { it }; TP.cur = null; tmpCardItem({ it }); tmpDraw();
  const y = TP.laneTop?.[it._lid]; if (y != null) { TP.prevLay = null; TP.sy = Math.max(0, y - TP.RH - 40); tmpClampY(); } tmpRedraw();
}

// ---------------------------------------------------------------- the search (806a): events, emperors, consuls
function tmpSearch(q, all) {
  const box = $('#tmpRes'); const k = tfold(q).trim(); if (!box) return;
  if (k.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
  const hits = [], F = TP.data?.F;
  for (const L of TP.data?.lanes || []) for (const it of L.its) { if (it.wr && !it.lib) continue; it._t ??= tfold([it.full, it.lab, it.text, it.note, it.own?.note].filter(Boolean).join(' ')); if (it._t.includes(k)) hits.push({ it, lab: it.full || it.lab, when: rangeTxt(it.t0, it.t1) }); }
  (F?.k || []).forEach((e, j) => { if (tfold(e[0] + ' ' + e[1].join(' ')).includes(k)) hits.push({ emp: j, lab: (e[7] === 'C' ? 'Caesar ' : e[7] === 'U' ? 'Usurper ' : 'Emperor ') + e[0], when: `${e[2]} – ${e[3]}` }); });
  for (const [y, v] of Object.entries(F?.c || {})) { if (y === 'b' || !v) continue; for (const p of [...(v.o || []), ...(v.s || [])]) if (tfold(p[0]).includes(k)) { hits.push({ year: +y, lab: 'Consul ' + p[0] + (p[1] > 1 ? ' ' + ROMN(p[1]) : ''), when: yTxt(+y) }); break; } }
  const shown = all ? hits : hits.slice(0, 12);
  box.hidden = false; TP.srch = shown;
  box.innerHTML = (shown.length ? shown.map((h, i) => `<button type="button" data-tsr="${i}"><span>${esc(h.lab)}</span><small>${esc(h.when)}</small></button>`).join('') : '<p class="hint small">Nothing found.</p>')
    + (!all && hits.length > shown.length ? `<p class="hint small">the first ${shown.length} of ${hits.length} – Enter shows all</p>` : '');
}
function tmpGoTo(t0, t1) {                                 // the timeline moved so that a span is in the middle
  const W = $('#tmpCanvas').clientWidth, span = Math.max(1, t1 - t0);
  if (span * TP.ppy > W * 0.8 || span * TP.ppy < 30) TP.ppy = Math.min(400, Math.max(0.005, W * 0.5 / span));
  TP.x0 = (t0 + t1) / 2 - W / 2 / TP.ppy; tmpSave(); tmpRedraw();
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
  const t = ev.target; if (!t.closest?.('#temporaBody,.tmpfilt')) return;
  const fa = t.closest('a[data-tsf]'); if (fa) { ev.preventDefault(); return tsFact(fa); }
  if (t.closest('#tmpSide .tsencb')) {                          // (the encyclopaedias in the panel: another person – his panel; a passage – the text)
    const pr = t.closest('[data-ppref]'); if (pr) return tsPanel(pr.dataset.ppref);
    const ps = t.closest('[data-pppass]'); if (ps) return pplPassage(ps.dataset.pppass, +ps.dataset.bi, ps.dataset.r, ps.dataset.ref);
    const xr = t.closest('a.pxr'); if (xr) { ev.preventDefault(); await showPeople(); return pplGo({ t: 'search', q: xr.dataset.x }); }
    return; }
  const b = t.closest('button,[data-tmpr],[data-tmpl]'); if (!b) return;
  const D = b.dataset;
  if (D.tmpclose) { if (D.tmpclose === 'side') { $('#tmpSide').hidden = true; } else if (D.tmpclose === 'panel') { $('#tmpPanel').hidden = true; tmpChipsUpd(); } else { $('#tmpCard').hidden = true; TP.sel = null; TP.cur = null; tmpRedraw(); } return; }
  if (D.tmp === 'filter') return tmpFilterPanel();
  if (D.tmp === 'ref') { const p = $('#tmpSide'); if (sideOpen() && p.dataset.k === 'ref') { p.hidden = true; return; } return tmpRefPanel(); }
  if (D.tfop != null) { const i = +D.tfop, f = TP.cfg.flt[i]; f.op = !i ? (f.op === 'not' ? '' : 'not') : ({ or: 'and', and: 'not', not: 'or' })[f.op] || 'and';   // (1001a: or → and → not)
    TP.mi = null; tmpSave(); tmpChipsUpd(); tmpFilterHead(); return tmpRedraw(); }
  if (D.tfadd) { const f = JSON.parse(D.tfadd); return tmpAddFilter(f); }
  if (D.tfhere) { const w = S.text?.work; if (!w) return; const t = (S.catWork?.[w.id]?.author ? S.catWork[w.id].author + ', ' : '') + (w.title || w.id), bl = w.books?.[S.text.bi];   // (993a: one tap)
    await tmpAddFilter(bl && (w.books?.length || 0) > 1 ? { t: 'book', v: { w: w.id, bi: S.text.bi }, lab: t + ' · ' + bl } : { t: 'work', v: w.id, lab: t });
    document.querySelector('#dlgForm [data-v="ok"]')?.click(); return setTimeout(tmpHere, 50); }
  if (D.tftime) { const q = k => document.querySelector(`.tmpfilt [data-tft="${k}"]`)?.value.trim() || '', a = q(0) ? parseWhen(q(0)) : null, z = q(1) ? parseWhen(q(1)) : null;
    if ((q(0) && !a?.y0) || (q(1) && !z?.y0) || (!a && !z)) return toast('The years were not understood.', 3000);
    const t0 = a ? (a.a0 ?? ax(a.y0)) : -1e5, t1 = z ? (z.a1 ?? ax(z.y1 ?? z.y0) + 1) : 1e5; if (t1 <= t0) return toast('The second year must come after the first.', 3000);
    return tmpAddFilter({ t: 'time', v: [t0, t1], lab: `${a ? q(0) : '…'} – ${z ? q(1) : '…'}` }); }
  if (D.tfev != null) { const it = TP.fEv?.[+D.tfev]; if (!it) return; document.querySelector('#dlgForm [data-v="ok"]')?.click(); return setTimeout(() => tmpToMatch(it), 50); }
  if (D.tfnav) { tmpFilterApply(); const ms = TP.matches || []; if (!ms.length) return toast('Nothing passes the filter.');
    if (D.tfnav === 'all') { const a = Math.min(...ms.map(i => i.t0)), z = Math.max(...ms.map(i => i.t1)); TP.mi = null; tmpGoTo(a, z); tmpDraw();
      const tops = ms.map(i => TP.laneTop?.[i._lid]).filter(v => v != null); if (tops.length) { TP.prevLay = null; TP.sy = Math.max(0, Math.min(...tops) - TP.RH - 40); tmpClampY(); } tmpChipsUpd(); return tmpRedraw(); }
    TP.mi = TP.mi == null ? (+D.tfnav > 0 ? 0 : ms.length - 1) : (TP.mi + +D.tfnav + ms.length) % ms.length; tmpChipsUpd(); return tmpToMatch(ms[TP.mi]); }
  if (D.tfrm != null) { const f = TP.cfg.flt.splice(+D.tfrm, 1)[0]; if (f?.t === 'person') TP.cfg.persons = TP.cfg.persons.filter(r => r !== f.v);   // (his lane goes with it)
    TP.mi = null; tmpSave(); if (f?.t === 'word' || f?.t === 'person') await tmpData(); tmpChipsUpd(); tmpFilterHead(); tmpFilterSecs(); tmpRedraw(); return; }
  if (D.tfclear) { const pr = new Set(TP.cfg.flt.filter(f => f.t === 'person').map(f => f.v)); TP.cfg.flt = []; TP.cfg.persons = TP.cfg.persons.filter(r => !pr.has(r));   // (the lanes opened by a tap stay)
    TP.mi = null; tmpSave(); await tmpData(); tmpChipsUpd(); tmpFilterHead(); tmpFilterSecs(); tmpRedraw(); return; }
  if (D.tfword) return tmpAddWord(D.tfword);
  if (D.tfrec != null) { const has = f => (TP.cfg.flt || []).some(x => x.t === f.t && JSON.stringify(x.v) === JSON.stringify(f.v)); const f = (TP.cfg.recent || []).filter(f => !has(f))[+D.tfrec]; if (f) return tmpAddFilter(Object.assign({}, f, { not: false })); return; }
  if (D.tfw) return tmpAddFilter({ t: 'work', v: D.tfw, lab: D.l });
  if (D.tfb) return tmpAddFilter({ t: 'book', v: { w: D.tfb, bi: +D.bi }, lab: D.l });
  if (D.tfp) { const { d, i } = pplParse(D.tfp), e = d && await pplEntry(d, i); const keys = [...new Set((e?.k || []).map(k => k.length > 5 ? k.slice(0, -2) : k))];
    return tmpAddFilter({ t: 'person', v: D.tfp, keys, lab: D.l }); }
  if (D.tfpl != null) { const p = TP.plHits?.[+D.tfpl]; if (!p) return; const keys = [...new Set([p.t, ...(p.names || []).map(n => n[0])].map(n => tfold(n).trim()).filter(Boolean).map(k => k.length > 5 ? k.slice(0, -2) : k))];
    return tmpAddFilter({ t: 'place', v: p.id, keys, lab: p.t }); }
  if (D.tsr != null) { const h = TP.srch?.[+D.tsr]; if (!h) return; $('#tmpRes').hidden = true;
    if (h.it) { tmpGoTo(h.it.t0, h.it.t1); TP.sel = { it: h.it }; TP.cur = null; tmpCardItem({ it: h.it }); }
    else if (h.emp != null) { const e = TP.data.F.k[h.emp]; tmpGoTo(ax(Math.min(e[4], e[6] ?? e[4])), ax(e[5]) + 1); tmpCardEmp(e); }
    else if (h.year != null) { tmpGoTo(ax(h.year), ax(h.year) + 1); TP.cur = ax(h.year) + 0.5; tmpCardYear(h.year); }
    return tmpRedraw(); }
  if (D.tmp === 'add') return tmpEdit(null);
  if (D.tmp === 'here') return tmpHere();
  if (D.tmppin) { const an = tmpAnchorGet(), pin = TP.cfg.lpin = TP.cfg.lpin || [], i = pin.indexOf(D.tmppin); if (i >= 0) pin.splice(i, 1); else pin.push(D.tmppin); tmpSave(); tmpAnchorKeep(an); return tmpRefPanel(true); }
  if (D.tmpunpin) { TP.cfg.lpin = []; tmpSave(); tmpRedraw(); return tmpRefPanel(true); }
  if (D.tmpeclmap && TP.skySel) return tmpEclMap(TP.skySel);
  if (D.tmpwpick != null) { TP.cfg.wpick = TP.cfg.wpick || {}; if (D.tmpwpick) TP.cfg.wpick[D.wid] = D.tmpwpick; else delete TP.cfg.wpick[D.wid];
    tmpSave(); $('#tmpCard').hidden = true; TP.sel = null; await tmpData(); return tmpRedraw(); }
  if (D.tmpz) { const W = $('#tmpCanvas').clientWidth; if (D.tmpz === 'x+') tmpZoomX(1.6, W / 2); if (D.tmpz === 'x-') tmpZoomX(1 / 1.6, W / 2); if (D.tmpz === 'y+') tmpZoomY(1.25); if (D.tmpz === 'y-') tmpZoomY(0.8); return; }
  if (D.tmpgo) return tmpGo(TP.sel?.it?.go);
  if (D.tmpwork) return libMenu(D.tmpwork);
  if (D.tmpperson) { await showPeople(); return pplGo({ t: 'person', ref: D.tmpperson }); }
  if (D.tmpadd) { if (!TP.cfg.persons.includes(D.tmpadd)) TP.cfg.persons.push(D.tmpadd); tmpSave(); await tmpData(); return tmpRedraw(); }
  if (D.tmpedit) return tmpEdit(D.tmpedit);
  if (D.tsall) return tsPanel(D.tsall);
  if (D.tslane) { const an = tmpAnchorGet(), ps = TP.cfg.persons, i = ps.indexOf(D.tslane); if (i >= 0) ps.splice(i, 1); else ps.push(D.tslane);   // (997a: the full lane – opened, closed)
    tmpSave(); await tmpData(); tmpAnchorKeep(an); return tsPanel(D.tslane); }
  if (D.tsloc) return tsOpenLoc(D.tsloc);
  if (D.tsgo) { const c = TP.sel?.it?.st, loc = c?.e?.[2]; if (!loc) return; const [bk, ...r] = loc.split('.'); const wid = c.e[1];
    const w = await libGet('works', wid); if (!w) return libMenu(wid); const bi = Math.max(0, (w.books || []).indexOf(bk)); return pplPassage(wid, bi, r.join('.'), ''); }
  if (D.tmpyear) { TP.cur = ax(+D.tmpyear) + 0.5; tmpCardYear(+D.tmpyear); return tmpRedraw(); }
  if (D.tmpmap) { const p = TP.sel?.it?.place; if (!p) return; toggleMapTab(true); setTimeout(() => { if (p.id != null) selectPlace(p.id); else M.map?.easeTo({ center: [p.lon, p.lat], zoom: 7 }); tmpMapMarkers(); }, 700); return; }
  if (D.tmpget) { for (const id of ['fasti-liebenam', 'chrono-texts']) if (!S.installed?.[id]) queueDownload(id);
    b.disabled = true; b.textContent = 'Downloading …'; const w = setInterval(() => { if (S.installed?.['fasti-liebenam'] && S.installed?.['chrono-texts']) { clearInterval(w); PP.fasti = null; showTempora(); } }, 800); return; }
});
document.addEventListener('change', async ev => {
  const t = ev.target; if (!t.closest?.('#tmpPanel,#tmpSide,.tmpfilt')) return;
  if (t.dataset.tmpr) { TP.cfg.rulers[t.dataset.tmpr] = t.checked; tmpSave(); tmpRedraw(); }
  if (t.dataset.tmplh) { const an = tmpAnchorGet(); TP.cfg.lhide = TP.cfg.lhide || {}; if (t.checked) delete TP.cfg.lhide[t.dataset.tmplh]; else TP.cfg.lhide[t.dataset.tmplh] = 1; tmpSave(); tmpAnchorKeep(an); return tmpRefPanel(true); }
  if (t.dataset.tmpdisp) { const an = tmpAnchorGet(), k = t.dataset.tmpdisp; TP.cfg[k] = t.checked; tmpSave(); if (k === 'pop' || k === 'popy') await tmpData(); tmpChipsUpd(); tmpAnchorKeep(an); return tmpFilterSecs(); }
});
document.addEventListener('pointerdown', ev => { if (!ev.target.closest?.('.tmpq')) { const r = $('#tmpRes'); if (r) r.hidden = true; } });
document.addEventListener('click', async ev => {          // the Suda tab's person page: "Show in Tempora"
  const b = ev.target.closest?.('#peopleBody [data-tmpshow]'); if (!b) return;
  await tmpCfg(); await showTempora();                       // ("Show in Tempora": the person as a filter, with his lane)
  const r = pplParse(b.dataset.tmpshow), rw = r.d ? await pplRow(r.d, r.i) : null, e = r.d ? await pplEntry(r.d, r.i) : null;
  await tmpAddFilter({ t: 'person', v: b.dataset.tmpshow, keys: [...new Set((e?.k || []).map(k => k.length > 5 ? k.slice(0, -2) : k))], lab: rw?.name || 'person' });
  const L = TP.data.lanes.find(l => l.id === 'p:' + b.dataset.tmpshow), its = L?.its || [];
  if (its.length) { const a = Math.min(...its.map(i => i.t0)), z = Math.max(...its.map(i => i.t1)), W = $('#tmpCanvas').clientWidth;
    TP.ppy = Math.min(200, Math.max(0.05, W * 0.7 / Math.max(1, z - a))); TP.x0 = a - W * 0.15 / TP.ppy; TP.sy = 0; TP.prevLay = null; tmpDraw();
    TP.prevLay = null; TP.sy = Math.max(0, (TP.laneTop?.['p:' + b.dataset.tmpshow] ?? 0) - TP.RH - 40); tmpClampY(); tmpSave(); tmpRedraw(); }
});
document.addEventListener('DOMContentLoaded', () => {
  const b = $('#tabTempora'); if (!b) return;
  b.addEventListener('click', () => { if (S.tab === 'tempora') return; showTempora(); });
});
