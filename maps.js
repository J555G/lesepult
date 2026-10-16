// ================================================================ Pult · maps
// Optional packages (Dictionaries → Maps): "base" = land, lakes, rivers, modern borders and the map engine (MapLibre);
// "places" = the Pleiades gazetteer. The places of a text are found here, in the app: the lemma of every proper noun is
// looked up among the names of the gazetteer (any text, also imported ones). The reader can correct every place.
// Settings keys: mapPk (installed packages) · pl|<text>|<word> (correction of one passage) · plw|<work>|<name> (in a work)
// · plg|<name> (everywhere) · pown|<id> (own places) · mpos|<key> (map position) · mapCfg (layers, names, scope …)
const MAPS = 'maps/', MAPCACHE = 'pult-maps';
const M = { P: null, map: null, sel: null, hits: new Map(), scope: null, cfg: null, posKey: null, own: new Map() };
const EUROPE_ICON = '<svg class="eu" width="22" height="20" viewBox="0 0 24 22" aria-hidden="true"><path d="M12.3,4.4L11.9,4.6L11.7,5.1L11.8,5.4L11.5,5.8L11.1,6.3L10.9,7.1L11.2,7.5L11.4,7.7L11.2,8.4L11.0,8.5L10.9,9.4L10.8,9.9L10.4,9.8L10.3,10.3L9.9,10.3L9.8,9.8L9.6,9.2L9.4,8.5L9.2,8.1L8.6,8.7L8.3,8.8L7.9,8.5L7.9,8.0L7.9,6.7L8.1,6.4L8.8,6.0L9.3,5.5L9.7,4.7L10.2,3.6L10.5,3.2L11.0,2.5L11.4,2.2L11.7,2.2L12.0,1.7L12.3,1.6L12.6,1.4L13.3,1.7L13.1,1.9L13.4,2.2L13.1,2.5L12.9,2.6L13.0,3.0L13.4,3.3L13.3,3.7L13.7,4.3L13.6,4.8L13.9,5.1L13.9,5.5L14.4,5.7L14.3,6.0L14.2,6.4L13.8,7.2L13.3,7.3L12.9,7.6L12.5,7.7L12.3,7.5L12.0,7.3L12.0,6.8L11.9,6.3L11.9,6.0L12.1,5.7L12.6,5.0L12.7,4.9L12.6,4.6ZM9.0,10.5L9.0,10.7L9.3,10.8L9.3,11.0L9.6,10.9L9.8,10.8L10.1,11.0L10.3,11.1L10.5,11.0L11.0,10.7L11.3,10.5L11.6,10.6L11.7,10.7L11.9,10.7L12.3,10.7L12.9,10.6L12.8,10.5L12.8,10.3L12.7,10.3L12.4,10.2L12.3,9.8L12.2,9.4L12.3,9.1L12.6,8.8L12.8,9.2L13.1,9.2L13.1,8.8L13.0,8.4L13.0,8.5L12.8,8.4L12.7,8.1L13.0,7.9L13.3,7.7L13.6,7.8L13.9,7.7L13.9,7.8L13.8,8.1L14.0,8.6L13.9,8.8L14.1,8.9L14.1,9.1L14.3,9.4L14.6,9.4L14.7,9.6L14.8,9.5L15.1,9.5L15.2,9.7L15.2,9.9L15.5,10.2L15.6,10.2L15.6,10.3L15.8,10.4L16.0,10.5L15.9,10.6L15.6,10.7L15.6,10.7L15.7,10.9L15.9,11.2L16.0,11.2L16.0,11.0L16.1,11.0L16.4,10.9L16.7,11.1L16.7,11.2L16.7,11.4L17.0,11.3L17.2,11.5L17.2,11.6L17.6,11.7L17.9,11.5L18.1,11.7L18.3,11.6L18.8,11.6L18.9,11.7L18.9,12.0L19.0,12.3L19.0,12.4L18.7,12.6L18.6,12.8L18.7,13.0L18.4,13.1L18.3,13.4L18,13.5L17.7,13.8L17.8,14.0L17.8,14.0L17.7,14.0L17.6,14.0L17.3,13.9L17.2,14.1L17.2,14.0L16.6,14.1L16.5,13.9L16.2,14.0L16.2,14.3L16.0,14.8L16.0,14.9L15.9,15.0L15.8,15.0L15.8,15.7L15.6,15.9L15.6,16.3L15.8,16.6L15.9,16.8L16.2,16.8L16.2,17.0L15.7,17.1L15.6,17.3L15.3,17.6L15.2,17.4L15.1,17.3L14.9,17.3L14.7,17.3L14.2,17.5L14.6,17.8L14.4,17.9L14.2,17.9L13.9,17.7L13.9,17.8L14.0,18.1L14.2,18.3L14.1,18.5L14.3,18.7L14.6,18.8L14.6,19.1L14.2,19.0L14.4,19.3L14.1,19.3L14.4,19.8L14.1,19.8L13.7,19.6L13.5,19.2L13.4,18.9L13.2,18.7L13.0,18.4L12.9,18.3L12.8,18.2L12.8,18.1L12.6,18.0L12.5,17.7L12.5,17.4L12.6,17.2L12.5,17.1L12.4,17.1L12.3,16.9L12.1,16.9L11.7,16.7L11.5,16.5L11.1,16.4L10.8,16.0L10.9,16.0L10.7,15.8L10.7,15.6L10.5,15.5L10.4,15.7L10.2,15.6L10.2,15.4L10.3,15.4L10.3,15.3L10.0,15.3L9.8,15.5L9.8,15.7L9.7,15.9L9.9,16.1L10.2,16.4L10.4,16.8L10.9,17.2L11.2,17.2L11.3,17.3L11.2,17.4L11.5,17.6L11.8,17.7L12.2,18.0L12.2,18.1L12.2,18.2L11.9,18.0L11.6,18.0L11.4,18.3L11.7,18.5L11.7,18.8L11.5,18.8L11.3,19.3L11.2,19.3L11.2,19.1L11.2,18.9L11.3,18.7L11.1,18.5L11.0,18.2L10.8,18.1L10.7,17.9L10.4,17.8L10.3,17.6L10.0,17.6L9.7,17.4L9.3,17.0L9.1,16.7L9.0,16.2L8.8,16.1L8.5,16.0L8.3,16.0L8.1,16.3L7.9,16.3L7.6,16.6L6.8,16.3L6.3,16.5L6.2,16.8L6.2,17.1L5.8,17.4L5.3,17.4L5.2,17.6L4.9,17.8L4.7,18.2L4.8,18.5L4.5,18.7L4.4,19.0L4.1,19.1L3.7,19.4L3.2,19.3L2.8,19.3L2.5,19.4L2.3,19.5L2.1,19.4L2.0,19.2L1.9,18.9L1.6,18.7L1.4,18.8L1.2,18.7L1,18.7L1.1,18.3L1.2,18.0L1.0,17.9L1.0,17.7L1.1,17.4L1.3,17.2L1.4,17.0L1.5,16.8L1.6,16.5L1.6,16.3L1.6,16.2L1.7,15.8L1.6,15.6L2.2,15.3L2.7,15.5L3.2,15.7L3.5,15.8L3.8,15.9L4.4,16.0L4.7,15.7L4.9,14.7L4.7,14.1L4.5,13.8L4.0,13.5L4.0,13.1L4.5,13.1L5.0,13.4L5.0,12.8L5.3,13.0L6.1,12.8L6.3,12.4L6.6,12.3L6.8,12.2L7.0,12.1L7.4,11.4L7.8,11.2L8.1,11.2L8.1,11.1L8.4,11.1L8.4,11.2L8.7,11.0L8.6,10.8L8.6,10.5L8.5,10.2L8.5,9.7L8.6,9.5L8.7,9.4L8.9,9.3L9.0,9.2L9.2,9.1L9.2,9.3L9.1,9.5L9.2,9.6L9.3,9.7L9.3,9.9L9.2,9.9L8.9,10.2ZM15.8,20.1L15.7,20.3L15.1,20.5L15.1,20.4L14.6,20.4L14.6,20.1L14.9,20.3L15.2,20.2L15.5,20.2L15.6,20.3ZM23,16.8L22.8,17.0L22.6,16.9L22.1,17.1L22.0,17.2L21.6,17.5L21.4,17.6L21.0,17.9L20.7,18.0L20.4,18.0L20.0,18.3L19.9,18.3L20.0,18.5L19.9,18.7L19.8,18.8L19.6,18.6L19.7,18.4L19.4,18.5L19.1,18.5L18.9,18.9L18.3,19.1L17.9,18.9L17.4,19.0L17.4,19.3L17.1,19.4L16.6,19.2L16.2,19.3L15.9,18.9L15.5,18.6L15.6,18.2L15.3,18.0L15.7,17.4L16.3,17.3L16.3,16.9L17.1,16.8L17.4,16.3L17.8,16.0L18.4,15.8L19.2,16.0L19.8,16.0L20.2,15.8L20.5,15.7L20.9,15.3L21.2,15.1L21.7,15.2L21.8,15.3L21.9,15.6L22.2,15.6L22.4,15.6L22.2,15.9L22.6,16.4L22.6,16.6ZM4.1,10.4L4.1,10.8L3.7,11.2L3.1,11.3L2.7,11.1L3.1,10.7L3.1,10.1L3.6,9.9L3.9,9.7L4.1,9.7L4.4,10.1ZM10.8,19.2L11.1,19.1L11.0,19.6L11.0,19.7L10.9,20.0L10.6,19.8L10.4,19.8L9.8,19.5L9.9,19.2L10.4,19.3ZM8.3,17.8L8.5,17.6L8.8,18.0L8.7,18.7L8.5,18.6L8.3,18.8L8.2,18.6L8.2,18.0L8.1,17.7ZM5.0,10.9L5.0,10.9L5.1,10.6L5.0,10.2L5.0,10.2L4.6,10.0L4.6,9.9L4.7,9.7L4.7,9.5L4.5,9.7L4.6,9.2L4.5,8.9L4.7,8.4L5.0,8.1L5.2,8.2L5.6,8.2L5.2,8.7L5.5,8.7L5.8,8.7L5.6,9.1L5.3,9.5L5.5,9.6L5.6,9.7L5.7,10.3L5.9,10.5L6.0,11.1L6.1,11.3L6.4,11.4L6.3,11.8L6.1,11.9L6.2,12.2L5.9,12.4L5.5,12.3L4.9,12.4L4.8,12.2L4.5,12.4L4.2,12.3L4.0,12.5L3.8,12.3L4.4,11.9L4.7,11.8L4.7,11.8L4.2,11.6L4.2,11.4L4.5,11.3L4.4,11.0L4.6,10.7ZM18.5,19.6L18.6,19.6L18.7,19.5L18.8,19.5L18.8,19.5L18.8,19.6L18.8,19.6L18.9,19.5L19.0,19.5L19.0,19.5L19.1,19.5L18.7,19.9L18.5,19.8L18.3,19.7Z" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>';

// ---------------------------------------------------------------- settings of the map
async function mapCfg() {
  if (!M.cfg) M.cfg = Object.assign({ mark: true, jump: true, scope: 'section', names: 'text', peoples: false, borders: false, rough: true }, (await setting('mapCfg')) || {});
  return M.cfg;
}
async function saveMapCfg() { await setting('mapCfg', M.cfg); }

// ---------------------------------------------------------------- packages
async function mapManifest() {
  try { const r = await fetchT(MAPS + 'maps.json', { cache: 'no-cache' }, 6000); if (r.ok) { const j = await r.json(); (await caches.open(MAPCACHE)).put(new URL(MAPS + 'maps.json', location.href).href, new Response(JSON.stringify(j))); return j; } } catch (_) { }
  try { const r = await (await caches.open(MAPCACHE)).match(new URL(MAPS + 'maps.json', location.href).href); if (r) return await r.json(); } catch (_) { }
  return null;
}
async function mapInstalled() { return (await setting('mapPk')) || {}; }
async function mapHas(id) { return !!(await mapInstalled())[id]; }
async function downloadMapPkg(p, onp) {
  const c = await caches.open(MAPCACHE); let done = 0;
  for (const f of p.files) {
    const url = new URL(MAPS + f, location.href).href;
    const r = await fetch(url, { cache: 'reload' }); if (!r.ok) throw new Error(f + ': ' + r.status);
    const b = await r.blob(); await c.put(url, new Response(b, { headers: { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/json' } }));
    done += b.size; onp?.(Math.min(1, done / p.bytes));
  }
  const inst = await mapInstalled(); inst[p.id] = p.v; await setting('mapPk', inst);
  if (p.id === 'places') { M.P = null; await placesForText(); }
}
async function deleteMapPkg(p) {
  const c = await caches.open(MAPCACHE);
  for (const f of p.files) await c.delete(new URL(MAPS + f, location.href).href);
  const inst = await mapInstalled(); delete inst[p.id]; await setting('mapPk', inst);
  if (p.id === 'places') { M.P = null; M.hits = new Map(); markPlaces(); }
  if (p.id === 'base' && M.map) { M.map.remove(); M.map = null; }
}
// the Maps section of the Dictionaries dialog
async function mapSectionHTML() {
  const man = await mapManifest(), inst = await mapInstalled();
  if (!man) return '';
  const row = p => `<div class="item"><span class="t"><b>${esc(p.name)}</b><br><small>${esc(p.desc)} · ${(p.bytes / 1e6).toFixed(1)} MB</small></span>`
    + (inst[p.id] ? (inst[p.id] !== p.v ? `<button type="button" class="dlbtn" data-mapget="${p.id}">Update</button>` : '<button type="button" class="dlbtn" disabled>Installed</button>') + `<button type="button" class="danger" data-mapdel="${p.id}">Delete</button>`
      : `<button type="button" class="dlbtn" data-mapget="${p.id}">Download</button>`) + '</div>';
  M.man = man;
  return `<section class="dsec"><h4>Maps ${info('Optional downloads for the map (button with the outline of Europe in the top bar). More layers can be added later as further packages.')}</h4><div class="list plain">${man.packages.map(row).join('')}</div></section>`;
}
document.addEventListener('click', async ev => {
  const g = ev.target.closest?.('[data-mapget]'), d = ev.target.closest?.('[data-mapdel]');
  if (!g && !d) return;
  const p = M.man?.packages.find(x => x.id === (g || d).dataset[g ? 'mapget' : 'mapdel']); if (!p) return;
  if (d) { await deleteMapPkg(p); const sec = d.closest('section.dsec'); if (sec) sec.outerHTML = await mapSectionHTML(); toast(p.name + ' removed'); return; }
  g.disabled = true; g.classList.add('busy');
  try {
    await downloadMapPkg(p, f => { g.style.setProperty('--p', Math.round(f * 100) + '%'); g.textContent = Math.round(f * 100) + ' %'; });
    g.textContent = 'Installed'; g.classList.remove('busy');
    if (!g.parentElement.querySelector('[data-mapdel]')) g.insertAdjacentHTML('afterend', `<button type="button" class="danger" data-mapdel="${p.id}">Delete</button>`);
    if (S.tab === 'map') showMap();
  } catch (e) { g.disabled = false; g.classList.remove('busy'); g.textContent = 'Download'; toast('Download failed: ' + e.message); }
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
async function loadPlaceIndex() {
  if (M.P) return M.P;
  if (!(await mapHas('places'))) return null;
  let d;
  try { const r = await fetch(MAPS + 'places/places.json'); if (!r.ok) return null; d = await r.json(); } catch (_) { return null; }
  const textT = new Set(d.textTypes), ex = new Map(), st = new Map(), byId = new Map();
  const mainT = new Set(MAIN_TYPES.map(t => d.types.indexOf(t)).filter(i => i >= 0));
  const okWord = w => w.length >= 3 && !/^[IVXLCDM]+\.?$/.test(w);
  const add = (m, k, i) => { if (!k) return; let a = m.get(k); if (!a) m.set(k, a = []); if (!a.includes(i)) a.push(i); };
  const P = d.places.map(([id, t, lat, lon, ty, rough, y0, y1, names]) => ({ id, t, lat, lon, ty, rough, y0, y1, names, text: ty.some(x => textT.has(x)) }));
  P.forEach((p, i) => {
    byId.set(p.id, p);
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
  M.P = { P, ex, st, byId, T, ti, src: d.src };
  for (const r of await getAll('settings', IDBKeyRange.bound('pown|', 'pown|￿'))) M.own.set(r.v.id, r.v);
  return M.P;
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
function placeCands(name, exactOnly) {
  const ix = M.P; if (!ix || !name) return [];
  let c = ix.ex.get(exKey(name));
  if (!c?.length && !exactOnly) c = (ix.st.get(stemKey(name)) || []).filter(i => ix.P[i].main);
  return c ? c.slice(0, 40) : [];
}
// proper nouns of a list of tokens: [{i, name, c:[place indices]}]
async function findPlaceHits(toks, lemmaOf) {
  const out = []; let start = true;
  for (const tk of toks) {
    if (tk.t === 'b') { start = true; continue; }
    if (tk.t === 'p') { if (/[.!?;·:]/.test(tk.s)) start = true; continue; }
    if (tk.t !== 'w') continue;
    const s0 = start; start = false;
    const cap = tk.s[0] !== tk.s[0].toLowerCase();
    if (!cap) continue;
    let l = lemmaOf ? await lemmaOf(tk) : tk.lemma;
    if (l && l[0] === l[0].toLowerCase()) continue;            // analysed as an ordinary word (Et, Sed, Καί …)
    if (l && /^(adj|verb|part|inf|adv|pron|conj|prep|ptcl)$/.test(tk.pos || '')) continue;   // adjectives, verbs …: not places
    if (tk.ctx && tk.ctx.t?.[0] === 'a') continue;                                             // Greek treebank: an adjective (Ἀθηναῖος)
    if (l && !isGreek(l) && /\b(masc|fem|neut)\b/.test(tk.ana || '')) continue;               // Latin: an adjective (Romanus, Graecus)
    if (/^[IVXLCDM]+$/.test(tk.s)) continue;                    // Roman numerals
    const name = l || tk.s;
    const c = placeCands(name, !!l || s0);
    if (c.length) out.push({ i: tk.i, name, c });
  }
  return out;
}
// one place per word: corrections first, then the place that lies nearest to the unambiguous places of the same text
async function choosePlaces(hits, textId, workKey) {
  const P = M.P.P, res = new Map();
  const occ = new Map((await getAll('settings', IDBKeyRange.bound(`pl|${textId}|`, `pl|${textId}|￿`))).map(r => [+r.k.split('|')[2], r.v]));
  const wk = new Map((await getAll('settings', IDBKeyRange.bound(`plw|${workKey}|`, `plw|${workKey}|￿`))).map(r => [r.k.slice(`plw|${workKey}|`.length), r.v]));
  const gl = new Map((await getAll('settings', IDBKeyRange.bound('plg|', 'plg|￿'))).map(r => [r.k.slice(4), r.v]));
  // the unambiguous places nearby in the text decide between places of the same name (the nearer in the text, the more)
  const fixed = hits.filter(h => h.c.length === 1 && P[h.c[0]].main && !P[h.c[0]].rough).map(h => ({ i: h.i, p: P[h.c[0]] }));
  // a candidate scores by its distance to those places (capped, so that one remote mention does not pull far)
  const dist = (a, b) => Math.hypot(a.lat - b.lat, (a.lon - b.lon) * Math.cos(a.lat * Math.PI / 180));
  const cost = (p, i) => { let c = 0, w = 0; for (const f of fixed) { const g = 1 / (1 + Math.abs(f.i - i) / 80); if (g < 0.02) continue; c += g * Math.min(dist(p, f.p), 8); w += g; } return w ? c / w : 0; };
  for (const h of hits) {
    const k = exKey(h.name), fix = occ.get(h.i) || wk.get(k) || gl.get(k);
    if (fix?.none) continue;
    let auto = P[h.c[0]];
    if (h.c.length > 1) {
      const cs = h.c.map(i => P[i]), mains = cs.filter(p => p.main), pool = mains.length ? mains : cs;
      // … and well-known places are preferred (many recorded names, a city): Antioch on the Orontes before the small Antiochs
      const urban = M.P.ti.urban;
      const d = p => cost(p, h.i) * (p.rough ? 1.15 : 1) + (p.rough ? 0.3 : 0) - 0.8 * Math.log(1 + p.names.length) - (p.ty.includes(urban) ? 1 : 0);
      auto = pool.map(p => [p, d(p)]).sort((a, b) => a[1] - b[1])[0][0];
    } else if (!auto.main && !fix) continue;                    // a lone match among villas, tombs, temples …: rather not
    
    const p = fix?.p != null ? placeById(fix.p) : auto;
    if (p) res.set(h.i, { p, name: h.name, cands: h.c, fixed: !!fix, auto });
  }
  // words the reader marked as places themselves
  for (const [i, v] of occ) if (!res.has(i) && v.p != null) { const p = placeById(v.p); if (p) res.set(i, { p, name: v.name || p.t, cands: [], fixed: true }); }
  return res;
}
const textKeyOf = t => t?.id;
const workKeyOf = t => t?.work ? t.work.id : 'imp:' + t?.id;
// the places of the open text (after the lemmas are known)
async function placesForText() {
  const t = S.text; await mapCfg(); if (!t) { M.hits = new Map(); return; }
  if (!(await loadPlaceIndex())) { M.hits = new Map(); markPlaces(); return; }
  const id = t.id, hits = await findPlaceHits(S.tokens);
  if (S.text?.id !== id) return;
  M.hits = await choosePlaces(hits, textKeyOf(t), workKeyOf(t));
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
  for (const [i, h] of M.hits) if (!isPeople(h.p) || M.cfg?.peoples) S.wordEls[i]?.classList.add('plc');
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
  const res = await choosePlaces(hits, w.id ? `w:${w.id}:${bi}` : t.id, workKeyOf(t));
  for (const h of res.values()) h.part = bi;
  M.workCache.books[bi] = res; M.workCache.toks ??= {}; M.workCache.toks[bi] = toks;
  return res;
}

// ---------------------------------------------------------------- what the map shows (section · chapter · book · work)
function chapterKey(s) { const m = s.match(/^(.*)[.,:]\w+$/) || s.match(/^(\d+)[a-e]$/i); return m ? m[1] : null; }
function scopeRange(scope) {
  const R = S.refs || [], last = S.tokens.filter(x => x.t === 'w').length - 1;
  if (scope === 'book' || !R.length) return [0, last];
  const cr = curRef(); if (!cr) return [0, last];
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
  if (scope === 'work') return w ? w.title : 'whole text';
  if (scope === 'book') return w && w.books.length > 1 ? w.books[S.text.bi] : 'whole text';
  if (!cr) return 'whole text';
  return scope === 'chapter' ? 'chapter ' + (chapterKey(cr.s) ?? cr.s) : 'section ' + cr.s;
}
// places shown: {place id -> {p, n (passages), label}}
async function scopePlaces() {
  const cfg = await mapCfg(), out = new Map(), t = S.text; if (!t) return out;
  const add = (h, bi) => {
    if (isPeople(h.p) && !cfg.peoples) return;
    let x = out.get(h.p.id); if (!x) out.set(h.p.id, x = { p: h.p, n: 0, names: {} });
    x.n++; x.names[h.name] = (x.names[h.name] || 0) + 1;
  };
  if (cfg.scope === 'work' && t.work && t.work.books.length > 1) {
    for (let bi = 0; bi < t.work.books.length; bi++) { const hs = bi === t.bi ? M.hits : await placesOfPart(bi); for (const h of hs.values()) add(h, bi); }
  } else {
    const [a, b] = scopeRange(cfg.scope);
    for (const [i, h] of M.hits) if (i >= a && i <= b) add(h, t.bi);
  }
  return out;
}

// ---------------------------------------------------------------- the map
let mapLibP = null;
function loadMapLib() {
  if (window.maplibregl) return Promise.resolve();
  return mapLibP ??= new Promise((res, rej) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = MAPS + 'base/lib/maplibre-gl.css'; document.head.append(l);
    const s = document.createElement('script'); s.src = MAPS + 'base/lib/maplibre-gl.js'; s.onload = res; s.onerror = () => { mapLibP = null; rej(new Error('map engine not available')); }; document.head.append(s);
  });
}
function mapColors() {
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  const dark = document.documentElement.dataset.theme === 'dark';
  return { sea: dark ? '#1d2a33' : '#cfdde6', land: dark ? '#2e2b25' : '#f2ecdc', coast: dark ? '#5d5547' : '#b9ae92', river: dark ? '#4f84aa' : '#5d93bd', border: dark ? '#77706a' : '#a59c8a', fg: v('--fg'), acc: v('--acc'), bg: v('--bg') };
}
function mapStyle(C) {
  return {
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
  };
}
function showMap() { return M.showP ??= showMap1().finally(() => { M.showP = null; }); }   // one at a time
async function showMap1() {
  const box = $('#mapBody');
  const [base, places] = [await mapHas('base'), await mapHas('places')];
  if (!base || !places) {
    box.innerHTML = `<div class="mapmsg"><p>${EUROPE_ICON}</p><p>The map needs two downloads: <b>${[!base && 'Base map', !places && 'Ancient places'].filter(Boolean).join('</b> and <b>')}</b>.</p><button type="button" data-mapdl="1">Open Dictionaries → Maps</button></div>`;
    return;
  }
  await mapCfg();
  if (!M.map) {
    box.innerHTML = `<div id="mapCanvas"></div><div class="mlabels" id="mapLabels"></div>
      <button type="button" class="mscope" id="mapScope"></button>
      <div class="mctl"><button type="button" class="mico" id="mapLayersBtn" title="Layers" aria-label="Layers">${LAYERS_ICON}</button><button type="button" class="mico" id="mapFullBtn" title="Full screen" aria-label="Full screen">${FULL_ICON}</button></div>
      <div class="mcard" id="mapCard" hidden></div><div class="mpop" id="mapPop" hidden></div>`;
    try { await loadMapLib(); } catch (e) { box.innerHTML = `<div class="mapmsg"><p>${esc(e.message)}</p></div>`; return; }
    M.colors = mapColors();
    const v = (await setting('mpos|last')) || { c: [24, 38], z: 4 };
    M.map = new maplibregl.Map({ container: 'mapCanvas', style: mapStyle(M.colors), center: v.c, zoom: v.z, attributionControl: false, dragRotate: false, pitchWithRotate: false, maxZoom: 13, minZoom: 1 });
    M.map.touchZoomRotate.disableRotation();
    M.map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Places: Pleiades (CC BY) · Map: Natural Earth · MapLibre' }));
    M.map.on('move', () => { if (!M.lblRaf) M.lblRaf = requestAnimationFrame(() => { M.lblRaf = 0; drawLabels(); }); });
    M.map.on('moveend', () => { const c = M.map.getCenter(), z = M.map.getZoom(), v = { c: [+c.lng.toFixed(4), +c.lat.toFixed(4)], z: +z.toFixed(2) }; setting('mpos|last', v); if (M.posKey) setting('mpos|' + M.posKey, v); });
    M.map.on('click', 'pl', e => { const f = e.features?.[0]; if (f) selectPlace(f.properties.id, { from: 'map' }); });
    M.map.on('click', e => { if (M.pick) { const p = M.pick; M.pick = null; $('#mapCanvas').classList.remove('picking'); p(e.lngLat); return; }
      if (!M.map.queryRenderedFeatures(e.point, { layers: ['pl'] }).length && !e.originalEvent.target.closest?.('.mlbl')) closeCard(); });
    M.map.on('mouseenter', 'pl', () => { M.map.getCanvas().style.cursor = 'pointer'; });
    M.map.on('mouseleave', 'pl', () => { M.map.getCanvas().style.cursor = ''; });
    await new Promise(r => M.map.once('load', r));
    wireMapUI();
  } else M.map.resize();
  await refreshMapData();
}
const LAYERS_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 3 8l9 5 9-5-9-5zM3 12.5l9 5 9-5M3 16.5l9 5 9-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const FULL_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
function labelOf(x) {
  const p = x.p, how = M.cfg.names;
  if (how === 'english' || p.own) return p.own ? p.t : p.t.split('/')[0];
  if (how === 'modern') { const m = p.names?.find(n => !['grc', 'la', 'r', ''].includes(n[1]) && /^[A-Za-zÀ-ɏ\s'’-]+$/.test(n[0])); return m ? m[0] : p.t.split('/')[0]; }
  const names = Object.entries(x.names || {}).sort((a, b) => b[1] - a[1]);         // as the text names it (its lemma)
  const n = names[0]?.[0] || p.t.split('/')[0];
  return isGreek(n) ? n : n.normalize('NFD').replace(/[\u0304\u0306]/g, '').normalize('NFC');   // Latin: without vowel lengths
}
async function refreshMapData() {
  if (!M.map || !M.map.getSource('places')) return;
  const sp = M.shown = await scopePlaces(), sel = M.sel?.p?.id;
  if (M.sel && !sp.has(sel)) sp.set(sel, { p: M.sel.p, n: 0, names: { [M.sel.name || M.sel.p.t]: 1 }, extra: true });
  const feats = [...sp.values()].map(x => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x.p.lon, x.p.lat] },
    properties: { id: x.p.id, n: x.n, sel: x.p.id === sel, rough: !!x.p.rough, k: isRegion(x.p) ? 'region' : isWater(x.p) ? 'water' : 'place' } }));
  M.map.getSource('places').setData({ type: 'FeatureCollection', features: feats });
  $('#mapScope').innerHTML = `${esc(scopeLabel(M.cfg.scope))} <small>· ${sp.size - (M.sel && sp.get(sel)?.extra ? 1 : 0)} place${sp.size === 1 ? '' : 's'}</small> ▾`;
  drawLabels();
}
// labels: drawn as text above the map (Greek and Latin in the reading font), without overlaps, most important first
function drawLabels() {
  const box = $('#mapLabels'); if (!box || !M.map || !M.shown) return;
  const W = box.clientWidth, H = box.clientHeight, placed = [], sel = M.sel?.p?.id;
  const items = [...M.shown.values()].map(x => ({ x, pt: M.map.project([x.p.lon, x.p.lat]), pri: (x.p.id === sel ? 1e6 : 0) + (isRegion(x.p) ? 50 : 0) + x.n }))
    .filter(o => o.pt.x > -60 && o.pt.x < W + 60 && o.pt.y > -20 && o.pt.y < H + 20).sort((a, b) => b.pri - a.pri).slice(0, 220);
  let h = '';
  const ctx = (drawLabels.c ??= document.createElement('canvas').getContext('2d'));
  for (const o of items) {
    const reg = isRegion(o.x.p), txt = labelOf(o.x), fs = reg ? 11 : 13;
    ctx.font = `${reg ? 600 : 400} ${fs}px "Gentium Book Plus", serif`;
    const w = ctx.measureText(reg ? txt.toUpperCase() : txt).width * (reg ? 1.35 : 1) + 4, hgt = fs + 4;
    const x = reg ? o.pt.x - w / 2 : o.pt.x + 7, y = reg ? o.pt.y - hgt / 2 : o.pt.y - hgt + 2;
    const r = [x, y, x + w, y + hgt];
    if (o.x.p.id !== sel && placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) continue;
    placed.push(r);
    h += `<span class="mlbl${reg ? ' reg' : ''}${isWater(o.x.p) ? ' wat' : ''}${o.x.p.id === sel ? ' sel' : ''}${o.x.extra ? ' extra' : ''}" data-pid="${esc(String(o.x.p.id))}" style="left:${Math.round(x)}px;top:${Math.round(y)}px">${esc(txt)}</span>`;
  }
  box.innerHTML = h;
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
function closeCard() { $('#mapCard').hidden = true; if (M.sel) { M.sel = null; refreshMapData(); } }
// the card of a place: its name, what it is, the passages that name it
async function showCard(p) {
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
    <div class="mpass">${occ.length ? occ.map(o => `<button type="button" class="mps" data-mgo="${o.i}"><b>${multi ? esc(short[o.bi]) + ' · ' : ''}${esc(refOf(S.refs, o.i))}</b><span>${ctx(o.i)}</span></button>`).join('')
      : '<p class="hint small">Not named in this part of the text.</p>'}</div>
    <div class="macts">${w && multi ? '<button type="button" data-mwork="1">All passages in this work</button>' : ''}${cur != null ? '<button type="button" data-mnone="1">Not a place here</button>' : ''}</div>
    <div id="mapChange" hidden></div>`;
  card.hidden = false;
  card.scrollTop = 0;
}
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
  const near = p => { const a = s.h?.auto || s.p; const d = Math.round(Math.hypot(p.lat - a.lat, (p.lon - a.lon) * Math.cos(a.lat * Math.PI / 180)) * 111); return d ? `${d.toLocaleString('en')} km away` : ''; };
  return `<div class="mchg"><div class="navh">Apply to</div><div class="seg" role="group">${[['occ', 'This passage'], ['work', 'This work'], ['all', 'Everywhere']].map(([v, l]) => `<button type="button" data-mscope="${v}" class="${(M.chScope || 'occ') === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${cands.length ? `<div class="navh">Other places of this name</div>${cands.slice(0, 12).map(p => `<button type="button" class="mcand" data-mset="${p.id}"><b>${esc(p.t)}</b> <small>${esc(typeLabel(p))} · ${near(p)}</small></button>`).join('')}` : ''}
    <div class="navh">Search the gazetteer</div><div class="navgo"><input type="search" id="mapSearch" class="nofocus" placeholder="Name of a place" autocomplete="off" spellcheck="false"></div><div id="mapSearchRes"></div>
    <div class="macts"><button type="button" data-mpick="1">Pick on the map …</button>${s.h?.fixed ? '<button type="button" data-mreset="1">Back to the automatic choice</button>' : ''}</div></div>`;
}
function searchPlaces(q) {
  const k = stemKey(q), e = exKey(q), out = [];
  if (!k && !e) return out;
  for (const p of M.P.P) {
    if (out.length > 30) break;
    if (exKey(p.t).startsWith(e) || p.names.some(n => exKey(n[0]).startsWith(e)) || (k && stemKey(p.t.split('/')[0]) === k)) out.push(p);
  }
  return out;
}
async function saveCorrection(v) {
  const s = M.sel, t = S.text, k = exKey(s.name), sc = M.chScope || 'occ';
  const key = sc === 'occ' ? `pl|${t.id}|${s.i}` : sc === 'work' ? `plw|${workKeyOf(t)}|${k}` : `plg|${k}`;
  if (v == null) { await del('settings', key); if (sc !== 'occ') await del('settings', `pl|${t.id}|${s.i}`); }
  else await setting(key, Object.assign({ name: s.name }, v));
  M.workCache = null;
  await placesForText();
  const h = M.hits.get(s.i);
  if (h) { M.sel = { p: h.p, i: s.i, name: h.name, h }; await refreshMapData(); showCard(h.p); M.map.easeTo({ center: [h.p.lon, h.p.lat], duration: 500 }); }
  else { closeCard(); toast('No longer marked as a place.'); }
}
function wireMapUI() {
  const box = $('#mapBody');
  box.addEventListener('click', async ev => {
    const b = ev.target.closest('button,.mlbl'); if (!b) return;
    const d = b.dataset;
    if (b.classList.contains('mlbl')) return selectPlace(d.pid, { from: 'map' });
    if (d.mclose) return closeCard();
    if (b.id === 'mapScope') return scopePop();
    if (b.id === 'mapLayersBtn') return layersPop();
    if (b.id === 'mapFullBtn') return mapFull();
    if (d.mscopev) { M.cfg.scope = d.mscopev; await saveMapCfg(); $('#mapPop').hidden = true; return refreshMapData(); }
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
        const own = { id: 'o' + Date.now().toString(36), t: r.data.n.trim(), lat: +ll.lat.toFixed(4), lon: +ll.lng.toFixed(4), own: 1, ty: [], names: [] };
        M.own.set(own.id, own); await setting('pown|' + own.id, own);
        if (M.sel?.i != null) await saveCorrection({ p: own.id });
      };
      return;
    }
    if (d.mapdl) { return dictsDialog(); }
    if (d.mlay) { const k = d.mlay; M.cfg[k] = !M.cfg[k]; b.classList.toggle('on', M.cfg[k]); await saveMapCfg(); if (k === 'borders') M.map.setLayoutProperty('borders', 'visibility', M.cfg.borders ? 'visible' : 'none'); if (k === 'peoples') markPlaces(); return refreshMapData(); }
    if (d.mnames) { M.cfg.names = d.mnames; await saveMapCfg(); b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); return drawLabels(); }
  });
  box.addEventListener('input', ev => {
    if (ev.target.id !== 'mapSearch') return;
    clearTimeout(M.sT); M.sT = setTimeout(() => {
      const r = searchPlaces(ev.target.value.trim());
      $('#mapSearchRes').innerHTML = r.map(p => `<button type="button" class="mcand" data-mset="${p.id}"><b>${esc(p.t)}</b> <small>${esc(typeLabel(p))}</small></button>`).join('') || (ev.target.value.trim() ? '<p class="hint small">Nothing found.</p>' : '');
    }, 200);
  });
}
function scopePop() {
  const pop = $('#mapPop'); if (!pop.hidden && pop.dataset.k === 'scope') { pop.hidden = true; return; }
  pop.dataset.k = 'scope';
  pop.innerHTML = `<div class="navh">Places from</div><div class="seg" role="group">${[['section', 'Section'], ['chapter', 'Chapter'], ['book', 'Book'], ['work', 'Work']].map(([v, l]) => `<button type="button" data-mscopev="${v}" class="${M.cfg.scope === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  pop.hidden = false;
}
function layersPop() {
  const pop = $('#mapPop'); if (!pop.hidden && pop.dataset.k === 'layers') { pop.hidden = true; return; }
  pop.dataset.k = 'layers';
  const tg = (k, l) => `<button type="button" class="mtg${M.cfg[k] ? ' on' : ''}" data-mlay="${k}"><span class="ck"></span>${l}</button>`;
  pop.innerHTML = `<div class="navh">Layers</div>${tg('peoples', 'Peoples (Isauri, Persae …)')}${tg('borders', 'Modern borders')}
    <div class="navh">Names</div><div class="seg" role="group">${[['text', 'As in the text'], ['english', 'English'], ['modern', 'Modern']].map(([v, l]) => `<button type="button" data-mnames="${v}" class="${M.cfg.names === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    <p class="hint small" style="margin:.5rem 0 0">More layers (roads, sites, provinces, time slider …) follow.</p>`;
  pop.hidden = false;
}
// full screen: the divider moves all the way, the map takes the screen (and back)
function mapFull() {
  const n = parseFloat(getSplit());
  if (n <= 0.5) setSplit(M.splitBefore || '50%'); else { M.splitBefore = getSplit(); setSplit('0%'); }
  setTimeout(() => M.map?.resize(), 50);
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
  f.parentElement.querySelector('.mapico')?.remove();
  if (v?.ti == null || !M.hits.has(v.ti)) return;
  f.insertAdjacentHTML('afterend', `<button type="button" class="mapico" data-mapword="${v.ti}" title="Show on the map" aria-label="Show on the map">${EUROPE_ICON}</button>`);
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
document.addEventListener('change', async ev => {
  const k = ev.target.dataset?.mapset; if (!k) return;
  await mapCfg(); M.cfg[k] = ev.target.checked; await saveMapCfg();
  if (k === 'mark') markPlaces();
});
document.addEventListener('DOMContentLoaded', () => {
  const b = $('#tabMap'); if (!b) return;
  b.innerHTML = EUROPE_ICON;
  b.addEventListener('click', () => { if (S.mapHeld) { S.mapHeld = false; return; } toggleMapTab(); });
  holdButton(b, v => S.mapHeld = v, async () => { if (S.tab !== 'map') { toggleMapTab(true); await showMap(); } if (M.map) layersPop(); });
});
