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
    const R = pickReading(tk, A), l = R.l, x = R.x;
    tk.lemma = l || null; tk.ana = R.a; tk.anaSet = R.set; tk.amb = R.amb;
    const D = S.tokCh?.has(tk.i) ? pickReading(tk, A, false) : R; tk.defL = D.l; tk.defA = D.a;   // the pre-chosen reading stays marked
    tk.pos = posOf(l, R.a ? [R.a] : x?.ana);          // word class of the chosen reading
    tk.q = x?.q ? (x.q[R.ai] || qCommon(x.q)) : null; // Latin: the vowel quantities of the chosen reading
    tk.gram = gramText(R.a ? [R.a] : x?.ana);          // grammatical information beneath the word: only the chosen reading
    const el = S.wordEls?.[tk.i];          // words are numbered in document order (a selector per word is slow in long books)
    if (el) { el.className = el.className.replace(/\s*\bp-\S+/g, ''); el.classList.add('p-' + tk.pos); }
    if (el) { const gm = el.querySelector('.gm'); if (gm) { gm.textContent = tk.gram || ''; gm.classList.toggle('amb', !!tk.amb && !tk.anaSet); } }
    if (el && tk.q && S.latQuant) { const t = el.querySelector('.g').firstChild; if (t?.nodeType === 3) t.nodeValue = tk.q; }
    if (el && l && S.lemmaGloss[gkey(l)]) {
      if (!S.covered?.has(tk.i)) { const g = el.querySelector('.gl'), h = dgHTML(tk); g.innerHTML = h; const m = glW(h).match(/--gw:(\d+em)/); if (m) g.style.setProperty('--gw', m[1]); }
      else if (S.glossMode === 'both') S.dgPending = true;          // words with their own gloss: redraw at the end
    }
  }
}
function resetTokens(pred = () => true) { for (const tk of S.tokens) if (pred(tk)) { delete tk.lemma; delete tk.pos; delete tk.q; delete tk.gram; delete tk.ana; delete tk.anaSet; delete tk.amb; delete tk.defL; delete tk.defA; } }
// library texts with an annotation (GLAUx for Greek): the reading the context suggests for each word
function applyAnnotation(t) {
  const ws = S.tokens.filter(tk => tk.t === 'w'), a = t.ann.a.split(' ');
  if (a.length !== ws.length || t.ann.n !== ws.length) return;            // another tokenisation: better nothing than wrong readings
  ws.forEach((tk, n) => { const e = a[n]; if (e === '-') return; const d = e.indexOf('.'); tk.ctx = { l: t.work.annL[+e.slice(0, d)], t: e.slice(d + 1) }; });
}
// how well an analysis ("pres ind act 3rd sg", "masc/neut gen sg" …) fits a 9-position tag (AGDT: pos, person, number,
// tense, mood, voice, gender, case, degree)
const TAGF = [null, { 1: '1st', 2: '2nd', 3: '3rd' }, { s: 'sg', p: 'pl', d: 'dual' },
  { p: 'pres', i: 'imperf', r: 'perf', l: 'plup', t: 'futperf', f: 'fut', a: 'aor' }, { i: 'ind', s: 'subj', o: 'opt', n: 'inf', m: 'imperat', p: 'part', d: 'gerund', g: 'gerundive', u: 'supine' },
  { a: 'act', p: 'pass', m: 'mid', e: 'mp' }, { m: 'masc', f: 'fem', n: 'neut' }, { n: 'nom', g: 'gen', d: 'dat', a: 'acc', v: 'voc', b: 'abl', l: 'loc' }, { c: 'comp', s: 'superl' }];
const TAGCAT = TAGF.map(f => f && new Set(Object.values(f)));
function tagScore(ana, tag) {
  const alts = ana.split(/\s+/).map(w => w.split('/'));
  let sc = 0;
  for (let p = 1; p < 9; p++) {
    const want = TAGF[p][tag[p]];
    const have = alts.find(al => al.some(x => TAGCAT[p].has(x)));
    if (!want) { if (have && p !== 8) sc -= 0.5; continue; }
    if (!have) { sc -= 0.5; continue; }
    if (have.includes(want) || (p === 5 && (have.includes('mp') || (want === 'mp' && (have.includes('mid') || have.includes('pass')))))) sc += 1; else sc -= 2;
  }
  return sc;
}
const lemKey = l => gkey(String(l || '').replace(/\d+$/, ''));
// the analysis the context suggests: the lemma of the annotation (if the morphology knows it), its best-fitting analysis
function ctxReading(A, ctx) {
  const k = lemKey(ctx.l), same = A.lemmas.filter(x => lemKey(x.lemma) === k), cand = same.length ? same : A.lemmas;
  let best = null;
  for (const x of cand) x.ana.forEach((a, ai) => { const sc = tagScore(a, ctx.t); if (!best || sc > best.sc) best = { l: x.lemma, a, sc }; });
  return best && (same.length || best.sc >= 2) ? best : null;
}
// the reading (lemma + one grammatical analysis) of a word: the user's choice for this word > the choice for the form (★)
// > the reading given by the text's own annotation (tk.ctx, where a text has one) > the most likely lemma, its first analysis
function pickReading(tk, A, own = true) {         // own = false: the pre-chosen reading, without the reader's choice
  const tc = own ? S.tokCh?.get(tk.i) : null, ctx = tk.ctx && A.lemmas.length ? ctxReading(A, tk.ctx) : null, has = l => l && A.lemmas.some(x => x.lemma === l);
  const l = (has(tc?.l) && tc.l) || (A.chosen && A.pick) || (has(ctx?.l) && ctx.l) || A.pick;
  const x = A.lemmas.find(z => z.lemma === l);
  const want = tc?.l === l ? tc.a : A.chosen && A.pick === l && A.ana ? A.ana : ctx?.l === l ? ctx.a : null;
  let ai = x && want ? x.ana.indexOf(want) : -1;
  if (ai < 0 && x?.ana.length) ai = 0;
  const amb = new Set(A.lemmas.flatMap(z => z.ana.map(a => gramText([a])))).size > 1;
  const set = !!((tc && has(tc.l) && (!tc.a || x?.ana[ai] === tc.a)) || (A.chosen && A.ana && x?.ana[ai] === A.ana));
  return { l, x, ai, a: x?.ana[ai] ?? null, amb, set };
}
// the user's reading for one word of the text (lemma + analysis); null = back to the default
async function setTokChoice(i, l, a = null) {
  if (!S.text) return;
  const k = `an|${S.text.id}|${i}`;
  if (l == null) { S.tokCh.delete(i); await del('settings', k); }
  else { S.tokCh.set(i, { l, a }); await setting(k, { l, a }); }
  resetTokens(tk => tk.t === 'w' && tk.i === i);
  await resolveTokens(); renderText();
  if (S.view?.ti === i) { S.view.lemma = null; renderView(); }
}
async function loadTokCh(t) {
  if (!t) return new Map();
  const rs = await getAll('settings', IDBKeyRange.bound(`an|${t.id}|`, `an|${t.id}|\uffff`));
  return new Map(rs.map(r => [+r.k.slice(r.k.lastIndexOf('|') + 1), r.v]));
}
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
    S.latEngine = null; S.colEngine = undefined; progress(1);
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
  for (const d of all) { d.splitSet = new Set(d.split || []); d.src ||= ['ls', 'georges', 'collatinus', 'morph-la', 'whitaker', 'morph-la-ww'].includes(d.id) ? 'la' : 'grc'; }
  S.dicts = all.filter(d => d.kind === 'dictionary').sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));
  // user's order and on/off choice (menu ☰ → Dictionaries); new dictionaries go to the end, switched on
  S.dictPrefs = Object.assign({ order: [], off: [], locked: [], open: [] }, (await setting('dictPrefs')) || {});
  const pos = id => { const i = S.dictPrefs.order.indexOf(id); return i < 0 ? 1e6 : i; };
  S.dicts.sort((a, b) => pos(a.id) - pos(b.id));
  S.shown = S.dicts.filter(d => !S.dictPrefs.off.includes(d.id));
  // analysis tools: installed (…Inst) and in use (switched on)
  const on = d => d && !S.dictPrefs.off.includes(d.id) ? d : null;
  S.morphInst = all.find(d => d.kind === 'morph') || null; S.morph = on(S.morphInst);
  S.hintsInst = all.find(d => d.kind === 'morphhints') || null; S.hints = on(S.hintsInst);
  S.latMorphs = all.filter(d => d.kind === 'latmorph').sort((a, b) => a.id.localeCompare(b.id));
  S.latMorphInst = S.latMorphs[0] || null; S.latMorph = S.latMorphs.find(d => on(d)) || null;     // the one chosen in ☰ → Dictionaries
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
  return { f, lemmas, pick, chosen: !!choice, ana: choice?.ana || null };
}
// ---- Latin: analysis as in Collatinus – a form is a radical of a lemma + an ending of the lemma's inflection model
function latAnalyzeKeyC(E, k) {         // Collatinus
  const out = [], X = E.X;
  for (let i = 0; i <= k.length; i++) {
    const ds = E.D[k.slice(i)]; if (!ds) continue;
    const rs = E.R[k.slice(0, i)]; if (!rs) continue;
    for (const [li, nr, rq] of rs) {
      const m = E.L[li][1];
      for (const [mi, mo, dnr, dq] of ds) if (mi === m && dnr === nr && !(X[li] && X[li].includes(mo))) out.push([li, mo, rq != null && dq != null ? rq + dq : null]);
    }
  }
  for (const v of E.I[k] || []) out.push(v);
  return out;
}
// Whitaker's Words: a form is a stem (1–4) of a dictionary entry + an ending that fits the entry's
// part of speech, declension/conjugation (and variant), gender, comparison or deponent kind
function wwFits(lem, inf) {
  const [, p, which, vr, x] = lem, [pos, iw, iv, , , ex] = inf;
  if (!(pos === p || (p === 'V' && (pos === 'VPAR' || pos === 'SUPINE')) || (p === 'PACK' && pos === 'PRON'))) return false;
  if (!['ADV', 'PREP', 'CONJ', 'INTERJ', 'SUPINE'].includes(pos)) { if (iw && iw !== which) return false; if (iv && iv !== vr) return false; }
  if (pos === 'N' && !(ex === 'X' || x === 'X' || ex === x || (ex === 'C' && (x === 'M' || x === 'F')) || (x === 'C' && (ex === 'M' || ex === 'F')))) return false;
  if ((pos === 'ADJ' || pos === 'ADV' || pos === 'NUM') && x && x !== 'X' && ex && ex !== 'X' && ex !== x) return false;
  if (pos === 'V' && x === 'DEP' && ex === 'A') return false;
  return true;
}
function wwAnalyzeKey(E, k) {
  const out = [];
  for (let i = 0; i <= k.length; i++) {
    const ds = E.D[k.slice(i)]; if (!ds) continue;
    const rs = E.R[k.slice(0, i)]; if (!rs) continue;
    for (const [li, n] of rs) for (const inf of ds) if (inf[3] === n && wwFits(E.L[li], inf)) out.push([li, inf[4]]);
  }
  for (const [form, mo] of E.I[k] || []) out.push([form, mo]);         // unique forms: [lemma text, morpho]
  return out;
}
const latFreq = (E, li) => typeof li !== 'number' ? 9 : E.type === 'whitaker' ? E.L[li][5] : E.L[li][3];
// vowel quantities (graphy of radical + ending, e.g. rŏsā) put onto the form as it stands in the text:
// its case, its i/j and u/v are kept; only macron and breve are taken over; an enclitic stays unmarked; null if the two do not match letter by letter
const CONS = /^[bcdfghklmnpqrstvxzj]$/;
function quantify(form, q) {
  if (!q) return null;
  const us = []; for (const ch of q.normalize('NFD')) { if (/\p{M}/u.test(ch)) { if (us.length && (ch === '\u0304' || ch === '\u0306')) us[us.length - 1].m += ch; } else us.push({ b: latkey(ch), m: '' }); }
  let j = 0, out = '';
  for (const c of form.normalize('NFC')) {
    const kc = latkey(c), base = c.normalize('NFD')[0];
    if (j >= us.length) { out += c; continue; }                                  // -que, -ne, -ve
    if (kc.length !== 1) { if (us.slice(j, j + kc.length).map(u => u.b).join('') !== kc) return null; j += kc.length; out += c; continue; }   // æ, œ
    const u = us[j++];
    if (u.b !== kc && !(CONS.test(u.b) && CONS.test(kc))) return null;         // assimilated prefix: adc- / acc-
    out += base + (u.b === kc ? u.m : '');
  }
  return j < us.length ? null : out.normalize('NFC');
}
// the marks all variants agree on (rŏsă / rŏsā -> rŏsa)
function qCommon(qs) {
  qs = [...new Set(qs.filter(Boolean))]; if (qs.length < 2) return qs[0] || null;
  const sp = q => { const a = []; for (const ch of q.normalize('NFD')) /\p{M}/u.test(ch) && a.length ? a[a.length - 1] += ch : a.push(ch); return a; };
  const A = qs.map(sp); if (A.some(a => a.length !== A[0].length)) return null;
  return A[0].map((u, i) => A.every(a => a[i] === u) ? u : u[0]).join('').normalize('NFC');
}
function latAnalyze(E, form) {
  const k = latkey(form);
  const latAnalyzeKey = E.type === 'whitaker' ? wwAnalyzeKey : latAnalyzeKeyC;
  let r = latAnalyzeKey(E, k);
  for (const [sh, lo] of E.C) if (k.endsWith(sh)) r = r.concat(latAnalyzeKey(E, k.slice(0, k.length - sh.length) + lo).map(([li, mo]) => [li, mo, null]));   // amarunt = amaverunt
  for (const [a, b] of E.A) {                                                                                          // adc- / acc-
    if (k.startsWith(a)) r = r.concat(latAnalyzeKey(E, b + k.slice(a.length)));
    else if (k.startsWith(b)) r = r.concat(latAnalyzeKey(E, a + k.slice(b.length)));
  }
  let enc = '';
  if (!r.length) for (const e of ['que', 'ne', 've']) if (k.length > e.length + 1 && k.endsWith(e)) { r = latAnalyzeKey(E, k.slice(0, -e.length)); if (r.length) { enc = e; break; } }
  const seen = new Set(), res = [];
  for (const [li, mo, q] of r) { const id = li + ':' + mo; if (!seen.has(id)) { seen.add(id); res.push([typeof li === 'number' ? E.L[li][0] : li, E.M[mo] + (enc ? ' + -' + enc : ''), li, quantify(form, q)]); } }
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
    const E = S.latEngine;                                                                          // word classes for the colours
    if (E) for (const l of E.L) { const pos = E.type === 'whitaker' ? E.P[l[1]] : l[2]; if (pos) S.latPos[latkey(l[0])] ??= pos; }
    S.latEngineP = null;
    return S.latEngine;
  })();
  return S.latEngineP;
}
// Whitaker's Words has no vowel quantities: they come from Collatinus (when installed), same lemma and the closest analysis
async function colEngine() {
  const d = S.latMorphs.find(x => x.id === 'morph-la'); if (!d) return null;
  if (S.colEngine !== undefined && S.colEngineId === d.id) return S.colEngine;
  const r = await req2p((await dictDB(d.id)).transaction('b').objectStore('b').get('engine'));
  S.colEngineId = d.id; return (S.colEngine = r?.e?.type ? null : (r?.e || null));
}
const QTOK = new Set('nom voc acc gen dat abl loc sg pl masc fem neut 1st 2nd 3rd pres impf fut perf plup futperf ind subj imperat inf part act pass comp superl gerundive supine'.split(' '));
function qFromCol(cres, lemma, label) {
  const lk = latkey(lemma).replace(/\d+$/, ''), toks = new Set(label.split(/[\s,]+/).filter(t => QTOK.has(t)));
  const cands = cres.filter(c => c[3] && latkey(c[0]).replace(/\d+$/, '') === lk);
  if (!cands.length) return null;
  const score = c => c[1].split(/[\s,]+/).filter(t => toks.has(t)).length;
  const top = Math.max(...cands.map(score)), best = cands.filter(c => score(c) === top);
  return qCommon(best.map(c => c[3]));
}
async function latAnalyses(form, choices) {
  const f = latkey(form), E = await latEngine();
  let res = E ? latAnalyze(E, form) : [];
  if (E?.type === 'whitaker' && res.length) { const C = await colEngine(); if (C) { const cres = latAnalyze(C, form); res = res.map(([l, a, li]) => [l, a, li, qFromCol(cres, l, a)]); } }
  const choice = choices ? choices.get(f) : await get('choices', f);
  const lemmas = []; let best = null, bestN = -1;
  for (const [l, a, li, q] of res) {
    let x = lemmas.find(z => z.lemma === l); if (!x) lemmas.push(x = { lemma: l, ana: [], q: [] });
    if (!x.ana.includes(a)) { x.ana.push(a); x.q.push(q || null); }
    const fq = latFreq(E, li); if (fq > bestN) { bestN = fq; best = l; }    // the more frequent lemma first
  }
  lemmas.sort((a, b) => (a.lemma === best ? -1 : b.lemma === best ? 1 : 0));
  return { f, lemmas, pick: choice?.lemma || best || null, chosen: !!choice, ana: choice?.ana || null };
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
// iOS throws the text pane back to the top when the text is redrawn (after saving a gloss, choosing a lemma …)
// or when the keyboard of a gloss field opens/closes. Keep the reading position: remember which word is at the
// top of the pane (or the selected word) and its distance from the top, and put it back after the redraw.
function textAnchor() {
  const pane = $('#textPane'), top = pane.getBoundingClientRect().top, h = pane.clientHeight;
  let el = S.cur ? document.querySelector(`#textBody .w[data-i="${S.cur[0]}"]`) : null;
  if (el) { const r = el.getBoundingClientRect(); if (r.bottom < top || r.top > top + h) el = null; }
  if (!el) for (const w of S.wordEls || []) { if (w.getBoundingClientRect().bottom > top) { el = w; break; } }
  return { i: el?.dataset.i, off: el ? el.getBoundingClientRect().top - top : 0, y: pane.scrollTop };
}
function applyTextAnchor(a) {
  const pane = $('#textPane'), el = a.i != null ? document.querySelector(`#textBody .w[data-i="${a.i}"]`) : null;
  const want = el ? pane.scrollTop + el.getBoundingClientRect().top - pane.getBoundingClientRect().top - a.off : a.y;
  if (Math.abs(pane.scrollTop - want) > 2) pane.scrollTop = want;
}
function guardText(ms = 1000) {      // keep the position for a moment, unless the user scrolls the text themselves
  if (!S.text || !S.wordEls?.length) return;
  const g = S.tGuard = { a: textAnchor(), until: Date.now() + ms };
  const fix = () => { if (S.tGuard === g && Date.now() <= g.until && !S.tTouch) applyTextAnchor(g.a); };
  requestAnimationFrame(fix); setTimeout(fix, 120); setTimeout(fix, 400); setTimeout(fix, ms - 50);
  return g;
}
function renderText() {
  const body = $('#textBody');
  const same = S.text && S.renderedText === S.text.id && S.wordEls?.length;   // the same text drawn again: keep the position
  const anchor = same ? textAnchor() : null;
  if (!S.text) { body.innerHTML = '<p class="hint">No text yet. Open the menu ☰ (top left) → Library to download Greek texts, or → Import text to paste or load your own.</p>'; return; }
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
    html += `<span class="w${covered.has(tk.i) ? ' glossed' : ''}${tk.pos ? ' p-' + tk.pos : ''}" data-i="${tk.i}"><span class="g">${esc(S.latQuant && tk.q ? tk.q : tk.s)}${pu ? `<span class="pu">${esc(pu)}</span>` : ''}</span><span class="gm${tk.amb && !tk.anaSet ? ' amb' : ''}">${esc(tk.gram || '')}</span><span class="gl"${glW(gs)}>${gs}</span></span>`;
  }
  const w = S.text.work, bi = S.text.bi;
  const bn = w && w.books.length > 1 ? `<div class="booknav">${bi > 0 ? `<button type="button" data-step="-1">◂ ${esc(w.books[bi - 1])}</button>` : '<span></span>'}${bi < w.books.length - 1 ? `<button type="button" data-step="1">${esc(w.books[bi + 1])} ▸</button>` : ''}</div>` : '';
  body.innerHTML = html + '</div>' + bn;
  body.classList.toggle('lib', !!S.text.blocks);
  S.wordEls = body.querySelectorAll('.w');
  S.renderedText = S.text.id;
  if (anchor) { applyTextAnchor(anchor); const g = S.tGuard = { a: anchor, until: Date.now() + 1000 };
    const fix = () => { if (S.tGuard === g && Date.now() <= g.until && !S.tTouch) applyTextAnchor(g.a); };
    requestAnimationFrame(fix); setTimeout(fix, 120); setTimeout(fix, 400); }
  else S.tGuard = null;
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
  if (t?.ann && t.work?.annL) applyAnnotation(t);
  S.marker = t ? (await setting('mk|' + t.id)) ?? null : null;
  if (t?.work) { await setting('wk|' + t.work.id, t.bi); S.opened = (await setting('opened')) || {}; S.opened[t.work.id] = Date.now(); await setting('opened', S.opened); }
  else if (t) { S.opened = (await setting('opened')) || {}; S.opened['imp:' + t.id] = Date.now(); await setting('opened', S.opened); }
  titleBar();
  S.glosses = t ? await req2p(tx('glosses').objectStore('glosses').index('textId').getAll(t.id)) : [];
  S.tokCh = await loadTokCh(t);
  renderText();
  if (scroll) { S.tGuard = null; const y = t ? await setting('pos|' + t.id) : 0; $('#textPane').scrollTop = y || 0; }
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
// Latin words in Latin dictionary entries become tappable when the Latin analysis recognises them
// (translations in italics, authors, references and Greek are left alone)
// common English and German words that the Latin analysis would also accept
const NOT_LATIN = new Set('der die das den dem des und oder mit von uom zum zur bei aus wie auch ist sind eine einer einem einen nicht als auf nach wenn mich dich sich sein seine ihr ihm ihn wir uns euch man dah übh etw jmd usw bes eig übtr übertr sprichw ggstz gew zw bzw ders dass daß the and of to is as an be by or it on at he his her use also are was were has had this that from with for which'.split(' '));
async function wrapLatin(root) {
  const E = await latEngine(); if (!E) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  const known = new Map(), ok = w => { const k = latkey(w); if (!known.has(k)) known.set(k, !NOT_LATIN.has(k) && latAnalyze(E, w).length > 0); return known.get(k); };
  for (const n of nodes) {
    const pe = n.parentElement;
    if (!/[A-Za-z]/.test(n.nodeValue) || pe.closest('.gw,summary,.au,.lab,.grk,.num,.us,.lb,.ps,.it,.gn,.hw,.tr,b')) continue;
    const s = n.nodeValue;
    // Georges and Lewis & Short run German/English and Latin together in one line ("frutex rosae, Rosenstock, Colum.:
    // in rosa, mit Rosen bekränzt"). The line is cut into short stretches at punctuation; a stretch counts as Latin
    // if most of its words are Latin forms – so German and English stay plain, the Latin phrases between them are linked.
    const isAbbr = (w, i) => s[i + w.length] === '.' && (w.length <= 3 || /^[A-Z]/.test(w));
    const segOf = [], segLatin = [];
    { let seg = 0; const SEP = /[,:;–—()\[\]!?«»„“”"]|\s-\s|\.\s/g; const cuts = [...s.matchAll(SEP)].map(m => m.index);
      const words = [...s.matchAll(new RegExp(LATIN_TOKEN.source, 'g'))];
      const stat = [];
      for (const m of words) { while (seg < cuts.length && cuts[seg] < m.index) seg++; segOf.push(seg);
        if (m[0].length < 2 || isAbbr(m[0], m.index)) continue;
        const st = stat[seg] ??= [0, 0]; st[1]++; if (ok(m[0])) st[0]++; }
      stat.forEach((st, i) => { segLatin[i] = st && st[1] && st[0] / st[1] >= 0.6; }); }
    const frag = document.createDocumentFragment(); let last = 0, wi = -1;
    for (const m of s.matchAll(new RegExp(LATIN_TOKEN.source, 'g'))) {
      wi++;
      if (m[0].length < 2) continue;
      const latin = segLatin[segOf[wi]];
      // cross-references (v. / s. / cf. / vid. / = word) are always links; other words only in Latin stretches
      const xref = /(?:\b(?:v|s|cf|vid|vgl|vergl)\.|=)\s*(?:\d+\.\s*)?$/.test(s.slice(Math.max(0, m.index - 14), m.index));
      if (!ok(m[0]) || !(xref || latin)) continue;
      if (!xref && s[m.index + m[0].length] === '.' && (m[0].length <= 3 || /^[A-Z]/.test(m[0]))) continue;     // abbreviations: Sal., ap., Cic.
      if (m.index > last) frag.append(s.slice(last, m.index));
      const sp = document.createElement('span'); sp.className = 'gw'; sp.textContent = m[0]; frag.append(sp);
      last = m.index + m[0].length;
    }
    if (last === 0) continue;
    if (last < s.length) frag.append(s.slice(last));
    n.replaceWith(frag);
  }
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
  // the headword line is added only where the entry does not begin with its own (the Latin dictionaries keep theirs,
  // with vowel lengths and variants: "āh or ā")
  const own = e.d === 'frisk' || /^\s*(?:<div class="hw">|<div class="ent-la">\s*<b class="hw-o">)/.test(e.html);
  let h = `<div class="ent">${own ? '' : `<div class="hw">${esc(e.h)}</div>`}<div class="eb" data-hl="${e.d}:${e.i}">${normalizeHTML(e.html)}</div>`;
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
  if (S.tsel) { const t = tselRange()?.toString().trim(); return t ? (S.tsel.eb ? { eb: S.tsel.eb, a: S.tsel.a, b: S.tsel.b, text: t } : { text: t }) : null; }
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
  if (S.tsel) paintTsel();
  else { const [n1, o1] = posAt(d.eb, d.a), [n2, o2] = posAt(d.eb, d.b); try { window.getSelection().setBaseAndExtent(n1, o1, n2, o2); } catch (_) { } }
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

// Android: a long press selects the word without the system's selection menu (copy, web search …) or the
// search panel from the bottom edge – the native selection is switched off and drawn by the app instead
// (CSS Custom Highlight); dragging without lifting the finger extends it word by word. Only the floating
// buttons (highlighter, + Gloss, + Default) appear.
const WCH = /[\p{L}\p{M}\p{N}'’ʼ\-]/u;
function tselRange() {
  const t = S.tsel; if (!t || !t.root.isConnected) return null;
  const [n1, o1] = posAt(t.root, t.a), [n2, o2] = posAt(t.root, t.b);
  const r = document.createRange(); try { r.setStart(n1, o1); r.setEnd(n2, o2); } catch (_) { return null; }
  return r;
}
function paintTsel() {
  if (!window.CSS?.highlights) return;
  const r = S.tsel && tselRange();
  if (r) CSS.highlights.set('tsel', new Highlight(r)); else CSS.highlights.delete('tsel');
}
function setTsel(t) {
  S.tsel = t; paintTsel();
  S.sel = dictSelection(); if (S.sel) S.lastSel = S.sel.text; updateFab();
}
function clearTsel() { if (S.tsel) setTsel(null); }
// character offset (inside root) of the word start / end at a caret position
function wordBounds(node, off) {
  const v = node.nodeValue || ''; let a = off, b = off;
  while (a > 0 && WCH.test(v[a - 1])) a--;
  while (b < v.length && WCH.test(v[b])) b++;
  return [a, b];
}
function wireTouchSelect() {
  const pane = $('#dictPane'); let hold = null, drag = null;
  const pt = e => e.touches[0] || e.changedTouches[0];
  const at = (x, y, root) => { const c = caretAt(x, y); if (!c || c.node.nodeType !== 3 || !root.contains(c.node)) return null; const [wa, wb] = wordBounds(c.node, c.off); const o = offsetIn(root, c.node, 0); return { a: o + wa, b: o + wb, c: o + c.off }; };
  pane.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || e.target.closest('input,textarea,select,button,summary,[contenteditable]')) { hold = null; return; }
    const p = pt(e), x = p.clientX, y = p.clientY, target = e.target;
    hold = { x, y, moved: false, timer: setTimeout(() => {
      const root = target.closest?.('.eb') || $('#dictBody'); const w = at(x, y, root);
      if (!w || w.b <= w.a) { hold = null; return; }
      drag = { root, wa: w.a, wb: w.b }; hold = null;
      navigator.vibrate?.(8);
      setTsel({ root, eb: root.classList.contains('eb') && root.dataset.hl ? root : null, a: w.a, b: w.b });
      drag.fresh = true;                                   // the click that follows the long press does not open a word
    }, 450) };
  }, { passive: true });
  pane.addEventListener('touchmove', e => {
    if (drag) {
      e.preventDefault();                                  // extending the selection, not scrolling
      const p = pt(e), w = at(p.clientX, p.clientY, drag.root); if (!w) return;
      const t = w.c >= drag.wa ? { a: drag.wa, b: Math.max(drag.wb, w.b) } : { a: w.a, b: drag.wb };
      if (t.a !== S.tsel.a || t.b !== S.tsel.b) setTsel(Object.assign({}, S.tsel, t));
      return;
    }
    if (hold) { const p = pt(e); if (Math.hypot(p.clientX - hold.x, p.clientY - hold.y) > 8) { clearTimeout(hold.timer); hold.moved = true; } }
  }, { passive: false });
  const end = () => { if (hold) clearTimeout(hold.timer); if (drag?.fresh) S.tselNoClick = Date.now() + 600; drag = null; };
  pane.addEventListener('touchend', end); pane.addEventListener('touchcancel', end);
  document.addEventListener('click', e => { if (S.tselNoClick > Date.now() && !e.target.closest('#fabBar')) { S.tselNoClick = 0; e.preventDefault(); e.stopPropagation(); } }, true);
  // a tap anywhere else ends the selection (scrolling keeps it)
  let tap = null;
  document.addEventListener('touchstart', e => { const p = pt(e); tap = { x: p.clientX, y: p.clientY, t: Date.now() }; }, { passive: true, capture: true });
  document.addEventListener('touchend', e => {
    const p = pt(e);
    if (tap && !drag && Date.now() - tap.t < 400 && Math.hypot(p.clientX - tap.x, p.clientY - tap.y) < 8 && !e.target.closest('#fabBar')) clearTsel();
    tap = null;
  }, { capture: true });
  document.addEventListener('contextmenu', e => { if (e.target.closest('#dictPane,#textPane') && !e.target.closest('input,textarea')) e.preventDefault(); });
}

// ---- the dictionary pane remembers its scroll position: per tapped word of a text (kept on the device),
// otherwise per lemma; Back/Forward return to the position the entry had when it was left
const scrollKey = v => v.ti != null && S.text ? `sc|${S.text.id}|${v.ti}` : `sc|@${gkey(v.pick || v.form)}`;
function flushDictScroll() {
  const v = S.scPend; S.scPend = null; clearTimeout(S.scT);
  if (v?.skey && v.scroll != null) setting(v.skey, v.scroll > 0 ? { l: v.scrollL, y: Math.round(v.scroll) } : null);
}
function wireDictScroll() {
  const pane = $('#dictPane');
  pane.addEventListener('scroll', () => {
    const v = S.view; if (!v || S.dictRendering || !v.skey) return;
    v.scroll = pane.scrollTop; v.scrollL = v.pick;
    S.scPend = v; clearTimeout(S.scT); S.scT = setTimeout(flushDictScroll, 300);
  }, { passive: true });
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
  flushDictScroll();
  const keep = S.lastRendered === v ? $('#dictPane').scrollTop : null;     // the same entry drawn again: stay where it is
  S.dictRendering = true;
  if (S.tsel) { S.tsel = null; paintTsel(); }
  if (!S.dicts.length) { body.innerHTML = '<p class="hint">No dictionaries installed yet. Open the menu ☰ → Dictionaries and import the packages (*.gdpkg.gz).</p>'; S.dictRendering = false; return; }
  const lang = langOf(v.form);
  const A = await analyses(v.form);
  const tk = v.ti != null ? S.tokens.find(t => t.t === 'w' && t.i === v.ti) : null;      // a word of the text: its own reading
  const lemma = v.lemma || tk?.lemma || A.pick || v.form;
  v.pick = lemma;
  const k = gkey(lemma);
  v.key = k;
  // Latin: the form with its vowel lengths (macron long, breve short) – one per distinct reading of the chosen lemma
  const px = A.lemmas.find(x => x.lemma === lemma), qs = [...new Set((px?.q || []).filter(Boolean))];
  let h = `<div class="form">${qs.length ? qs.slice(0, 3).map(esc).join(' <span class="qor">/</span> ') : esc(v.form)}</div>`;
  if (!A.lemmas.length && (lang === 'la' ? S.latMorph : S.morph)) h += '<p class="note">Form not found in the morphological analysis – looking up the form itself.</p>';
  if (A.lemmas.length) {
    const many = A.lemmas.length > 1 || (px?.ana.length || 0) > 1;
    const icons = many && tk && S.tokCh?.has(tk.i) ? '<span class="rdi"><button class="ico" data-anareset="1" data-tip="Back to the default reading of this word">↺</button></span>' : '';
    h += '<div class="anas">' + A.lemmas.map(x => `<button class="chip${x.lemma === lemma ? ' on' : ''}${tk && tk.amb && x.lemma === tk.defL && x.lemma !== lemma ? ' pre' : ''}" data-lemma="${esc(x.lemma)}"><b>${esc(x.lemma)}</b>${x.ana.length > 1 ? ` <small>${x.ana.length}</small>` : ''}</button>`).join('')
      + (!(tk && px && px.lemma === tk.lemma && px.ana.length) ? icons : '') + '</div>';
    // the forms of the chosen lemma, without the word; what all of them share is written once in front
    if (tk && px && px.lemma === tk.lemma && px.ana.length) {          // also a single form: the reading is always shown
      v.anaList = px.ana;
      const labs = px.ana.map(a => (gramText([a]) || a).split(' '));
      let pre = '', parts = labs.map(l => l.join(' '));
      if (labs.every(l => l.length === labs[0].length && l.length > 1)) {
        const same = labs[0].map((w, i) => labs.every(l => l[i] === w));
        if (same.some(Boolean) && same.some(x => !x)) { pre = labs[0].filter((_, i) => same[i]).join(' '); parts = labs.map(l => l.filter((_, i) => !same[i]).join(' ')); }
      }
      const qd = new Set((px.q || []).filter(Boolean)).size > 1;          // vowel lengths only where they tell the forms apart
      h += '<div class="anarows">' + (pre ? `<span class="pre">${esc(pre)}:</span>` : '') + px.ana.map((a, i) => `<button class="ana${a === tk.ana && (tk.anaSet || !tk.amb) ? ' on' : ''}${tk.amb && px.lemma === tk.defL && a === tk.defA ? ' pre' : ''}" data-ana="${i}">${qd && px.q[i] ? `<span class="qf">${esc(px.q[i])}</span> ` : ''}${esc(parts[i])}</button>`).join('') + icons + '</div>';
    }
  }
  h += '<div id="glossbox" hidden></div>';
  const by = await entriesFor(k, lang);
  const ost = await setting('open|' + k);
  const isOpen = id => Array.isArray(ost) ? ost.includes(id) : S.dictPrefs.open.includes(id) !== !!ost?.x?.includes(id);
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
    h += `<details class="src${has ? '' : ' empty'}" data-d="${d.id}"${has && (isOpen(d.id) || v.openDict === d.id) ? ' open' : ''}><summary>${esc(d.name)} <small>${esc(d.title || '')}</small></summary>${inner}</details>`;
  }
  body.innerHTML = h;
  body.querySelectorAll('details.src').forEach(el => wrapGreek(el));
  if (lang === 'la') for (const el of body.querySelectorAll('details.src')) await wrapLatin(el);
  await applyHighlights(body);
  fillGlossBox();
  v.skey = scrollKey(v);
  let y = keep ?? (v.scroll != null && v.scrollL === lemma ? v.scroll : null);
  if (y == null) { const st = await setting(v.skey); if (st && st.l === lemma) { y = st.y; v.scroll = y; v.scrollL = lemma; } }
  $('#dictPane').scrollTop = y || 0;
  S.lastRendered = v;
  requestAnimationFrame(() => requestAnimationFrame(() => { if (S.view === v) S.dictRendering = false; }));
}
async function saveOpenState() {   // remembered per lemma
  if (!S.view?.key) return;
  const x = [...document.querySelectorAll('#dictBody details.src:not(.empty)')].filter(d => d.open !== S.dictPrefs.open.includes(d.dataset.d)).map(d => d.dataset.d);
  await setting('open|' + S.view.key, x.length ? { x } : null);
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
    // from a selection in the dictionary pane: the lemma whose entry is shown there (also after following a link)
    const l = (add && S.view?.pick) || targetLemma(); if (!l) return toast('A default gloss needs a single word with a known lemma.');
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
    h += `<label class="gb"><span>Gloss${sel[1] > sel[0] ? ` <i>${esc(words)}</i>` : ''}</span><textarea rows="1" data-span="${sel[0]},${sel[1]}" placeholder="– none –" autocomplete="off">${esc(g?.t || '')}</textarea></label>`;
  }
  if (k) h += `<label class="gb"><span>Default</span><textarea rows="1" data-def="${esc(k)}" placeholder="– none –" autocomplete="off">${esc(S.lemmaGloss[k] || '')}</textarea></label>`;
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
    const key = (inner.match(/<h3[^>]*>([^<]*)/) || [])[1] || '';
    f.innerHTML = '<button type="button" class="dlgx" data-v="cancel" aria-label="Close" title="Close">✕</button>' + inner + '<div class="row">' + buttons.map(([v, l, extra]) =>
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
    d.onscroll = () => { if (d.open) (S.dlgScroll ??= {})[key] = d.scrollTop; };
    d.onclose = () => { const data = Object.fromEntries(new FormData(f)); res({ action, data }); };
    // a click outside the dialog (on the dimmed background) closes it like "Close"
    const outside = e => { const r = d.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
    d.onpointerdown = e => { d._down = outside(e); };
    d.onclick = e => { if (e.target === d && d._down && outside(e)) finish('cancel'); d._down = false; };
    d.showModal();
    const first = f.querySelector('input[type=text]:not(.privf input):not(.nofocus),textarea:not(.nofocus)');
    if (first) { first.focus(); first.select?.(); } else { f.tabIndex = -1; f.focus({ preventScroll: true }); }
    const y = S.dlgScroll?.[key];                    // reopen where it was left (again after late content has come in)
    if (y && !first) { const go = () => { if (d.open && d.scrollTop < y) d.scrollTop = y; }; requestAnimationFrame(go); setTimeout(go, 150); setTimeout(go, 600); }
  });
}
// a short explanation that appears only when its ⓘ is tapped
// a control with its ⓘ on the same line (the explanation opens below both)
const withInfo = (ctl, t) => `<span class="cinl">${ctl}${info(t)}</span>`;
const info = t => `<button type="button" class="info" data-info aria-label="Explanation" aria-expanded="false">ⓘ</button><span class="infot" hidden>${t}</span>`;
// ☰ → Import text: paste a text or load a file (.txt, .odt, .docx), with its details; imported texts are listed in the Library
const LANG_OPTS = [['', 'Detect'], ['grc', 'Greek'], ['la', 'Latin']];
function detectLang(t) { const g = (t.match(/[Ͱ-Ͽἀ-῿]/g) || []).length, l = (t.match(/[A-Za-z]/g) || []).length; return g >= l ? 'grc' : 'la'; }
// "c. 380 BC" -> -380, "4th c. BC" -> -350, "2nd century AD" -> 150, "1453" -> 1453
function parseYear(d) {
  const s = String(d || '').toLowerCase(); const m = s.match(/(\d{1,4})\s*(st|nd|rd|th|\.)?\s*(c\b|c\.|cent|century|jh|jahrhundert)?/); if (!m) return null;
  const n = +m[1], bc = /\b(bc|b\.c|bce|v\.\s*chr|v\.chr)/.test(s), cent = !!m[3] || (!!m[2] && m[2] !== '.' && n <= 21);
  const y = cent ? (n - 1) * 100 + 50 : n;
  return bc ? -y : y;
}
// the text of a .docx (word/document.xml) or .odt (content.xml): one line per paragraph
async function zipEntry(buf, name) {
  const dv = new DataView(buf); let e = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('not a .docx/.odt file');
  let p = dv.getUint32(e + 16, true);
  for (let k = dv.getUint16(e + 10, true); k > 0; k--) {
    const meth = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    if (new TextDecoder().decode(new Uint8Array(buf, p + 46, nl)) === name) {
      const st = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = new Uint8Array(buf, st, cs);
      if (meth === 0) return new TextDecoder().decode(data);
      return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    }
    p += 46 + nl + xl + cl;
  }
  throw new Error(name + ' not found');
}
function xmlParas(xml, odt) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml'), out = [];
  const walk = (n, acc) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { acc.push(c.nodeValue); continue; }
      if (c.nodeType !== 1) continue;
      const ln = c.localName;
      if (odt ? ln === 's' : false) acc.push(' '.repeat(+(c.getAttribute('text:c') || 1)));
      else if (ln === 'tab') acc.push('\t');
      else if (ln === 'br' || ln === 'line-break') acc.push('\n');
      else if (!odt && (ln === 'instrText' || ln === 'delText')) continue;
      else walk(c, acc);
    }
  };
  const paras = odt ? [...doc.getElementsByTagName('*')].filter(e => (e.localName === 'p' || e.localName === 'h') && e.namespaceURI?.includes('text'))
    : [...doc.getElementsByTagName('*')].filter(e => e.localName === 'p' && e.namespaceURI?.includes('wordprocessingml'));
  for (const pe of paras) { if (paras.some(q => q !== pe && q.contains(pe))) continue; const acc = []; walk(pe, acc); out.push(acc.join('')); }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
async function readTextFile(f) {
  const ext = (f.name.match(/\.([^.]+)$/) || [])[1]?.toLowerCase();
  if (ext === 'docx') return xmlParas(await zipEntry(await f.arrayBuffer(), 'word/document.xml'), false);
  if (ext === 'odt') return xmlParas(await zipEntry(await f.arrayBuffer(), 'content.xml'), true);
  return (await f.text()).replace(/\r\n?/g, '\n');
}
async function importDialog(t = null) {
  const v = t || {};
  const r = await dialog(`<h3>${t ? 'Edit imported text' : 'Import text'}</h3>
    <div class="impf">
      <label>Title<input type="text" name="title" value="${esc(v.title || '')}" placeholder="e.g. Phaedrus 227a–230e" class="nofocus"></label>
      <label>Author<input type="text" name="author" value="${esc(v.author || '')}" placeholder="e.g. Plato" class="nofocus"></label>
      <label>Date<input type="text" name="date" value="${esc(v.date || '')}" placeholder="e.g. 4th c. BC, c. 380 BC" class="nofocus"></label>
      <label>Edition / source<input type="text" name="edition" value="${esc(v.edition || '')}" placeholder="e.g. Burnet, OCT 1901" class="nofocus"></label>
      <label>Language<select name="lang">${LANG_OPTS.map(([k, l]) => `<option value="${k}"${(v.lang || '') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Notes<input type="text" name="notes" value="${esc(v.notes || '')}" class="nofocus"></label>
    </div>
    <div class="imptxt"><span>Text</span><label class="filebtn" for="fileImport">Load file … <small>.txt · .odt · .docx</small></label><input type="file" id="fileImport" accept=".txt,.text,.odt,.docx,.json,text/plain" hidden></div>
    <textarea name="text" class="nofocus" placeholder="Paste the text here, or load a file …">${esc(v.text || '')}</textarea>
    ${t ? '<p class="hint small">Changing the text itself can move glosses that belong to single words.</p>' : ''}`,
    [['cancel', 'Cancel'], ['ok', t ? 'Save' : 'Import']]);
  if (r.action !== 'ok') return;
  const d = r.data, text = (d.text || '').trim();
  if (!text) return toast('No text to import.');
  const rec = Object.assign(t ? { id: t.id, created: t.created } : { created: Date.now() }, {
    title: d.title.trim() || (t?.title) || 'Text ' + new Date().toLocaleDateString('en-GB'), author: d.author.trim(), date: d.date.trim(), year: parseYear(d.date),
    edition: d.edition.trim(), notes: d.notes.trim(), lang: d.lang || detectLang(text), text: d.text });
  const id = await put('texts', rec);
  await openText(t ? t.id : id);
  toast(t ? 'Saved' : 'Text imported – it is listed in the Library under “Imported”');
}
async function textsDialog() { return importDialog(); }
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
  try { man = await (await fetchT('packages/packages.json', { cache: 'no-cache' })).json(); } catch (_) { return null; }
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
  const foldBtn = id => `<button type="button" class="fold" data-dict-fold="${id}" title="Shown unfolded or folded when a word is looked up">${S.dictPrefs.open.includes(id) ? '▾ unfolded' : '▸ folded'}</button>`;
  const missingRow = p => `<div class="item"><span class="t"><b>${esc(p.name)}</b> ${esc(p.title || '')}<br><small>not on this device · ${(p.bytes / 1e6).toFixed(1)} MB${p.priv ? ' · private repository' : ''}</small></span>${repoBtn(p.id)}</div>`;
  // 1. dictionaries (drag to reorder, tick to show)
  const srcOf = p => p.src || (['ls', 'georges', 'collatinus', 'morph-la', 'whitaker', 'morph-la-ww'].includes(p.id) ? 'la' : 'grc');
  const rowsFor = lang => S.dicts.filter(d => d.src === lang).map(d => `<div class="item dictrow" data-id="${d.id}"><span class="grip" title="Drag to reorder" aria-label="Drag to reorder">⠿</span>${onBox(d.id, 'dictionary')}<span class="t"><b>${esc(d.name)}</b> ${foldBtn(d.id)} ${esc(d.title || '')}<br><small>${d.count.toLocaleString('en')} entries${sizeOf(d)} · ${esc(d.source || '')}</small></span>${repoBtn(d.id)}${delBtn(d.id)}</div>`).join('');
  const missFor = lang => Object.values(remote).filter(p => !S.installed[p.id] && p.kind === 'dictionary' && srcOf(p) === lang).map(missingRow).join('');
  // 2. analysis tools (tick to use)
  const tools = [S.morphInst && [S.morphInst, 'Greek: lemma and form for every word', `${S.morphInst.count.toLocaleString('en')} forms${sizeOf(S.morphInst)}`],
                 S.hintsInst && [S.hintsInst, 'Greek: preferred lemma for ambiguous forms; word classes for the colours', ''],
                 ...S.latMorphs.map(d => [d, 'Latin: lemma and form for every word (choose one below)', `${d.count.toLocaleString('en')} lemmata${sizeOf(d)}`])].filter(Boolean)
    .map(([d, what, sub]) => `<div class="item toolrow"><span class="grip ph" aria-hidden="true">⠿</span>${onBox(d.id, 'instrument')}<span class="t"><b>${esc(d.name)}</b> <small>${esc(what)}</small><br><small>${sub ? sub + ' · ' : ''}${esc(d.source || '')}</small></span>${repoBtn(d.id)}${delBtn(d.id)}</div>`).join('');
  const missT = Object.values(remote).filter(p => !S.installed[p.id] && p.kind !== 'dictionary').map(missingRow).join('');
  let est = '', pers = '';
  try { const e = await navigator.storage?.estimate?.(); if (e) est = `The app uses ${(e.usage / 1e6).toFixed(0)} MB on this device`; } catch (_) { }
  try { pers = (await navigator.storage?.persisted?.()) ? ' · protected: downloads stay until you delete them' : ' · <b>not yet protected</b> – start the app from its Home Screen icon'; } catch (_) { }
  const privState = privCfgNow.token ? (S.privErr ? '<span class="bad">' + esc(S.privErr) + '</span>' : '<span class="ok">connected</span>') : 'not connected';
  const r = await dialog(`<h3>Dictionaries</h3>
    ${Object.entries(LANGS).map(([lang, name]) => { const rs = rowsFor(lang), ms = missFor(lang);
      return `<section class="dsec"><h4>${name} dictionaries ${info('Drag ⠿ to change the order · untick to hide · ▸/▾ folded or unfolded when a word is looked up.')}</h4>
      <div class="list plain dictlist">${rs || ms ? rs + ms : `<p class="hint">No ${name} dictionaries installed.</p>`}</div></section>`; }).join('')}
    <section class="dsec"><h4>Analysis instruments ${info('Untick an instrument to switch it off. The language of each word follows from its alphabet.')}</h4>
      <div class="list plain">${tools || missT ? tools + missT : '<p class="hint">No analysis instruments installed.</p>'}</div>
      <div class="srow"><span class="sl">Greek analysis</span><div class="sc">${langToolSel('grc')}</div></div>
      <div class="srow"><span class="sl">Latin analysis</span><div class="sc">${langToolSel('la')}</div></div>
      <div class="srow"><span class="sl">Vowel lengths</span><div class="sc">${withInfo(`<label class="sopt"><input type="checkbox" data-set="latQuant"${S.latQuant ? ' checked' : ''}> Mark them in Latin texts (ā long, ă short)</label>`, 'From Collatinus (also needed with Whitaker’s Words). Where a form has several readings, only the lengths they share are marked.')}</div></div></section>
    ${man ? '' : '<p class="hint">The website could not be reached (offline?) – download buttons are not available right now. Everything already installed works offline.</p>'}
    <section class="dsec"><h4>Private dictionaries <small>${privState}</small></h4>
      <p class="hint small">Dictionaries that may not be published can be downloaded from a private GitHub repository. ${info('<b>Repository:</b> owner and name of the private repository. <b>Token:</b> a GitHub fine-grained personal access token with access to that repository only and the permission “Contents: Read-only”; it is stored only on this device.<br><b>Format:</b> the repository contains dictionary packages (<code>*.gdpkg.gz</code>, format <code>greekdict-pkg-2</code>, as made by the toolkit’s <code>python gd.py packages</code>) and a <code>packages.json</code> next to them that lists them (id, file, name, kind, bytes, version) – the same layout as the app’s public <code>packages</code> folder.')}</p>
      <div class="privf"><label>GitHub repository<input type="text" name="privRepo" value="${esc(privCfgNow.repo)}" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="owner/repository"></label>
      <label>Access token<input type="password" name="privToken" value="${esc(privCfgNow.token)}" autocomplete="off" placeholder="github_pat_…"></label></div>
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
// analysis tools per language (☰ → Dictionaries); switching one on switches the others of that language off
function langToolSel(lang) {
  const ts = langTools(lang), cur = ts.find(d => !S.dictPrefs.off.includes(d.id));
  return ts.length ? `<select data-langtool="${lang}">${ts.map(d => `<option value="${d.id}"${d === cur ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}<option value=""${cur ? '' : ' selected'}>None (no analysis)</option></select>`
    : '<small class="hint">none installed</small>';
}
function langTools(lang) { return Object.values(S.installed || {}).filter(d => (lang === 'la' ? d.kind === 'latmorph' : d.kind === 'morph')); }
async function setLangTool(lang, id) {
  const off = new Set(S.dictPrefs.off);
  for (const d of langTools(lang)) d.id === id ? off.delete(d.id) : off.add(d.id);
  S.dictPrefs.off = [...off]; await setting('dictPrefs', S.dictPrefs);
  await loadDicts(); bucketCache.clear(); S.latEngine = null; S.colEngine = undefined;
  resetTokens(); renderText(); resolveTokens(); if (S.view) renderView();
}
async function settingsDialog() {
  await loadDicts();
  const dark = document.documentElement.dataset.theme === 'dark';
  const toolSel = lang => { const ts = langTools(lang), cur = ts.find(d => !S.dictPrefs.off.includes(d.id));
    return ts.length ? `<select data-langtool="${lang}">${ts.map(d => `<option value="${d.id}"${d === cur ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}<option value=""${cur ? '' : ' selected'}>None (no analysis)</option></select>`
      : '<small class="hint">not installed – ☰ → Dictionaries</small>'; };
  // a joined switch for either/or settings: Light | Dark
  const sw = (k, cur, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" class="${cur === v ? 'on' : ''}" data-setk="${k}" data-setv="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
  const row = (label, ctl, hint = '') => `<div class="srow"><span class="sl">${label}</span><div class="sc">${ctl}${hint ? `<small class="sh">${hint}</small>` : ''}</div></div>`;
  const cb = (k, on, label) => `<label class="sopt"><input type="checkbox" data-set="${k}"${on ? ' checked' : ''}> ${label}</label>`;
  let ver = '–'; try { const ks = (await caches.keys()).filter(k => k.startsWith('lesepult-v')).map(k => +k.split('-v')[1]); if (ks.length) ver = Math.max(...ks); } catch (_) { }
  const posRows = POS.map(([id, label]) => `<div class="item posrow"><label class="t"><input type="checkbox" data-poson="${id}"${S.posCfg[id]?.on !== false ? ' checked' : ''}> ${label}</label><input type="color" data-posc="${id}" value="${S.posCfg[id]?.c}"></div>`).join('');
  await dialog(`<h3>Settings</h3>
    <section class="dsec"><h4>Appearance</h4>
      ${row('Theme', sw('theme', dark ? 'dark' : 'light', [['light', 'Light'], ['dark', 'Dark']]))}
      ${row('Top bar', withInfo(cb('gramBtn', S.gramBtn, 'Grammar button'), 'Shows the grammatical information beneath each word.'))}
      <details class="scol"${S.colOpen ? ' open' : ''}><summary>Word-class colours ${info('Used by the “Colours” button in the top bar (hold that button to open this list directly). Word classes follow the reading chosen for each word.')}</summary>
        <div class="list plain">${posRows}</div><div class="row" style="justify-content:flex-start"><button type="button" data-posreset="1">Reset colours</button></div></details></section>
    <section class="dsec"><h4>Glosses</h4>
      ${row('Own gloss', withInfo(sw('glossMode', S.glossMode === 'both' ? 'both' : 'replace', [['replace', 'Replaces default'], ['both', 'Show both']]), 'A word can have its own gloss; its lemma can have a default gloss that applies everywhere.'))}</section>
    <section class="dsec"><h4>About</h4>
      ${row('Version', `Pult · version ${ver}`)}</section>`,
    [['cancel', 'Close']]);
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
async function backupData() {
  return { format: 'greekdict-backup-1', date: new Date().toISOString(), texts: await getAll('texts'), glosses: await getAll('glosses'), choices: await getAll('choices'), lemmaGlosses: S.lemmaGloss,
    highlights: Object.fromEntries((await getAll('settings', IDBKeyRange.bound('hl|', 'hl|￿'))).map(r => [r.k.slice(3), r.v])),
    markers: Object.fromEntries((await getAll('settings', IDBKeyRange.bound('mk|', 'mk|￿'))).map(r => [r.k.slice(3), r.v])),
    readings: Object.fromEntries((await getAll('settings', IDBKeyRange.bound('an|', 'an|￿'))).map(r => [r.k.slice(3), r.v])),
    favourites: (await setting('favs')) || {},
    prefs: { theme: document.documentElement.dataset.theme, posCfg: S.posCfg, posOn: S.posOn, showGloss: !document.body.classList.contains('nogloss'),
      glossMode: S.glossMode, latQuant: S.latQuant, gramBtn: S.gramBtn, showGram: S.gram, dictPrefs: S.dictPrefs } };
}
// ☰ → This Pult: what the reader has stored on this device, and backups
async function pultDialog() {
  // the backup file is prepared first, so that the download link is tapped directly by the user (needed on iPad)
  const data = await backupData();
  const href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const name = 'pult-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  const works = await libWorks(), wsize = works.reduce((a, w) => a + (w.size || 0), 0);
  await loadDicts(); const dicts = Object.values(S.installed || {}), dsize = dicts.reduce((a, d) => a + (d.size || 0), 0);
  const glossTexts = new Set(data.glosses.map(g => g.textId)).size;
  let use = '', prot = '';
  try { const e = await navigator.storage?.estimate?.(); if (e) use = `${(e.usage / 1e6).toFixed(0)} MB in use`; } catch (_) { }
  try { prot = (await navigator.storage?.persisted?.()) ? 'protected – stays until you delete it' : 'not yet protected – start Pult from its Home Screen icon'; } catch (_) { }
  const n = x => x.toLocaleString('en');
  const rows = [
    ['Imported texts', n(data.texts.length)],
    ['Library texts on this device', `${n(works.length)}${wsize ? ` · ≈ ${mb(wsize)}` : ''}`],
    ['Glosses', `${n(data.glosses.length)}${glossTexts ? ` in ${n(glossTexts)} text${glossTexts === 1 ? '' : 's'}` : ''}`],
    ['Default glosses', n(Object.keys(data.lemmaGlosses || {}).length)],
    ['Chosen readings of words', n(Object.keys(data.readings).length)],
    ['Lemma choices for forms', n(data.choices.length)],
    ['Highlights in dictionaries', n(Object.keys(data.highlights).length)],
    ['Markers', n(Object.keys(data.markers).length)],
    ['Favourites', n(Object.keys(data.favourites).length)],
    ['Dictionaries and tools', `${n(dicts.length)}${dsize ? ` · ≈ ${mb(dsize)}` : ''}`],
    ['Storage', [use, prot].filter(Boolean).join(' · ') || '–']];
  const r = await dialog(`<h3>This Pult</h3>
    <p class="hint small">Everything is stored only on this device. ${info('A backup contains your imported texts, glosses, default glosses, chosen readings, lemma choices, highlights, markers, favourites, colours and display settings. Library texts and dictionaries are not included – they can be downloaded again.')}</p>
    <div class="list plain pultlist">${rows.map(([k, v]) => `<div class="item"><span class="t">${k}</span><span class="pv">${v}</span></div>`).join('')}</div>`,
    [['link', 'Export backup', { href, name }], ['file', 'Import backup …', 'fileBackup'], ['clean', 'Clean up storage'], ['cancel', 'Close']]);
  setTimeout(() => URL.revokeObjectURL(href), 60000);
  if (r.action === 'clean') { await cleanStorage(); return pultDialog(); }
}
const backupDialog = pultDialog;
async function restoreBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.format !== 'greekdict-backup-1') return toast('Not a backup file.');
  const c = await dialog(`<h3>Restore?</h3><p>${data.texts.length} texts and ${data.glosses.length} glosses. Existing items with the same number are overwritten.</p>`, [['cancel', 'Cancel'], ['ok', 'Restore']]);
  if (c.action !== 'ok') return;
  await bulkPut('texts', data.texts); await bulkPut('glosses', data.glosses); await bulkPut('choices', data.choices);
  for (const [k, t] of Object.entries(data.lemmaGlosses || {})) { S.lemmaGloss[k] = t; await setting('lg|' + k, t); }
  for (const [k, r] of Object.entries(data.highlights || {})) await setting('hl|' + k, r);
  for (const [k, r] of Object.entries(data.markers || {})) await setting('mk|' + k, r);
  for (const [k, r] of Object.entries(data.readings || {})) await setting('an|' + k, r);
  if (data.favourites) { S.favs = Object.assign((await setting('favs')) || {}, data.favourites); await setting('favs', S.favs); }
  const p = data.prefs;                           // colours and display settings
  if (p?.dictPrefs) { S.dictPrefs = Object.assign(S.dictPrefs || {}, p.dictPrefs); await setting('dictPrefs', S.dictPrefs); await loadDicts(); }
  if (p) {
    if (p.theme) setTheme(p.theme, true);
    if (p.posCfg) { S.posCfg = Object.assign(defaultPosCfg(), p.posCfg); await setting('posCfg', S.posCfg); }
    if (p.posOn != null) { S.posOn = !!p.posOn; await setting('posOn', S.posOn); }
    applyPosColors();
    if (p.showGloss != null) setGlossVisible(!!p.showGloss, true);
    if (p.glossMode) { S.glossMode = p.glossMode; await setting('glossMode', p.glossMode); }
    if (p.latQuant != null) { S.latQuant = !!p.latQuant; await setting('latQuant', S.latQuant); }
    if (p.gramBtn != null) { S.gramBtn = !!p.gramBtn; await setting('gramBtn', S.gramBtn); applyTopButtons(); }
    if (p.showGram != null) setGram(S.gramBtn && !!p.showGram, true);
  }
  toast('Restored'); await openText(data.texts[0]?.id ?? null);
}

// ---------------------------------------------------------------- export of the text (HTML, PDF via printing, Word)
// The text is exported as it is shown: same words (with vowel lengths if shown), word-class colours,
// grammatical information and glosses – each of the three can be switched on or off in the export dialog.
function exportTitle() {
  const t = S.text, w = t?.work;
  return (!t ? 'Text' : w ? `${w.author} – ${w.title}${w.books.length > 1 ? ' – ' + w.books[t.bi] : ''}` : t.title) + (S.exportLabel ? ', ' + S.exportLabel : '');
}
// the displayed text as plain data: blocks of words, punctuation, line breaks and references
function exportModel(rng = null) {
  const posC = el => { const c = [...el.classList].find(x => x.startsWith('p-')); const id = c?.slice(2); return id && S.posCfg[id]?.on !== false ? S.posCfg[id].c : null; };
  const punctC = S.posCfg.punct?.on !== false ? S.posCfg.punct?.c : null;
  const blocks = [];
  for (const b of $('#textBody').children) {
    if (!b.matches('.para,.blk')) continue;
    const kind = b.classList.contains('blk') ? ([...b.classList].find(c => c.startsWith('k-')) || 'k-p').slice(2) : 'p';
    const items = [];
    const walk = node => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { if (n.nodeValue) items.push({ t: 'p', s: n.nodeValue }); continue; }
        if (n.nodeType !== 1 || n.matches('.mkr')) continue;
        if (n.matches('.rf')) items.push({ t: 'ref', s: n.textContent });
        else if (n.matches('br')) items.push({ t: 'br' });
        else if (n.matches('.pn')) items.push({ t: 'p', s: n.textContent, c: punctC });
        else if (n.matches('.w')) {
          const g = n.querySelector('.g');
          items.push({ t: 'w', i: +n.dataset.i, s: g.firstChild?.nodeValue || '', pu: g.querySelector('.pu')?.textContent || '', c: posC(n), pc: punctC,
            gram: n.querySelector('.gm')?.textContent || '',
            gloss: [...n.querySelectorAll('.gl>span')].map(x => ({ s: x.innerHTML.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'), dg: x.classList.contains('dg') })) });
        } else walk(n);
      }
    };
    walk(b);
    if (items.some(x => x.t === 'w' || (x.t === 'p' && x.s.trim()))) blocks.push({ kind, items });
  }
  if (!rng) return blocks;
  // only the words a…b; references and punctuation in between, punctuation right after the last word
  const flat = blocks.flatMap(b => b.items); let prev;
  for (const x of flat) { if (x.t === 'w') prev = x.i; else x.prev = prev; }
  let next; for (let j = flat.length - 1; j >= 0; j--) { const x = flat[j]; if (x.t === 'w') next = x.i; else x.next = next; }
  const inR = i => i != null && i >= rng.a && i <= rng.b;
  return blocks.map(b => ({ kind: b.kind, items: b.items.filter(x => x.t === 'w' ? inR(x.i)
      : inR(x.next) ? (inR(x.prev) || x.prev == null || x.prev < rng.a || x.t === 'ref')
      : inR(x.prev) && x.t === 'p' && x.s.trim() !== '' && !/\S\s+\S/.test(x.s.trim())) }))
    .filter(b => b.items.some(x => x.t === 'w'));
}
// the reference points of the current book for "from … to": lines for verse, sections for prose, paragraphs otherwise
function exportRefs() {
  const words = new Map(S.tokens.filter(t => t.t === 'w').map(t => [t.i, t.s]));
  const list = []; let pend = null, nl = 0;
  for (const tk of S.tokens) { if (tk.t === 'r') { pend = tk.s; if (tk.l) nl++; } else if (tk.t === 'w' && pend != null) { list.push({ s: pend, i: tk.i }); pend = null; } }
  const verse = S.text.work?.verse ?? nl > list.length / 2;               // verse quotations in prose do not count
  let kind = verse ? 'Line' : 'Section';
  if (!list.length) {
    kind = 'Paragraph'; let n = 0;
    for (const b of $('#textBody').children) { const w = b.matches?.('.para,.blk') && b.querySelector('.w'); if (w) list.push({ s: '¶ ' + (++n), i: +w.dataset.i }); }
  }
  const last = Math.max(...words.keys());
  list.forEach((r, j) => { r.end = (list[j + 1]?.i ?? last + 1) - 1; r.lab = [...Array(4).keys()].map(k => words.get(r.i + k)).filter(Boolean).join(' '); });
  return { kind, list, words };
}
const exportSelLabel = (W, r) => { const a = [W.get(r.a), W.get(r.a + 1)].filter(Boolean).join(' '), b = [W.get(r.b - 1), W.get(r.b)].filter(Boolean).join(' ');
  return r.b - r.a < 4 ? [...Array(r.b - r.a + 1).keys()].map(k => W.get(r.a + k)).join(' ') : `${a} … ${b}`; };
// B: marking the range in the text – first tap = first word, second tap = last word
function exportPickStart() {
  S.exPick = { a: null, b: null }; document.body.classList.add('expick'); exportPickPaint();
}
function exportPickPaint() {
  const p = S.exPick, els = S.wordEls || [];
  document.querySelectorAll('#textBody .w.xsel').forEach(e => e.classList.remove('xsel'));
  if (p && p.a != null) { const b = p.b ?? p.a; for (let i = Math.min(p.a, b); i <= Math.max(p.a, b); i++) els[i]?.classList.add('xsel'); }
  let bar = $('#exBar');
  if (!p) { bar?.remove(); document.body.classList.remove('expick'); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'exBar'; document.body.append(bar); }
  const n = p.a == null ? 0 : p.b == null ? 1 : p.b - p.a + 1;
  bar.innerHTML = `<span>${p.a == null ? 'Tap the first word of the passage' : p.b == null ? 'Now tap the last word' : `${n.toLocaleString('en')} word${n === 1 ? '' : 's'} marked`}</span>`
    + `<button type="button" data-xp="ok"${p.a == null ? ' disabled' : ''}>Export …</button><button type="button" data-xp="cancel">Cancel</button>`;
  const r = $('#textPane').getBoundingClientRect();
  Object.assign(bar.style, { left: r.left + 'px', width: r.width + 'px' });
}
const EXPORT_CSS = `
.xt{font-family:'Gentium Book Plus','Gentium Plus','Times New Roman',serif;font-size:13pt;line-height:1.5;color:#111;position:relative;padding-left:3.2em}
.xt h1{font:600 12pt/1.3 -apple-system,'Segoe UI',Arial,sans-serif;color:#555;margin:0 0 1.2em -3.2em}
.xt .b{margin:0 0 .8em}.xt .b.k-h{text-align:center;font-weight:700}.xt .b.k-s{font:600 10pt Arial,sans-serif;letter-spacing:.04em;color:#7a2e2e;margin:.9em 0 .1em}
.xt .b.k-L{margin:0}
.xt .rf{position:absolute;left:0;width:2.8em;font:8pt/2.4 Arial,sans-serif;color:#888;white-space:nowrap}
.xt .w{display:inline-flex;flex-direction:column;align-items:flex-start;vertical-align:top}
.xt .g{display:block;white-space:nowrap}
.xt .gm{display:block;font:7.5pt/1.2 Arial,sans-serif;color:#777;max-width:11em}
.xt .gl{display:block;font:8.5pt/1.25 Arial,sans-serif;color:#2e5a7a;max-width:14em}
.xt .gl .dg{color:#777;font-style:italic}
.xt .gl span{display:block}`;
function exportHTML(blocks, o) {
  const st = c => o.colour && c ? ` style="color:${c}"` : '';
  let h = `<div class="xt"><h1>${esc(exportTitle())}</h1>`;
  for (const b of blocks) {
    h += `<div class="b k-${b.kind}">`;
    for (const x of b.items) {
      if (x.t === 'ref') h += `<span class="rf">${esc(x.s)}</span>`;
      else if (x.t === 'br') h += '<br>';
      else if (x.t === 'p') h += x.s.trim() ? `<span${st(x.c)}>${esc(x.s)}</span>` : esc(x.s);
      else {
        const sub = (o.gram && x.gram ? `<span class="gm">${esc(x.gram)}</span>` : '')
          + (o.gloss && x.gloss.length ? `<span class="gl">${x.gloss.map(g => `<span${g.dg ? ' class="dg"' : ''}>${esc(g.s).replace(/\n/g, '<br>')}</span>`).join('')}</span>` : '');
        const word = `<span${st(x.c)}>${esc(x.s)}</span>${x.pu ? `<span${st(x.pc)}>${esc(x.pu)}</span>` : ''}`;
        h += `<span class="w"><span class="g">${word}</span>${sub}</span>`;
      }
    }
    h += '</div>';
  }
  return h + '</div>';
}
// fonts are put into the HTML file itself, so that it looks the same on any computer
async function fontFacesInline() {
  try {
    let css = await (await fetch('fonts.css')).text();
    const urls = [...new Set([...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1]))];
    for (const u of urls) {
      const buf = new Uint8Array(await (await fetch(u)).arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      css = css.split(`url(${u})`).join(`url(data:font/woff2;base64,${btoa(bin)})`);
    }
    return css;
  } catch (_) { return ''; }
}
async function exportHTMLFile(blocks, o) {
  return `<!doctype html><html lang="grc"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(exportTitle())}</title>
<style>${await fontFacesInline()}
body{margin:2.5em auto;max-width:46em;padding:0 1.5em;background:#fff}${EXPORT_CSS}
@media print{body{margin:0;max-width:none;padding:0}@page{size:A4;margin:2cm}}</style></head><body>${exportHTML(blocks, o)}</body></html>`;
}
// PDF: the browser's own printing (on the iPad: Print → share → Save to Files; elsewhere: "Save as PDF")
function exportPrint(blocks, o) {
  let root = $('#printRoot'); if (!root) { root = document.createElement('div'); root.id = 'printRoot'; document.body.append(root); }
  root.innerHTML = `<style>${EXPORT_CSS}@page{size:A4;margin:2cm}</style>` + exportHTML(blocks, o);
  document.documentElement.classList.add('printing');
  const done = () => { document.documentElement.classList.remove('printing'); root.innerHTML = ''; removeEventListener('afterprint', done); };
  addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(() => { if (!matchMedia('print').matches) done(); }, 1500); }, 50);
}
// ---- Word (.docx): with glosses or grammar, each printed line becomes a borderless table (one column per word,
// the word above its grammar and gloss) – Word has no other way to stack text under a word. The lines are
// measured in the browser at the width of an A4 page.
const xe = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function wRun(text, { c, sz = 26, font = 'Times New Roman', i = false, b = false } = {}) {
  if (!text) return '';
  return `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>${b ? '<w:b/>' : ''}${i ? '<w:i/>' : ''}${c ? `<w:color w:val="${c.replace('#', '')}"/>` : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${xe(text)}</w:t></w:r>`;
}
const wP = (runs, { jc, after = 0, before = 0 } = {}) => `<w:p><w:pPr><w:spacing w:before="${before}" w:after="${after}" w:line="240" w:lineRule="auto"/>${jc ? `<w:jc w:val="${jc}"/>` : ''}</w:pPr>${runs}</w:p>`;
function exportDocxBody(blocks, o) {
  const has = f => blocks.some(b => b.items.some(f));
  const inter = (o.gloss && has(x => x.gloss?.length)) || (o.gram && has(x => x.gram));   // tables only where something stands under the words
  const col = c => o.colour ? c : null;
  const textSz = b => b.kind === 's' ? 20 : 26;
  let body = wP(wRun(exportTitle(), { font: 'Arial', sz: 22, b: true, c: '#555555' }), { after: 240 });
  if (!inter) {                      // running text: one paragraph per block, references as small grey numbers
    for (const b of blocks) {
      let runs = '';
      for (const x of b.items) {
        if (x.t === 'ref') runs += wRun(x.s + ' ', { font: 'Arial', sz: 15, c: '#888888' });
        else if (x.t === 'br') runs += '<w:r><w:br/></w:r>';
        else if (x.t === 'p') runs += wRun(x.s, { c: col(x.c), sz: textSz(b) });
        else runs += wRun(x.s, { c: col(x.c), sz: textSz(b), b: b.kind === 'h' }) + wRun(x.pu, { c: col(x.pc), sz: textSz(b) });
      }
      body += wP(runs, { jc: b.kind === 'h' ? 'center' : null, after: b.kind === 'L' ? 0 : 160 });
    }
    return body;
  }
  // interlinear: lay the text out once at A4 width (17 cm ≈ 643 px; 13 pt) and read off which words share a line
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-20000px;top:0;width:643px;visibility:hidden';
  box.innerHTML = `<style>${EXPORT_CSS}</style>` + exportHTML(blocks, o).replace('<h1>', '<h1 hidden>');
  document.body.append(box);
  const TW = 15;                                                        // twips per px
  const bEls = box.querySelectorAll('.b');
  blocks.forEach((b, bi) => {
    const el = bEls[bi]; const lines = []; let cur = null, lastTop = null, pendRef = '', pendPre = [];
    // walk the block's children in order: refs, words (.w or plain word spans), punctuation
    let k = 0;
    for (const x of b.items) {
      if (x.t === 'ref') { pendRef = x.s; continue; }
      if (x.t === 'br') { lastTop = null; continue; }
      if (x.t === 'p' && !x.s.trim()) continue;
      if (x.t === 'p') { if (cur && lastTop !== null) cur.cells[cur.cells.length - 1].post.push(x); else pendPre.push(x); continue; }
      const we = el.querySelectorAll('.w')[k++];                         // the measured word
      const r = we ? we.getBoundingClientRect() : { top: 0, width: 40 };
      if (lastTop === null || Math.abs(r.top - lastTop) > 4) { cur = { ref: '', cells: [] }; lines.push(cur); lastTop = r.top; }
      if (pendRef) { cur.ref = cur.ref || pendRef; pendRef = ''; }
      cur.cells.push({ x, pre: pendPre, post: [], w: Math.ceil(r.width) + 6 }); pendPre = [];
    }
    for (const ln of lines) {
      const cells = [];
      const refW = 3.2 * 17;                                            // the reference column (≈ 3.2 em)
      cells.push(`<w:tc><w:tcPr><w:tcW w:w="${Math.round(refW * TW)}" w:type="dxa"/></w:tcPr>${wP(wRun(ln.ref, { font: 'Arial', sz: 15, c: '#888888' }))}</w:tc>`);
      for (const c of ln.cells) {
        const x = c.x;
        let first = c.pre.map(p => wRun(p.s, { c: col(p.c), sz: textSz(b) })).join('') + wRun(x.s, { c: col(x.c), sz: textSz(b), b: b.kind === 'h' })
          + wRun(x.pu, { c: col(x.pc), sz: textSz(b) }) + c.post.map(p => wRun(p.s, { c: col(p.c), sz: textSz(b) })).join('');
        let ps = wP(first);
        if (o.gram && x.gram) ps += wP(wRun(x.gram, { font: 'Arial', sz: 14, c: '#777777' }));
        if (o.gloss) for (const g of x.gloss) for (const line of g.s.split('\n')) ps += wP(wRun(line, { font: 'Arial', sz: 16, c: g.dg ? '#777777' : '#2E5A7A', i: g.dg }));
        cells.push(`<w:tc><w:tcPr><w:tcW w:w="${c.w * TW}" w:type="dxa"/></w:tcPr>${ps}</w:tc>`);
      }
      const grid = [Math.round(refW * TW), ...ln.cells.map(c => c.w * TW)];
      body += `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${b.kind === 'h' ? '<w:jc w:val="center"/>' : ''}<w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid.map(g => `<w:gridCol w:w="${g}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cells.join('')}</w:tr></w:tbl>`;
      body += wP(wRun(' ', { sz: 8 }), { after: 40 });                  // keeps the line tables apart (Word would merge them)
    }
    body += wP(wRun(' ', { sz: 8 }), { after: b.kind === 'L' ? 0 : 120 });
  });
  box.remove();
  return body;
}
async function exportDocx(blocks, o) {
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${exportDocxBody(blocks, o)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', doc]];
  return zipFiles(files.map(([n, s]) => [n, new TextEncoder().encode(s)]));
}
// a minimal ZIP writer, enough for a .docx (compressed where the browser can, otherwise stored)
async function zipFiles(files) {
  const out = [];
  for (const [name, data] of files) {
    let z = null;
    try { if (typeof CompressionStream !== 'undefined') z = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); } catch (_) { z = null; }
    out.push([name, data, z]);
  }
  return zipStore(out);
}
function zipStore(files) {
  const crcT = zipStore.t ??= Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = d => { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = crcT[(c ^ d[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const parts = [], central = []; let off = 0;
  for (const [name, raw, z] of files) {
    const nm = new TextEncoder().encode(name), c = crc(raw), data = z || raw, meth = z ? 8 : 0;
    const lh = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, meth, 2], [10, 0, 2], [12, 0x21, 2], [14, c, 4], [18, data.length, 4], [22, raw.length, 4], [26, nm.length, 2], [28, 0, 2]]
      .forEach(([p, v, n]) => n === 4 ? lh.setUint32(p, v, true) : lh.setUint16(p, v, true));
    parts.push(lh, nm, data);
    const ch = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, meth, 2], [12, 0, 2], [14, 0x21, 2], [16, c, 4], [20, data.length, 4], [24, raw.length, 4], [28, nm.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, off, 4]]
      .forEach(([p, v, n]) => n === 4 ? ch.setUint32(p, v, true) : ch.setUint16(p, v, true));
    central.push(ch, nm);
    off += 30 + nm.length + data.length;
  }
  const csize = central.reduce((a, x) => a + x.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, csize, 4], [16, off, 4], [20, 0, 2]]
    .forEach(([p, v, n]) => n === 4 ? end.setUint32(p, v, true) : end.setUint16(p, v, true));
  return new Blob([...parts, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
async function exportDialog() {
  if (!S.text) return toast('Open a text first.');
  const O = S.exportOpts ??= { fmt: 'pdf', gloss: !document.body.classList.contains('nogloss'), gram: !!S.gram, colour: !!S.posOn, range: 'all', from: null, to: null };
  const R = exportRefs(), sel = S.exRange && S.exRange.text === S.text.id ? S.exRange : null;
  if (O.range === 'sel' && !sel) O.range = 'all';
  const cb = (n, on, label) => `<label class="sopt"><input type="checkbox" name="${n}"${on ? ' checked' : ''}> ${label}</label>`;
  const seg = (name, cur, opts) => `<div class="seg segr">${opts.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}"${v === cur ? ' checked' : ''}>${l}</label>`).join('')}</div>`;
  const opt = (r, j, cur) => `<option value="${j}"${j === cur ? ' selected' : ''}>${esc(r.s)}${r.lab ? ' – ' + esc(r.lab) : ''}</option>`;
  const fi = Math.min(O.from ?? 0, R.list.length - 1), ti = Math.min(O.to ?? R.list.length - 1, R.list.length - 1);
  const r = await dialog(`<h3>Export text</h3>
    <p class="hint small">${(S.exportLabel = '', esc(exportTitle()))} – as it is shown now.</p>
    <div class="srow"><span class="sl">Format</span><div class="sc">${seg('fmt', O.fmt, [['pdf', 'PDF'], ['html', 'HTML'], ['docx', 'Word']])}
      <small class="sh">PDF opens the print dialog – choose “Save as PDF” (iPad: share icon → Save to Files).</small></div></div>
    <div class="srow"><span class="sl">Range</span><div class="sc">${seg('range', O.range, [['all', 'Whole text'], ['ft', 'From – to'], ['sel', 'Selection']])}
      <div class="xr xr-ft">${R.list.length ? `<label>From ${R.kind.toLowerCase()} <select name="from">${R.list.map((x, j) => opt(x, j, fi)).join('')}</select></label>
        <label>to ${R.kind.toLowerCase()} <select name="to">${R.list.map((x, j) => opt(x, j, ti)).join('')}</select></label>` : '<small class="sh">This text has no reference points.</small>'}</div>
      <div class="xr xr-sel">${sel ? `<small class="sh">${(sel.b - sel.a + 1).toLocaleString('en')} words: ${esc(exportSelLabel(R.words, sel))}</small>` : '<small class="sh">No passage marked yet.</small>'}
        <button type="button" data-v="pick">${sel ? 'Mark again in the text …' : 'Mark in the text …'}</button></div></div></div>
    <div class="srow"><span class="sl">Include</span><div class="sc">${cb('gloss', O.gloss, 'Glosses')}${cb('gram', O.gram, 'Grammatical information')}${cb('colour', O.colour, 'Word-class colours')}</div></div>`,
    [['cancel', 'Cancel'], ['ok', 'Export']]);
  if (r.action === 'cancel') return;
  Object.assign(O, { fmt: r.data.fmt || 'pdf', gloss: r.data.gloss === 'on', gram: r.data.gram === 'on', colour: r.data.colour === 'on', range: r.data.range || 'all',
    from: r.data.from != null ? +r.data.from : O.from, to: r.data.to != null ? +r.data.to : O.to });
  if (r.action === 'pick') { O.range = 'sel'; return exportPickStart(); }
  const o = { gloss: O.gloss, gram: O.gram, colour: O.colour };
  let rng = null; S.exportLabel = '';
  if (O.range === 'ft' && R.list.length) {
    let f = R.list[O.from ?? 0], t = R.list[O.to ?? R.list.length - 1]; if (t.i < f.i) [f, t] = [t, f];
    rng = { a: f.i, b: t.end }; S.exportLabel = f === t ? f.s : `${f.s}–${t.s.replace(/^¶ /, '')}`;
  } else if (O.range === 'sel' && sel) { rng = sel; S.exportLabel = exportSelLabel(R.words, sel); }
  const blocks = exportModel(rng);
  if (O.fmt === 'pdf') { exportPrint(blocks, o); S.exportLabel = ''; return; }
  const base = exportTitle().replace(/[\\/:*?"<>|…]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'text';
  const blob = O.fmt === 'html' ? new Blob([await exportHTMLFile(blocks, o)], { type: 'text/html' }) : await exportDocx(blocks, o);
  S.exportLabel = '';
  const name = base + (O.fmt === 'html' ? '.html' : '.docx');
  const href = URL.createObjectURL(blob);
  // the file is saved by a tap on the link (on the iPad a download has to start from a tap)
  await dialog(`<h3>Export ready</h3><p>${esc(name)} (${mb(blob.size)})</p>`, [['link', 'Save file', { href, name }], ['cancel', 'Close']]);
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}

// ---------------------------------------------------------------- acknowledgements (☰ → Acknowledgements)
const ACKS = [
  ['Texts', [
    ['Perseus Digital Library – canonical-greekLit', 'https://github.com/PerseusDL/canonical-greekLit', 'Greek texts (TEI XML)', 'CC BY-SA 4.0'],
    ['Perseus Digital Library – canonical-latinLit', 'https://github.com/PerseusDL/canonical-latinLit', 'Latin texts (TEI XML)', 'CC BY-SA 4.0'],
    ['Open Greek and Latin – First1KGreek', 'https://github.com/OpenGreekAndLatin/First1KGreek', 'Greek texts of the first thousand years (TEI XML)', 'CC BY-SA 4.0'],
    ['Open Greek and Latin – csel-dev', 'https://github.com/OpenGreekAndLatin/csel-dev', 'Corpus Scriptorum Ecclesiasticorum Latinorum (TEI XML)', 'CC BY-SA 4.0'],
    ['Classical Language Toolkit (CLTK)', 'https://github.com/cltk/cltk', 'author dates and genres of the TLG canon, used for the library', 'MIT']]],
  ['Greek dictionaries and analysis', [
    ['Eulexis (Ph. Roelli, Chaeréphon / A. Charbonnet, J.-P. Woitrain, Ph. Verkerk)', 'https://github.com/PhVerkerk/Eulexis_off_line', 'W. Pape, Handwörterbuch der griechischen Sprache (3rd ed. 1914); Liddell–Scott–Jones, A Greek–English Lexicon (9th ed.); Greek word-form analyses', 'GNU GPL v3'],
    ['Morpheus (Perseus Project) and Diogenes', 'https://github.com/perseids-tools/morpheus', 'origin of the Greek morphological analyses in Eulexis', 'GPL'],
    ['GLAUx – the Greek corpus of Leuven (Alek Keersmaekers)', 'https://github.com/alekkeersmaekers/glaux', 'the reading of each word in context (lemma and grammatical form) for the Greek library texts – automatic analysis, partly manually checked treebanks', 'CC BY-SA 4.0 (some texts CC BY-NC-SA)'],
    ['Universal Dependencies – Ancient Greek PROIEL treebank', 'https://github.com/UniversalDependencies/UD_Ancient_Greek-PROIEL', 'preferred lemmata and word classes', 'CC BY-NC-SA 4.0'],
    ['Universal Dependencies – Ancient Greek Perseus treebank', 'https://github.com/UniversalDependencies/UD_Ancient_Greek-Perseus', 'preferred lemmata and word classes', 'CC BY-NC-SA 2.5']]],
  ['Latin dictionaries and analysis', [
    ['Perseus Digital Library – lexica', 'https://github.com/PerseusDL/lexica', 'C. T. Lewis & C. Short, A Latin Dictionary (1879); text provided by the Perseus Digital Library with funding from the National Endowment for the Humanities', 'CC BY-SA 4.0'],
    ['K. E. Georges, Ausführliches lateinisch-deutsches Handwörterbuch (8th ed. 1913) – TEI edition by Thibault Clérice', 'https://github.com/PonteIneptique/K-E-Georges-1913-TEI', 'Latin–German dictionary', 'public domain'],
    ['Collatinus (Yves Ouvrard, Philippe Verkerk)', 'https://github.com/biblissima/collatinus', 'Latin lemmatisation, inflection models, vowel lengths, short meanings (EN · DE · FR)', 'GNU GPL v3'],
    ['Whitaker’s Words (William Whitaker)', 'https://github.com/mk270/whitakers-words', 'Latin analysis and short English meanings', 'free for any use']]],
  ['Private dictionaries (only on devices where they were imported)', [
    ['H. Frisk, Griechisches etymologisches Wörterbuch (Leiden IEED edition)', 'https://ieed.ullet.net/friskL.html', 'Greek etymology', 'copyright – private use only'],
    ['A. Bailly, Dictionnaire grec-français, éd. 2020 Hugo Chávez (G. Gréco et al.)', 'https://creativecommons.org/licenses/by-nc-nd/4.0/', 'Greek–French dictionary', 'CC BY-NC-ND 4.0 – private use only']]],
  ['Font', [
    ['Gentium Book Plus (SIL International)', 'https://software.sil.org/gentium/', 'type for Greek and Latin', 'SIL Open Font License 1.1']]],
];
async function acksDialog() {
  const a = (t, u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`;
  await dialog(`<h3>Acknowledgements</h3>
    <p class="hint small">This app is built on the work of these projects and editions. The packages it downloads are reformatted conversions of their data, shared under the same licences.</p>
    ${ACKS.map(([h, items]) => `<section class="dsec ack"><h4>${esc(h)}</h4><ul>${items.map(([t, u, what, lic]) => `<li>${a(t, u)}<br><small>${esc(what)} · <i>${esc(lic)}</i></small></li>`).join('')}</ul></section>`).join('')}`,
    [['cancel', 'Close']]);
}

// ---------------------------------------------------------------- events
function wire() {
  // marking a passage for the export: taps on words set the first and the last word (nothing else happens)
  $('#textBody').addEventListener('click', ev => {
    const p = S.exPick; if (!p) return;
    ev.stopPropagation(); ev.preventDefault();
    const w = ev.target.closest('.w'); if (!w) return;
    const i = +w.dataset.i;
    if (p.a == null || p.b != null) { p.a = i; p.b = null; } else { p.b = i; if (p.b < p.a) [p.a, p.b] = [p.b, p.a]; }
    exportPickPaint();
  }, true);
  document.addEventListener('click', ev => {
    const b = ev.target.closest('#exBar [data-xp]'); if (!b) return;
    const p = S.exPick; S.exPick = null; exportPickPaint();
    if (b.dataset.xp === 'ok' && p?.a != null) { S.exRange = { a: p.a, b: p.b ?? p.a, text: S.text?.id }; exportDialog(); }
  });
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
  let tipT = null, tipShown = false;
  document.addEventListener('pointerdown', ev => { const t = ev.target.closest?.('[data-tip]'); clearTimeout(tipT); tipShown = false; if (t) tipT = setTimeout(() => { tipShown = true; toast(t.dataset.tip, 3500); }, 500); }, true);
  for (const e of ['pointerup', 'pointercancel', 'pointermove']) document.addEventListener(e, ev => { if (e !== 'pointermove' || Math.abs(ev.movementX) + Math.abs(ev.movementY) > 4) clearTimeout(tipT); }, true);
  document.addEventListener('click', ev => { if (tipShown && ev.target.closest?.('[data-tip]')) { ev.stopPropagation(); ev.preventDefault(); tipShown = false; } }, true);
  document.addEventListener('contextmenu', ev => { if (ev.target.closest?.('[data-tip]')) ev.preventDefault(); }, true);
  $('#dictBody').addEventListener('click', async ev => {
    if (ev.target.closest('.tip')) return toast(ev.target.closest('.tip').dataset.tip, 3500);
    const chip = ev.target.closest('.chip');
    if (chip) { if (S.view.ti != null && S.text) return setTokChoice(S.view.ti, chip.dataset.lemma, null); S.view.lemma = chip.dataset.lemma; return renderView(); }
    const an = ev.target.closest('[data-ana]');
    if (an && S.view.ti != null) return setTokChoice(S.view.ti, S.view.pick, S.view.anaList[+an.dataset.ana]);
    if (ev.target.closest('[data-anareset]') && S.view.ti != null) return setTokChoice(S.view.ti, null);
    const pin = ev.target.closest('[data-pin]');
    if (pin) { const tk = S.view.ti != null ? S.tokens.find(t => t.t === 'w' && t.i === S.view.ti) : null;
      await put('choices', Object.assign({ f: canon(S.view.form), lemma: pin.dataset.pin }, tk?.anaSet && tk.lemma === pin.dataset.pin ? { ana: tk.ana } : {})); S.view.lemma = null; const f0 = canon(S.view.form); resetTokens(tk => canon(tk.s) === f0); await renderView(); resolveTokens(); renderText(); return; }
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
  $('#textPane').addEventListener('touchstart', () => { S.tTouch = true; S.tGuard = null; }, { passive: true });
  $('#textPane').addEventListener('touchend', () => { S.tTouch = false; }, { passive: true });
  $('#textPane').addEventListener('wheel', () => { S.tGuard = null; }, { passive: true });
  for (const ev of ['focusin', 'focusout']) $('#dictPane').addEventListener(ev, () => guardText(1200), true);
  $('#dictPane').addEventListener('pointerdown', ev => { if (ev.target.closest('.chip,[data-pin]')) guardText(); }, true);
  window.visualViewport?.addEventListener('resize', () => { const g = S.tGuard; if (g && Date.now() <= g.until && !S.tTouch) requestAnimationFrame(() => applyTextAnchor(g.a)); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveReadPos(); });
  $('#btnFwd').onclick = goFwd;
  $('#tabEntry').onclick = () => showTab('entry');
  $('#tabList').onclick = () => { showTab('list'); renderList(); };
  // when "Look up a word…" does not fit into the search box, a magnifying glass stands in for it
  { const sb = $('#search'), ph = sb.placeholder, cv = document.createElement('canvas').getContext('2d');
    const fit = () => {
      const cs = getComputedStyle(sb); cv.font = `${cs.fontSize} ${cs.fontFamily}`;
      const room = sb.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const ok = cv.measureText(ph).width + 8 <= room;                 // a little room to spare (Safari draws a bit wider)
      sb.placeholder = ok ? ph : ''; sb.classList.toggle('phicon', !ok);
    };
    // Safari does not count an empty placeholder as shown, so emptiness is marked by a class of its own
    const filled = () => sb.classList.toggle('filled', !!sb.value);
    sb.addEventListener('input', filled); sb.addEventListener('change', filled); filled();
    new ResizeObserver(fit).observe(sb); document.fonts?.ready.then(fit); }
  $('#search').addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.value.trim()) { showWord(ev.target.value.trim()); ev.target.blur(); } });
  $('#btnGlossToggle').onclick = () => setGlossVisible(document.body.classList.contains('nogloss'), true);
  $('#btnGram').onclick = () => setGram(!S.gram, true);
  document.addEventListener('click', ev => {          // joined switches in Settings
    const b = ev.target.closest('[data-setk]'); if (!b) return;
    const k = b.dataset.setk, v = b.dataset.setv;
    b.parentElement.querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    if (k === 'theme') setTheme(v, true);
    if (k === 'glossMode') { S.glossMode = v; setting('glossMode', v); renderText(); }
  });
  $('#btnPos').onclick = async () => { if (S.posHeld) { S.posHeld = false; return; } S.posOn = !S.posOn; await setting('posOn', S.posOn); applyPosColors(); };
  { let t = null; const bp = $('#btnPos');          // hold the Colours button: the list of word-class colours
    bp.addEventListener('pointerdown', () => { S.posHeld = false; clearTimeout(t); t = setTimeout(() => { S.posHeld = true; bp.classList.add('held'); }, 550); });
    bp.addEventListener('pointerup', () => {           // opened only when the finger is lifted: nothing beneath it gets selected
      clearTimeout(t); if (!S.posHeld) return; bp.classList.remove('held');
      setTimeout(() => { window.getSelection()?.removeAllRanges(); posDialog(); setTimeout(() => window.getSelection()?.removeAllRanges(), 60); }, 30);
    });
    for (const e of ['pointercancel', 'pointerleave']) bp.addEventListener(e, () => { clearTimeout(t); bp.classList.remove('held'); });
    bp.addEventListener('contextmenu', e => e.preventDefault()); }

  $('#btnSplit').onclick = cycleSplit;
  matchMedia('(orientation:portrait)').addEventListener('change', splitIcon);

  // three-bar menu for everything that is not part of reading itself
  const menu = $('#menu');
  $('#btnMenu').onclick = ev => { ev.stopPropagation(); menu.hidden = !menu.hidden; };
  document.addEventListener('click', ev => { if (!menu.hidden && !ev.target.closest('.menuwrap')) menu.hidden = true; });
  menu.addEventListener('click', ev => {
    const b = ev.target.closest('[data-m]'); if (!b) return;
    menu.hidden = true;
    ({ settings: settingsDialog, texts: importDialog, library: libraryDialog, dicts: dictsDialog, pos: posDialog, backup: pultDialog, pult: pultDialog, export: exportDialog, acks: acksDialog })[b.dataset.m]();
  });
  document.addEventListener('click', async ev => {
    const b = ev.target.closest?.('[data-dict-fold]'); if (!b) return;
    const id = b.dataset.dictFold, o = new Set(S.dictPrefs.open);
    o.has(id) ? o.delete(id) : o.add(id); S.dictPrefs.open = [...o];
    b.textContent = o.has(id) ? '▾ unfolded' : '▸ folded';
    await setting('dictPrefs', S.dictPrefs); if (S.view) renderView();
  });
  document.addEventListener('change', async ev => {
    const id = ev.target.dataset?.dictOn; if (!id) return;
    const off = new Set(S.dictPrefs.off); ev.target.checked ? off.delete(id) : off.add(id);
    S.dictPrefs.off = [...off]; if (!S.dictPrefs.order.length) S.dictPrefs.order = S.dicts.map(d => d.id);
    await setting('dictPrefs', S.dictPrefs); await loadDicts(); bucketCache.clear(); if (S.view) renderView();
    if (id === 'morph' || id === 'morphhints') { resetTokens(); renderText(); resolveTokens(); }
  });
  document.addEventListener('change', async ev => {
    const t = ev.target, on = t.dataset?.poson, c = t.dataset?.posc; if (!on && !c) return;
    const id = on || c; S.posCfg[id] = Object.assign({}, S.posCfg[id], on ? { on: t.checked } : { c: t.value });
    await setting('posCfg', S.posCfg); applyPosColors();
  });
  document.addEventListener('input', ev => { const c = ev.target.dataset?.posc; if (c) { S.posCfg[c] = Object.assign({}, S.posCfg[c], { c: ev.target.value }); applyPosColors(); } });
  document.addEventListener('click', async ev => {
    if (ev.target.closest('[data-info]')) { const b = ev.target.closest('[data-info]'), t = b.nextElementSibling; t.hidden = !t.hidden; b.setAttribute('aria-expanded', !t.hidden); ev.preventDefault(); return; }
    if (ev.target.closest('[data-posreset]')) { S.posCfg = defaultPosCfg(); await setting('posCfg', S.posCfg); applyPosColors();
      for (const [id] of POS) { const cb = document.querySelector(`[data-poson="${id}"]`), ci = document.querySelector(`[data-posc="${id}"]`); if (cb) cb.checked = true; if (ci) ci.value = S.posCfg[id].c; } }
  });
  document.addEventListener('toggle', ev => { if (ev.target.matches?.('details.scol')) S.colOpen = ev.target.open; }, true);
  document.addEventListener('change', ev => { const sl = ev.target.closest?.('select[data-langtool]'); if (sl) setLangTool(sl.dataset.langtool, sl.value); });
  document.addEventListener('change', async ev => {      // settings take effect immediately
    const k = ev.target.dataset?.set; if (!k || (ev.target.type === 'radio' && !ev.target.checked)) return;
    if (k === 'theme') setTheme(ev.target.value, true);
    if (k === 'latQuant') { S.latQuant = ev.target.checked; await setting('latQuant', S.latQuant); renderText(); }
    if (k === 'gramBtn') { S.gramBtn = ev.target.checked; await setting('gramBtn', S.gramBtn); if (!S.gramBtn) setGram(false, true); applyTopButtons(); }
    if (k === 'glossMode') { S.glossMode = ev.target.value; await setting('glossMode', S.glossMode); renderText(); }
  });
  document.addEventListener('change', ev => { if (ev.target.id === 'optSrcCol') { S.srcColors = ev.target.checked; setting('srcColors', S.srcColors); document.body.classList.toggle('nosrccol', !S.srcColors); } });
  $('#fileDict').onchange = ev => { const fs = [...ev.target.files]; ev.target.value = ''; if (fs.length) importFiles(fs); };
  $('#fileBackup').onchange = ev => { const f = ev.target.files[0]; ev.target.value = ''; if (f) restoreBackup(f); };
  document.addEventListener('change', async ev => {
    if (ev.target.id !== 'fileImport') return;
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
    const fm = $('#dlgForm');
    try {
      if (/\.json$/i.test(f.name)) {
        const j = JSON.parse(await f.text());
        if (j.format === 'greekdict-backup-1') { $('#dlg').close(); return restoreBackup(f); }
        if (j.format === 'greekdict-text-1') { fm.text.value = j.text; if (!fm.title.value) fm.title.value = j.title || ''; return; }
      }
      fm.text.value = await readTextFile(f);
      if (!fm.title.value) fm.title.value = f.name.replace(/\.[^.]+$/, '');
      toast(`${f.name} loaded`);
    } catch (e) { toast(`${f.name}: ${e.message}`, 4000); }
  });
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
  wireDictScroll();
  if (/Android/i.test(navigator.userAgent) || S.forceTouchSel) { document.body.classList.add('android'); wireTouchSelect(); }
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
  const fab = asDefault => { const t = S.lastSel; window.getSelection().removeAllRanges(); S.tsel = null; paintTsel(); S.sel = null; $('#fabBar').hidden = true; addGloss(t, asDefault, true); };
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
// grammatical information beneath each word (button in the top bar; whether the button is shown: Settings)
function setGram(on, save) {
  S.gram = on; document.body.classList.toggle('gram', on);
  $('#btnGram').classList.toggle('on', on); $('#btnGram').setAttribute('aria-pressed', on);
  if (save) setting('showGram', on);
}
function applyTopButtons() { $('#btnGram').hidden = !S.gramBtn; }
// "nom sg", "voc sg", "abl sg" -> "nom/voc/abl sg"; otherwise the first reading and how many more
function gramText(anas) {
  const clean = a => a.replace(/\b(pro|en)clitic\s+/g, '').replace(/indeclform\s*\((\w+)\)/, '$1').replace(/\s*\((?:attic|epic|doric|ionic|aeolic|homeric|poetic|later|late|koine|contr|unaugmented|[a-z]+ [a-z ]*)\)/gi, '').replace(/\s+/g, ' ').trim();
  const as = [...new Set((anas || []).map(clean).filter(Boolean))];
  if (as.length < 2) return as[0] || '';
  const t = as.map(a => a.split(' '));
  if (t.every(x => x.length === t[0].length)) {
    const diff = t[0].map((_, i) => new Set(t.map(x => x[i])).size > 1);
    if (diff.filter(Boolean).length === 1) { const i = diff.indexOf(true); return t[0].map((w, j) => j === i ? [...new Set(t.map(x => x[i]))].join('/') : w).join(' '); }
  }
  return `${as[0]} (+${as.length - 1})`;
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
  p.books.forEach((b, i) => bs.put(Object.assign({ k: p.id + '|' + i, blocks: b.blocks }, b.ann ? { ann: b.ann } : {})));
  t.objectStore('works').put({ id: p.id, author: p.author, authorId: p.authorId, title: p.title, greek: p.greekTitle, edition: p.edition,
    source: p.source, license: p.license, books: p.books.map(b => b.label), version, size: info.size, added: Date.now(),
    ...(p.annL ? { annL: p.annL, annSrc: p.annSrc } : {}) });
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
  return { id, work, bi, blocks: b.blocks, ann: b.ann, title: `${work.title} · ${work.books[bi]}` };
}
async function openWork(id, bi) {
  if (bi == null) bi = (await setting('wk|' + id)) ?? 0;
  return openText(`w:${id}:${bi}`);
}
// a request that gives up after a while: offline, iOS often lets requests hang instead of failing
function fetchT(url, opts = {}, ms = 6000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  return fetch(url, Object.assign({}, opts, { signal: ctl.signal })).finally(() => clearTimeout(t));
}
async function fetchCatalog() {
  if (S.catalog && S.catOnline) return S.catalog;
  try {
    const r = await fetchT('texts/catalog.json', { cache: 'no-cache' }); if (!r.ok) throw new Error();
    S.catalog = await r.json(); S.catOnline = true; setting('catalog', S.catalog);
  } catch (_) { S.catalog = S.catalog || (await setting('catalog')) || null; S.catOnline = false; }
  S.catWork = {}; S.catAuthor = {};
  if (S.catalog) for (const a of S.catalog.authors) for (const w of a.works) { S.catWork[w.id] = Object.assign(w, { author: a.name, authorId: a.id }); S.catAuthor[w.id] = a; }
  return S.catalog;
}
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯͅ]/g, '').replace(/ς/g, 'σ').toLowerCase();
const mb = b => b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' kB';
// ---- Library view: filters (highlighted when on) and sorting (arrow shows the direction)
const SORTS = [['author', 'Author', 1], ['title', 'Title', 1], ['date', 'Date', 1], ['recent', 'Recently opened', -1]];
// century slider: from the start of the 8th c. BC to the end of the 15th c. AD (years; 0 = start of the 1st c. AD)
const YMIN = -800, YMAX = 1500;
const ERAS = [['Archaic', -800, -500], ['Classical', -500, -323], ['Hellenistic', -323, -31], ['Imperial', -31, 300], ['Late Antique', 300, 600], ['Byzantine', 600, 1500]];
// favourites: a small flame (outline = not a favourite, filled = favourite)
const FLAME = '<svg class="flame" width="15" height="20" viewBox="6.4 0.8 11.2 15.2" aria-hidden="true"><g transform="translate(12 0) scale(.82 1) translate(-12 0)" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"><path class="fo" vector-effect="non-scaling-stroke" d="M12 15.2c-3.6-.6-5.6-2.6-5.4-5.4.1-1.6.9-2.6 1.6-3.6.1 1.4.6 2.3 1.3 2.7-.4-2.4.2-5 1.5-7.4.4 2.4 1.4 3.6 2.4 4.6.4-1.4 1-2.4 2-3.2-.3 1.8 0 3.2.8 4.4.5-.6.8-1.4.9-2.4 1 1.4 1.4 3 1.2 4.6-.3 3.1-2.4 5.2-6.3 5.7z"/><path class="fi" vector-effect="non-scaling-stroke" d="M12 15c-1.6-.4-2.4-1.4-2.3-2.8 0-.8.4-1.4.8-1.9.1.7.4 1.1.7 1.2-.1-1.2.3-2.4.9-3.4.3 1 .9 1.7 1.4 2.4.6.8.8 1.6.6 2.4-.2 1.1-1 1.8-2.1 2.1z"/></g></svg>';
function libView() {
  S.lib ??= {};
  if (S.lib.mine || S.lib.fav) S.lib.view ??= S.lib.mine ? 'mine' : 'fav';         // older settings: these were filters
  delete S.lib.mine; delete S.lib.fav;
  S.lib = Object.assign({ view: 'all', langs: [], src: [], form: [], from: YMIN, to: YMAX, undated: true, sort: 'author', dir: 1 }, S.lib);
  return S.lib;
}
const workLang = w => (w.lang === 'lat' || w.lang === 'la') ? 'la' : 'grc';
// the tabs (all / favourites / on this device) are views, not filters
const filtersOn = v => v.langs.length || v.src.length || v.form.length || v.from > YMIN || v.to < YMAX || !v.undated;
function centLabel(y, end) {           // year at a century boundary -> "5th c. BC"
  const ord = n => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th');
  const c = end ? (y <= 0 ? -y / 100 + 1 : y / 100) : (y < 0 ? -y / 100 : y / 100 + 1);
  return y < 0 || (end && y === 0) ? `${ord(Math.round(c))} c. BC` : `${ord(Math.round(c))} c. AD`;
}
const rangeLabel = v => `${centLabel(v.from)} – ${centLabel(v.to, true)}`;
function saveLibView() { setting('libView', S.lib); }
const authorOf = w => S.catAuthor?.[w.id] || { name: w.author || 'Unknown author', id: w.authorId, period: null, year: w.year ?? null, date: w.date || '' };
// imported texts as works of the library (source "Imported")
function impWork(t) {
  const lang = t.lang || detectLang(t.text || '');
  return { id: 'imp:' + t.id, tid: t.id, title: t.title, greek: '', author: t.author || '', authorId: 'imp|' + (t.author || ''), source: 'Imported', lang: lang === 'la' ? 'lat' : 'grc',
    words: ((t.text || '').match(new RegExp(WORD_TOKEN.source, 'g')) || []).length, verse: null, books: [t.title], imported: true, year: t.year ?? null, date: t.date || '', edition: t.edition || '', notes: t.notes || '', created: t.created };
}
function workPasses(w, q) {
  const v = libView(), a = authorOf(w);
  if (v.view === 'mine' && !S.libInst[w.id] && !w.imported) return false;
  if (v.view === 'fav' && !S.favs?.[w.id]) return false;
  if (v.langs.length && !v.langs.includes(workLang(w))) return false;
  if (v.src.length && !v.src.includes(w.source)) return false;
  if (v.form.length && w.verse != null && !v.form.includes(w.verse ? 'verse' : 'prose')) return false;
  if (a.year == null) { if (!v.undated) return false; }
  else if (a.year < v.from || a.year > v.to) return false;
  if (q && !fold(a.name).includes(q) && !fold(w.title + ' ' + (w.greek || '') + ' ' + w.id).includes(q)) return false;
  return true;
}
function libAuthors() {
  let base;
  if (S.catalog) base = S.catalog.authors;
  else { const by = {}; for (const w of Object.values(S.libInst)) (by[w.authorId] ??= { id: w.authorId, name: w.author, works: [] }).works.push(w); base = Object.values(by); }
  if (!S.impWorks?.length) return base;
  const by = {};
  for (const w of S.impWorks) (by[w.authorId] ??= { id: w.authorId, name: w.author || 'Unknown author', works: [], year: w.year, date: w.date, imported: true }).works.push(w);
  return base.concat(Object.values(by));
}
function libFilter(a) { const q = fold(S.libQ); return a.works.filter(w => workPasses(w, q)).sort((x, y) => (x.no ?? 0) - (y.no ?? 0) || x.title.localeCompare(y.title)); }
function chip(f, val, label) {
  const on = libView()[f].includes(val);
  return `<button type="button" class="chip2${on ? ' on' : ''}" data-f="${f}" data-val="${val}" aria-pressed="${on}">${esc(label)}</button>`;
}
// either/or choices as one joined switch: All | Greek | Latin
function seg(f, opts) {
  const cur = libView()[f][0] || '';
  return `<div class="seg" role="group">${opts.map(([val, label]) => `<button type="button" class="${cur === val ? 'on' : ''}" data-seg="${f}" data-val="${val}" aria-pressed="${cur === val}">${label}</button>`).join('')}</div>`;
}
function libTabsHTML() {
  const v = libView(), nf = Object.keys(S.favs || {}).length, ni = Object.keys(S.libInst || {}).length + (S.impWorks?.length || 0);
  const tab = (id, label, n) => `<button type="button" role="tab" class="${v.view === id ? 'on' : ''}" data-view="${id}" aria-selected="${v.view === id}">${label}${n != null ? ` <small>${n}</small>` : ''}</button>`;
  return tab('all', 'All') + tab('fav', FLAME + 'Favourites', nf) + tab('mine', 'On this device', ni);
}
function sortBarHTML() {
  const v = libView();
  return `<label class="sortsel">Sort <select id="libSortSel" aria-label="Sort by">${SORTS.map(([id, label]) => `<option value="${id}"${v.sort === id ? ' selected' : ''}>${label}</option>`).join('')}</select></label>`
    + `<button type="button" class="sortb dirb" data-dir="1" title="${v.dir > 0 ? 'Ascending – tap for descending' : 'Descending – tap for ascending'}" aria-label="${v.dir > 0 ? 'Ascending' : 'Descending'}"><span class="arr"><i class="${v.dir > 0 ? 'hi' : ''}">↑</i><i class="${v.dir < 0 ? 'hi' : ''}">↓</i></span></button>`;
}
function libSources() {
  const set = new Set(); for (const a of libAuthors()) for (const w of a.works) if (w.source) set.add(w.source);
  return [...set].sort((a, b) => a === 'Perseus' ? -1 : b === 'Perseus' ? 1 : a.localeCompare(b));
}
const yPct = y => ((y - YMIN) / (YMAX - YMIN) * 100);
const eraOf = y => (ERAS.find(([, a, b]) => y >= a && y < b) || ERAS[ERAS.length - 1])[0];
// the era names sit under the knobs (one combined name when the knobs are close together)
function eraLabelsHTML(v) {
  const a = yPct(v.from), b = yPct(v.to), ea = eraOf(v.from), eb = eraOf(Math.max(v.from, v.to - 1));
  const at = (p, t) => `<span style="left:${p.toFixed(2)}%;transform:translateX(-${p.toFixed(2)}%)">${esc(t)}</span>`;
  if (ea === eb) return at((a + b) / 2, ea);
  if (b - a < 30) return at((a + b) / 2, `${ea} – ${eb}`);
  return at(a, ea) + at(b, eb);
}
function libControlsHTML() {
  const v = libView();
  return `<div class="fhead"><b>Filters</b><button type="button" data-fdone="1">Close</button></div>
    <div class="fgrid">
      <span class="fl">Language</span>${seg('langs', [['', 'All'], ['grc', 'Greek'], ['la', 'Latin']])}
      <span class="fl">Source</span><div class="fchips">${libSources().map(x => chip('src', x, x)).join('')}</div>
      <span class="fl">Form</span>${seg('form', [['', 'All'], ['prose', 'Prose'], ['verse', 'Verse']])}
      <span class="fl">Date</span><div class="fdate"><span class="crange" id="centLabel">${rangeLabel(v)}</span>
        <label class="undl"><input type="checkbox" id="libUndated"${v.undated ? ' checked' : ''}> include undated</label></div>
      <span></span><div class="cslider" style="--a:${yPct(v.from).toFixed(2)}%;--b:${yPct(v.to).toFixed(2)}%">
        <div class="track"><i></i></div><b class="knob ka"></b><b class="knob kb"></b>
        <input type="range" id="centFrom" min="${YMIN}" max="${YMAX}" step="100" value="${v.from}" aria-label="From century">
        <input type="range" id="centTo" min="${YMIN}" max="${YMAX}" step="100" value="${v.to}" aria-label="To century">
        <div class="ticks">${ERAS.slice(1).map(([, a]) => `<i style="left:${yPct(a).toFixed(2)}%"></i>`).join('')}</div>
        <div class="eras" id="eraLab">${eraLabelsHTML(v)}</div>
      </div>
    </div>
    <div class="fbottom"><button type="button" class="linkb" data-freset="1"${filtersOn(v) ? '' : ' hidden'}>Reset filters</button><button type="button" class="fshow" data-fdone="1" id="libShowN">Show works</button></div>`;
}
// what is filtered, as small removable chips (while the filter panel is closed)
function libActiveHTML() {
  const v = libView(), out = [];
  const x = (label, f, val = '') => out.push(`<button type="button" class="chip2 on" data-unf="${f}" data-val="${esc(val)}" title="Remove this filter">${esc(label)} <span aria-hidden="true">×</span></button>`);
  for (const l of v.langs) x(l === 'la' ? 'Latin' : 'Greek', 'langs', l);
  for (const s of v.src) x(s, 'src', s);
  for (const f of v.form) x(f === 'verse' ? 'Verse' : 'Prose', 'form', f);
  if (v.from > YMIN || v.to < YMAX) x(rangeLabel(v), 'date');
  if (!v.undated) x('Dated works only', 'undated');
  if (out.length > 1) out.push('<button type="button" class="linkb" data-freset="1">Clear all</button>');
  return out.join('');
}
const DLICON = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/></g></svg>';
function workRowHTML(w, flat = false) {
  if (w.imported) return impRowHTML(w, flat);
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
function impRowHTML(w, flat) {
  const a = authorOf(w), op = S.opened?.[w.id], fav = !!S.favs?.[w.id];
  const who = (flat ? `${esc(a.name)}${w.date ? ' · ' + esc(w.date) : ''} · ` : (w.date ? esc(w.date) + ' · ' : '')) + (workLang(w) === 'la' ? 'Latin · ' : '');
  return `<div class="item" data-w="${w.id}"><button type="button" class="star${fav ? ' on' : ''}" data-star="${w.id}" title="${fav ? 'Remove from favourites' : 'Add to favourites'}" aria-pressed="${fav}">${FLAME}</button><span class="t"><b>${esc(w.title)}</b><br><small>${who}imported ${new Date(w.created).toLocaleDateString('en-GB')} · ${w.words.toLocaleString('en')} words${w.edition ? ' · ' + esc(w.edition) : ''}${op ? ' · opened ' + new Date(op).toLocaleDateString('en-GB') : ''}</small></span><button type="button" data-iopen="${w.tid}">Open</button><button type="button" data-iedit="${w.tid}">Edit</button><button type="button" class="danger" data-idel="${w.tid}">Delete</button></div>`;
}
// author row: name, below it the dates; the number of works and a download icon in columns of their own
function authorHTML(a, ws, open) {
  const inst = a.works.filter(w => S.libInst[w.id] || w.imported).length;
  const todo = S.catalog ? ws.filter(w => !w.imported && !S.libInst[w.id] && !DL.has('work:' + w.id)) : [];
  const all = todo.length ? `<button type="button" class="dlall" data-all="${a.id}" title="Download ${todo.length === 1 ? 'the work' : `all ${todo.length} works`} (${mb(todo.reduce((x, w) => x + w.bytes, 0))})" aria-label="Download ${todo.length === 1 ? 'the work' : `all ${todo.length} works`}">${DLICON}</button>` : '';
  const n = ws.length < a.works.length ? `${ws.length} of ${a.works.length}` : `${a.works.length} work${a.works.length > 1 ? 's' : ''}`;
  const sub = [a.date ? esc(a.date) : '', inst ? `<span class="ok">${inst} on this device</span>` : ''].filter(Boolean).join(' · ');
  return `<details class="auth" data-a="${a.id}"${open ? ' open' : ''}><summary><span class="t"><b>${esc(a.name)}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="wn">${n}</span><span class="dlc">${all}</span></summary><div class="works">${open ? ws.map(w => workRowHTML(w)).join('') : ''}</div></details>`;
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
    const filtering = filtersOn(v) || v.view === 'fav';
    for (const a of as) {
      const ws = libFilter(a); if (!ws.length) continue;
      n++; nw += ws.length;
      html += authorHTML(a, ws, S.libOpen.has(a.id) || v.view === 'mine' || (q && !fold(a.name).includes(q)) || (filtering && ws.length < 4 && n < 40));
    }
  } else {
    const ws = sortedWorks(); nw = ws.length;
    html = ws.slice(0, S.libLimit).map(w => workRowHTML(w, true)).join('')
      + (ws.length > S.libLimit ? `<div class="row" style="justify-content:center"><button type="button" data-more="1">Show more (${ws.length - S.libLimit} further)</button></div>` : '');
  }
  const cnt = `${nw.toLocaleString('en')} work${nw === 1 ? '' : 's'}`;
  $('#libCount').textContent = nw ? cnt + (v.sort === 'author' ? ` by ${n} author${n === 1 ? '' : 's'}` : '') : '';
  const sh = $('#libShowN'); if (sh) sh.textContent = nw ? `Show ${cnt}` : 'No works match';
  const empty = v.view === 'fav' && !Object.keys(S.favs || {}).length ? 'No favourites yet – tap the flame next to a work to add it.'
    : v.view === 'mine' && !Object.keys(S.libInst || {}).length ? 'Nothing downloaded yet.'
    : `Nothing found${S.libQ ? ' for “' + esc(S.libQ) + '”' : ''} with these filters.`;
  el.innerHTML = html || `<p class="hint">${empty}</p>`;
  el.scrollTop = st;
}
function renderLibControls() {
  const c = $('#libCtl'); if (c) c.innerHTML = libControlsHTML();
  const so = $('#libSort'); if (so) so.innerHTML = sortBarHTML();
  const tb = $('#libTabs'); if (tb) tb.innerHTML = libTabsHTML();
  filterIcon();
}
// the filter icon is highlighted while any filter is on; the active filters show as chips while the panel is closed
function filterIcon() {
  const b = $('#libFilterBtn'); if (!b) return;
  const open = !$('#libCtl').hidden;
  b.classList.toggle('active', !!filtersOn(libView())); b.classList.toggle('open', open);
  b.setAttribute('aria-expanded', open);
  const ac = $('#libActive'); if (ac) { ac.innerHTML = open ? '' : libActiveHTML(); ac.hidden = !ac.innerHTML; }
  document.body.classList.toggle('libsheet', open);
}
async function libraryDialog() {
  S.libOpen ??= new Set(); S.libQ ??= '';
  S.lib = S.lib || (await setting('libView')) || null; libView();
  S.opened = (await setting('opened')) || {};
  S.favs = (await setting('favs')) || {};
  const [cat, inst] = await Promise.all([fetchCatalog(), libWorks()]);
  S.impWorks = (await getAll('texts')).map(impWork);
  S.libInst = Object.fromEntries(inst.map(w => [w.id, w]));
  const tot = inst.reduce((a, w) => a + (w.size || 0), 0);
  // only when something is downloaded and the device may still clear it: a note that can be dismissed
  let note = '';
  try { if (inst.length && !(await navigator.storage?.persisted?.()) && !(await setting('persistNoteOff'))) note = '<div class="libnote" id="libNote"><span>Downloads are not yet protected: start the app from its Home Screen icon, so that the device does not clear them.</span><button type="button" data-notex="1" aria-label="Dismiss">×</button></div>'; } catch (_) { }
  dialog(`<h3>Library</h3>
    <div class="libtabs" id="libTabs" role="tablist">${libTabsHTML()}</div>
    <div class="libtop"><input type="search" id="libSearch" placeholder="Search authors and works (English, Latin or Greek)…" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(S.libQ)}">
      <button type="button" id="libFilterBtn" title="Filters" aria-label="Filters" aria-expanded="false"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5.5h12M6 18.5h12"/><rect x="3" y="4" width="3.2" height="16" rx="1.6"/><rect x="17.8" y="4" width="3.2" height="16" rx="1.6"/><path d="M9 9.2h6M9 12h4.6M9 14.8h3" stroke-width="1.3"/></g></svg></button></div>
    <div id="libActive" class="libactive" hidden></div>
    <div id="libCtl" class="libctl" hidden>${libControlsHTML()}</div>
    <div class="libbar"><span class="libcount" id="libCount"></span><span class="libsort" id="libSort">${sortBarHTML()}</span></div>
    ${note}
    <div class="list lib" id="libList"></div>
    ${!cat ? '<p class="hint">The catalogue could not be loaded (offline?). Downloaded works are listed below.</p>' : S.catOnline ? '' : '<p class="hint">Offline – showing the last known catalogue; downloads need a connection.</p>'}
    <small class="libfoot">${inst.length} work${inst.length === 1 ? '' : 's'} on this device${tot ? ` (≈ ${mb(tot)})` : ''}${S.impWorks.length ? ` · ${S.impWorks.length} imported` : ''}${cat ? ` · ${cat.authors.length} authors, ${Object.keys(S.catWork).length.toLocaleString('en')} works available` : ''}. ${info('Texts: Perseus Digital Library and Open Greek and Latin (☰ → Acknowledgements). Dates follow the TLG canon: author dates by century; a work is dated by its author.')}</small>`,
    [['cancel', 'Close']]).then(() => { document.body.classList.remove('libsheet'); S.libScroll = $('#libList')?.scrollTop || 0; });
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
    $('#centLabel').textContent = rangeLabel(v); $('#eraLab').innerHTML = eraLabelsHTML(v);
    clearTimeout(wireLibrary.ts); wireLibrary.ts = setTimeout(() => { saveLibView(); filterIcon(); S.libLimit = 250; renderLibList(); }, 120);
  });
  document.addEventListener('change', ev => {
    if (ev.target.id === 'centFrom' || ev.target.id === 'centTo') renderLibControls();
    else if (ev.target.id === 'libUndated' || ev.target.id === 'libSortSel') {
      const v = libView();
      if (ev.target.id === 'libUndated') v.undated = ev.target.checked;
      else { v.sort = ev.target.value; v.dir = SORTS.find(s => s[0] === v.sort)[2]; }
      S.libLimit = 250; saveLibView(); renderLibControls(); $('#libList').scrollTop = 0; renderLibList();
    }
  });
  document.addEventListener('toggle', ev => {
    const d = ev.target; if (!d.matches?.('#libList details.auth')) return;
    const id = d.dataset.a;
    if (d.open) { S.libOpen.add(id); const a = libAuthors().find(x => x.id === id); d.querySelector('.works').innerHTML = libFilter(a).map(w => workRowHTML(w)).join(''); }
    else S.libOpen.delete(id);
  }, true);
  document.addEventListener('click', async ev => {
    if (ev.target.closest('#libFilterBtn')) { $('#libCtl').hidden = !$('#libCtl').hidden; filterIcon(); return; }
    if (ev.target.closest('#libCtl [data-fdone]')) { $('#libCtl').hidden = true; filterIcon(); return; }
    if (ev.target.closest('#libNote [data-notex]')) { $('#libNote').remove(); setting('persistNoteOff', true); return; }
    const f = ev.target.closest('#libCtl [data-f]'), sg = ev.target.closest('#libCtl [data-seg]'), rs = ev.target.closest('[data-freset]'),
      dr = ev.target.closest('#libSort [data-dir]'), tb = ev.target.closest('#libTabs [data-view]'), un = ev.target.closest('#libActive [data-unf]');
    if (f || sg || rs || dr || tb || un) {
      const v = libView();
      if (f) { const arr = v[f.dataset.f], x = f.dataset.val, i = arr.indexOf(x); i < 0 ? arr.push(x) : arr.splice(i, 1); }
      if (sg) v[sg.dataset.seg] = sg.dataset.val ? [sg.dataset.val] : [];
      if (tb) v.view = tb.dataset.view;
      if (un) {
        const k = un.dataset.unf;
        if (k === 'date') Object.assign(v, { from: YMIN, to: YMAX });
        else if (k === 'undated') v.undated = true;
        else v[k] = v[k].filter(x => x !== un.dataset.val);
      }
      if (dr) v.dir = -v.dir;
      if (rs) Object.assign(v, { langs: [], src: [], form: [], from: YMIN, to: YMAX, undated: true });
      S.libLimit = 250; saveLibView(); renderLibControls(); $('#libList').scrollTop = 0; renderLibList(); return;
    }
    if (ev.target.closest('#libList [data-more]')) { S.libLimit += 500; renderLibList(); return; }
    const star = ev.target.closest('#libList [data-star]');
    if (star) {                                   // favourite on/off (kept in the backup)
      const id = star.dataset.star; S.favs ??= {};
      if (S.favs[id]) delete S.favs[id]; else S.favs[id] = Date.now();
      await setting('favs', S.favs);
      const on = !!S.favs[id]; star.classList.toggle('on', on); star.setAttribute('aria-pressed', on); star.title = on ? 'Remove from favourites' : 'Add to favourites';
      const tb = $('#libTabs'); if (tb) tb.innerHTML = libTabsHTML();
      if (libView().view === 'fav' && !on) renderLibList();
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
    const io = ev.target.closest('#libList [data-iopen]');
    if (io) { S.libScroll = $('#libList').scrollTop; $('#dlg').close(); return openText(+io.dataset.iopen); }
    const ie = ev.target.closest('#libList [data-iedit]');
    if (ie) { S.libScroll = $('#libList').scrollTop; await importDialog(await get('texts', +ie.dataset.iedit)); return libraryDialog(); }
    const id = ev.target.closest('#libList [data-idel]');
    if (id) {
      const t = await get('texts', +id.dataset.idel); S.libScroll = $('#libList').scrollTop;
      const c = await dialog(`<h3>Delete ${esc(t.title)}?</h3><p>The imported text and all its glosses are deleted from this device.</p>`, [['cancel', 'Cancel'], ['ok', 'Delete']]);
      if (c.action === 'ok') {
        for (const g of await req2p(tx('glosses').objectStore('glosses').index('textId').getAll(t.id))) await del('glosses', g.id);
        await del('texts', t.id); if (S.text?.id === t.id) await openText(null);
      }
      return libraryDialog();
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
    + (texts.length ? `<details data-k="mytexts"${isOpen('mytexts', !w) ? ' open' : ''}><summary><b>Imported texts</b> <small>${texts.length}</small></summary>${texts.map(x => `<div class="item"><span class="t">${esc(x.title)}</span><button type="button" data-nav="text:${x.id}"${x.id === t?.id ? ' class="on"' : ''}>Open</button></div>`).join('')}</details>` : '')
    + (!authors.length && !texts.length ? '<p class="hint">Nothing here yet – get texts from the Library, or import your own (☰ → Import text).</p>' : '') + '</div>';
  return html;
}
// text navigation: choosing a book, work or text opens it behind the menu; the menu stays open
async function navDialog() {
  const r = await dialog(`<div id="navBody">${await navHTML()}</div>`, [['library', 'Library'], ['texts', 'Import text'], ['cancel', 'Close']]);
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
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
  db = await openDB();
  await migrateOld();
  wire();
  setTheme((await setting('theme')) || 'dark');
  S.glossMode = (await setting('glossMode')) || 'replace';
  S.latQuant = !!(await setting('latQuant'));
  for (const r of await getAll('settings', IDBKeyRange.bound('lg|', 'lg|\uffff'))) S.lemmaGloss[r.k.slice(3)] = r.v;
  await loadDicts();
  setGlossVisible((await setting('showGloss')) !== false);
  S.gramBtn = (await setting('gramBtn')) !== false; applyTopButtons();
  setGram(S.gramBtn && !!(await setting('showGram')));
  const sp = await setting('split'); setSplit(sp || '50%', false);
  S.srcColors = (await setting('srcColors')) !== false; document.body.classList.toggle('nosrccol', !S.srcColors);
  S.posCfg = Object.assign(defaultPosCfg(), (await setting('posCfg')) || {});
  S.posOn = !!(await setting('posOn')); applyPosColors();
  const cur = await setting('currentText');
  if (cur != null) await openText(cur);
  if (!S.dicts.length) $('#dictBody').innerHTML = '<p class="hint">Welcome! <button id="btnFirstSync">Download the free dictionaries</button> (Greek: Pape, LSJ and morphology; Latin: Lewis &amp; Short, Georges and Collatinus – about 60 MB). More dictionaries: ☰ → Dictionaries. Then get a text via ☰ → Library, or import your own via ☰ → Import text.</p>';
  $('#btnFirstSync')?.addEventListener('click', () => syncPackages());
  navigator.storage?.persist?.().catch(() => { });
})();
