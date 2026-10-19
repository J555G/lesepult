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
// the line between day and night (the sun h degrees below the horizon), for the twilight glow: the edges of the night
// polygons without their straight cuts at the poles and the date line
const TW = [[1700, '#ff8c96', 0.1, 8], [1300, '#ff9a78', 0.15, 5], [950, '#ffa060', 0.2, 2], [550, '#ffb35c', 0.27, -1]];   // [width on the ground (km), colour, opacity, the sun's height (°)]
function twilightFC(ms) {
  const s = sunPos(ms), feats = [];
  for (const [, , , h] of TW) for (const ring of nightPolys(s, h)) {
    let line = [];
    const put = l => { if (l.length > 1) feats.push({ h, l }); };
    for (const [x, y] of ring[0]) { if (Math.abs(y) > 89 || (line.length && Math.abs(line[line.length - 1][0] - x) > 3)) { put(line); line = []; } if (Math.abs(y) <= 89) line.push([x, y]); }
    put(line);
  }
  return { type: 'FeatureCollection', features: feats.map(f => ({ type: 'Feature', properties: { h: f.h }, geometry: { type: 'LineString', coordinates: f.l } })) };
}
function nightFC(ms) {
  const s = sunPos(ms);
  return { type: 'FeatureCollection', features: [0, -3, -6, -9, -12, -15, -18].flatMap(h => nightPolys(s, h).map(co => ({ type: 'Feature', properties: { h }, geometry: { type: 'Polygon', coordinates: co } }))) };
}

// ---------------------------------------------------------------- on the map
const sunOn = () => !!M.cfg?.sun;
const sunTime = () => (M.sunT ??= Date.now());
function sunStyle(st) {                                             // (called by layerStyle)
  st.light = sunLight();
  if (!sunOn()) return;
  st.sources.sunnight = { type: 'geojson', data: nightFC(sunTime()) };
  const k = st.layers.findIndex(l => l.id === 'pl-region');
  st.sources.suntw = { type: 'geojson', data: twilightFC(sunTime()) };
  st.layers.splice(k < 0 ? st.layers.length : k, 0, { id: 'sun-night', type: 'fill', source: 'sunnight', layout: { visibility: M.cfg.sunNight !== false ? 'visible' : 'none' }, paint: { 'fill-color': '#020611', 'fill-opacity': 0.1, 'fill-antialias': false } },
    ...TW.map(([km, col, op, h], i) => { const w = km * 512 / 40075;     // (widths in km on the ground)
      return { id: 'sun-twilight' + i, type: 'line', source: 'suntw', filter: ['==', ['get', 'h'], h], layout: { 'line-join': 'round', visibility: M.cfg.sunGlow !== false ? 'visible' : 'none' }, paint: { 'line-color': col, 'line-opacity': op,
        'line-width': ['interpolate', ['exponential', 2], ['zoom'], 0, w, 10, w * 1024], 'line-blur': ['interpolate', ['exponential', 2], ['zoom'], 0, w * 0.6, 10, w * 614] } }; }));
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
  if (sunOn()) {
    m.getSource('sunnight')?.setData(nightFC(sunTime()));
    m.getSource('suntw')?.setData(twilightFC(sunTime()));
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

// ---------------------------------------------------------------- the sundial (its own button; a panel at the foot of the map)
// The hour is the true sun time at the middle of the map. The ring runs anticlockwise: noon at the top, sunset on the left
// (west), midnight at the bottom, sunrise on the right. The handle is the sun above the horizon and the moon below it; the
// horizon lies where the ring meets sunrise and sunset (lower in summer, higher in winter), and the sea covers the part of
// the sun or moon beneath it. Behind the dial the sky follows the sun's height; at night the stars come out and an owl
// sits on the gnomon. Settings (mapCfg): sunFmt ('modern' | 'roman' | 'greek').
const GR_NUM = ['αʹ', 'βʹ', 'γʹ', 'δʹ', 'εʹ', 'ϛʹ', 'ζʹ', 'ηʹ', 'θʹ', 'ιʹ', 'ιαʹ', 'ιβʹ'], RO_NUM = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
function sunHour() {                                                 // sun time (hours), sunrise and sunset, the sun's height
  const c = M.map?.getCenter() || { lng: 24, lat: 38 }, t = sunTime(), s = sunPos(t);
  const lst = ((12 + (c.lng - s.lon) / 15) % 24 + 24) % 24;          // (noon: the sun due south)
  const cosH = (Math.sin(-0.833 * RAD) - Math.sin(c.lat * RAD) * Math.sin(s.dec)) / (Math.cos(c.lat * RAD) * Math.cos(s.dec));
  const half = cosH <= -1 ? 12 : cosH >= 1 ? 0 : Math.acos(cosH) / RAD / 15;     // half the day, in hours
  return { lst, rise: 12 - half, set: 12 + half, alt: sunAt(s, c.lng, c.lat).alt };
}
function sunLabel() {
  const { lst, rise, set } = sunHour(), fmt = M.cfg.sunFmt || 'modern';
  const hm = `${String(Math.floor(lst)).padStart(2, '0')}:${String(Math.floor(lst % 1 * 60)).padStart(2, '0')}`;
  const date = new Date(sunTime()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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
const SD = { H: 198, cx: 92, cy: 82, R: 64, P: 50 };                 // the panel's height, the dial's centre, ring and plate radii
const sdAng = h => -(h - 12) / 24 * 2 * Math.PI;                       // (anticlockwise; noon at the top)
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
      <radialGradient id="sdGlow"><stop offset="0" stop-color="#fff6c8" stop-opacity=".95"/><stop offset=".35" stop-color="#ffd85a" stop-opacity=".55"/><stop offset="1" stop-color="#ffb030" stop-opacity="0"/></radialGradient>
      <radialGradient id="sdStone" cx=".42" cy=".38"><stop offset="0" stop-color="#e9dfc8"/><stop offset="1" stop-color="#b8aa8c"/></radialGradient>
      <clipPath id="sdAbove"><rect id="sdAboveR" x="0" y="0" width="4000" height="0"/></clipPath><clipPath id="sdBelow"><rect id="sdBelowR" x="0" y="0" width="4000" height="4000"/></clipPath></defs>
    <rect width="100%" height="100%" fill="url(#sdSky)"/><g clip-path="url(#sdAbove)"><g class="sdstars" id="sdStars">${stars}</g></g>
    <rect id="sdSeaR" x="0" width="100%" height="${SD.H}" fill="url(#sdSea)"/><path id="sdGlint" class="sdglint" d=""/>
    <circle cx="${SD.cx}" cy="${SD.cy}" r="${SD.R + 6}" class="sdrim"/><circle cx="${SD.cx}" cy="${SD.cy}" r="${SD.P}" fill="url(#sdStone)" class="sdplate"/>
    <g class="sdticks">${ticks}</g><path id="sdDay" class="sdday" d=""/>
    <line id="sdShadow" class="sdshadow" x1="${SD.cx}" y1="${SD.cy}" x2="${SD.cx}" y2="${SD.cy}"/><path class="sdgnomon" d="M${SD.cx - 3} ${SD.cy + 3}L${SD.cx} ${SD.cy - 14}L${SD.cx + 3} ${SD.cy + 3}z"/>
    <g id="sdOwlPos" transform="translate(${SD.cx} ${SD.cy - 22})">${OWL}</g>
    <g clip-path="url(#sdAbove)"><g class="sdhpos"><circle r="22" fill="url(#sdGlow)" id="sdGlowC"/><circle r="8.5" class="sdsun"/></g></g>
    <g clip-path="url(#sdBelow)"><g class="sdhpos"><circle r="8" class="sdmoon"/><circle r="6.6" cx="3.4" cy="-2.2" class="sdmoonc"/></g></g><g class="sdhpos"><circle r="16" class="sdgrab"/></g>
    <text id="sdLab" class="sdlab" x="${SD.cx}" y="${SD.H - 12}" text-anchor="middle"></text></svg>
    <div class="sdctl" id="sunCtl"></div><button type="button" class="sdx" data-sdclose="1" aria-label="Close" title="Close">×</button></div>`;
}
function sdCtlHTML() {
  const mode = M.cfg.sunMode || 'now', spd = M.cfg.sunSpeed || 20;
  return `<label class="sdrow">${SW('data-sunsw="1" aria-label="Day and night on the map"', sunOn())}<span>Day and night</span></label>`
    + `<div class="seg" role="group">${[['now', 'Now'], ['anim', 'Animate']].map(([v, l]) => `<button type="button" data-sunmode="${v}" class="${mode === v ? 'on' : ''}">${l}</button>`).join('')}</div>`
    + (mode === 'anim' ? `<div class="msun"><button type="button" class="mico2" data-sunplay="1" aria-label="${M.sunPause ? 'Play' : 'Pause'}">${M.sunPause ? '▶' : '❚❚'}</button><input type="range" min="0" max="100" value="${spdToV(spd)}" data-sunspeed="1" aria-label="Speed"><output>${spdLabel(spd)}</output></div>` : '')
    + `<div class="seg" role="group">${[['modern', 'Modern'], ['roman', 'Roman'], ['greek', 'Greek']].map(([v, l]) => `<button type="button" data-sunfmt="${v}" class="${(M.cfg.sunFmt || 'modern') === v ? 'on' : ''}">${l}</button>`).join('')}</div>`
    + `<div class="sdtg">${[['sunNight', 'Night'], ['sunGlow', 'Glow'], ['sunAtm', 'Air']].map(([k, l]) => `<button type="button" data-suntg="${k}" class="${M.cfg[k] !== false ? 'on' : ''}" aria-pressed="${M.cfg[k] !== false}">${l}</button>`).join('')}</div>`
    + `<small class="sdsub" id="sdSub"></small>`;
}
async function sdOpen(open) {
  const box = $('#mapBody'); if (!box) return;
  $('#sunPanel')?.remove(); box.classList.toggle('sdopen', open); $('#mapSunBtn')?.classList.toggle('on', open);
  M.sdOpen = open;
  if (!open) return;
  box.insertAdjacentHTML('beforeend', sdPanelHTML()); $('#sunCtl').innerHTML = sdCtlHTML();
  if (!sunOn()) await sunSet({ sun: true });
  $('#sunCtl').innerHTML = sdCtlHTML(); M.sdOwl = null; sundialPaint();
}
function sundialPaint() {
  const svg = $('#sunSvg'); if (!svg) return;
  const { lst, rise, set, alt } = sunHour(), W = svg.clientWidth || 400, len = set - rise;
  // the horizon: level with sunrise and sunset on the ring
  const hy = len >= 24 ? SD.cy + SD.R + 12 : len <= 0 ? SD.cy - SD.R - 12 : sdXY(set, SD.R)[1];
  const eve = lst >= 12, [top, foot] = skyAt(alt, eve);
  $('#sdSky0').setAttribute('stop-color', top); $('#sdSky1').setAttribute('stop-color', foot);
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
  if (len > 0 && len < 24) { const [ax, ay] = sdXY(rise, SD.R + 3), [bx, by] = sdXY(set, SD.R + 3); $('#sdDay').setAttribute('d', `M${ax.toFixed(1)} ${ay.toFixed(1)}A${SD.R + 3} ${SD.R + 3} 0 ${len > 12 ? 1 : 0} 0 ${bx.toFixed(1)} ${by.toFixed(1)}`); }
  else $('#sdDay').setAttribute('d', len >= 24 ? `M${SD.cx} ${SD.cy - SD.R - 3}a${SD.R + 3} ${SD.R + 3} 0 1 0 0.01 0` : '');
  const sh = $('#sdShadow'), up = day && alt > -0.8;
  if (up) { const L = Math.min(SD.P - 4, 9 / Math.tan(Math.max(1.5, alt) * RAD)), a = sdAng(lst) + Math.PI;
    sh.setAttribute('x2', (SD.cx + Math.sin(a) * L).toFixed(1)); sh.setAttribute('y2', (SD.cy - Math.cos(a) * L).toFixed(1)); sh.style.opacity = Math.max(0.12, Math.min(0.75, alt / 12)).toFixed(2); }
  else sh.style.opacity = 0;
  // the owl: lands when the handle enters the night, flies off when it leaves
  if (M.sdOwl !== !day) { M.sdOwl = !day; const o = $('#sdOwlPos .sdowl'); o.classList.remove('land', 'away'); void o.getBoundingClientRect(); o.classList.add(day ? 'away' : 'land'); }
  const l = sunLabel(); $('#sdLab').textContent = l.main; const sub = $('#sdSub'); if (sub) sub.textContent = l.sub;
}
// a finger (or the mouse) on the dial sets the hour; the day stays
document.addEventListener('pointerdown', ev => {
  const svg = ev.target.closest?.('#sunSvg'); if (!svg) return;
  const near = e => { const r = svg.getBoundingClientRect(), x = e.clientX - r.left - SD.cx, y = e.clientY - r.top - SD.cy; return { x, y, d: Math.hypot(x, y) }; };
  if (near(ev).d > SD.R + 22) return;                                   // (only on and around the dial)
  ev.preventDefault(); svg.setPointerCapture?.(ev.pointerId);
  const setT = e => { const { x, y } = near(e), h = ((12 - Math.atan2(x, -y) / (2 * Math.PI) * 24) % 24 + 24) % 24, { lst } = sunHour();
    let dh = h - lst; if (dh > 12) dh -= 24; if (dh < -12) dh += 24; M.sunT = sunTime() + dh * 36e5; sunApply(); };
  if ((M.cfg.sunMode || 'now') !== 'set') { M.cfg.sunMode = 'set'; saveMapCfg(); sunClock(); $('#sunCtl').innerHTML = sdCtlHTML(); }
  setT(ev);
  const mv = e => setT(e), up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
});
document.addEventListener('change', ev => { if (ev.target.closest?.('[data-sunsw]')) sunSet({ sun: ev.target.checked }).then(() => { const c = $('#sunCtl'); if (c) c.innerHTML = sdCtlHTML(); sundialPaint(); }); });
// the speed: one day in 60 s … 5 s (a logarithmic slider)
const spdToV = s => Math.round(Math.log(60 / s) / Math.log(12) * 100), vToSpd = v => 60 / 12 ** (v / 100);
const spdLabel = s => `a day in ${s >= 9.95 ? Math.round(s) : s.toFixed(1)} s`;
document.addEventListener('input', ev => {
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
const GLOBE_EU_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linejoin="round" stroke-linecap="round"><circle cx="12" cy="12" r="8.6" stroke-width=".85"/><path d="M5.4 17.4L5.8 17.1L5.5 16.6L5.2 16.1L4.9 15.7L4.6 15.2L4.4 14.7L4.3 14.1L4.0 13.6L3.9 13.0L3.8 12.5L3.7 12.0L3.7 11.4L3.5 10.9L3.6 10.3L3.8 9.7L3.9 9.2L4.1 8.7M4.5 7.9L4.8 7.4L4.7 8.0L4.6 8.5L4.3 9.0L4.6 8.6L5.2 8.5L5.7 8.5L6.1 8.9L6.4 8.5L6.0 8.1L6.5 8.2L6.9 8.6L7.3 8.4L7.6 7.9L7.7 7.3L8.0 6.9L7.5 7.0L6.9 7.1L7.2 6.6L7.5 6.1L8.0 5.9L8.5 6.1L9.1 5.9L9.2 5.4L9.6 5.0L10.1 4.8L10.6 4.5L11.1 4.4L11.7 4.3L11.8 3.8L11.2 3.7L10.7 3.9L10.2 4.0L9.6 4.1L9.1 4.3L8.5 4.4L8.0 4.6L7.5 4.7M17.3 13.6L16.8 13.8L16.4 13.4L16.9 13.4L17.5 13.3L18.0 13.0L18.5 12.8L19.0 12.7L19.3 13.2L19.6 13.6L19.8 13.1L19.7 12.5L19.8 11.9L19.8 11.4L19.8 10.8L20.2 11.2L20.6 11.6M20.6 11.3L20.4 10.8L20.4 10.2L20.2 9.7L20.0 9.2L19.8 8.7L19.6 8.1L19.3 7.7L19.0 7.2L18.6 6.9L18.1 6.5L17.9 6.0L17.4 5.7L17.0 5.3L16.5 5.0L16.0 4.9L15.4 4.8L15.0 4.6L14.4 4.3L13.9 4.2L14.4 4.2L15.0 4.2L14.5 4.0L13.9 4.1L13.4 4.0L12.8 4.0L13.2 4.4L13.7 4.7L14.0 5.2L14.3 5.6L14.5 6.2L14.0 5.9L14.1 6.5L14.4 7.0L14.7 7.4L14.1 7.3L14.5 7.6L14.2 8.1L13.8 8.5L13.5 9.0L13.3 8.4L12.8 8.3L12.3 8.6L12.0 9.1L11.6 9.5L11.5 10.1L12.0 10.3L12.5 10.0L12.4 9.5L12.8 9.0L12.6 9.6L13.2 9.7L13.0 10.2L12.7 10.7L12.1 10.8L11.9 10.3L11.7 10.8L11.3 11.1L10.8 11.4L10.6 11.9L10.1 12.2L9.7 12.5L9.8 13.1L10.3 13.2L10.6 12.8L11.0 12.4L11.6 12.3L12.0 12.6L12.5 13.0L12.2 12.5L12.8 12.5L13.1 13.0L13.5 12.6L13.8 12.1L14.0 11.6L14.5 11.4L14.9 11.9L14.5 12.3L14.0 12.5L13.7 13.0L14.3 13.1L14.8 12.9L14.8 13.5L14.4 13.8L13.9 14.0L13.3 13.9L12.9 14.3L12.4 14.1L11.9 13.9L11.9 13.3L11.3 13.3L10.7 13.3L10.2 13.4L9.6 13.5L9.3 13.9L8.8 14.2L8.4 14.6L8.2 15.1L8.0 15.6L8.2 16.2L8.4 16.7L8.8 17.1L9.3 17.3L9.9 17.5L10.4 17.4L11.0 17.5L11.5 17.7L11.6 18.2L12.0 18.6L12.2 19.1L12.0 19.6L12.3 20.1L12.8 20.4L13.4 20.4L13.9 20.3L14.4 20.1L14.9 19.7L15.2 19.3L15.7 19.0L16.0 18.6L15.9 18.0L16.3 17.5L16.6 17.1L17.0 16.6L17.2 16.1L17.3 15.5L16.8 15.8L16.3 16.0L15.8 15.7L15.5 15.3L15.1 14.8L14.8 14.4L15.3 14.6L15.7 15.0L16.2 15.3L16.5 15.8L16.9 15.4L17.3 15.0L17.6 14.6L17.8 14.1L17.7 13.5M8.6 6.7L8.1 7.0L8.6 7.2L9.0 6.8L9.4 6.4L8.9 6.6M11.1 6.6L10.6 6.3L10.1 6.4L9.9 6.9L9.5 7.3L9.0 7.5L8.6 7.9L8.4 8.4L9.0 8.3L9.5 8.2L10.1 8.2L10.5 7.8L10.9 7.5L11.2 7.0L11.1 6.5" stroke-width=".8"/></g></svg>';
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
  const top = HILL[HILL.length - 1], cx = top.reduce((s, p) => s + p[0], 0) / top.length, cy = top.reduce((s, p) => s + p[1], 0) / top.length - (HILL.length - 1) * HILL_LIFT * t - 0.5 * t;
  return `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" class="hillic"><g fill="var(--mvbg, var(--bg))" stroke="currentColor" stroke-width=".85" stroke-linejoin="round">${rings}</g>`
    + chapelSVG(cx, cy - 0.7) + '</svg>';   // (the roof: a trapezoid)
}
// the chapel: white walls under the red roof (a trapezoid), the little tower at its west end; (x, y): the foot of the walls
function chapelSVG(x, y) {
  const f = v => v.toFixed(2);
  return `<path class="hwall" d="M${f(x - 1.6)} ${f(y)}v-1.25h3.2v1.25z"/><path class="htower" d="M${f(x - 1.45)} ${f(y - 1.25)}v-2.1l.35-.75.35.75v2.1"/>`
    + `<path class="hroof" d="M${f(x - 1.95)} ${f(y - 1.2)}h3.9l-.85-1.45h-2.2z"/>`;
}
function iconAnim(el, to, svg) {                                    // an icon from the shape shown to the other (0.45 s, eased)
  const from = +(el.dataset.t ?? (to ? 0 : 1)), t0 = performance.now();
  const step = now => { const k = Math.min(1, (now - t0) / 450), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2, t = from + (to - from) * e;
    el.dataset.t = t; el.querySelector('svg').outerHTML = svg(t); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const COMPASS_SM = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" class="compic"><g fill="none" stroke="currentColor" stroke-width=".85" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 19.2 9.9 12h4.2z"/><path class="cn" d="M12 4.8 14.1 12H9.9z"/><circle cx="12" cy="12" r=".7"/></g></svg>';
const elevOn = () => M.cfg.elev !== false;
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
    + `<div class="mrow"><span>Map</span></div><div class="seg mimg" role="group">${[['bm', 'Blue Marble'], ['s2', 'Sentinel-2'], ['esri', 'Esri']].map(([v, l]) => `<button type="button" data-mcfg="img" data-mv="${v}" class="${k === v ? 'on' : ''}"${v !== 'bm' && !on ? ' disabled' : ''}>${l}</button>`).join('')}</div>`
    + (ver ? `<div class="mrow msub"><span>${k === 's2' ? 'Year' : 'Version'}</span>${ver}</div>` : '')
    + sw('elev', 'Elevation', elevOn(), false) + sw('relShade', 'Shading', relOn('relShade'), !elevOn()) + sw('relContours', 'Contour lines', relOn('relContours'), !elevOn())
    + sw('rivlak', 'Rivers and lakes', c.rivers !== false, false);
}
function mapOptsPop() { rightPop('mapopts', 'Globe', mapOptsHTML()); }
async function mapOptsClick(b) {
  const d = b.dataset;
  if (b.id === 'mapOptsBtn') { mapOptsPop(); return true; }
  if (b.id === 'mapProjBtn') { await viewToggle('globe'); const on = viewOn('globe'); iconAnim(b, on ? 0 : 1, projIconSVG); b.title = on ? 'Globe' : 'Flat map'; b.setAttribute('aria-label', b.title); return true; }
  if (b.id === 'map3dBtn') { await viewToggle('t3d'); const on = viewOn('t3d'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); iconAnim(b, on ? 1 : 0, hillIconSVG); return true; }
  if (b.id === 'mapCompBtn') { M.cfg.compass = M.cfg.compass === false; await saveMapCfg(); b.classList.toggle('on', M.cfg.compass); b.setAttribute('aria-pressed', M.cfg.compass); compassUpd(); return true; }
  if (b.id === 'mapNorth' || d.mnorth) { M.map?.easeTo({ bearing: 0, pitch: viewOn('t3d') ? M.map.getPitch() : 0, duration: 500 }); return true; }
  if (b.id === 'mapSunBtn') { await sdOpen(!M.sdOpen); return true; }
  if (d.suntg) {                                                   // the night shade, the twilight glow, the atmosphere: each on or off
    M.cfg[d.suntg] = M.cfg[d.suntg] === false; await saveMapCfg(); b.classList.toggle('on', M.cfg[d.suntg]); b.setAttribute('aria-pressed', M.cfg[d.suntg]);
    const m = M.map, vis = k => M.cfg[k] !== false ? 'visible' : 'none';
    if (m?.getLayer('sun-night')) m.setLayoutProperty('sun-night', 'visibility', vis('sunNight'));
    TW.forEach((_, i) => { if (m?.getLayer('sun-twilight' + i)) m.setLayoutProperty('sun-twilight' + i, 'visibility', vis('sunGlow')); });
    if (d.suntg === 'sunAtm' && m) m.setSky(mapStyle(M.colors).sky);
    return true; }
  if (d.sdclose) { await sdOpen(false); return true; }
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
  if (k === 'rivlak') { M.cfg.rivers = M.cfg.lakes = v; await saveMapCfg(); applyLayers(); return; }
  M.cfg[k] = v; await saveMapCfg();
  if (k === 'elev') { if (!v && viewOn('t3d')) M.map?.setTerrain(null); if (M.map) { M.map.setStyle(mapStyle(M.colors)); M.map.once('styledata', () => setTimeout(refreshMapData, 50)); } refreshLayersPop(); return; }
  applyLayers();
});
