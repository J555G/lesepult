/* Griechisches Lesepult – offline reader with composite dictionary and interlinear glosses.
   All data (dictionaries, texts, glosses) is stored on the device in IndexedDB.
   Dictionary packages (*.gdpkg.gz) are produced by the greekdict toolkit (python gd.py packages). */
'use strict';

// ---------------------------------------------------------------- utilities
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const GREEK_TOKEN = /[Ͱ-Ͽἀ-῿][Ͱ-Ͽἀ-῿̀-ͯ]*[ʼ’'᾽]?/g;
const ELISION = /[ʼ'᾽]/g;
function nfdFix(s) { return s.normalize('NFD').replace(/̃/g, '͂'); }
function canon(s) {               // exact form: circumflex fixed, grave -> acute, elision mark unified, lower case
  return nfdFix(s).replace(/̀/g, '́').normalize('NFC').replace(ELISION, '’').toLowerCase();
}
function gkey(s) {                // accent-insensitive key
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ').replace(/[^Ͱ-Ͽ]/g, '');
}
function stripSecondAccent(f) {  // enclitic accent: αἴτιός -> αἴτιος, μεῖζόν -> μεῖζον
  const d = f.normalize('NFD'); const idx = [];
  for (let i = 0; i < d.length; i++) if (d[i] === '\u0301' || d[i] === '\u0342') idx.push(i);
  if (idx.length < 2 || d[idx[idx.length - 1]] !== '\u0301') return null;
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
  dicts: [],             // installed dictionaries, sorted by order
  hasMorph: false,
  text: null,            // {id,title,text}
  tokens: [],            // [{t:'w'|'p', s, i}]  i = word index
  glosses: [],
  cur: null,             // [start,end] word indices of the gloss target
  rangeMode: false,
  hist: [], view: null,  // dictionary navigation
  lastSel: '', listSort: 'pos',
};

// ---------------------------------------------------------------- package import
async function readPackage(file) {
  let stream = file.stream();
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Dieser Browser kann .gz nicht entpacken – bitte iPadOS aktualisieren.');
    stream = stream.pipeThrough(new DecompressionStream('gzip'));
  }
  const txt = await new Response(stream).text();
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
  const t = tx(['buckets', 'dicts'], 'readwrite');
  t.objectStore('buckets').delete(IDBKeyRange.bound(id + '|', id + '|\uffff'));
  t.objectStore('dicts').delete(id);
  await done(t); bucketCache.clear();
}
async function importPackage(file, progress) {
  const p = await readPackage(file);
  if (p.format !== 'greekdict-pkg-2') throw new Error(file.name + ': kein (aktuelles) Wörterbuch-Paket');
  await deleteDict(p.id);
  const items = Object.entries(p.buckets).map(([b, v]) => Object.assign({ b: p.id + '|' + b }, v));
  progress(0, `${p.name}: ${p.count.toLocaleString()} ${p.kind === 'morph' ? 'Formen' : 'Einträge'} …`);
  await bulkPut('buckets', items, x => progress(x), 300);
  await put('dicts', { id: p.id, kind: p.kind, name: p.name, title: p.title, lang: p.lang, order: p.order ?? 99,
                       source: p.source, count: p.count, split: p.split });
}
async function loadDicts() {
  const all = await getAll('dicts');
  S.morph = all.find(d => d.kind === 'morph') || null;
  S.hasMorph = !!S.morph;
  for (const d of all) d.splitSet = new Set(d.split || []);
  S.dicts = all.filter(d => d.kind === 'dictionary').sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));
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
  bucketCache.set(id, r); if (bucketCache.size > 200) bucketCache.delete(bucketCache.keys().next().value);
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
  if (!S.text) { body.innerHTML = '<p class="hint">Noch kein Text. Tippe oben links auf ☰, um einen Text einzufügen oder zu laden.</p>'; return; }
  const gl = {}; for (const g of S.glosses) (gl[g.s] ??= []).push(g);
  const covered = new Set(); for (const g of S.glosses) for (let i = g.s; i <= g.e; i++) covered.add(i);
  let html = '<div class="para">';
  const toks = S.tokens;
  for (let n = 0; n < toks.length; n++) {
    const tk = toks[n];
    if (tk.t === 'p') {
      const s0 = tk.glued ? tk.s.slice(tk.glued) : tk.s;
      if (!s0) continue;
      const parts = s0.split(/\n\s*\n/);
      html += parts.map(p => esc(p).replace(/\n/g, '<br>')).join('</div><div class="para">');
      continue;
    }
    const gs = (gl[tk.i] || []).map(g => `<span data-g="${g.id}" title="${g.e > g.s ? 'Glosse für ' + (g.e - g.s + 1) + ' Wörter' : ''}">${g.e > g.s ? '⟨' : ''}${esc(g.t)}${g.e > g.s ? '⟩' : ''}</span>`).join('');
    // punctuation directly after the word stays on the same line as the word
    const nx = toks[n + 1]; let pu = '';
    if (nx && nx.t === 'p') { const m = nx.s.match(/^[^\s\u0370-\u03FF\u1F00-\u1FFF]+/); if (m) { pu = m[0]; nx.glued = pu.length; } }
    html += `<span class="w${covered.has(tk.i) ? ' glossed' : ''}" data-i="${tk.i}"><span class="g">${esc(tk.s)}${pu ? `<span class="pu">${esc(pu)}</span>` : ''}</span><span class="gl">${gs}</span></span>`;
  }
  body.innerHTML = html + '</div>';
  markTarget();
}
function markTarget() {
  document.querySelectorAll('.w.cur,.w.rng').forEach(e => e.classList.remove('cur', 'rng'));
  if (!S.cur) { $('#target').innerHTML = ''; return; }
  const [s, e] = S.cur;
  for (let i = s; i <= e; i++) document.querySelector(`.w[data-i="${i}"]`)?.classList.add(e > s ? 'rng' : 'cur');
  const words = S.tokens.filter(t => t.t === 'w' && t.i >= s && t.i <= e).map(t => t.s).join(' ');
  $('#target').innerHTML = `Glosse geht an: <b>${esc(words)}</b>` + (e > s ? ` (${e - s + 1} Wörter)` : '');
}
async function openText(id) {
  const t = id != null ? await get('texts', id) : null;
  S.text = t || null; S.cur = null;
  $('#textTitle').textContent = t ? t.title : 'kein Text';
  S.tokens = t ? tokenize(t.text) : [];
  S.glosses = t ? await req2p(tx('glosses').objectStore('glosses').index('textId').getAll(t.id)) : [];
  renderText();
  if (t) await setting('currentText', t.id);
  if (!$('#listBody').hidden) renderList();
}

// ---------------------------------------------------------------- dictionary view
function wrapGreek(root) {      // make every Greek word in entries tappable
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    if (!/[Ͱ-Ͽἀ-῿]/.test(n.nodeValue) || n.parentElement.closest('.gw')) continue;
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
  let h = `<div class="ent">${e.d === 'frisk' ? '' : `<div class="hw">${esc(e.h)}</div>`}${e.html}`;
  if (e.r && depth < 3) {
    for (const ref of e.r) {
      if (seen.has(e.d + ':' + ref[1])) continue;
      const r = await entryByRef(e.d, ref); if (!r) continue;
      h += `<div class="ref"><div class="rl">→ Verweis auf: ${esc(r.h)}</div>${await renderEntryHTML(r, depth + 1, seen)}</div>`;
    }
  }
  return h + '</div>';
}
async function showWord(word, opts = {}) {
  // view = {form, lemma}; pushes to history unless replace
  if (S.view && !opts.replace) S.hist.push(S.view);
  S.view = { form: word, lemma: opts.lemma || null };
  $('#btnBack').disabled = !S.hist.length;
  showTab('entry');
  await renderView();
}
async function renderView() {
  const body = $('#dictBody'); const v = S.view; if (!v) return;
  if (!S.dicts.length) { body.innerHTML = '<p class="hint">Noch keine Wörterbücher installiert. Tippe oben auf „Wörterbücher“ und importiere die Pakete (*.gdpkg.gz).</p>'; return; }
  const A = await analyses(v.form);
  const lemma = v.lemma || A.pick || v.form;
  let h = `<div class="form">${esc(v.form)}</div>`;
  if (A.lemmas.length) {
    h += '<div class="anas">' + A.lemmas.map(x => `<button class="chip${x.lemma === lemma ? ' on' : ''}" data-lemma="${esc(x.lemma)}"><b>${esc(x.lemma)}</b><small>${esc(x.ana.slice(0, 4).join(' · '))}${x.ana.length > 4 ? ' …' : ''}</small></button>`).join('') + '</div>';
    if (A.lemmas.length > 1) h += `<div class="pin">${A.chosen && A.pick === lemma ? '★ Standard für diese Form' : `<button data-pin="${esc(lemma)}">★ ${esc(lemma)} immer für „${esc(A.f)}“</button>`}</div>`;
  } else if (S.hasMorph) {
    h += '<p class="note">Form nicht in der Formenanalyse – Suche nach der Form selbst.</p>';
  }
  const k = gkey(lemma);
  const by = await entriesFor(k);
  for (const d of S.dicts) {
    let inner = '', has = false;
    const ents = by[d.id] || [];
    if (ents.length) { has = true; for (const e of ents) inner += await renderEntryHTML(e); }
    else if (by[d.id + '#m']) {
      has = true; inner += `<p class="note">Kein eigenes Lemma – <i>${esc(lemma)}</i> wird unter folgenden Einträgen erwähnt:</p>`;
      const seen = new Set();
      for (const ref of by[d.id + '#m']) { const e = await entryByRef(d.id, ref); if (e && !seen.has(d.id + ':' + e.i)) inner += await renderEntryHTML(e, 0, seen); }
    }
    if (!has) inner = '<p class="none">– kein Eintrag –</p>';
    const open = await openState(d.id, has);
    h += `<details class="src${has ? '' : ' empty'}" data-d="${d.id}"${open ? ' open' : ''}><summary>${esc(d.name)} <small>${esc(d.title || '')}</small></summary>${inner}</details>`;
  }
  body.innerHTML = h;
  body.querySelectorAll('details.src').forEach(el => wrapGreek(el));
  body.scrollTop = 0; $('#dictPane').scrollTop = 0;
}
const srcOpen = {};
async function openState(id, has) { return has && srcOpen[id] !== false; }

// ---------------------------------------------------------------- lemma list for the current text
async function renderList() {
  const lb = $('#listBody');
  if (!S.text) { lb.innerHTML = '<p class="hint">Kein Text geöffnet.</p>'; return; }
  lb.innerHTML = '<p class="hint">Lemmata werden ermittelt …</p>';
  const map = new Map();
  for (const tk of S.tokens) {
    if (tk.t !== 'w') continue;
    const A = await analyses(tk.s);
    const l = A.pick || canon(tk.s);
    let x = map.get(l); if (!x) map.set(l, x = { lemma: l, pos: tk.i, forms: new Set(), n: 0, known: !!A.pick });
    x.forms.add(tk.s); x.n++;
  }
  let rows = [...map.values()];
  if (S.listSort === 'alpha') rows.sort((a, b) => gkey(a.lemma).localeCompare(gkey(b.lemma), 'el') || a.lemma.localeCompare(b.lemma));
  else rows.sort((a, b) => a.pos - b.pos);
  lb.innerHTML = `<div class="lhead">${rows.length} Lemmata · Sortierung: <button data-sort="pos" class="${S.listSort === 'pos' ? 'on' : ''}">Text</button><button data-sort="alpha" class="${S.listSort === 'alpha' ? 'on' : ''}">alphabetisch</button></div>` +
    rows.map(r => `<div class="lrow" data-lemma="${esc(r.lemma)}" data-pos="${r.pos}"><b>${esc(r.lemma)}</b><span>${esc([...r.forms].join(', '))}</span><em>${r.n}×${r.known ? '' : ' ?'}</em></div>`).join('');
}
function showTab(which) {
  $('#tabEntry').classList.toggle('on', which === 'entry'); $('#tabList').classList.toggle('on', which === 'list');
  $('#dictBody').hidden = which !== 'entry'; $('#listBody').hidden = which !== 'list';
}

// ---------------------------------------------------------------- glosses
async function addGloss(text) {
  if (!S.text) return toast('Zuerst einen Text öffnen.');
  if (!S.cur) return toast('Zuerst im Text auf das Wort tippen, zu dem die Glosse gehört.');
  text = text.replace(/\s+/g, ' ').trim(); if (!text) return;
  const g = { textId: S.text.id, s: S.cur[0], e: S.cur[1], t: text, created: Date.now() };
  g.id = await put('glosses', g);
  S.glosses.push(g); renderText(); toast('Glosse hinzugefügt');
}
async function editGloss(id) {
  const g = S.glosses.find(x => x.id === id); if (!g) return;
  const r = await dialog(`<h3>Glosse bearbeiten</h3><input type="text" name="t" value="${esc(g.t)}">`,
    [['delete', 'Löschen'], ['cancel', 'Abbrechen'], ['ok', 'Speichern']]);
  if (r.action === 'ok') { g.t = r.data.t.trim(); if (g.t) await put('glosses', g); }
  if (r.action === 'delete' || (r.action === 'ok' && !g.t)) { await del('glosses', g.id); S.glosses = S.glosses.filter(x => x.id !== g.id); }
  renderText();
}

// ---------------------------------------------------------------- dialogs
function dialog(inner, buttons = [['ok', 'OK']]) {
  return new Promise(res => {
    const d = $('#dlg'), f = $('#dlgForm');
    f.innerHTML = inner + '<div class="row">' + buttons.map(([v, l]) => `<button value="${v}">${l}</button>`).join('') + '</div>';
    d.onclose = () => { const data = Object.fromEntries(new FormData(f)); res({ action: d.returnValue, data }); };
    d.returnValue = 'cancel'; d.showModal();
    f.querySelector('input,textarea')?.focus();
  });
}
async function textsDialog() {
  const texts = await getAll('texts');
  const list = texts.map(t => `<div class="item"><span class="t">${esc(t.title)} <small>${new Date(t.created).toLocaleDateString()}</small></span><button value="open:${t.id}">Öffnen</button><button value="del:${t.id}">✕</button></div>`).join('') || '<p class="hint">Noch keine Texte.</p>';
  const r = await dialog(`<h3>Texte</h3><div class="list">${list}</div>`, [['new', 'Neuer Text (einfügen)'], ['file', 'Datei laden …'], ['cancel', 'Schließen']]);
  if (r.action.startsWith('open:')) return openText(+r.action.slice(5));
  if (r.action.startsWith('del:')) {
    const id = +r.action.slice(4);
    const c = await dialog('<h3>Text löschen?</h3><p>Der Text und alle seine Glossen werden gelöscht.</p>', [['cancel', 'Abbrechen'], ['ok', 'Löschen']]);
    if (c.action === 'ok') {
      const gl = await req2p(tx('glosses').objectStore('glosses').index('textId').getAll(id));
      for (const g of gl) await del('glosses', g.id);
      await del('texts', id); if (S.text?.id === id) await openText(null);
    }
    return textsDialog();
  }
  if (r.action === 'new') {
    const n = await dialog('<h3>Neuer Text</h3><input type="text" name="title" placeholder="Titel"><p></p><textarea name="text" placeholder="Griechischen Text hier einfügen …"></textarea>', [['cancel', 'Abbrechen'], ['ok', 'Speichern']]);
    if (n.action === 'ok' && n.data.text.trim()) await saveText(n.data.title.trim() || 'Text ' + new Date().toLocaleDateString(), n.data.text);
  }
  if (r.action === 'file') $('#fileText').click();
}
async function saveText(title, text, choices) {
  const id = await put('texts', { title, text, created: Date.now() });
  if (choices) for (const [f, lemma] of Object.entries(choices)) await put('choices', { f: canon(f), lemma });
  await openText(id); toast('Text gespeichert');
}
async function dictsDialog() {
  await loadDicts();
  const morph = S.morph;
  const rows = S.dicts.map(d => `<div class="item"><span class="t"><b>${esc(d.name)}</b> ${esc(d.title || '')}<br><small>${d.count.toLocaleString()} Einträge · ${esc(d.source || '')}</small></span><button value="del:${d.id}">✕</button></div>`).join('') +
    (morph ? `<div class="item"><span class="t"><b>${esc(morph.name)}</b><br><small>${morph.count.toLocaleString()} Formen · ${esc(morph.source || '')}</small></span></div>` : '<p class="hint">Formenanalyse fehlt (morph.gdpkg.gz) – ohne sie werden nur Grundformen gefunden.</p>');
  let est = ''; try { const e = await navigator.storage?.estimate?.(); if (e) est = `Speicher: ${(e.usage / 1e6).toFixed(0)} MB belegt`; } catch (_) {}
  const r = await dialog(`<h3>Wörterbücher</h3><div class="list">${rows || '<p class="hint">Keine Wörterbücher installiert.</p>'}</div><small>${est}</small>`, [['import', 'Pakete importieren …'], ['persist', 'Speicher dauerhaft machen'], ['cancel', 'Schließen']]);
  if (r.action === 'import') $('#fileDict').click();
  if (r.action === 'persist') { const ok = await navigator.storage?.persist?.(); toast(ok ? 'Speicher ist dauerhaft.' : 'Browser hat dauerhaften Speicher nicht bestätigt – App zum Home-Bildschirm hinzufügen.'); }
  if (r.action.startsWith('del:')) { await deleteDict(r.action.slice(4)); await loadDicts(); dictsDialog(); }
}
async function importFiles(files) {
  const d = $('#dlg'), f = $('#dlgForm');
  f.innerHTML = '<h3>Import</h3><p id="impMsg">…</p><div class="prog"><i id="impBar"></i></div>';
  d.showModal();
  const prog = (x, msg) => { if (msg) $('#impMsg').textContent = msg; $('#impBar').style.width = (x * 100).toFixed(0) + '%'; };
  try {
    for (const file of files) { prog(0, file.name + ' wird gelesen …'); await importPackage(file, prog); }
    d.close(); toast('Import abgeschlossen');
  } catch (e) { $('#impMsg').textContent = 'Fehler: ' + e.message; f.insertAdjacentHTML('beforeend', '<div class="row"><button value="ok">OK</button></div>'); }
  await loadDicts(); if (S.view) renderView();
}
async function backupDialog() {
  const r = await dialog('<h3>Sicherung</h3><p>Texte, Glossen und deine Lemma-Entscheidungen als Datei sichern (z. B. in „Dateien“ oder iCloud) oder aus einer Sicherung wiederherstellen. Wörterbücher sind nicht enthalten.</p>', [['export', 'Sichern'], ['import', 'Wiederherstellen …'], ['cancel', 'Schließen']]);
  if (r.action === 'export') {
    const data = { format: 'greekdict-backup-1', date: new Date().toISOString(), texts: await getAll('texts'), glosses: await getAll('glosses'), choices: await getAll('choices') };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'lesepult-sicherung-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.append(a); a.click(); a.remove();
  }
  if (r.action === 'import') $('#fileBackup').click();
}
async function restoreBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.format !== 'greekdict-backup-1') return toast('Keine Sicherungsdatei.');
  const c = await dialog(`<h3>Wiederherstellen?</h3><p>${data.texts.length} Texte und ${data.glosses.length} Glossen. Vorhandene Einträge mit gleicher Nummer werden überschrieben.</p>`, [['cancel', 'Abbrechen'], ['ok', 'Wiederherstellen']]);
  if (c.action !== 'ok') return;
  await bulkPut('texts', data.texts); await bulkPut('glosses', data.glosses); await bulkPut('choices', data.choices);
  toast('Wiederhergestellt'); await openText(data.texts[0]?.id ?? null);
}

// ---------------------------------------------------------------- events
function wire() {
  $('#textBody').addEventListener('click', async ev => {
    const gsp = ev.target.closest('.gl span'); if (gsp) return editGloss(+gsp.dataset.g);
    const w = ev.target.closest('.w'); if (!w) return;
    const i = +w.dataset.i;
    if (S.rangeMode && S.cur) {
      S.cur = [Math.min(S.cur[0], i), Math.max(S.cur[1], i)];
      S.rangeMode = false; $('#btnRange').classList.remove('on'); markTarget(); return;
    }
    S.cur = [i, i]; markTarget();
    const tk = S.tokens.find(t => t.t === 'w' && t.i === i);
    S.hist = []; S.view = null; await showWord(tk.s);
  });
  $('#dictBody').addEventListener('click', async ev => {
    const chip = ev.target.closest('.chip'); if (chip) { S.view.lemma = chip.dataset.lemma; return renderView(); }
    const pin = ev.target.closest('[data-pin]');
    if (pin) { await put('choices', { f: canon(S.view.form), lemma: pin.dataset.pin }); S.view.lemma = null; return renderView(); }
    const gw = ev.target.closest('.gw');
    if (gw && !String(window.getSelection())) return showWord(gw.textContent);
  });
  $('#dictBody').addEventListener('toggle', ev => { const d = ev.target.closest?.('details.src'); if (d) srcOpen[d.dataset.d] = d.open; }, true);
  $('#listBody').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-sort]'); if (b) { S.listSort = b.dataset.sort; return renderList(); }
    const r = ev.target.closest('.lrow'); if (!r) return;
    const pos = +r.dataset.pos; S.cur = [pos, pos]; markTarget();
    document.querySelector(`.w[data-i="${pos}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const tk = S.tokens.find(t => t.t === 'w' && t.i === pos);
    S.hist = []; S.view = null; await showWord(tk.s, { lemma: r.dataset.lemma });
  });
  $('#btnBack').onclick = () => { if (!S.hist.length) return; S.view = S.hist.pop(); $('#btnBack').disabled = !S.hist.length; showTab('entry'); renderView(); };
  $('#tabEntry').onclick = () => showTab('entry');
  $('#tabList').onclick = () => { showTab('list'); renderList(); };
  $('#search').addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.value.trim()) { showWord(ev.target.value.trim()); ev.target.blur(); } });
  $('#chkGloss').onchange = ev => { document.body.classList.toggle('nogloss', !ev.target.checked); setting('showGloss', ev.target.checked); };
  $('#btnRange').onclick = () => {
    if (!S.cur) return toast('Erst auf das erste Wort tippen, dann „Bereich“, dann auf das letzte Wort.');
    S.rangeMode = !S.rangeMode; $('#btnRange').classList.toggle('on', S.rangeMode);
    if (S.rangeMode) toast('Jetzt auf das letzte Wort des Bereichs tippen.');
  };
  $('#btnLayout').onclick = () => setSplit(({ '50%': '62%', '62%': '38%', '38%': '50%' })[getSplit()] || '50%');
  $('#btnTexts').onclick = textsDialog;
  $('#btnDicts').onclick = dictsDialog;
  $('#btnBackup').onclick = backupDialog;
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
    $('#fabGloss').hidden = !(txt && inDict);
  });
  $('#fabGloss').addEventListener('pointerdown', ev => ev.preventDefault());
  $('#fabGloss').onclick = () => { const t = S.lastSel; window.getSelection().removeAllRanges(); $('#fabGloss').hidden = true; addGloss(t); };
  // divider drag
  const dv = $('#divider');
  dv.addEventListener('pointerdown', ev => {
    dv.setPointerCapture(ev.pointerId);
    const portrait = getComputedStyle($('#panes')).gridTemplateRows.split(' ').length > 1 && matchMedia('(orientation:portrait),(max-width:760px)').matches;
    const r = $('#panes').getBoundingClientRect();
    const mv = e => { const x = portrait ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width; setSplit(Math.min(85, Math.max(15, x * 100)).toFixed(1) + '%', false); };
    const up = () => { dv.removeEventListener('pointermove', mv); dv.removeEventListener('pointerup', up); setting('split', getSplit()); };
    dv.addEventListener('pointermove', mv); dv.addEventListener('pointerup', up);
  });
}
function getSplit() { return document.documentElement.style.getPropertyValue('--split').trim() || '50%'; }
function setSplit(v, save = true) { document.documentElement.style.setProperty('--split', v); if (save) setting('split', v); }

// ---------------------------------------------------------------- start
(async function main() {
  db = await openDB();
  wire();
  await loadDicts();
  const sg = await setting('showGloss'); if (sg === false) { $('#chkGloss').checked = false; document.body.classList.add('nogloss'); }
  const sp = await setting('split'); if (sp) setSplit(sp, false);
  const cur = await setting('currentText');
  if (cur != null) await openText(cur);
  if (!S.dicts.length) $('#dictBody').innerHTML = '<p class="hint">Willkommen! Tippe oben auf „Wörterbücher“ → „Pakete importieren“ und wähle die Dateien *.gdpkg.gz (Frisk, Pape, LSJ, Bailly, Formenanalyse). Danach unter ☰ einen Text einfügen.</p>';
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.storage?.persist?.().catch(() => {});
})();
