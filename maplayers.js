// ================================================================ Pult · map layers and the period filter
// The time slider (one date, a period, or several periods), all places of the gazetteer by category ("sites"), and the
// layers of the "Ancient world" package (Ancient World Mapping Center, ODbL): coastlines of the periods, empires and Roman
// provinces at several dates, names and rough areas of regions and peoples, roads, city outlines.
// Settings: mapCfg (layers, time options, fold state of the layer menu) · wyear|<work> (date of a work, corrected by the reader)
const TMAXR = 5;                                                   // at most five periods
const fmtY = y => y == null ? '' : y < 0 ? `${-y} BC` : `AD ${Math.max(1, y)}`;
const fmtR = ([a, b]) => a === b ? fmtY(a) : a < 0 && b < 0 ? `${-a}–${-b} BC` : a >= 0 ? `AD ${Math.max(1, a)}–${b}` : `${fmtY(a)} – ${fmtY(b)}`;
const LCFG = { time: true, tol: 25, gone: 'fade', undated: 'show', later: 'fade', rivers: true, lakes: true, provinces: true, regArea: false, aqueducts: false, walls: false, canals: false, own: true, dOff: [], dLen: 'off', units: 'metric', basemap: 'hd',
  nmPlaces: true, nmRegions: true, nmMountains: true, nmIslands: true, twoCol: false, sites: false, cats: { settl: true }, coast: true, empires: true, regions: 'labels', roads: false, urban: true, fold: { text: true }, layScroll: 0 };
// the colours of the periods (when several are shown in their own colours); the reader can set them (Map settings → Period)
const RANGE_COL = ['#c0503a', '#2f78b5', '#4a9a3a', '#9a55b5', '#c9922b'];
const rangeCol = k => (M.cfg?.rangeCols?.[k]) || RANGE_COL[k % RANGE_COL.length];

// ---------------------------------------------------------------- the period filter
// M.T = {work, ranges: [[a, b], …]} – a range with a === b is a single date; the map shows what existed then (± tolerance)
function timeFor(t) {
  const wk = t ? workKeyOf(t) : null;
  if (!M.T || M.T.work !== wk) M.T = { work: wk, ranges: M.year != null ? [[snapY(M.year), snapY(M.year)]] : [] };
  return M.T;
}
function snapY(y) { const [lo, hi] = TLIM(), st = tStep(); return Math.max(lo, Math.min(hi, Math.round(y / st) * st)); }
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
// known only from sources after the date: the gazetteer dates a place by its sources, not by its founding –
// many towns are attested only in Roman times, so they are faded by default rather than hidden
const tLateO = () => M.cfg.later === 'hide' ? 0 : M.cfg.later === 'show' ? 1 : 0.35;
function tOpacity(base = 1) {
  const R = tRanges(); if (!R) return base;
  return ['*', base, ['case', UND, tUnd(), ['any', ...R.map(tIn)], 1, ['any', ...R.map(tGone)], tGoneO(), tLateO()]];
}
function tFilter() { const R = tRanges(); return R ? ['>', tOpacity(1), 0] : true; }
// the same in JavaScript (labels): {o: opacity, k: which period}
function tState(y0, y1) {
  const R = tRanges(); if (!R) return { o: 1, k: 0 };
  if (y0 == null && y1 == null) return { o: tUnd(), k: 0 };
  const a = y0 ?? -99999, b = y1 ?? 99999;
  for (let k = 0; k < R.length; k++) if (a <= R[k][1] && b >= R[k][0]) return { o: 1, k };
  return { o: R.some(r => a <= r[1] && b < r[0]) ? tGoneO() : tLateO(), k: 0 };
}
// several periods in two colours (setting): the colour of the period a feature belongs to
function tColor(base) {
  const R = tRanges(); if (!R || R.length < 2 || !M.cfg.twoCol) return base;
  return ['case', ...R.flatMap((r, k) => [tIn(r), rangeCol(k)]), base];
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
  ['region', 'Regions, provinces, peoples', 'region,province,province-2,people,ethnic-region,tribe,state,nome-gr,district,tribus', '#6f9a46', '#9ccd73'],
  ['arch', 'Everything else', '', '#8a8478', '#b5ae9f'],          // all other kinds (sites, buildings, labels …)
];
function sitesData() {
  if (M.sitesFC || !M.P) return M.sitesFC || { type: 'FeatureCollection', features: [] };
  const catOf = new Map(); SITE_CATS.forEach(([, , ts], c) => ts.split(',').forEach(t => { const i = M.P.ti[t]; if (i != null && !catOf.has(i)) catOf.set(i, c); }));
  const modern = M.P.ti['settlement-modern'], feats = [];
  for (const p of M.P.P) {
    if (p.ty.length === 1 && p.ty[0] === modern) continue;
    let c = null; for (const t of p.ty) if (catOf.has(t)) { c = catOf.get(t); break; }
    if (c == null) c = SITE_CATS.length - 1;                      // every place belongs somewhere
    const pr = { id: p.id, c, w: p.w || 0 }; if (p.y0 != null) pr.y0 = p.y0; if (p.y1 != null) pr.y1 = p.y1; if (p.rough) pr.r = 1;
    feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: pr });
  }
  return M.sitesFC = { type: 'FeatureCollection', features: feats };
}
// how significant a place is, 0–9: links from other places of the gazetteer, names, city, Greek and Latin names, position
const SIG_DEF = { links: 3, pop: 1.5, corp: 1, dev: 0.5, names: 0.6, city: 2, both: 1.5, rough: 2 };
const SIG_UI = [['links', 'Links from other places', 0, 6, 0.5], ['pop', 'Population (cities of the Roman world)', 0, 4, 0.5], ['corp', 'Mentions in all texts of the library', 0, 4, 0.5], ['dev', 'Mentions in the texts on this device', 0, 4, 0.5], ['names', 'Number of names', 0, 2, 0.1], ['city', 'City (polis, urban)', 0, 6, 0.5], ['both', 'Greek and Latin names', 0, 4, 0.5], ['rough', 'Position only approximate (less)', 0, 6, 0.5]];
// the score of a place; the ranks 0–9 then go by position in the order (the top 30 get 9, the next 50 get 8 …),
// so that the weights change which places come first, not how many are shown
function placeScore(p) {
  const W = Object.assign({}, SIG_DEF, M.cfg?.sigW || {}), ti = M.P?.ti || {};
  const langs = new Set(p.names.map(n => n[1]));
  const sc = W.links * Math.log2(1 + (p.conn || 0)) + W.pop * Math.log2(1 + (p.pop || 0) / 1000) + W.corp * Math.log2(1 + (p.mc || 0)) + W.dev * Math.log2(1 + (M.devCnt?.get(p.id) || 0)) + W.names * Math.min(p.names.length, 12) + (p.ty.includes(ti.urban) || p.ty.includes(ti.polis) ? W.city : 0)
    + (langs.has('grc') && langs.has('la') ? W.both : 0) - (p.rough ? W.rough : 0);
  return sc;
}
const RANK_TOP = [30, 80, 200, 400, 800, 1600, 3200, 6400, 12800];   // places with rank 9, ≥ 8, ≥ 7 …
function rankPlaces() {
  if (!M.P?.full) return;                       // (reading only: the ranks stored with the place index)
  const P = M.P.P, sc = P.map(placeScore), ord = P.map((_, i) => i).sort((a, b) => sc[b] - sc[a]);
  ord.forEach((i, k) => { let w = 9; for (const n of RANK_TOP) { if (k < n) break; w--; } P[i].w = sc[i] > 0 ? w : 0; });
  // keep the ranks with the place index, for reading without the map
  if (M.P.ranks) { const r = Int8Array.from(P, p => p.w || 0); M.P.ranks = r; clearTimeout(M.rankT); M.rankT = setTimeout(() => plDB().then(db => db.transaction('meta', 'readwrite').objectStore('meta').put(r, 'ranks')).catch(() => { }), 1500); }
}
function recomputeSig() {
  if (!M.P) return;
  rankPlaces();
  M.sitesFC = null; M.map?.getSource('sites')?.setData(sitesData()); applyLayers();
}
// the size of a place's name: larger for more significant places, at every zoom
const siteFont = p => +(10.5 + 0.38 * (p.w || 0)).toFixed(1);
// zoomed out, only places of at least this significance get a dot (and a name)
const dotMinW = z => z < 3.5 ? 7 : z < 4.5 ? 5 : z < 5.5 ? 3 : z < 6.5 ? 1 : 0;
// the kinds of places ticked in the layer menu (settlements by default)
const siteCats = () => SITE_CATS.map((c, i) => M.cfg.cats?.[c[0]] ? i : -1).filter(i => i >= 0);

// ---------------------------------------------------------------- the layers in the map style
const EMP_COL = { persia: '#9a6a2a', alexander: '#3f6fa8', rome60bc: '#b23a3a', rome117: '#b23a3a', rome200: '#b23a3a' };
function layerStyle(st, C) {
  const dark = document.documentElement.dataset.theme === 'dark', A = MAPS + 'ancient/';
  const before = (id, ...ls) => { const k = st.layers.findIndex(l => l.id === id); st.layers.splice(k < 0 ? st.layers.length : k, 0, ...ls); };
  st.sources.sites = { type: 'geojson', data: sitesData() };
  // Landscape – detailed (PMTiles): from zoom 5 the exact coasts, lakes and rivers replace those of the base map
  const bm = M.cfg?.basemap || 'hd', hd = bm === 'hd' && pmUrl('landscape/landscape.pmtiles');   // the base map chosen (Layers → Landscape)
  // Natural Earth II: the painted landscape (relief, deserts, green lowlands) over land and sea; its sea colour for the waters of the period
  const ne2 = bm === 'ne2' && pmUrl('ne2/ne2.pmtiles');
  if (ne2) {
    st.sources.ne2 = { type: 'raster', url: ne2, tileSize: 256 };
    const k = st.layers.findIndex(l => l.id === 'land');
    const paint = { 'raster-resampling': 'linear', 'raster-fade-duration': 0, ...(dark ? { 'raster-brightness-max': 0.62, 'raster-saturation': -0.3 } : {}) };
    // the regions downloaded (zoom 5–7) above the whole world (zoom 0–4, enlarged beyond): the base map stays covered everywhere
    const regs = [...(M.pkFiles || [])].filter(f => /^ne2\/.+\.pmtiles$/.test(f) && f !== 'ne2/ne2.pmtiles').sort();
    regs.forEach((f, i) => { st.sources['ne2r' + i] = { type: 'raster', url: pmUrl(f), tileSize: 256 }; });
    st.layers.splice(k + 1, 0, { id: 'ne2', type: 'raster', source: 'ne2', paint }, ...regs.map((f, i) => ({ id: 'ne2r' + i, type: 'raster', source: 'ne2r' + i, paint })));
    C = Object.assign({}, C, { sea: dark ? '#2b4558' : '#70a9d0' });
  }
  if (hd) {
    const Z = 5, cut = id => { const l = st.layers.find(x => x.id === id); if (l) l.maxzoom = Z; };
    ['lakes', 'rivers', 'borders'].forEach(cut);                 // (the land stays: outside the area of the package)
    st.sources.hd = { type: 'vector', url: hd };
    st.sources.hdarea = { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-20, 0], [80, 0], [80, 62], [-20, 62], [-20, 0]]] } } };
    const after = (id, ...ls) => { const k = st.layers.findIndex(l => l.id === id); st.layers.splice(k + 1, 0, ...ls); };
    after('land',
      { id: 'hd-landbg', type: 'fill', source: 'hdarea', minzoom: Z, paint: { 'fill-color': C.land } },
      { id: 'hd-sea', type: 'fill', source: 'hd', 'source-layer': 'sea', minzoom: Z, paint: { 'fill-color': C.sea } });   // (no outline: the edges of the tiles would show)
    after('lakes', { id: 'hd-lakes', type: 'fill', source: 'hd', 'source-layer': 'lakes', minzoom: Z, paint: { 'fill-color': C.sea, 'fill-outline-color': C.coast } });
    after('rivers', { id: 'hd-rivers', type: 'line', source: 'hd', 'source-layer': 'rivers', minzoom: Z, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.river, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 9, 2.2, 13, 3.5] } });
    after('borders', { id: 'hd-borders', type: 'line', source: 'hd', 'source-layer': 'borders', minzoom: Z, paint: { 'line-color': C.border, 'line-width': 0.8, 'line-dasharray': [3, 2] } });
  }
  if (M.anc) {
    const empty = { type: 'FeatureCollection', features: [] };
    for (const n of ['water', 'empires', 'provinces', 'areas', 'roads', 'urban', 'aqueducts', 'walls', 'canals']) st.sources['a_' + n] = { type: 'geojson', data: !M.ancFiles || M.ancFiles.has(n) ? A + n + '.json' : empty };
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
      { id: 'a-canals', type: 'line', source: 'a_canals', paint: { 'line-color': C.river, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 10, 2.5] } },
      { id: 'a-aqueducts', type: 'line', source: 'a_aqueducts', paint: { 'line-color': dark ? '#7fb3d9' : '#3c78a8', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.7, 12, 2.4], 'line-dasharray': [4, 1.5] } },
      { id: 'a-walls', type: 'line', source: 'a_walls', paint: { 'line-color': dark ? '#c9b48a' : '#6b5536', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.2, 12, 3.5] } },
      { id: 'a-urban', type: 'fill', source: 'a_urban', minzoom: 8, paint: { 'fill-color': dark ? '#5a5144' : '#d9cbb0', 'fill-opacity': 0.8 } },
      { id: 'a-urban-line', type: 'line', source: 'a_urban', minzoom: 8, paint: { 'line-color': dark ? '#8a7c66' : '#a8936c', 'line-width': 1 } });
  }
  // Roman roads of Itiner-e (replacing those of the Barrington Atlas): certain solid, conjectured dashed, hypothetical dotted
  const it = pmUrl('itinere/roads_full.pmtiles') || pmUrl('itinere/roads.pmtiles');
  if (it) {
    st.sources.itin = { type: 'vector', url: it };
    const col = dark ? '#c39a6a' : '#8a5a32', w = ['interpolate', ['linear'], ['zoom'], 3, ['case', ['==', ['get', 'm'], 1], 0.7, 0.35], 8, ['case', ['==', ['get', 'm'], 1], 2, 1], 13, ['case', ['==', ['get', 'm'], 1], 4, 2.2]];
    const k = st.layers.findIndex(l => l.id === 'pl-region');
    st.layers.splice(k < 0 ? st.layers.length : k, 0,
      { id: 'it-roads', type: 'line', source: 'itin', 'source-layer': 'roads', filter: ['==', ['get', 'c'], 2], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': col, 'line-width': w } },
      { id: 'it-roads-c', type: 'line', source: 'itin', 'source-layer': 'roads', filter: ['==', ['get', 'c'], 1], layout: { 'line-join': 'round' }, paint: { 'line-color': col, 'line-width': w, 'line-dasharray': [3, 1.5] } },
      { id: 'it-roads-h', type: 'line', source: 'itin', 'source-layer': 'roads', filter: ['==', ['get', 'c'], 0], layout: { 'line-cap': 'round' }, paint: { 'line-color': col, 'line-width': w, 'line-dasharray': [0.1, 2] } });
  }
  // your own places
  st.sources.own = { type: 'geojson', data: ownFC() };
  before('pl-region', { id: 'own', type: 'circle', source: 'own', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3.5, 10, 6.5], 'circle-color': ['coalesce', ['get', 'c'], C.acc], 'circle-stroke-color': C.bg, 'circle-stroke-width': 1.5 } });
  drawStyle(st, C, before);                                       // drawings (mapdraw.js), below your places
  before('pl-region', { id: 'sites', type: 'circle', source: 'sites', minzoom: 2.5, paint: {
    // zoomed out only the significant places (0–9), the others appear step by step
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, ['+', 1.4, ['*', 0.15, ['get', 'w']]], 8, ['+', 3, ['*', 0.2, ['get', 'w']]], 12, ['+', 4.5, ['*', 0.25, ['get', 'w']]]],
    'circle-color': tColor(['match', ['get', 'c'], ...SITE_CATS.flatMap((c, i) => [i, c[dark ? 4 : 3]]), C.fg]),
    'circle-stroke-color': C.bg, 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 3, 0.4, 8, 1],
    'circle-opacity': 0.85, 'circle-stroke-opacity': 0.85 } });
  reliefStyle(st, C);                                               // relief, contour lines, sea depth (maprelief.js)
  applyLayersTo(st.layers);
  return st;
}
// visibility, filters and opacity from the settings and the period filter (on the style before it is built, or on the map)
function layerProps() {
  const c = M.cfg, tf = tFilter(), sf = snapFilter(), shown = [...(M.shown?.keys() || [])].filter(x => typeof x === 'number');
  const vis = v => v ? 'visible' : 'none';
  return {
    'a-water': { vis: 'none', filter: sf || false },          // the coastline of the period: shelved for now (the data covers only a few places)
    'a-areas': { vis: vis(c.regArea), filter: ['all', ['in', ['get', 'k'], ['literal', c.peoples ? ['region', 'people'] : ['region']]], tf], paint: { 'fill-opacity': tOpacity(0.12) } },
    'a-areas-edge': { vis: vis(c.regArea), filter: ['all', ['in', ['get', 'k'], ['literal', c.peoples ? ['region', 'people'] : ['region']]], tf], paint: { 'line-opacity': tOpacity(0.16) } },
    'a-emp': { vis: vis(c.empires && sf), filter: sf || false },
    'a-emp-line': { vis: vis(c.empires && sf), filter: sf || false },
    'a-prov': { vis: vis(c.provinces !== false && sf), filter: sf || false },
    'a-aqueducts': { vis: vis(c.aqueducts), filter: tf, paint: { 'line-opacity': tOpacity(0.85) } },
    'a-walls': { vis: vis(c.walls), filter: tf, paint: { 'line-opacity': tOpacity(0.9) } },
    'a-canals': { vis: vis(c.canals), filter: tf, paint: { 'line-opacity': tOpacity(0.85) } },
    'a-roads': { vis: vis(c.roads && !M.map?.getLayer?.('it-roads') && !M.pkFiles?.has('itinere/roads.pmtiles') && !M.pkFiles?.has('itinere/roads_full.pmtiles')), filter: ['all', ['==', ['get', 'c'], 1], tf], paint: { 'line-opacity': tOpacity(0.85) } },
    'a-roads-a': { vis: vis(c.roads && !M.map?.getLayer?.('it-roads') && !M.pkFiles?.has('itinere/roads.pmtiles') && !M.pkFiles?.has('itinere/roads_full.pmtiles')), filter: ['all', ['!=', ['get', 'c'], 1], tf], paint: { 'line-opacity': tOpacity(0.7) } },
    // Itiner-e: mostly undated – undated roads are always shown, dated ones follow the period filter
    ...Object.fromEntries([['it-roads', 2, 0.9], ['it-roads-c', 1, 0.8], ['it-roads-h', 0, 0.6]].map(([id, cc, o]) => [id, { vis: vis(c.roads), filter: dTimeF() ? ['all', ['==', ['get', 'c'], cc], dTimeF()] : ['==', ['get', 'c'], cc], paint: { 'line-opacity': dOpacity(o) } }])),
    rivers: { vis: vis(c.rivers !== false) }, lakes: { vis: vis(c.lakes !== false) },
    'hd-rivers': { vis: vis(c.rivers !== false) }, 'hd-lakes': { vis: vis(c.lakes !== false) },
    ...(c.basemap === 'ne2' ? { lakes: { vis: 'none' }, rivers: { vis: vis(c.rivers === true) } } : {}),   // Natural Earth II has its own waters 'hd-borders': { vis: vis(!!c.borders) }, borders: { vis: vis(!!c.borders) },
    'a-urban': { vis: vis(c.urban) }, 'a-urban-line': { vis: vis(c.urban) },
    // "Places from" switched off: every place of the kinds ticked
    sites: { vis: vis(c.pfOn === false), filter: ['all', ['in', ['get', 'c'], ['literal', siteCats()]], ['>=', ['get', 'w'], dotMinW(M.map?.getZoom() ?? 6)], tf, ['!', ['in', ['get', 'id'], ['literal', shown]]]],
      // zoomed out, the less significant places are fainter (fading in as one zooms in)
      paint: { 'circle-opacity': ['interpolate', ['linear'], ['zoom'], 3, tOpacity(['min', 0.9, ['+', 0.15, ['*', 0.085, ['get', 'w']]]]), 7, tOpacity(['min', 0.9, ['+', 0.55, ['*', 0.05, ['get', 'w']]]]), 9, tOpacity(0.9)],
        'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 3, tOpacity(['min', 0.9, ['+', 0.1, ['*', 0.085, ['get', 'w']]]]), 7, tOpacity(0.7), 9, tOpacity(0.9)] } },
    ...drawLayerProps(), ...reliefLayerProps(),                                           // your places and drawings (mapdraw.js)
  };
}
function applyLayersTo(layers) {
  const P = layerProps();
  for (const l of layers) {
    const p = P[l.id]; if (!p) continue;
    (l.layout ??= {}).visibility = p.vis;
    // no filter (the period filter is off, or no date is known yet): the key must be absent – "filter: undefined" makes
    // the whole map style invalid, and the map never finishes loading (the cause of the failures since v133)
    if (p.filter === true) delete l.filter; else if (p.filter !== undefined) l.filter = p.filter;
    if (p.paint) Object.assign(l.paint, p.paint);
  }
}
function ownFC() {
  return { type: 'FeatureCollection', features: [...(M.own?.values() || [])].filter(p => typeof dShown !== 'function' || dShown(p)).map(p => {
    const pr = { id: p.id }; if (p.c) pr.c = p.c; if (p.y0 != null) pr.y0 = p.y0; if (p.y1 != null) pr.y1 = p.y1;
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: pr }; }) };
}
function applyLayers() {
  if (!M.map?.getLayer('sites')) return;
  M.map.getSource('own')?.setData(ownFC()); M.map.getSource('draw')?.setData(drawFC());
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
  if (M.ancLab || !M.ancFiles?.has('labels')) return M.ancLab;
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
  const c = M.cfg;
  if ((c.nmRegions || c.nmMountains || c.nmIslands) && M.ancLab) {
    const kinds = new Set([...(c.nmRegions ? ['region', 'plain', 'people'] : []), ...(c.nmIslands ? ['water', ...(z >= 6 ? ['islands'] : [])] : []), ...(c.nmMountains && z >= 6 ? ['mountain'] : [])]);
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
      const r = [cx - hw, cy - hh, cx + hw, cy + hh]; if (hit(r)) continue; placed.push(r);              // (names of regions are not tappable: a tap there would pick a place by chance)
      const col = M.cfg.twoCol && tRanges()?.length > 1 ? `;color:${rangeCol(st.k)}` : '';
      h += `<span class="mlbl rl k-${L.k}"${L.pid ? ` data-pid="${L.pid}"` : ''} style="left:${Math.round(cx)}px;top:${Math.round(cy)}px;letter-spacing:${ls.toFixed(1)}px;transform:translate(-50%,-50%) rotate(${(ang * 180 / Math.PI).toFixed(1)}deg);opacity:${(st.o * (caps ? 0.75 : 0.85) * Math.min(1, 0.45 + Math.max(0, z - 3.5) * 0.18)).toFixed(2)}${col}">${esc(txt)}</span>`;
    }
  }
  // the places in view: their names where there is room, the most significant first (zoomed out: only those)
  if (M.cfg.pfOn === false && c.nmPlaces !== false && z >= 3 && M.map.getLayer('sites')) {
    const minW = dotMinW(z) + (z < 7 ? 1 : 0);                     // names a step more selective than dots
    const seen = new Set(), cand = [];
    for (const f of M.map.queryRenderedFeatures({ layers: ['sites'] })) {
      const id = f.properties.id; if (seen.has(id)) continue; seen.add(id);
      const p = M.P?.byId.get(id); if (!p) continue;
      const pt = M.map.project([p.lon, p.lat]); if (pt.x < 0 || pt.x > W || pt.y < 0 || pt.y > H) continue;
      if ((p.w || 0) < minW) continue;
      cand.push({ p, pt, w: (p.w || 0) * 100 + Math.min(p.names.length, 20) });
    }
    cand.sort((a, b) => b.w - a.w);
    let n = 0;
    for (const { p, pt } of cand) {
      const fs = siteFont(p), txt = labelOf({ p, names: {} }); ctx.font = `${fs}px "Gentium Book Plus", serif`;
      const w = ctx.measureText(txt).width + 4, r = [pt.x + 5, pt.y - fs - 1.5, pt.x + 5 + w, pt.y + 1];
      if (hit(r)) continue; placed.push(r); M.lblHit.push([r, p.id]);
      // zoomed out, names of less significant places are smaller and fainter
      const fade = Math.min(1, 0.35 + 0.075 * (p.w || 0) + Math.max(0, z - 5) * 0.12), big = (p.w || 0) >= 7;
      h += `<span class="mlbl site${big ? ' big' : ''}" data-pid="${p.id}" style="left:${Math.round(r[0])}px;top:${Math.round(r[1])}px;font-size:${fs}px;opacity:${((tState(p.y0, p.y1).o || 1) * fade).toFixed(2)}">${esc(txt)}</span>`;
      if (++n > 180) break;
    }
  }
  return h;
}

// ---------------------------------------------------------------- the time slider
const CLOCK_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
// the slider covers tMin–tMax (Map settings → Period; 4000 BC – AD 2050); the part shown (tView) is zoomed by pinching or
// the mouse wheel and moved by dragging the line; the steps of a date get finer as one zooms in
const TLIM = () => [M.cfg?.tMin ?? -4000, M.cfg?.tMax ?? 2050];
// the part shown at first (and by the button "Default view"): Map settings → Period, 1000 BC – AD 800 unless changed
function tDefView() {
  const [lo, hi] = TLIM(), d = M.cfg?.tDef || [-1000, 800], a = Math.max(lo, d[0]), b = Math.min(hi, d[1]);
  return b - a >= 20 ? [a, b] : [lo, hi];
}
function tView() {
  const [lo, hi] = TLIM(), v = M.cfg?.tView;
  return v && v[0] >= lo && v[1] <= hi && v[1] - v[0] >= 20 ? v : tDefView();
}
const tStep = () => { const v = tView(), s = v[1] - v[0]; return s > 1500 ? 10 : s > 400 ? 5 : 1; };
const tPct = y => { const [a, b] = tView(); return (y - a) / (b - a) * 100; };
function timeBarHTML() {
  return `<div class="mtl"><span class="mtv" id="mapTimeV"></span><button type="button" class="mtreset" data-mtview="1" title="Default view of the time line" aria-label="Default view of the time line"><svg width="18" height="14" viewBox="0 0 24 18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3v12M22 3v12M6 9h12M9.5 5.5 6 9l3.5 3.5M14.5 5.5 18 9l-3.5 3.5"/></svg></button></div>
    <div class="mtt" id="mapTrack"><div class="mtaxis" id="mapAxis"></div><div id="mapRanges"></div></div>`;
}
// the scale: as many marks as fit, at round numbers
function axisHTML() {
  const [a, b] = tView(), W = $('#mapTrack')?.clientWidth || 300, span = b - a;
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000].find(s => span / s <= W / 52) || 5000;
  const out = []; let first = true;
  for (let y = Math.ceil(a / step) * step; y <= b; y += step) {
    const lbl = y === 0 ? 'BC | AD' : y < 0 ? -y + (first && b < 0 ? ' BC' : '') : (first && a > 0 ? 'AD ' : '') + y;
    const pc = tPct(y);                                            // (at the ends the label stays inside the line)
    out.push(`<i${pc < 6 ? ' class="l"' : pc > 94 ? ' class="r"' : ''} style="left:${pc}%"><span>${lbl}</span></i>`); first = false;
  }
  if (a < 0 && b > 0 && !out.some(x => x.includes('BC | AD'))) out.push(`<i class="z" style="left:${tPct(0)}%"></i>`);
  return out.join('');
}
function renderTime() {
  const bar = $('#mapTime'); if (!bar) return;
  bar.hidden = !M.cfg.time; $('#mapBody').classList.toggle('hastime', !!M.cfg.time);
  $('#mapTimeBtn')?.classList.toggle('on', !!M.cfg.time);
  if (!M.cfg.time) return;
  const R = M.T?.ranges || [], two = M.cfg.twoCol && R.length > 1;
  $('#mapTimeV').innerHTML = R.length ? R.map((r, k) => `<span${two ? ` style="color:${rangeCol(k)}"` : ''}>${esc(fmtR(r))}</span>`).join(' · ') + (M.cfg.tol ? ` <small>± ${M.cfg.tol}</small>` : '') : '<small>Tap the line to choose a date</small>';
  $('#mapAxis').innerHTML = axisHTML();
  $('#mapRanges').innerHTML = R.map(([a, b], k) => `<div class="mtr${a === b ? ' pt' : ''}" data-k="${k}" style="left:${tPct(a)}%;width:${tPct(b) - tPct(a)}%${two ? `;--rc:${rangeCol(k)}` : ''}"></div>`
    + `<div class="mth" data-k="${k}" data-e="0" style="left:${tPct(a)}%${two ? `;--rc:${rangeCol(k)}` : ''}"></div>` + (a !== b ? `<div class="mth" data-k="${k}" data-e="1" style="left:${tPct(b)}%${two ? `;--rc:${rangeCol(k)}` : ''}"></div>` : '')).join('')
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
  const out = [], st = tStep();
  for (const r of R) { const l = out[out.length - 1]; if (l && r[0] <= l[1] + st) l[1] = Math.max(l[1], r[1]); else out.push(r); }
  M.T.ranges = out;
}
// the part of the slider shown: kept within the limits, at least 20 years
function setView(a, b) {
  const [lo, hi] = TLIM(); let span = Math.max(20, Math.min(hi - lo, b - a));
  a = Math.max(lo, Math.min(hi - span, a));
  M.cfg.tView = [Math.round(a), Math.round(a + span)];
  renderTime(); clearTimeout(M.tvT); M.tvT = setTimeout(saveMapCfg, 400);
}
// the whole bar (and a margin around it) takes the touches: two fingers anywhere on it zoom the line, one finger works the line
function wireTime() {
  const tr = $('#mapTrack'), bar = $('#mapTime'); if (!tr || tr._w) return; tr._w = true;
  const yRaw = x => { const r = tr.getBoundingClientRect(), [a, b] = tView(); return a + (x - r.left) / r.width * (b - a); };
  const yAt = x => snapY(yRaw(x));
  const xAt = y => { const r = tr.getBoundingClientRect(); return r.left + tPct(y) / 100 * r.width; };
  const ptrs = new Map();
  let drag = null, lp = null, pinch = null;
  bar.addEventListener('pointerdown', ev => {
    if (ev.target.closest('button,input,a')) return;                // (the buttons of the bar keep their taps)
    ev.preventDefault();
    ptrs.set(ev.pointerId, ev.clientX); bar.setPointerCapture(ev.pointerId);
    if (ptrs.size === 2) {                                         // two fingers: zoom the scale (what was moved is put back)
      clearTimeout(lp); if (drag?.r0 && drag.k != null && M.T.ranges[drag.k]) { M.T.ranges[drag.k] = [...drag.r0]; timeChanged(); }
      drag = null;
      const [x1, x2] = [...ptrs.values()], v = tView();
      pinch = { d0: Math.max(10, Math.abs(x1 - x2)), span0: v[1] - v[0], ym: yRaw((x1 + x2) / 2) };
      return;
    }
    if (ptrs.size > 2) return;
    const R = M.T.ranges, y = yAt(ev.clientX), reach = ev.pointerType === 'mouse' ? 14 : 30;
    // the nearest end, if the finger is on it; otherwise inside a period: the period (moved by dragging, split by holding)
    // (the reach of an end is at most a third of its period, so that the inside of a short period can still be held)
    let best = null; R.forEach(([a, b], k) => { const rc = a === b ? reach : Math.min(reach, (xAt(b) - xAt(a)) / 3); for (const [e, v] of [[0, a], [1, b]]) { const d = Math.abs(xAt(v) - ev.clientX); if (d <= rc && (!best || d < best.d)) best = { k, e, d }; } });
    if (best) drag = { k: best.k, e: best.e, x0: ev.clientX, r0: [...R[best.k]] };
    else { const k = R.findIndex(([a, b]) => a < b && y >= a && y <= b); drag = k >= 0 ? { k, e: 'm', x0: ev.clientX, y0: y, r0: [...R[k]] } : { pan: true, x0: ev.clientX, v0: [...tView()], y }; }
    if (drag.pan) return;
    // long press: a date opens into a period; a period splits into two
    clearTimeout(lp); lp = setTimeout(() => {
      if (!drag || drag.moved || drag.pan) return;
      const r = M.T.ranges[drag.k], [lo, hi] = TLIM(), st = tStep(), v = tView();
      // a new period about 90 px wide, easy to hold and split
      const half = Math.max(2 * st, snapY((90 / tr.getBoundingClientRect().width) * (v[1] - v[0]) / 2));
      if (r[0] === r[1]) { M.T.ranges[drag.k] = [Math.max(lo, snapY(r[0] - half)), Math.min(hi, snapY(r[0] + half))]; note('A period – pull the two ends apart or together', 2500, $('#mapTime')); }
      else if (drag.e === 'm' && M.T.ranges.length < TMAXR && r[1] - r[0] >= 6 * st) { const m = snapY(drag.y0), g = Math.max(st, snapY((v[1] - v[0]) / 60)); M.T.ranges.splice(drag.k, 1, [r[0], Math.max(r[0], m - g)], [Math.min(r[1], m + g), r[1]]); note('Two periods – pull them together to join them', 2500, $('#mapTime')); }
      else return;
      navigator.vibrate?.(15); drag = null; timeChanged();
    }, 550);
  });
  bar.addEventListener('pointermove', ev => {
    if (!ptrs.has(ev.pointerId)) return;
    ptrs.set(ev.pointerId, ev.clientX);
    if (pinch && ptrs.size >= 2) {
      const [x1, x2] = [...ptrs.values()], r = tr.getBoundingClientRect(), [lo, hi] = TLIM();
      const span = Math.max(20, Math.min(hi - lo, pinch.span0 * pinch.d0 / Math.max(10, Math.abs(x1 - x2))));
      const f = ((x1 + x2) / 2 - r.left) / r.width; setView(pinch.ym - f * span, pinch.ym - f * span + span); return;
    }
    if (!drag) return;
    if (Math.abs(ev.clientX - drag.x0) > 4) drag.moved = true; if (!drag.moved) return;
    if (drag.pan) { const r = tr.getBoundingClientRect(), d = (ev.clientX - drag.x0) / r.width * (drag.v0[1] - drag.v0[0]); setView(drag.v0[0] - d, drag.v0[1] - d); return; }
    // pulled past the end of the line: the scale moves along, a little with each movement
    const tb = tr.getBoundingClientRect(), v = tView(), sh = (v[1] - v[0]) * 0.02;
    if (ev.clientX > tb.right) setView(v[0] + sh, v[1] + sh); else if (ev.clientX < tb.left) setView(v[0] - sh, v[1] - sh);
    const y = yAt(Math.max(tb.left, Math.min(tb.right, ev.clientX))), r = M.T.ranges[drag.k]; if (!r) return;
    const [lo, hi] = TLIM();
    if (drag.e === 'm') { const d = y - drag.y0, w = drag.r0[1] - drag.r0[0], a = Math.max(lo, Math.min(hi - w, drag.r0[0] + d)); r[0] = a; r[1] = a + w; }
    else {
      // an end that comes close to another end (of its own period or of the next) snaps onto it: they join when let go
      const near = ev.pointerType === 'mouse' ? 10 : 16, x = xAt(y);
      let yy = y, bd = near + 1;
      M.T.ranges.forEach(([a, b], k) => [[0, a], [1, b]].forEach(([e, v]) => { if (k === drag.k && (e === drag.e || r[0] === r[1])) return; const d = Math.abs(xAt(v) - x); if (d <= near && d < bd) { bd = d; yy = v; } }));
      if (yy !== y && !drag.snap) navigator.vibrate?.(8); drag.snap = yy !== y;
      if (r[0] === r[1]) { r[0] = r[1] = yy; }
      else { r[drag.e] = yy; if (r[0] > r[1]) { r.reverse(); drag.e = 1 - drag.e; } }
    }
    timeChanged();
  });
  const up = ev => {
    ptrs.delete(ev.pointerId); clearTimeout(lp);
    if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
    if (!drag) return;
    const d = drag; drag = null;
    if (d.pan) { if (!d.moved && !M.T.ranges.length) { M.T.ranges = [[d.y, d.y]]; timeChanged(true); } return; }   // a tap on the empty line: a date (when none is set)
    normRanges(); timeChanged(true);
  };
  bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
  // mouse: the wheel zooms around the pointer (sideways: moves); a double click shows the whole range
  bar.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = tr.getBoundingClientRect(), [a, b] = tView(), span = b - a;
    if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) { const d = ev.deltaX / r.width * span; setView(a + d, b + d); return; }
    const y = yRaw(ev.clientX), f = (ev.clientX - r.left) / r.width, ns = span * Math.exp(ev.deltaY * 0.0015);
    setView(y - f * ns, y - f * ns + ns);
  }, { passive: false });
  bar.addEventListener('dblclick', ev => { if (ev.target.closest('button,input')) return; const [lo, hi] = TLIM(); setView(lo, hi); });
  new ResizeObserver(() => { if (M.cfg?.time) renderTime(); }).observe(tr);
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
const segc = (k, opts, lbl) => `${lbl ? `<div class="navh">${lbl}</div>` : ''}<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-mcfg="${k}" data-mv="${v}" class="${String(M.cfg[k]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
// the layer menu (layers button): what the map shows
// the layer menu: six groups, each with a count of what is switched on
function layersHTML() {
  const c = M.cfg, F = M.ancFiles || new Set(), anc = F.has('water') || F.has('empires'), built = F.has('aqueducts') || F.has('urban'), dark = document.documentElement.dataset.theme === 'dark';
  const it = M.pkFiles?.has('itinere/roads.pmtiles') || M.pkFiles?.has('itinere/roads_full.pmtiles');
  const needP = name => `<p class="hint small">Needs the download <b>${name}</b>.</p><button type="button" data-mapdl="1">Open Instruments → Map</button>`;
  const need = needP('Ancient landscape and states'), needB = needP('Ancient structures');
  const on = (...ks) => ks.filter(k => typeof k === 'boolean' ? k : c[k] !== false && !!c[k]).length;
  const grp = (k, title, n, body) => foldSec(k, `${title}${n ? ` <small class="mon">· ${n} on</small>` : ''}`, body);
  return grp('lplaces', 'Places', on('peoples', c.pfOn === false), tgl('peoples', 'Peoples among the places of the text')
      + `<div class="navh">All places <small>(shown while “Places from” is switched off)</small></div><div class="macts" style="margin:.1rem 0 .3rem"><button type="button" data-mcatall="1">All</button><button type="button" data-mcatall="0">None</button></div><div class="mcats">`
      + SITE_CATS.map(([k, lb, , c1, c2]) => `<button type="button" class="mtg${c.cats?.[k] ? ' on' : ''}" data-mcat="${k}"><span class="ck"></span><i class="dot" style="--c:${dark ? c2 : c1}"></i>${lb}</button>`).join('') + '</div>')
    + grp('lland', 'Landscape', on('rivers', 'lakes'), segc('basemap', [['std', 'Standard'], ['hd', 'Detailed'], ['ne2', 'Natural Earth II']], 'Base map')
      + `<p class="hint small">${({ std: 'Natural Earth, simplified (light).', hd: 'Coasts and lakes as exact as OpenStreetMap, from zoom 5.', ne2: 'The painted landscape of Natural Earth II: the whole world; sharper where a region is downloaded (Instruments → Map → Natural Earth II – regions).' })[c.basemap || 'hd']}</p>`
      + ((c.basemap || 'hd') === 'hd' && !M.pkFiles?.has('landscape/landscape.pmtiles') ? '<p class="hint small">Needs the download <b>Landscape – detailed</b>.</p><button type="button" data-mapdl="1">Open Instruments → Map</button>'
        : c.basemap === 'ne2' && !M.pkFiles?.has('ne2/ne2.pmtiles') ? '<p class="hint small">Needs the download <b>Natural Earth II</b>.</p><button type="button" data-mapdl="1">Open Instruments → Map</button>' : '')
      + tgl('rivers', 'Rivers', c.rivers !== false) + tgl('lakes', 'Lakes', c.lakes !== false)
      + reliefMenuHTML())
    + grp('lpol', 'Political', on(!!(anc && c.empires), !!(anc && c.provinces !== false), !!(anc && c.regArea), 'borders'), (anc ? tgl('empires', 'Empires and kingdoms at the date') + tgl('provinces', 'Roman provinces at the date', c.provinces !== false) + tgl('regArea', 'Areas of regions and peoples') : need) + tgl('borders', 'Modern borders'))
    + grp('lbuilt', 'Built world', on(...(built || it ? ['roads'] : []), ...(built ? ['urban', 'aqueducts', 'walls', 'canals'] : [])),
        (built || it ? tgl('roads', it ? 'Roman roads (Itiner-e)' : 'Roads (Barrington Atlas)') : '') + (built ? tgl('aqueducts', 'Aqueducts') + tgl('walls', 'Frontier walls (Hadrian’s Wall, limes …)') + tgl('canals', 'Canals') + tgl('urban', 'City outlines') : needB))
    + grp('lnames', 'Names on the map', on(c.nmPlaces !== false, c.nmRegions !== false, c.nmMountains !== false, c.nmIslands !== false), tgl('nmPlaces', 'Places', c.nmPlaces !== false) + tgl('nmRegions', 'Regions and peoples', c.nmRegions !== false) + tgl('nmMountains', 'Mountains', c.nmMountains !== false) + tgl('nmIslands', 'Islands and seas', c.nmIslands !== false))
    + grp('lown', 'Your own', c.own !== false ? [...(M.dsets?.keys() || [])].filter(k => !(c.dOff || []).includes(k)).length : 0, ownLayersHTML());
}
// the map settings (hold the map button, or ☰ → Settings → More map settings): how the map behaves
// the map settings (☰ → Settings → Map): sub-headings instead of folds, switches like the rest of the dialog
function settingsHTML() {
  const sw = (k, l, hint = '') => `<label class="srow1 swr"><span>${l}${hint ? `<small class="hint">${hint}</small>` : ''}</span>${SW(`data-mapset="${k}"`, !!M.cfg[k])}</label>`;
  const line = (lbl, html) => `<div class="mline"><span>${lbl}</span>${html}</div>`;
  const seg = (k, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-mcfg="${k}" data-mv="${v}" class="${String(M.cfg[k]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  // the three kinds of dated places as a small table: Shown | Faded | Hidden
  const trow = (k, lbl, opts) => `<div class="mtrow"><span>${lbl}</span>${[['show', 'Shown'], ['fade', 'Faded'], ['hide', 'Hidden']].map(([v, l]) => opts.includes(v) ? `<button type="button" data-mcfg="${k}" data-mv="${v}" class="${M.cfg[k] === v ? 'on' : ''}" aria-label="${l}">${l}</button>` : '<i></i>').join('')}</div>`;
  const yrs = (attr, vals, reset) => `<div class="mtlim">${vals.map((v, i) => `<input type="text" data-${attr}="${i}" value="${esc(fmtY(v))}" autocomplete="off" class="nofocus" aria-label="${i ? 'To' : 'From'}">${i ? '' : '<span>–</span>'}`).join('')}<button type="button" class="mtreset" data-${reset}="1" title="Standard" aria-label="Standard">↺</button></div>`;
  return `<div class="navh">Display</div>`
    + sw('scale', 'Reference distance', 'a scale bar, top right below the buttons')
    + sw('zoomShow', 'Zoom level', 'shown below it')
    + line('Units of distance and height', seg('units', [['metric', 'Metric'], ['imperial', 'Imperial'], ['roman', 'Roman'], ['greek', 'Greek']]))
    + `<p class="hint small">Metric: km, m · Imperial: miles, feet · Roman: miles (1,479 m), feet (29.6 cm) · Greek: stades (185 m), feet (30.8 cm)</p>`
    + `<div class="navh">Places in texts</div>`
    + sw('jump', 'Move the map to a place chosen in the text')
    + line('Words that may name a person', seg('persons', [['unsure', 'Uncertain'], ['hide', 'Not places']]))
    + line('Names on the map', seg('names', [['text', 'As in text'], ['english', 'English'], ['modern', 'Modern']]))
    + `<div class="navh">Period</div>`
    + line('Tolerance (years)', seg('tol', [[0, '0'], [10, '±10'], [25, '±25'], [50, '±50'], [100, '±100']]))
    + `<div class="mtab">`
    + trow('gone', 'No longer existed', ['fade', 'hide']) + trow('later', 'Known only from later sources', ['show', 'fade', 'hide']) + trow('undated', 'Undated', ['show', 'fade', 'hide']) + '</div>'
    + line('Several periods', seg('twoCol', [[false, 'One colour'], [true, 'Each its colour']]))
    + `<div class="mcols">${RANGE_COL.map((_, k) => `<label title="Colour of period ${k + 1}"><input type="color" data-mcol="${k}" value="${rangeCol(k)}"><span>${k + 1}</span></label>`).join('')}<button type="button" class="mtreset" data-mcolreset="1" title="Standard colours" aria-label="Standard colours">↺</button></div>`
    + line('Range of the slider', yrs('mtlim', TLIM(), 'mtlimreset'))
    + line('Default view', yrs('mtdef', tDefView(), 'mtdefreset'))
    + `<p class="hint small">Hold a date on the slider to make it a period, hold a period to split it; pull ends together to join them. Pinch or wheel to zoom the slider, drag to move it; the default view button returns to the range above.</p>`
    + `<div class="navh">Significance of places</div><p class="hint small">Zoomed out, only the more significant places are shown, and their names come first. How much counts:</p>`
    + SIG_UI.map(([k, lb, a, b, st]) => { const v = (M.cfg.sigW?.[k] ?? SIG_DEF[k]); return `<label class="msig"><span>${lb}</span><input type="range" min="${a}" max="${b}" step="${st}" value="${v}" data-msig="${k}"><output>${v}</output></label>`; }).join('')
    + `<div class="macts"><button type="button" data-msigreset="1">Standard weights</button><button type="button" data-mcount="1">Count the places in all texts</button></div>${M.P && !M.P.hasConn ? '<p class="hint small">Update the download <b>Ancient places (Pleiades)</b> (Instruments → Map) for the links between places.</p>' : ''}`
    + `<div class="navh">Map engine</div>` + line('MapLibre', `<div class="seg" role="group">${[['5', '5.24'], ['4', '4.7 (previous)']].map(([v, l]) => `<button type="button" data-mengine="${v}" class="${(M.engineSet || '5') === v ? 'on' : ''}">${l}</button>`).join('')}</div>`)
    + `<p class="hint small">If the map does not appear or behaves oddly, use the previous engine. Takes effect when Pult is opened again.</p>`;
}
function rightPop(k, title, html) {
  const pop = $('#mapPop'); if (!pop.hidden && pop.dataset.k === k) { pop.hidden = true; return; }
  pop.dataset.k = k; pop.classList.add('mlayers', 'right');
  pop.innerHTML = `<div class="mph"><span class="navh">${title}</span></div>${html}`;   // closed by its button or another menu
  pop.hidden = false; pop.scrollTop = M.cfg.popScroll?.[k] || 0;
  if (!pop._sw) { pop._sw = true; pop.addEventListener('scroll', () => { const kk = pop.dataset.k; if (kk !== 'layers' && kk !== 'settings') return; clearTimeout(pop._st); pop._st = setTimeout(() => { (M.cfg.popScroll ??= {})[kk] = pop.scrollTop; saveMapCfg(); }, 300); }); }
}
function layersPop() { rightPop('layers', 'Layers', layersHTML()); }
// after a change: the counts in the group headings are brought up to date (scroll position kept)
function refreshLayersPop() {
  const pop = $('#mapPop'); if (pop.hidden || pop.dataset.k !== 'layers') return;
  const y = pop.scrollTop; pop.innerHTML = `<div class="mph"><span class="navh">Layers</span></div>${layersHTML()}`; pop.scrollTop = y;
}
// hold the map button: the map settings as one menu (like the colours and the grammar line)
async function mapSettingsDialog() { await mapCfg(); await dialog(`<h3>Map settings</h3><div class="mapset">${settingsHTML()}</div>`, [['cancel', 'Close']]); }
// the map settings also work inside dialogs (☰ → Settings → Map, and the dialog above)
document.addEventListener('click', async ev => {
  const b = ev.target.closest?.('#dlg .mapset button'); if (!b) return;
  await mapCfg(); await layerClick(b);
});
// the clicks of the layer menu and the slider (wired once, from wireMapUI)
async function layerClick(b) {
  const r = await layerClick1(b);
  if (r && !b.dataset.mfold && b.closest('#mapPop')) refreshLayersPop();
  return r;
}
async function layerClick1(b) {
  const d = b.dataset;
  if (d.mfold) { const f = b.closest('.mfold'), on = !f.classList.contains('open'); f.classList.toggle('open', on); (M.cfg.fold ??= {})[d.mfold] = on; saveMapCfg(); return true; }
  if (d.mcount) { countDevice(b); return true; }
  if (d.mengine) { M.engineSet = d.mengine; await setting('mapEngine', d.mengine); b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    if (d.mengine !== (M.engineDir === 'base/lib/' ? '4' : '5') && window.maplibregl) { const r = await dialog('<h3>Map engine</h3><p>Reload Pult now to use it?</p>', [['cancel', 'Later'], ['ok', 'Reload']], 'ok'); if (r.action === 'ok') location.reload(); } return true; }
  if (d.msigreset) { M.cfg.sigW = null; await saveMapCfg(); b.closest('.mfb').querySelectorAll('[data-msig]').forEach(x => { x.value = SIG_DEF[x.dataset.msig]; x.nextElementSibling.textContent = x.value; }); recomputeSig(); return true; }
  if (d.mcatall != null) { const on = d.mcatall === '1'; M.cfg.cats = Object.fromEntries(SITE_CATS.map(c => [c[0], on])); $('#mapPop .mcats')?.querySelectorAll('[data-mcat]').forEach(x => x.classList.toggle('on', on)); await saveMapCfg(); applyLayers(); return true; }
  if (d.mcat) { (M.cfg.cats ??= {})[d.mcat] = !M.cfg.cats[d.mcat]; b.classList.toggle('on', M.cfg.cats[d.mcat]);  await saveMapCfg(); applyLayers(); return true; }
  if (d.mcfg) {
    let v = d.mv; if (v === 'true' || v === 'false') v = v === 'true'; else if (/^\d+$/.test(v)) v = +v;
    M.cfg[d.mcfg] = v; b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); await saveMapCfg();
    if (d.mcfg === 'persons') { M.workCache = null; await placesForText(); return refreshMapData(), true; }
    if (d.mcfg === 'names' || d.mcfg === 'dLen') return drawLabels(), true;
    if (d.mcfg === 'units') { mapInfo(); if (M.map) { M.map.setStyle(mapStyle(M.colors)); M.map.once('styledata', () => setTimeout(refreshMapData, 50)); } return true; }
    if (d.mcfg === 'basemap') { if (M.map) { M.map.setStyle(mapStyle(M.colors)); M.map.once('styledata', () => setTimeout(refreshMapData, 50)); } refreshLayersPop(); return true; }
    if (d.mcfg === 'regions' && v !== 'off') await loadAncientLabels();
    renderTime(); applyLayers(); return true;
  }
  if (d.mlay) {
    const k = d.mlay; M.cfg[k] = !(M.cfg[k] ?? ['rivers', 'lakes', 'provinces', 'own', 'nmPlaces', 'nmRegions', 'nmMountains', 'nmIslands', 'relShade', 'relBathy'].includes(k)); b.classList.toggle('on', M.cfg[k]); await saveMapCfg();
    if (k === 'borders') M.map?.setLayoutProperty('borders', 'visibility', M.cfg.borders ? 'visible' : 'none');
    if (k === 'peoples' || k === 'mark') { markPlaces(); await refreshMapData(); }
    if (k === 'time') { timeFor(S.text); renderTime(); }
    applyLayers(); return true;
  }
  if (b.id === 'mapTimeBtn') { M.cfg.time = !M.cfg.time; await saveMapCfg(); timeFor(S.text); renderTime(); applyLayers(); $('#mapPop [data-mlay="time"]')?.classList.toggle('on', M.cfg.time); return true; }
  if (b.id === 'mapWDate' || d.mwdate) { if (b.closest('dialog')) $('#dlg').close(); setTimeout(workDateDialog, 50); return true; }
  if (d.mtview) { const [a, b] = tDefView(); setView(a, b); return true; }
  if (d.mtdefreset) { M.cfg.tDef = null; await saveMapCfg(); const ins = b.parentElement.querySelectorAll('[data-mtdef]'); ins[0].value = fmtY(-1000); ins[1].value = fmtY(800); return true; }
  if (d.mtlimreset) { M.cfg.tMin = M.cfg.tMax = M.cfg.tView = null; await saveMapCfg(); const ins = b.parentElement.querySelectorAll('[data-mtlim]'); ins[0].value = fmtY(-4000); ins[1].value = fmtY(2050); renderTime(); return true; }
  if (d.mcolreset) { M.cfg.rangeCols = null; await saveMapCfg(); b.parentElement.querySelectorAll('[data-mcol]').forEach(x => { x.value = rangeCol(+x.dataset.mcol); }); renderTime(); applyLayers(); return true; }
  return false;
}

// the part shown at first, set by the reader (Map settings → Period)
document.addEventListener('change', async ev => {
  const k = ev.target.dataset?.mtdef; if (k == null) return;
  await mapCfg();
  const y = parseYear(ev.target.value), d = [...tDefView()], [lo, hi] = TLIM();
  if (y == null || y < lo || y > hi || (k === '0' ? y >= d[1] - 20 : y <= d[0] + 20)) { toast(`Choose a year between ${fmtY(lo)} and ${fmtY(hi)}, e.g. “1000 BC”.`); ev.target.value = fmtY(d[+k]); return; }
  d[+k] = y; M.cfg.tDef = d; M.cfg.tView = null; ev.target.value = fmtY(y);
  await saveMapCfg(); renderTime();
});
// the range of the slider, set by the reader (Map settings → Period)
document.addEventListener('change', async ev => {
  const k = ev.target.dataset?.mtlim; if (k == null) return;
  await mapCfg();
  const y = parseYear(ev.target.value), [lo, hi] = TLIM();
  if (y == null || (k === '0' ? y >= hi - 50 : y <= lo + 50)) { toast('Not a usable year – e.g. “4000 BC” or “AD 2050”.'); ev.target.value = fmtY(+k ? hi : lo); return; }
  M.cfg[+k ? 'tMax' : 'tMin'] = y; M.cfg.tView = null; ev.target.value = fmtY(y);
  if (M.T) M.T.ranges = M.T.ranges.map(([a, b]) => [Math.max(TLIM()[0], a), Math.min(TLIM()[1], b)]).filter(([a, b]) => a <= b);
  await saveMapCfg(); renderTime(); applyLayers();
});
// the colours of the periods, set by the reader
document.addEventListener('input', ev => {
  const k = ev.target.dataset?.mcol; if (k == null) return;
  (M.cfg.rangeCols ??= [...RANGE_COL])[+k] = ev.target.value; renderTime(); applyLayers();
  clearTimeout(M.colT); M.colT = setTimeout(saveMapCfg, 400);
});
// a tap outside a menu of the map closes it (the buttons that open the menus toggle them themselves)
document.addEventListener('pointerdown', ev => {
  const pop = document.getElementById('mapPop'); if (!pop || pop.hidden) return;
  if (ev.target.closest('#mapPop, #mapScope, #mapLayersBtn, #mapSaveBtn, #mapDrawBtn, #mapCheck, #tabMap, dialog, #toast')) return;
  if (['layers', 'save'].includes(pop.dataset.k)) return;               // these stay open while the map is moved
  pop.hidden = true;
}, true);

// the weights of significance, set by the reader
document.addEventListener('input', ev => {
  const k = ev.target.dataset?.msig; if (!k) return;
  (M.cfg.sigW ??= { ...SIG_DEF })[k] = +ev.target.value; ev.target.nextElementSibling.textContent = ev.target.value;
  clearTimeout(M.sigT); M.sigT = setTimeout(() => { recomputeSig(); saveMapCfg(); }, 250);
});

// how often each place is named in the texts on this device (stored per text as its places are found)
async function loadDevCounts() {
  const m = new Map();
  for (const r of await getAll('settings', IDBKeyRange.bound('pcnt|', 'pcnt|\uffff'))) for (const [id, n] of Object.entries(r.v || {})) m.set(+id || id, (m.get(+id || id) || 0) + n);
  M.devCnt = m;
}
async function storeCounts(id, hits) {
  const c = {}; for (const h of hits.values()) if (h.p && !h.unsure) c[h.p.id] = (c[h.p.id] || 0) + 1;
  try { await setting('pcnt|' + id, c); } catch (_) { }
}
// read every text on this device once (its places are counted and kept)
async function countDevice(btn) {
  const ids = [];
  for (const w of await libWorks()) w.books.forEach((_, bi) => ids.push(`w:${w.id}:${bi}`));
  for (const t of await getAll('texts')) ids.push(t.id);
  if (btn) btn.disabled = true;
  for (let n = 0; n < ids.length; n++) {
    if (btn) btn.textContent = `Reading ${n + 1} of ${ids.length} …`;
    const r = await placesOfAny(ids[n]); if (r) await storeCounts(ids[n], r.hits);
  }
  await loadDevCounts(); recomputeSig();
  if (btn) { btn.disabled = false; btn.textContent = 'Count the places in all texts on this device'; }
  note(`Places counted in ${ids.length} text${ids.length === 1 ? '' : 's'}.`);
}

// a tap on a road of Itiner-e: its name, kind, certainty, itineraries, builder and dates
function roadTap(pt) {
  const ls = ['it-roads', 'it-roads-c', 'it-roads-h'].filter(id => M.map?.getLayer(id) && M.map.getLayoutProperty(id, 'visibility') !== 'none');
  if (!ls.length) return false;
  const r = matchMedia('(pointer: coarse)').matches ? 10 : 5;
  const f = M.map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]], { layers: ls })[0]; if (!f) return false;
  const p = f.properties, card = $('#mapCard');
  M.sel = null; M.dSel = null;
  card.innerHTML = `<div class="mch"><b>${esc(p.n || 'Roman road')}</b><button type="button" class="mx" data-mclose="1" aria-label="Close">✕</button></div>
    <div class="mcs">${p.m ? 'Main road' : 'Secondary road'} · ${['course hypothetical', 'course conjectured', 'course certain'][p.c ?? 1]}${p.y0 != null || p.y1 != null ? ' · ' + esc(p.y1 != null ? fmtR([p.y0 ?? p.y1, p.y1]) : 'from ' + fmtY(p.y0)) : ''}</div>
    ${p.it ? `<div class="dnote">Named in: ${esc(p.it)}</div>` : ''}${p.k ? `<div class="dnote">Built under: ${esc(p.k)}</div>` : ''}
    <p class="hint small">Itiner-e (CC BY 4.0)</p>`;
  card.hidden = false; return true;
}
