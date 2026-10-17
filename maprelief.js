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
  M.rel = { key, arch, maxz: Math.max(...arch.map(a => a.h.maxZoom)), cache: new Map() };
  const dem = new mlcontour.DemSource({ url: 'pultdem://{z}/{x}/{y}', encoding: 'terrarium', maxzoom: M.rel.maxz, worker: false, cacheSize: 200, timeoutMs: 30000 });
  dem.manager.getTile = async url => { const [z, x, y] = url.match(/(\d+)\/(\d+)\/(\d+)$/).slice(1).map(Number); return { data: await demBlob(z, x, y) }; };
  dem.setupMaplibre(maplibregl);
  M.relDem = dem;
}
const inArch = (h, z, x, y) => tileLon(x + 1, z) > h.minLon && tileLon(x, z) < h.maxLon && tileLat(y, z) > h.minLat && tileLat(y + 1, z) < h.maxLat;
// a region's tile only when the tile lies wholly inside the region: at its edge a region tile is flat (0 m) beyond the border,
// which showed as a strip without relief (e.g. at 47° N, the north edge of Italy) – there the overview (enlarged) is used
const inside = (h, z, x, y) => tileLon(x, z) >= h.minLon - 1e-9 && tileLon(x + 1, z) <= h.maxLon + 1e-9 && tileLat(y + 1, z) >= h.minLat - 1e-9 && tileLat(y, z) <= h.maxLat + 1e-9;
function demBlob(z, x, y) {
  const c = M.rel.cache, k = `${z}/${x}/${y}`;
  if (c.has(k)) return c.get(k);
  const p = (async () => {
    const last = M.rel.arch[M.rel.arch.length - 1];
    for (const a of M.rel.arch) {
      if (z < a.h.minZoom || !(a === last ? inArch : inside)(a.h, z, x, y)) continue;
      if (z <= a.h.maxZoom) { const r = await a.pm.getZxy(z, x, y); if (r?.data) return new Blob([r.data], { type: 'image/webp' }); continue; }
      const dz = z - a.h.maxZoom, px = x >> dz, py = y >> dz, r = await a.pm.getZxy(a.h.maxZoom, px, py);   // deeper: a part of the deepest tile, enlarged
      if (r?.data) return enlarge(r.data, dz, x - (px << dz), y - (py << dz));
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
// the heights as a PNG of our own making (Terrarium; the fraction of a metre in blue): a PNG from a canvas can carry colour
// information, and a desktop with colour management then shifts the colours slightly when the map reads them – each shift a
// pit or a bump of a metre or more, shaded as little holes. This PNG has none, so its colours are read exactly.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i); out.set(data, 8);
  let c = 0xffffffff; for (let i = 4; i < 8 + data.length; i++) c = CRC[(c ^ out[i]) & 255] ^ (c >>> 8);
  dv.setUint32(8 + data.length, (c ^ 0xffffffff) >>> 0); return out;
}
async function zlib(raw) {
  if (typeof CompressionStream !== 'undefined') return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const blocks = Math.ceil(raw.length / 65535), out = new Uint8Array(2 + raw.length + blocks * 5 + 4);      // (stored, uncompressed)
  out[0] = 0x78; out[1] = 0x01; let o = 2, a = 1, b = 0;
  for (let i = 0; i < raw.length; i += 65535) { const n = Math.min(65535, raw.length - i); out[o++] = i + n >= raw.length ? 1 : 0; out[o++] = n & 255; out[o++] = n >> 8; out[o++] = ~n & 255; out[o++] = (~n >> 8) & 255; out.set(raw.subarray(i, i + n), o); o += n; }
  for (let i = 0; i < raw.length; i++) { a = (a + raw[i]) % 65521; b = (b + a) % 65521; }
  new DataView(out.buffer).setUint32(o, ((b << 16) | a) >>> 0); return out;
}
async function encodeDem(h, n) {
  const raw = new Uint8Array(n * (1 + 3 * n));
  for (let y = 0; y < n; y++) {
    let o = y * (1 + 3 * n) + 1;                                   // (filter byte 0)
    for (let x = 0; x < n; x++) { const v = Math.max(0, Math.min(65535.996, h[y * n + x] + 32768)), w = Math.floor(v); raw[o++] = w >> 8; raw[o++] = w & 255; raw[o++] = Math.floor((v - w) * 256); }
  }
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer); dv.setUint32(0, n); dv.setUint32(4, n); ihdr[8] = 8; ihdr[9] = 2;   // 8 bit, RGB
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', await zlib(raw)), pngChunk('IEND', new Uint8Array(0))];
  return new Blob(parts, { type: 'image/png' });
}
// a quarter (eighth …) of a tile, enlarged to a whole tile (heights interpolated between the pixel centres)
async function enlarge(data, dz, ox, oy) {
  const { n, h } = await decodeDem(data), s = n / 2 ** dz, out = new Float32Array(n * n);
  const at = (x, y) => h[Math.max(0, Math.min(n - 1, y)) * n + Math.max(0, Math.min(n - 1, x))];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const fx = ox * s + (i + 0.5) * s / n - 0.5, fy = oy * s + (j + 0.5) * s / n - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    out[j * n + i] = (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
  }
  return encodeDem(out, n);
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
  const below = ['a-water', 'a-areas', 'a-emp', 'lakes'].map(at).find(k => k >= 0) ?? at('lakes');
  const ls = [];
  if (engineMajor() >= 5) {                                          // colours by height (MapLibre 5)
    ls.push({ id: 'rel-color', type: 'color-relief', source: 'reldem', paint: { 'color-relief-opacity': dark ? 0.35 : 0.5,
      'color-relief-color': ['interpolate', ['linear'], ['elevation'], 0, 'rgba(0,0,0,0)', 1, dark ? '#3c5232' : '#a8c690', 200, dark ? '#4a5a34' : '#cfd9a0', 500, dark ? '#6a6036' : '#e6dca6', 1000, dark ? '#7a5a36' : '#d9b98a', 2000, dark ? '#7a4a3a' : '#c09a7e', 3500, dark ? '#8a8a8a' : '#e8e4e0', 5500, '#ffffff'] } });
  }
  ls.push({ id: 'rel-shade', type: 'hillshade', source: 'reldem', paint: { 'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 3, 0.55, 8, 0.4, 12, 0.3],
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
