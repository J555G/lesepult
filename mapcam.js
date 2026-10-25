// ================================================================ Pult · the camera (v354)
// The Camera menu (button beside Globe): how freely the map's camera may move, and other points of view. Every choice can be
// switched on and off:
//   Look up      – tilt beyond the horizon, up to the zenith (the engine allows 180°; Pult otherwise stops at 85°)
//   Deep zoom    – zoom in to 20 (otherwise 16)
//   Lens         – the field of view, 10° (telephoto) … 150° (wide angle); otherwise the engine's ~37°
//   Roll         – the horizon tilted sideways (a slider; twirling with two fingers in flight and from the obelisk)
//   Free flight  – a craft of one's own: two sticks at the bottom (left: forward, back, sideways; right: climb, dive, bank –
//                  banked, it turns), dragging elsewhere turns the head; keys W A S D and the arrows (v355)
//   From the obelisk – the camera at the tip of the obelisk (its height as placed, times its size): drag to look round, pinch
//                  for the lens, twirl to roll; the obelisk itself hidden meanwhile
//   All-sky view – a fisheye straight up: the whole sky down to the horizon, the mountains cutting into it worked out from the
//                  elevation – from the obelisk's tip, or without one from the middle of the map (on the ground)
// The engine places a camera by its own position and the point it looks at (calculateCameraOptionsFromTo); the free camera and
// the obelisk view set it so on every movement. Settings (mapCfg): cam { tilt, deep, lens, fov, roll, rollv } (free flight is not kept – v363).

// the icons: an eye (the menu), Icarus (free flight), an obelisk with an eye on its tip (the view from it) – v356
const CAM_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M2.3 12c2.4-3.9 5.7-5.9 9.7-5.9s7.3 2 9.7 5.9c-2.4 3.9-5.7 5.9-9.7 5.9S4.7 15.9 2.3 12z"/><circle cx="12" cy="12" r="3.3"/></g><circle cx="12" cy="12" r="1.35" fill="currentColor"/></svg>';
const ICARUS_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5.6" r="1.6"/><path d="M12 7.4v6.4M12 13.8l-1.7 5.6M12 13.8l1.9 5.2"/>'
  + '<path d="M11.2 9.2C8.6 7.4 5.4 6.6 1.8 7.2c1.6 1 2.6 2.3 3 3.8 2.4-.2 4.6.2 6.4 1.3"/><path d="M12.8 9.2c2.6-1.8 5.8-2.6 9.4-2 -1.6 1-2.6 2.3-3 3.8-2.4-.2-4.6.2-6.4 1.3"/>'
  + '<path d="M3.4 8.6 4.8 7.3M5 9.4l1.6-1.8M6.8 10.2 8.4 8M8.8 10.9l1.4-2.1M20.6 8.6 19.2 7.3M19 9.4l-1.6-1.8M17.2 10.2 15.6 8M15.2 10.9l-1.4-2.1" stroke-width=".8"/></g></svg>';
const OBEL_EYE_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"><path d="M10.3 21.2 10.9 8.6 12 6.9l1.1 1.7.6 12.6z"/><path d="M8.6 21.2h6.8"/><path d="M7.4 3.9c1.3-1.5 2.8-2.2 4.6-2.2s3.3.7 4.6 2.2c-1.3 1.5-2.8 2.2-4.6 2.2s-3.3-.7-4.6-2.2z"/></g><circle cx="12" cy="3.9" r="1.1" fill="currentColor"/></svg>';
const camCfg = () => (M.cfg.cam ??= {});
const ER = 6371008.8, mPerDeg = 111319.49;
// the limits the menu loosens, applied to the map (at start-up and whenever they change)
function camLimits() {
  const m = M.map; if (!m) return; const c = camCfg(), free = !!M.cam;
  try { m.setMaxPitch(c.tilt || free ? 180 : 85); } catch (_) {}
  m.setMaxZoom(free ? 24 : c.deep ? 20 : 16);   // (a camera of its own may come close: the engine's own limit)
  m.setVerticalFieldOfView(c.lens ? (c.fov || 60) : 36.87);
  if (!free) m.setRoll?.(c.roll ? (c.rollv || 0) : 0);
}
function camInit() {
  if ('fly' in camCfg()) { delete camCfg().fly; saveMapCfg(); }   // (the switch kept until v362: the app never starts in flight)
  camLimits();
  // the globe made to keep the height of the point the camera looks at – for the free camera and the map alike (496b): set up as
  // soon as the map is a globe (at start or once switched to it)
  const m = M.map; if (m && !globeElev(m)) { const f = () => { if (globeElev(m)) m.off('render', f); }; m.on('render', f); }
  if (M.camMap !== m) { M.cam = null; M.camPrevExp = null; }
  camConstrain(m); if (m && !m._camCon) { m._camCon = true; m.on('style.load', () => camConstrain(m)); m.on('styledata', () => camLodAll(m)); m.on('sourcedata', () => camLodAll(m));
    let ct = 0; m.on('move', () => { const n = performance.now(); if (n - ct > 400) { ct = n; (typeof contUpd === 'function' && contUpd()); } }); m.on('moveend', () => (typeof contUpd === 'function' && contUpd())); }
  camLodAll(m);
  camExplore();
}

// the engine keeps the centre within 85.05° of the equator, even on the globe – there the limit is lifted to 89.99°, so that the
// globe turns over the poles (on the flat map, and zoomed in, where the map is drawn flat, it stays – v401)
function camConstrain(m) {
  if (!m?.setTransformConstrain) return; const glb = m.getProjection?.()?.type === 'globe';
  try { m.setTransformConstrain(glb ? (ll, z) => { const L = z < 11 ? 89.99 : 85.051129; return { center: new maplibregl.LngLat(ll.lng, Math.max(-L, Math.min(L, ll.lat))), zoom: Math.max(z < 11 ? -24 : m.getMinZoom(), Math.min(m.getMaxZoom(), z)) }; } : null); } catch (_) {}   // (near a pole the engine's globe needs a zoom below its least: its scale grows as 1 / cos(latitude))
}
// How fine each tile is drawn (624a, 625a – v403). The engine measures each tile's distance from the ground point beneath the camera
// as it finds it on the screen – looking up past the horizon that point is off the screen and lands somewhere wrong (on the globe far
// away: every tile came out coarse, from 20 km up whole countries in one tile) – and takes as the camera's height its height above
// the point the middle of the screen looks at (looking at the horizon or the sky: up in the air, about level with the camera).
// Here each tile is measured from the camera itself: from the point truly beneath it, its height above the ground as it is. A tile
// as fine as it would be looked at straight down from as far away; seen at a slant a little less fine (as the engine does); the
// engine's general cut for pitched views dropped – looking straight down it is nothing, so every view gets what the view straight
// down gets. (The engine's formula otherwise, its constants kept.)
const LOD_L = fov => 2 * (8.314 / Math.log2(Math.cos((89.25 - fov) * RAD) / Math.cos(89.25 * RAD)) - 1);
let LOD_C = { k: '', v: null };
function camLodC() {      // where the camera is, in the engine's units (mercator: a world is 1 across): x, y and its height – worked out
  // once for each place of the camera (the ground's height is slow to ask for, and this is asked for every tile)
  const c = M.cam, t = M.map?.transform; if (!t) return null;
  const k = c && camExpOn() ? c.lng + ',' + c.lat + ',' + c.alt : t.center.lng + ',' + t.center.lat + ',' + t.zoom + ',' + t.pitch + ',' + t.bearing + ',' + t.elevation;
  if (k !== LOD_C.k) { LOD_C = { k, v: null }; LOD_C.v = camLodC0(); }
  return LOD_C.v;
}
// the camera's height above the ground (metres), for the explorer and the map's own camera alike
function camAboveGround() { const C = camLodC(); return C ? C.hm : null; }
function camLodC0() {
  const c = M.cam, m = M.map; let ll, h;
  if (c && camExpOn()) { ll = [c.lng, c.lat]; h = c.alt - groundAt(c.lng, c.lat); }
  else { try { const t = m.transform, q = t.getCameraLngLat?.(); let a = t.getCameraAltitude?.(); if (!q) return null;
    if (!isFinite(a)) a = (t.elevation || 0) + Math.cos(t.pitch * RAD) * t.cameraToCenterDistance * 2 * Math.PI * ER * Math.cos(t.center.lat * RAD) / t.worldSize;   // (the globe's own gives none)
    ll = [q.lng, q.lat]; h = a - groundAt(q.lng, q.lat); } catch (_) { return null; } }
  if (!isFinite(h) || !isFinite(ll[1])) return null;
  const lat = Math.max(-85.05, Math.min(85.05, ll[1])), q = maplibregl.MercatorCoordinate.fromLngLat([ll[0], lat]);
  return { x: q.x, y: q.y, hm: h, lng: ll[0], lat: ll[1], h: Math.max(2, h) / (2 * Math.PI * ER * Math.max(0.01, Math.cos(lat * RAD))) };
}
function camLod(o, a, r, s, n) {   // (centre zoom, distance to the tile along the ground, camera's height over the centre, camera to centre, field of view)
  const C = camLodC(), t = M.map?.transform, l = LOD_L(n), f = Math.log2(1 / Math.max(0.5, Math.cos(n / 2 * RAD)));
  const s0 = t ? t.cameraToCenterDistance / t.worldSize : s;   // (the camera's distance from the centre, as the centre's zoom means it)
  if (!C || !(s0 > 0)) { const z = o + Math.log2(s / Math.hypot(a, r)) + f + l * Math.log2(Math.cos(Math.atan(a / r))) / 2; return isFinite(z) ? z : o; }
  const D = Math.hypot(a, C.h), z = o + Math.log2(s0 / D) + f + l * Math.log2(Math.max(1e-6, C.h / D)) / 2;
  return isFinite(z) ? z : o;
}
function camLodAll(m) {
  const T = m?.style?.tileManagers; if (!T) return;
  for (const k in T) { try { const src = T[k].getSource(); if (src && src.calculateTileZoom !== camLod) src.calculateTileZoom = camLod; } catch (_) {} }
  // (the distance to each tile measured from the point truly beneath the camera – for the flat map and the globe alike)
  for (const pv of [m.transform?.getCoveringTilesDetailsProvider?.(), m.transform?._mercatorTransform?.getCoveringTilesDetailsProvider?.(), m.transform?._verticalPerspectiveTransform?.getCoveringTilesDetailsProvider?.()]) {
    const pr = pv && Object.getPrototypeOf(pv); if (!pr || pr._pultLod || typeof pr.distanceToTile2d !== 'function') continue;
    const o = pr.distanceToTile2d; pr._pultLod = true;
    pr.distanceToTile2d = function (x, y, T, P) { const C = camLodC(); return o.call(this, C ? C.x : x, C ? C.y : y, T, P); };
  }
}
// each tile's lines as thin as its own distance from the camera asks (652a, 653a – v407): the zoom at which the tile's nearest point is
// seen (the screen's scale there), for every line on the map; beyond ten times the camera's height above the ground thinner still,
// in proportion to the distance, so that the many lines towards the horizon fade (654b). Without a camera of ours: the engine's own
function camLineZ(tile, tr) {
  try {
    const C = camLodC(), id = tile?.tileID; if (!C || !id || !tr) return tr.zoom;
    const z = id.canonical.z, n = 2 ** z, x0 = id.canonical.x / n + (id.wrap || 0), y0 = id.canonical.y / n;
    const dx = Math.max(x0 - C.x, 0, C.x - (x0 + 1 / n)), dy = Math.max(y0 - C.y, 0, C.y - (y0 + 1 / n)), D = Math.hypot(Math.hypot(dx, dy), C.h);
    // (seen at a slant, a line across the view is drawn narrower by the slant: in part made up for – by the square root of the slant,
    // at most 2.5 times – so that lines in the distance stay to be seen without those along the view swelling)
    let Z = Math.log2(tr.cameraToCenterDistance / (512 * D)) - Math.log2(Math.min(2.5, Math.sqrt(D / C.h))); const D0 = 10 * C.h; if (D > D0) Z += Math.log2(D / D0);
    return isFinite(Z) ? Z : tr.zoom;
  } catch (_) { return tr.zoom; }
}
self.__pultLineZ = camLineZ;
// ---------------------------------------------------------------- the menu
function camHTML() {
  const c = camCfg(), g = !!M.cfg.gnomon, sw = (k, l, sub, ic = '') => `<label class="mrow"><span>${ic ? `<i class="cmi">${ic}</i>` : ''}${l}${sub ? `<small class="cmh">${sub}</small>` : ''}</span>${SW(`data-camopt="${k}"`, !!c[k])}</label>`;
  const ex = camExpOn();
  return `<div class="mrow"><span>Camera<small class="cmh">${ex ? 'a camera of its own: no limits, never into the ground' : 'the map’s own, with its limits'}</small></span><div class="seg" role="group">`
    + [['exp', 'Explorer'], ['trad', 'Traditional']].map(([v, l]) => `<button type="button" data-camstyle="${v}" class="${(ex ? 'exp' : 'trad') === v ? 'on' : ''}" aria-pressed="${(ex ? 'exp' : 'trad') === v}">${l}</button>`).join('') + '</div></div>'
    + (ex ? '' : sw('tilt', 'Look up to the sky', 'tilt beyond the horizon, up to the zenith') + sw('deep', 'Deep zoom', 'to 20 instead of 16'))
    + sw('lens', 'Lens')
    + (c.lens ? `<label class="mrow msub"><span>Field of view <output id="camFovOut">${Math.round(c.fov || 60)}°</output></span><span class="cmr"><input type="range" min="10" max="150" step="1" value="${c.fov || 60}" data-camfov="1" aria-label="Field of view"><button type="button" class="cmrz" data-camfovreset="1" title="Back to normal (37°)" aria-label="Reset the field of view">↺</button></span></label>` : '')
    + sw('roll', 'Roll', 'the horizon tilted sideways')
    + (c.roll ? `<label class="mrow msub"><span>Roll <output id="camRollOut">${Math.round(c.rollv || 0)}°</output></span><span class="cmr"><input type="range" min="-180" max="180" step="1" value="${c.rollv || 0}" data-camroll="1" aria-label="Roll"><button type="button" class="cmrz" data-camrollreset="1" title="Level (0°)" aria-label="Reset the roll">↺</button></span></label>` : '')
    // (free flight: the icon is the button – on and off; not kept for the next start – v363)
    + `<div class="mrow"><span>Free flight<small class="cmh">two sticks: move with the left, steer with the right</small></span><button type="button" class="cmfly${M.cam?.mode === 'fly' ? ' on' : ''}" data-camfly="1" aria-pressed="${M.cam?.mode === 'fly'}" title="${M.cam?.mode === 'fly' ? 'Land: back to the map' : 'Take off'}" aria-label="Free flight">${ICARUS_ICON}</button></div>`
    + `<button type="button" class="mrsave cmb" data-camobel="1"${g ? '' : ' disabled'}>${OBEL_EYE_ICON}${M.cam?.mode === 'obel' ? 'Leave the obelisk' : 'View from the obelisk’s tip'}</button>`
    + (g ? '' : '<small class="hint mrow">Set up the obelisk first: drag it from the sundial onto the map.</small>')
    + `<button type="button" class="mrsave" data-camsky="1">All-sky view${g ? ' from the obelisk' : ''}</button>`;
}
function camPop() { rightPop('camera', 'Camera', camHTML()); }
function camPopRefresh() { const pop = $('#mapPop'); if (!pop.hidden && pop.dataset.k === 'camera') { const y = pop.scrollTop; pop.innerHTML = `<div class="mph"><span class="navh">Camera</span></div>${camHTML()}`; pop.scrollTop = y; } }
async function camClick(b) {
  const d = b.dataset;
  if (b.id === 'mapCamBtn') { camPop(); return true; }
  if (d.camobel) { if (M.cam?.mode === 'obel') camLeave(); else camObelisk(); camPopRefresh(); return true; }
  if (d.camsky) { allSkyOpen(); return true; }
  if (d.camfly) { if (M.cam?.mode === 'fly') camLeave(); else camFly(); camPopRefresh(); return true; }
  if (d.camfovreset) { const c = camCfg(); c.fov = 37; camLimits(); if (M.cam) camApply(); await saveMapCfg(); camPopRefresh(); return true; }
  if (d.camrollreset) { const c = camCfg(); c.rollv = 0; if (M.cam) M.cam.roll = 0; camLimits(); if (M.cam) camApply(); await saveMapCfg(); camPopRefresh(); return true; }
  // (↺: in flight the nose level and the head as at the start – the view a little down (640a, v405); otherwise look level – v401)
  if (d.flyfwd) { if (M.cam) { const c = M.cam, fly = c.mode === 'fly', a0 = c.pt, h0 = fly ? flyHd(c) : 0, t0 = performance.now(); const st = n => { if (M.cam !== c) return; const u = Math.min(1, (n - t0) / 450), w = u * u * (3 - 2 * u), h1 = fly ? flyHd0() : 0;
    if (fly) c.hd = h0 + (h1 - h0) * w; c.pt = a0 + (90 + h1 - a0) * w; camApply(); if (u < 1) requestAnimationFrame(st); else if (fly) c.hd = undefined; }; requestAnimationFrame(st); } return true; }
  if (d.camleave) { camLeave(); camPopRefresh(); return true; }
  if (d.camstyle) { const ex = d.camstyle === 'exp'; camCfg().style = ex ? undefined : 'trad'; await saveMapCfg();
    if (ex) camExplore(); else if (M.cam?.mode === 'exp') { M.camWas = null; camLeave(); }
    camLimits(); camPopRefresh(); return true; }
  if (d.camnorth) { if (M.cam) { M.cam.br = 0; camApply(); } return true; }
  if (d.camzen) { if (M.cam) { M.cam.pt = 178; camApply(); } return true; }
  return false;
}
document.addEventListener('change', async ev => {
  const k = ev.target.dataset?.camopt; if (!k) return;
  camCfg()[k] = ev.target.checked; await saveMapCfg();
  camLimits(); if (M.cam) camApply(); camPopRefresh();
});
document.addEventListener('input', ev => {
  const f = ev.target.closest?.('input[data-camfov]'), r = ev.target.closest?.('input[data-camroll]'); if (!f && !r) return;
  const c = camCfg();
  if (f) { c.fov = +f.value; $('#camFovOut') && ($('#camFovOut').textContent = c.fov + '°'); }
  if (r) { c.rollv = +r.value; $('#camRollOut') && ($('#camRollOut').textContent = c.rollv + '°'); if (M.cam) M.cam.roll = c.rollv; }
  camLimits(); if (M.cam) camApply(); clearTimeout(M.camT); M.camT = setTimeout(saveMapCfg, 400);
});

// ---------------------------------------------------------------- a camera of its own: position and direction
// M.cam = { mode: 'exp' | 'fly' | 'obel', lng, lat, alt (metres above sea level), br (bearing), pt (0 down, 90 level, 180 up), roll }
// the ground under the camera, as the map draws it: flat at 0 without 3D terrain; with it, the height from the elevation tiles
// (times the exaggeration) – read from the tiles directly, not from what the view happens to have loaded (that gave 0 when the
// camera looked up, away from the ground beneath it – v360)
const GTILE = new Map();
function demHeight(lng, lat) {
  const dem = M.relDem; if (!dem) return null; const z = 10, n = 2 ** z, fx = (lng + 180) / 360 * n, fy = (1 - Math.log(Math.tan(Math.PI / 4 + lat * RAD / 2)) / Math.PI) / 2 * n;
  const k = `${Math.floor(fx)}/${Math.floor(fy)}`; let t = GTILE.get(k);
  if (t === undefined) { GTILE.set(k, null); dem.getDemTile(z, Math.floor(fx), Math.floor(fy)).then(d => { GTILE.set(k, d); if (GTILE.size > 24) GTILE.delete(GTILE.keys().next().value); }).catch(() => GTILE.delete(k)); return null; }
  if (!t) return null; const w = t.width; return t.data[Math.min(w - 1, Math.floor(fy % 1 * w)) * w + Math.min(w - 1, Math.floor(fx % 1 * w))];
}
function groundAt(lng, lat) {
  const m = M.map, T = m?.getTerrain(); if (!T) return 0;
  const h = demHeight(lng, lat); if (h != null) return Math.max(0, h) * (T.exaggeration ?? 1);
  try { return m.queryTerrainElevation([lng, lat]) || 0; } catch (_) { return 0; }
}
function camApply() { M.camApplying = true; try { camApply0(); } finally { M.camApplying = false; } }
function camApply0() {
  const m = M.map, c = M.cam; if (!m || !c) return;
  c.pt = Math.max(0.5, Math.min(179.5, c.pt)); c.br = ((c.br % 360) + 360) % 360; c.lat = Math.max(-89.9999, Math.min(89.9999, c.lat)); c.lng = ((c.lng + 540) % 360) - 180;
  if (c.mode === 'fly') c.alt = Math.max(groundAt(c.lng, c.lat) + 2, c.alt);
  // the engine wants a point the camera looks at ("the centre"), some way ahead along the line of sight, at its own height
  // (the globe mode made to keep that height: globeElev). Its distance is about the height above the ground, so the map's details
  // suit the height, as in a view from above – and high up the earth is drawn as a globe, lower down flat, as the map does.
  // Worked out on the sphere: the camera's own up, north and east turn a little on the way to the centre (v361).
  globeElev(m);
  const e = (c.pt - 90) * RAD, b = c.br * RAD, g = groundAt(c.lng, c.lat), h = Math.max(1, c.alt - g);
  const la = c.lat * RAD, lo = c.lng * RAD, U = [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
  const N = [-Math.sin(la) * Math.sin(lo), Math.cos(la), -Math.sin(la) * Math.cos(lo)], E = [Math.cos(lo), 0, -Math.sin(lo)];
  const v = [0, 1, 2].map(i => Math.cos(e) * (Math.sin(b) * E[i] + Math.cos(b) * N[i]) + Math.sin(e) * U[i]);
  const r0 = ER + c.alt, P = U.map(x => x * r0);
  let L = Math.max(30, Math.min(2e6, h));
  const globe = m.getProjection?.()?.type === 'globe', roll = (((c.roll || 0) + 180) % 360 + 360) % 360 - 180;
  if (!globe) {   // (the flat map: worked out flat – the earth there has no curve)
    if (e < -0.01) L = Math.min(3e7, Math.max(5, h / Math.sin(-e)));   // (looking down: the centre where the line of sight meets the ground – v399)
    else L = Math.min(3e7, Math.max(5, h * (100 - 99 * Math.sin(Math.max(0, e)))));   // (at the horizon on as from below, then nearer as the view rises – 629a)
    const D = L * Math.cos(e), tlat = c.lat + D * Math.cos(b) / mPerDeg, tlng = c.lng + D * Math.sin(b) / (mPerDeg * Math.max(0.05, Math.cos(c.lat * RAD)));
    const zoom = Math.log2(m.transform.cameraToCenterDistance * 2 * Math.PI * ER * Math.cos(tlat * RAD) / (512 * L));
    try { m.jumpTo({ center: [tlng, tlat], elevation: c.alt + L * Math.sin(e), zoom, pitch: c.pt, bearing: c.br, roll }); } catch (_) {}
    camBar(); return;
  }
  // (looking down: not beyond the ground the line of sight meets)
  const pv = P[0] * v[0] + P[1] * v[1] + P[2] * v[2], rg = ER + g, disc = pv * pv - (r0 * r0 - rg * rg);
  // (v399: the centre exactly where the line of sight meets the ground – not some way short of it, up in the air: there the engine
  // picked its tiles for a nearer ground than the one seen, loading far too many and too fine, and far out it lost the globe)
  if (pv < 0 && disc > 0) L = Math.max(5, -pv - Math.sqrt(disc));
  // (missing the ground: just over the horizon as far off as the horizon itself – there the same as where the line of sight meets
  // the ground, so the centre, the zoom and with them the curve of the earth no longer leap; nearer as the view rises, over ten
  // degrees, to the height, as before – 629a, v404)
  else { const el = Math.asin(Math.max(-1, Math.min(1, dot3(v, U)))), dip = Math.acos(Math.min(1, rg / r0)), a = Math.max(0, el + dip), A = 10 * RAD;
    const Lt = Math.sqrt(Math.max(0, r0 * r0 - rg * rg)), w = (1 - Math.min(1, a / A)) ** 2; L = Math.max(L, L + (Lt - L) * w); }
  const T = [0, 1, 2].map(i => P[i] + L * v[i]), rT = Math.hypot(...T), tlat = Math.asin(T[1] / rT), tlng = Math.atan2(T[0], T[2]);
  const U2 = T.map(x => x / rT), N2 = [-Math.sin(tlat) * Math.sin(tlng), Math.cos(tlat), -Math.sin(tlat) * Math.cos(tlng)], E2 = [Math.cos(tlng), 0, -Math.sin(tlng)];
  const dot = (a, q) => a[0] * q[0] + a[1] * q[1] + a[2] * q[2], vu = dot(v, U2), ve = dot(v, E2), vn = dot(v, N2);
  const pitch = 90 + Math.asin(Math.max(-1, Math.min(1, vu))) / RAD, bearing = Math.hypot(ve, vn) > 1e-4 ? Math.atan2(ve, vn) / RAD : c.br;
  const latT = tlat / RAD, zoom = Math.log2(m.transform.cameraToCenterDistance * 2 * Math.PI * ER * Math.cos(tlat) / (512 * L));
  try { m.jumpTo({ center: [tlng / RAD, latT], elevation: rT - ER, zoom, pitch: Math.max(0, Math.min(180, pitch)), bearing, roll }); } catch (_) {}
  camBar();
}
// The globe mode of the engine (vertical perspective, below zoom 12) keeps the point the camera looks at on the sea-level sphere,
// whatever height it is given – so a camera looking up would sit beneath the ground, and over mountains the map's own camera looked
// at the sea beneath them. Its matrices are set afresh after the engine's own (for the free camera since v361, always since v362): the sphere moved back along the centre's vertical by the centre's height (the same as
// putting the centre that high), and with it the camera's position, the plane that cuts off the far side of the globe and the
// frustum that picks the tiles (v361).
function globeElev(m) {
  const vp = m.transform?._verticalPerspectiveTransform; if (!vp) return false;
  const proto = Object.getPrototypeOf(vp); if (proto._pultElev) return true;
  const orig = proto._calcMatrices; if (typeof orig !== 'function' || !vp._globeViewProjMatrixNoCorrection) return false;
  // M · T(t): gl-matrix order (column-major)
  const trans = (a, t) => { const o = Float64Array.from(a); for (let i = 0; i < 4; i++) o[12 + i] = a[i] * t[0] + a[4 + i] * t[1] + a[8 + i] * t[2] + a[12 + i]; return o; };
  const sv = (lng, lat) => { const l = lat * RAD, g = lng * RAD; return [Math.sin(g) * Math.cos(l), Math.sin(l), Math.cos(g) * Math.cos(l)]; };
  proto._calcMatrices = function () {
    orig.call(this);
    const el = this.elevation;
    if (!el || !this._globeViewProjMatrixNoCorrection || !this._cameraPosition) return;
    try {
      const k = el / ER, c = this.center, n = sv(c.lng, c.lat), t = n.map(x => -k * x);
      const nc = sv(c.lng, c.lat - (this._globeLatitudeErrorCorrectionRadians || 0) / RAD), tc = nc.map(x => -k * x);
      this._globeViewProjMatrixNoCorrection = trans(this._globeViewProjMatrixNoCorrection, t);
      this._globeViewProjMatrix32f = new Float32Array(trans(this._globeViewProjMatrix32f, tc));
      // inverse of M·T(t) = T(−t)·M⁻¹
      const inv = Float64Array.from(this._globeViewProjMatrixNoCorrectionInverted);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) inv[4 * j + i] -= t[i] * inv[4 * j + 3];
      this._globeViewProjMatrixNoCorrectionInverted = inv;
      const cp = this._cameraPosition; for (let i = 0; i < 3; i++) cp[i] -= t[i];
      const D = Math.max(1.0000001, Math.hypot(cp[0], cp[1], cp[2]));
      this._cachedClippingPlane = [cp[0] / D, cp[1] / D, cp[2] / D, -1 / D];
      const F = this._cachedFrustum?.constructor;
      if (F?.fromInvProjectionMatrix) { const fm = Float64Array.from(inv); for (let i = 8; i < 12; i++) fm[i] = -fm[i]; this._cachedFrustum = F.fromInvProjectionMatrix(fm, 1, 0, this._cachedClippingPlane, true); }
    } catch (e) { console.warn('globe height:', e.message); }
  };
  // when a movement ends, the engine puts the centre on the ground beneath the middle of the screen, the camera staying where it
  // is: the globe mode set it on the sea instead (height 0) – now on the ground, as the flat mode does
  const rz = proto.recalculateZoomAndCenter;
  if (typeof rz === 'function' && vp._helper?.recalculateZoomAndCenter) proto.recalculateZoomAndCenter = function (terrain) {
    if (!terrain) return rz.call(this, terrain);
    try { const ctr = this.screenPointToLocation(this.centerPoint, terrain); this._helper.recalculateZoomAndCenter(ctr ? terrain.getElevationForLngLatZoom(ctr, this._helper._tileZoom) : 0); }
    catch (_) { rz.call(this, terrain); }
  };
  proto._pultElev = true; return true;
}
// where the map's camera is now (to take over into free flight)
function camNow() {
  const m = M.map, t = m.transform, ll = t.getCameraLngLat(), lat = m.getCenter().lat * RAD;
  const mpp = 40075016.7 * Math.cos(lat) / (512 * 2 ** m.getZoom()), dist = t.cameraToCenterDistance * mpp;
  return { lng: ll.lng, lat: ll.lat, alt: (t.elevation || 0) + dist * Math.cos(m.getPitch() * RAD), br: m.getBearing(), pt: m.getPitch(), roll: m.getRoll?.() || 0 };
}
function camTake(mode, c) {
  const m = M.map; if (!m) return;
  if (!M.cam) { M.camWas = { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch(), roll: m.getRoll?.() || 0 };
    for (const h of ['dragPan', 'dragRotate', 'scrollZoom', 'touchZoomRotate', 'touchPitch', 'keyboard', 'doubleClickZoom', 'boxZoom']) m[h]?.disable(); }
  const pop = $('#mapPop'); if (pop && pop.dataset.k === 'camera') pop.hidden = true;   // (the menu out of the way)
  // (the engine lifts a camera it thinks is inside the terrain onto the ground, pointing at the centre – with the camera looking up
  // it misjudged that and set it down on the ground: switched off while the camera is ours, which keeps its own floor – v360)
  if (typeof m._elevateCameraIfInsideTerrain === 'function' && !m._elevOrig) { m._elevOrig = m._elevateCameraIfInsideTerrain; m._elevateCameraIfInsideTerrain = function (t) { return M.cam ? {} : this._elevOrig(t); }; }
  M.cam = { mode, ...c }; M.camMap = m; camFog(); m.setCenterClampedToGround?.(false); camLimits(); camGestures(); camApply(); obelUpd(); m.triggerRepaint();
}
// the engine's fog – always white, also at night – over the distant land in the flat view: off while flying (500c, v363)
const FOG_OFF = { 'fog-color': 'rgba(0,0,0,0)', 'fog-ground-blend': 1, 'horizon-fog-blend': 0, 'sky-horizon-blend': 0 }, FOG_ON = { 'fog-color': '#ffffff', 'fog-ground-blend': 0.5, 'horizon-fog-blend': 0.8, 'sky-horizon-blend': 0.8 };
function camFog() {
  const m = M.map; if (!m?.setSky) return; const sky = { ...(m.getStyle()?.sky || {}) }, fly = M.cam?.mode === 'fly' || M.cam?.mode === 'exp';   // (the explorer as flight: no haze – 603a, v394)
  Object.assign(sky, fly ? FOG_OFF : FOG_ON);   // (the engine changes only what is named: its defaults named back)
  try { m.setSky(sky); } catch (_) {}
}
function camLeave() {
  const m = M.map; if (!M.cam || !m) return; const was = M.camWas, mode = M.cam.mode; cancelAnimationFrame(FLY.raf); $('#flyUI')?.remove(); FLY.L = { x: 0, y: 0 }; FLY.R = { x: 0, y: 0 }; FLY.keys.clear();
  if (mode === 'fly' && FLY.fov0) { try { m.setVerticalFieldOfView(FLY.fov0); } catch (_) {} } FLY.fov0 = null;   // (the view's width as before the turn widened it)
  // (out of flight or the obelisk's view, with the explorer camera chosen: back to where it was; the lens as before – v392)
  // (out of flight: exactly where the flight was – only the sticks go, v393; out of the obelisk's view: back to where one was)
  if (mode !== 'exp' && camExpOn()) { const f = M.cam; M.cam = mode === 'fly' ? { mode: 'exp', lng: f.lng, lat: f.lat, alt: f.alt, br: f.br, pt: f.pt, roll: f.roll || 0 } : M.camPrevExp ? { ...M.camPrevExp } : { mode: 'exp', ...camNow() }; M.camPrevExp = null;
    camLimits(); camFog(); camApply(); camBar(); obelUpd(); m.triggerRepaint(); return; }
  M.cam = null; cancelAnimationFrame(EXP.raf); EXP.raf = 0; EXP.hold = false;
  for (const h of ['dragPan', 'dragRotate', 'scrollZoom', 'touchZoomRotate', 'touchPitch', 'keyboard', 'doubleClickZoom', 'boxZoom']) m[h]?.enable();
  // (with the map's own camera: out of flight the view stays as it is – the centre held to the ground again only once the map is moved)
  if (mode === 'fly') m.once('movestart', () => { if (!M.cam) m.setCenterClampedToGround?.(true); }); else m.setCenterClampedToGround?.(true);
  camLimits(); camFog();
  if (was && mode !== 'fly') m.jumpTo({ center: was.center, zoom: was.zoom, bearing: was.bearing, pitch: Math.min(was.pitch, m.getMaxPitch()), roll: camCfg().roll ? camCfg().rollv || 0 : 0 });
  camBar(); obelUpd(); m.triggerRepaint();
}
// Free flight (v355; reworked v401, v405): the explorer's own camera with two sticks. The left stick moves the craft where its nose
// points – forward and back (climbing as the nose is up, diving as it is down), right and left; let go, it glides to a stop. The right
// stick flies it as a plane's: pushed, the nose goes down, pulled, up (about the wings); to the side it banks, and the bank turns it
// (a coordinated turn); the nose is not levelled by itself. The view is the nose's, tilted by the head: by default a little down (the nose two thirds up the map);
// one finger tilts the head up and down (kept as the craft moves) and turns the craft left and right; pinch and twist as in the
// explorer. Full speed is half the height above the ground per second (602a); a floor keeps the craft 7 m above the ground (v402).
// Moves are made on the sphere, so a flight goes on over the poles.
function camFly() {
  if (!M.map) return; const c = M.cam?.mode === 'exp' ? { ...M.cam } : camNow();
  // (taking off changes nothing in the view – only the sticks appear – v393)
  FLY.fov0 = M.map.getVerticalFieldOfView();
  camTake('fly', { lng: c.lng, lat: c.lat, alt: Math.max(c.alt, groundAt(c.lng, c.lat) + 7), br: c.br, pt: c.pt, roll: c.roll || 0, vF: 0, vR: 0, bank: 0, prate: 0, hd: undefined });
  flyUI(); flyLoop();
}
const FLY = { L: { x: 0, y: 0 }, R: { x: 0, y: 0 }, keys: new Set() };
// the head's tilt from the nose (degrees, up positive): by default the nose two thirds up the map (638a, v405)
function flyHd0() { const m = M.map, H = m?.getCanvas().clientHeight || 600, fp = H / 2 / Math.tan(((M.cam?.mode === 'fly' && FLY.fov0) || m?.getVerticalFieldOfView() || 37) * RAD / 2); return -Math.atan(H / 6 / fp) / RAD; }
const flyHd = c => c.hd ?? flyHd0();
// a tilt of the head alone (one finger, or two together, up and down – in flight): the view turns, the nose stays
function flyHead(c, d) { const p0 = c.pt; c.pt = Math.max(0.5, Math.min(179.5, c.pt + d)); c.hd = Math.max(-80, Math.min(80, flyHd(c) + c.pt - p0)); }
function flyLoop() {
  cancelAnimationFrame(FLY.raf); let last = performance.now();
  const step = now => {
    const c = M.cam; if (!c || c.mode !== 'fly') return; const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const K = FLY.keys, kx = (K.has('d') ? 1 : 0) - (K.has('a') ? 1 : 0), ky = (K.has('s') ? 1 : 0) - (K.has('w') ? 1 : 0), rx = (K.has('arrowright') ? 1 : 0) - (K.has('arrowleft') ? 1 : 0), ry = (K.has('arrowdown') ? 1 : 0) - (K.has('arrowup') ? 1 : 0);
    const L = { x: FLY.L.x || kx, y: FLY.L.y || ky }, R = { x: FLY.R.x || rx, y: FLY.R.y || ry };
    const hgt = Math.max(5, c.alt - groundAt(c.lng, c.lat)), vmax = Math.min(1e6, 0.5 * hgt), ease = (v, t, tau) => v + (t - v) * Math.min(1, dt / tau), cv = x => Math.sign(x) * x * x;
    c.vF = ease(c.vF || 0, -cv(L.y) * vmax, 0.7); c.vR = ease(c.vR || 0, cv(L.x) * vmax, 0.7);
    // (the right stick as a plane's (636a, v405; 648b, v407): pushed, the nose goes down, pulled back, up – 45° a second, about the
    // wings: banked, pulling tightens the turn)
    if (Math.abs(R.y) > 0.02) { const F = camFrame(c), a = cv(R.y) * 45 * dt * RAD; camFromFrame(c, F.P, rotV(F.v, F.r, a), rotV(F.u, F.r, a)); }
    // (to the side, a coordinated turn (644a–647a, v407): the stick sets the bank – in proportion, 60° at full stick, 45° with the
    // arrow keys – the craft rolls into it at up to 45° a second, easing in and out, and the bank makes the turn, as a light plane's
    // at 180 km/h: 11° a second at 45°, 19° at 60°, whatever the speed; let go, it rolls level and flies straight on. Banked, the view
    // widens, up to 7° at 60°)
    { const keys = !FLY.R.x && rx, want = keys ? 45 * rx : Math.abs(R.x) > 0.02 ? 60 * Math.max(-1, Math.min(1, R.x)) : 0, ph = c.bank || 0;
      const rate = Math.max(-45, Math.min(45, (want - ph) * 3)), acc = 180 * dt; c.prate = Math.abs(rate - (c.prate || 0)) <= acc ? rate : (c.prate || 0) + Math.sign(rate - (c.prate || 0)) * acc;
      let nb = ph + c.prate * dt; if (Math.abs(nb) < 1e-3 && !want) { nb = 0; c.prate = 0; }
      c.roll = (c.roll || 0) - (nb - ph); c.bank = nb;
      c.br += 9.81 * Math.tan(Math.max(-80, Math.min(80, nb)) * RAD) / 50 / RAD * dt;
      if (FLY.fov0) { const f = FLY.fov0 + 7 * Math.min(1, Math.abs(nb) / 60); if (Math.abs(f - M.map.getVerticalFieldOfView()) > 0.01) M.map.setVerticalFieldOfView(f); } }
    if (Math.abs(c.vF) + Math.abs(c.vR) > 1e-3) {
      // ("forward" is where the nose points: the view tilted from it by the head's tilt – by default the nose two thirds up the map,
      // the view a little down – 633a, v404; 638a, v405)
      const F = camFrame(c), hd = flyHd(c) * RAD, fw = norm3([0, 1, 2].map(i => F.v[i] * Math.cos(hd) - F.u[i] * Math.sin(hd)));
      const D = [0, 1, 2].map(i => fw[i] * c.vF + F.r[i] * c.vR), U = norm3(F.P), up = dot3(D, U);
      expTravel(c, F, D.map((x, i) => x - up * U[i]), dt); c.alt += up * dt; }
    { const g = groundAt(c.lng, c.lat); if (c.alt < g + 7) c.alt = g + 7; }
    camApply(); flyPaint();
    FLY.raf = requestAnimationFrame(step);
  };
  FLY.raf = requestAnimationFrame(step);
}
// the two sticks, at the bottom corners of the map
function flyUI() {
  const box = M.map?.getContainer(); if (!box || $('#flyUI')) return;
  const d = document.createElement('div'); d.id = 'flyUI';
  d.innerHTML = '<div class="joy" data-j="L" aria-label="Move where the nose points: forward, back, sideways"><i></i><b>⇡</b></div><div class="joy" data-j="R" aria-label="Fly: push to dive, pull to climb, to the side to turn"><i></i><b>◎</b></div>';
  box.append(d);
  for (const j of d.querySelectorAll('.joy')) {
    const k = j.dataset.j, knob = j.querySelector('i');
    const set = e => { const r = j.getBoundingClientRect(), R = r.width / 2; let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      FLY[k] = { x, y }; knob.style.transform = `translate(${x * R * 0.62}px, ${y * R * 0.62}px)`; };
    j.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); try { j.setPointerCapture(e.pointerId); } catch (_) {} j.classList.add('on'); set(e); });
    j.addEventListener('pointermove', e => { if (j.hasPointerCapture(e.pointerId)) set(e); });
    const end = e => { FLY[k] = { x: 0, y: 0 }; knob.style.transform = ''; j.classList.remove('on'); };
    j.addEventListener('pointerup', end); j.addEventListener('pointercancel', end);
  }
}
function flyPaint() { const c = M.cam, s = $('#flyInfo'); if (!s) return; const h = c.alt - groundAt(c.lng, c.lat);
  const v = Math.hypot(c.vF || 0, c.vR || 0) * 3.6; s.textContent = `${fmtEle(Math.max(0, h))} above the ground · ${v > 10000 ? (v / 3600).toLocaleString('en', { maximumFractionDigits: 1 }) + ' km/s' : Math.round(v).toLocaleString('en') + ' km/h'}`; }
// the tip of the obelisk: the ground where it stands and its height as placed (times its size)
function obelTip() { const g = M.cfg.gnomon; if (!g || !M.map) return null; const eye = (g.h || 30) * obelK(); return { lng: g.lng, lat: g.lat, alt: groundAt(g.lng, g.lat) + eye, eye }; }
function camObelisk() {
  const t = obelTip(); if (!t) { note('Set up the obelisk first: drag it from the sundial onto the map.'); return; }
  const s = sunOn() ? sunAt(sunPos(sunTime()), t.lng, t.lat) : null; if (M.cam?.mode === 'exp') M.camPrevExp = { ...M.cam };
  camTake('obel', { ...t, br: s && s.alt > -10 ? s.az : M.map.getBearing(), pt: 92, roll: camCfg().roll ? camCfg().rollv || 0 : 0 });   // (facing the sun, if it is up)
}
// the bar over the map while the camera is our own: what it is, and the ways out
function camBar() {
  const box = M.map?.getContainer(); if (!box) return; let b = $('#camBar');
  if (!M.cam || M.cam.mode === 'exp') { b?.remove(); return; }
  if (!b) { b = document.createElement('div'); b.id = 'camBar'; b.className = 'cambar'; box.append(b); }
  const o = M.cam.mode === 'obel', h = o ? `<span class="cbl">${OBEL_EYE_ICON}From the obelisk</span><button type="button" data-camnorth="1" title="Face north">N</button><button type="button" data-camzen="1" title="Look straight up">⤒</button><button type="button" data-camsky="1" title="All-sky view">◎</button><button type="button" data-camleave="1" title="Back to the map">✕</button>`
    : `<span class="cbl">${ICARUS_ICON}Free flight</span><small id="flyInfo"></small><button type="button" data-flyfwd="1" title="Level the nose, the view as at the start">↺</button><button type="button" data-camleave="1" title="Back to the map">✕</button>`;
  if (b.dataset.m !== M.cam.mode) { b.innerHTML = h; b.dataset.m = M.cam.mode; }
}
document.addEventListener('click', ev => { const b = ev.target.closest?.('#camBar button, #allSky button'); if (b) camClick(b); });

// ---------------------------------------------------------------- gestures while the camera is our own
function camGestures() {
  const m = M.map, el = m?.getCanvasContainer(); if (!el || el._camG) return; el._camG = true;
  const P = new Map(); let g0 = null;
  const two = () => { const [a, b] = [...P.values()]; return { d: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  const degPx = () => (m.getVerticalFieldOfView?.() || 37) / Math.max(200, m.getCanvas().clientHeight);
  const ex = () => M.cam && (M.cam.mode === 'exp' || M.cam.mode === 'fly');   // (the explorer's gestures – in flight too, v401)
  el.addEventListener('pointerdown', e => { if (!M.cam) return; P.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { el.setPointerCapture?.(e.pointerId); } catch (_) {} if (P.size === 2) g0 = { ...two(), fov: m.getVerticalFieldOfView(), roll: M.cam.roll || 0 };
    if (ex()) expDown(e, P, two); }, true);
  el.addEventListener('pointermove', e => {
    if (!M.cam || !P.has(e.pointerId)) return; const q = P.get(e.pointerId), dx = e.clientX - q.x, dy = e.clientY - q.y;
    if (ex()) { P.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (M.obGrab == null) expMoveG(e, P, two, dx, dy); return; }
    if (P.size === 1) { const k = degPx(); P.set(e.pointerId, { x: e.clientX, y: e.clientY }); M.cam.br -= dx * k; M.cam.pt += dy * k; camApply(); return; }   // (the obelisk's view: look round)
    P.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (P.size !== 2 || !g0) return;
    const t = two(); M.cam.roll = g0.roll + (t.a - g0.a) / RAD;
    const f = Math.max(10, Math.min(150, g0.fov * g0.d / Math.max(10, t.d))); m.setVerticalFieldOfView(f);   // (the lens in the obelisk's view only for the while – v392)
    camApply();
  }, true);
  const up = e => { const had = P.has(e.pointerId); P.delete(e.pointerId); if (P.size < 2) g0 = null; if (had && ex()) expUp(e, P, two); };
  el.addEventListener('pointerup', up, true); el.addEventListener('pointercancel', up, true);
  el.addEventListener('contextmenu', e => { if (ex()) e.preventDefault(); });   // (the right button turns the head)
  el.addEventListener('wheel', e => { if (!M.cam) return; e.preventDefault(); e.stopPropagation();
    if (ex()) { expWheel(e); return; }
    const f = Math.max(10, Math.min(150, m.getVerticalFieldOfView() * Math.exp(e.deltaY * 0.001))); m.setVerticalFieldOfView(f); camApply(); }, { capture: true, passive: false });
  addEventListener('keydown', e => {
    if (!M.cam || e.target.closest?.('input, textarea, select, [contenteditable]')) return; const k = e.key.toLowerCase();
    if (M.cam.mode === 'fly' && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { FLY.keys.add(k); e.preventDefault(); return; }   // (the keys as the sticks)
    if (ex() && expKey(k)) { e.preventDefault(); return; }
    const tn = { arrowleft: [-3, 0], arrowright: [3, 0], arrowup: [0, 3], arrowdown: [0, -3] }[k];
    if (tn && M.cam.mode === 'obel') { M.cam.br += tn[0]; M.cam.pt += tn[1]; camApply(); e.preventDefault(); }
    if (k === 'escape' && M.cam.mode !== 'exp') camLeave();
  });
  addEventListener('keyup', e => FLY.keys.delete(e.key.toLowerCase())); addEventListener('blur', () => FLY.keys.clear());
}
// ---------------------------------------------------------------- the explorer camera (593a–597a, v392; v401)
// The map's own camera hangs on the point in the middle of the view, held on the ground: as one pans, that point's height changes,
// far ahead when tilted, and the camera rose and fell with it; tilted up, it could end beneath the ground and was thrown up again.
// The explorer is a camera of its own: a point with its height above the sea and its direction; every gesture moves that point.
// One finger grabs the ground – the spot under it stays under it, near and far, zoomed in or out (the globe turned like a ball, over
// the poles too – v401); a finger on the sky moves nothing (v402).
// Two fingers grab what lies between them and pull it across the screen, the camera turning where it stands (v407); pinched they fly
// towards it or away (595a), twisted they circle about it. Three fingers up or down tilt as well. The mouse wheel as the pinch; the
// right button (or Ctrl) as two fingers; a double tap on the ground flies halfway there. A fling glides on. The only correction: a floor
// 20 m above the ground beneath the camera – where the ground rises into it, the camera is lifted, eased over a third of a second
// (596a). Every move is made on the sphere (the camera's place and its directions turned together about the earth's centre).
const EXP_FLOOR = 20, EXP = { w: [0, 0, 0], raf: 0, last: 0, hold: false, G: null, T: null, prev: null, look: false, tm: 0, tap: null, anim: null, moved: 0 };
const expFloor = c => c.mode === 'fly' ? 7 : EXP_FLOOR;   // (in flight 7 m – v402)
const camExpOn = () => camCfg().style !== 'trad';   // (the explorer by default again, as in v399 – v401)
function camExplore() {
  const m = M.map; if (!m || M.cam || !camExpOn()) return;
  const c = camNow(); camTake('exp', { lng: c.lng, lat: c.lat, alt: Math.max(c.alt, groundAt(c.lng, c.lat) + EXP_FLOOR), br: c.br, pt: c.pt, roll: c.roll });
  // (moves made by others – a jump to a place, the north button – taken over as they happen)
  if (!m._expSync) { m._expSync = true; m.on('move', () => { if (M.cam?.mode === 'exp' && !M.camApplying && !EXP.hold) { const n = camNow(); Object.assign(M.cam, { lng: n.lng, lat: n.lat, alt: n.alt, br: n.br, pt: n.pt }); } }); }
}
// vectors about the earth's centre (x towards 90° E, y towards the north pole, z towards 0°, 0° – as camApply)
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k], cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function rotV(v, n, a) { const c = Math.cos(a), s = Math.sin(a), d = dot3(n, v), x = cross3(n, v); return [0, 1, 2].map(i => v[i] * c + x[i] * s + n[i] * d * (1 - c)); }
const ecU = (lat, lng) => { const la = lat * RAD, lo = lng * RAD; return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)]; };
const ecNE = (lat, lng) => { const la = lat * RAD, lo = lng * RAD; return { N: [-Math.sin(la) * Math.sin(lo), Math.cos(la), -Math.sin(la) * Math.cos(lo)], E: [Math.cos(lo), 0, -Math.sin(lo)] }; };
const ecLL = p => { const r = Math.hypot(p[0], p[1], p[2]); return { lat: Math.asin(Math.max(-1, Math.min(1, p[1] / r))) / RAD, lng: Math.atan2(p[0], p[2]) / RAD }; };
// the camera's own directions (x east, y north, z up): ahead, right, up
function expBasis(c) {
  const b = c.br * RAD, e = (c.pt - 90) * RAD, f = [Math.cos(e) * Math.sin(b), Math.cos(e) * Math.cos(b), Math.sin(e)], r0 = [Math.cos(b), -Math.sin(b), 0];
  const u0 = cross3(r0, f), q = (c.roll || 0) * RAD;
  return { f, r: r0.map((v, i) => v * Math.cos(q) + u0[i] * Math.sin(q)), u: u0.map((v, i) => v * Math.cos(q) - r0[i] * Math.sin(q)) };
}
// the camera as vectors about the earth's centre: its place P, ahead v, right r, up u
function camFrame(c) {
  const U = ecU(c.lat, c.lng), { N, E } = ecNE(c.lat, c.lng), { f, r, u } = expBasis(c), L = a => [0, 1, 2].map(i => a[0] * E[i] + a[1] * N[i] + a[2] * U[i]);
  return { P: mul3(U, ER + c.alt), v: L(f), r: L(r), u: L(u) };
}
// … and back: place, height and direction from vectors (across a pole the longitude and the bearing change by half a turn, the view not)
function camFromFrame(c, P, v, u) {
  const R = Math.hypot(P[0], P[1], P[2]), ll = ecLL(P); c.alt = R - ER; c.lat = ll.lat; c.lng = ll.lng;
  const U = mul3(P, 1 / R), { N, E } = ecNE(c.lat, c.lng), vl = [dot3(v, E), dot3(v, N), dot3(v, U)], ul = [dot3(u, E), dot3(u, N), dot3(u, U)];
  c.pt = 90 + Math.asin(Math.max(-1, Math.min(1, vl[2]))) / RAD;
  // (the bearing from the line of sight; looking straight down or up, from which way the top of the picture points)
  if (Math.hypot(vl[0], vl[1]) > 1e-3) c.br = Math.atan2(vl[0], vl[1]) / RAD; else c.br = Math.atan2(vl[2] < 0 ? ul[0] : -ul[0], vl[2] < 0 ? ul[1] : -ul[1]) / RAD;
  // (the roll kept as it was set: turning about the earth's centre keeps the horizon level; moving straight towards a point should not tilt it)
}
function frameRot(c, F, n, a) { camFromFrame(c, rotV(F.P, n, a), rotV(F.v, n, a), rotV(F.u, n, a)); }
const expHgt = c => Math.max(1, c.alt - groundAt(c.lng, c.lat));
// the line of sight through a point of the screen (client coordinates), about the earth's centre
function expRay(c, cx, cy, F = camFrame(c)) {
  const m = M.map, R = m.getCanvas().getBoundingClientRect(), x = cx - R.left, y = cy - R.top, fp = R.height / 2 / Math.tan((m.getVerticalFieldOfView() || 37) * RAD / 2);
  return norm3([0, 1, 2].map(i => F.v[i] * fp + F.r[i] * (x - R.width / 2) + F.u[i] * (R.height / 2 - y)));
}
function sphHit(P, d, R) { const b = dot3(P, d), cc = dot3(P, P) - R * R, D = b * b - cc; if (D < 0) return null; const t = -b - Math.sqrt(D); return t > 0 ? t : null; }
// where a line of sight meets the ground: { p, R } (the point, and the sphere through it), or null at the sky
function expGround(c, d, F = camFrame(c)) {
  let R = ER + groundAt(c.lng, c.lat), p = null;
  for (let k = 0; k < 3; k++) { const t = sphHit(F.P, d, R); if (t == null) return null; p = add3(F.P, mul3(d, t)); const ll = ecLL(p); R = ER + groundAt(ll.lng, ll.lat); }
  return { p: mul3(norm3(p), R), R };
}
// a point to fly towards: the ground under the screen point, or (at the sky) a point ahead as far as the camera is high
function expTarget(c, cx, cy) {
  const F = camFrame(c), d = expRay(c, cx, cy, F), g = expGround(c, d, F); if (g) return { p: g.p, ground: true };
  return { p: add3(F.P, mul3(d, Math.max(50, 2 * expHgt(c)))), ground: false };
}
// towards (k < 1) or away from (k > 1) a point, turned about its vertical by db degrees of bearing; not into the floor while coming closer
function expZoom(c, T, k, db = 0) {
  const F = camFrame(c), dist = Math.hypot(...sub3(F.P, T.p)); if (k < 1 && dist * k < 5) k = 5 / Math.max(5, dist);
  let P = add3(T.p, mul3(sub3(F.P, T.p), k)), v = F.v, u = F.u;
  if (db) { const n = norm3(T.p), a = -db * RAD; P = rotV(P, n, a); v = rotV(v, n, a); u = rotV(u, n, a); }
  camFromFrame(c, P, v, u);
  if (k < 1) c.alt = Math.max(c.alt, groundAt(c.lng, c.lat) + expFloor(c));
}
// a move along the earth by metres east and north (on a great circle – over the poles too); gives its turn [axis, angle]
function expShift(c, de, dn) {
  const F = camFrame(c), { N, E } = ecNE(c.lat, c.lng), D = add3(mul3(E, de), mul3(N, dn)), L = Math.hypot(...D); if (L < 1e-9) return null;
  const n = norm3(cross3(F.P, D)), a = L / Math.hypot(...F.P); frameRot(c, F, n, a); return [n, a];
}
function expTravel(c, F, Dt, dt) { const L = Math.hypot(...Dt); if (L < 1e-9) return; const n = norm3(cross3(F.P, Dt)); frameRot(c, F, n, L * dt / Math.hypot(...F.P)); }
const expW = (n, a, dt) => { const w = mul3(n, a / Math.max(0.008, dt)); EXP.w = [0, 1, 2].map(i => 0.6 * EXP.w[i] + 0.4 * w[i]); };
// the glide after a fling, the lift where the ground rises into the floor, and a short flight (a double tap)
function expTick() {
  if (EXP.raf) return; EXP.last = performance.now();
  const step = now => { EXP.raf = 0; const c = M.cam; if (!c || (c.mode !== 'exp' && c.mode !== 'fly')) return; const dt = Math.min(0.1, (now - EXP.last) / 1000); EXP.last = now; let more = false;
    const wl = Math.hypot(...EXP.w), R = ER + c.alt;
    if (!EXP.hold && wl * R > 0.3 * Math.sqrt(expHgt(c))) { frameRot(c, camFrame(c), mul3(EXP.w, 1 / wl), wl * dt); const f = Math.exp(-dt / 0.35); EXP.w = mul3(EXP.w, f); more = true; }
    else if (!EXP.hold) EXP.w = [0, 0, 0];
    if (EXP.anim) more = EXP.anim(now) || more;
    const g = groundAt(c.lng, c.lat), fl = expFloor(c); if (c.alt < g + 2) c.alt = g + 2;
    if (c.alt < g + fl - 0.05) { c.alt += (g + fl - c.alt) * Math.min(1, dt / 0.33); more = true; }
    camApply(); if (more) { EXP.raf = requestAnimationFrame(step); } };
  EXP.raf = requestAnimationFrame(step);
}
function expDown(e, P, two) {
  const c = M.cam; EXP.w = [0, 0, 0]; EXP.anim = null;
  if (P.size === 1) { EXP.hold = true; EXP.look = e.pointerType === 'mouse' && (e.button === 2 || e.ctrlKey || e.metaKey); EXP.tm = performance.now();
    EXP.G = EXP.look || c.mode === 'fly' ? null : expGround(c, expRay(c, e.clientX, e.clientY)); EXP.down = { x: e.clientX, y: e.clientY, t: EXP.tm }; EXP.moved = 0;
    // (the right button – and in flight one finger – grabs the landscape or the sky and pulls the view round, as two fingers do)
    EXP.LG = EXP.look || c.mode === 'fly' ? expGrab(c, e.clientX, e.clientY) : null; }
  else if (P.size === 2) exp2Start(P, two);
  else if (P.size === 3) { EXP.prev3 = [...P.values()].reduce((a, q) => a + q.y, 0) / 3; }
}
// What two fingers grab (649a, v407): the ground beneath the point between them, or, on the sky, a direction (as far as the stars)
function expGrab(c, x, y) { const F = camFrame(c), d = expRay(c, x, y, F), g = expGround(c, d, F); return g ? { p: g.p } : { dir: d }; }
const expGrabDir = (c, G) => G.p ? norm3(sub3(G.p, camFrame(c).P)) : G.dir;
// the camera turned where it stands – left or right about its own vertical, up or down – so that the line of sight through a point
// of the screen runs in the direction dT; gives the change of the tilt (degrees)
function expAim(c, x, y, dT) {
  const U = ecU(c.lat, c.lng), { N, E } = ecNE(c.lat, c.lng), loc = d => ({ el: Math.asin(Math.max(-1, Math.min(1, dot3(d, U)))), az: Math.atan2(dot3(d, E), dot3(d, N)) });
  const T = loc(dT), p0 = c.pt;
  for (let k = 0; k < 4; k++) { const D = loc(expRay(c, x, y));
    if (Math.abs(T.el) < 88 * RAD && Math.abs(D.el) < 88 * RAD) c.br += ((((T.az - D.az) / RAD) + 540) % 360) - 180;
    c.pt = Math.max(0.5, Math.min(179.5, c.pt + (T.el - D.el) / RAD)); }
  return c.pt - p0;
}
// Two fingers (v407): they grab what lies between them and pull it across the screen – up, down, sideways – the camera turning where
// it stands so that it stays beneath them (649a; 651a in flight: the head and the craft's heading). Pinched, the camera flies towards
// it or away (it stays beneath them); twisted – once past 12° – the camera circles about it (650b). The fingers are reported one at a
// time: a step is taken only once both have moved (or after 60 ms), so that the half steps between no longer pan the view.
function exp2Start(P, two) { const c = M.cam, t = two(); EXP.G = null; EXP.G2 = expGrab(c, t.x, t.y); EXP.prev = t; EXP.P = P; EXP.two = two; EXP.tw = 0; EXP.twOn = false; EXP.pz = 0; EXP.pzOn = false; EXP.fresh = new Set(); EXP.t2 = performance.now(); }
// (thresholds: a twist only past 12°; a pinch only once the fingers' distance has changed by 8% – so that pulling to tilt does not
// jitter with small pinches – v408)
const EXP_TW = 12, EXP_PZ = Math.log(1.08);
function exp2() {
  EXP.pend = false; const c = M.cam, P = EXP.P; if (!c || (c.mode !== 'exp' && c.mode !== 'fly') || !P || P.size !== 2 || !EXP.G2 || !EXP.prev) return;
  const t = EXP.two(), p = EXP.prev; EXP.prev = t; const k0 = p.d / Math.max(10, t.d), da = ((t.a - p.a) / RAD + 540) % 360 - 180;
  let k = 1; EXP.pz += Math.log(k0);
  if (EXP.pzOn) k = k0; else if (Math.abs(EXP.pz) > EXP_PZ) { EXP.pzOn = true; k = Math.exp(EXP.pz - Math.sign(EXP.pz) * EXP_PZ); }
  let tw = 0; EXP.tw += da;
  if (EXP.twOn) tw = da; else if (Math.abs(EXP.tw) > EXP_TW) { EXP.twOn = true; tw = EXP.tw - Math.sign(EXP.tw) * EXP_TW; }
  const G = EXP.G2, T = G.p ? { p: G.p } : { p: add3(camFrame(c).P, mul3(expRay(c, t.x, t.y), Math.max(50, 2 * expHgt(c)))) };
  if (Math.abs(k - 1) > 1e-4 || tw) expZoom(c, T, k, -tw);
  const dp = expAim(c, t.x, t.y, expGrabDir(c, G)); if (c.mode === 'fly') c.hd = Math.max(-80, Math.min(80, flyHd(c) + dp));
  camApply(); expTick();
}
function expMoveG(e, P, two, dx, dy) {
  const c = M.cam, m = M.map, H = m.getCanvas().clientHeight || 600;
  if (P.size === 1) {
    // (the right button, and in flight one finger: the grabbed landscape or sky pulled across – the view turns where it stands; in
    // flight its tilt is the head's, kept as the craft moves, and left and right the craft turns – 638a, 651a, v407)
    if (EXP.LG) { if (c.mode === 'fly' && !EXP.look) { EXP.moved = (EXP.moved || 0) + Math.hypot(dx, dy); if (EXP.moved < 5) return; }
      const dp = expAim(c, e.clientX, e.clientY, expGrabDir(c, EXP.LG)); if (c.mode === 'fly') c.hd = Math.max(-80, Math.min(80, flyHd(c) + dp)); camApply(); return; }
    // (a tap is no drag: nothing moves until the finger has gone 5 px – v397)
    EXP.moved = (EXP.moved || 0) + Math.hypot(dx, dy); if (EXP.moved < 5) return;
    const now = performance.now(), dt = (now - EXP.tm) / 1000; EXP.tm = now;
    if (EXP.G) {
      // (the grabbed spot kept under the finger: the earth turned about its centre so that the line of sight meets it again; past the
      // rim of the globe, the nearest point of the line of sight to it – never more than five times the height at a time near the ground)
      const F = camFrame(c), d = expRay(c, e.clientX, e.clientY, F), R = EXP.G.R, t = sphHit(F.P, d, R);
      let Hp; if (t != null) Hp = add3(F.P, mul3(d, t)); else { const q = add3(F.P, mul3(d, Math.max(0, -dot3(F.P, d)))); Hp = mul3(norm3(q), R); }
      const G = EXP.G.p, x = cross3(Hp, G), s = Math.hypot(...x);
      if (s > 1e-9) { const n = mul3(x, 1 / s), a = Math.min(Math.atan2(s, dot3(Hp, G)), Math.max(5 * expHgt(c), 2000) / ER); frameRot(c, F, n, a); expW(n, a, dt); }
    } else return;                                                       // (a finger on the sky moves nothing – v402)
    camApply(); expTick(); return;
  }
  if (P.size === 2 && EXP.G2 && EXP.prev) { (EXP.fresh ||= new Set()).add(e.pointerId); const now = performance.now();
    if (EXP.fresh.size >= 2 || now - (EXP.t2 || 0) > 60) { EXP.fresh.clear(); EXP.t2 = now; if (!EXP.pend) { EXP.pend = true; requestAnimationFrame(exp2); } } return; }
  // (three fingers: up or down pulls the view the same way – grabbed, as with two)
  if (P.size === 3 && EXP.prev3 != null) { const y = [...P.values()].reduce((a, q) => a + q.y, 0) / 3, kd = (m.getVerticalFieldOfView() || 37) / H;
    if (c.mode === 'fly') flyHead(c, (y - EXP.prev3) * kd); else c.pt = Math.max(0.5, Math.min(179.5, c.pt + (y - EXP.prev3) * kd)); EXP.prev3 = y; camApply(); }
}
function expUp(e, P, two) {
  if (P.size === 2) { exp2Start(P, two); return; }
  if (P.size === 1) { const [q] = [...P.values()]; EXP.prev = null; EXP.T = null; EXP.G2 = null; const fl = M.cam.mode === 'fly';   // (one finger left: it grabs on)
    EXP.G = fl ? null : expGround(M.cam, expRay(M.cam, q.x, q.y)); EXP.LG = fl ? expGrab(M.cam, q.x, q.y) : null; EXP.tm = performance.now(); EXP.moved = 5; return; }
  if (P.size) return;
  EXP.hold = false; EXP.T = null; EXP.G2 = null; EXP.LG = null; EXP.prev = null; if (performance.now() - EXP.tm > 90 || (EXP.moved || 0) < 8) EXP.w = [0, 0, 0];   // (no glide after a tap)
  // a double tap on the ground: towards that point, halfway (with Shift, away); on the sky, nothing
  const dn = EXP.down, now = performance.now();
  if (dn && M.cam?.mode !== 'fly' && Math.hypot(e.clientX - dn.x, e.clientY - dn.y) < 8 && now - dn.t < 300) {
    if (EXP.tap && now - EXP.tap.t < 350 && Math.hypot(e.clientX - EXP.tap.x, e.clientY - EXP.tap.y) < 30) { EXP.tap = null; EXP.w = [0, 0, 0];
      const T = expTarget(M.cam, e.clientX, e.clientY);
      if (T.ground) { const K = e.shiftKey ? 2 : 0.5, t0 = now; let done = 0;
        EXP.anim = n => { const u = Math.min(1, (n - t0) / 320), s = u * u * (3 - 2 * u), k = Math.pow(K, s) / Math.pow(K, done); done = s; expZoom(M.cam, T, k); if (u >= 1) { EXP.anim = null; return false; } return true; }; } }
    else EXP.tap = { x: e.clientX, y: e.clientY, t: now }; }
  expTick();
}
function expWheel(e) {
  const c = M.cam, T = expTarget(c, e.clientX, e.clientY), k = Math.exp(Math.max(-1, Math.min(1, e.deltaY * (e.deltaMode ? 0.05 : 0.0015))));
  EXP.w = [0, 0, 0]; expZoom(c, T, k); camApply(); expTick();
}
function expKey(k) {
  const c = M.cam, h = expHgt(c), b = c.br * RAD, mv = (f, s) => expShift(c, f * Math.sin(b) + s * Math.cos(b), f * Math.cos(b) - s * Math.sin(b));
  const mid = () => { const r = M.map.getCanvas().getBoundingClientRect(); return expTarget(c, r.left + r.width / 2, r.top + r.height / 2); };
  if (k === 'arrowup') mv(0.15 * h, 0); else if (k === 'arrowdown') mv(-0.15 * h, 0); else if (k === 'arrowleft') c.br -= 3; else if (k === 'arrowright') c.br += 3;
  else if (k === '+' || k === '=') expZoom(c, mid(), 0.8); else if (k === '-') expZoom(c, mid(), 1.25);
  else if (k === 'pageup') c.pt = Math.min(179.5, c.pt + 3); else if (k === 'pagedown') c.pt = Math.max(0.5, c.pt - 3); else return false;
  camApply(); expTick(); return true;
}
// the button under the compass: the camera turned to look straight down, at the earth's centre, where it is (v397)
function camNadir() {
  const m = M.map; if (!m) return;
  if (!M.cam) { m.easeTo({ pitch: 0, duration: 450 }); return; }
  const c = M.cam, a0 = c.pt, a1 = 0.5, t0 = performance.now();
  const step = now => { if (M.cam !== c) return; const u = Math.min(1, (now - t0) / 450), s = u * u * (3 - 2 * u), v = a0 + (a1 - a0) * s;
    c.pt = v; camApply(); if (u < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
document.addEventListener('click', ev => { if (ev.target.closest?.('#mapNadir')) camNadir(); });
// ---------------------------------------------------------------- the all-sky view (a fisheye straight up)
// Drawn by Pult itself: the zenith in the middle, the horizon at nine tenths of the radius, a little below it to the rim (from
// high up the horizon sinks); north at the top and east at the left, as one sees the sky lying on one's back – turned by a
// finger. The sky as behind the map (Flammarion's blue, the real stars, the zodiac's lines, the sun in its colours, the moon in
// its phase); the land rising into it as seen from there: for every half degree of the compass the highest angle of the ground
// out to 150 km (the earth's curvature and the air's bending counted), from the elevation tiles.
const AS = { rot: 0, prof: null, key: '' };
function allSkyView() { const t = obelTip(); if (t) return { ...t, from: 'the obelisk’s tip' }; const c = M.map.getCenter(); return { lng: c.lng, lat: c.lat, alt: groundAt(c.lng, c.lat) + 1.7, eye: 1.7, from: 'the middle of the map', ground: true }; }
function allSkyOpen() {
  if (!M.map || $('#allSky')) return; const pop = $('#mapPop'); if (pop && pop.dataset.k === 'camera') pop.hidden = true;
  const box = M.map.getContainer(), d = document.createElement('div'); d.id = 'allSky'; d.className = 'allsky';
  d.innerHTML = `<canvas></canvas><div class="asbar"><span id="asFrom"></span><button type="button" data-assun="1" class="${M.sdOpen ? 'on' : ''}" title="Sundial: the time of day and year" aria-label="Sundial" aria-pressed="${!!M.sdOpen}">${SUNDIAL_ICON}</button><button type="button" data-asclose="1" title="Close">✕</button></div>`;
  box.append(d); AS.v = allSkyView(); AS.prof = null; AS.key = ''; $('#asFrom').textContent = 'All sky from ' + AS.v.from;
  d.querySelector('[data-asclose]').onclick = () => { d.remove(); cancelAnimationFrame(AS.raf); };
  // the sundial beside the sky (v363): opened and closed here, the sky above it – turning its hand moves sun, moon and stars
  d.querySelector('[data-assun]').onclick = async e => { const b = e.currentTarget; await sdOpen(!M.sdOpen); b.classList.toggle('on', !!M.sdOpen); b.setAttribute('aria-pressed', !!M.sdOpen); allSkyDraw(true); };
  const cv = d.querySelector('canvas'); let p0 = null, r0 = 0, a0 = 0; const P = new Map();
  const ang = e => { const r = cv.getBoundingClientRect(); return Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2); };
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); P.set(e.pointerId, e); p0 = ang(e); r0 = AS.rot; });
  cv.addEventListener('pointermove', e => { if (!P.has(e.pointerId) || P.size > 1) return; AS.rot = r0 + (ang(e) - p0); allSkyDraw(true); });   // (turned round the zenith)
  const up = e => P.delete(e.pointerId); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  allSkyHorizon(AS.v).then(p => { AS.prof = p; allSkyDraw(true); });
  const sb = d.querySelector('[data-assun]'), loop = () => { sb.classList.toggle('on', !!M.sdOpen); allSkyDraw(); AS.raf = requestAnimationFrame(loop); }; loop();
}
// the highest angle of the land for each half degree (degrees; below 0 where the horizon sinks)
async function allSkyHorizon(v) {
  const N = 720, prof = new Float32Array(N).fill(-90), dem = M.relDem; if (!dem) return null;
  const lat = v.lat * RAD, cos = Math.cos(lat), C = 40075016.7, tiles = new Map();
  const zFor = dist => Math.max(4, Math.min(MH_Z, Math.round(Math.log2(C * cos * 30 / (512 * Math.max(30, dist))))));
  const ds = []; for (let d = 60; d < 150000; d *= 1.06) ds.push(d);
  // the samples, by zoom: each tile fetched once, then read
  const at = (d, a) => { const n = d * Math.cos(a), e = d * Math.sin(a); return [v.lng + e / (mPerDeg * cos), v.lat + n / mPerDeg]; };
  const need = new Map();
  for (const d of ds) { const z = zFor(d), n2 = 2 ** z; for (let i = 0; i < N; i += (d < 2000 ? 1 : 1)) { const [lo, la] = at(d, i / N * 2 * Math.PI), fx = (lo + 180) / 360 * n2, fy = (1 - Math.log(Math.tan(Math.PI / 4 + la * RAD / 2)) / Math.PI) / 2 * n2;
    const k = `${z}/${Math.floor(fx)}/${Math.floor(fy)}`; if (!need.has(k)) need.set(k, []); need.get(k).push([i, d, fx % 1, fy % 1]); } }
  // the eye: the real ground where it stands (the flat map's ground is at 0), and its height above it
  let g0 = 0; try { const n2 = 2 ** MH_Z, fx = (v.lng + 180) / 360 * n2, fy = (1 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / Math.PI) / 2 * n2, t = await dem.getDemTile(MH_Z, Math.floor(fx), Math.floor(fy)), w = t.width; g0 = Math.max(0, t.data[Math.floor(fy % 1 * w) * w + Math.floor(fx % 1 * w)]); } catch (_) {}
  const h0 = g0 + (v.eye ?? 1.7), drop = d => d * d / (2 * ER) * 0.87;   // (the bending of the light: about a seventh of the curvature)
  for (const [k, list] of need) {
    const [z, x, y] = k.split('/').map(Number); let t; try { t = await dem.getDemTile(z, ((x % 2 ** z) + 2 ** z) % 2 ** z, y); } catch (_) { continue; }
    const w = t.width, dd = t.data;
    for (const [i, d, u, vv] of list) { const px = Math.max(0, Math.min(w - 1, Math.floor(u * w))), py = Math.max(0, Math.min(w - 1, Math.floor(vv * w))), h = dd[py * w + px];
      const a = Math.atan2(h - drop(d) - h0, d) / RAD; if (a > prof[i]) prof[i] = a; }
  }
  // where no land was found (open sea, or offline without saved relief): the sea's horizon
  const dip = -Math.acos(ER / (ER + Math.max(0, h0))) / RAD;
  for (let i = 0; i < N; i++) if (prof[i] < dip) prof[i] = dip;
  return prof;
}
function allSkyDraw(force) {
  const d = $('#allSky'); if (!d) return; const cv = d.querySelector('canvas'), W = d.clientWidth, H = d.clientHeight, dpr = devicePixelRatio || 1;
  const t = sunTime(), key = [W, H, dpr, Math.round(t / 3e4), AS.rot.toFixed(3), !!AS.prof, M.cfg.skySize, sunOn(), M.cfg.skySun, M.cfg.skyMoon, !!SKY.stars, !!SKY.zod].join();
  if (!force && key === AS.key) return; AS.key = key;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const y = cv.getContext('2d'); y.setTransform(dpr, 0, 0, dpr, 0, 0); y.clearRect(0, 0, W, H);
  const v = AS.v, cx = W / 2, cy = H / 2 - 10, R = Math.min(W, H - 40) / 2 - 18, LOW = -10;   // (the rim: 10° below the horizon)
  const rOf = alt => (90 - alt) / (90 - LOW) * R;
  const xy = (az, alt) => { const r = rOf(alt), a = az * RAD - AS.rot; return [cx - r * Math.sin(a), cy - r * Math.cos(a)]; };   // (east at the left)
  const prof = AS.prof, horizon = az => prof ? prof[Math.round(((az % 360) + 360) % 360 * 2) % 720] : 0;
  // the sky
  y.save(); y.beginPath(); y.arc(cx, cy, R, 0, 7); y.clip();
  const g = y.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, '#0f2a66'); g.addColorStop(1, '#3a73bb'); y.fillStyle = g; y.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  const f = R / ((90 - LOW) * RAD), size = M.cfg.skySize || 10;            // (pixels per radian at the zenith)
  const gm = ((18.697374558 + 24.06570982441908 * (t / 864e5 - 10957.5)) % 24 + 24) % 24 * 15;
  const altaz = (ra, dec) => sunAt({ dec, lon: ((ra - gm + 540) % 360) - 180 }, v.lng, v.lat);
  // the zodiac's lines and the stars
  y.beginPath(); y.lineWidth = 1.1; y.strokeStyle = 'rgba(214,222,232,.75)';
  for (const ln of SKY.zodRaw || []) { let on = false; for (const [ra, dec] of ln) { const a = altaz(ra, dec * RAD); if (a.alt < LOW) { on = false; continue; } const [px, py] = xy(a.az, a.alt); y[on ? 'lineTo' : 'moveTo'](px, py); on = true; } }
  y.stroke();
  for (const st of skyStars() || []) { const a = altaz(st.ra, st.dec); if (a.alt < horizon(a.az) - 0.3 || a.alt < LOW) continue; const [px, py] = xy(a.az, a.alt); skyStar(y, px, py, Math.max(2, st.s * RAD * f), st); }
  if (sunOn()) {
    const s = sunAt(sunPos(t), v.lng, v.lat), im = skyImg('sun');
    if (M.cfg.skySun !== false && im && s.alt > LOW) { const [px, py] = xy(s.az, s.alt), r = Math.max(4, 0.2666 * RAD * size * f), h = r * 300 / 73;
      const sun = skySunTinted(sunTint(s.alt, s.az < 180)) || im; y.save(); y.translate(px, py); y.rotate(Math.atan2(cx - px, -(cy - py))); y.drawImage(sun, -h, -h, 2 * h, 2 * h); y.restore(); }   // (upright: its top towards the zenith)
    const mo = moonPos(t), a = sunAt(mo, v.lng, v.lat);
    if (M.cfg.skyMoon !== false && a.alt > LOW) { const [px, py] = xy(a.az, a.alt), r = Math.max(4, 0.259 * RAD * size * f), [sx, sy] = xy(s.az, s.alt), up = Math.atan2(cx - px, -(cy - py));
      const th = Math.atan2(sy - py, sx - px), sd = Math.cos(th - up) >= 0 ? 1 : -1; y.save(); y.translate(px, py); y.rotate(up); skyMoonDraw(y, r, mo.lit, sd); y.restore(); }
  }
  // the land: from the rim up to the horizon of each direction
  y.beginPath();
  for (let i = 0; i <= 720; i++) { const az = i / 2, [px, py] = xy(az, Math.max(LOW, horizon(az))); y[i ? 'lineTo' : 'moveTo'](px, py); }
  for (let i = 720; i >= 0; i--) { const az = i / 2, [px, py] = xy(az, LOW - 2); y.lineTo(px, py); }
  y.closePath(); const gl = y.createRadialGradient(cx, cy, rOf(5), cx, cy, R); gl.addColorStop(0, '#3a3020'); gl.addColorStop(1, '#16110a'); y.fillStyle = gl; y.fill();
  y.beginPath(); for (let i = 0; i <= 720; i++) { const az = i / 2, [px, py] = xy(az, Math.max(LOW, horizon(az))); y[i ? 'lineTo' : 'moveTo'](px, py); } y.lineWidth = 1.4; y.strokeStyle = '#0b0805'; y.stroke();
  // circles of height (30°, 60°) and the level horizon, faint
  y.lineWidth = 0.8; y.strokeStyle = 'rgba(255,255,255,.18)'; for (const h of [0, 30, 60]) { y.beginPath(); y.arc(cx, cy, rOf(h), 0, 7); y.stroke(); }
  y.restore();
  y.beginPath(); y.arc(cx, cy, R, 0, 7); y.lineWidth = 2; y.strokeStyle = 'rgba(255,255,255,.55)'; y.stroke();
  // the compass round the rim
  y.font = '600 15px "Source Sans 3", sans-serif'; y.textAlign = 'center'; y.textBaseline = 'middle';
  for (const [l, az] of [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]]) {
    const a = az * RAD - AS.rot, r = R + 11, px = cx - r * Math.sin(a), py = cy - r * Math.cos(a);
    y.fillStyle = l.length === 1 ? '#fff' : 'rgba(255,255,255,.6)'; y.font = `${l.length === 1 ? 600 : 400} ${l.length === 1 ? 15 : 11}px "Source Sans 3", sans-serif`; y.fillText(l, px, py); }
  const lab = $('#asFrom'); if (lab) lab.textContent = `All sky from ${v.from} · ${sunLabel().main} · ${sunLabel().sub}` + (prof ? '' : ' · working out the horizon …');
}
