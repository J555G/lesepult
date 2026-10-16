// ================================================================ Pult · map layers and the period filter
// The time slider (one date, a period, or several periods), all places of the gazetteer by category ("sites"), and the
// layers of the "Ancient world" package (Ancient World Mapping Center, ODbL): coastlines of the periods, empires and Roman
// provinces at several dates, names and rough areas of regions and peoples, roads, city outlines.
// Settings: mapCfg (layers, time options, fold state of the layer menu) · wyear|<work> (date of a work, corrected by the reader)
const TMIN = -1000, TMAX = 800, YSTEP = 10, TMAXR = 3;
const fmtY = y => y == null ? '' : y < 0 ? `${-y} BC` : `AD ${Math.max(1, y)}`;
const fmtR = ([a, b]) => a === b ? fmtY(a) : a < 0 && b < 0 ? `${-a}–${-b} BC` : a >= 0 ? `AD ${Math.max(1, a)}–${b}` : `${fmtY(a)} – ${fmtY(b)}`;
const LCFG = { time: true, tol: 25, gone: 'fade', undated: 'show', twoCol: false, sites: false, cats: { settl: true, sacred: true, mil: true }, coast: true, empires: true, regions: 'labels', roads: false, urban: true, fold: { text: true }, layScroll: 0 };
const RANGE_COL = ['#c0503a', '#2f78b5'];

// ---------------------------------------------------------------- the period filter
// M.T = {work, ranges: [[a, b], …]} – a range with a === b is a single date; the map shows what existed then (± tolerance)
function timeFor(t) {
  const wk = t ? workKeyOf(t) : null;
  if (!M.T || M.T.work !== wk) M.T = { work: wk, ranges: M.year != null ? [[snapY(M.year), snapY(M.year)]] : [] };
  return M.T;
}
const snapY = y => Math.max(TMIN, Math.min(TMAX, Math.round(y / YSTEP) * YSTEP));
function tRanges() {
  if (!M.cfg?.time || !M.T?.ranges?.length) return null;
  const tol = M.cfg.tol ?? 25; return M.T.ranges.map(([a, b]) => [a - tol, b + tol]);
}
// the dates of things that belong to one date (empires, coastlines): the ranges without tolerance, or the work's date
function snapRanges() { return M.cfg?.time && M.T?.ranges?.length ? M.T.ranges : M.year != null ? [[M.year, M.year]] : null; }
const Y0 = ['coalesce', ['get', 'y0'], -99999], Y1 = ['coalesce', ['get', 'y1'], 99999];
const UND = ['all', ['!', ['has', 'y0']], ['!', ['has', 'y1']]];
const tIn = r => ['all', ['<=', Y0, r[1]], ['>=', Y1, r[0]]];
const tGone = r => ['all', ['<=', Y0, r[1]], ['<', Y1, r[0]]];
const tUnd = () => M.cfg.undated === 'hide' ? 0 : M.cfg.undated === 'fade' ? 0.35 : 1;
const tGoneO = () => M.cfg.gone === 'hide' ? 0 : 0.3;
function tOpacity(base = 1) {
  const R = tRanges(); if (!R) return base;
  return ['*', base, ['case', UND, tUnd(), ['any', ...R.map(tIn)], 1, ['any', ...R.map(tGone)], tGoneO(), 0]];
}
function tFilter() { const R = tRanges(); return R ? ['>', tOpacity(1), 0] : true; }
// the same in JavaScript (labels): {o: opacity, k: which period}
function tState(y0, y1) {
  const R = tRanges(); if (!R) return { o: 1, k: 0 };
  if (y0 == null && y1 == null) return { o: tUnd(), k: 0 };
  const a = y0 ?? -99999, b = y1 ?? 99999;
  for (let k = 0; k < R.length; k++) if (a <= R[k][1] && b >= R[k][0]) return { o: 1, k };
  return { o: R.some(r => a <= r[1] && b < r[0]) ? tGoneO() : 0, k: 0 };
}
// several periods in two colours (setting): the colour of the period a feature belongs to
function tColor(base) {
  const R = tRanges(); if (!R || R.length < 2 || !M.cfg.twoCol) return base;
  return ['case', tIn(R[0]), RANGE_COL[0], ['any', ...R.slice(1).map(tIn)], RANGE_COL[1], base];
}
function snapFilter() { const R = snapRanges(); return R ? ['any', ...R.map(tIn)] : false; }

// ---------------------------------------------------------------- all places of the gazetteer, by category
const SITE_CATS = [
  ['settl', 'Settlements', 'settlement,fortified-settlement,polis,colony,urban,port,deme-attic,village,station', '#4a4036', '#d9d0bd'],
  ['sacred', 'Sanctuaries and temples', 'sanctuary,temple,temple-2,shrine,oracle,church,church-2,monastery,mithraeum,synagogue,altar', '#a8476e', '#e08ab0'],
  ['mil', 'Forts and walls', 'fort,fort-2,fortlet,fortress,camp,tower-defensive,hillfort,wall-2,city-wall,military-installation', '#7d6232', '#cfae6a'],
  ['bldg', 'Theatres, baths, buildings', 'theatre,amphitheatre,bath,odeon,stadium,circus,hippodrome,architecturalcomplex,monument,palace,townhouse,agora,forum', '#6a4fa3', '#b49ce6'],
  ['villa', 'Villas and farms', 'villa,farmstead,estate', '#5b8a36', '#9ccd73'],
  ['tomb', 'Tombs and cemeteries', 'tomb,cemetery,tumulus,necropolis', '#6d6d6d', '#a9a9a9'],
  ['econ', 'Mines, quarries, workshops', 'mine,mine-2,quarry,production,kiln,salt-marsh,findspot', '#9a5229', '#e09a6c'],
  ['infra', 'Bridges, aqueducts, harbours', 'bridge,aqueduct,canal,harbor,dam,lighthouse,cistern,road', '#3f6f96', '#86b6dd'],
  ['nature', 'Mountains, islands, rivers …', 'mountain,mountain-range,hill,island,archipelago,cape,river,lake,spring,cave,pass,plain,forest,bay,water-open,peninsula,valley,strait', '#2e6d8f', '#7ab4d6'],
  ['arch', 'Other ancient sites', 'archaeological-site,tell,nuraghe,unknown,labeled feature,unlabeled,feature,architecturalcomplex', '#8a8478', '#b5ae9f'],
];
function sitesData() {
  if (M.sitesFC || !M.P) return M.sitesFC || { type: 'FeatureCollection', features: [] };
  const catOf = new Map(); SITE_CATS.forEach(([, , ts], c) => ts.split(',').forEach(t => { const i = M.P.ti[t]; if (i != null && !catOf.has(i)) catOf.set(i, c); }));
  const modern = M.P.ti['settlement-modern'], feats = [];
  for (const p of M.P.P) {
    if (p.ty.length === 1 && p.ty[0] === modern) continue;
    let c = null; for (const t of p.ty) if (catOf.has(t)) { c = catOf.get(t); break; }
    if (c == null) continue;
    const pr = { id: p.id, c }; if (p.y0 != null) pr.y0 = p.y0; if (p.y1 != null) pr.y1 = p.y1; if (p.rough) pr.r = 1;
    feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: pr });
  }
  return M.sitesFC = { type: 'FeatureCollection', features: feats };
}
const siteCats = () => SITE_CATS.map((c, i) => M.cfg.cats?.[c[0]] ? i : -1).filter(i => i >= 0);

// ---------------------------------------------------------------- the layers in the map style
const EMP_COL = { persia: '#9a6a2a', alexander: '#3f6fa8', rome60bc: '#b23a3a', rome117: '#b23a3a', rome200: '#b23a3a' };
function layerStyle(st, C) {
  const dark = document.documentElement.dataset.theme === 'dark', A = MAPS + 'ancient/';
  const before = (id, ...ls) => { const k = st.layers.findIndex(l => l.id === id); st.layers.splice(k < 0 ? st.layers.length : k, 0, ...ls); };
  st.sources.sites = { type: 'geojson', data: sitesData() };
  if (M.anc) {
    for (const n of ['water', 'empires', 'provinces', 'areas', 'roads', 'urban']) st.sources['a_' + n] = { type: 'geojson', data: A + n + '.json' };
    const ac = ['match', ['get', 'k'], 'people', dark ? '#c98a5a' : '#c0703c', dark ? '#8fb86a' : '#6f9a46'];
    before('lakes',
      { id: 'a-water', type: 'fill', source: 'a_water', paint: { 'fill-color': C.sea } },
      { id: 'a-areas', type: 'fill', source: 'a_areas', maxzoom: 9, paint: { 'fill-color': tColor(ac), 'fill-opacity': 0.12 } },
      { id: 'a-areas-edge', type: 'line', source: 'a_areas', maxzoom: 9, paint: { 'line-color': tColor(ac), 'line-opacity': 0.16, 'line-width': 14, 'line-blur': 12, 'line-offset': -5 } },
      { id: 'a-emp', type: 'fill', source: 'a_empires', paint: { 'fill-color': ['match', ['get', 'e'], ...Object.entries(EMP_COL).flat(), '#b23a3a'], 'fill-opacity': dark ? 0.16 : 0.1 } },
      { id: 'a-emp-line', type: 'line', source: 'a_empires', paint: { 'line-color': ['match', ['get', 'e'], ...Object.entries(EMP_COL).flat(), '#b23a3a'], 'line-width': 1.3, 'line-opacity': 0.75 } });
    before('pl-region',
      { id: 'a-prov', type: 'line', source: 'a_provinces', paint: { 'line-color': '#b23a3a', 'line-width': 0.9, 'line-opacity': 0.7, 'line-dasharray': [3, 2] } },
      { id: 'a-roads', type: 'line', source: 'a_roads', filter: ['==', ['get', 'c'], 1], layout: { 'line-cap': 'round' }, paint: { 'line-color': dark ? '#b58a5e' : '#8a5a32', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, ['case', ['==', ['get', 'm'], 1], 0.7, 0.35], 8, ['case', ['==', ['get', 'm'], 1], 2, 1]] } },
      { id: 'a-roads-a', type: 'line', source: 'a_roads', filter: ['!=', ['get', 'c'], 1], paint: { 'line-color': dark ? '#b58a5e' : '#8a5a32', 'line-dasharray': [2, 2], 'line-width': ['interpolate', ['linear'], ['zoom'], 3, ['case', ['==', ['get', 'm'], 1], 0.7, 0.35], 8, ['case', ['==', ['get', 'm'], 1], 2, 1]] } },
      { id: 'a-urban', type: 'fill', source: 'a_urban', minzoom: 8, paint: { 'fill-color': dark ? '#5a5144' : '#d9cbb0', 'fill-opacity': 0.8 } },
      { id: 'a-urban-line', type: 'line', source: 'a_urban', minzoom: 8, paint: { 'line-color': dark ? '#8a7c66' : '#a8936c', 'line-width': 1 } });
  }
  before('pl-region', { id: 'sites', type: 'circle', source: 'sites', minzoom: 3.5, paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 1.6, 8, 3.6, 12, 5],
    'circle-color': tColor(['match', ['get', 'c'], ...SITE_CATS.flatMap((c, i) => [i, c[dark ? 4 : 3]]), C.fg]),
    'circle-stroke-color': C.bg, 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 4, 0.3, 8, 1],
    'circle-opacity': 0.85, 'circle-stroke-opacity': 0.85 } });
  applyLayersTo(st.layers);
  return st;
}
// visibility, filters and opacity from the settings and the period filter (on the style before it is built, or on the map)
function layerProps() {
  const c = M.cfg, tf = tFilter(), sf = snapFilter(), shown = [...(M.shown?.keys() || [])].filter(x => typeof x === 'number');
  const vis = v => v ? 'visible' : 'none';
  return {
    'a-water': { vis: vis(c.coast && sf), filter: sf || false },
    'a-areas': { vis: vis(c.regions === 'areas'), filter: ['all', ['in', ['get', 'k'], ['literal', c.peoples ? ['region', 'people'] : ['region']]], tf], paint: { 'fill-opacity': tOpacity(0.12) } },
    'a-areas-edge': { vis: vis(c.regions === 'areas'), filter: ['all', ['in', ['get', 'k'], ['literal', c.peoples ? ['region', 'people'] : ['region']]], tf], paint: { 'line-opacity': tOpacity(0.16) } },
    'a-emp': { vis: vis(c.empires && sf), filter: sf || false },
    'a-emp-line': { vis: vis(c.empires && sf), filter: sf || false },
    'a-prov': { vis: vis(c.empires && sf), filter: sf || false },
    'a-roads': { vis: vis(c.roads), filter: ['all', ['==', ['get', 'c'], 1], tf], paint: { 'line-opacity': tOpacity(0.85) } },
    'a-roads-a': { vis: vis(c.roads), filter: ['all', ['!=', ['get', 'c'], 1], tf], paint: { 'line-opacity': tOpacity(0.7) } },
    'a-urban': { vis: vis(c.urban) }, 'a-urban-line': { vis: vis(c.urban) },
    sites: { vis: vis(c.sites && siteCats().length), filter: ['all', ['in', ['get', 'c'], ['literal', siteCats()]], tf, ['!', ['in', ['get', 'id'], ['literal', shown]]]],
      paint: { 'circle-opacity': tOpacity(0.85), 'circle-stroke-opacity': tOpacity(0.85) } },
  };
}
function applyLayersTo(layers) {
  const P = layerProps();
  for (const l of layers) {
    const p = P[l.id]; if (!p) continue;
    (l.layout ??= {}).visibility = p.vis;
    if (p.filter !== undefined) l.filter = p.filter === true ? undefined : p.filter;
    if (p.paint) Object.assign(l.paint, p.paint);
  }
}
function applyLayers() {
  if (!M.map?.getLayer('sites')) return;
  const P = layerProps(), dark = document.documentElement.dataset.theme === 'dark';
  for (const [id, p] of Object.entries(P)) {
    if (!M.map.getLayer(id)) continue;
    M.map.setLayoutProperty(id, 'visibility', p.vis);
    if (p.filter !== undefined) M.map.setFilter(id, p.filter === true ? null : p.filter);
    for (const [k, v] of Object.entries(p.paint || {})) M.map.setPaintProperty(id, k, v);
  }
  const ac = ['match', ['get', 'k'], 'people', dark ? '#c98a5a' : '#c0703c', dark ? '#8fb86a' : '#6f9a46'];
  if (M.map.getLayer('a-areas')) { M.map.setPaintProperty('a-areas', 'fill-color', tColor(ac)); M.map.setPaintProperty('a-areas-edge', 'line-color', tColor(ac)); }
  M.map.setPaintProperty('sites', 'circle-color', tColor(['match', ['get', 'c'], ...SITE_CATS.flatMap((c, i) => [i, c[dark ? 4 : 3]]), mapColors().fg]));
  drawLabels();
}

// ---------------------------------------------------------------- labels of regions, peoples, mountains (and of sites)
async function loadAncientLabels() {
  if (M.ancLab || !M.anc) return M.ancLab;
  try {
    const j = await (await fetch(MAPS + 'ancient/labels.json')).json();
    M.ancLab = j.features.map(f => {
      const ls = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
      const line = ls.reduce((a, b) => b.length > a.length ? b : a, ls[0]);
      let x0 = 180, y0 = 90, x1 = -180, y1 = -90; for (const [x, y] of line) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return { ...f.properties, a: line[0], b: line[line.length - 1], mid: line[line.length >> 1], bb: [x0, y0, x1, y1] };
    });
  } catch (_) { M.ancLab = []; }
  return M.ancLab;
}
// called by drawLabels: further labels after the places of the text; `placed` holds the boxes already taken
function moreLabels(placed, W, H) {
  let h = '';
  const z = M.map.getZoom(), b = M.map.getBounds(), dark = document.documentElement.dataset.theme === 'dark';
  const hit = r => placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
  const ctx = (drawLabels.c ??= document.createElement('canvas').getContext('2d'));
  // regions, peoples, mountains, islands along their lines (Barrington Atlas)
  if (M.cfg.regions !== 'off' && M.ancLab) {
    const kinds = new Set(['region', 'plain', 'water', ...(M.cfg.peoples ? ['people'] : []), ...(z >= 6 ? ['mountain', 'islands'] : [])]);
    const items = [];
    for (const L of M.ancLab) {
      if (!kinds.has(L.k) || L.bb[2] < b.getWest() || L.bb[0] > b.getEast() || L.bb[3] < b.getSouth() || L.bb[1] > b.getNorth()) continue;
      const st = tState(L.y0, L.y1); if (!st.o) continue;
      let p = M.map.project(L.a), q = M.map.project(L.b); if (p.x > q.x) [p, q] = [q, p];
      const len = Math.hypot(q.x - p.x, q.y - p.y); if (len < 30) continue;
      items.push({ L, p, q, len, st });
    }
    items.sort((x, y) => y.len - x.len);
    const done = new Set();                                         // one name once (the same region in several periods)
    for (const { L, p, q, len, st } of items.slice(0, 160)) {
      if (done.has(L.t)) continue; done.add(L.t);
      const caps = L.k === 'region' || L.k === 'people', txt = caps ? L.t.toUpperCase() : L.t, fs = caps ? 10.5 : 11.5;
      ctx.font = `${caps ? 600 : 400} ${caps ? '' : 'italic '}${fs}px "Gentium Book Plus", serif`;
      const w0 = ctx.measureText(txt).width; if (w0 > len * 1.25) continue;
      const ls = caps ? Math.min(fs * 0.9, Math.max(1, (len - w0) / Math.max(1, txt.length - 1) * 0.7)) : 0.5;
      const w = w0 + ls * (txt.length - 1), ang = Math.atan2(q.y - p.y, q.x - p.x), cx = (p.x + q.x) / 2, cy = (p.y + q.y) / 2;
      if (cx < -w || cx > W + w || cy < -20 || cy > H + 20) continue;
      const hw = Math.abs(Math.cos(ang)) * w / 2 + Math.abs(Math.sin(ang)) * fs / 2, hh = Math.abs(Math.sin(ang)) * w / 2 + Math.abs(Math.cos(ang)) * fs / 2;
      const r = [cx - hw, cy - hh, cx + hw, cy + hh]; if (hit(r)) continue; placed.push(r);
      const col = M.cfg.twoCol && tRanges()?.length > 1 ? `;color:${RANGE_COL[st.k ? 1 : 0]}` : '';
      h += `<span class="mlbl rl k-${L.k}"${L.pid ? ` data-pid="${L.pid}"` : ''} style="left:${Math.round(cx)}px;top:${Math.round(cy)}px;letter-spacing:${ls.toFixed(1)}px;transform:translate(-50%,-50%) rotate(${(ang * 180 / Math.PI).toFixed(1)}deg);opacity:${(st.o * (caps ? 0.75 : 0.85)).toFixed(2)}${col}">${esc(txt)}</span>`;
    }
  }
  // the sites in view (from zoom 7): their names, where there is room
  if (M.cfg.sites && z >= 7 && M.map.getLayer('sites')) {
    const fs = M.map.queryRenderedFeatures({ layers: ['sites'] }).slice(0, 400);
    const seen = new Set(); let n = 0;
    for (const f of fs) {
      const id = f.properties.id; if (seen.has(id)) continue; seen.add(id);
      const p = M.P?.byId.get(id); if (!p) continue;
      const pt = M.map.project([p.lon, p.lat]); if (pt.x < 0 || pt.x > W || pt.y < 0 || pt.y > H) continue;
      const txt = labelOf({ p, names: {} }); ctx.font = '11.5px "Gentium Book Plus", serif';
      const w = ctx.measureText(txt).width + 4, r = [pt.x + 5, pt.y - 13, pt.x + 5 + w, pt.y + 1];
      if (hit(r)) continue; placed.push(r);
      h += `<span class="mlbl site" data-pid="${id}" style="left:${Math.round(r[0])}px;top:${Math.round(r[1])}px;opacity:${tState(p.y0, p.y1).o || 1}">${esc(txt)}</span>`;
      if (++n > 120) break;
    }
  }
  return h;
}

// ---------------------------------------------------------------- the time slider
const CLOCK_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const tPct = y => (y - TMIN) / (TMAX - TMIN) * 100;
function timeBarHTML() {
  const ticks = []; for (let y = -800; y <= TMAX; y += 200) ticks.push(`<i style="left:${tPct(y)}%"><span>${y < 0 ? -y : y === 0 ? '0' : y}</span></i>`);
  return `<div class="mtl"><span class="mtv" id="mapTimeV"></span><button type="button" class="mtw" id="mapWDate" title="Date of this work – tap to correct"></button><button type="button" class="mtx" data-mtoff="1" title="Period filter off" aria-label="Period filter off">✕</button></div>
    <div class="mtt" id="mapTrack"><div class="mtaxis">${ticks.join('')}<b style="left:${tPct(0)}%">BC | AD</b></div><div id="mapRanges"></div></div>`;
}
function renderTime() {
  const bar = $('#mapTime'); if (!bar) return;
  bar.hidden = !M.cfg.time; $('#mapBody').classList.toggle('hastime', !!M.cfg.time);
  $('#mapTimeBtn')?.classList.toggle('on', !!M.cfg.time);
  if (!M.cfg.time) return;
  const R = M.T?.ranges || [], two = M.cfg.twoCol && R.length > 1;
  $('#mapTimeV').innerHTML = R.length ? R.map((r, k) => `<span${two ? ` style="color:${RANGE_COL[k ? 1 : 0]}"` : ''}>${esc(fmtR(r))}</span>`).join(' · ') + (M.cfg.tol ? ` <small>± ${M.cfg.tol}</small>` : '') : '<small>Tap the line to choose a date</small>';
  const wd = $('#mapWDate'); wd.hidden = !S.text; wd.innerHTML = `Text: ${M.year != null ? esc(fmtY(M.year)) : 'no date'} <small>✎</small>`;
  $('#mapRanges').innerHTML = R.map(([a, b], k) => `<div class="mtr${a === b ? ' pt' : ''}" data-k="${k}" style="left:${tPct(a)}%;width:${tPct(b) - tPct(a)}%${two ? `;--rc:${RANGE_COL[k ? 1 : 0]}` : ''}"></div>`
    + `<div class="mth" data-k="${k}" data-e="0" style="left:${tPct(a)}%${two ? `;--rc:${RANGE_COL[k ? 1 : 0]}` : ''}"></div>` + (a !== b ? `<div class="mth" data-k="${k}" data-e="1" style="left:${tPct(b)}%${two ? `;--rc:${RANGE_COL[k ? 1 : 0]}` : ''}"></div>` : '')).join('')
    + (M.year != null ? `<div class="mtwk" style="left:${tPct(M.year)}%" title="Date of the work"></div>` : '');
}
let timeRaf = 0;
function timeChanged(final) {
  renderTime();
  if (!timeRaf) timeRaf = requestAnimationFrame(() => { timeRaf = 0; applyLayers(); });
}
// merging: a range whose ends meet becomes a date; ranges that touch become one
function normRanges() {
  let R = M.T.ranges.map(([a, b]) => [Math.min(a, b), Math.max(a, b)]).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const r of R) { const l = out[out.length - 1]; if (l && r[0] <= l[1] + YSTEP) l[1] = Math.max(l[1], r[1]); else out.push(r); }
  M.T.ranges = out;
}
function wireTime() {
  const tr = $('#mapTrack'); if (!tr || tr._w) return; tr._w = true;
  const yAt = x => { const r = tr.getBoundingClientRect(); return snapY(TMIN + (x - r.left) / r.width * (TMAX - TMIN)); };
  let drag = null, lp = null;
  tr.addEventListener('pointerdown', ev => {
    ev.preventDefault(); tr.setPointerCapture(ev.pointerId);
    const R = M.T.ranges, y = yAt(ev.clientX), h = ev.target.closest('.mth'), rg = ev.target.closest('.mtr');
    if (!R.length) { M.T.ranges = [[y, y]]; drag = { k: 0, e: 0, x0: ev.clientX }; timeChanged(); return; }
    if (h) drag = { k: +h.dataset.k, e: +h.dataset.e, x0: ev.clientX };
    else if (rg && !rg.classList.contains('pt')) drag = { k: +rg.dataset.k, e: 'm', x0: ev.clientX, y0: y, r0: [...R[+rg.dataset.k]] };
    else {                                    // on the line: the nearest end comes here
      let best = null; R.forEach(([a, b], k) => { for (const [e, v] of [[0, a], [1, b]]) { const d = Math.abs(v - y); if (!best || d < best.d) best = { k, e, d }; } });
      drag = { k: best.k, e: best.e, x0: ev.clientX };
      const r = R[drag.k]; if (r[0] === r[1]) { r[0] = r[1] = y; } else r[drag.e] = y; timeChanged();
    }
    // long press: a date opens into a period; a period splits into two
    clearTimeout(lp); lp = setTimeout(() => {
      if (!drag || drag.moved) return;
      const r = M.T.ranges[drag.k];
      if (r[0] === r[1]) { M.T.ranges[drag.k] = [snapY(r[0] - 50), snapY(r[0] + 50)]; toast('A period – pull the two ends apart or together'); }
      else if (drag.e === 'm' && M.T.ranges.length < TMAXR && r[1] - r[0] >= 60) { const m = snapY(drag.y0); M.T.ranges.splice(drag.k, 1, [r[0], Math.max(r[0], m - 20)], [Math.min(r[1], m + 20), r[1]]); toast('Two periods – pull them together to join them'); }
      else return;
      navigator.vibrate?.(15); drag = null; timeChanged();
    }, 550);
  });
  tr.addEventListener('pointermove', ev => {
    if (!drag) return;
    if (Math.abs(ev.clientX - drag.x0) > 4) drag.moved = true; if (!drag.moved) return;
    const y = yAt(ev.clientX), r = M.T.ranges[drag.k]; if (!r) return;
    if (drag.e === 'm') { const d = y - drag.y0, w = drag.r0[1] - drag.r0[0], a = Math.max(TMIN, Math.min(TMAX - w, drag.r0[0] + d)); r[0] = a; r[1] = a + w; }
    else if (r[0] === r[1]) { r[0] = r[1] = y; }
    else { r[drag.e] = y; if (r[0] > r[1]) { r.reverse(); drag.e = 1 - drag.e; } }
    timeChanged();
  });
  const up = () => { clearTimeout(lp); if (!drag) return; drag = null; normRanges(); timeChanged(true); };
  tr.addEventListener('pointerup', up); tr.addEventListener('pointercancel', up);
}
// the date of the work: the author's date, or what the reader set (for this work, remembered)
async function workDateDialog() {
  const t = S.text; if (!t) return;
  const key = 'wyear|' + workKeyOf(t), own = await setting(key);
  const r = await dialog(`<h3>Date of this work</h3><p class="hint">Used for the places of the text (places known only from later times are not shown) and as the starting date of the period filter. ${own != null ? 'Set by you.' : 'From the author’s dates.'}</p>
    <label>Year<input type="text" name="y" value="${M.year != null ? esc(fmtY(M.year)) : ''}" placeholder="e.g. 380 BC or AD 117" autocomplete="off"></label>`,
    [...(own != null ? [['reset', 'Author’s date']] : []), ['cancel', 'Cancel'], ['ok', 'Save']], 'ok');
  if (r.action === 'reset') await del('settings', key);
  else if (r.action === 'ok') {
    const s = String(r.data.y || '').trim(), m = s.match(/(-?\d+)/); if (!m) return;
    let y = +m[1]; if (/\b(bc|bce|v\.?\s*chr)/i.test(s) && y > 0) y = -y;
    await setting(key, y);
  } else return;
  M.T = null; M.workCache = null; await placesForText(); timeFor(S.text); timeChanged(true); refreshMapData();
}

// ---------------------------------------------------------------- the layer menu (folded sections, remembered)
function foldSec(k, title, body) {
  const open = !!M.cfg.fold?.[k];
  return `<div class="mfold${open ? ' open' : ''}" data-fk="${k}"><button type="button" class="mfh" data-mfold="${k}"><span>${title}</span><i>▸</i></button><div class="mfb">${body}</div></div>`;
}
const tgl = (k, l, on) => `<button type="button" class="mtg${(on ?? M.cfg[k]) ? ' on' : ''}" data-mlay="${k}"><span class="ck"></span>${l}</button>`;
const segc = (k, opts, lbl) => `${lbl ? `<div class="navh">${lbl}</div>` : ''}<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-mcfg="${k}" data-v="${v}" class="${String(M.cfg[k]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
function layersHTML() {
  const anc = M.anc;
  return foldSec('text', 'The text', tgl('peoples', 'Peoples (Isauri, Persae …)')
      + segc('persons', [['unsure', 'Mark as uncertain'], ['hide', 'Not as places']], 'Words that may name a person')
      + segc('names', [['text', 'As in the text'], ['english', 'English'], ['modern', 'Modern']], 'Names'))
    + foldSec('time', 'Period', tgl('time', 'Period filter (time slider)')
      + segc('tol', [[0, '0'], [10, '± 10'], [25, '± 25'], [50, '± 50'], [100, '± 100']], 'Tolerance (years)')
      + segc('gone', [['fade', 'Faded'], ['hide', 'Hidden']], 'Places that no longer existed')
      + segc('undated', [['show', 'Shown'], ['fade', 'Faded'], ['hide', 'Hidden']], 'Places without a date')
      + segc('twoCol', [[false, 'One colour'], [true, 'Two colours']], 'Several periods')
      + '<p class="hint small">Hold a date on the slider to make it a period, hold a period to split it in two; pull ends together to join them.</p>')
    + foldSec('sites', 'All ancient places', tgl('sites', 'Show the places of the gazetteer') + '<div class="mcats">' + SITE_CATS.map(([k, l, , c1, c2]) => `<button type="button" class="mtg${M.cfg.cats?.[k] ? ' on' : ''}" data-mcat="${k}"><span class="ck"></span><i class="dot" style="--c:${document.documentElement.dataset.theme === 'dark' ? c2 : c1}"></i>${l}</button>`).join('') + '</div>')
    + foldSec('anc', 'Ancient world', anc ? tgl('coast', 'Coastlines of the period') + tgl('empires', 'Empires and Roman provinces')
      + segc('regions', [['off', 'Off'], ['labels', 'Names'], ['areas', 'Areas']], 'Regions and peoples') + tgl('roads', 'Roads (Barrington Atlas)') + tgl('urban', 'City outlines')
      : '<p class="hint small">Needs the download <b>Ancient world</b> (coastlines of the periods, empires and provinces, regions and peoples, roads).</p><button type="button" data-mapdl="1">Open Dictionaries → Maps</button>')
    + foldSec('modern', 'Today', tgl('borders', 'Modern borders'));
}
function layersPop() {
  const pop = $('#mapPop'); if (!pop.hidden && pop.dataset.k === 'layers') { pop.hidden = true; return; }
  pop.dataset.k = 'layers'; pop.classList.add('mlayers');
  pop.innerHTML = `<div class="navh">Layers</div>${layersHTML()}`;
  pop.hidden = false; pop.scrollTop = M.cfg.layScroll || 0;
  if (!pop._sw) { pop._sw = true; pop.addEventListener('scroll', () => { if (pop.dataset.k !== 'layers') return; clearTimeout(pop._st); pop._st = setTimeout(() => { M.cfg.layScroll = pop.scrollTop; saveMapCfg(); }, 300); }); }
}
// the clicks of the layer menu and the slider (wired once, from wireMapUI)
async function layerClick(b) {
  const d = b.dataset;
  if (d.mfold) { const f = b.closest('.mfold'), on = !f.classList.contains('open'); f.classList.toggle('open', on); (M.cfg.fold ??= {})[d.mfold] = on; saveMapCfg(); return true; }
  if (d.mcat) { (M.cfg.cats ??= {})[d.mcat] = !M.cfg.cats[d.mcat]; b.classList.toggle('on', M.cfg.cats[d.mcat]); if (M.cfg.cats[d.mcat] && !M.cfg.sites) { M.cfg.sites = true; $('#mapPop [data-mlay="sites"]')?.classList.add('on'); } await saveMapCfg(); applyLayers(); return true; }
  if (d.mcfg) {
    let v = d.v; if (v === 'true' || v === 'false') v = v === 'true'; else if (/^\d+$/.test(v)) v = +v;
    M.cfg[d.mcfg] = v; b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); await saveMapCfg();
    if (d.mcfg === 'persons') { M.workCache = null; await placesForText(); return refreshMapData(), true; }
    if (d.mcfg === 'names') return drawLabels(), true;
    if (d.mcfg === 'regions' && v !== 'off') await loadAncientLabels();
    renderTime(); applyLayers(); return true;
  }
  if (d.mlay) {
    const k = d.mlay; M.cfg[k] = !M.cfg[k]; b.classList.toggle('on', M.cfg[k]); await saveMapCfg();
    if (k === 'borders') M.map.setLayoutProperty('borders', 'visibility', M.cfg.borders ? 'visible' : 'none');
    if (k === 'peoples') { markPlaces(); await refreshMapData(); }
    if (k === 'time') { timeFor(S.text); renderTime(); }
    if (k === 'sites' && M.cfg.sites && !siteCats().length) { M.cfg.cats = { ...LCFG.cats }; $('#mapPop .mcats')?.querySelectorAll('[data-mcat]').forEach(x => x.classList.toggle('on', !!M.cfg.cats[x.dataset.mcat])); }
    applyLayers(); return true;
  }
  if (d.mtoff || b.id === 'mapTimeBtn') { M.cfg.time = b.id === 'mapTimeBtn' ? !M.cfg.time : false; await saveMapCfg(); timeFor(S.text); renderTime(); applyLayers(); $('#mapPop [data-mlay="time"]')?.classList.toggle('on', M.cfg.time); return true; }
  if (b.id === 'mapWDate') { workDateDialog(); return true; }
  return false;
}
