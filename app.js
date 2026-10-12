/* Greek Reader – offline reader with a composite dictionary and interlinear glosses.
   All data (dictionaries, texts, glosses, settings) is stored on the device in IndexedDB.
   Dictionary packages (*.gdpkg.gz) are produced by the greekdict toolkit (python gd.py packages). */
'use strict';

// ---------------------------------------------------------------- utilities
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const GREEK_TOKEN = /[Ͱ-Ͽἀ-῿][Ͱ-Ͽἀ-῿̀-ͯ]*[ʼ’'᾽]?/g;
const ELISION = /[ʼ'᾽]/g;
// Latin words: the same tokenizer finds them; a word's language follows from its alphabet
const LATIN_TOKEN = /[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ\u0300-\u036f]*/;
const WORD_TOKEN = new RegExp(GREEK_TOKEN.source + '|' + LATIN_TOKEN.source, 'g');
const isGreek = s => /[Ͱ-Ͽἀ-῿]/.test(s || '');
const langOf = s => isGreek(s) ? 'grc' : 'la';
const LANGS = { grc: 'Greek', la: 'Latin' };
function latkey(s) {              // Latin lookup key: lower case, no diacritics, j -> i, v -> u
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/æ/g, 'ae').replace(/Æ/g, 'Ae').replace(/œ/g, 'oe').replace(/Œ/g, 'Oe')
    .toLowerCase().replace(/j/g, 'i').replace(/v/g, 'u');
}
function canon(s) {               // exact form: circumflex fixed, grave -> acute, elision mark unified, lower case
  if (!isGreek(s)) return latkey(s);
  return s.normalize('NFD').replace(/̃/g, '͂').replace(/̀/g, '́').normalize('NFC').replace(ELISION, '’').toLowerCase();
}
function gkey(s) {                // accent-insensitive key
  if (!isGreek(s)) return latkey(s).replace(/[^a-z]/g, '');
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ').replace(/[^Ͱ-Ͽ]/g, '');
}
function stripSecondAccent(f) {  // enclitic accent: αἴτιός -> αἴτιος, μεῖζόν -> μεῖζον
  const d = f.normalize('NFD'); const idx = [];
  for (let i = 0; i < d.length; i++) if (d[i] === '́' || d[i] === '͂') idx.push(i);
  if (idx.length < 2 || d[idx[idx.length - 1]] !== '́') return null;
  const last = idx[idx.length - 1];
  return (d.slice(0, last) + d.slice(last + 1)).normalize('NFC');
}
function toast(msg, ms = 2500) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); }

// ---------------------------------------------------------------- IndexedDB
// Storage layout (since v3):
//   'greekreader'           – your own data: texts, glosses, lemma choices, settings, list of installed dictionaries
//   'greekreader-dict-<id>' – one database per dictionary (store 'b': key-prefix buckets)
// Deleting a dictionary deletes its whole database, so the space is really given back.
// Older versions kept everything in one database 'greekdict'; it is migrated once and then deleted.
const DB_NAME = 'greekreader', DB_VER = 1, OLD_DB = 'greekdict', DICT_DB = 'greekreader-dict-';
let db;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('dicts', { keyPath: 'id' });
      d.createObjectStore('texts', { keyPath: 'id', autoIncrement: true });
      d.createObjectStore('glosses', { keyPath: 'id', autoIncrement: true }).createIndex('textId', 'textId');
      d.createObjectStore('choices', { keyPath: 'f' });
      d.createObjectStore('settings', { keyPath: 'k' });
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const dictConns = new Map();
function dictDB(id) {
  if (dictConns.has(id)) return dictConns.get(id);
  const p = new Promise((res, rej) => {
    const r = indexedDB.open(DICT_DB + id, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('b', { keyPath: 'b' });
    r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); dictConns.delete(id); }; res(r.result); };
    r.onerror = () => rej(r.error);
  });
  dictConns.set(id, p); return p;
}
async function dropDictDB(id) {
  if (dictConns.has(id)) { try { (await dictConns.get(id)).close(); } catch (_) { } dictConns.delete(id); }
  await new Promise(res => { const r = indexedDB.deleteDatabase(DICT_DB + id); r.onsuccess = r.onerror = r.onblocked = () => res(); });
}
async function listDBs() { try { return (await indexedDB.databases?.()) || null; } catch (_) { return null; } }
// one-time move from the old single database into the new layout
async function migrateOld() {
  const dbs = await listDBs();
  if (dbs && !dbs.some(d => d.name === OLD_DB)) return;
  const old = await new Promise(res => { const r = indexedDB.open(OLD_DB); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
  if (!old) return;
  const has = n => old.objectStoreNames.contains(n);
  if (!has('settings')) { old.close(); indexedDB.deleteDatabase(OLD_DB); return; }
  const dlg = $('#dlg'), f = $('#dlgForm');
  f.innerHTML = '<h3>Tidying up storage</h3><p id="impMsg">Moving your data into the new storage layout (only once) …</p><div class="prog"><i id="impBar"></i></div>'; dlg.showModal();
  const oget = st => new Promise((res, rej) => { const r = old.transaction(st).objectStore(st).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  for (const st of ['texts', 'glosses', 'choices', 'settings', 'dicts']) if (has(st)) await bulkPut(st, await oget(st));
  if (has('buckets') && has('dicts')) {
    const metas = await oget('dicts');
    for (const [n, m] of metas.entries()) {
      if (m.kind === 'morphhints') continue;
      $('#impMsg').textContent = `Moving ${m.name} …`;
      const ddb = await dictDB(m.id);
      let last = m.id + '|', size = 0;
      for (;;) {      // copy in chunks: read 200 records after the last key, write them
        const rows = await new Promise((res, rej) => { const r = old.transaction('buckets').objectStore('buckets').getAll(IDBKeyRange.bound(last, m.id + '|\uffff', true, false), 200); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        if (!rows.length) break;
        const t = ddb.transaction('b', 'readwrite'); const os = t.objectStore('b');
        for (const row of rows) { os.put(Object.assign({}, row, { b: row.b.slice(m.id.length + 1) })); size += JSON.stringify(row).length; }
        await done(t); last = rows[rows.length - 1].b;
        if (rows.length < 200) break;
      }
      await put('dicts', Object.assign(m, { size }));
      $('#impBar').style.width = ((n + 1) / metas.length * 100).toFixed(0) + '%';
    }
  }
  old.close();
  await new Promise(res => { const r = indexedDB.deleteDatabase(OLD_DB); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  dlg.close(); toast('Storage reorganised – the old copy was removed.');
}
function tx(stores, mode = 'readonly') { return db.transaction(stores, mode); }
function req2p(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
function done(t) { return new Promise((res, rej) => { t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error); }); }
const get = (store, k) => req2p(tx(store).objectStore(store).get(k));
const getAll = (store, q) => req2p(tx(store).objectStore(store).getAll(q));
async function put(store, v) { const t = tx(store, 'readwrite'); const r = t.objectStore(store).put(v); await done(t); return r.result; }
async function del(store, k) { const t = tx(store, 'readwrite'); t.objectStore(store).delete(k); await done(t); }
async function setting(k, v) { if (v === undefined) { const r = await get('settings', k); return r ? r.v : undefined; } return put('settings', { k, v }); }

// ---------------------------------------------------------------- state
const S = {
  dicts: [], morph: null, lemmapos: {},
  text: null,            // {id,title,text}
  tokens: [],            // [{t:'w'|'p', s, i, pos}]  i = word index
  glosses: [],
  cur: null,             // [start,end] word indices of the gloss target
  hist: [], fwd: [], view: null,  // dictionary navigation
  lastSel: '', listSort: 'pos',
  posOn: false, posCfg: null, srcColors: true,
  lemmaGloss: {},        // lemma key -> default gloss (all texts)
};

// ---------------------------------------------------------------- word classes
const POS = [   // id, label, default colour
  ['noun', 'Noun', '#1f5fa8'], ['proper', 'Proper noun', '#6a3fb0'], ['adj', 'Adjective', '#2f8a4a'],
  ['article', 'Article', '#8a8a8a'], ['pron', 'Pronoun', '#b05a1f'], ['verb', 'Verb (finite)', '#c0262d'],
  ['part', 'Participle', '#d9762b'], ['inf', 'Infinitive', '#b8476f'], ['adv', 'Adverb', '#0f8a8a'],
  ['prep', 'Preposition', '#7a6a2e'], ['conj', 'Conjunction', '#4b6b2a'], ['ptcl', 'Particle', '#9a7b00'],
  ['num', 'Numeral', '#555599'], ['other', 'Other / unknown', '#666666'], ['punct', 'Punctuation marks', '#b4b4b4'],
];
const UPOS2 = { NOUN: 'noun', PROPN: 'proper', ADJ: 'adj', PRON: 'pron', DET: 'pron', VERB: 'verb', AUX: 'verb', ADV: 'adv',
  ADP: 'prep', CCONJ: 'conj', SCONJ: 'conj', PART: 'ptcl', INTJ: 'ptcl', NUM: 'num' };
const PARTICLES = new Set(['γαρ', 'δε', 'μεν', 'τε', 'γε', 'δη', 'αν', 'ουν', 'τοι', 'περ', 'που', 'πω', 'μην', 'αρα', 'ου', 'ουκ', 'ουχ', 'μη', 'δητα', 'τοινυν', 'τοιγαρ', 'γουν', 'καιτοι', 'μεντοι', 'ουκουν', 'ω']);
function posOf(lemma, anas) {
  const k = gkey(lemma || '');
  if (k === 'ο') return 'article';
  if (PARTICLES.has(k)) return 'ptcl';
  const a = anas || [];
  if (a.some(x => /\bpart\b|\bgerundive\b/.test(x))) return 'part';
  if (a.some(x => /\bsupine\b/.test(x))) return 'inf';
  if (a.some(x => /\b(ind|subj|opt|imperat)\b/.test(x))) return 'verb';
  if (a.some(x => /\binf\b/.test(x))) return 'inf';
  if (lemma && lemma[0] !== lemma[0].toLowerCase()) return 'proper';
  const u = isGreek(lemma) ? S.lemmapos[k] : S.latPos?.[k];
  if (u && UPOS2[u]) return UPOS2[u];
  const tag = a.map(x => (x.match(/indeclform \(([^)]+)\)/) || [])[1]).find(Boolean);
  if (tag) return { adverb: 'adv', particle: 'ptcl', conj: 'conj', prep: 'prep', article: 'article', numeral: 'num', exclam: 'ptcl' }[tag] || 'other';
  if (a.some(x => /\b(nom|gen|dat|acc|voc)\b/.test(x))) return 'noun';
  return 'other';
}
function applyPosColors() {
  const st = $('#posStyle') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'posStyle' }));
  st.textContent = !S.posOn ? '' : POS.filter(([id]) => S.posCfg[id]?.on !== false)
    .map(([id]) => id === 'punct' ? `body.pos #textBody .pn,body.pos #textBody .w .pu{color:${S.posCfg[id]?.c || '#999'}}`
      : `body.pos .w.p-${id}>.g{color:${S.posCfg[id]?.c || '#000'}}`).join('\n');
  document.body.classList.toggle('pos', S.posOn);
  $('#btnPos').classList.toggle('on', S.posOn); $('#btnPos').setAttribute('aria-pressed', S.posOn);
}
async function resolveTokens() {      // lemma + word class for every word of the text
  const run = (resolveTokens.run = (resolveTokens.run || 0) + 1);
  await resolveTokens1(run);
  if (run === resolveTokens.run && S.dgPending) { S.dgPending = false; renderText(); }
}
async function resolveTokens1(run) {
  const memo = new Map(), bmap = new Map();
  const choices = new Map((await getAll('choices')).map(c => [c.f, c]));    // read once, not once per word
  const todo = S.tokens.filter(tk => tk.t === 'w' && tk.lemma === undefined);
  // long books: the morphology buckets needed by the next 1500 words are read in one go
  const prefetch = async from => {
    if (!S.morph) return;
    const need = new Set();
    for (const tk of todo.slice(from, from + 1500)) {
      if (!isGreek(tk.s)) continue;
      const f = canon(tk.s);
      for (const x of [f, stripSecondAccent(f)]) if (x) { const b = bucketOf(gkey(x), S.morph.splitSet); if (!bmap.has(b)) need.add(b); }
    }
    if (!need.size) return;
    const os = (await dictDB(S.morph.id)).transaction('b').objectStore('b');
    await Promise.all([...need].map(async b => bmap.set(b, await req2p(os.get(b)) || null)));
  };
  for (let n = 0; n < todo.length; n++) {
    const tk = todo[n];
    if (n % 1500 === 0) await prefetch(n);
    if (tk.lemma !== undefined) continue;
    let A = memo.get(tk.s); if (!A) memo.set(tk.s, A = await analyses(tk.s, choices, S.morph ? bmap : null));
    if (run !== resolveTokens.run) return;           // a newer run has started
    const l = A.pick; const x = A.lemmas.find(z => z.lemma === l);
    tk.lemma = l || null; tk.pos = posOf(l, x?.ana);
    const el = S.wordEls?.[tk.i];          // words are numbered in document order (a selector per word is slow in long books)
    el?.classList.add('p-' + tk.pos);
    if (el && l && S.lemmaGloss[gkey(l)]) {
      if (!S.covered?.has(tk.i)) { const g = el.querySelector('.gl'), h = dgHTML(tk); g.innerHTML = h; const m = glW(h).match(/--gw:(\d+em)/); if (m) g.style.setProperty('--gw', m[1]); }
      else if (S.glossMode === 'both') S.dgPending = true;          // words with their own gloss: redraw at the end
    }
  }
}
function resetTokens(pred = () => true) { for (const tk of S.tokens) if (pred(tk)) { delete tk.lemma; delete tk.pos; } }
const classifyTokens = resolveTokens;

// ---------------------------------------------------------------- package import
async function readPackage(file, info = {}) {
  let stream = file.stream();
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unpack .gz files – please update iPadOS.');
    stream = stream.pipeThrough(new DecompressionStream('gzip'));
  }
  const txt = await new Response(stream).text();
  info.size = txt.length;                      // ≈ size of the data on the device
  return JSON.parse(txt);
}
async function bulkPut(store, items, onProgress, chunk = 2000) {
  for (let i = 0; i < items.length; i += chunk) {
    const t = tx(store, 'readwrite'); const os = t.objectStore(store);
    for (const it of items.slice(i, i + chunk)) os.put(it);
    await done(t); onProgress && onProgress(Math.min(1, (i + chunk) / items.length));
  }
}
async function deleteDict(id) {
  await dropDictDB(id); await del('dicts', id); bucketCache.clear();
  if (id === 'morphhints') { await del('settings', 'morphPref'); await del('settings', 'lemmapos'); }
}
async function importPackage(file, progress, version = null) {
  const info = {}; const p = await readPackage(file, info);
  if (p.format !== 'greekdict-pkg-2') throw new Error(file.name + ': not a (current) dictionary package');
  if (p.kind === 'latmorph') {                 // Latin analysis engine: one record
    progress(0.5, `${p.name} …`);
    const ddb = await dictDB(p.id);
    { const t = ddb.transaction('b', 'readwrite'); t.objectStore('b').put({ b: 'engine', e: p.engine }); await done(t); }
    await put('dicts', { id: p.id, kind: p.kind, name: p.name, src: 'la', source: p.source, license: p.license, count: p.count, version, size: info.size });
    S.latEngine = null; progress(1);
    return;
  }
  if (p.kind === 'morphhints') {               // small: preferred lemmata + word classes (treebank data)
    await setting('morphPref', p.pref || {}); await setting('lemmapos', p.lemmapos || {});
    await put('dicts', { id: p.id, kind: p.kind, name: p.name, source: p.source, license: p.license, count: p.count, version, size: info.size });
    return;
  }
  // no deletion first: buckets are overwritten one by one and stale ones removed at the end,
  // so an interrupted update never leaves the dictionary missing
  const items = Object.entries(p.buckets).map(([b, v]) => Object.assign({ b }, v));
  progress(0, `${p.name}: ${p.count.toLocaleString('en')} ${p.kind === 'morph' ? 'forms' : 'entries'} …`);
  const ddb = await dictDB(p.id);
  for (let i = 0; i < items.length; i += 300) {
    const t = ddb.transaction('b', 'readwrite'); const os = t.objectStore('b');
    for (const it of items.slice(i, i + 300)) os.put(it);
    await done(t); progress(Math.min(1, (i + 300) / items.length));
  }
  { const keep = new Set(Object.keys(p.buckets)); const t = ddb.transaction('b', 'readwrite'); const os = t.objectStore('b');
    for (const k of await req2p(os.getAllKeys())) if (!keep.has(k)) os.delete(k);
    await done(t); }
  bucketCache.clear();
  if (p.lemmapos) await setting('lemmapos', p.lemmapos);
  await put('dicts', { id: p.id, kind: p.kind, name: p.kind === 'morph' ? 'Greek morphology' : p.name, title: p.title, lang: p.lang, src: p.src || 'grc',
                       order: p.order ?? 99, source: p.source, license: p.license, count: p.count, split: p.split, version, size: info.size });
}
async function loadDicts() {
  const all = await getAll('dicts');
  for (const d of all) { d.splitSet = new Set(d.split || []); d.src ||= ['ls', 'georges', 'collatinus', 'morph-la'].includes(d.id) ? 'la' : 'grc'; }
  S.dicts = all.filter(d => d.kind === 'dictionary').sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));
  // user's order and on/off choice (menu ☰ → Dictionaries); new dictionaries go to the end, switched on
  S.dictPrefs = Object.assign({ order: [], off: [], locked: [] }, (await setting('dictPrefs')) || {});
  const pos = id => { const i = S.dictPrefs.order.indexOf(id); return i < 0 ? 1e6 : i; };
  S.dicts.sort((a, b) => pos(a.id) - pos(b.id));
  S.shown = S.dicts.filter(d => !S.dictPrefs.off.includes(d.id));
  // analysis tools: installed (…Inst) and in use (switched on)
  const on = d => d && !S.dictPrefs.off.includes(d.id) ? d : null;
  S.morphInst = all.find(d => d.kind === 'morph') || null; S.morph = on(S.morphInst);
  S.hintsInst = all.find(d => d.kind === 'morphhints') || null; S.hints = on(S.hintsInst);
  S.latMorphInst = all.find(d => d.kind === 'latmorph') || null; S.latMorph = on(S.latMorphInst);
  if (S.morphInst?.name === 'Morphological analysis') S.morphInst.name = 'Greek morphology';
  const hintsOff = S.hintsInst && !S.hints;
  S.lemmapos = hintsOff ? {} : (await setting('lemmapos')) || {};
  S.morphPref = hintsOff ? {} : (await setting('morphPref')) || {};
  S.installed = Object.fromEntries(all.map(d => [d.id, d]));
}
// key -> bucket name; must match bucket_of() in greekdict/packages.py
function bucketOf(k, split) {
  let n = 3;
  while (n < k.length && split.has(k.slice(0, n))) n++;
  const b = k.slice(0, n);
  return (split.has(b) && k.length === n) ? b + '$' : b;
}
const bucketCache = new Map();
async function bucket(dict, k) {
  const bk = bucketOf(k, dict.splitSet), id = dict.id + '|' + bk;
  if (bucketCache.has(id)) return bucketCache.get(id);
  const ddb = await dictDB(dict.id);
  const r = await req2p(ddb.transaction('b').objectStore('b').get(bk)) || null;
  bucketCache.set(id, r); if (bucketCache.size > 300) bucketCache.delete(bucketCache.keys().next().value);
  return r;
}

// ---------------------------------------------------------------- lookup
async function analyses(form, choices = null, bmap = null) {
  if (!isGreek(form)) return latAnalyses(form, choices);
  const f = canon(form);
  const m = async x => { if (!S.morph) return null; const b = bmap ? bmap.get(bucketOf(gkey(x), S.morph.splitSet)) : await bucket(S.morph, gkey(x)); return b?.f?.[x] ? { a: b.f[x], p: b.p?.[x] ?? S.morphPref?.[x] } : null; };
  let r = await m(f);
  if (!r) { const f2 = stripSecondAccent(f); if (f2) r = await m(f2); }
  const choice = choices ? choices.get(f) : await get('choices', f);
  const lemmas = [];
  for (const [l, a] of (r?.a || [])) {
    let x = lemmas.find(z => z.lemma === l); if (!x) lemmas.push(x = { lemma: l, ana: [] });
    x.ana.push(a);
  }
  const pick = choice?.lemma || r?.p || lemmas[0]?.lemma || null;
  return { f, lemmas, pick, chosen: !!choice };
}
// ---- Latin: analysis as in Collatinus – a form is a radical of a lemma + an ending of the lemma's inflection model
function latAnalyzeKey(E, k) {
  const out = [], X = E.X;
  for (let i = 0; i <= k.length; i++) {
    const ds = E.D[k.slice(i)]; if (!ds) continue;
    const rs = E.R[k.slice(0, i)]; if (!rs) continue;
    for (const [li, nr] of rs) {
      const m = E.L[li][1];
      for (const [mi, mo, dnr] of ds) if (mi === m && dnr === nr && !(X[li] && X[li].includes(mo))) out.push([li, mo]);
    }
  }
  for (const v of E.I[k] || []) out.push(v);
  return out;
}
function latAnalyze(E, form) {
  const k = latkey(form);
  let r = latAnalyzeKey(E, k);
  for (const [sh, lo] of E.C) if (k.endsWith(sh)) r = r.concat(latAnalyzeKey(E, k.slice(0, k.length - sh.length) + lo));   // amarunt = amaverunt
  for (const [a, b] of E.A) {                                                                                          // adc- / acc-
    if (k.startsWith(a)) r = r.concat(latAnalyzeKey(E, b + k.slice(a.length)));
    else if (k.startsWith(b)) r = r.concat(latAnalyzeKey(E, a + k.slice(b.length)));
  }
  let enc = '';
  if (!r.length) for (const e of ['que', 'ne', 've']) if (k.length > e.length + 1 && k.endsWith(e)) { r = latAnalyzeKey(E, k.slice(0, -e.length)); if (r.length) { enc = e; break; } }
  const seen = new Set(), res = [];
  for (const [li, mo] of r) { const id = li + ':' + mo; if (!seen.has(id)) { seen.add(id); res.push([E.L[li][0], E.M[mo] + (enc ? ' + -' + enc : ''), li]); } }
  return res;
}
async function latEngine() {
  if (!S.latMorph) return null;
  if (S.latEngine && S.latEngineId === S.latMorph.id) return S.latEngine;
  S.latEngineP ??= (async () => {
    const ddb = await dictDB(S.latMorph.id);
    const r = await req2p(ddb.transaction('b').objectStore('b').get('engine'));
    S.latEngine = r?.e || null; S.latEngineId = S.latMorph.id;
    S.latPos = {};
    if (S.latEngine) for (const l of S.latEngine.L) if (l[2]) S.latPos[latkey(l[0])] ??= l[2];       // word classes for the colours
    S.latEngineP = null;
    return S.latEngine;
  })();
  return S.latEngineP;
}
async function latAnalyses(form, choices) {
  const f = latkey(form), E = await latEngine();
  const res = E ? latAnalyze(E, form) : [];
  const choice = choices ? choices.get(f) : await get('choices', f);
  const lemmas = []; let best = null, bestN = -1;
  for (const [l, a, li] of res) {
    let x = lemmas.find(z => z.lemma === l); if (!x) lemmas.push(x = { lemma: l, ana: [] });
    if (!x.ana.includes(a)) x.ana.push(a);
    if (E.L[li][3] > bestN) { bestN = E.L[li][3]; best = l; }          // the more frequent lemma first
  }
  lemmas.sort((a, b) => (a.lemma === best ? -1 : b.lemma === best ? 1 : 0));
  return { f, lemmas, pick: choice?.lemma || best || null, chosen: !!choice };
}
async function entriesFor(k, lang = 'grc') {
  const by = {};
  for (const d of S.shown.filter(d => d.src === lang)) {
    const b = await bucket(d, k); if (!b) continue;
    const es = (b.e || []).filter(e => e.k.includes(k)).map(e => Object.assign({ d: d.id }, e));
    if (es.length) by[d.id] = es.sort((x, y) => x.i - y.i);
    if (b.m?.[k]) by[d.id + '#m'] = b.m[k];
  }
  return by;
}
async function entryByRef(dictId, [k, id]) {
  const d = S.dicts.find(x => x.id === dictId); if (!d) return null;
  const b = await bucket(d, k); const e = b?.e?.find(x => x.i === id);
  return e ? Object.assign({ d: dictId }, e) : null;
}

// ---------------------------------------------------------------- text rendering
function tokenize(text, wi = 0) {
  const toks = []; let last = 0;
  text = text.normalize('NFC');
  for (const m of text.matchAll(WORD_TOKEN)) {
    if (m.index > last) toks.push({ t: 'p', s: text.slice(last, m.index) });
    toks.push({ t: 'w', s: m[0], i: wi++ });
    last = m.index + m[0].length;
  }
  if (last < text.length) toks.push({ t: 'p', s: text.slice(last) });
  return toks;
}
// library books: blocks [kind, [[ref, text], …]] -> block, reference and word tokens
function tokenizeBlocks(blocks) {
  const toks = []; let wi = 0;
  for (const [k, runs] of blocks) {
    toks.push({ t: 'b', k });
    for (const [ref, txt] of runs) {
      if (ref) toks.push({ t: 'r', s: ref, l: k === 'l' || k === 'L' });
      for (const tk of tokenize(txt, wi)) { toks.push(tk); if (tk.t === 'w') wi = tk.i + 1; }
    }
  }
  return toks;
}
function renderText() {
  const body = $('#textBody');
  if (!S.text) { body.innerHTML = '<p class="hint">No text yet. Open the menu ☰ (top left) → Library to download Greek texts, or → My texts to paste your own.</p>'; return; }
  const gl = {}; for (const g of S.glosses) (gl[g.s] ??= []).push(g);
  const covered = S.covered = new Set(); for (const g of S.glosses) for (let i = g.s; i <= g.e; i++) covered.add(i);
  let html = '<div class="para">';
  const toks = S.tokens;
  for (let n = 0; n < toks.length; n++) {
    const tk = toks[n];
    if (tk.t === 'b') { html += `</div><div class="blk k-${tk.k}">`; continue; }
    if (tk.t === 'r') {        // reference in the margin; verse lines are numbered every 5th line
      if (!tk.l || (/^\d+$/.test(tk.s) && +tk.s % 5 === 0)) html += `<span class="rf${tk.l ? ' ln' : ''}">${esc(tk.s)}</span>`;
      continue;
    }
    if (tk.t === 'p') {
      const s0 = tk.glued ? tk.s.slice(tk.glued) : tk.s;
      if (!s0) continue;
      html += s0.split(/\n\s*\n/).map(p => punctHTML(p).replace(/\n/g, '<br>')).join('</div><div class="para">');
      continue;
    }
    let gs = (gl[tk.i] || []).map(g => `<span data-g="${g.id}"${g.e > g.s ? ` title="gloss for ${g.e - g.s + 1} words"` : ''}>${g.e > g.s ? '⟨' : ''}${glossHTML(g.t)}${g.e > g.s ? '⟩' : ''}</span>`).join('');
    // the lemma's default gloss: only where the word has no gloss of its own, or always (Settings → Glosses)
    if (!covered.has(tk.i)) gs = dgHTML(tk);
    else if (S.glossMode === 'both' && tk.lemma) { const dg = S.lemmaGloss[gkey(tk.lemma)]; if (dg && !(gl[tk.i] || []).some(g => g.t === dg)) gs += dgHTML(tk); }
    // punctuation directly after the word stays on the same line as the word
    const nx = toks[n + 1]; let pu = '';
    if (nx && nx.t === 'p') { const m = nx.s.match(/^[^\sͰ-Ͽἀ-῿A-Za-zÀ-ɏ]+/); if (m) { pu = m[0]; nx.glued = pu.length; } }
    if (S.marker === tk.i) html += '<span class="mkr" title="Marker"></span>';
    html += `<span class="w${covered.has(tk.i) ? ' glossed' : ''}${tk.pos ? ' p-' + tk.pos : ''}" data-i="${tk.i}"><span class="g">${esc(tk.s)}${pu ? `<span class="pu">${esc(pu)}</span>` : ''}</span><span class="gl"${glW(gs)}>${gs}</span></span>`;
  }
  const w = S.text.work, bi = S.text.bi;
  const bn = w && w.books.length > 1 ? `<div class="booknav">${bi > 0 ? `<button type="button" data-step="-1">◂ ${esc(w.books[bi - 1])}</button>` : '<span></span>'}${bi < w.books.length - 1 ? `<button type="button" data-step="1">${esc(w.books[bi + 1])} ▸</button>` : ''}</div>` : '';
  body.innerHTML = html + '</div>' + bn;
  body.classList.toggle('lib', !!S.text.blocks);
  S.wordEls = body.querySelectorAll('.w');
  markTarget();
  fillGlossBox();
}
// long glosses get wider in proportion to their length (about three lines), never wider than the text column
function glW(html) {
  const n = html.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, ' ').length;
  return n > 70 ? ` style="--gw:${Math.round(n / 5)}em"` : '';
}
function setGlossMax() { const b = $('#textBody'); if (b) b.style.setProperty('--glmax', Math.round(b.clientWidth * 0.8) + 'px'); }
// punctuation between words gets its own element, so that it can be coloured (Colours → Punctuation marks)
const punctHTML = t => t.split(/(\s+)/).map(x => /\S/.test(x) ? `<span class="pn">${esc(x)}</span>` : esc(x)).join('');
function dgHTML(tk) {
  const dg = tk.lemma && S.lemmaGloss[gkey(tk.lemma)];
  return dg ? `<span class="dg" data-dg="${esc(gkey(tk.lemma))}" title="default gloss for ${esc(tk.lemma)}">${glossHTML(dg)}</span>` : '';
}
function markTarget() {
  document.querySelectorAll('.w.cur,.w.rng').forEach(e => e.classList.remove('cur', 'rng'));
  if (!S.cur || S.curHidden) return;
  const [s, e] = S.cur;
  for (let i = s; i <= e; i++) document.querySelector(`.w[data-i="${i}"]`)?.classList.add(e > s ? 'rng' : 'cur');
}
async function openText(id, scroll = true) {
  saveReadPos();
  const t = id == null ? null : isBook(id) ? await loadBook(id) : await get('texts', id);
  S.text = t || null; S.cur = null;
  S.tokens = t ? (t.blocks ? tokenizeBlocks(t.blocks) : tokenize(t.text)) : [];
  S.marker = t ? (await setting('mk|' + t.id)) ?? null : null;
  if (t?.work) { await setting('wk|' + t.work.id, t.bi); S.opened = (await setting('opened')) || {}; S.opened[t.work.id] = Date.now(); await setting('opened', S.opened); }
  titleBar();
  S.glosses = t ? await req2p(tx('glosses').objectStore('glosses').index('textId').getAll(t.id)) : [];
  renderText();
  if (scroll) { const y = t ? await setting('pos|' + t.id) : 0; $('#textPane').scrollTop = y || 0; }
  if (t) await setting('currentText', t.id);
  if (!$('#listBody').hidden) renderList();
  resolveTokens();
}

// ---------------------------------------------------------------- dictionary view
// colours used by the Eulexis editors in Pape and LSJ, with their meaning (shown as a tooltip)
const FONT_MEANING = {
  '#494': 'name of author / scholar', brown: 'contrast (Pape) · variant reading, v.l. (LSJ)', darkgreen: 'derived adverb',
  blue: 'variant / parallel form ("neben")', darkblue: 'hapax legomenon', darkorange: 'doubtful reading (dub.)', red: 'false reading / to be deleted',
};
function normalizeHTML(h) {
  return h.replace(/<font color="([^"]+)">/g, (_, c) => `<span class="fc" data-c="${esc(c)}" title="${esc(FONT_MEANING[c] || '')}">`)
          .replace(/<font[^>]*>/g, '<span>').replace(/<\/font>/g, '</span>');
}
function wrapGreek(root) {      // make every Greek word in entries tappable
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    if (!/[Ͱ-Ͽἀ-῿]/.test(n.nodeValue) || n.parentElement.closest('.gw,summary')) continue;
    const frag = document.createDocumentFragment(); let last = 0; const s = n.nodeValue;
    for (const m of s.matchAll(GREEK_TOKEN)) {
      if (m[0].replace(/[^Ͱ-Ͽἀ-῿]/g, '').length < 2) continue;
      if (m.index > last) frag.append(s.slice(last, m.index));
      const sp = document.createElement('span'); sp.className = 'gw'; sp.textContent = m[0]; frag.append(sp);
      last = m.index + m[0].length;
    }
    if (last === 0) continue;
    if (last < s.length) frag.append(s.slice(last));
    n.replaceWith(frag);
  }
}
async function renderEntryHTML(e, depth = 0, seen = new Set()) {
  seen.add(e.d + ':' + e.i);
  let h = `<div class="ent">${e.d === 'frisk' ? '' : `<div class="hw">${esc(e.h)}</div>`}<div class="eb" data-hl="${e.d}:${e.i}">${normalizeHTML(e.html)}</div>`;
  if (e.r && depth < 3) {
    for (const ref of e.r) {
      if (seen.has(e.d + ':' + ref[1])) continue;
      const r = await entryByRef(e.d, ref); if (!r) continue;
      h += `<div class="ref"><div class="rl">→ see: ${esc(r.h)}</div>${await renderEntryHTML(r, depth + 1, seen)}</div>`;
    }
  }
  return h + '</div>';
}
// ---------------------------------------------------------------- highlighter (Apple Pencil / mouse)
// highlights are stored per dictionary entry as character ranges of the entry text: settings 'hl|<dict>:<id>' -> [[start,end],…]
function textNodes(root) { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const a = []; while (w.nextNode()) a.push(w.currentNode); return a; }
function offsetIn(root, node, off) {          // character offset of (node, off) inside root
  let n = 0;
  for (const t of textNodes(root)) { if (t === node) return n + off; n += t.nodeValue.length; }
  if (node.nodeType === 1) {                   // caret given relative to an element
    const r = document.createRange(); r.setStart(root, 0); r.setEnd(node, off); return r.toString().length;
  }
  return n;
}
function wrapRange(root, start, end, idx) {
  let n = 0;
  for (const t of textNodes(root)) {
    const len = t.nodeValue.length, a = Math.max(start, n), b = Math.min(end, n + len);
    if (a < b && t.nodeValue.trim()) {
      let mid = t; if (a > n) mid = t.splitText(a - n);
      if (b < n + len) mid.splitText(b - a);
      const m = document.createElement('mark'); m.className = 'hl'; m.dataset.r = idx;
      mid.replaceWith(m); m.append(mid);
    }
    n += len; if (n >= end) break;
  }
}
function unwrapMarks(root) { root.querySelectorAll('mark.hl').forEach(m => m.replaceWith(...m.childNodes)); root.normalize(); }
async function paintEntry(eb) {
  unwrapMarks(eb);
  const ranges = (await setting('hl|' + eb.dataset.hl)) || [];
  (S.hlCache ??= {})[eb.dataset.hl] = ranges;
  ranges.forEach(([a, b], i) => wrapRange(eb, a, b, i));
}
async function applyHighlights(root) { for (const eb of root.querySelectorAll('.eb[data-hl]')) await paintEntry(eb); }
function mergeRanges(rs) {
  rs.sort((x, y) => x[0] - y[0]); const out = [];
  for (const r of rs) { const l = out[out.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else out.push([...r]); }
  return out;
}
function subtractRange(rs, [a, b]) {
  const out = [];
  for (const [x, y] of rs) {
    if (y <= a || x >= b) { out.push([x, y]); continue; }
    if (x < a) out.push([x, a]);
    if (y > b) out.push([b, y]);
  }
  return out.filter(([x, y]) => y - x > 0);
}
function caretAt(x, y) {
  if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); return r && { node: r.startContainer, off: r.startOffset }; }
  if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && { node: p.offsetNode, off: p.offset }; }
  return null;
}
function posAt(root, off) {                      // (text node, offset) at character offset off inside root
  let n = 0, last = null;
  for (const t of textNodes(root)) { const len = t.nodeValue.length; if (off <= n + len) return [t, off - n]; n += len; last = t; }
  return last ? [last, last.nodeValue.length] : [root, 0];
}
// current selection inside ONE dictionary entry -> {eb, a, b, text}; anything else -> {text} or null
function dictSelection() {
  const sel = window.getSelection(); if (!sel.rangeCount) return null;
  const text = String(sel).trim(); if (!text) return null;
  const r = sel.getRangeAt(0);
  if (!$('#dictPane').contains(r.commonAncestorContainer)) return null;
  const el = n => n.nodeType === 1 ? n : n.parentElement;
  const eb = el(r.startContainer)?.closest('.eb'), eb2 = el(r.endContainer)?.closest('.eb');
  if (!eb || eb !== eb2 || !eb.dataset.hl) return { text };
  let a = offsetIn(eb, r.startContainer, r.startOffset), b = offsetIn(eb, r.endContainer, r.endOffset);
  if (a > b) [a, b] = [b, a];
  return { eb, a, b, text };
}
// highlighter button: marks the selected text, or removes the marking if all of it is already marked
async function toggleHighlight() {
  const d = S.sel; if (!d?.eb || d.b - d.a < 1) return;
  const key = 'hl|' + d.eb.dataset.hl;
  let ranges = (await setting(key)) || [];
  const covered = ranges.some(([x, y]) => x <= d.a + 1 && y >= d.b - 1);
  ranges = covered ? subtractRange(ranges, [d.a, d.b]) : mergeRanges([...ranges, [d.a, d.b]]);
  await setting(key, ranges); await paintEntry(d.eb);
  // keep the same text selected, so that it can still be added as a gloss
  const [n1, o1] = posAt(d.eb, d.a), [n2, o2] = posAt(d.eb, d.b);
  try { window.getSelection().setBaseAndExtent(n1, o1, n2, o2); } catch (_) { }
  updateFab();
}
function updateFab() {
  const fb = $('#fabBar'), d = S.sel;
  if (!d) { fb.hidden = true; return; }
  const ranges = d.eb ? (S.hlCache?.[d.eb.dataset.hl] || []) : [];
  const covered = d.eb && ranges.some(([x, y]) => x <= d.a + 1 && y >= d.b - 1);
  $('#fabHl').disabled = !d.eb; $('#fabHl').classList.toggle('on', !!covered);
  $('#fabHl').title = covered ? 'Remove the highlighting' : 'Highlight the selected text';
  const r = $('#dictPane').getBoundingClientRect();         // float at the bottom of the dictionary section
  Object.assign(fb.style, { left: r.left + 'px', width: r.width + 'px', bottom: Math.max(12, innerHeight - r.bottom + 14) + 'px' });
  fb.hidden = false;
}
// Apple Pencil: dragging over dictionary text selects it (instead of scrolling); fingers scroll and select as usual
function wirePencilSelect() {
  const pane = $('#dictPane');
  let drag = null;
  const stylusInEntry = e => [...e.changedTouches].some(t => t.touchType === 'stylus') && e.target.closest?.('.eb');
  pane.addEventListener('touchstart', e => { if (stylusInEntry(e)) e.preventDefault(); }, { passive: false });
  pane.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });
  pane.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'pen') return;
    const eb = e.target.closest('.eb'); if (!eb) return;
    const c = caretAt(e.clientX, e.clientY); if (!c) return;
    drag = { eb, start: c, moved: false, x: e.clientX, y: e.clientY, target: e.target };
    pane.setPointerCapture?.(e.pointerId);
  });
  pane.addEventListener('pointermove', e => {
    if (!drag) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
    if (!drag.moved) return;
    const c = caretAt(e.clientX, e.clientY); if (!c || !drag.eb.contains(c.node)) return;
    try { window.getSelection().setBaseAndExtent(drag.start.node, drag.start.off, c.node, c.off); } catch (_) { }
  });
  pane.addEventListener('pointerup', () => {
    if (!drag) return; const d = drag; drag = null;
    if (!d.moved) { window.getSelection().removeAllRanges(); d.target.closest('.gw')?.click(); }    // a Pencil tap works like a finger tap
  });
  pane.addEventListener('pointercancel', () => { drag = null; });
}

async function showWord(word, opts = {}) {
  if (S.view && !opts.replace) S.hist.push(S.view);
  S.fwd = [];
  S.view = { form: word, lemma: opts.lemma || null, openDict: opts.openDict || null, ti: opts.ti ?? null };
  navButtons();
  showTab('entry');
  await renderView();
}
function navButtons() { $('#btnBack').disabled = !S.hist.length; $('#btnFwd').disabled = !(S.fwd && S.fwd.length); }
function goBack() { if (!S.hist.length) return; S.fwd.push(S.view); S.view = S.hist.pop(); navButtons(); showTab('entry'); renderView(); }
function goFwd() { if (!S.fwd?.length) return; S.hist.push(S.view); S.view = S.fwd.pop(); navButtons(); showTab('entry'); renderView(); }
async function renderView() {
  const body = $('#dictBody'); const v = S.view; if (!v) return;
  if (!S.dicts.length) { body.innerHTML = '<p class="hint">No dictionaries installed yet. Open the menu ☰ → Dictionaries and import the packages (*.gdpkg.gz).</p>'; return; }
  const lang = langOf(v.form);
  const A = await analyses(v.form);
  const lemma = v.lemma || A.pick || v.form;
  v.pick = lemma;
  const k = gkey(lemma);
  v.key = k;
  let h = `<div class="form">${esc(v.form)}</div>`;
  if (A.lemmas.length) {
    h += '<div class="anas">' + A.lemmas.map(x => `<button class="chip${x.lemma === lemma ? ' on' : ''}" data-lemma="${esc(x.lemma)}"><b>${esc(x.lemma)}</b><small>${esc(x.ana.slice(0, 4).join(' · '))}${x.ana.length > 4 ? ' …' : ''}</small></button>`).join('') + '</div>';
    if (A.lemmas.length > 1) h += `<div class="pin">${A.chosen && A.pick === lemma ? '★ default for this form' : `<button data-pin="${esc(lemma)}">★ always use ${esc(lemma)} for “${esc(A.f)}”</button>`}</div>`;
  } else if (lang === 'la' ? S.latMorph : S.morph) {
    h += '<p class="note">Form not found in the morphological analysis – looking up the form itself.</p>';
  }
  h += '<div id="glossbox" hidden></div>';
  const by = await entriesFor(k, lang);
  const openSet = new Set((await setting('open|' + k)) || []);
  const shown = S.shown.filter(d => d.src === lang);
  if (!shown.length) h += `<p class="hint">${S.dicts.some(d => d.src === lang) ? `All ${LANGS[lang]} dictionaries are switched off` : `No ${LANGS[lang]} dictionary installed`} (menu ☰ → Dictionaries).</p>`;
  for (const d of shown) {
    let inner = '', has = false;
    const ents = by[d.id] || [];
    if (ents.length) { has = true; for (const e of ents) inner += await renderEntryHTML(e); }
    else if (by[d.id + '#m']) {
      has = true; inner += `<p class="note">No entry of its own – <i>${esc(lemma)}</i> is discussed under:</p>`;
      const seen = new Set();
      for (const ref of by[d.id + '#m']) { const e = await entryByRef(d.id, ref); if (e && !seen.has(d.id + ':' + e.i)) inner += await renderEntryHTML(e, 0, seen); }
    }
    if (!has) inner = '<p class="none">– no entry –</p>';
    h += `<details class="src${has ? '' : ' empty'}" data-d="${d.id}"${has && (openSet.has(d.id) || v.openDict === d.id) ? ' open' : ''}><summary>${esc(d.name)} <small>${esc(d.title || '')}</small></summary>${inner}</details>`;
  }
  body.innerHTML = h;
  body.querySelectorAll('details.src').forEach(el => wrapGreek(el));
  await applyHighlights(body);
  fillGlossBox();
  $('#dictPane').scrollTop = 0;
}
async function saveOpenState() {   // remembered per lemma
  if (!S.view?.key) return;
  const open = [...document.querySelectorAll('#dictBody details.src[open]')].map(d => d.dataset.d);
  await setting('open|' + S.view.key, open);
}

// ---------------------------------------------------------------- lemma list for the current text
async function renderList() {
  const lb = $('#listBody');
  if (!S.text) { lb.innerHTML = '<p class="hint">No text open.</p>'; return; }
  lb.innerHTML = '<p class="hint">Finding lemmata …</p>';
  const map = new Map();
  for (const tk of S.tokens) {
    if (tk.t !== 'w') continue;
    const A = await analyses(tk.s);
    const l = A.pick || canon(tk.s);
    let x = map.get(l); if (!x) map.set(l, x = { lemma: l, pos: tk.i, forms: new Set(), n: 0, known: !!A.pick });
    x.forms.add(tk.s); x.n++;
  }
  const rows = [...map.values()];
  if (S.listSort === 'alpha') rows.sort((a, b) => gkey(a.lemma).localeCompare(gkey(b.lemma), 'el') || a.lemma.localeCompare(b.lemma));
  else rows.sort((a, b) => a.pos - b.pos);
  lb.innerHTML = `<div class="lhead">${rows.length} lemmata · sort: <button data-sort="pos" class="${S.listSort === 'pos' ? 'on' : ''}">text order</button><button data-sort="alpha" class="${S.listSort === 'alpha' ? 'on' : ''}">alphabetical</button></div>` +
    rows.map(r => `<div class="lrow" data-lemma="${esc(r.lemma)}" data-pos="${r.pos}"><b>${esc(r.lemma)}</b><span>${esc([...r.forms].join(', '))}</span><em>${r.n}×${r.known ? '' : ' ?'}</em></div>`).join('');
}
function showTab(which) {
  $('#tabEntry').classList.toggle('on', which === 'entry'); $('#tabList').classList.toggle('on', which === 'list');
  $('#dictBody').hidden = which !== 'entry'; $('#listBody').hidden = which !== 'list';
}

// ---------------------------------------------------------------- glosses
function targetLemma() {      // lemma of the single selected word (as chosen in the dictionary pane, if open)
  if (!S.cur || S.cur[0] !== S.cur[1]) return null;
  const tk = S.tokens.find(t => t.t === 'w' && t.i === S.cur[0]); if (!tk) return null;
  if (S.view && canon(S.view.form) === canon(tk.s)) return S.view.lemma || S.view.pick || tk.lemma;
  return tk.lemma;
}
function spanGloss(s0, e0) { return S.glosses.find(g => g.s === s0 && g.e === e0) || null; }
// keep line breaks the user typed; tidy spaces and empty lines
function cleanGloss(t) { return t.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n'); }
const glossHTML = t => esc(t).replace(/\n/g, '<br>');
function joinGloss(old, add) { return old ? (old.split(/;\s*/).includes(add) ? old : old + '; ' + add) : add; }
async function setDefaultGloss(k, text) {
  if (text) { S.lemmaGloss[k] = text; await setting('lg|' + k, text); }
  else { delete S.lemmaGloss[k]; await del('settings', 'lg|' + k); }
}
async function saveSpanGloss(s0, e0, text) {     // create, update or (empty text) delete the gloss of a word/phrase
  const g = spanGloss(s0, e0);
  if (!text) { if (g) { await del('glosses', g.id); S.glosses = S.glosses.filter(x => x !== g); } return; }
  if (g) { g.t = text; await put('glosses', g); }
  else { const n = { textId: S.text.id, s: s0, e: e0, t: text, created: Date.now() }; n.id = await put('glosses', n); S.glosses.push(n); }
}
// add = true: the text is appended to an existing gloss (used for selections from the dictionary)
async function addGloss(text, asDefault = false, add = false) {
  if (!S.text && !asDefault) return toast('Open a text first.');
  text = add ? text.replace(/\s+/g, ' ').trim() : cleanGloss(text); if (!text) return;
  if (asDefault) {
    const l = targetLemma(); if (!l) return toast('A default gloss needs a single word with a known lemma.');
    const k = gkey(l);
    await setDefaultGloss(k, add ? joinGloss(S.lemmaGloss[k], text) : text);
    renderText(); fillGlossBox(); return toast(`Default gloss for ${l} ${add && S.lemmaGloss[k] !== text ? 'extended' : 'set'}`);
  }
  if (!S.cur) return toast('First tap the word in the text that the gloss belongs to.');
  const old = spanGloss(S.cur[0], S.cur[1])?.t;
  await saveSpanGloss(S.cur[0], S.cur[1], add ? joinGloss(old, text) : text);
  renderText(); fillGlossBox(); toast(old && add ? 'Gloss extended' : 'Gloss saved');
}
async function writeGloss() {     // type a gloss directly, without the dictionary
  if (!S.text) return toast('Open a text first.');
  if (!S.cur) return toast('First tap a word in the text.');
  const words = S.tokens.filter(t => t.t === 'w' && t.i >= S.cur[0] && t.i <= S.cur[1]).map(t => t.s).join(' ');
  const l = targetLemma();
  const existing = spanGloss(S.cur[0], S.cur[1])?.t;
  const prefill = existing || (l && S.lemmaGloss[gkey(l)]) || '';
  const r = await dialog(`<h3>Gloss for <span class="gk">${esc(words)}</span></h3><input type="text" name="t" value="${esc(prefill)}" autocomplete="off">` +
    (l ? `<label class="opt"><input type="checkbox" name="def"${S.lastDefault ? ' checked' : ''}>Use as default gloss for <span class="gk">${esc(l)}</span> wherever it appears</label>` : ''),
    [['cancel', 'Cancel'], ['ok', 'Save']], 'ok');
  if (r.action === 'ok' && (r.data.t || '').trim()) { S.lastDefault = r.data.def === 'on'; addGloss(r.data.t, S.lastDefault); }
}
// open the selected word in the dictionary pane (if it is not shown already) and put the cursor into its gloss field
async function openGlossField(kind = 'span', lemma = null) {
  if (!S.text) return toast('Open a text first.');
  if (!S.cur) return toast('First tap a word in the text.');
  const i0 = S.cur[0];
  const shown = S.view && S.view.ti != null && S.cur[0] <= S.view.ti && S.view.ti <= S.cur[1] && !$('#dictBody').hidden;
  if (!shown) {
    const tk = S.tokens.find(t => t.t === 'w' && t.i === i0);
    S.hist = []; S.view = null; await showWord(tk.s, { ti: i0, lemma: lemma || tk.lemma || null });
  }
  fillGlossBox();
  const inp = $(kind === 'def' ? '#glossbox textarea[data-def]' : '#glossbox textarea[data-span]');
  if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); inp.scrollIntoView({ block: 'nearest' }); }
}
// gloss box at the top of the dictionary pane: gloss of the tapped word + default gloss of the lemma, editable in place
function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; }
function fillGlossBox() {
  const box = $('#glossbox'); if (!box || !S.view) return;
  const v = S.view, k = v.pick ? gkey(v.pick) : null;
  const sel = S.cur && v.ti != null && S.cur[0] <= v.ti && v.ti <= S.cur[1] ? S.cur : (v.ti != null ? [v.ti, v.ti] : null);
  let h = '';
  if (sel && S.text) {
    const g = spanGloss(sel[0], sel[1]);
    const words = S.tokens.filter(t => t.t === 'w' && t.i >= sel[0] && t.i <= sel[1]).map(t => t.s).join(' ');
    h += `<label class="gb"><span>Gloss <i>${esc(words)}</i></span><textarea rows="1" data-span="${sel[0]},${sel[1]}" placeholder="– none –" autocomplete="off">${esc(g?.t || '')}</textarea></label>`;
  }
  if (k) h += `<label class="gb"><span>Default <i>${esc(v.pick)}</i></span><textarea rows="1" data-def="${esc(k)}" placeholder="– none –" autocomplete="off">${esc(S.lemmaGloss[k] || '')}</textarea></label>`;
  if (box.contains(document.activeElement)) return;   // do not disturb a field that is being edited
  box.innerHTML = h; box.hidden = !h;
  box.querySelectorAll('textarea').forEach(autoGrow);
}
async function editGloss(id) {
  const g = S.glosses.find(x => x.id === id); if (!g) return;
  const r = await dialog(`<h3>Edit gloss</h3><input type="text" name="t" value="${esc(g.t)}" autocomplete="off">`,
    [['delete', 'Delete'], ['cancel', 'Cancel'], ['ok', 'Save']], 'ok');
  if (r.action === 'ok') {
    const t = (r.data.t || '').trim();
    if (!t) { toast('Empty gloss not saved – use “Delete” to remove it.'); return; }
    g.t = t; await put('glosses', g);
  }
  if (r.action === 'delete') { await del('glosses', g.id); S.glosses = S.glosses.filter(x => x.id !== g.id); }
  renderText();
}

// ---------------------------------------------------------------- dialogs
// buttons: [value, label] | ['file', label, inputId] | ['link', label, {href,name}]; Enter triggers defaultAction
function dialog(inner, buttons = [['ok', 'OK']], defaultAction = null) {
  return new Promise(res => {
    const d = $('#dlg'), f = $('#dlgForm');
    f.innerHTML = inner + '<div class="row">' + buttons.map(([v, l, extra]) =>
      v === 'file' ? `<label class="btn" for="${extra}">${l}</label>`
      : v === 'link' ? `<a class="btn" href="${extra.href}" download="${extra.name}">${l}</a>`
      : `<button type="button" data-v="${v}">${l}</button>`).join('') + '</div>';
    let action = 'cancel';
    const finish = a => { action = a; d.close(); };
    f.querySelectorAll('button[data-v]').forEach(b => b.addEventListener('click', () => finish(b.dataset.v)));
    f.querySelectorAll('label.btn,a.btn').forEach(el => el.addEventListener('click', () => setTimeout(() => finish('picked'), 50)));
    f.onsubmit = ev => { ev.preventDefault(); if (defaultAction) finish(defaultAction); };
    f.onkeydown = ev => {
      if (ev.key === 'Enter' && !ev.isComposing && ev.target.tagName !== 'TEXTAREA' && ev.target.tagName !== 'BUTTON') { ev.preventDefault(); if (defaultAction) finish(defaultAction); }
    };
    d.onclose = () => { const data = Object.fromEntries(new FormData(f)); res({ action, data }); };
    // a click outside the dialog (on the dimmed background) closes it like "Close"
    const outside = e => { const r = d.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
    d.onpointerdown = e => { d._down = outside(e); };
    d.onclick = e => { if (e.target === d && d._down && outside(e)) finish('cancel'); d._down = false; };
    d.showModal();
    const first = f.querySelector('input[type=text]:not(.privf input),textarea');
    if (first) { first.focus(); first.select?.(); } else { f.tabIndex = -1; f.focus({ preventScroll: true }); }
  });
}
async function textsDialog() {
  const texts = await getAll('texts');
  const list = texts.map(t => `<div class="item"><span class="t">${esc(t.title)} <small>${new Date(t.created).toLocaleDateString('en-GB')}</small></span><button type="button" data-v="open:${t.id}">Open</button><button type="button" class="danger" data-v="del:${t.id}">Delete</button></div>`).join('') || '<p class="hint">No texts yet.</p>';
  const r = await dialog(`<h3>Texts</h3><div class="list">${list}</div>`, [['new', 'New text (paste)'], ['file', 'Load file …', 'fileText'], ['cancel', 'Close']]);
  if (r.action.startsWith('open:')) return openText(+r.action.slice(5));
  if (r.action.startsWith('del:')) {
    const id = +r.action.slice(4);
    const c = await dialog('<h3>Delete text?</h3><p>The text and all its glosses will be deleted.</p>', [['cancel', 'Cancel'], ['ok', 'Delete']]);
    if (c.action === 'ok') {
      const gl = await req2p(tx('glosses').objectStore('glosses').index('textId').getAll(id));
      for (const g of gl) await del('glosses', g.id);
      await del('texts', id); if (S.text?.id === id) await openText(null);
    }
    return textsDialog();
  }
  if (r.action === 'new') {
    const n = await dialog('<h3>New text</h3><input type="text" name="title" placeholder="Title"><p></p><textarea name="text" placeholder="Paste the Greek text here …"></textarea>', [['cancel', 'Cancel'], ['ok', 'Save']]);
    if (n.action === 'ok' && n.data.text.trim()) await saveText(n.data.title.trim() || 'Text ' + new Date().toLocaleDateString('en-GB'), n.data.text);
  }
}
async function saveText(title, text, choices) {
  const id = await put('texts', { title, text, created: Date.now() });
  if (choices) for (const [f, lemma] of Object.entries(choices)) await put('choices', { f: canon(f), lemma });
  await openText(id); toast('Text saved');
}
// remove everything that is no longer needed: databases of removed dictionaries, the pre-v3 database, old app caches
async function cleanStorage() {
  const before = (await navigator.storage?.estimate?.().catch(() => null))?.usage;
  let removed = [];
  const dbs = await listDBs();
  if (dbs) for (const { name } of dbs) {
    if (name === OLD_DB || (name.startsWith(DICT_DB) && !S.installed[name.slice(DICT_DB.length)])) {
      await new Promise(res => { const r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = () => res(); });
      removed.push(name);
    }
  }
  try {   // keep only the newest app cache (the service worker uses that one)
    const keys = (await caches.keys()).filter(k => k.startsWith('lesepult-')).sort((a, b) => parseInt(b.split('-v')[1]) - parseInt(a.split('-v')[1]));
    for (const k of keys.slice(1)) { await caches.delete(k); removed.push(k); }
  } catch (_) { }
  const after = (await navigator.storage?.estimate?.().catch(() => null))?.usage;
  toast(removed.length ? `Removed ${removed.length} unused item(s)` + (before && after ? ` · ${(before / 1e6).toFixed(0)} → ${(after / 1e6).toFixed(0)} MB` : '') : 'Nothing to clean up.', 4000);
}
// Frisk and Bailly may not be published: they live in a PRIVATE GitHub repository, read with a personal
// access token that is stored only on this device (☰ → Dictionaries → Private dictionaries).
async function privCfg() { return (await setting('privRepo')) || { repo: '', token: '' }; }
async function privFetch(cfg, path) {
  const r = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}`, {
    cache: 'no-store', headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github.raw', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (!r.ok) throw new Error(r.status === 401 ? 'the token is not valid (any more)' : r.status === 404 ? 'repository not found, or the token has no access to it' : 'HTTP ' + r.status);
  return r;
}
function pkgFetch(p) { return p.priv ? privFetch(p.priv, p.file) : fetch('packages/' + p.file, { cache: 'no-cache' }); }
async function fetchManifest() {
  let man;
  try { man = await (await fetch('packages/packages.json', { cache: 'no-cache' })).json(); } catch (_) { return null; }
  S.privErr = null;
  const cfg = await privCfg();
  if (cfg.token && cfg.repo) {
    try { const pm = await (await privFetch(cfg, 'packages.json')).json(); for (const p of pm.packages) man.packages.push(Object.assign(p, { priv: cfg })); }
    catch (e) { S.privErr = e.message; }
  }
  return man;
}
async function dictsDialog() {
  await loadDicts();
  const man = await fetchManifest();
  const privCfgNow = await privCfg();
  const remote = Object.fromEntries((man?.packages || []).map(p => [p.id, p]));
  // download / update button for every package that is available on the app's website
  const repoBtn = id => {
    const p = remote[id]; if (!p) return '';
    const mb = (p.bytes / 1e6).toFixed(1) + ' MB';
    const label = !S.installed[id] ? 'Download' : S.installed[id].version !== p.version ? 'Update' : null;
    if (DL.has(id)) return dlButtonHTML(id, label || 'Update');
    if (!label) return `<button type="button" class="dlbtn" disabled title="Same version as on the website">Up to date</button>`;
    return `<button type="button" class="dlbtn" data-get="${id}" title="${mb}">${label}</button>`;
  };
  const delBtn = id => `<button type="button" class="danger" data-v="del:${id}" title="Remove from this device">Delete</button>`;
  const sizeOf = d => d.size ? ` · ≈ ${(d.size / 1e6).toFixed(0)} MB` : '';
  const onBox = (id, what) => `<label class="sw" title="Use this ${what}"><input type="checkbox" data-dict-on="${id}"${S.dictPrefs.off.includes(id) ? '' : ' checked'}></label>`;
  const missingRow = p => `<div class="item"><span class="t"><b>${esc(p.name)}</b> ${esc(p.title || '')}<br><small>not on this device · ${(p.bytes / 1e6).toFixed(1)} MB${p.priv ? ' · private repository' : ''}</small></span>${repoBtn(p.id)}</div>`;
  // 1. dictionaries (drag to reorder, tick to show)
  const srcOf = p => p.src || (['ls', 'georges', 'collatinus', 'morph-la'].includes(p.id) ? 'la' : 'grc');
  const rowsFor = lang => S.dicts.filter(d => d.src === lang).map(d => `<div class="item dictrow" data-id="${d.id}"><span class="grip" title="Drag to reorder" aria-label="Drag to reorder">⠿</span>${onBox(d.id, 'dictionary')}<span class="t"><b>${esc(d.name)}</b> ${esc(d.title || '')}<br><small>${d.count.toLocaleString('en')} entries${sizeOf(d)} · ${esc(d.source || '')}</small></span>${repoBtn(d.id)}${delBtn(d.id)}</div>`).join('');
  const missFor = lang => Object.values(remote).filter(p => !S.installed[p.id] && p.kind === 'dictionary' && srcOf(p) === lang).map(missingRow).join('');
  // 2. analysis tools (tick to use)
  const tools = [S.morphInst && [S.morphInst, 'Greek: lemma and form for every word', `${S.morphInst.count.toLocaleString('en')} forms${sizeOf(S.morphInst)}`],
                 S.hintsInst && [S.hintsInst, 'Greek: preferred lemma for ambiguous forms; word classes for the colours', ''],
                 S.latMorphInst && [S.latMorphInst, 'Latin: lemma and form for every word', `${S.latMorphInst.count.toLocaleString('en')} lemmata${sizeOf(S.latMorphInst)}`]].filter(Boolean)
    .map(([d, what, sub]) => `<div class="item toolrow"><span class="grip ph" aria-hidden="true">⠿</span>${onBox(d.id, 'tool')}<span class="t"><b>${esc(d.name)}</b> <small>${esc(what)}</small><br><small>${sub ? sub + ' · ' : ''}${esc(d.source || '')}</small></span>${repoBtn(d.id)}${delBtn(d.id)}</div>`).join('');
  const missT = Object.values(remote).filter(p => !S.installed[p.id] && p.kind !== 'dictionary').map(missingRow).join('');
  let est = '', pers = '';
  try { const e = await navigator.storage?.estimate?.(); if (e) est = `The app uses ${(e.usage / 1e6).toFixed(0)} MB on this device`; } catch (_) { }
  try { pers = (await navigator.storage?.persisted?.()) ? ' · protected: downloads stay until you delete them' : ' · <b>not yet protected</b> – start the app from its Home Screen icon'; } catch (_) { }
  const privState = privCfgNow.token ? (S.privErr ? '<span class="bad">' + esc(S.privErr) + '</span>' : '<span class="ok">connected</span>') : 'not connected';
  const r = await dialog(`<h3>Dictionaries</h3>
    ${Object.entries(LANGS).map(([lang, name]) => { const rs = rowsFor(lang), ms = missFor(lang);
      return `<section class="dsec"><h4>${name} dictionaries <small>drag ⠿ to change the order · untick to hide</small></h4>
      <div class="list plain dictlist">${rs || ms ? rs + ms : `<p class="hint">No ${name} dictionaries installed.</p>`}</div></section>`; }).join('')}
    <section class="dsec"><h4>Analysis tools <small>untick to switch off</small></h4>
      <div class="list plain">${tools || missT ? tools + missT : '<p class="hint">No analysis tools installed.</p>'}</div></section>
    ${man ? '' : '<p class="hint">The website could not be reached (offline?) – download buttons are not available right now. Everything already installed works offline.</p>'}
    <section class="dsec"><h4>Private dictionaries <small>${privState}</small></h4>
      <p class="hint small">Dictionaries that may not be published can be downloaded from a private GitHub repository.</p>
      <div class="privf"><label>GitHub repository<input type="text" name="privRepo" value="${esc(privCfgNow.repo)}" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="owner/repository"></label>
      <label>Access token<input type="password" name="privToken" value="${esc(privCfgNow.token)}" autocomplete="off" placeholder="github_pat_…"></label></div>
      <p class="hint small"><b>Repository:</b> owner and name of the private repository. <b>Token:</b> a GitHub fine-grained personal access token with access to that repository only and the permission “Contents: Read-only”; it is stored only on this device.<br>
      <b>Format:</b> the repository contains dictionary packages (<code>*.gdpkg.gz</code>, format <code>greekdict-pkg-2</code>, as made by the toolkit’s <code>python gd.py packages</code>) and a <code>packages.json</code> next to them that lists them (id, file, name, kind, bytes, version) – the same layout as the app’s public <code>packages</code> folder.</p>
      <div class="row" style="justify-content:flex-start;margin-top:.4rem"><button type="button" data-v="privsave">Save and connect</button>${privCfgNow.token ? '<button type="button" class="danger" data-v="privforget">Forget token</button>' : ''}</div></section>
    <section class="dsec"><h4>Editors’ colour marks</h4>
      <label class="opt"><input type="checkbox" id="optSrcCol"${S.srcColors ? ' checked' : ''}> Show the colour marks of the Eulexis editors in Pape and LSJ</label>
      <p class="legend">${Object.entries(FONT_MEANING).map(([c, t]) => `<span class="fc" data-c="${c}">■</span> ${esc(t)}`).join('<br>')}</p></section>
    <section class="dsec"><h4>Storage</h4><p class="hint small">${est}${pers}.</p>
      <div class="row" style="justify-content:flex-start"><button type="button" data-v="clean">Clean up storage</button></div></section>`,
    [['file', 'Import packages …', 'fileDict'], ['cancel', 'Close']]);
  if (r.action === 'clean') { await cleanStorage(); return dictsDialog(); }
  if (r.action === 'privsave') { await setting('privRepo', { repo: (r.data.privRepo || '').trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, ''), token: (r.data.privToken || '').trim() }); return dictsDialog(); }
  if (r.action === 'privforget') { await setting('privRepo', { repo: privCfgNow.repo, token: '' }); return dictsDialog(); }
  if (r.action.startsWith('del:')) {
    const id = r.action.slice(4), d = S.installed[id];
    if (DL.has(id)) { toast('Wait until the download has finished.'); return dictsDialog(); }
    const c = await dialog(`<h3>Delete ${esc(d?.name || id)}?</h3><p>The dictionary is deleted from this device and its space is freed. You can download or import it again later. To just hide it, untick it instead.</p>`, [['cancel', 'Cancel'], ['ok', 'Delete']]);
    if (c.action === 'ok') { await deleteDict(id); await loadDicts(); if (S.view) renderView(); }
    return dictsDialog();
  }
}
function wireDictDrag() {
  let drag = null;
  document.addEventListener('pointerdown', e => {
    const grip = e.target.closest('#dlg .dictrow .grip'); if (!grip) return;
    e.preventDefault();
    const row = grip.closest('.dictrow'), list = row.parentElement;
    const r = row.getBoundingClientRect();
    drag = { row, list, y0: e.clientY, off: e.clientY - r.top, id: e.pointerId };
    row.classList.add('dragging'); grip.setPointerCapture(e.pointerId);
  });
  document.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const { row, list } = drag;
    row.style.transform = `translateY(${e.clientY - drag.y0}px)`;
    // move the row in the DOM when the pointer passes the middle of a neighbour
    const others = [...list.querySelectorAll('.dictrow')].filter(x => x !== row);
    const before = others.find(x => { const b = x.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; });
    const oldTop = row.getBoundingClientRect().top;
    if (before && before.previousElementSibling !== row) list.insertBefore(row, before);
    else if (!before && list.lastElementChild !== row && others.length) others[others.length - 1].after(row);
    else return;
    // keep the row under the finger after the DOM move
    const shift = row.getBoundingClientRect().top - oldTop;
    drag.y0 += shift; row.style.transform = `translateY(${e.clientY - drag.y0}px)`;
  });
  const end = async e => {
    if (!drag || e.pointerId !== drag.id) return;
    const { row, list } = drag; drag = null;
    row.classList.remove('dragging'); row.style.transform = '';
    S.dictPrefs.order = [...document.querySelectorAll('#dlg .dictrow')].map(x => x.dataset.id);    // all languages
    await setting('dictPrefs', S.dictPrefs); await loadDicts(); if (S.view) renderView();
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
}
// analysis tools per language (Settings → Languages); switching one on switches the others of that language off
function langTools(lang) { return Object.values(S.installed || {}).filter(d => (lang === 'la' ? d.kind === 'latmorph' : d.kind === 'morph')); }
async function setLangTool(lang, id) {
  const off = new Set(S.dictPrefs.off);
  for (const d of langTools(lang)) d.id === id ? off.delete(d.id) : off.add(d.id);
  S.dictPrefs.off = [...off]; await setting('dictPrefs', S.dictPrefs);
  await loadDicts(); bucketCache.clear(); S.latEngine = null;
  resetTokens(); renderText(); resolveTokens(); if (S.view) renderView();
}
async function settingsDialog() {
  await loadDicts();
  const dark = document.documentElement.dataset.theme === 'dark';
  const toolSel = lang => { const ts = langTools(lang), cur = ts.find(d => !S.dictPrefs.off.includes(d.id));
    return ts.length ? `<select data-langtool="${lang}">${ts.map(d => `<option value="${d.id}"${d === cur ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}<option value=""${cur ? '' : ' selected'}>None (no analysis)</option></select>`
      : '<small class="hint">not installed – ☰ → Dictionaries</small>'; };
  const r = await dialog(`<h3>Settings</h3>
    <section class="dsec"><h4>Appearance</h4>
      <label class="opt"><input type="radio" name="theme" value="dark" data-set="theme"${dark ? ' checked' : ''}> Dark mode</label>
      <label class="opt"><input type="radio" name="theme" value="light" data-set="theme"${dark ? '' : ' checked'}> Light mode</label></section>
    <section class="dsec"><h4>Languages</h4>
      <p class="hint small">The language of each word follows from its alphabet. Choose the tool that finds lemma and form for each language; the dictionaries per language are in ☰ → Dictionaries.</p>
      <div class="langrow"><span>Greek</span>${toolSel('grc')}</div>
      <div class="langrow"><span>Latin</span>${toolSel('la')}</div></section>
    <section class="dsec"><h4>Glosses</h4>
      <p class="hint small">A word can have its own gloss, and its lemma can have a default gloss that applies everywhere.</p>
      <label class="opt"><input type="radio" name="glossMode" value="replace" data-set="glossMode"${S.glossMode !== 'both' ? ' checked' : ''}> A word’s own gloss replaces the default gloss</label>
      <label class="opt"><input type="radio" name="glossMode" value="both" data-set="glossMode"${S.glossMode === 'both' ? ' checked' : ''}> Show both (the default gloss below the word’s own gloss)</label></section>
    <section class="dsec"><h4>Word-class colours</h4>
      <p class="hint small">Colours used by the “Colours” button in the top bar.</p>
      <div class="row" style="justify-content:flex-start"><button type="button" data-v="pos">Choose colours</button></div></section>
    <section class="dsec"><h4>Backup</h4>
      <p class="hint small">Save or restore your texts, glosses, default glosses, markers, favourites and lemma choices.</p>
      <div class="row" style="justify-content:flex-start"><button type="button" data-v="backup">Backup and restore</button></div></section>`,
    [['cancel', 'Close']]);
  if (r.action === 'pos') { await posDialog(); return settingsDialog(); }
  if (r.action === 'backup') return backupDialog();
}
async function posDialog() {
  const rows = POS.map(([id, label]) => `<div class="item"><label class="t"><input type="checkbox" name="on_${id}"${S.posCfg[id]?.on !== false ? ' checked' : ''}> ${label}</label><input type="color" name="c_${id}" value="${S.posCfg[id]?.c}"></div>`).join('');
  const r = await dialog(`<h3>Word-class colours</h3><p class="hint">Word classes come from the morphological analysis and treebank data; ambiguous forms follow the lemma chosen in the dictionary pane.</p><div class="list">${rows}</div>`,
    [['reset', 'Reset colours'], ['cancel', 'Cancel'], ['ok', 'Apply']]);
  if (r.action === 'reset') S.posCfg = defaultPosCfg();
  else if (r.action === 'ok') for (const [id] of POS) S.posCfg[id] = { on: r.data['on_' + id] === 'on', c: r.data['c_' + id] };
  else return;
  await setting('posCfg', S.posCfg); S.posOn = true; await setting('posOn', true);
  applyPosColors();
}
function defaultPosCfg() { return Object.fromEntries(POS.map(([id, , c]) => [id, { on: true, c }])); }
// free dictionaries (Pape, LSJ, morphology) are published next to the app: packages/packages.json
// ---- downloads inside the Dictionaries dialog: the button fills with colour as the download progresses.
// Several can be started; they run one after the other, so the iPad is not overloaded.
const DL = new Map();          // id -> progress 0..1 (or -1 = waiting)
let dlRunning = false;
function dlButtonHTML(id, label) {
  const p = DL.get(id); const pct = p < 0 ? 0 : Math.round(p * 100);
  return `<button type="button" class="dlbtn busy" data-dl="${id}" style="--p:${pct}%" disabled>${p < 0 ? 'Waiting…' : p >= 0.9 ? 'Installing…' : pct + ' %'}</button>`;
}
function paintDL(id, text) {
  for (const b of document.querySelectorAll(`#dlg [data-get="${id}"], #dlg [data-dl="${id}"]`)) {
    const p = DL.get(id);
    b.removeAttribute('data-get'); b.dataset.dl = id; b.disabled = true; b.classList.add('busy');
    b.style.setProperty('--p', Math.round(Math.max(0, p ?? 1) * 100) + '%');
    b.textContent = text || (p < 0 ? 'Waiting…' : p >= 0.9 ? 'Installing…' : Math.round(p * 100) + ' %');
  }
}
function queueDownload(id) {
  if (DL.has(id)) return;
  navigator.storage?.persist?.().catch(() => { });
  DL.set(id, -1); paintDL(id); runDownloads();
}
async function runDownloads() {
  if (dlRunning) return; dlRunning = true;
  let man = null, dicts = false;
  for (;;) {
    const id = [...DL.keys()].find(k => DL.get(k) < 0); if (!id) break;
    if (id.startsWith('work:')) { await downloadWork(id); continue; }
    dicts = true;
    if (!man) man = await fetchManifest();
    if (!man) { for (const k of [...DL.keys()]) if (!k.startsWith('work:')) { DL.delete(k); paintDL(k, 'Failed'); } toast('Could not reach the website – are you online?'); continue; }
    const p = man.packages.find(x => x.id === id);
    try {
      DL.set(id, 0); paintDL(id);
      const r = await pkgFetch(p);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const reader = r.body.getReader(); const parts = []; let got = 0;
      for (;;) { const { done: fin, value } = await reader.read(); if (fin) break; parts.push(value); got += value.length; DL.set(id, 0.9 * got / p.bytes); paintDL(id); }
      DL.set(id, 0.9); paintDL(id);
      await importPackage(new File(parts, p.file), x => { DL.set(id, 0.9 + 0.1 * x); paintDL(id); }, p.version);
      DL.delete(id); paintDL(id, 'Up to date');
      document.querySelectorAll(`#dlg [data-dl="${id}"]`).forEach(b => { b.classList.remove('busy'); b.style.removeProperty('--p'); });
      toast(`${p.name} installed`);
    } catch (e) { DL.delete(id); toast(`${p?.name || id}: download failed (${e.message})`, 4000); paintDL(id, 'Failed'); }
    await loadDicts(); bucketCache.clear();
  }
  dlRunning = false;
  if (!dicts) return;
  if (S.view) renderView(); resetTokens(); resolveTokens();
  // refresh the open Dictionaries dialog so the new entries get their Delete button and size
  const d = $('#dlg');
  if (d.open && $('#dlg h3')?.textContent === 'Dictionaries') { d.close(); dictsDialog(); }
}
// ids: download exactly these packages; without ids: everything that is new or changed (first start)
async function syncPackages(ids = null) {
  const man = await fetchManifest();
  if (!man) return toast('Could not reach the website – are you online?');
  await loadDicts();
  const todo = man.packages.filter(p => ids ? ids.includes(p.id) : S.installed[p.id]?.version !== p.version);
  if (!todo.length) return toast('All downloadable dictionaries are up to date.');
  const d = $('#dlg'), f = $('#dlgForm');
  if (d.open) d.close();
  f.innerHTML = '<h3>Download</h3><p id="impMsg">…</p><div class="prog"><i id="impBar"></i></div>'; d.showModal();
  const prog = (x, msg) => { if (msg) $('#impMsg').textContent = msg; $('#impBar').style.width = (x * 100).toFixed(0) + '%'; };
  try {
    for (const p of todo) {
      prog(0, `Downloading ${p.name} (${(p.bytes / 1e6).toFixed(1)} MB) …`);
      const r = await pkgFetch(p);
      if (!r.ok) throw new Error(p.file + ': HTTP ' + r.status);
      const reader = r.body.getReader(); const parts = []; let got = 0;
      for (;;) { const { done: fin, value } = await reader.read(); if (fin) break; parts.push(value); got += value.length; prog(got / p.bytes); }
      await importPackage(new File(parts, p.file), prog, p.version);
    }
    d.close(); toast(todo.length === 1 ? `${todo[0].name} installed` : 'Dictionaries installed');
  } catch (e) {
    $('#impMsg').textContent = 'Error: ' + e.message;
    await new Promise(res => { f.insertAdjacentHTML('beforeend', '<div class="row"><button>OK</button></div>'); f.onsubmit = ev => { ev.preventDefault(); d.close(); res(); }; });
  }
  await loadDicts(); bucketCache.clear(); if (S.view) renderView(); resetTokens(); resolveTokens();
}
async function importFiles(files) {
  const d = $('#dlg'), f = $('#dlgForm');
  f.innerHTML = '<h3>Import</h3><p id="impMsg">…</p><div class="prog"><i id="impBar"></i></div>';
  d.showModal();
  const prog = (x, msg) => { if (msg) $('#impMsg').textContent = msg; $('#impBar').style.width = (x * 100).toFixed(0) + '%'; };
  try {
    for (const file of files) { prog(0, 'Reading ' + file.name + ' …'); await importPackage(file, prog); }
    d.close(); toast('Import finished');
  } catch (e) { $('#impMsg').textContent = 'Error: ' + e.message; f.insertAdjacentHTML('beforeend', '<div class="row"><button>OK</button></div>'); f.onsubmit = ev => { ev.preventDefault(); d.close(); }; }
  await loadDicts(); bucketCache.clear(); if (S.view) renderView();
  resetTokens(); resolveTokens();
}
async function backupDialog() {
  // the export file is prepared first, so that the download link is tapped directly by the user (needed on iPad)
  const data = { format: 'greekdict-backup-1', date: new Date().toISOString(), texts: await getAll('texts'), glosses: await getAll('glosses'), choices: await getAll('choices'), lemmaGlosses: S.lemmaGloss,
    highlights: Object.fromEntries((await getAll('settings', IDBKeyRange.bound('hl|', 'hl|\uffff'))).map(r => [r.k.slice(3), r.v])),
    markers: Object.fromEntries((await getAll('settings', IDBKeyRange.bound('mk|', 'mk|\uffff'))).map(r => [r.k.slice(3), r.v])),
    favourites: (await setting('favs')) || {} };
  const href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const name = 'greek-reader-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  await dialog(`<h3>Backup</h3><p>Save your texts (${data.texts.length}), glosses (${data.glosses.length}, including those in library texts), default glosses (${Object.keys(S.lemmaGloss).length}), markers, favourites (${Object.keys(data.favourites).length}) and lemma choices as a file (e.g. in Files or iCloud), or restore them from a backup. Dictionaries and library texts are not included (they can be downloaded again).</p>`,
    [['link', 'Save backup', { href, name }], ['file', 'Restore …', 'fileBackup'], ['cancel', 'Close']]);
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}
async function restoreBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.format !== 'greekdict-backup-1') return toast('Not a backup file.');
  const c = await dialog(`<h3>Restore?</h3><p>${data.texts.length} texts and ${data.glosses.length} glosses. Existing items with the same number are overwritten.</p>`, [['cancel', 'Cancel'], ['ok', 'Restore']]);
  if (c.action !== 'ok') return;
  await bulkPut('texts', data.texts); await bulkPut('glosses', data.glosses); await bulkPut('choices', data.choices);
  for (const [k, t] of Object.entries(data.lemmaGlosses || {})) { S.lemmaGloss[k] = t; await setting('lg|' + k, t); }
  for (const [k, r] of Object.entries(data.highlights || {})) await setting('hl|' + k, r);
  for (const [k, r] of Object.entries(data.markers || {})) await setting('mk|' + k, r);
  if (data.favourites) { S.favs = Object.assign((await setting('favs')) || {}, data.favourites); await setting('favs', S.favs); }
  toast('Restored'); await openText(data.texts[0]?.id ?? null);
}

// ---------------------------------------------------------------- events
function wire() {
  $('#textBody').addEventListener('click', async ev => {
    // tapping a gloss opens its word in the dictionary pane and puts the cursor into the gloss field there
    const dg = ev.target.closest('.gl .dg'), gsp = ev.target.closest('.gl span[data-g]');
    if (dg || gsp) {
      const g = gsp ? S.glosses.find(x => x.id === +gsp.dataset.g) : null;
      const i0 = g ? g.s : +ev.target.closest('.w').dataset.i;
      S.cur = g ? [g.s, g.e] : [i0, i0]; S.curHidden = false; markTarget();
      S.view = null;                                  // always reopen the tapped word
      return openGlossField(dg ? 'def' : 'span');
    }
    const st = ev.target.closest('[data-step]'); if (st) return stepBook(+st.dataset.step);
    const w = ev.target.closest('.w');
    if (!w) { if (!String(window.getSelection())) { S.curHidden = true; markTarget(); } return; }
    S.curHidden = false;
    const i = +w.dataset.i;
    S.cur = [i, i]; markTarget();
    const tk = S.tokens.find(t => t.t === 'w' && t.i === i);
    S.hist = []; S.view = null; await showWord(tk.s, { ti: i });
  });
  $('#dictBody').addEventListener('click', async ev => {
    const chip = ev.target.closest('.chip'); if (chip) { S.view.lemma = chip.dataset.lemma; return renderView(); }
    const pin = ev.target.closest('[data-pin]');
    if (pin) { await put('choices', { f: canon(S.view.form), lemma: pin.dataset.pin }); S.view.lemma = null; const f0 = canon(S.view.form); resetTokens(tk => canon(tk.s) === f0); await renderView(); resolveTokens(); renderText(); return; }
    const gw = ev.target.closest('.gw');
    if (gw && !String(window.getSelection())) return showWord(gw.textContent, { openDict: gw.closest('details.src')?.dataset.d });
  });
  $('#dictBody').addEventListener('change', async ev => {
    const inp = ev.target; const t = cleanGloss(inp.value);
    if (inp.dataset.span) { const [a, b] = inp.dataset.span.split(',').map(Number); await saveSpanGloss(a, b, t); renderText(); toast(t ? 'Gloss saved' : 'Gloss removed'); }
    if (inp.dataset.def) { await setDefaultGloss(inp.dataset.def, t); renderText(); toast(t ? 'Default gloss saved' : 'Default gloss removed'); }
    setTimeout(fillGlossBox, 0);
  });
  $('#dictBody').addEventListener('input', ev => { if (ev.target.matches('#glossbox textarea')) autoGrow(ev.target); });
  $('#dictBody').addEventListener('toggle', ev => { if (ev.target.matches?.('details.src')) saveOpenState(); }, true);
  $('#listBody').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-sort]'); if (b) { S.listSort = b.dataset.sort; return renderList(); }
    const r = ev.target.closest('.lrow'); if (!r) return;
    const pos = +r.dataset.pos; S.cur = [pos, pos]; S.curHidden = false; markTarget();
    document.querySelector(`.w[data-i="${pos}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const tk = S.tokens.find(t => t.t === 'w' && t.i === pos);
    S.hist = []; S.view = null; await showWord(tk.s, { lemma: r.dataset.lemma, ti: pos });
  });
  $('#textPane').addEventListener('click', ev => { if (ev.target.id === 'textPane') { S.curHidden = true; markTarget(); } });
  new ResizeObserver(setGlossMax).observe($('#textBody'));
  $('#btnBack').onclick = goBack;
  $('#textTitle').onclick = navDialog;
  $('#btnPrevBook').onclick = () => stepBook(-1);
  $('#btnNextBook').onclick = () => stepBook(1);
  wireMarker();
  wireReading();
  $('#textPane').addEventListener('scroll', () => { clearTimeout(S.posT); S.posT = setTimeout(saveReadPos, 500); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveReadPos(); });
  $('#btnFwd').onclick = goFwd;
  $('#tabEntry').onclick = () => showTab('entry');
  $('#tabList').onclick = () => { showTab('list'); renderList(); };
  $('#search').addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.value.trim()) { showWord(ev.target.value.trim()); ev.target.blur(); } });
  $('#btnGlossToggle').onclick = () => setGlossVisible(document.body.classList.contains('nogloss'), true);
  $('#btnPos').onclick = async () => { S.posOn = !S.posOn; await setting('posOn', S.posOn); applyPosColors(); };

  $('#btnSplit').onclick = cycleSplit;
  matchMedia('(orientation:portrait)').addEventListener('change', splitIcon);

  // three-bar menu for everything that is not part of reading itself
  const menu = $('#menu');
  $('#btnMenu').onclick = ev => { ev.stopPropagation(); menu.hidden = !menu.hidden; };
  document.addEventListener('click', ev => { if (!menu.hidden && !ev.target.closest('.menuwrap')) menu.hidden = true; });
  menu.addEventListener('click', ev => {
    const b = ev.target.closest('[data-m]'); if (!b) return;
    menu.hidden = true;
    ({ settings: settingsDialog, texts: textsDialog, library: libraryDialog, dicts: dictsDialog, pos: posDialog, backup: backupDialog })[b.dataset.m]();
  });
  document.addEventListener('change', async ev => {
    const id = ev.target.dataset?.dictOn; if (!id) return;
    const off = new Set(S.dictPrefs.off); ev.target.checked ? off.delete(id) : off.add(id);
    S.dictPrefs.off = [...off]; if (!S.dictPrefs.order.length) S.dictPrefs.order = S.dicts.map(d => d.id);
    await setting('dictPrefs', S.dictPrefs); await loadDicts(); bucketCache.clear(); if (S.view) renderView();
    if (id === 'morph' || id === 'morphhints') { resetTokens(); renderText(); resolveTokens(); }
  });
  document.addEventListener('change', ev => { const sl = ev.target.closest?.('select[data-langtool]'); if (sl) setLangTool(sl.dataset.langtool, sl.value); });
  document.addEventListener('change', async ev => {      // settings take effect immediately
    const k = ev.target.dataset?.set; if (!k || !ev.target.checked) return;
    if (k === 'theme') setTheme(ev.target.value, true);
    if (k === 'glossMode') { S.glossMode = ev.target.value; await setting('glossMode', S.glossMode); renderText(); }
  });
  document.addEventListener('change', ev => { if (ev.target.id === 'optSrcCol') { S.srcColors = ev.target.checked; setting('srcColors', S.srcColors); document.body.classList.toggle('nosrccol', !S.srcColors); } });
  $('#fileDict').onchange = ev => { const fs = [...ev.target.files]; ev.target.value = ''; if (fs.length) importFiles(fs); };
  $('#fileBackup').onchange = ev => { const f = ev.target.files[0]; ev.target.value = ''; if (f) restoreBackup(f); };
  $('#fileText').onchange = async ev => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
    const raw = await f.text();
    if (f.name.endsWith('.json')) {
      const j = JSON.parse(raw);
      if (j.format === 'greekdict-text-1') return saveText(j.title, j.text, j.choices);
      if (j.format === 'greekdict-backup-1') return restoreBackup(f);
    }
    saveText(f.name.replace(/\.[^.]+$/, ''), raw);
  };
  // selection inside the dictionary -> offer "add as gloss"
  document.addEventListener('pointerdown', e => { S.lastPointer = e.pointerType; }, true);
  wirePencilSelect();
  addEventListener('resize', () => { if (!$('#fabBar').hidden) updateFab(); });
  wireDictDrag();
  document.addEventListener('click', e => { const b = e.target.closest('#dlg [data-get]'); if (b) { if (b.closest('summary')) e.preventDefault(); queueDownload(b.dataset.get); } });
  wireLibrary();
  document.addEventListener('click', ev => { const b = ev.target.closest('#navBody [data-nav]'); if (b) navChoose(b.dataset.nav); });
  document.addEventListener('selectionchange', () => {
    clearTimeout(S.selT);
    S.selT = setTimeout(() => { S.sel = dictSelection(); if (S.sel) S.lastSel = S.sel.text; updateFab(); }, 60);
  });

  for (const id of ['#fabHl', '#fabGloss', '#fabDefault']) $(id).addEventListener('pointerdown', ev => ev.preventDefault());   // keep the selection
  $('#fabHl').onclick = toggleHighlight;
  const fab = asDefault => { const t = S.lastSel; window.getSelection().removeAllRanges(); S.sel = null; $('#fabBar').hidden = true; addGloss(t, asDefault, true); };
  $('#fabGloss').onclick = () => fab(false);
  $('#fabDefault').onclick = () => fab(true);
  // divider drag
  const dv = $('#divider');
  dv.addEventListener('pointerdown', ev => {
    ev.preventDefault();                         // no text selection while dragging
    dv.setPointerCapture(ev.pointerId);
    const portrait = matchMedia('(orientation:portrait)').matches;
    const r = $('#panes').getBoundingClientRect();
    const mv = e => { const x = portrait ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width; setSplit(Math.min(85, Math.max(15, x * 100)).toFixed(1) + '%', false); };
    const up = () => { dv.removeEventListener('pointermove', mv); dv.removeEventListener('pointerup', up); setting('split', getSplit()); };
    dv.addEventListener('pointermove', mv); dv.addEventListener('pointerup', up);
  });
}
function setTheme(t, save) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]').content = t === 'dark' ? '#2a2926' : '#efe9da';
  if (save) setting('theme', t);
}
function setGlossVisible(on, save) {
  document.body.classList.toggle('nogloss', !on);
  $('#btnGlossToggle').classList.toggle('on', on); $('#btnGlossToggle').setAttribute('aria-pressed', on);
  if (save) setting('showGloss', on);
}
function getSplit() { return document.documentElement.style.getPropertyValue('--split').trim() || '50%'; }
function setSplit(v, save = true) { document.documentElement.style.setProperty('--split', v); splitIcon(); if (save) setting('split', v); }
// split button: 1/2 -> 2/3 -> 1/2 -> 1/3 -> 1/2 … (bounces between the three arrangements)
const SPLITS = [100 / 3, 50, 200 / 3];
function cycleSplit() {
  const cur = parseFloat(getSplit());
  let i = SPLITS.reduce((b, x, j) => Math.abs(x - cur) < Math.abs(SPLITS[b] - cur) ? j : b, 1);
  if (i === 2) S.splitDir = -1; else if (i === 0) S.splitDir = 1; else S.splitDir = S.splitDir || 1;
  setSplit(SPLITS[i + S.splitDir].toFixed(3) + '%');
}
function splitIcon() {   // an open book: the fold sits where the split is, the lines on both pages slope down toward it
  const b = $('#btnSplit'); if (!b) return;
  const f = Math.min(0.9, Math.max(0.1, parseFloat(getSplit()) / 100));
  const portrait = matchMedia('(orientation:portrait)').matches;
  const W = 30, H = 20, x0 = 1.5, x1 = W - 1.5, fx = x0 + (x1 - x0) * f, dip = 2;
  const p = [];
  const top = 2.5, bot = 17.5;                                                                   // pitch (bot-top)/5 = 3 exactly
  p.push(`M${x0} ${top} Q${(x0 + fx) / 2} ${top - 1} ${fx} ${top + dip} Q${(fx + x1) / 2} ${top - 1} ${x1} ${top}`);     // top edges
  p.push(`M${x0} ${bot} Q${(x0 + fx) / 2} ${bot - 1} ${fx} ${bot + dip} Q${(fx + x1) / 2} ${bot - 1} ${x1} ${bot}`);     // bottom edges
  p.push(`M${x0} ${top} V${bot} M${x1} ${top} V${bot} M${fx} ${top + dip} V${bot + dip}`);                                // outer edges + fold
  // text lines: the page-edge curve shifted down in equal steps (trimmed a little at both ends)
  const sub = (P0, P1, P2, t0, t1) => {          // part t0..t1 of a quadratic Bézier, again as a quadratic Bézier
    const at = t => [0, 1].map(k => (1 - t) ** 2 * P0[k] + 2 * (1 - t) * t * P1[k] + t * t * P2[k]);
    const dt = t => [0, 1].map(k => 2 * (1 - t) * (P1[k] - P0[k]) + 2 * t * (P2[k] - P1[k]));
    const A = at(t0), B = at(t1), dA = dt(t0), h = (t1 - t0) / 2;
    return [A, [A[0] + dA[0] * h, A[1] + dA[1] * h], B];
  };
  const q = ([A, C, B]) => `M${A[0].toFixed(2)} ${A[1].toFixed(2)} Q${C[0].toFixed(2)} ${C[1].toFixed(2)} ${B[0].toFixed(2)} ${B[1].toFixed(2)}`;
  const n = 4;
  for (let i = 1; i <= n; i++) {
    const dy = (bot - top) * i / (n + 1);
    // a narrow page keeps its lines; they only get shorter, down to dots (round caps)
    p.push(q(sub([x0, top + dy], [(x0 + fx) / 2, top - 1 + dy], [fx, top + dip + dy], 0.12, 0.9)));
    p.push(q(sub([fx, top + dip + dy], [(fx + x1) / 2, top - 1 + dy], [x1, top + dy], 0.1, 0.88)));
  }
  const g = `<path d="${p.join(' ')}" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>`;
  b.innerHTML = portrait
    ? `<svg width="${(H * 0.75).toFixed(1)}" height="${(W * 0.75).toFixed(1)}" viewBox="0 0 ${H} ${W}" aria-hidden="true"><g transform="translate(${H} 0) rotate(90)">${g}</g></svg>`
    : `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${g}</svg>`;
  const pct = Math.round(f * 100);
  b.title = `Text ${pct < 40 ? '1/3' : pct > 60 ? '2/3' : '1/2'} – tap to change the split`;
}

// ---------------------------------------------------------------- library (Perseus, First1KGreek)
// Works are downloaded from the app's website (texts/works/<id>.json.gz) into their own database,
// one record per reading unit ("book"), so that only the open book is loaded.
const LIB_DB = 'greekreader-lib';
let libConn = null;
function libDB() {
  if (libConn) return Promise.resolve(libConn);
  return new Promise((res, rej) => {
    const r = indexedDB.open(LIB_DB, 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('works', { keyPath: 'id' }); d.createObjectStore('books', { keyPath: 'k' }); };
    r.onsuccess = () => res(libConn = r.result); r.onerror = () => rej(r.error);
  });
}
async function libGet(store, k) { const d = await libDB(); return req2p(d.transaction(store).objectStore(store).get(k)); }
async function libWorks() { const d = await libDB(); return req2p(d.transaction('works').objectStore('works').getAll()); }
async function installWork(file, version) {
  const info = {}; const p = await readPackage(file, info);
  if (p.format !== 'greekdict-work-1') throw new Error('not a text package');
  const d = await libDB(); const t = d.transaction(['works', 'books'], 'readwrite'); const bs = t.objectStore('books');
  bs.delete(IDBKeyRange.bound(p.id + '|', p.id + '|￿'));
  p.books.forEach((b, i) => bs.put({ k: p.id + '|' + i, blocks: b.blocks }));
  t.objectStore('works').put({ id: p.id, author: p.author, authorId: p.authorId, title: p.title, greek: p.greekTitle, edition: p.edition,
    source: p.source, license: p.license, books: p.books.map(b => b.label), version, size: info.size, added: Date.now() });
  await done(t);
}
async function deleteWork(id) {   // glosses and markers are kept, so they come back when the work is downloaded again
  const d = await libDB(); const t = d.transaction(['works', 'books'], 'readwrite');
  t.objectStore('books').delete(IDBKeyRange.bound(id + '|', id + '|￿')); t.objectStore('works').delete(id);
  await done(t);
  if (S.text?.work?.id === id) await openText(null);
}
const isBook = id => typeof id === 'string' && id.startsWith('w:');
async function loadBook(id) {      // id = "w:<work id>:<book index>"
  const j = id.lastIndexOf(':'), wid = id.slice(2, j), bi = +id.slice(j + 1);
  const work = await libGet('works', wid); if (!work) return null;
  const b = await libGet('books', wid + '|' + bi); if (!b) return null;
  return { id, work, bi, blocks: b.blocks, title: `${work.title} · ${work.books[bi]}` };
}
async function openWork(id, bi) {
  if (bi == null) bi = (await setting('wk|' + id)) ?? 0;
  return openText(`w:${id}:${bi}`);
}
async function fetchCatalog() {
  if (S.catalog && S.catOnline) return S.catalog;
  try {
    const r = await fetch('texts/catalog.json', { cache: 'no-cache' }); if (!r.ok) throw new Error();
    S.catalog = await r.json(); S.catOnline = true; setting('catalog', S.catalog);
  } catch (_) { S.catalog = S.catalog || (await setting('catalog')) || null; S.catOnline = false; }
  S.catWork = {}; S.catAuthor = {};
  if (S.catalog) for (const a of S.catalog.authors) for (const w of a.works) { S.catWork[w.id] = Object.assign(w, { author: a.name, authorId: a.id }); S.catAuthor[w.id] = a; }
  return S.catalog;
}
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯͅ]/g, '').replace(/ς/g, 'σ').toLowerCase();
const mb = b => b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' kB';
// ---- Library view: filters (highlighted when on) and sorting (arrow shows the direction)
const GENRES = [['epic', 'Epic'], ['lyric', 'Lyric, elegy & epigram'], ['drama', 'Drama'], ['poetry', 'Other poetry'],
  ['history', 'History & biography'], ['philosophy', 'Philosophy'], ['oratory', 'Oratory & rhetoric'], ['letters', 'Letters'],
  ['novel', 'Novel, fable & myth'], ['science', 'Science, medicine & geography'], ['scholarship', 'Scholarship & lexica'], ['religion', 'Christian & Jewish']];
const SORTS = [['author', 'Author', 1], ['title', 'Title', 1], ['date', 'Date', 1], ['recent', 'Recently opened', -1]];
// century slider: from the start of the 8th c. BC to the end of the 15th c. AD (years; 0 = start of the 1st c. AD)
const YMIN = -800, YMAX = 1500;
const ERAS = [['Archaic', -800, -500], ['Classical', -500, -323], ['Hellenistic', -323, -31], ['Imperial', -31, 300], ['Late Antique', 300, 600], ['Byzantine', 600, 1500]];
// favourites: a small flame (outline = not a favourite, filled = favourite)
const FLAME = '<svg class="flame" width="15" height="20" viewBox="6.4 0.8 11.2 15.2" aria-hidden="true"><g transform="translate(12 0) scale(.82 1) translate(-12 0)" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"><path class="fo" vector-effect="non-scaling-stroke" d="M12 15.2c-3.6-.6-5.6-2.6-5.4-5.4.1-1.6.9-2.6 1.6-3.6.1 1.4.6 2.3 1.3 2.7-.4-2.4.2-5 1.5-7.4.4 2.4 1.4 3.6 2.4 4.6.4-1.4 1-2.4 2-3.2-.3 1.8 0 3.2.8 4.4.5-.6.8-1.4.9-2.4 1 1.4 1.4 3 1.2 4.6-.3 3.1-2.4 5.2-6.3 5.7z"/><path class="fi" vector-effect="non-scaling-stroke" d="M12 15c-1.6-.4-2.4-1.4-2.3-2.8 0-.8.4-1.4.8-1.9.1.7.4 1.1.7 1.2-.1-1.2.3-2.4.9-3.4.3 1 .9 1.7 1.4 2.4.6.8.8 1.6.6 2.4-.2 1.1-1 1.8-2.1 2.1z"/></g></svg>';
function libView() {
  S.lib ??= {};
  S.lib = Object.assign({ mine: false, fav: false, langs: [], src: [], form: [], from: YMIN, to: YMAX, undated: true, sort: 'author', dir: 1 }, S.lib);
  return S.lib;
}
const workLang = w => (w.lang === 'lat' || w.lang === 'la') ? 'la' : 'grc';
const filtersOn = v => v.mine || v.fav || v.langs.length || v.src.length || v.form.length || v.from > YMIN || v.to < YMAX || !v.undated;
function centLabel(y, end) {           // year at a century boundary -> "5th c. BC"
  const ord = n => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th');
  const c = end ? (y <= 0 ? -y / 100 + 1 : y / 100) : (y < 0 ? -y / 100 : y / 100 + 1);
  return y < 0 || (end && y === 0) ? `${ord(Math.round(c))} c. BC` : `${ord(Math.round(c))} c. AD`;
}
function saveLibView() { setting('libView', S.lib); }
const authorOf = w => S.catAuthor?.[w.id] || { name: w.author, id: w.authorId, genres: [], period: null, year: null, date: '' };
function workPasses(w, q) {
  const v = libView(), a = authorOf(w);
  if (v.mine && !S.libInst[w.id]) return false;
  if (v.fav && !S.favs?.[w.id]) return false;
  if (v.langs.length && !v.langs.includes(workLang(w))) return false;
  if (v.src.length && !v.src.includes(w.source)) return false;
  if (v.form.length && w.verse != null && !v.form.includes(w.verse ? 'verse' : 'prose')) return false;
  if (a.year == null) { if (!v.undated) return false; }
  else if (a.year < v.from || a.year > v.to) return false;
  if (q && !fold(a.name).includes(q) && !fold(w.title + ' ' + (w.greek || '') + ' ' + w.id).includes(q)) return false;
  return true;
}
function libAuthors() {
  if (S.catalog) return S.catalog.authors;
  const by = {};
  for (const w of Object.values(S.libInst)) (by[w.authorId] ??= { id: w.authorId, name: w.author, works: [], genres: [] }).works.push(w);
  return Object.values(by);
}
function libFilter(a) { const q = fold(S.libQ); return a.works.filter(w => workPasses(w, q)).sort((x, y) => (x.no ?? 0) - (y.no ?? 0) || x.title.localeCompare(y.title)); }
function chip(f, val, label, title = '') {
  const v = libView(), on = f === 'mine' ? v.mine : f === 'fav' ? v.fav : f === 'undated' ? v.undated : v[f].includes(val);
  return `<button type="button" class="chip2${on ? ' on' : ''}" data-f="${f}" data-val="${val}"${title ? ` title="${esc(title)}"` : ''} aria-pressed="${on}">${f === 'fav' ? FLAME : ''}${esc(label)}</button>`;
}
function sortBarHTML() {
  const v = libView();
  const sortBtn = ([id, label]) => `<button type="button" class="chip2${v.sort === id ? ' on' : ''}" data-sort="${id}" title="Sort by ${label.toLowerCase()}" aria-pressed="${v.sort === id}">${label}</button>`;
  const dirBtn = `<button type="button" class="sortb dirb" data-dir="1" title="${v.dir > 0 ? 'Ascending – tap for descending' : 'Descending – tap for ascending'}" aria-label="${v.dir > 0 ? 'Ascending' : 'Descending'}"><span class="arr"><i class="${v.dir > 0 ? 'hi' : ''}">↑</i><i class="${v.dir < 0 ? 'hi' : ''}">↓</i></span></button>`;
  return `<div class="frow"><span class="fl">Sort</span>${SORTS.map(sortBtn).join('')}<span class="fsep"></span>${dirBtn}</div>`;
}
function libSources() {
  const set = new Set(); for (const a of libAuthors()) for (const w of a.works) if (w.source) set.add(w.source);
  return [...set].sort((a, b) => a === 'Perseus' ? -1 : b === 'Perseus' ? 1 : a.localeCompare(b));
}
function libControlsHTML() {
  const v = libView(), pct = y => ((y - YMIN) / (YMAX - YMIN) * 100).toFixed(2);
  return `<div class="frow"><span class="fl">Show</span>${chip('fav', 1, 'Favourites')}${chip('mine', 1, 'On this device')}<span class="fsep"></span>${chip('langs', 'grc', 'Greek')}${chip('langs', 'la', 'Latin')}<span class="fsep"></span>${libSources().map(x => chip('src', x, x)).join('')}<span class="fsep"></span>${chip('form', 'prose', 'Prose')}${chip('form', 'verse', 'Verse')}</div>
    <div class="frow"><span class="fl">Date</span><span class="crange" id="centLabel">${centLabel(v.from)} – ${centLabel(v.to, true)}</span><span class="fsep"></span>${chip('undated', 1, 'Undated works', 'Show or hide works whose date is unknown')}${filtersOn(v) ? '<button type="button" class="chip2 reset" data-freset="1">Reset filters</button>' : ''}</div>
    <div class="cslider" style="--a:${pct(v.from)}%;--b:${pct(v.to)}%">
      <div class="track"><i></i></div><b class="knob ka"></b><b class="knob kb"></b>
      <input type="range" id="centFrom" min="${YMIN}" max="${YMAX}" step="100" value="${v.from}" aria-label="From century">
      <input type="range" id="centTo" min="${YMIN}" max="${YMAX}" step="100" value="${v.to}" aria-label="To century">
      <div class="ticks">${ERAS.slice(1).map(([, a]) => `<i style="left:${pct(a)}%"></i>`).join('')}</div>
      <div class="eras">${ERAS.map(([n, a, b], i) => `<span class="r${i % 2}" style="left:${((+pct(a) + +pct(b)) / 2).toFixed(2)}%" title="${n}">${n}</span>`).join('')}</div>
    </div>`;
}
function workRowHTML(w, flat = false) {
  const i = S.libInst[w.id], key = 'work:' + w.id;
  let btn;
  if (DL.has(key)) btn = dlButtonHTML(key, 'Download');
  else if (!i) btn = S.catalog ? `<button type="button" class="dlbtn" data-get="${key}" title="${mb(w.bytes)}">Download</button>` : '';
  else btn = (w.v && i.version !== w.v ? `<button type="button" class="dlbtn" data-get="${key}" title="A corrected version is available">Update</button>` : '')
    + `<button type="button" data-lopen="${w.id}">Open</button><button type="button" class="danger" data-ldel="${w.id}">Delete</button>`;
  const nb = w.books.length > 1 ? `${w.books.length} parts` : 'one part';
  const ed = w.id.split('.').pop().replace(/^perseus-|^1st1K-/, '');
  const a = authorOf(w), op = S.opened?.[w.id];
  const who = (flat ? `${esc(a.name)}${a.date ? ' · ' + esc(a.date) : ''} · ` : '') + (workLang(w) === 'la' ? 'Latin · ' : '');
  const fav = !!S.favs?.[w.id];
  return `<div class="item" data-w="${w.id}"><button type="button" class="star${fav ? ' on' : ''}" data-star="${w.id}" title="${fav ? 'Remove from favourites' : 'Add to favourites'}" aria-pressed="${fav}">${FLAME}</button><span class="t"><b>${esc(w.title)}</b> <span class="gk">${w.greek && w.greek !== w.title ? esc(w.greek) : ''}</span><br><small>${who}${w.verse ? 'verse' : 'prose'} · ${nb}${w.words ? ' · ' + w.words.toLocaleString('en') + ' words' : ''} · ${esc(w.source || '')} ${esc(ed)}${op ? ' · opened ' + new Date(op).toLocaleDateString('en-GB') : ''}</small></span>${btn}</div>`;
}
function authorHTML(a, ws, open) {
  const inst = a.works.filter(w => S.libInst[w.id]).length;
  const todo = S.catalog ? ws.filter(w => !S.libInst[w.id] && !DL.has('work:' + w.id)) : [];
  const all = todo.length > 1 ? `<button type="button" class="dlbtn" data-all="${a.id}" title="${todo.length} works, ${mb(todo.reduce((x, w) => x + w.bytes, 0))}">Download all</button>` : '';
  const g = (a.genres || []).map(id => GENRES.find(x => x[0] === id)?.[1]).filter(Boolean).join(', ');
  return `<details class="auth" data-a="${a.id}"${open ? ' open' : ''}><summary><span class="t"><b>${esc(a.name)}</b> <small>${a.date ? esc(a.date) + ' · ' : ''}${g ? esc(g) + ' · ' : ''}${ws.length < a.works.length ? `${ws.length} of ` : ''}${a.works.length} work${a.works.length > 1 ? 's' : ''}${inst ? ` · <span class="ok">${inst} on this device</span>` : ''}</small></span>${all}</summary><div class="works">${open ? ws.map(w => workRowHTML(w)).join('') : ''}</div></details>`;
}
function sortedWorks() {        // flat list for the sorts by title, date and recently opened
  const v = libView(), q = fold(S.libQ), d = v.dir;
  const ws = libAuthors().flatMap(a => a.works.filter(w => workPasses(w, q)));
  const byTitle = (x, y) => x.title.localeCompare(y.title);
  const cmp = {
    title: (x, y) => d * byTitle(x, y) || authorOf(x).name.localeCompare(authorOf(y).name),
    date: (x, y) => { const a = authorOf(x).year, b = authorOf(y).year;
      if (a == null || b == null) return (a == null) - (b == null);              // undated works at the end
      return d * (a - b) || authorOf(x).name.localeCompare(authorOf(y).name) || (x.no ?? 0) - (y.no ?? 0); },
    recent: (x, y) => { const a = S.opened?.[x.id], b = S.opened?.[y.id];
      if (!a || !b) return (!a) - (!b) || byTitle(x, y);                          // never opened at the end
      return d * (a - b); },
  }[v.sort];
  return ws.sort(cmp);
}
function renderLibList() {
  const el = $('#libList'); if (!el) return;
  const st = el.scrollTop, q = fold(S.libQ), v = libView();
  S.libLimit ??= 250;
  let html = '', n = 0, nw = 0;
  if (v.sort === 'author') {
    const as = libAuthors().slice().sort((x, y) => v.dir * x.name.localeCompare(y.name));
    const filtering = filtersOn(v) && !v.mine;
    for (const a of as) {
      const ws = libFilter(a); if (!ws.length) continue;
      n++; nw += ws.length;
      html += authorHTML(a, ws, S.libOpen.has(a.id) || v.mine || (q && !fold(a.name).includes(q)) || (filtering && ws.length < 4 && n < 40));
    }
  } else {
    const ws = sortedWorks(); nw = ws.length;
    html = ws.slice(0, S.libLimit).map(w => workRowHTML(w, true)).join('')
      + (ws.length > S.libLimit ? `<div class="row" style="justify-content:center"><button type="button" data-more="1">Show more (${ws.length - S.libLimit} further)</button></div>` : '');
  }
  $('#libCount').textContent = nw ? `${nw.toLocaleString('en')} work${nw === 1 ? '' : 's'}${v.sort === 'author' ? ` by ${n} author${n === 1 ? '' : 's'}` : ''}` : '';
  el.innerHTML = html || `<p class="hint">Nothing found${S.libQ ? ' for “' + esc(S.libQ) + '”' : ''} with these filters.</p>`;
  el.scrollTop = st;
}
function renderLibControls() { const c = $('#libCtl'); if (c) c.innerHTML = libControlsHTML(); const so = $('#libSort'); if (so) so.innerHTML = sortBarHTML(); filterIcon(); }
// the filter icon is highlighted while any filter is on (also when the panel is closed)
function filterIcon() {
  const b = $('#libFilterBtn'); if (!b) return;
  b.classList.toggle('active', !!filtersOn(libView())); b.classList.toggle('open', !$('#libCtl').hidden);
  b.setAttribute('aria-expanded', !$('#libCtl').hidden);
}
async function libraryDialog() {
  S.libOpen ??= new Set(); S.libQ ??= '';
  S.lib = S.lib || (await setting('libView')) || null; libView();
  S.opened = (await setting('opened')) || {};
  S.favs = (await setting('favs')) || {};
  const [cat, inst] = await Promise.all([fetchCatalog(), libWorks()]);
  S.libInst = Object.fromEntries(inst.map(w => [w.id, w]));
  const tot = inst.reduce((a, w) => a + (w.size || 0), 0);
  let pers = '';
  try { pers = (await navigator.storage?.persisted?.()) ? ' Downloads stay on this device until you delete them.' : ' <b>Storage is not yet protected</b> – start the app from its Home Screen icon so that the device does not clear downloads automatically.'; } catch (_) { }
  dialog(`<h3>Library</h3>
    <div class="libtop"><input type="search" id="libSearch" placeholder="Search authors and works (English, Latin or Greek)…" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(S.libQ)}">
      <button type="button" id="libFilterBtn" title="Filters" aria-label="Filters" aria-expanded="false"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5.5h12M6 18.5h12"/><rect x="3" y="4" width="3.2" height="16" rx="1.6"/><rect x="17.8" y="4" width="3.2" height="16" rx="1.6"/><path d="M9 9.2h6M9 12h4.6M9 14.8h3" stroke-width="1.3"/></g></svg></button></div>
    <div id="libCtl" class="libctl" hidden>${libControlsHTML()}</div>
    <div id="libSort" class="libctl">${sortBarHTML()}</div>
    <div class="libcount" id="libCount"></div>
    <div class="list lib" id="libList"></div>
    ${!cat ? '<p class="hint">The catalogue could not be loaded (offline?). Downloaded works are listed below.</p>' : S.catOnline ? '' : '<p class="hint">Offline – showing the last known catalogue; downloads need a connection.</p>'}
    <small>${inst.length} work${inst.length === 1 ? '' : 's'} on this device${tot ? ` (≈ ${mb(tot)})` : ''}${cat ? ` · ${cat.authors.length} authors, ${Object.keys(S.catWork).length.toLocaleString('en')} works available` : ''}.${pers}<br>
    Texts: Perseus Digital Library (canonical-greekLit, canonical-latinLit) and Open Greek and Latin (First1KGreek, csel-dev), licensed CC BY-SA 4.0. Dates follow the TLG canon (author dates by century; a work is dated by its author).</small>`,
    [['cancel', 'Close']]).then(r => { if (r.action === 'cancel') S.libScroll = 0; });
  filterIcon();
  renderLibList();
  if (S.libScroll) $('#libList').scrollTop = S.libScroll;
}
async function downloadWork(key) {
  const id = key.slice(5), w = S.catWork?.[id];
  try {
    if (!w) throw new Error('not in the catalogue');
    DL.set(key, 0); paintDL(key);
    const r = await fetch('texts/works/' + id + '.json.gz', { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const reader = r.body.getReader(); const parts = []; let got = 0;
    for (;;) { const { done: fin, value } = await reader.read(); if (fin) break; parts.push(value); got += value.length; DL.set(key, 0.9 * Math.min(1, got / w.bytes)); paintDL(key); }
    DL.set(key, 0.9); paintDL(key);
    await installWork(new File(parts, id + '.json.gz'), w.v);
    DL.delete(key);
    if (S.libInst) S.libInst[id] = await libGet('works', id);
    if (S.text?.work?.id === id) await openText(S.text.id, false);
  } catch (e) { DL.delete(key); toast(`${w?.title || id}: download failed (${e.message})`, 4000); paintDL(key, 'Failed'); }
  if ($('#libList')) renderLibList();
}
function wireLibrary() {
  document.addEventListener('input', ev => {
    if (ev.target.id !== 'libSearch') return;
    clearTimeout(wireLibrary.t); wireLibrary.t = setTimeout(() => { S.libQ = ev.target.value.trim(); S.libLimit = 250; renderLibList(); }, 150);
  });
  // century slider: the two handles cannot cross; the list follows while dragging
  document.addEventListener('input', ev => {
    if (ev.target.id !== 'centFrom' && ev.target.id !== 'centTo') return;
    const v = libView(), f = $('#centFrom'), t = $('#centTo');
    if (+f.value > +t.value) { if (ev.target === f) f.value = t.value; else t.value = f.value; }
    v.from = +f.value; v.to = +t.value;
    const sl = f.closest('.cslider'), pct = y => ((y - YMIN) / (YMAX - YMIN) * 100).toFixed(2) + '%';
    sl.style.setProperty('--a', pct(v.from)); sl.style.setProperty('--b', pct(v.to));
    $('#centLabel').textContent = `${centLabel(v.from)} – ${centLabel(v.to, true)}`;
    clearTimeout(wireLibrary.ts); wireLibrary.ts = setTimeout(() => { saveLibView(); filterIcon(); S.libLimit = 250; renderLibList(); }, 120);
  });
  document.addEventListener('change', ev => { if (ev.target.id === 'centFrom' || ev.target.id === 'centTo') renderLibControls(); });
  document.addEventListener('toggle', ev => {
    const d = ev.target; if (!d.matches?.('#libList details.auth')) return;
    const id = d.dataset.a;
    if (d.open) { S.libOpen.add(id); const a = libAuthors().find(x => x.id === id); d.querySelector('.works').innerHTML = libFilter(a).map(w => workRowHTML(w)).join(''); }
    else S.libOpen.delete(id);
  }, true);
  document.addEventListener('click', async ev => {
    if (ev.target.closest('#libFilterBtn')) { $('#libCtl').hidden = !$('#libCtl').hidden; filterIcon(); return; }
    const f = ev.target.closest('#libCtl [data-f]'), so = ev.target.closest('#libSort [data-sort]'), rs = ev.target.closest('#libCtl [data-freset]'), dr = ev.target.closest('#libSort [data-dir]');
    if (f || so || rs || dr) {
      const v = libView();
      if (f) {
        if (f.dataset.f === 'mine') v.mine = !v.mine;
        else if (f.dataset.f === 'undated') v.undated = !v.undated;
        else if (f.dataset.f === 'fav') v.fav = !v.fav;
        else { const arr = v[f.dataset.f], x = f.dataset.val, i = arr.indexOf(x); i < 0 ? arr.push(x) : arr.splice(i, 1); }
      }
      if (so && v.sort !== so.dataset.sort) { v.sort = so.dataset.sort; v.dir = SORTS.find(s => s[0] === v.sort)[2]; }
      if (dr) v.dir = -v.dir;
      if (rs) Object.assign(v, { mine: false, fav: false, langs: [], src: [], form: [], from: YMIN, to: YMAX, undated: true });
      S.libLimit = 250; saveLibView(); renderLibControls(); $('#libList').scrollTop = 0; renderLibList(); return;
    }
    if (ev.target.closest('#libList [data-more]')) { S.libLimit += 500; renderLibList(); return; }
    const star = ev.target.closest('#libList [data-star]');
    if (star) {                                   // favourite on/off (kept in the backup)
      const id = star.dataset.star; S.favs ??= {};
      if (S.favs[id]) delete S.favs[id]; else S.favs[id] = Date.now();
      await setting('favs', S.favs);
      const on = !!S.favs[id]; star.classList.toggle('on', on); star.setAttribute('aria-pressed', on); star.title = on ? 'Remove from favourites' : 'Add to favourites';
      if (libView().fav && !on) renderLibList();
      return;
    }
    const all = ev.target.closest('#libList [data-all]');
    if (all) {
      ev.preventDefault();
      const a = libAuthors().find(x => x.id === all.dataset.all);
      navigator.storage?.persist?.().catch(() => { });
      for (const w of libFilter(a)) if (!S.libInst[w.id]) { DL.set('work:' + w.id, -1); }
      S.libOpen.add(a.id); renderLibList(); runDownloads(); return;
    }
    const op = ev.target.closest('#libList [data-lopen]');
    if (op) { S.libScroll = $('#libList').scrollTop; $('#dlg').close(); return openWork(op.dataset.lopen); }
    const dl = ev.target.closest('#libList [data-ldel]');
    if (dl) {
      const w = S.libInst[dl.dataset.ldel]; S.libScroll = $('#libList').scrollTop;
      const c = await dialog(`<h3>Delete ${esc(w.title)}?</h3><p>The text is removed from this device. Your glosses and markers in it are kept and reappear if you download it again.</p>`, [['cancel', 'Cancel'], ['ok', 'Delete']]);
      if (c.action === 'ok') await deleteWork(w.id);
      return libraryDialog();
    }
  });
}

// ---------------------------------------------------------------- navigation between texts and books
function titleBar() {
  const t = S.text, w = t?.work, tt = $('#textTitle');
  tt.innerHTML = !t ? '<span class="tw">no text</span>' : w
    ? `<span class="tw"><span class="ta">${esc(w.author)} › </span>${esc(w.title)}</span><span class="tb"><span class="sep">› </span>${esc(w.books[t.bi])}</span>`
    : `<span class="tw">${esc(t.title)}</span>`;
  tt.title = t ? (w ? `${w.author} › ${w.title} › ${w.books[t.bi]}` : t.title) + ' – tap to choose another text or book' : 'Choose a text';
  const multi = !!w && w.books.length > 1;
  $('#btnPrevBook').hidden = $('#btnNextBook').hidden = !multi;
  if (multi) {
    $('#btnPrevBook').disabled = t.bi === 0; $('#btnNextBook').disabled = t.bi >= w.books.length - 1;
    $('#btnPrevBook').title = t.bi > 0 ? 'Previous: ' + w.books[t.bi - 1] : ''; $('#btnNextBook').title = t.bi < w.books.length - 1 ? 'Next: ' + w.books[t.bi + 1] : '';
  }
  markIcon();
}
function stripCommon(labels) {     // "Book 1", "Book 2" … -> "1", "2" …
  if (labels.length < 2) return labels;
  let p = labels[0];
  for (const l of labels) while (p && !l.startsWith(p)) p = p.slice(0, -1);
  p = p.slice(0, p.lastIndexOf(' ') + 1);
  return labels.map(l => l.slice(p.length) || l);
}
async function navHTML(keepOpen = null) {
  const t = S.text, w = t?.work;
  const [works, texts] = await Promise.all([libWorks(), getAll('texts')]);
  const isOpen = (id, dflt) => keepOpen ? keepOpen.has(id) || (dflt && !keepOpen.size) : dflt;
  let html = '';
  if (w) {
    const marks = new Set((await getAll('settings', IDBKeyRange.bound(`mk|w:${w.id}:`, `mk|w:${w.id}:\uffff`))).map(r => +r.k.split(':').pop()));
    const short = stripCommon(w.books);
    html += `<h3>${esc(w.author)} · ${esc(w.title)} <span class="gk">${esc(w.greek || '')}</span></h3>
      ${w.books.length > 1 ? `<div class="bookgrid">${short.map((l, i) => `<button type="button" data-nav="book:${i}" title="${esc(w.books[i])}${marks.has(i) ? ' – has a marker' : ''}" class="${i === t.bi ? 'on' : ''}${marks.has(i) ? ' mk' : ''}">${esc(l)}${marks.has(i) ? '<svg class="bm" width="8" height="11" viewBox="0 0 8 11" aria-hidden="true"><path d="M0 0h8v11L4 8 0 11z"/></svg>' : ''}</button>`).join('')}</div>` : ''}
      <p class="hint" style="font-size:13px">${esc(w.edition || '')}</p>`;
  } else html += `<h3>${t ? esc(t.title) : 'Texts'}</h3>`;
  const by = {};
  for (const x of works) (by[x.authorId] ??= { id: x.authorId, name: x.author, works: [] }).works.push(x);
  const authors = Object.values(by).sort((a, b) => a.name.localeCompare(b.name));
  html += '<div class="list nav">' + authors.map(a => `<details data-k="${a.id}"${isOpen(a.id, a.id === w?.authorId) ? ' open' : ''}><summary><b>${esc(a.name)}</b> <small>${a.works.length}</small></summary>${a.works.sort((x, y) => x.title.localeCompare(y.title)).map(x => `<div class="item"><span class="t">${esc(x.title)} <span class="gk">${esc(x.greek || '')}</span> <small>${x.books.length > 1 ? x.books.length + ' parts' : ''}</small></span><button type="button" data-nav="work:${x.id}"${x.id === w?.id ? ' class="on"' : ''}>Open</button></div>`).join('')}</details>`).join('')
    + (texts.length ? `<details data-k="mytexts"${isOpen('mytexts', !w) ? ' open' : ''}><summary><b>My texts</b> <small>${texts.length}</small></summary>${texts.map(x => `<div class="item"><span class="t">${esc(x.title)}</span><button type="button" data-nav="text:${x.id}"${x.id === t?.id ? ' class="on"' : ''}>Open</button></div>`).join('')}</details>` : '')
    + (!authors.length && !texts.length ? '<p class="hint">Nothing here yet – get texts from the Library, or paste your own under My texts.</p>' : '') + '</div>';
  return html;
}
// text navigation: choosing a book, work or text opens it behind the menu; the menu stays open
async function navDialog() {
  const r = await dialog(`<div id="navBody">${await navHTML()}</div>`, [['library', 'Library'], ['texts', 'My texts'], ['cancel', 'Close']]);
  if (r.action === 'library') return libraryDialog();
  if (r.action === 'texts') return textsDialog();
}
async function navChoose(v) {
  const t = S.text;
  if (v.startsWith('book:')) await openText(`w:${t.work.id}:${+v.slice(5)}`);
  else if (v.startsWith('work:')) await openWork(v.slice(5));
  else if (v.startsWith('text:')) await openText(+v.slice(5));
  const body = $('#navBody'); if (!body) return;
  const open = new Set([...body.querySelectorAll('details[open]')].map(d => d.dataset.k));
  const list = body.querySelector('.list.nav'), st = list?.scrollTop || 0;
  body.innerHTML = await navHTML(open);
  const l2 = body.querySelector('.list.nav'); if (l2) l2.scrollTop = st;
}
function stepBook(d) {
  const t = S.text, w = t?.work; if (!w) return;
  const bi = t.bi + d; if (bi < 0 || bi >= w.books.length) return;
  openText(`w:${w.id}:${bi}`);
}
// ---- reading mode: only the text, full screen; leave with Esc or by swiping in from the middle of the right edge
function setReading(on) {
  document.body.classList.toggle('reading', on);
  if (on) {
    document.documentElement.requestFullscreen?.().catch(() => { });
    toast('Reading mode – swipe in from the middle of the right edge, or press Esc, to leave.', 3500);
  } else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => { });
  setGlossMax();
}
function wireReading() {
  $('#btnRead').onclick = () => setReading(true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('reading') && !$('#dlg').open) setReading(false); });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('reading')) setReading(false); });
  let sw = null;
  document.addEventListener('pointerdown', e => {
    if (!document.body.classList.contains('reading')) return;
    const h = innerHeight;
    if (e.clientX > innerWidth - 40 && e.clientY > h / 3 && e.clientY < 2 * h / 3) { sw = { x: e.clientX, id: e.pointerId }; $('#readEdge').classList.add('pull'); }
  }, true);
  document.addEventListener('pointermove', e => {
    if (!sw || e.pointerId !== sw.id) return;
    $('#readEdge').style.setProperty('--pull', Math.max(0, sw.x - e.clientX) + 'px');
  }, true);
  const end = e => {
    if (!sw || e.pointerId !== sw.id) return;
    const done = e.clientX <= innerWidth / 2; sw = null;
    $('#readEdge').classList.remove('pull'); $('#readEdge').style.removeProperty('--pull');
    if (done) setReading(false);
  };
  document.addEventListener('pointerup', end, true);
  document.addEventListener('pointercancel', end, true);
  // keep the browser from scrolling or going back while pulling from the edge
  document.addEventListener('touchmove', e => { if (sw) e.preventDefault(); }, { passive: false });
}
// reading position per text/book (restored when it is opened again)
function saveReadPos() { if (S.text) setting('pos|' + S.text.id, Math.round($('#textPane').scrollTop)); }

// ---------------------------------------------------------------- marker (one per book / text)
function markIcon() {
  const b = $('#btnMark'), has = S.marker != null;
  b.disabled = !S.text; b.classList.toggle('set', has);
  b.title = has ? 'Go to the marker · hold to move it here (hold again at the same place to remove it)' : 'Set a marker here (at the selected word, or the first line on screen)';
}
function anchorWord() {             // selected word if it is on screen, otherwise the first word at the top of the pane
  const pane = $('#textPane').getBoundingClientRect();
  const vis = e => { const r = e?.getBoundingClientRect(); return r && r.bottom > pane.top && r.top < pane.bottom; };
  if (S.cur && !S.curHidden) { const e = document.querySelector(`#textBody .w[data-i="${S.cur[0]}"]`); if (vis(e)) return S.cur[0]; }
  const ws = document.querySelectorAll('#textBody .w'); if (!ws.length) return null;
  let lo = 0, hi = ws.length - 1;                 // words are in reading order: binary search for the first visible one
  while (lo < hi) { const m = (lo + hi) >> 1; if (ws[m].getBoundingClientRect().bottom <= pane.top + 4) lo = m + 1; else hi = m; }
  return +ws[lo].dataset.i;
}
function renderMarker() {
  document.querySelectorAll('#textBody .mkr').forEach(e => e.remove());
  if (S.marker != null) document.querySelector(`#textBody .w[data-i="${S.marker}"]`)?.insertAdjacentHTML('beforebegin', '<span class="mkr" title="Marker"></span>');
}
async function setMarker(i) {
  if (!S.text) return;
  S.marker = i;
  if (i == null) await del('settings', 'mk|' + S.text.id); else await setting('mk|' + S.text.id, i);
  renderMarker(); markIcon();
}
function goMarker() {
  const e = document.querySelector(`#textBody .w[data-i="${S.marker}"]`); if (!e) return;
  const pane = $('#textPane');
  pane.scrollTop += e.getBoundingClientRect().top - pane.getBoundingClientRect().top - 56;
  e.classList.add('flash'); setTimeout(() => e.classList.remove('flash'), 1200);
}
function wireMarker() {
  const b = $('#btnMark'); let timer = null, long = false;
  b.addEventListener('pointerdown', () => {
    long = false; clearTimeout(timer);
    timer = setTimeout(async () => {
      long = true; const i = anchorWord(); if (i == null) return;
      if (i === S.marker) { await setMarker(null); toast('Marker removed'); } else { await setMarker(i); toast('Marker moved here'); }
    }, 550);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => clearTimeout(timer));
  b.addEventListener('contextmenu', e => e.preventDefault());
  b.addEventListener('click', async () => {
    if (long) { long = false; return; }
    if (S.marker == null) { const i = anchorWord(); if (i == null) return; await setMarker(i); toast('Marker set – tap the ribbon to come back here; hold it to move the marker.', 3500); }
    else goMarker();
  });
}

// ---------------------------------------------------------------- start
(async function main() {
  db = await openDB();
  await migrateOld();
  wire();
  setTheme((await setting('theme')) || 'dark');
  S.glossMode = (await setting('glossMode')) || 'replace';
  for (const r of await getAll('settings', IDBKeyRange.bound('lg|', 'lg|\uffff'))) S.lemmaGloss[r.k.slice(3)] = r.v;
  await loadDicts();
  setGlossVisible((await setting('showGloss')) !== false);
  const sp = await setting('split'); setSplit(sp || '50%', false);
  S.srcColors = (await setting('srcColors')) !== false; document.body.classList.toggle('nosrccol', !S.srcColors);
  S.posCfg = Object.assign(defaultPosCfg(), (await setting('posCfg')) || {});
  S.posOn = !!(await setting('posOn')); applyPosColors();
  const cur = await setting('currentText');
  if (cur != null) await openText(cur);
  if (!S.dicts.length) $('#dictBody').innerHTML = '<p class="hint">Welcome! <button id="btnFirstSync">Download the free dictionaries</button> (Greek: Pape, LSJ and morphology; Latin: Lewis &amp; Short, Georges and Collatinus – about 60 MB). More dictionaries: ☰ → Dictionaries. Then get a text via ☰ → Library, or paste your own via ☰ → My texts.</p>';
  $('#btnFirstSync')?.addEventListener('click', () => syncPackages());
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
  navigator.storage?.persist?.().catch(() => { });
})();
