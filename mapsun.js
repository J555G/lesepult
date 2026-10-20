// ================================================================ Pult · the map menu, the sun, the projection icon (v297)
// The map menu (button at the top right): base map and imagery, relief, the view (globe or flat, 3D, north up) and
// sunlight. The other button beside it (Layers) keeps places, political, built world, names and your own drawings.
// Sunlight: day and night on the map – the night side darkened smoothly through twilight (from sunset to the sun 18°
// below the horizon, as wide as it really is at each place and season), and the relief lit from where the sun stands over the middle of the map. “Now” follows the real
// sun; “Animate” lets the days run (one day in 5 s … 60 s), “Year” the year (in 7 s … 77 s, the hour kept); the sundial sets the hour
// by hand, the zodiac wheel beside it the day of the year.
// Settings (mapCfg): sun, sunMode ('now' | 'anim' | 'year' | 'set'), sunSpeed (seconds per day), sunYear (seconds per year),
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
  if (!M.nCv) { M.nCv = document.createElement('canvas'); M.nCv.width = NW; M.nCv.height = NH;
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
  nightPaint(sunTime()); st.sources.sunnight = { type: 'canvas', canvas: nightCanvas(), animate: false, coordinates: [[-180, NLAT], [180, NLAT], [180, -NLAT], [-180, -NLAT]] };
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
function sdRefUpd() {
  const mk = $('#sdMark'), m = M.map; if (!mk || !m) return;
  mk.hidden = !!M.cfg.gnomon; if (M.cfg.gnomon) return;
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
  for (let i = 0; i < 20; i++) { const a = (i + 0.5) / 20; piece((0.088 - 0.036 * a) * H, (0.08 + 0.72 * i / 20) * H, (0.08 + 0.72 * (i + 1) / 20) * H, '#6e2b3e'); }   // (the shaft, tapering in fine steps)
  for (let i = 0; i < 10; i++) { const a = (i + 0.5) / 10; piece((0.052 * (1 - a) + 0.002) * H, (0.8 + 0.2 * i / 10) * H, (0.8 + 0.2 * (i + 1) / 10) * H, '#743044'); }   // (the pointed top)
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
    const half = t => w * (1 - 0.4 * Math.min(1, t / 0.8)) * (t > 0.8 ? (1 - t) / 0.2 : 1);
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
  const n = 256, cv = document.createElement('canvas'); cv.width = cv.height = n; const x = cv.getContext('2d');
  x.fillStyle = '#6a2638'; x.fillRect(0, 0, n, n);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) { const r = rnd(); x.fillStyle = r < 0.5 ? `rgba(46,14,24,${0.25 + rnd() * 0.4})` : r < 0.85 ? `rgba(140,62,80,${0.25 + rnd() * 0.4})` : `rgba(236,214,218,${0.5 + rnd() * 0.5})`;
    const sz = r < 0.85 ? 1 + rnd() * 2.6 : 0.6 + rnd() * 1.4; x.beginPath(); x.arc(rnd() * n, rnd() * n, sz, 0, 7); x.fill(); }
  const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
}
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
      const shaft = new T.Mesh(new T.CylinderGeometry(0.052 * Math.SQRT2, 0.088 * Math.SQRT2, 0.72, 4, 1), stone);   // (a square frustum)
      shaft.rotation.y = Math.PI / 4; shaft.position.y = 0.08 + 0.36; g.add(shaft);
      const tip = new T.Mesh(new T.ConeGeometry(0.052 * Math.SQRT2, 0.2, 4, 1), stone); tip.rotation.y = Math.PI / 4; tip.position.y = 0.8 + 0.1; g.add(tip);
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
      const g = M.cfg?.gnomon, map = this.map; if (!g) return;
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
      this.r.resetState(); if (this.dr) gl.depthRange(this.dr[0], this.dr[1]); gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT); if (plane) this.r.render(this.shScene, this.cam); this.r.render(this.scene, this.cam);
    } };
}
// where the model stands on the screen: its foot and its top (for grabbing it)
function obel3dAxis() {
  const L = M.map?.getLayer('obel3d')?.implementation, cv = M.map?.getCanvas(); if (!L?.P || !cv) return null;
  const pr = y => { const v = [0, y, 0, 1], e = L.P.elements, c = [0, 1, 2, 3].map(i => e[i] * v[0] + e[4 + i] * v[1] + e[8 + i] * v[2] + e[12 + i] * v[3]);
    return c[3] > 0 ? [(c[0] / c[3] + 1) / 2 * cv.clientWidth, (1 - c[1] / c[3]) / 2 * cv.clientHeight] : null; };
  return [pr(0), pr(1)];
}
const obelShadow = () => { if (M.cfg?.gnomon && M.map?.getSource('obel') && M.obZ == null) obelUpd(); };   // (after the size slider; its size stays at every zoom)
// dragging it: a finger or the mouse on the obelisk moves it (and not the map). Caught before the map engine sees the touch
// (capture phase), with some room around the thin shape and its foot – the engine's own layer events missed it at times (v332)
function obelDragHook(m) {
  if (m._obDrag) return; m._obDrag = true;
  const box = m.getCanvasContainer(), canvas = m.getCanvas();
  const pt = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const hit = ([x, y]) => {
    const g = M.cfg?.gnomon; if (!g || !m.getLayer('obel')) return false;
    const ax = m.getLayer('obel3d') && obel3dAxis();
    if (ax?.[0] && ax[1]) { const [a, b] = ax, dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y) < Math.max(16, Math.hypot(dx, dy) * 0.1)) return true; }
    else try { if (m.queryRenderedFeatures([[x - 14, y - 14], [x + 14, y + 14]], { layers: ['obel'] }).length) return true; } catch (_) {}
    const f = m.project([g.lng, g.lat]); return Math.hypot(f.x - x, f.y - y) < 24;    // (the foot)
  };
  box.addEventListener('pointerdown', e => {
    if (M.obGrab || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || !hit(pt(e))) return;
    e.stopPropagation(); e.preventDefault(); M.obGrab = e.pointerId; M.obDrag = true;
    try { box.setPointerCapture(e.pointerId); } catch (_) {}
    box.style.cursor = 'grabbing';
    const mv = ev => { if (ev.pointerId !== M.obGrab) return; ev.preventDefault(); const ll = m.unproject(pt(ev));
      M.cfg.gnomon = { lng: ((ll.lng + 540) % 360) - 180, lat: ll.lat, h: M.cfg.gnomon?.h }; obelUpd(); sunApply(); };
    const end = ev => { if (ev.pointerId !== M.obGrab) return; M.obGrab = null; M.obDrag = false; box.style.cursor = ''; M.obNoClick = Date.now() + 400;
      removeEventListener('pointermove', mv, true); removeEventListener('pointerup', end, true); removeEventListener('pointercancel', end, true); saveMapCfg(); };
    addEventListener('pointermove', mv, true); addEventListener('pointerup', end, true); addEventListener('pointercancel', end, true);
  }, true);
  // (the touch and mouse events that follow the same press: kept from the map, so it does not pan meanwhile)
  for (const t of ['touchstart', 'touchmove', 'mousedown', 'mousemove']) box.addEventListener(t, e => { if (M.obGrab != null) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); } }, { capture: true, passive: false });
  m.on('mousemove', e => { if (M.obGrab == null) box.style.cursor = hit([e.point.x, e.point.y]) ? 'grab' : ''; });
}
// "Here": the next tap on the map sets the obelisk; when one stands, "Here" takes it away
async function sunHere() {
  if (M.cfg.gnomon) { M.cfg.gnomon = null; await saveMapCfg(); obelUpd(); sdRefUpd(); sunApply(); $('#sunCtl') && ($('#sunCtl').innerHTML = sdCtlHTML()); return; }
  if (!M.map) return;
  note('Tap the map where the obelisk should stand.');
  $('#mapCanvas')?.classList.add('picking');
  M.pick = async ll => { M.cfg.gnomon = { lng: ((ll.lng + 540) % 360) - 180, lat: ll.lat }; await saveMapCfg(); obelUpd(); sdRefUpd(); sunApply(); const c = $('#sunCtl'); if (c) c.innerHTML = sdCtlHTML(); };
}
// ---------------------------------------------------------------- the sun and the moon in the sky (v334)
// Drawn where they truly stand as seen from the place the dial shows: tilted towards the horizon, in the sky; zoomed out, in space
// beside the globe – a direction "at infinity" projected by the map's own camera, hidden where the earth lies before it. Larger
// than true (settings: skySize, 1 … 24, 10 – v336), the moon in its real phase. Switches: skySun, skyMoon.
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
  fetch('sky/zodiac.json').then(r => r.json()).then(a => { SKY.zod = a.map(ln => ln.map(([ra, dec]) => [Math.cos(dec * RAD) * Math.cos(ra * RAD), Math.cos(dec * RAD) * Math.sin(ra * RAD), Math.sin(dec * RAD)])); M.map?.triggerRepaint(); }).catch(() => { SKY.zod = undefined; });
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
function skyHook() {
  const m = M.map; if (!m || !m.style?._loaded) return;
  if (!m.getLayer('skybodies')) m.addLayer({ id: 'skybodies', type: 'custom', renderingMode: '2d', render(gl, args) { skyDraw(args); } });
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
  const sp = y.createLinearGradient(0, 0, 0, H); sp.addColorStop(0, '#0f2a66'); sp.addColorStop(1, '#3a73bb'); y.fillStyle = sp; y.fillRect(0, 0, W, H);
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
      M.sunT = sunTime() + dt * 86400 / (M.cfg.sunSpeed || 20);       // (sunSpeed: seconds of real time per day)
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
function sunHour() {                                                 // sun time (hours), sunrise and sunset, the sun's height
  const c = sunRef(), t = sunTime(), s = sunPos(t);
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
const SD = { H: 198, cx: 92, cy: 82, R: 64, P: 50, ZR: 80, ZY: 92, ZW: 640 };   // the panel's height, the dial's centre, ring and plate radii;
                                                                    // the zodiac wheel's radius and centre height, and the least width of the panel that shows it
const sdAng = h => (h - 12) / 24 * 2 * Math.PI;                        // (clockwise, as the day goes on; noon at the top – v330)
const sdXY = (h, r) => [SD.cx + Math.sin(sdAng(h)) * r, SD.cy - Math.cos(sdAng(h)) * r];
const OWL = '<g class="sdowl"><g class="owlw"><ellipse cx="-6" cy="2" rx="4" ry="7" transform="rotate(25 -6 2)"/><ellipse cx="6" cy="2" rx="4" ry="7" transform="rotate(-25 6 2)"/></g>'
  + '<ellipse cx="0" cy="2" rx="6.5" ry="8.5" class="owlb"/><path d="M-5.5 -9-3.5-4H3.5L5.5-9 2-5.5h-4z" class="owlb"/><circle cx="-2.6" cy="-4" r="2.4" class="owle"/><circle cx="2.6" cy="-4" r="2.4" class="owle"/>'
  + '<circle cx="-2.6" cy="-4" r="1" class="owlp"/><circle cx="2.6" cy="-4" r="1" class="owlp"/><path d="M-0.9-2 0-0.4 0.9-2z" class="owlk"/><path d="M-3 10.2h2M1 10.2h2" class="owlf"/></g>';
function sdPanelHTML() {
  const stars = Array.from({ length: 46 }, (_, i) => { const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1, y = (Math.sin(i * 78.233) * 12543.21 % 1 + 1) % 1;
    return `<circle cx="${(x * 100).toFixed(1)}%" cy="${(y * 55).toFixed(1)}%" r="${(0.5 + (i % 3) * 0.35).toFixed(2)}" style="animation-delay:${(i % 7) * 0.6}s"/>`; }).join('');
  const ticks = Array.from({ length: 24 }, (_, h) => { const [a, b] = sdXY(h, h % 6 ? SD.R - 4 : SD.R - 7), [c, d] = sdXY(h, SD.R); return `<line x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${c.toFixed(1)}" y2="${d.toFixed(1)}"/>`; }).join('');
  return `<div class="msdial" id="sunPanel"><svg class="sdsvg" id="sunSvg" height="${SD.H}" aria-hidden="true"><defs>
      <linearGradient id="sdSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" id="sdSky0"/><stop offset="1" id="sdSky1"/></linearGradient>
      <linearGradient id="sdSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" id="sdSea0"/><stop offset="1" id="sdSea1"/></linearGradient>
      <filter id="sdBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.3"/></filter>
      <radialGradient id="sdGlow"><stop offset="0" stop-color="#fff6c8" stop-opacity=".95"/><stop offset=".35" stop-color="#ffd85a" stop-opacity=".55"/><stop offset="1" stop-color="#ffb030" stop-opacity="0"/></radialGradient>
      <radialGradient id="sdStone" cx=".42" cy=".38"><stop offset="0" stop-color="#e9dfc8"/><stop offset="1" stop-color="#b8aa8c"/></radialGradient>
      <clipPath id="sdAbove"><rect id="sdAboveR" x="0" y="0" width="4000" height="0"/></clipPath><clipPath id="sdBelow"><rect id="sdBelowR" x="0" y="0" width="4000" height="4000"/></clipPath></defs>
    <rect width="100%" height="100%" fill="url(#sdSky)"/><g clip-path="url(#sdAbove)"><g class="sdstars" id="sdStars">${stars}</g></g>
    <rect id="sdSeaR" x="0" width="100%" height="${SD.H}" fill="url(#sdSea)"/><path id="sdGlint" class="sdglint" d=""/>
    <circle cx="${SD.cx}" cy="${SD.cy}" r="${SD.R + 6}" class="sdrim"/><circle cx="${SD.cx}" cy="${SD.cy}" r="${SD.P}" fill="url(#sdStone)" class="sdplate"/>
    <g class="sdticks">${ticks}</g><path id="sdDay" class="sdday" d=""/>
    <line id="sdShadow" class="sdshadow" filter="url(#sdBlur)" x1="${SD.cx}" y1="${SD.cy}" x2="${SD.cx}" y2="${SD.cy}"/><path class="sdgnomon" d="M${SD.cx - 3} ${SD.cy + 3}L${SD.cx} ${SD.cy - 14}L${SD.cx + 3} ${SD.cy + 3}z"/>
    <g id="sdOwlPos" transform="translate(${SD.cx} ${SD.cy - 22})">${OWL}</g>
    <g clip-path="url(#sdAbove)"><g class="sdhpos"><circle r="22" fill="url(#sdGlow)" id="sdGlowC"/><circle r="8.5" class="sdsun"/></g></g>
    <g clip-path="url(#sdBelow)"><g class="sdhpos"><circle r="8" class="sdmoonc"/><path id="sdMoonLit" class="sdmoon" d=""/></g></g><g class="sdhpos"><circle r="16" class="sdgrab"/></g>
    ${zodWheelHTML()}
    <text id="sdLab" class="sdlab" x="${SD.cx}" y="${SD.H - 12}" text-anchor="middle"></text></svg>
    <div class="sdctl" id="sunCtl"></div><button type="button" class="sdx" id="sdSwap" data-sdswap="1"></button></div>`;
}
// the zodiac wheel: the wheel of Ptolemy's Handy Tables (Vat. gr. 1291, fol. 9r, Constantinople, early 9th c.) – the signs
// anticlockwise, as in the sky, the months, the hours, and Helios in his chariot (v350). The rings turn so that the sun's
// place stands at the top, under the pointer (turned clockwise, the year goes on); Helios in the middle stays upright.
// sky/zodiac-rings.webp: the disc, straightened, with Aries–Taurus at the top, the middle cut out; sky/zodiac-helios.webp: the
// middle, cut along the outer edge of its red ring, the gold around it see-through, the crown whole (141 of 512 – v352). A tap opens the
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
    <text id="sdZLab" class="sdlab sdzlab" y="${SD.H - 6}" text-anchor="middle"></text>`;
}
// the wheel large, over the map
function zodBigOpen() {
  if ($('#zodBig')) return;
  const d = document.createElement('div'); d.id = 'zodBig'; d.className = 'zodbig';
  d.innerHTML = `<svg viewBox="-262 -278 524 540" aria-label="The zodiac wheel">${zodDiscSVG(250, 11)}</svg><div class="zl" id="zodBigLab"></div>
    <button type="button" class="zx" aria-label="Close">✕</button>`;
  document.body.append(d); sundialPaint();
  d.addEventListener('pointerdown', ev => {
    const svg = d.querySelector('svg'), r = svg.getBoundingClientRect(), k = r.width / 524, c = { x: r.left + r.width / 2, y: r.top + 278 * k };
    if (ev.target.closest('.zx') || Math.hypot(ev.clientX - c.x, ev.clientY - c.y) > 262 * k) { d.remove(); return; }   // (outside the wheel: closed)
    zodTurn(ev, () => c);
  });
}
// a finger turning the wheel sets the day of the year (the hour kept); a tap without turning – on the small wheel – opens it large
function zodTurn(ev, centre, onTap) {
  ev.preventDefault(); ev.target.setPointerCapture?.(ev.pointerId);
  const za = e => { const c = centre(); return Math.atan2(e.clientX - c.x, -(e.clientY - c.y)) / RAD; };
  const T0 = sunTime(), e0 = sunPos(T0).ecl, x0 = ev.clientX, y0 = ev.clientY; let prev = za(ev), turn = 0, moved = false;
  const mv = e => {
    if (!moved) { if (Math.hypot(e.clientX - x0, e.clientY - y0) < 5) return; moved = true; M.sunDrag = true;
      const mode = M.cfg.sunMode || 'now'; if (mode === 'now' || mode === 'anim') { M.cfg.sunMode = 'set'; saveMapCfg(); sunClock(); const c = $('#sunCtl'); if (c) c.innerHTML = sdCtlHTML(); } }
    const a = za(e); turn += ((a - prev) % 360 + 540) % 360 - 180; prev = a;
    let t = T0 + turn / 360 * 365.2422 * 864e5;
    for (let k = 0; k < 3; k++) t += (((e0 + turn - sunPos(t).ecl) % 360 + 540) % 360 - 180) / 0.98565 * 864e5;
    M.sunT = T0 + Math.round((t - T0) / 864e5) * 864e5; sunApply(); };
  const up = () => { M.sunDrag = false; removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); if (!moved) onTap?.(); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
function sdCtlHTML() {
  const mode = M.cfg.sunMode || 'now', spd = M.cfg.sunSpeed || 20, yr = M.cfg.sunYear || 20;
  const play = `<button type="button" class="mico2" data-sunplay="1" aria-label="${M.sunPause ? 'Play' : 'Pause'}">${M.sunPause ? '▶' : '❚❚'}</button>`;
  return `<label class="sdrow">${SW('data-sunsw="1" aria-label="Day and night on the map"', sunOn())}<span>Day and night</span></label>`
    + `<div class="seg" role="group">${[['now', 'Now'], ['anim', 'Animate'], ['year', 'Year']].map(([v, l]) => `<button type="button" data-sunmode="${v}" class="${mode === v ? 'on' : ''}">${l}</button>`).join('')}</div>`
    + (mode === 'anim' ? `<div class="msun">${play}<input type="range" min="0" max="100" value="${spdToV(spd)}" data-sunspeed="1" aria-label="Speed"><output>${spdLabel(spd)}</output></div>` : '')
    + (mode === 'year' ? `<div class="msun">${play}<input type="range" min="0" max="100" value="${yrToV(yr)}" data-sunyear="1" aria-label="Speed"><output>${yrLabel(yr)}</output></div>` : '')
    + `<div class="seg" role="group">${[['modern', 'Modern'], ['roman', 'Roman'], ['greek', 'Greek']].map(([v, l]) => `<button type="button" data-sunfmt="${v}" class="${(M.cfg.sunFmt || 'modern') === v ? 'on' : ''}">${l}</button>`).join('')}</div>`
    + `<div class="sdtg">${[['skySun', 'Sun'], ['skyMoon', 'Moon']].map(([k, l]) => `<button type="button" data-suntg="${k}" class="${M.cfg[k] !== false ? 'on' : ''}" aria-pressed="${M.cfg[k] !== false}">${l}</button>`).join('')}`
    + `<button type="button" data-sunhere="1" class="${M.cfg.gnomon ? 'on' : ''}" aria-pressed="${!!M.cfg.gnomon}" title="${M.cfg.gnomon ? 'Take the obelisk away' : 'Set an obelisk on the map: the dial then shows that place'}">Here</button>`
    + (M.cfg.gnomon ? `<input type="range" class="obsz" min="0" max="100" value="${Math.round(Math.log(obelK() * 3) / Math.log(9) * 100)}" data-obsz="1" aria-label="Size of the obelisk" title="Size of the obelisk">` : '') + `</div>`
    + `<small class="sdsub" id="sdSub"></small>`;
}
async function sdOpen(open) {
  const box = $('#mapBody'); if (!box) return;
  $('#sunPanel')?.remove(); $('#sdMark')?.remove(); box.classList.toggle('sdopen', open); $('#mapSunBtn')?.classList.toggle('on', open);
  M.sdOpen = open; sunMoveHook();
  if (!open) { if (M.map && sunOn()) sunApply(); return; }
  box.insertAdjacentHTML('beforeend', sdPanelHTML() + `<div class="sdmark" id="sdMark" aria-hidden="true"><svg width="12" height="10" viewBox="0 0 12 10"><path d="M6 0.6 11.2 9.4H0.8z" fill="#ffd166" stroke="#5a4210" stroke-width=".9" stroke-linejoin="round"/></svg></div>`);
  $('#sunCtl').innerHTML = sdCtlHTML(); sdRefUpd();
  if (!sunOn()) await sunSet({ sun: true });
  $('#sunCtl').innerHTML = sdCtlHTML(); M.sdOwl = null; sundialPaint();
}
function sundialPaint() {
  const svg = $('#sunSvg'); if (!svg) return;
  const { lst, rise, set, alt, az } = sunHour(), W = svg.clientWidth || 400, len = set - rise;
  // the horizon: level with sunrise and sunset on the ring
  const hy = len >= 24 ? SD.cy + SD.R + 12 : len <= 0 ? SD.cy - SD.R - 12 : sdXY(set, SD.R)[1];
  const eve = lst >= 12, [top, foot] = skyAt(alt, eve);
  $('#sdSky0').setAttribute('stop-color', top); $('#sdSky1').setAttribute('stop-color', foot); const pnl = $('#sunPanel'); if (pnl) pnl.style.background = top;
  $('#sdSea0').setAttribute('stop-color', hexMix(foot, '#0b2236', 0.45)); $('#sdSea1').setAttribute('stop-color', hexMix(top, '#03101c', 0.6));
  const sea = $('#sdSeaR'); sea.setAttribute('y', hy.toFixed(1)); sea.setAttribute('height', Math.max(0, SD.H - hy).toFixed(1));
  $('#sdAboveR').setAttribute('height', Math.max(0, hy).toFixed(1)); $('#sdBelowR').setAttribute('y', hy.toFixed(1));
  $('#sdStars').style.opacity = Math.max(0, Math.min(1, (-alt - 5) / 11)).toFixed(2);
  const [x, y] = sdXY(lst, SD.R); svg.querySelectorAll('.sdhpos').forEach(g => g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`));
  const g = $('#sdGlowC'); g.setAttribute('r', (12 + Math.max(0, alt) * 0.35).toFixed(1)); g.style.opacity = Math.max(0.25, Math.min(1, 0.35 + alt / 50)).toFixed(2);
  const day = lst >= rise && lst < set;
  // the glitter of the sun (or the moon) on the water beneath it
  const gx = Math.min(W - 8, Math.max(8, x)), gl = day ? Math.max(0, 1 - alt / 40) : 0.35;
  $('#sdGlint').setAttribute('d', hy < SD.H - 4 ? [0, 1, 2, 3].map(i => `M${(gx - 14 + i * 3).toFixed(1)} ${(hy + 4 + i * 5).toFixed(1)}h${(28 - i * 6).toFixed(1)}`).join('') : '');
  $('#sdGlint').style.opacity = (len > 0 && len < 24 ? gl * 0.8 : 0).toFixed(2);
  // the daylight on the ring, and the shadow: long when the sun is low, short at noon, fading towards sunset
  if (len > 0 && len < 24) { const [ax, ay] = sdXY(rise, SD.R + 3), [bx, by] = sdXY(set, SD.R + 3); $('#sdDay').setAttribute('d', `M${ax.toFixed(1)} ${ay.toFixed(1)}A${SD.R + 3} ${SD.R + 3} 0 ${len > 12 ? 1 : 0} 1 ${bx.toFixed(1)} ${by.toFixed(1)}`); }
  else $('#sdDay').setAttribute('d', len >= 24 ? `M${SD.cx} ${SD.cy - SD.R - 3}a${SD.R + 3} ${SD.R + 3} 0 1 0 0.01 0` : '');
  const sh = $('#sdShadow'), up = day && alt > -0.8;
  if (up) { const L = Math.min(SD.P - 4, 9 / Math.tan(Math.max(1.5, alt) * RAD)), a = sdAng(lst) + Math.PI;   // (opposite the sun on the ring, as before v327)
    sh.setAttribute('x2', (SD.cx + Math.sin(a) * L).toFixed(1)); sh.setAttribute('y2', (SD.cy - Math.cos(a) * L).toFixed(1)); sh.style.opacity = Math.max(0.12, Math.min(0.75, alt / 12)).toFixed(2); }
  else sh.style.opacity = 0;
  // the owl: lands when the handle enters the night, flies off when it leaves
  if (M.sdOwl !== !day) { M.sdOwl = !day; const o = $('#sdOwlPos .sdowl'); o.classList.remove('land', 'away'); void o.getBoundingClientRect(); o.classList.add(day ? 'away' : 'land'); }
  // the moon on the dial in its real phase: lit on the right while waxing, on the left while waning (as seen from the north)
  { const mo = moonPos(sunTime()), k = mo.lit, r = 8, rx = Math.max(0.01, r * Math.abs(2 * k - 1)), sgn = mo.waxing ? 1 : -1;
    $('#sdMoonLit')?.setAttribute('d', `M0 ${-r}A${r} ${r} 0 0 ${sgn > 0 ? 1 : 0} 0 ${r}A${rx.toFixed(2)} ${r} 0 0 ${(k > 0.5) === (sgn > 0) ? 1 : 0} 0 ${-r}z`); }
  const l = sunLabel(); $('#sdLab').textContent = l.main; const sub = $('#sdSub'); if (sub) sub.textContent = l.sub;
  // the zodiac wheel, where there is room: at the right, beside the controls; else in turn with them
  const zw = W >= SD.ZW, zp = !zw && M.sdPage === 'zod', pn = $('#sunPanel'); pn?.classList.toggle('zw', zw); pn?.classList.toggle('zp', zp);
  const sw = $('#sdSwap'); if (sw) { sw.hidden = zw; const t = zp ? 'Day and night' : 'Time of year'; if (sw.title !== t) { sw.title = t; sw.setAttribute('aria-label', t); sw.innerHTML = zp ? SWAP_DN : SWAP_ZOD; } }
  const e = sunPos(sunTime()).ecl, zn = ZOD[Math.floor(e / 30)][(M.cfg.sunFmt || 'modern') === 'greek' ? 2 : M.cfg.sunFmt === 'roman' ? 1 : 0];
  document.querySelectorAll('.zrot').forEach(g => g.setAttribute('transform', `rotate(${e.toFixed(2)})`));   // (the small wheel and the large one)
  const bl = $('#zodBigLab'); if (bl) bl.textContent = `${zn} · ${l.sub}`;
  if (zw || zp) { const zx = zw ? W - SD.ZR - 16 : 2 * SD.cx + (W - 2 * SD.cx) / 2;
    M.zc = { x: zx, y: SD.ZY };
    $('#sdZod').setAttribute('transform', `translate(${zx.toFixed(1)} ${SD.ZY})`);
    const zl = $('#sdZLab'); zl.textContent = `${zn} · ${l.sub}`; let tw = 0; try { tw = zl.getComputedTextLength(); } catch (_) {}
    zl.setAttribute('x', Math.min(zx, W - 8 - tw / 2).toFixed(1)); }     // (a long date kept inside the panel)
}
// a finger (or the mouse) on the dial sets the hour; the day stays
document.addEventListener('pointerdown', ev => {
  const svg = ev.target.closest?.('#sunSvg'); if (!svg) return;
  const near = e => { const r = svg.getBoundingClientRect(), x = e.clientX - r.left - SD.cx, y = e.clientY - r.top - SD.cy; return { x, y, d: Math.hypot(x, y) }; };
  const mode = M.cfg.sunMode || 'now', pn = $('#sunPanel'), zc = (pn?.classList.contains('zw') || pn?.classList.contains('zp')) && M.zc;
  if (zc) { const r = svg.getBoundingClientRect();
    if (Math.hypot(ev.clientX - r.left - zc.x, ev.clientY - r.top - zc.y) <= SD.ZR + 8) {   // the wheel: turned, the day of the year; tapped, large
      zodTurn(ev, () => { const q = svg.getBoundingClientRect(); return { x: q.left + M.zc.x, y: q.top + M.zc.y }; }, zodBigOpen); return; } }
  if (near(ev).d > SD.R + 22) return;                                   // (only on and around the dial)
  ev.preventDefault(); svg.setPointerCapture?.(ev.pointerId);
  const setT = e => { const { x, y } = near(e), h = ((12 + Math.atan2(x, -y) / (2 * Math.PI) * 24) % 24 + 24) % 24, { lst } = sunHour();
    let dh = h - lst; if (dh > 12) dh -= 24; if (dh < -12) dh += 24; M.sunT = sunTime() + dh * 36e5; sunApply(); };
  if (mode !== 'set' && mode !== 'year') { M.cfg.sunMode = 'set'; saveMapCfg(); sunClock(); $('#sunCtl').innerHTML = sdCtlHTML(); }
  M.sunDrag = true; setT(ev);                                           // (the year, running, waits while the hour is set)
  const mv = e => setT(e), up = () => { M.sunDrag = false; removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
});
document.addEventListener('change', ev => { if (ev.target.closest?.('[data-sunsw]')) sunSet({ sun: ev.target.checked }).then(() => { const c = $('#sunCtl'); if (c) c.innerHTML = sdCtlHTML(); sundialPaint(); }); });
// the speed: one day in 60 s … 5 s (a logarithmic slider)
const spdToV = s => Math.round(Math.log(60 / s) / Math.log(12) * 100), vToSpd = v => 60 / 12 ** (v / 100);
const spdLabel = s => `a day in ${s >= 9.95 ? Math.round(s) : s.toFixed(1)} s`;
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
  if (d.suntg) {                                                   // the sun and the moon in the sky: each on or off
    M.cfg[d.suntg] = M.cfg[d.suntg] === false; await saveMapCfg(); b.classList.toggle('on', M.cfg[d.suntg]); b.setAttribute('aria-pressed', M.cfg[d.suntg]);
    skyHook(); M.map?.triggerRepaint(); return true; }
  if (d.sunhere) { await sunHere(); return true; }
  if (d.sdswap) { M.sdPage = M.sdPage === 'zod' ? 'ctl' : 'zod'; sundialPaint(); return true; }
  if (d.sunfmt) { M.cfg.sunFmt = d.sunfmt; await saveMapCfg(); $('#sunCtl').innerHTML = sdCtlHTML(); sundialPaint(); return true; }
  if (d.sunmode) { M.sunPause = false; if (d.sunmode === 'now') M.sunT = Date.now(); await sunSet({ sunMode: d.sunmode }); $('#sunCtl').innerHTML = sdCtlHTML(); return true; }
  if (d.sunplay) { M.sunPause = !M.sunPause; sunClock(); $('#sunCtl').innerHTML = sdCtlHTML(); return true; }
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
