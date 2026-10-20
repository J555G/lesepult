// ================================================================ Pult · imagery: the photographic base maps (v296)
// Blue Marble (NASA, with topography and bathymetry, April): offline from the base map package (whole world, zoom 0–6),
// online from NASA's tile service (to zoom 8). Online only: Sentinel-2 cloudless (EOX, 10 m, by year) and Esri World
// Imagery (to under 1 m; the current imagery needs a free ArcGIS key, the earlier captures of “Wayback” do not).
// Offline, an online choice falls back to Blue Marble from the package. The package always lies beneath an online
// layer, so gaps (tiles still loading, a lost connection) show Blue Marble rather than nothing.
// Settings (mapCfg): img ('bm' | 's2' | 'esri'; 'none' only as a fallback when nothing can be shown), s2v, esriv, imgDim. The key: setting 'esriKey'.
const BM_PKG = 'base/bluemarble.pmtiles';
const GIBS_BM = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=BlueMarble_ShadedRelief_Bathymetry&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible_Level8&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fjpeg';
const EOX_WMS = l => `https://tiles.maps.eox.at/?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=${l}&STYLES=&FORMAT=image%2Fjpeg&SRS=EPSG%3A3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`;
const EOX_CAPS = 'https://tiles.maps.eox.at/?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.1.1';
const ESRI_CUR = k => `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${encodeURIComponent(k)}`;
const WAYBACK_CFG = 'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json';
const S2_DEF = [['s2cloudless_3857', '2016'], ...[2018, 2019, 2020, 2021, 2022, 2023, 2024].map(y => [`s2cloudless-${y}_3857`, String(y)])];
const isOnline = () => navigator.onLine !== false;
const imgKind = () => M.cfg?.img || 'bm';
const bmPkg = () => M.pkFiles?.has(BM_PKG) ? pmUrl(BM_PKG) : null;
// the versions offered (kept from the last time online; refreshed at most once a week)
const s2Versions = () => M.imgCat?.s2?.length ? M.imgCat.s2 : S2_DEF;
const waybackVersions = () => M.imgCat?.wb || [];
async function imgInit() {
  M.esriKey = (await setting('esriKey')) || '';
  M.imgCat ??= (await setting('imgCat')) || {};
  if (isOnline() && !(Date.now() - (M.imgCat.at || 0) < 7 * 864e5)) imgCatalogs();     // (in the background)
}
async function imgCatalogs() {
  const cat = Object.assign({}, M.imgCat); let got = false;
  try {
    const x = await (await fetch(EOX_CAPS)).text(), ls = [...new Set([...x.matchAll(/<Name>(s2cloudless(?:-(\d{4}))?_3857)<\/Name>/g)].map(m => m[1] + '|' + (m[2] || '2016')))].map(s => s.split('|'));
    if (ls.length) { cat.s2 = ls.sort((a, b) => a[1] - b[1]); got = true; }
  } catch (_) {}
  try {
    const j = await (await fetch(WAYBACK_CFG)).json();
    const wb = Object.entries(j).map(([n, v]) => [n, (String(v.itemTitle || '').match(/\d{4}-\d{2}-\d{2}/) || [''])[0], String(v.itemURL || '')]).filter(x => x[1] && x[2]).sort((a, b) => b[1].localeCompare(a[1]));
    if (wb.length) { cat.wb = wb; got = true; }
  } catch (_) {}
  if (got) { cat.at = Date.now(); M.imgCat = cat; await setting('imgCat', cat); refreshLayersPop?.(); }
}
// the layer shown: [id, source] – null when there is nothing to show (then the drawn map)
function imgOnline() {
  if (!isOnline()) return null;
  const k = imgKind();
  if (k === 'bm') return { type: 'raster', tiles: [GIBS_BM], tileSize: 256, maxzoom: 8, attribution: 'NASA' };
  if (k === 's2') { const vs = s2Versions(), v = vs.find(x => x[0] === M.cfg.s2v) || vs[vs.length - 1]; return { type: 'raster', tiles: [EOX_WMS(v[0])], tileSize: 256, maxzoom: 15, s2year: v[1] }; }
  if (k === 'esri') {
    const wb = waybackVersions(), want = M.cfg.esriv || (M.esriKey ? 'cur' : wb[0]?.[0]);
    if (want === 'cur' && M.esriKey) return { type: 'raster', tiles: [ESRI_CUR(M.esriKey)], tileSize: 256, maxzoom: 19 };
    const w = wb.find(x => x[0] === want) || wb[0];
    if (w) return { type: 'raster', tiles: [w[2].replace('{level}', '{z}').replace('{row}', '{y}').replace('{col}', '{x}')], tileSize: 256, maxzoom: 19, wbDate: w[1] };
  }
  return null;
}
const imgOn = () => imgKind() !== 'none' && !!(bmPkg() || imgOnline());
function imgPaint() {
  const dark = document.documentElement.dataset.theme === 'dark' && M.cfg.imgDim !== false;
  return { 'raster-fade-duration': 150, 'raster-resampling': 'linear', ...(dark ? { 'raster-brightness-max': 0.68, 'raster-saturation': -0.15, 'raster-contrast': -0.05 } : {}) };
}
// called by layerStyle: the imagery beneath the waters, lines and labels
function imgStyle(st, C) {
  if (!imgOn()) return;
  const at = id => st.layers.findIndex(l => l.id === id);
  const k = ['a-water', 'a-areas', 'lakes'].map(at).find(i => i >= 0) ?? st.layers.length, ls = [];
  const pk = bmPkg(), on = imgOnline();
  if (pk) { st.sources.imgbm = { type: 'raster', url: pk, tileSize: 256 }; ls.push({ id: 'img-bm', type: 'raster', source: 'imgbm', paint: imgPaint() }); }
  if (on) { const { s2year, wbDate, attribution, ...src } = on; st.sources.imgon = src; ls.push({ id: 'img-on', type: 'raster', source: 'imgon', paint: imgPaint() }); }
  st.layers.splice(k, 0, ...ls);
  const after = (id, l) => { const i = at(id); if (i >= 0) st.layers.splice(i + 1, 0, l); };
  after('lakes', { id: 'img-lakes', type: 'line', source: 'lakes', maxzoom: st.sources.hd ? 5 : 24, paint: { 'line-color': C.river, 'line-width': 0.7 } });
  if (st.sources.hd) after('hd-lakes', { id: 'img-hdlakes', type: 'line', source: 'hd', 'source-layer': 'lakes', minzoom: 5, paint: { 'line-color': C.river, 'line-width': 0.8 } });
}
function imgLayerProps() {
  if (!imgOn()) return {};
  const v = x => x ? 'visible' : 'none', c = M.cfg;
  return { land: { vis: 'none' }, lakes: { vis: 'none' }, 'hd-lakes': { vis: 'none' }, 'hd-sea': { vis: 'none' }, 'hd-landbg': { vis: 'none' },
    'rel-bathy': { vis: 'none' }, 'rel-color': { vis: 'none' },                        // (the imagery has its own sea floor and colours)
    'img-lakes': { vis: v(c.lakes !== false) }, 'img-hdlakes': { vis: v(c.lakes !== false) } };
}
// the credits of Sentinel-2 and Esri, small in the corner of the map (both ask for them beside the map; the rest: ☰ → Acknowledgements)
function imgCredit() {
  const el = $('#mapCred'); if (!el) return;
  const on = imgOn() && imgOnline(), k = imgKind(), parts = [];
  if (imgOn()) {
    if (on && k === 's2') parts.push(`<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless – s2maps.eu</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data ${esc(on.s2year)})`);
    if (on && k === 'esri') parts.push('Esri, Maxar, Earthstar Geographics, and the GIS User Community' + (on.wbDate ? ` · Wayback ${esc(on.wbDate)}` : ''));
  }
  if (M.map?.getLayer('osm-rivers') && M.cfg.rivers !== false) parts.push('© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>');   // (its licence asks for it on the map)
  el.innerHTML = parts.join(' · '); el.hidden = !parts.length;
}
// online or offline again: the layers follow
function imgNetChange() {
  if (!M.map) return;
  M.map.setStyle(mapStyle(M.colors)); M.map.once('styledata', () => setTimeout(() => { refreshMapData(); imgCredit(); }, 50));
  refreshLayersPop?.();
}
// (the relief too: Mapterhorn online, the packages offline)
const netRelief = () => (typeof reliefInit === 'function' ? reliefInit() : Promise.resolve()).catch(() => {}).then(imgNetChange);
addEventListener('online', netRelief); addEventListener('offline', netRelief);
// the select boxes of the layer menu
document.addEventListener('change', async ev => {
  const s = ev.target.closest?.('select[data-mcfgsel]'); if (!s) return;
  await mapCfg(); M.cfg[s.dataset.mcfgsel] = s.value; await saveMapCfg();
  if (M.map) { M.map.setStyle(mapStyle(M.colors)); M.map.once('styledata', () => setTimeout(() => { refreshMapData(); imgCredit(); }, 50)); }
});
// Settings → Map: the ArcGIS key (kept on this device only)
document.addEventListener('change', async ev => {
  const i = ev.target.closest?.('input[data-esrikey]'); if (!i) return;
  M.esriKey = i.value.trim(); await setting('esriKey', M.esriKey);
  if (M.map && imgKind() === 'esri') imgNetChange();
});

// ---------------------------------------------------------------- rivers and lakes online (v304)
// Online, the rivers, streams, canals and lakes come from OpenStreetMap (vector tiles of OpenFreeMap, OpenMapTiles
// schema) at every zoom; offline those of the base map (Natural Earth; Landscape – detailed). OpenStreetMap records no
// discharge, so the colours run from the strong end (rivers) to the weak end (streams, ditches) by kind.
// Settings (mapCfg): rivW (width factor), rivC1 (strongest), rivC2 (weakest).
const OFM = 'https://tiles.openfreemap.org/planet';
const RIV_DEF = { rivW: 1, rivC1: '#2f74b5', rivC2: '#8cc3ea' };
const rivCfg = k => M.cfg?.[k] ?? RIV_DEF[k];
const osmRiv = () => isOnline() && M.cfg?.rivers !== false;
function rivPaint() {
  const c1 = rivCfg('rivC1'), c2 = rivCfg('rivC2'), w = +rivCfg('rivW'), mid = hexMix(c1, c2, 0.5);
  const k = (r, c, s) => ['match', ['get', 'class'], 'river', r, 'canal', c, s];
  return {
    line: { 'line-color': k(c1, mid, c2), 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 4, k(0.6 * w, 0.4 * w, 0.3 * w), 9, k(1.5 * w, 1 * w, 0.5 * w), 14, k(5 * w, 3 * w, 1.6 * w)] },
    fill: { 'fill-color': hexMix(c1, c2, 0.35), 'fill-opacity': 0.8, 'fill-outline-color': c1 },
  };
}
// a width (a number or a zoom interpolation) times f – zoom expressions must stay at the top, so the stops are scaled
const scaleW = (e, f) => typeof e === 'number' ? e * f : Array.isArray(e) && e[0] === 'interpolate' ? e.map((v, i) => i >= 4 && i % 2 === 0 && typeof v === 'number' ? v * f : v) : e;
function rivStyle(st) {                                              // (called by layerStyle)
  const w = +rivCfg('rivW'), c1 = rivCfg('rivC1');
  for (const l of st.layers) if (['rivers', 'hd-rivers'].includes(l.id)) { l.paint['line-color'] = c1; l.paint['line-width'] = scaleW(l.paint['line-width'], w); }   // (offline rivers: the same colour and width)
  if (!osmRiv()) return;
  st.sources.osm = { type: 'vector', url: OFM };
  const at = id => st.layers.findIndex(l => l.id === id), p = rivPaint();
  const k = [at('hd-rivers'), at('rivers')].find(i => i >= 0) ?? st.layers.length;
  st.layers.splice(k + 1, 0,
    { id: 'osm-lakes', type: 'fill', source: 'osm', 'source-layer': 'water', filter: ['!=', ['get', 'class'], 'ocean'], paint: p.fill },
    { id: 'osm-rivers', type: 'line', source: 'osm', 'source-layer': 'waterway', filter: ['!=', ['get', 'brunnel'], 'tunnel'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: p.line });
}
function rivLayerProps() {                                           // online: OpenStreetMap instead of the base map's waters
  if (!osmRiv() && !M.map?.getLayer('osm-rivers')) return {};
  const v = M.cfg.rivers !== false ? 'visible' : 'none', off = { vis: 'none' };
  return { 'osm-rivers': { vis: v }, 'osm-lakes': { vis: v }, rivers: off, 'hd-rivers': off, lakes: off, 'hd-lakes': off, 'img-lakes': off, 'img-hdlakes': off };
}
function rivRepaint() {                                              // (a setting changed: the colours and widths at once)
  const m = M.map; if (!m) return; const p = rivPaint(), w = +rivCfg('rivW');
  if (m.getLayer('osm-rivers')) for (const [k, v] of Object.entries(p.line)) m.setPaintProperty('osm-rivers', k, v);
  if (m.getLayer('osm-lakes')) for (const [k, v] of Object.entries(p.fill)) m.setPaintProperty('osm-lakes', k, v);
  clearTimeout(M.rivT); M.rivT = setTimeout(() => { m.setStyle(mapStyle(M.colors)); m.once('styledata', () => setTimeout(refreshMapData, 50)); }, 900);   // (the offline rivers with the style)
}
// a tap on a river or lake: its name and kind
const RIV_KIND = { river: 'River', canal: 'Canal', stream: 'Stream', drain: 'Drain', ditch: 'Ditch', lake: 'Lake', lagoon: 'Lagoon', reservoir: 'Reservoir', river_area: 'River', basin: 'Basin', pond: 'Pond', swimming_pool: 'Pool', dock: 'Dock' };
function waterTap(pt) {
  const ls = ['osm-rivers', 'osm-lakes'].filter(id => M.map?.getLayer(id) && M.map.getLayoutProperty(id, 'visibility') !== 'none'); if (!ls.length) return false;
  const r = matchMedia('(pointer: coarse)').matches ? 10 : 5;
  const fs = M.map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]], { layers: ls }), f = fs.find(x => x.properties.name) || fs.find(x => x.layer.id === 'osm-rivers');
  if (!f) return false;
  const p = f.properties, lake = f.layer.id === 'osm-lakes', kind = RIV_KIND[p.class] || (lake ? 'Water' : 'Waterway');
  const names = [...new Set([p.name, p['name:latin'], p.name_en, p['name:el'], p['name:la']].filter(Boolean))];
  const card = $('#mapCard'); M.sel = null; M.dSel = null;
  card.innerHTML = `<div class="mch"><b>${esc(names[0] || kind)}</b><button type="button" class="mx" data-mclose="1" aria-label="Close">✕</button></div>
    <div class="mcs">${esc(kind)}${p.intermittent ? ' · dries up at times' : ''}${p.brunnel === 'bridge' ? ' · on a bridge (aqueduct)' : ''}</div>
    ${names.length > 1 ? `<div class="dnote">${names.slice(1).map(esc).join(' · ')}</div>` : ''}<p class="hint small">© OpenStreetMap contributors</p>`;
  card.hidden = false; return true;
}
// Settings → Map: the look of the rivers (only while rivers are shown)
function rivSettingsHTML() {
  if (M.cfg.rivers === false) return '';
  return `<div class="navh">Rivers and lakes</div>`
    + `<label class="msig"><span>Width</span><input type="range" min="0.4" max="2.5" step="0.1" value="${rivCfg('rivW')}" data-rivw="1"><output>${(+rivCfg('rivW')).toFixed(1)}×</output></label>`
    + `<div class="mline"><span>Colour<small class="hint">strongest (rivers) to weakest (streams)</small></span><span class="rivcols"><input type="color" data-rivc="rivC1" value="${rivCfg('rivC1')}" aria-label="Strongest"><i class="rivgrad" style="--a:${rivCfg('rivC1')};--b:${rivCfg('rivC2')}"></i><input type="color" data-rivc="rivC2" value="${rivCfg('rivC2')}" aria-label="Weakest"></span></div>`
    + `<div class="macts"><button type="button" data-rivreset="1">Standard look</button></div>`;
}
document.addEventListener('input', async ev => {
  const t = ev.target; if (!t.dataset?.rivw && !t.dataset?.rivc) return;
  await mapCfg();
  if (t.dataset.rivw) { M.cfg.rivW = +t.value; t.nextElementSibling.textContent = (+t.value).toFixed(1) + '×'; }
  else { M.cfg[t.dataset.rivc] = t.value; const g = t.parentElement.querySelector('.rivgrad'); g.style.setProperty('--a', rivCfg('rivC1')); g.style.setProperty('--b', rivCfg('rivC2')); }
  clearTimeout(M.rivSave); M.rivSave = setTimeout(saveMapCfg, 400); rivRepaint();
});
document.addEventListener('click', async ev => {
  const b = ev.target.closest?.('[data-rivreset]'); if (!b) return;
  await mapCfg(); Object.assign(M.cfg, { rivW: null, rivC1: null, rivC2: null }); await saveMapCfg();
  const box = b.closest('.mapset') || b.parentElement.parentElement; const w = box.querySelector('[data-rivw]'); if (w) { w.value = 1; w.nextElementSibling.textContent = '1.0×'; }
  box.querySelectorAll('[data-rivc]').forEach(i => { i.value = RIV_DEF[i.dataset.rivc]; }); const g = box.querySelector('.rivgrad'); g?.style.setProperty('--a', RIV_DEF.rivC1); g?.style.setProperty('--b', RIV_DEF.rivC2);
  rivRepaint();
});
