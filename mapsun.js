// ================================================================ Pult · the map menu, the sun, the projection icon (v297)
// The map menu (button at the top right): base map and imagery, relief, the view (globe or flat, 3D, north up) and
// sunlight. The other button beside it (Layers) keeps places, political, built world, names and your own drawings.
// Sunlight: day and night on the map – the night side darkened smoothly through twilight (from sunset to the sun 18°
// below the horizon, as wide as it really is at each place and season), and the relief lit from where the sun stands over the middle of the map. “Now” follows the real
// sun; “Animate” lets the days run (one day in 5 s … 60 s), “Year” the year (in 7 s … 77 s, the hour kept); the sundial sets the hour
// by hand, the zodiac wheel beside it the day of the year.
// Settings (mapCfg): sun, sunMode ('now' | 'anim' | 'year' | 'set'), sunPaused + sunPausedT (an animation paused, and when – v370),
// sunSpeed (seconds per day), sunYear (seconds per year),
// sunFmt ('modern' | 'roman' | 'greek').

// ---------------------------------------------------------------- the sun's position
const RAD = Math.PI / 180;
function sunPos(ms) {
  const d = ms / 864e5 - 10957.5;                                    // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * RAD, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD, e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  let lon = (ra / RAD / 15 - gmst) * 15; lon = ((lon + 540) % 360) - 180;
  return { dec, lon, ecl: ((L / RAD) % 360 + 360) % 360 };         // the point beneath the sun (dec: radians, lon: degrees); its place on the ecliptic (degrees)
}
// the moon (after P. Schlyter's low-precision method, with the main perturbations: about a quarter of a degree): the point beneath
// it (as sunPos), its place on the ecliptic, and how much of it is lit; waxing while it moves away from the sun (v334)
function moonPos(ms) {
  const d = ms / 864e5 - 10956, R = RAD, n = x => ((x % 360) + 360) % 360;
  const N = n(125.1228 - 0.0529538083 * d) * R, i = 5.1454 * R, w = n(318.0634 + 0.1643573223 * d) * R, a = 60.2666, e = 0.0549, M = n(115.3654 + 13.0649929509 * d) * R;
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M)); for (let k = 0; k < 3; k++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xv = a * (Math.cos(E) - e), yv = a * Math.sqrt(1 - e * e) * Math.sin(E), v = Math.atan2(yv, xv), r = Math.hypot(xv, yv);
  const xh = r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i)), yh = r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i)), zh = r * Math.sin(v + w) * Math.sin(i);
  let lon = Math.atan2(yh, xh) / R, lat = Math.atan2(zh, Math.hypot(xh, yh)) / R;
  const Ms = n(356.047 + 0.9856002585 * d) * R, Ls = Ms + n(282.9404 + 4.70935e-5 * d) * R, Lm = N + w + M, D = Lm - Ls, F = Lm - N, sn = Math.sin;
  lon += -1.274 * sn(M - 2 * D) + 0.658 * sn(2 * D) - 0.186 * sn(Ms) - 0.059 * sn(2 * M - 2 * D) - 0.057 * sn(M - 2 * D + Ms) + 0.053 * sn(M + 2 * D)
    + 0.046 * sn(2 * D - Ms) + 0.041 * sn(M - Ms) - 0.035 * sn(D) - 0.031 * sn(M + Ms) - 0.015 * sn(2 * F - 2 * D) + 0.011 * sn(M - 4 * D);
  lat += -0.173 * sn(F - 2 * D) - 0.055 * sn(M - F - 2 * D) - 0.046 * sn(M + F - 2 * D) + 0.033 * sn(F + 2 * D) + 0.017 * sn(2 * M + F);
  const ob = (23.4393 - 3.563e-7 * d) * R, la = lat * R, lo = lon * R;
  const xe = Math.cos(la) * Math.cos(lo), ye = Math.cos(la) * Math.sin(lo) * Math.cos(ob) - Math.sin(la) * Math.sin(ob), ze = Math.cos(la) * Math.sin(lo) * Math.sin(ob) + Math.sin(la) * Math.cos(ob);
  const ra = Math.atan2(ye, xe), dec = Math.asin(ze), d0 = ms / 864e5 - 10957.5, gmst = ((18.697374558 + 24.06570982441908 * d0) % 24 + 24) % 24;
  let glon = (ra / R / 15 - gmst) * 15; glon = ((glon + 540) % 360) - 180;
  const s = sunPos(ms), el = Math.acos(Math.max(-1, Math.min(1, Math.sin(s.dec) * Math.sin(dec) + Math.cos(s.dec) * Math.cos(dec) * Math.cos((glon - s.lon) * R))));
  return { dec, lon: glon, ecl: n(lon), lit: (1 - Math.cos(el)) / 2, waxing: n(lon - s.ecl) < 180 };
}
// height and direction of the sun at a place (degrees; azimuth clockwise from north)
function sunAt(s, lon, lat) {
  const H = (lon - s.lon) * RAD, f = lat * RAD;
  const alt = Math.asin(Math.sin(f) * Math.sin(s.dec) + Math.cos(f) * Math.cos(s.dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(f) - Math.tan(s.dec) * Math.cos(f)) / RAD + 180;
  return { alt: alt / RAD, az: (az + 360) % 360 };
}
// the night (sun below h degrees) as polygons: along each meridian the night is one stretch of latitude
// the night (sun below h degrees) as polygons, for several h at once: along each meridian the night is one stretch of
// latitude; the sun's height along a meridian is worked out once (1° steps) and serves every h
function nightPolysAll(s, hs) {
  const cs = hs.map(h => Math.sin(h * RAD)), runs = hs.map(() => []), run = hs.map(() => null), A = Math.sin(s.dec), S = [], C = [];
  for (let lat = -90; lat <= 90; lat++) { S.push(Math.sin(lat * RAD)); C.push(Math.cos(lat * RAD)); }
  const v = new Float64Array(181);
  for (let lon = -180; lon <= 180; lon += 2) {
    const B = Math.cos(s.dec) * Math.cos((lon - s.lon) * RAD);
    for (let i = 0; i <= 180; i++) v[i] = A * S[i] + B * C[i];
    cs.forEach((c, k) => {
      let lo = v[0] < c ? -90 : null, hi = null;
      for (let i = 1; i <= 180; i++) { const night = v[i] < c, was = v[i - 1] < c;
        if (night && !was) lo = i - 91 + (v[i - 1] - c) / (v[i - 1] - v[i]);
        if (!night && was) hi = i - 91 + (v[i - 1] - c) / (v[i - 1] - v[i]); }
      if (lo != null && hi == null) hi = 90;
      if (lo == null) { if (run[k]) { runs[k].push(run[k]); run[k] = null; } return; }
      (run[k] ??= []).push([lon, Math.max(-89.9, lo), Math.min(89.9, hi)]);
    });
  }
  return runs.map((rs, k) => { if (run[k]) rs.push(run[k]);
    return rs.filter(r => r.length > 1).map(r => [[...r.map(([x, , b]) => [x, b]), ...r.slice().reverse().map(([x, a]) => [x, a]), [r[r.length - 1][0], r[r.length - 1][2]]]]); });
}
const nightPolys = (s, h) => nightPolysAll(s, [h])[0];
// the night as a picture (one layer, a smooth darkening): 512 × 256 pixels over the map from 85° S to 85° N, rows in
// Mercator spacing; each pixel as dark as the sun is low there – from sunset (0°) to the end of twilight (18° below)
const NW = 512, NH = 256, NLAT = 85.0511;
function nightCanvas() {
  // (in the page, hidden, and named in the style by its id: the canvas itself in the style made the engine's comparison of two
  // styles run round the page's elements without end – each change then rebuilt the whole style, and with 3D terrain the first
  // frame of it failed – v364)
  if (!M.nCv) { M.nCv = document.createElement('canvas'); M.nCv.width = NW; M.nCv.height = NH; M.nCv.id = 'pultNightCv'; M.nCv.hidden = true; M.nCv.setAttribute('aria-hidden', 'true'); document.body.append(M.nCv);
    const y2lat = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) / RAD, top = 0.5 - Math.log(Math.tan(Math.PI / 4 + NLAT * RAD / 2)) / (2 * Math.PI);
    M.nRow = Array.from({ length: NH }, (_, r) => { const lat = y2lat(top + (r + 0.5) / NH * (1 - 2 * top)) * RAD; return [Math.sin(lat), Math.cos(lat)]; }); }
  return M.nCv;
}
function nightPaint(ms) {
  const cv = nightCanvas(), ctx = cv.getContext('2d'), s = sunPos(ms), A = Math.sin(s.dec), Bc = Math.cos(s.dec), img = ctx.createImageData(NW, NH), d = img.data;
  const cl = Float64Array.from({ length: NW }, (_, c) => Math.cos((-180 + (c + 0.5) / NW * 360 - s.lon) * RAD)), lo = Math.sin(-18 * RAD), MAX = 0.58;
  for (let r = 0; r < NH; r++) { const [sf, cf] = M.nRow[r], a0 = A * sf, b0 = Bc * cf;
    for (let c = 0, o = r * NW * 4; c < NW; c++, o += 4) {
      const v = a0 + b0 * cl[c];                                       // (the sine of the sun's height)
      const t = v >= 0 ? 0 : v <= lo ? 1 : v / lo, e = t * t * (3 - 2 * t);
      d[o] = 2; d[o + 1] = 6; d[o + 2] = 17; d[o + 3] = Math.round(e * MAX * 255); } }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- on the map
const sunOn = () => !!M.cfg?.sun;
const sunTime = () => (M.sunT ??= Date.now());
function sunStyle(st) {                                             // (called by layerStyle)
  st.light = sunLight();
  if (!sunOn()) return;
  nightPaint(sunTime()); st.sources.sunnight = { type: 'canvas', canvas: (nightCanvas(), 'pultNightCv'), animate: false, coordinates: [[-180, NLAT], [180, NLAT], [180, -NLAT], [-180, -NLAT]] };
  const k = st.layers.findIndex(l => l.id === 'pl-region');
  st.layers.splice(k < 0 ? st.layers.length : k, 0,
    { id: 'sun-night', type: 'raster', source: 'sunnight', layout: { visibility: M.cfg.sunNight !== false ? 'visible' : 'none' }, paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear' } });
}
// the light of the globe's atmosphere (MapLibre takes it from the style's light): with day and night, where the sun
// stands (fixed to the earth); without, from in front of the viewer, so the rim is evenly lit
function sunLight() {
  if (!sunOn()) return { anchor: 'viewport', position: [1.15, M.lightAz ?? 180, M.lightPolar ?? 120] };
  const s = sunPos(sunTime()), f = s.dec, l = s.lon * RAD;
  const a = [Math.cos(f) * Math.sin(l), Math.sin(f), Math.cos(f) * Math.cos(l)], p = a.map(v => -v);   // (MapLibre points the light from -position)
  const polar = Math.acos(Math.max(-1, Math.min(1, p[2]))) / RAD, az = Math.atan2(p[1], p[0]) / RAD - 90;
  return { anchor: 'map', position: [1.15, (az + 360) % 360, polar] };
}
function sunApply() {
  const m = M.map; if (!m) return;
  try { m.setLight(sunLight()); } catch (_) {}
  // the shading by the real sun, place by place (maprelief.js: SHADE_PATCH)
  if (sunOn()) { const s = sunPos(sunTime()); self.__pultSun = [Math.sin(s.dec), Math.cos(s.dec), s.lon * RAD, 1]; } else self.__pultSun = [0, 1, 0, 0];
  m.triggerRepaint();
  if (sunOn()) {
    const ns = m.getSource('sunnight');
    if (ns) { nightPaint(sunTime()); ns.play(); requestAnimationFrame(() => requestAnimationFrame(() => ns.pause())); }   // (the picture read once, then the map rests)
    if (m.getLayer('rel-shade')) { const c = sunRef(), a = sunAt(sunPos(sunTime()), c.lng, c.lat);
      m.setPaintProperty('rel-shade', 'hillshade-illumination-anchor', 'map'); m.setPaintProperty('rel-shade', 'hillshade-illumination-direction', Math.round(a.az)); }
  } else if (m.getLayer('rel-shade')) { m.setPaintProperty('rel-shade', 'hillshade-illumination-anchor', 'viewport'); m.setPaintProperty('rel-shade', 'hillshade-illumination-direction', 335); }
  sundialPaint(); obelUpd(); skyHook();
}
// ---------------------------------------------------------------- the place the dial shows (and the shading is lit from)
// An obelisk set on the map with "Here" (mapCfg gnomon: { lng, lat }); else, while the sundial is open, the point of the
// map just above the mark at the middle of the panel's upper edge (where only sky lies there, the mark fades out and the
// dial keeps the last place); else the middle of the map.
function sunRef() {
  const g = M.cfg?.gnomon; if (g) return g;
  if (M.sdOpen && M.sdRef) return M.sdRef;
  return M.map?.getCenter() || { lng: 24, lat: 38 };
}
// The obelisk at rest (522a, v373): while it is not on the map it stands on a socket on the sundial's upper edge, in the middle,
// always the same size; its golden tip points at the ground straight beneath it (its height not counted), and that place is the
// one the dial shows. Dragged onto the map it stands there (its height then counted, at its tip); dragged back onto the dial it
// returns to its socket, which stays, empty, meanwhile (523a, 524a). (Unit model scaled to 50 px: plinth, step, shaft, tip.)
let OB_PSVG = null;
const obelPanelSVG = () => OB_PSVG ??= (() => {
  const U = 50, T = 4, X = 14, y = v => (T + U * (1 - v)).toFixed(2), x = d => (d * U).toFixed(2), tip = 1 - OB_TIP;
  return `<svg class="sdobs" width="28" height="68" viewBox="0 0 28 68" aria-hidden="true">`
    + `<path class="sdsock" d="M1 ${T + U + 2}h26v12H1z"/><path class="sdsockt" d="M1 ${T + U + 2}h26v2.2H1z"/><path class="sdsockh" d="M${X - 9} ${T + U + 2}h18v1.4H${X - 9}z"/>`
    + `<g class="sdob" role="button" aria-label="Obelisk: drag it onto the map to set it up there">`
    + `<path class="sdobh" d="M0 0h28v${T + U + 2}H0z"/>`
    + `<path class="sdst" d="M${X - 8.5} ${y(0)}h17v-2.5h-17z M${X - 6.5} ${y(0.05)}h13v-1.5h-13z"/>`
    + `<path class="sdsh0" d="M${X - 4.4} ${y(0.08)}L${X - 2.6} ${y(tip)}H${X}V${y(0.08)}z"/><path class="sdsh1" d="M${X} ${y(0.08)}V${y(tip)}H${X + 2.6}L${X + 4.4} ${y(0.08)}z"/>`
    + `<path class="sdtip0" d="M${X - 2.6} ${y(tip)}L${X} ${T}V${y(tip)}z"/><path class="sdtip1" d="M${X} ${T}L${X + 2.6} ${y(tip)}H${X}z"/></g></svg>`;
})();
// its light: the face towards the sun brighter (as seen on the screen: the sun's bearing against the map's)
function obelPanelLight() {
  const mk = $('#sdMark'); if (!mk || !M.map) return;
  const r = sunRef(), s = sunAt(sunPos(sunTime()), r.lng, r.lat), right = Math.sin((s.az - M.map.getBearing()) * RAD) > 0;
  mk.classList.toggle('lr', right); mk.classList.remove('night');
  // (darker by degrees through the twilight – v381)
  { const u = Math.max(0, Math.min(1, (s.alt + 8) / 10)), n = sunOn() ? 1 - u * u * (3 - 2 * u) : 0; mk.style.setProperty('--obn', n.toFixed(2)); }
  // (the gold: the face towards the sun the bright one)
  const t0 = mk.querySelector('.sdtip0'), t1 = mk.querySelector('.sdtip1'), id = mk.querySelector('pattern')?.id?.slice(0, -1);
  if (t0 && t1 && id) { t0.setAttribute('fill', `url(#${id}${right ? 'g1' : 'g0'})`); t1.setAttribute('fill', `url(#${id}${right ? 'g0' : 'g1'})`); }
  const sl = mk.querySelector('.obszv'); if (sl && document.activeElement !== sl) sl.value = Math.round(Math.log(obelK() * 3) / Math.log(9) * 100);
}
// the obelisk at rest in the reworked panel (540a, v376): its socket on the panel's foot, its golden tip just over the top – as tall
// as the panel; where the room between the two wheels is narrow, slimmer
function obelPanelFit(Ly) {
  const mk = $('#sdMark'), pn = $('#sunPanel'); if (!mk) return;
  // (on the bar since v380: from its top edge to the tip just over the panel's top)
  const Hm = Ly.H - SD.BAR - 12, U = Hm - 16, gap = (Ly.zx - (SD.ZR + 4) * Ly.k) - (Ly.dx + (SD.R + 6) * Ly.k) - 14, sx = Math.max(0.3, Math.min(1, gap / (0.34 * U + 10)));
  const Wm = Math.ceil(0.34 * U * sx + 10), away = mk.classList.contains('away');
  mk.style.width = Wm + 'px'; mk.style.height = Hm + 'px';
  // (while the obelisk stands on the map: where it stood, a slider for its size – 552, v380)
  mk.innerHTML = obelTallSVG(Wm, Hm, U, sx) + `<input type="range" class="obszv" min="0" max="100" value="${Math.round(Math.log(obelK() * 3) / Math.log(9) * 100)}" data-obsz="1" aria-label="Size of the obelisk" title="Size of the obelisk" style="width:${Math.max(40, Hm - 52)}px">`;
  mk.classList.toggle('away', away); obelPanelLight();
}
function obelTallSVG(Wm, Hm, U, sx) {
  const X = Wm / 2, y = v => (4 + U * (1 - v)).toFixed(2), tip = 1 - OB_TIP, h = d => +(d * U * sx).toFixed(2), id = 'ob' + Math.round(Hm);
  return `<svg class="sdobs" width="${Wm}" height="${Hm}" viewBox="0 0 ${Wm} ${Hm}" aria-hidden="true"><defs>`
    + `<pattern id="${id}p" patternUnits="userSpaceOnUse" width="64" height="64"><image href="${porphyryURL()}" width="64" height="64"/></pattern>`
    + `<linearGradient id="${id}g0" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#d8a032"/><stop offset=".38" stop-color="#ffe9a8"/><stop offset=".5" stop-color="#ffffff"/><stop offset=".62" stop-color="#ffe490"/><stop offset="1" stop-color="#f0b83a"/></linearGradient>`
    + `<linearGradient id="${id}g1" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#6e4a10"/><stop offset=".45" stop-color="#b8861c"/><stop offset=".55" stop-color="#fff0c0"/><stop offset=".65" stop-color="#c9971f"/><stop offset="1" stop-color="#8a6014"/></linearGradient></defs>`
    + `<path class="sdsockhit" d="M0 ${Hm - 30}h${Wm}v30H0z"/><path class="sdsock" d="M1 ${Hm - 12}h${Wm - 2}v12H1z"/><path class="sdsockt" d="M1 ${Hm - 12}h${Wm - 2}v2.2H1z"/><path class="sdsockh" d="M${X - h(0.17)} ${Hm - 12}h${2 * h(0.17)}v1.4H${X - h(0.17)}z"/>`
    + `<g class="sdob" role="button" aria-label="Obelisk: drag it onto the map to set it up there">`
    + `<path class="sdst" fill="url(#${id}p)" d="M${X - h(0.17)} ${y(0)}h${2 * h(0.17)}V${y(0.05)}h${-2 * h(0.17)}z M${X - h(0.13)} ${y(0.05)}h${2 * h(0.13)}V${y(0.08)}h${-2 * h(0.13)}z"/>`
    + `<path class="sdsh0" fill="url(#${id}p)" d="M${X - h(0.088)} ${y(0.08)}L${X - h(0.052)} ${y(tip)}H${X}V${y(0.08)}z"/><path class="sdsh1" fill="url(#${id}p)" d="M${X} ${y(0.08)}V${y(tip)}H${X + h(0.052)}L${X + h(0.088)} ${y(0.08)}z"/>`
    + `<path class="sdshd0" d="M${X - h(0.088)} ${y(0.08)}L${X - h(0.052)} ${y(tip)}H${X}V${y(0.08)}z"/><path class="sdshd1" d="M${X} ${y(0.08)}V${y(tip)}H${X + h(0.052)}L${X + h(0.088)} ${y(0.08)}z"/>`
    + `<path class="sdtip0" fill="url(#${id}g0)" d="M${X - h(0.052)} ${y(tip)}L${X} 4V${y(tip)}z"/><path class="sdtip1" fill="url(#${id}g1)" d="M${X} 4L${X + h(0.052)} ${y(tip)}H${X}z"/><path class="sdshn" d="M${X - h(0.17)} ${y(0)}h${2 * h(0.17)}V${y(0.08)}H${X + h(0.088)}L${X + h(0.052)} ${y(tip)}H${X - h(0.052)}L${X - h(0.088)} ${y(0.08)}H${X - h(0.17)}z"/><path class="sdtipd" d="M${X - h(0.052)} ${y(tip)}L${X} 4L${X + h(0.052)} ${y(tip)}z"/></g></svg>`;
}
// over the sundial (to put the obelisk back)
function overDial(ev) { for (const el of [$('#sunPanel'), $('#sdMark')]) { const q = el?.getBoundingClientRect(); if (q && ev.clientX >= q.left && ev.clientX <= q.right && ev.clientY >= q.top && ev.clientY <= q.bottom) return true; } return false; }
async function obelHome() {
  M.cfg.gnomon = null; await saveMapCfg(); obelUpd(); sdRefUpd(); sunApply(); const c = $('#sunCtl'); if (c) c.innerHTML = sdCtlHTML();
}
// the empty socket tapped twice: the obelisk comes back from the map (v374)
// (two taps within 0.4 s, near each other – Safari on the iPad sends no double-click for a finger)
document.addEventListener('pointerup', ev => {
  if (!ev.target.closest?.('#sdMark') || !M.cfg?.gnomon) return;
  const t = performance.now(), l = M.sockTap; M.sockTap = { t, x: ev.clientX, y: ev.clientY };
  if (l && t - l.t < 400 && Math.hypot(ev.clientX - l.x, ev.clientY - l.y) < 30) { M.sockTap = null; ev.preventDefault(); obelHome(); }
}, true);
// taking it from its socket onto the map: a copy of it follows the finger; let go over the map, it stands where its foot is
document.addEventListener('pointerdown', ev => {
  const ob = ev.target.closest?.('#sdMark .sdob'); if (!ob || M.cfg?.gnomon || !M.map || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
  ev.preventDefault(); ev.stopPropagation();
  const mk = $('#sdMark'), dx = 14, dy = 30, x0 = ev.clientX, y0 = ev.clientY;   // (the copy that follows: the small obelisk, held by its shaft)
  let gh = null;
  const mv = e => { if (e.pointerId !== ev.pointerId) return; e.preventDefault();
    if (!gh) { if (Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return; gh = document.createElement('div'); gh.className = 'sdghost' + (mk.classList.contains('lr') ? ' lr' : ''); gh.innerHTML = obelPanelSVG(); document.body.append(gh); mk.classList.add('away'); }
    gh.style.left = (e.clientX - dx) + 'px'; gh.style.top = (e.clientY - dy) + 'px'; gh.classList.toggle('home', overDial(e)); };
  const up = async e => { if (e.pointerId !== ev.pointerId) return; removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true);
    if (!gh) { note('Drag the obelisk onto the map to set it up there.'); return; }
    const foot = [e.clientX - dx + 14, e.clientY - dy + 4 + 50], cr = M.map.getCanvas().getBoundingClientRect(); gh.remove();
    const inMap = foot[0] >= cr.left && foot[0] <= cr.right && foot[1] >= cr.top && foot[1] <= cr.bottom;
    let ll = null; if (inMap && e.type === 'pointerup' && !overDial(e)) { try { ll = M.map.unproject([foot[0] - cr.left, foot[1] - cr.top]); const p = M.map.project(ll); if (Math.hypot(p.x - foot[0] + cr.left, p.y - foot[1] + cr.top) > 20 || Math.abs(ll.lat) > 85) ll = null; } catch (_) { ll = null; } }
    if (!ll) { mk.classList.remove('away'); return; }               // (not on the ground: back on its socket)
    // (its height in metres: as tall as it looked on the sundial – 50 px at this zoom – 525b, v374)
    const mpp = 40075016.7 * Math.cos(ll.lat * RAD) / (512 * 2 ** M.map.getZoom());
    M.cfg.gnomon = { lng: ((ll.lng + 540) % 360) - 180, lat: ll.lat, h: 50 * mpp / obelK() }; await saveMapCfg(); obelUpd(); sdRefUpd(); sunApply(); const c = $('#sunCtl'); if (c) c.innerHTML = sdCtlHTML(); };
  addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
}, true);
function sdRefUpd() {
  const mk = $('#sdMark'), m = M.map; if (!mk || !m) return;
  mk.classList.toggle('away', !!M.cfg.gnomon); obelPanelLight(); if (M.cfg.gnomon) return;
  const r = mk.getBoundingClientRect(), cr = m.getCanvas().getBoundingClientRect(), pt = [r.left + r.width / 2 - cr.left, r.top - cr.top];
  let ll = null; try { ll = m.unproject(pt); const q = m.project(ll); if (Math.hypot(q.x - pt[0], q.y - pt[1]) > 2 || Math.abs(ll.lat) > 85.05) ll = null; } catch (_) { ll = null; }
  mk.classList.toggle('off', !ll);
  if (ll) M.sdRef = { lng: ((ll.lng + 540) % 360) - 180, lat: ll.lat };
}
// on every movement of the map (once a frame): the mark's place, the dial, the shading, the obelisk's shadow
function sunMove() {
  if (M.sunMvRaf) return;
  M.sunMvRaf = requestAnimationFrame(() => { M.sunMvRaf = 0;
    if (M.sdOpen) { sdRefUpd(); sundialPaint(); }
    const m = M.map; if (sunOn() && m?.getLayer('rel-shade') && !M.cfg.gnomon) { const c = sunRef(), a = Math.round(sunAt(sunPos(sunTime()), c.lng, c.lat).az);
      if (a !== M.shadeAz) { M.shadeAz = a; m.setPaintProperty('rel-shade', 'hillshade-illumination-direction', a); } }
    obelShadow(); });
}
function sunMoveHook() { const m = M.map; if (m && !m._sunMv) { m._sunMv = true; m.on('move', sunMove); m.on('style.load', () => setTimeout(() => { obelUpd(); skyHook(); }, 0)); } skyHook(); }
// the obelisk: a model of red porphyry standing upright on the ground (fill-extrusion, lit by the sun where it stands): a
// plinth, a tapering shaft, a pointed top; its size fixed in metres when it is set (then like any building: larger as one
// zooms in), the reader's size ⅓ … 3 times; its shadow on the ground away from the sun, long when the sun is low, none at night. Dragged,
// it moves; "Here" again takes it away.
const OB_H = 34, obelK = () => M.cfg?.obelSize || 1;              // (its height in screen pixels, times the reader's size)
// the golden pyramid on top: as high as a pyramid of four equilateral faces on the shaft's top (0.104 wide) – v373
const OB_TIP = 0.104 / Math.SQRT2;
function obelGeo() {
  const g = M.cfg.gnomon, m = M.map, z = m.getZoom(), lat = g.lat * RAD;
  // its height in metres: fixed when it is set (OB_H pixels at the zoom of that moment), times the reader's size
  if (!g.h) { g.h = OB_H * 40075016.7 * Math.cos(lat) / (512 * 2 ** z); saveMapCfg(); }
  const H = g.h * obelK();
  // the light on it: the sun where it stands (or, without sunlight, from the north-west); dim at night
  const sp = ([r, a, p]) => { a = (a + 90) * RAD; p *= RAD; return [r * Math.cos(a) * Math.sin(p), r * Math.sin(a) * Math.sin(p), r * Math.cos(p)]; };
  // (the engine's "intensity" sets only the contrast between the faces – a low one makes all faces bright; so the dusk and the
  // night darken the stone's colour itself, as the night shade darkens the ground, and the light keeps its contrast – v331)
  const sa = sunAt(sunPos(sunTime()), g.lng, g.lat), sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lit = !sunOn() ? 1 : 0.3 + 0.7 * sm(-6, 8, sa.alt);
  self.__pultObLight = !sunOn() ? [...sp([1.15, 315, 45]), 0.6] : sa.alt > -4 ? [...sp([1.15, sa.az, 90 - Math.max(1, sa.alt)]), 0.6] : [...sp([1.15, 0, 0]), 0.6];
  const dim = c => '#' + [1, 3, 5].map(i => Math.round(parseInt(c.substr(i, 2), 16) * lit).toString(16).padStart(2, '0')).join('');
  const dLat = d => d / 111320, dLon = d => d / (111320 * Math.max(0.05, Math.cos(lat)));
  const sq = h => [[[g.lng - dLon(h), g.lat - dLat(h)], [g.lng + dLon(h), g.lat - dLat(h)], [g.lng + dLon(h), g.lat + dLat(h)], [g.lng - dLon(h), g.lat + dLat(h)], [g.lng - dLon(h), g.lat - dLat(h)]]];
  const f = [], piece = (h, b, t, c) => f.push({ type: 'Feature', properties: { b, t, c: dim(c) }, geometry: { type: 'Polygon', coordinates: sq(h) } });
  piece(0.17 * H, 0, 0.05 * H, '#3e1524'); piece(0.13 * H, 0.05 * H, 0.08 * H, '#4a1a2b');            // (the plinth, in two steps)
  const SH = 1 - OB_TIP - 0.08;
  for (let i = 0; i < 20; i++) { const a = (i + 0.5) / 20; piece((0.088 - 0.036 * a) * H, (0.08 + SH * i / 20) * H, (0.08 + SH * (i + 1) / 20) * H, '#6e2b3e'); }   // (the shaft, tapering in fine steps)
  for (let i = 0; i < 6; i++) { const a = (i + 0.5) / 6; piece((0.052 * (1 - a) + 0.002) * H, (1 - OB_TIP + OB_TIP * i / 6) * H, (1 - OB_TIP + OB_TIP * (i + 1) / 6) * H, '#d9a92e'); }   // (the golden top)
  // the shadow: from the foot, away from the sun
  const s = sunAt(sunPos(sunTime()), g.lng, g.lat), sh = [];
  if (sunOn() && s.alt > 0) {
    // (along great circles from the foot, so a long shadow stays straight on the globe; strong, fading only slightly at its
    // edges and towards the tip – v329)
    const L = Math.min(8 * H, H / Math.tan(Math.max(1.5, s.alt) * RAD)), az = s.az + 180, w = 0.088 * H, R = 6371008.8, la1 = g.lat * RAD, lo1 = g.lng * RAD;
    const dest = (brg, dist) => { const t = brg * RAD, d = dist / R, la = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(t));
      return [(lo1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la))) / RAD, la / RAD]; };
    const P = (along, side) => { const dd = Math.hypot(along, side); return dd < 1e-6 ? [g.lng, g.lat] : dest(az + Math.atan2(side, along) / RAD, dd); };
    // the outline: as broad as the foot, narrowing to 0.6 of it, then to the tip; e widens (or narrows) it a little
    const half = t => w * (1 - 0.4 * Math.min(1, t / (1 - OB_TIP))) * (t > 1 - OB_TIP ? (1 - t) / OB_TIP : 1);
    const shape = (e, len) => { const pts = [], n = 12;
      for (let i = 0; i <= n; i++) { const t = i / n, a = t * len; pts.push(P(a, half(t) + e(a))); }
      pts.push(P(len + e(len), 0));
      for (let i = n; i >= 0; i--) { const t = i / n, a = t * len; pts.push(P(a, -half(t) - e(a))); }
      pts.push(pts[0]); return [pts]; };
    // dark within, a narrow fading rim; the tip reached only by the faint rim layers
    const strong = Math.max(0.3, Math.min(0.62, 0.3 + s.alt / 25)), sb = 0.012 * H, k = 0.012;
    for (const [f, o, len] of [[-1, strong * 0.85, 0.9 * L], [0, strong * 0.12, 0.96 * L], [1, strong * 0.08, L]]) { const e = a => f * (sb + a * k);
      sh.push({ type: 'Feature', properties: { o }, geometry: { type: 'Polygon', coordinates: shape(e, len) } }); }
  }
  M.obZ = z;
  return [{ type: 'FeatureCollection', features: f }, { type: 'FeatureCollection', features: sh }];
}
function obelUpd() {
  const g = M.cfg?.gnomon, m = M.map; if (!m || !m.style?._loaded) return;
  if (!g) { self.__pultObLight = null; for (const id of ['obel', 'obel-sh', 'obel3d']) if (m.getLayer(id)) m.removeLayer(id); for (const id of ['obel', 'obelsh']) if (m.getSource(id)) m.removeSource(id); return; }
  const [body, sh0] = obelGeo();
  // the model drawn with three.js (when it is loaded): its own shadow on a flat ground where the map is flat and the shadow
  // short; else the shadow laid on the ground (3D terrain, the curve of the globe), as before
  if (!M.three && !M.threeTried) { M.threeTried = true; threeLib().then(T => { if (T) { M.three = T; obelUpd(); } }); }
  const ob3 = !!M.three, plane = ob3 && !m.getTerrain() && g.h * obelK() * 8 < 3e5, sh = plane ? { type: 'FeatureCollection', features: [] } : sh0;
  if (!ob3 && m.getLayer('obel')) m.setLayoutProperty('obel', 'visibility', M.cam?.mode === 'obel' ? 'none' : 'visible');
  if (ob3) { if (m.getLayer('obel')) m.setLayoutProperty('obel', 'visibility', 'none'); if (!m.getLayer('obel3d')) { m.addLayer(obel3dLayer(M.three)); obelDragHook(m); } M.ob3Plane = plane; m.triggerRepaint(); }
  if (!m.getSource('obel')) {
    m.addSource('obelsh', { type: 'geojson', data: sh }); m.addSource('obel', { type: 'geojson', data: body });
    m.addLayer({ id: 'obel-sh', type: 'fill', source: 'obelsh', paint: { 'fill-color': '#140e08', 'fill-opacity': ['get', 'o'], 'fill-antialias': false } });
    m.addLayer({ id: 'obel', type: 'fill-extrusion', source: 'obel', layout: { visibility: ob3 ? 'none' : 'visible' }, paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 't'], 'fill-extrusion-vertical-gradient': true } });
    obelDragHook(m);
  } else { m.getSource('obel').setData(body); m.getSource('obelsh').setData(sh); }
}
// ---------------------------------------------------------------- the obelisk as a model (three.js, in a layer of its own – v333)
// Shaft and point of red porphyry (a speckled stone, slightly glossy), lit by the sun where it stands and by the sky; at dusk and
// night dimmer and bluer. If three.js cannot be loaded, the blocks of the map engine stand in for it.
const THREE_URL = 'lib/three-0.169.0.module.min.js';
let threeP = null;
const threeLib = () => threeP ??= import(new URL(THREE_URL, location.href).href).catch(e => { console.warn('three.js not available:', e.message); return null; });
function porphyryTex(T) {
  const t = new T.CanvasTexture(porphyryCanvas()); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
}
// the stone itself, once: deep red-purple with dark and pale specks and white crystals (the 3D obelisk, and as a picture the 2D one)
let PORPH = null;
function porphyryCanvas() {
  if (PORPH) return PORPH;
  const n = 256, cv = PORPH = document.createElement('canvas'); cv.width = cv.height = n; const x = cv.getContext('2d');
  x.fillStyle = '#6a2638'; x.fillRect(0, 0, n, n);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) { const r = rnd(); x.fillStyle = r < 0.5 ? `rgba(46,14,24,${0.25 + rnd() * 0.4})` : r < 0.85 ? `rgba(140,62,80,${0.25 + rnd() * 0.4})` : `rgba(236,214,218,${0.5 + rnd() * 0.5})`;
    const sz = r < 0.85 ? 1 + rnd() * 2.6 : 0.6 + rnd() * 1.4; x.beginPath(); x.arc(rnd() * n, rnd() * n, sz, 0, 7); x.fill(); }
  return cv;
}
let PORPH_URL = null;
const porphyryURL = () => PORPH_URL ??= porphyryCanvas().toDataURL('image/png');
function obel3dLayer(T) {
  return { id: 'obel3d', type: 'custom', renderingMode: '3d',
    onAdd(map, gl) {
      this.map = map; this.cam = new T.Camera(); this.scene = new T.Scene();
      this.r = new T.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      this.r.autoClear = false;
      const tex = porphyryTex(T), stone = new T.MeshStandardMaterial({ map: tex, roughness: 0.32, metalness: 0.02 }), base = new T.MeshStandardMaterial({ map: tex, color: 0x9a8890, roughness: 0.5 });
      const g = this.g = new T.Group();
      const box = (w, h, y, mat) => { const b = new T.Mesh(new T.BoxGeometry(w, h, w), mat); b.position.y = y + h / 2; g.add(b); };
      box(0.34, 0.05, 0, base); box(0.26, 0.03, 0.05, base);                                      // (the plinth, in two steps: unit height 1)
      const SH = 1 - OB_TIP - 0.08, shaft = new T.Mesh(new T.CylinderGeometry(0.052 * Math.SQRT2, 0.088 * Math.SQRT2, SH, 4, 1), stone);   // (a square frustum)
      shaft.rotation.y = Math.PI / 4; shaft.position.y = 0.08 + SH / 2; g.add(shaft);
      // the tip: a perfect pyramid of gold – four equilateral triangles on the shaft's square top (520a, v373)
      // (polished: it mirrors a simple sky and ground around it – 526b, v374; the mirror image made once, before its first drawing)
      const gold = this.gold = new T.MeshStandardMaterial({ color: 0xffd866, metalness: 1, roughness: 0.04 });   // (polished – 554, v380; more so v381)
      const tip = new T.Mesh(new T.ConeGeometry(0.052 * Math.SQRT2, OB_TIP, 4, 1), gold); tip.rotation.y = Math.PI / 4; tip.position.y = 1 - OB_TIP / 2; g.add(tip);
      g.updateMatrixWorld(true); this.scene.add(g);
      // its shadow where the map is flat: the model pressed flat onto the ground along the sun's rays, five times from a sun moved a
      // little each way – overlapping, they are dark in the middle and soften at the edges, more towards the tip (each pixel taken
      // once per copy: the stencil)
      this.sh = []; this.shScene = new T.Scene();                    // (drawn first, so the stone covers it)
      for (let i = 0; i < 5; i++) {
        const mat = new T.MeshBasicMaterial({ color: 0x140e08, transparent: true, depthTest: false, depthWrite: false,
          stencilWrite: true, stencilRef: i + 1, stencilFunc: T.NotEqualStencilFunc, stencilZPass: T.ReplaceStencilOp, stencilFail: T.KeepStencilOp });
        const sg = new T.Group(); sg.matrixAutoUpdate = false;
        for (const ms of g.children) { const c = new T.Mesh(ms.geometry, mat); c.matrixAutoUpdate = false; c.matrix.copy(ms.matrix); c.renderOrder = -1; sg.add(c); }
        this.shScene.add(sg); this.sh.push(sg);
      }
      this.sun = new T.DirectionalLight(0xfff4e0, 3); this.scene.add(this.sun, this.sun.target);
      this.sky = new T.HemisphereLight(0xbcd2ff, 0x5a4a3a, 0.8); this.scene.add(this.sky);
    },
    // (drawn when the map has finished its frame, after the glow of the atmosphere, which the engine lays over everything – so the
    // stone covers the glow; the depth of the frame is still there, so hills and the globe still hide it – v338)
    render(gl, args) { this.mm = args.defaultProjectionData.mainMatrix.slice ? args.defaultProjectionData.mainMatrix.slice() : Array.from(args.defaultProjectionData.mainMatrix); this.gl = gl; this.dr = gl.getParameter(gl.DEPTH_RANGE);   // (the engine's depth range for 3D: used again when drawing)
      if (!this.hooked) { this.hooked = () => { if (this.mm) { this.draw(this.gl, this.mm); this.mm = null; } }; this.map.on('render', this.hooked); } },
    onRemove() { if (this.hooked) this.map.off('render', this.hooked); this.hooked = null; },
    draw(gl, mainMatrix) {
      const g = M.cfg?.gnomon, map = this.map; if (!g || M.cam?.mode === 'obel') return;   // (not while one looks out from its tip)
      const H = (g.h || 1) * obelK(), ter = map.getTerrain();
      let alt = 0; if (ter) { try { alt = map.queryTerrainElevation([g.lng, g.lat]) || 0; } catch (_) {} }
      const P = new T.Matrix4().fromArray(mainMatrix).multiply(new T.Matrix4().fromArray(map.transform.getMatrixForModel([g.lng, g.lat], alt)));
      this.cam.projectionMatrix = P.clone().multiply(new T.Matrix4().makeScale(H, H, H)); this.P = this.cam.projectionMatrix;
      // the sun where it stands (model: x east, y up, z south), or without sunlight from the north-west; dusk and night dimmer
      const sa = sunAt(sunPos(sunTime()), g.lng, g.lat), on = sunOn(), sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      const az = (on ? sa.az : 315) * RAD, el = (on ? Math.max(0.5, sa.alt) : 45) * RAD, day = on ? sm(-1, 6, sa.alt) : 1;
      this.sun.position.set(Math.cos(el) * Math.sin(az) * 10, Math.sin(el) * 10, -Math.cos(el) * Math.cos(az) * 10); this.sun.target.position.set(0, 0, 0);
      this.sun.intensity = 3.2 * day; this.sun.color.setHSL(0.09, 0.6, 0.5 + 0.45 * (on ? sm(0, 20, sa.alt) : 1));     // (warmer when low)
      this.sky.intensity = on ? 0.18 + 0.75 * sm(-10, 8, sa.alt) : 0.9;
      const plane = !!M.ob3Plane && on && sa.alt > 0, O = Math.max(0.3, Math.min(0.62, 0.3 + sa.alt / 25)), a1 = 1 - (1 - O) ** (1 / 5), j = 1.4 * RAD;
      this.sh.forEach((sg, i) => { sg.visible = plane; if (!plane) return;
        const [dz, de] = [[0, 0], [j, 0], [-j, 0], [0, j], [0, -j]][i], a = az + dz, e = Math.max(1.5 * RAD, el + de);
        const lx = Math.cos(e) * Math.sin(a), ly = Math.sin(e), lz = -Math.cos(e) * Math.cos(a);
        sg.matrix.set(1, -lx / ly, 0, 0, 0, 0, 0, 0.001, 0, -lz / ly, 1, 0, 0, 0, 0, 1); sg.matrixWorldNeedsUpdate = true; sg.children[0].material.opacity = a1; });
      this.r.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      if (!this.env && this.gold) { this.env = 1; try { this.r.resetState(); this.gold.envMap = obelEnv(T, this.r); this.gold.needsUpdate = true; } catch (_) {} }
      if (this.gold) this.gold.envMapIntensity = 0.6 + 1.9 * day;
      this.r.resetState(); if (this.dr) gl.depthRange(this.dr[0], this.dr[1]); gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT); if (plane) this.r.render(this.shScene, this.cam); this.r.render(this.scene, this.cam);
    } };
}
// where the model stands on the screen: its foot and its top (for grabbing it)
// what the gold mirrors: a bright pale sky above and at the horizon, brown ground below – six small pictures, prepared for a polished surface
function obelEnv(T, r) {
  const face = (top, bot) => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 32); g.addColorStop(0, top); g.addColorStop(1, bot); x.fillStyle = g; x.fillRect(0, 0, 32, 32); return c; };
  // (nearly white above: a blue sky made the gold look grey in a mirror this small)
  const side = face('#ffffff', '#6e5a40'), up = face('#ffffff', '#f2f6fb'), dn = face('#4e3f2d', '#4e3f2d');   // (bright above, dark below: a mirror's contrast – v381)
  const cube = new T.CubeTexture([side, side, up, dn, side, side]); cube.colorSpace = T.SRGBColorSpace; cube.needsUpdate = true;
  const pm = new T.PMREMGenerator(r), tex = pm.fromCubemap(cube).texture; pm.dispose(); return tex;
}
function obel3dAxis() { const pr = obel3dProj(); return pr ? [pr(0, 0, 0), pr(0, 1, 0)] : null; }
// a point of the model (unit height; x east, y up, z south) on the screen, or null behind the eye
function obel3dProj() {
  const L = M.map?.getLayer('obel3d')?.implementation, cv = M.map?.getCanvas(); if (!L?.P || !cv) return null;
  const e = L.P.elements;
  return (x, y, z) => { const c = [0, 1, 2, 3].map(i => e[i] * x + e[4 + i] * y + e[8 + i] * z + e[12 + i]);
    return c[3] > 0 ? [(c[0] / c[3] + 1) / 2 * cv.clientWidth, (1 - c[1] / c[3]) / 2 * cv.clientHeight] : null; };
}
// grabbing the obelisk (521, v373): on its drawn outline – each part (plinth, step, shaft, golden tip) a solid whose outline on the
// screen is the hull of its corners; while it is drawn thin, some room around it, so that a finger (or the mouse) can still catch
// it – none once it is broad enough
function obelHit(x, y, touch) {
  const pr = obel3dProj(); if (!pr) return null;
  const lv = (hw, yy) => [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]].map(([a, b]) => pr(a, yy, b));
  const parts = [[...lv(0.17, 0), ...lv(0.17, 0.05)], [...lv(0.13, 0.05), ...lv(0.13, 0.08)], [...lv(0.088, 0.08), ...lv(0.052, 1 - OB_TIP)], [...lv(0.052, 1 - OB_TIP), pr(0, 1, 0)]];
  if (parts.some(q => q.some(v => !v))) return null;
  // how broad the shaft is drawn: across the middle
  const mid = lv(0.07, 0.5), w = Math.max(Math.hypot(mid[0][0] - mid[2][0], mid[0][1] - mid[2][1]), Math.hypot(mid[1][0] - mid[3][0], mid[1][1] - mid[3][1])) / Math.SQRT2;
  const room = Math.max(0, ((touch ? 30 : 18) - w) / 2);
  return parts.some(q => hullDist(q, x, y) <= room);
}
// the distance of a point from the convex hull of some points (0 inside)
function hullDist(P, x, y) {
  const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  const H = lo.slice(0, -1).concat(up.slice(0, -1)); if (H.length < 3) return Infinity;
  let inside = true, d = Infinity;
  for (let i = 0; i < H.length; i++) { const a = H[i], b = H[(i + 1) % H.length]; if (cr(a, b, [x, y]) < 0) inside = false;
    const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1))); d = Math.min(d, Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y)); }
  return inside ? 0 : d;
}
const obelShadow = () => { if (M.cfg?.gnomon && M.map?.getSource('obel') && M.obZ == null) obelUpd(); };   // (after the size slider; its size stays at every zoom)
// dragging it: a finger or the mouse on the obelisk moves it (and not the map). Caught before the map engine sees the touch
// (capture phase), with some room around the thin shape and its foot – the engine's own layer events missed it at times (v332)
function obelDragHook(m) {
  if (m._obDrag) return; m._obDrag = true;
  const box = m.getCanvasContainer(), canvas = m.getCanvas();
  const pt = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const hit = ([x, y], touch = false) => {
    const g = M.cfg?.gnomon; if (!g || M.cam) return false;
    if (m.getLayer('obel3d')) { const h = obelHit(x, y, touch); if (h != null) return h; }
    // (without the 3D model: the flat drawing, with a little room)
    if (!m.getLayer('obel')) return false;
    try { if (m.queryRenderedFeatures([[x - 8, y - 8], [x + 8, y + 8]], { layers: ['obel'] }).length) return true; } catch (_) {}
    const f = m.project([g.lng, g.lat]); return Math.hypot(f.x - x, f.y - y) < 12;    // (the foot)
  };
  box.addEventListener('pointerdown', e => {
    if (M.obGrab || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || !hit(pt(e), e.pointerType !== 'mouse')) return;
    e.stopPropagation(); e.preventDefault(); M.obGrab = e.pointerId; M.obDrag = true;
    try { box.setPointerCapture(e.pointerId); } catch (_) {}
    box.style.cursor = 'grabbing';
    const mv = ev => { if (ev.pointerId !== M.obGrab) return; ev.preventDefault(); $('#sdMark')?.classList.toggle('home', overDial(ev)); const ll = m.unproject(pt(ev));
      M.cfg.gnomon = { lng: ((ll.lng + 540) % 360) - 180, lat: ll.lat, h: M.cfg.gnomon?.h }; obelUpd(); sunApply(); };
    const end = ev => { if (ev.pointerId !== M.obGrab) return; M.obGrab = null; M.obDrag = false; box.style.cursor = ''; M.obNoClick = Date.now() + 400;
      removeEventListener('pointermove', mv, true); removeEventListener('pointerup', end, true); removeEventListener('pointercancel', end, true);
      $('#sdMark')?.classList.remove('home');
      if (overDial(ev)) { obelHome(); return; }                     // (let go over the sundial: back on its socket – 523a)
      saveMapCfg(); };
    addEventListener('pointermove', mv, true); addEventListener('pointerup', end, true); addEventListener('pointercancel', end, true);
  }, true);
  // (the touch and mouse events that follow the same press: kept from the map, so it does not pan meanwhile)
  for (const t of ['touchstart', 'touchmove', 'mousedown', 'mousemove']) box.addEventListener(t, e => { if (M.obGrab != null) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); } }, { capture: true, passive: false });
  m.on('mousemove', e => { if (M.obGrab == null) box.style.cursor = hit([e.point.x, e.point.y]) ? 'grab' : ''; });
}
// ---------------------------------------------------------------- the sun and the moon in the sky (v334)
// Drawn where they truly stand as seen from the place the dial shows: tilted towards the horizon, in the sky; zoomed out, in space
// beside the globe – a direction "at infinity" projected by the map's own camera, hidden where the earth lies before it. Larger
// than true (settings: skySize, 1 … 24, 10 – v336), the moon in its real phase. (The switches skySun, skyMoon retired in v372: both always shown.)
const mat4v = (m, v) => [0, 1, 2, 3].map(i => m[i] * v[0] + m[4 + i] * v[1] + m[8 + i] * v[2] + m[12 + i] * v[3]);
const skyDir = (az, alt) => [Math.cos(alt * RAD) * Math.sin(az * RAD), Math.sin(alt * RAD), -Math.cos(alt * RAD) * Math.cos(az * RAD)];   // (x east, y up, z south)
// Behind the map, wherever no earth is seen (around the globe, above the horizon of a tilted view): the sky of Flammarion's
// engraving (1888) – blue, deeper higher up – with yellow six-pointed stars outlined in black: the real stars, down to the fifth
// magnitude (Hipparcos, via d3-celestial: sky/stars.json – [right ascension, declination, magnitude, HIP number], J2000), so that
// they form the constellations where they stand, turning with the sky; the twelve of the zodiac joined by fine silver lines. The sun
// is cut from the engraving and coloured (sky/sun.webp – its right side, hidden there by the frame, completed from the left, the face
// set upright); its face, in cream, is the moon's (sky/moonface.webp), the crescent drawn with a face in profile (v339/340).
const SKY = { img: {} };
function skyStars() {                                               // (loaded once; the map is redrawn when they arrive)
  if (SKY.stars !== undefined) return SKY.stars; SKY.stars = null;
  fetch('sky/stars.json').then(r => r.json()).then(a => { SKY.stars = a.map(([ra, dec, mag, id]) => { let sd = id * 7919 % 2147483647 || 1; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    return { ra, dec: dec * RAD, v: [Math.cos(dec * RAD) * Math.cos(ra * RAD), Math.cos(dec * RAD) * Math.sin(ra * RAD), Math.sin(dec * RAD)], s: Math.max(0.16, 0.2 + 0.15 * (5 - mag)), rot: r() * 60, j: Array.from({ length: 6 }, () => 0.88 + 0.24 * r()), h: mag < 0.6 }; }); M.map?.triggerRepaint(); })
    .catch(() => { SKY.stars = undefined; });
  return null;
}
function skyImg(n) {                                                // (the sprites, loaded once; the map is redrawn when they arrive)
  const o = SKY.img[n]; if (o) return o.complete && o.naturalWidth ? o : null;
  const im = SKY.img[n] = new Image(); im.onload = () => M.map?.triggerRepaint(); im.src = `sky/${n}.webp`; return null;
}
// The sun's colour by its height and whether it rises or sets (v343): rising, from red through rose to gold; setting, from gold
// through orange to crimson – held until the end of twilight (18° below the horizon); deeper still, as seen only from space, it
// turns golden again. (Height in degrees; [r, g, b].)
const SUN_GOLD = [255, 210, 70];
const SUN_RISE = [[-30, SUN_GOLD], [-18, [196, 34, 30]], [-5, [222, 58, 46]], [-1, [246, 112, 112]], [4, [255, 156, 138]], [9, [255, 190, 100]], [14, SUN_GOLD]];
const SUN_SET = [[-30, SUN_GOLD], [-18, [150, 14, 44]], [-5, [178, 22, 48]], [-1, [232, 84, 34]], [4, [255, 140, 36]], [9, [255, 182, 56]], [14, SUN_GOLD]];
// Without an obelisk (v346) the height is taken above the horizon the camera sees – the real one from the ground (a little lowered
// when the camera is high), the rim of the globe from space – and the scale starts there, at its deepest: rising red, then rose,
// gold; setting gold, orange, crimson.
const SUN_RISE_V = [[0, [206, 40, 32]], [3, [246, 112, 112]], [7, [255, 160, 130]], [11, [255, 190, 100]], [14, SUN_GOLD]];
const SUN_SET_V = [[0, [168, 18, 46]], [3, [232, 84, 34]], [7, [255, 140, 36]], [11, [255, 182, 56]], [14, SUN_GOLD]];
function sunTint(alt, rising, T = rising ? SUN_RISE : SUN_SET) {
  if (alt <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (alt <= T[i][0]) { const [a0, c0] = T[i - 1], [a1, c1] = T[i], u = (alt - a0) / (a1 - a0); return c0.map((v, k) => Math.round(v + (c1[k] - v) * u)); }
  return SUN_GOLD;
}
// the sprite split once into its paper (the colour, with the glow fading outwards) and its ink; coloured anew as the colour changes
function skySunTinted(rgb) {
  const im = skyImg('sun'); if (!im) return null;
  if (!SKY.sunInk) {
    const w = im.naturalWidth, h = im.naturalHeight, mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const src = mk(), sx = src.getContext('2d', { willReadFrequently: true }); sx.drawImage(im, 0, 0);
    const d = sx.getImageData(0, 0, w, h), ink = new ImageData(w, h), pap = new ImageData(w, h);
    for (let o = 0; o < d.data.length; o += 4) { const L = 0.299 * d.data[o] + 0.587 * d.data[o + 1] + 0.114 * d.data[o + 2], a = d.data[o + 3], c = Math.max(0, Math.min(1, (212 - L) / 190));
      ink.data[o] = 28; ink.data[o + 1] = 20; ink.data[o + 2] = 14; ink.data[o + 3] = a * c; pap.data[o] = pap.data[o + 1] = pap.data[o + 2] = 255; pap.data[o + 3] = a * (1 - c); }
    const ic = mk(), pc = mk(); ic.getContext('2d').putImageData(ink, 0, 0); pc.getContext('2d').putImageData(pap, 0, 0);
    SKY.sunInk = ic; SKY.sunPap = pc; SKY.sunCol = new Map();
  }
  const q = rgb.map(v => Math.round(v / 6) * 6), k = q.join();
  let c = SKY.sunCol.get(k);
  if (!c) {
    c = document.createElement('canvas'); c.width = SKY.sunPap.width; c.height = SKY.sunPap.height; const x = c.getContext('2d');
    x.drawImage(SKY.sunPap, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = `rgb(${q})`; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-over'; x.drawImage(SKY.sunInk, 0, 0);
    SKY.sunCol.set(k, c); if (SKY.sunCol.size > 6) SKY.sunCol.delete(SKY.sunCol.keys().next().value);
  }
  return c;
}
function skyZodiac() {                                              // the twelve constellations of the zodiac, as lines (d3-celestial)
  if (SKY.zod !== undefined) return SKY.zod; SKY.zod = null;
  fetch('sky/zodiac.json').then(r => r.json()).then(a => { SKY.zodRaw = a; SKY.zod = a.map(ln => ln.map(([ra, dec]) => [Math.cos(dec * RAD) * Math.cos(ra * RAD), Math.cos(dec * RAD) * Math.sin(ra * RAD), Math.sin(dec * RAD)])); M.map?.triggerRepaint(); }).catch(() => { SKY.zod = undefined; });
  return null;
}
function skyStar(y, x0, y0, R, st) {
  y.beginPath();
  for (let i = 0; i < 12; i++) { const a = (st.rot + i * 30) * RAD, q = i % 2 ? 0.42 * R : R * st.j[i / 2]; y[i ? 'lineTo' : 'moveTo'](x0 + q * Math.sin(a), y0 - q * Math.cos(a)); }
  y.closePath(); y.fillStyle = '#f6d34c'; y.fill(); y.lineWidth = Math.max(0.7, R * 0.11); y.strokeStyle = '#17110b'; y.stroke();
  if (st.h) { y.lineWidth = Math.max(0.6, R * 0.06); y.beginPath();       // (a few with a crown of rays, as in the engraving)
    for (let i = 0; i < 28; i++) { const a = i / 28 * 2 * Math.PI, l = 1.25 + 0.35 * ((i * 7) % 5) / 4; y.moveTo(x0 + 1.12 * R * Math.cos(a), y0 + 1.12 * R * Math.sin(a)); y.lineTo(x0 + l * R * Math.cos(a), y0 + l * R * Math.sin(a)); }
    y.stroke(); }
}
// the crescent moon, with a face in profile on its inner edge, drawn in the manner of the engraving (lit side to the right;
// radius 100 units – v340)
const MOON_PROF = [[-8, -99.7], [10, -88], [24, -70], [31, -50], [30, -38], [26, -31], [33, -23], [29, -14], [17, -4], [6, 6], [14, 10], [24, 12], [19, 19], [27, 24], [20, 30], [27, 37], [19, 46], [17, 56], [26, 64], [40, 72], [44, 84], [30, 94], [-8, 99.7]];
function moonProfPath() {
  const p = new Path2D(), a0 = Math.atan2(-99.7, -8), a1 = Math.atan2(99.7, -8);
  p.moveTo(-8, -99.7); p.arc(0, 0, 100, a0, a1 + 2 * Math.PI * 0, false);
  const P = MOON_PROF.slice().reverse();                        // (up the face again: Catmull-Rom through the points)
  for (let i = 0; i < P.length - 1; i++) { const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(P.length - 1, i + 2)];
    p.bezierCurveTo(b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6, c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6, c[0], c[1]); }
  p.closePath(); return p;
}
function moonProfile(y, r, ink, cream) {
  const s = r / 100, P = moonProfPath(); y.save(); y.scale(s, s);
  y.fillStyle = cream; y.fill(P);
  y.save(); y.clip(P); y.strokeStyle = ink; y.lineCap = 'round';
  y.lineWidth = 1.1; y.beginPath();                              // (shading along the outer rim, as on the sun's face)
  for (let v = -80; v <= 84; v += 4.2) { const x = Math.sqrt(10000 - v * v), l = 7 + 9 * Math.cos(v / 100 * 1.4) * (0.75 + 0.25 * Math.sin(v * 1.7)); y.moveTo(x - l, v + 1.2); y.lineTo(x, v); }
  y.stroke();
  y.lineWidth = 1.7; y.beginPath();
  y.moveTo(37, -33); y.quadraticCurveTo(47, -39, 58, -34);       // (the brow)
  y.moveTo(38, -23); y.quadraticCurveTo(47, -30, 56, -23); y.quadraticCurveTo(47, -18, 38, -23);   // (the eye)
  y.moveTo(22, 4); y.quadraticCurveTo(28, 2, 29, 8);             // (the nostril)
  y.moveTo(27, 24); y.quadraticCurveTo(33, 26, 38, 23);          // (the mouth)
  y.moveTo(24, 46); y.quadraticCurveTo(30, 50, 26, 56);          // (the chin)
  y.moveTo(34, -6); y.quadraticCurveTo(40, 4, 36, 14);           // (the cheek)
  y.stroke(); y.fillStyle = ink; y.beginPath(); y.arc(45, -23.5, 2.6, 0, 7); y.fill();
  y.restore();
  y.lineWidth = 2.4; y.strokeStyle = ink; y.lineJoin = 'round'; y.stroke(P);
  y.restore();
}
// the moon at the origin, its face upright (the drawing turned beforehand): radius r, lit fraction k, lit side sd (1 right,
// −1 left) – the sky behind the map and the all-sky view (mapcam.js)
function skyMoonDraw(y, r, k, sd, ink = '#17110b') {
  // the dark side, a deeper blue
  y.beginPath(); y.arc(0, 0, r, 0, 7); y.fillStyle = '#0c2257'; y.fill();
  y.lineWidth = Math.max(0.6, r * 0.02); y.strokeStyle = 'rgba(10,8,6,.6)'; y.stroke();
  if (k > 0.03) {
    // a crown of short strokes around the bright limb, as engraved
    y.beginPath(); y.lineWidth = Math.max(0.6, r * 0.022); y.strokeStyle = ink;
    for (let i = -26; i <= 26; i++) { const b = i * 3.8 * RAD, l = 1.2 + 0.1 * ((i * 7 + 26) % 5) / 4 + 0.06 * Math.cos(b * 2); y.moveTo(sd * 1.1 * r * Math.cos(b), 1.1 * r * Math.sin(b)); y.lineTo(sd * l * r * Math.cos(b), l * r * Math.sin(b)); }
    y.stroke();
    const face = skyImg('moonface');
    if (k < 0.35 || !face) { y.scale(sd, 1); moonProfile(y, r, ink, '#f4ecce'); }   // a crescent: a face in profile on its inner edge
    else {                                                        // more: the sun's engraved face, in cream, as much of it as is lit
      const e = r * (2 * k - 1), P = new Path2D();                // (the terminator: an ellipse, x = e · cos)
      P.moveTo(0, -r); P.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, sd < 0);
      for (let i = 1; i <= 40; i++) { const b = Math.PI / 2 - i / 40 * Math.PI; P.lineTo(-sd * e * Math.cos(b), r * Math.sin(b)); }
      P.closePath();
      y.save(); y.clip(P); const h = r * 80 / 74.5; y.drawImage(face, -h, -h, 2 * h, 2 * h); y.restore();
      y.lineWidth = Math.max(0.8, r * 0.024); y.strokeStyle = ink; y.stroke(P);
    }
  }
}
function skyHook() {
  const m = M.map; if (!m || !m.style?._loaded) return;
  if (!m.getLayer('skybodies')) m.addLayer({ id: 'skybodies', type: 'custom', renderingMode: '2d', render(gl, args) { skyDraw(args); } });
}
// The glow of the air along the earth's edge (502a, v365; reworked v368): the rim of the globe seen from afar, the horizon seen in
// flight. Each place on it glows by the sun's height there – where the sun rises, red, rose, gold; where it sets, gold, orange,
// crimson; by day a pale blue; brightest with the sun 0–4° below the horizon, gone 12° below (510a). In two layers (512a): the
// low air takes the sun's height on the ground, the air some 50 km up the sun's height seen from there (7° higher: it stays lit
// longer – blue above the red after sunset); on the night side a faint green line of airglow at about 100 km (515b). Seen from
// space thin, about 150 km deep (513a); low over the earth brightest towards the sun (511a). Drawn on the sky behind the map,
// so the earth hides its inner half.
const GLOW_DAY = [150, 192, 255], GLOW_AIR = [110, 220, 140];
// where the camera is: the place beneath it and its height above the sea (metres); on the globe from its own position
function skyEye(m) {
  const tr = m.transform, vp = tr._verticalPerspectiveTransform, globe = !!(vp && tr.isGlobeRendering && vp._cameraPosition);
  let lng, lat, h;
  if (globe) { const c = vp._cameraPosition, r = Math.hypot(c[0], c[1], c[2]); lat = Math.asin(c[1] / r) / RAD; lng = Math.atan2(c[0], c[2]) / RAD; h = (r - 1) * 6371008.8; }
  else { const ll = tr.getCameraLngLat(); lng = ll.lng; lat = ll.lat; h = tr.getCameraAltitude(); }
  return { globe, lng, lat, h: h > 1 ? h : 1 };
}
// the glow's colour and strength for a height of the sun (degrees) – one smooth curve, no steps
const smooth01 = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
function glowAt(alt, rising) {
  const al = alt >= 0 ? 0.4 + 0.45 * (1 - smooth01(alt / 14)) : alt >= -4 ? 0.85 : 0.85 * (1 - smooth01((-alt - 4) / 8));
  if (alt >= 14) return [GLOW_DAY, al];
  const tint = sunTint(Math.max(-12, alt), rising), u = smooth01((alt - 6) / 8);
  return [tint.map((x, k) => x + (GLOW_DAY[k] - x) * u), al];
}
function skyGlow(y, m, P, W, H, t) {
  const tr = m.transform, { globe, lng, lat, h } = skyEye(m);
  const ER0 = 6371008.8, MM = tr.getMatrixForModel([lng, lat], 0), A = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) A[c * 4 + r] += P[k * 4 + r] * MM[c * 4 + k];
  const th = Math.acos(ER0 / (ER0 + h)), dist = Math.sqrt((ER0 + h) ** 2 - ER0 * ER0);   // (the edge: how far round the earth, and how far off)
  // where it is drawn: on the globe the true edge; on the flat map (no curve) a ring far off, just under the level line
  const D = globe ? ER0 * Math.sin(th) : Math.max(2e5, dist * 3), up = globe ? ER0 * Math.cos(th) - ER0 : h - D * 0.003;
  // how deep the glow reaches above the edge: from afar about 150 km, low over the horizon some 8°
  const dH = globe ? Math.min(1.5e5, 0.15 * dist) : 0.15 * D;
  const scr = v => { const cx = A[0] * v[0] + A[4] * v[1] + A[8] * v[2] + A[12], cy = A[1] * v[0] + A[5] * v[1] + A[9] * v[2] + A[13], cw = A[3] * v[0] + A[7] * v[1] + A[11] * v[2] + A[15];
    return cw > 1e-9 ? [(cx / cw + 1) / 2 * W, (1 - cy / cw) / 2 * H] : null; };
  // towards the sun: only low over the earth, gone from 300 km up
  const kT = 1 - smooth01((h - 3e4) / 2.7e5);
  const s = sunPos(t), la = lat * RAD, N = 360, pts = [];
  for (let i = 0; i <= N; i++) {
    const a = i / N * 2 * Math.PI, e = D * Math.sin(a), n = D * Math.cos(a), v = [e, up, -n];
    // the edge, and the air above it (along the upright there: away from the earth's centre, on the flat map straight up)
    const nr = globe ? [e / ER0, (up + ER0) / ER0, -n / ER0] : [0, 1, 0], p = scr(v), o = scr([v[0] + nr[0] * dH, v[1] + nr[1] * dH, v[2] + nr[2] * dH]);
    if (!p || !o) { pts.push(null); continue; }
    // the place on the earth's edge in that direction, and the sun's height there
    const pl = Math.asin(Math.sin(la) * Math.cos(th) + Math.cos(la) * Math.sin(th) * Math.cos(a)), pg = lng * RAD + Math.atan2(Math.sin(a) * Math.sin(th) * Math.cos(la), Math.cos(th) - Math.sin(la) * Math.sin(pl));
    const sa = sunAt(s, pg / RAD, pl / RAD), rising = sa.az < 180, wT = (1 - kT) + kT * (0.55 + 0.45 * Math.cos((sa.az - a / RAD) * RAD));
    const [c0, a0] = glowAt(sa.alt, rising), [c1, a1] = glowAt(sa.alt + 7.2, rising), g = smooth01((-sa.alt - 13) / 6);   // (airglow where the upper air is dark)
    pts.push({ p, o, c0, a0: a0 * wT, c1, a1: a1 * wT, g });
  }
  // the strip: drawn by the graphics chip with its colours blended smoothly between the corners of each piece – drawn piece by
  // piece on the canvas, overlapping pieces doubled the light in bright lines and the pieces' own shadings did not quite meet in
  // steps (v369); the 2D drawing stays as a fallback
  const dpr = devicePixelRatio || 1, gcv = glowGL(pts, W, H, dpr, y.canvas.width, y.canvas.height);
  if (gcv) { y.save(); y.setTransform(1, 0, 0, 1, 0, 0); y.drawImage(gcv, 0, 0); y.restore(); return; }
  const mix = (q, r) => q.map((x, k) => (x + r[k]) / 2), rgba = (c, al) => `rgba(${c.map(Math.round).join(',')},${Math.max(0, al).toFixed(3)})`;
  y.save();
  for (let i = 0; i < N; i++) { const A1 = pts[i], B1 = pts[i + 1]; if (!A1 || !B1) continue;
    const a0 = (A1.a0 + B1.a0) / 2, a1 = (A1.a1 + B1.a1) / 2, gg = (A1.g + B1.g) / 2; if (a0 < 0.01 && a1 < 0.01 && gg < 0.01) continue;
    if (Math.abs(A1.p[0] - B1.p[0]) > W * 2 || Math.abs(A1.p[1] - B1.p[1]) > H * 2) continue;
    const mx = (A1.p[0] + B1.p[0]) / 2, my = (A1.p[1] + B1.p[1]) / 2, ox = (A1.o[0] + B1.o[0]) / 2, oy = (A1.o[1] + B1.o[1]) / 2;
    const c0 = mix(A1.c0, B1.c0), c1 = mix(A1.c1, B1.c1), cg = c1.map((x, k) => x + (GLOW_AIR[k] - x) * gg);
    const gr = y.createLinearGradient(mx - (ox - mx) * 0.25, my - (oy - my) * 0.25, ox, oy);
    GLOW_STOPS.forEach((st, k) => gr.addColorStop(st, rgba(...glowStop(k, c0, a0, c1, a1, cg, gg))));
    const bx = (q, r, k) => [q[0] + (q[0] - r[0]) * k, q[1] + (q[1] - r[1]) * k], p0 = bx(A1.p, A1.o, 0.25), q0 = bx(B1.p, B1.o, 0.25);
    y.fillStyle = gr; y.beginPath(); y.moveTo(p0[0], p0[1]); y.lineTo(q0[0], q0[1]); y.lineTo(B1.o[0], B1.o[1]); y.lineTo(A1.o[0], A1.o[1]); y.closePath(); y.fill();
  }
  y.restore();
}
// across the band, from a little inside the edge (0) through the edge (0.2) and the upper air to about 100 km (0.73) and beyond
const GLOW_STOPS = [0, 0.2, 0.36, 0.52, 0.73, 1];
function glowStop(k, c0, a0, c1, a1, cg, gg) {
  return [[c0, 0], [c0, a0], [c0, a0 * 0.75], [c1, a1 * 0.55], [cg, a1 * 0.25 * (1 - gg) + 0.13 * gg], [cg, 0]][k];
}
// the band as triangles with a colour at each corner, on a small WebGL canvas of its own (null where WebGL is missing)
function glowGL(pts, W, H, dpr, cw, ch) {
  let G = SKY.glowGL;
  if (G === undefined) {
    G = SKY.glowGL = null;
    try {
      const cv = document.createElement('canvas'), gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
      if (gl) {
        const sh = (t, src) => { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); return o; }, pr = gl.createProgram();
        gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p;attribute vec4 c;uniform vec2 s;varying vec4 v;void main(){v=c;gl_Position=vec4(p.x/s.x*2.0-1.0,1.0-p.y/s.y*2.0,0.0,1.0);}'));
        gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec4 v;void main(){gl_FragColor=vec4(v.rgb*v.a,v.a);}'));
        gl.linkProgram(pr);
        if (gl.getProgramParameter(pr, gl.LINK_STATUS)) G = SKY.glowGL = { cv, gl, pr, buf: gl.createBuffer(), lp: gl.getAttribLocation(pr, 'p'), lc: gl.getAttribLocation(pr, 'c'), ls: gl.getUniformLocation(pr, 's') };
      }
    } catch (_) { G = SKY.glowGL = null; }
  }
  if (!G) return null;
  const { cv, gl, pr, buf, lp, lc, ls } = G, K = GLOW_STOPS.length, out = [];
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  // each point of the edge: its row of corners across the band, each with its colour
  const row = q => { const ix = q.p[0] - (q.o[0] - q.p[0]) * 0.25, iy = q.p[1] - (q.o[1] - q.p[1]) * 0.25, cg = q.c1.map((x, k) => x + (GLOW_AIR[k] - x) * q.g);
    return GLOW_STOPS.map((st, k) => { const [c, a] = glowStop(k, q.c0, q.a0, q.c1, q.a1, cg, q.g); return [ix + (q.o[0] - ix) * st, iy + (q.o[1] - iy) * st, c[0] / 255, c[1] / 255, c[2] / 255, Math.max(0, Math.min(1, a))]; }); };
  let prev = null, prevQ = null;
  for (const q of pts) {
    const r = q ? row(q) : null;
    if (r && prev && !(Math.abs(q.p[0] - prevQ.p[0]) > W * 2 || Math.abs(q.p[1] - prevQ.p[1]) > H * 2) && (q.a0 + q.a1 + q.g + prevQ.a0 + prevQ.a1 + prevQ.g) > 0.02)
      for (let k = 0; k < K - 1; k++) out.push(...prev[k], ...r[k], ...r[k + 1], ...prev[k], ...r[k + 1], ...prev[k + 1]);
    prev = r; prevQ = q;
  }
  gl.viewport(0, 0, cw, ch); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  if (!out.length) return cv;
  gl.useProgram(pr); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(lc); gl.vertexAttribPointer(lc, 4, gl.FLOAT, false, 24, 8);
  gl.uniform2f(ls, W, H); gl.disable(gl.BLEND); gl.drawArrays(gl.TRIANGLES, 0, out.length / 6);
  return cv;
}
function skyDraw(args) {
  const m = M.map, box = m.getContainer(), W = box.clientWidth, H = box.clientHeight, dpr = devicePixelRatio || 1;
  $('#skyCv')?.remove();                                             // (before v337 the sun and the moon lay over the map)
  // everything here is drawn behind the map: where the earth is seen, it covers the stars, the sun and the moon – also in part,
  // as when the moon rises behind the rim of the globe (v337)
  let bg = $('#skyBg');                                              // (the sky behind the map)
  if (!bg || bg.parentNode !== box) { bg?.remove(); bg = document.createElement('canvas'); bg.id = 'skyBg'; bg.className = 'skybg'; box.prepend(bg); }
  if (bg.width !== Math.round(W * dpr) || bg.height !== Math.round(H * dpr)) { bg.width = Math.round(W * dpr); bg.height = Math.round(H * dpr); }
  const ref0 = sunRef(), P0 = args.defaultProjectionData.mainMatrix;
  // nothing to draw anew when the view, the time and the settings are as at the last frame (frames for other reasons: tiles
  // arriving, the obelisk …) – v347
  const key = [...P0, W, H, dpr, ref0.lng, ref0.lat, Math.round(sunTime() / 6e4), M.cfg.skySize, sunOn(), M.cfg.skySun, M.cfg.skyMoon, !!M.cfg.gnomon, !!SKY.stars, !!SKY.zod, !!SKY.img.sun?.complete, !!SKY.img.moonface?.complete].join();
  if (key === SKY.key) return; SKY.key = key;
  const y = bg.getContext('2d'); y.setTransform(dpr, 0, 0, dpr, 0, 0);
  // the sky's blue, going over into the black of space as the camera rises – from 25 km to 400 km above the sea (505a, v366)
  const kz = Math.max(0, Math.min(1, Math.log(skyEye(m).h / 25e3) / Math.log(400 / 25))), ks = kz * kz * (3 - 2 * kz);
  const sp = y.createLinearGradient(0, 0, 0, H); sp.addColorStop(0, hexMix('#0f2a66', '#02040a', ks)); sp.addColorStop(1, hexMix('#3a73bb', '#04070f', ks)); y.fillStyle = sp; y.fillRect(0, 0, W, H);
  if (sunOn()) skyGlow(y, m, P0, W, H, sunTime());
  const ref = ref0, t = sunTime(), P = P0, MM = m.transform.getMatrixForModel([ref.lng, ref.lat], 0);
  const scr = d => { const c = mat4v(P, mat4v(MM, [...d, 0])); return c[3] > 1e-9 ? [(c[0] / c[3] + 1) / 2 * W, (1 - c[1] / c[3]) / 2 * H] : null; };
  const f = H / 2 / Math.tan((m.transform.fovInRadians || 0.6435) / 2), size = M.cfg.skySize || 10;
  // the stars: each a direction in the sky (right ascension, declination), turned with the sidereal time to the place shown
  { const gm = ((18.697374558 + 24.06570982441908 * (t / 864e5 - 10957.5)) % 24 + 24) % 24 * 15;
    // one matrix for all: the sky turned by the local sidereal time and tilted by the latitude (x east, y up, z south), then the
    // camera – a dozen multiplications a star instead of its height and direction worked out one by one (v347)
    const L0 = (gm + ref.lng) * RAD, la = ref.lat * RAD, cL = Math.cos(L0), sL = Math.sin(L0), cp = Math.cos(la), sp2 = Math.sin(la);
    const Lm = [[-sL, cL, 0], [cp * cL, cp * sL, sp2], [sp2 * cL, sp2 * sL, -cp]];
    const A = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) A[c * 4 + r] += P[k * 4 + r] * MM[c * 4 + k];
    const B = [0, 1, 2, 3].map(r => [0, 1, 2].map(j => A[r] * Lm[0][j] + A[4 + r] * Lm[1][j] + A[8 + r] * Lm[2][j]));
    const [b0, b1, , b3] = B;
    const at = v => { const w = b3[0] * v[0] + b3[1] * v[1] + b3[2] * v[2]; if (w <= 1e-9) return null;
      return [((b0[0] * v[0] + b0[1] * v[1] + b0[2] * v[2]) / w + 1) / 2 * W, (1 - (b1[0] * v[0] + b1[1] * v[1] + b1[2] * v[2]) / w) / 2 * H]; };
    // the zodiac: fine silver lines joining its stars, beneath them (a line breaks where it would pass behind the eye)
    y.beginPath(); y.lineWidth = 1.1; y.strokeStyle = 'rgba(214,222,232,.75)'; y.lineJoin = y.lineCap = 'round';
    for (const ln of skyZodiac() || []) { let on = false; for (const v of ln) { const q = at(v); if (!q) { on = false; continue; } y[on ? 'lineTo' : 'moveTo'](q[0], q[1]); on = true; } }
    y.stroke();
    for (const st of skyStars() || []) { const p = at(st.v), R = st.s * RAD * f;
      if (!p || p[0] < -2 * R || p[1] < -2 * R || p[0] > W + 2 * R || p[1] > H + 2 * R) continue;
      skyStar(y, p[0], p[1], Math.max(2, R), st); } }
  if (!sunOn()) return;                                              // (the sun and the moon: with day and night)
  // the faces of the sun and the moon are upright to whoever sees them on the horizon: their "up" points away from the earth's
  // centre, as seen on the screen – part of the world, not of the screen (v341/344). Zoomed out, the sun beside the globe stands
  // upright to the people at the rim of the globe beneath it, who see it rise or set; as it passes round the globe it turns,
  // upright to those who see it rise and, half a turn later, to those who see it set. Seen from the ground (the earth's centre far
  // below), upright over the horizon. (Where the centre cannot be projected: the local vertical of the place shown.)
  const ce = mat4v(P, mat4v(MM, [0, -6371008.8, 0, 1])), C = ce[3] > 1e-9 ? [(ce[0] / ce[3] + 1) / 2 * W, (1 - ce[1] / ce[3]) / 2 * H] : null;
  const upAng = (d, p) => {
    if (C && Math.hypot(p[0] - C[0], p[1] - C[1]) > 1) return Math.atan2(p[1] - C[1], p[0] - C[0]) + Math.PI / 2;
    let u = [-d[0] * d[1], 1 - d[1] * d[1], -d[2] * d[1]], l = Math.hypot(...u); if (l < 1e-4) { u = [0, 0, -1]; l = 1; }
    const q = scr(d.map((v, i) => v + 0.02 * u[i] / l)); return q ? Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2 : 0; };
  // the sun as the camera sees it (v346): its height above the visible horizon (degrees), and whether it rises or sets for the people
  // on that horizon beneath it. The camera's place in the frame of the place shown (metres; x east, y up, z south): the point the
  // projection sends to the eye (x = y = w = 0 in clip space)
  const sunSeen = d => {
    const A = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) A[c * 4 + r] += P[k * 4 + r] * MM[c * 4 + k];
    const row = r => [A[r], A[4 + r], A[8 + r], -A[12 + r]], [a, b, e] = [row(0), row(1), row(3)];
    const det3 = (u, v, w) => u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);
    const D = det3(a, b, e), col = i => [a, b, e].map(q => { const z = q.slice(0, 3); z[i] = q[3]; return z; });
    const N = [0, Math.sin(ref.lat * RAD), -Math.cos(ref.lat * RAD)], rise = q => { const w = [N[1] * q[2] - N[2] * q[1], N[2] * q[0] - N[0] * q[2], N[0] * q[1] - N[1] * q[0]]; return d[0] * w[0] + d[1] * w[1] + d[2] * w[2] > 0; };
    if (!viewOn('globe') || Math.abs(D) < 1e-30) return { alt: Math.asin(d[1]) / RAD, rising: rise([0, 1, 0]) };   // (the flat map: the horizon level)
    const R = 6371008.8, cam = [0, 1, 2].map(i => det3(...col(i)) / D), C = [cam[0], cam[1] + R, cam[2]], r = Math.max(R, Math.hypot(...C)), Cn = C.map(v => v / r);
    const beta = Math.asin(Math.min(1, R / r)), gam = Math.acos(Math.max(-1, Math.min(1, -(d[0] * Cn[0] + d[1] * Cn[1] + d[2] * Cn[2]))));
    // the people on the rim beneath the sun: from the point under the camera, towards the sun, as far round as the rim lies
    const dc = d[0] * Cn[0] + d[1] * Cn[1] + d[2] * Cn[2], wv = d.map((v, i) => v - dc * Cn[i]), wl = Math.hypot(...wv) || 1, th = Math.acos(Math.min(1, R / r));
    const Pn = Cn.map((v, i) => v * Math.cos(th) + wv[i] / wl * Math.sin(th));
    return { alt: (gam - beta) / RAD, rising: rise(Pn) };
  };
  const s = sunAt(sunPos(t), ref.lng, ref.lat), ds = skyDir(s.az, s.alt);
  if (M.cfg.skySun !== false) {
    const p = scr(ds), im = skyImg('sun');
    if (p && im) {
      // the disc of the sprite (radius 73 of 300) as large as the sun is drawn; the rays around it
      const r = Math.max(3, 0.2666 * RAD * size * f), h = r * 300 / 73;
      let col;
      if (M.cfg.gnomon) col = sunTint(s.alt, s.az < 180);                           // (the obelisk's place: rising, the sun in the east)
      else { const v = sunSeen(ds); col = sunTint(v.alt, v.rising, v.rising ? SUN_RISE_V : SUN_SET_V); }
      const sun = skySunTinted(col) || im;
      y.save(); y.translate(p[0], p[1]); y.rotate(upAng(ds, p)); y.drawImage(sun, -h, -h, 2 * h, 2 * h); y.restore();
    }
  }
  if (M.cfg.skyMoon !== false) {
    const mo = moonPos(t), a = sunAt(mo, ref.lng, ref.lat), dm = skyDir(a.az, a.alt), p = scr(dm);
    if (p) {
      const r = Math.max(3, 0.259 * RAD * size * f), k = mo.lit, ink = '#17110b';
      // the bright side turned to the sun: a direction a little towards it, seen on the screen
      const dot = ds[0] * dm[0] + ds[1] * dm[1] + ds[2] * dm[2], pe = ds.map((v, i) => v - dm[i] * dot), pl = Math.hypot(...pe) || 1;
      const q = scr(dm.map((v, i) => v + 0.02 * pe[i] / pl)), th = q ? Math.atan2(q[1] - p[1], q[0] - p[0]) : 0;
      // the face stays upright (to the local vertical, as the sun's – v340/341): only whether its right or its left side is lit
      // follows the sun
      const up = upAng(dm, p), sd = Math.cos(th - up) >= 0 ? 1 : -1;
      y.save(); y.translate(p[0], p[1]); y.rotate(up);
      skyMoonDraw(y, r, k, sd, ink);
      y.restore();
    }
  }
}
// the clock: Now (every 30 s), Animate (about 20 times a second), or set by hand
function sunClock() {
  cancelAnimationFrame(M.sunRaf); clearInterval(M.sunIv); M.sunRaf = M.sunIv = 0;
  if (!sunOn()) return;
  const mode = M.cfg.sunMode || 'now';
  if (mode === 'now') { M.sunT = Date.now(); M.sunIv = setInterval(() => { M.sunT = Date.now(); sunApply(); }, 30000); }
  if (mode === 'anim' && !M.sunPause) {
    let last = performance.now(), acc = 0;
    const step = now => { const dt = now - last; last = now; acc += dt;
      M.sunT = sunTime() + dt * 86400 / Math.max(7, Math.min(77, M.cfg.sunSpeed || 20));       // (sunSpeed: seconds of real time per day)
      if (acc > 50) { acc = 0; sunApply(); }
      M.sunRaf = requestAnimationFrame(step); };
    M.sunRaf = requestAnimationFrame(step);
  }
  if (mode === 'year' && !M.sunPause) {                             // whole days at a time: the hour stays (the sun's own hour
    let last = performance.now(), acc = 0;                           // wanders by up to a quarter of an hour over the year, as it does)
    const step = now => { const dt = now - last; last = now; acc += dt;
      if (!M.sunDrag) { M.sunYd = (M.sunYd || 0) + dt / 1000 * 365.2422 / (M.cfg.sunYear || 20); const k = Math.floor(M.sunYd); if (k) { M.sunYd -= k; M.sunT = sunTime() + k * 864e5; } }
      if (acc > 50) { acc = 0; sunApply(); }
      M.sunRaf = requestAnimationFrame(step); };
    M.sunRaf = requestAnimationFrame(step);
  }
  sunApply();
}
async function sunSet(patch) {
  Object.assign(M.cfg, patch); await saveMapCfg();
  if ('sun' in patch && M.map) { M.map.setStyle(mapStyle(M.colors)); M.map.once('styledata', () => setTimeout(() => { refreshMapData(); sunClock(); }, 50)); }
  else sunClock();
  refreshLayersPop();
}

// ---------------------------------------------------------------- the sundial (its own button; a panel at the foot of the map)
// The hour is the true sun time at the place shown. The ring runs clockwise as the day goes on (v330): noon at the top,
// sunrise on the left, midnight at the bottom, sunset on the right. The handle is the sun above the horizon and the moon below it; the
// horizon lies where the ring meets sunrise and sunset (lower in summer, higher in winter), and the sea covers the part of
// the sun or moon beneath it. Behind the dial the sky follows the sun's height; at night the stars come out and an owl
// sits on the gnomon. Settings (mapCfg): sunFmt ('modern' | 'roman' | 'greek').
const GR_NUM = ['αʹ', 'βʹ', 'γʹ', 'δʹ', 'εʹ', 'ϛʹ', 'ζʹ', 'ηʹ', 'θʹ', 'ιʹ', 'ιαʹ', 'ιβʹ'], RO_NUM = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
function sunHour(t = sunTime()) {                                    // sun time (hours), sunrise and sunset, the sun's height
  const c = sunRef(), s = sunPos(t);
  const lst = ((12 + (c.lng - s.lon) / 15) % 24 + 24) % 24;          // (noon: the sun due south)
  const cosH = (Math.sin(-0.833 * RAD) - Math.sin(c.lat * RAD) * Math.sin(s.dec)) / (Math.cos(c.lat * RAD) * Math.cos(s.dec));
  const half = cosH <= -1 ? 12 : cosH >= 1 ? 0 : Math.acos(cosH) / RAD / 15;     // half the day, in hours
  const a = sunAt(s, c.lng, c.lat);
  return { lst, rise: 12 - half, set: 12 + half, alt: a.alt, az: a.az };
}
// the twelve signs (the tropical zodiac: the Ram from the spring equinox): English, Latin, Greek, Greek after ἐν, and the sign
// itself, drawn in a box of 12 (−6 … 6)
const ZOD = [
  ['Aries', 'Aries', 'Κριός', 'Κριῷ', 'M0 5.5V-1.5C0-4.5-1.6-5.6-3-5.4-4.8-5.1-5.3-2.6-3.8-1.6M0-1.5C0-4.5 1.6-5.6 3-5.4 4.8-5.1 5.3-2.6 3.8-1.6'],
  ['Taurus', 'Taurus', 'Ταῦρος', 'Ταύρῳ', 'M-5-5.2C-4.4-1.6-2.4-.9 0-.9 2.4-.9 4.4-1.6 5-5.2M0-.9a3 3 0 1 0 .01 0z'],
  ['Gemini', 'Gemini', 'Δίδυμοι', 'Διδύμοις', 'M-4.8-5Q0-3.2 4.8-5M-4.8 5Q0 3.2 4.8 5M-2-3.9V3.9M2-3.9V3.9'],
  ['Cancer', 'Cancer', 'Καρκίνος', 'Καρκίνῳ', 'M-2.4-.6a1.7 1.7 0 1 0 .01 0zM-2.4-.6C.2-3.8 3.6-3.7 5.2-1.6M2.4.6a1.7 1.7 0 1 0-.01 0zM2.4.6C-.2 3.8-3.6 3.7-5.2 1.6'],
  ['Leo', 'Leo', 'Λέων', 'Λέοντι', 'M-3 4.4a1.7 1.7 0 1 0 .01 0zM-1.6 3.4C-3.2-.4-2.6-5.2.8-5.2 4-5.2 4.4-2 2.6.4 1 2.6 1.4 5.4 4.8 4.4'],
  ['Virgo', 'Virgo', 'Παρθένος', 'Παρθένῳ', 'M-5.2-3.6V4M-5.2-2.4C-5.2-4.4-2.4-4.4-2.4-2.4V4M-2.4-2.4C-2.4-4.4.4-4.4.4-2.4V2.6C.4 5 3.6 5 4 2.6 4.4.4 2.4.4 1.8 1.8 1.2 3.4 2 5.4 3.4 5.8'],
  ['Libra', 'Libra', 'Ζυγός', 'Ζυγῷ', 'M-5.4 4.4H5.4M-5.4 1.6H-2.2A3.2 3.2 0 1 1 2.2 1.6H5.4'],
  ['Scorpio', 'Scorpius', 'Σκορπίος', 'Σκορπίῳ', 'M-5.2-3.6V3.6M-5.2-2.4C-5.2-4.4-2.4-4.4-2.4-2.4V3.6M-2.4-2.4C-2.4-4.4.4-4.4.4-2.4V3C.4 4.8 2.6 5 4.8 3.4M3.4 2.2 4.8 3.4 4.2 5.1'],
  ['Sagittarius', 'Sagittarius', 'Τοξότης', 'Τοξότῃ', 'M-4.6 4.6 4.6-4.6M.4-4.6H4.6V-.4M-3.6-.6.6 3.6'],
  ['Capricorn', 'Capricornus', 'Αἰγόκερως', 'Αἰγοκέρωτι', 'M-5.4-4.4-3.4 3.4-1.4-4.4C-.6-5.4.6-4.4.6-2V2.2C.6 4.6 2 5.6 3.6 5 5.2 4.4 5.2 2 3.8 1.4 2.4.8.6 2.4.6 4C.4 5.2-.4 5.8-1.4 5.8'],
  ['Aquarius', 'Aquarius', 'Ὑδροχόος', 'Ὑδροχόῳ', 'M-5.4-.6-2.7-3 0-.6 2.7-3 5.4-.6M-5.4 3.4-2.7 1 0 3.4 2.7 1 5.4 3.4'],
  ['Pisces', 'Pisces', 'Ἰχθύες', 'Ἰχθύσι', 'M-4.4-5.2C-1.2-2.4-1.2 2.4-4.4 5.2M4.4-5.2C1.2-2.4 1.2 2.4 4.4 5.2M-2.6 0H2.6']];
const RO_MON = ['Ian.', 'Feb.', 'Mart.', 'Apr.', 'Mai.', 'Iun.', 'Iul.', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const roNum = n => ['', 'X', 'XX', 'XXX'][Math.floor(n / 10)] + ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][n % 10];
const grNum = n => (['', 'ι', 'κ', 'λ'][Math.floor(n / 10)] + ['', 'α', 'β', 'γ', 'δ', 'ε', 'ϛ', 'ζ', 'η', 'θ'][n % 10]) + 'ʹ';
// the Roman date: counted (both ends included) to the next Kalends, Nones or Ides – the Nones on the 7th in March, May,
// July and October, else on the 5th; the Ides eight days later
function romanDate(d) {
  const m = d.getUTCMonth(), day = d.getUTCDate(), non = [2, 4, 6, 9].includes(m) ? 7 : 5, id = non + 8;
  const ad = (n, w, mm) => n === 2 ? `prid. ${w} ${RO_MON[mm]}` : `a. d. ${roNum(n)} ${w} ${RO_MON[mm]}`;
  if (day === 1) return `Kal. ${RO_MON[m]}`;
  if (day < non) return ad(non - day + 1, 'Non.', m); if (day === non) return `Non. ${RO_MON[m]}`;
  if (day < id) return ad(id - day + 1, 'Id.', m); if (day === id) return `Id. ${RO_MON[m]}`;
  return ad(new Date(Date.UTC(d.getUTCFullYear(), m + 1, 0)).getUTCDate() - day + 2, 'Kal.', (m + 1) % 12);
}
// the day as it is in the middle of the map (its own sun time decides when the day begins), in the chosen manner;
// the Greek gives the sun's place: in which sign, in which degree of it
function sunDate(fmt) {
  const t = sunTime(), { lst } = sunHour(), utc = (t / 36e5 % 24 + 24) % 24; let dh = lst - utc; if (dh > 12) dh -= 24; if (dh <= -12) dh += 24;
  const d = new Date(t + dh * 36e5);
  if (fmt === 'roman') return romanDate(d);
  if (fmt === 'greek') { const e = sunPos(t).ecl; return `ἐν ${ZOD[Math.floor(e / 30)][3]} μοίρᾳ ${grNum(Math.floor(e % 30) + 1)}`; }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
function sunLabel() {
  const { lst, rise, set } = sunHour(), fmt = M.cfg.sunFmt || 'modern';
  const hm = `${String(Math.floor(lst)).padStart(2, '0')}:${String(Math.floor(lst % 1 * 60)).padStart(2, '0')}`;
  const date = sunDate(fmt);
  if (fmt === 'modern' || set - rise <= 0 || set - rise >= 24) return { main: hm, sub: date };
  if (lst >= rise && lst < set) { const n = Math.min(11, Math.floor((lst - rise) / ((set - rise) / 12)));
    return { main: fmt === 'roman' ? (n ? `hora ${RO_NUM[n]}` : 'hora prima') : `ὥρα ${GR_NUM[n]}`, sub: date }; }
  const night = 24 - (set - rise), w = Math.min(3, Math.floor(((lst - set + 24) % 24) / (night / 4)));
  return { main: fmt === 'roman' ? `vigilia ${RO_NUM[w]}` : `φυλακὴ ${GR_NUM[w]}`, sub: date };
}
// the sky by the sun's height: [height, top, foot] – the evening red, the morning rose
const SKY_EVE = [[60, '#1b5cc0', '#5aa6ee'], [25, '#2f78d2', '#93c6f1'], [8, '#4a6db0', '#f0b070'], [0, '#3a3c78', '#ef6f42'], [-6, '#20234e', '#6a4468'], [-12, '#0f1438', '#252a50'], [-18, '#04071a', '#0b1230']];
const SKY_MORN = [[60, '#1b5cc0', '#5aa6ee'], [25, '#2f78d2', '#93c6f1'], [8, '#5a78b8', '#f3bfc6'], [0, '#4a4c88', '#f09aaa'], [-6, '#262a58', '#5e4a72'], [-12, '#0f1438', '#252a50'], [-18, '#04071a', '#0b1230']];
const hexMix = (a, b, t) => '#' + [0, 2, 4].map(i => Math.round(parseInt(a.substr(1 + i, 2), 16) * (1 - t) + parseInt(b.substr(1 + i, 2), 16) * t).toString(16).padStart(2, '0')).join('');
function skyAt(alt, eve) {
  const K = eve ? SKY_EVE : SKY_MORN;
  if (alt >= K[0][0]) return K[0].slice(1); if (alt <= K[K.length - 1][0]) return K[K.length - 1].slice(1);
  for (let i = 0; i < K.length - 1; i++) if (alt <= K[i][0] && alt >= K[i + 1][0]) { const t = (K[i][0] - alt) / (K[i][0] - K[i + 1][0]); return [hexMix(K[i][1], K[i + 1][1], t), hexMix(K[i][2], K[i + 1][2], t)]; }
}
// (v375: the panel reworked – dial at the left, the obelisk in the middle, the zodiac at the right, always; one row of buttons
// along the bottom. The dial is drawn in its own space (centre cx, cy; ring R; plate P) and placed and scaled into the panel by
// sdLay; ZR the zodiac's radius; FADE the height over which the panel's sky and its outline fade into the map; ROW the buttons.)
const SD = { cx: 92, cy: 82, R: 70, P: 56, ZR: 72, FADE: 52, ROW: 40, BAR: 40, H: 250, SW: 116, SH: 116 };   // (SW, SH: the stone dial's picture – the ring's inner circle, v377)   // (the fade: nothing above 24 px – the rounded corners – then in)   // the panel's height, the dial's centre, ring and plate radii;
                                                                    // the zodiac wheel's radius and centre height, and the least width of the panel that shows it
const sdAng = h => (h - 12) / 24 * 2 * Math.PI;                        // (clockwise, as the day goes on; noon at the top – v330)
const sdXY = (h, r) => [SD.cx + Math.sin(sdAng(h)) * r, SD.cy - Math.cos(sdAng(h)) * r];
// where the two wheels stand in a panel W wide: the same size up to 660 px, smaller on narrow screens so that the obelisk keeps
// its room between them; the labels beneath; the row of buttons at the foot (k: the scale; tx, ty: the dial's space → the panel)
function sdLay(W) {
  const k = Math.max(0.6, Math.min(1, (W - 3 * 14 - 40) / (2 * (SD.R + 6) + 2 * (SD.ZR + 4))));
  const cy = 22 + (SD.ZR + 13) * k, dx = 14 + (SD.R + 6) * k, zx = W - 14 - (SD.ZR + 4) * k, labY = cy + (SD.ZR + 4) * k + 18;
  return { k, cy, dx, zx, labY, H: Math.round(labY + 8 + SD.ROW), tx: dx - k * SD.cx, ty: cy - k * SD.cy };
}
const OWL = '<g class="sdowl"><g class="owlw"><ellipse cx="-6" cy="2" rx="4" ry="7" transform="rotate(25 -6 2)"/><ellipse cx="6" cy="2" rx="4" ry="7" transform="rotate(-25 6 2)"/></g>'
  + '<ellipse cx="0" cy="2" rx="6.5" ry="8.5" class="owlb"/><path d="M-5.5 -9-3.5-4H3.5L5.5-9 2-5.5h-4z" class="owlb"/><circle cx="-2.6" cy="-4" r="2.4" class="owle"/><circle cx="2.6" cy="-4" r="2.4" class="owle"/>'
  + '<circle cx="-2.6" cy="-4" r="1" class="owlp"/><circle cx="2.6" cy="-4" r="1" class="owlp"/><path d="M-0.9-2 0-0.4 0.9-2z" class="owlk"/><path d="M-3 10.2h2M1 10.2h2" class="owlf"/></g>';
// ---------------------------------------------------------------- the fresco (556–567, v383)
// The panel's sky and sea – and the whole pane behind the large dial and the large wheel – painted as a fresco after Simone Martini:
// ultramarine by day, yellow ochre and cinnabar-rose low down at sunrise and sunset, blue-black at night (557a); the sky in four flat
// bands with brushed edges (558a); the brighter stars gilded and eight-pointed, where they really stand (559a); the glow of sunrise and
// sunset in flat rings (560a); the sea in green earth over azurite (563a), rows of crests in lime white, smaller and closer towards
// the horizon (561a, 562a), those beneath the sun or the moon taking its light (564a); a fine grain of plaster over all (565a).
// [height, top, foot]
const FR_EVE = [[60, '#3152a6', '#9db2d6'], [25, '#3456a6', '#adbdd8'], [8, '#344a8c', '#d8a650'], [0, '#2f3a7a', '#c4573e'], [-6, '#222a5c', '#7a4255'], [-12, '#151d44', '#2a3058'], [-18, '#0c1230', '#151c3c']];
const FR_MORN = [[60, '#3152a6', '#9db2d6'], [25, '#3456a6', '#adbdd8'], [8, '#3a5296', '#e0b98a'], [0, '#323e80', '#d88378'], [-6, '#242c5e', '#6b4868'], [-12, '#151d44', '#2a3058'], [-18, '#0c1230', '#151c3c']];
function frSkyAt(alt, eve) {
  const K = eve ? FR_EVE : FR_MORN;
  if (alt >= K[0][0]) return K[0].slice(1); if (alt <= K[K.length - 1][0]) return K[K.length - 1].slice(1);
  for (let i = 0; i < K.length - 1; i++) if (alt <= K[i][0] && alt >= K[i + 1][0]) { const t = (K[i][0] - alt) / (K[i][0] - K[i + 1][0]); return [hexMix(K[i][1], K[i + 1][1], t), hexMix(K[i][2], K[i + 1][2], t)]; }
}
// the plaster: a tile of fine specks, faint level brushstrokes and blotches, seamless (drawn once)
let FR_GRAIN = null;
function frGrain() {
  if (FR_GRAIN) return FR_GRAIN;
  const N = 192, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d');
  let sd = 4242; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const wrap = f => { for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) f(dx, dy); };
  for (let i = 0; i < 14; i++) { const cx = r() * N, cy = r() * N, rd = 18 + r() * 46, lt = r() < 0.5;
    wrap((dx, dy) => { const g = x.createRadialGradient(cx + dx, cy + dy, 0, cx + dx, cy + dy, rd); g.addColorStop(0, lt ? 'rgba(255,246,222,.08)' : 'rgba(58,38,18,.07)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(cx + dx - rd, cy + dy - rd, 2 * rd, 2 * rd); }); }
  x.lineCap = 'round';
  for (let i = 0; i < 80; i++) { const cx = r() * N, cy = r() * N, l = 8 + r() * 36, b = (r() - 0.5) * 3, w = 0.8 + r() * 2.2, lt = r() < 0.55, a = 0.03 + r() * 0.045;
    x.strokeStyle = lt ? `rgba(255,250,232,${a})` : `rgba(40,28,14,${a})`; x.lineWidth = w;
    wrap((dx, dy) => { x.beginPath(); x.moveTo(cx + dx, cy + dy); x.quadraticCurveTo(cx + dx + l / 2, cy + dy + b, cx + dx + l, cy + dy + b * 0.4); x.stroke(); }); }
  for (let i = 0; i < 2600; i++) { const px = (r() * N) | 0, py = (r() * N) | 0, lt = r() < 0.5, a = 0.04 + r() * 0.12;
    x.fillStyle = lt ? `rgba(255,252,240,${a.toFixed(3)})` : `rgba(30,20,10,${a.toFixed(3)})`; x.fillRect(px, py, 1, 1); }
  return FR_GRAIN = c.toDataURL();
}
// the layers, under ids beginning with p (fp: the panel; fd: the large dial; fz: the large wheel)
function frescoHTML(p) {
  const big = 8000;
  return `<defs><pattern id="${p}Gr" patternUnits="userSpaceOnUse" width="192" height="192"><image href="${frGrain()}" width="192" height="192"/></pattern>
      <radialGradient id="${p}HaG"><stop offset="0" id="${p}Ha0" stop-opacity=".95"/><stop offset=".27" id="${p}Ha0b" stop-opacity=".95"/><stop offset=".31" id="${p}Ha1" stop-opacity=".72"/><stop offset=".57" id="${p}Ha1b" stop-opacity=".72"/><stop offset=".62" id="${p}Ha2" stop-opacity=".42"/><stop offset=".84" id="${p}Ha2b" stop-opacity=".42"/><stop offset="1" id="${p}Ha3" stop-opacity="0"/></radialGradient>
      <radialGradient id="${p}WaG"><stop offset="0" id="${p}Wa0" stop-opacity=".8"/><stop offset=".4" id="${p}Wa0b" stop-opacity=".8"/><stop offset=".44" id="${p}Wa1" stop-opacity=".5"/><stop offset=".7" id="${p}Wa1b" stop-opacity=".5"/><stop offset=".75" id="${p}Wa2" stop-opacity=".22"/><stop offset=".9" id="${p}Wa2b" stop-opacity=".22"/><stop offset="1" id="${p}Wa3" stop-opacity="0"/></radialGradient>
      <linearGradient id="${p}CoG" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <linearGradient id="${p}McG" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <mask id="${p}CoM" maskUnits="userSpaceOnUse" x="-${big}" y="-${big}" width="${2 * big}" height="${2 * big}"><path id="${p}CoP" fill="url(#${p}CoG)" d=""/></mask>
      <mask id="${p}McM" maskUnits="userSpaceOnUse" x="-${big}" y="-${big}" width="${2 * big}" height="${2 * big}"><path id="${p}McP" fill="url(#${p}McG)" d=""/></mask>
      <clipPath id="${p}Ab"><rect id="${p}AbR" x="-${big}" y="-${big}" width="${2 * big}" height="0"/></clipPath>
      <clipPath id="${p}Be"><rect id="${p}BeR" x="-${big}" y="0" width="${2 * big}" height="${2 * big}"/></clipPath></defs>
    <g class="frsky"><rect id="${p}B0" x="-${big}" y="-${big}" width="${2 * big}" height="${2 * big}"/><path id="${p}B1" d=""/><path id="${p}B2" d=""/><path id="${p}B3" d=""/></g>
    <g clip-path="url(#${p}Ab)"><ellipse id="${p}Wa" rx="0" ry="0" fill="url(#${p}WaG)"/><path id="${p}St" class="frstar" d=""/><ellipse id="${p}Ha" rx="0" ry="0" fill="url(#${p}HaG)"/></g>
    <g class="frsea"><rect id="${p}S0" x="-${big}" y="0" width="${2 * big}" height="0"/><path id="${p}S1" d=""/><path id="${p}S2" d=""/><path id="${p}Hz" class="frhz" d=""/></g>
    <g clip-path="url(#${p}Be)"><g id="${p}CrG" class="frcr" fill="#ece6cf"><g class="frl ${p}l0"><path id="${p}Cr0" d=""/></g><g class="frl ${p}l1" style="opacity:0"><path id="${p}Cr1" d=""/></g></g>
      <g mask="url(#${p}CoM)" id="${p}Co"><rect id="${p}CoW" x="-${big}" y="0" width="${2 * big}" height="${2 * big}"/><g class="frl ${p}l0"><use href="#${p}Cr0"/></g><g class="frl ${p}l1" style="opacity:0"><use href="#${p}Cr1"/></g></g>
      <g mask="url(#${p}McM)" id="${p}Mc" fill="#e4e9f2"><rect id="${p}McW" x="-${big}" y="0" width="${2 * big}" height="${2 * big}"/><g class="frl ${p}l0"><use href="#${p}Cr0"/></g><g class="frl ${p}l1" style="opacity:0"><use href="#${p}Cr1"/></g></g></g>
    <rect class="frchalk" x="-${big}" y="-${big}" width="${2 * big}" height="${2 * big}"/><rect class="frgrain" x="-${big}" y="-${big}" width="${2 * big}" height="${2 * big}" fill="url(#${p}Gr)"/>`;
}
// a brushed edge: level at y, wavering by up to a (fixed along x, so that it does not flicker as the bands move)
function frEdge(W, y, a, seed) {
  let d = ''; for (let x = -60, i = 0; x <= W + 66; x += 6, i++) { const v = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453, n = v - Math.floor(v);
    const yy = y + a * (0.55 * Math.sin(x / 37 + seed) + 0.3 * Math.sin(x / 13 + 2.1 * seed) + 0.3 * (n - 0.5)); d += `${i ? 'L' : 'M'}${x} ${yy.toFixed(1)}`; }
  return d;
}
// the crests: little crescents like brushstrokes, in rows from the horizon down; longer and further apart towards the eye
function frCrests(W, hz, yb, k, seed = 0) {
  const hsh = n => { const v = Math.sin(n * 127.1 + 311.7 + seed * 17.31) * 43758.5453; return v - Math.floor(v); };
  if (yb - hz < 4) return '';
  const out = []; let n = 0;
  for (let y = hz + 2 * k, row = 0; y < yb + 6 && row < 80; row++) {
    const dy = y - hz, L = Math.min(46 * k, 2.6 * k + dy * 0.2), h = L * 0.2, th = 0.3 * h + 0.22 * k, gap = 1.7 * k + dy * 0.12;
    for (let x = -hsh(row) * L * 2.5; x < W + L; n++) {
      const j = hsh(n), j2 = hsh(n + 0.5), l = L * (0.7 + 0.6 * j2), yy = y + (j - 0.5) * gap * 0.5;
      if (j > 0.13) out.push(`M${x.toFixed(1)} ${yy.toFixed(1)}q${(l / 2).toFixed(1)} ${(-2 * h).toFixed(2)} ${l.toFixed(1)} 0q${(-l / 2).toFixed(1)} ${(-2 * h + 2 * th).toFixed(2)} ${(-l).toFixed(1)} 0z`);
      x += l * (1.5 + 1.3 * hsh(n + 0.25)); }
    y += gap; }
  return out.join('');
}
// the gilded stars above the horizon: the view towards the south, everywhere – east at the left, west at the right, as on the dial (569c);
// 180° across, as many pixels to the degree upwards as across
const frXY = (W, hz, az, alt) => { const ppd = W / 180; return [W / 2 + (az - 180) * ppd, hz - alt * ppd]; };
const FR_STAR = Array.from({ length: 16 }, (_, i) => { const a = i * Math.PI / 8, r = i % 2 ? 0.42 : 1; return [Math.sin(a) * r, -Math.cos(a) * r]; });
function frStars(W, hz, k, t) {
  const st = skyStars(); if (!st) return '';
  const c = sunRef(), d = t / 864e5 - 10957.5, g15 = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24 * 15, ppd = W / 180, out = [];
  for (const s of st) { if (s.s < 0.32) continue;                                  // (to the fourth magnitude)
    const a = sunAt({ dec: s.dec, lon: s.ra - g15 }, c.lng, c.lat); if (a.alt < 1) continue;
    const [x, y] = frXY(W, hz, a.az, a.alt);
    if (x < -8 || x > W + 8 || y < -8) continue;
    const r = Math.min(5, 1.5 + 0.85 * (s.s - 0.32) / 0.15) * k;
    out.push('M' + FR_STAR.map(([u, v]) => `${(x + u * r).toFixed(1)} ${(y + v * r).toFixed(1)}`).join('L') + 'z'); }
  return out.join('');
}
// the fresh arrangement of the crests: drawn into the hidden layer, which then fades in as the other fades out
let FR_TICK = null;
function frTick() {
  if (document.hidden) return; let any = false;
  for (const [p, f] of Object.entries(FR)) { const a = document.getElementById(p + 'Cr0'); if (!a || !f.key) continue; any = true;
    const o = f.o, n = 1 - f.cur; f.seed++; document.getElementById(p + 'Cr' + n).setAttribute('d', frCrests(o.W, f.hz, f.yb + 4, o.k, f.seed));
    document.querySelectorAll('.' + p + 'l' + n).forEach(e => e.style.opacity = 1); document.querySelectorAll('.' + p + 'l' + f.cur).forEach(e => e.style.opacity = 0); f.cur = n; }
  if (!any) { clearInterval(FR_TICK); FR_TICK = null; }
}
// the painting, by o: W, H (the area), hz (the horizon), yb (the sea's foot), k (the size of brushwork), ks (the dial's scale, for the
// glows), sx, sy (the sun's handle), mx (where the moon's light falls), and the light of the moment from M.frS
const FR = {};
function frescoPaint(p, o) {
  const E = n => document.getElementById(p + n); if (!E('B0')) return;
  const S = M.frS; if (!S) return;
  const { W, k, ks, sx, sy } = o, H = o.H, hz = Math.max(-30, Math.min(H + 30, o.hz)), yb = o.yb;
  const hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''), mixW = (c, t) => c.map(v => v + (255 - v) * t);
  const mixC = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t), VERM = [200, 67, 46], tc = S.tc, alt = S.alt;
  const [top, foot] = frSkyAt(alt, S.eve);
  // the sky: four flat bands, the palest at the horizon
  const Sk = Math.max(30, hz), lv = [0, 0.16, 0.37, 0.64], cs = [foot, hexMix(foot, top, 0.42), hexMix(foot, top, 0.74), top];
  E('B0').setAttribute('fill', cs[0]);
  for (let i = 1; i < 4; i++) { const b = E('B' + i); b.setAttribute('fill', cs[i]); b.setAttribute('d', frEdge(W, hz - lv[i] * Sk, 2.4 * k, i * 7.3) + `V-${8000}H-60z`); }
  E('AbR').setAttribute('height', (hz + 8000).toFixed(1)); E('BeR').setAttribute('y', hz.toFixed(1));
  // the sea: green earth over azurite, in three bands, darker towards the eye; the horizon a fine line
  const Ds = Math.max(20, yb - hz), s0 = hexMix(foot, '#2e5a55', 0.72), s1 = hexMix(top, '#27494a', 0.55), s2 = hexMix(top, '#16302f', 0.72);
  const s0e = E('S0'); s0e.setAttribute('y', hz.toFixed(1)); s0e.setAttribute('height', Math.max(0, yb - hz + 8000).toFixed(1)); s0e.setAttribute('fill', s0);
  E('S1').setAttribute('d', frEdge(W, hz + 0.13 * Ds, 1.4 * k, 3.1) + `V${(yb + 8000).toFixed(0)}H-60z`); E('S1').setAttribute('fill', s1);
  E('S2').setAttribute('d', frEdge(W, hz + 0.52 * Ds, 1.8 * k, 5.7) + `V${(yb + 8000).toFixed(0)}H-60z`); E('S2').setAttribute('fill', s2);
  E('Hz').setAttribute('d', `M-60 ${hz.toFixed(1)}H${W + 60}`); E('Hz').setAttribute('stroke', hexMix(s2, '#000000', 0.25)); E('Hz').style.strokeWidth = (0.9 * k).toFixed(2);
  // the crests (drawn anew when the horizon or the size changes – at most every 2 s, 561a); every few seconds, besides, a fresh
  // arrangement fades in over the old (568a, b)
  const key = [Math.round(W), Math.round(hz), Math.round(yb), k.toFixed(2)].join(), f = FR[p] ||= { cur: 0, seed: 0 }; f.o = o; f.hz = hz; f.yb = yb;
  if (f.key !== key) { const now = performance.now(), wait = 2000 - (now - (f.t || 0));
    if (wait <= 0 || !f.key || !E('Cr' + f.cur).getAttribute('d')) { f.key = key; f.t = now; E('Cr' + f.cur).setAttribute('d', frCrests(W, hz, yb + 4, k, f.seed)); E('Cr' + (1 - f.cur)).setAttribute('d', ''); }
    else if (!f.tm) f.tm = setTimeout(() => { f.tm = null; f.t = 0; frescoPaint(p, f.o); }, wait); }
  FR_TICK ||= setInterval(frTick, 4500);
  const dayn = Math.max(0, Math.min(1, (alt + 6) / 14)); E('CrG').setAttribute('fill-opacity', (0.16 + 0.42 * dayn).toFixed(2));
  // the gilded stars, at night
  const so = Math.max(0, Math.min(1, (-alt - 5) / 11)), st = E('St');
  st.setAttribute('d', so > 0.01 ? frStars(W, hz, Math.max(0.8, k), S.t) : ''); st.style.opacity = so.toFixed(2);
  // the sky warming above the horizon on the sun's side while it is low; the glow around it – both in flat rings (560a)
  const wa = E('Wa');
  if (S.wl > 0.01 && S.len > 0 && S.len < 24) { wa.setAttribute('cx', sx.toFixed(1)); wa.setAttribute('cy', hz.toFixed(1)); wa.setAttribute('rx', (W * 0.42).toFixed(1)); wa.setAttribute('ry', Math.max(10, Math.min(64 * ks, hz)).toFixed(1)); wa.style.opacity = S.wl.toFixed(2);
    [['Wa0', mixW(tc, 0.25)], ['Wa0b', mixW(tc, 0.25)], ['Wa1', tc], ['Wa1b', tc], ['Wa2', mixC(tc, VERM, 0.5)], ['Wa2b', mixC(tc, VERM, 0.5)], ['Wa3', mixC(tc, VERM, 0.5)]].forEach(([n, c]) => E(n).setAttribute('stop-color', hex(c))); }
  else { wa.setAttribute('rx', 0); wa.setAttribute('ry', 0); }
  const ha = E('Ha');
  if (S.lowG > 0.01) { ha.setAttribute('cx', sx.toFixed(1)); ha.setAttribute('cy', sy.toFixed(1)); ha.setAttribute('rx', (S.gr0 * ks * (1 + 3.2 * S.lowG)).toFixed(1)); ha.setAttribute('ry', (S.gr0 * ks * (1 + 0.3 * S.lowG)).toFixed(1)); ha.style.opacity = (0.9 * S.lowG).toFixed(2);
    [['Ha0', mixW(tc, 0.6)], ['Ha0b', mixW(tc, 0.6)], ['Ha1', tc], ['Ha1b', tc], ['Ha2', mixC(tc, VERM, 0.45)], ['Ha2b', mixC(tc, VERM, 0.45)], ['Ha3', mixC(tc, VERM, 0.45)]].forEach(([n, c]) => E(n).setAttribute('stop-color', hex(c))); }
  else { ha.setAttribute('rx', 0); ha.setAttribute('ry', 0); }
  // the light on the waves (564a): the crests beneath the sun in its colour – narrow and bright when it is low, broad and paler high up
  const col = (P, x, w0, w1, a) => { const m = E(P + 'P'), g = E(P + 'G'); if (a <= 0.005) { m.setAttribute('d', ''); return; }
    m.setAttribute('d', `M${(x - w0).toFixed(1)} ${hz.toFixed(1)}H${(x + w0).toFixed(1)}L${(x + w1).toFixed(1)} ${(yb + 6).toFixed(1)}H${(x - w1).toFixed(1)}z`);
    g.setAttribute('x1', (x - w1).toFixed(1)); g.setAttribute('x2', (x + w1).toFixed(1)); m.style.opacity = Math.min(1, a).toFixed(2); };
  { const low = Math.max(0, Math.min(1, 1 - alt / 45)), up = sy < hz - 1 && alt > -0.8 ? Math.min(1, (alt + 0.8) / 2.5) : 0;
    col('Co', Math.min(W - 4, Math.max(4, sx)), (3 + 7 * (1 - low)) * k, W * (0.08 + 0.2 * (1 - low)), up * (0.6 + 0.4 * low));
    E('Co').setAttribute('fill', hex(mixW(tc, 0.3))); E('CoW').setAttribute('fill', hex(tc)); E('CoW').setAttribute('fill-opacity', '0.26'); }
  // the moon is the handle on the dial (570b, as corrected): its light, silver, falls on the waves beneath the handle by night –
  // the brighter the fuller (not painted in the sky)
  { const mx = o.mx ?? sx, a = (0.3 + 0.7 * S.moon.lit) * Math.max(0, Math.min(1, (-alt - 4) / 6));
    col('Mc', mx, 3 * k, W * 0.12, a); E('McW').setAttribute('fill-opacity', '0.15'); }
}
function sdPanelHTML() {
  const ticks = Array.from({ length: 24 }, (_, h) => { const [a, b] = sdXY(h, h % 6 ? SD.R - 4 : SD.R - 7), [c, d] = sdXY(h, SD.R); return `<line x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${c.toFixed(1)}" y2="${d.toFixed(1)}"/>`; }).join('');
  // three layers: the sky and the sea (fading upwards); the stone dial, drawn on a canvas; the ring, the zodiac and the labels
  return `<div class="msdial" id="sunPanel"><svg class="sdbg" id="sunBg" aria-hidden="true"><defs>
      <linearGradient id="sdFadeG" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${SD.FADE}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".46" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient>
      <mask id="sdFade" maskUnits="userSpaceOnUse" x="-50" y="-50" width="4000" height="4000"><rect x="-50" y="-50" width="4000" height="4000" fill="url(#sdFadeG)"/></mask>
      <clipPath id="sdBgClip"><path id="sdBgClipP" d=""/></clipPath></defs>
    <g mask="url(#sdFade)"><g clip-path="url(#sdBgClip)">${frescoHTML('fp')}<rect id="sdBar" class="sdbar" x="-50" width="4000" height="${SD.BAR + 50}"/><path id="sdBarL" class="sdbarl" d=""/></g><path id="sdEdge" class="sdedge" d=""/></g></svg>
    <canvas class="sdsca" id="sdSca" aria-hidden="true"></canvas>
    <svg class="sdsvg" id="sunSvg" aria-hidden="true"><defs>
      <filter id="sdBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.3"/></filter>
      <radialGradient id="sdGlow"><stop offset="0" id="sdGl0" stop-color="#fff6c8" stop-opacity=".95"/><stop offset=".35" id="sdGl1" stop-color="#ffd85a" stop-opacity=".55"/><stop offset="1" id="sdGl2" stop-color="#ffb030" stop-opacity="0"/></radialGradient>
      <clipPath id="sdAbove"><rect id="sdAboveR" x="-4000" y="-4000" width="8000" height="0"/></clipPath><clipPath id="sdBelow"><rect id="sdBelowR" x="-4000" y="0" width="8000" height="8000"/></clipPath></defs>
    <g id="sdDialG"><g id="sdDialC">
    <path class="sdrim" fill-rule="evenodd" d="M${SD.cx - SD.R - 6} ${SD.cy}a${SD.R + 6} ${SD.R + 6} 0 1 0 ${2 * (SD.R + 6)} 0a${SD.R + 6} ${SD.R + 6} 0 1 0 ${-2 * (SD.R + 6)} 0zM${SD.cx - SD.P - 2} ${SD.cy}a${SD.P + 2} ${SD.P + 2} 0 1 0 ${2 * (SD.P + 2)} 0a${SD.P + 2} ${SD.P + 2} 0 1 0 ${-2 * (SD.P + 2)} 0z"/>
    <g class="sdticks">${ticks}</g><path id="sdDay" class="sdday" d=""/>
    <g id="sdOwlPos" transform="translate(${SD.cx - 38} ${SD.cy - 14})">${OWL}</g>
    <g clip-path="url(#sdAbove)"><g class="sdhpos"><ellipse rx="22" ry="22" fill="url(#sdGlow)" id="sdGlowC"/><circle r="8.5" class="sdsun"/></g></g>
    <g clip-path="url(#sdBelow)"><g class="sdhpos"><circle r="8" class="sdmoonc"/><path id="sdMoonLit" class="sdmoon" d=""/></g></g><g class="sdhpos"><circle r="16" class="sdgrab"/></g>
    </g></g>
    ${zodWheelHTML()}
    <text id="sdLab" class="sdlab sdtime" text-anchor="middle"><title>Tap: modern, Roman or Greek numerals</title></text></svg>
    <div class="sdrow" id="sunCtl"></div></div>`;
}
// the zodiac wheel: the wheel of Ptolemy's Handy Tables (Vat. gr. 1291, fol. 9r, Constantinople, early 9th c.) – the signs
// anticlockwise, as in the sky, the months, the hours, and Helios in his chariot (v350). The rings turn so that the sun's
// place stands at the top, under the pointer (turned clockwise, the year goes on); Helios in the middle stays upright.
// sky/zodiac-rings.webp: the disc, straightened, with Aries–Taurus at the top, the middle cut out; sky/zodiac-helios.webp: the
// middle, cut along the outer edge of its red ring, the gold around it see-through, the crown whole, its spikes as outlined by hand (141 of 512 – v353). A tap opens the
// wheel large over the map; there, too, a finger turns it.
const ZOD_HL = 141 / 512;
function zodDiscSVG(R, ptr) {
  return `<circle r="${R + 4}" class="sdrim"/><g class="zrot"><image href="sky/zodiac-rings.webp" x="${-R}" y="${-R}" width="${2 * R}" height="${2 * R}" transform="rotate(-30)"/></g>
    <image href="sky/zodiac-helios.webp" x="${(-R * ZOD_HL).toFixed(2)}" y="${(-R * ZOD_HL).toFixed(2)}" width="${(2 * R * ZOD_HL).toFixed(2)}" height="${(2 * R * ZOD_HL).toFixed(2)}"/>
    <path class="sdzptr" d="M${-ptr} ${-(R + ptr * 1.9)}h${2 * ptr}L0 ${-(R - ptr * 0.3)}z"/>`;
}
// where the panel is narrow, the controls and the wheel take turns; the button shows where it leads: the wheel, or day and night
const SWAP_ZOD = '<svg width="18" height="18" viewBox="-10 -10 20 20" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.1"><circle r="8.2"/><circle r="4.6"/>'
  + Array.from({ length: 12 }, (_, i) => { const a = i * 30 * RAD; return `<path d="M${(Math.sin(a) * 4.6).toFixed(2)} ${(-Math.cos(a) * 4.6).toFixed(2)}L${(Math.sin(a) * 8.2).toFixed(2)} ${(-Math.cos(a) * 8.2).toFixed(2)}" stroke-width=".7"/>`; }).join('')
  + '</g><path d="M-2.2-9.8h4.4L0-7.2z" fill="#ffd166"/></svg>';
const SWAP_DN = '<svg width="18" height="18" viewBox="-10 -10 20 20" aria-hidden="true"><path d="M0-8a8 8 0 0 0 0 16z" fill="#ffd166"/><path d="M0-8a8 8 0 0 1 0 16z" fill="#1d2550"/>'
  + '<circle r="8" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>';
const zXY = (a, r) => [(Math.sin(a * RAD) * r).toFixed(2), (-Math.cos(a * RAD) * r).toFixed(2)];
function zodWheelHTML() {
  return `<g id="sdZod" class="sdzod">${zodDiscSVG(SD.ZR, 4.5)}</g>
    <text id="sdZLab" class="sdlab sdzlab" text-anchor="middle"></text>`;
}
// the large dial and the large wheel fill the map's pane, the fresco behind them; the map is not drawn meanwhile (566b, v383)
function bigMount(d) {
  ($('#mapBody') || document.body).append(d); sundialPaint();
  try { d._ro = new ResizeObserver(() => { if (d.isConnected) sundialPaint(); }); d._ro.observe(d); } catch (_) {}
}
function bigClose(d) { if (!d) return; d._ro?.disconnect(); d.remove(); M.map?.triggerRepaint(); }
const frK = w => Math.max(0.9, Math.min(1.7, w / 520));
function zodBigPaint() {
  const d = $('#zodBig'), S = M.frS; if (!d || !S) return;
  const svg = d.querySelector('svg.zw'), ov = d.getBoundingClientRect(), q = svg.getBoundingClientRect(); if (!ov.width || !q.width) return;
  // (the horizon and the light where they stand on the dial's ring, the ring taken as the wheel's rim)
  const kz = q.width / 524, cx = q.left - ov.left + 262 * kz, cy = q.top - ov.top + 278 * kz, Rz = 250 * kz, P = (X, Y) => [cx + (X - SD.cx) / SD.R * Rz, cy + (Y - SD.cy) / SD.R * Rz];
  const [sx, sy] = P(S.x, S.y); frescoPaint('fz', { W: ov.width, H: ov.height, hz: P(0, S.hy)[1], yb: ov.height, k: frK(ov.width), ks: Rz / SD.R, sx, sy, mx: sx });
}
// the wheel large, in the map's pane
function zodBigOpen() {
  if ($('#zodBig')) return;
  const d = document.createElement('div'); d.id = 'zodBig'; d.className = 'zodbig inpane';
  d.innerHTML = `<svg class="frbg" aria-hidden="true">${frescoHTML('fz')}</svg><svg class="zw" viewBox="-262 -278 524 540" aria-label="The zodiac wheel">${zodDiscSVG(250, 11)}</svg><div class="zl" id="zodBigLab"></div>
    <button type="button" class="zx" aria-label="Close">✕</button>`;
  bigMount(d);
  d.addEventListener('pointerdown', ev => {
    const svg = d.querySelector('svg.zw'), r = svg.getBoundingClientRect(), k = r.width / 524, c = { x: r.left + r.width / 2, y: r.top + 278 * k };
    if (ev.target.closest('.zx') || Math.hypot(ev.clientX - c.x, ev.clientY - c.y) > 262 * k) { bigClose(d); return; }   // (outside the wheel: closed)
    zodTurn(ev, () => c);
  });
}
// a finger turning the wheel sets the day of the year (the hour kept – as a share of the day or night since v363); a tap without turning – on the small wheel – opens it large
function zodTurn(ev, centre, onTap) {
  ev.preventDefault(); ev.target.setPointerCapture?.(ev.pointerId);
  const za = e => { const c = centre(); return Math.atan2(e.clientX - c.x, -(e.clientY - c.y)) / RAD; };
  const T0 = sunTime(), e0 = sunPos(T0).ecl, x0 = ev.clientX, y0 = ev.clientY; let prev = za(ev), turn = 0, moved = false;
  const ph = (() => { const h = sunHour(T0), len = h.set - h.rise; if (!(len > 0 && len < 24)) return null;
    const day = h.lst >= h.rise && h.lst < h.set; return { day, f: day ? (h.lst - h.rise) / len : ((h.lst - h.set + 24) % 24) / (24 - len) }; })();
  const mv = e => {
    if (!moved) { if (Math.hypot(e.clientX - x0, e.clientY - y0) < 5) return; moved = true; M.sunDrag = true;
      const mode = M.cfg.sunMode || 'now'; if (mode === 'now' || mode === 'anim') { M.cfg.sunMode = 'set'; saveMapCfg(); sunClock(); const c = $('#sunCtl'); if (c) c.innerHTML = sdCtlHTML(); } }
    const a = za(e); turn += ((a - prev) % 360 + 540) % 360 - 180; prev = a;
    let t = T0 + turn / 360 * 365.2422 * 864e5;
    for (let k = 0; k < 3; k++) t += (((e0 + turn - sunPos(t).ecl) % 360 + 540) % 360 - 180) / 0.98565 * 864e5;
    t = T0 + Math.round((t - T0) / 864e5) * 864e5;
    // the hour kept as the ancients counted it (499a): the same share of the day – or of the night – gone since sunrise (sunset),
    // however long the day has grown; where the sun neither rises nor sets, the clock's hour
    if (ph) for (let k = 0; k < 2; k++) { const h = sunHour(t), len = h.set - h.rise; if (!(len > 0 && len < 24)) break;
      const want = ph.day ? h.rise + ph.f * len : h.set + ph.f * (24 - len);
      t += (((want - h.lst) % 24 + 36) % 24 - 12) * 36e5; }
    M.sunT = t; sunApply(); };
  const up = () => { M.sunDrag = false; removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); if (!moved) onTap?.(); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
// the row of buttons at the panel's foot (528a, v375): Now · Day ("Animate" until v379) · Year; while animating, play/pause and the speed; while the
// obelisk stands on the map, its size; at the end, day and night on the map on or off
// the switch: a disc split down the middle – a small sun with rays at the left, a crescent moon at the right (553a, v380)
const SUN_SW_ICON = '<svg width="24" height="24" viewBox="-12 -12 24 24" aria-hidden="true"><defs><clipPath id="swL"><rect x="-12" y="-12" width="12" height="24"/></clipPath><clipPath id="swR"><rect x="0" y="-12" width="12" height="24"/></clipPath></defs>'
  + '<g clip-path="url(#swL)" class="swsun"><circle r="5"/>' + Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return `<path d="M${(Math.sin(a) * 7).toFixed(2)} ${(-Math.cos(a) * 7).toFixed(2)}L${(Math.sin(a) * 9.6).toFixed(2)} ${(-Math.cos(a) * 9.6).toFixed(2)}"/>`; }).join('') + '</g>'
  + '<g clip-path="url(#swR)" class="swmoon"><path d="M0-8.5A8.5 8.5 0 0 1 0 8.5A6.2 8.5 0 0 0 0-8.5z" transform="translate(1.2 0)"/></g><path d="M0-10.5V10.5" class="swdiv"/></svg>';
function sdCtlHTML() {
  const mode = M.cfg.sunMode || 'now', spd = M.cfg.sunSpeed || 20, yr = M.cfg.sunYear || 20, on = sunOn();
  const play = `<button type="button" class="mico2" data-sunplay="1" aria-label="${M.sunPause ? 'Play' : 'Pause'}">${M.sunPause ? '▶' : '❚❚'}</button>`;
  // (v380: in the bar at the panel's foot – the switch in the left corner, the modes in the middle, play and speed at the right)
  return `<div class="sdl"><button type="button" class="sdsw${on ? ' on' : ''}" data-sunsw2="1" aria-pressed="${on}" title="Day and night on the map: ${on ? 'on' : 'off'}" aria-label="Day and night on the map">${SUN_SW_ICON}</button></div>`
    + `<div class="seg" role="group">${[['now', 'Now'], ['anim', 'Day'], ['year', 'Year']].map(([v, l]) => `<button type="button" data-sunmode="${v}" class="${mode === v ? 'on' : ''}">${l}</button>`).join('')}</div><div class="sdr">`
    + (mode === 'anim' ? `<div class="msun">${play}<input type="range" min="0" max="100" value="${spdToV(spd)}" data-sunspeed="1" aria-label="Speed"><output>${spdLabel(spd)}</output></div>` : '')
    + (mode === 'year' ? `<div class="msun">${play}<input type="range" min="0" max="100" value="${yrToV(yr)}" data-sunyear="1" aria-label="Speed"><output>${yrLabel(yr)}</output></div>` : '')
    + `</div>`;
}
async function sdOpen(open) {
  const box = $('#mapBody'); if (!box) return;
  $('#sunPanel')?.remove(); $('#sdMark')?.remove(); bigClose($('#dialBig')); bigClose($('#zodBig')); box.classList.toggle('sdopen', open); $('#mapSunBtn')?.classList.toggle('on', open);
  M.sdOpen = open; sunMoveHook();
  if (!open) { if (M.map && sunOn()) sunApply(); return; }
  M.sdH = M.sdW = null;
  box.insertAdjacentHTML('beforeend', sdPanelHTML() + `<div class="sdmark" id="sdMark">${obelPanelSVG()}</div>`);
  $('#sunCtl').innerHTML = sdCtlHTML(); sundialPaint(); sdRefUpd();
  if (!sunOn()) await sunSet({ sun: true });
  $('#sunCtl').innerHTML = sdCtlHTML(); M.sdOwl = null; sundialPaint(); sdRefUpd();
}
function sundialPaint() {
  const svg = $('#sunSvg'); if (!svg) return;
  const { lst, rise, set, alt } = sunHour(), W = svg.clientWidth || 400, len = set - rise;
  // the layout: the panel's height, the wheels' places, the outline – rounded at the top, fading upwards with the sky (530)
  const Ly = sdLay(W), { k, tx, ty, H } = Ly, pn = $('#sunPanel'), mb = $('#mapBody');
  if (Ly.H !== M.sdH || W !== M.sdW) { M.sdH = H; M.sdW = W; mb?.style.setProperty('--sdh', H + 'px'); if (pn) pn.style.height = H + 'px';
    const rt = 24, rb = 14, d = `M0 ${H - rb}V${rt}Q0 0 ${rt} 0H${W - rt}Q${W} 0 ${W} ${rt}V${H - rb}Q${W} ${H} ${W - rb} ${H}H${rb}Q0 ${H} 0 ${H - rb}z`;
    $('#sdBgClipP').setAttribute('d', d); $('#sdBar').setAttribute('y', H - SD.BAR); $('#sdBarL').setAttribute('d', `M0 ${H - SD.BAR + 0.5}H${W}`);
    $('#sdEdge').setAttribute('d', `M0.5 ${H - rb}V${rt}Q0.5 0.5 ${rt} 0.5H${W - rt}Q${W - 0.5} 0.5 ${W - 0.5} ${rt}V${H - rb}Q${W - 0.5} ${H - 0.5} ${W - rb} ${H - 0.5}H${rb}Q0.5 ${H - 0.5} 0.5 ${H - rb}z`);
    $('#sdDialG').setAttribute('transform', `matrix(${k.toFixed(4)} 0 0 ${k.toFixed(4)} ${tx.toFixed(2)} ${ty.toFixed(2)})`);
    $('#sdZod').setAttribute('transform', `translate(${Ly.zx.toFixed(1)} ${Ly.cy.toFixed(1)}) scale(${k.toFixed(4)})`);
    const tl = $('#sdLab'); tl.setAttribute('x', Ly.dx.toFixed(1)); tl.setAttribute('y', Ly.labY.toFixed(1));
    $('#sdZLab').setAttribute('y', Ly.labY.toFixed(1));
    M.sdT = Ly; M.zc = { x: Ly.zx, y: Ly.cy, r: (SD.ZR + 8) * k };
    // (the stone dial's canvas over the ring's middle; sharp on the screen)
    const cv = $('#sdSca'), dpr = Math.min(2, devicePixelRatio || 1), cw = SD.SW * k, ch = SD.SH * k;
    if (cv) { cv.style.left = (Ly.dx - cw / 2).toFixed(1) + 'px'; cv.style.top = (Ly.cy - ch / 2).toFixed(1) + 'px'; cv.style.width = cw.toFixed(1) + 'px'; cv.style.height = ch.toFixed(1) + 'px';
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); cv._key = null; }
    obelPanelFit(Ly);
    sdRefUpd(); }
  const P = (x, y) => [tx + k * x, ty + k * y];                       // (the dial's space → the panel)
  // the horizon: level with sunrise and sunset on the ring
  const hy = len >= 24 ? SD.cy + SD.R + 12 : len <= 0 ? SD.cy - SD.R - 12 : sdXY(set, SD.R)[1], hyP = ty + k * hy;
  $('#sdAboveR').setAttribute('height', Math.max(0, hy + 4000).toFixed(1)); $('#sdBelowR').setAttribute('y', hy.toFixed(1));
  const [x, y] = sdXY(lst, SD.R); svg.querySelectorAll('.sdhpos').forEach(g => g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`));
  // the glow: round when high; low down wider and flatter, spreading along the horizon (555a, v380)
  const g = $('#sdGlowC'), lowG = Math.max(0, Math.min(1, (10 - alt) / 12)) * Math.max(0, Math.min(1, (alt + 8) / 5)), gr0 = 12 + Math.max(0, alt) * 0.35;
  g.setAttribute('rx', gr0.toFixed(1)); g.setAttribute('ry', gr0.toFixed(1)); g.style.opacity = Math.max(0.25, Math.min(1, 0.35 + alt / 50)).toFixed(2);
  const day = lst >= rise && lst < set;
  // the sun's colour of the moment, as in the sky: the handle, its glow, the light on the bowl and on the sea (v378)
  const tc = sunTint(alt, lst < 12), hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''), mixW = (c, t) => c.map(v => v + (255 - v) * t);
  const sunEl = svg.querySelector('.sdsun'); if (sunEl) { sunEl.style.fill = hex(mixW(tc, 0.18)); sunEl.style.stroke = hex(mixW(tc, 0.7)); }
  $('#sdGl0')?.setAttribute('stop-color', hex(mixW(tc, 0.75))); $('#sdGl1')?.setAttribute('stop-color', hex(tc)); $('#sdGl2')?.setAttribute('stop-color', hex(tc.map(v => v * 0.85)));
  // the fresco behind (v383): the light of the moment, shared with the large views; the moon's light falls beneath its place on the ring
  { const t = sunTime(), c = sunRef(), mp = moonPos(t), mlst = ((12 + (c.lng - mp.lon) / 15) % 24 + 24) % 24;
    M.frS = { t, alt, eve: lst >= 12, tc, lowG, gr0, len, x, y, hy, wl: Math.max(0, Math.min(1, (12 - alt) / 12)) * Math.max(0, Math.min(1, (alt + 7) / 7)),
      moon: { ...sunAt(mp, c.lng, c.lat), lit: mp.lit, waxing: mp.waxing, X: sdXY(mlst, SD.R)[0] } };
    frescoPaint('fp', { W, H, hz: hyP, yb: H - SD.BAR + 2, k, ks: k, sx: tx + k * x, sy: ty + k * y, mx: tx + k * x }); }
  // the daylight on the ring, and the shadow: long when the sun is low, short at noon, fading towards sunset
  if (len > 0 && len < 24) { const [ax, ay] = sdXY(rise, SD.R + 3), [bx, by] = sdXY(set, SD.R + 3); $('#sdDay').setAttribute('d', `M${ax.toFixed(1)} ${ay.toFixed(1)}A${SD.R + 3} ${SD.R + 3} 0 ${len > 12 ? 1 : 0} 1 ${bx.toFixed(1)} ${by.toFixed(1)}`); }
  else $('#sdDay').setAttribute('d', len >= 24 ? `M${SD.cx} ${SD.cy - SD.R - 3}a${SD.R + 3} ${SD.R + 3} 0 1 0 0.01 0` : '');
  // the stone dial inside the ring: its picture in the light of the moment; the obelisk on its socket lit with it (v379)
  scaPaint($('#sdSca')); obelPanelLight();
  // the owl: lands when the handle enters the night, flies off when it leaves
  if (M.sdOwl !== !day) { M.sdOwl = !day; const o = $('#sdOwlPos .sdowl'); o.classList.remove('land', 'away'); void o.getBoundingClientRect(); o.classList.add(day ? 'away' : 'land'); }
  // the moon on the dial in its real phase: lit on the right while waxing, on the left while waning (as seen from the north)
  { const mo = moonPos(sunTime()), kk = mo.lit, r = 8, rx = Math.max(0.01, r * Math.abs(2 * kk - 1)), sgn = mo.waxing ? 1 : -1;
    $('#sdMoonLit')?.setAttribute('d', `M0 ${-r}A${r} ${r} 0 0 ${sgn > 0 ? 1 : 0} 0 ${r}A${rx.toFixed(2)} ${r} 0 0 ${(kk > 0.5) === (sgn > 0) ? 1 : 0} 0 ${-r}z`); }
  // the labels: the time under the dial; the sign and the date under the wheel
  const l = sunLabel(), tl = $('#sdLab'); if (tl.firstChild?.nodeType === 3) tl.firstChild.nodeValue = l.main; else tl.insertBefore(document.createTextNode(l.main), tl.firstChild);
  const e = sunPos(sunTime()).ecl, zn = ZOD[Math.floor(e / 30)][(M.cfg.sunFmt || 'modern') === 'greek' ? 2 : M.cfg.sunFmt === 'roman' ? 1 : 0];
  document.querySelectorAll('.zrot').forEach(g => g.setAttribute('transform', `rotate(${e.toFixed(2)})`));   // (the small wheel and the large one)
  const bl = $('#zodBigLab'); if (bl) bl.textContent = `${zn} · ${l.sub}`; zodBigPaint();
  const zl = $('#sdZLab'); zl.textContent = `${zn} · ${l.sub}`; let tw = 0; try { tw = zl.getComputedTextLength(); } catch (_) {}
  zl.setAttribute('x', Math.max(tw / 2 + 8, Math.min(Ly.zx, W - 8 - tw / 2)).toFixed(1));     // (a long date kept inside the panel)
  dialBigPaint(l);
}
// a finger (or the mouse) on the dial sets the hour, the day staying; a tap in its middle opens it large (527, v375); a tap on the
// time beneath it changes the numerals: modern, Roman, Greek (529a); the zodiac: turned, the day of the year; tapped, large
document.addEventListener('pointerdown', ev => {
  const svg = ev.target.closest?.('#sunSvg'); if (!svg || !M.sdT) return;
  if (ev.target.closest('#sdLab')) { ev.preventDefault(); sdFmtNext(); return; }
  const r0 = svg.getBoundingClientRect(), L = M.sdT;
  if (M.zc && Math.hypot(ev.clientX - r0.left - M.zc.x, ev.clientY - r0.top - M.zc.y) <= M.zc.r) {
    zodTurn(ev, () => { const q = svg.getBoundingClientRect(); return { x: q.left + M.zc.x, y: q.top + M.zc.y }; }, zodBigOpen); return; }
  const toDial = e => { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left - L.tx) / L.k - SD.cx, y: (e.clientY - r.top - L.ty) / L.k - SD.cy }; };
  const p0 = toDial(ev), d0 = Math.hypot(p0.x, p0.y); if (d0 > SD.R + 22) return;     // (only on and around the dial)
  ev.preventDefault(); svg.setPointerCapture?.(ev.pointerId);
  dialDrag(ev, toDial, d0 < SD.P * 0.6 ? dialBigOpen : null);
});
// setting the hour by the angle of the finger round the dial's centre; pressed in the middle, it waits to see whether the finger
// moves (then it sets the hour) or lifts (a tap: onTap)
function dialDrag(ev, toDial, onTap) {
  const x0 = ev.clientX, y0 = ev.clientY; let on = false;
  const setT = e => { const { x, y } = toDial(e), h = ((12 + Math.atan2(x, -y) / (2 * Math.PI) * 24) % 24 + 24) % 24, { lst } = sunHour();
    let dh = h - lst; if (dh > 12) dh -= 24; if (dh < -12) dh += 24; M.sunT = sunTime() + dh * 36e5; sunApply(); };
  const begin = () => { on = true; const mode = M.cfg.sunMode || 'now';
    if (mode !== 'set' && mode !== 'year') { M.cfg.sunMode = 'set'; saveMapCfg(); sunClock(); const c = $('#sunCtl'); if (c) c.innerHTML = sdCtlHTML(); }
    M.sunDrag = true; };                                                // (the year, running, waits while the hour is set)
  if (!onTap) { begin(); setT(ev); }
  const mv = e => { if (!on) { if (Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return; begin(); } setT(e); };
  const up = () => { M.sunDrag = false; removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); if (!on) onTap?.(); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
async function sdFmtNext() {
  const f = M.cfg.sunFmt || 'modern'; M.cfg.sunFmt = f === 'modern' ? 'roman' : f === 'roman' ? 'greek' : 'modern';
  await saveMapCfg(); sundialPaint(); sunClock();
}
// the dial large, over the map (as the zodiac wheel): a copy of the panel's dial, renewed whenever it changes; a finger on it sets
// the hour; a tap outside it, or ✕, closes it
const DB = SD.R + 30;
function dialBigOpen() {
  if ($('#dialBig')) return;
  const d = document.createElement('div'); d.id = 'dialBig'; d.className = 'zodbig sdbig inpane';
  d.innerHTML = `<svg class="frbg" aria-hidden="true">${frescoHTML('fd')}</svg><div class="dbw"><canvas class="dbsca" aria-hidden="true"></canvas><svg viewBox="${SD.cx - DB} ${SD.cy - DB} ${2 * DB} ${2 * DB}" aria-label="The sundial"><g class="dbc"></g></svg></div><div class="zl" id="dialBigLab"></div>
    <button type="button" class="zx" aria-label="Close">✕</button>`;
  bigMount(d);
  d.addEventListener('pointerdown', ev => {
    const svg = d.querySelector('.dbw > svg'), r = svg.getBoundingClientRect(), sc = r.width / (2 * DB);
    const toDial = e => { const q = svg.getBoundingClientRect(); return { x: (e.clientX - q.left) / sc - DB, y: (e.clientY - q.top) / sc - DB }; };
    const p = toDial(ev); if (ev.target.closest('.zx') || Math.hypot(p.x, p.y) > SD.R + 22) { bigClose(d); return; }
    ev.preventDefault(); dialDrag(ev, toDial, null);
  });
}
function dialBigPaint(l) {
  const d = $('#dialBig'), src = $('#sdDialC'); if (!d || !src) return;
  const c = src.cloneNode(true); c.removeAttribute('id'); c.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  const g = d.querySelector('.dbc'); g.replaceChildren(c);
  // (the stone dial beneath the ring, sized to the large view; drawn a little less sharply than the screen allows, to stay quick)
  const svg = d.querySelector('.dbw > svg'), cv = d.querySelector('.dbsca'), wb = svg.clientWidth; if (wb && cv) { const sb = wb / (2 * DB), dpr = Math.min(1.5, devicePixelRatio || 1);
    const cw = SD.SW * sb, ch = SD.SH * sb, pw = Math.round(cw * dpr), ph = Math.round(ch * dpr);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; cv._key = null; }
    Object.assign(cv.style, { width: cw + 'px', height: ch + 'px', left: ((DB - SD.SW / 2) * sb) + 'px', top: ((DB - SD.SH / 2) * sb) + 'px' }); scaPaint(cv); }
  // the fresco behind, its horizon and light where they stand on the dial (v383)
  { const ov = d.getBoundingClientRect(), q = svg.getBoundingClientRect(), sb = q.width / (2 * DB), S = M.frS;
    if (S && ov.width && q.width) { const P = (X, Y) => [q.left - ov.left + (X - SD.cx + DB) * sb, q.top - ov.top + (Y - SD.cy + DB) * sb], [sx, sy] = P(S.x, S.y);
      frescoPaint('fd', { W: ov.width, H: ov.height, hz: P(0, S.hy)[1], yb: ov.height, k: frK(ov.width), ks: sb, sx, sy, mx: sx }); } }
  l ||= sunLabel(); const lb = $('#dialBigLab'); if (lb) lb.textContent = `${l.main} · ${l.sub}`;
}
document.addEventListener('change', ev => { if (ev.target.closest?.('[data-sunsw]')) sunSet({ sun: ev.target.checked }).then(() => { const c = $('#sunCtl'); if (c) c.innerHTML = sdCtlHTML(); sundialPaint(); }); });
// the speed: one day in 60 s … 5 s (a logarithmic slider)
// (the slider: a day in 77 s at the left to 7 s at the right – v369)
const spdToV = s => Math.round(Math.log(77 / Math.max(7, Math.min(77, s))) / Math.log(11) * 100), vToSpd = v => 77 / 11 ** (v / 100);
const spdLabel = s => `a day in ${s >= 9.95 || Math.abs(s - Math.round(s)) < 0.05 ? Math.round(s) : s.toFixed(1)} s`;
// the height exaggeration of 3D (1 … 3), and the spacing of the contour lines (the least room between them, 4 … 24 pixels)
document.addEventListener('input', ev => {
  const x = ev.target.closest?.('input[data-exag]'), sp = ev.target.closest?.('input[data-cspace]'), sk = ev.target.closest?.('input[data-skysize]');
  if (sk) { M.cfg.skySize = +sk.value; M.map?.triggerRepaint(); clearTimeout(M.skT); M.skT = setTimeout(saveMapCfg, 400); return; }
  if (x) { M.cfg.exag = +x.value; $('#exagOut') && ($('#exagOut').textContent = '×' + M.cfg.exag.toFixed(1)); if (M.map?.getTerrain()) M.map.setTerrain(T3D()); clearTimeout(M.exT); M.exT = setTimeout(saveMapCfg, 400); }
  if (sp) { M.cfg.relSpacing = +sp.value; clearTimeout(M.spT);
    M.spT = setTimeout(async () => { await saveMapCfg(); if (M.map) { M.map.setStyle(mapStyle(M.colors)); M.map.once('styledata', () => setTimeout(refreshMapData, 50)); } }, 500); }   // (the lines of maplibre-contour: made anew)
});
// the obelisk's size: a third … three times (logarithmic; the middle of the slider is the normal size)
document.addEventListener('input', ev => {
  const r = ev.target.closest?.('input[data-obsz]'); if (!r) return;
  M.cfg.obelSize = 9 ** (+r.value / 100) / 3; M.obZ = null; obelShadow(); clearTimeout(M.obSzT); M.obSzT = setTimeout(saveMapCfg, 400);
});
// the year: one year in 77 s … 7 s
const yrToV = s => Math.round(Math.log(77 / s) / Math.log(11) * 100), vToYr = v => 77 / 11 ** (v / 100);
const yrLabel = s => `a year in ${Math.round(s)} s`;
document.addEventListener('input', ev => {
  const y = ev.target.closest?.('input[data-sunyear]');
  if (y) { M.cfg.sunYear = vToYr(+y.value); y.nextElementSibling.textContent = yrLabel(M.cfg.sunYear); clearTimeout(M.sunSpdT); M.sunSpdT = setTimeout(saveMapCfg, 400); return; }
  const r = ev.target.closest?.('input[data-sunspeed]'); if (!r) return;
  M.cfg.sunSpeed = vToSpd(+r.value); r.nextElementSibling.textContent = spdLabel(M.cfg.sunSpeed);
  clearTimeout(M.sunSpdT); M.sunSpdT = setTimeout(saveMapCfg, 400);
});
const SUNDIAL_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15.5a9 9 0 0 1 18 0z"/><path d="M12 15.5 12 9.5M12 15.5l-4.6-4.2M12 15.5 7 14.6" stroke-width="1.1"/><path d="M12 15.5 16.8 9.6" stroke-width="2"/><path d="M5 19h14"/></g></svg>';

// ---------------------------------------------------------------- the projection icon: a globe seen from above the
// northern hemisphere, unrolled into the flat (Mercator) map and back – fine lines
const PROJ_V = 40 * RAD;                                            // (the eye above 40° N)
const PROJ_LINES = (() => {
  const L = [], seg = (f, n = 32) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
  for (let lon = -180; lon < 180; lon += 45) L.push(seg(t => [lon, -30 + t * 110]));                 // meridians (to near the pole)
  for (const lat of [0, 30, 60]) L.push(seg(t => [-180 + t * 360, lat], 72));                         // equator and parallels
  // each line in the parts seen on the globe (front) and those behind it (shown only as the globe unrolls)
  const vis = ([lon, lat]) => Math.sin(PROJ_V) * Math.sin(lat * RAD) + Math.cos(PROJ_V) * Math.cos(lat * RAD) * Math.cos(lon * RAD) >= 0;
  const front = [], back = [];
  for (const pts of L) { let run = null, cur = null;
    for (const q of pts) { const v = vis(q); if (run && v !== cur) { run.push(q); (cur ? front : back).push(run); run = null; } if (!run) { run = []; cur = v; } run.push(q); }
    if (run?.length > 1) (cur ? front : back).push(run); }
  front.push(seg(t => ['rim', t], 64));                                                                // the rim (the edge of the map)
  return { front, back };
})();
function projPt([lon, lat], t) {
  const R = 8.6, v = PROJ_V;
  let g, m;
  if (lon === 'rim') {
    const a = lat * 2 * Math.PI; g = [12 + R * Math.sin(a), 12 - R * Math.cos(a)];
    const W = 9.2, H = 7, P = 4 * W + 4 * H; let r = lat * P;                     // the rectangle, from the top middle clockwise
    if (r < W) m = [12 + r, 12 - H]; else if ((r -= W) < 2 * H) m = [12 + W, 12 - H + r]; else if ((r -= 2 * H) < 2 * W) m = [12 + W - r, 12 + H];
    else if ((r -= 2 * W) < 2 * H) m = [12 - W, 12 + H - r]; else m = [12 - W + (r - 2 * H), 12 - H];
  } else {
    const f = lat * RAD, l = lon * RAD;
    g = [12 + R * Math.cos(f) * Math.sin(l), 12 - R * (Math.cos(v) * Math.sin(f) - Math.sin(v) * Math.cos(f) * Math.cos(l))];
    const y = Math.log(Math.tan(Math.PI / 4 + Math.min(80, lat) * RAD / 2));          // Mercator, cut at 80°
    m = [12 + lon / 180 * 9.2, 12 + 7 - (y + 0.549) / (2.436 + 0.549) * 14];
  }
  return [g[0] + (m[0] - g[0]) * t, g[1] + (m[1] - g[1]) * t];
}
const projD = (ls, t) => ls.map(pts => 'M' + pts.map(p => projPt(p, t).map(x => x.toFixed(2)).join(' ')).join('L')).join('');
function projIconSVG(t) {
  return `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" class="projic"><g fill="none" stroke="currentColor" stroke-width=".85" stroke-linejoin="round" stroke-linecap="round"><path class="pf" d="${projD(PROJ_LINES.front, t)}"/><path class="pb" d="${projD(PROJ_LINES.back, t)}" stroke-opacity="${t.toFixed(2)}"/></g></svg>`;
}

// ---------------------------------------------------------------- the map menu
const COMPASS_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 15 12h-6z" fill="#d23a2a"/><path d="M12 20.5 9 12h6z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
// the menu's button: the earth seen from space above Europe (fine lines)
const GLOBE_EU_ICON = '<svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" class="globeic"><g fill="none" stroke="currentColor" stroke-linejoin="round" stroke-linecap="round"><circle cx="12" cy="12" r="11.1" stroke-width=".7"/><path d="M3.1 18.7L3.3 18.8L3.6 19.0L3.5 18.8L3.4 18.5L3.4 18.2L3.6 18.1L3.7 17.8L3.6 17.6L3.4 17.4L3.2 17.1L3.1 16.9L2.9 16.7L2.7 16.4L2.5 16.2L2.4 15.9L2.3 15.7L2.0 15.5L1.9 15.3L2.0 15.0L2.0 14.7L1.9 14.4L1.8 14.2L1.7 13.9L1.6 13.6L1.5 13.3L1.5 13.0L1.4 12.7L1.4 12.4L1.4 12.2L1.3 11.9L1.2 11.6L1.2 11.3L1.2 11.0L1.1 11.3L1.1 11.0L1.1 10.7L1.0 10.5L1.1 10.2L1.1 9.9L1.2 9.6L1.2 9.3L1.3 9.0L1.4 8.8L1.5 8.5L1.6 8.2L1.7 7.9L1.9 7.7L1.9 7.4M2.6 6.1L2.7 5.9L2.7 6.2L2.6 6.4L2.5 6.7L2.5 7.0L2.3 7.3L2.2 7.5L2.0 7.8L2.3 7.5L2.4 7.3L2.6 7.1L2.9 7.2L3.1 7.0L3.3 6.8L3.6 6.8L3.7 7.1L3.9 6.9L4.2 7.0L4.4 7.2L4.1 7.3L4.3 7.4L4.5 7.1L4.6 6.9L4.9 6.7L4.7 6.5L4.5 6.4L4.2 6.3L4.5 6.4L4.8 6.4L5.0 6.5L5.1 6.8L5.3 7.0L5.6 7.1L5.8 6.9L5.7 6.6L5.9 6.5L6.0 6.2L6.2 6.0L6.4 5.8L6.6 5.6L6.3 5.6L6.4 5.3L6.6 5.2L6.8 5.0L6.9 4.7L6.6 4.7L6.3 4.8L6.1 5.0L5.8 5.1L5.5 5.1L5.3 5.2L5.4 4.9L5.6 4.8L5.8 4.5L6.0 4.3L6.2 4.1L6.4 3.8L6.7 3.7L7.0 3.7L7.3 3.7L7.5 3.8L7.6 4.1L7.8 4.1L8.1 4.0L7.9 3.9L8.1 3.7L8.4 3.5L8.7 3.5L8.4 3.4L8.1 3.5L8.2 3.2L8.4 3.0L8.6 2.8L8.8 2.6L9.1 2.5L9.4 2.4L9.6 2.3L9.8 2.1L10.2 2.0L10.5 1.9L10.7 1.9L11.0 1.8L11.3 1.8L11.6 1.8L11.8 1.6L11.6 1.5L11.9 1.5L11.6 1.4L11.9 1.3L11.6 1.2L11.4 1.1L11.6 1.0L11.3 1.0L11.1 1.1L10.8 1.2L10.6 1.3L10.3 1.4L10.0 1.4L9.7 1.5L9.4 1.5L9.1 1.6L8.8 1.7L8.6 1.7L8.3 1.8L8.0 1.8L7.7 1.9L7.5 2.0L7.2 2.1L6.9 2.3L6.7 2.3L6.4 2.4M1.0 10.2L1.0 10.5L1.0 10.8L1.0 11.1M17.2 20.9L17.0 21.1L17.3 21.3L17.5 21.1L17.7 20.9L17.9 20.7L18.0 20.4L18.2 20.2L18.4 19.9L18.3 19.7L18.1 19.9L17.9 20.1L17.7 20.3L17.4 20.4L17.3 20.7M18.6 13.6L18.5 13.9L18.2 14.0L18.1 13.7L17.8 13.6L17.6 13.5L17.4 13.2L17.6 13.0L17.9 13.2L18.1 13.3L18.4 13.4L18.6 13.2L18.9 13.3L19.1 13.2L19.4 13.0L19.6 12.9L19.8 12.6L20.1 12.7L20.4 12.7L20.6 12.9L20.8 12.7L20.9 12.9L21.1 13.1L21.2 13.4L21.4 13.6L21.6 13.9L21.7 14.1L21.9 13.9L21.9 13.6L21.9 13.3L21.9 13.0L21.8 12.7L21.8 12.4L21.9 12.1L21.9 11.8L21.9 11.5L21.9 11.3L21.9 11.0L22.0 10.7L21.9 10.4L22.2 10.5L22.4 10.7L22.5 10.9L22.6 10.6L22.8 10.8L22.9 11.1L22.9 11.4L23.0 11.7M23.1 11.7L23.1 11.4L22.9 11.2L22.8 10.9L22.8 10.6L22.9 10.4L22.9 10.1L22.9 9.8L22.8 9.5L22.7 9.2L22.5 9.0L22.4 8.8L22.3 8.5L22.3 8.2L22.2 7.9L22.1 7.6L22.0 7.4L21.9 7.1L21.8 6.8L21.6 6.6L21.5 6.3L21.3 6.1L21.1 5.9L20.9 5.7L20.7 5.5L20.5 5.3L20.2 5.2L20.0 5.0L20.3 5.1L20.1 4.9L20.4 4.9L20.2 4.7L20.0 4.5L19.8 4.4L19.6 4.2L19.3 4.0L19.1 3.8L18.9 3.6L18.7 3.4L18.5 3.2L18.2 3.1L18.0 2.9L17.7 2.8L17.4 2.7L17.5 3.0L17.2 2.9L16.9 2.8L16.7 2.6L16.4 2.5L16.2 2.4L15.9 2.2L15.7 2.0L15.4 2.0L15.1 1.9L14.9 1.8L14.6 1.7L14.9 1.7L15.2 1.8L15.5 1.8L15.8 1.9L16.1 1.9L15.8 1.7L15.5 1.7L15.2 1.6L14.9 1.7L14.6 1.6L14.3 1.5L14.1 1.4L13.8 1.4L13.5 1.4L13.2 1.5L13.0 1.7L13.2 1.8L13.5 1.9L13.8 2.0L14.1 2.1L14.3 2.3L14.4 2.6L14.6 2.8L14.9 2.9L15.1 3.1L14.9 3.3L15.1 3.5L15.1 3.7L15.2 4.0L15.0 3.8L14.7 3.7L14.5 3.9L14.6 4.1L14.7 4.4L14.9 4.6L14.9 4.9L15.2 5.0L15.5 5.1L15.1 5.1L14.9 5.2L15.1 5.4L15.3 5.5L15.6 5.5L15.7 5.8L15.7 6.1L15.6 5.8L15.4 5.7L15.1 5.5L14.9 5.3L14.8 5.6L15.1 5.8L15.3 5.9L15.1 5.9L14.8 6.1L14.7 6.3L14.5 6.5L14.4 6.7L14.1 6.6L14.2 6.9L14.1 7.2L13.9 7.4L13.7 7.4L13.5 7.2L13.8 7.2L14.0 7.0L13.7 6.8L13.4 6.7L13.1 6.7L12.9 6.5L12.6 6.7L12.4 6.9L12.2 7.0L12.0 7.3L11.9 7.5L11.7 7.8L11.5 8.0L11.3 8.1L11.2 8.4L11.2 8.7L11.3 8.9L11.6 8.8L11.8 9.0L11.9 9.2L12.2 9.3L12.3 9.0L12.4 8.7L12.4 8.5L12.3 8.2L12.5 7.9L12.6 7.7L12.8 7.5L12.8 7.8L12.7 8.0L12.7 8.3L12.9 8.5L13.1 8.4L13.4 8.4L13.2 8.6L12.9 8.7L13.1 9.0L12.8 9.0L12.8 9.3L12.7 9.6L12.4 9.5L12.1 9.7L11.8 9.6L11.5 9.6L11.6 9.3L11.6 9.0L11.4 9.2L11.4 9.5L11.3 9.8L11.0 9.8L10.8 10.0L10.6 10.2L10.4 10.4L10.1 10.3L9.8 10.5L9.9 10.7L10.0 11.0L9.9 11.3L9.8 11.5L9.5 11.5L9.2 11.4L8.9 11.3L8.8 11.6L8.7 11.9L8.6 12.1L8.6 12.4L8.8 12.5L9.0 12.8L9.3 12.7L9.5 12.8L9.8 12.6L9.9 12.3L10.1 12.1L10.4 12.0L10.5 11.7L10.7 11.6L11.0 11.7L11.3 11.5L11.5 11.7L11.7 11.9L11.9 12.1L12.1 12.3L12.3 12.5L12.3 12.8L12.5 12.6L12.4 12.3L12.3 12.0L12.1 11.9L11.9 11.7L11.8 11.4L12.1 11.4L12.2 11.6L12.5 11.8L12.7 11.9L12.8 12.2L12.9 12.4L13.1 12.7L13.2 12.9L13.4 12.8L13.3 12.6L13.3 12.3L13.5 12.1L13.8 12.1L14.1 12.0L13.9 11.8L14.0 11.5L14.1 11.2L14.2 10.9L14.5 10.9L14.6 11.2L14.9 11.0L14.8 10.7L15.1 10.6L15.1 10.9L15.3 11.1L15.6 11.2L15.8 11.3L15.7 11.6L15.4 11.7L15.2 11.7L14.9 11.7L14.6 11.8L14.4 11.9L14.1 12.1L13.8 12.2L13.9 12.5L14.1 12.8L14.3 12.9L14.6 12.7L14.9 12.8L15.1 12.7L15.4 12.8L15.4 13.1L15.3 13.5L15.2 13.7L14.9 13.8L14.6 13.8L14.4 13.9L14.0 13.9L13.7 13.8L13.5 13.7L13.2 13.7L13.0 13.9L12.9 14.2L12.6 14.1L12.3 14.0L12.1 13.8L11.8 13.8L11.5 13.7L11.5 13.4L11.5 13.1L11.2 12.9L10.9 12.9L10.7 13.0L10.4 12.9L10.1 12.9L9.8 13.0L9.5 13.1L9.2 13.0L9.0 12.8L8.8 13.1L8.5 13.2L8.3 13.4L8.1 13.6L8.0 13.9L7.7 14.0L7.4 14.1L7.2 14.3L7.0 14.5L6.8 14.7L6.7 15.0L6.7 15.2L6.7 15.5L6.6 15.8L6.4 16.0L6.5 16.3L6.5 16.6L6.7 16.8L6.9 17.0L7.0 17.3L7.2 17.6L7.4 17.8L7.6 18.0L7.8 18.2L8.1 18.2L8.4 18.3L8.7 18.3L9.0 18.4L9.3 18.4L9.5 18.3L9.9 18.3L10.2 18.4L10.4 18.6L10.6 18.7L10.9 18.7L11.2 18.8L11.2 19.1L11.1 19.4L11.1 19.7L11.3 19.9L11.6 20.1L11.8 20.2L11.9 20.5L12.0 20.8L11.8 21.1L11.6 21.3L11.6 21.6L11.8 21.8L12.1 22.0L12.2 22.3L12.4 22.5L12.6 22.6L12.8 22.8L13.1 22.7L13.4 22.7L13.7 22.7L14.0 22.6L14.3 22.5L14.6 22.4L14.9 22.2L15.1 22.1L15.3 21.9L15.6 21.8L15.8 21.6L15.8 21.3L16.0 21.1L16.3 21.0L16.5 20.8L16.7 20.6L16.8 20.4L16.9 20.1L16.7 19.9L16.6 19.6L16.8 19.3L16.9 19.1L17.1 18.9L17.3 18.6L17.5 18.4L17.7 18.1L17.9 17.9L18.1 17.6L18.3 17.4L18.4 17.1L18.4 16.8L18.6 16.5L18.6 16.2L18.3 16.3L18.1 16.5L17.8 16.6L17.6 16.8L17.3 16.7L17.1 16.4L16.9 16.3L16.6 16.2L16.5 16.0L16.2 15.8L16.1 15.5L16.0 15.3L15.8 15.1L15.6 14.8L15.4 14.6L15.3 14.4L15.1 14.1L15.3 14.3L15.4 14.0L15.6 14.3L15.8 14.5L16.0 14.7L16.2 14.9L16.4 15.2L16.5 15.4L16.8 15.5L17.0 15.7L17.1 16.0L17.2 16.3L17.4 16.5L17.6 16.3L17.9 16.1L18.1 15.9L18.3 15.7L18.5 15.5L18.6 15.2L18.8 15.0L19.0 14.8L19.1 14.5L19.2 14.2L19.3 14.0L19.4 13.7L19.1 13.6L18.8 13.5L18.7 13.3L18.6 13.5M20.0 4.3L19.8 4.1L19.6 3.9L19.4 3.7L19.1 3.5L18.9 3.3L18.7 3.2L18.9 3.4L19.1 3.5L19.4 3.7L19.6 3.9L19.8 4.2L20.0 4.4L20.2 4.6L20.0 4.4M18.0 2.7L18.2 3.0L18.5 3.1L18.7 3.2L18.5 3.1L18.2 2.9M5.1 7.9L5.2 7.6L5.3 7.4L5.5 7.2L5.2 7.2L4.9 7.3L5.0 7.6L4.9 7.9M17.1 2.6L17.3 2.7L17.6 2.7L17.9 2.8L17.6 2.7L17.4 2.6L17.1 2.6M9.7 9.5L9.8 9.2L9.5 9.2L9.3 9.4L9.2 9.7L9.5 9.7L9.7 9.5M10.2 9.1L10.4 8.9L10.2 8.6L10.0 8.8L9.9 9.1L10.1 9.3L10.1 9.6L9.8 9.8L9.7 10.1L10.0 10.2L10.3 10.2L10.5 10.0L10.4 9.7L10.3 9.4L10.2 9.1M9.9 7.1L9.6 7.0L9.4 6.8L9.2 7.0L9.2 7.3L9.5 7.4L9.8 7.3L9.8 7.1M13.0 1.7L13.1 1.5L12.8 1.5L12.5 1.4L12.7 1.6M8.5 3.2L8.8 3.1L9.1 3.0L9.3 2.9L9.5 2.7L9.3 2.6L9.0 2.7L8.8 2.7L8.6 2.9L8.4 3.1M7.6 4.6L7.3 4.5L7.2 4.8L7.0 5.0L6.9 5.2L7.1 5.0L7.0 5.3L7.3 5.2L7.4 5.0L7.6 5.2L7.8 5.0L7.9 4.7L8.2 4.6L8.4 4.4L8.6 4.2L8.8 3.9L8.5 3.8L8.7 3.7L8.5 3.7L8.2 3.9L8.2 4.2L8.0 4.4L7.7 4.6M10.8 4.4L10.6 4.3L10.4 4.1L10.1 4.1L9.8 4.0L9.6 4.2L9.4 4.4L9.3 4.7L9.0 4.9L8.7 5.0L8.7 5.3L8.4 5.4L8.1 5.4L7.9 5.6L7.7 5.8L7.5 6.0L7.4 6.2L7.2 6.5L7.3 6.8L7.5 6.7L7.7 6.5L8.0 6.5L8.3 6.3L8.6 6.4L8.8 6.3L9.1 6.3L9.4 6.4L9.7 6.3L9.5 6.1L9.7 6.0L9.9 5.8L10.2 5.8L10.4 5.6L10.5 5.3L10.7 5.2L10.9 4.9L11.2 4.9L10.9 4.8L11.1 4.6L11.1 4.3M9.1 3.9L9.3 3.7L9.5 3.5L9.2 3.5L9.1 3.7M10.6 4.1L10.7 3.8L10.5 3.6L10.2 3.7L9.9 3.7L9.6 3.7L9.4 3.8L9.6 3.9L9.9 3.9L10.2 4.0L10.5 4.1M1.6 9.4L1.6 9.1L1.7 8.8L1.8 8.5L1.8 8.2L1.9 7.9L1.8 8.2L1.7 8.5L1.6 8.8L1.6 9.0L1.6 9.3M22.2 13.8L22.0 13.5L22.0 13.8L22.1 14.1L22.2 13.8M7.0 2.2L7.3 2.1L7.5 2.0L7.3 2.1L7.0 2.2M7.1 4.4L7.3 4.2L7.5 4.0L7.3 4.0L7.1 4.3" stroke-width=".42"/><path d="M12.57 12.51L12.32 12.58L12.06 12.65L11.83 12.65L11.60 12.58L11.40 12.64L11.40 12.84L11.63 12.91L11.83 13.07L12.06 13.16L12.22 13.29L12.44 13.20L12.41 13.00L12.51 12.68Z" fill="none" stroke="var(--card)" stroke-width="1.1"/><path d="M12.57 12.51L12.32 12.58L12.06 12.65L11.83 12.65L11.60 12.58L11.40 12.64L11.40 12.84L11.63 12.91L11.83 13.07L12.06 13.16L12.22 13.29L12.44 13.20L12.41 13.00L12.51 12.68Z" fill="currentColor" stroke-width=".3"/></g></svg>';   // (Sicily filled, a little enlarged and set off from Italy and Africa by a narrow gap, so that it shows)
// the 3D button: the Wurmlinger Berg (48° 30′ 22.6″ N, 8° 58′ 56.4″ E) in contour lines. Flat: the rings nested, seen
// from above; 3D: the same rings, unchanged in shape and place, each lifted to its height – the higher ones (filled with
// the button's colour) hiding what lies behind them. The chapel on top: a small red roof.
const HILL = (() => {
  const rings = [[9.8, 5.0, 0], [7.8, 4.0, 0.6], [5.8, 3.0, 1.15], [3.9, 2.0, 1.6], [2.1, 1.05, 1.95]], rot = -12 * RAD;   // [half length, half width, shift east]
  return rings.map(([a, b, dx]) => Array.from({ length: 49 }, (_, k) => { const u = k / 48 * 2 * Math.PI, sq = Math.sign(Math.cos(u)) * Math.abs(Math.cos(u)) ** 0.85;
    const x = a * sq + dx, y = b * Math.sin(u) * (1 + 0.18 * Math.cos(u));           // (a little steeper to the north)
    return [12 + x * Math.cos(rot) - y * Math.sin(rot), 15.4 + x * Math.sin(rot) + y * Math.cos(rot)]; }));
})();
const HILL_LIFT = 1.45;                                               // (3D: each ring this much higher than the one below)
function hillIconSVG(t) {
  const rings = HILL.map((r, i) => `<path d="M${r.map(([x, y]) => `${x.toFixed(2)} ${(y - i * HILL_LIFT * t).toFixed(2)}`).join('L')}Z" class="hr${i}"/>`).join('');
  const top = HILL[HILL.length - 1], cx = top.reduce((s, p) => s + p[0], 0) / top.length, cy = top.reduce((s, p) => s + p[1], 0) / top.length - (HILL.length - 1) * HILL_LIFT * t + 0.4;   // (the foot of the chapel on the hilltop)
  return `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" class="hillic"><g fill="var(--mvbg, var(--bg))" stroke="currentColor" stroke-width=".85" stroke-linejoin="round">${rings}</g>`
    + chapelSVG(cx, cy) + '</svg>';   // (the roof: a trapezoid)
}
// the chapel: white walls under the red roof (a parallelogram, as seen from the side), the little tower at its west end; (x, y): the foot of the walls
function chapelSVG(x, y) {
  const f = v => v.toFixed(2);
  return `<path class="hwall" d="M${f(x - 1.6)} ${f(y)}v-1.25h3.2v1.25z"/><path class="htower" d="M${f(x - 1.45)} ${f(y - 1.25)}v-2.1l.35-.75.35.75v2.1"/>`
    + `<path class="hroof" d="M${f(x - 1.95)} ${f(y - 1.2)}h3.9l.6-1.45h-3.9z"/>`;          // (the roof seen from the side: a parallelogram)
}
function iconAnim(el, to, svg) {                                    // an icon from the shape shown to the other (0.45 s, eased)
  const from = +(el.dataset.t ?? (to ? 0 : 1)), t0 = performance.now();
  const step = now => { const k = Math.min(1, (now - t0) / 450), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2, t = from + (to - from) * e;
    el.dataset.t = t; el.querySelector('svg').outerHTML = svg(t); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const COMPASS_SM = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" class="compic"><g fill="none" stroke="currentColor" stroke-width=".85" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 19.2 9.9 12h4.2z"/><path class="cn" d="M12 4.8 14.1 12H9.9z"/><circle cx="12" cy="12" r=".7"/></g></svg>';
const elevOn = () => M.cfg.elev !== false;
const IMG_ICON = {
  bm: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linejoin="round"><path d="M16.5 3.6A9.5 9.5 0 0 1 16.5 20.4 13 13 0 0 0 16.5 3.6z" fill="currentColor" fill-opacity=".16" stroke="none"/><circle cx="12" cy="12" r="9.5" stroke-width=".85"/><path d="M15.5 20.8L15.0 21.0L14.4 21.1L13.8 21.0L13.2 21.1L12.6 21.2L12.0 21.2L11.4 21.2M4.6 17.8L4.2 17.3L4.2 16.7L4.1 16.1L4.3 15.5L4.1 14.9L4.2 14.3L4.3 13.7L4.0 13.2L3.5 12.8L3.0 12.4L3.0 11.8L2.9 11.2L2.7 10.6M5.5 5.1L6.1 4.8L6.6 4.4L7.0 4.0L7.5 3.7M15.7 16.0L15.5 16.6L16.1 16.4L16.3 15.8L16.5 15.2L15.9 15.3L15.7 15.9M16.9 8.6L16.3 8.6L16.0 8.1L16.5 8.3L17.1 8.4L17.7 8.5L18.3 8.5L18.7 9.0L19.2 9.4L19.4 10.0L19.7 10.5L19.9 11.1L20.0 10.5L19.9 9.9L20.1 9.3L20.3 8.7L20.7 9.2L21.0 9.7L21.1 10.3L21.2 10.9L21.4 11.5L21.3 10.9L21.2 10.3M14.7 2.9L14.1 2.8L14.6 3.1L15.1 3.4L14.5 3.2L13.9 3.5L13.4 3.7L12.8 3.4L12.2 3.4L11.6 3.6L11.1 3.9L11.3 4.5L11.9 4.3L12.1 3.7L12.5 4.2L12.1 4.6L11.5 4.8L11.0 4.5L10.6 4.9L10.1 5.2L9.5 5.4L9.5 6.0L8.9 6.0L8.4 6.5L8.9 6.9L9.4 6.7L9.9 6.3L10.5 6.1L11.0 6.3L11.5 6.7L11.2 6.1L11.8 6.2L12.1 6.7L12.6 6.4L13.0 6.0L13.6 6.0L14.1 5.6L14.4 6.1L13.9 6.3L13.3 6.4L12.8 6.8L13.3 7.1L14.0 7.0L14.1 7.6L13.5 7.7L12.8 7.7L12.3 7.6L11.8 7.9L11.2 7.6L10.7 7.4L10.2 7.0L9.6 7.0L9.1 7.2L8.5 7.3L8.0 7.6L7.6 8.1L7.1 8.5L6.8 9.0L6.7 9.6L6.5 10.2L6.6 10.8L6.9 11.3L7.3 11.8L7.9 11.9L8.5 11.9L9.1 11.7L9.6 12.0L10.2 12.2L10.3 12.8L10.4 13.4L10.8 13.9L10.9 14.5L10.8 15.1L10.7 15.7L11.1 16.2L11.2 16.8L11.5 17.4L11.8 17.9L12.4 18.0L13.0 17.9L13.5 17.6L13.9 17.1L14.3 16.6L14.3 16.0L14.8 15.6L15.2 15.2L15.3 14.6L15.1 14.0L15.2 13.4L15.6 12.9L16.0 12.4L16.4 12.0L16.7 11.4L16.8 10.8L16.2 10.9L15.6 10.9L15.3 10.3L14.9 9.9L14.6 9.3L14.3 8.8L14.0 8.3L14.5 8.6L14.9 9.1L15.2 9.6L15.5 10.1L15.8 10.7L16.3 10.4L16.9 10.1L17.3 9.7L17.6 9.2L17.2 8.7M10.9 2.7L10.3 2.7L9.7 2.8L9.2 3.1L8.6 3.3L8.1 3.6L8.7 3.6L9.2 3.4L9.8 3.2L10.4 3.0L11.0 2.8" stroke-width=".6"/></g></svg>',   // (the whole earth, Africa in the middle, the night side shaded)
  s2: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width=".85" stroke-linejoin="round" stroke-linecap="round"><path d="M10.6 3.2h2.8v3h-2.8z"/><path d="M5.2 3.9h4.6v1.6H5.2zM14.2 3.9h4.6v1.6h-4.6zM7.5 3.9v1.6M16.5 3.9v1.6" stroke-width=".7"/><path d="M11 6.2 5 20.5M13 6.2l6 14.3" stroke-dasharray="1 1.2" stroke-width=".7"/><path d="M3 20.5h18M6.2 17.6h11.6" /><path d="M8.6 17.6l-1 2.9M12 17.6v2.9M15.4 17.6l1 2.9" stroke-width=".6"/></g></svg>',
  esri: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width=".85" stroke-linejoin="round" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M3 9.5h7l2.5 3.5H21M10 3v6.5M12.5 13v8M16 13l-1.5-10" stroke-width=".7"/><path d="M5 12.5h3v2.3H5zM5.6 12.5l.9-1 .9 1M17 15.8h2.4v2.2H17zM17.4 15.8l.8-.9.8.9M14.6 17.5h1.4" stroke-width=".6"/><path d="M5 17.5c1.5-.6 3-.6 4.6 0M5 19.2c1.5-.6 3-.6 4.6 0" stroke-width=".5"/></g></svg>',
};
// the menu: three buttons (globe or flat, 3D, compass), the map, elevation, rivers and lakes – no folds
function mapOptsHTML() {
  const c = M.cfg, glb = viewOn('globe'), t3 = viewOn('t3d') && elevOn(), can3 = elevOn() && !!M.rel, on = isOnline(), k = imgKind();
  const ib = (id, on, svg, lbl, dis = false) => `<button type="button" class="mvb${on ? ' on' : ''}" id="${id}" aria-pressed="${on}" title="${lbl}" aria-label="${lbl}"${dis ? ' disabled' : ''} data-t="${id === 'mapProjBtn' ? (glb ? 0 : 1) : id === 'map3dBtn' ? (t3 ? 1 : 0) : ''}">${svg}</button>`;
  const sw = (key, l, val, dis) => `<label class="mrow${dis ? ' dis' : ''}"><span>${l}</span>${SW(`data-mopt="${key}"${dis ? ' disabled' : ''}`, val)}</label>`;
  const sel = (key, opts, cur) => `<select class="msel" data-mcfgsel="${key}">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  let ver = '';
  if (k === 's2') { const vs = s2Versions(); ver = sel('s2v', vs, (vs.find(x => x[0] === c.s2v) || vs[vs.length - 1])[0]); }
  if (k === 'esri') { const wb = waybackVersions(); ver = sel('esriv', [['cur', 'Current' + (M.esriKey ? '' : ' (needs a key)')], ...wb.map(([n, d]) => [n, d])], c.esriv || (M.esriKey ? 'cur' : wb[0]?.[0] || 'cur')); }
  return `<div class="mvrow">${ib('mapProjBtn', true, projIconSVG(glb ? 0 : 1), glb ? 'Globe' : 'Flat map')}${ib('map3dBtn', t3, hillIconSVG(t3 ? 1 : 0), '3D terrain', !can3)}${ib('mapCompBtn', c.compass !== false, COMPASS_SM, 'Compass')}</div>`
    + `<div class="mimg" role="group" aria-label="Map">${[['bm', 'Blue Marble'], ['s2', 'Sentinel-2'], ['esri', 'Esri']].map(([v, l]) => `<button type="button" data-mcfg="img" data-mv="${v}" class="mib${k === v ? ' on' : ''}" aria-pressed="${k === v}"${v !== 'bm' && !on ? ' disabled' : ''}>${IMG_ICON[v]}<small>${l}</small></button>`).join('')}</div>`
    + (ver ? `<div class="mrow msub"><span>${k === 's2' ? 'Year' : 'Version'}</span>${ver}</div>` : '')
    + (t3 ? `<label class="mrow msub"><span>Height <output id="exagOut">×${(c.exag || 1.5).toFixed(1)}</output></span><input type="range" min="1" max="3" step="0.1" value="${c.exag || 1.5}" data-exag="1" aria-label="Height exaggeration"></label>` : '')
    + sw('elev', 'Elevation', elevOn(), false) + sw('relShade', 'Shading', relOn('relShade'), !elevOn()) + sw('relContours', 'Contour lines', relOn('relContours'), !elevOn())
    + `<label class="mrow msub${!elevOn() || !relOn('relContours') ? ' dis' : ''}"><span>Spacing</span><span class="mrng"><small>close</small><input type="range" min="4" max="24" step="1" value="${c.relSpacing || 9}" data-cspace="1" aria-label="Spacing of the contour lines"${!elevOn() || !relOn('relContours') ? ' disabled' : ''}><small>wide</small></span></label>`
    + `<button type="button" class="mrsave" id="mapSaveBtn"${on || M.rsJob ? '' : ' disabled'}>${M.rsJob ? `Saving ${esc(M.rsJob.a.name)} … ${Math.round(M.rsJob.done / M.rsJob.a.total * 100)} %` : 'Save this area for offline use …'}</button>`
    + sw('rivlak', 'Rivers and lakes', c.rivers !== false, false);
}
function mapOptsPop() { rightPop('mapopts', 'Globe', mapOptsHTML()); }
async function mapOptsClick(b) {
  const d = b.dataset;
  if (b.id === 'mapOptsBtn') { mapOptsPop(); return true; }
  // the icon turns at once; the map follows a frame later (its change can hold the page for a moment)
  if (b.id === 'mapProjBtn') { const on = !viewOn('globe'); iconAnim(b, on ? 0 : 1, projIconSVG); b.title = on ? 'Globe' : 'Flat map'; b.setAttribute('aria-label', b.title);
    requestAnimationFrame(() => setTimeout(() => viewToggle('globe'), 0)); return true; }
  if (b.id === 'map3dBtn') { const on = !viewOn('t3d'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); iconAnim(b, on ? 1 : 0, hillIconSVG);
    requestAnimationFrame(() => setTimeout(() => viewToggle('t3d'), 0)); setTimeout(refreshLayersPop, 520); return true; }   // (then the menu shows or hides the height slider)
  if (b.id === 'mapCompBtn') { M.cfg.compass = M.cfg.compass === false; await saveMapCfg(); b.classList.toggle('on', M.cfg.compass); b.setAttribute('aria-pressed', M.cfg.compass); compassUpd(); return true; }
  if (b.id === 'mapNorth' || d.mnorth) { M.map?.easeTo({ bearing: 0, duration: 500 }); return true; }
  if (b.id === 'mapSunBtn') { await sdOpen(!M.sdOpen); return true; }
  if (d.sunfmt) { M.cfg.sunFmt = d.sunfmt; await saveMapCfg(); $('#sunCtl').innerHTML = sdCtlHTML(); sundialPaint(); return true; }
  // (Day and Year chosen start paused, at the moment shown – the play button sets them going – v381)
  if (d.sunmode) { const run = d.sunmode === 'anim' || d.sunmode === 'year'; M.sunPause = run; if (run) { M.cfg.sunPaused = true; M.cfg.sunPausedT = sunTime(); } else { delete M.cfg.sunPaused; delete M.cfg.sunPausedT; } if (d.sunmode === 'now') M.sunT = Date.now(); await sunSet({ sunMode: d.sunmode }); $('#sunCtl').innerHTML = sdCtlHTML(); return true; }
  if (d.sunsw2) { await sunSet({ sun: !sunOn() }); const c = $('#sunCtl'); if (c) c.innerHTML = sdCtlHTML(); sundialPaint(); return true; }
  if (d.sunplay) { M.sunPause = !M.sunPause; M.cfg.sunPaused = M.sunPause; if (M.sunPause) M.cfg.sunPausedT = sunTime(); else delete M.cfg.sunPausedT; saveMapCfg(); sunClock(); $('#sunCtl').innerHTML = sdCtlHTML(); return true; }
  return false;
}
// the compass: shown while the map is turned, pointing north
function compassUpd() {
  const b = $('#mapNorth'); if (!b || !M.map) return;
  const br = M.map.getBearing(); b.hidden = M.cfg.compass === false; b.querySelector('svg').style.transform = `rotate(${-br}deg)`;   // (always shown, unless switched off)
}

// the switches of the Globe menu
document.addEventListener('change', async ev => {
  const k = ev.target.dataset?.mopt; if (!k) return;
  await mapCfg(); const v = ev.target.checked;
  if (k === 'rivlak') { M.cfg.rivers = M.cfg.lakes = v; await saveMapCfg(); if (v && isOnline() && M.map && !M.map.getSource('osm')) { M.map.setStyle(mapStyle(M.colors)); M.map.once('styledata', () => setTimeout(refreshMapData, 50)); } else applyLayers(); return; }
  M.cfg[k] = v; await saveMapCfg();
  if (k === 'relContours') { applyLayers(); refreshLayersPop(); return; }
  if (k === 'elev') { if (!v && viewOn('t3d')) M.map?.setTerrain(null); if (M.map) { M.map.setStyle(mapStyle(M.colors)); M.map.once('styledata', () => setTimeout(refreshMapData, 50)); } refreshLayersPop(); return; }
  applyLayers();
});
// (a paused animation keeps the moment it shows when the app is left – also after the dial's hand was moved meanwhile – v370)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && M.sunPause && M.cfg?.sunPaused) { M.cfg.sunPausedT = sunTime(); saveMapCfg(); } });

// (the panel laid out anew when the window changes its size)
addEventListener('resize', () => { if (M.sdOpen) requestAnimationFrame(sundialPaint); });

// ================================================================ the hemispherical sundial (v376)
// After the dial from Ai Khanoum (Bactria, 3rd–2nd c. BC): a limestone block on a low ledge, a sphere cut into its top and front –
// the front face standing just so far forward of the centre that the bowl catches the shadow at every hour of every day of the
// year at the latitude it is laid out for (a quarter sphere and a little more in the south of Europe, nearly a half towards the
// poles); a bronze rod reaching from a notch in the rim to the sphere's centre; at
// the sides two pillars with carved stems and lions' paws, drawn but casting no shadow on the bowl. The tip's shadow falls on the
// bowl opposite the sun – the sky turned inside out. Engraved: 11 lines dividing the daylight into 12 seasonal hours, and the
// curves of the winter solstice, the equinoxes and the summer solstice – laid out for the latitude of the place the dial refers
// to (533a–537a). On the southern half of the earth it faces the other way: always seen from the equator's side, its back to
// the raised pole. Drawn by tracing rays through a small model (in its own frame: x to the right, y towards the raised pole,
// z up; the sphere's radius 1, its centre the rod's tip), seen from the front, a little from above. The shapes are worked out
// once for each size and latitude; each time only the light: the sun (or at night the moon), the bowl's shade, the rod's shadow.
// (v377: the stone itself only a half-bowl – the outer shell RO, cut flat at the top and the front; no ledge, no pillars – 543)
const SCA = { X0: 1.3, Y0: 1.15, Z0: 1.28, ZF: 1.04, PW: 0.3, ZP: 0.28, rod: 0.022, shape: 'shell', ledge: false, pillars: false, el: 24, RO: 1.15, base: 'drum' };   // (base: the stone going on below the bowl as a drum, cut flat at the front – 550a, v380)
// how far in front of the centre the front face stands, for a latitude: the sun's farthest reach towards the raised pole – at
// sunrise in midsummer (sin 23.4° / cos φ), a little more for good measure; beyond the polar circles nearly the whole half
const scaFront = alat => Math.min(0.97, Math.sin(24.4 * RAD) / Math.cos(Math.min(89, alat) * RAD) + 0.04);
function scaBoxes(yc = 0.5) {
  const { X0, Y0, Z0, ZF, PW, ZP } = SCA, yl = SCA.ledge ? -1.25 : -yc, o = { U: [-X0, -yc, SCA.ledge ? -ZF : -Z0, X0, Y0, 0] };
  if (SCA.ledge) o.F = [-X0, yl, -Z0, X0, Y0, -ZF];
  if (SCA.pillars) { o.L = [-X0 - PW, yl, -Z0, -X0, Y0, ZP]; o.R = [X0, yl, -Z0, X0 + PW, Y0, ZP]; }
  if (SCA.shape === 'shell') return { U: [-SCA.RO, -yc, -SCA.RO, SCA.RO, SCA.RO, 0] };
  return o;
}
function scaBox(o, d, b) {                                            // the slab test: [enter, leave, the face's normal] or null
  let t0 = -1e9, t1 = 1e9, n = null;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) { if (o[a] < b[a] || o[a] > b[a + 3]) return null; continue; }
    let u = (b[a] - o[a]) / d[a], v = (b[a + 3] - o[a]) / d[a]; if (u > v) { const w = u; u = v; v = w; }
    if (u > t0) { t0 = u; n = [0, 0, 0]; n[a] = -Math.sign(d[a]); }
    if (v < t1) t1 = v; if (t0 > t1) return null;
  }
  return t1 > 1e-6 ? [t0, t1, n] : null;
}
function scaSphere(o, d) {                                            // the sphere of radius 1 about the centre: [in, out] or null
  const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2], c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - 1, D = b * b - c;
  if (D <= 0) return null; const q = Math.sqrt(D); return [-b - q, -b + q];
}
// the nearest stone along a ray: { t, n, m } (m: 1 the block's faces, 2 the bowl, 3 the base, 4 the pillars) or null
function scaHit(o, d, yc) {
  const X = scaBoxes(yc); let best = null;
  const take = (t, n, m) => { if (t > 1e-5 && (!best || t < best.t)) best = { t, n, m }; };
  let b = scaBox(o, d, X.U);
  if (b && SCA.shape === 'shell') {                                   // (a stone half-shell: the outer sphere, cut flat at the top and the front)
    const R2 = SCA.RO * SCA.RO, bb = o[0] * d[0] + o[1] * d[1] + o[2] * d[2], cc = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - R2, D = bb * bb - cc;
    if (D <= 0) b = null; else { const q = Math.sqrt(D), u0 = -bb - q, u1 = -bb + q;
      if (u0 > b[0]) { const p = [o[0] + d[0] * u0, o[1] + d[1] * u0, o[2] + d[2] * u0]; b = [u0, b[1], p.map(v => v / SCA.RO)]; }
      b[1] = Math.min(b[1], u1); if (b[0] >= b[1]) b = null; } }
  if (b) { const t0 = b[0], t1 = b[1], s = scaSphere(o, d), te = Math.max(t0, 0);
    if (!(s && s[0] < te && te < s[1])) take(t0, b[2], 1);
    else if (s[1] < t1) { const p = [o[0] + d[0] * s[1], o[1] + d[1] * s[1], o[2] + d[2] * s[1]]; take(s[1], [-p[0], -p[1], -p[2]], 2); } }
  for (const [k, m] of [['F', 3], ['L', 4], ['R', 4]]) { if (!X[k]) continue; const h = scaBox(o, d, X[k]); if (h) take(h[0], h[2], m); }
  // (the stone below the bowl, reaching down out of the picture: a drum or a square block – both cut flat at the front like the bowl,
  // nothing of them inside the bowl – or a foot narrowing to a stem)
  if (SCA.base) { const stem = SCA.base === 'stem', R = stem ? 0.62 : SCA.RO, zt = stem ? -1.09 : 0, yf = stem ? -9 : -yc;   // (the drum up to the rim: no step where it met the bowl – v382)
    const ok = (t, n) => { const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t]; if (p[2] > zt + 1e-6 || p[2] < -6 || p[1] < yf - 1e-6) return;
      if (SCA.base === 'block' ? (Math.abs(p[0]) > R + 1e-6 || p[1] > R + 1e-6) : p[0] * p[0] + p[1] * p[1] > R * R + 1e-6) return;
      if (p[0] * p[0] + p[1] * p[1] + p[2] * p[2] < 1 - 1e-6) return; take(t, n, 1); };
    if (SCA.base === 'block') { const h = scaBox(o, d, [-R, yf, -6, R, R, zt]); if (h) ok(h[0], h[2]); }
    else { const a = d[0] * d[0] + d[1] * d[1], bq = o[0] * d[0] + o[1] * d[1], cq = o[0] * o[0] + o[1] * o[1] - R * R, D = bq * bq - a * cq;
      if (a > 1e-12 && D > 0) { const t = (-bq - Math.sqrt(D)) / a; ok(t, norm3([o[0] + d[0] * t, o[1] + d[1] * t, 0])); } }
    if (Math.abs(d[2]) > 1e-12) { const t = (zt - o[2]) / d[2]; ok(t, [0, 0, 1]); }                          // (its top, around the bowl)
    if (!stem && Math.abs(d[1]) > 1e-12) { const t = (yf - o[1]) / d[1]; ok(t, [0, -1, 0]); } }            // (its flat front)
  return best;
}
// the camera: from the front (the equator's side), a little from above; the picture fitted to the stone
// (v377: the elevation as asked; the rim's widest points – left and right at the top – pinned to the middle of the picture's left and
// right edges, so that the bowl's widest line lies on the ring's, whatever the elevation – 545)
function scaCam(w, h, elD = SCA.el) {
  const el = elD * RAD, T = [0, 0.12, -0.5], E = [0, T[1] - 7 * Math.cos(el), T[2] + 7 * Math.sin(el)], f = norm3([T[0] - E[0], T[1] - E[1], T[2] - E[2]]), r = norm3([f[1], -f[0], 0]), u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const X = scaBoxes(), pts = []; for (const b of Object.values(X)) for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) pts.push([x, y, z]);
  const pr = p => { const v = [p[0] - E[0], p[1] - E[1], p[2] - E[2]], z = v[0] * f[0] + v[1] * f[1] + v[2] * f[2]; return [(v[0] * r[0] + v[1] * r[1] + v[2] * r[2]) / z, (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / z]; };
  const q = pts.map(pr), x0 = Math.min(...q.map(a => a[0])), x1 = Math.max(...q.map(a => a[0])), y0 = Math.min(...q.map(a => a[1])), y1 = Math.max(...q.map(a => a[1]));
  let S = Math.min(w * 0.98 / (x1 - x0), h * 0.98 / (y1 - y0)), cx = w / 2 - S * (x0 + x1) / 2, cy = h / 2 + S * (y0 + y1) / 2;
  if (SCA.shape === 'shell') { const a = pr([SCA.RO, 0, 0]); S = (w / 2) / a[0]; cx = w / 2; cy = h / 2 + S * a[1]; }
  return { E, f, r, u, S, cx, cy, toScr: p => { const a = pr(p); return [cx + S * a[0], cy - S * a[1]]; },
    ray: (px, py) => norm3([f[0] + r[0] * (px - cx) / S - u[0] * (py - cy) / S, f[1] + r[1] * (px - cx) / S - u[1] * (py - cy) / S, f[2] + r[2] * (px - cx) / S - u[2] * (py - cy) / S]) };
}
function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
// the shapes, once for each size and latitude: for every pixel its point, normal, kind of stone and grain
function scaGeo(w, h, alat, el) {
  const C = scaCam(w, h, el), yc = scaFront(alat), n = w * h, P = new Float32Array(n * 3), N = new Float32Array(n * 3), Mt = new Uint8Array(n), G = new Float32Array(n), Dp = new Float32Array(n).fill(1e9);
  const hsh = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = C.ray(x + 0.5, y + 0.5), hit = scaHit(C.E, d, yc), i = y * w + x; if (!hit) continue;
    const p = [C.E[0] + d[0] * hit.t, C.E[1] + d[1] * hit.t, C.E[2] + d[2] * hit.t];
    P.set(p, i * 3); N.set(hit.n, i * 3); Mt[i] = hit.m; Dp[i] = hit.t;
    G[i] = scaStone(p);
  }
  return { w, h, alat, el, yc, C, P, N, Mt, G, Dp };
}
// a direction in the sky (true: x east, y north, z up) in the dial's frame (turned round on the southern half of the earth)
const scaLoc = (v, lat) => lat < 0 ? [-v[0], -v[1], v[2]] : v;
// the stone's surface: limestone – a mottling at several scales, fine pits, faint veins (a factor about 1)
function scaNoise(x, y, z) {
  const fl = Math.floor, X = fl(x), Y = fl(y), Z = fl(z), fx = x - X, fy = y - Y, fz = z - Z, sm = t => t * t * (3 - 2 * t), u = sm(fx), v = sm(fy), w = sm(fz);
  const h = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - fl(s); }, L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h(X, Y, Z), h(X + 1, Y, Z), u), L(h(X, Y + 1, Z), h(X + 1, Y + 1, Z), u), v), L(L(h(X, Y, Z + 1), h(X + 1, Y, Z + 1), u), L(h(X, Y + 1, Z + 1), h(X + 1, Y + 1, Z + 1), u), v), w);
}
function scaStone(p) {
  let f = 0, a = 0.5, k = 3; for (let o = 0; o < 4; o++) { f += a * scaNoise(p[0] * k + 11, p[1] * k + 7, p[2] * k + 3); a *= 0.5; k *= 2.3; }
  const pit = scaNoise(p[0] * 70, p[1] * 70, p[2] * 70) > 0.86 ? 0.88 : 1;
  const vein = Math.pow(1 - Math.abs(Math.sin(p[0] * 2.2 + p[2] * 1.3 + f * 5)), 22) * 0.07;
  return (0.86 + 0.2 * f) * pit - vein;
}
// the engraved lines for a latitude (degrees): polylines on the bowl (points on the unit sphere, the shadow's places)
function scaLines(lat) {
  const f = lat * RAD, at = (dec, H) => { const d = dec * RAD, sa = Math.sin(f) * Math.sin(d) + Math.cos(f) * Math.cos(d) * Math.cos(H), alt = Math.asin(sa);
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(f) - Math.tan(d) * Math.cos(f)) + Math.PI;
    return scaLoc([-Math.sin(az) * Math.cos(alt), -Math.cos(az) * Math.cos(alt), -Math.sin(alt)], lat); };   // (the shadow: opposite the sun)
  const half = dec => { const c = -Math.tan(f) * Math.tan(dec * RAD); return c <= -1 ? Math.PI : c >= 1 ? 0 : Math.acos(c); };
  const lines = [];
  for (const dec of [-23.44, 0, 23.44]) { const H0 = half(dec), L = []; if (H0 > 0) { for (let i = 0; i <= 48; i++) L.push(at(dec, -H0 + 2 * H0 * i / 48)); lines.push({ k: 'day', p: L }); } }
  for (let hr = 1; hr <= 11; hr++) { const L = []; for (let j = 0; j <= 16; j++) { const dec = -23.44 + 46.88 * j / 16, H0 = half(dec); if (H0 > 0 && H0 < Math.PI) L.push(at(dec, -H0 + 2 * H0 * hr / 12)); } lines.push({ k: hr === 6 ? 'noon' : 'hour', p: L }); }
  return lines;
}
// the picture: the light of the moment on the stone (s: towards the sun or the moon, in the true frame; kL its strength; amb the
// sky's light)
// (v381: several lights at once – the sun and the moon – each with its strength and colour, and the sky's light; nf how far into the
// night (0 day … 1 night): through the twilight everything changes gradually, nothing at one step)
function scaDraw(cv, lat, Ls, amb, ambCol, nf) {
  const w = cv.width, h = cv.height; if (!w || !h) return;
  const alat = Math.round(Math.abs(lat)), night = nf > 0.5;
  // the viewpoint (544a): from the front a little above – as steep as this latitude needs for the shadow's point to be seen at every
  // hour of the year (set by the place only, not the hour – v378)
  const el = scaTilt(alat);
  let G = cv._sca; if (!G || G.w !== w || G.h !== h || G.alat !== alat || G.el !== el) G = cv._sca = scaGeo(w, h, alat, el);
  const x = cv.getContext('2d'), img = x.createImageData(w, h), D = img.data, { P, N, Mt, G: gr, yc } = G;
  const A = [0, 1, 0.012], Bc = [0, 0, 0], base = { 1: [0.86, 0.82, 0.72], 2: [0.9, 0.86, 0.76], 3: [0.76, 0.72, 0.63], 4: [0.8, 0.76, 0.66] };
  // the lights in the dial's frame; the moon's taken from several points of its disc and beyond: soft, faint shadows
  const lights = Ls.map(L => { const s = scaLoc(L.s, lat);
    const jit = L.moon ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => { const e1 = norm3([s[1], -s[0], 0]), e2 = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], k = 0.035; return norm3([s[0] + k * (a * e1[0] + b * e2[0]), s[1] + k * (a * e1[1] + b * e2[1]), s[2] + k * (a * e1[2] + b * e2[2])]); }) : [s];
    return { s, jit, k: L.k, col: L.col, moon: !!L.moon }; }).filter(L => L.s[2] > 0 && L.k > 0.002);
  // (the shortest distance between the ray towards the light and the rod: in its shadow when closer than its thickness)
  const ab = [Bc[0] - A[0], Bc[1] - A[1], Bc[2] - A[2]], abl = Math.hypot(...ab);
  const rodShade = (p, s) => { const w0 = [p[0] - A[0], p[1] - A[1], p[2] - A[2]], b = (s[0] * ab[0] + s[1] * ab[1] + s[2] * ab[2]) / abl,
      d = s[0] * w0[0] + s[1] * w0[1] + s[2] * w0[2], e = (ab[0] * w0[0] + ab[1] * w0[1] + ab[2] * w0[2]) / abl, den = 1 - b * b;
    let t = den > 1e-9 ? (b * e - d) / den : 0, u = den > 1e-9 ? (e - b * d) / den : e; if (t < 0) { t = 0; u = e; } u = Math.max(0, Math.min(abl, u));
    const q = [p[0] + s[0] * t - (A[0] + ab[0] / abl * u), p[1] + s[1] * t - (A[1] + ab[1] / abl * u), p[2] + s[2] * t - (A[2] + ab[2] / abl * u)];
    return Math.hypot(...q) < SCA.rod; };
  for (let i = 0, n = w * h; i < n; i++) {
    const m = Mt[i]; if (!m) continue;
    const p = [P[3 * i], P[3 * i + 1], P[3 * i + 2]], nn = [N[3 * i], N[3 * i + 1], N[3 * i + 2]];
    let r = amb * ambCol[0], g = amb * ambCol[1], bl = amb * ambCol[2], gls = 0;
    for (const L of lights) { const s = L.s, lam = Math.max(0, nn[0] * s[0] + nn[1] * s[1] + nn[2] * s[2]); if (lam <= 0) continue;
      let vis = 0;
      for (const sj of L.jit) { let ok = true;
        // (the bowl: lit where the light comes in through the opening – the ray leaves the sphere above the top or in front of the face)
        if (m === 2) { const sp = scaSphere(p, sj); if (sp) { const t = sp[1]; if (p[2] + sj[2] * t < -1e-3 && p[1] + sj[1] * t > -yc + 1e-3) ok = false; } if (ok && rodShade(p, sj)) ok = false; }
        if (ok) vis++; }
      vis /= L.jit.length; if (L.moon) vis = 0.45 + 0.55 * vis;          // (by moonlight the shadow only half as dark)
      const e = L.k * lam * vis * 1.05; r += e * L.col[0]; g += e * L.col[1]; bl += e * L.col[2];
      // (the moon's sheen: a soft highlight where the stone faces between the moon and the eye)
      if (L.moon) { const v = norm3([G.C.E[0] - p[0], G.C.E[1] - p[1], G.C.E[2] - p[2]]), hv = norm3([v[0] + s[0], v[1] + s[1], v[2] + s[2]]); gls += Math.pow(Math.max(0, nn[0] * hv[0] + nn[1] * hv[1] + nn[2] * hv[2]), 18) * 0.5 * L.k * vis; } }
    const q = gr[i], b = base[m];
    D[4 * i] = Math.min(255, 255 * (b[0] * r * q + gls * 0.8)); D[4 * i + 1] = Math.min(255, 255 * (b[1] * g * q + gls * 0.86)); D[4 * i + 2] = Math.min(255, 255 * (b[2] * bl * q + gls)); D[4 * i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  // the engraved lines, where the bowl is seen (each piece checked against the picture's depth)
  const lw = Math.max(0.6, w / 260); x.lineCap = 'round';
  for (const L of (G.lines?.lat === lat ? G.lines.v : (G.lines = { lat, v: scaLines(lat) }).v)) {
    x.strokeStyle = L.k === 'hour' ? 'rgba(70,58,40,.55)' : 'rgba(70,58,40,.75)'; x.lineWidth = L.k === 'hour' ? lw : lw * 1.3; x.beginPath(); let on = false;
    for (const p of L.p) { const seen = p[2] < -0.005 && scaSeen(G, p); if (!seen) { on = false; continue; } const q = G.C.toScr(p); x[on ? 'lineTo' : 'moveTo'](q[0], q[1]); on = true; }
    x.stroke(); }
  if (SCA.pillars) // the pillars' carving on their fronts: a stem winding up, with leaves; at the foot a lion's paw (light and dark edges, as in relief)
  { const { X0, Z0, PW, ZP } = SCA, yf = -1.25, ink = night ? 'rgba(30,26,22,.5)' : 'rgba(70,56,38,.5)', hi = night ? 'rgba(200,210,230,.18)' : 'rgba(255,246,220,.45)';
    const lw2 = Math.max(0.6, w / 300);
    for (const sd of [-1, 1]) { const xc = sd * (X0 + PW / 2), stem = []; for (let i = 0; i <= 40; i++) { const z = -Z0 + 0.3 + (ZP - 0.08 + Z0 - 0.3) * i / 40; stem.push([xc + 0.07 * Math.sin(z * 8.5), yf, z]); }
      for (const [col, off] of [[hi, -0.6], [ink, 0.6]]) { x.strokeStyle = col; x.lineWidth = lw2; x.beginPath(); stem.forEach((p, i) => { const q = G.C.toScr(p); x[i ? 'lineTo' : 'moveTo'](q[0] + off * lw2, q[1] + off * lw2); }); x.stroke();
        for (let i = 4; i < 40; i += 6) { const p = stem[i], dir = Math.sin(p[2] * 8.5 + 1.6) > 0 ? 1 : -1, q0 = G.C.toScr(p), q1 = G.C.toScr([p[0] + dir * 0.085, yf, p[2] + 0.06]);
          x.beginPath(); x.moveTo(q0[0] + off * lw2, q0[1] + off * lw2); x.quadraticCurveTo((q0[0] + q1[0]) / 2 + off * lw2, q1[1] + off * lw2 - lw2 * 2, q1[0] + off * lw2, q1[1] + off * lw2); x.stroke(); } }
      x.fillStyle = night ? 'rgba(60,62,70,.55)' : 'rgba(120,104,78,.55)';
      for (let tI = -1; tI <= 1; tI++) { const q = G.C.toScr([xc + tI * PW * 0.27, yf, -Z0 + 0.09]), r = Math.max(1, PW * 0.12 * G.C.S / Math.hypot(G.C.E[1] - yf, G.C.E[2] + Z0)); x.beginPath(); x.ellipse(q[0], q[1], r, r * 0.8, 0, 0, 7); x.fill(); } } }
  // the rod, bronze
  const a = G.C.toScr(A), c = G.C.toScr(Bc); x.strokeStyle = `rgb(${Math.round(75 - 33 * nf)},${Math.round(58 - 22 * nf)},${Math.round(32 - 8 * nf)})`; x.lineWidth = Math.max(1, w / 110); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(c[0], c[1]); x.stroke();
  x.strokeStyle = 'rgba(255,220,150,.35)'; x.lineWidth = Math.max(0.5, w / 330); x.beginPath(); x.moveTo(a[0], a[1] - x.lineWidth); x.lineTo(c[0], c[1] - x.lineWidth); x.stroke();
}
// the elevation to look from, for a latitude: the lowest of 24°, 30° … 84° from which the shadow's point is in sight at every hour
// of every day of the year – wherever it falls on the lit part of the bowl (in the rim's own shade it cannot be read anyway)
const SCA_TILT = new Map();
function scaTilt(alat) {
  if (SCA_TILT.has(alat)) return SCA_TILT.get(alat);
  const f = alat * RAD, yc = scaFront(alat), pts = [];
  for (let dec = -23.44; dec <= 23.45; dec += 23.44 / 5) {
    const c = -Math.tan(f) * Math.tan(dec * RAD), H0 = c <= -1 ? Math.PI : c >= 1 ? 0 : Math.acos(c);
    for (let k = 0; k <= 24; k++) { const H = -H0 + 2 * H0 * k / 24, d = dec * RAD, alt = Math.asin(Math.sin(f) * Math.sin(d) + Math.cos(f) * Math.cos(d) * Math.cos(H)); if (alt < 2 * RAD) continue;
      const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(f) - Math.tan(d) * Math.cos(f)) + Math.PI, sv = [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)], p = sv.map(v => -v);
      const sp = scaSphere(p, sv); if (sp) { const t = sp[1]; if (p[2] + sv[2] * t < -1e-3 && p[1] + sv[1] * t > -yc + 1e-3) continue; }   // (in the rim's shade)
      pts.push(p); } }
  let best = 84;
  for (let el = 24; el <= 84; el += 6) { const C = scaCam(64, 64, el);
    if (pts.every(sh => { const d = norm3([sh[0] - C.E[0], sh[1] - C.E[1], sh[2] - C.E[2]]), hit = scaHit(C.E, d, yc), dist = Math.hypot(sh[0] - C.E[0], sh[1] - C.E[1], sh[2] - C.E[2]); return hit && hit.m === 2 && Math.abs(hit.t - dist) < 0.03; })) { best = el; break; } }
  SCA_TILT.set(alat, best); return best;
}
function scaSeen(G, p) {                                              // a point of the bowl not hidden from the eye
  const q = G.C.toScr(p), xi = Math.floor(q[0]), yi = Math.floor(q[1]); if (xi < 0 || yi < 0 || xi >= G.w || yi >= G.h) return false;
  const i = yi * G.w + xi, dist = Math.hypot(p[0] - G.C.E[0], p[1] - G.C.E[1], p[2] - G.C.E[2]); return G.Mt[i] === 2 && Math.abs(G.Dp[i] - dist) < 0.08;
}
// the light of the moment for the place the dial shows: the sun by day; the moon, fainter and bluer, when the sun is down
function scaLight() {
  const r = sunRef(), t = sunTime(), sa = sunAt(sunPos(t), r.lng, r.lat), dir = (az, alt) => [Math.sin(az * RAD) * Math.cos(alt * RAD), Math.cos(az * RAD) * Math.cos(alt * RAD), Math.sin(alt * RAD)];
  const sm = (a, b, v) => { const u = Math.max(0, Math.min(1, (v - a) / (b - a))); return u * u * (3 - 2 * u); };
  // through the twilight (the sun from 2° above to 8° below the horizon) the day's light gives way to the night's gradually (v381)
  const day = sm(-8, 2, sa.alt), silver = [0.8, 0.86, 1.0], Ls = [];
  // (the sunlight's colour as the sun's own in the sky: red, rose, gold low down, nearly white high up – v378)
  const tc = sunTint(sa.alt, sa.az < 180), u = sm(4, 24, sa.alt), lc = [1, 0.97, 0.9].map((v, i) => +(v * u + (0.25 + 0.75 * tc[i] / 255) * (1 - u)).toFixed(3));
  if (sa.alt > -2) Ls.push({ s: dir(sa.az, sa.alt), k: 0.95 * sm(-2, 6, sa.alt), col: lc });
  const mo = moonPos(t), ma = sunAt(mo, r.lng, r.lat);
  if (ma.alt > 0 && day < 1) Ls.push({ s: dir(ma.az, ma.alt), k: 0.35 * mo.lit * (1 - day), col: silver, moon: true });
  const amb = 0.1 + 0.12 * sm(-12, -1, sa.alt) + 0.25 * sm(-6, 20, sa.alt), ambCol = silver.map((v, i) => +(v + (lc[i] - v) * day).toFixed(3));
  return { lat: Math.round(r.lat * 2) / 2, Ls, amb, ambCol, nf: 1 - day };
}
function scaPaint(cv) {
  if (!cv) return; const L = scaLight(), key = JSON.stringify([cv.width, cv.height, L.lat, L.Ls.map(l => [l.s.map(v => v.toFixed(3)), l.k.toFixed(3), l.col]), L.amb.toFixed(3), L.ambCol, L.nf.toFixed(2)]);
  if (cv._key === key) return; cv._key = key; scaDraw(cv, L.lat, L.Ls, L.amb, L.ambCol, L.nf);
}
