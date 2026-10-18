/* Pult – The library (Perseus, First1KGreek) and moving between texts, books and sections.
   (see core.js for the order of the scripts) */
'use strict';
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
// deleting a work from the Library keeps it on the device for 7 days: its download icon then restores it at once (offline too)
async function trashWork(id) {
  const w = await libGet('works', id); if (!w) return;
  const books = []; for (let i = 0; i < w.books.length; i++) { const b = await libGet('books', id + '|' + i); if (b) books.push(b); }
  await setting('trash|' + id, { at: Date.now(), work: w, books });
  await deleteWork(id); if (S.libInst) delete S.libInst[id]; S.partRefCache = {};
  (S.trash ??= {})[id] = Date.now();
}
async function workRestore(id) {
  const T = await setting('trash|' + id); if (!T) return false;
  await revWrite(T.work, T.books); await del('settings', 'trash|' + id);
  if (S.libInst) S.libInst[id] = await libGet('works', id); if (S.trash) delete S.trash[id]; S.partRefCache = {};
  return true;
}
async function trashLoad() {
  S.trash = {};
  for (const r of await getAll('settings', IDBKeyRange.bound('trash|', 'trash|￿'))) {
    if (Date.now() - (r.v?.at || 0) > 7 * 864e5) await del('settings', r.k); else S.trash[r.k.slice(6)] = r.v.at;
  }
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
    S.catalog = await r.json(); S.catOnline = true; S.catAt = Date.now(); setting('catalog', S.catalog); setting('catalogAt', S.catAt);
  } catch (_) { S.catalog = S.catalog || (await setting('catalog')) || null; S.catOnline = false; S.catAt ??= await setting('catalogAt'); }
  indexCatalog();
  return S.catalog;
}
// the last known catalogue, at once (the Library opens without waiting for the network)
async function cachedCatalog() {
  if (!S.catalog) { S.catalog = (await setting('catalog')) || null; S.catAt = await setting('catalogAt'); indexCatalog(); }
  return S.catalog;
}
function indexCatalog() {
  S.catWork = {}; S.catAuthor = {};
  if (S.catalog) for (const a of S.catalog.authors) for (const w of a.works) { S.catWork[w.id] = Object.assign(w, { author: a.name, authorId: a.id }); S.catAuthor[w.id] = a; }
}
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯͅ]/g, '').replace(/ς/g, 'σ').toLowerCase();
const mb = b => b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' kB';
// ---- Library view: filters (highlighted when on) and sorting (arrow shows the direction)
const SORTS = [['author', 'Author A–Z', 1], ['adate', 'Author by date', 1], ['title', 'Title', 1]];
// century slider: from the start of the 8th c. BC to the end of the 15th c. AD (years; 0 = start of the 1st c. AD)
const YMIN = -800, YMAX = 1500;
const ERAS = [['Bronze Age', -3300, -1200], ['Early Iron Age', -1200, -800], ['Archaic', -800, -500], ['Classical', -500, -323], ['Hellenistic', -323, -31], ['Imperial', -31, 300], ['Late Antique', 300, 600],
  ['Byzantine', 600, 1453], ['Early Modern', 1453, 1789], ['Modern', 1789, 2100]];
// the date line's settings (Settings → Library): its earliest and latest dates, the view it opens with, the period set
// when the filters are reset (or none)
const ftLim = () => [S.lib?.ftMin ?? YMIN, S.lib?.ftMax ?? YMAX];
const ftView0 = () => { const [lo, hi] = ftLim(), v = S.lib?.ftView0; return v ? [Math.max(lo, v[0]), Math.min(hi, v[1])] : [lo, hi]; };
const ftDef = () => (S.lib?.ftDefs || []).map(r => [...r]);
const filtersAtDefault = v => !v.langs.length && !v.form.length && v.undated && JSON.stringify(v.periods) === JSON.stringify(ftDef());
// favourites: a small flame (outline = not a favourite, filled = favourite)
const FLAME = '<svg class="flame" width="15" height="20" viewBox="6.4 0.8 11.2 15.2" aria-hidden="true"><g transform="translate(12 0) scale(.82 1) translate(-12 0)" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"><path class="fo" vector-effect="non-scaling-stroke" d="M12 15.2c-3.6-.6-5.6-2.6-5.4-5.4.1-1.6.9-2.6 1.6-3.6.1 1.4.6 2.3 1.3 2.7-.4-2.4.2-5 1.5-7.4.4 2.4 1.4 3.6 2.4 4.6.4-1.4 1-2.4 2-3.2-.3 1.8 0 3.2.8 4.4.5-.6.8-1.4.9-2.4 1 1.4 1.4 3 1.2 4.6-.3 3.1-2.4 5.2-6.3 5.7z"/><path class="fi" vector-effect="non-scaling-stroke" d="M12 15c-1.6-.4-2.4-1.4-2.3-2.8 0-.8.4-1.4.8-1.9.1.7.4 1.1.7 1.2-.1-1.2.3-2.4.9-3.4.3 1 .9 1.7 1.4 2.4.6.8.8 1.6.6 2.4-.2 1.1-1 1.8-2.1 2.1z"/></g></svg>';
function libView() {
  S.lib ??= {};
  if (S.lib.mine || S.lib.fav) S.lib.view ??= S.lib.mine ? 'mine' : 'fav';         // older settings: these were filters
  delete S.lib.mine; delete S.lib.fav;
  S.lib = Object.assign({ view: 'all', langs: [], src: [], form: [], periods: [], undated: true, sort: 'author', dir: 1 }, S.lib);
  if (!SORTS.some(x => x[0] === S.lib.sort)) S.lib.sort = S.lib.sort === 'date' ? 'adate' : 'author';      // (sorts of before v214)
  if ('ftDef' in S.lib) { S.lib.ftDefs = S.lib.ftDef ? [S.lib.ftDef] : []; delete S.lib.ftDef; }            // (one default period, v217)
  S.lib.src = [];                                                                                      // (the source is no longer a filter, v219)
  if (S.lib.from != null || S.lib.to != null) {                                                      // the century slider of before v214: one period
    if ((S.lib.from ?? YMIN) > YMIN || (S.lib.to ?? YMAX) < YMAX) S.lib.periods = [[S.lib.from ?? YMIN, S.lib.to ?? YMAX]];
    delete S.lib.from; delete S.lib.to;
  }
  return S.lib;
}
const workLang = w => (w.lang === 'lat' || w.lang === 'la') ? 'la' : 'grc';
// the tabs (all / favourites / on this device) are views, not filters
const filtersOn = v => v.langs.length || v.form.length || v.periods.length || !v.undated;
function saveLibView() { setting('libView', S.lib); }
const authorOf = w => S.catAuthor?.[w.id] || { name: w.author || 'Unknown author', id: w.authorId, period: null, year: w.year ?? null, date: w.date || '' };
// imported texts as works of the library (source "Imported")
function impWork(t) {
  const lang = t.lang || detectLang(t.text || '');
  return { id: 'imp:' + t.id, tid: t.id, title: t.title, greek: '', author: t.author || '', authorId: 'imp|' + (t.author || ''), source: 'Imported', lang: lang === 'la' ? 'lat' : 'grc',
    words: ((t.text || '').match(new RegExp(WORD_TOKEN.source, 'g')) || []).length, verse: null, books: [t.title], imported: true, year: t.year ?? null, date: t.date || '', edition: t.edition || '', notes: t.notes || '', created: t.created };
}
function workPasses(w, q, anyView = false) {           // (anyView: the filters and the search only, not the tab)
  const v = libView(), a = authorOf(w);
  if (!anyView && v.view === 'mine' && !S.libInst[w.id] && !w.imported) return false;
  if (!anyView && v.view === 'fav' && !S.favs?.[w.id]) return false;
  if (v.langs.length && !v.langs.includes(workLang(w))) return false;
  if (v.form.length && w.verse != null && !v.form.includes(w.verse ? 'verse' : 'prose')) return false;
  if (a.year == null) { if (!v.undated) return false; }
  else if (v.periods.length && !v.periods.some(([x, y]) => a.year >= x - (x === y ? 25 : 0) && a.year <= y + (x === y ? 25 : 0))) return false;   // (a single year: ± 25)
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
const DLICON = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/></g></svg>';
function sortedWorks() {        // a flat list (sort by title; Favourites): by title, or by author (name or date)
  const v = libView(), q = fold(S.libQ), d = v.dir;
  const ws = libAuthors().flatMap(a => a.works.filter(w => workPasses(w, q)));
  const byTitle = (x, y) => x.title.localeCompare(y.title), byName = (x, y) => authorOf(x).name.localeCompare(authorOf(y).name);
  const cmp = {
    title: (x, y) => d * byTitle(x, y) || byName(x, y),
    author: (x, y) => d * byName(x, y) || byTitle(x, y),
    adate: (x, y) => { const a = authorOf(x).year, b = authorOf(y).year;
      if (a == null || b == null) return (a == null) - (b == null) || byName(x, y);   // undated works at the end
      return d * (a - b) || byName(x, y) || byTitle(x, y); },
  }[v.sort] || ((x, y) => byTitle(x, y));
  return ws.sort(cmp);
}
// a text of the library (in the download queue, dialogs.js): fetched with the progress shown, then installed
async function downloadWork(key, signal) {
  const id = key.slice(5), w = S.catWork?.[id];
  if (!w) throw new Error('not in the catalogue');
  DL.set(key, 0); paintDL(key);
  const r = await fetch('texts/works/' + id + '.json.gz', { cache: 'no-cache', signal });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const reader = r.body.getReader(); const parts = []; let got = 0;
  for (;;) { const { done: fin, value } = await reader.read(); if (fin) break; parts.push(value); got += value.length; DL.set(key, 0.9 * Math.min(1, got / w.bytes)); paintDL(key); }
  DL.set(key, 0.9); paintDL(key);
  await installWork(new File(parts, id + '.json.gz'), w.v);
  DL.delete(key);
  if (S.libInst) S.libInst[id] = await libGet('works', id);
  if (S.text?.work?.id === id) await openText(S.text.id, false);
  if ($('#libBody')) lmRender();
}
// ---------------------------------------------------------------- navigation between texts and books
function titleBar() {
  const t = S.text, w = t?.work, tt = $('#textTitle');
  // wide: "Author › Work › Book 14 › 3.2" in one line; narrow: the work small above, "14 › 3.2" below
  const multi = w && w.books.length > 1;
  tt.innerHTML = (!t ? '<span class="tw">Library</span>' : w
    ? `<span class="tw"><span class="ta">${esc(w.author)} › </span>${esc(w.title)}</span><span class="tl2">${multi ? `<span class="tb"><span class="sep">› </span><span class="tbf">${esc(w.books[t.bi])}</span><span class="tbs">${esc(stripCommon(w.books)[t.bi])}</span></span>` : ''}<span class="ts" id="titleSec"></span></span>`
    : `<span class="tw">${esc(t.title)}</span><span class="tl2"><span class="ts" id="titleSec"></span></span>`);
  S.secShown = null; updateSecTitle(); secRoom();
  const ex = $('#menu [data-m="export"]'); if (ex) ex.disabled = !t;      // nothing to export without a text
  tt.title = t ? (w ? `${w.author} › ${w.title} › ${w.books[t.bi]}` : t.title) + ' – tap for its page in the Library' : 'Library';
  markIcon();
}
// the section number gets the room of the widest reference of the book, so that the buttons beside the title
// do not move while scrolling (the width changes only with another book or text)
function secRoom() {
  const el = $('#titleSec'); if (!el) return;
  el.style.minWidth = '';
  const R = S.refs || []; if (!R.length) return;
  const cs = getComputedStyle(el), c = (secRoom.cv ??= document.createElement('canvas').getContext('2d'));
  c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const sep = el.querySelector('.sep'), sepW = sep ? sep.getBoundingClientRect().width : c.measureText('› ').width;
  let w = 0; for (const r of new Set(R.map(r => r.s))) w = Math.max(w, c.measureText(r).width);
  el.style.minWidth = Math.ceil(w + sepW + 1) + 'px';
  // as soon as the work's title has to be shortened: the book by its short name ("Book 5" -> "5")
  const tt = $('#textTitle'), tw = tt.querySelector(':scope>.tw'); tt.classList.remove('short');
  if (tw && tt.querySelector('.tbs') && tw.scrollWidth > tw.clientWidth + 1) tt.classList.add('short');
}
{ let t = 0; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(secRoom, 200); }); }
function stripCommon(labels) {     // "Book 1", "Book 2" … -> "1", "2" …
  if (labels.length < 2) return labels;
  let p = labels[0];
  for (const l of labels) while (p && !l.startsWith(p)) p = p.slice(0, -1);
  p = p.slice(0, p.lastIndexOf(' ') + 1);
  return labels.map(l => l.slice(p.length) || l);
}
// ---- references (sections, lines, Stephanus pages) of a part, and where the reader is
function refsOf(toks, blocks) {
  const list = []; let pend = null, nl = 0;
  for (const tk of toks) { if (tk.t === 'r') { pend = tk.s; if (tk.l) nl++; } else if (tk.t === 'w' && pend != null) { list.push({ s: pend, i: tk.i }); pend = null; } }
  if (!list.length && blocks) { let n = 0, need = false;                  // no references: the paragraphs, numbered
    for (const tk of toks) { if (tk.t === 'b') need = true; else if (tk.t === 'w' && need) { list.push({ s: '¶ ' + (++n), i: tk.i }); need = false; } } }
  list.verse = nl > list.length / 2;
  const ws = toks.filter(x => x.t === 'w');
  list.forEach((r, j) => { const end = list[j + 1]?.i ?? Infinity; r.lab = ws.slice(r.i, r.i + 7).filter(x => x.i < end).map(x => x.s).join(' '); r.more = (list[j + 1]?.i ?? ws.length) - r.i > 7; });
  return list;
}
function topWord() {                // the first word at the top of the text pane
  const ws = drawnWords(), pane = $('#textPane').getBoundingClientRect(); if (!ws.length) return null;
  let lo = 0, hi = ws.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ws[m].getBoundingClientRect().bottom <= pane.top + 60) lo = m + 1; else hi = m; }   // the line a jump puts at the top
  return +ws[lo].dataset.i;
}
function curRef() {
  const R = S.refs; if (!R?.length) return null;
  const w = topWord(); if (w == null) return R[0];
  let lo = 0, hi = R.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (R[m].i <= w) { k = m; lo = m + 1; } else hi = m - 1; }
  return R[Math.max(0, k)];
}
function updateSecTitle() {
  const el = $('#titleSec'); if (!el) return;
  const r = curRef(), s = r ? r.s : '';
  if (s === S.secShown) return; S.secShown = s;
  if (S.tab === 'map' && typeof refreshMapData === 'function' && ['section', 'chapter'].includes(M.cfg?.scope)) { clearTimeout(S.mapSecT); S.mapSecT = setTimeout(refreshMapData, 250); }
  el.innerHTML = s ? `<span class="sep">› </span>${esc(s)}` : '';
}
// groups for the chapter list: "14.1.6" -> chapter "14.1", "227a" -> page 227, verse lines in fifties
function refGroups(list) {
  const groups = [], add = (k, r, lab) => { let g = groups[groups.length - 1]; if (!g || g.k !== k) groups.push(g = { k, items: [] }); g.items.push({ r, lab }); };
  const numeric = list.every(r => /^\d+$/.test(r.s));
  for (const r of list) {
    let m;
    if (numeric && list.length > 60) { const n = +r.s; if (list.verse && n % 10 && r !== list[0]) continue; const lo = Math.floor((n - 1) / 50) * 50 + 1; add(`${lo}–${lo + 49}`, r, r.s); }
    else if (list.some(x => x.s.startsWith(r.s + '.'))) { groups.push({ k: r.s, head: r, items: [] }); }    // a chapter that has sections: its heading
    else if ((m = r.s.match(/^(.*)[.,:](\w+)$/))) add(m[1], r, m[2]);
    else if ((m = r.s.match(/^(\d+)([a-e])$/i))) add(m[1], r, m[2]);
    else add('', r, r.s);
  }
  return groups;
}
async function partRefs(bi) {       // references of another part of the open work (read from the device, not shown)
  const t = S.text, w = t?.work; if (!w) return S.refs || [];
  if (bi === t.bi) return S.refs || [];
  S.partRefCache ??= {}; const key = w.id + '|' + bi;
  if (!S.partRefCache[key]) { const b = await libGet('books', key); S.partRefCache[key] = b ? refsOf(tokenizeBlocks(b.blocks), b.blocks) : []; }
  return S.partRefCache[key];
}
function scrollToWord(i, flash = true) {
  const e = ensureWord(i) || document.querySelector(`#textBody .w[data-i="${i}"]`); if (!e) return;
  const pane = $('#textPane'); S.tGuard = null;
  pane.scrollTop += e.getBoundingClientRect().top - pane.getBoundingClientRect().top - 56;
  if (flash) { e.classList.add('flash'); setTimeout(() => e.classList.remove('flash'), 1400); }
  updateSecTitle(); saveReadPos();
}
// go to a part (of the open work) and a place in it: a reference label, or a word number
async function goPlace(bi, ref, word) {
  const t = S.text, w = t?.work;
  if (w && bi != null && bi !== t.bi) await openText(`w:${w.id}:${bi}`, false);
  let i = word;
  if (i == null && ref != null) i = S.refs.find(r => r.s === ref)?.i;
  if (i == null) { $('#textPane').scrollTop = 0; updateSecTitle(); saveReadPos(); return; }
  requestAnimationFrame(() => scrollToWord(i));
}
// "Go to": 245c · 1.6 · 14.1.6 (part 14, then 1.6) · 120 (line 120, or the section that begins there)
async function goTo(q) {
  q = q.trim().replace(/\s+/g, ' '); if (!q || !S.text) return false;
  const norm = s => s.toLowerCase().replace(/\s+/g, '').replace(/,/g, '.');
  const find = (list, x) => {
    const n = norm(x);
    let r = list.find(r => norm(r.s) === n) || list.find(r => norm(r.s).startsWith(n + '.')) || list.find(r => norm(r.s).startsWith(n));
    if (!r && /^\d+$/.test(n) && list.every(r => /^\d+$/.test(r.s))) r = [...list].reverse().find(r => +r.s <= +n);
    return r;
  };
  const here = find(S.refs || [], q);
  if (here) { scrollToWord(here.i); return true; }
  const w = S.text.work; if (!w || w.books.length < 2) return false;
  const short = stripCommon(w.books).map(norm), m = q.match(/^([^\s.,:]+)[\s.,:]+(.+)$/);
  const bi = short.indexOf(norm(m ? m[1] : q));
  if (bi < 0) return false;
  if (!m) { await goPlace(bi, null, null); return true; }
  const r = find(await partRefs(bi), m[2]);
  await goPlace(bi, r?.s ?? null, null); return true;
}
// ---- find in this work: a word form (accents, case, j/v ignored) or a lemma (all its forms)
const foldForm = s => (isGreek(s) ? s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ') : s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/j/g, 'i').replace(/v/g, 'u')).replace(/[ʼ’'᾽]/g, '');
// works by key: a library work by its id, an imported text as "imp:<id>"; the open one is curKey()
const curKey = () => S.text ? (S.text.work ? S.text.work.id : 'imp:' + S.text.id) : '';
const textIdOf = (key, bi) => key.startsWith('imp:') ? +key.slice(4) : `w:${key}:${bi ?? 0}`;
// one part of a work (open or not): its tokens and blocks (annotations applied)
async function workPart(key, bi) {
  const t = S.text;
  if (t && curKey() === key && (bi == null || !t.work || bi === t.bi)) return { toks: S.tokens, blocks: t.blocks };
  if (key.startsWith('imp:')) { const x = await get('texts', +key.slice(4)); return x ? { toks: x.blocks ? tokenizeBlocks(x.blocks) : tokenize(x.text || ''), blocks: x.blocks } : null; }
  const w = await libGet('works', key), b = await libGet('books', key + '|' + (bi ?? 0)); if (!w || !b) return null;
  const toks = tokenizeBlocks(b.blocks); if (b.ann && w.annL) applyAnnotation({ ann: b.ann, work: w, blocks: b.blocks }, toks);
  return { toks, blocks: b.blocks };
}
async function workParts(key) {             // the part indices of a work on this device ([null] for an imported text)
  if (key.startsWith('imp:')) return [null];
  const w = await libGet('works', key); return w ? w.books.map((_, bi) => bi) : [];
}
async function findInWork(q, mode, progress, key = curKey()) {
  q = q.trim(); if (!q || !key) return [];
  const parts = await workParts(key);
  const out = [], fq = foldForm(q), star = /\*/.test(q), rx = star ? new RegExp('^' + fq.split('*').map(x => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$') : null;
  const lk = gkey(q), memo = S.lemMemo ??= new Map();
  const lemmaOf = async f => { let r = memo.get(f); if (!r) { const A = await analyses(f); r = new Set(A.lemmas.map(x => gkey(x.lemma))); memo.set(f, r); } return r; };
  for (const [n, bi] of parts.entries()) {
    progress?.(n / parts.length);
    const P = await workPart(key, bi); if (!P) continue; const { toks, blocks } = P;
    const words = [], at = []; toks.forEach((x, p) => { if (x.t === 'w') { words.push(x); at.push(p); } }); const refs = refsOf(toks, blocks);
    let ri = -1;
    for (let k = 0; k < words.length; k++) {
      const tk = words[k]; let hit = false;
      if (mode === 'lemma') hit = tk.ctx ? gkey(tk.ctx.l) === lk : (await lemmaOf(tk.s)).has(lk);
      else { const f = foldForm(tk.s); hit = rx ? rx.test(f) : f === fq; }
      if (!hit) continue;
      while (ri + 1 < refs.length && refs[ri + 1].i <= tk.i) ri++;
      const ctx = words.slice(Math.max(0, k - 6), k + 7).map(x => x === tk ? `<b>${esc(x.s)}</b>` : esc(x.s)).join(' ');
      out.push({ bi, i: tk.i, ref: ri >= 0 ? refs[ri].s : '', ctx, sent: sentenceAt(toks, at[k], tk) });
      if (out.length >= 2000) return out;
    }
  }
  progress?.(1);
  return out;
}
// the sentence around a word (for the export of a search): from the end of the sentence before to the end of its own
// (. ; · ! ?), at most 30 words on either side; a paragraph is a limit, a verse line is not; the word in <b>
const SENT_END = /[.;·;!?]/;
function sentenceAt(toks, p, tk) {
  const stop = x => x.t === 'b' && x.k !== 'l' && x.k !== 'L';
  let a = p, n = 0; while (a > 0 && n < 30) { const x = toks[a - 1]; if (stop(x) || (x.t === 'p' && SENT_END.test(x.s))) break; if (x.t === 'w') n++; a--; }
  let b = p, m = 0; while (b < toks.length - 1 && m < 30) { const x = toks[b + 1]; if (stop(x)) break; b++; if (x.t === 'w') m++; if (x.t === 'p' && SENT_END.test(x.s)) break; }
  let h = a > 0 && !stop(toks[a - 1]) && n >= 30 ? '… ' : '';
  for (let q = a; q <= b; q++) { const x = toks[q]; if (x.t === 'w') h += x === tk ? `<b>${esc(x.s)}</b>` : esc(x.s); else if (x.t === 'p') h += esc(x.s); else if (x.t === 'b') h += ' '; }
  return h.replace(/\s+/g, ' ').trim() + (m >= 30 ? ' …' : '');
}
// ---- outline of the open work: parts › chapters › sections (any depth); only the path to the reading position is unfolded
function refTree(list) {
  const root = { id: '', kids: [], map: new Map() }, numeric = list.length > 60 && list.every(r => /^\d+$/.test(r.s));
  for (const r of list) {
    let segs, m;
    if (numeric) { const n = +r.s; if (list.verse && n % 10 && r !== list[0]) continue; const lo = Math.floor((n - 1) / 50) * 50 + 1; segs = [`${lo}–${lo + 49}`, r.s]; }
    else if ((m = r.s.match(/^(\d+)([a-e])$/i))) segs = [m[1], m[2]];
    else segs = r.s.split(/[.,:](?=\w)/);
    let node = root;
    segs.forEach((sg, k) => {
      const id = segs.slice(0, k + 1).join('.');
      let c = node.map.get(id);
      if (!c) { c = { id, seg: sg, kids: [], map: new Map(), parent: node }; node.map.set(id, c); node.kids.push(c); }
      node = c;
    });
    node.ref = r;
  }
  return root;
}
const firstRef = n => n.ref || (n.kids[0] && firstRef(n.kids[0]));
function treeHas(n, r) { return n.ref === r || n.kids.some(k => treeHas(k, r)); }
function findGroup(r, multi) {
  if (multi) return String(r.bi);
  const m = String(r.ref || '').match(/^([^.,:]+)[.,:]/); if (m) return m[1];
  const n = parseInt(r.ref, 10); if (!isNaN(n) && /^\d+$/.test(r.ref)) { const lo = Math.floor((n - 1) / 100) * 100 + 1; return `${lo}–${lo + 99}`; }
  return r.ref || '–';
}
function findGroups(F) {
  const multi = F.books.length > 1, g = new Map();
  F.res.forEach((r, k) => { const key = findGroup(r, multi); let x = g.get(key); if (!x) g.set(key, x = { key, label: multi ? F.books[r.bi] : key, hits: [] }); x.hits.push(k); });
  return [...g.values()];
}
function findDoc(F) {
  const G = findGroups(F), title = F.title;
  const head = `${F.mode === 'lemma' ? 'All forms of' : 'The form'} “${F.q}” · ${F.res.length.toLocaleString('en')} place${F.res.length === 1 ? '' : 's'}`;
  return { title, head, groups: G.map(g => ({ label: g.label, hits: g.hits.map(k => F.res[k]) })), name: `${title} – ${F.q}`.replace(/[\\/:*?"<>|…]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) };
}
const FIND_CSS = `body{font:12pt/1.45 'Gentium Book Plus','Gentium Plus',serif;color:#111}h1{font:600 15pt 'Source Sans 3',Arial,sans-serif;margin:0 0 .2em}p.sub{font:10pt 'Source Sans 3',Arial,sans-serif;color:#555;margin:0 0 1.2em}
h2{font:600 12pt 'Source Sans 3',Arial,sans-serif;margin:1.2em 0 .4em;border-bottom:1px solid #ccc;padding-bottom:.15em}.hit{display:flex;gap:.8em;margin:.25em 0;break-inside:avoid}.hit .r{flex:none;min-width:4.5em;font:9.5pt 'Source Sans 3',Arial,sans-serif;color:#666;padding-top:.15em}.hit b{font-weight:700}`;
function findDocHTML(D) {
  return `<h1>${esc(D.title)}</h1><p class="sub">${esc(D.head)}</p>` + D.groups.map(g => `<h2>${esc(g.label)} <small>(${g.hits.length})</small></h2>` + g.hits.map(r => `<div class="hit"><span class="r">${esc(r.ref || '')}</span><span>${r.sent || r.ctx}</span></div>`).join('')).join('');
}
async function findDocx(D) {
  const runs = h => h.split(/(<b>.*?<\/b>)/).map(p => { const b = /^<b>/.test(p), txt = p.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); return wRun(txt, { font: 'Gentium Book Plus', sz: 24, b }); }).join('');
  let body = wP(wRun(D.title, { font: 'Arial', sz: 28, b: true }), { after: 60 }) + wP(wRun(D.head, { font: 'Arial', sz: 20, c: '#555555' }), { after: 240 });
  for (const g of D.groups) {
    body += wP(wRun(`${g.label} (${g.hits.length})`, { font: 'Arial', sz: 22, b: true }), { before: 200, after: 80 });
    for (const r of g.hits) body += wP(wRun((r.ref || '') + '\t', { font: 'Arial', sz: 18, c: '#666666' }) + runs(r.sent || r.ctx), { after: 60 });
  }
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', doc]];
  return zipFiles(files.map(([n, x]) => [n, new TextEncoder().encode(x)]));
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
    if (e.target.closest?.('#tScroll')) return;                  // (the scroll handle)
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
function saveReadPos() { if (S.text) { setting('pos|' + S.text.id, Math.round($('#textPane').scrollTop)); if (S.TW) { const a = textAnchor(); if (a.i != null) setting('pw|' + S.text.id, { i: +a.i, off: Math.round(a.off) }); } touchRecent(); } }
// recently read: one entry per work (or imported text) – the part and the section where it was left
async function touchRecent() {
  const t = S.text; if (!t) return;
  const key = t.work ? t.work.id : 'imp:' + t.id, sec = curRef()?.s || '';
  // a line of text from where the reader is (Scriptorium): the first words at the top of the pane (read before anything is awaited)
  let line = ''; const tw = topWord();
  if (tw != null) { let n = 0; for (const x of S.tokens) { if (x.t === 'w' && x.i < tw) continue; if (x.t === 'b' || x.t === 'r') { if (n) line += ' '; continue; } if (x.t === 'w') { if (++n > 12) break; line += x.s; } else if (n) line += x.s; } }
  const r = (S.recent ??= (await setting('recent')) || []).filter(x => x.key !== key);
  r.unshift({ key, id: t.id, sec, t: Date.now(), title: t.work ? t.work.title : t.title, author: t.work?.author || '', part: t.work && t.work.books.length > 1 ? t.work.books[t.bi] : '', line: line.replace(/\s+/g, ' ').trim() });
  S.recent = r.slice(0, 60); clearTimeout(S.recT); S.recT = setTimeout(() => setting('recent', S.recent), 300);
}
