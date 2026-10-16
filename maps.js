// ================================================================ Pult · maps
// Optional packages (Instruments → Maps): "base" = land, lakes, rivers, modern borders and the map engine (MapLibre);
// "places" = the Pleiades gazetteer. The places of a text are found here, in the app: the lemma of every proper noun is
// looked up among the names of the gazetteer (any text, also imported ones). The reader can correct every place.
// Settings keys: mapPk (installed packages) · pl|<text>|<word> (correction of one passage) · plw|<work>|<name> (in a work)
// · plg|<name> (everywhere) · pown|<id> (own places) · mpos|<key> (map position) · mapCfg (layers, names, scope …)
const MAPS = 'maps/', MAPCACHE = 'pult-maps';
const M = { P: null, map: null, sel: null, hits: new Map(), scope: null, cfg: null, posKey: null, own: new Map() };
// the map button: the Mediterranean, cut off at the edges of the button – grey land on black, in colour when the map is open
const EUROPE_ICON = '<i class="eu" aria-hidden="true"></i>'; // map image: Natural Earth II (public domain), see style.css

// ---------------------------------------------------------------- settings of the map
async function mapCfg() {
  if (!M.cfg) {
    const saved = (await setting('mapCfg')) || {};
    if (!saved.v2) { delete saved.mark; saved.v2 = true; }                 // place names are no longer marked in the text by default
    if (!saved.v3) {                                                     // "Places from": switch + scale + selection (v123→124)
      saved.v3 = true;
      if (saved.scope === 'multi') { saved.sel = (saved.multi || []).map(k => k.startsWith('imp:') ? { kind: 'book', t: +k.slice(4), label: 'Imported text', sub: 'the whole text' } : { kind: 'work', w: k.slice(2), label: k.slice(2), sub: 'the whole work' }); saved.scope = 'sel'; }
      if (saved.scope === 'all' || saved.scope === 'none') saved.scope = 'section';
      if (saved.sites) saved.pfOn = false;
    }
    M.cfg = Object.assign({ mark: false, jump: true, pfOn: true, sel: [], scope: 'section', names: 'text', peoples: false, borders: false, rough: true, persons: 'unsure' }, JSON.parse(JSON.stringify(LCFG)), saved);
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
  if (p.id === 'places') { M.P = null; M.sitesFC = null; await placesForText(); }
  if (p.id === 'ancient' && M.map) { M.map.remove(); M.map = null; M.ancLab = null; }
}
async function deleteMapPkg(p) {
  const c = await caches.open(MAPCACHE);
  for (const f of p.files) await c.delete(new URL(MAPS + f, location.href).href);
  const inst = await mapInstalled(); delete inst[p.id]; await setting('mapPk', inst);
  if (p.id === 'places') { M.P = null; M.hits = new Map(); markPlaces(); }
  if ((p.id === 'base' || p.id === 'ancient') && M.map) { M.map.remove(); M.map = null; M.ancLab = null; }
  if (p.id === 'places') M.sitesFC = null;
}
// the Maps section of the Instruments dialog
async function mapSectionHTML() {
  const man = await mapManifest(), inst = await mapInstalled();
  if (!man) return '';
  const row = p => `<div class="item"><span class="t"><b>${esc(p.name)}</b><br><small>${esc(p.desc)} · ${(p.bytes / 1e6).toFixed(1)} MB</small></span>`
    + (inst[p.id] ? (inst[p.id] !== p.v ? `<button type="button" class="dlbtn" data-mapget="${p.id}">Update</button>` : '<button type="button" class="dlbtn" disabled>Installed</button>') + `<button type="button" class="danger" data-mapdel="${p.id}">Delete</button>`
      : `<button type="button" class="dlbtn" data-mapget="${p.id}">Download</button>`) + '</div>';
  M.man = man;
  return `<section class="dsec mapsec"><p class="hint small">Optional downloads for the map (the map button in the top bar). ${info('More layers can be added later as further packages.')}</p><div class="list plain">${man.packages.map(row).join('')}</div></section>`;
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
    const sm = g.closest('details.ifold')?.querySelector('summary small'); if (sm) sm.textContent = Object.keys(await mapInstalled()).length + ' installed';
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
    const c = placeCands(name, !!l || s0);
    if (!c.length) continue;
    let cue = null, person = false;
    for (const d of [-3, -2, -1, 1, 2, 3]) { const k = await keyAt(n + d); if (!k) continue; if (!cue && CUE.has(k)) cue = CUE.get(k); if (Math.abs(d) <= 2 && PERSON_CUES.has(k)) person = true; if (Math.abs(d) === 1 && TITLE_CUES.has(k) && k !== exKey(name)) person = true; }
    out.push({ i: tk.i, name, c, cue, person, stem: !l && !placeCands(name, true).length });
  }
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
        v -= 0.8 * Math.log(1 + p.names.length) + (p.ty.includes(urban) ? 1 : 0);         // well-known places first
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
  const t = S.text; await mapCfg(); if (!t) { M.hits = new Map(); return; }
  if (!(await loadPlaceIndex())) { M.hits = new Map(); markPlaces(); return; }
  const id = t.id, hits = await findPlaceHits(S.tokens);
  if (S.text?.id !== id) return;
  M.year = await workYear(t);
  M.hits = await choosePlaces(hits, textKeyOf(t), workKeyOf(t), M.year);
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
  if (!M.cfg?.pfOn) return 'All places';
  if (scope === 'sel') return 'Selection';
  if (scope === 'author') return S.text ? (S.text.work ? S.text.work.author || 'this author' : S.text.author || 'this author') + ' – all works' : 'this author';
  if (scope === 'work') return w ? w.title : 'whole text';
  if (scope === 'book') return w && w.books.length > 1 ? w.books[S.text.bi] : 'whole text';
  if (!cr) return 'whole text';
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
function showMap() { return M.showP ??= showMap1().finally(() => { M.showP = null; }); }   // one at a time
async function showMap1() {
  const box = $('#mapBody');
  const [base, places] = [await mapHas('base'), await mapHas('places')];
  if (!base || !places) {
    box.innerHTML = `<div class="mapmsg"><p>${EUROPE_ICON}</p><p>The map needs two downloads: <b>${[!base && 'Base map', !places && 'Ancient places'].filter(Boolean).join('</b> and <b>')}</b>.</p><button type="button" data-mapdl="1">Open Instruments → Maps</button></div>`;
    return;
  }
  await mapCfg();
  M.anc = await mapHas('ancient');
  if (M.anc) await loadAncientLabels();
  await loadPlaceIndex();
  timeFor(S.text);
  if (!M.map) {
    box.innerHTML = `<div id="mapCanvas"></div><div class="mlabels" id="mapLabels"></div>
      <div class="mtop"><button type="button" class="mscope" id="mapScope"></button><button type="button" class="mcheck" id="mapCheck" hidden></button></div>
      <div class="mctl"><button type="button" class="mico" id="mapLayersBtn" title="Layers" aria-label="Layers">${LAYERS_ICON}</button><button type="button" class="mico" id="mapTimeBtn" title="Period filter" aria-label="Period filter">${CLOCK_ICON}</button><button type="button" class="mico" id="mapSaveBtn" title="Saved maps and export" aria-label="Saved maps and export">${SAVE_ICON}</button></div>
      <div class="mtime" id="mapTime" hidden>${timeBarHTML()}</div>
      <div class="mcard" id="mapCard" hidden></div><div class="mpop" id="mapPop" hidden></div>`;
    try { await loadMapLib(); } catch (e) { box.innerHTML = `<div class="mapmsg"><p>${esc(e.message)}</p></div>`; return; }
    M.colors = mapColors();
    const v = (await setting('mpos|last')) || { c: [24, 38], z: 4 };
    M.map = new maplibregl.Map({ container: 'mapCanvas', style: mapStyle(M.colors), center: v.c, zoom: v.z, attributionControl: false, dragRotate: false, pitchWithRotate: false, maxZoom: 13, minZoom: 1 });
    M.map.touchZoomRotate.disableRotation();
    // the credits of the map are in ☰ → Acknowledgements (and on exported maps)
    M.map.on('move', () => { if (!M.lblRaf) M.lblRaf = requestAnimationFrame(() => { M.lblRaf = 0; drawLabels(); }); });
    M.map.on('moveend', () => { const c = M.map.getCenter(), z = M.map.getZoom(), v = { c: [+c.lng.toFixed(4), +c.lat.toFixed(4)], z: +z.toFixed(2) }; setting('mpos|last', v); if (M.posKey) setting('mpos|' + M.posKey, v); });
    M.map.on('mouseenter', 'sites', () => { M.map.getCanvas().style.cursor = 'pointer'; });
    M.map.on('mouseleave', 'sites', () => { M.map.getCanvas().style.cursor = ''; });
    M.map.on('click', e => { if (M.pick) { const p = M.pick; M.pick = null; $('#mapCanvas').classList.remove('picking'); p(e.lngLat); return; }
      const id = tapPlace(e.point); if (id != null) selectPlace(id, { from: 'map' }); else closeCard(); });
    M.map.on('mouseenter', 'pl', () => { M.map.getCanvas().style.cursor = 'pointer'; });
    M.map.on('mouseleave', 'pl', () => { M.map.getCanvas().style.cursor = ''; });
    await new Promise(r => M.map.once('load', r));
    wireMapUI(); wireTime();
  } else M.map.resize();
  renderTime();
  await refreshMapData();
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
  applyLayers();                                                    // (draws the labels)
}
// a tap on the map: the nearest place (circle or name) within reach of a finger tip
// (the names do not take touches themselves, so that pinching and panning work everywhere)
function tapPlace(pt) {
  const r = matchMedia('(pointer: coarse)').matches ? 20 : 9;
  const fs = M.map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]], { layers: ['pl', ...(M.map.getLayer('sites') ? ['sites'] : [])] });
  let best = null, bd = Infinity;
  for (const f of fs) { const c = M.map.project(f.geometry.coordinates), d = Math.hypot(c.x - pt.x, c.y - pt.y) - (f.layer.id === 'pl' ? 6 : 0); if (d < bd) { bd = d; best = f.properties.id; } }
  if (best != null) return best;
  const pad = r / 2;
  for (const [b, id] of M.lblHit || []) if (pt.x >= b[0] - pad && pt.x <= b[2] + pad && pt.y >= b[1] - pad && pt.y <= b[3] + pad) return id;
  return null;
}
// labels: drawn as text above the map (Greek and Latin in the reading font), without overlaps, most important first
function drawLabels() {
  const box = $('#mapLabels'); if (!box || !M.map || !M.shown) return;
  const W = box.clientWidth, H = box.clientHeight, placed = [], sel = M.sel?.p?.id;
  M.lblHit = [];
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
    placed.push(r); M.lblHit.push([r, o.x.p.id]);
    h += `<span class="mlbl${reg ? ' reg' : ''}${o.x.unsure && o.x.unsure === o.x.n ? ' unsure' : ''}${isWater(o.x.p) ? ' wat' : ''}${o.x.p.id === sel ? ' sel' : ''}${o.x.extra ? ' extra' : ''}" data-pid="${esc(String(o.x.p.id))}" style="left:${Math.round(x)}px;top:${Math.round(y)}px">${esc(txt)}</span>`;
  }
  box.innerHTML = h + moreLabels(placed, W, H);
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
    ${M.sel?.h?.unsure ? `<div class="munsure">⚑ ${UNSURE[M.sel.h.unsure]} <button type="button" data-mok="1">Yes, this place</button></div>` : ''}
    <div id="mapAlso"></div>
    <div class="mpass">${occ.length ? occ.map(o => `<button type="button" class="mps" data-mgo="${o.i}"><b>${multi ? esc(short[o.bi]) + ' · ' : ''}${esc(refOf(S.refs, o.i))}</b><span>${ctx(o.i)}</span></button>`).join('')
      : '<p class="hint small">Not named in this part of the text.</p>'}</div>
    <div class="macts">${w && multi && !['sel', 'author'].includes(M.cfg.scope) ? '<button type="button" data-mwork="1">All passages in this work</button>' : ''}${cur != null ? '<button type="button" data-mnone="1">Not a place here</button>' : ''}</div>
    <div id="mapChange" hidden></div>`;
  card.hidden = false;
  card.scrollTop = 0;
  if (M.cfg.pfOn && ['sel', 'author'].includes(M.cfg.scope)) cardMulti(p);
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
  else { closeCard(); toast('No longer marked as a place.'); }
  // learn from the correction: the same for the other passages of this name?
  if (v && sc === 'occ') {
    const k = exKey(s.name), others = [...M.hits].filter(([i, x]) => i !== s.i && exKey(x.name) === k && (v.none || x.p.id !== v.p)).length;
    const box = $('#mapAlso');
    if (others && box) box.innerHTML = `<div class="munsure">Also for the other ${others} passage${others === 1 ? '' : 's'} of ${esc(plainName(s.name))}? <button type="button" data-malso='${JSON.stringify(v)}' data-mwhere="book">In this part</button><button type="button" data-malso='${JSON.stringify(v)}' data-mwhere="work">In the whole work</button></div>`;
    else if (others && !h) toast(`${others} other passage${others === 1 ? '' : 's'} of ${plainName(s.name)} – change them on the map.`);
  }
}
function wireMapUI() {
  const box = $('#mapBody');
  box.addEventListener('click', async ev => {
    const b = ev.target.closest('button,.mlbl'); if (!b) return;
    const d = b.dataset;
    if (b.classList.contains('mlbl')) return selectPlace(d.pid, { from: 'map' });
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
      $('#mapAlso').innerHTML = ''; M.workCache = null; M.anyCache = null; await placesForText(); await refreshMapData(); toast('Applied.'); return;
    }
    if (await layerClick(b) || await savedClick(b)) return;
    if (b.id === 'mapScope') return scopePop();
    if (b.id === 'mapLayersBtn') return layersPop();
    if (b.id === 'mapSaveBtn') return savePop();
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
        const own = { id: 'o' + Date.now().toString(36), t: r.data.n.trim(), lat: +ll.lat.toFixed(4), lon: +ll.lng.toFixed(4), own: 1, ty: [], names: [] };
        M.own.set(own.id, own); await setting('pown|' + own.id, own);
        if (M.sel?.i != null) await saveCorrection({ p: own.id });
      };
      return;
    }
    if (d.mapdl) { const f = (await setting('instFold')) || {}; f.maps = true; await setting('instFold', f); return dictsDialog(); }
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
