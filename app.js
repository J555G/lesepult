/* Greek Reader – offline reader with a composite dictionary and interlinear glosses.
   All data (dictionaries, texts, glosses, settings) is stored on the device in IndexedDB.
   Dictionary packages (*.gdpkg.gz) are produced by the greekdict toolkit (python gd.py packages). */
'use strict';

// ---------------------------------------------------------------- utilities
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const GREEK_TOKEN = /[Ͱ-Ͽἀ-῿][Ͱ-Ͽἀ-῿̀-ͯ]*[ʼ’'᾽]?/g;
const ELISION = /[ʼ'᾽]/g;
function canon(s) {               // exact form: circumflex fixed, grave -> acute, elision mark unified, lower case
  return s.normalize('NFD').replace(/̃/g, '͂').replace(/̀/g, '́').normalize('NFC').replace(ELISION, '’').toLowerCase();
}
function gkey(s) {                // accent-insensitive key
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
const DB_NAME = 'greekdict', DB_VER = 2;
let db;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const d = r.result, have = n => d.objectStoreNames.contains(n);
      for (const old of ['entries', 'mentions', 'morph', 'dicts']) if (have(old)) d.deleteObjectStore(old);
      d.createObjectStore('dicts', { keyPath: 'id' });
      d.createObjectStore('buckets', { keyPath: 'b' });     // "<dict>|<key prefix>" -> {e:[entries], m:{key:[[key,id]]}} or morph {f, p}
      if (!have('texts')) d.createObjectStore('texts', { keyPath: 'id', autoIncrement: true });
      if (!have('glosses')) d.createObjectStore('glosses', { keyPath: 'id', autoIncrement: true }).createIndex('textId', 'textId');
      if (!have('choices')) d.createObjectStore('choices', { keyPath: 'f' });
      if (!have('settings')) d.createObjectStore('settings', { keyPath: 'k' });
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
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
  rangeMode: false,
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
  ['num', 'Numeral', '#555599'], ['other', 'Other / unknown', '#666666'],
];
const UPOS2 = { NOUN: 'noun', PROPN: 'proper', ADJ: 'adj', PRON: 'pron', DET: 'pron', VERB: 'verb', AUX: 'verb', ADV: 'adv',
  ADP: 'prep', CCONJ: 'conj', SCONJ: 'conj', PART: 'ptcl', INTJ: 'ptcl', NUM: 'num' };
const PARTICLES = new Set(['γαρ', 'δε', 'μεν', 'τε', 'γε', 'δη', 'αν', 'ουν', 'τοι', 'περ', 'που', 'πω', 'μην', 'αρα', 'ου', 'ουκ', 'ουχ', 'μη', 'δητα', 'τοινυν', 'τοιγαρ', 'γουν', 'καιτοι', 'μεντοι', 'ουκουν', 'ω']);
function posOf(lemma, anas) {
  const k = gkey(lemma || '');
  if (k === 'ο') return 'article';
  if (PARTICLES.has(k)) return 'ptcl';
  const a = anas || [];
  if (a.some(x => /\bpart\b/.test(x))) return 'part';
  if (a.some(x => /\b(ind|subj|opt|imperat)\b/.test(x))) return 'verb';
  if (a.some(x => /\binf\b/.test(x))) return 'inf';
  if (lemma && lemma[0] !== lemma[0].toLowerCase()) return 'proper';
  const u = S.lemmapos[k];
  if (u && UPOS2[u]) return UPOS2[u];
  const tag = a.map(x => (x.match(/indeclform \(([^)]+)\)/) || [])[1]).find(Boolean);
  if (tag) return { adverb: 'adv', particle: 'ptcl', conj: 'conj', prep: 'prep', article: 'article', numeral: 'num', exclam: 'ptcl' }[tag] || 'other';
  if (a.some(x => /\b(nom|gen|dat|acc|voc)\b/.test(x))) return 'noun';
  return 'other';
}
function applyPosColors() {
  const st = $('#posStyle') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'posStyle' }));
  st.textContent = !S.posOn ? '' : POS.filter(([id]) => S.posCfg[id]?.on !== false)
    .map(([id]) => `body.pos .w.p-${id}>.g{color:${S.posCfg[id]?.c || '#000'}}`).join('\n');
  document.body.classList.toggle('pos', S.posOn);
  $('#chkPos').checked = S.posOn;
}
async function resolveTokens() {      // lemma + word class for every word of the text
  const run = (resolveTokens.run = (resolveTokens.run || 0) + 1);
  let changed = false;
  for (const tk of S.tokens) {
    if (tk.t !== 'w' || tk.lemma !== undefined) continue;
    const A = await analyses(tk.s);
    if (run !== resolveTokens.run) return;           // a newer run has started
    const l = A.pick; const x = A.lemmas.find(z => z.lemma === l);
    tk.lemma = l || null; tk.pos = posOf(l, x?.ana);
    const el = document.querySelector(`.w[data-i="${tk.i}"]`);
    el?.classList.add('p-' + tk.pos);
    if (l && S.lemmaGloss[gkey(l)]) changed = true;
  }
  if (changed) renderText();
}
function resetTokens(pred = () => true) { for (const tk of S.tokens) if (pred(tk)) { delete tk.lemma; delete tk.pos; } }
const classifyTokens = resolveTokens;

// ---------------------------------------------------------------- package import
async function readPackage(file) {
  let stream = file.stream();
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unpack .gz files – please update iPadOS.');
    stream = stream.pipeThrough(new DecompressionStream('gzip'));
  }
  return JSON.parse(await new Response(stream).text());
}
async function bulkPut(store, items, onProgress, chunk = 2000) {
  for (let i = 0; i < items.length; i += chunk) {
    const t = tx(store, 'readwrite'); const os = t.objectStore(store);
    for (const it of items.slice(i, i + chunk)) os.put(it);
    await done(t); onProgress && onProgress(Math.min(1, (i + chunk) / items.length));
  }
}
async function deleteDict(id) {
  const t = tx(['buckets', 'dicts'], 'readwrite');
  t.objectStore('buckets').delete(IDBKeyRange.bound(id + '|', id + '|￿'));
  t.objectStore('dicts').delete(id);
  await done(t); bucketCache.clear();
}
async function importPackage(file, progress) {
  const p = await readPackage(file);
  if (p.format !== 'greekdict-pkg-2') throw new Error(file.name + ': not a (current) dictionary package');
  await deleteDict(p.id);
  const items = Object.entries(p.buckets).map(([b, v]) => Object.assign({ b: p.id + '|' + b }, v));
  progress(0, `${p.name}: ${p.count.toLocaleString('en')} ${p.kind === 'morph' ? 'forms' : 'entries'} …`);
  await bulkPut('buckets', items, x => progress(x), 300);
  if (p.lemmapos) await setting('lemmapos', p.lemmapos);
  await put('dicts', { id: p.id, kind: p.kind, name: p.kind === 'morph' ? 'Morphological analysis' : p.name, title: p.title, lang: p.lang,
                       order: p.order ?? 99, source: p.source, count: p.count, split: p.split });
}
async function loadDicts() {
  const all = await getAll('dicts');
  S.morph = all.find(d => d.kind === 'morph') || null;
  for (const d of all) d.splitSet = new Set(d.split || []);
  S.dicts = all.filter(d => d.kind === 'dictionary').sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));
  S.lemmapos = (await setting('lemmapos')) || {};
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
  const id = dict.id + '|' + bucketOf(k, dict.splitSet);
  if (bucketCache.has(id)) return bucketCache.get(id);
  const r = await get('buckets', id) || null;
  bucketCache.set(id, r); if (bucketCache.size > 300) bucketCache.delete(bucketCache.keys().next().value);
  return r;
}

// ---------------------------------------------------------------- lookup
async function analyses(form) {
  const f = canon(form);
  const m = async x => { if (!S.morph) return null; const b = await bucket(S.morph, gkey(x)); return b?.f?.[x] ? { a: b.f[x], p: b.p?.[x] } : null; };
  let r = await m(f);
  if (!r) { const f2 = stripSecondAccent(f); if (f2) r = await m(f2); }
  const choice = await get('choices', f);
  const lemmas = [];
  for (const [l, a] of (r?.a || [])) {
    let x = lemmas.find(z => z.lemma === l); if (!x) lemmas.push(x = { lemma: l, ana: [] });
    x.ana.push(a);
  }
  const pick = choice?.lemma || r?.p || lemmas[0]?.lemma || null;
  return { f, lemmas, pick, chosen: !!choice };
}
async function entriesFor(k) {
  const by = {};
  for (const d of S.dicts) {
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
function tokenize(text) {
  const toks = []; let last = 0, wi = 0;
  text = text.normalize('NFC');
  for (const m of text.matchAll(GREEK_TOKEN)) {
    if (m.index > last) toks.push({ t: 'p', s: text.slice(last, m.index) });
    toks.push({ t: 'w', s: m[0], i: wi++ });
    last = m.index + m[0].length;
  }
  if (last < text.length) toks.push({ t: 'p', s: text.slice(last) });
  return toks;
}
function renderText() {
  const body = $('#textBody');
  if (!S.text) { body.innerHTML = '<p class="hint">No text yet. Open the menu ☰ (top left) → Texts to paste or load a text.</p>'; return; }
  const gl = {}; for (const g of S.glosses) (gl[g.s] ??= []).push(g);
  const covered = new Set(); for (const g of S.glosses) for (let i = g.s; i <= g.e; i++) covered.add(i);
  let html = '<div class="para">';
  const toks = S.tokens;
  for (let n = 0; n < toks.length; n++) {
    const tk = toks[n];
    if (tk.t === 'p') {
      const s0 = tk.glued ? tk.s.slice(tk.glued) : tk.s;
      if (!s0) continue;
      html += s0.split(/\n\s*\n/).map(p => esc(p).replace(/\n/g, '<br>')).join('</div><div class="para">');
      continue;
    }
    let gs = (gl[tk.i] || []).map(g => `<span data-g="${g.id}"${g.e > g.s ? ` title="gloss for ${g.e - g.s + 1} words"` : ''}>${g.e > g.s ? '⟨' : ''}${esc(g.t)}${g.e > g.s ? '⟩' : ''}</span>`).join('');
    if (!covered.has(tk.i) && tk.lemma) { const dg = S.lemmaGloss[gkey(tk.lemma)]; if (dg) gs = `<span class="dg" data-dg="${esc(gkey(tk.lemma))}" title="default gloss for ${esc(tk.lemma)}">${esc(dg)}</span>`; }
    // punctuation directly after the word stays on the same line as the word
    const nx = toks[n + 1]; let pu = '';
    if (nx && nx.t === 'p') { const m = nx.s.match(/^[^\sͰ-Ͽἀ-῿]+/); if (m) { pu = m[0]; nx.glued = pu.length; } }
    html += `<span class="w${covered.has(tk.i) ? ' glossed' : ''}${tk.pos ? ' p-' + tk.pos : ''}" data-i="${tk.i}"><span class="g">${esc(tk.s)}${pu ? `<span class="pu">${esc(pu)}</span>` : ''}</span><span class="gl">${gs}</span></span>`;
  }
  body.innerHTML = html + '</div>';
  markTarget();
  fillGlossBox();
}
function markTarget() {
  document.querySelectorAll('.w.cur,.w.rng').forEach(e => e.classList.remove('cur', 'rng'));
  if (!S.cur) return;
  const [s, e] = S.cur;
  for (let i = s; i <= e; i++) document.querySelector(`.w[data-i="${i}"]`)?.classList.add(e > s ? 'rng' : 'cur');
}
async function openText(id) {
  const t = id != null ? await get('texts', id) : null;
  S.text = t || null; S.cur = null;
  $('#textTitle').textContent = t ? t.title : 'no text';
  S.tokens = t ? tokenize(t.text) : [];
  S.glosses = t ? await req2p(tx('glosses').objectStore('glosses').index('textId').getAll(t.id)) : [];
  renderText();
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
  let h = `<div class="ent">${e.d === 'frisk' ? '' : `<div class="hw">${esc(e.h)}</div>`}${normalizeHTML(e.html)}`;
  if (e.r && depth < 3) {
    for (const ref of e.r) {
      if (seen.has(e.d + ':' + ref[1])) continue;
      const r = await entryByRef(e.d, ref); if (!r) continue;
      h += `<div class="ref"><div class="rl">→ see: ${esc(r.h)}</div>${await renderEntryHTML(r, depth + 1, seen)}</div>`;
    }
  }
  return h + '</div>';
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
  const A = await analyses(v.form);
  const lemma = v.lemma || A.pick || v.form;
  v.pick = lemma;
  const k = gkey(lemma);
  v.key = k;
  let h = `<div class="form">${esc(v.form)}</div>`;
  if (A.lemmas.length) {
    h += '<div class="anas">' + A.lemmas.map(x => `<button class="chip${x.lemma === lemma ? ' on' : ''}" data-lemma="${esc(x.lemma)}"><b>${esc(x.lemma)}</b><small>${esc(x.ana.slice(0, 4).join(' · '))}${x.ana.length > 4 ? ' …' : ''}</small></button>`).join('') + '</div>';
    if (A.lemmas.length > 1) h += `<div class="pin">${A.chosen && A.pick === lemma ? '★ default for this form' : `<button data-pin="${esc(lemma)}">★ always use ${esc(lemma)} for “${esc(A.f)}”</button>`}</div>`;
  } else if (S.morph) {
    h += '<p class="note">Form not found in the morphological analysis – looking up the form itself.</p>';
  }
  h += '<div id="glossbox" hidden></div>';
  const by = await entriesFor(k);
  const openSet = new Set((await setting('open|' + k)) || []);
  for (const d of S.dicts) {
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
  text = text.replace(/\s+/g, ' ').trim(); if (!text) return;
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
  if (!S.cur) return toast('First tap a word (or select a phrase with “Range”).');
  const words = S.tokens.filter(t => t.t === 'w' && t.i >= S.cur[0] && t.i <= S.cur[1]).map(t => t.s).join(' ');
  const l = targetLemma();
  const existing = spanGloss(S.cur[0], S.cur[1])?.t;
  const prefill = existing || (l && S.lemmaGloss[gkey(l)]) || '';
  const r = await dialog(`<h3>Gloss for <span class="gk">${esc(words)}</span></h3><input type="text" name="t" value="${esc(prefill)}" autocomplete="off">` +
    (l ? `<label class="opt"><input type="checkbox" name="def"${S.lastDefault ? ' checked' : ''}>Use as default gloss for <span class="gk">${esc(l)}</span> wherever it appears</label>` : ''),
    [['cancel', 'Cancel'], ['ok', 'Save']], 'ok');
  if (r.action === 'ok' && (r.data.t || '').trim()) { S.lastDefault = r.data.def === 'on'; addGloss(r.data.t, S.lastDefault); }
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
    d.showModal();
    const first = f.querySelector('input[type=text],textarea'); if (first) { first.focus(); first.select?.(); }
  });
}
async function textsDialog() {
  const texts = await getAll('texts');
  const list = texts.map(t => `<div class="item"><span class="t">${esc(t.title)} <small>${new Date(t.created).toLocaleDateString('en-GB')}</small></span><button type="button" data-v="open:${t.id}">Open</button><button type="button" data-v="del:${t.id}">✕</button></div>`).join('') || '<p class="hint">No texts yet.</p>';
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
async function dictsDialog() {
  await loadDicts();
  const m = S.morph;
  const rows = S.dicts.map(d => `<div class="item"><span class="t"><b>${esc(d.name)}</b> ${esc(d.title || '')}<br><small>${d.count.toLocaleString('en')} entries · ${esc(d.source || '')}</small></span><button type="button" data-v="del:${d.id}">✕</button></div>`).join('') +
    (m ? `<div class="item"><span class="t"><b>${esc(m.name)}</b><br><small>${m.count.toLocaleString('en')} forms · ${esc(m.source || '')}</small></span></div>` : '<p class="hint">Morphological analysis missing (morph.gdpkg.gz) – without it only dictionary forms are found.</p>');
  let est = ''; try { const e = await navigator.storage?.estimate?.(); if (e) est = `Storage used: ${(e.usage / 1e6).toFixed(0)} MB`; } catch (_) { }
  const r = await dialog(`<h3>Dictionaries</h3><div class="list">${rows || '<p class="hint">No dictionaries installed.</p>'}</div>
    <label class="opt"><input type="checkbox" id="optSrcCol"${S.srcColors ? ' checked' : ''}> Show the editors’ colour marks in Pape and LSJ</label>
    <p class="legend">${Object.entries(FONT_MEANING).map(([c, t]) => `<span class="fc" data-c="${c}">■</span> ${esc(t)}`).join('<br>')}</p><small>${est}</small>`,
    [['file', 'Import packages …', 'fileDict'], ['persist', 'Make storage permanent'], ['cancel', 'Close']]);
  if (r.action === 'persist') { const ok = await navigator.storage?.persist?.(); toast(ok ? 'Storage is permanent.' : 'The browser did not confirm permanent storage – add the app to the Home Screen.'); }
  if (r.action.startsWith('del:')) { await deleteDict(r.action.slice(4)); await loadDicts(); dictsDialog(); }
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
  const data = { format: 'greekdict-backup-1', date: new Date().toISOString(), texts: await getAll('texts'), glosses: await getAll('glosses'), choices: await getAll('choices'), lemmaGlosses: S.lemmaGloss };
  const href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const name = 'greek-reader-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  await dialog(`<h3>Backup</h3><p>Save your texts (${data.texts.length}), glosses (${data.glosses.length}), default glosses (${Object.keys(S.lemmaGloss).length}) and lemma choices as a file (e.g. in Files or iCloud), or restore them from a backup. Dictionaries are not included.</p>`,
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
      S.cur = g ? [g.s, g.e] : [i0, i0]; markTarget();
      const tk = S.tokens.find(t => t.t === 'w' && t.i === i0);
      S.hist = []; S.view = null; await showWord(tk.s, { ti: i0, lemma: tk.lemma || null });
      const inp = $(dg ? '#glossbox textarea[data-def]' : '#glossbox textarea[data-span]');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); inp.scrollIntoView({ block: 'nearest' }); }
      return;
    }
    const w = ev.target.closest('.w'); if (!w) return;
    const i = +w.dataset.i;
    if (S.rangeMode && S.cur) {
      S.cur = [Math.min(S.cur[0], i), Math.max(S.cur[1], i)];
      S.rangeMode = false; $('#btnRange').classList.remove('on'); markTarget(); return;
    }
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
    const inp = ev.target; const t = inp.value.replace(/\s+/g, ' ').trim();
    if (inp.dataset.span) { const [a, b] = inp.dataset.span.split(',').map(Number); await saveSpanGloss(a, b, t); renderText(); toast(t ? 'Gloss saved' : 'Gloss removed'); }
    if (inp.dataset.def) { await setDefaultGloss(inp.dataset.def, t); renderText(); toast(t ? 'Default gloss saved' : 'Default gloss removed'); }
    setTimeout(fillGlossBox, 0);
  });
  $('#dictBody').addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey && ev.target.matches('#glossbox textarea')) { ev.preventDefault(); ev.target.blur(); } });
  $('#dictBody').addEventListener('input', ev => { if (ev.target.matches('#glossbox textarea')) autoGrow(ev.target); });
  $('#dictBody').addEventListener('toggle', ev => { if (ev.target.matches?.('details.src')) saveOpenState(); }, true);
  $('#listBody').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-sort]'); if (b) { S.listSort = b.dataset.sort; return renderList(); }
    const r = ev.target.closest('.lrow'); if (!r) return;
    const pos = +r.dataset.pos; S.cur = [pos, pos]; markTarget();
    document.querySelector(`.w[data-i="${pos}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const tk = S.tokens.find(t => t.t === 'w' && t.i === pos);
    S.hist = []; S.view = null; await showWord(tk.s, { lemma: r.dataset.lemma, ti: pos });
  });
  $('#btnBack').onclick = goBack;
  $('#btnFwd').onclick = goFwd;
  $('#tabEntry').onclick = () => showTab('entry');
  $('#tabList').onclick = () => { showTab('list'); renderList(); };
  $('#search').addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.value.trim()) { showWord(ev.target.value.trim()); ev.target.blur(); } });
  $('#chkGloss').onchange = ev => { document.body.classList.toggle('nogloss', !ev.target.checked); setting('showGloss', ev.target.checked); };
  $('#chkPos').onchange = async ev => { S.posOn = ev.target.checked; await setting('posOn', S.posOn); applyPosColors(); };

  $('#btnAddGloss').onclick = () => writeGloss();
  $('#btnSplit').onclick = cycleSplit;
  matchMedia('(orientation:portrait),(max-width:760px)').addEventListener('change', splitIcon);
  $('#btnRange').onclick = () => {
    if (!S.cur) return toast('Tap the first word, then “Range”, then the last word.');
    S.rangeMode = !S.rangeMode; $('#btnRange').classList.toggle('on', S.rangeMode);
    if (S.rangeMode) toast('Now tap the last word of the phrase.');
  };
  // three-bar menu for everything that is not part of reading itself
  const menu = $('#menu');
  $('#btnMenu').onclick = ev => { ev.stopPropagation(); menu.hidden = !menu.hidden; };
  document.addEventListener('click', ev => { if (!menu.hidden && !ev.target.closest('.menuwrap')) menu.hidden = true; });
  menu.addEventListener('click', ev => {
    const b = ev.target.closest('[data-m]'); if (!b) return;
    menu.hidden = true;
    ({ theme: () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true), texts: textsDialog, dicts: dictsDialog, pos: posDialog, backup: backupDialog })[b.dataset.m]();
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
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection(); const txt = String(sel).trim();
    const inDict = sel.rangeCount && $('#dictPane').contains(sel.getRangeAt(0).commonAncestorContainer);
    if (txt && inDict) S.lastSel = txt;
    $('#fabBar').hidden = !(txt && inDict);
  });
  for (const id of ['#fabGloss', '#fabDefault']) $(id).addEventListener('pointerdown', ev => ev.preventDefault());
  const fab = asDefault => { const t = S.lastSel; window.getSelection().removeAllRanges(); $('#fabBar').hidden = true; addGloss(t, asDefault, true); };
  $('#fabGloss').onclick = () => fab(false);
  $('#fabDefault').onclick = () => fab(true);
  // divider drag
  const dv = $('#divider');
  dv.addEventListener('pointerdown', ev => {
    dv.setPointerCapture(ev.pointerId);
    const portrait = matchMedia('(orientation:portrait),(max-width:760px)').matches;
    const r = $('#panes').getBoundingClientRect();
    const mv = e => { const x = portrait ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width; setSplit(Math.min(85, Math.max(15, x * 100)).toFixed(1) + '%', false); };
    const up = () => { dv.removeEventListener('pointermove', mv); dv.removeEventListener('pointerup', up); setting('split', getSplit()); };
    dv.addEventListener('pointermove', mv); dv.addEventListener('pointerup', up);
  });
}
function setTheme(t, save) {
  document.documentElement.dataset.theme = t;
  $('#menu [data-m=theme]').textContent = t === 'dark' ? '☀ Light mode' : '☾ Dark mode';
  document.querySelector('meta[name=theme-color]').content = t === 'dark' ? '#2a2926' : '#efe9da';
  if (save) setting('theme', t);
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
  const f = Math.min(0.85, Math.max(0.15, parseFloat(getSplit()) / 100));
  const portrait = matchMedia('(orientation:portrait),(max-width:760px)').matches;
  const W = 30, H = 20, x0 = 1.5, x1 = W - 1.5, fx = x0 + (x1 - x0) * f, dip = 2;
  const p = [];
  p.push(`M${x0} 3 Q${(x0 + fx) / 2} 2 ${fx} ${3 + dip} Q${(fx + x1) / 2} 2 ${x1} 3`);          // top edges
  p.push(`M${x0} ${H - 3} Q${(x0 + fx) / 2} ${H - 4} ${fx} ${H - 3 + dip} Q${(fx + x1) / 2} ${H - 4} ${x1} ${H - 3}`); // bottom edges
  p.push(`M${x0} 3 V${H - 3} M${x1} 3 V${H - 3} M${fx} ${3 + dip} V${H - 3 + dip}`);         // outer edges + fold
  for (const y of [6.5, 9.5, 12.5, 15.5]) {                                                    // text lines
    if (fx - x0 > 5) p.push(`M${x0 + 2} ${y} L${fx - 1.8} ${y + dip * 0.6}`);
    if (x1 - fx > 5) p.push(`M${fx + 1.8} ${y + dip * 0.6} L${x1 - 2} ${y}`);
  }
  const g = `<path d="${p.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>`;
  b.innerHTML = portrait
    ? `<svg width="${H}" height="${W}" viewBox="0 0 ${H} ${W}" aria-hidden="true"><g transform="translate(${H} 0) rotate(90)">${g}</g></svg>`
    : `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${g}</svg>`;
  const pct = Math.round(f * 100);
  b.title = `Text ${pct < 40 ? '1/3' : pct > 60 ? '2/3' : '1/2'} – tap to change the split`;
}

// ---------------------------------------------------------------- start
(async function main() {
  db = await openDB();
  wire();
  setTheme((await setting('theme')) || 'dark');
  for (const r of await getAll('settings', IDBKeyRange.bound('lg|', 'lg|\uffff'))) S.lemmaGloss[r.k.slice(3)] = r.v;
  await loadDicts();
  const sg = await setting('showGloss'); if (sg === false) { $('#chkGloss').checked = false; document.body.classList.add('nogloss'); }
  const sp = await setting('split'); setSplit(sp || '50%', false);
  S.srcColors = (await setting('srcColors')) !== false; document.body.classList.toggle('nosrccol', !S.srcColors);
  S.posCfg = Object.assign(defaultPosCfg(), (await setting('posCfg')) || {});
  S.posOn = !!(await setting('posOn')); applyPosColors();
  const cur = await setting('currentText');
  if (cur != null) await openText(cur);
  if (!S.dicts.length) $('#dictBody').innerHTML = '<p class="hint">Welcome! Open the menu ☰ → Dictionaries → “Import packages …” and choose the *.gdpkg.gz files (Frisk, Pape, LSJ, Bailly, morphology). Then add a text via ☰ → Texts.</p>';
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
  navigator.storage?.persist?.().catch(() => { });
})();
