// ================================================================ Pult · relief: shading, colours by height, contour lines, heights
// The heights come from Mapterhorn (terrain tiles of 512 pixels, Terrarium, WebP, zoom 0–12). The map engine reads them
// straight from Mapterhorn's address and shades them (hillshade, in the colours of the theme) and colours them by height
// (MapLibre 5: color-relief); maplibre-contour draws contour lines from them in its own worker. Online, the tiles come from
// the network; areas saved in the Globe menu lie in the offline helper's cache (reliefsw.js), which also serves them offline –
// deeper than an area was saved, enlarged from the nearest saved tile. (The relief packages of before are retired, v317.)
// Sea depths: Natural Earth (relief/bathy.pmtiles, vector), while installed. Settings (mapCfg): relShade, relColor, relContours, relBathy.
const REL_DEF = { relShade: true, relColor: false, relContours: true, relBathy: true };
const engineMajor = () => parseInt((window.maplibregl?.getVersion?.() || window.maplibregl?.version || '4'), 10);
const relOn = k => M.cfg?.[k] ?? REL_DEF[k];
const MH_URL = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp', MH_Z = 12, RELIEF_C = 'pult-relief';
const mhTileUrl = (z, x, y) => `https://tiles.mapterhorn.com/${z}/${x}/${y}.webp`;

// the elevation source (called while the map is built): online always; offline when an area is saved
async function reliefInit() {
  const online = isOnline(), saved = (await reliefAreas()).some(a => a.tiles > 0);
  if (!online && !saved) { M.rel = M.relDem = null; return; }
  if (!window.mlcontour) { try { await addScript('maplibre-contour.js'); } catch (_) { M.rel = M.relDem = null; return; } }
  M.rel = { key: 'mh', maxz: MH_Z };
  M.relDem = M.relDemSrc ??= (() => { const d = new mlcontour.DemSource({ url: MH_URL, encoding: 'terrarium', maxzoom: MH_Z, worker: true, cacheSize: 24, timeoutMs: 30000 }); d.setupMaplibre(maplibregl); return d; })();
}

// ---------------------------------------------------------------- the shading by the real sun (v319)
// The map engine shades the whole map from one direction. A few lines are added to its shading (MapLibre 5.24, as shipped
// with the base map) so that, with sunlight on, every point is lit from where the sun stands for that point, and the night
// side is not shaded at all: the engine's own program is changed as it is loaded (if any piece is not found – another
// version – it is loaded unchanged, and the shading is lit from one direction as before). self.__pultSun: [sin, cos of the
// sun's declination, the longitude beneath the sun (radians), on (1) or off (0)].
const SHADE_PATCH = [
  ['u_latrange:oo(0,t.tileID),', 'u_latrange:oo(0,t.tileID),u_lngrange:[t.tileID.canonical.x/Math.pow(2,t.tileID.canonical.z)*360-180,(t.tileID.canonical.x+1)/Math.pow(2,t.tileID.canonical.z)*360-180],u_sun:(self.__pultSun||[0,1,0,0]).slice(0,2),u_sun2:(self.__pultSun||[0,1,0,0]).slice(2,4),'],
  ['u_latrange:new t.c3(e,i.u_latrange),', 'u_latrange:new t.c3(e,i.u_latrange),u_lngrange:new t.c3(e,i.u_lngrange),u_sun:new t.c3(e,i.u_sun),u_sun2:new t.c3(e,i.u_sun2),'],
  ['uniform vec2 u_latrange;', 'uniform vec2 u_latrange;uniform vec2 u_lngrange;uniform vec2 u_sun;uniform vec2 u_sun2;float pult_az;'],
  ['float azimuth=u_azimuths[0]+PI;', 'float azimuth=pult_az+PI;', 4],
  ['vec2 deriv=((pixel.rg*8.0)-4.0)/scaleFactor;', 'vec2 deriv=((pixel.rg*8.0)-4.0)/scaleFactor;pult_az=u_azimuths[0];float pult_fade=1.0;if (u_sun2.y > 0.5) {float plat=radians((u_latrange[0]-u_latrange[1])*(1.0-v_pos.y)+u_latrange[1]);float plon=radians(mix(u_lngrange[0],u_lngrange[1],v_pos.x));float ph=plon-u_sun2.x;float salt=sin(plat)*u_sun.x+cos(plat)*u_sun.y*cos(ph);pult_az=atan(sin(ph),cos(ph)*sin(plat)-(u_sun.x/max(u_sun.y,1e-4))*cos(plat))+PI;pult_fade=smoothstep(-0.015,0.06,salt);}'],
  ['} else {standard_hillshade(deriv);}\\n#ifdef OVERDRAW_INSPECTOR', '} else {standard_hillshade(deriv);}fragColor*=pult_fade;\\n#ifdef OVERDRAW_INSPECTOR']];
// the obelisk (fill-extrusion) lit by the sun where it stands, not by the light of the atmosphere (v326): self.__pultObLight
// [x, y, z, intensity] in the engine's frame of the light
const OB_PATCH = [
  ['const Vi=(e,i,o,a)=>{const r=e.style.light,s=r.properties.get("position"),n=[s.x,s.y,s.z],l=t.c4();"viewport"===r.properties.get("anchor")&&t.c5(l,e.transform.bearingInRadians),t.c6(n,n,l);',
   'const Vi=(e,i,o,a)=>{const r=e.style.light,pl=self.__pultObLight,s=r.properties.get("position"),n=pl?[pl[0],pl[1],pl[2]]:[s.x,s.y,s.z],l=t.c4();!pl&&"viewport"===r.properties.get("anchor")&&t.c5(l,e.transform.bearingInRadians),t.c6(n,n,l);'],
  ['u_lightintensity:r.properties.get("intensity")', 'u_lightintensity:pl?pl[3]:r.properties.get("intensity")']];
// each group whole or not at all
function enginePatch(s, list) { let t = s; for (const [a, b, n = 1] of list) { if (t.split(a).length - 1 !== n) throw new Error('not found: ' + a.slice(0, 40)); t = t.split(a).join(b); } return t; }
async function shadePatchedLib(url) {
  try {
    let s = await (await fetch(url)).text(), any = false;
    try { s = enginePatch(s, SHADE_PATCH); M.shadePatch = any = true; } catch (e) { console.warn('shading by the sun not available:', e.message); M.shadePatch = false; }
    try { s = enginePatch(s, OB_PATCH); any = true; } catch (e) { console.warn('the obelisk lit by its own sun not available:', e.message); }
    return any ? URL.createObjectURL(new Blob([s], { type: 'text/javascript' })) : url;
  } catch (e) { M.shadePatch = false; return url; }
}
const contSpacing = () => M.cfg?.relSpacing || 9;                     // (a factor on the intervals, ÷ 9: the reader's choice, 4 … 24 – more lines to fewer, 600a)

// ---------------------------------------------------------------- saved areas
// The list lies beside the tiles: [{ id, name, w, s, e, n (degrees), z (deepest zoom), world, total, tiles, bytes, at, state }]
const areasKey = () => new URL('pult-relief-areas.json', location.href).href;
async function reliefAreas() {
  if (M.relAreas) return M.relAreas;
  try { const r = await (await caches.open(RELIEF_C)).match(areasKey()); M.relAreas = r ? await r.json() : []; } catch (_) { M.relAreas = []; }
  return M.relAreas;
}
async function putAreas(list) {
  M.relAreas = list;
  await (await caches.open(RELIEF_C)).put(areasKey(), new Response(JSON.stringify(list), { headers: { 'content-type': 'application/json' } }));
}
const MERC_LAT = 85.0511;
const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
const lat2y = (lat, z) => { const s = Math.sin(lat * Math.PI / 180); return Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z); };
function areaRanges(a, z) {                                           // the tiles of an area at a zoom: [x0, x1, y0, y1] (across 180°: two)
  const n = 2 ** z, cl = v => Math.max(0, Math.min(n - 1, v)), y0 = cl(lat2y(a.n, z)), y1 = cl(lat2y(a.s, z));
  if (a.world) return [[0, n - 1, 0, n - 1]];
  return a.w <= a.e ? [[cl(lon2x(a.w, z)), cl(lon2x(a.e, z)), y0, y1]] : [[cl(lon2x(a.w, z)), n - 1, y0, y1], [0, cl(lon2x(a.e, z)), y0, y1]];
}
const areaCountZ = (a, z) => areaRanges(a, z).reduce((t, [x0, x1, y0, y1]) => t + (x1 - x0 + 1) * (y1 - y0 + 1), 0);
const areaCount = (a, z) => { let t = 0; for (let k = 0; k <= z; k++) t += areaCountZ(a, k); return t; };
const areaHas = (a, z, x, y) => z <= a.z && areaRanges(a, z).some(([x0, x1, y0, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
const mPerPx = (z, lat) => 40075016.7 * Math.cos(lat * Math.PI / 180) / (512 * 2 ** z);
const fmtM = m => m >= 950 ? `${(m / 1000).toFixed(m >= 9500 ? 0 : 1)} km` : `${Math.round(m / (m >= 95 ? 10 : 1)) * (m >= 95 ? 10 : 1)} m`;
const fmtBytes = b => b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(0.1, b / 1e6).toFixed(b >= 1e8 ? 0 : 1)} MB`;

// the area on screen: the whole world when the globe lies wholly in view (or the flat map shows all of it)
function viewArea() {
  const m = M.map, c = m.getCanvas(), w = c.clientWidth, h = c.clientHeight, ctr = m.getCenter();
  if (viewOn('globe')) {
    const r = 512 * 2 ** m.getZoom() / (2 * Math.PI * Math.max(0.2, Math.cos(ctr.lat * Math.PI / 180)));   // (the globe's radius on screen, about)
    if (2 * r <= Math.min(w, h)) return { world: true, w: -180, s: -MERC_LAT, e: 180, n: MERC_LAT };
  }
  const b = m.getBounds(); let W = b.getWest(), E = b.getEast();
  if (E - W >= 359) return { world: true, w: -180, s: -MERC_LAT, e: 180, n: MERC_LAT };
  W = ((W + 540) % 360) - 180; E = ((E + 540) % 360) - 180;
  return { world: false, w: W, e: E, s: Math.max(-MERC_LAT, b.getSouth()), n: Math.min(MERC_LAT, b.getNorth()) };
}
const areaKm = a => { const lat = (a.s + a.n) / 2, dl = (a.e - a.w + 360) % 360 || 360; return [Math.round(dl * 111.32 * Math.cos(lat * Math.PI / 180)), Math.round((a.n - a.s) * 110.6)]; };
const coordName = a => { const lat = (a.s + a.n) / 2, lon = a.w <= a.e ? (a.w + a.e) / 2 : (((a.w + a.e + 360) / 2 + 540) % 360) - 180;
  return `${Math.abs(Math.round(lat))}° ${lat < 0 ? 'S' : 'N'} ${Math.abs(Math.round(lon))}° ${lon < 0 ? 'W' : 'E'}`; };

// the size: a few tiles of the chosen detail fetched to see how large they are
async function areaSample(a, z) {
  const k = `${a.world}|${a.w}|${a.s}|${a.e}|${a.n}|${z}`, c = (M.rsEst ??= new Map());
  if (c.has(k)) return c.get(k);
  const p = (async () => {
    const [[x0, x1, y0, y1]] = areaRanges(a, z), pts = [[0.5, 0.5], [0.25, 0.3], [0.75, 0.7], [0.3, 0.75], [0.7, 0.25]], seen = new Set(); let n = 0, b = 0;
    await Promise.all(pts.map(async ([fx, fy]) => {
      const x = Math.round(x0 + (x1 - x0) * fx), y = Math.round(y0 + (y1 - y0) * fy), u = mhTileUrl(z, x, y); if (seen.has(u)) return; seen.add(u);
      try { const r = await fetch(u + '?pult-save', { mode: 'cors' }); if (r.ok) { b += (await r.arrayBuffer()).byteLength; n++; } } catch (_) {}
    }));
    return n ? b / n : null;
  })();
  c.set(k, p); return p;
}

// ---------------------------------------------------------------- the save view (from the Globe menu)
function reliefSavePop() {
  if (!M.map) return;
  const a = M.rsJob ? M.rsJob.a : viewArea();
  if (!M.rsJob) { let z = 2; while (z < MH_Z && areaCount(a, z + 1) <= 3000) z++; M.rsv = { a, z, name: a.world ? 'Whole world' : coordName(a) }; }
  rightPop('mapsave', 'Save relief offline', reliefSaveHTML());
  reliefSaveInfo();
  if (!M.rsJob && !a.world) areaName(a).then(n => { const f = $('#rsName'); if (n && f && M.rsv?.a === a && !M.rsv.edited) { f.value = n; M.rsv.name = n; } });
}
// a name for the area, from OpenStreetMap's place names (Nominatim): by its size a city, a region, a country or a continent
const CONT = { Europe: 'al ad at by be ba bg hr cz dk ee fo fi fr de gi gr gg hu is ie im it je xk lv li lt lu mt md mc me nl mk no pl pt ro ru sm rs sk si es sj se ch ua gb va',
  Africa: 'dz ao bj bw bf bi cv cm cf td km cg cd ci dj eg gq er sz et ga gm gh gn gw ke ls lr ly mg mw ml mr mu yt ma mz na ne ng re rw sh st sn sc sl so za ss sd tz tg tn ug eh zm zw',
  'North America': 'ai ag aw bs bb bz bm bq vg ca ky cr cu cw dm do sv gl gd gp gt ht hn jm mq mx ms ni pa pr bl kn lc mf pm vc sx tt tc us vi',
  'South America': 'ar bo br cl co ec fk gf gy py pe sr uy ve', Oceania: 'as au ck fj pf gu ki mh fm nr nc nz nu nf mp pw pg pn ws sb tk to tv um vu wf', Antarctica: 'aq' };
async function areaName(a) {
  const [kw, kh] = areaKm(a), km = Math.max(kw, kh), lat = (a.s + a.n) / 2, lon = a.w <= a.e ? (a.w + a.e) / 2 : (((a.w + a.e + 360) / 2 + 540) % 360) - 180;
  const zoom = km > 1500 ? 3 : km > 400 ? 3 : km > 120 ? 5 : km > 30 ? 8 : 10;
  try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&zoom=${zoom}&accept-language=en`, { signal: ctl.signal });
    if (!r.ok) return null; const j = await r.json(), ad = j.address || {};
    if (km > 1500) { const cc = (ad.country_code || '').toLowerCase(); if (!cc) return null; return Object.keys(CONT).find(k => CONT[k].split(' ').includes(cc)) || 'Asia'; }
    if (zoom === 3) return ad.country || j.name || null;
    if (zoom === 5) return ad.state || ad.region || ad.province || j.name || ad.country || null;
    return ad.city || ad.town || ad.village || ad.county || j.name || ad.state || null;
  } catch (_) { return null; }
}
function reliefSaveHTML() {
  const j = M.rsJob;
  if (j) return `<div class="rsave"><p>Saving <b>${esc(j.a.name)}</b> …</p><div class="rsbar"><i id="rsBar" style="width:${(j.done / j.a.total * 100).toFixed(1)}%"></i></div>
    <p class="rsinfo" id="rsInfo"></p><div class="rsbtns"><button type="button" data-rsstop="1">Stop</button></div>
    <small class="hint">You can close this menu; saving goes on while Pult is open.</small></div>`;
  const { a, z, name } = M.rsv, [kw, kh] = areaKm(a);
  return `<div class="rsave"><p>${a.world ? '<b>The whole world</b> will be saved (the globe is wholly in view).' : `The area on screen will be saved: about ${kw.toLocaleString('en')} × ${kh.toLocaleString('en')} km.`}</p>
    <label class="mrow"><span>Detail</span><input type="range" min="2" max="${MH_Z}" step="1" value="${z}" data-rsz="1" aria-label="Detail"></label>
    <p class="rsinfo" id="rsInfo"></p>
    <label class="mrow"><span>Name</span><input type="text" id="rsName" value="${esc(name)}" maxlength="60"></label>
    <div class="rsbtns"><button type="button" data-rsback="1">Back</button><button type="button" class="acc" data-rsgo="1" id="rsGo">Save</button></div>
    <small class="hint">Heights from Mapterhorn. Coarser levels are saved with it, for zooming out. Saved areas are listed in Settings → Maps.</small></div>`;
}
const rsRedraw = () => { const pop = $('#mapPop'); if (!pop || pop.hidden || pop.dataset.k !== 'mapsave') return;
  pop.innerHTML = `<div class="mph"><span class="navh">Save relief offline</span></div>${reliefSaveHTML()}`; reliefSaveInfo(); };
const RS_MAX_TILES = 400000;
async function reliefSaveInfo() {
  const el = $('#rsInfo'); if (!el) return;
  const j = M.rsJob;
  if (j) { el.textContent = `${j.done.toLocaleString('en')} of ${j.a.total.toLocaleString('en')} tiles · ${fmtBytes(j.bytes)}`; const b = $('#rsBar'); if (b) b.style.width = (j.done / j.a.total * 100).toFixed(1) + '%'; return; }
  const { a, z } = M.rsv, lat = a.world ? 0 : (a.s + a.n) / 2, n = areaCount(a, z), go = $('#rsGo');
  const det = `about ${fmtM(mPerPx(z, Math.min(70, Math.abs(lat))))} · ${n.toLocaleString('en')} tiles`;
  if (n > RS_MAX_TILES) { el.innerHTML = `${det} · <b>too large</b> – less detail, or a smaller area`; if (go) go.disabled = true; return; }
  el.textContent = det + ' · size: estimating …'; if (go) go.disabled = false;
  const avg = await areaSample(a, z); if (!M.rsv || M.rsv.z !== z || $('#rsInfo') !== el) return;
  let free = ''; try { const q = await navigator.storage?.estimate?.(); if (q?.quota) free = ` (free: about ${fmtBytes(q.quota - (q.usage || 0))})`; } catch (_) {}
  el.textContent = det + (avg ? ` · about ${fmtBytes(avg * n)}${free}` : ' · size unknown (Mapterhorn not reached)');
}
document.addEventListener('input', ev => {
  const r = ev.target.closest?.('input[data-rsz]'); if (!r || !M.rsv) return;
  M.rsv.z = +r.value; reliefSaveInfo();
});
document.addEventListener('input', ev => { if (ev.target.id === 'rsName' && M.rsv) { M.rsv.name = ev.target.value; M.rsv.edited = true; } });
async function reliefSaveClick(b) {
  const d = b.dataset;
  if (b.id === 'mapSaveBtn') { reliefSavePop(); return true; }
  if (d.rsback) { mapOptsPop(); return true; }
  if (d.rsstop) { if (M.rsJob) M.rsJob.stop = true; return true; }
  if (d.rsgo) { const { a, z } = M.rsv, name = ($('#rsName')?.value || '').trim() || (a.world ? 'Whole world' : coordName(a));
    reliefSave({ id: 'a' + Date.now().toString(36), name, w: a.w, s: a.s, e: a.e, n: a.n, world: a.world, z }); return true; }
  return false;
}
// the download: six at a time; tiles already saved (by another area) are counted, not fetched again
async function reliefSave(a) {
  if (M.rsJob) return;
  try { navigator.storage?.persist?.(); } catch (_) {}
  a.total = areaCount(a, a.z); a.tiles = a.tiles || 0; a.bytes = a.bytes || 0; a.at = Date.now(); a.state = 'saving';
  const list = (await reliefAreas()).filter(x => x.id !== a.id); list.push(a); await putAreas(list);
  const j = M.rsJob = { a, done: 0, bytes: 0, stop: false, fail: 0 };
  rsRedraw();
  const c = await caches.open(RELIEF_C);
  const tiles = (function* () { for (let z = 0; z <= a.z; z++) for (const [x0, x1, y0, y1] of areaRanges(a, z)) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) yield [z, x, y]; })();
  let lastUi = 0, lastPut = 0;
  const one = async ([z, x, y]) => {
    const u = mhTileUrl(z, x, y), have = await c.match(u);
    if (have) return +(have.headers.get('x-size') || 0);
    for (let t = 0; t < 3; t++) {
      try { const r = await fetch(u + '?pult-save', { mode: 'cors', cache: 'no-store' });
        if (r.status === 404) return 0;
        if (r.ok) { const buf = await r.arrayBuffer(); await c.put(u, new Response(buf, { headers: { 'content-type': 'image/webp', 'x-size': String(buf.byteLength) } })); return buf.byteLength; }
      } catch (_) {}
      await new Promise(res => setTimeout(res, 800 * (t + 1)));
    }
    j.fail++; return 0;
  };
  const worker = async () => { for (;;) { if (j.stop || j.fail > 50) return; const n = tiles.next(); if (n.done) return;
    const got = await one(n.value); j.bytes += got; j.done++;          // (awaited first: the six run side by side)
    const now = Date.now(); if (now - lastUi > 300) { lastUi = now; reliefSaveInfo(); }
    if (now - lastPut > 5000) { lastPut = now; a.tiles = j.done; a.bytes = j.bytes; await putAreas(await reliefAreas()); } } };
  await Promise.all(Array.from({ length: 6 }, worker));
  a.tiles = j.done; a.bytes = j.bytes; a.state = j.done >= a.total ? 'done' : 'stopped'; await putAreas(await reliefAreas());
  M.rsJob = null;
  if (a.state === 'done') note(`${a.name}: relief saved (${fmtBytes(a.bytes)})`);
  else toast(j.fail > 50 ? `${a.name}: saving stopped – Mapterhorn could not be reached. Resume it in Settings → Maps.` : `${a.name}: saving stopped. Resume it in Settings → Maps.`, 5000);
  if ($('#mapPop')?.dataset.k === 'mapsave' && !$('#mapPop').hidden) mapOptsPop();
  redrawMapSection?.();
}
// deleting an area: its tiles go, unless another area also holds them
async function reliefDelete(id) {
  if (M.rsJob?.a.id === id) { M.rsJob.stop = true; while (M.rsJob) await new Promise(r => setTimeout(r, 200)); }
  const all = await reliefAreas(), gone = all.find(a => a.id === id); if (!gone) return;
  const rest = all.filter(a => a.id !== id); await putAreas(rest);
  const c = await caches.open(RELIEF_C);
  for (const req of await c.keys()) {
    const m = req.url.match(/mapterhorn\.com\/(\d+)\/(\d+)\/(\d+)\.webp$/); if (!m) continue;
    const [z, x, y] = m.slice(1).map(Number);
    if (areaHas(gone, z, x, y) && !rest.some(a => areaHas(a, z, x, y))) await c.delete(req);
  }
  if (!isOnline() && !rest.some(a => a.tiles > 0) && M.map) { await reliefInit(); imgNetChange(); }
}
// the list in Settings → Maps
async function reliefAreasHTML() {
  const list = await reliefAreas();
  const rows = list.map(a => { const lat = a.world ? 0 : (a.s + a.n) / 2, busy = M.rsJob?.a.id === a.id;
    const st = busy ? ` · <i>saving … ${Math.round(M.rsJob.done / a.total * 100)} %</i>` : a.state !== 'done' ? ` · <i>incomplete (${Math.round((a.tiles || 0) / a.total * 100)} %)</i>` : '';
    return `<div class="mpk rsrow"><div><b>${esc(a.name)}</b><small class="hint">about ${fmtM(mPerPx(a.z, Math.min(70, Math.abs(lat))))} · ${fmtBytes(a.bytes || 0)} · ${new Date(a.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}${st}</small></div>`
      + `<span class="rsact">${!busy && a.state !== 'done' ? `<button type="button" data-rsresume="${a.id}">Resume</button>` : ''}<button type="button" data-rsdel="${a.id}">Delete</button></span></div>`; }).join('');
  return `<div class="navh2">Relief saved for offline use</div><div class="list plain">${rows || '<p class="hint small">None yet. Save an area from the Globe menu on the map (needs a connection).</p>'}</div>`;
}
document.addEventListener('click', async ev => {
  const d = ev.target.closest?.('[data-rsdel]'), r = ev.target.closest?.('[data-rsresume]');
  if (d) { d.disabled = true; const a = (await reliefAreas()).find(x => x.id === d.dataset.rsdel); await reliefDelete(d.dataset.rsdel); redrawMapSection(); if (a) note(`${a.name} deleted`); return; }
  if (r) { if (!isOnline()) { toast('Saving needs a connection.', 3000); return; } const a = (await reliefAreas()).find(x => x.id === r.dataset.rsresume); if (a) { reliefSave(a); redrawMapSection(); } }
});

// the height at a point (m), from the most detailed tile (null without relief)
async function heightAt(lon, lat, z) {
  if (!M.relDem) return null;
  z = Math.min(z ?? MH_Z, MH_Z);
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
  const r = n => Math.round(n / unit().small).toLocaleString('en'), u = ' ' + unit().sl;
  return `<div class="dprof"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${path}L${W} ${H}L0 ${H}Z" class="pf"/><path d="${path}" class="pl"/></svg>
    <small>Height ${r(lo)}–${r(hi)}${u} · climb ${r(up)}${u} · descent ${r(down)}${u}</small></div>`;
}

// ---------------------------------------------------------------- the layers (called by layerStyle)
function reliefStyle(st, C) {
  const dark = document.documentElement.dataset.theme === 'dark';
  const at = id => st.layers.findIndex(l => l.id === id);
  const put = (k, ...ls) => st.layers.splice(k < 0 ? st.layers.length : k, 0, ...ls);
  // sea depth (Natural Earth): beneath the land; with the detailed coasts above their sea, fading out as one zooms in
  if (M.pkFiles?.has('relief/bathy.pmtiles') && M.cfg.elev !== false) {
    st.sources.bathy = { type: 'vector', url: pmUrl('relief/bathy.pmtiles') };
    const deep = dark ? ['#1d2a33', '#18242c', '#141f27', '#111a21', '#0e161c'] : ['#cfdde6', '#bfd2de', '#adc5d5', '#9cb8cb', '#8aaabf'];
    const hd = at('hd-sea') >= 0;
    put(hd ? at('hd-sea') + 1 : at('land'), { id: 'rel-bathy', type: 'fill', source: 'bathy', 'source-layer': 'depth', maxzoom: hd ? 9 : 24,
      paint: { 'fill-color': ['step', ['get', 'd'], deep[0], 200, deep[1], 1000, deep[2], 2000, deep[3], 4000, deep[4]], 'fill-opacity': hd ? ['interpolate', ['linear'], ['zoom'], 6, 1, 8.5, 0] : 1, 'fill-antialias': false } });
  }
  if (!M.relDem || M.cfg.elev === false) return;                    // (Elevation switched off in the Globe menu)
  const dsrc = () => ({ type: 'raster-dem', tiles: [MH_URL], encoding: 'terrarium', tileSize: 512, maxzoom: MH_Z });
  st.sources.reldem = dsrc(); st.sources.terrdem = dsrc();           // (3D: its own source, as MapLibre advises)
  if (viewOn('t3d')) st.terrain = T3D();
  const below = ['a-water', 'a-areas', 'a-emp', 'lakes'].map(at).find(k => k >= 0) ?? at('lakes');
  const ls = [];
  if (engineMajor() >= 5) {                                          // colours by height (MapLibre 5)
    ls.push({ id: 'rel-color', type: 'color-relief', source: 'reldem', paint: { 'color-relief-opacity': dark ? 0.35 : 0.5,
      'color-relief-color': ['interpolate', ['linear'], ['elevation'], 0, 'rgba(0,0,0,0)', 1, dark ? '#3c5232' : '#a8c690', 200, dark ? '#4a5a34' : '#cfd9a0', 500, dark ? '#6a6036' : '#e6dca6', 1000, dark ? '#7a5a36' : '#d9b98a', 2000, dark ? '#7a4a3a' : '#c09a7e', 3500, dark ? '#8a8a8a' : '#e8e4e0', 5500, '#ffffff'] } });
  }
  ls.push({ id: 'rel-shade', type: 'hillshade', source: 'reldem', paint: { 'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 3, 0.55, 8, 0.4, 12, 0.3],
    // (only darkening, in black: the shaded slopes keep their own colour, the sunlit ones are left as they are – v321)
    'hillshade-shadow-color': '#000000', 'hillshade-highlight-color': 'rgba(0,0,0,0)', 'hillshade-accent-color': '#000000' } });
  put(below, ...ls);
  const k = ['a-prov', 'a-roads', 'own'].map(at).find(i => i >= 0) ?? at('pl-region');
  // contour lines (maplibre-contour – the way the engine's own documentation draws them; since v345 the only ones: the lines once
  // drawn by the graphics chip, through a change to the engine, are gone): every so many metres (or feet, in the units of the map
  // settings), the larger steps stronger and numbered; wider or closer by the reader's spacing
  contStepNow();
  st.sources.contours = { type: 'vector', maxzoom: 15, tiles: [contUrl()] };
  // fine orange lines, the numbered ones a little stronger (v345), and their numbers written along them by the engine itself
  put(k, { id: 'rel-contour', type: 'line', source: 'contours', 'source-layer': 'contours', minzoom: 5, filter: ['>', ['get', 'ele'], 0],
    paint: { 'line-color': '#f0821e', 'line-opacity': ['case', ['==', ['get', 'level'], 1], 0.77, 0.55], 'line-width': ['case', ['==', ['get', 'level'], 1], 0.777, 0.333] } });   // (finer – 598, v392)
  put(k, { id: 'rel-coast0', type: 'line', source: 'contours', 'source-layer': 'contours', filter: ['==', ['get', 'ele'], 0],     // the 0 m line: the coast from the heights
    paint: { 'line-color': '#f0821e', 'line-width': 0.8, 'line-opacity': 0.8 } });
  put(k, { id: 'rel-contour-num', type: 'symbol', source: 'contours', 'source-layer': 'contours', minzoom: 7, filter: ['all', ['==', ['get', 'level'], 1], ['>', ['get', 'ele'], 0]],
    layout: { 'symbol-placement': 'line', 'symbol-spacing': 333, 'text-field': ['number-format', ['get', 'ele'], { locale: 'en' }], 'text-font': ['Pult'], 'text-size': 14,
      'text-max-angle': 30, 'text-padding': 4, 'text-keep-upright': true },
    paint: { 'text-color': '#ffb066', 'text-halo-color': 'rgba(28,16,6,.85)', 'text-halo-width': 1.4 } });   // (larger – 599, 601, v392)
}
// How far apart the contour lines are: one spacing for the whole view, by the camera's height above the ground (630a, 631a – v404;
// before, by each tile's detail, so nearer lines closer). In steps; a step changed only once the height is well past its bound, so
// that it does not flicker to and fro; then the contour tiles are drawn anew. Wider or closer by the reader's spacing, as before.
const CONT_B = [1000, 3000, 10000, 30000];                           // (the bounds of the steps, metres above the ground)
const CONT_M = [[50, 250], [100, 500], [200, 1000], [500, 2500], [1000, 5000]], CONT_FT = [[200, 1000], [500, 2500], [1000, 5000], [2000, 10000], [5000, 10000]];
function contStepFor(h, cur) {
  if (h == null || !isFinite(h)) return cur ?? 1;
  let i = cur ?? CONT_B.findIndex(b => h < b); if (i < 0) i = CONT_B.length;
  while (i < CONT_B.length && h > CONT_B[i] * 1.15) i++;
  while (i > 0 && h < CONT_B[i - 1] * 0.87) i--;
  return i;
}
function contStepNow() { M.contStep = contStepFor(typeof camAboveGround === 'function' ? camAboveGround() : null, M.contStep); return M.contStep; }
function contUrl() {
  const ft = unit().small !== 1, f = contSpacing() / 9, NICE = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
  const nice = v => NICE.find(n => n >= v * 0.9) || 10000, [a, b] = (ft ? CONT_FT : CONT_M)[M.contStep ?? 1];
  return M.relDem.contourProtocolUrl({ multiplier: 1 / unit().small, overzoom: 1, contourLayer: 'contours', elevationKey: 'ele', levelKey: 'level',
    thresholds: { 0: [nice(a * f), Math.max(nice(b * f), nice(a * f) * 2)] } });
}
// (as the camera moves: a new step, new lines)
function contUpd() {
  const m = M.map, src = m?.getSource?.('contours'); if (!src || !M.relDem || typeof src.setTiles !== 'function') return;
  const was = M.contStep; if (contStepNow() !== was) { try { src.setTiles([contUrl()]); } catch (_) {} }
}
function reliefLayerProps() {
  const v = x => x ? 'visible' : 'none';
  return { 'rel-shade': { vis: v(relOn('relShade')) }, 'rel-color': { vis: v(relOn('relColor')) }, 'rel-contour': { vis: v(relOn('relContours')) }, 'rel-contour-num': { vis: v(relOn('relContours')) }, 'rel-coast0': { vis: v(relOn('relContours')) }, 'rel-bathy': { vis: v(relOn('relBathy')) } };
}
// the menu: Layers → Landscape

// ---------------------------------------------------------------- the figures of the contour numbers (v345)
// The engine writes its labels with "glyphs": each letter as a signed distance field, in protocol-buffer files, usually fetched from
// a server. The numbers need only the figures, the comma and the minus: Pult makes them itself, offline, from its own UI font
// (TinySDF), and hands them to the engine under the address pultglyph://.
let glyphPbf = null;
function glyphInit() {
  if (M.glyphProto || !window.maplibregl) return; M.glyphProto = true;
  maplibregl.addProtocol('pultglyph', async params => ({ data: /\/0-255$/.test(params.url) ? await pultGlyphs() : new ArrayBuffer(0) }));
}
function pultGlyphs() {
  return glyphPbf ??= (async () => {
    const { default: TinySDF } = await import('./tinysdf.js');
    try { await document.fonts.load('600 24px "Source Sans 3"'); } catch (_) {}
    const sdf = new TinySDF({ fontSize: 24, buffer: 3, radius: 8, cutoff: 0.25, fontFamily: '"Source Sans 3", sans-serif', fontWeight: '600' });
    const gl = [...' ,-.0123456789\u2212'].map(ch => { const g = sdf.draw(ch);
      return { id: ch.charCodeAt(0), bitmap: g.glyphWidth && g.glyphHeight ? g.data : null, width: g.glyphWidth, height: g.glyphHeight, left: g.glyphLeft, top: g.glyphTop - 27, advance: Math.round(g.glyphAdvance) }; });
    return pbfGlyphs('Pult', '0-255', gl);
  })().catch(e => { glyphPbf = null; throw e; });
}
// the protocol buffer: glyphs { fontstack stacks = 1 } · fontstack { name = 1, range = 2, glyph glyphs = 3 } ·
// glyph { id = 1, bitmap = 2, width = 3, height = 4, left = 5 (sint), top = 6 (sint), advance = 7 }
function pbfGlyphs(name, range, glyphs) {
  const vi = (o, n) => { n >>>= 0; while (n > 127) { o.push((n & 127) | 128); n >>>= 7; } o.push(n); };
  const zz = n => (n << 1) ^ (n >> 31);
  const bytes = (o, f, b) => { vi(o, (f << 3) | 2); vi(o, b.length); for (const x of b) o.push(x); };
  const num = (o, f, n) => { vi(o, f << 3); vi(o, n); };
  const fs = [], te = new TextEncoder();
  bytes(fs, 1, te.encode(name)); bytes(fs, 2, te.encode(range));
  for (const g of glyphs) { const o = []; num(o, 1, g.id); if (g.bitmap) bytes(o, 2, g.bitmap); num(o, 3, g.width); num(o, 4, g.height); num(o, 5, zz(g.left)); num(o, 6, zz(g.top)); num(o, 7, g.advance); bytes(fs, 3, o); }
  const out = []; bytes(out, 1, fs); return new Uint8Array(out).buffer;
}
