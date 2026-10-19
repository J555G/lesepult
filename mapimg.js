// ================================================================ Pult · imagery: the photographic base maps (v296)
// Blue Marble (NASA, with topography and bathymetry, April): offline from the base map package (whole world, zoom 0–6),
// online from NASA's tile service (to zoom 8). Online only: Sentinel-2 cloudless (EOX, 10 m, by year) and Esri World
// Imagery (to under 1 m; the current imagery needs a free ArcGIS key, the earlier captures of “Wayback” do not).
// Offline, an online choice falls back to Blue Marble from the package. The package always lies beneath an online
// layer, so gaps (tiles still loading, a lost connection) show Blue Marble rather than nothing.
// Settings (mapCfg): img ('bm' | 's2' | 'esri' | 'none' = the drawn map), s2v, esriv, coasts, imgDim. The key: setting 'esriKey'.
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
// called by layerStyle: the imagery beneath the waters, lines and labels; the coasts as a line above it
function imgStyle(st, C) {
  if (!imgOn()) return;
  const at = id => st.layers.findIndex(l => l.id === id);
  const k = ['a-water', 'a-areas', 'lakes'].map(at).find(i => i >= 0) ?? st.layers.length, ls = [];
  const pk = bmPkg(), on = imgOnline();
  if (pk) { st.sources.imgbm = { type: 'raster', url: pk, tileSize: 256 }; ls.push({ id: 'img-bm', type: 'raster', source: 'imgbm', paint: imgPaint() }); }
  if (on) { const { s2year, wbDate, attribution, ...src } = on; st.sources.imgon = src; ls.push({ id: 'img-on', type: 'raster', source: 'imgon', paint: imgPaint() }); }
  const coast = C.coast;
  ls.push({ id: 'img-coast', type: 'line', source: 'land', maxzoom: st.sources.hd ? 5 : 24, paint: { 'line-color': coast, 'line-width': 0.7, 'line-opacity': 0.8 } });
  if (st.sources.hd) ls.push({ id: 'img-hdcoast', type: 'line', source: 'hd', 'source-layer': 'sea', minzoom: 5, paint: { 'line-color': coast, 'line-width': 0.8, 'line-opacity': 0.8 } });
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
    'img-coast': { vis: v(c.coasts !== false) }, 'img-hdcoast': { vis: v(c.coasts !== false) },
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
  el.innerHTML = parts.join(' · '); el.hidden = !parts.length;
}
// online or offline again: the layers follow
function imgNetChange() {
  if (!M.map) return;
  M.map.setStyle(mapStyle(M.colors)); M.map.once('styledata', () => setTimeout(() => { refreshMapData(); imgCredit(); }, 50));
  refreshLayersPop?.();
}
addEventListener('online', () => { imgNetChange(); if (M.rel) reliefInit().then(() => M.map && imgNetChange()); });
addEventListener('offline', imgNetChange);
// the base map in the layer menu (Layers → Landscape)
function imgMenuHTML() {
  const c = M.cfg, k = imgKind(), on = isOnline(), pk = !!M.pkFiles?.has(BM_PKG);
  const seg = `<div class="navh">Base map</div><div class="seg wrap" role="group">${[['bm', 'Blue Marble'], ['s2', 'Sentinel-2'], ['esri', 'Esri'], ['none', 'Drawn']].map(([v, l]) => `<button type="button" data-mcfg="img" data-mv="${v}" class="${k === v ? 'on' : ''}"${(v === 's2' || v === 'esri') && !on ? ' disabled' : ''}>${l}</button>`).join('')}</div>`;
  const sel = (key, opts, cur) => `<select class="msel" data-mcfgsel="${key}">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  let more = '';
  if (k === 'bm') more = `<p class="hint small">NASA’s Blue Marble (April), with the relief of land and sea floor${on ? ' – online to zoom 8, sharper than the download' : ''}.${pk ? '' : ' Offline it needs the download <b>Base map</b> (current version).'}</p>`;
  if (k === 's2') { const vs = s2Versions(), cur = (vs.find(x => x[0] === c.s2v) || vs[vs.length - 1])[0];
    more = `<div class="mline"><span>Year</span>${sel('s2v', vs.map(([v, y]) => [v, y]), cur)}</div><p class="hint small">Sentinel-2 cloudless by EOX: the whole world at 10 m, one cloud-free picture per year. Online only.</p>`; }
  if (k === 'esri') { const wb = waybackVersions(), cur = c.esriv || (M.esriKey ? 'cur' : wb[0]?.[0] || 'cur');
    more = `<div class="mline"><span>Version</span>${sel('esriv', [['cur', 'Current' + (M.esriKey ? '' : ' (needs a key)')], ...wb.map(([n, d]) => [n, 'Wayback ' + d])], cur)}</div>`
      + `<p class="hint small">Esri World Imagery: to under 1 m in much of Europe. Online only.${M.esriKey ? '' : ' The current imagery needs a free ArcGIS key (Settings → Map); the earlier captures (Wayback) work without.'}</p>`; }
  if (k === 'none') more = segc('basemap', [['std', 'Standard'], ['hd', 'Detailed']]) + `<p class="hint small">${c.basemap === 'std' ? 'Natural Earth, simplified (light).' : 'Coasts and lakes as exact as OpenStreetMap, from zoom 5.'}</p>`;
  const off = !on && (k === 's2' || k === 'esri') ? '<p class="hint small">Offline: Blue Marble from the download is shown instead.</p>' : '';
  return seg + more + off + (k !== 'none' ? tgl('coasts', 'Coastlines', c.coasts !== false) : '');
}
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
