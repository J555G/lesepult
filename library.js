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
    for (const a of as) {
      const ws = libFilter(a); if (!ws.length) continue;
      n++; nw += ws.length;
      html += authorHTML(a, ws, S.libOpen.has(a.id) || (q && !fold(a.name).includes(q)));
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
  dialog(`${dlgHead('Library')}
    <div class="libtabs" id="libTabs" role="tablist">${libTabsHTML()}</div>
    <div class="libtop"><input type="search" id="libSearch" placeholder="Search authors and works (English, Latin or Greek)…" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(S.libQ)}">
      <button type="button" id="libFilterBtn" title="Filters" aria-label="Filters" aria-expanded="false"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5.5h12M6 18.5h12"/><rect x="3" y="4" width="3.2" height="16" rx="1.6"/><rect x="17.8" y="4" width="3.2" height="16" rx="1.6"/><path d="M9 9.2h6M9 12h4.6M9 14.8h3" stroke-width="1.3"/></g></svg></button></div>
    <div id="libActive" class="libactive" hidden></div>
    <div id="libCtl" class="libctl" hidden>${libControlsHTML()}</div>
    <div class="libbar"><span class="libcount" id="libCount"></span><span class="libsort" id="libSort">${sortBarHTML()}</span></div>
    <div class="list lib" id="libList"></div>
    ${!cat ? '<p class="hint">The catalogue could not be loaded (offline?). Downloaded works are listed below.</p>' : S.catOnline ? '' : '<p class="hint">Offline – showing the last known catalogue; downloads need a connection.</p>'}
    <small class="libfoot">${inst.length} on this device${tot ? ` · ≈ ${mb(tot)}` : ''}${S.impWorks.length ? ` · ${S.impWorks.length} imported` : ''} ${info(`${cat ? `${cat.authors.length} authors and ${Object.keys(S.catWork).length.toLocaleString('en')} works are available. ` : ''}Texts: Perseus Digital Library and Open Greek and Latin (☰ → Acknowledgements). Dates follow the TLG canon: author dates by century; a work is dated by its author.`)}</small>`,
    [['import', 'Import text …']]).then(r => { document.body.classList.remove('libsheet'); $('#dlg').classList.remove('libdlg'); S.libScroll = $('#libList')?.scrollTop || 0;
      if (r.action === 'import') importDialog(null, true); });
  // the library takes the whole height: the list gets all the room, the short summary shares the line with "Import text …"
  $('#dlg').classList.add('libdlg');
  const ft = $('#dlgForm .libfoot'), row = $('#dlgForm > .row'); if (ft && row) row.prepend(ft);
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
  // wide: "Author › Work › Book 14 › 3.2" in one line; narrow: the work small above, "14 › 3.2" below
  const multi = w && w.books.length > 1;
  tt.innerHTML = (!t ? '<span class="tw">no text</span>' : w
    ? `<span class="tw"><span class="ta">${esc(w.author)} › </span>${esc(w.title)}</span><span class="tl2">${multi ? `<span class="tb"><span class="sep">› </span><span class="tbf">${esc(w.books[t.bi])}</span><span class="tbs">${esc(stripCommon(w.books)[t.bi])}</span></span>` : ''}<span class="ts" id="titleSec"></span></span>`
    : `<span class="tw">${esc(t.title)}</span><span class="tl2"><span class="ts" id="titleSec"></span></span>`);
  S.secShown = null; updateSecTitle(); secRoom();
  const ex = $('#menu [data-m="export"]'); if (ex) ex.disabled = !t;      // nothing to export without a text
  tt.title = t ? (w ? `${w.author} › ${w.title} › ${w.books[t.bi]}` : t.title) + ' – tap to choose another text or book' : 'Choose a text';
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
async function findInWork(q, mode, progress) {
  const t = S.text, w = t?.work; q = q.trim(); if (!q || !t) return [];
  const parts = w ? w.books.map((_, bi) => bi) : [null];
  const out = [], fq = foldForm(q), star = /\*/.test(q), rx = star ? new RegExp('^' + fq.split('*').map(x => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$') : null;
  const lk = gkey(q), memo = S.lemMemo ??= new Map();
  const lemmaOf = async f => { let r = memo.get(f); if (!r) { const A = await analyses(f); r = new Set(A.lemmas.map(x => gkey(x.lemma))); memo.set(f, r); } return r; };
  for (const [n, bi] of parts.entries()) {
    progress?.(n / parts.length);
    let toks, blocks;
    if (bi == null || bi === t.bi) { toks = S.tokens; blocks = t.blocks; }
    else { const b = await libGet('books', w.id + '|' + bi); if (!b) continue; blocks = b.blocks; toks = tokenizeBlocks(blocks); if (b.ann && w.annL) applyAnnotation({ ann: b.ann, work: w, blocks }, toks); }
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
// ---- the navigation menu (tap the title): a sticky title with the search of the work; below it the outline of the
// work (parts › sections), or – after a search – the outline cut down to the parts and sections with hits
async function navHTML() {
  const t = S.text, w = t?.work;
  if (!t) return `<div class="dlghead navhead"><h3>Texts</h3></div><p class="hint">No text open – get texts from the Library, or import your own (☰ → Library → Import text …).</p>`;
  const F = navFindNow();
  return `<div class="dlghead navhead"><h3>${w ? `${esc(w.author)} · ${esc(w.title)} <span class="gk">${w.greek && w.greek !== w.title ? esc(w.greek) : ''}</span>` : esc(t.title)}</h3>
    <div class="navsearch"><input type="search" id="navFind" class="nofocus" value="${esc(F?.q || '')}" placeholder="Find in this ${w ? 'work' : 'text'} …" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Find in this ${w ? 'work' : 'text'}">
      <span class="seg" role="group">${[['form', 'Form'], ['lemma', 'Lemma']].map(([v, l]) => `<button type="button" data-findmode="${v}" class="${(S.findMode || 'form') === v ? 'on' : ''}" title="${v === 'form' ? 'This word form (accents ignored, * = any letters)' : 'All forms of this dictionary headword'}">${l}</button>`).join('')}</span></div></div>
    <div id="navOutline" class="outline">${F ? resultsHTML(F) : await outlineHTML()}</div>`
    + (w && !F ? `<p class="hint" style="font-size:12px;margin:.3rem 0 0">${esc(w.edition || '')}</p>` : '');
}
const navFindNow = () => { const t = S.text, F = S.navFind; return t && F && F.key === (t.work ? t.work.id : t.id) ? F : null; };
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
function outlineNodes(nodes, part, cr, depth) {
  let h = '';
  for (const n of nodes) {
    const key = part + '|' + n.id, kids = n.kids.length, onPath = cr && treeHas(n, cr);
    const open = kids && (S.navOpen.has(key) || (onPath && !S.navShut.has(key)));
    const r = firstRef(n), title = r ? r.lab + (r.more ? ' …' : '') : '';
    h += `<div class="olrow d${Math.min(depth, 4)}${n.ref && n.ref === cr ? ' on' : ''}${onPath ? ' path' : ''}">`
      + (kids ? `<button type="button" class="olt" data-olt="${esc(key)}" aria-expanded="${!!open}" aria-label="${open ? 'Fold' : 'Unfold'}">${open ? '▾' : '▸'}</button>` : '<span class="olt"></span>')
      + `<button type="button" class="olj" data-sec="${esc(r?.s || '')}" data-secpart="${part}"><span class="oln">${esc(n.seg)}</span><span class="olx">${esc(title)}</span>${kids && !open ? `<span class="olc">${kids}</span>` : ''}</button></div>`;
    if (open) h += outlineNodes(n.kids, part, cr, depth + 1);
  }
  return h;
}
async function outlineHTML() {
  const t = S.text, w = t?.work; if (!t) return '';
  const cr = curRef(), cur = w ? t.bi : '';
  if (!w || w.books.length < 2) {
    const tree = refTree(S.refs || []);
    return tree.kids.length ? outlineNodes(tree.kids, cur, cr, 0) : '<p class="hint" style="font-size:13px">This text has no numbered sections.</p>';
  }
  const marks = new Set((await getAll('settings', IDBKeyRange.bound(`mk|w:${w.id}:`, `mk|w:${w.id}:\uffff`))).map(r => +r.k.split(':').pop()));
  let h = '';
  for (let bi = 0; bi < w.books.length; bi++) {
    const key = 'part|' + bi, here = bi === t.bi, open = S.navOpen.has(key) || (here && !S.navShut.has(key));
    h += `<div class="olrow d0 part${here ? ' path' : ''}"><button type="button" class="olt" data-olt="${key}" aria-expanded="${open}">${open ? '▾' : '▸'}</button>`
      + `<button type="button" class="olj" ${here ? `data-sec="" data-secpart="${bi}"` : `data-openpart="${bi}"`}><span class="olx">${esc(w.books[bi])}</span>${marks.has(bi) ? '<svg class="bm" width="8" height="11" viewBox="0 0 8 11" aria-hidden="true"><path d="M0 0h8v11L4 8 0 11z"/></svg>' : ''}${here ? '<span class="olc">open now</span>' : ''}</button></div>`;
    if (open) { const tree = refTree(await partRefs(bi)); h += tree.kids.length ? outlineNodes(tree.kids, bi, here ? cr : null, 1) : '<p class="hint" style="font-size:13px;margin:.2rem 0 .4rem 2.4rem">No numbered sections.</p>'; }
  }
  return h;
}
// the hits, grouped like the outline: by part (a work in several parts) or by chapter (the first number of the reference;
// line numbers: by hundreds); a group unfolds into its hits, one line of context each
function findGroup(r, multi) {
  if (multi) return String(r.bi);
  const m = String(r.ref || '').match(/^([^.,:]+)[.,:]/); if (m) return m[1];
  const n = parseInt(r.ref, 10); if (!isNaN(n) && /^\d+$/.test(r.ref)) { const lo = Math.floor((n - 1) / 100) * 100 + 1; return `${lo}–${lo + 99}`; }
  return r.ref || '–';
}
function findGroups(F) {
  const w = S.text?.work, multi = !!(w && w.books.length > 1), g = new Map();
  F.res.forEach((r, k) => { const key = findGroup(r, multi); let x = g.get(key); if (!x) g.set(key, x = { key, label: multi ? w.books[r.bi] : key, hits: [] }); x.hits.push(k); });
  return [...g.values()];
}
function resultsHTML(F) {
  const w = S.text?.work, multi = !!(w && w.books.length > 1), what = `<b class="gk">${esc(F.q)}</b> <small>(${F.mode === 'lemma' ? 'lemma' : 'form'})</small>`;
  if (F.busy) return `<div class="fhead"><span>${what} · searching … ${Math.round(F.p * 100)} %</span></div>`;
  if (!F.res.length) return `<div class="fhead"><span>${what} · not found</span><button type="button" data-fclear="1">Outline</button></div>`
    + (F.mode === 'lemma' ? '<p class="hint" style="font-size:13px">Not found as a lemma – try the form, or check the spelling of the dictionary headword.</p>' : '');
  const G = findGroups(F);
  F.open ??= new Set(F.res.length <= 30 ? G.map(x => x.key) : [(G.find(x => multi && x.key === String(S.text.bi)) || G[0]).key]);   // few hits: all open; else the part being read
  const n = F.res.length, cnt = `${n >= 2000 ? 'more than 2,000' : n.toLocaleString('en')} place${n === 1 ? '' : 's'}`;
  let h = `<div class="fhead"><span>${what} · ${cnt}</span><button type="button" data-fexp="1"${F.exp ? ' class="on"' : ''}>Export</button><button type="button" data-fclear="1" title="Back to the outline of the ${w ? 'work' : 'text'}">Outline</button></div>`
    + (F.exp ? `<div class="fexp">${F.save ? F.save : [['pdf', 'PDF'], ['html', 'HTML'], ['docx', 'Word']].map(([v, l]) => `<button type="button" data-fx="${v}">${l}</button>`).join('')}</div>` : '');
  for (const g of G) {
    const open = F.open.has(g.key);
    h += `<div class="olrow d0 fgrp${multi ? ' part' : ''}"><button type="button" class="olt" data-fgrp="${esc(g.key)}" aria-expanded="${open}">${open ? '▾' : '▸'}</button>`
      + `<button type="button" class="olj" data-fgrp="${esc(g.key)}"><span class="olx">${esc(g.label)}</span><span class="olc">${g.hits.length}</span></button></div>`;
    if (!open) continue;
    const lim = F.lim?.[g.key] || 200;
    h += `<div class="fres">${g.hits.slice(0, lim).map(k => { const r = F.res[k]; return `<button type="button" class="fr${F.sel === k ? ' on' : ''}" data-fres="${k}"><span class="frl">${esc(r.ref || '')}</span><span class="frc">${r.ctx}</span></button>`; }).join('')}`
      + (g.hits.length > lim ? `<button type="button" class="fmore" data-fmore="${esc(g.key)}">Show more (${(g.hits.length - lim).toLocaleString('en')})</button>` : '') + '</div>';
  }
  return h;
}
// the export of a search: work, search and number of places; per part or chapter the hits, each with its reference and sentence
function findDoc(F) {
  const t = S.text, w = t?.work, G = findGroups(F);
  const title = w ? `${w.author} – ${w.title}` : t.title;
  const head = `${F.mode === 'lemma' ? 'All forms of' : 'The form'} “${F.q}” · ${F.res.length.toLocaleString('en')} place${F.res.length === 1 ? '' : 's'}`;
  return { title, head, groups: G.map(g => ({ label: g.label, hits: g.hits.map(k => F.res[k]) })), name: `${title} – ${F.q}`.replace(/[\\/:*?"<>|…]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) };
}
const FIND_CSS = `body{font:12pt/1.45 'Gentium Book Plus','Gentium Plus',serif;color:#111}h1{font:600 15pt Arial,sans-serif;margin:0 0 .2em}p.sub{font:10pt Arial,sans-serif;color:#555;margin:0 0 1.2em}
h2{font:600 12pt Arial,sans-serif;margin:1.2em 0 .4em;border-bottom:1px solid #ccc;padding-bottom:.15em}.hit{display:flex;gap:.8em;margin:.25em 0;break-inside:avoid}.hit .r{flex:none;min-width:4.5em;font:9.5pt Arial,sans-serif;color:#666;padding-top:.15em}.hit b{font-weight:700}`;
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
// text navigation: the menu stays open – a part or section chosen opens in the text behind it and is marked in the menu
async function navDialog() {
  S.navOpen = new Set(); S.navShut = new Set();
  const p = dialog(`<div id="navBody">${await navHTML()}</div>`, []);
  $('#dlg').classList.add('navdlg');
  requestAnimationFrame(() => $('#navOutline .olrow.on, #navOutline .fr.on')?.scrollIntoView({ block: 'center' }));
  await p; $('#dlg').classList.remove('navdlg');
  if (S.navFind?.href) { URL.revokeObjectURL(S.navFind.href); S.navFind.href = null; S.navFind.save = null; }
}
// the menu's list again (after a choice), where it was scrolled to
async function navRefresh() {
  const ol = $('#navOutline'); if (!ol || !$('#dlg').open) return;
  const d = $('#dlg'), y = d.scrollTop, F = navFindNow();
  ol.innerHTML = F ? resultsHTML(F) : await outlineHTML(); d.scrollTop = y;
}
function wireNav() {
  const later = () => new Promise(r => setTimeout(r, 160));          // (the text has scrolled to the place: its section is known)
  document.addEventListener('click', async ev => {
    const body = ev.target.closest('#navBody'); if (!body) return;
    const b = ev.target.closest('button'); if (!b) return;
    const d = b.dataset, F = S.navFind;
    if (d.openpart != null) { S.navShut.delete('part|' + d.openpart); S.navOpen.add('part|' + d.openpart); await openText(`w:${S.text.work.id}:${+d.openpart}`); await later(); return navRefresh(); }
    if (d.olt) {
      const k = d.olt, isOpen = b.getAttribute('aria-expanded') === 'true';
      if (isOpen) { S.navOpen.delete(k); S.navShut.add(k); } else { S.navShut.delete(k); S.navOpen.add(k); }
      return navRefresh();
    }
    if (d.sec != null) { await goPlace(d.secpart === '' ? null : +d.secpart, d.sec || null, null); await later(); return navRefresh(); }
    if (d.findmode) { S.findMode = d.findmode; body.querySelectorAll('[data-findmode]').forEach(x => x.classList.toggle('on', x === b)); if ($('#navFind')?.value.trim()) runFind(); return; }
    if (d.fclear != null) { S.navFind = null; const i = $('#navFind'); if (i) i.value = ''; return navRefresh(); }
    if (d.fgrp != null) { F.open.has(d.fgrp) ? F.open.delete(d.fgrp) : F.open.add(d.fgrp); return navRefresh(); }
    if (d.fmore != null) { (F.lim ??= {})[d.fmore] = (F.lim[d.fmore] || 200) + 300; return navRefresh(); }
    if (d.fres != null) { const r = F.res[+d.fres]; F.sel = +d.fres; navRefresh(); await goPlace(r.bi, null, r.i); return; }
    if (d.fexp != null) { F.exp = !F.exp; F.save = null; return navRefresh(); }
    if (d.fx) {
      const D = findDoc(F);
      if (d.fx === 'pdf') return printHTML(findDocHTML(D), FIND_CSS);
      const blob = d.fx === 'html' ? new Blob([`<!doctype html><html lang="grc"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(D.title)}</title><style>${await fontFacesInline()}body{margin:2.5em auto;max-width:46em;padding:0 1.5em;background:#fff}${FIND_CSS}</style></head><body>${findDocHTML(D)}</body></html>`], { type: 'text/html' }) : await findDocx(D);
      const name = D.name + (d.fx === 'html' ? '.html' : '.docx');
      if (F.href) URL.revokeObjectURL(F.href);
      F.href = URL.createObjectURL(blob);             // saved by a tap on the link (on the iPad a download has to start from a tap)
      F.save = `<a class="btn acc" href="${F.href}" download="${esc(name)}">Save ${esc(name)}</a><button type="button" data-fexp="1" class="mx" aria-label="Cancel">✕</button>`;
      return navRefresh();
    }
  });
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter' || ev.isComposing || ev.target.id !== 'navFind') return;
    ev.preventDefault(); ev.stopPropagation(); runFind();
  }, true);
  // the field emptied (its ✕, or deleted): the outline again
  document.addEventListener('input', ev => { if (ev.target.id === 'navFind' && !ev.target.value.trim() && S.navFind) { S.navFind = null; navRefresh(); } });
  async function runFind() {
    const q = ($('#navFind')?.value || '').trim(); if (!q) return;
    $('#navFind').blur();
    const t = S.text, key = t.work ? t.work.id : t.id;
    const F = S.navFind = { key, q, mode: S.findMode || 'form', res: [], busy: true, p: 0 };
    const out = () => { if (S.navFind === F) navRefresh(); };
    out(); $('#dlg').scrollTop = 0;
    let last = 0;
    F.res = await findInWork(q, F.mode, p => { F.p = p; if (Date.now() - last > 150) { last = Date.now(); out(); } });
    F.busy = false; out();
  }
}
async function navChoose(v) {
  const t = S.text;
  if ($('#dlg').open) $('#dlg').close();
  if (v.startsWith('book:')) await openText(`w:${t.work.id}:${+v.slice(5)}`);
  else if (v.startsWith('work:')) await openWork(v.slice(5));
  else if (v.startsWith('text:')) await openText(+v.slice(5));
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
  const r = (S.recent ??= (await setting('recent')) || []).filter(x => x.key !== key);
  r.unshift({ key, id: t.id, sec, t: Date.now(), title: t.work ? t.work.title : t.title, author: t.work?.author || '', part: t.work && t.work.books.length > 1 ? t.work.books[t.bi] : '' });
  S.recent = r.slice(0, 8); clearTimeout(S.recT); S.recT = setTimeout(() => setting('recent', S.recent), 300);
}
