// ================================================================ Pult · maps
// Optional packages (Instruments → Map): "base" = land, lakes, rivers, modern borders and the map engine (MapLibre);
// "places" = the Pleiades gazetteer. The places of a text are found here, in the app: the lemma of every proper noun is
// looked up among the names of the gazetteer (any text, also imported ones). The reader can correct every place.
// Settings keys: mapPk (installed packages) · pl|<text>|<word> (correction of one passage) · plw|<work>|<name> (in a work)
// · plg|<name> (everywhere) · pown|<id> (own places) · mpos|<key> (map position) · mapCfg (layers, names, scope …)
const MAPS = 'maps/', MAPCACHE = 'pult-maps';
// errors of the map scripts (maplayers.js, mapsaved.js): kept to be shown if the map cannot start
const SCRIPT_ERR = [];
window.addEventListener('error', e => {
  const f = (e.filename || e.target?.src || '').split('/').pop().split('?')[0];
  if (/^map/.test(f)) SCRIPT_ERR.push(`${f}: ${e.message || 'could not be loaded'}${e.lineno ? ' (line ' + e.lineno + ')' : ''}`);
}, true);
// the map scripts must have run; if one is missing (not loaded, or stopped by an error), it is loaded once more from the website
async function ensureMapScripts() {
  if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
  const need = [['maplayers.js', () => typeof layerStyle === 'function'], ['mapsaved.js', () => typeof savePop === 'function'], ['mapdraw.js', () => typeof drawFC === 'function'], ['maprelief.js', () => typeof reliefStyle === 'function']];
  for (const [f, ok] of need) {
    if (ok()) continue;
    await new Promise(res => { const s = document.createElement('script'); s.src = f + '?r=' + Date.now(); s.onload = s.onerror = res; document.head.append(s); });
    if (!ok()) throw new Error(`${f} could not be started. ${SCRIPT_ERR.join(' · ')}`);
  }
}
['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => { if (e.target.closest?.('#mapBody')) e.preventDefault(); }, { passive: false }));
// two fingers on the controls of the map (outside the map itself): no page zoom either
document.addEventListener('touchmove', e => { if (e.touches.length > 1 && e.target.closest?.('#mapBody') && !e.target.closest('.maplibregl-canvas-container')) e.preventDefault(); }, { passive: false });
const M = { P: null, map: null, sel: null, hits: new Map(), scope: null, cfg: null, posKey: null, own: new Map() };
// the map button: the Mediterranean, cut off at the edges of the button – grey land on black, in colour when the map is open
const EUROPE_ICON = '<i class="eu" aria-hidden="true"></i>'; // map image: Natural Earth II (public domain), see style.css

// ---------------------------------------------------------------- settings of the map
async function mapCfg() {
  if (!M.cfg) {
    await ensureMapScripts();
    M.engineSet = (await setting('mapEngine')) || '5';
    const saved = (await setting('mapCfg')) || {};
    if (!saved.v2) { delete saved.mark; saved.v2 = true; }
    if (['km', 'mi', 'st'].includes(saved.dLen)) saved.dLen = 'on';      // lengths on the map: now in the units of the settings (v207)                 // place names are no longer marked in the text by default
    if (!saved.v3) {                                                     // "Places from": switch + scale + selection (v123→124)
      saved.v3 = true;
      if (saved.scope === 'multi') { saved.sel = (saved.multi || []).map(k => k.startsWith('imp:') ? { kind: 'book', t: +k.slice(4), label: 'Imported text', sub: 'the whole text' } : { kind: 'work', w: k.slice(2), label: k.slice(2), sub: 'the whole work' }); saved.scope = 'sel'; }
      if (saved.scope === 'all' || saved.scope === 'none') saved.scope = 'section';
      if (saved.sites) saved.pfOn = false;
    }
    if (!saved.v5) { saved.v5 = true; if (saved.regions) { saved.nmRegions = saved.regions !== 'off'; saved.regArea = saved.regions === 'areas'; } }   // the new layer menu
    if (saved.basemap === 'ne2') saved.basemap = 'hd';
    delete saved.sunNight; delete saved.sunAtm;
    if (saved.skySize <= 6 && !saved.skySize2) { delete saved.skySize; saved.skySize2 = 1; }               // (the sun and the moon much larger, v336)                                             // (night shade and air: always with day and night, v334)
    if (saved.img === 'none') saved.img = 'bm';                                            // (the drawn map retired, v300)                                     // (Natural Earth II retired, v296)
    if (!saved.v4) { saved.v4 = true; if (!Object.values(saved.cats || {}).some(Boolean)) saved.cats = { settl: true }; }   // kinds of places: settlements by default
    M.cfg = Object.assign({ mark: false, jump: true, pfOn: true, sel: [], scope: 'section', names: 'text', peoples: false, borders: false, rough: true, persons: 'unsure' }, JSON.parse(JSON.stringify(LCFG)), saved);
    M.esriKey ??= (await setting('esriKey')) || '';
    // an animation paused when the app was closed: paused again, at the moment where it stood (v370)
    if (M.cfg.sunPaused && ['anim', 'year'].includes(M.cfg.sunMode)) { M.sunPause = true; if (M.cfg.sunPausedT) M.sunT = M.cfg.sunPausedT; }
  }
  return M.cfg;
}
async function saveMapCfg() { await setting('mapCfg', M.cfg); }

// ---------------------------------------------------------------- packages
async function mapManifest() {
  try { const r = await fetchT(MAPS + 'maps.json', { cache: 'no-cache' }, 6000); if (r.ok) { const j = await r.json(); (await caches.open(MAPCACHE)).put(new URL(MAPS + 'maps.json', location.href).href, new Response(JSON.stringify(j))); return j; } } catch (_) { }
  try { const r = await (await caches.open(MAPCACHE)).match(new URL(MAPS + 'maps.json', location.href).href); if (r) return await r.json(); } catch (_) { }
  return null;
}
// installed packages {id: version}; "Ancient world" was split in two (its files stay where they were)
async function mapInstalled() {
  const inst = (await setting('mapPk')) || {};
  if (inst.ancient) { inst['ancient-land'] = inst['ancient-built'] = inst.ancient; delete inst.ancient; await setting('mapPk', inst); }
  return inst;
}
// switched off in Instruments → Map (kept on the device, not used) · the whole map switched off (no button, no place recognition)
async function mapOff() { const o = (await setting('mapOff')) || {}; delete o.base; return o; }
async function mapsEnabled() { return true; }      // (the map can no longer be switched off as a whole)
async function mapHas(id) { return !!(await mapInstalled())[id] && !(await mapOff())[id]; }
async function downloadMapPkg(p, onp, signal) {
  const c = await caches.open(MAPCACHE), tmp = await caches.open('pult-dl-parts'); let done = 0;
  for (const f of p.files) {
    const url = new URL(MAPS + f, location.href).href, from = g => p.url ? new URL(g, p.url).href : new URL(MAPS + g, location.href).href;
    // a large file comes in parts (f.0, f.1 …), joined here into one; each part is kept as it arrives, so that a
    // download that was stopped or broke off goes on from the part where it stopped (tagged with the package version)
    const names = p.parts?.[f] ? Array.from({ length: p.parts[f] }, (_, k) => `${f}.${k}`) : [f], pieces = [];
    for (const g of names) {
      const tk = from(g) + '?v=' + encodeURIComponent(p.v || '');
      let b = names.length > 1 ? await (await tmp.match(tk))?.blob() : null;
      // (up to three tries: right after an update a file can briefly fail on the way)
      for (let k = 0; k < 3 && !b; k++) {
        try { const r = await fetch(from(g), { cache: 'reload', signal }); if (!r.ok) throw new Error(g + ': ' + r.status); b = await r.blob(); }
        catch (e) { if (k === 2 || e.name === 'AbortError') throw e; await new Promise(res => setTimeout(res, 1500 * (k + 1))); }
        if (b && names.length > 1) await tmp.put(tk, new Response(b, { headers: { 'x-pult-at': String(Date.now()) } }));
      }
      pieces.push(b); done += b.size; onp?.(Math.min(1, done / p.bytes));
    }
    const b = pieces.length === 1 ? pieces[0] : new Blob(pieces);
    await c.put(url, new Response(b, { headers: { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' } }));
    for (const g of names.length > 1 ? names : []) await tmp.delete(from(g) + '?v=' + encodeURIComponent(p.v || ''));
  }
  const inst = await mapInstalled(); inst[p.id] = p.v; await setting('mapPk', inst);
  // levels of detail of the same package (group): the one installed replaces the others
  if (p.group) for (const q of M.man?.packages || []) if (q.id !== p.id && q.group === p.group && inst[q.id]) await deleteMapPkg(q);
  if (p.id === 'places') { M.P = null; M.sitesFC = null; await buildPlaceIndex().catch(() => { }); await placesForText(); }
  if ((/^ancient/.test(p.id) || /\.pmtiles$/.test(p.files[0])) && M.map) { M.map.remove(); M.map = null; M.ancLab = null; }
  for (const f of p.files) M.pmb?.delete(new URL(MAPS + f, location.href).href);
}
// a map package in the download queue (dialogs.js): the row shows the filling button, then becomes an installed one
async function downloadMapQueued(id, signal) {
  const p = M.man?.packages.find(x => x.id === id); if (!p) throw new Error('not on the website');
  const q = 'map:' + id; DL.set(q, 0); await redrawMapSection();
  try { await downloadMapPkg(p, f => { DL.set(q, Math.min(0.98, f)); paintDL(q); }, signal); note(p.name + ' installed'); }
  finally { DL.delete(q); await redrawMapSection(); }
  if (S.tab === 'map') showMap();
}
async function deleteMapPkg(p) {
  const c = await caches.open(MAPCACHE), inst = await mapInstalled();
  // files another installed package also uses (e.g. the contour lines of both relief levels) stay
  const keep = new Set((M.man?.packages || []).filter(q => q.id !== p.id && inst[q.id]).flatMap(q => q.files));
  for (const f of p.files) if (!keep.has(f)) await c.delete(new URL(MAPS + f, location.href).href);
  delete inst[p.id]; await setting('mapPk', inst);
  if (p.id === 'places') { await dropPlaceIndex(); M.hits = new Map(); markPlaces(); }
  if ((p.id === 'base' || /^ancient/.test(p.id) || /\.pmtiles$/.test(p.files[0])) && M.map) { M.map.remove(); M.map = null; M.ancLab = null; }
  for (const f of p.files) if (!keep.has(f)) M.pmb?.delete(new URL(MAPS + f, location.href).href);
  if (p.id === 'places') M.sitesFC = null;
}
// the Map section of ☰ → Instruments: "Enable map", then the packages in three groups. A package that comes in two
// levels of detail is one row with a choice between them; each installed package can be switched off without deleting it.
const MAP_GROUPS = [['Basic', ['base']],
  ['Appearance', ['landscape', 'ne2', 'ne2-*', 'ancient-land', 'relief', 'relief-*']],
  ['Gazetteers and databases', ['places', 'itinere', 'ancient-built']]];
async function mapSectionHTML() {
  const man = await mapManifest(); if (!man) return '';
  M.man = man;
  const inst = await mapInstalled(), off = await mapOff(), on = await mapsEnabled();
  const pinfo = inst.places ? await placeIndexInfo() : null;
  const units = new Map();                                     // one row per package or per group of levels
  for (const p of man.packages) { if (p.retired && !inst[p.id]) continue;            // (retired packages: only while still installed, to be removed)
    const k = p.group || p.id; if (!units.has(k)) units.set(k, []); units.get(k).push(p); }
  const row = k => {
    const ps = units.get(k); if (!ps) return '';
    const cur = ps.find(p => inst[p.id]), p0 = cur || ps[0];
    const name = ps[0].name.replace(/\s*\((?:detailed|[^)]*full detail|Basic|Medium|Detailed)\)$/, '').replace(/, full detail\)$/, ')');
    const q = ps.map(p => 'map:' + p.id).find(x => DL.has(x)), busy = !!q;
    const lv = ps.length > 1 ? `<div class="seg lvl" role="group">${ps.map((p, i) => `<button type="button" data-mapget="${p.id}" class="${cur === p ? 'on' : ''}"${busy ? ' disabled' : ''} title="${cur === p ? 'Installed' : 'Download this level' + (cur ? ' (replaces the other)' : '')}">${cur === p ? '' : '⤓ '}${p.lvl || (i ? 'Detailed' : 'Standard')} <small>${mbs(p.bytes)}</small></button>`).join('')}</div>` : '';
    const right = busy ? dlIcon(q)
      : cur ? dlIcon('map:' + cur.id, { have: true, rev: inst[cur.id] !== cur.v, upd: 'Download update' })
      : ps.length > 1 ? '' : dlIcon('map:' + p0.id, { size: p0.bytes, off: document.body.classList.contains('netoff') });
    return `<div class="mpk${cur ? '' : ' avail'}" data-mk="${esc(k)}">` + pkRow({
      sw: cur && k !== 'base' ? SW(`data-mapsw="${cur.id}" aria-label="Use ${esc(name)}"`, !off[cur.id]) : '<span class="swsp"></span>',
      name: esc(name) + (p0.retired ? ' <small class="hint">– no longer used</small>' : ''), desc: (p0.retired ? (/^relief/.test(p0.id) ? 'Replaced by relief saved from Mapterhorn (Globe menu on the map); remove it to free the space. ' : 'Replaced by Blue Marble; remove it to free the space. ') : '') + esc(p0.desc) + (ps.length > 1 ? '' : ' · ' + mbs(p0.bytes)) + (cur && off[cur.id] ? ' · <i>switched off</i>' : ''),
      right, del: '', more: cur && k === 'places' ? (`<button type="button" data-pidx="1">Rebuild place index</button><small class="hint" id="pidxInfo">${pinfo?.built ? 'built ' + new Date(pinfo.built).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ` · ${pinfo.n.toLocaleString('en')} places` : 'not built yet – it is built when first needed'}</small>`) : '' }) + lv + '</div>';
  };
  // regions (relief, Natural Earth II): folded together, each region a row with its levels of detail
  const folds = (await setting('instFold')) || {};
  const regFold = (pre, title, fk) => { const regions = [...units.keys()].filter(k => k.startsWith(pre));
    return regions.length ? `<details class="subfold" data-if="${fk}"${folds[fk] ? ' open' : ''}><summary>${title} <small>${regions.filter(r => units.get(r).some(p => inst[p.id])).length} of ${regions.length} installed</small></summary>${regions.map(row).join('')}</details>` : ''; };
  const group = ([h, keys]) => `<div class="navh2">${h}</div><div class="list plain">` + keys.map(k => k === 'relief-*' ? regFold('relief-', 'Relief – regions', 'map-reg')
    : k === 'ne2-*' ? regFold('ne2-', 'Natural Earth II – regions', 'map-ne2reg') : row(k)).join('') + '</div>';
  return `<section class="dsec mapsec">`
    + `<div class="mapgroups">${MAP_GROUPS.map(group).join('')}${await reliefAreasHTML()}<p class="hint small">Only <b>Base map</b> is needed; everything else adds to it. Where there are two levels of detail, one is enough – the detailed one is for zooming in close.</p></div></section>`;
}
async function mapSummary() { const n = Object.keys(await mapInstalled()).length; return `${n} package${n === 1 ? '' : 's'} installed`; }
async function redrawMapSection() {
  const sec = $('#dlg section.mapsec'); if (!sec) return;
  const y = $('#dlg').scrollTop; sec.outerHTML = await mapSectionHTML(); $('#dlg').scrollTop = y;
  const sm = $('#dlg [data-pgsum="maps"]'); if (sm) sm.textContent = await mapSummary();
}
// after a package was switched on or off, or the whole map: the map is built again with what is in use
async function mapPkChanged(id) {
  if (M.map) { M.map.remove(); M.map = null; M.ancLab = null; }
  if (id === 'places' || id == null) { M.P = null; M.sitesFC = null; M.hits = new Map(); markPlaces(); if (await mapsEnabled()) await placesForText(); }
  applyMapsOn();
  if (S.tab === 'map') { if (await mapsEnabled()) showMap(); else showTab('entry'); }
}
async function applyMapsOn() { const b = $('#tabMap'); if (b) b.hidden = !(await mapsEnabled()); }
document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.dataset?.mapsw) { const id = t.dataset.mapsw, o = await mapOff(); if (t.checked) delete o[id]; else o[id] = true; await setting('mapOff', o); await mapPkChanged(id); await redrawMapSection(); }
});
document.addEventListener('click', async ev => {
  const b = ev.target.closest?.('#dlg [data-pidx]'); if (!b || b.disabled) return;
  b.disabled = true; b.classList.add('dlbtn', 'busy');
  try {
    const n = await buildPlaceIndex(f => { b.style.setProperty('--p', Math.round(f * 100) + '%'); b.textContent = `Building … ${Math.round(f * 100)} %`; });
    const keepMap = !!M.map; M.sitesFC = null;
    if (keepMap) await loadPlaceIndex(true);
    await placesForText(); if (S.tab === 'map') refreshMapData();
    note(`Place index rebuilt: ${n.toLocaleString('en')} places`);
  } catch (e) { toast('Could not rebuild the place index: ' + e.message, 4000); }
  redrawMapSection();
});
document.addEventListener('click', async ev => {
  const g = ev.target.closest?.('[data-mapget]'), d = ev.target.closest?.('[data-mapdel]');
  if (!g && !d) return;
  const p = M.man?.packages.find(x => x.id === (g || d).dataset[g ? 'mapget' : 'mapdel']); if (!p) return;
  if (d) { await deleteMapPkg(p); const o = await mapOff(); delete o[p.id]; await setting('mapOff', o); await redrawMapSection(); note(p.name + ' deleted'); if (S.tab === 'map') showMap(); return; }
  if (g.classList.contains('on')) return;                      // the level already installed
  queueDownload('map:' + p.id); redrawMapSection();
});

// ---------------------------------------------------------------- keys for matching names
const MAIN_TYPES = ['settlement', 'region', 'province', 'province-2', 'river', 'island', 'mountain', 'people', 'lake', 'water-open', 'cape', 'archipelago', 'peninsula', 'fortified-settlement', 'port', 'polis', 'ethnic-region', 'tribe', 'mountain-range', 'bay', 'strait', 'plain', 'desert', 'forest'];
const GENERIC = new Set('mons montes insula insulae portus flumen fluvius lacus promontorium sinus oppidum civitas regio vicus castra castellum ad in ager silva pons palus fons aquae ora mare'.split(' '));
const GR2LAT = { α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'e', θ: 'th', ι: 'i', κ: 'c', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'ph', χ: 'ch', ψ: 'ps', ω: 'o' };
function translit(s) {          // Greek -> Latin letters (for the romanised names of the gazetteer)
  const d = s.normalize('NFD').toLowerCase(); let out = '';
  for (let i = 0; i < d.length; i++) {
    const c = d[i];
    if (c === '̔') { out = out.replace(/([aeiouy]*)$/, 'h$1'); continue; }     // rough breathing
    if (/[̀-ͯ]/.test(c)) continue;
    if (c === 'γ' && /[γκξχ]/.test(d[i + 1] || '')) { out += 'n'; continue; }
    if (c === 'υ' && /[αεηο]$/.test(d.slice(0, i).replace(/[̀-ͯ]/g, ''))) { out += 'u'; continue; }
    out += GR2LAT[c] ?? c;
  }
  return out;
}
const exKey = s => gkey(s || '');
function stemKey(s) {
  let r = (isGreek(s) ? translit(s) : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  r = r.replace(/ae/g, 'e').replace(/oe/g, 'e').replace(/ai/g, 'e').replace(/oi/g, 'e').replace(/ei/g, 'i').replace(/ou/g, 'u')
    .replace(/k/g, 'c').replace(/ch/g, 'c').replace(/ph/g, 'f').replace(/th/g, 't').replace(/rh/g, 'r').replace(/y/g, 'i')
    .replace(/j/g, 'i').replace(/v/g, 'u').replace(/w/g, 'u').replace(/h/g, '').replace(/(.)\1+/g, '$1');
  const st = r.replace(/(orum|arum|ibus|ensis|ium|eia|ia|us|os|um|on|es|is|as|a|e|i|o|u|em|am|en|an)$/, '');
  return st.length >= 3 ? st : r.length >= 3 ? r : '';
}

// ---------------------------------------------------------------- the gazetteer
// The place index is built once from the Pleiades download (after downloading or updating it, or with "Rebuild place
// index" in Instruments → Map) and kept in its own database on the device: the places, the names leading to them,
// the ranks. Reading a text loads only the names that occur in it and their places; the whole gazetteer is loaded
// only when the map is opened (it shows every place).
const PL_DB = 'pult-places';
let plDBp = null;
function plDB() {
  return plDBp ??= new Promise((res, rej) => {
    const r = indexedDB.open(PL_DB, 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('p'); d.createObjectStore('k'); d.createObjectStore('id'); d.createObjectStore('meta'); };
    r.onsuccess = () => res(r.result); r.onerror = () => { plDBp = null; rej(r.error); };
  });
}
// (kept in bundles: a few hundred large records are written much faster than 100,000 small ones)
const PB = 512, KB = 1024, IB = 512;
const plHash = k => { let h = 0; for (let n = 0; n < k.length; n++) h = (h * 31 + k.charCodeAt(n)) | 0; return (h >>> 0) % KB; };
const plGet = async (st, k) => req2p((await plDB()).transaction(st).objectStore(st).get(k));
async function plGetMany(st, keys) {
  if (!keys.length) return [];
  const os = (await plDB()).transaction(st).objectStore(st);
  return Promise.all(keys.map(k => req2p(os.get(k))));
}
// a bundle of names (a few recent ones kept)
async function plKey(k) {
  const b = plHash(k), c = M.kb ??= new Map();
  if (!c.has(b)) { c.set(b, plGet('k', b).then(r => r || {})); if (c.size > 1100) c.delete(c.keys().next().value); }
  return (await c.get(b))[k] || null;
}
async function placeIndexInfo() { try { return await plGet('meta', 'info'); } catch (_) { return null; } }
// build the index from places.json (onp: progress 0…1)
async function buildPlaceIndex(onp) {
  const r = await fetch(MAPS + 'places/places.json'); if (!r.ok) throw new Error('Ancient places: ' + r.status);
  const d = await r.json(); onp?.(0.1);
  const textT = new Set(d.textTypes), ex = new Map(), st = new Map();
  const mainT = new Set(MAIN_TYPES.map(t => d.types.indexOf(t)).filter(i => i >= 0));
  const okWord = w => w.length >= 3 && !/^[IVXLCDM]+\.?$/.test(w);
  const add = (m, k, i) => { if (!k) return; let a = m.get(k); if (!a) m.set(k, a = []); if (!a.includes(i)) a.push(i); };
  const P = d.places.map(([id, t, lat, lon, ty, rough, y0, y1, names, w, pop, mc], i) => ({ i, id, t, lat, lon, ty, rough, y0, y1, names, conn: w || 0, pop: pop || 0, mc: mc || 0, text: ty.some(x => textT.has(x)) }));
  P.forEach((p, i) => {
    // the title tells the period where the attestations do not ("Hellas (Late Roman province)")
    const from = /late roman/i.test(p.t) ? 284 : /byzantine/i.test(p.t) ? 500 : /roman imperial|roman province|\(roman\)/i.test(p.t) ? -30 : null;
    if (from != null) { p.y0 = Math.max(p.y0 ?? from, from); p.late = true; }
    if (!p.text) return;
    const forms = new Set([...p.t.split('/'), ...p.names.filter(n => n[1] === 'grc' || n[1] === 'la' || n[1] === 'r').map(n => n[0])]
      .map(s => s.replace(/[?()‘’'“”\[\]]/g, '').trim()).filter(Boolean));
    p.main = p.ty.some(t => mainT.has(t));
    for (const f of forms) {
      const ws = f.split(/\s+/), main = GENERIC.has(latkey(ws[0])) ? '' : ws[0];       // "Ager Romanus" is not "Romanus"
      if (okWord(f)) { add(ex, exKey(f), i); if (p.main) add(st, stemKey(f), i); }
      if (p.main && ws.length > 1 && okWord(main)) { add(ex, exKey(main), i); add(st, stemKey(main), i); }   // "Seleucia ad Calycadnum" is also "Seleucia"
    }
  });
  const T = d.types, ti = Object.fromEntries(T.map((t, i) => [t, i]));
  // the ranks (significance) with the present weights
  const keep = M.P; M.P = { P, T, ti, full: true }; await mapCfg(); await loadDevCounts(); rankPlaces(); M.P = keep;
  onp?.(0.2);
  const db = await plDB();
  await req2p((() => { const tx = db.transaction(['p', 'k', 'id', 'meta'], 'readwrite'); for (const s of ['p', 'k', 'id', 'meta']) tx.objectStore(s).clear(); return tx.objectStore('meta').count(); })());
  const put = async (store, entries) => {
    for (let n = 0; n < entries.length; n += 4000) {
      await new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'), os = tx.objectStore(store); for (const [k, v] of entries.slice(n, n + 4000)) os.put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    }
  };
  const pb = []; for (const p of P) (pb[p.i / PB | 0] ??= []).push(p);
  await put('p', pb.map((a, b) => [b, a])); onp?.(0.6);
  const ib = []; for (const p of P) (ib[(typeof p.id === 'number' ? p.id : plHash(String(p.id))) % IB] ??= {})[p.id] = p.i;
  await put('id', ib.map((o, b) => [b, o]).filter(x => x[1]));
  const kb = []; for (const [pre, m] of [['e:', ex], ['s:', st]]) for (const [k, v] of m) (kb[plHash(pre + k)] ??= {})[pre + k] = v;
  await put('k', kb.map((o, b) => [b, o]).filter(x => x[1])); onp?.(0.95);
  const v = (await mapInstalled()).places || '';
  await put('meta', [['info', { v, built: Date.now(), n: P.length, T, src: d.src, hasConn: P.some(p => p.conn > 0) }], ['ranks', Int8Array.from(P, p => p.w || 0)]]);
  M.P = null; M.kc = null; M.kb = null; onp?.(1);
  return P.length;
}
async function dropPlaceIndex() { M.P = null; M.kc = null; M.kb = null; try { const db = await plDB(); const tx = db.transaction(['p', 'k', 'id', 'meta'], 'readwrite'); for (const s of ['p', 'k', 'id', 'meta']) tx.objectStore(s).clear(); } catch (_) { } }
// full: every place (for the map); otherwise only what is looked up (reading)
async function loadPlaceIndex(full = false) {
  if (M.P && (M.P.full || !full)) return M.P;
  if (!(await mapHas('places'))) return null;
  if (M.Pp) { await M.Pp; if (M.P && (M.P.full || !full)) return M.P; }
  M.Pp = (async () => {
    let info = await placeIndexInfo();
    const v = (await mapInstalled()).places || '';
    if (!info || info.v !== v) { try { await buildPlaceIndex(); } catch (_) { return null; } info = await placeIndexInfo(); }   // (first use, or after an update)
    const ti = Object.fromEntries(info.T.map((t, i) => [t, i]));
    const ranks = await plGet('meta', 'ranks');
    if (full) {
      const P = (await req2p((await plDB()).transaction('p').objectStore('p').getAll())).flat();
      if (M.P?.P) M.P.P.forEach((p, i) => { if (p) P[i] = p; });             // places already in use stay the same objects
      M.P = { P, byId: new Map(P.map(p => [p.id, p])), T: info.T, ti, src: info.src, hasConn: info.hasConn, full: true, ranks };
      await mapCfg(); await loadDevCounts(); rankPlaces();
    } else M.P = { P: [], byId: new Map(), T: info.T, ti, src: info.src, hasConn: info.hasConn, full: false, ranks };
    for (const r of await getAll('settings', IDBKeyRange.bound('pown|', 'pown|￿'))) M.own.set(r.v.id, r.v);
  })();
  try { await M.Pp; } finally { M.Pp = null; }
  return M.P;
}
// places by number, read from the device when not yet loaded
async function placesLoad(idx) {
  const ix = M.P; if (!ix) return;
  const need = [...new Set(idx)].filter(i => i != null && !ix.P[i]); if (!need.length) return;
  const bs = [...new Set(need.map(i => i / PB | 0))], want = new Set(need);
  for (const a of await plGetMany('p', bs)) for (const p of a || []) if (want.has(p.i)) { p.w = ix.ranks?.[p.i] ?? p.w; ix.P[p.i] = p; ix.byId.set(p.id, p); }   // (the rest of the bundle is let go)
}
async function placesLoadIds(ids) {
  const ix = M.P; if (!ix) return;
  const need = [...new Set(ids)].filter(id => id != null && !(typeof id === 'string' && id.startsWith('o')) && !ix.byId.has(id)); if (!need.length) return;
  const bk = id => (typeof id === 'number' ? id : plHash(String(id))) % IB;
  const bs = [...new Set(need.map(bk))], got = new Map((await plGetMany('id', bs)).map((o, k) => [bs[k], o || {}]));
  await placesLoad(need.map(id => got.get(bk(id))[id]).filter(i => i != null));
}
const placeById = id => typeof id === 'string' && id.startsWith('o') ? M.own.get(id) : M.P?.byId.get(id);
const hasType = (p, t) => p?.ty && M.P && p.ty.includes(M.P.ti[t]);
const isRegion = p => ['region', 'province', 'province-2', 'ethnic-region'].some(t => hasType(p, t));
const isPeople = p => hasType(p, 'people') || hasType(p, 'tribe');
const isWater = p => ['river', 'lake', 'water-open', 'bay', 'strait', 'spring', 'estuary'].some(t => hasType(p, t));
function typeLabel(p) {
  if (!p) return '';
  if (p.own) return 'your own place';
  const order = ['settlement', 'region', 'province', 'river', 'island', 'mountain', 'people', 'cape', 'lake', 'port', 'sanctuary', 'temple', 'fort', 'station'];
  const t = order.find(t => hasType(p, t)) || M.P.T[p.ty[0]] || '';
  return t.replace(/-2$/, '').replace(/-/g, ' ');
}

// ---------------------------------------------------------------- places in a text
// exact name first; the stem (ending and spelling ignored) only for words without an analysis, and only for main places
async function placeCands(name, exactOnly) {
  const ix = M.P; if (!ix || !name) return [];
  const kc = M.kc ??= new Map();
  const look = async k => { if (!kc.has(k)) kc.set(k, await plKey(k)); return kc.get(k); };
  let c = await look('e:' + exKey(name));
  if (!c?.length && !exactOnly) { c = await look('s:' + stemKey(name)); if (c) { await placesLoad(c.slice(0, 80)); c = c.filter(i => ix.P[i]?.main); } }
  c = c ? c.slice(0, 40) : [];
  await placesLoad(c);
  return c;
}
// words around a name that say what it is: "Calycadni fluminis", "urbs …", "ποταμός", "ὄρος" …; or that it is a person
const CUES = {
  settlement: 'urbs oppidum civitas municipium colonia castellum castrum vicus polis polisma asty kome πολισ αστυ κωμη πολισμα πολιχνιον',
  river: 'flumen fluvius amnis fluentum ποταμοσ ρευμα', mountain: 'mons iugum ορος ακρα', island: 'insula νησοσ νησιον',
  region: 'regio provincia terra tractus χωρα γη', people: 'gens populus natio εθνοσ',
};
const CUE = new Map(); for (const [t, ws] of Object.entries(CUES)) for (const w of ws.split(' ')) CUE.set(w, t);
// titles right next to a name: "Galli Caesaris", "Constantio Augusto", "rex Arsaces" – a person
const TITLE_CUES = new Set('caesar augustus augusta imperator rex regina dux comes praefectus tribunus consul proconsul magister βασιλευσ στρατηγοσ'.split(' '));
const plainName = n => isGreek(n) ? n : String(n || '').normalize('NFD').replace(/[\u0304\u0306]/g, '').normalize('NFC');
const PERSON_CUES = new Set('uxor coniunx coniux filia filius soror frater maritus nepos neptis privignus γυνη θυγατηρ υιοσ αδελφοσ αδελφη μητηρ'.split(' '));
// short common words that begin sentences (Latin, Greek in Latin letters do not occur): never names when nothing analysed them
const FUNC_WORDS = new Set('hic haec hoc huc hinc hanc hunc horum harum his ibi ita iam nam namque sed et at ac atque tum tunc cum ubi ut uti ne non quod quia qui quae quis quid quo qua quam quem quos quas eo ea eum eam eos eas id is ii iis in ad ab ex de per post ante inter sub super pro sine nec neque etiam quoque sic tamen enim autem ergo igitur deinde inde unde item interim postea postquam priusquam dum donec quamquam quamvis si nisi sin vel aut sive seu ille illa illud illi ipse ipsa ipsum iste ista nunc tum tandem omnes omnia multi multa pauci alii alius alia aliud ceteri reliqui nemo nihil nulla nullus magna magnus prima primum primo secundo tertio contra circiter circum propter ob prope apud sese se sibi suis suos sua sic hos has hae hi qui eodem eadem idem itaque proinde praeterea interea mox simul semel saepe diu'.split(' ').map(latkey));
// proper nouns of a list of tokens: [{i, name, c:[place indices], cue, person}]
async function findPlaceHits(toks, lemmaOf) {
  const words = []; let start = true;
  for (const tk of toks) {
    if (tk.t === 'b') { start = true; continue; }
    if (tk.t === 'p') { if (/[.!?;·:]/.test(tk.s)) start = true; continue; }
    if (tk.t === 'w') { words.push({ tk, s0: start }); start = false; }
  }
  // the bundles of names this text may need, read at once
  { const c = M.kb ??= new Map(), bs = new Set();
    for (const { tk } of words) if (tk.s[0] !== tk.s[0].toLowerCase()) for (const n of new Set([tk.s, tk.ctx?.l, tk.lemma].filter(Boolean))) { bs.add(plHash('e:' + exKey(n))); bs.add(plHash('s:' + stemKey(n))); }
    const need = [...bs].filter(b => !c.has(b));
    if (need.length) { const rs = plGetMany('k', need); need.forEach((b, k) => c.set(b, rs.then(a => a[k] || {}))); } }
  const keyAt = async k => { const w = words[k]; if (!w) return ''; const l = w.tk.ctx?.l || w.tk.lemma || (lemmaOf && w.tk.s[0] === w.tk.s[0].toLowerCase() ? await lemmaOf(w.tk) : null); return exKey(l || w.tk.s); };
  const out = [];
  for (let n = 0; n < words.length; n++) {
    const { tk, s0 } = words[n];
    const cap = tk.s[0] !== tk.s[0].toLowerCase();
    if (!cap) continue;
    let l = lemmaOf ? await lemmaOf(tk) : tk.lemma;
    if (l && l[0] === l[0].toLowerCase()) continue;            // analysed as an ordinary word (Et, Sed, Καί …)
    if (l && /^(adj|verb|part|inf|adv|pron|conj|prep|ptcl)$/.test(tk.pos || '')) continue;   // adjectives, verbs …: not places
    if (tk.ctx && tk.ctx.t?.[0] === 'a') continue;                                             // Greek treebank: an adjective (Ἀθηναῖος)
    if (l && !isGreek(l) && /\b(masc|fem|neut)\b/.test(tk.ana || '')) continue;               // Latin: an adjective (Romanus, Graecus)
    if (/^[IVXLCDM]+$/.test(tk.s)) continue;                    // Roman numerals
    if (!l && s0 && (FUNC_WORDS.has(latkey(tk.s)) || tk.s.length <= 3)) continue;   // "Hic", "Quae" at the beginning of a sentence (no analysis)
    const name = l || tk.s;
    const c = await placeCands(name, !!l || s0);
    if (!c.length) continue;
    let cue = null, person = false;
    for (const d of [-3, -2, -1, 1, 2, 3]) { const k = await keyAt(n + d); if (!k) continue; if (!cue && CUE.has(k)) cue = CUE.get(k); if (Math.abs(d) <= 2 && PERSON_CUES.has(k)) person = true; if (Math.abs(d) === 1 && TITLE_CUES.has(k) && k !== exKey(name)) person = true; }
    out.push({ i: tk.i, name, c, cue, person, stem: !l && !(await placeCands(name, true)).length });
  }
  M.kb = null;                                                     // (the bundles of names are let go; what was looked up stays)
  return out;
}
// what the dictionaries say a proper name is: a person or a place (only a hint – the reader decides)
async function dictSaysPerson(name) {
  const k = gkey(name), memo = (M.personMemo ??= new Map());
  if (memo.has(k)) return memo.get(k);
  let r = false;
  try {
    const by = await entriesFor(k, isGreek(name) ? 'grc' : 'la');
    // only the beginning of each entry: what the name is, not what is told about it
    const heads = Object.values(by).flat().filter(e => e.html).slice(0, 4).map(e => e.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 110));
    if (!heads.length) { memo.set(k, false); return false; }
    const votes = heads.map(txt => {
    const pers = txt.slice(0, 70).search(/\b(wife of|daughter of|son of|sister of|mother of|brother of|an? (?:Roman )?emperor|empress|a Roman|cognomen|praenomen|surname|name of (?:a|an|several|many) (?:man|men|woman|women|Roman)|Tochter|Gattin|Gemahlin|Gemahl|Sohn|Kaiser|Kaiserin|Beiname|Vorname|Name (?:eines|einer|mehrerer) (?:Römer|Röm\.|Mannes|Männer|Frau))/i);
    const plc = txt.search(/\b(cit(?:y|ies)|towns?|rivers?|mountains?|islands?|country|region|district|people|province|promontory|capital|Städte|Stadt|Hauptstadt|Fluss|Fluß|Gebirge|Berg|Insel|Land|Landschaft|Völkerschaft|Provinz|Egypt)\b/i);
    return pers >= 0 && (plc < 0 || pers < plc) ? 1 : plc >= 0 ? -1 : 0; });
    r = votes.reduce((a, b) => a + b, 0) > 0;                   // most dictionaries call it a person
  } catch (_) { }
  memo.set(k, r); return r;
}
// the year the text is about (Settings of the work, later the time slider) – for now the author's date
async function workYear(t) {
  const o = await setting('wyear|' + workKeyOf(t)); if (o != null) return o;
  if (t.work) { try { await fetchCatalog(); } catch (_) { } const a = S.catAuthor?.[t.work.id]; if (a?.year != null) return a.year; }
  return t.year ?? null;
}
// one place per word: corrections first, then the place that fits best
async function choosePlaces(hits, textId, workKey, year) {
  const P = M.P.P, res = new Map(), cfg = await mapCfg();
  const occ = new Map((await getAll('settings', IDBKeyRange.bound(`pl|${textId}|`, `pl|${textId}|￿`))).map(r => [+r.k.split('|')[2], r.v]));
  const wk = new Map((await getAll('settings', IDBKeyRange.bound(`plw|${workKey}|`, `plw|${workKey}|￿`))).map(r => [r.k.slice(`plw|${workKey}|`.length), r.v]));
  const gl = new Map((await getAll('settings', IDBKeyRange.bound('plg|', 'plg|￿'))).map(r => [r.k.slice(4), r.v]));
  await placesLoadIds([...occ.values(), ...wk.values(), ...gl.values()].map(v => v?.p));     // the corrected places (read from the device)
  // 1. time: places first attested after the text's date are left out (unless nothing else is left)
  // (Pleiades dates by broad periods and not always completely: only clearly later places are left out)
  // natural features and regions are as old as the texts; the dates in the gazetteer are those of its sources
  const natural = new Set(['river', 'mountain', 'mountain-range', 'island', 'archipelago', 'lake', 'water-open', 'strait', 'bay', 'cape', 'peninsula', 'region', 'people', 'plain', 'desert', 'forest', 'spring'].map(t => M.P.ti[t]));
  const inTime = p => year == null || p.y0 == null || (!p.late && p.ty.some(t => natural.has(t))) || p.y0 <= year + (p.late ? 50 : 300);
  for (const h of hits) { const cs = h.c.filter(i => inTime(P[i])); h.c0 = h.c; if (cs.length) h.c = cs; else h.later = true; }
  // 2. the unambiguous places nearby in the text (the nearer in the text, the more), and 3. the text's home region
  const fixed = hits.filter(h => h.c.length === 1 && P[h.c[0]].main && !P[h.c[0]].rough && !h.person).map(h => ({ i: h.i, p: P[h.c[0]] }));
  const dist = (a, b) => Math.hypot(a.lat - b.lat, (a.lon - b.lon) * Math.cos(a.lat * Math.PI / 180));
  const cost = (p, i) => { let c = 0, w = 0; for (const f of fixed) { const g = 1 / (1 + Math.abs(f.i - i) / 80); if (g < 0.02) continue; c += g * Math.min(dist(p, f.p), 8); w += g; } return w ? c / w : null; };
  const home = fixed.length ? (() => { const la = fixed.map(f => f.p.lat).sort((a, b) => a - b), lo = fixed.map(f => f.p.lon).sort((a, b) => a - b); return { lat: la[la.length >> 1], lon: lo[lo.length >> 1] }; })() : null;
  const urban = M.P.ti.urban;
  for (const h of hits) {
    const k = exKey(h.name), fix = occ.get(h.i) || wk.get(k) || gl.get(k);
    if (fix?.none) continue;
    let auto = P[h.c[0]], margin = Infinity;
    const cuet = h.cue ? M.P.ti[h.cue === 'region' ? 'region' : h.cue] : null;
    if (h.c.length > 1) {
      const cs = h.c.map(i => P[i]), mains = cs.filter(p => p.main), pool = mains.length ? mains : cs;
      const d = p => {
        const c = cost(p, h.i);
        const rough = p.rough && p.names.length < 5;                // a vague position counts against small places only
        let v = (c ?? (home ? Math.min(dist(p, home), 8) : 0)) * (rough ? 1.15 : 1) + (rough ? 0.3 : 0);
        if (c != null && home) v += 0.25 * Math.min(dist(p, home), 8);
        v -= 0.8 * Math.log(1 + p.names.length) + (p.ty.includes(urban) ? 1 : 0) + 0.35 * (p.w || 0);   // well-known places first
        if (cuet != null) v += p.ty.includes(cuet) ? -3 : 2;                                // "fluminis" -> the river
        return v;
      };
      const sc = pool.map(p => [p, d(p)]).sort((a, b) => a[1] - b[1]);
      auto = sc[0][0];
      // uncertain only when the next best lies elsewhere (a region and a province of the same name are the same place here)
      const alt = sc.slice(1).find(([q]) => dist(q, auto) > 1.5);
      margin = alt ? alt[1] - sc[0][1] : Infinity;
    } else if (!auto.main && !fix) continue;                    // a lone match among villas, tombs, temples …: rather not
    const p = fix?.p != null ? placeById(fix.p) : auto;
    if (!p) continue;
    // 4. a person? (words around it, the dictionaries) – only marked as uncertain; the reader decides
    const person = !fix && (h.person || await dictSaysPerson(h.name));
    if (person && cfg.persons === 'hide') continue;
    const why = fix ? null : h.later ? 'later' : person ? 'person' : margin < 0.7 ? 'ambiguous' : h.stem ? 'form' : null;
    res.set(h.i, { p, name: h.name, cands: h.c0 || h.c, fixed: !!fix, auto, unsure: why, stem: !!h.stem && !fix });
  }
  // words the reader marked as places themselves
  for (const [i, v] of occ) if (!res.has(i) && v.p != null) { const p = placeById(v.p); if (p) res.set(i, { p, name: v.name || p.t, cands: [], fixed: true }); }
  return res;
}
const textKeyOf = t => t?.id;
const workKeyOf = t => t?.work ? t.work.id : 'imp:' + t?.id;
// the places of the open text (after the lemmas are known)
async function placesForText() {
  const t = S.text; await mapCfg(); if (!t || !(await mapsEnabled())) { M.hits = new Map(); return; }   // (the map switched off: no place recognition)
  if (!(await loadPlaceIndex())) { M.hits = new Map(); markPlaces(); return; }
  const id = t.id, hits = await findPlaceHits(S.tokens);
  if (S.text?.id !== id) return;
  M.year = await workYear(t);
  M.hits = await choosePlaces(hits, textKeyOf(t), workKeyOf(t), M.year);
  storeCounts(t.id, M.hits);
  M.workCache = M.workCache?.key === workKeyOf(t) ? M.workCache : { key: workKeyOf(t), books: {} };
  if (t.work) M.workCache.books[t.bi] = M.hits;
  markPlaces();
  if (S.tab === 'map') refreshMapData();
  if (S.view?.ti != null) mapIconForView();
}
function markPlaces() {
  const on = M.cfg?.mark !== false;
  document.querySelectorAll('#textBody .w.plc').forEach(e => e.classList.remove('plc'));
  if (!on || !S.wordEls) return;
  document.querySelectorAll('#textBody .w.plcq').forEach(e => e.classList.remove('plcq'));
  for (const [i, h] of M.hits) if (!isPeople(h.p) || M.cfg?.peoples) { const e = S.wordEls[i]; e?.classList.add('plc'); if (h.unsure) e?.classList.add('plcq'); }
}
// places of another part of the open work (read from the device, lemmas from the annotation or the analysis)
async function placesOfPart(bi) {
  const t = S.text, w = t.work;
  M.workCache ??= { key: workKeyOf(t), books: {} };
  if (M.workCache.books[bi]) return M.workCache.books[bi];
  const b = await libGet('books', w.id + '|' + bi); if (!b) return new Map();
  const toks = tokenizeBlocks(b.blocks);
  if (b.ann && w.annL) applyAnnotation({ ann: b.ann, work: w, blocks: b.blocks }, toks);
  const memo = M.lemMemo ??= new Map();
  const lemmaOf = async tk => {
    if (tk.ctx) return tk.ctx.l;
    if (!memo.has(tk.s)) { const A = await analyses(tk.s); memo.set(tk.s, A.pick || A.lemmas[0]?.lemma || null); }
    return memo.get(tk.s);
  };
  const hits = await findPlaceHits(toks, lemmaOf);
  const res = await choosePlaces(hits, w.id ? `w:${w.id}:${bi}` : t.id, workKeyOf(t), M.year ?? await workYear(t));
  for (const h of res.values()) h.part = bi;
  M.workCache.books[bi] = res; M.workCache.toks ??= {}; M.workCache.toks[bi] = toks;
  return res;
}

// ---------------------------------------------------------------- what the map shows (section · chapter · book · work)
function chapterKey(s) { const m = s.match(/^(.*)[.,:]\w+$/) || s.match(/^(\d+)[a-e]$/i); return m ? m[1] : null; }
// verse (references are line numbers): a "section" is a block of 20 lines, a "chapter" one of 100 (1–20, 21–40 …)
const isVerse = R => !!R?.length && R.every(r => /^\d+$/.test(r.s));
function verseBlock(R, line, kind) {
  const n = kind === 'chapter' ? 100 : 20, a = Math.floor((line - 1) / n) * n + 1, b = a + n - 1;
  const inside = R.filter(r => +r.s >= a && +r.s <= b);
  return { a, b: Math.min(b, +R[R.length - 1].s), first: inside[0], next: R.find(r => +r.s > b) };
}
function scopeRange(scope) {
  const R = S.refs || [], last = S.tokens.filter(x => x.t === 'w').length - 1;
  if (scope === 'book' || !R.length) return [0, last];
  const cr = curRef(); if (!cr) return [0, last];
  if (isVerse(R)) { const v = verseBlock(R, +cr.s, scope); return [v.first?.i ?? cr.i, (v.next?.i ?? last + 1) - 1]; }
  const k = R.indexOf(cr), end = j => (R[j + 1]?.i ?? last + 1) - 1;
  if (scope === 'section') return [cr.i, end(k)];
  const ck = chapterKey(cr.s);
  if (ck == null) return [cr.i, end(k)];
  let a = k, b = k;
  while (a > 0 && (chapterKey(R[a - 1].s) === ck || R[a - 1].s === ck)) a--;
  while (b < R.length - 1 && chapterKey(R[b + 1].s) === ck) b++;
  return [R[a].i, end(b)];
}
function scopeLabel(scope) {
  const cr = curRef(), w = S.text?.work;
  if (!M.cfg?.pfOn) return 'All places';
  if (scope === 'sel') return 'Selection';
  if (scope === 'author') return S.text ? (S.text.work ? S.text.work.author || 'this author' : S.text.author || 'this author') + ' – all works' : 'this author';
  if (scope === 'work') return w ? w.title : 'whole text';
  if (scope === 'book') return w && w.books.length > 1 ? w.books[S.text.bi] : 'whole text';
  if (!cr) return 'whole text';
  if (isVerse(S.refs)) { const v = verseBlock(S.refs, +cr.s, scope); return `lines ${v.a}–${v.b}`; }
  return scope === 'chapter' ? 'chapter ' + (chapterKey(cr.s) ?? cr.s) : 'section ' + cr.s;
}
// places shown: {place id -> {p, n (passages), label}}
async function scopePlaces() {
  const cfg = await mapCfg(), out = new Map(), t = S.text; if (!cfg.pfOn || (!t && cfg.scope !== 'sel')) return out;     // switched off: no places of texts – every place (layer "sites")
  const add = (h, bi) => {
    if (isPeople(h.p) && !cfg.peoples) return;
    if (h.unsure === 'later' && M.sel?.h !== h) return;              // the time filter: later places only once confirmed
    let x = out.get(h.p.id); if (!x) out.set(h.p.id, x = { p: h.p, n: 0, names: {}, unsure: 0 });
    if (bi != null) (x.src ??= {})[bi] = (x.src[bi] || 0) + 1;
    const nm = h.stem ? cleanT(h.p) : h.name;                // recognised by the stem only: the gazetteer's name, not the inflected word
    x.n++; x.names[nm] = (x.names[nm] || 0) + 1; if (h.unsure) x.unsure++;
  };
  if (['sel', 'author'].includes(cfg.scope)) await multiPlaces(add);   // several texts (mapsaved.js)
  else if (cfg.scope === 'work' && t.work && t.work.books.length > 1) {
    for (let bi = 0; bi < t.work.books.length; bi++) { const hs = bi === t.bi ? M.hits : await placesOfPart(bi); for (const h of hs.values()) add(h, bi); }
  } else {
    const [a, b] = scopeRange(cfg.scope);
    for (const [i, h] of M.hits) if (i >= a && i <= b) add(h, t.bi);
  }
  return out;
}

// ---------------------------------------------------------------- the map
let mapLibP = null;
// the map engine: MapLibre 5 (base/lib5) unless the reader chose the previous one (4.7, base/lib) in the map settings,
// or the base map was downloaded before version 5 came with it
const inCache = async f => !!(await (await caches.open(MAPCACHE)).match(new URL(MAPS + f, location.href).href));
async function engineDir() { return await inCache('base/lib5/maplibre-gl.js') ? 'base/lib5/' : 'base/lib/'; }   // (MapLibre 5 only since v295; 4.7 if an old download lacks it)
const addScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src.split('/').pop() + ' not available')); document.head.append(s); });
function loadMapLib() {
  if (window.maplibregl) return Promise.resolve();
  return mapLibP ??= (async () => {
    const dir = MAPS + (M.engineDir = await engineDir());
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = dir + 'maplibre-gl.css'; document.head.append(l);
    try { await addScript(M.engineDir === 'base/lib5/' ? await shadePatchedLib(dir + 'maplibre-gl.js') : dir + 'maplibre-gl.js'); } catch (e) { mapLibP = null; throw new Error('map engine not available'); }
    // packages in PMTiles format (one file each, read from the device)
    if (await inCache('base/lib/pmtiles.js')) { try { await addScript(MAPS + 'base/lib/pmtiles.js'); pmInit(); } catch (_) { } }
  })();
}
// PMTiles: the file is kept whole in the cache of the map packages; the map engine asks for pieces of it
const pmBlob = u => { const m = (M.pmb ??= new Map()); if (!m.has(u)) m.set(u, caches.open(MAPCACHE).then(c => c.match(u)).then(r => { if (!r) { m.delete(u); throw new Error('package not downloaded'); } return r.blob(); })); return m.get(u); };
class CacheSource {
  constructor(u) { this.u = u; }
  getKey() { return this.u; }
  async getBytes(off, len) { const b = await pmBlob(this.u); return { data: await b.slice(off, off + len).arrayBuffer() }; }
}
function pmInit() {
  if (M.pmProto || !window.pmtiles) return;
  M.pmProto = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', M.pmProto.tile);
}
// the address of a PMTiles package for the map style (null when it is not downloaded or cannot be read)
function pmUrl(f) {
  if (!M.pmProto || !M.pkFiles?.has(f)) return null;
  const u = new URL(MAPS + f, location.href).href;
  if (!M.pmAdded?.has(u)) { M.pmProto.add(new pmtiles.PMTiles(new CacheSource(u))); (M.pmAdded ??= new Set()).add(u); }
  return 'pmtiles://' + u;
}
function mapColors() {
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  const dark = document.documentElement.dataset.theme === 'dark';
  return { sea: dark ? '#1d2a33' : '#cfdde6', land: dark ? '#2e2b25' : '#f2ecdc', coast: dark ? '#5d5547' : '#b9ae92', river: dark ? '#4f84aa' : '#5d93bd', border: dark ? '#77706a' : '#a59c8a', fg: v('--fg'), acc: v('--acc'), bg: v('--bg') };
}
function mapStyle(C) {
  glyphInit(); const st = mapStyle0(C);
  st.glyphs = 'pultglyph://{fontstack}/{range}';                   // (the figures of the contour numbers – maprelief.js)
  st.projection = { type: viewOn('globe') ? 'globe' : 'mercator' };
  st.sky = { 'sky-color': 'rgba(0,0,0,0)', 'horizon-color': 'rgba(0,0,0,0)',   // (above the horizon, Pult's own sky behind the map shows – v354)
    'atmosphere-blend': sunOn() && M.cfg.sunAtm !== false ? ['interpolate', ['linear'], ['zoom'], 0, 0.33, 5, 0.33, 7, 0] : 0 };   // (only with day and night, faint: it hazes the lit half)   // (the globe's halo, fading as one zooms in)
  if (M.cam?.mode === 'fly' && typeof FOG_OFF === 'object') Object.assign(st.sky, FOG_OFF);   // (no white fog while flying – mapcam.js)
  return st;
}
function mapStyle0(C) {
  return layerStyle({
    version: 8, sources: {
      land: { type: 'geojson', data: MAPS + 'base/land.json' }, lakes: { type: 'geojson', data: MAPS + 'base/lakes.json' },
      rivers: { type: 'geojson', data: MAPS + 'base/rivers.json' }, borders: { type: 'geojson', data: MAPS + 'base/borders.json' },
      places: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': C.sea } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': C.land, 'fill-outline-color': C.coast } },
      { id: 'lakes', type: 'fill', source: 'lakes', paint: { 'fill-color': C.sea } },
      { id: 'rivers', type: 'line', source: 'rivers', paint: { 'line-color': C.river, 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.4, 6, 1.2, 9, 2.2] } },
      { id: 'borders', type: 'line', source: 'borders', layout: { visibility: M.cfg?.borders ? 'visible' : 'none' }, paint: { 'line-color': C.border, 'line-width': 0.8, 'line-dasharray': [3, 2] } },
      { id: 'pl-region', type: 'circle', source: 'places', filter: ['==', ['get', 'k'], 'region'], paint: { 'circle-radius': 0 } },
      { id: 'pl', type: 'circle', source: 'places', filter: ['!=', ['get', 'k'], 'region'],
        paint: { 'circle-radius': ['case', ['get', 'sel'], 7, ['+', 3.5, ['min', 3, ['/', ['get', 'n'], 3]]]], 'circle-color': ['case', ['get', 'sel'], C.acc, ['==', ['get', 'k'], 'water'], C.river, C.fg],
          'circle-stroke-color': ['case', ['get', 'sel'], '#ffffff', C.bg], 'circle-stroke-width': ['case', ['get', 'sel'], 2, 1.2], 'circle-opacity': ['case', ['get', 'rough'], 0.55, 1] } },
    ],
  }, C);                                                          // + the layers of maplayers.js
}
// one at a time; any error, or a step that does not finish, is shown with the step it happened in (instead of an empty pane)
function showMap() {
  if (M.showP) return M.showP;
  M.step = 'start';
  const dog = setTimeout(() => { if (M.showP) mapFailed(`Stopped at step “${M.step}”.` + (M.lastErr ? ' Last error: ' + M.lastErr : '')); }, 25000);
  return M.showP = showMap1().catch(e => { console.error(e); mapFailed(`${e?.message || e} (step “${M.step}”)`); }).finally(() => { clearTimeout(dog); M.showP = null; });
}
async function showMap1() {
  const box = $('#mapBody');
  M.step = 'packages';
  if (!(await mapHas('base'))) {                                     // the only package the map cannot do without
    box.innerHTML = `<div class="mapmsg"><p>${EUROPE_ICON}</p><p>The map needs the download <b>Base map</b>.</p><button type="button" data-mapdl="1">Open Instruments → Map</button></div>`;
    return;
  }
  M.step = 'settings'; await mapCfg();
  // the files of the packages that are installed and switched on (an older download may lack newer files: those layers are left out)
  { const c = await caches.open(MAPCACHE), inst = await mapInstalled(), off = await mapOff(), man = M.man || await mapManifest();
    M.files = new Set();
    for (const p of man?.packages || []) if (inst[p.id] && !off[p.id]) for (const f of p.files) if (await c.match(new URL(MAPS + f, location.href).href)) M.files.add(f);
    if (!man) for (const n of ['water', 'empires', 'provinces', 'labels', 'areas', 'roads', 'urban', 'aqueducts', 'walls', 'canals']) if (await c.match(new URL(MAPS + 'ancient/' + n + '.json', location.href).href)) M.files.add(`ancient/${n}.json`); }
  M.ancFiles = new Set([...M.files].filter(f => f.startsWith('ancient/')).map(f => f.slice(8, -5)));
  M.anc = M.ancFiles.size > 0;
  M.pkFiles = new Set([...M.files].filter(f => f.endsWith('.pmtiles')));
  M.step = 'names of regions'; M.ancLab = null; if (M.ancFiles.has('labels')) await loadAncientLabels();
  M.step = 'gazetteer'; await loadPlaceIndex(true);
  M.step = 'drawings'; await loadDrawings(); await dScopeUpdate();
  timeFor(S.text);
  if (!M.map) {
    box.innerHTML = `<div id="mapCanvas"></div><div class="mlabels" id="mapLabels"></div>
      <div class="mtop"><button type="button" class="mscope" id="mapScope"></button><button type="button" class="mcheck" id="mapCheck" hidden></button></div>
      <div class="mctl"><button type="button" class="mico" id="mapSaveBtn" title="Saved maps and export" aria-label="Saved maps and export">${SAVE_ICON}</button><button type="button" class="mico" id="mapDrawBtn" title="Draw on the map" aria-label="Draw on the map">${PEN_ICON}</button><button type="button" class="mico" id="mapTimeBtn" title="Period filter" aria-label="Period filter">${CLOCK_ICON}</button><button type="button" class="mico" id="mapSunBtn" title="Sundial: day and night" aria-label="Sundial">${SUNDIAL_ICON}</button><button type="button" class="mico" id="mapLayersBtn" title="Layers" aria-label="Layers">${LAYERS_ICON}</button><button type="button" class="mico" id="mapCamBtn" title="Camera: free movement, other points of view" aria-label="Camera">${CAM_ICON}</button><button type="button" class="mico" id="mapOptsBtn" title="Globe: projection, 3D, map, elevation" aria-label="Globe">${GLOBE_EU_ICON}</button></div><button type="button" class="mico mnorth" id="mapNorth" title="North up" aria-label="North up">${COMPASS_ICON}</button>
      <div class="mhandles" id="mapHandles"></div>
      <div class="mtime" id="mapTime" hidden>${timeBarHTML()}</div><div class="mdraw" id="mapDraw" hidden></div>
      <div class="minfo" id="mapInfo" hidden><span class="mscale" id="mapScale"><i></i><b></b></span><span class="mzoom" id="mapZoom"></span></div>
      <div class="mcred" id="mapCred" hidden></div><div class="mcard" id="mapCard" hidden></div><div class="mpop" id="mapPop" hidden></div>`;
    M.step = 'map engine'; try { await loadMapLib(); } catch (e) { box.innerHTML = `<div class="mapmsg"><p>${esc(e.message)}</p></div>`; return; }
    M.step = 'imagery'; await imgInit();
    M.step = 'relief'; await reliefInit();
    M.colors = mapColors();
    const v = (await setting('mpos|last')) || { c: [24, 38], z: 4 };
    M.step = 'map'; try {
      M.map = new maplibregl.Map({ container: 'mapCanvas', style: mapStyle(M.colors), center: v.c, zoom: v.z, attributionControl: false, dragRotate: true, pitchWithRotate: true, maxPitch: 85, maxZoom: 16, minZoom: 0 });
      // (a style rebuilt from scratch has no projection until it has loaded; with 3D terrain the engine still drew a frame then and
      // failed: such frames are skipped – v364)
      { const m = M.map, r0 = m._render; if (typeof r0 === 'function') m._render = function (t) { if (this.style && !this.style.projection && this.terrain) { this.triggerRepaint(); return this; } return r0.call(this, t); }; }
    } catch (e) { M.map = null; return mapFailed(e.message || String(e)); }
    // problems are shown instead of an empty map: errors while loading, the graphics memory lost (phones)
    M.map.on('error', e => { M.lastErr = e?.error?.message || String(e?.error || e); console.warn('map:', M.lastErr); });
    M.map.getCanvas().addEventListener('webglcontextlost', () => { if (!M.failing) mapFailed('The graphics memory of the device was needed elsewhere.'); });
    M.map.on('rotate', compassUpd);
    M.map.on('style.load', () => setTimeout(sunApply, 0));         // (a new style: the sun's light again)                                // (turning: two fingers, or the right mouse button)
    // the credits of the map are in ☰ → Acknowledgements (and on exported maps)
    M.map.on('move', () => { if (!M.lblRaf) M.lblRaf = requestAnimationFrame(() => { M.lblRaf = 0; drawLabels(); mapInfo(); }); });
    M.map.on('idle', () => { if (M.cfg.pfOn === false || relOn('relContours')) drawLabels(); });
    M.map.on('zoom', () => { const t = dotMinW(M.map.getZoom()); if (t !== M.dotW) { M.dotW = t; applyLayers(); } });   // zoomed out: fewer, more significant places     // the names of all places need the dots drawn first
    M.map.on('moveend', () => { const c = M.map.getCenter(), z = M.map.getZoom(), v = { c: [+c.lng.toFixed(4), +c.lat.toFixed(4)], z: +z.toFixed(2) }; setting('mpos|last', v); if (M.posKey) setting('mpos|' + M.posKey, v); });
    M.map.on('mouseenter', 'sites', () => { M.map.getCanvas().style.cursor = 'pointer'; });
    M.map.on('mouseleave', 'sites', () => { M.map.getCanvas().style.cursor = ''; });
    M.map.on('click', e => { if (M.obNoClick > Date.now()) return;      // (the end of dragging the obelisk is no click)
      if (M.pick) { const p = M.pick; M.pick = null; $('#mapCanvas').classList.remove('picking'); p(e.lngLat); return; }
      { const pop = $('#mapPop'); if (!pop.hidden && ['layers', 'save'].includes(pop.dataset.k)) { pop.hidden = true; return; } }   // a tap (not a drag or pinch) closes these menus
      if (drawClick(e)) return;                                   // drawing (mapdraw.js)
      if ($('#mapChoose') && !$('#mapChoose').hidden) { $('#mapChoose').hidden = true; return; }
      const id = tapPlace(e.point); if (id === 'choose') return; if (id != null) return selectPlace(id, { from: 'map' });
      const did = tapDrawing(e.point); if (did) return showDrawCard(did);
      if (roadTap(e.point) || waterTap(e.point)) return;                                // a Roman road (Itiner-e): what is known of it
      closeCard(); });
    M.map.on('movestart', () => { const c = $('#mapChoose'); if (c) c.hidden = true; });
    M.map.on('mouseenter', 'pl', () => { M.map.getCanvas().style.cursor = 'pointer'; });
    M.map.on('mouseleave', 'pl', () => { M.map.getCanvas().style.cursor = ''; });
    M.step = 'loading the map'; const ok = await Promise.race([new Promise(r => M.map.once('load', () => r(true))), new Promise(r => setTimeout(() => r(false), 20000))]);
    // (slow tiles – e.g. the relief over a weak connection – are no failure: the map goes on once its style stands)
    if (!ok && !M.map.style?._loaded) return mapFailed('The map did not finish loading.' + (M.lastErr ? ' Last error: ' + M.lastErr : ''));
    imgCredit(); compassUpd(); sunClock(); obelUpd(); sunMoveHook(); camInit();
    wireMapUI(); wireTime(); wireDraw(); mapInfo();
  } else M.map.resize();
  M.step = 'places'; renderTime();
  await refreshMapData();
  M.step = 'done';
}
// the map could not start: say why, and offer to try again
function mapFailed(msg) {
  M.failing = true; try { M.map?.remove(); } catch (_) { } M.failing = false;    // (removing the map loses its graphics context: not a new failure)
  M.map = null; M.showP = null;
  $('#mapBody').innerHTML = `<div class="mapmsg"><p>${EUROPE_ICON}</p><p>The map could not be shown.</p><p class="hint small">${esc(msg)}</p><button type="button" id="mapRetry">Try again</button> <button type="button" id="mapResetCfg">Reset the map settings</button>${M.engineDir === 'base/lib5/' ? ' <button type="button" id="mapEngine4">Use the previous map engine</button>' : ''}</div>`;
  if ($('#mapEngine4')) $('#mapEngine4').onclick = async () => { await setting('mapEngine', '4'); location.reload(); };
  $('#mapRetry').onclick = () => showMap();
  // the settings that were in place are kept (mapCfgOld), so that the cause can be found later
  $('#mapResetCfg').onclick = async () => { const old = await setting('mapCfg'); if (old) await setting('mapCfgOld', { at: new Date().toISOString(), msg, cfg: old }); await del('settings', 'mapCfg'); M.cfg = null; M.T = null; M.sitesFC = null; showMap(); };
}
const LAYERS_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 3 8l9 5 9-5-9-5zM3 12.5l9 5 9-5M3 16.5l9 5 9-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
// the gazetteer's title as a name: "Rhenus (river)" -> "Rhenus", "Lucus?" -> "Lucus"
const cleanT = p => (p.t.split('/')[0].replace(/\s*\([^)]*\)|[?]/g, '').trim() || p.t);
function labelOf(x) {
  const p = x.p, how = M.cfg.names;
  if (how === 'english' || p.own) return p.own ? p.t : cleanT(p);
  if (how === 'modern') { const m = p.names?.find(n => !['grc', 'la', 'r', ''].includes(n[1]) && /^[A-Za-zÀ-ɏ\s'’-]+$/.test(n[0])); return m ? m[0] : cleanT(p); }
  const names = Object.entries(x.names || {}).sort((a, b) => b[1] - a[1]);         // as the text names it (its lemma)
  const n = names[0]?.[0] || cleanT(p);
  return isGreek(n) ? n : n.normalize('NFD').replace(/[\u0304\u0306]/g, '').normalize('NFC');   // Latin: without vowel lengths
}
async function refreshMapData() {
  if (!M.map || !M.map.getSource('places')) return;
  const sp = M.shown = await scopePlaces(), sel = M.sel?.p?.id;
  if (M.sel && !sp.has(sel)) sp.set(sel, { p: M.sel.p, n: 0, names: { [M.sel.name || M.sel.p.t]: 1 }, extra: true });
  const feats = [...sp.values()].map(x => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x.p.lon, x.p.lat] },
    properties: { id: x.p.id, n: x.n, sel: x.p.id === sel, rough: !!x.p.rough || x.unsure === x.n, k: isRegion(x.p) ? 'region' : isWater(x.p) ? 'water' : 'place' } }));
  M.map.getSource('places').setData({ type: 'FeatureCollection', features: feats });
  $('#mapScope').innerHTML = !M.cfg.pfOn ? 'All places ▾' : `${esc(scopeLabel(M.cfg.scope))} <small>· ${sp.size - (M.sel && sp.get(sel)?.extra ? 1 : 0)} place${sp.size === 1 ? '' : 's'}</small> ▾`;
  const nq = [...M.hits.values()].filter(h => h.unsure).length, ck = $('#mapCheck');
  ck.hidden = !nq; ck.innerHTML = `⚑ ${nq} to check`;
  if (M.T?.work !== (S.text ? workKeyOf(S.text) : null)) { timeFor(S.text); renderTime(); }
  await dScopeUpdate();                                             // drawings linked to passages
  applyLayers();                                                    // (draws the labels)
}
// a tap on the map: the nearest place (circle or name) within reach of a finger tip
// (the names do not take touches themselves, so that pinching and panning work everywhere)
function tapPlace(pt) {
  const r = matchMedia('(pointer: coarse)').matches ? 22 : 10;
  const fs = M.map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]], { layers: ['pl', ...(M.map.getLayer('sites') ? ['sites'] : []), ...(M.map.getLayer('own') ? ['own'] : [])] });
  const seen = new Map();
  for (const f of fs) {
    const id = f.properties.id; if (seen.has(id)) continue;
    const p = placeById(id); if (!p) continue;
    const c = mapPt([p.lon, p.lat]), d = Math.hypot(c.x - pt.x, c.y - pt.y); if (d > r * 1.2) continue;
    // nearness, with the significance of the place (and places of the text) counting as if nearer
    const z = M.map.getZoom(), bonus = Math.max(0, Math.min(1, (10 - z) / 4));   // zoomed in, nearness alone decides
    seen.set(id, { id, p, d, eff: d - bonus * 2.4 * (p.w || 0) - (f.layer.id === 'pl' ? 8 : 0) });
  }
  const c = [...seen.values()].sort((a, b) => a.eff - b.eff);
  if (!c.length) {
    const pad = r / 2;          // (near a name, but not on it)
    for (const [b, id] of M.lblHit || []) if (pt.x >= b[0] - pad && pt.x <= b[2] + pad && pt.y >= b[1] - pad && pt.y <= b[3] + pad) return id;
    return null;
  }
  // a tap right on a name: that place (a name lies over the dots it covers)
  for (const [b, id] of M.lblHit || []) if (pt.x >= b[0] && pt.x <= b[2] && pt.y >= b[1] && pt.y <= b[3]) return id;
  const direct = c.filter(x => x.d <= 5).sort((a, b) => a.d - b.d);
  if (direct.length === 1) return direct[0].id;                      // right on a dot
  if (direct.length > 1) { chooserAt(pt, direct.slice(0, 8)); return 'choose'; }   // several on the same spot
  if (c.length === 1 || c[1].eff - c[0].eff > 12) return c[0].id;   // a clear choice
  chooserAt(pt, c.slice(0, 8)); return 'choose';
}
// several places within reach of the finger: a short list right there, the most significant first
function chooserAt(pt, list) {
  const box = $('#mapChoose') || (() => { const e = document.createElement('div'); e.id = 'mapChoose'; e.className = 'mchoose'; $('#mapBody').append(e); return e; })();
  list.sort((a, b) => (b.p.w || 0) - (a.p.w || 0) || a.d - b.d);
  box.innerHTML = list.map(x => `<button type="button" data-mchoose="${esc(String(x.id))}"><b style="font-size:${(13 + 0.25 * (x.p.w || 0)).toFixed(1)}px">${esc(labelOf(M.shown?.get(x.id) || { p: x.p, names: {} }))}</b><small>${esc(typeLabel(x.p))}</small></button>`).join('');
  const W = $('#mapBody').clientWidth, H = $('#mapBody').clientHeight;
  box.hidden = false;
  const bw = box.offsetWidth, bh = box.offsetHeight;
  box.style.left = Math.max(8, Math.min(W - bw - 8, pt.x - bw / 2)) + 'px';
  box.style.top = (pt.y + 18 + bh < H - 8 ? pt.y + 18 : Math.max(8, pt.y - bh - 18)) + 'px';
}
// labels: drawn as text above the map (Greek and Latin in the reading font), without overlaps, most important first
function drawLabels() {
  const box = $('#mapLabels'); if (!box || !M.map || !M.shown) return;
  const W = box.clientWidth, H = box.clientHeight, placed = [], sel = M.sel?.p?.id;
  M.lblHit = [];
  const items = [...M.shown.values()].map(x => ({ x, pt: mapPt([x.p.lon, x.p.lat]), pri: (x.p.id === sel ? 1e6 : 0) + (isRegion(x.p) ? 50 : 0) + x.n }))
    .filter(o => o.pt.x > -60 && o.pt.x < W + 60 && o.pt.y > -20 && o.pt.y < H + 20).sort((a, b) => b.pri - a.pri).slice(0, 220);
  let h = '';
  const ctx = (drawLabels.c ??= document.createElement('canvas').getContext('2d'));
  for (const o of items) {
    if (M.cfg.nmPlaces === false && o.x.p.id !== sel) continue;     // names of places switched off (Layers → Names on the map)
    const reg = isRegion(o.x.p), txt = labelOf(o.x), fs = reg ? 11 : +(12 + 0.3 * (o.x.p.w || 0)).toFixed(1);
    ctx.font = `${reg ? 600 : 400} ${fs}px "Gentium Book Plus", serif`;
    const w = ctx.measureText(reg ? txt.toUpperCase() : txt).width * (reg ? 1.35 : 1) + 4, hgt = fs + 4;
    const x = reg ? o.pt.x - w / 2 : o.pt.x + 7, y = reg ? o.pt.y - hgt / 2 : o.pt.y - hgt + 2;
    const r = [x, y, x + w, y + hgt];
    if (o.x.p.id !== sel && placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) continue;
    placed.push(r); M.lblHit.push([r, o.x.p.id]);
    h += `<span class="mlbl${reg ? ' reg' : ''}${o.x.unsure && o.x.unsure === o.x.n ? ' unsure' : ''}${isWater(o.x.p) ? ' wat' : ''}${o.x.p.id === sel ? ' sel' : ''}${o.x.extra ? ' extra' : ''}" data-pid="${esc(String(o.x.p.id))}" style="left:${Math.round(x)}px;top:${Math.round(y)}px${reg ? '' : `;font-size:${fs}px`}">${esc(txt)}</span>`;
  }
  box.innerHTML = h + drawLabelsOwn(placed, W, H) + moreLabels(placed, W, H);
}

// ---------------------------------------------------------------- choosing a place: from the text, the entry or the map
// opened from a word of the text: that word's place
async function mapForWord(i, how = {}) {
  const h = M.hits.get(i); if (!h) return false;
  M.sel = { p: h.p, i, name: h.name, h };
  await selectPlace(h.p.id, { from: 'word', i, ...how });
  return true;
}
async function selectPlace(id, o = {}) {
  if (typeof id === 'string' && /^\d+$/.test(id)) id = +id;
  const x = M.shown?.get(id), p = x?.p || placeById(id); if (!p) return;
  if (o.from !== 'word') M.sel = { p, name: x ? labelOf(x) : p.t };
  M.posKey = o.from === 'word' && S.text ? `w|${S.text.id}|${o.i}` : 'p|' + p.id;
  await refreshMapData();
  const saved = o.from === 'word' ? await setting('mpos|' + M.posKey) : null;
  if (saved) M.map.jumpTo({ center: saved.c, zoom: saved.z });
  else if (M.cfg.jump && o.from !== 'map') M.map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(M.map.getZoom(), isRegion(p) ? 5.5 : 7), duration: 600 });
  showCard(p);
}
function closeCard() { $('#mapCard').hidden = true; if (M.dSel) { M.dSel = null; applyLayers(); dHandles(); } if (M.sel) { M.sel = null; refreshMapData(); } }
// the card of a place: its name, what it is, the passages that name it
async function showCard(p) {
  if (p.own && M.sel?.i == null) return showDrawCard(p.id);       // your own place: its card with the drawing tools
  const card = $('#mapCard'), t = S.text, w = t?.work;
  const occ = []; for (const [i, h] of M.hits) if (h.p.id === p.id) occ.push({ bi: t?.bi, i });
  const refOf = (refs, i) => { let r = null; for (const x of refs || []) { if (x.i <= i) r = x; else break; } return r?.s || ''; };
  const words = S.tokens.filter(x => x.t === 'w');
  const ctx = i => { const k = words.findIndex(x => x.i === i); return words.slice(Math.max(0, k - 5), k + 6).map(x => x.i === i ? `<u>${esc(x.s)}</u>` : esc(x.s)).join(' '); };
  const multi = w && w.books.length > 1, short = multi ? stripCommon(w.books) : [];
  const cur = M.sel?.i;
  const nm = M.sel?.name || p.t; 
  card.innerHTML = `<div class="mch"><b>${esc(isGreek(nm) ? nm : nm.normalize('NFD').replace(/[\u0304\u0306]/g, '').normalize('NFC'))}</b>${cur != null ? '<button type="button" class="chip" data-mchange="1">change</button>' : ''}<button type="button" class="mx" data-mclose="1" aria-label="Close">✕</button></div>
    <div class="mcs">${esc(p.t)} · ${esc(typeLabel(p))}${p.rough ? ' · position approximate' : ''}</div>
    ${M.sel?.h?.unsure ? `<div class="munsure">⚑ ${UNSURE[M.sel.h.unsure]} <button type="button" data-mok="1">Yes, this place</button></div>` : ''}
    <div id="mapAlso"></div>
    <div class="mpass">${occ.length ? occ.map(o => `<button type="button" class="mps" data-mgo="${o.i}"><b>${multi ? esc(short[o.bi]) + ' · ' : ''}${esc(refOf(S.refs, o.i))}</b><span>${ctx(o.i)}</span></button>`).join('')
      : '<p class="hint small">Not named in this part of the text.</p>'}</div>
    <div class="macts">${w && multi && !['sel', 'author'].includes(M.cfg.scope) ? '<button type="button" data-mwork="1">All passages in this work</button>' : ''}${cur != null ? '<button type="button" data-mnone="1">Not a place here</button>' : ''}</div>
    <div id="mapChange" hidden></div>`;
  card.hidden = false;
  card.scrollTop = 0;
  if (M.cfg.pfOn && ['sel', 'author'].includes(M.cfg.scope)) cardMulti(p);
  heightAt(p.lon, p.lat).then(h => { const s = card.querySelector('.mcs'); if (h != null && s && M.sel?.p === p) s.insertAdjacentText('beforeend', ` · ${fmtEle(h)}`); });   // its height (relief)
}
const UNSURE = { later: 'Known only from after the text’s time – not on the map', person: 'Possibly a person, not a place', ambiguous: 'Several places have this name', form: 'Recognised only from the form of the word' };
// all passages of the work that name this place
async function cardWork(p) {
  const t = S.text, w = t.work, short = stripCommon(w.books), list = $('#mapCard .mpass');
  list.innerHTML = '<p class="hint small">Searching the whole work …</p>';
  let h = '';
  for (let bi = 0; bi < w.books.length; bi++) {
    const hs = bi === t.bi ? M.hits : await placesOfPart(bi);
    const toks = bi === t.bi ? S.tokens : M.workCache.toks?.[bi]; if (!toks) continue;
    const refs = bi === t.bi ? S.refs : refsOf(toks, null), words = toks.filter(x => x.t === 'w');
    for (const [i, x] of hs) {
      if (x.p.id !== p.id) continue;
      let r = ''; for (const y of refs) { if (y.i <= i) r = y.s; else break; }
      const k = words.findIndex(z => z.i === i), c = words.slice(Math.max(0, k - 5), k + 6).map(z => z.i === i ? `<u>${esc(z.s)}</u>` : esc(z.s)).join(' ');
      h += `<button type="button" class="mps" data-mgo="${i}" data-mpart="${bi}"><b>${esc(short[bi])} · ${esc(r)}</b><span>${c}</span></button>`;
    }
  }
  list.innerHTML = h || '<p class="hint small">No other passages.</p>';
}
// change: another place of the same name, a place from the gazetteer, a place of your own, or none
function changeHTML() {
  const s = M.sel, P = M.P.P, cands = (s.h?.cands || []).map(i => P[i]).filter(p => p.id !== s.p.id);
  const near = p => { const a = s.h?.auto || s.p; const d = Math.round(Math.hypot(p.lat - a.lat, (p.lon - a.lon) * Math.cos(a.lat * Math.PI / 180)) * 111000 / unit().big); return d ? `${d.toLocaleString('en')} ${unit().bs} away` : ''; };
  return `<div class="mchg"><div class="navh">Apply to</div><div class="seg" role="group">${[['occ', 'This passage'], ['work', 'This work'], ['all', 'Everywhere']].map(([v, l]) => `<button type="button" data-mscope="${v}" class="${(M.chScope || 'occ') === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${cands.length ? `<div class="navh">Other places of this name</div>${cands.slice(0, 12).map(p => `<button type="button" class="mcand" data-mset="${p.id}"><b>${esc(p.t)}</b> <small>${esc(typeLabel(p))} · ${near(p)}</small></button>`).join('')}` : ''}
    <div class="navh">Search the gazetteer</div><div class="navgo"><input type="search" id="mapSearch" class="nofocus" placeholder="Name of a place" autocomplete="off" spellcheck="false"></div><div id="mapSearchRes"></div>
    <div class="macts"><button type="button" data-mpick="1">Pick on the map …</button>${s.h?.fixed ? '<button type="button" data-mreset="1">Back to the automatic choice</button>' : ''}</div></div>`;
}
function searchPlaces(q) {
  const k = stemKey(q), e = exKey(q), out = [];
  if (!k && !e) return out;
  if (!M.P?.full) { loadPlaceIndex(true).then(() => $('#mapSearch')?.dispatchEvent(new Event('input', { bubbles: true }))); return out; }   // (the whole gazetteer first)
  for (const p of M.P.P) {
    if (out.length > 30) break;
    if (exKey(p.t).startsWith(e) || p.names.some(n => exKey(n[0]).startsWith(e)) || (k && stemKey(p.t.split('/')[0]) === k)) out.push(p);
  }
  return out;
}
async function saveCorrection(v, quiet) {
  const s = M.sel, t = S.text, k = exKey(s.name), sc = M.chScope || 'occ';
  const key = sc === 'occ' ? `pl|${t.id}|${s.i}` : sc === 'work' ? `plw|${workKeyOf(t)}|${k}` : `plg|${k}`;
  if (v == null) { await del('settings', key); if (sc !== 'occ') await del('settings', `pl|${t.id}|${s.i}`); }
  else await setting(key, Object.assign({ name: s.name }, v));
  M.workCache = null; M.anyCache = null;
  await placesForText();
  if (quiet) { await refreshMapData(); return; }
  const h = M.hits.get(s.i);
  if (h) { M.sel = { p: h.p, i: s.i, name: h.name, h }; await refreshMapData(); showCard(h.p); M.map.easeTo({ center: [h.p.lon, h.p.lat], duration: 500 }); }
  else { closeCard(); note('No longer marked as a place.'); }
  // learn from the correction: the same for the other passages of this name?
  if (v && sc === 'occ') {
    const k = exKey(s.name), others = [...M.hits].filter(([i, x]) => i !== s.i && exKey(x.name) === k && (v.none || x.p.id !== v.p)).length;
    const box = $('#mapAlso');
    if (others && box) box.innerHTML = `<div class="munsure">Also for the other ${others} passage${others === 1 ? '' : 's'} of ${esc(plainName(s.name))}? <button type="button" data-malso='${JSON.stringify(v)}' data-mwhere="book">In this part</button><button type="button" data-malso='${JSON.stringify(v)}' data-mwhere="work">In the whole work</button></div>`;
    else if (others && !h) note(`${others} other passage${others === 1 ? '' : 's'} of ${plainName(s.name)} – change them on the map.`);
  }
}
function wireMapUI() {
  const box = $('#mapBody');
  if (box._wired) return; box._wired = true;            // once: the map is rebuilt inside the same pane (packages changed, theme …)
  box.addEventListener('click', async ev => {
    const b = ev.target.closest('button,.mlbl'); if (!b) return;
    const d = b.dataset;
    if (b.classList.contains('mlbl')) return selectPlace(d.pid, { from: 'map' });
    if (d.mchoose) { $('#mapChoose').hidden = true; return selectPlace(/^\d+$/.test(d.mchoose) ? +d.mchoose : d.mchoose, { from: 'map' }); }
    if (d.mclose) return closeCard();
    if (b.id === 'mapCheck') return checkPop();
    if (d.mok) { M.chScope = 'occ'; return saveCorrection({ p: M.sel.p.id }); }
    if (d.mck != null) { const i = +d.mck, h = M.hits.get(i); $('#mapPop').hidden = true; M.sel = { p: h.p, i, name: h.name, h }; return selectPlace(h.p.id, { from: 'word', i }); }
    if (d.mckok != null) { const i = +d.mckok, h = M.hits.get(i); M.sel = { p: h.p, i, name: h.name, h }; M.chScope = 'occ'; await saveCorrection({ p: h.p.id }, true); return checkPop(true); }
    if (d.mckno != null) { const i = +d.mckno, h = M.hits.get(i); M.sel = { p: h.p, i, name: h.name, h }; M.chScope = 'occ'; await saveCorrection({ none: 1 }, true); return checkPop(true); }
    if (d.malso) {                     // the same correction for the other passages of this name
      const s0 = M.sel, v = JSON.parse(d.malso), t = S.text;
      if (b.dataset.mwhere === 'work') await setting(`plw|${workKeyOf(t)}|${exKey(s0.name)}`, Object.assign({ name: s0.name }, v));
      else for (const [i, h] of M.hits) if (i !== s0.i && exKey(h.name) === exKey(s0.name)) await setting(`pl|${t.id}|${i}`, Object.assign({ name: h.name }, v));
      $('#mapAlso').innerHTML = ''; M.workCache = null; M.anyCache = null; await placesForText(); await refreshMapData(); note('Applied.'); return;
    }
    if (await camClick(b) || await mapOptsClick(b) || await reliefSaveClick(b) || await drawUIClick(b) || await layerClick(b) || await savedClick(b)) return;
    if (b.id === 'mapScope') return scopePop();
    if (b.id === 'mapLayersBtn') return layersPop();
    if (b.id === 'mapSaveBtn') return savePop();
    if (b.id === 'mapGlobeBtn' || b.id === 'map3dBtn') return viewToggle(b.id === 'mapGlobeBtn' ? 'globe' : 't3d');
    if (d.mscopev) {                    // the menu stays open; "Selection" with nothing chosen opens its editor
      M.cfg.scope = d.mscopev; M.cfg.pfOn = true; await saveMapCfg();
      if (d.mscopev === 'sel' && !(M.cfg.sel || []).length) { selPop(); return; }
      await refreshMapData(); return scopePop(true);
    }
    if (d.mpopx) { $('#mapPop').hidden = true; return; }
    if (d.mgo != null) return mapGo(d.mpart != null ? +d.mpart : null, +d.mgo);
    if (d.mwork) return cardWork(M.sel.p);
    if (d.mnone) { M.chScope = M.chScope || 'occ'; return saveCorrection({ none: 1 }); }
    if (d.mchange) { const c = $('#mapChange'); c.hidden = !c.hidden; if (!c.hidden) c.innerHTML = changeHTML(); return; }
    if (d.mscope) { M.chScope = d.mscope; b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); return; }
    if (d.mset) return saveCorrection({ p: /^\d+$/.test(d.mset) ? +d.mset : d.mset });
    if (d.mreset) return saveCorrection(null);
    if (d.mpick) {
      toast('Tap the map where the place lies.'); $('#mapCanvas').classList.add('picking');
      M.pick = async ll => {
        const r = await dialog(`<h3>New place</h3><label>Name<input type="text" name="n" value="${esc(M.sel?.name || '')}" autocomplete="off"></label>`, [['cancel', 'Cancel'], ['ok', 'Save']], 'ok');
        if (r.action !== 'ok' || !r.data.n?.trim()) return;
        const own = { id: 'o' + Date.now().toString(36), t: r.data.n.trim(), lat: +ll.lat.toFixed(4), lon: +ll.lng.toFixed(4), own: 1, ty: [], names: [], set: M.cfg.dSet || 'd0', created: Date.now() };
        M.own.set(own.id, own); await setting('pown|' + own.id, own);
        if (M.sel?.i != null) await saveCorrection({ p: own.id });
      };
      return;
    }
    if (d.mapdl) { openAt('inst', 'maps'); return dictsDialog(); }
  });
  box.addEventListener('input', ev => {
    if (ev.target.id !== 'mapSearch') return;
    clearTimeout(M.sT); M.sT = setTimeout(() => {
      const r = searchPlaces(ev.target.value.trim());
      $('#mapSearchRes').innerHTML = r.map(p => `<button type="button" class="mcand" data-mset="${p.id}"><b>${esc(p.t)}</b> <small>${esc(typeLabel(p))}</small></button>`).join('') || (ev.target.value.trim() ? '<p class="hint small">Nothing found.</p>' : '');
    }, 200);
  });
}
// places to check: everything uncertain in this part of the text, each confirmed or changed with one tap
function checkPop(keep) {
  const pop = $('#mapPop'); if (!keep && !pop.hidden && pop.dataset.k === 'check') { pop.hidden = true; return; }
  pop.dataset.k = 'check'; pop.classList.remove('mlayers', 'right');
  const list = [...M.hits].filter(([, h]) => h.unsure);
  const refOf = i => { let r = ''; for (const x of S.refs || []) { if (x.i <= i) r = x.s; else break; } return r; };
  pop.innerHTML = `<div class="navh">Places to check <small>· ${list.length}</small></div>` + (list.length ? `<div class="mcklist">${list.map(([i, h]) => `<div class="mck"><button type="button" class="mckt" data-mck="${i}"><b>${esc(refOf(i))}</b> ${esc(h.name.normalize('NFD').replace(/[\u0304\u0306]/g, '').normalize('NFC'))} → ${esc(h.p.t.split('/')[0])}<small>${esc(UNSURE[h.unsure])}</small></button><button type="button" class="mico2" data-mckok="${i}" title="Yes, this place">✓</button><button type="button" class="mico2" data-mckno="${i}" title="Not a place">✕</button></div>`).join('')}</div>` : '<p class="hint small">Nothing left to check.</p>');
  pop.hidden = false;
}
async function mapGo(bi, i) {
  if (parseFloat(getSplit()) <= 0.5) { setSplit(M.splitBefore || '50%'); setTimeout(() => M.map?.resize(), 50); }
  if (navNarrowPhone()) { M.back = true; toggleMapTab(false); }        // phone: the text, the map waits behind the map button
  await goPlace(bi, null, i);
}
const navNarrowPhone = () => matchMedia('(max-width:600px)').matches;

// ---------------------------------------------------------------- the Map tab (button with the outline of Europe)
function toggleMapTab(on = S.tab !== 'map') {
  if (on) { S.tabBefore = S.tab === 'list' ? 'list' : 'entry'; showTab('map'); showMap(); }
  else { const b = S.tabBefore || 'entry'; (b === 'list' ? $('#tabList') : $('#tabEntry')).click(); }
}
// the entry of a word that is a place: a small map button next to the word
function mapIconForView() {
  const v = S.view, f = $('#dictBody .vtop .form'); if (!f) return;
  f.parentElement.querySelectorAll('.mapico').forEach(e => e.remove());
  if (v?.ti == null || !M.hits.has(v.ti)) return;
  f.insertAdjacentHTML('beforeend', `<button type="button" class="mapico" data-mapword="${v.ti}" title="Show on the map" aria-label="Show on the map">${EUROPE_ICON}</button>`);
}
document.addEventListener('click', async ev => {
  const b = ev.target.closest?.('[data-mapword]'); if (!b) return;
  toggleMapTab(true); await showMap(); mapForWord(+b.dataset.mapword);
});
// a word tapped while the map is open: its place is shown (the dictionary entry is prepared behind the map)
async function mapWordTapped(i) {
  if (S.tab !== 'map' || !M.map) return;
  if (M.hits.has(i)) return mapForWord(i);
  const tk = S.tokens.find(x => x.t === 'w' && x.i === i);
  M.sel = { p: null, i, name: tk?.lemma || tk?.s };
  const card = $('#mapCard');
  card.innerHTML = `<div class="mch"><b>${esc(tk?.s || '')}</b><button type="button" class="mx" data-mclose="1" aria-label="Close">✕</button></div><div class="mcs">not marked as a place</div>
    <div class="macts"><button type="button" data-mmark="1">Mark as a place …</button></div><div id="mapChange" hidden></div>`;
  card.hidden = false;
  card.querySelector('[data-mmark]').onclick = () => { const c = $('#mapChange'); c.hidden = false; M.sel.h = { cands: [] }; M.sel.p = { id: null, lat: M.map.getCenter().lat, lon: M.map.getCenter().lng }; c.innerHTML = changeHTML(); };
}
// Settings → Map → Display: a reference distance (a scale bar) and the zoom level, top right below the buttons
function mapInfo() {
  const box = $('#mapInfo'); if (!box || !M.map) return;
  const sc = !!M.cfg?.scale, zm = !!M.cfg?.zoomShow; box.hidden = !sc && !zm;
  if (box.hidden) return;
  const z = M.map.getZoom(), lat = M.map.getCenter().lat;
  $('#mapZoom').hidden = !zm; $('#mapZoom').textContent = 'Zoom ' + z.toFixed(1);
  $('#mapScale').hidden = !sc;
  if (sc) {
    const mpp = 40075016.686 * Math.cos(lat * Math.PI / 180) / (512 * 2 ** z), max = mpp * 110, u = unit();   // metres per pixel; at most 110 px
    const big = max / u.big >= 1, per = big ? u.big : u.small, m = max / per;                                // in the large unit, else the small one
    const p = 10 ** Math.floor(Math.log10(m)), d = [5, 2, 1].map(k => k * p).find(v => v <= m) || p;
    $('#mapScale i').style.width = (d * per / mpp).toFixed(1) + 'px';
    $('#mapScale b').textContent = d.toLocaleString('en') + ' ' + (big ? u.bs : u.sl);
  }
}
// ---------------------------------------------------------------- units (Settings → Map → Display → Units): distances and heights
const UNITS = {
  metric:   { big: 1000, bl: 'km', bs: 'km', small: 1, sl: 'm', area: 'km²' },
  imperial: { big: 1609.344, bl: 'miles', bs: 'mi', small: 0.3048, sl: 'ft', area: 'sq mi' },
  roman:    { big: 1479, bl: 'Roman miles', bs: 'R. mi', small: 0.2958, sl: 'Roman ft', area: 'sq. Roman miles' },   // mille passus = 5,000 pedes
  greek:    { big: 185, bl: 'stades', bs: 'stades', small: 0.3083, sl: 'Greek ft', area: 'sq. stades' },              // Attic stadion = 600 podes
};
const unit = () => UNITS[M.cfg?.units] || UNITS.metric;
const fmtEle = m => `${Math.round(m / unit().small).toLocaleString('en')} ${unit().sl}`;
document.addEventListener('change', async ev => {
  const k = ev.target.dataset?.mapset; if (!k) return;
  await mapCfg(); M.cfg[k] = ev.target.checked; await saveMapCfg();
  if (k === 'scale' || k === 'zoomShow') mapInfo();
  if (k === 'mark') { markPlaces(); if (M.map) await refreshMapData(); }
  if (k === 'time') { timeFor(S.text); renderTime(); applyLayers(); }
});
document.addEventListener('DOMContentLoaded', () => {
  const b = $('#tabMap'); if (!b) return;
  b.innerHTML = EUROPE_ICON;
  b.addEventListener('click', () => { if (S.mapHeld) { S.mapHeld = false; return; } toggleMapTab(); });
  holdButton(b, v => S.mapHeld = v, () => settingsDialog('map'));   // hold: Settings → Map
});

// ---------------------------------------------------------------- the view: a globe or the flat map (Mercator), and 3D terrain (v295)
// Both on by default; switched in the Globe menu (M.cfg.globe, M.cfg.t3d). 3D: the elevation raises the ground. The map can
// always be tilted (two fingers up or down; with a mouse, the right button), with or without 3D; switching changes no view.
const viewOn = k => M.cfg?.[k] !== false;
const T3D = () => ({ source: 'terrdem', exaggeration: M.cfg?.exag || 1.5 });   // (the height exaggeration: the reader's choice, 1 … 3)
async function viewToggle(k) {
  M.cfg[k] = !viewOn(k); await saveMapCfg();
  const m = M.map, on = viewOn(k);
  if (m && k === 'globe') m.setProjection({ type: on ? 'globe' : 'mercator' });
  if (m && k === 't3d') {
    if (on) { if (m.getSource('terrdem')) m.setTerrain(T3D()); }       // (the camera stays as it is: tilt it yourself)
    else m.setTerrain(null);                                         // (the camera stays: a flat map can be tilted too)
    obelUpd();                                                       // (the obelisk's shadow)
  }
  drawLabels();
}
// a point on the screen – on the globe, places on its far side are left out (moved far off the screen)
function mapPt(ll) {
  const p = M.map.project(ll);
  if (!viewOn('globe') || M.map.getZoom() > 6) return p;
  const lon = ll.lng ?? ll[0], lat = ll.lat ?? ll[1], q = M.map.unproject(p);
  if (Math.abs(q.lat - lat) > 0.3 || Math.abs(((q.lng - lon + 540) % 360) - 180) > 0.3) { p.x = -1e5; p.y = -1e5; }
  return p;
}
