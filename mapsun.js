// ================================================================ Pult · the map menu, the sun, the projection icon (v297)
// The map menu (button at the top right): base map and imagery, relief, the view (globe or flat, 3D, north up) and
// sunlight. The other button beside it (Layers) keeps places, political, built world, names and your own drawings.
// Sunlight: day and night on the map – the night side darkened, with a soft twilight edge (the sun 0°, 6°, 12° and 18°
// below the horizon), and the relief lit from where the sun stands over the middle of the map. “Now” follows the real
// sun; “Animate” lets the days run (one day in 5 s … 60 s); the sundial in the menu sets the hour by hand.
// Settings (mapCfg): sun, sunMode ('now' | 'anim' | 'set'), sunSpeed (seconds per day), sunFmt ('modern' | 'roman' | 'greek').

// ---------------------------------------------------------------- the sun's position
const RAD = Math.PI / 180;
function sunPos(ms) {
  const d = ms / 864e5 - 10957.5;                                    // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * RAD, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD, e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  let lon = (ra / RAD / 15 - gmst) * 15; lon = ((lon + 540) % 360) - 180;
  return { dec, lon };                                               // the point beneath the sun (dec: radians, lon: degrees)
}
// height and direction of the sun at a place (degrees; azimuth clockwise from north)
function sunAt(s, lon, lat) {
  const H = (lon - s.lon) * RAD, f = lat * RAD;
  const alt = Math.asin(Math.sin(f) * Math.sin(s.dec) + Math.cos(f) * Math.cos(s.dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(f) - Math.tan(s.dec) * Math.cos(f)) / RAD + 180;
  return { alt: alt / RAD, az: (az + 360) % 360 };
}
// the night (sun below h degrees) as polygons: along each meridian the night is one stretch of latitude
function nightPolys(s, h) {
  const c = Math.sin(h * RAD), runs = [];
  let run = null;
  for (let lon = -180; lon <= 180; lon += 2) {
    const B = Math.cos(s.dec) * Math.cos((lon - s.lon) * RAD), A = Math.sin(s.dec), f = lat => A * Math.sin(lat * RAD) + B * Math.cos(lat * RAD);
    let lo = null, hi = null, prev = f(-90);
    if (prev < c) lo = -90;
    for (let lat = -89; lat <= 90; lat++) {
      const v = f(lat), night = v < c, was = prev < c;
      if (night && !was) lo = lat - 1 + (prev - c) / (prev - v);
      if (!night && was) hi = lat - 1 + (prev - c) / (prev - v);
      prev = v;
    }
    if (lo != null && hi == null) hi = 90;
    if (lo == null) { if (run) { runs.push(run); run = null; } continue; }
    (run ??= []).push([lon, Math.max(-89.9, lo), Math.min(89.9, hi)]);
  }
  if (run) runs.push(run);
  return runs.filter(r => r.length > 1).map(r => [[...r.map(([x, , b]) => [x, b]), ...r.reverse().map(([x, a]) => [x, a]), [r[r.length - 1][0], r[r.length - 1][2]]]]);
}
function nightFC(ms) {
  const s = sunPos(ms);
  return { type: 'FeatureCollection', features: [0, -6, -12, -18].flatMap(h => nightPolys(s, h).map(co => ({ type: 'Feature', properties: { h }, geometry: { type: 'Polygon', coordinates: co } }))) };
}

// ---------------------------------------------------------------- on the map
const sunOn = () => !!M.cfg?.sun;
const sunTime = () => (M.sunT ??= Date.now());
function sunStyle(st) {                                             // (called by layerStyle)
  if (!sunOn()) return;
  st.sources.sunnight = { type: 'geojson', data: nightFC(sunTime()) };
  const k = st.layers.findIndex(l => l.id === 'pl-region');
  st.layers.splice(k < 0 ? st.layers.length : k, 0, { id: 'sun-night', type: 'fill', source: 'sunnight', paint: { 'fill-color': '#020611', 'fill-opacity': 0.17, 'fill-antialias': false } });
}
function sunApply() {
  const m = M.map; if (!m) return;
  if (sunOn()) {
    m.getSource('sunnight')?.setData(nightFC(sunTime()));
    if (m.getLayer('rel-shade')) { const c = m.getCenter(), a = sunAt(sunPos(sunTime()), c.lng, c.lat);
      m.setPaintProperty('rel-shade', 'hillshade-illumination-anchor', 'map'); m.setPaintProperty('rel-shade', 'hillshade-illumination-direction', Math.round(a.az)); }
  } else if (m.getLayer('rel-shade')) { m.setPaintProperty('rel-shade', 'hillshade-illumination-anchor', 'viewport'); m.setPaintProperty('rel-shade', 'hillshade-illumination-direction', 335); }
  sundialPaint();
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
  sunApply();
}
async function sunSet(patch) {
  Object.assign(M.cfg, patch); await saveMapCfg();
  if ('sun' in patch && M.map) { M.map.setStyle(mapStyle(M.colors)); M.map.once('styledata', () => setTimeout(() => { refreshMapData(); sunClock(); }, 50)); }
  else sunClock();
  refreshLayersPop();
}

// ---------------------------------------------------------------- the sundial (the hour at the middle of the map)
const GR_NUM = ['αʹ', 'βʹ', 'γʹ', 'δʹ', 'εʹ', 'ϛʹ', 'ζʹ', 'ηʹ', 'θʹ', 'ιʹ', 'ιαʹ', 'ιβʹ'], RO_NUM = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
function sunHour() {                                                 // local sun time (hours) and day length at the middle of the map
  const c = M.map?.getCenter() || { lng: 24, lat: 38 }, t = sunTime(), s = sunPos(t);
  const lst = ((12 + (c.lng - s.lon) / 15) % 24 + 24) % 24;                     // (true sun time: noon when the sun is due south)
  const cosH = (Math.sin(-0.833 * RAD) - Math.sin(c.lat * RAD) * Math.sin(s.dec)) / (Math.cos(c.lat * RAD) * Math.cos(s.dec));
  const half = cosH <= -1 ? 12 : cosH >= 1 ? 0 : Math.acos(cosH) / RAD / 15;     // half the day, in hours
  return { lst, rise: 12 - half, set: 12 + half, lat: c.lat, lng: c.lng };
}
function sunLabel() {
  const { lst, rise, set } = sunHour(), fmt = M.cfg.sunFmt || 'modern';
  const hm = `${String(Math.floor(lst)).padStart(2, '0')}:${String(Math.floor(lst % 1 * 60)).padStart(2, '0')}`;
  const date = new Date(sunTime()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (fmt === 'modern' || set - rise <= 0 || set - rise >= 24) return { main: hm, sub: `sun time · ${date}` };
  const day = lst >= rise && lst < set;
  if (day) { const n = Math.min(11, Math.floor((lst - rise) / ((set - rise) / 12)));
    return fmt === 'roman' ? { main: `hora ${RO_NUM[n].toLowerCase() === 'i' ? 'prima' : RO_NUM[n]}`, sub: date } : { main: `ὥρα ${GR_NUM[n]}`, sub: date }; }
  const night = 24 - (set - rise), since = (lst - set + 24) % 24, w = Math.min(3, Math.floor(since / (night / 4)));
  return fmt === 'roman' ? { main: `vigilia ${RO_NUM[w]}`, sub: date } : { main: `φυλακὴ ${GR_NUM[w]}`, sub: date };
}
function sundialHTML() {
  return `<div class="sdial" id="sunDial"><svg viewBox="-60 -60 120 120" aria-hidden="true"><circle r="54" class="sdring"/><circle r="40" class="sdin"/>`
    + Array.from({ length: 24 }, (_, h) => { const a = (h - 12) / 24 * 2 * Math.PI, r1 = h % 6 ? 50 : 46; return `<line x1="${(Math.sin(a) * r1).toFixed(1)}" y1="${(-Math.cos(a) * r1).toFixed(1)}" x2="${(Math.sin(a) * 54).toFixed(1)}" y2="${(-Math.cos(a) * 54).toFixed(1)}"/>`; }).join('')
    + `<path class="sdday" d=""/><line class="sdshadow" x1="0" y1="0" x2="0" y2="0"/><circle class="sdg" r="2.2"/><circle class="sdsun" r="5.5"/></svg>`
    + `<div class="sdlab"><b id="sunLab"></b><small id="sunSub"></small></div></div>`;
}
function sundialPaint() {
  const el = $('#sunDial'); if (!el) return;
  const { lst, rise, set } = sunHour(), ang = h => (h - 12) / 24 * 2 * Math.PI, P = (h, r) => [Math.sin(ang(h)) * r, -Math.cos(ang(h)) * r];
  const [sx, sy] = P(lst, 54); const sun = el.querySelector('.sdsun'); sun.setAttribute('cx', sx.toFixed(1)); sun.setAttribute('cy', sy.toFixed(1));
  const up = lst >= rise && lst < set; sun.classList.toggle('down', !up);
  const [gx, gy] = P(lst + 12, 34); const sh = el.querySelector('.sdshadow'); sh.setAttribute('x2', up ? gx.toFixed(1) : 0); sh.setAttribute('y2', up ? gy.toFixed(1) : 0);
  if (set > rise && set - rise < 24) { const [ax, ay] = P(rise, 54), [bx, by] = P(set, 54); el.querySelector('.sdday').setAttribute('d', `M${ax.toFixed(1)} ${ay.toFixed(1)}A54 54 0 ${set - rise > 12 ? 1 : 0} 1 ${bx.toFixed(1)} ${by.toFixed(1)}`); }
  else el.querySelector('.sdday').setAttribute('d', set - rise >= 24 ? 'M0 -54A54 54 0 1 1 -0.01 -54' : '');
  const l = sunLabel(); $('#sunLab').textContent = l.main; $('#sunSub').textContent = l.sub;
}
// a finger (or the mouse) on the dial sets the hour; the day stays
document.addEventListener('pointerdown', ev => {
  const dial = ev.target.closest?.('#sunDial svg'); if (!dial) return;
  ev.preventDefault(); dial.setPointerCapture?.(ev.pointerId);
  const set = e => {
    const r = ($('#sunDial svg') || dial).getBoundingClientRect(),        /* (the menu may have been drawn anew meanwhile) */ x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
    const h = ((Math.atan2(x, -y) / (2 * Math.PI)) * 24 + 12 + 24) % 24, { lst } = sunHour();
    let dh = h - lst; if (dh > 12) dh -= 24; if (dh < -12) dh += 24;
    M.sunT = sunTime() + dh * 36e5; sunApply();
  };
  if ((M.cfg.sunMode || 'now') !== 'set') { M.cfg.sunMode = 'set'; saveMapCfg(); sunClock(); refreshLayersPop(); }
  set(ev);
  const mv = e => set(e), up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
});
// the speed: one day in 60 s … 5 s (a logarithmic slider)
const spdToV = s => Math.round(Math.log(60 / s) / Math.log(12) * 100), vToSpd = v => 60 / 12 ** (v / 100);
const spdLabel = s => `one day in ${s >= 9.95 ? Math.round(s) : s.toFixed(1)} s`;
document.addEventListener('input', ev => {
  const r = ev.target.closest?.('input[data-sunspeed]'); if (!r) return;
  M.cfg.sunSpeed = vToSpd(+r.value); r.nextElementSibling.textContent = spdLabel(M.cfg.sunSpeed);
  clearTimeout(M.sunSpdT); M.sunSpdT = setTimeout(saveMapCfg, 400);
});

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
function projIconAnim(el, to) {                                      // from the shape shown to the other (0.45 s, eased)
  const from = +(el.dataset.t ?? (to ? 0 : 1)), t0 = performance.now();
  const step = now => { const k = Math.min(1, (now - t0) / 450), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2, t = from + (to - from) * e;
    el.dataset.t = t; el.querySelector('.pf').setAttribute('d', projD(PROJ_LINES.front, t)); const pb = el.querySelector('.pb'); pb.setAttribute('d', projD(PROJ_LINES.back, t)); pb.setAttribute('stroke-opacity', t.toFixed(2));
    if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- the map menu
const MAPOPT_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M14.6 4.2A8 8 0 1 0 19.8 12.6"/><path d="M4 11.5h6.5M11 3.6c-2.6 3-2.6 13.8 0 16.8M11 3.6c1.2 1.4 1.8 3.3 2 5.4" stroke-width="1.1"/><circle cx="18" cy="6.5" r="2.1"/><path d="M18 2.9v1.2M18 8.9v1.2M14.4 6.5h1.2M20.4 6.5h1.2M15.5 4l.8.8M19.7 8.2l.8.8M15.5 9l.8-.8M19.7 4.8l.8-.8" stroke-width="1.2"/></g></svg>';
const COMPASS_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 15 12h-6z" fill="var(--acc)"/><path d="M12 20.5 9 12h6z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
function mapOptsHTML() {
  const c = M.cfg, grp = (k, t, body) => foldSec(k, t, body), glb = viewOn('globe');
  const view = `<button type="button" class="mtg mproj" id="mapProjBtn" data-t="${glb ? 0 : 1}">${projIconSVG(glb ? 0 : 1)}<span>${glb ? 'Globe' : 'Flat map (Mercator)'}</span></button>`
    + tgl('t3d', '3D terrain and tilting', viewOn('t3d'))
    + `<div class="macts"><button type="button" data-mnorth="1">North up</button></div><p class="hint small">Turn the map with two fingers (with a mouse: the right button); the compass that then appears turns it back.</p>`;
  const spd = c.sunSpeed || 20, mode = c.sunMode || 'now';
  const sun = tgl('sun', 'Day and night', sunOn()) + (sunOn()
    ? `<div class="seg" role="group">${[['now', 'Now'], ['anim', 'Animate']].map(([v, l]) => `<button type="button" data-sunmode="${v}" class="${mode === v ? 'on' : ''}">${l}</button>`).join('')}</div>`
      + (mode === 'anim' ? `<div class="msun"><button type="button" class="mico2" data-sunplay="1" aria-label="${M.sunPause ? 'Play' : 'Pause'}" title="${M.sunPause ? 'Play' : 'Pause'}">${M.sunPause ? '▶' : '❚❚'}</button><input type="range" min="0" max="100" value="${spdToV(spd)}" data-sunspeed="1" aria-label="Speed"><output>${spdLabel(spd)}</output></div>` : '')
      + sundialHTML() + segc('sunFmt', [['modern', 'Modern'], ['roman', 'Roman'], ['greek', 'Greek']])
      + `<p class="hint small">Hold the sun on the dial and move it round to set the hour (sun time at the middle of the map). Roman and Greek: the twelve hours of the day, from sunrise to sunset, and the four watches of the night.</p>`
    : '<p class="hint small">The night side of the earth darkened, and the mountains lit from where the sun stands.</p>');
  return grp('obase', 'Base map', imgMenuHTML()
      + ((c.img === 'none') && (c.basemap || 'hd') === 'hd' && !M.pkFiles?.has('landscape/landscape.pmtiles') ? '<p class="hint small">Needs the download <b>Landscape – detailed</b>.</p><button type="button" data-mapdl="1">Open Instruments → Map</button>' : '')
      + tgl('rivers', 'Rivers', c.rivers !== false) + tgl('lakes', 'Lakes', c.lakes !== false))
    + grp('orel', 'Relief', reliefMenuHTML())
    + grp('oview', 'View', view)
    + grp('osun', 'Sunlight', sun);
}
function mapOptsPop() { rightPop('mapopts', 'Map', mapOptsHTML()); sundialPaint(); }
async function mapOptsClick(b) {
  const d = b.dataset;
  if (b.id === 'mapOptsBtn') { mapOptsPop(); return true; }
  if (b.id === 'mapProjBtn') { await viewToggle('globe'); const on = viewOn('globe'); projIconAnim(b, on ? 0 : 1); b.querySelector('span').textContent = on ? 'Globe' : 'Flat map (Mercator)'; return true; }
  if (b.id === 'mapNorth' || d.mnorth) { M.map?.easeTo({ bearing: 0, pitch: viewOn('t3d') ? M.map.getPitch() : 0, duration: 500 }); return true; }
  if (d.mlay === 't3d') { await viewToggle('t3d'); b.classList.toggle('on', viewOn('t3d')); return true; }
  if (d.mlay === 'sun') { await sunSet({ sun: !sunOn() }); return true; }
  if (d.sunmode) { M.sunPause = false; if (d.sunmode === 'now') M.sunT = Date.now(); await sunSet({ sunMode: d.sunmode }); return true; }
  if (d.sunplay) { M.sunPause = !M.sunPause; sunClock(); refreshLayersPop(); return true; }
  if (d.mcfg === 'sunFmt') { M.cfg.sunFmt = d.mv; await saveMapCfg(); b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); sundialPaint(); return true; }
  return false;
}
// the compass: shown while the map is turned, pointing north
function compassUpd() {
  const b = $('#mapNorth'); if (!b || !M.map) return;
  const br = M.map.getBearing(); b.hidden = Math.abs(br) < 0.5; b.querySelector('svg').style.transform = `rotate(${-br}deg)`;
}
