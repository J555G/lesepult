// ================================================================ Pult · relief: shading, colours by height, contour lines, heights
// The packages "Relief – overview" (zoom 0–8, the whole map area) and "Relief – <region>" (zoom 9–10/11, about 90 m)
// hold elevation tiles (Terrarium, WebP) in PMTiles files. One elevation source is made of all installed packages: the most
// detailed one that covers a tile gives it; deeper than a package reaches, its tiles are enlarged (smoothly).
// The map engine shades them (hillshade, in the colours of the theme), colours them by height (MapLibre 5: color-relief),
// and maplibre-contour draws contour lines from them; the numbers of the contour lines are drawn with the other labels.
// Sea depths: Natural Earth (relief/bathy.pmtiles, vector). Settings (mapCfg): relShade, relColor, relContours, relBathy.
const REL_DEF = { relShade: true, relColor: false, relContours: false, relBathy: true };
const engineMajor = () => parseInt((window.maplibregl?.getVersion?.() || window.maplibregl?.version || '4'), 10);
const relOn = k => M.cfg?.[k] ?? REL_DEF[k];
const relFiles = () => [...(M.pkFiles || [])].filter(f => /^relief\/.*\.pmtiles$/.test(f) && !/bathy\.pmtiles$/.test(f));
const tileLon = (x, z) => x / 2 ** z * 360 - 180;
const tileLat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** z))) * 180 / Math.PI;

// the installed elevation packages (called while the map is built; needs pmtiles.js and maplibre-contour)
async function reliefInit() {
  const files = relFiles();
  if (!files.length || !window.pmtiles) { M.rel = null; return; }
  if (!window.mlcontour) { try { await addScript(MAPS + 'relief/lib/maplibre-contour.js'); } catch (_) { M.rel = null; return; } }
  const key = files.join('|');
  if (M.rel?.key === key) return;
  const arch = [];
  for (const f of files) {
    const pm = new pmtiles.PMTiles(new CacheSource(new URL(MAPS + f, location.href).href));
    try { arch.push({ f, pm, h: await pm.getHeader() }); } catch (e) { console.warn('relief', f, e); }
  }
  if (!arch.length) { M.rel = null; return; }
  arch.sort((a, b) => b.h.maxZoom - a.h.maxZoom);                   // the most detailed first
  // srcMax: for the shading the elevation tiles are made here up to zoom 14 (enlarged from the deepest package tile, with its
  // neighbours), so that the map engine never enlarges them itself – its own enlargement shades the tile edges as seams
  M.rel = { key, arch, maxz: Math.max(...arch.map(a => a.h.maxZoom)), srcMax: Math.max(14, ...arch.map(a => a.h.maxZoom)), cache: new Map(), dec: new Map() };
  const dem = new mlcontour.DemSource({ url: 'pultdem://{z}/{x}/{y}', encoding: 'terrarium', maxzoom: M.rel.maxz, worker: false, cacheSize: 200, timeoutMs: 30000 });
  dem.manager.getTile = async url => { const [z, x, y] = url.match(/(\d+)\/(\d+)\/(\d+)$/).slice(1).map(Number); return { data: await demBlob(z, x, y) }; };
  dem.setupMaplibre(maplibregl);
  if (!M.shadeProto) { maplibregl.addProtocol('pultshade', async req => { const [z, x, y] = req.url.match(/(\d+)\/(\d+)\/(\d+)$/).slice(1).map(Number); return { data: await shadeTile(z, x, y) }; }); M.shadeProto = true; }
  M.relDem = dem;
}
const inArch = (h, z, x, y) => tileLon(x + 1, z) > h.minLon && tileLon(x, z) < h.maxLon && tileLat(y, z) > h.minLat && tileLat(y + 1, z) < h.maxLat;
function demBlob(z, x, y) {
  const c = M.rel.cache, k = `${z}/${x}/${y}`;
  if (c.has(k)) return c.get(k);
  const p = (async () => {
    for (const a of M.rel.arch) {
      if (z < a.h.minZoom || !inArch(a.h, z, x, y)) continue;
      if (z <= a.h.maxZoom) { const r = await a.pm.getZxy(z, x, y); if (r?.data) return new Blob([r.data], { type: 'image/webp' }); continue; }
      const dz = z - a.h.maxZoom, px = x >> dz, py = y >> dz, P = await decoded(a, a.h.maxZoom, px, py);   // deeper: a part of the deepest tile, enlarged
      if (P) return enlarge(a, a.h.maxZoom, px, py, P, dz, x - (px << dz), y - (py << dz));
    }
    return flatTile();                                               // sea, or outside every package
  })();
  c.set(k, p); if (c.size > 400) c.delete(c.keys().next().value);
  return p;
}
const relCanvas = n => typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(n, n) : Object.assign(document.createElement('canvas'), { width: n, height: n });
const canvasBlob = cv => cv.convertToBlob ? cv.convertToBlob({ type: 'image/png' }) : new Promise(r => cv.toBlob(r, 'image/png'));
async function decodeDem(data) {
  const bm = await createImageBitmap(new Blob([data]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const n = bm.width, cv = relCanvas(n), ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bm, 0, 0); const px = ctx.getImageData(0, 0, n, n).data, h = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) h[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
  return { n, h };
}
function encodeDem(h, n) {
  const cv = relCanvas(n), ctx = cv.getContext('2d'), im = ctx.createImageData(n, n), d = im.data;
  // (with the fraction of a metre in the third channel: enlarged gentle slopes would otherwise shade as terraces)
  for (let i = 0; i < n * n; i++) { const v = Math.max(0, Math.min(65535.996, h[i] + 32768)), w = Math.floor(v); d[i * 4] = w >> 8; d[i * 4 + 1] = w & 255; d[i * 4 + 2] = Math.floor((v - w) * 256); d[i * 4 + 3] = 255; }
  ctx.putImageData(im, 0, 0); return canvasBlob(cv);
}
// the heights of a package tile, decoded once (a few kept): the enlargements of its parts and its neighbours use them
async function decoded(a, z, x, y) {
  const D = M.rel.dec, k = `${a.f}|${z}/${x}/${y}`;
  if (D.has(k)) return D.get(k);
  const p = (async () => { const r = await a.pm.getZxy(z, x, y); return r?.data ? decodeDem(r.data) : null; })();
  D.set(k, p); if (D.size > 48) D.delete(D.keys().next().value);
  return p;
}
// a quarter (eighth …) of a tile, enlarged to a whole tile (heights interpolated between the pixel centres).
// At the tile's edges the neighbouring tiles give the heights beyond it – otherwise the edge would be flat and shaded as a line.
async function enlarge(a, pz, px, py, P, dz, ox, oy) {
  const { n, h } = P, s = n / 2 ** dz, out = new Float32Array(n * n);
  const L = ox === 0, R = ox === 2 ** dz - 1, T = oy === 0, B = oy === 2 ** dz - 1, nb = {};
  const N = 2 ** pz, get = (dx, dy) => decoded(a, pz, (px + dx + N) % N, py + dy);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]])
    if ((dx < 0 ? L : dx > 0 ? R : true) && (dy < 0 ? T : dy > 0 ? B : true) && py + dy >= 0 && py + dy < N) nb[dx + ',' + dy] = await get(dx, dy);
  const at = (x, y) => {
    const dx = x < 0 ? -1 : x >= n ? 1 : 0, dy = y < 0 ? -1 : y >= n ? 1 : 0;
    const t = dx || dy ? nb[dx + ',' + dy] : P;
    if (!t) return h[Math.max(0, Math.min(n - 1, y)) * n + Math.max(0, Math.min(n - 1, x))];
    return t.h[(y - dy * n) * n + (x - dx * n)];
  };
  // cubic B-spline: smooth slopes and their changes – straight-line interpolation would shade as facets, and other curves as a fine grid
  const cw = t => { const u = 1 - t, t2 = t * t, t3 = t2 * t; return [u * u * u / 6, (3 * t3 - 6 * t2 + 4) / 6, (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, t3 / 6]; };
  for (let j = 0; j < n; j++) {
    const fy = oy * s + (j + 0.5) * s / n - 0.5, y0 = Math.floor(fy), wy = cw(fy - y0);
    for (let i = 0; i < n; i++) {
      const fx = ox * s + (i + 0.5) * s / n - 0.5, x0 = Math.floor(fx), wx = cw(fx - x0);
      let v = 0;
      for (let b = 0; b < 4; b++) { const yy = y0 - 1 + b; v += wy[b] * (wx[0] * at(x0 - 1, yy) + wx[1] * at(x0, yy) + wx[2] * at(x0 + 1, yy) + wx[3] * at(x0 + 2, yy)); }
      out[j * n + i] = v;
    }
  }
  return encodeDem(out, n);
}
// the tiles for the shading: up to the deepest package zoom as they are; deeper, the heights are raised by 2^0.3 per zoom step,
// which gives the slopes the engine computes when it enlarges a tile itself (its shader weakens each zoom step by 2^0.3) – the
// same for every tile of a zoom, so no seams; else the shading would fade and show bands. Mapbox encoding.
async function shadeTile(z, x, y) {
  const f = 2 ** (0.3 * Math.max(0, z - M.rel.maxz)), { n, h } = await decodeDem(await (await demBlob(z, x, y)).arrayBuffer());
  const cv = relCanvas(n), ctx = cv.getContext('2d'), im = ctx.createImageData(n, n), d = im.data;
  for (let i = 0; i < n * n; i++) { const v = Math.max(0, Math.min(16777215, Math.round((h[i] * f + 10000) * 10))); d[i * 4] = v >> 16; d[i * 4 + 1] = (v >> 8) & 255; d[i * 4 + 2] = v & 255; d[i * 4 + 3] = 255; }
  ctx.putImageData(im, 0, 0); return (await canvasBlob(cv)).arrayBuffer();
}
let flatP = null;
const flatTile = () => flatP ??= encodeDem(new Float32Array(256 * 256), 256);

// the height at a point (m), from the most detailed tile (null without relief)
async function heightAt(lon, lat, z) {
  if (!M.relDem) return null;
  z = Math.min(z ?? M.rel.maxz, M.rel.maxz);
  const n = 2 ** z, fx = (lon + 180) / 360 * n, s = Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)), fy = (1 - s / Math.PI) / 2 * n;
  const x = Math.floor(fx), y = Math.floor(fy);
  try {
    const t = await M.relDem.getDemTile(z, x, y), w = t.width;
    return t.data[Math.min(w - 1, Math.floor((fy - y) * w)) * w + Math.min(w - 1, Math.floor((fx - x) * w))];
  } catch (_) { return null; }
}
// the profile of a line: heights along it (n samples), with its length
async function profileOf(co, closed, n = 120) {
  const pts = closed ? [...co, co[0]] : co, seg = [];
  let tot = 0; for (let i = 1; i < pts.length; i++) { const d = havKm(pts[i - 1], pts[i]); seg.push(d); tot += d; }
  if (!tot) return null;
  const z = Math.min(M.rel.maxz, tot > 300 ? 8 : tot > 60 ? 10 : 11), out = [];
  for (let k = 0; k <= n; k++) {
    let want = tot * k / n, i = 0; while (i < seg.length - 1 && want > seg[i]) { want -= seg[i]; i++; }
    const t = seg[i] ? want / seg[i] : 0, a = pts[i], b = pts[i + 1];
    out.push({ km: tot * k / n, h: await heightAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z) });
  }
  return { km: tot, pts: out };
}
function profileSVG(pr) {
  const hs = pr.pts.map(p => p.h ?? 0), lo = Math.min(...hs), hi = Math.max(...hs), W = 280, H = 64, span = Math.max(50, hi - lo);
  let up = 0, down = 0; for (let i = 1; i < hs.length; i++) { const d = hs[i] - hs[i - 1]; if (d > 0) up += d; else down -= d; }
  const X = km => (km / pr.km * W).toFixed(1), Y = h => (H - 4 - (h - lo) / span * (H - 10)).toFixed(1);
  const path = pr.pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.km)} ${Y(p.h ?? 0)}`).join('');
  const r = n => Math.round(n).toLocaleString('en');
  return `<div class="dprof"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${path}L${W} ${H}L0 ${H}Z" class="pf"/><path d="${path}" class="pl"/></svg>
    <small>Height ${r(lo)}–${r(hi)} m · climb ${r(up)} m · descent ${r(down)} m</small></div>`;
}

// ---------------------------------------------------------------- the layers (called by layerStyle)
function reliefStyle(st, C) {
  const dark = document.documentElement.dataset.theme === 'dark';
  const at = id => st.layers.findIndex(l => l.id === id);
  const put = (k, ...ls) => st.layers.splice(k < 0 ? st.layers.length : k, 0, ...ls);
  // sea depth (Natural Earth): beneath the land; with the detailed coasts above their sea, fading out as one zooms in
  if (M.pkFiles?.has('relief/bathy.pmtiles')) {
    st.sources.bathy = { type: 'vector', url: pmUrl('relief/bathy.pmtiles') };
    const deep = dark ? ['#1d2a33', '#18242c', '#141f27', '#111a21', '#0e161c'] : ['#cfdde6', '#bfd2de', '#adc5d5', '#9cb8cb', '#8aaabf'];
    const hd = at('hd-sea') >= 0;
    put(hd ? at('hd-sea') + 1 : at('land'), { id: 'rel-bathy', type: 'fill', source: 'bathy', 'source-layer': 'depth', maxzoom: hd ? 9 : 24,
      paint: { 'fill-color': ['step', ['get', 'd'], deep[0], 200, deep[1], 1000, deep[2], 2000, deep[3], 4000, deep[4]], 'fill-opacity': hd ? ['interpolate', ['linear'], ['zoom'], 6, 1, 8.5, 0] : 1, 'fill-antialias': false } });
  }
  if (!M.relDem) return;
  st.sources.reldem = { type: 'raster-dem', tiles: [M.relDem.sharedDemProtocolUrl], encoding: 'terrarium', tileSize: 256, maxzoom: M.rel.maxz };
  st.sources.relshade = { type: 'raster-dem', tiles: ['pultshade://{z}/{x}/{y}'], encoding: 'mapbox', tileSize: 256, maxzoom: M.rel.srcMax };
  const below = ['a-water', 'a-areas', 'a-emp', 'lakes'].map(at).find(k => k >= 0) ?? at('lakes');
  const ls = [];
  if (engineMajor() >= 5) {                                          // colours by height (MapLibre 5)
    ls.push({ id: 'rel-color', type: 'color-relief', source: 'reldem', paint: { 'color-relief-opacity': dark ? 0.35 : 0.5,
      'color-relief-color': ['interpolate', ['linear'], ['elevation'], 0, 'rgba(0,0,0,0)', 1, dark ? '#3c5232' : '#a8c690', 200, dark ? '#4a5a34' : '#cfd9a0', 500, dark ? '#6a6036' : '#e6dca6', 1000, dark ? '#7a5a36' : '#d9b98a', 2000, dark ? '#7a4a3a' : '#c09a7e', 3500, dark ? '#8a8a8a' : '#e8e4e0', 5500, '#ffffff'] } });
  }
  ls.push({ id: 'rel-shade', type: 'hillshade', source: 'relshade', paint: { 'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 3, 0.55, 8, 0.4, 12, 0.3],
    'hillshade-shadow-color': dark ? '#000000' : '#5b4a33', 'hillshade-highlight-color': dark ? '#7b7466' : '#fffdf6', 'hillshade-accent-color': dark ? '#000000' : '#6b5b44' } });
  put(below, ...ls);
  // contour lines (maplibre-contour): every so many metres, the larger steps stronger and numbered
  st.sources.contours = { type: 'vector', maxzoom: 15, tiles: [M.relDem.contourProtocolUrl({ multiplier: 1, overzoom: 1, contourLayer: 'contours', elevationKey: 'ele', levelKey: 'level',
    thresholds: { 5: [500, 1000], 7: [200, 1000], 9: [100, 500], 11: [50, 250], 13: [20, 100] } })] };
  const k = ['a-prov', 'a-roads', 'own'].map(at).find(i => i >= 0) ?? at('pl-region');
  put(k, { id: 'rel-contour', type: 'line', source: 'contours', 'source-layer': 'contours', minzoom: 5,
    paint: { 'line-color': dark ? '#a08a66' : '#8a6a40', 'line-opacity': ['case', ['==', ['get', 'level'], 1], 0.6, 0.35], 'line-width': ['case', ['==', ['get', 'level'], 1], 1.1, 0.6] } });
}
function reliefLayerProps() {
  const v = x => x ? 'visible' : 'none';
  return { 'rel-shade': { vis: v(relOn('relShade')) }, 'rel-color': { vis: v(relOn('relColor')) }, 'rel-contour': { vis: v(relOn('relContours')) }, 'rel-bathy': { vis: v(relOn('relBathy')) } };
}
// the menu: Layers → Landscape
function reliefMenuHTML() {
  if (!relFiles().length) return '<div class="navh">Relief</div><p class="hint small">Needs the download <b>Relief – overview</b> (and, for zooming in close, the regions).</p><button type="button" data-mapdl="1">Open Instruments → Map</button>';
  const v5 = engineMajor() >= 5;
  return `<div class="navh">Relief</div>` + tgl('relShade', 'Shading', relOn('relShade')) + (v5 ? tgl('relColor', 'Colours by height', relOn('relColor')) : '') + tgl('relContours', 'Contour lines', relOn('relContours'))
    + (M.pkFiles?.has('relief/bathy.pmtiles') ? tgl('relBathy', 'Depth of the sea', relOn('relBathy')) : '');
}
// numbers of the contour lines: on the stronger lines, along them, where there is room (drawn with the other labels)
function contourLabels(placed, W, H) {
  if (!relOn('relContours') || !M.map?.getLayer('rel-contour') || M.map.getZoom() < 7) return '';
  const hit = r => placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
  const seen = new Set(); let h = '', n = 0;
  for (const f of M.map.queryRenderedFeatures({ layers: ['rel-contour'] })) {
    if (f.properties.level !== 1) continue;
    const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const ln of lines) {
      if (ln.length < 4) continue;
      const m = Math.floor(ln.length / 2), a = M.map.project(ln[m - 1]), b = M.map.project(ln[m + 1]);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2; if (cx < 20 || cx > W - 20 || cy < 20 || cy > H - 20) continue;
      const key = `${f.properties.ele}|${Math.round(cx / 120)}|${Math.round(cy / 120)}`; if (seen.has(key)) continue; seen.add(key);
      let ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      const txt = Math.round(f.properties.ele).toLocaleString('en'), w = txt.length * 6 + 4, r = [cx - w / 2, cy - 6, cx + w / 2, cy + 6];
      if (hit(r)) continue; placed.push(r);
      h += `<span class="mlbl cl" style="left:${Math.round(cx)}px;top:${Math.round(cy)}px;transform:translate(-50%,-50%) rotate(${ang.toFixed(0)}deg)">${txt}</span>`;
      if (++n > 60) return h;
    }
  }
  return h;
}
// a tap on an unnumbered contour line: its height
function contourTap(pt) {
  if (!relOn('relContours') || !M.map?.getLayer('rel-contour')) return false;
  const fs = M.map.queryRenderedFeatures([[pt.x - 6, pt.y - 6], [pt.x + 6, pt.y + 6]], { layers: ['rel-contour'] });
  if (!fs.length) return false;
  toast(`Contour line ${Math.round(fs[0].properties.ele).toLocaleString('en')} m`, 1800); return true;
}
