// ================================================================ Pult · the camera (v354)
// The Camera menu (button beside Globe): how freely the map's camera may move, and other points of view. Every choice can be
// switched on and off:
//   Look up      – tilt beyond the horizon, up to the zenith (the engine allows 180°; Pult otherwise stops at 85°)
//   Deep zoom    – zoom in to 20 (otherwise 16)
//   Lens         – the field of view, 10° (telephoto) … 150° (wide angle); otherwise the engine's ~37°
//   Roll         – the horizon tilted sideways (a slider; twirling with two fingers in flight and from the obelisk)
//   Free flight  – the camera flies itself instead of circling a point on the ground: drag to look round, two fingers to fly
//                  (pinch forward and back, slide sideways and up, twirl to roll), the mouse wheel forward and back, keys
//                  W A S D / arrows, Q E down and up
//   From the obelisk – the camera at the tip of the obelisk (its height as placed, times its size): drag to look round, pinch
//                  for the lens, twirl to roll; the obelisk itself hidden meanwhile
//   All-sky view – a fisheye straight up: the whole sky down to the horizon, the mountains cutting into it worked out from the
//                  elevation – from the obelisk's tip, or without one from the middle of the map (on the ground)
// The engine places a camera by its own position and the point it looks at (calculateCameraOptionsFromTo); the free camera and
// the obelisk view set it so on every movement. Settings (mapCfg): cam { tilt, deep, lens, fov, roll, rollv, fly }.

const CAM_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M3.5 8.2h3.2l1.6-2.4h7.4l1.6 2.4h3.2v10H3.5z"/><circle cx="12" cy="13" r="3.4"/><path d="M17.6 10.3h.01" stroke-width="2" stroke-linecap="round"/></g></svg>';
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
function camInit() { camLimits(); }

// ---------------------------------------------------------------- the menu
function camHTML() {
  const c = camCfg(), g = !!M.cfg.gnomon, sw = (k, l, sub) => `<label class="mrow"><span>${l}${sub ? `<small class="cmh">${sub}</small>` : ''}</span>${SW(`data-camopt="${k}"`, !!c[k])}</label>`;
  return sw('tilt', 'Look up to the sky', 'tilt beyond the horizon, up to the zenith')
    + sw('deep', 'Deep zoom', 'to 20 instead of 16')
    + sw('lens', 'Lens')
    + (c.lens ? `<label class="mrow msub"><span>Field of view <output id="camFovOut">${Math.round(c.fov || 60)}°</output></span><input type="range" min="10" max="150" step="1" value="${c.fov || 60}" data-camfov="1" aria-label="Field of view"></label>` : '')
    + sw('roll', 'Roll', 'the horizon tilted sideways')
    + (c.roll ? `<label class="mrow msub"><span>Roll <output id="camRollOut">${Math.round(c.rollv || 0)}°</output></span><input type="range" min="-180" max="180" step="1" value="${c.rollv || 0}" data-camroll="1" aria-label="Roll"></label>` : '')
    + sw('fly', 'Free flight', 'drag to look round, two fingers to fly')
    + `<button type="button" class="mrsave" data-camobel="1"${g ? '' : ' disabled'}>${M.cam?.mode === 'obel' ? 'Leave the obelisk' : 'View from the obelisk’s tip'}</button>`
    + (g ? '' : '<small class="hint mrow">Place an obelisk first: Here, in the sundial.</small>')
    + `<button type="button" class="mrsave" data-camsky="1">All-sky view${g ? ' from the obelisk' : ''}</button>`;
}
function camPop() { rightPop('camera', 'Camera', camHTML()); }
function camPopRefresh() { const pop = $('#mapPop'); if (!pop.hidden && pop.dataset.k === 'camera') { const y = pop.scrollTop; pop.innerHTML = `<div class="mph"><span class="navh">Camera</span></div>${camHTML()}`; pop.scrollTop = y; } }
async function camClick(b) {
  const d = b.dataset;
  if (b.id === 'mapCamBtn') { camPop(); return true; }
  if (d.camobel) { if (M.cam?.mode === 'obel') camLeave(); else camObelisk(); camPopRefresh(); return true; }
  if (d.camsky) { allSkyOpen(); return true; }
  if (d.camleave) { camLeave(); camPopRefresh(); return true; }
  if (d.camnorth) { if (M.cam) { M.cam.br = 0; camApply(); } return true; }
  if (d.camzen) { if (M.cam) { M.cam.pt = 178; camApply(); } return true; }
  return false;
}
document.addEventListener('change', async ev => {
  const k = ev.target.dataset?.camopt; if (!k) return;
  camCfg()[k] = ev.target.checked; await saveMapCfg();
  if (k === 'fly') { if (ev.target.checked) camFly(); else if (M.cam?.mode === 'fly') camLeave(); }
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
// M.cam = { mode: 'fly' | 'obel', lng, lat, alt (metres above sea level), br (bearing), pt (0 down, 90 level, 180 up), roll }
function groundAt(lng, lat) { const m = M.map; if (!m?.getTerrain()) return 0; try { return m.queryTerrainElevation([lng, lat]) || 0; } catch (_) { return 0; } }
function camApply() {
  const m = M.map, c = M.cam; if (!m || !c) return;
  c.pt = Math.max(0.5, Math.min(179.5, c.pt)); c.br = ((c.br % 360) + 360) % 360; c.lat = Math.max(-85, Math.min(85, c.lat)); c.lng = ((c.lng + 540) % 360) - 180;
  if (c.mode === 'fly') c.alt = Math.max(groundAt(c.lng, c.lat) + 2, c.alt);
  // the engine wants a point the camera looks at ("the centre"): where its line of sight meets the ground – or, looking level
  // or up, a point some way along it, above the ground. (Left to choose by itself, the engine may put that point far
  // beneath the ground, and then the near ground is not drawn.)
  const e = (c.pt - 90) * RAD, g = groundAt(c.lng, c.lat), h = Math.max(1, c.alt - g);
  const L = e < -0.03 ? Math.min(30000, h / Math.sin(-e)) : Math.max(300, Math.min(20000, h * 8));
  const D = L * Math.cos(e), b = c.br * RAD, tlat = c.lat + D * Math.cos(b) / mPerDeg, tlng = c.lng + D * Math.sin(b) / (mPerDeg * Math.max(0.05, Math.cos(c.lat * RAD)));
  try { const o = m.calculateCameraOptionsFromTo({ lng: c.lng, lat: c.lat }, c.alt, { lng: tlng, lat: tlat }, c.alt + L * Math.sin(e)); o.roll = c.roll || 0; m.jumpTo(o); } catch (_) {}
  camBar();
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
  M.cam = { mode, ...c }; m.setCenterClampedToGround?.(false); camLimits(); camGestures(); camApply(); obelUpd(); m.triggerRepaint();
}
function camLeave() {
  const m = M.map; if (!M.cam || !m) return; const was = M.camWas; M.cam = null;
  for (const h of ['dragPan', 'dragRotate', 'scrollZoom', 'touchZoomRotate', 'touchPitch', 'keyboard', 'doubleClickZoom', 'boxZoom']) m[h]?.enable();
  m.setCenterClampedToGround?.(true); camLimits();
  if (camCfg().fly) camCfg().fly = false, saveMapCfg();
  if (was) m.jumpTo({ center: was.center, zoom: was.zoom, bearing: was.bearing, pitch: Math.min(was.pitch, m.getMaxPitch()), roll: camCfg().roll ? camCfg().rollv || 0 : 0 });
  camBar(); obelUpd(); m.triggerRepaint();
}
function camFly() { if (!M.map) return; const c = camNow(); camTake('fly', { ...c, pt: c.pt < 20 ? 45 : Math.min(179, c.pt) }); }   // (from straight above: looking ahead and down, to fly)
// the tip of the obelisk: the ground where it stands and its height as placed (times its size)
function obelTip() { const g = M.cfg.gnomon; if (!g || !M.map) return null; const eye = (g.h || 30) * obelK(); return { lng: g.lng, lat: g.lat, alt: groundAt(g.lng, g.lat) + eye, eye }; }
function camObelisk() {
  const t = obelTip(); if (!t) { note('Place an obelisk first: Here, in the sundial.'); return; }
  const s = sunOn() ? sunAt(sunPos(sunTime()), t.lng, t.lat) : null;
  camTake('obel', { ...t, br: s && s.alt > -10 ? s.az : M.map.getBearing(), pt: 92, roll: camCfg().roll ? camCfg().rollv || 0 : 0 });   // (facing the sun, if it is up)
}
// the bar over the map while the camera is our own: what it is, and the ways out
function camBar() {
  const box = M.map?.getContainer(); if (!box) return; let b = $('#camBar');
  if (!M.cam) { b?.remove(); return; }
  if (!b) { b = document.createElement('div'); b.id = 'camBar'; b.className = 'cambar'; box.append(b); }
  const o = M.cam.mode === 'obel', h = `<span>${o ? 'From the obelisk' : 'Free flight'}</span><button type="button" data-camnorth="1" title="Face north">N</button><button type="button" data-camzen="1" title="Look straight up">⤒</button><button type="button" data-camsky="1" title="All-sky view">◎</button><button type="button" data-camleave="1" title="Back to the map">✕</button>`;
  if (b.dataset.m !== M.cam.mode) { b.innerHTML = h; b.dataset.m = M.cam.mode; }
}
document.addEventListener('click', ev => { const b = ev.target.closest?.('#camBar button, #allSky button'); if (b) camClick(b); });

// ---------------------------------------------------------------- gestures while the camera is our own
function camGestures() {
  const m = M.map, el = m?.getCanvasContainer(); if (!el || el._camG) return; el._camG = true;
  const P = new Map(); let g0 = null;
  const two = () => { const [a, b] = [...P.values()]; return { d: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  const degPx = () => (m.getVerticalFieldOfView?.() || 37) / Math.max(200, el.clientHeight);
  el.addEventListener('pointerdown', e => { if (!M.cam) return; P.set(e.pointerId, { x: e.clientX, y: e.clientY }); el.setPointerCapture?.(e.pointerId); if (P.size === 2) g0 = { ...two(), fov: m.getVerticalFieldOfView(), roll: M.cam.roll || 0 }; }, true);
  el.addEventListener('pointermove', e => {
    if (!M.cam || !P.has(e.pointerId)) return; const q = P.get(e.pointerId), dx = e.clientX - q.x, dy = e.clientY - q.y;
    if (P.size === 1) { const k = degPx(); M.cam.br -= dx * k; M.cam.pt += dy * k; P.set(e.pointerId, { x: e.clientX, y: e.clientY }); camApply(); return; }   // (look round: the world follows the finger)
    P.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (P.size !== 2 || !g0) return;
    const t = two(); M.cam.roll = g0.roll + (t.a - g0.a) / RAD;
    if (M.cam.mode === 'obel') { const f = Math.max(10, Math.min(150, g0.fov * g0.d / Math.max(10, t.d))); m.setVerticalFieldOfView(f); camCfg().fov = Math.round(f); }
    else { camMove(Math.log(t.d / g0.d) * camStep() * 3, -(t.x - g0.x) * camStep() / 150, (t.y - g0.y) * camStep() / 150); g0 = { ...g0, ...t, roll: M.cam.roll }; }
    camApply();
  }, true);
  const up = e => { P.delete(e.pointerId); if (P.size < 2) g0 = null; };
  el.addEventListener('pointerup', up, true); el.addEventListener('pointercancel', up, true);
  el.addEventListener('wheel', e => { if (!M.cam) return; e.preventDefault(); e.stopPropagation();
    if (M.cam.mode === 'obel') { const f = Math.max(10, Math.min(150, m.getVerticalFieldOfView() * Math.exp(e.deltaY * 0.001))); m.setVerticalFieldOfView(f); camCfg().fov = Math.round(f); }
    else { camMove(-e.deltaY / 400 * camStep(), 0, 0); camApply(); } }, { capture: true, passive: false });
  addEventListener('keydown', e => {
    if (!M.cam || e.target.closest?.('input, textarea, select, [contenteditable]')) return; const k = e.key.toLowerCase(), s = camStep() * (e.shiftKey ? 4 : 1) / 6;
    const mv = { w: [s, 0, 0], s: [-s, 0, 0], a: [0, -s, 0], d: [0, s, 0], q: [0, 0, -s], e: [0, 0, s] }[k];
    if (mv && M.cam.mode === 'fly') { camMove(...mv); camApply(); e.preventDefault(); return; }
    const tn = { arrowleft: [-3, 0], arrowright: [3, 0], arrowup: [0, 3], arrowdown: [0, -3] }[k];
    if (tn) { M.cam.br += tn[0]; M.cam.pt += tn[1]; camApply(); e.preventDefault(); }
    if (k === 'escape') camLeave();
  });
}
// a step for flying: about the height above the ground (from 10 m up), so that slow near the ground, fast high up
function camStep() { const c = M.cam; return Math.max(10, Math.min(2e6, (c.alt - groundAt(c.lng, c.lat)) * 0.6)); }
// moved by f metres forward (where it looks), r to the right, u up
function camMove(f, r, u) {
  const c = M.cam, b = c.br * RAD, e = (c.pt - 90) * RAD;
  const east = f * Math.sin(b) * Math.cos(e) + r * Math.cos(b), north = f * Math.cos(b) * Math.cos(e) - r * Math.sin(b), upm = f * Math.sin(e) + u;
  c.lat += north / mPerDeg; c.lng += east / (mPerDeg * Math.max(0.05, Math.cos(c.lat * RAD))); c.alt += upm;
}

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
  d.innerHTML = `<canvas></canvas><div class="asbar"><span id="asFrom"></span><button type="button" data-asclose="1" title="Close">✕</button></div>`;
  box.append(d); AS.v = allSkyView(); AS.prof = null; AS.key = ''; $('#asFrom').textContent = 'All sky from ' + AS.v.from;
  d.querySelector('[data-asclose]').onclick = () => { d.remove(); cancelAnimationFrame(AS.raf); };
  const cv = d.querySelector('canvas'); let p0 = null, r0 = 0, a0 = 0; const P = new Map();
  const ang = e => { const r = cv.getBoundingClientRect(); return Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2); };
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); P.set(e.pointerId, e); p0 = ang(e); r0 = AS.rot; });
  cv.addEventListener('pointermove', e => { if (!P.has(e.pointerId) || P.size > 1) return; AS.rot = r0 + (ang(e) - p0); allSkyDraw(true); });   // (turned round the zenith)
  const up = e => P.delete(e.pointerId); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  allSkyHorizon(AS.v).then(p => { AS.prof = p; allSkyDraw(true); });
  const loop = () => { allSkyDraw(); AS.raf = requestAnimationFrame(loop); }; loop();
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
