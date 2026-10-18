/* Pult – the Library menu: one menu for finding, keeping and moving between texts (v212).
   Two levels: the overview with four tabs – Bibliotheca (the catalogue), Armarium (the works on this device),
   Scriptorium (recently read and annotated works), Favourites – and a page for every work: its outline, the search in
   it, Continue reading, Download/Delete. The title button opens the page of the open work, ☰ → Library the overview.
   A part or section chosen opens in the text behind the menu, which stays open and marks it.
   (see core.js for the order of the scripts) */
'use strict';
const LTABS = [['all', 'Bibliotheca', 'Catalogue of available works'], ['mine', 'Armarium', 'Works stored locally'], ['scr', 'Scriptorium', 'Recently read and annotated'], ['fav', 'Favourites', '']];
const BMARK = '<svg class="bm" width="8" height="11" viewBox="0 0 8 11" aria-hidden="true"><path d="M0 0h8v11L4 8 0 11z"/></svg>';
const GMARK = '<svg class="gm" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 10.5 2.6 8 8.4 2.2a1 1 0 0 1 1.4 0l.4.4a1 1 0 0 1 0 1.4L4.4 9.8z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
const FILTER_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5.5h12M6 18.5h12"/><rect x="3" y="4" width="3.2" height="16" rx="1.6"/><rect x="17.8" y="4" width="3.2" height="16" rx="1.6"/><path d="M9 9.2h6M9 12h4.6M9 14.8h3" stroke-width="1.3"/></g></svg>';
const SCR_N = 7;                         // Scriptorium: rows shown at first in each section

// ---------------------------------------------------------------- data
// the work a stored text belongs to: "w:<work>:<part>" → the work's id, an imported text's number → "imp:<n>"
function keyOfText(id) {
  const s = String(id);
  if (/^\d+$/.test(s)) return 'imp:' + s;
  return s.startsWith('w:') ? s.slice(2, s.lastIndexOf(':')) : null;
}
async function libPrep() {
  S.libOpen ??= new Set(); S.libQ ??= '';
  S.lib = S.lib || (await setting('libView')) || null; const v = libView();
  if (!LTABS.some(t => t[0] === v.view)) v.view = 'all';
  S.opened = (await setting('opened')) || {};
  S.favs = (await setting('favs')) || {};
  S.recent ??= (await setting('recent')) || [];
  S.revRej = (await setting('revRej')) || {};
  S.revOn = (await setting('revOn')) ?? true;
  await cachedCatalog();
  const inst = await libWorks();
  S.libInst = Object.fromEntries(inst.map(w => [w.id, w]));
  S.impWorks = (await getAll('texts')).map(impWork);
  await lmTraces(); await revPrevLoad(); await revFlagsLoad(); await trashLoad();
  netCheck();                                                   // reachable? the rows follow when the answer comes
}
// your traces in the works: glosses (counted), markers, words whose analysis you chose
async function lmTraces() {
  const G = new Map(), M = new Set(), A = new Set();
  for (const g of await getAll('glosses')) { const k = keyOfText(g.textId); if (k) G.set(k, (G.get(k) || 0) + 1); }
  const keys = p => req2p(tx('settings').objectStore('settings').getAllKeys(IDBKeyRange.bound(p, p + '￿')));
  for (const k of await keys('mk|')) { const x = keyOfText(k.slice(3)); if (x) M.add(x); }
  for (const k of await keys('an|')) { const x = keyOfText(k.slice(3, k.lastIndexOf('|'))); if (x) A.add(x); }
  S.lmTr = { G, M, A };
}
// a work by its key, from the device or the catalogue
function workInfo(key) {
  if (!key) return null;
  if (key.startsWith('imp:')) { const w = S.impWorks?.find(x => x.id === key); return w ? Object.assign({}, w, { key, inst: true }) : null; }
  const c = S.catWork?.[key], i = S.libInst?.[key], w = c || i; if (!w) return null;
  return Object.assign({}, w, { key, inst: !!i, books: (i || c).books, local: i || null, cat: c || null });
}
const lmOffline = () => S.catOnline === false;
// a revision of a downloaded work (a corrected version in the catalogue), unless rejected or the notices are off
function revAvail(key) {
  const i = S.libInst?.[key], c = S.catWork?.[key];
  return !!(i && c?.v && i.version !== c.v && S.revRej?.[key] !== c.v);
}

// ---------------------------------------------------------------- opening, pages, going back
async function libraryDialog() { return libMenu(''); }
async function navDialog() { return libMenu(curKey()); }
async function libMenu(page) {
  await libPrep();
  S.lmPage = page; S.lwInfo = false; S.navOpen = new Set(); S.navShut = new Set(); S.scrEdit = false; S.lwAsk = null; S.lmPT = new Map(); S.lmRev = null; S.revDone = null;
  if (S.dlgScroll) { delete S.dlgScroll['']; delete S.dlgScroll.Library; }
  if (!S.menuEntry) { history.pushState({ pultMenu: 1 }, ''); S.menuEntry = true; }      // the back gesture: page → overview → closed
  const p = dialog(`<div id="libBody">${page ? await lmWorkHTML(page) : lmOverviewHTML()}</div>`, []);
  const d = $('#dlg'); d.classList.add('lmdlg');
  if (!page) { filterIcon(); renderLibList(); lmWords(); d.scrollTop = S.lmOvY || 0; }
  else requestAnimationFrame(() => $('#navOutline .olrow.on, #navOutline .fr.on')?.scrollIntoView({ block: 'center' }));
  await p;
  d.classList.remove('lmdlg'); document.body.classList.remove('libsheet');
  if (!S.lmPage) S.lmOvY = d.scrollTop;
  if (S.navFind?.href) { URL.revokeObjectURL(S.navFind.href); S.navFind.href = null; S.navFind.save = null; }
}
async function lmGo(page) {
  const d = $('#dlg');
  if (!S.lmPage) S.lmOvY = d.scrollTop;
  S.lmPage = page; S.lwInfo = false; S.navOpen = new Set(); S.navShut = new Set(); S.lwAsk = null; S.lwMenu = null; S.lmRev = null; S.revDone = null;
  await lmRender(false);
  if (!page) d.scrollTop = S.lmOvY || 0;
  else { d.scrollTop = 0; requestAnimationFrame(() => $('#navOutline .olrow.on')?.scrollIntoView({ block: 'center' })); }
}
// the menu drawn again where it was (after a choice, a download …)
async function lmRender(keep = true) {
  const b = $('#libBody'); if (!b) return;
  const d = $('#dlg'), y = d.scrollTop;
  const html = S.lmPage ? await lmWorkHTML(S.lmPage) : lmOverviewHTML();
  b.innerHTML = html;
  const h = b.querySelector('.dlghead'); if (h && !h.querySelector('.dlgx')) h.insertAdjacentHTML('beforeend', '<button type="button" class="dlgx" data-lmclose="1" aria-label="Close" title="Close">✕</button>');
  if (!S.lmPage) { filterIcon(); renderLibList(); lmWords(); }
  if (keep) d.scrollTop = y;
}
addEventListener('popstate', () => {
  if (!$('#dlg').open || !$('#libBody')) return;
  if (S.lmRev) { S.lmRev = null; S.revDone = null; lmRender(false); history.pushState({ pultMenu: 1 }, ''); S.menuEntry = true; }
  else if (S.lmPage) { lmGo(''); history.pushState({ pultMenu: 1 }, ''); S.menuEntry = true; } else $('#dlg').close();
});
document.addEventListener('DOMContentLoaded', () => {
  $('#dlg').addEventListener('cancel', ev => { if (!$('#libBody')) return; if (S.lmRev) { ev.preventDefault(); S.lmRev = null; S.revDone = null; lmRender(false); } else if (S.lmPage) { ev.preventDefault(); lmGo(''); } });   // Android back, Esc
});

// ---------------------------------------------------------------- the overview
function lmTabsHTML() {
  const v = libView(), n = { mine: Object.keys(S.libInst || {}).length + (S.impWorks?.length || 0), fav: Object.keys(S.favs || {}).length };
  return LTABS.map(([id, name, hint]) => `<button type="button" role="tab" class="${v.view === id ? 'on' : ''}" data-view="${id}" aria-selected="${v.view === id}"${hint ? ` title="${hint}"` : ''}><span class="tn">${name}${n[id] ? ` <small>${n[id]}</small>` : ''}</span>${hint ? `<span class="th">${hint}</span>` : ''}</button>`).join('')
    + `<button type="button" class="lmimp" data-limport="1" title="Import text …" aria-label="Import text"><b aria-hidden="true">+</b><span>Import</span></button>`;
}
function libFootHTML() {
  const n = Object.keys(S.libInst || {}).length, tot = Object.values(S.libInst || {}).reduce((a, w) => a + (w.size || 0), 0);
  return `${n} work${n === 1 ? '' : 's'} on this device${tot ? ` · ≈ ${mb(tot)}` : ''}${S.impWorks?.length ? ` · ${S.impWorks.length} imported` : ''}${S.catalog ? ` · the catalogue: ${S.catalog.authors.length} authors, ${Object.keys(S.catWork).length.toLocaleString('en')} works` : ''}`;
}
function lmOverviewHTML() {
  const v = libView(), scr = v.view === 'scr', n = Object.keys(S.libInst || {}).length;
  const tot = Object.values(S.libInst || {}).reduce((a, w) => a + (w.size || 0), 0);
  const at = S.catAt ? new Date(S.catAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const off = lmOffline() ? `<p class="lmoff">Offline${S.catalog ? (at ? ` · catalogue of ${at}` : '') + ' · downloads need a connection' : ' · no catalogue yet – the works on this device are listed'}</p>` : '';
  return `<div class="dlghead lmhead"><h3>Library</h3></div>
    <div class="lmtabs" id="libTabs" role="tablist">${lmTabsHTML()}</div>
    <div class="libtop"><input type="search" id="libSearch" placeholder="Search authors and works (English, Latin or Greek) …" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(S.libQ)}"><button type="button" id="libFilterBtn" title="Filters" aria-label="Filters" aria-expanded="false">${FILTER_ICON}</button></div>
    ${off}<div id="libActive" class="libactive" hidden></div>
    <div id="libCtl" class="libctl" hidden>${libControlsHTML()}</div>
    <div class="libbar"${scr ? ' hidden' : ''}><span class="libcount" id="libCount"></span>${v.view === 'fav' && Object.keys(S.favs || {}).length ? `<button type="button" class="linkb" data-favedit="1">${S.favEdit ? 'Done' : 'Edit'}</button>` : ''}<span class="libsort" id="libSort">${sortBarHTML()}</span></div>
    <div id="libWords"></div>
    <div class="list lib" id="libList"></div>
    <small class="libfoot">${libFootHTML()}</small>`;
}
// the filter icon is highlighted while any filter is on; the active filters show as chips while the panel is closed
function filterIcon() {
  const b = $('#libFilterBtn'); if (!b) return;
  const open = !$('#libCtl').hidden;
  b.classList.toggle('active', !!filtersOn(libView())); b.classList.toggle('open', open);
  b.setAttribute('aria-expanded', open);
  const ac = $('#libActive'); if (ac) { ac.innerHTML = open ? '' : libActiveHTML(); ac.hidden = !ac.innerHTML; }
  if (open) ftRender();
}
function renderLibControls() {
  const c = $('#libCtl'); if (c) c.innerHTML = libControlsHTML();
  const so = $('#libSort'); if (so) so.innerHTML = sortBarHTML();
  const tb = $('#libTabs'); if (tb) tb.innerHTML = lmTabsHTML();
  filterIcon();
}
// a work in the lists: flame · title (lighter when not on this device; in flat lists the author faint beside it), Greek title,
// a line of details · on the right a slot for the download button; a marker as a ribbon hanging from the row's top edge
// at a fixed place (it does not take room from the title)
const RIBBON = '<i class="rib" title="Marker" aria-label="Marker"></i>';
// the download icon of a work (dialogs.js): download, or – on this device – revision and Delete; a work deleted within 7 days
// is restored by it at once
const lmIcon = (w, inst, off) => w.imported ? (S.trashImp?.[w.id] ? dlIcon('work:' + w.id, { rst: S.trash[w.id] }) : '') : dlIcon('work:' + w.id, { have: inst, rev: inst && S.revOn && revAvail(w.id), size: w.bytes, off: off && !S.trash?.[w.id], rst: !inst && S.trash?.[w.id] || 0 });
function lmRowHTML(w, flat = false) {
  const key = w.id, inst = !!((w.imported && !S.trashImp?.[key]) || S.libInst[key]), cur = curKey() === key;
  const a = authorOf(w), off = !inst && lmOffline() && !S.trash?.[key];
  const right = S.favEdit && libView().view === 'fav' ? `<button type="button" class="scrm" data-favrm="${esc(key)}" aria-label="Remove from favourites" title="Remove from favourites">✕</button>` : (S.catalog || inst || DL.has('work:' + key)) ? lmIcon(w, inst, off) : '';
  const info = [flat && a.date ? a.date : '', workLang(w) === 'la' ? 'Latin' : '', w.imported ? 'imported' : (w.verse ? 'verse' : 'prose'),
    w.books?.length > 1 ? w.books.length + ' parts' : '', w.words ? w.words.toLocaleString('en') + ' words' : ''].filter(Boolean).join(' · ');
  return `<div class="item lrow${inst ? '' : ' nodl'}${off ? ' off' : ''}${cur ? ' cur' : ''}" data-lw="${esc(key)}">${S.lmTr?.M.has(key) ? RIBBON : ''}`
    + `<span class="t"><span class="lt">${esc(w.title)}</span>${flat ? ` <span class="by">${esc(a.name)}</span>` : ''}${w.greek && w.greek !== w.title ? ` <span class="gk">${esc(w.greek)}</span>` : ''}<small>${esc(info)}</small></span><span class="lr">${right}</span></div>`;
}
// an author: name; beneath it the dates, the number of works ("20" on a narrow screen) and how many are on this device;
// "download all" on the right
function lmAuthorHTML(a, ws, open) {
  const inst = a.works.filter(w => S.libInst[w.id] || w.imported).length;
  const n = ws.length < a.works.length ? `${ws.length} of ${a.works.length}<span class="wnw"> works</span>` : `${a.works.length}<span class="wnw"> work${a.works.length > 1 ? 's' : ''}</span>`;
  const sub = [a.date ? esc(a.date) : '', `<span class="wn">${n}</span>`, inst && libView().view === 'all' ? `<span class="ok">${inst} on this device</span>` : ''].filter(Boolean).join(' · ');
  return `<details class="auth" data-a="${a.id}"${open ? ' open' : ''}><summary><span class="t"><b>${esc(a.name)}</b><small>${sub}</small></span><span class="dlc">${authIconHTML(a, ws)}</span></summary><div class="works">${open ? ws.map(w => lmRowHTML(w)).join('') : ''}</div></details>`;
}
// ---- an author's download icon: an overview of their works that the filters show (imported texts aside). Empty: a tap
// downloads them all (in the bin, all of them: the return arrow, restored at once); partly on the device: filled in
// proportion, a tap offers the rest and Delete all; all there: filled, a tap offers Delete all; while downloading: the
// fill rises with the size of all (what is on the device included); some failed: ↻ tries them again
function authState(ws) {
  const W = ws.filter(w => !w.imported); if (!W.length) return null;
  const sz = w => w.bytes || S.libInst[w.id]?.size || 0;
  let T = 0, H = 0, busy = 0, prog = 0; const miss = [], fail = [], trash = [], have = [];
  for (const w of W) {
    const s = sz(w), id = 'work:' + w.id; T += s;
    if (DL.has(id)) { busy++; prog += s * Math.max(0, DL.get(id)); }
    else if (S.libInst[w.id]) { H += s; have.push(w); }
    else { miss.push(w); if (DLX.get(id)?.err) fail.push(w); if (S.trash?.[w.id]) trash.push(w); }
  }
  return { W, T, H, busy, prog, miss, fail, trash, have, rest: miss.reduce((x, w) => x + sz(w), 0) };
}
function authIconHTML(a, ws) {
  const st = authState(ws); if (!st) return '';
  const { W, T, H, busy, prog, miss, fail, trash } = st, pc = Math.round((T ? (H + prog) / T : 0) * 100) + '%', aid = esc(a.id);
  const off = lmOffline() && trash.length < miss.length;
  if (busy) return `<button type="button" class="dli busy" data-authstop="${aid}" style="--p:${pc}" title="Downloading ${busy} of ${W.length} – tap to stop" aria-label="Downloading – tap to stop">${DLARROW}</button>`;
  if (fail.length) return `<button type="button" class="dli fail" data-authget="${aid}" title="${fail.length} failed – tap to try again" aria-label="Try again">↻</button>`;
  if (!miss.length) return `<button type="button" class="dli done" data-authpop="${aid}" title="All on this device" aria-label="All on this device">${DLARROW}</button>`;
  if (miss.length < W.length) return `<button type="button" class="dli part" data-authpop="${aid}" style="--f:${pc}" title="${W.length - miss.length} of ${W.length} on this device" aria-label="${W.length - miss.length} of ${W.length} on this device">${DLARROW}</button>`;
  const rst = trash.length === miss.length;
  return `<button type="button" class="dli${rst ? ' rst' : ''}" ${rst ? 'data-authrpop' : 'data-authget'}="${aid}" title="${rst ? 'Restore – kept on this device' : `Download ${W.length === 1 ? 'the work' : `all ${W.length} works`} (${mb(st.rest)})`}" aria-label="${rst ? 'Restore' : 'Download all'}"${off ? ' disabled' : ''}>${rst ? RSTARROW : DLARROW}</button>`;
}
const authFind = id => libAuthors().find(a => a.id === id);
// a work's download moved on: the icon of its author follows (at most once a frame)
function authPaint(wid) {
  if (!$('#libList')) return;
  const a = libAuthors().find(x => x.works.some(w => w.id === wid)); if (!a) return;
  (authPaint.q ??= new Set()).add(a.id);
  if (authPaint.f) return;
  authPaint.f = requestAnimationFrame(() => { authPaint.f = 0;
    for (const id of authPaint.q) { const el = document.querySelector(`#libList details.auth[data-a="${CSS.escape(id)}"] .dlc`), x = authFind(id); if (el && x && !el.querySelector('.open')) el.innerHTML = authIconHTML(x, libFilter(x)); }
    authPaint.q.clear(); });
}
function authQueue(a) {
  const st = authState(libFilter(a)); if (!st) return;
  navigator.storage?.persist?.().catch(() => { });
  for (const w of st.miss) { const id = 'work:' + w.id; DLX.delete(id); DL.set(id, -1); paintDL(id); }
  runDownloads(); authPaint(st.W[0].id);
}
document.addEventListener('click', async ev => {
  const b = ev.target.closest?.('#libList [data-authget],#libList [data-authrpop],#libList [data-autherase],#libList [data-authpop],#libList [data-authstop],#libList [data-authrest],#libList [data-authdel],#libList [data-authstopgo],#libList [data-authgo]'); if (!b) return;
  ev.preventDefault(); ev.stopPropagation();
  const d = b.dataset, a = authFind(d.authget || d.authrpop || d.autherase || d.authpop || d.authstop || d.authrest || d.authdel || d.authstopgo || d.authgo); if (!a) return;
  if (d.authget) { dlPopClose(); return authQueue(a); }
  if (d.authrest) { dlPopClose(); return authQueue(a); }
  if (d.autherase) { dlPopClose(); const st = authState(libFilter(a)); for (const w of st?.trash || []) await workPurge(w.id); return renderLibList(); }
  if (d.authrpop) return dlPopAt(b, `<button type="button" data-authrest="${esc(a.id)}">Restore all</button><button type="button" class="danger" data-autherase="${esc(a.id)}">Erase all</button>`);
  if (d.authdel) { dlPopClose(); const st = authState(libFilter(a)); for (const w of st?.have || []) await trashWork(w.id); return renderLibList(); }
  if (d.authpop) {                                                   // the choice to the left of the icon
    const open = b.classList.contains('open'); dlPopClose(); if (open) return;
    const st = authState(libFilter(a)), row = b.closest('summary'), rr = row.getBoundingClientRect(), br = b.getBoundingClientRect();
    const restOff = lmOffline() && st.trash.length < st.miss.length;
    row.classList.add('dlhost'); b.classList.add('open');
    row.insertAdjacentHTML('beforeend', `<span class="dlpop" style="right:${Math.round(rr.right - br.left + 6)}px;top:${Math.round(br.top - rr.top + br.height / 2)}px">`
      + (st.miss.length ? `<button type="button" data-authrest="${esc(a.id)}"${restOff ? ' disabled' : ''}>Download the rest (${st.miss.length})</button>` : '')
      + `<button type="button" class="danger" data-authdel="${esc(a.id)}">Remove all</button></span>`);
    dlPopClose.t = setTimeout(dlPopClose, 5000); return;
  }
  if (d.authstop) {                                                  // stopping: asked beneath the author
    document.querySelectorAll('#dlg .dlask').forEach(x => x.remove());
    b.closest('details.auth').insertAdjacentHTML('afterend', `<div class="dlask"><span>Stop downloading the works of ${esc(a.name)}?</span><button type="button" class="danger" data-authstopgo="${esc(a.id)}">Stop</button><button type="button" data-authgo="${esc(a.id)}">Continue</button></div>`);
    return;
  }
  if (d.authstopgo || d.authgo) {
    b.closest('.dlask')?.remove();
    if (d.authstopgo) for (const w of a.works) { const id = 'work:' + w.id; if (DL.has(id)) dlStop(id); }
    return authPaint(a.works[0]?.id);
  }
}, true);
document.addEventListener('click', async ev => {                    // Recently removed: all of them (shown) erased
  const b = ev.target.closest?.('#libList [data-trashall], #dlg .dlask [data-trashall]'); if (!b) return;
  ev.preventDefault(); ev.stopPropagation();
  const ids = b.dataset.trashall.split('\n'), imp = ids.filter(id => id.startsWith('imp:')).length;
  if (imp && !b.dataset.sure) {                                    // imported texts cannot be downloaded again: asked first
    document.querySelectorAll('#dlg .dlask').forEach(x => x.remove());
    const n = ids.length - imp, pl = (k, s) => `${k} ${s}${k === 1 ? '' : 's'}`;
    b.closest('details').insertAdjacentHTML('afterend', `<div class="dlask"><span>Erase ${[n ? pl(n, 'work') : '', pl(imp, 'imported text')].filter(Boolean).join(' and ')}?</span><button type="button" class="danger" data-trashall="${esc(b.dataset.trashall)}" data-sure="1">Erase</button><button type="button" data-dlgo="1">Cancel</button></div>`);
    return;
  }
  b.closest('.dlask')?.remove();
  for (const id of ids) await workPurge(id);
  renderLibList();
}, true);
// Armarium: the works deleted in the last 7 days (most recent first), folded beneath the shelf
function trashGroupHTML() {
  const q = fold(S.libQ), ws = Object.entries(S.trash || {}).sort((x, y) => y[1] - x[1]).map(([id]) => S.trashImp?.[id] || S.catWork?.[id]).filter(w => w && !S.libInst[w.id] && workPasses(w, q, true));
  if (!ws.length) return '';
  return `<details class="auth trashg"${S.trashOpen ? ' open' : ''}><summary><span class="t"><b>Recently removed</b><small>${ws.length} work${ws.length === 1 ? '' : 's'} · kept 7 days</small></span><button type="button" class="linkb trashall" data-trashall="${esc(ws.map(w => w.id).join('\n'))}">Erase all</button></summary><div class="works">${ws.map(w => lmRowHTML(w, true)).join('')}</div></details>`;
}
function renderLibList() {
  const el = $('#libList'); if (!el) return;
  const q = fold(S.libQ), v = libView();
  if (v.view === 'scr') { el.innerHTML = scrHTML(); return; }
  S.libLimit ??= 250;
  let html = '', n = 0, nw = 0;
  if (v.view === 'fav') {                                          // favourites: one flat list, the author beside each title
    const ws = sortedWorks(); nw = ws.length;
    html = ws.map(w => lmRowHTML(w, true)).join('');
  } else if (v.sort === 'author' || v.sort === 'adate') {
    const byDate = (x, y) => (x.year == null) - (y.year == null) || v.dir * ((x.year ?? 0) - (y.year ?? 0)) || x.name.localeCompare(y.name);   // (undated at the end)
    const as = libAuthors().slice().sort(v.sort === 'adate' ? byDate : (x, y) => v.dir * x.name.localeCompare(y.name)).map(a => [a, libFilter(a)]).filter(x => x[1].length);
    const few = v.view !== 'all' && as.reduce((t, x) => t + x[1].length, 0) <= 30;       // your own shelves, when short: unfolded
    for (const [a, ws] of as) {
      n++; nw += ws.length;
      html += lmAuthorHTML(a, ws, S.libOpen.has(a.id) || (q && !fold(a.name).includes(q)) || few);
    }
  } else {
    const ws = sortedWorks(); nw = ws.length;
    html = ws.slice(0, S.libLimit).map(w => lmRowHTML(w, true)).join('')
      + (ws.length > S.libLimit ? `<div class="row" style="justify-content:center"><button type="button" data-more="1">Show more (${ws.length - S.libLimit} further)</button></div>` : '');
  }
  const cnt = `${nw.toLocaleString('en')} work${nw === 1 ? '' : 's'}`;
  const c = $('#libCount'); if (c) c.textContent = nw ? cnt + (n ? ` by ${n} author${n === 1 ? '' : 's'}` : '') : '';
  const sh = $('#libShowN'); if (sh) sh.textContent = nw ? `Show ${cnt}` : 'No works match';
  const empty = v.view === 'fav' && !Object.keys(S.favs || {}).length ? 'No favourites yet – tap the flame next to a work.'
    : v.view === 'mine' && !Object.keys(S.libInst || {}).length && !S.impWorks?.length ? 'No works on this device yet – download them in Bibliotheca, or import a text (+).'
    : v.view === 'all' && !S.catalog && !Object.keys(S.libInst || {}).length ? 'The catalogue could not be loaded yet (offline?).'
    : `Nothing found${S.libQ ? ' for “' + esc(S.libQ) + '”' : ''} with these filters.`;
  const tg = v.view === 'mine' ? trashGroupHTML() : '';
  el.innerHTML = (html || `<p class="hint">${empty}</p>`) + tg;
  const f = $('#dlg .libfoot'); if (f) f.innerHTML = libFootHTML();                 // (the counts follow removals and downloads)
  const tb = $('#libTabs'); if (tb) tb.innerHTML = lmTabsHTML();
}

// ---------------------------------------------------------------- Scriptorium: recently read · annotated
// a reading position as the reader knows it: "14.212" (part and section) or "37.1"
function posLabel(key, r) {
  const W = workInfo(key); if (!W || !r) return '';
  const bi = typeof r.id === 'string' && r.id.startsWith('w:') ? +r.id.slice(r.id.lastIndexOf(':') + 1) : null;
  const multi = W.books?.length > 1 && bi != null;
  return multi ? stripCommon(W.books)[bi] + (r.sec ? '.' + r.sec : '') : r.sec || '';
}
function scrRowHTML(key, r) {
  const W = workInfo(key); if (!W) return '';
  const a = authorOf(W), nG = S.lmTr?.G.get(key) || 0, cur = curKey() === key, inst = W.inst, fav = !!S.favs?.[key];
  const pos = posLabel(key, r), edit = S.scrEdit && r;
  // "1.171 ἀπολείποντες βιαζόμενοι … · 12 glosses" – on a narrow screen the count as a small raised figure
  const gl = nG ? `<span class="gc"> · ${nG.toLocaleString('en')} gloss${nG === 1 ? '' : 'es'}</span><sup class="gcs" title="${nG} gloss${nG === 1 ? '' : 'es'}">${nG.toLocaleString('en')}</sup>` : '';
  return `<div class="item lrow srow${inst ? '' : ' nodl'}${cur ? ' cur' : ''}" data-lw="${esc(key)}">${S.lmTr?.M.has(key) ? RIBBON : ''}`
    + `<span class="t"><span class="lt">${esc(W.title)}</span> <span class="by">${esc(a.name)}</span>`
    + (pos || r?.line || nG ? `<span class="sp">${pos ? `<b>${esc(pos)}</b>` : ''}${r?.line ? `<span class="gk">${esc(r.line)} …</span>` : '<span class="gk"></span>'}${gl}</span>` : '') + '</span>'
    + `<span class="lr">${edit ? `<button type="button" class="scrm" data-scrm="${esc(key)}" aria-label="Remove from Scriptorium" title="Remove from Scriptorium (the work stays)">✕</button>` : lmIcon(W, inst, false)}</span></div>`;
}
function scrLists() {
  const q = fold(S.libQ), ok = key => { const W = workInfo(key); return W && workPasses(W, q); };
  const rec = (S.recent || []).filter(r => ok(r.key)), seen = new Set(rec.map(r => r.key));
  const T = S.lmTr || { G: new Map(), M: new Set(), A: new Set() };
  const ann = [...new Set([...T.G.keys(), ...T.M, ...T.A])].filter(k => !seen.has(k) && !(S.recent || []).some(r => r.key === k) && ok(k))
    .sort((a, b) => (S.opened?.[b] || 0) - (S.opened?.[a] || 0) || (T.G.get(b) || 0) - (T.G.get(a) || 0));
  return { rec, ann };
}
function scrHTML() {
  const { rec, ann } = scrLists(), nr = S.scrN || SCR_N, na = S.scrNA || SCR_N;
  const more = (n, all, k) => all > n ? `<button type="button" class="lmmore" data-${k}="1">Show more (${all - n})</button>` : '';
  let h = `<div class="lsec"><div class="lsh"><span>Recently read</span>${rec.length ? `<button type="button" class="linkb" data-scredit="1">${S.scrEdit ? 'Done' : 'Edit'}</button>` : ''}</div>`
    + (rec.length ? rec.slice(0, nr).map(r => scrRowHTML(r.key, r)).join('') + more(nr, rec.length, 'scmore') : '<p class="hint small">Nothing read yet.</p>') + '</div>';
  h += `<div class="lsec"><div class="lsh"><span>Annotated</span></div>`
    + (ann.length ? ann.slice(0, na).map(k => scrRowHTML(k, null)).join('') + more(na, ann.length, 'anmore') : '<p class="hint small">Works with your glosses, markers or chosen analyses appear here (when not under Recently read).</p>') + '</div>';
  return h;
}

// ---------------------------------------------------------------- words in the texts (Settings → Search: on by default)
async function lmWords() {
  const box = $('#libWords'); if (!box) return;
  const q = (S.libQ || '').trim(), my = S.lwSeq = (S.lwSeq || 0) + 1;
  box.innerHTML = '';
  if (q.length < 2 || S.sc?.libWords === false || typeof idxState !== 'function') return;
  try {
    const st = await idxState(); if (!st.done || my !== S.lwSeq) return;
    const plan = searchPlan(q), L = new Map();
    for (const h of await findKeys(plan, { limit: 20, fuzzy: false })) if (h.d === 0) L.set(h.k, h.k);
    for (const f of await formsFor(plan)) L.set(gkey(f.lemma), f.lemma);
    if (!L.size || my !== S.lwSeq) return;
    const by = await idxLookup([...L.keys()]), W = new Map();
    for (const [pid, pos] of by) { const k = pid.startsWith('i:') ? 'imp:' + pid.slice(2) : pid.startsWith('w:') ? pid.slice(2, pid.lastIndexOf(':')) : null; if (k && workInfo(k)) W.set(k, (W.get(k) || 0) + pos.length); }
    if (!W.size || my !== S.lwSeq) return;
    const lem = [...L.values()][0], rows = [...W.entries()].sort((a, b) => b[1] - a[1]);
    const row = ([k, n]) => { const w = workInfo(k), a = authorOf(w); return `<button type="button" class="item lrow lwrow" data-lww="${esc(k)}" data-lem="${esc(lem)}"><span class="t"><span class="lt">${esc(w.title)}</span> <small class="sa">${esc(a.name)}</small></span><span class="lr"><small class="gc">${n.toLocaleString('en')} place${n === 1 ? '' : 's'}</small></span></button>`; };
    box.innerHTML = `<div class="lsec lwords"><div class="lsh"><span>In the texts on this device <small>· <span class="gk">${esc(lem)}</span>${L.size > 1 ? ` and ${L.size - 1} more` : ''}</small></span></div>${rows.slice(0, S.lwN || 5).map(row).join('')}${rows.length > (S.lwN || 5) ? `<button type="button" class="lmmore" data-lwmore="1">Show more (${rows.length - (S.lwN || 5)})</button>` : ''}</div>`;
  } catch (e) { console.warn('library words', e); }
}

// ---------------------------------------------------------------- the page of a work
async function lmWorkHTML(key) {
  const W = workInfo(key); if (!W) { S.lmPage = ''; return lmOverviewHTML(); }
  if (S.lmRev) return revPageHTML(key);                              // Library › Work › Revision (librev.js)
  const a = authorOf(W), cur = curKey() === key, fav = !!S.favs?.[key], dk = 'work:' + key, off = lmOffline();
  const F = navFindFor(key), r = (S.recent || []).find(x => x.key === key);
  let h = `<div class="dlghead lmhead lwhead"><h3><button type="button" class="crumb" data-lmback="1" title="Back to the Library">Library</button><span class="csep" aria-hidden="true">›</span><span class="ccur">${esc(W.title)}</span></h3></div>`;
  if (W.inst) h += `<div class="navsearch lmfind"><input type="search" id="navFind" class="nofocus" value="${esc(F?.q || '')}" placeholder="Find in this ${W.books?.length > 1 ? 'work' : 'text'} …" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Find in this work">`
    + `<span class="seg" role="group">${[['form', 'Form'], ['lemma', 'Lemma']].map(([v, l]) => `<button type="button" data-findmode="${v}" class="${(S.findMode || 'form') === v ? 'on' : ''}" title="${v === 'form' ? 'This word form (accents ignored, * = any letters)' : 'All forms of this dictionary headword'}">${l}</button>`).join('')}</span></div>`;
  // one line about the work (the flame first); ⓘ unfolds the rest
  const facts = [a.name, a.date, workLang(W) === 'la' ? 'Latin' : 'Greek', W.books?.length > 1 ? W.books.length + ' parts' : W.imported ? 'imported text' : ''].filter(Boolean);
  const more = [[W.words ? W.words.toLocaleString('en') + ' words' : '', W.imported ? '' : (W.verse ? 'verse' : W.verse === false ? 'prose' : ''), W.imported ? '' : W.source].filter(Boolean).join(' · '),
    W.edition, W.license || W.local?.license, W.notes].filter(Boolean);
  h += `<div class="lwinfo"><div class="lwl"><span class="lwf">${W.greek && W.greek !== W.title ? `<span class="gk">${esc(W.greek)}</span> · ` : ''}${facts.map(esc).join(' · ')}</span>`
    + (more.length ? `<button type="button" class="lwi" data-lwi="1" aria-expanded="${!!S.lwInfo}" title="About this edition" aria-label="About this edition">i</button>` : '')
    + `<span class="lwsp"></span>${lmIcon(W, W.inst, off && !S.trash?.[key])}<button type="button" class="lwm" data-lwm="1" aria-expanded="${S.lwMenu === key}" title="More" aria-label="More">⋯</button></div>`
    + (more.length && S.lwInfo ? `<div class="lwmore">${more.map(x => `<small>${esc(x)}</small>`).join('')}</div>` : '')
    + (S.lwMenu === key && S.lwAsk !== key ? `<div class="lwmenu"><div class="lwmi"><button type="button" data-fav="1">${fav ? 'Remove from favourites' : 'Add to favourites'}</button>${revAvail(key) ? `<button type="button" data-revshow="${esc(key)}">See the revision</button>` : ''}${W.imported ? `<button type="button" data-iedit="${W.tid}">Edit</button><button type="button" class="danger" data-lwdel="1">Remove</button>` : ''}</div></div>` : '') + '</div>';
  if (!W.inst && S.trash?.[key]) h += `<p class="lwrev">Removed on ${new Date(S.trash[key]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · restorable until ${new Date(S.trash[key] + 7 * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>`;
  if (!W.inst && DLX.get(dk)?.err) h += `<p class="lwrev">${esc(DLX.get(dk).err)}</p>`;
  // Continue reading (alone on its line); deleting an imported text is asked here
  let act = '';
  if (S.lwAsk === key) act = `<div class="lwask"><span>Delete “${esc(W.title)}” and all its glosses from this device?</span><button type="button" class="danger" data-lwdelok="1">Delete</button><button type="button" data-lwdelno="1">Cancel</button></div>`;
  else if (W.inst && !cur && r) act = `<button type="button" class="acc lwcont" data-lcont="${esc(key)}">Continue reading${posLabel(key, r) ? ` at <b>${esc(posLabel(key, r))}</b>` : ''}</button>`;
  h += `<div class="lwact">${act}</div>`;
  if (typeof revBackHTML === 'function') h += revBackHTML(key);
  if (W.inst) h += `<div id="navOutline" class="outline">${F ? resultsHTML(F) : await outlineHTML(key)}</div>`;
  else h += `<div class="outline lwparts">${(W.books || []).map(b => `<div class="olrow d0 part off"><span class="olt"></span><span class="olj"><span class="olx">${esc(b)}</span></span></div>`).join('')}</div><p class="hint small">Download the work to read it.</p>`;
  return h;
}
const navFindFor = key => S.navFind && S.navFind.key === key ? S.navFind : null;

// ---- the outline of a work: parts › chapters › sections (any depth); in the open work the path to the reading position
// is unfolded and the section marked; a mark on the right where you left a marker or glosses
async function refsFor(key, bi) {
  if (curKey() === key && (bi == null || bi === S.text.bi)) return S.refs || [];
  S.partRefCache ??= {}; const ck = key + '|' + bi;
  if (!S.partRefCache[ck]) { const P = await workPart(key, bi); S.partRefCache[ck] = P ? refsOf(P.toks, P.blocks) : []; }
  return S.partRefCache[ck];
}
// your traces in one part: gloss positions (sorted) and the marker
async function partTraces(key, bi) {
  const ck = key + '|' + bi; if (S.lmPT?.has(ck)) return S.lmPT.get(ck);
  const tid = textIdOf(key, bi);
  const gl = (await req2p(tx('glosses').objectStore('glosses').index('textId').getAll(tid))).map(g => g.s).sort((a, b) => a - b);
  const T = { gl, mk: (await setting('mk|' + tid)) ?? null };
  (S.lmPT ??= new Map()).set(ck, T); return T;
}
function refSpan(list, r) { const j = list.indexOf(r); return [r.i, list[j + 1]?.i ?? Infinity]; }
function rangeHas(T, a, b) {
  const g = T.gl; let lo = 0, hi = g.length; while (lo < hi) { const m = (lo + hi) >> 1; if (g[m] < a) lo = m + 1; else hi = m; }
  return { gl: lo < g.length && g[lo] < b, mk: T.mk != null && T.mk >= a && T.mk < b };
}
function nodeRange(n, list) {           // the words a node of the outline covers
  const f = firstRef(n); let l = n; while (l.kids.length) l = l.kids[l.kids.length - 1];
  const last = l.ref || f; return [f.i, refSpan(list, last)[1]];
}
function marksHTML(m) { return (m.mk ? BMARK : '') + (m.gl ? GMARK : ''); }
function outlineNodes(nodes, part, cr, depth, list, T) {
  let h = '';
  for (const n of nodes) {
    const key = part + '|' + n.id, kids = n.kids.length, onPath = cr && treeHas(n, cr);
    const open = kids && (S.navOpen.has(key) || (onPath && !S.navShut.has(key)));
    const r = firstRef(n), title = r ? r.lab + (r.more ? ' …' : '') : '';
    const m = T ? rangeHas(T, ...nodeRange(n, list)) : {};
    h += `<div class="olrow d${Math.min(depth, 4)}${n.ref && n.ref === cr ? ' on' : ''}${onPath ? ' path' : ''}">`
      + (kids ? `<button type="button" class="olt" data-olt="${esc(key)}" aria-expanded="${!!open}" aria-label="${open ? 'Fold' : 'Unfold'}">${open ? '▾' : '▸'}</button>` : '<span class="olt"></span>')
      + `<button type="button" class="olj" data-sec="${esc(r?.s || '')}" data-secpart="${part}"><span class="oln">${esc(n.seg)}</span><span class="olx">${esc(title)}</span></button>`
      + `<button type="button" class="olrest" ${kids ? `data-olt="${esc(key)}" aria-expanded="${!!open}"` : `data-olnone="${esc(key)}"`} tabindex="-1" aria-hidden="true"><span class="olm">${marksHTML(m)}</span>${kids && !open ? `<span class="olc">${kids}</span>` : ''}</button></div>`;
    if (open) h += outlineNodes(n.kids, part, cr, depth + 1, list, T);
  }
  return h;
}
async function outlineHTML(key) {
  const W = workInfo(key); if (!W) return '';
  const t = S.text, cur = curKey() === key, cr = cur ? curRef() : null;
  if (W.imported || W.books.length < 2) {
    const bi = W.imported ? null : 0, list = await refsFor(key, bi), tree = refTree(list), T = await partTraces(key, bi);
    return tree.kids.length ? outlineNodes(tree.kids, bi ?? '', cr, 0, list, T) : '<p class="hint" style="font-size:13px">This text has no numbered sections.</p>';
  }
  let h = '';
  for (let bi = 0; bi < W.books.length; bi++) {
    const k = 'part|' + bi, here = cur && bi === t.bi, open = S.navOpen.has(k) || (here && !S.navShut.has(k));
    const T = await partTraces(key, bi), m = { mk: T.mk != null, gl: T.gl.length > 0 };
    h += `<div class="olrow d0 part${here ? ' path' : ''}"><button type="button" class="olt" data-olt="${k}" aria-expanded="${open}">${open ? '▾' : '▸'}</button>`
      + `<button type="button" class="olj" data-sec="" data-secpart="${bi}"><span class="olx">${esc(W.books[bi])}</span></button>`
      + `<button type="button" class="olrest" data-olt="${k}" aria-expanded="${open}" tabindex="-1" aria-hidden="true"><span class="olm">${marksHTML(m)}</span></button></div>`;
    if (open) { const list = await refsFor(key, bi), tree = refTree(list); h += tree.kids.length ? outlineNodes(tree.kids, bi, here ? cr : null, 1, list, T) : '<p class="hint" style="font-size:13px;margin:.2rem 0 .4rem 2.4rem">No numbered sections.</p>'; }
  }
  return h;
}
// a place of a work (open or not): it opens in the text behind the menu
async function lmGoPlace(key, bi, ref, word = null) {
  if (curKey() !== key) await openText(textIdOf(key, bi), false);
  await goPlace(key.startsWith('imp:') ? null : bi, ref || null, word);
}

// ---- the search in a work: results as the outline cut down to the parts or chapters with hits
function resultsHTML(F) {
  const multi = F.books.length > 1, what = `<b class="gk">${esc(F.q)}</b> <small>(${F.mode === 'lemma' ? 'lemma' : 'form'})</small>`;
  if (F.busy) return `<div class="fhead"><span>${what} · searching … ${Math.round(F.p * 100)} %</span></div>`;
  if (!F.res.length) return `<div class="fhead"><span>${what} · not found</span><button type="button" data-fclear="1">Outline</button></div>`
    + (F.mode === 'lemma' ? '<p class="hint" style="font-size:13px">Not found as a lemma – try the form, or check the spelling of the dictionary headword.</p>' : '');
  const G = findGroups(F);
  F.open ??= new Set(F.res.length <= 30 ? G.map(x => x.key) : [(G.find(x => multi && curKey() === F.key && x.key === String(S.text.bi)) || G[0]).key]);
  const n = F.res.length, cnt = `${n >= 2000 ? 'more than 2,000' : n.toLocaleString('en')} place${n === 1 ? '' : 's'}`;
  let h = `<div class="fhead"><span>${what} · ${cnt}</span><button type="button" data-fexp="1"${F.exp ? ' class="on"' : ''}>Export</button><button type="button" data-fclear="1" title="Back to the outline">Outline</button></div>`
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
async function lmRunFind(q, mode) {
  q = (q || '').trim(); const key = S.lmPage; if (!q || !key) return;
  const W = workInfo(key), a = authorOf(W);
  const F = S.navFind = { key, q, mode: mode || S.findMode || 'form', res: [], busy: true, p: 0, books: W.imported ? [W.title] : W.books, title: `${a.name} – ${W.title}` };
  const out = () => { if (S.navFind === F && S.lmPage === key) { const ol = $('#navOutline'); if (ol) ol.innerHTML = resultsHTML(F); } };
  out();
  let last = 0;
  F.res = await findInWork(q, F.mode, p => { F.p = p; if (Date.now() - last > 150) { last = Date.now(); out(); } }, key);
  F.busy = false; out();
}

// ---------------------------------------------------------------- what is tapped
// was the tap on the text itself (its letters' boxes, a few pixels around them), not on the empty part beside it?
function onText(ev, el) {
  if (!el) return false;
  const r = document.createRange(), w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);   // (the text itself, not the boxes around it)
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.textContent.trim()) continue; r.selectNodeContents(n);
    if ([...r.getClientRects()].some(q => q.width && ev.clientX >= q.left - 3 && ev.clientX <= q.right + 3 && ev.clientY >= q.top - 3 && ev.clientY <= q.bottom + 3)) return true;
  }
  return false;
}
function wireLibrary() {
  wireDateLine();
  const later = () => new Promise(r => setTimeout(r, 160));          // (the text has scrolled to the place: its section is known)
  document.addEventListener('input', ev => {
    if (ev.target.id === 'libSearch') { clearTimeout(wireLibrary.t); wireLibrary.t = setTimeout(() => { S.libQ = ev.target.value.trim(); S.libLimit = 250; S.lwN = 0; renderLibList(); lmWords(); }, 150); }
    if (ev.target.id === 'navFind' && !ev.target.value.trim() && S.navFind) { S.navFind = null; lmRender(); }   // the field emptied: the outline again
  });
  document.addEventListener('change', ev => {
    if (ev.target.id === 'libUndated' || ev.target.id === 'libSortSel') {
      const v = libView();
      if (ev.target.id === 'libUndated') v.undated = ev.target.checked;
      else { v.sort = ev.target.value; v.dir = SORTS.find(s => s[0] === v.sort)[2]; }
      S.libLimit = 250; saveLibView(); renderLibControls(); renderLibList();
    }
  });
  document.addEventListener('toggle', ev => {
    const d = ev.target; if (d.matches?.('#libList details.trashg')) { S.trashOpen = d.open; return; }
    if (!d.matches?.('#libList details.auth')) return;
    const id = d.dataset.a;
    if (d.open) { S.libOpen.add(id); const a = libAuthors().find(x => x.id === id); d.querySelector('.works').innerHTML = libFilter(a).map(w => lmRowHTML(w)).join(''); }
    else S.libOpen.delete(id);
  }, true);
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter' || ev.isComposing || ev.target.id !== 'navFind' || !$('#libBody')) return;
    ev.preventDefault(); ev.stopPropagation(); ev.target.blur(); lmRunFind(ev.target.value);
  }, true);
  // a long press on a tab shows its explanation beneath the name (a mouse: hovering)
  let lp = 0, lpTab = null;
  document.addEventListener('pointerdown', ev => {
    const tb = ev.target.closest?.('#libTabs [data-view]'); if (!tb || ev.pointerType === 'mouse') return;
    clearTimeout(lp); lp = setTimeout(() => { lpTab = tb; tb.classList.add('hint'); }, 450);
  });
  const lpEnd = () => { clearTimeout(lp); if (lpTab) { const t = lpTab; lpTab = null; S.lpUntil = Date.now() + 600; setTimeout(() => t.classList.remove('hint'), 1600); } };
  document.addEventListener('pointerup', lpEnd); document.addEventListener('pointercancel', lpEnd);
  document.addEventListener('click', async ev => {
    const body = ev.target.closest('#libBody'); if (!body) return;
    const b = ev.target.closest('button,a,summary,.lrow'), d = b?.dataset || {};
    if (!b) return;
    if (d.lmclose) return $('#dlg').close();
    if (d.lmback) return lmGo('');
    if (d.limport) { $('#dlg').close(); return importDialog(null, true); }
    // the overview: tabs, filters, sorting
    if (b.id === 'libFilterBtn') { $('#libCtl').hidden = !$('#libCtl').hidden; filterIcon(); return; }
    if (d.view) {
      if (Date.now() < (S.lpUntil || 0)) return;                  // (the long press showed the hint: no switch)
      const v = libView(); v.view = d.view; S.libLimit = 250; S.scrEdit = false; saveLibView(); return lmRender(false).then(() => { $('#dlg').scrollTop = 0; });
    }
    const f = b.closest('#libCtl [data-f]'), sg = b.closest('#libCtl [data-seg]'), rs = d.freset != null ? b : null, dr = b.closest('#libSort [data-dir]'), un = b.closest('#libActive [data-unf]'), uc = b.closest('#libCtl [data-undch]');
    if (f || sg || rs || dr || un || uc) {
      const v = libView();
      if (f) { const arr = v[f.dataset.f], x = f.dataset.val, i = arr.indexOf(x); i < 0 ? arr.push(x) : arr.splice(i, 1); }
      if (sg) v[sg.dataset.seg] = sg.dataset.val ? [sg.dataset.val] : [];
      if (un) { const k = un.dataset.unf; if (k === 'date') v.periods.splice(+un.dataset.val, 1); else if (k === 'undated') v.undated = true; else v[k] = v[k].filter(x => x !== un.dataset.val); }
      if (dr) v.dir = -v.dir;
      if (uc) v.undated = !v.undated;
      if (rs) { Object.assign(v, { langs: [], src: [], form: [], periods: ftDef(), undated: true }); S.ftView = ftView0(); }
      S.libLimit = 250; saveLibView(); renderLibControls(); renderLibList(); return;
    }
    if (d.more) { S.libLimit += 500; renderLibList(); return; }
    if (d.favedit) { S.favEdit = !S.favEdit; return lmRender(); }
    if (d.favrm) { delete S.favs[d.favrm]; await setting('favs', S.favs); if (!Object.keys(S.favs).length) S.favEdit = false; return lmRender(); }
    if (d.star) {                                                    // favourite on/off (kept in the backup)
      const id = d.star; S.favs ??= {};
      if (S.favs[id]) delete S.favs[id]; else S.favs[id] = Date.now();
      await setting('favs', S.favs);
      const on = !!S.favs[id];
      body.querySelectorAll(`[data-star="${CSS.escape(id)}"]`).forEach(s => { s.classList.toggle('on', on); s.setAttribute('aria-pressed', on); s.title = on ? 'Remove from favourites' : 'Add to favourites'; });
      const tb = $('#libTabs'); if (tb) tb.innerHTML = lmTabsHTML();
      if (libView().view === 'fav' && !S.lmPage) renderLibList();
      return;
    }
    if (d.get || d.dl) { if (b.closest('.lwmenu')) { S.lwMenu = null; setTimeout(() => lmRender(), 30); } return; }   // (downloads: app.js)
    // Scriptorium
    if (d.scredit) { S.scrEdit = !S.scrEdit; renderLibList(); return; }
    if (d.scrm) { S.recent = (S.recent || []).filter(r => r.key !== d.scrm); await setting('recent', S.recent); renderLibList(); return; }
    if (d.scmore) { S.scrN = (S.scrN || SCR_N) + 14; renderLibList(); return; }
    if (d.anmore) { S.scrNA = (S.scrNA || SCR_N) + 14; renderLibList(); return; }
    if (d.lwmore) { S.lwN = (S.lwN || 5) + 10; lmWords(); return; }
    if (d.lww) { const k = d.lww, lem = d.lem; S.findMode = 'lemma'; S.navFind = null; await lmGo(k); const i = $('#navFind'); if (i) i.value = lem; return lmRunFind(lem, 'lemma'); }
    // a work: its page
    if (b.classList.contains('lrow') && d.lw && !S.scrEdit) { if (S.trashImp?.[d.lw] || !onText(ev, b.querySelector('.t'))) return; return lmGo(d.lw); }   // (only the title and the lines beneath it open it; the empty part of the row does not)
    if (b.classList.contains('lrow')) return;
    // the page of a work
    const key = S.lmPage; if (!key) return;
    if (d.lcont) { const r = (S.recent || []).find(x => x.key === key); if (r) { await openText(r.id); await later(); } else { await openText(textIdOf(key, (await setting('wk|' + key)) ?? 0)); } return lmRender(); }
    if (d.lwi) { S.lwInfo = !S.lwInfo; return lmRender(); }
    if (d.fav) { S.favs ??= {}; if (S.favs[key]) delete S.favs[key]; else S.favs[key] = Date.now(); await setting('favs', S.favs); S.lwMenu = null; return lmRender(); }
    if (d.lwm) { S.lwMenu = S.lwMenu === key ? null : key; return lmRender(); }
    if (d.lwdel) { S.lwMenu = null; const W = workInfo(key); if (W?.imported) { await trashImported(W.tid); return lmGo(''); } return lmRender(); }
    if (d.lwdelno) { S.lwAsk = null; return lmRender(); }
    if (d.lwdelok) {
      S.lwAsk = null; const W = workInfo(key);
      if (W.imported) {
        for (const g of await req2p(tx('glosses').objectStore('glosses').index('textId').getAll(W.tid))) await del('glosses', g.id);
        await del('texts', W.tid); if (S.text?.id === W.tid) await openText(null);
        S.recent = (S.recent || []).filter(r => r.key !== key); await setting('recent', S.recent);
        S.impWorks = (await getAll('texts')).map(impWork); return lmGo('');
      }
      await deleteWork(key); delete S.libInst[key]; S.partRefCache = {}; return lmRender();
    }
    if (d.iedit) { $('#dlg').close(); await importDialog(await get('texts', +d.iedit)); return libMenu(key); }
    if (d.olt) {
      const k = d.olt, isOpen = b.getAttribute('aria-expanded') === 'true';
      if (isOpen) { S.navOpen.delete(k); S.navShut.add(k); } else { S.navShut.delete(k); S.navOpen.add(k); }
      return lmRender();
    }
    if (d.sec != null) { const bi = d.secpart === '' ? null : +d.secpart; if (bi != null) { S.navShut.delete('part|' + bi); S.navOpen.add('part|' + bi); } await lmGoPlace(key, bi, d.sec, null); await later(); return lmRender(); }
    const F = S.navFind;
    if (d.findmode) { S.findMode = d.findmode; body.querySelectorAll('[data-findmode]').forEach(x => x.classList.toggle('on', x === b)); const q = $('#navFind')?.value.trim(); if (q) lmRunFind(q); return; }
    if (d.fclear != null) { S.navFind = null; const i = $('#navFind'); if (i) i.value = ''; return lmRender(); }
    if (!F) return;
    if (d.fgrp != null) { F.open.has(d.fgrp) ? F.open.delete(d.fgrp) : F.open.add(d.fgrp); return lmRender(); }
    if (d.fmore != null) { (F.lim ??= {})[d.fmore] = (F.lim[d.fmore] || 200) + 300; return lmRender(); }
    if (d.fres != null) { const r = F.res[+d.fres]; F.sel = +d.fres; lmRender(); await lmGoPlace(F.key, r.bi, null, r.i); return; }
    if (d.fexp != null) { F.exp = !F.exp; F.save = null; return lmRender(); }
    if (d.fx) {
      const D = findDoc(F);
      if (d.fx === 'pdf') return printHTML(findDocHTML(D), FIND_CSS);
      const blob = d.fx === 'html' ? new Blob([`<!doctype html><html lang="grc"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(D.title)}</title><style>${await fontFacesInline()}body{margin:2.5em auto;max-width:46em;padding:0 1.5em;background:#fff}${FIND_CSS}</style></head><body>${findDocHTML(D)}</body></html>`], { type: 'text/html' }) : await findDocx(D);
      const name = D.name + (d.fx === 'html' ? '.html' : '.docx');
      if (F.href) URL.revokeObjectURL(F.href);
      F.href = URL.createObjectURL(blob);             // saved by a tap on the link (on the iPad a download has to start from a tap)
      F.save = `<a class="btn acc" href="${F.href}" download="${esc(name)}">Save ${esc(name)}</a><button type="button" data-fexp="1" class="mx" aria-label="Cancel">✕</button>`;
      return lmRender();
    }
  });
}
