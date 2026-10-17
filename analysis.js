/* Pult – Word classes, importing dictionary packages, and looking words up (morphology, lemmas, readings).
   (see core.js for the order of the scripts) */
'use strict';
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
  // the word-class list is keyed by the lemma without vowel lengths, so formīdō (noun) and formīdo (verb) share an
  // entry: a "verb" there cannot be right for a reading with a case and no verb form – the reading decides
  const cased = a.length && a.every(x => /\b(nom|gen|dat|acc|voc|abl|loc)\b/.test(x));
  if (u && UPOS2[u] && !(cased && (u === 'VERB' || u === 'AUX'))) return UPOS2[u];
  if (cased && (u === 'VERB' || u === 'AUX')) return !isGreek(lemma) && a.some(x => /\b(masc|fem|neut)\b/.test(x)) ? 'adj' : 'noun';   // Latin nouns carry no gender in their readings
  const tag = a.map(x => (x.match(/indeclform \(([^)]+)\)/) || [])[1]).find(Boolean);
  if (tag) return { adverb: 'adv', particle: 'ptcl', conj: 'conj', prep: 'prep', article: 'article', numeral: 'num', exclam: 'ptcl' }[tag] || 'other';
  if (a.some(x => /\b(nom|gen|dat|acc|voc)\b/.test(x))) return 'noun';
  return 'other';
}
// ---- grammar line per word class (hold the Grammar button, or Settings → Appearance); three groups switch several at once
const GRAM_GROUPS = [['Inflected words', ['noun', 'proper', 'adj', 'article', 'pron', 'num']],
  ['Verb forms', ['verb', 'part', 'inf']], ['Indeclinable and other', ['adv', 'prep', 'conj', 'ptcl', 'other']]];
// shown by default: the inflected words except numerals, all verb forms, adverbs and prepositions
const GRAM_DEF = new Set(['noun', 'proper', 'adj', 'article', 'pron', 'verb', 'part', 'inf', 'adv', 'prep']);
const defaultGramCfg = () => Object.fromEntries(POS.filter(([id]) => id !== 'punct').map(([id]) => [id, GRAM_DEF.has(id)]));
const allGramCfg = () => Object.fromEntries(POS.filter(([id]) => id !== 'punct').map(([id]) => [id, true]));
function applyGramCfg() {
  const st = $('#gramStyle') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'gramStyle' }));
  st.textContent = Object.entries(S.gramCfg || {}).filter(([, on]) => !on).map(([id]) => `body.gram .w.p-${id}>.gm{visibility:hidden!important;max-width:0!important;padding:0!important;overflow:hidden;white-space:nowrap}`).join('\n');
}
// the word classes as buttons that switch on and off, under the names of their groups.
// Colourisation: the same, with each class's colour beside its button (Punctuation marks in the last group)
const posLab = id => (POS.find(x => x[0] === id) || [])[1] || id;
const COL_GROUPS = GRAM_GROUPS.map(([g, ids], i) => [g, i === GRAM_GROUPS.length - 1 ? [...ids, 'punct'] : ids]);
const posOnOf = id => S.posCfg[id]?.on !== false;
function chipGroupsHTML(kind) {
  const col = kind === 'pos', groups = col ? COL_GROUPS : GRAM_GROUPS, on = col ? posOnOf : id => !!S.gramCfg[id];
  return `<div class="chipcfg">` + groups.map(([g, ids], gi) => `<div class="cgrp"><div class="ghead">${g}</div><div class="chips">`
    + ids.map(id => col
      ? `<span class="cwrap"><button type="button" class="chip cchip" data-poson="${id}" aria-pressed="${on(id)}" style="--c:${S.posCfg[id]?.c}" title="Tap: on or off · hold: choose the colour">${posLab(id)}</button></span>`
      : `<button type="button" class="chip gchip" data-gramon="${id}" aria-pressed="${on(id)}">${posLab(id)}</button>`).join('')
    + `</div></div>`).join('') + `</div>`;
}
function gramRowsHTML() { return chipGroupsHTML('gram'); }
function syncGramRows(root = document) {
  for (const id of Object.keys(S.gramCfg)) root.querySelectorAll(`[data-gramon="${id}"]`).forEach(b => b.setAttribute('aria-pressed', !!S.gramCfg[id]));
}
function syncPosRows(root = document) {
  for (const [id] of POS) { root.querySelectorAll(`[data-poson="${id}"]`).forEach(b => b.setAttribute('aria-pressed', posOnOf(id))); root.querySelectorAll(`input[data-posc="${id}"]`).forEach(i => { i.value = S.posCfg[id]?.c; }); root.querySelectorAll(`[data-poson="${id}"]`).forEach(b => b.style.setProperty('--c', S.posCfg[id]?.c)); }
}
async function gramDialog() {
  const p = dialog(`<h3>Grammar line</h3><p class="hint small">Which words show their grammatical form beneath them. A group switches all its word classes at once.</p>
    <div class="gramcfg">${gramRowsHTML()}</div>`, [['gramall', 'Show for all'], ['cancel', 'Close']]);
  syncGramRows($('#dlgForm'));
  const r = await p;
  if (r.action === 'gramall') { S.gramCfg = allGramCfg(); await setting('gramCfg', S.gramCfg); applyGramCfg(); }
  if (!S.gram) setGram(true, true);
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
  if (run === resolveTokens.run && typeof placesForText === 'function') placesForText();
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
    const ic = indeclClass(tk, l, tk.gram); if (ic) { tk.pos = ic[0]; tk.gram = ic[1]; }
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
function applyAnnotation(t, toks = S.tokens) {
  const ws = toks.filter(tk => tk.t === 'w'), a = t.ann.a.split(' ');
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
  if (p.hw != null) { const t = ddb.transaction('b', 'readwrite'); t.objectStore('b').put({ b: '#hw', s: p.hw }); await done(t); }   // the headword list (search)
  { const keep = new Set(Object.keys(p.buckets)); if (p.hw != null) keep.add('#hw'); const t = ddb.transaction('b', 'readwrite'); const os = t.objectStore('b');
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
  // user's order and on/off choice (menu ☰ → Instruments → Dictionaries); new dictionaries go to the end, switched on
  S.dictPrefs = Object.assign({ order: [], off: [], locked: [], open: [] }, (await setting('dictPrefs')) || {});
  const pos = id => { const i = S.dictPrefs.order.indexOf(id); return i < 0 ? 1e6 : i; };
  S.dicts.sort((a, b) => pos(a.id) - pos(b.id));
  S.shown = S.dicts.filter(d => !S.dictPrefs.off.includes(d.id));
  // analysis tools: installed (…Inst) and in use (switched on)
  const on = d => d && !S.dictPrefs.off.includes(d.id) ? d : null;
  S.morphInst = all.find(d => d.kind === 'morph') || null; S.morph = on(S.morphInst);
  S.hintsInst = all.find(d => d.kind === 'morphhints') || null; S.hints = on(S.hintsInst);
  S.latMorphs = all.filter(d => d.kind === 'latmorph').sort((a, b) => a.id.localeCompare(b.id));
  S.latMorphInst = S.latMorphs[0] || null; S.latMorph = S.latMorphs.find(d => on(d)) || null;     // the one chosen in ☰ → Instruments
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
