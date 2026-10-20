// ================================================================ Pult · saved relief (run by the offline helper, sw.js)
// Mapterhorn's elevation tiles (Terrarium, WebP, 512 pixels) of the areas saved in the Globe menu lie in the cache
// 'pult-relief', under their own addresses. The map engine and maplibre-contour ask for them by those addresses as usual:
// a saved tile comes from the cache (online too); one not saved from the network; offline, deeper than an area was
// saved, the nearest saved tile above it, enlarged (heights interpolated smoothly) – all here, beside the page.
const RELIEF = 'pult-relief', MH_HOST = 'tiles.mapterhorn.com';
const mhKey = (z, x, y) => `https://${MH_HOST}/${z}/${x}/${y}.webp`;
const notFound = () => new Response(null, { status: 404 });
// (?pult-save: the saving itself asks – then only the network answers, never an enlarged tile)
async function reliefServe(req) {
  const u = new URL(req.url), save = u.searchParams.has('pult-save'); u.search = '';
  const c = await caches.open(RELIEF);
  if (!save) { const hit = await c.match(u.href); if (hit) return hit; }
  const m = u.pathname.match(/^\/(\d+)\/(\d+)\/(\d+)\.webp$/);
  try {                                                               // (offline, iOS may let a request hang: a time limit)
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), save ? 30000 : 8000);
    const r = await fetch(u.href, { mode: 'cors', signal: ctl.signal }).finally(() => clearTimeout(t));
    if (r.ok || r.status === 404 || save) return r;
  } catch (_) { if (save) return new Response(null, { status: 504 }); }
  if (!m) return notFound();
  const [z, x, y] = m.slice(1).map(Number), k = `${z}/${x}/${y}`;
  const mem = (self.relMem ??= new Map());
  if (mem.has(k)) return new Response(mem.get(k), { headers: { 'content-type': 'image/png' } });
  for (let dz = 1; dz <= z; dz++) {
    const px = x >> dz, py = y >> dz, a = await c.match(mhKey(z - dz, px, py));
    if (!a) continue;
    try {
      const png = await enlargeDem(await a.arrayBuffer(), dz, x - (px << dz), y - (py << dz));
      mem.set(k, png); if (mem.size > 48) mem.delete(mem.keys().next().value);
      return new Response(png, { headers: { 'content-type': 'image/png' } });
    } catch (_) { return notFound(); }
  }
  return new Response(null, { status: 504 });                       // (not reached, nothing saved above it)
}

// ---------------------------------------------------------------- reading heights from a tile, and making one
// Some browsers (privacy protection against fingerprinting) add noise to what a canvas gives back – a pixel off by one in
// red is 256 m; then the pixels are read as a video frame, as the map engine does.
let canvasNoisy = null;
function noisyCanvas() {
  if (canvasNoisy != null) return canvasNoisy;
  canvasNoisy = false;
  try {
    const n = 5, ctx = new OffscreenCanvas(n, n).getContext('2d', { willReadFrequently: true });
    for (let i = 0; i < n * n; i++) { const b = i * 4; ctx.fillStyle = `rgb(${b},${b + 1},${b + 2})`; ctx.fillRect(i % n, Math.floor(i / n), 1, 1); }
    const d = ctx.getImageData(0, 0, n, n).data;
    for (let i = 0; i < n * n * 4; i++) if (i % 4 !== 3 && d[i] !== i) { canvasNoisy = true; break; }
  } catch (_) {}
  return canvasNoisy;
}
async function framePixels(bm) {
  const f = new VideoFrame(bm, { timestamp: 0 });
  try {
    const fmt = f.format || '';
    if (!/^(RGB|BGR)/.test(fmt)) throw new Error('format ' + fmt);
    const px = new Uint8ClampedArray(bm.width * bm.height * 4);
    await f.copyTo(px, { rect: { x: 0, y: 0, width: bm.width, height: bm.height }, layout: [{ offset: 0, stride: bm.width * 4 }] });
    if (fmt.startsWith('BGR')) for (let i = 0; i < px.length; i += 4) { const t = px[i]; px[i] = px[i + 2]; px[i + 2] = t; }
    return px;
  } finally { f.close(); }
}
async function decodeDem(data) {
  const bm = await createImageBitmap(new Blob([data]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const n = bm.width, h = new Float32Array(n * n);
  let px = null;
  if (noisyCanvas() && typeof VideoFrame !== 'undefined') try { px = await framePixels(bm); } catch (_) {}
  if (!px) { const ctx = new OffscreenCanvas(n, n).getContext('2d', { willReadFrequently: true }); ctx.drawImage(bm, 0, 0); px = ctx.getImageData(0, 0, n, n).data; }
  for (let i = 0; i < n * n; i++) h[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
  return { n, h };
}
// the heights as a PNG (Terrarium; the fraction of a metre in blue), stored without compression: deflating saves only
// ~10 % on heights but costs 5× the time
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i); out.set(data, 8);
  let c = 0xffffffff; for (let i = 4; i < 8 + data.length; i++) c = CRC[(c ^ out[i]) & 255] ^ (c >>> 8);
  dv.setUint32(8 + data.length, (c ^ 0xffffffff) >>> 0); return out;
}
function zlib(raw) {
  const blocks = Math.ceil(raw.length / 65535), out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  out[0] = 0x78; out[1] = 0x01; let o = 2, a = 1, b = 0;
  for (let i = 0; i < raw.length; i += 65535) { const n = Math.min(65535, raw.length - i); out[o++] = i + n >= raw.length ? 1 : 0; out[o++] = n & 255; out[o++] = n >> 8; out[o++] = ~n & 255; out[o++] = (~n >> 8) & 255; out.set(raw.subarray(i, i + n), o); o += n; }
  for (let i = 0; i < raw.length;) { const e = Math.min(raw.length, i + 5552); for (; i < e; i++) { a += raw[i]; b += a; } a %= 65521; b %= 65521; }   // (Adler-32)
  new DataView(out.buffer).setUint32(o, ((b << 16) | a) >>> 0); return out;
}
function encodeDem(h, n) {
  const raw = new Uint8Array(n * (1 + 3 * n));
  for (let y = 0; y < n; y++) {
    let o = y * (1 + 3 * n) + 1;                                   // (filter byte 0)
    for (let x = 0; x < n; x++) { const v = Math.max(0, Math.min(65535.996, h[y * n + x] + 32768)), w = Math.floor(v); raw[o++] = w >> 8; raw[o++] = w & 255; raw[o++] = Math.floor((v - w) * 256); }
  }
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer); dv.setUint32(0, n); dv.setUint32(4, n); ihdr[8] = 8; ihdr[9] = 2;   // 8 bit, RGB
  return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib(raw)), pngChunk('IEND', new Uint8Array(0))], { type: 'image/png' });
}
// a part (a quarter, an eighth …) of a tile, enlarged to a whole tile
async function enlargeDem(data, dz, ox, oy) {
  const { n, h } = await decodeDem(data), s = n / 2 ** dz, out = new Float32Array(n * n);
  const at = (x, y) => h[Math.max(0, Math.min(n - 1, y)) * n + Math.max(0, Math.min(n - 1, x))];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const fx = ox * s + (i + 0.5) * s / n - 0.5, fy = oy * s + (j + 0.5) * s / n - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    out[j * n + i] = (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
  }
  return encodeDem(out, n);
}
