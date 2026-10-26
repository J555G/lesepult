/* Pult – Tempora (v432; decisions 785–793): the chronograph. Time runs from left to right; reference systems ("rulers": Julian
   years, Olympiads, years of the city by Varro and by Cato, the consuls, the emperors …) stand at the top; below them the lanes:
   what each work narrates (and, with "Written", when it was written – joined to it by a thin line), Diodorus' own years, persons, and your own statements. Each item is what
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
const RULERS = [['jul', 'Julian calendar (BC / AD; Gregorian from 1582)'], ['sky', 'Sky (eclipses, new and full moons, equinoxes, solstices)'], ['sky2', 'Sky (planets meeting, comets, the rising of Sirius)'],
  ['anc', 'Seasons of the ancient authors (Thucydides, Hesiod, Vegetius)'], ['rom', 'Roman calendar (Kalends, Nones, Ides)'], ['att', 'Athenian months (computed)'], ['ol', 'Olympiads'], ['auc', 'Years of the city (Varro, 753 BC)'], ['cato', 'Years of the city (Cato, 752 BC)'],
  ['cos', 'Consuls (Liebenam, 30 BC – AD 565)'], ['emp', 'Emperors and Caesars (Liebenam)'], ['sel', 'Seleucid era (autumn 312 BC)'],
  ['dio', 'Era of Diocletian (29 Aug. 284)'], ['ind', 'Indictions (from 1 Sept. 312)']];
const RULER_ON = { jul: true, sky: true, sky2: true, anc: true, rom: false, att: false, ol: true, auc: true, cato: false, cos: true, emp: true, sel: false, dio: false, ind: false };

async function tmpCfg() {
  if (TP.cfg) return TP.cfg;
  const c = (await setting('tmpCfg')) || {};
  TP.cfg = Object.assign({ rulers: { ...RULER_ON }, hide: {}, persons: [], written: false }, c);
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
    + `<small class="hint">Years as 7777 BC, AD 2026, Ol. 1, AUC 1. Tempora cannot be scrolled or zoomed beyond them.</small> <button type="button" data-tmplimreset="1">Back to the defaults</button>`
    + `<label class="srow1"><span>What the filter leaves out<small class="hint">dimmed: still there, faint · hidden: gone</small></span><span class="tmpseg"><button type="button" data-tmpfm="dim" class="${TP.cfg?.fmode !== 'hide' ? 'on' : ''}">Dimmed</button><button type="button" data-tmpfm="hide" class="${TP.cfg?.fmode === 'hide' ? 'on' : ''}">Hidden</button></span></label>`
    + `<label class="srow1"><span>“Written”: whose dates<small class="hint">for a single work: tap its date and “Show only this date”</small></span><span class="tmpseg">${WSRC.map(([v, l]) => `<button type="button" data-tmpws="${v}" class="${TP.cfg?.wsrc?.[v] !== false ? 'on' : ''}">${l.replace(/ \(1849\)/, '')}</button>`).join('')}</span></label>`
    + `<label class="srow1"><span>“Written”: lines to the date of writing<small class="hint">one from each work, book or passage – with a filter on, one from each passage it shows</small></span><span class="tmpseg">${[['work', 'Work'], ['book', 'Book'], ['passage', 'Passage']].map(([v, l]) => `<button type="button" data-tmpwl="${v}" class="${(TP.cfg?.wlines || 'work') === v ? 'on' : ''}">${l}</button>`).join('')}</span></label></div>`;
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
  const fm = ev.target.closest?.('[data-tmpfm]'); if (fm) { await tmpCfg(); TP.cfg.fmode = fm.dataset.tmpfm; tmpSave(); fm.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === fm)); return tmpRedraw(); }
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
const SM = 'Smith’s Dictionary: ', DIOCL = [284, 305], CONST = [306, 337];
const haSmith = (ids, [y0, y1], who, how) => ids.map(n => [`phi2331.phi${String(n).padStart(3, '0')}`, y0, y1, `Smith: ${how} ${who}`, SM + `this life is ${how} ${who} (reigned ${y0}–${y1}) – the articles Spartianus, Capitolinus, Lampridius`, true, 'smith', `Smith: to ${who}`]);
const COLL = [['phi2331', 'Historia Augusta (Scriptores Historiae Augustae)', 'Hist. Aug.'], ['phi1348.abo', 'Suetonius, Lives of the Caesars', 'Suetonius']];
const WSRC = [['hb', 'Today’s handbooks'], ['claim', 'What the work claims'], ['smith', 'Smith’s Dictionary (1849)']];
const WRITTEN = [
  ['stoa0023.stoa001', 389, 391, 'written c. AD 390', 'finished in Rome about AD 390/391 (the last events narrated: 378)', true, 'hb'],
  ['stoa0023.stoa001', 390, 395, 'Smith: after AD 390', SM + '“composed his history” in Rome; his death “must have happened later than 390, since a reference occurs to the consulship of Neoterius”', true, 'smith'],
  ['phi1351.phi004', 105, 110, 'Histories written c. AD 105–110', 'about AD 105–110, under Trajan', true, 'hb'],
  ['phi1351.phi004', 98, 110, 'Smith: after AD 98', SM + '“The Historiae were written after the death of Nerva, AD 98, and before the Annales”', true, 'smith'],
  ['phi1351.phi005', 114, 120, 'Annals written c. AD 114–120', 'about AD 114–120, under Trajan and Hadrian (Smith: “the work of a mature age”, no year)', true, 'hb'],
  ['phi1348.abo', 119, 122, 'Lives of the Caesars written c. AD 120', 'about AD 119–122: dedicated to Septicius Clarus, praetorian prefect in those years (Smith gives no year)', true, 'hb'],
  ['stoa0121.stoa001', 369, 370, 'written AD 369/370', 'AD 369/370, dedicated to the emperor Valens', false, 'hb'],
  ['stoa0121.stoa001', 364, 378, 'Smith: under Valens', SM + 'composed “by command” of Valens, “to whom it is inscribed” (Valens reigned 364–378)', true, 'smith'],
  ['phi2331', 293, 330, 'written – as it claims (293–330)', 'as the work claims: six authors writing under Diocletian and Constantine', true, 'claim'],
  ['phi2331', 390, 400, 'written – the modern view (c. 395)', 'as now generally held (since Dessau 1889): one author, late 4th century', true, 'hb'],
  ...haSmith([1, 2, 3, 4, 5, 7, 9, 10, 11], DIOCL, 'Diocletian', 'inscribed to'),
  ...haSmith([12, 14, 15, 18, 19, 20], CONST, 'Constantine', 'inscribed to'),
  ...haSmith([17], CONST, 'Constantine', 'addressed to'),
  ['tlg0060.tlg001', -60, -30, 'written c. 60–30 BC', 'about 60–30 BC: thirty years’ work, he says (1.4.1); the last events he mentions are of the 40s–30s BC', true, 'hb'],
  ['tlg0060.tlg001', -8, 1, 'Smith: after 8 BC', SM + 'Scaliger “has made it highly probable that Diodorus wrote his work after the year B. C. 8, when Augustus corrected the calendar”', true, 'smith'],
  ['tlg0081.tlg001', -30, -7, 'written 30–7 BC', 'begun after his arrival in Rome about 30 BC; published 7 BC, twenty-two years later (1.3.4, 1.7.2)', false, 'hb'],
  ['tlg0081.tlg001', -29, -7, 'Smith: 29–7 BC', SM + 'came to Rome “about the middle of Ol. 187, that is, B. C. 29”; “B. C. 7, the year in which he completed and published his great work”', false, 'smith'],
  ['tlg0004.tlg001', 200, 250, 'written c. AD 200–250 (?)', 'probably the first half of the 3rd century AD – uncertain (Smith: “nothing can be said with certainty”)', true, 'hb'],
];
async function tmpData() {
  const cfg = await tmpCfg(), F = await fastiTab(), lanes = [];
  if (!S.catWork) await cachedCatalog().catch(() => null);
  const works = new Map((await libWorks()).map(w => [w.id, w]));
  const wTitle = id => { const w = works.get(id) || S.catWork?.[id]; return w ? `${w.author ? w.author + ', ' : ''}${w.title}` : id; };
  const bookIx = (id, lab) => { const b = (works.get(id) || S.catWork?.[id])?.books || []; const i = b.indexOf(lab); return i < 0 ? 0 : i; };
  {
    // what the books narrate (781a: Ammianus, Tacitus, Suetonius, Historia Augusta, Eutropius)
    for (const [wid, m] of Object.entries(F?.nd || {})) { if (wid === 'b') continue;
      const col = COLL.find(c => wid.startsWith(c[0]));
      if (col) {                                           // (829a: a collection of lives is one lane; the lives are its parts, shown as you zoom in)
        let L = lanes.find(l => l.id === 'col:' + col[0]);
        if (!L) { L = { id: 'col:' + col[0], g: 'Texts – the years they narrate', t: col[1], sh: col[2], its: [], have: false, wid: col[0], col: true, seen: new Set() }; lanes.push(L); }
        const core = wid.split('.').slice(0, 2).join('.'); if (L.seen.has(core)) continue; L.seen.add(core);    // (one edition of each life)
        for (const [, [y0, y1]] of Object.entries(m)) L.its.push({ t0: ax(y0), t1: ax(y1) + 1, lab: (works.get(wid) || S.catWork?.[wid])?.title || wid, kind: 'book', k2: 'narr', sid: 'narr', lv: 1, cw: col[0],
          src: wTitle(wid), go: { w: wid, bi: 0, r: null }, note: 'the years this life narrates' });
        L.have = L.have || works.has(wid); continue;
      }
      const its = Object.entries(m).map(([lab, [y0, y1]]) => ({ t0: ax(y0), t1: ax(y1) + 1, lab: lab === '*' ? 'the life' : lab.replace(/^Book /, 'Book '), kind: 'book', k2: 'narr', sid: 'narr', lv: 1,
        src: wTitle(wid), go: { w: wid, bi: lab === '*' ? 0 : bookIx(wid, lab), r: null }, note: 'the years this part narrates' }));
      lanes.push({ id: 'nd:' + wid, g: 'Texts – the years they narrate', t: wTitle(wid), its, have: works.has(wid), wid });
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
        const byB = new Map(); for (const it of its) { const k = it.go.bi ?? 0; if (!byB.has(k)) byB.set(k, []); byB.get(k).push(it); }   // (the books: the passages grouped)
        for (const [bi, ps] of byB) { const w0 = ps[0].go.w, bl = (works.get(w0) || S.catWork?.[w0])?.books?.[bi];
          its.push({ t0: Math.min(...ps.map(i => i.t0)), t1: Math.max(...ps.map(i => i.t1)), lab: (bl ? (/^\d/.test(bl) ? 'Book ' + bl : bl) : 'Book') + ` · ${ps.length} dates`, kind: 'book', k2: ps[0].k2, sid: lid, lv: 1, kids: ps,
            src: title, go: { w: w0, bi, r: null }, note: 'the dates of this book – zoom in (also vertically) for each' }); }
        lanes.push({ id: 'ch:' + lid, g: 'Texts – the years they narrate', t: title, its, note, have: true, wid: wpre });
      }
    }
    // 822a: levels – the work as one bar, its books (or lives), their passages – shown as there is room, across and up and down
    for (const L of lanes) { if (!L.wid) continue;
      const l1 = L.its.filter(i => i.lv === 1); if (l1.length < 2) { for (const i of L.its) delete i.lv; continue; }
      const l2 = L.its.filter(i => i.lv === 2), bn = l1.map(i => i.lab.match(/^Book (\S+)/)?.[1]);
      L.levels = l2.length ? [0, 1, 2] : [0, 1];
      L.avg = [0, 1, 2].map(k => { const s = L.its.filter(i => i.lv === k); return s.reduce((z, i) => z + i.t1 - i.t0, 0) / Math.max(1, s.length); });
      const s1 = l1.slice().sort((p, q) => p.t0 - q.t0);
      L.its.push({ t0: Math.min(...l1.map(i => i.t0)), t1: Math.max(...l1.map(i => i.t1)), kind: 'book', k2: l1[0].k2, sid: l1[0].sid, lv: 0, lw: L.wid, src: L.t, kids: l2.length ? l2 : l1,
        lab: L.col ? `${l1.length} lives` : bn.every(Boolean) && !l2.length ? `Books ${bn[0]}–${bn[bn.length - 1]}` : `${l1.length} books`, note: 'zoom in – across and up and down – for the parts: ' + s1.map(i => i.lab.replace(/ ·.*$/, '')).join(' · ') });
    }
    // consular dates in the text being read (782a)
    if (S.text?.work && S.consDates?.length) {
      const wid = S.text.work.id, its = S.consDates.map(cd => ({ t0: ax(cd.y), t1: ax(cd.y) + 1, lab: `${(cd.names || []).join(' & ')} consuls`, kind: 'date', k2: 'cdate', sid: 'cdate', link: 'cos:' + cd.y,
        src: wTitle(wid), go: { w: wid, bi: S.text.bi, r: cd.ref }, note: `a consular date at ${cd.ref || '?'} – the consuls of ${yTxt(cd.y)} in Liebenam’s list` }));
      lanes.push({ id: 'cd:' + wid, g: 'Texts – the years they narrate', t: `${wTitle(wid)} – consular dates in ${S.text.work.books?.[S.text.bi] || 'this book'}`, its, have: true });
    }
  }
  // "Written": when each work was written, in its own lane, joined to what it narrates by thin lines (drawn in tmpDraw)
  if (cfg.written) {
    const wl = wid => WRITTEN.filter(([p]) => wid.startsWith(p));
    const src = cfg.wsrc || {}, pick = cfg.wpick || {};                   // (which dates: by source – Settings – and, for a work, the one you chose)
    const short = r => r[6] === 'hb' ? 'written' : r[6] === 'claim' ? 'written (as it claims)' : r[7] || 'Smith';   // (829b: the full text in the card)
    for (const L of lanes) { if (!L.wid) continue;
      let ws = (L.col ? WRITTEN.filter(r => r[0].startsWith(L.wid) || L.wid.startsWith(r[0])) : wl(L.wid)).filter(r => src[r[6]] !== false);
      const all = ws.length, ww = L.its.find(i => i.go?.w)?.go.w;
      if (pick[L.wid] && ws.some(r => r[3] === pick[L.wid])) ws = ws.filter(r => r[3] === pick[L.wid]);
      const groups = new Map();                            // (the same date for several lives: one mark)
      for (const r of ws) { const k = [r[1], r[2], short(r)].join('|'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
      for (const rs of groups.values()) { const [p, y0, y1, lab, note, fz, so] = rs[0], per = L.col && p.length > L.wid.length;
        const names = per ? rs.map(r => L.its.find(i => i.go?.w?.startsWith(r[0]))?.lab).filter(Boolean) : [];
        L.its.push({ t0: ax(y0), t1: ax(y1) + 1, fa: !!fz, fb: !!fz, lab: short(rs[0]), kind: 'work', k2: 'written', wr: true, wks: rs.map(r => per ? r[0] : L.wid), wk: L.wid, wlab: lab, wn: all, lv: per ? 1 : undefined,
          sid: so === 'smith' ? 'people-smith' : 'written', src: WSRC.find(s => s[0] === so)[1] + (so === 'smith' ? '' : ' (Pult’s table)'),
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
      const L = { id: 'wr:lib', g: 'Texts – when they were written', t: 'Your library – when written', its, have: true, levels: [0, 1] };
      L.avg = [0, 100, 0]; lanes.push(L);
    }
  }
  // persons added from the Suda tab
  if (!TP.chrono) { const ch = Object.values(S.installed || {}).find(d => d.kind === 'chrono'); TP.chrono = ch ? (await pplRec(ch, '#s'))?.e || [] : []; }
  for (const ref of cfg.persons || []) {
    const { d, i } = pplParse(ref); if (!d) continue; const r = await pplRow(d, i); if (!r) continue;
    const its = [];
    if (r.y0 != null) its.push({ t0: ax(r.y0), t1: ax(r.y1 ?? r.y0) + 1, fa: true, fb: true, lab: 'years the article mentions', kind: 'life', k2: 'life', sid: d.id, src: d.name, ref });
    for (const o of F?.off.get(ref) || []) {
      if (o[0] === 'emp') { const e = F.k[o[1]]; if (!e) continue;
        if (e[6] != null && e[6] < e[4]) its.push({ t0: ax(e[6]), t1: ax(Math.min(e[4], e[5] + 1)), lab: 'Caesar', kind: 'office', k2: 'office', sid: 'liebenam', src: 'Liebenam', ref });
        if (e[7] !== 'C') its.push({ t0: ax(e[4]), t1: ax(e[5]) + 1, lab: (e[7] === 'U' ? 'usurper ' : 'emperor ') + e[2] + ' – ' + e[3], kind: 'office', k2: 'office', sid: 'liebenam', src: 'Liebenam', ref }); }
      if (o[0] === 'cos') its.push({ t0: ax(o[1]), t1: ax(o[1]) + 1, lab: 'consul' + (o[2] > 1 ? ' ' + ROMN(o[2]) : '') + (o[3] === 's' ? ' suff.' : ''), kind: 'office', k2: 'office', sid: 'liebenam', src: 'Liebenam', ref, link: 'cos:' + o[1] });
    }
    for (const x of TP.chrono || []) if (x[6]?.ref === ref) {     // 799a: what Diogenes Laertius dates in his life
      its.push({ t0: x[1], t1: x[2], fa: !x[6].ol?.[1], fb: !x[6].ol?.[1], lab: `${x[6].kind || 'dated'} · Ol. ${x[6].ol[0]}${x[6].ol[1] ? '.' + x[6].ol[1] : ''}`, kind: 'cite', k2: 'ol', sid: 'diogenes', src: 'Diogenes Laertius' + (x[6].sure ? '' : ' (the life probably his)'),
        go: { w: x[6].w, bi: x[4], r: x[5] }, text: x[6].text, ref, ev: x[6].ev || null }); }
    const e = await pplEntry(d, i);                       // the passages citing him, placed where their book's years are known
    for (const p of e?.ps || []) { const m = F?.nd?.[p[0]]; if (!m) continue; const lab = (works.get(p[0]) || S.catWork?.[p[0]])?.books?.[p[1]];
      const yy = m[lab] || m['*']; if (!yy) continue;
      its.push({ t0: ax(yy[0]), t1: ax(yy[1]) + 1, fa: true, fb: true, lab: p[3], kind: 'cite', k2: 'cite', sid: d.id, src: wTitle(p[0]), go: { w: p[0], bi: p[1], r: p[2] }, ref, note: 'cited by ' + d.name + ' – placed at the years its book narrates' }); }
    lanes.push({ id: 'p:' + ref, g: 'Persons', t: r.name, sh: r.name, its, ref, have: true });
  }
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
    for (const lv of L.levels || [null]) {               // (a lane with levels: rows for each level)
      const ends = [];
      for (const it of L.its.filter(i => lv == null || i.lv == null || i.lv === lv).sort((a, b) => a.t0 - b.t0)) {
        let r = ends.findIndex(e => e <= it.t0 + 1e-6); if (r < 0) { r = ends.length; ends.push(0); } ends[r] = it.t1; it.row = r; if (lv != null) it['row' + lv] = r; }
    }
    for (const it of L.its) it.full = (L.id === 'own' || L.id === 'wr:lib' || it.wr ? '' : sh + ' · ') + it.lab + (L.have ? '' : ' (not on this device)');
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
  return { t0, t1, fa, fb, lab: s.ev || '(untitled)', kind: 'own', k2: 'own', sid: 'own', own: s, src: 'your statement' + (s.src?.title ? ' – ' + s.src.title : ''), ev: s.ev,
    go: s.src?.w ? { w: s.src.w, bi: s.src.bi, r: s.src.r } : null, note: [s.when, s.note].filter(Boolean).join(' · '), place: s.place };
}

// ---------------------------------------------------------------- drawing
function tmpColors() {
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  return { fg: v('--fg'), mut: v('--mut'), line: v('--line'), acc: v('--acc'), acc2: v('--acc2'), card: v('--card'), bar: v('--bar'), bg: v('--bg'), ui: v('--ui') };
}
const evHue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
function tmpLevel(L) {
  if (!L.levels) return null; const w1 = L.avg[1] * TP.ppy; let v = 0;
  if (w1 >= 60 && TP.lh >= 22) v = 1;
  if (v === 1 && L.levels.includes(2) && w1 >= 150 && TP.lh >= 26) v = 2;
  return v;
}
function laneShown(L) { return (L.have || TP.cfg.all) && !TP.cfg.lhide?.[L.id]; }
// 828: the order of the lanes – pinned ones first in your order; then the text being read, what passes the filter, the rest by time
function laneOrder(lanes) {
  const pin = TP.cfg.lpin || [], wid = S.text?.work?.id, cur = L => !!wid && (L.id.endsWith(':' + wid) || L.id.endsWith(wid) || (L.col && wid.startsWith(L.wid)));
  const rank = L => { const p = pin.indexOf(L.id); return p >= 0 ? [0, p] : cur(L) ? [1, 0] : TP.fOn && L.its.some(i => i.pass) ? [2, L.a] : [3, isFinite(L.a) ? L.a : 1e9]; };
  return lanes.map(L => [rank(L), L]).sort((p, q) => p[0][0] - q[0][0] || p[0][1] - q[0][1]).map(x => x[1]);
}
function tmpLayout(A0, A1) {
  // 810a/812a: lanes keep their place; the space before and after a lane is free for others – lanes whose spans do not meet share
  // a slot (packed once over the whole spans, so nothing moves while you pan); a lane with nothing in view thins to a strip
  const hide = TP.cfg.fmode === 'hide', GAP = 2;
  const lanes = laneOrder(TP.data.lanes.filter(laneShown));
  const slots = [];
  for (const L of lanes) {
    if (hide && TP.fOn && !L.its.some(i => i.pass)) continue;           // (hidden: a lane with nothing that passes goes)
    const lvl = tmpLevel(L);                                              // (822a: the finer level once there is room for it, across and up and down)
    if (lvl != null) for (const i of L.its) if (i.lv == null || i.lv === lvl) i.row = i['row' + lvl] ?? i.row;
    const atLv = i => lvl == null || i.lv == null || i.lv === lvl;
    const its = L.its.filter(i => atLv(i) && i.t1 > A0 && i.t0 < A1 && !(hide && !i.pass));
    const a = isFinite(L.a) ? L.a : -1e9, b = isFinite(L.b) ? L.b : 1e9;
    let s = slots.findIndex(S => S.every(M => b + GAP <= M.a || M.b + GAP <= a));
    if (s < 0) { s = slots.length; slots.push([]); }
    const all = L.its.filter(i => atLv(i) && !(hide && !i.pass));            // (its height: the rows of all its items at this level, wherever they are – it changes only as you zoom)
    slots[s].push({ L, a, b, n: all.length ? 1 + Math.max(...all.map(i => i.row)) : 0, its, atLv });
  }
  for (const S of slots) S.sort((p, q) => p.a - q.a);
  return { slots };
}
function rulerHeight(id) { return id === 'emp' ? 14 * (TP.empRowsE || 1) + 6 : id === 'anc' ? 31 : id === 'cos' || id === 'sky' || id === 'sky2' ? 20 : 18; }
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
  // emperor rows (packed once)
  const F = TP.data.F, emps = (F?.k || []).map((e, j) => ({ e, j, a0: ax(Math.min(e[4], e[6] ?? e[4])), a1: ax(e[5]) + 1 })).sort((p, q) => p.a0 - q.a0);
  if (TP.empKey !== F) { TP.empKey = F; TP.empRow = new Map(); const ends = [];   // (packed once: an emperor keeps his row whatever is in view)
    for (const x of emps) { let r = ends.findIndex(v => v <= x.a0); if (r < 0) { r = ends.length; ends.push(0); } ends[r] = x.a1; TP.empRow.set(x.j, r); } }
  for (const x of emps) x.row = TP.empRow.get(x.j);
  TP.empRows = Math.max(1, ...emps.filter(x => x.a1 > A0 && x.a0 < A1).map(x => x.row + 1));   // (the emperors' band follows what is in view – it glides)
  TP.empRowsE = tmpEase('emp', TP.empRows);
  // ---- the reference rows: each fades in or out over its span
  const SPAN = { att: [-700, 400], auc: [-752, 1e9], cato: [-751, 1e9], ol: [-775, 394], cos: [-29, 566], emp: [-62, 566], sel: [-311, 1e9], dio: [284, 1e9], ind: [312, 1e9] };
  const rulers = rulerOrder().filter(id => TP.cfg.rulers[id]).map(id => ({ id, h: rulerHeight(id) }));   // (every row switched on keeps its height – empty outside its span)
  const RH = rulers.reduce((s, r) => s + r.h, 0) + 4;
  TP.RH = RH;
  tmpFilterApply();
  // ---- the lanes: their slots, heights (eased), and where each lies in the scrolled content
  const { slots } = tmpLayout(A0, A1), lh = TP.lh, TT = 14;                 // (TT: the strip with the lane's name, once, at the top of its box)
  const laneH = n => TT + Math.max(0, n) * lh + (n > 0.02 ? 6 : 4);
  const lay = []; let off = 0;
  for (const SL of slots) { const ls = SL.map(r => Object.assign(r, { box: r.L.na < A1 && r.L.nb > A0, h: 0 })).map(r => Object.assign(r, { h: laneH(tmpEase('L:' + r.L.id, r.n)) })), hs = Math.max(8, ...ls.map(r => r.h));
    lay.push({ ls, off, hs, key: ls.map(r => r.L.id).join('|') }); off += hs + 4; }
  TP.contentH = off;
  // anchoring: the point under the fingers or the cursor (or the top of the lanes) keeps its place on screen while heights change
  const P = TP.prevLay;
  if (P && P.slots.length) { const fy = TP.focusY ?? (P.RH + 6), cy = fy - (P.RH + 6) + P.sy;
    const p = P.slots.find(s => cy < s.off + s.hs + 4) || P.slots[P.slots.length - 1], q = p && lay.find(s => s.key === p.key);
    if (q) { const f = Math.min(1, Math.max(0, (cy - p.off) / (p.hs + 4))); TP.sy += (q.off + f * (q.hs + 4)) - (p.off + f * (p.hs + 4)); }
    if (P.sy > 0 && Date.now() - (TP.userMove || 0) < 500) { TP.sy += RH - P.RH; TP.over = Math.max(0, (TP.over || 0) + RH - P.RH); } }   // (only while you move it yourself, and not at the very top)                                                    // (820a: the header grows over the lanes – they stay where they are)
  tmpClampY();
  TP.prevLay = { RH, sy: TP.sy, slots: lay.map(s => ({ key: s.key, off: s.off, hs: s.hs })) };
  const y0 = RH + 6 - TP.sy, centers = [], marks = new Map(), from = [];
  TP.laneTop = {};
  g.save(); g.beginPath(); g.rect(0, RH, W, H - RH); g.clip();
  // year grid
  const step = gridStep(TP.ppy);
  g.strokeStyle = C.line; g.lineWidth = 1; g.globalAlpha = 0.5;
  for (const a of TP.ppy >= 150 ? julCells(A0, A1, TP.ppy).map(c => c.a) : (() => { const r = []; for (let a = Math.ceil(A0 / step) * step; a < A1; a += step) r.push(a); return r; })()) { const x = Math.round(X(a)) + 0.5; g.beginPath(); g.moveTo(x, RH); g.lineTo(x, H); g.stroke(); }
  g.globalAlpha = 1;
  seasonTint(g, X, A0, A1, RH, W, H);
  const nPass = TP.fOn ? lay.reduce((s, l) => s + l.ls.reduce((z, r) => z + r.its.filter(i => i.pass !== false && !i.wr).length, 0), 0) : 0;
  const wmode = TP.fOn && nPass <= 30 ? 'passage' : (TP.cfg.wlines || 'work');   // (815, 821a: per work, book or passage; per passage when a filter leaves few in view)
  const selIt = TP.sel?.it && !TP.sel.it.wr ? TP.sel.it : null;
  lay.forEach(({ ls, off, hs }, si) => {
    const top = y0 + off;
    ls.forEach(({ L, a, b, n, h, its: vis, atLv }, k) => {
      TP.laneTop[L.id] = top + TP.sy;
      const ry = it => n ? top + TT + 3 + Math.min(it.row, n - 1) * lh + (lh - 8) / 2 : top + 3;   // (an item's middle, kept within the lane as drawn)
      if (TP.cfg.written) for (const it of L.its) if (it.wr && atLv(it)) { const m = { x: X(it.t0), y: ry(it), dim: it.pass === false }; for (const wk of it.wks || [it.wk]) { if (!marks.has(wk)) marks.set(wk, []); marks.get(wk).push(m); } }
      if (TP.cfg.written) {                                                   // the items joined to their work's date of writing
        const by = new Map();
        for (const it of L.its) { const w = it.lw || it.go?.w; if (it.wr || !w || !atLv(it) || (TP.fOn && it.pass === false)) continue;
          const kk = wmode === 'passage' ? it : wmode === 'book' ? w + '#' + (it.go?.bi ?? 0) : it.cw || w, o = by.get(kk); if (!o || it.t1 > o.t1) by.set(kk, it); }
        for (const it of by.values()) from.push({ w: it.lw || it.go.w, x: X(it.t1) - 1, y: ry(it), dim: it.pass === false });
        if (selIt && L.its.includes(selIt) && selIt.go?.w) from.push({ w: selIt.go.w, x: X(selIt.t1) - 1, y: ry(selIt), sel: true });   // (821: the tapped one's own line)
      }
      if (top >= H || top + hs <= RH) return;
      // 811a: alternate lanes faintly tinted or outlined – only over the span the lane covers
      if (isFinite(L.na)) { const xa = Math.max(-10, X(L.na) - 3), xb = Math.min(W + 10, X(L.nb) + 3);       // (the box: what the work narrates, not when it was written)
        if (xb > xa) { if ((si + k) % 2 === 0) { g.fillStyle = C.fg; g.globalAlpha = 0.045; g.fillRect(xa, top - 2, xb - xa, h + 4); }
          else { g.strokeStyle = C.line; g.globalAlpha = 0.6; g.strokeRect(xa + 0.5, top - 1.5, xb - xa - 1, h + 2); } g.globalAlpha = 1;
          // its name, once – at the box's left edge, or held at the screen's edge while the box runs on
          const nm = L.t + (L.have ? '' : ' (not on this device)'); g.font = font(10.5); const tw = g.measureText(nm).width, tx = Math.max(xa + 4, Math.min(Math.max(xa + 4, 4), xb - tw - 4));
          if (xb - xa > 30) { g.save(); g.beginPath(); g.rect(xa + 2, top - 2, xb - xa - 4, TT + 2); g.clip(); g.fillStyle = C.mut; g.fillText(nm, tx, top + 9.5); g.restore(); } } }
      // how far a label may run on (807a): to the next item in its row, and never into the next lane of the slot
      const stop = k + 1 < ls.length ? X(ls[k + 1].a) - 6 : W + 4000;
      const byRow = new Map(); for (const it of vis) { if (!byRow.has(it.row)) byRow.set(it.row, []); byRow.get(it.row).push(it); }
      const nextX = new Map(); for (const r of byRow.values()) { r.sort((p, q) => p.t0 - q.t0); r.forEach((it, j) => nextX.set(it, Math.min(stop, j + 1 < r.length ? X(r[j + 1].t0) - 6 : W + 4000))); }
      g.save(); g.beginPath(); g.rect(0, top - 2, W, h + 4); g.clip();                     // (a lane still growing shows only what fits)
      for (const it of vis) {
        const x0 = X(it.t0), x1 = Math.max(X(it.t1) - 1, x0 + 3), yy = top + TT + 3 + it.row * lh, bh = Math.max(3, lh - 8);
        if (x1 < 0 && nextX.get(it) < 0) continue; if (x0 > W) continue;
        drawItem(g, C, it, x0, x1, yy, bh, font, nextX.get(it), W);
        if ((it.pass !== false || TP.cfg.fmode === 'hide') && yy < top + h) TP.hit.push({ x0, x1, y0: yy, y1: yy + bh, it, L });
        if ((it.ev || it.link) && it.pass !== false) centers.push({ it, x: (Math.max(x0, 0) + Math.min(x1, W)) / 2, y: yy + bh / 2 });
      }
      g.restore();
    });
  });
  // "Written" (815, 819): thin lines from what a work narrates – in its own lane, a person's or a word's – to when it was written
  if (marks.size && from.length) {
    g.lineWidth = 1; g.strokeStyle = C.mut; g.fillStyle = C.mut;
    const keys = [...marks.keys()];
    for (const f of from) for (const wk of keys) { if (!f.w.startsWith(wk)) continue;
      for (const m of marks.get(wk)) {
        if (Math.max(f.x, m.x) < 0 || Math.min(f.x, m.x) > W || Math.max(f.y, m.y) < RH - 60 || Math.min(f.y, m.y) > H + 60) continue;
        g.globalAlpha = f.sel ? 0.95 : f.dim || m.dim ? 0.12 : 0.5; g.strokeStyle = g.fillStyle = f.sel ? C.acc : C.mut; g.lineWidth = f.sel ? 1.8 : 1; const hgt = Math.min(22, 5 + Math.abs(m.x - f.x) / 10), c = Math.min(30, Math.abs(m.x - f.x) / 3) * Math.sign(m.x - f.x || 1);
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
  if (TP.cur != null) { const x = X(TP.cur); g.strokeStyle = C.acc; g.lineWidth = 1.5; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x, RH); g.lineTo(x, H); g.stroke(); g.setLineDash([]); }
  g.restore();
  // ---- rulers (fixed at the top)
  g.fillStyle = C.bar; g.fillRect(0, 0, W, RH);
  let ry = 0;
  for (const r of rulers) { drawRuler(g, C, r.id, ry, r.h, W, X, A0, A1, emps, font); ry += r.h; }
  g.strokeStyle = C.line; g.beginPath(); g.moveTo(0, RH - 0.5); g.lineTo(W, RH - 0.5); g.stroke();
  // links of consular dates to the consul ruler (782a)
  const cosR = rulers.findIndex(r => r.id === 'cos');
  if (cosR >= 0) { const cy = rulers.slice(0, cosR).reduce((s, r) => s + r.h, 0) + rulers[cosR].h;
    g.strokeStyle = C.acc2; g.globalAlpha = 0.5; g.setLineDash([2, 3]);
    for (const c of centers) if (c.it.link && c.y > RH) { g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(c.x, cy); g.stroke(); }
    g.setLineDash([]); g.globalAlpha = 1; }
  if (TP.cur != null) { const x = X(TP.cur); g.strokeStyle = C.acc; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, RH); g.stroke(); }
  if (TP.moving) tmpRedraw();                              // (until every height has reached its value)
}
function drawItem(g, C, it, x0, x1, y, h, font, lim = Infinity, W = 1e9) {
  const sel = TP.sel?.it === it, dim = it.pass === false;
  const base = it.ev ? `hsl(${evHue(it.ev.toLowerCase())},55%,52%)` : it.kind === 'own' ? C.acc : it.kind === 'office' ? C.acc : it.kind === 'date' ? C.acc2 : C.acc2;
  const alpha = dim ? 0.07 : it.kind === 'book' ? 0.28 : it.kind === 'life' || it.kind === 'cite' || it.kind === 'word' ? 0.22 : it.kind === 'work' ? 0.25 : it.uneven ? 0.2 : 0.38;
  // fuzzy ends: a gradient fading out
  const grd = g.createLinearGradient(x0, 0, x1, 0), w = Math.max(1, x1 - x0), fw = Math.min(0.45, 24 / w);
  grd.addColorStop(0, it.fa ? 'transparent' : base); grd.addColorStop(it.fa ? fw : 0, base); grd.addColorStop(it.fb ? 1 - fw : 1, base); grd.addColorStop(1, it.fb ? 'transparent' : base);
  g.globalAlpha = sel ? 0.75 : alpha; g.fillStyle = grd; roundRect(g, x0, y, x1 - x0, h, 4); g.fill(); g.globalAlpha = 1;
  if (dim) return;
  if (it.kind === 'date' || it.kind === 'own' || sel) { g.strokeStyle = sel ? C.fg : base; g.lineWidth = sel ? 1.6 : 1; roundRect(g, x0, y, x1 - x0, h, 4); g.stroke(); }
  if (it.uneven) { g.strokeStyle = C.acc; g.setLineDash([3, 2]); roundRect(g, x0, y, x1 - x0, h, 4); g.stroke(); g.setLineDash([]); }
  // the label, once: at the bar's start – or, while the bar runs on past the screen's left edge, held at that edge, and pushed
  // off with the bar's end; past a short bar it may run on up to the next item in its row (807a)
  const fs = Math.max(7.5, Math.min(11, h + 1)), txt = it.lab; g.font = font(fs); const tw = g.measureText(txt).width;   // (rows pinched small: smaller type)
  const p = Math.max(x0 + 4, Math.min(Math.max(x0 + 4, 4), x1 - tw - 6));
  const end = Math.min(Math.max(x1 - 3, lim), W + 2000), room = end - p;
  if (room >= 14) { g.fillStyle = C.fg; g.save(); g.beginPath(); g.rect(p, y - 1, room, h + 2); g.clip(); g.fillText(txt, p, y + h / 2 + fs * 0.36); g.restore(); }
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
  if (id === 'emp') { for (const x of emps) { if (x.row >= Math.ceil(TP.empRowsE - 0.05)) continue; const x0 = X(x.a0), x1 = Math.max(X(x.a1), x0 + 2); if (x1 < 0 || x0 > W) continue;
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
    body.innerHTML = `<div class="tmpbar"><button type="button" class="tmpib" data-tmp="ref" title="Reference systems – which rows stand at the top, in what order" aria-label="Reference systems">${ROD_ICON}</button>`
      + `<button type="button" class="tmpib" id="tmpFiltBtn" data-tmp="filter" title="Filter" aria-label="Filter">${sieveIcon(0, 'tf')}</button>`
      + `<span class="tmpq"><input id="tmpQ" type="search" enterkeyhint="search" placeholder="Find an event …" autocomplete="off" autocapitalize="off" spellcheck="false"><div id="tmpRes" class="tmpres" hidden></div></span>`
      + `<button type="button" data-tmp="writ" id="tmpWritBtn" class="${TP.cfg.written ? 'on' : ''}" title="Also show when each work was written – joined by a thin line to what it narrates">Written</button>`
      + `<button type="button" data-tmp="add" title="Add your own statement">＋ Statement</button>`
      + `<button type="button" data-tmp="here" title="The years of the text being read">This text</button></div>`
      + `<div id="tmpChips" class="tmpchips" hidden></div>`
      + `<div class="tmpwrap"><canvas id="tmpCanvas"></canvas></div><div id="tmpCard" class="tmpcard" hidden></div><div id="tmpPanel" class="tmppanel" hidden></div>`;
    tmpWire($('#tmpCanvas'));
  }
  const has = Object.values(S.installed || {}).some(d => d.kind === 'fasti');
  if (!has && !$('#tmpHint')) body.querySelector('.tmpwrap').insertAdjacentHTML('afterbegin', `<p class="hint" id="tmpHint">For the consuls, the emperors and the years the books narrate, download “W. Liebenam, Fasti consulares …” and “Tempora – dates read from the library’s texts”: ☰ → Instruments → Suda – Encyclopaedias and Lexica. <button type="button" data-tmpget="1">Download both</button></p>`);
  if (has) $('#tmpHint')?.remove();
  await tmpData(); tmpChipsUpd(); tmpRedraw();
}
function tmpAt(px, py) { return TP.hit.slice().reverse().find(h => (py < TP.RH) === (h.emp != null || h.sky != null) && px >= h.x0 - 3 && px <= h.x1 + 3 && py >= h.y0 - 2 && py <= h.y1 + 2) || null; }
function tmpZoomX(f, px) { const a = TP.x0 + px / TP.ppy; TP.ppy = Math.min(400000, Math.max(0.005, TP.ppy * f)); TP.x0 = a - px / TP.ppy; tmpSave(); tmpRedraw(); }
function tmpZoomY(f) { TP.lh = Math.min(90, Math.max(10, TP.lh * f)); tmpSave(); tmpRedraw(); }
function tmpClampY() { const cv = $('#tmpCanvas'); const max = Math.max(0, (TP.contentH || 0) - (cv.clientHeight - (TP.RH || 0)) + 40, TP.over || 0);
  TP.sy = Math.min(max, Math.max(0, TP.sy)); TP.over = Math.min(TP.over || 0, TP.sy); }   // (TP.over: how far the header has grown over the lanes)
function tmpWire(cv) {
  new ResizeObserver(() => tmpRedraw()).observe(cv);
  let down = null, pinch = null, moved = false, lastTap = 0;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); TP.ptr.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (TP.ptr.size === 1) { down = { x: e.offsetX, y: e.offsetY, x0: TP.x0, ly: e.offsetY }; moved = false; }
    if (TP.ptr.size === 2) { const [p, q] = [...TP.ptr.values()]; TP.focusY = (p.y + q.y) / 2; pinch = { dx: Math.abs(p.x - q.x), dy: Math.abs(p.y - q.y), ppy: TP.ppy, lh: TP.lh, mx: (p.x + q.x) / 2, x0: TP.x0 }; down = null; } });
  cv.addEventListener('pointermove', e => { if (!TP.ptr.has(e.pointerId)) return; TP.userMove = Date.now(); TP.ptr.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pinch && TP.ptr.size === 2) { const [p, q] = [...TP.ptr.values()], dx = Math.abs(p.x - q.x), dy = Math.abs(p.y - q.y), mx = (p.x + q.x) / 2;
      const a = pinch.x0 + pinch.mx / pinch.ppy;                 // two fingers: across = time, up and down = lane height
      if (pinch.dx > 40) TP.ppy = Math.min(400000, Math.max(0.005, pinch.ppy * dx / pinch.dx));
      if (pinch.dy > 40) TP.lh = Math.min(90, Math.max(10, pinch.lh * dy / pinch.dy));
      TP.x0 = a - mx / TP.ppy; TP.focusY = (p.y + q.y) / 2; moved = true; tmpSave(); tmpRedraw(); return; }
    if (!down) return; const dx = e.offsetX - down.x, dy = e.offsetY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    if (moved) { TP.x0 = down.x0 - dx / TP.ppy; TP.sy += down.ly - e.offsetY; down.ly = e.offsetY; tmpClampY(); tmpSave(); tmpRedraw(); } });   // (vertically by steps: the anchoring may move it too)
  const up = e => { TP.ptr.delete(e.pointerId); if (TP.ptr.size < 2) { pinch = null; TP.focusY = null; }
    if (down && !moved && TP.ptr.size === 0) { const now = Date.now();
      if (now - lastTap < 300) { TP.focusY = e.offsetY; tmpZoomX(2, e.offsetX); setTimeout(() => { TP.focusY = null; }, 400); lastTap = 0; } else { lastTap = now; tmpTap(e.offsetX, e.offsetY); } }
    if (TP.ptr.size === 0) down = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  let wt = 0;
  cv.addEventListener('wheel', e => { e.preventDefault(); TP.userMove = Date.now();
    if (e.ctrlKey || e.metaKey || e.shiftKey) { TP.focusY = e.offsetY; clearTimeout(wt); wt = setTimeout(() => { TP.focusY = null; }, 400); }   // (the spot under the cursor stays put)
    if (e.ctrlKey || e.metaKey) tmpZoomX(Math.exp(-e.deltaY / 200), e.offsetX);
    else if (e.shiftKey) tmpZoomY(Math.exp(-e.deltaY / 300));
    else { TP.x0 += e.deltaX / TP.ppy; TP.sy += e.deltaY; tmpClampY(); tmpSave(); tmpRedraw(); } }, { passive: false });
}
function tmpTap(px, py) {
  const h = tmpAt(px, py);
  if (h?.it) { TP.sel = h; TP.cur = null; tmpCardItem(h); }
  else if (h?.sky) { TP.sel = null; TP.cur = h.sky.jd != null ? axOfJd(h.sky.jd) : null; tmpCardSky(h.sky); }
  else if (h?.emp != null) { const e = TP.data.F.k[h.emp]; TP.sel = null; TP.cur = null; tmpCardEmp(e); }
  else if (py < (TP.RH || 0)) { TP.sel = null; TP.cur = TP.x0 + px / TP.ppy; tmpCardYear(hy(Math.floor(TP.cur))); }   // (a reference row: what that year is called)
  else { TP.sel = null; TP.cur = null; const c = $('#tmpCard'); if (c) c.hidden = true; }                               // (an empty place: nothing opens)
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
    + (!it.wr && it.go?.w && WRITTEN.some(r => it.go.w.startsWith(r[0])) ? `<p class="hint small">Written: ${WRITTEN.filter(r => it.go.w.startsWith(r[0])).map(r => esc(r[3].replace(/^(.*· )?/, ''))).join(' · ')}</p>` : '')
    + (it.wr && it.wn > 1 ? `<p class="tact">${TP.cfg.wpick?.[it.wk] ? `<button type="button" data-tmpwpick="" data-wid="${esc(it.wk)}">Show all its dates of writing</button>` : `<button type="button" data-tmpwpick="${esc(it.wlab)}" data-wid="${esc(it.wk)}">Show only this date for this work</button>`}</p>` : '')
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

// ---------------------------------------------------------------- reference systems (801a): which rows stand at the top, in what order
// the icon: a measuring rod with ticks (802)
const ROD_ICON = '<svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round"><rect x="2.5" y="8.5" width="19" height="7" rx="1.2" stroke-width="1.3"/><path d="M5.5 8.5v3M8.5 8.5v2M11.5 8.5v3.6M14.5 8.5v2M17.5 8.5v3" stroke-width="1.1"/></g></svg>';
function rulerOrder() { const o = (TP.cfg.rorder || []).filter(id => RULERS.some(r => r[0] === id)); for (const [id] of RULERS) if (!o.includes(id)) o.push(id); return o; }
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
  const p = $('#tmpPanel'); p.hidden = false; p.dataset.k = 'ref'; const scroll = keep ? p.scrollTop : 0;
  const all = (TP.data?.lanes || []).filter(L => L.have || TP.cfg.all), pin = TP.cfg.lpin || [];
  const order = [...laneOrder(all.filter(L => !TP.cfg.lhide?.[L.id])), ...all.filter(L => TP.cfg.lhide?.[L.id])];
  p.innerHTML = `<div class="tch"><b>Reference systems and lanes</b><button type="button" data-tmpclose="panel" aria-label="Close">✕</button></div><p class="hint small">The rows at the top of the timeline. Drag ⠿ to change their order.</p>`
    + `<div class="tref">${rulerOrder().map(id => `<div class="trow" data-rid="${id}"><span class="tgrip" aria-label="Drag">⠿</span><label><input type="checkbox" data-tmpr="${id}"${TP.cfg.rulers[id] ? ' checked' : ''}> ${esc(RULERS.find(r => r[0] === id)[1])}</label></div>`).join('')}</div>`
    + `<div class="tph tplanes">Lanes</div><p class="hint small">Pinned lanes stay at the top, in your order – drag ⠿ to place a lane (it and those above it are pinned), or pin it. The others follow the text being read, then what passes the filter, then time. Lanes that do not meet in time share a level.</p>`
    + `<div class="tlanes">${order.map(L => { const pi = pin.includes(L.id), hid = !!TP.cfg.lhide?.[L.id];
        return `<div class="trow${hid ? ' off' : ''}" data-lid="${esc(L.id)}"><span class="tgrip" aria-label="Drag">⠿</span><label><input type="checkbox" data-tmplh="${esc(L.id)}"${hid ? '' : ' checked'}> ${esc(L.t)}${isFinite(L.a) ? ` <small class="hint">${esc(rangeTxt(L.a, L.b))}</small>` : ''}</label><button type="button" class="tpin${pi ? ' on' : ''}" data-tmppin="${esc(L.id)}">${pi ? 'Pinned' : 'Pin'}</button></div>`; }).join('')}</div>`
    + (pin.length ? `<p><button type="button" data-tmpunpin="1">Unpin all</button></p>` : '');
  p.scrollTop = scroll;
  tmpDragList(p.querySelector('.tref'), () => { TP.cfg.rorder = [...p.querySelectorAll('.tref .trow')].map(r => r.dataset.rid); tmpSave(); tmpRedraw(); });
  tmpDragList(p.querySelector('.tlanes'), d => { const ids = [...p.querySelectorAll('.tlanes .trow')].map(r => r.dataset.lid); TP.cfg.lpin = ids.slice(0, ids.indexOf(d.dataset.lid) + 1).filter(id => !TP.cfg.lhide?.[id]);
    tmpSave(); tmpRedraw(); tmpRefPanel(true); });
}

// ---------------------------------------------------------------- the filter (803a–805): texts, persons, places, words, kinds, sources
// Each criterion added is a chip with "either" or "and" (the reader's choice for each): an item passes when it meets every "and"
// and, if there are any "either", at least one of those. What does not pass is dimmed (or hidden: Settings → Tempora)
const KINDS = [['narr', 'Years a book narrates'], ['dyear', 'Diodorus’ years'], ['ol', 'Dates by Olympiad'], ['cdate', 'Consular dates in the text'],
  ['life', 'Lifetimes'], ['office', 'Offices'], ['cite', 'Passages citing a person'], ['word', 'Words'], ['own', 'Your statements'], ['written', 'When works were written']];
const SOURCES = [['narr', 'The years the books narrate (Pult’s table)'], ['diodorus', 'Diodorus'], ['dionysius', 'Dionysius of Halicarnassus'], ['diogenes', 'Diogenes Laertius'],
  ['liebenam', 'Liebenam (offices)'], ['people-smith', 'Smith'], ['people-pir', 'PIR'], ['cdate', 'Consular dates'], ['index', 'The index of all texts'], ['own', 'Your chronology'], ['written', 'Dates of writing (Pult’s table)'], ['catalogue', 'The catalogue (authors’ centuries)']];
const tfold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f\u0342\u0343\u0345]/g, '').toLowerCase().replace(/ς/g, 'σ').replace(/j/g, 'i').replace(/[^a-zα-ω0-9]+/g, ' ');   // (accents, case, ς/σ, j/i ignored)
function fMatch(it, f) {
  const txt = () => it._t ??= tfold([it.full, it.lab, it.text, it.note, it.own?.note].filter(Boolean).join(' '));
  switch (f.t) {
    case 'work': return it.go?.w === f.v || (it.go?.w || '').startsWith(f.v + '.') || it.own?.src?.w === f.v;
    case 'book': return it.go?.w === f.v.w && it.go?.bi === f.v.bi;
    case 'person': return it.ref === f.v || (f.keys || []).some(k => k.length > 2 && txt().includes(k));
    case 'place': return it.place?.id === f.v || (f.keys || []).some(k => k.length > 2 && txt().includes(k));
    case 'word': return it.word === f.v || (f.keys || []).some(k => k.length > 2 && txt().includes(k));
    case 'kind': return it.k2 === f.v;
    case 'src': return it.sid === f.v || (f.v === 'liebenam' && it.k2 === 'office');
  }
  return true;
}
function tmpFilterApply() {
  const fl = TP.cfg.flt || [], ands = fl.filter(f => f.op === 'and'), ors = fl.filter(f => f.op !== 'and');
  TP.fOn = fl.length > 0; let n = 0, m = 0;
  for (const L of TP.data?.lanes || []) { for (const it of L.its) { if (it.kids) continue;
      it.pass = !fl.length || (ands.every(f => fMatch(it, f)) && (!ors.length || ors.some(f => fMatch(it, f))));
      n++; if (it.pass) m++; }
    for (const it of L.its) if (it.kids) it.pass = it.kids.some(k => k.pass); }   // (a book or a work passes when one of its parts does)
  TP.fCount = [m, n];
}
function sieveN() { const [m, n] = TP.fCount || [0, 0]; if (!TP.fOn) return 0; return !m ? 7 : Math.min(7, 1 + Math.floor(Math.log2(n / m) + 1e-9)); }
function tmpChipsUpd() {
  tmpFilterApply();
  const b = $('#tmpFiltBtn'); if (b) { b.innerHTML = sieveIcon(sieveN(), 'tf'); b.classList.toggle('active', !!TP.fOn); }
  const c = $('#tmpChips'); if (!c) return;
  const fl = TP.cfg.flt || [], open = $('#tmpPanel') && !$('#tmpPanel').hidden && $('#tmpPanel').dataset.k === 'filter';
  c.hidden = !fl.length || open;
  c.innerHTML = fl.map((f, i) => chipHTML(f, i)).join('') + (fl.length ? `<button type="button" class="tclr" data-tfclear="1">Clear</button>` : '');
}
const chipHTML = (f, i) => `<span class="tchip"><button type="button" class="top" data-tfop="${i}" title="Tap: either / and">${f.op === 'and' ? 'and' : 'either'}</button><span class="tcl">${esc(f.lab)}</span><button type="button" class="tx" data-tfrm="${i}" aria-label="Remove">✕</button></span>`;
async function tmpAddWord(w) {                             // a word: the books it occurs in (its lemmas too)
  let keys = [gkey(w)]; try { const A = await analyses(w); keys = [...new Set([gkey(w), ...A.lemmas.map(x => gkey(x.lemma))])]; } catch (_) { }
  return tmpAddFilter({ t: 'word', v: keys[keys.length > 1 ? 1 : 0], keys, lab: w });
}
async function tmpAddFilter(f) {
  const fl = TP.cfg.flt = TP.cfg.flt || [];
  if (fl.some(x => x.t === f.t && JSON.stringify(x.v) === JSON.stringify(f.v))) return;
  f.op = f.op || 'or'; fl.push(f);
  if (f.t === 'person' && !TP.cfg.persons.includes(f.v)) TP.cfg.persons.push(f.v);   // (a person: also his lane)
  tmpSave(); if (f.t === 'person' || f.t === 'word') await tmpData(); tmpChipsUpd(); tmpRedraw();
  if (!$('#tmpPanel').hidden && $('#tmpPanel').dataset.k === 'filter') tmpFilterPanel(true);
}
function tmpFilterPanel(keep) {
  const p = $('#tmpPanel'), q0 = keep && p.dataset.k === 'filter' ? p.querySelector('[data-tfs="all"]')?.value || '' : '';
  if (keep && p.dataset.k === 'filter') p.dataset.open = [...p.querySelectorAll('details[open]')].map(d => d.dataset.o).join('');
  p.hidden = false; p.dataset.k = 'filter';
  const scroll = keep ? p.scrollTop : 0, fl = TP.cfg.flt || [], [m, n] = TP.fCount || [0, 0];
  const works = new Map();                                   // the works Tempora knows something about
  for (const L of TP.data?.lanes || []) for (const it of L.its) if (it.go?.w) { const w = works.get(it.go.w) || { id: it.go.w, t: it.src || it.go.w, books: new Map() }; if (it.kind === 'book' || it.kind === 'year') w.books.set(it.go.bi, it.lab.replace(/ ·.*$/, '')); works.set(it.go.w, w); }
  const on = (t, v) => fl.some(f => f.t === t && JSON.stringify(f.v) === JSON.stringify(v));
  p.innerHTML = `<div class="tch"><b>Filter</b><small class="hint">${TP.fOn ? `${m} of ${n} items` : `${n} items`}</small><button type="button" data-tmpclose="panel" aria-label="Close">✕</button></div>`
    + (fl.length ? `<div class="tpsec"><div class="tph">Your filter <button type="button" class="tclr" data-tfclear="1">Clear</button></div><div class="tchips">${fl.map((f, i) => chipHTML(f, i)).join('')}</div><p class="hint small">An item shows when it meets every “and” and – if there are any – at least one “either”. Tap “either” / “and” to change it.</p></div>` : '')
    + `<div class="tpsec"><input type="search" data-tfs="all" class="tfq" placeholder="A text, person, place or word …" enterkeyhint="done" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="tpres" data-tfr="all"></div></div>`
    + `<details class="tpsec"${keep && p.dataset.open?.includes('k') ? ' open' : ''} data-o="k"><summary class="tph">Kinds of date</summary><div class="tchips">${KINDS.map(([v, l]) => `<button type="button" class="tpadd sm${on('kind', v) ? ' on' : ''}" data-tfk="${v}" data-l="${esc(l)}">${esc(l)}</button>`).join('')}</div></details>`
    + `<details class="tpsec"${keep && p.dataset.open?.includes('s') ? ' open' : ''} data-o="s"><summary class="tph">Sources</summary><div class="tchips">${SOURCES.map(([v, l]) => `<button type="button" class="tpadd sm${on('src', v) ? ' on' : ''}" data-tfsrc="${v}" data-l="${esc(l)}">${esc(l)}</button>`).join('')}</div></details>`
    + `<details class="tpsec"${keep && p.dataset.open?.includes('t') ? ' open' : ''} data-o="t"><summary class="tph">All texts</summary>${[...works.values()].sort((a, b) => a.t.localeCompare(b.t)).map(w => `<div class="tpw"><button type="button" class="tpadd${on('work', w.id) ? ' on' : ''}" data-tfw="${esc(w.id)}" data-l="${esc(w.t)}">${esc(w.t)}</button>${w.books.size > 1 ? `<div class="tpbk">${[...w.books].sort((a, b) => a[0] - b[0]).map(([bi, l]) => `<button type="button" class="tpadd sm${on('book', { w: w.id, bi }) ? ' on' : ''}" data-tfb="${esc(w.id)}" data-bi="${bi}" data-l="${esc(w.t + ' · ' + l)}">${esc(l)}</button>`).join('')}</div>` : ''}</div>`).join('') || '<p class="hint small">Nothing dated yet.</p>'}</details>`
    + `<label class="tpall"><input type="checkbox" data-tmpall2="1"${TP.cfg.all ? ' checked' : ''}> also works not on this device</label>`;
  TP.fWorks = works;
  if (q0) { const i = p.querySelector('[data-tfs="all"]'); i.value = q0; i.dispatchEvent(new Event('input', { bubbles: true })); }
  p.scrollTop = scroll; tmpChipsUpd();
}
async function tmpPersonHits(q) {                         // as the Suda tab's search: names beginning so
  const k = gkey(q), out = []; if (k.length < 2) return out;
  for (const d of pplPkgs(false)) { const ix = await pplIx(d); if (!ix) continue;
    for (const key of Object.keys(ix.n)) if (key.startsWith(k)) for (const i of ix.n[key]) out.push({ d, i, key, exact: key === k }); if (out.length > 400) break; }
  out.sort((a, b) => b.exact - a.exact || a.key.length - b.key.length || a.i - b.i);
  const rows = [], seen = new Set();
  for (const x of out) { const ref = pref(x.d, x.i); if (seen.has(ref)) continue; seen.add(ref); const r = await pplRow(x.d, x.i); if (r) rows.push(r); if (rows.length >= 12) break; }
  return rows;
}
let tfT = 0;
document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.dataset?.tfs === 'all') { clearTimeout(tfT); tfT = setTimeout(async () => {
    const box = t.parentElement.querySelector('.tpres'), q = t.value.trim(), k = tfold(q).trim(); if (k.length < 2) { box.innerHTML = ''; return; }
    const sec = (h, rows) => rows.length ? `<div class="tfgrp"><span class="tftag">${h}</span>${rows.join('')}</div>` : '';
    const tx = [];                                          // texts and their books
    for (const w of (TP.fWorks || new Map()).values()) { if (tfold(w.t).includes(k)) tx.push(`<button type="button" class="tpadd" data-tfw="${esc(w.id)}" data-l="${esc(w.t)}">${esc(w.t)}</button>`);
      for (const [bi, l] of w.books) if (tx.length < 14 && tfold(w.t + ' ' + l).includes(k) && !tfold(w.t).includes(k)) tx.push(`<button type="button" class="tpadd" data-tfb="${esc(w.id)}" data-bi="${bi}" data-l="${esc(w.t + ' · ' + l)}">${esc(w.t)} · ${esc(l)}</button>`); }
    const ps = (await tmpPersonHits(q).catch(() => [])).map(r => `<button type="button" class="tpadd" data-tfp="${esc(r.ref)}" data-l="${esc(r.name)}"><b>${esc(r.name)}</b>${r.no ? ` <small>${r.no}</small>` : ''} <small class="hint">${esc((r.desc || '').slice(0, 60))}</small></button>`);
    let pl = []; if (typeof searchPlaces === 'function') { if (!M.P?.full) await loadPlaceIndex(true).catch(() => null);
      TP.plHits = searchPlaces(q).slice(0, 8); pl = TP.plHits.map((p, i) => `<button type="button" class="tpadd" data-tfpl="${i}"><b>${esc(p.t)}</b> <small class="hint">${esc(typeLabel?.(p) || '')}</small></button>`); }
    if (t.value.trim() !== q) return;
    box.innerHTML = sec('Texts', tx.slice(0, 14)) + sec('Persons', ps.slice(0, 8)) + sec('Places', pl)
      + sec('Word', [`<button type="button" class="tpadd" data-tfword="${esc(q)}">“${esc(q)}” <small class="hint">– the books it occurs in (Enter)</small></button>`]);
  }, 220); }
  if (t.id === 'tmpQ') { clearTimeout(tfT); tfT = setTimeout(() => tmpSearch(t.value, false), 160); }
});
document.addEventListener('keydown', async ev => {
  const t = ev.target; if (ev.key !== 'Enter') return;
  if (t.dataset?.tfs === 'all') { ev.preventDefault(); const w = t.value.trim(); if (!w) return; t.value = ''; return tmpAddWord(w); }
  if (t.id === 'tmpQ') { ev.preventDefault(); tmpSearch(t.value, true); }
});

// ---------------------------------------------------------------- the search (806a): events, emperors, consuls
function tmpSearch(q, all) {
  const box = $('#tmpRes'); const k = tfold(q).trim(); if (!box) return;
  if (k.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
  const hits = [], F = TP.data?.F;
  for (const L of TP.data?.lanes || []) for (const it of L.its) { it._t ??= tfold([it.full, it.lab, it.text, it.note, it.own?.note].filter(Boolean).join(' ')); if (it._t.includes(k)) hits.push({ it, lab: it.full || it.lab, when: rangeTxt(it.t0, it.t1) }); }
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
  const t = ev.target; if (!t.closest?.('#temporaBody')) return;
  const b = t.closest('button,[data-tmpr],[data-tmpl]'); if (!b) return;
  const D = b.dataset;
  if (D.tmpclose) { if (D.tmpclose === 'panel') { $('#tmpPanel').hidden = true; tmpChipsUpd(); } else { $('#tmpCard').hidden = true; TP.sel = null; TP.cur = null; tmpRedraw(); } return; }
  if (D.tmp === 'ref' || D.tmp === 'filter') { const p = $('#tmpPanel'); if (!p.hidden && p.dataset.k === D.tmp) { p.hidden = true; tmpChipsUpd(); return; } return D.tmp === 'ref' ? tmpRefPanel() : tmpFilterPanel(); }
  if (D.tfop != null) { const f = TP.cfg.flt[+D.tfop]; f.op = f.op === 'and' ? 'or' : 'and'; tmpSave(); tmpChipsUpd(); tmpRedraw(); if (!$('#tmpPanel').hidden && $('#tmpPanel').dataset.k === 'filter') tmpFilterPanel(true); return; }
  if (D.tfrm != null) { const f = TP.cfg.flt.splice(+D.tfrm, 1)[0]; if (f?.t === 'person') TP.cfg.persons = TP.cfg.persons.filter(r => r !== f.v);   // (his lane goes with it)
    tmpSave(); if (f?.t === 'word' || f?.t === 'person') await tmpData(); tmpChipsUpd(); tmpRedraw(); if (!$('#tmpPanel').hidden && $('#tmpPanel').dataset.k === 'filter') tmpFilterPanel(true); return; }
  if (D.tfclear) { TP.cfg.flt = []; TP.cfg.persons = []; tmpSave(); await tmpData(); tmpChipsUpd(); tmpRedraw(); if (!$('#tmpPanel').hidden && $('#tmpPanel').dataset.k === 'filter') tmpFilterPanel(true); return; }
  if (D.tfword) return tmpAddWord(D.tfword);
  if (D.tfw) return tmpAddFilter({ t: 'work', v: D.tfw, lab: D.l });
  if (D.tfb) return tmpAddFilter({ t: 'book', v: { w: D.tfb, bi: +D.bi }, lab: D.l });
  if (D.tfk) return tmpAddFilter({ t: 'kind', v: D.tfk, lab: D.l });
  if (D.tfsrc) return tmpAddFilter({ t: 'src', v: D.tfsrc, lab: D.l });
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
  if (D.tmppin) { const pin = TP.cfg.lpin = TP.cfg.lpin || [], i = pin.indexOf(D.tmppin); if (i >= 0) pin.splice(i, 1); else pin.push(D.tmppin); tmpSave(); tmpRedraw(); return tmpRefPanel(true); }
  if (D.tmpunpin) { TP.cfg.lpin = []; tmpSave(); tmpRedraw(); return tmpRefPanel(true); }
  if (D.tmpeclmap && TP.skySel) return tmpEclMap(TP.skySel);
  if (D.tmpwpick != null) { TP.cfg.wpick = TP.cfg.wpick || {}; if (D.tmpwpick) TP.cfg.wpick[D.wid] = D.tmpwpick; else delete TP.cfg.wpick[D.wid];
    tmpSave(); $('#tmpCard').hidden = true; TP.sel = null; await tmpData(); return tmpRedraw(); }
  if (D.tmp === 'writ') { TP.cfg.written = !TP.cfg.written; b.classList.toggle('on', TP.cfg.written); tmpSave(); await tmpData(); return tmpRedraw(); }
  if (D.tmpz) { const W = $('#tmpCanvas').clientWidth; if (D.tmpz === 'x+') tmpZoomX(1.6, W / 2); if (D.tmpz === 'x-') tmpZoomX(1 / 1.6, W / 2); if (D.tmpz === 'y+') tmpZoomY(1.25); if (D.tmpz === 'y-') tmpZoomY(0.8); return; }
  if (D.tmpgo) return tmpGo(TP.sel?.it?.go);
  if (D.tmpperson) { await showPeople(); return pplGo({ t: 'person', ref: D.tmpperson }); }
  if (D.tmpadd) { if (!TP.cfg.persons.includes(D.tmpadd)) TP.cfg.persons.push(D.tmpadd); tmpSave(); await tmpData(); return tmpRedraw(); }
  if (D.tmpedit) return tmpEdit(D.tmpedit);
  if (D.tmpyear) { TP.cur = ax(+D.tmpyear) + 0.5; tmpCardYear(+D.tmpyear); return tmpRedraw(); }
  if (D.tmpmap) { const p = TP.sel?.it?.place; if (!p) return; toggleMapTab(true); setTimeout(() => { if (p.id != null) selectPlace(p.id); else M.map?.easeTo({ center: [p.lon, p.lat], zoom: 7 }); tmpMapMarkers(); }, 700); return; }
  if (D.tmpget) { for (const id of ['fasti-liebenam', 'chrono-texts']) if (!S.installed?.[id]) queueDownload(id);
    b.disabled = true; b.textContent = 'Downloading …'; const w = setInterval(() => { if (S.installed?.['fasti-liebenam'] && S.installed?.['chrono-texts']) { clearInterval(w); PP.fasti = null; showTempora(); } }, 800); return; }
});
document.addEventListener('change', async ev => {
  const t = ev.target; if (!t.closest?.('#tmpPanel')) return;
  if (t.dataset.tmpr) { TP.cfg.rulers[t.dataset.tmpr] = t.checked; tmpSave(); tmpRedraw(); }
  if (t.dataset.tmplh) { TP.cfg.lhide = TP.cfg.lhide || {}; if (t.checked) delete TP.cfg.lhide[t.dataset.tmplh]; else TP.cfg.lhide[t.dataset.tmplh] = 1; tmpSave(); tmpRedraw(); return tmpRefPanel(true); }
  if (t.dataset.tmpall2) { TP.cfg.all = t.checked; tmpSave(); tmpRedraw(); }
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
