/* Pult – the Suda tab (v422 as "People", renamed v423): persons from encyclopaedias and prosopographies (packages of kind "people"; for now William Smith's
   Dictionary of Greek and Roman Biography and Mythology), the People tab, and the marks on their names in the text.
   A package keeps its persons by number ("p:<n>", 64 each), an index of all names ("#ix": names -> numbers, and a short line
   per person) and, per library work, the passages where a person is cited ("w:<work>").
   Decisions 681–687, 732–737: every person goes in, marked by kinds (deity, hero, Homeric …) the reader may change; the
   sources of a person are shown separately, as in the dictionary; marks with a switch (Colours menu), unsure ones to check.
   (see core.js for the order of the scripts) */
'use strict';
const PP = { ix: new Map(), rec: new Map(), view: null, back: [], q: '' };
const PKINDS = ['deity', 'hero', 'Homeric', 'ruler', 'magistrate', 'military', 'author', 'philosopher', 'artist', 'physician', 'Christian', 'woman', 'family', 'senator', 'eques'];
// packages of persons (kind "people": also the marks in the text) and the other encyclopaedias (kind "encyclopedia": places, things)
const ENCK = new Set(['people', 'encyclopedia']);
const pplPkgs = (all = false) => Object.values(S.installed || {}).filter(d => (all ? ENCK.has(d.kind) : d.kind === 'people') && !S.dictPrefs?.off?.includes(d.id)).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
const sudaMerge = () => S.sudaMerge !== false;                   // Settings → Suda: the sections of one article as one entry (739)
async function pplRec(d, name) {               // one record of a package (cached: the index is read once)
  const id = d.id + '|' + d.version + '|' + name;
  if (PP.rec.has(id)) return PP.rec.get(id);
  const ddb = await dictDB(d.id), r = await req2p(ddb.transaction('b').objectStore('b').get(name)) || null;
  if (name !== '#ix') { if (PP.rec.size > 80) PP.rec.delete([...PP.rec.keys()].find(k => !k.endsWith('|#ix'))); }
  PP.rec.set(id, r); return r;
}
const pplIx = d => pplRec(d, '#ix');
async function pplEntry(d, i) { const r = await pplRec(d, 'p:' + (i >> 6)); return r?.e?.find(e => e.i === i) || null; }
const pref = (d, i) => d.id + '|' + i;
function pplParse(ref) { const j = ref.lastIndexOf('|'); return { d: S.installed?.[ref.slice(0, j)], i: +ref.slice(j + 1) }; }
// the short line of a person (from the index): name, number among those of the name, description, kinds, years, "see"
async function pplRow(d, i) { const ix = await pplIx(d), p = ix?.p?.[i]; if (!p) return null;
  const own = await setting('pk|' + pref(d, i));
  return { d, i, ref: pref(d, i), name: p[0], no: p[1], desc: p[2], kinds: own || (p[3] ? p[3].split(',') : []), y0: p[4], y1: p[5], see: p[6], sec: p[7] ?? null, ownKinds: !!own }; }
async function personsFor(k, all = false) {      // all persons (all: also places and things) with the key; sections of one article as one
  const out = [];
  for (const d of pplPkgs(all)) { const ix = await pplIx(d);
    for (const i of ix?.n?.[k] || []) { const sec = ix.p[i]?.[7]; const r = pref(d, sudaMerge() && sec != null ? sec : i); if (!out.includes(r)) out.push(r); } }
  return out;
}
// entries of other packages attached to this one (PIR persons found in Smith): [[package, [numbers]]]
async function attachedTo(d, i, maybe = false) {   // maybe: the entries that fitted this person and others equally (766)
  const out = [];
  for (const o of Object.values(S.installed || {})) { if (!ENCK.has(o.kind) || o.id === d.id || S.dictPrefs?.off?.includes(o.id)) continue;
    const at = await pplRec(o, '#at'); const m = at?.to === d.id ? at[maybe ? 'p' : 'm']?.[String(i)] : null; if (m?.length) out.push([o, m]); }
  return out;
}
const MYTHK = new Set(['deity', 'hero', 'Homeric']);      // (years an article mentions say nothing of a god's life)
const ppPlain = s => isGreek(s) ? s : String(s || '').normalize('NFD').replace(/[\u0304\u0306]/g, '').normalize('NFC');   // (Latin lemmata carry ā, ĕ)
const capital = s => { const c = String(s || '').normalize('NFD')[0] || ''; return c !== c.toLowerCase(); };
const yearTxt = y => y == null ? '' : y < 0 ? `${-y} BC` : `AD ${y}`;
const yearsTxt = (a, b) => a == null ? '' : a === b ? yearTxt(a) : (a < 0 && b < 0 ? `${-a}–${-b} BC` : a > 0 ? `AD ${a}–${b}` : `${yearTxt(a)} – ${yearTxt(b)}`);

// ---------------------------------------------------------------- the names in the open text
// S.prs: Map(word index -> {k, cands: [ref], pick: ref|null, sure, why})
// certain: chosen by the reader; cited by the source at this place; the only person of the name; the only one of the name
// cited in this work. Otherwise unsure (dotted) – "to check".
// ---- what counts as a name (decisions 743–749)
const PRAEN = new Set(['a', 'ap', 'c', 'cn', 'd', 'k', 'l', 'm', 'mam', 'n', 'num', 'p', 'post', 'q', 's', 'ser', 'sex', 'sp', 't', 'ti', 'tib', 'u', 'uol']);   // praenomina, abbreviated (744)
const TITLES = new Set(['augustus', 'caesar', 'καισαρ', 'σεβαστοσ', 'αυγουστοσ']);   // names only beside a name (744)
function isAdjWord(tk, lem, n) {
  if (tk.ctx?.t) return tk.ctx.t[0] === 'a';                 // the annotation of the text (GLAUx)
  if (isGreek(lem)) return S.lemmapos?.[gkey(lem)] === 'ADJ';   // (treebank word classes)
  // Latin: the dictionaries know "Gallus" and "Romanus" both as noun and adjective – an adjective only beside a common noun
  // in the same case ("populus Romanus"), not beside a name ("Gallus Caesar")
  if (!S.latAdj && S.latEngine) { const E = S.latEngine; S.latAdj = new Set(E.L.filter(l => (E.type === 'whitaker' ? E.P[l[1]] : l[2]) === 'ADJ').map(l => gkey(l[0]))); }
  if (!S.latAdj?.has(gkey(lem)) && S.latPos?.[gkey(lem)] !== 'ADJ' && !/\b(masc|fem|neut)\b/.test(tk.ana || '')) return false;
  for (const d of [-1, 1]) {
    let m = n + d; while (S.tokens[m]?.t === 'p' && !/\S/.test(S.tokens[m].s)) m += d;
    const o = S.tokens[m]; if (o?.t === 'w' && !capital(o.s) && o.pos === 'noun' && casesAgree(tk, o)) return true;
  }
  return false;
}
function numberOf(tk) {
  const c = tk.ctx?.t?.[2]; if (c && c !== '-') return c;    // s, p, d
  const a = tk.ana || ''; return /\bdual\b/.test(a) ? 'd' : /\bpl\b/.test(a) ? 'p' : /\bsg\b/.test(a) ? 's' : '';
}
const isNom = tk => tk.ctx?.t ? tk.ctx.t[7] === 'n' : /\bnom\b/.test(tk.ana || '');
const CASES = /\b(nom|gen|dat|acc|voc|abl|loc)\b/g;
function casesAgree(a, b) {                                   // two words of one name stand in the same case (where it is known)
  const ca = new Set((a.ana || '').match(CASES) || []), cb = new Set((b.ana || '').match(CASES) || []);
  return !ca.size || !cb.size || [...ca].some(x => cb.has(x));
}
function pluralKeys(l) {                                      // the plural of a name as a headword: Ἀτρεΐδης → Ἀτρεῖδαι, Musa → Musae, Scipio → Scipiones
  const k = gkey(l), out = [];
  if (isGreek(l)) { for (const [a, b] of [['ησ', 'αι'], ['ασ', 'αι'], ['οσ', 'οι'], ['α', 'αι'], ['η', 'αι'], ['ευσ', 'εισ']]) if (k.endsWith(a)) out.push(k.slice(0, -a.length) + b); }
  else for (const [a, b] of [['us', 'i'], ['a', 'ae'], ['es', 'ae'], ['o', 'ones'], ['as', 'ae']]) if (k.endsWith(a)) out.push(k.slice(0, -a.length) + b);
  return out;
}
const dialectKeys = k => isGreek(k) || /[α-ω]/.test(k) ? [k.endsWith('ησ') ? k.slice(0, -2) + 'ασ' : k.endsWith('ασ') ? k.slice(0, -2) + 'ησ' : null,
  k.endsWith('η') ? k.slice(0, -1) + 'α' : k.endsWith('α') ? k.slice(0, -1) + 'η' : null].filter(Boolean) : [];
async function familiesOf(cands) { const out = []; for (const c of cands) { const { d, i } = pplParse(c), r = await pplRow(d, i); if (r?.kinds.includes('family')) out.push(c); } return out; }
// a Latin name of several words ("Cn. Fabius Maximus", "Gallus Caesar"): the part whose persons best fit the other parts
const wordsOf = s => String(s || '').split(/[^A-Za-zÀ-ɏ.]+/).map(w => latkey(w.replace(/\.$/, ''))).filter(Boolean);
const partFits = (f, x) => x === f || (f.length >= 5 && x.length >= 5 && (x.startsWith(f.slice(0, -2)) || f.startsWith(x.slice(0, -2))));
async function groupHit(run) {
  const name = run.map(x => x.tk.s + (x.abbr ? '.' : '')).join(' ');
  const parts = run.filter(x => !x.abbr && !x.title && x.cands?.length);
  if (!parts.length) return null;
  let best = null;
  for (const p of parts) {
    const others = run.filter(x => x !== p).map(x => x.abbr ? { f: latkey(x.tk.s), ab: true } : { f: gkey(x.lem || x.tk.s) });
    const scored = [];
    for (const c of p.cands) { const { d, i } = pplParse(c), r = await pplRow(d, i); if (!r) continue;
      const ws = wordsOf(r.name + ' ' + r.desc); scored.push([c, others.filter(o => ws.some(x => o.ab ? x === o.f : partFits(o.f, x))).length]); }
    const top = Math.max(0, ...scored.map(x => x[1])); if (!top) continue;
    const fit = scored.filter(x => x[1] === top).map(x => x[0]);
    if (!best || fit.length < best.cands.length || (fit.length === best.cands.length && top >= best.top)) best = { k: p.k, cands: fit, top, full: fit.length === 1 && top === others.length };
  }
  if (!best) { const p = parts.reduce((a, b) => b.cands.length <= a.cands.length ? b : a); best = { k: p.k, cands: p.cands }; }
  return Object.assign(best, { name, k: 'g:' + run.filter(x => !x.abbr).map(x => gkey(x.lem || x.tk.s)).join(' ') + '|' + best.k });
}
// ---- identification tables (772): an edition's index of names for one work – which person (or place) a name is at a passage
async function identTables(wid, bi) {
  const out = [];
  for (const d of Object.values(S.installed || {})) {
    if (d.kind !== 'ident' || S.dictPrefs?.off?.includes(d.id)) continue;
    const r = await pplRec(d, '#id'); if (r?.work !== wid) continue;
    const at = new Map(), dflt = new Map(), book = +((await libGet('works', wid))?.books?.[bi] || '').replace(/\D/g, '');
    for (const [b, ref, j] of r.r) if (b === bi) { if (!at.has(ref)) at.set(ref, []); at.get(ref).push(j); }
    r.e.forEach((e, j) => { if (e[6]?.includes(book)) for (const k of e[5]) { if (!dflt.has(k)) dflt.set(k, []); dflt.get(k).push(j); } });
    // 775/777: your matches, kept under the index's name and number, so they hold for the same person in every volume of the index (and survive rebuilds)
    const own = new Map(); for (const x of await getAll('settings', IDBKeyRange.bound(`idm|${d.id}|`, `idm|${d.id}|￿`))) { const k = x.k.split('|').slice(2).join('|'); own.set(/^\d+$/.test(k) ? idKey(r.e[+k] || []) : k, x.v); }
    out.push({ d, e: r.e, r: r.r, at, dflt, own, src: 'identified by ' + (r.src || d.name) });
  }
  return out.length ? out : null;
}
// a Latin form and the index's name: the same once the endings are off ("Galli" ~ "Gallus", not "Constantii" ~ "Constans")
const LATEND = /(ibus|orum|arum|ius|ium|iis|ii|io|ia|ae|am|em|im|is|es|os|um|us|ui|a|e|i|o|u)$/;
const latStem = k => { const s = k.replace(LATEND, ''); return s.length >= 3 ? s : k; };
const stemFit = (a, b) => a === b || (!/[α-ω]/.test(a + b) && latStem(a) === latStem(b));
const idKey = e => gkey(e[0] || '') + '#' + (e[1] ?? '');   // 777: an index person = its name and number
function idOwn(T, j) { const c = T.e[j][7] ?? j, a = T.own.get(idKey(T.e[c])); return a !== undefined ? a : T.own.get(idKey(T.e[j])); }
function identHit(T, j) {                         // one entry of the index: its person (your match first), shown under its main entry
  const c = T.e[j][7] ?? j, o = idOwn(T, j);
  return { target: o === undefined ? T.e[c][4] || T.e[j][4] : o || null, ref: T.d.id + '|' + c, src: T.src };
}
// ---- 776: the table of reigns and consuls (Liebenam, Fasti consulares imperii Romani, 1909) – which emperor a name or a title means
async function fastiTab() {
  const d = Object.values(S.installed || {}).find(x => x.kind === 'fasti' && !S.dictPrefs?.off?.includes(x.id)); if (!d) return null;
  const key = d.id + '|' + d.version; if (PP.fasti?.key === key) return PP.fasti;
  const k = await pplRec(d, '#k'), by = await pplRec(d, '#by'), nd = await pplRec(d, '#nd'), c = await pplRec(d, '#c'), off = new Map();
  for (const [ref, os] of Object.entries(by || {})) { if (ref === 'b') continue;
    off.set(ref, [...(off.get(ref) || []), ...os]);
    const { d: dd, i } = pplParse(ref), sec = dd ? (await pplIx(dd))?.p?.[i]?.[7] : null;   // (739: the sections of one article as one)
    if (sec != null) { const r2 = pref(dd, sec); off.set(r2, [...(off.get(r2) || []), ...os]); } }
  return PP.fasti = { key, d, k: k?.e || [], off, nd: nd || {}, c: c || {} };
}
async function narrYears(t) {                    // the years the book being read narrates (so far: Ammianus) – [from, to] or null
  const F = await fastiTab(), m = t?.work ? F?.nd?.[t.work.id] : null; if (!m) return null;
  const lab = (await libGet('works', t.work.id))?.books?.[t.bi] || '';
  return m[lab] || m[+lab.replace(/\D/g, '')] || m['*'] || null;    // (781a: by the book's label; "*" a whole work, e.g. a life)
}
const caesarFrom = e => Math.min(e[4], e[6] ?? e[4]);
function inOffice(F, ny, cands) {                // the candidates who were emperor (or Caesar) in the years the book narrates
  if (!F || !ny) return [];
  return cands.filter(c => (F.off.get(c) || []).some(o => o[0] === 'emp' && F.k[o[1]] && caesarFrom(F.k[o[1]]) <= ny[1] && F.k[o[1]][5] >= ny[0]));
}
function titleAt(F, ny, k) {                     // "Augustus" / "Caesar" alone: the one emperor who held it all through those years
  if (!F || !ny) return null;
  const aug = k === 'augustus' || k === 'imperator';
  const early = ny[1] < 138;                     // (before Hadrian "Caesar" alone is the emperor himself)
  const es = F.k.filter(e => e[10]?.length && (aug || early ? e[7] === 'A' && e[4] <= ny[1] && e[5] >= ny[0]
    : (e[7] === 'A' || e[7] === 'C') && e[6] != null && e[6] <= ny[1] && Math.min(e[4], e[5] + 1) > ny[0]));
  return es.length === 1 ? es[0] : null;
}
// 782a: consular dates in the text ("consulatu Constantii deciens, terque Iuliani", "Datiano et Cereali consulibus")
function consulIndex(F) {                         // the consuls' names by stem -> [{y, sl, j, it, refs}]
  if (F.ci) return F.ci; const ci = new Map();
  for (const [y, v] of Object.entries(F.c)) { if (y === 'b' || !v) continue;
    for (const sl of ['o', 's']) (v[sl] || []).forEach((p, j) => {
      for (const w of new Set(String(p[0]).split(/[\s.,;:()[\]]+/))) {
        if (w.length < 3 || !/^[A-Z]/.test(w) || /^(Imp|Flavius|Caesar|Augustus|Aug|Nob)$/.test(w)) continue;
        const k = latStem(latkey(w)); if (!ci.has(k)) ci.set(k, []); ci.get(k).push({ y: +y, sl, j, it: p[1], refs: p[4] || [] }); } }); }
  return F.ci = ci;
}
const ITER = { iterum: 2, bis: 2, ter: 3, tertium: 3, quater: 4, quartum: 4, quinquies: 5, quinquiens: 5, sexies: 6, sexiens: 6, septies: 7, septiens: 7,
  octies: 8, octiens: 8, novies: 9, noviens: 9, nouies: 9, nouiens: 9, decies: 10, deciens: 10, undecies: 11, undeciens: 11, duodecies: 12, duodeciens: 12 };
const ROMV = { ii: 2, iii: 3, iiii: 4, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, viiii: 9, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13 };
function iterAt(w) { if (!w) return null; const g = gkey(w.s).replace(/que$/, ''); return ITER[g] || (/^[IVX]+$/.test(w.s) ? ROMV[g] : null) || null; }
function consularDates(F, ny) {                   // -> [{y, at: word index, names: [{w, refs}]}]
  if (!F?.c || !S.tokens) return [];
  const ci = consulIndex(F), W = S.tokens.filter(t => t.t === 'w' && !isGreek(t.s)), out = [];
  for (let a = 0; a < W.length; a++) {
    const g = gkey(W[a].lemma || W[a].s), f = gkey(W[a].s);
    if (!/^(consul|consulatus|cos|coss)$/.test(g) && !/^(consul(is|i|em|e|es|um|ibus|atu|atus|atum|atui)?|coss?)$/.test(f)) continue;   // (not "senatus consulto")
    const names = [];
    for (let b = Math.max(0, a - 10); b <= Math.min(W.length - 1, a + 10); b++) {
      const w = W[b]; if (b === a || !capital(w.s) || TITLES.has(gkey(w.lemma || w.s))) continue;
      const k = latStem(gkey(w.lemma && capital(w.lemma) ? w.lemma : w.s)), hs = ci.get(k); if (!hs) continue;
      const it = iterAt(W[b + 1]) || iterAt(W[b - 1]);
      names.push({ w, hs: it ? hs.filter(h => h.it === it) : hs });
    }
    const slots = new Map();                       // year -> {consul: the words of the text naming him}
    for (const n of names) for (const h of n.hs) {
      if (ny && (h.y < ny[0] - 5 || h.y > ny[1] + 5)) continue;   // (a book of known years: a consular date of those years)
      if (!slots.has(h.y)) slots.set(h.y, new Map()); const m = slots.get(h.y); if (!m.has(h.sl + h.j)) m.set(h.sl + h.j, new Set()); m.get(h.sl + h.j).add(n.w.i); }
    const two = m => { const c = [...m.values()]; return c.some((a, i) => c.some((b, j) => j > i && [...a].some(x => [...b].some(y => y !== x)))); };
    const ys = [...slots].filter(([, m]) => two(m)).map(([y]) => y);   // two consuls of one year, named by two different words
    if (ys.length !== 1) continue;
    if (!ny && !names.some(n => n.hs.some(h => h.y === ys[0]) && new Set(n.hs.map(h => h.y)).size <= 8)) continue;   // (no known years: one name rare enough)
    const y = ys[0], ns = names.map(n => ({ w: n.w, h: n.hs.find(h => h.y === y) })).filter(n => n.h);
    if (out.some(o => o.y === y && Math.abs(o.at - W[a].i) < 30)) continue;
    out.push({ y, at: W[a].i, trig: W[a].s, names: ns.map(n => ({ w: n.w, refs: n.h.refs })) });
  }
  return out;
}
function officesHTML(F, ref) {                   // a person's offices from the table (person page)
  const os = F?.off.get(ref); if (!os?.length) return '';
  const em = [...new Set(os.filter(o => o[0] === 'emp').map(o => o[1]))].map(j => F.k[j]).filter(Boolean);
  const co = os.filter(o => o[0] === 'cos').sort((a, b) => a[1] - b[1]), seen = new Set(), cs = [];
  for (const o of co) { const t = (o[1] < 0 ? -o[1] + ' BC' : o[1]) + (o[2] > 1 ? ` (${['', '', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'VIIII', 'X'][o[2]] || o[2] + '×'})` : '') + (o[3] === 's' ? ' suff.' : '');
    if (!seen.has(t)) { seen.add(t); cs.push(t); } }
  let h = '';
  for (const e of em) h += e[7] === 'C' ? `<div><b>Caesar</b> ${esc(e[2])} – ${esc(e[3])} <small>(${esc(e[0])}; Clinton, Fasti Romani)</small></div>`
    : `<div><b>${e[7] === 'U' ? 'Usurper' : 'Emperor'}</b> ${esc(e[0])}: ${e[6] != null && e[6] < e[4] ? `Caesar ${e[6] < 0 ? -e[6] + ' BC' : e[6]}, ` : ''}${esc(e[2])} – ${esc(e[3])}${e[8] ? ` <small>(${e[8] === 'W' ? 'West' : 'East'})</small>` : ''}</div>`;
  if (cs.length) h += `<div><b>Consul</b> ${cs.map(esc).join(' · ')}</div>`;
  return h ? `<div class="ppoff">${h}<small class="hint">from Liebenam, Fasti consulares (1909)</small></div>` : '';
}
function identAt(tabs, tk, ref) {
  if (!ref) return null;
  const ks = [...new Set([tk.lemma, tk.s].filter(Boolean).map(gkey))], ch = String(ref).split('.')[0];
  for (const T of tabs) {
    const js = [...new Set([...(T.at.get(ref) || []), ...(T.at.get(ch) || [])])].filter(j => T.e[j][5].some(k => ks.some(x => stemFit(x, k))));
    const ps = js.filter(j => T.e[j][3] === 'p' || (T.e[j][3] === '?' && (T.e[j][4] || T.e[j][7] != null))), ls = js.filter(j => T.e[j][3] === 'l');   // ('?': no description – used only when matched)
    const tg = new Set(ps.map(j => identHit(T, j).target || 'r' + (T.e[j][7] ?? j)));
    if (ps.length && tg.size === 1) return identHit(T, ps[0]);
    if (!ps.length && ls.length) return { place: true };
    if (ps.length) return null;                                   // two persons of the name at one place: the rules decide
    const dj = [...new Set(ks.flatMap(k => [...T.dflt.keys()].filter(x => stemFit(k, x)).flatMap(x => T.dflt.get(x))))].filter(j => T.e[j][3] !== 'l' && T.e[j][4]);
    if (dj.length === 1) return Object.assign(identHit(T, dj[0]), { dflt: true });
  }
  return null;
}
async function personsForText() {
  const t = S.text, run = personsForText.run = (personsForText.run || 0) + 1;
  S.prs = new Map();
  const pk = pplPkgs(), idt = t?.work ? await identTables(t.work.id, t.bi) : null;
  if (!t || (!pk.length && !idt)) { markPersons(); return; }
  const fix = (await setting('prs|' + workKeyOfText(t))) || { k: {}, t: {} };
  const cited = new Set(), here = new Map();               // persons cited in this work; reference -> persons cited there
  if (t.work) for (const d of pk) {
    const r = await pplRec(d, 'w:' + t.work.id);
    for (const [bi, ref, i] of r?.r || []) { cited.add(pref(d, i)); if (bi === t.bi) { if (!here.has(ref)) here.set(ref, new Set()); here.get(ref).add(pref(d, i)); } }
  }
  const R = S.refs || [], near = new Map();               // word index -> persons cited in its section (verse: two lines either side)
  if (here.size) R.forEach((r, j) => { const set = new Set(); for (let x = Math.max(0, j - (R.verse ? 2 : 0)); x <= Math.min(R.length - 1, j + (R.verse ? 2 : 0)); x++) for (const p of here.get(R[x].s) || []) set.add(p);
    if (set.size) near.set(j, set); });
  // pass 1: every word that may be (part of) a name, with its candidates; null where a name cannot go on (punctuation, a block)
  const memo = new Map(), items = [], rjOf = new Map(); let rj = -1, start = true;
  // 753a: nobody who lived after the text was written (Smith: the earliest year his article mentions; PIR: the imperial period)
  const wy = typeof workYear === 'function' ? await workYear(t).catch(() => null) : null, ixs = new Map();
  const F = await fastiTab(), ny = await narrYears(t);            // 776: the table of reigns, the years this book narrates
  for (const d of pk) ixs.set(d.id, await pplIx(d));
  const early = c => { if (wy == null) return true; const { d, i } = pplParse(c); const y0 = d?.id === 'people-pir' ? -31 : ixs.get(d?.id)?.p?.[i]?.[4]; return y0 == null || y0 <= wy + 40; };   // (DPRR: the beginning of the person's era)
  const look = async k => { if (!k) return []; let c = memo.get(k); if (!c) memo.set(k, c = (await personsFor(k)).filter(early)); return c; };
  for (let n = 0; n < S.tokens.length; n++) {
    const tk = S.tokens[n];
    if (tk.t === 'b') { if (tk.k !== 'l' && tk.k !== 'L') start = true; items.push(null); continue; }   // (a verse line is no new sentence)
    if (tk.t === 'p') {
      const prev = items[items.length - 1];
      if (prev?.abbr && /^\.\s*$/.test(tk.s)) continue;     // "Cn. Pompeius": the point of an abbreviation ends no sentence
      if (/[.!?;:·]/.test(tk.s)) start = true;
      if (/\S/.test(tk.s.replace(/[ʼ’'᾽]/g, ''))) items.push(null);
      continue;
    }
    if (tk.t !== 'w') continue;
    const st = start; start = false;
    while (rj + 1 < R.length && R[rj + 1].i <= tk.i) rj++;
    rjOf.set(tk.i, rj);
    const lem = tk.lemma || null, lat = !isGreek(tk.s), capF = capital(tk.s), capL = lem && capital(lem);
    const nx = S.tokens[n + 1];
    if (lat && capF && PRAEN.has(latkey(tk.s)) && nx?.t === 'p' && /^\./.test(nx.s)) { items.push({ tk, abbr: true, lat, st }); continue; }   // 744
    const lowOk = lem && !capL && capF && !st;                // 748: a capital mid-sentence beats a lemma in small letters (Ἠώς, Θρασύβουλος)
    if (lem ? !(capL || lowOk) : !capF) { items.push(null); continue; }
    const idh = idt ? identAt(idt, tk, R[rj]?.s) : null;        // 771: an edition's index of names says who (or what) is meant here
    if (idh?.place) { items.push(null); continue; }
    if (!idh && capL && isAdjWord(tk, lem, n)) { items.push(null); continue; }   // 743a: "Ἀθηναῖος", "Ὀλύμπιος" – the morphology calls it an adjective
    const num = numberOf(tk);
    let k = gkey(lowOk ? tk.s : lem || tk.s), cands = [];
    if (num === 'p') {                                         // 746: plural – only groups and families (the Dioscuri, the Muses, the Gracchi)
      for (const pk of new Set([gkey(tk.s), ...pluralKeys(lem || tk.s)])) { const c = await look(pk); if (c.length) { k = pk; cands = c; break; } }
      if (!cands.length) cands = await familiesOf(await look(k));
      if (!cands.length && !idh) { items.push(null); continue; }
    } else {
      cands = await look(k);
      if (!cands.length && lowOk) { const c = await look(gkey(lem)); if (c.length) { k = gkey(lem); cands = c; } }   // ("Θρασυβούλου": the lemma θρασύβουλος)
      for (const v of cands.length ? [] : dialectKeys(k)) { const c = await look(v); if (c.length) { k = v; cands = c; break; } }   // 747: Τήρας ~ Τήρης
      if (!cands.length && lem && gkey(tk.s) !== k && isNom(tk)) { const c = await look(gkey(tk.s)); if (c.length) { k = gkey(tk.s); cands = c; } }   // 747: the form, only a nominative
    }
    items.push({ tk, k, cands, st, lem, lat, title: TITLES.has(k), idh });
    if (run !== personsForText.run) return;
  }
  // pass 2: Latin names of several words read together (745); the rest word by word
  const decide = (cands, ti, k, st, lem, why0, idh) => {
    const ft = fix.t?.[t.bi + ':' + ti] ?? fix.t?.[ti], fk = fix.k?.[k];
    if (ft === 0 || (ft == null && fk === 0)) return null;     // "not a person"
    if (ft || fk) return { pick: ft || fk, sure: true, why: 'chosen by you' };
    if (idh) return { pick: idh.target || idh.ref, sure: !idh.dflt, why: (idh.dflt ? 'probably – ' : '') + idh.src + (idh.dflt ? ' (the usual person of this name in these books)' : '') + (idh.target ? '' : ' – in no encyclopaedia installed') };
    const nh = near.get(rjOf.get(ti)), c1 = nh ? cands.filter(c => nh.has(c)) : [], cw = cands.filter(c => cited.has(c));
    if (c1.length === 1) return { pick: c1[0], sure: true, why: 'cited by the source at this place' };
    if (!lem && st) return null;                                // no lemma, at the start of a sentence: "Mene …" is no name
    if (cands.length === 1) return { pick: cands[0], sure: true, why: why0 || 'the only person of this name' };
    const em = inOffice(F, ny, cands);                         // 776: the emperor (or Caesar) of the years the book narrates
    if (em.length === 1) return { pick: em[0], sure: false, why: `probably – the emperor or Caesar in ${ny[0] === ny[1] ? 'AD ' + ny[0] : 'AD ' + ny[0] + '–' + ny[1]}, the years this book narrates (Liebenam’s table of emperors)` };
    if (cw.length === 1) return { pick: cw[0], sure: false, why: 'probably – the only one of this name cited in this work' };   // 749: a preference, to check
    return { pick: null, sure: false, why: `${cands.length} persons of this name` };
  };
  const put = (h, its) => { h.grp = its.map(x => x.tk.i); for (const x of its) S.prs.set(x.tk.i, h); };
  for (let j = 0; j < items.length;) {
    if (!items[j]) { j++; continue; }
    let e = j + 1;                                             // a run of Latin name words (cases agreeing)
    if (items[j].lat) while (e < items.length && items[e]?.lat && casesAgree(items[e - 1].tk, items[e].tk)
      && !(items[e].abbr && items.slice(j, e).some(x => !x.abbr))      // "Cethego P. Sempronio": the praenomen begins the next name
      && !/(que|ve)$/i.test(items[e].tk.s)) e++;                        // "Hannonem Magonemque": two persons
    let seq = items.slice(j, e); j = e;
    while (seq.length > 1 && seq[seq.length - 1].abbr) seq = seq.slice(0, -1);   // "Constantio A.": no name follows
    if (seq.length === 1) {
      const x = seq[0];
      if (x.title && !x.idh && !x.abbr) {                       // 744/776: "Augustus", "Caesar" alone – the one who held the title in those years
        const e = titleAt(F, ny, x.k), ft = fix.t?.[t.bi + ':' + x.tk.i] ?? fix.t?.[x.tk.i];
        if (ft === 0) continue;
        if (ft) { put({ k: x.k, cands: [ft], pick: ft, sure: true, why: 'chosen by you' }, seq); continue; }
        if (e) put({ k: x.k, cands: [...e[10]], pick: e[10][0], sure: false, why: `probably – ${e[0]}, ${x.k === 'caesar' ? 'the Caesar' : 'the Augustus'} in the years this book narrates (Liebenam’s table of emperors)` }, seq);
        continue;
      }
      if (x.abbr || (!x.cands?.length && !x.idh)) continue;
      const d = decide(x.cands, x.tk.i, x.k, x.st, x.lem, null, x.idh); if (d) put(Object.assign({ k: x.k, cands: x.cands }, d), seq);
      continue;
    }
    const gi = seq.find(x => x.idh && !x.title)?.idh || seq.find(x => x.idh)?.idh;
    const g = await groupHit(seq) || (gi ? { k: seq.find(x => x.idh).k, cands: [], name: seq.map(x => x.tk.s + (x.abbr ? '.' : '')).join(' ') } : null);
    if (!g) continue;
    const d = decide(g.cands, seq[0].tk.i, g.k, seq[0].st && !seq[0].abbr, seq.some(x => x.lem), g.full ? 'the whole name fits' : null, gi);
    if (d) put(Object.assign({ k: g.k, cands: g.cands, name: g.name }, d), seq);
  }
  if (run !== personsForText.run) return;
  S.consDates = [];                                            // 782a: consular dates – both consuls certain, the passage dated
  for (const cd of consularDates(F, ny)) {
    S.consDates.push({ y: cd.y, i: cd.at, ref: refAt(cd.at), trig: cd.trig, names: cd.names.map(n => n.w.s) });
    for (const n of cd.names) {
      const old = S.prs.get(n.w.i); if (old && (old.why === 'chosen by you' || /^(probably – )?identified by/.test(old.why))) continue;
      const ft = fix.t?.[t.bi + ':' + n.w.i] ?? fix.t?.[n.w.i]; if (ft != null) continue;
      if (!n.refs.length) { if (old) S.prs.delete(n.w.i); continue; }
      put({ k: gkey(n.w.lemma || n.w.s), cands: [...n.refs], pick: n.refs[0], sure: true, why: `consul of ${cd.y < 0 ? -cd.y + ' BC' : 'AD ' + cd.y}, named in a consular date (Liebenam’s list of consuls)` }, [{ tk: n.w }]);
    }
  }
  markPersons();
  if (S.tab === 'people' && (!PP.view || PP.view.t === 'text')) pplRender();
  if (S.tab === 'tempora' && typeof showTempora === 'function') showTempora();   // (the consular dates of this text)
}
const workKeyOfText = t => t?.work ? t.work.id : 'imp:' + t?.id;
async function prsMarkOn() { return (S.prsMark ??= (await setting('prsMark')) ?? true); }
function markPersons() {
  document.querySelectorAll('#textBody .w.prs').forEach(e => e.classList.remove('prs', 'prsq'));
  if (S.prsMark === false || !S.wordEls || !S.prs) return;
  for (const [i, h] of S.prs) { const e = S.wordEls[i]; if (!e) continue; e.classList.add('prs'); if (!h.sure) e.classList.add('prsq'); }
}
function markPersonsIn(c) {                       // a part of a long text just drawn (text.js chDecorate)
  if (S.prsMark === false || !S.prs?.size) return;
  for (let i = c.w0; i <= c.w1; i++) { const h = S.prs.get(i); if (!h) continue; const e = S.wordEls[i]; e?.classList.add('prs'); if (!h.sure) e?.classList.add('prsq'); }
}
document.addEventListener('change', async ev => {      // Settings → Suda: the sections of one article as one entry
  if (ev.target.dataset?.sudamerge == null) return;
  S.sudaMerge = ev.target.checked; await setting('sudaMerge', S.sudaMerge); await personsForText(); if (S.tab === 'people') pplRender();
});
document.addEventListener('change', async ev => {      // Settings → Reading → Colourisation: the switch for the marks
  if (ev.target.dataset?.prsmark == null) return;
  S.prsMark = ev.target.checked; await setting('prsMark', S.prsMark); markPersons();
});

// ---------------------------------------------------------------- the Suda tab (the element ids keep the old name "people")
// views: {t:'text'} the names of the open text (to check first) · {t:'person', ref} · {t:'search', q} · {t:'name', k, ti} the persons of a name
function pplGo(v, push = true) { if (push && PP.view) { PP.back.push(PP.view); if (PP.back.length > 60) PP.back.shift(); } PP.view = v; pplRender(); $('#dictPane').scrollTop = 0; }
function pplWordTapped(ti) {                     // a word tapped while the Suda tab is open: its person, or all its entries; the dictionary behind
  const h = S.prs?.get(ti);
  if (h) pplGo(h.pick ? { t: 'person', ref: h.pick, ti } : { t: 'name', k: h.k, ti });
  else { const tk = S.tokens.find(x => x.t === 'w' && x.i === ti); if (!tk) return false; pplGo({ t: 'word', form: tk.s, lemma: tk.lemma || null, ti }); }
  return true;
}
async function showPeople() { showTab('people'); if (!PP.view) PP.view = { t: 'text' }; await pplRender(); }
// the bar (back · search · "In this text") is drawn once and stays: typing never redraws the field; only #pplRes changes.
// Each drawing is numbered: one that finishes after a newer one has started is dropped (a slow search for "Pe" cannot
// overwrite the results for "Peric")
function pplShell() {
  const body = $('#peopleBody'); if (!body) return null;
  if (!$('#pplQ')) body.innerHTML = `<form class="pptop" id="pplBar" action="#"><button type="button" class="ppback" data-ppback="1" aria-label="Back" title="Back">‹</button>`
    + `<input id="pplQ" type="search" enterkeyhint="search" placeholder="Find a person …" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">`
    + `<button type="button" data-pptext="1" class="pptxt">In this text</button></form><div id="pplRes"></div>`;
  return $('#pplRes');
}
async function pplRender() {
  const res = pplShell(); if (!res) return;
  const n = PP.rn = (PP.rn || 0) + 1;
  const v = PP.view || (PP.view = { t: 'text' });
  $('#peopleBody .ppback').disabled = !PP.back.length; $('#peopleBody .pptxt').disabled = v.t === 'text';
  const q = $('#pplQ'); if (v.t !== 'search' && document.activeElement !== q) q.value = '';
  let h;
  if (!pplPkgs(true).length && !S.installed?.suda) h = `<p class="hint">No encyclopaedia installed yet. Open the menu ☰ → Instruments → Suda – Encyclopaedias and Lexica and download one, e.g. “William Smith, A Dictionary of Greek and Roman Biography and Mythology”.</p>`;
  else if (v.t === 'person') h = await pplPersonHTML(v.ref, v.ti);
  else if (v.t === 'word') h = await pplWordHTML(v.form, v.lemma, v.ti);
  else if (v.t === 'idmatch') h = await pplIdMatchHTML();
  else if (v.t === 'search') h = await pplSearchHTML(v.q, v.all);
  else if (v.t === 'name') h = await pplNameHTML(v.k, v.ti);
  else h = await pplTextHTML();
  if (n !== PP.rn) return;                                    // a newer drawing has started meanwhile
  if (v.t === 'search' && v.all && h.rows) { res.innerHTML = h.head; pplRowsInto(res.querySelector('.list'), h.rows, n); return; }
  res.innerHTML = typeof h === 'string' ? h : h.head.replace('<div class="list plain"></div>', `<div class="list plain">${h.rows.join('')}</div>`);
  if (v.t === 'person' || v.t === 'word') res.querySelectorAll('details.src').forEach(el => wrapGreek(el));
}
function pplRowsInto(list, rows, n, from = 0) {                // all the results (Enter): drawn 300 at a time
  if (!list || n !== PP.rn) return;
  list.insertAdjacentHTML('beforeend', rows.slice(from, from + 300).join(''));
  if (from + 300 < rows.length) requestAnimationFrame(() => pplRowsInto(list, rows, n, from + 300));
}
const kindChips = (r, edit) => `<span class="ppkinds">${r.kinds.map(k => `<span class="ppk">${esc(k)}</span>`).join('')}${edit ? `<button type="button" class="ppkedit" data-ppkinds="${esc(r.ref)}" title="Change the kinds">${r.kinds.length ? 'edit' : '+ kind'}</button>` : ''}</span>`;
const srcTag = d => d.id === 'people-smith' ? '' : ` <small class="ppsrc">${esc({ 'people-pir': 'PIR', 'people-dprr': 'DPRR', 'enc-smith-geo': 'Geography', 'enc-smith-ant': 'Antiquities', 'enc-stephanus': 'Stephanus' }[d.id] || (d.kind === 'ident' ? 'index' : d.name))}</small>`;
const rowHTML = (r, extra = '') => `<button type="button" class="pprow" data-ppref="${esc(r.ref)}"><span class="ppn"><b>${esc(r.name)}</b>${srcTag(r.d)}${r.no ? ` <small>${r.no}</small>` : ''}${r.y0 != null && !r.kinds.some(k => MYTHK.has(k)) ? ` <small class="ppy">${yearsTxt(r.y0, r.y1)}</small>` : ''}</span><span class="ppd">${esc(r.desc || '')}</span>${r.kinds.length ? kindChips(r) : ''}${extra}</button>`;
async function pplTextHTML() {
  const t = S.text; if (!t) return '<p class="hint">Open a text: the persons named in it are listed here.</p>';
  const tabs = t.work ? await identTables(t.work.id, t.bi) : null, n = tabs ? (await idMatchList(tabs)).length : 0;
  const idl = n ? `<div class="ppidm"><button type="button" class="pprow" data-ppidm="1"><span class="ppn"><b>Persons of the index to match</b> <small>${n}</small></span><span class="ppd">${esc(tabs[0].src.replace(/^identified by /, ''))}: persons not yet matched, though the encyclopaedias have someone of the name</span></button></div>` : '';
  const by = new Map();
  for (const [i, x] of S.prs || []) { if (x.grp && x.grp[0] !== i) continue;     // (a name of several words: once)
    const id = (x.sure ? '' : '?') + (x.pick || x.k); let g = by.get(id); if (!g) by.set(id, g = { x, is: [] }); g.is.push(i); }
  if (!by.size) return idl + `<p class="hint">No names of persons found in this part${S.morph || S.latMorph ? '' : ' (the names are recognised from the lemmata – install the morphological analysis: ☰ → Instruments → Analysis)'}.</p>`;
  const unsure = [], sure = [];
  for (const [id, g] of by) (g.x.sure ? sure : unsure).push([id, g]);
  const occ = g => `<span class="ppocc">${g.is.slice(0, 12).map(i => `<button type="button" data-ppjump="${i}">${esc(refAt(i) || '·')}</button>`).join('')}${g.is.length > 12 ? `<small>+${g.is.length - 12}</small>` : ''}</span>`;
  let h = idl;
  if (unsure.length) {
    h += `<div class="navh3">To check <small>${unsure.length}</small></div><div class="list plain">`;
    for (const [, g] of unsure.sort((a, b) => a[1].is[0] - b[1].is[0])) {
      const tk = S.tokens.find(x => x.t === 'w' && x.i === g.is[0]);
      let prob = ''; if (g.x.pick) { const { d, i } = pplParse(g.x.pick), r = d && await pplRow(d, i); if (r) prob = ` – ${esc(r.name)}${r.no ? ' ' + r.no : ''}: ${esc(r.desc)}`; }
      h += `<div class="ppchk"><button type="button" class="pprow" data-ppname="${esc(g.x.k)}" data-ti="${g.is[0]}"><span class="ppn"><b>${esc(g.x.name || ppPlain(tk?.lemma || tk?.s) || g.x.k)}</b></span><span class="ppd">${esc(g.x.why)}${prob} – choose</span></button>${occ(g)}</div>`;
    }
    h += '</div>';
  }
  if (sure.length) {
    h += `<div class="navh3">Named in this part <small>${sure.length}</small></div><div class="list plain">`;
    const rows = [];
    for (const [id, g] of sure) { const { d, i } = pplParse(id); const r = d && await pplRow(d, i); if (r) rows.push([r, g]); }
    rows.sort((a, b) => a[1].is[0] - b[1].is[0]);
    for (const [r, g] of rows) h += `<div class="ppchk">${rowHTML(r, `<span class="ppwhy">${esc(g.x.why)}</span>`)}${occ(g)}</div>`;
    h += '</div>';
  }
  return h;
}
async function pplNameHTML(k, ti) {             // the persons of a name: choose one (for this work, or this place only)
  const hh = ti != null ? S.prs?.get(ti) : null, cands = hh?.k === k ? hh.cands : await personsFor(k), rows = [];
  for (const c of cands) { const { d, i } = pplParse(c); const r = await pplRow(d, i); if (r) rows.push(r); }
  const tk = ti != null ? S.tokens.find(x => x.t === 'w' && x.i === ti) : null, h0 = ti != null ? S.prs?.get(ti) : null;
  let h = `<div class="pphead"><div class="ppname">${esc(hh?.name || ppPlain(tk?.lemma || tk?.s) || k)}</div><div class="ppmeta">${rows.length} person${rows.length === 1 ? '' : 's'} of this name${tk ? ` · at ${esc(refAt(ti) || '')}` : ''}</div></div>`;
  if (tk) h += `<p class="hint small">Choose who is meant: “this one” for every <i>${esc(hh?.name || ppPlain(tk.lemma || tk.s))}</i> in this work, “here only” for this place. ${h0?.pick ? '' : ''}</p>`;
  h += '<div class="list plain">';
  for (const r of rows) h += `<div class="ppchk">${rowHTML(r)}${tk ? `<span class="ppchoose"><button type="button" data-ppfix="${esc(r.ref)}" data-k="${esc(k)}">This one</button><button type="button" data-ppfix="${esc(r.ref)}" data-k="${esc(k)}" data-ti="${ti}">Here only</button></span>` : ''}</div>`;
  h += '</div>';
  if (tk) h += `<div class="ppnot"><button type="button" data-ppfix="0" data-k="${esc(k)}">Not a person</button><button type="button" data-ppfix="0" data-k="${esc(k)}" data-ti="${ti}">Not a person here</button>${h0 && (h0.why === 'chosen by you') ? `<button type="button" data-ppfix="" data-k="${esc(k)}" data-ti="${ti}">Undo my choice</button>` : ''}</div>`;
  return h;
}
async function pplSearchHTML(q, all = false) {
  const k = gkey(q); if (!k) return '<p class="hint">Type a name – Greek or Latin letters. Enter shows all results.</p>';
  const hits = [];
  for (const d of pplPkgs(true)) { const ix = await pplIx(d); if (!ix) continue;
    for (const key of Object.keys(ix.n)) if (key.startsWith(k)) for (const i of ix.n[key]) { const sec = ix.p[i]?.[7]; hits.push({ d, i: sudaMerge() && sec != null ? sec : i, exact: key === k, key }); } }
  if (!hits.length) return `<p class="hint">Nothing found for “${esc(q)}”.</p>`;
  hits.sort((a, b) => b.exact - a.exact || a.key.length - b.key.length || a.key.localeCompare(b.key) || a.i - b.i);
  const seen = new Set(), ids = [];
  for (const x of hits) { const id = pref(x.d, x.i); if (!seen.has(id)) { seen.add(id); ids.push(x); } }
  const shown = all ? ids : ids.slice(0, 40), rows = [];
  for (const x of shown) { const r = await pplRow(x.d, x.i); if (r) rows.push(rowHTML(r)); }
  const more = !all && ids.length > shown.length ? ` <small>– the first ${shown.length}; Enter shows all</small>` : '';
  return { head: `<div class="navh3">${ids.length.toLocaleString('en')} entr${ids.length === 1 ? 'y' : 'ies'}${more}</div><div class="list plain"></div>`, rows };
}
async function pplPersonHTML(ref, ti) {
  const { d, i } = pplParse(ref); if (!d) return '<p class="hint">This person’s package is not installed.</p>';
  if (d.kind === 'ident') {                                        // (770) a person known only from an edition's index of names
    const rw = await pplRow(d, i), h1 = ti != null ? S.prs?.get(ti) : null;
    let h = `<div class="pphead"><div class="ppname">${esc(rw?.name || '')}${rw?.no ? ` <small>${rw.no}</small>` : ''}</div><div class="ppmeta">${esc(rw?.desc || '')}</div>`
      + `<div class="ppat">In none of the encyclopaedias installed – identified in the text by ${esc(d.name.replace(/^Identifications: /, ''))}.${h1 ? ` <button type="button" data-ppname="${esc(h1.k)}" data-ti="${ti}">Someone else?</button>` : ''}</div></div>`;
    const others = []; for (const c of await personsFor(gkey((rw?.name || '').split(/[ (]/)[0]), true)) { const x = pplParse(c), rr = await pplRow(x.d, x.i); if (rr) others.push(rowHTML(rr)); }
    if (others.length) h += `<details class="src"><summary>Others of the name in the encyclopaedias <small>${others.length}</small></summary><div class="list plain">${others.join('')}</div></details>`;
    return h;
  }
  const e = await pplEntry(d, i), r = await pplRow(d, i); if (!e || !r) return '<p class="hint">Not found.</p>';
  const h0 = ti != null ? S.prs?.get(ti) : null;
  const att = await attachedTo(d, i);
  if (!r.ownKinds) for (const [o, m] of att) for (const j of m) { const rr = await pplRow(o, j); for (const k of rr?.kinds || []) if (!r.kinds.includes(k)) r.kinds.push(k); }
  r.kinds.sort((a, b) => PKINDS.indexOf(a) - PKINDS.indexOf(b));
  let h = `<div class="pphead"><div class="ppname">${esc(e.h)}${r.no ? ` <small>${r.no}</small>` : ''}</div>${e.g ? `<div class="ppgreek gk">${esc(e.g)}</div>` : ''}`
    + `<div class="ppmeta">${r.y0 != null ? `<span title="the years the article mentions">years mentioned: ${yearsTxt(r.y0, r.y1)}</span> · ` : ''}${kindChips(r, true)}${r.ownKinds ? ' <small class="hint">(your kinds)</small>' : ''}</div>`
    + officesHTML(await fastiTab(), ref) + `<div class="pptmp"><button type="button" data-tmpshow="${esc(ref)}">Show in Tempora</button></div>`
    + (h0 ? `<div class="ppat">${h0.sure ? `Marked in the text: ${esc(h0.why)}.` : 'Not yet certain in the text.'} <button type="button" data-ppname="${esc(h0.k)}" data-ti="${ti}">${h0.cands.length > 1 ? 'Someone else?' : 'Not this person?'}</button></div>` : '')
    + '</div>';
  // the sources, each by itself (as in the dictionary): the encyclopaedia, then the Suda under the person's Greek names
  let secs = '';
  if (sudaMerge()) { const ix = await pplIx(d); for (let j = i + 1; j < ix.p.length && j < i + 40; j++) if (ix.p[j]?.[7] === i) { const se = await pplEntry(d, j); if (se) secs += `<div class="ppsec">${se.html}</div>`; } }
  h += `<details class="src" open data-pd="${d.id}"><summary>${esc(d.name)} <small>${esc(d.title || '')}</small></summary><div class="ent"><div class="eb">${e.html}${secs}</div></div></details>`;
  for (const [o, m] of att) {                                         // the same person in another source (PIR …), by itself
    let inner = ''; for (const j of m) { const oe = await pplEntry(o, j); if (oe) inner += `<div class="ent"><div class="eb">${oe.html}</div></div>`; }
    h += `<details class="src" open data-pd="${o.id}"><summary>${esc(o.name)} <small>${esc(o.title || '')}</small></summary>${inner}</details>`;
  }
  const suda = S.installed?.suda, gks = (e.k || []).filter(isGreek);
  if (!suda) h += `<details class="src empty" data-pd="suda"><summary>Suda <small>not installed – <button type="button" class="ppget" data-ppget="suda">Download</button> (${mbs(S.manifest?.packages?.find(p => p.id === 'suda')?.bytes || 2.5e6)})</small></summary></details>`;
  if (suda) {
    let inner = '', n = 0;
    for (const k of gks) { const b = await bucket(suda, k); for (const x of (b?.e || []).filter(x => x.k.includes(k)).sort((a, b) => a.i - b.i)) { inner += await renderEntryHTML(Object.assign({ d: 'suda' }, x)); n++; } }
    h += `<details class="src${n ? '' : ' empty'}" data-pd="suda"${n && n <= 3 ? ' open' : ''}><summary>${esc(suda.name)} <small>${n ? n + ' entr' + (n === 1 ? 'y' : 'ies') + ' under ' + gks.map(esc).join(', ') : gks.length ? '– no entry –' : '– no Greek name –'}</small></summary>${inner}</details>`;
  }
  // the passages of the library where the source cites the person
  const ps = e.ps || [];
  if (ps.length) {
    if (!S.catWork) await cachedCatalog();
    const inst = new Set((await libWorks()).map(w => w.id)), byW = new Map();
    for (const p of ps) { if (!byW.has(p[0])) byW.set(p[0], []); byW.get(p[0]).push(p); }
    let inner = '';
    for (const [wid, list] of byW) {
      const w = S.catWork?.[wid];
      inner += `<div class="ppw"><div class="ppwt">${esc(w ? `${w.author}, ${w.title}` : wid)}${inst.has(wid) ? '' : ' <small class="hint">not on this device – tap a place to download</small>'}</div><div class="ppocc">`
        + list.map(p => `<button type="button" data-pppass="${esc(wid)}" data-bi="${p[1]}" data-r="${esc(p[2])}" data-ref="${esc(ref)}" title="${esc(p[3])}">${esc(p[3].replace(/^\S+\s+(?:\S+\.\s+)?/, ''))}</button>`).join('') + '</div></div>';
    }
    h += `<details class="src ppass" open><summary>Passages in the library <small>${ps.length} cited by ${esc(d.name.split(',')[0])}</small></summary>${inner}</details>`;
  }
  const mb = []; for (const [o, m] of await attachedTo(d, i, true)) for (const j of m) { const rr = await pplRow(o, j); if (rr) mb.push(rowHTML(rr)); }
  if (mb.length) h += `<details class="src"><summary>Possibly the same person <small>${mb.length} – entries that fit this person and others equally</small></summary><div class="list plain">${mb.join('')}</div></details>`;
  // others of the same name
  const others = []; for (const k of (e.k || []).slice(0, 1)) for (const c of await personsFor(k, true)) if (c !== ref) { const x = pplParse(c), rr = await pplRow(x.d, x.i); if (rr) others.push(rowHTML(rr)); }
  if (others.length) h += `<details class="src"><summary>Others of the name ${esc(e.h.split(/[ ,]/)[0])} <small>${others.length}</small></summary><div class="list plain">${others.join('')}</div></details>`;
  return h;
}
// 775: the index's persons without a match, though the encyclopaedias have someone of the name – matched by the reader
async function idMatchList(tabs) {
  const out = [];
  for (const T of tabs) {
    const cnt = new Map(); for (const [, , j] of T.r) { const c = T.e[j][7] ?? j; cnt.set(c, (cnt.get(c) || 0) + 1); }
    for (let j = 0; j < T.e.length; j++) {
      const e = T.e[j]; if (e[7] != null || e[3] === 'l' || e[4] || idOwn(T, j) !== undefined || !cnt.get(j)) continue;
      if (e[3] === '?' && !T.e.some(x => x[7] === j)) continue;
      const cs = (await personsFor(e[5][0])).filter(c => { const { d, i } = pplParse(c); const y0 = d?.id === 'people-pir' ? -31 : null; return y0 == null || y0 <= 420; });
      if (cs.length) out.push({ T, j, e, cs, n: cnt.get(j) });
    }
  }
  return out.sort((a, b) => b.n - a.n);
}
async function pplIdMatchHTML() {
  const t = S.text, tabs = t?.work ? await identTables(t.work.id, t.bi) : null; if (!tabs) return '<p class="hint">No index of names for this work.</p>';
  const L = await idMatchList(tabs);
  if (!L.length) return '<p class="hint">Every person of the index is matched (or has no namesake in the encyclopaedias).</p>';
  let h = `<div class="pphead"><div class="ppname">Persons of the index to match</div><div class="ppmeta">${L.length} · most passages first · your matches go into the backup</div></div><div class="list plain">`;
  for (const x of L.slice(0, 80)) {
    const rows = []; for (const c of x.cs.slice(0, 8)) { const { d, i } = pplParse(c), r = await pplRow(d, i); if (r) rows.push(`<div class="ppchk">${rowHTML(r)}<span class="ppchoose"><button type="button" data-ppidset="${esc(c)}" data-d="${esc(x.T.d.id)}" data-j="${esc(idKey(x.e))}">This one</button></span></div>`); }
    h += `<div class="ppidbox"><div class="ppn"><b>${esc(x.e[0])}</b>${x.e[1] ? ` <small>${x.e[1]}</small>` : ''} <small>${x.n} passage${x.n === 1 ? '' : 's'}</small></div><div class="ppd">${esc(x.e[2] || '(no description in the index)')}</div>${rows.join('')}`
      + `<div class="ppnot"><button type="button" data-ppidset="0" data-d="${esc(x.T.d.id)}" data-j="${esc(idKey(x.e))}">None of these</button></div></div>`;
  }
  return h + '</div>';
}
// any word: its entries in the Suda and in every encyclopaedia, each source by itself (755)
async function pplWordHTML(form, lemma, ti) {
  const keys = [...new Set([lemma, form].filter(Boolean).map(gkey).filter(Boolean))];
  let h = `<div class="pphead"><div class="ppname">${esc(ppPlain(lemma || form))}</div>${lemma && canon(lemma) !== canon(form) ? `<div class="ppmeta">${esc(form)}</div>` : ''}</div>`, any = false;
  const suda = S.installed?.suda;
  if (suda && isGreek(form)) {
    let inner = '', n = 0;
    for (const k of keys) { const b = await bucket(suda, k); for (const x of (b?.e || []).filter(x => x.k.includes(k)).sort((a, b) => a.i - b.i)) { inner += await renderEntryHTML(Object.assign({ d: 'suda' }, x)); n++; } }
    if (n) { any = true; h += `<details class="src" data-pd="suda" open><summary>${esc(suda.name)} <small>${n} entr${n === 1 ? 'y' : 'ies'}</small></summary>${inner}</details>`; }
  } else if (!suda && isGreek(form)) h += `<details class="src empty" data-pd="suda"><summary>Suda <small>not installed – <button type="button" class="ppget" data-ppget="suda">Download</button></small></summary></details>`;
  for (const d of pplPkgs(true)) {
    const ix = await pplIx(d), seen = new Set(), rows = [];
    for (const k of keys) for (const i0 of ix?.n?.[k] || []) { const sec = ix.p[i0]?.[7], i = sudaMerge() && sec != null ? sec : i0; if (seen.has(i)) continue; seen.add(i); const r = await pplRow(d, i); if (r) rows.push(r); }
    if (!rows.length) continue; any = true;
    if (rows.length === 1 && d.kind === 'encyclopedia') { const e = await pplEntry(d, rows[0].i);     // one entry: the article itself
      h += `<details class="src" data-pd="${d.id}" open><summary>${esc(d.name)} <small>${esc(d.title || '')}</small></summary><div class="ent"><div class="eb">${e?.html || ''}</div></div><div class="list plain">${rowHTML(rows[0], '<span class="ppwhy">the whole entry, with its passages</span>')}</div></details>`; }
    else h += `<details class="src" data-pd="${d.id}" open><summary>${esc(d.name)} <small>${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}</small></summary><div class="list plain">${rows.map(r => rowHTML(r)).join('')}</div></details>`;
  }
  if (!any) h += `<p class="hint">No entry for <i>${esc(lemma || form)}</i> in the Suda or the encyclopaedias installed.</p>`;
  return h;
}
// the kinds of a person (735A): the reader's own choice is kept (and goes into the backup)
async function pplKindsDialog(ref) {
  const { d, i } = pplParse(ref), r = await pplRow(d, i); if (!r) return;
  const res = await dialog(`<h3>Kinds – ${esc(r.name)}${r.no ? ' ' + r.no : ''}</h3><p class="hint small">Guessed from the first lines of the article; several may apply.</p><div class="ppkdlg">`
    + PKINDS.map(k => `<label class="sopt"><input type="checkbox" name="k_${k}"${r.kinds.includes(k) ? ' checked' : ''}> ${esc(k)}</label>`).join('') + '</div>',
    [['reset', 'As guessed'], ['cancel', 'Cancel'], ['ok', 'Save']]);
  if (res.action === 'reset') await del('settings', 'pk|' + ref);
  else if (res.action === 'ok') await setting('pk|' + ref, PKINDS.filter(k => res.data['k_' + k] === 'on'));
  else return;
  pplRender();
}
async function pplFix(ref, k, ti) {                // the reader's choice: a person (ref), not a person (0), or undone ('')
  const t = S.text; if (!t) return;
  const key = 'prs|' + workKeyOfText(t), fx = (await setting(key)) || { k: {}, t: {} };
  fx.k ??= {}; fx.t ??= {};
  const v = ref === '' ? undefined : ref === '0' ? 0 : ref;
  if (ti != null) { const tk = t.bi + ':' + ti; if (v === undefined) delete fx.t[tk]; else fx.t[tk] = v; if (v === undefined) delete fx.k[k]; }
  else if (v === undefined) delete fx.k[k]; else fx.k[k] = v;
  await setting(key, fx);
  await personsForText();
  if (v && v !== 0) pplGo({ t: 'person', ref: v, ti }, false); else pplGo({ t: 'text' }, false);
}
async function pplPassage(wid, bi, r, personRef) {  // open a cited place: the work at that section, the name there selected
  if (!(await libGet('works', wid))) {
    if (!S.catWork?.[wid]) return toast('This work is not in the catalogue.');
    note('Downloading ' + S.catWork[wid].title + ' …');
    try { await downloadWork('work:' + wid); } catch (e) { return toast('Download failed: ' + e.message, 4000); }
  }
  if (S.text?.id !== `w:${wid}:${bi}`) await openText(`w:${wid}:${bi}`, false);
  const R = S.refs || [], j = R.findIndex(x => x.s === r); if (j < 0) return toast('Place not found: ' + r);
  const end = R[j + 1]?.i ?? Infinity; let i = R[j].i;
  const { d, i: pi } = pplParse(personRef), e = d && await pplEntry(d, pi), ks = new Set(e?.k || []);
  const lo = R[Math.max(0, j - (R.verse ? 2 : 0))].i, hi = R.verse ? (R[j + 3]?.i ?? Infinity) : end;
  for (let n = 0; n < 40 && S.tokens.some(tk => tk.t === 'w' && tk.i >= lo && tk.i < hi && tk.lemma === undefined); n++) await new Promise(r => setTimeout(r, 100));   // (the lemmata of the part just opened)
  const hit = S.tokens.find(tk => tk.t === 'w' && tk.i >= lo && tk.i < hi && (ks.has(gkey(tk.lemma || '')) || ks.has(gkey(tk.s))));
  if (hit) i = hit.i;
  S.cur = [i, i]; S.curHidden = false; markTarget();
  requestAnimationFrame(() => scrollToWord(i));
}
document.addEventListener('click', ev => {
  if (!ev.target.closest?.('#peopleBody')) return;
  const t = ev.target;
  const b = t.closest('[data-ppback]'); if (b) { if (!PP.back.length) return; PP.view = PP.back.pop(); $('#pplQ').value = PP.view.t === 'search' ? PP.view.q : ''; pplRender(); return; }
  if (t.closest('[data-pptext]')) return pplGo({ t: 'text' });
  const ke = t.closest('[data-ppkinds]'); if (ke) return pplKindsDialog(ke.dataset.ppkinds);
  if (t.closest('[data-ppidm]')) return pplGo({ t: 'idmatch' });
  const im = t.closest('[data-ppidset]'); if (im) { (async () => {          // 775: the reader's match (or none) for a person of the index
    await setting(`idm|${im.dataset.d}|${im.dataset.j}`, im.dataset.ppidset === '0' ? 0 : im.dataset.ppidset);
    await personsForText(); pplRender(); toast(im.dataset.ppidset === '0' ? 'Kept as a person of the index only' : 'Matched');
  })(); return; }
  const gt = t.closest('[data-ppget]'); if (gt) { ev.preventDefault(); const id = gt.dataset.ppget; gt.disabled = true; gt.textContent = 'Downloading …'; queueDownload(id);
    const w = setInterval(() => { if (S.installed?.[id]) { clearInterval(w); pplRender(); } else if (!DL.has(id)) { clearInterval(w); gt.disabled = false; gt.textContent = 'Download'; } }, 700); return; }
  const fx = t.closest('[data-ppfix]'); if (fx) return pplFix(fx.dataset.ppfix, fx.dataset.k, fx.dataset.ti != null ? +fx.dataset.ti : null);
  const nm = t.closest('[data-ppname]'); if (nm) return pplGo({ t: 'name', k: nm.dataset.ppname, ti: nm.dataset.ti != null ? +nm.dataset.ti : null });
  const ps = t.closest('[data-pppass]'); if (ps) return pplPassage(ps.dataset.pppass, +ps.dataset.bi, ps.dataset.r, ps.dataset.ref);
  const j = t.closest('[data-ppjump]'); if (j) { const i = +j.dataset.ppjump; S.cur = [i, i]; S.curHidden = false; markTarget(); requestAnimationFrame(() => scrollToWord(i)); return; }
  const dx = t.closest('a.pxr[data-dprr]'); if (dx) { (async () => {   // DPRR relatives: the person (with Smith's entry, where he has one)
    const dp = S.installed?.['people-dprr'], i = +dx.dataset.dprr; if (!dp) return;
    const at = await pplRec(dp, '#at'); const sm = at && Object.entries(at.m || {}).find(([, v]) => v.includes(i));
    pplGo({ t: 'person', ref: sm && S.installed?.[at.to] ? at.to + '|' + sm[0] : 'people-dprr|' + i });
  })(); return; }
  const xr = t.closest('a.pxr'); if (xr) { (async () => {             // Smith's cross-references: [PARIS.]
    const k = gkey(xr.dataset.x), own = t.closest('details.src')?.dataset.pd, cs0 = await personsFor(k, true), cs = own && cs0.some(c => c.startsWith(own + '|')) ? cs0.filter(c => c.startsWith(own + '|')) : cs0;
    if (xr.dataset.no) for (const c of cs) { const x = pplParse(c), r = await pplRow(x.d, x.i); if (r && String(r.no) === xr.dataset.no) return pplGo({ t: 'person', ref: c }); }
    if (cs.length === 1) return pplGo({ t: 'person', ref: cs[0] });
    pplGo({ t: 'search', q: xr.dataset.x });
  })(); return; }
  const row = t.closest('[data-ppref]'); if (row) return pplGo({ t: 'person', ref: row.dataset.ppref });
});
// typing: a pause of 150 ms, nothing while an accent or breathing is being composed; the first letter opens the search
// (one step back leads to where you were), later letters only change it; Enter shows all results and closes the keyboard
function pplSearchNow(all = false) {
  const q = $('#pplQ')?.value || '';
  if (PP.view?.t === 'search') { PP.view.q = q; PP.view.all = all; pplRender(); }
  else { if (PP.view) PP.back.push(PP.view); PP.view = { t: 'search', q, all }; pplRender(); $('#dictPane').scrollTop = 0; }
}
document.addEventListener('compositionstart', ev => { if (ev.target.id === 'pplQ') PP.composing = true; });
document.addEventListener('compositionend', ev => { if (ev.target.id !== 'pplQ') return; PP.composing = false; clearTimeout(PP.qt); PP.qt = setTimeout(pplSearchNow, 150); });
document.addEventListener('input', ev => {
  if (ev.target.id !== 'pplQ' || PP.composing || ev.isComposing) return;
  clearTimeout(PP.qt); PP.qt = setTimeout(pplSearchNow, 150);
});
document.addEventListener('submit', ev => {
  if (ev.target.id !== 'pplBar') return;
  ev.preventDefault(); clearTimeout(PP.qt); pplSearchNow(true); $('#pplQ').blur();
});
// the dictionary: a line naming the persons of the word looked up (to the People tab)
async function pplDictLine(lemma, ti) {
  if (!pplPkgs(true).length) return '';
  if (!capital(lemma)) {                                              // a common word: its articles in the encyclopaedias of things (Agora, Consul …)
    let n = 0; for (const d of pplPkgs(true)) if (d.kind === 'encyclopedia') n += (await pplIx(d))?.n?.[gkey(lemma)]?.length || 0;
    return n ? `<div class="ppline"><span class="ppl1">Suda tab</span><button type="button" data-ppword="${esc(lemma)}" data-ti="${ti ?? ''}">${n} entr${n === 1 ? 'y' : 'ies'} in the encyclopaedias</button></div>` : '';
  }
  const h0 = ti != null ? S.prs?.get(ti) : null;
  const k = h0?.k || gkey(lemma), cs = h0?.cands || await personsFor(k); if (!cs.length) return '';
  if (h0?.pick) { const x = pplParse(h0.pick), r = await pplRow(x.d, x.i);
    if (r) return `<div class="ppline"><span class="ppl1">${h0.sure ? 'Person' : 'Probably'}</span><button type="button" data-ppopen="${esc(h0.pick)}" data-ti="${ti}"><b>${esc(r.name)}</b>${r.no ? ' ' + r.no : ''} – ${esc(r.desc)}</button>${cs.length > 1 ? `<button type="button" data-ppopenk="${esc(k)}" data-ti="${ti ?? ''}" class="ppmore">${cs.length - 1} other${cs.length > 2 ? 's' : ''}</button>` : ''}</div>`; }
  return `<div class="ppline"><span class="ppl1">People</span><button type="button" data-ppopenk="${esc(k)}" data-ti="${ti ?? ''}">${cs.length} person${cs.length === 1 ? '' : 's'} named <b>${esc(lemma)}</b></button><button type="button" class="ppmore" data-ppword="${esc(lemma)}" data-ti="${ti ?? ''}">all entries</button></div>`;
}
document.addEventListener('click', ev => {
  const o = ev.target.closest?.('#dictBody [data-ppopen],#dictBody [data-ppopenk],#dictBody [data-ppword]'); if (!o) return;
  const ti = o.dataset.ti === '' || o.dataset.ti == null ? null : +o.dataset.ti;
  if (PP.view) PP.back.push(PP.view);
  PP.view = o.dataset.ppword ? { t: 'word', form: S.view?.form || o.dataset.ppword, lemma: o.dataset.ppword, ti }
    : o.dataset.ppopen ? { t: 'person', ref: o.dataset.ppopen, ti } : { t: 'name', k: o.dataset.ppopenk, ti };
  showPeople();
});
