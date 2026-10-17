/* Pult – Dialogs: importing texts, ☰ → Instruments and Settings, downloads, backup, acknowledgements.
   (see core.js for the order of the scripts) */
'use strict';
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
    { const h = f.querySelector('.dlghead'); if (h) h.appendChild(f.querySelector('.dlgx')); }   // the ✕ in the sticky title
    // a two-level menu: one history entry while it is open, so that the Android back gesture goes back a level
    // (an entry left over from a menu closed with ✕ is used again)
    if (f.querySelector('.dlghead[data-menu]') && !S.menuEntry) { history.pushState({ pultMenu: 1 }, ''); S.menuEntry = true; }
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
// ☰ → Library → Import text …: paste a text or load a file (.txt, .odt, .docx), with its details; imported texts are listed in the Library
const LANG_OPTS = [['', 'Detect'], ['grc', 'Greek'], ['la', 'Latin']];
function detectLang(t) { const g = (t.match(/[Ͱ-Ͽἀ-῿]/g) || []).length, l = (t.match(/[A-Za-z]/g) || []).length; return g >= l ? 'grc' : 'la'; }
// "c. 380 BC" -> -380, "4th c. BC" -> -350, "2nd century AD" -> 150, "1453" -> 1453
function parseTextYear(d) {
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
async function importDialog(t = null, fromLib = false) {
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
  if (r.action !== 'ok') return fromLib ? libraryDialog() : undefined;
  const d = r.data, text = (d.text || '').trim();
  if (!text) return toast('No text to import.');
  const rec = Object.assign(t ? { id: t.id, created: t.created } : { created: Date.now() }, {
    title: d.title.trim() || (t?.title) || 'Text ' + new Date().toLocaleDateString('en-GB'), author: d.author.trim(), date: d.date.trim(), year: parseTextYear(d.date),
    edition: d.edition.trim(), notes: d.notes.trim(), lang: d.lang || detectLang(text), text: d.text });
  const id = await put('texts', rec);
  if (t) await del('settings', 'wyear|imp:' + t.id);
  await openText(t ? t.id : id);
  toast(t ? 'Saved' : 'Text imported – it is in the Library under “On this device”');
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
// access token that is stored only on this device (☰ → Instruments → Private dictionaries).
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
// ---- shared parts of the two big dialogs (Instruments, Settings): a switch, a sticky title, a package row
const SW = (attrs, on, dis) => `<label class="tsw"><input type="checkbox" ${attrs}${on ? ' checked' : ''}${dis ? ' disabled' : ''}><i></i></label>`;
const dlgHead = t => `<div class="dlghead"><h3>${t}</h3></div>`;
// ---- two-level menus (Instruments, Settings): an overview with one row per section; a section opens as a page of its
// own, with "‹ Instruments" in the title bar to go back. The page last open is shown again when the menu is reopened.
// The Android back gesture goes back one level (a history entry while a section page is open).
function pagedHTML(menu, title, rows, pages, overviewEnd = '') {
  const cur = S.menuPage?.[menu] && pages[S.menuPage[menu]] != null ? S.menuPage[menu] : '';
  const row = r => `<button type="button" class="pgrow" data-pg-open="${r.k}"><span class="t"><b>${r.title}</b><small data-pgsum="${r.k}">${r.sub}</small></span><i aria-hidden="true">›</i></button>`;
  return `<div class="dlghead" data-menu="${menu}"><h3 data-root="${title}" data-titles='${esc(JSON.stringify(Object.fromEntries(rows.map(r => [r.k, r.title]))))}'>${crumbs(title, cur ? rows.find(r => r.k === cur)?.title : '')}</h3></div>`
    + `<div class="dpage" data-pg=""${cur ? ' hidden' : ''}><div class="pglist">${rows.map(row).join('')}</div>${overviewEnd}</div>`
    + Object.entries(pages).map(([k, html]) => `<div class="dpage" data-pg="${k}"${k === cur ? '' : ' hidden'}><section class="dsec">${html}</section></div>`).join('');
}
// the title as a path: "Settings › Reading" – the menu's name stays where it is and leads back (deeper levels can follow)
function crumbs(root, ...path) {
  path = path.filter(Boolean);
  return (path.length ? `<button type="button" class="crumb" data-pg-back="1" title="Back to ${root}">${root}</button>` : `<span class="crumb">${root}</span>`)
    + path.map((t, i) => `<span class="csep" aria-hidden="true">›</span><span class="ccur">${t}</span>`).join('');
}
function showPage(k, { fromPop = false } = {}) {
  const f = $('#dlgForm'), head = f?.querySelector('.dlghead[data-menu]'); if (!head) return;
  const menu = head.dataset.menu, h3 = head.querySelector('h3'), titles = JSON.parse(h3.dataset.titles || '{}'), d = $('#dlg');
  const was = (S.menuPage ??= {})[menu] || '';
  if (!was) S.menuRootY = d.scrollTop;
  f.querySelectorAll('.dpage').forEach(p => { p.hidden = p.dataset.pg !== k; });
  h3.innerHTML = crumbs(h3.dataset.root, k ? titles[k] : '');
  S.menuPage[menu] = k; setting('menuPage', S.menuPage);
  d.scrollTop = k ? 0 : (S.menuRootY || 0);
}
document.addEventListener('click', ev => {
  const o = ev.target.closest?.('#dlg [data-pg-open]'); if (o) return showPage(o.dataset.pgOpen);
  if (ev.target.closest?.('#dlg [data-pg-back]')) showPage('');
});
addEventListener('popstate', () => {
  S.menuEntry = false;
  if (!$('#dlg').open || !$('#dlgForm .dlghead[data-menu]')) return;
  if ($('#dlgForm .dlghead [data-pg-back]')) { showPage(''); history.pushState({ pultMenu: 1 }, ''); S.menuEntry = true; }   // section → overview
  else $('#dlg').close();                                                                                       // overview → closed
});
document.addEventListener('DOMContentLoaded', () => {
  setting('menuPage').then(v => { if (v) S.menuPage = Object.assign(v, S.menuPage || {}); }).catch(() => { });
});
// Android (Chrome 120 and later): the back gesture does not go through the history while a dialog is open – it "cancels"
// the dialog. On a section page that cancel goes back to the overview instead (also Esc on a computer).
document.addEventListener('DOMContentLoaded', () => {
  $('#dlg').addEventListener('cancel', ev => {
    if ($('#dlgForm .dlghead[data-menu] [data-pg-back]')) { ev.preventDefault(); showPage(''); }
  });
});
// a page asked for when opening (holding Grammar → Settings → Reading …)
function openAt(menu, k) { (S.menuPage ??= {})[menu] = k; }
// a row: switch · name and description · the buttons on the right (Download / Update, Delete; ⋯ for anything more).
// The question "Delete …?" appears beneath, in the row itself.
function pkRow({ sw = '', grip = '', name, desc = '', right = '', del = '', more = '', cls = '', id = '' }) {
  return `<div class="item pkrow${cls ? ' ' + cls : ''}"${id ? ` data-id="${esc(id)}"` : ''}>${grip}${sw}<span class="t"><b>${name}</b>${desc ? `<small>${desc}</small>` : ''}</span><span class="pkr">${right}${del}${more ? '<button type="button" class="pkm" data-pkmore="1" aria-label="More" title="More">⋯</button>' : ''}</span>${more || del ? `<div class="pkmore" hidden>${more}</div>` : ''}</div>`;
}
const delBtn = (kind, id, name) => `<button type="button" class="danger pkdel" data-delask="${kind}:${esc(id)}" data-name="${esc(name || id)}">Delete</button>`;
const mbs = n => n >= 1e6 ? (n / 1e6).toFixed(n < 1e7 ? 1 : 0) + ' MB' : Math.round(n / 1e3) + ' kB';
document.addEventListener('click', ev => { const t = ev.target.closest?.('#dlg .pkrow .t small'); if (t) t.classList.toggle('full'); });
// Delete (in ⋯ of a package row): asked in the row itself, the dialog stays where it is
document.addEventListener('click', async ev => {
  const ask = ev.target.closest?.('#dlg [data-delask]'), no = ev.target.closest?.('#dlg [data-delno]'), ok = ev.target.closest?.('#dlg [data-dictdel]');
  if (ask) {
    const m = ask.closest('.pkrow').querySelector('.pkmore'), [kind, id] = ask.dataset.delask.split(/:(.*)/s);
    if (!m.hidden && m.querySelector('.dask')) return closeDelAsk();
    closeDelAsk();
    m._was = m.innerHTML; m._hid = m.hidden; m.hidden = false; m.classList.add('asking');
    m.innerHTML = `<span class="dask"><button type="button" class="danger" ${kind === 'map' ? `data-mapdel="${esc(id)}"` : `data-dictdel="${esc(id)}"`} title="Delete ${esc(ask.dataset.name || id)} from this device">Delete from device</button><button type="button" data-delno="1">Cancel</button></span>`;
    return;
  }
  if (no) return closeDelAsk();
  if (ok) {
    const id = ok.dataset.dictdel, row = ok.closest('.pkrow');
    if (DL.has(id)) return toast('Wait until the download has finished.');
    ok.disabled = true; ok.textContent = 'Deleting …';
    const name = S.installed[id]?.name || id;
    await deleteDict(id); await loadDicts(); bucketCache.clear(); if (S.view) renderView();
    // the row stays where it is and becomes an available one (Download), as long as the website offers it
    const av = S.instAvailRow?.(id);
    if (row && av) row.outerHTML = av; else row?.remove();
    S.instAfterDel?.();
    toast(name + ' deleted');
  }
});
// the two choices beneath Delete: gone again with Cancel, or a tap anywhere else
function closeDelAsk() { document.querySelectorAll('#dlg .pkmore.asking').forEach(m => { if (m.querySelector('[disabled]')) return; m.classList.remove('asking'); m.innerHTML = m._was || ''; m.hidden = !!m._hid; }); }
document.addEventListener('pointerdown', ev => { if (!ev.target.closest?.('#dlg .pkmore.asking, #dlg [data-delask]')) closeDelAsk(); }, true);
document.addEventListener('click', ev => { const b = ev.target.closest?.('#dlg [data-pkmore]'); if (!b) return; const m = b.closest('.pkrow').querySelector('.pkmore'); m.hidden = !m.hidden; b.classList.toggle('on', !m.hidden); });

async function dictsDialog() {
  await loadDicts();
  const man = await fetchManifest();
  const privCfgNow = await privCfg();
  const remote = Object.fromEntries((man?.packages || []).map(p => [p.id, p]));
  const fold = (await setting('instFold')) || {};
  const sec = (k, title, sub, body) => `<details class="ifold" data-if="${k}"${fold[k] ? ' open' : ''}><summary><b>${title}</b><small>${sub}</small></summary><section class="dsec">${body}</section></details>`;
  // the button on the right: Update when the website has a newer version, Download when not installed
  const getBtn = id => {
    const p = remote[id]; if (!p) return '';
    if (DL.has(id)) return dlButtonHTML(id, S.installed[id] ? 'Update' : 'Download');
    if (!S.installed[id]) return `<button type="button" class="dlbtn" data-get="${id}" title="${mbs(p.bytes)}">Download</button>`;
    return S.installed[id].version !== p.version ? `<button type="button" class="dlbtn" data-get="${id}" title="${mbs(p.bytes)}">Update</button>` : '';
  };
  const delD = id => delBtn('dict', id, S.installed[id]?.name);
  // after a delete: the row of a package becomes an available one in place
  S.instAvailRow = id => { const p = remote[id]; if (!p) return '';
    return pkRow({ grip: p.kind === 'dictionary' ? spacer : '<span class="trsp"></span>', name: esc(p.name), desc: `${esc(p.title || '')}${p.title ? ' · ' : ''}${mbs(p.bytes)}${p.priv ? ' · private repository' : ''}`, right: getBtn(p.id), cls: 'avail' }); };
  const spacer = '<span class="grip ph" aria-hidden="true">⠿</span><span class="swsp"></span>';      // (names in line with the installed ones)
  const srcOf = p => p.src || (['ls', 'georges', 'collatinus', 'morph-la', 'whitaker', 'morph-la-ww'].includes(p.id) ? 'la' : 'grc');
  const avail = (lang, kinds) => Object.values(remote).filter(p => !S.installed[p.id] && kinds(p) && srcOf(p) === lang)
    .map(p => pkRow({ grip: kinds.spacer || '', name: esc(p.name), desc: `${esc(p.title || '')}${p.title ? ' · ' : ''}${mbs(p.bytes)}${p.priv ? ' · private repository' : ''}`, right: getBtn(p.id), cls: 'avail' })).join('');
  // 1. dictionaries, by language: ⠿ to reorder, the switch to use, ▸/▾ folded or open when a word is looked up
  const dictRows = lang => S.dicts.filter(d => d.src === lang).map(d => pkRow({ id: d.id, cls: 'dictrow',
    grip: '<span class="grip" title="Drag to reorder" aria-label="Drag to reorder">⠿</span>',
    sw: SW(`data-dict-on="${d.id}" aria-label="Use ${esc(d.name)}"`, !S.dictPrefs.off.includes(d.id)),
    name: esc(d.name), desc: `${esc(d.title || '')}${d.size ? ' · ' + mbs(d.size) : ''}`,
    right: `<button type="button" class="chev${S.dictPrefs.open.includes(d.id) ? ' on' : ''}" data-dict-fold="${d.id}" title="${S.dictPrefs.open.includes(d.id) ? 'Open when a word is looked up' : 'Folded when a word is looked up'}" aria-label="Open or folded when a word is looked up">${S.dictPrefs.open.includes(d.id) ? '▾' : '▸'}</button>${getBtn(d.id)}`,
    del: delD(d.id) })).join('');
  const privState = privCfgNow.token ? (S.privErr ? '<span class="bad">' + esc(S.privErr) + '</span>' : '<span class="ok">connected</span>') : 'not connected';
  const nD = lang => S.dicts.filter(d => d.src === lang).length;
  // installed and available dictionaries of a language in one list (available ones last, with Download)
  const isDict = Object.assign(p => p.kind === 'dictionary', { spacer });
  const dictBody = Object.entries(LANGS).map(([lang, name]) => { const ins = dictRows(lang), av = avail(lang, isDict);
      return `<div class="navh2">${name}</div><div class="list plain dictlist">${ins + av || '<p class="hint small">None available.</p>'}</div>`; }).join('')
    + `<p class="hint small">⠿ drag to reorder · ▸/▾ folded or open when a word is looked up</p>`
    + `<div class="srow1"><span>Private repository: ${privState}</span><button type="button" data-v="priv">Set up …</button></div>`
    + `<div class="srow1">${SW('id="optSrcCol"', S.srcColors)}<span>Colour marks of the Eulexis editors in Pape and LSJ ${info(`<span class="legend">${Object.entries(FONT_MEANING).map(([c, t]) => `<span class="fc" data-c="${c}">■</span> ${esc(t)}`).join('<br>')}</span>`)}</span></div>`;
  // 2. analysis, by language: which instrument is used (one per language), add-ons, what can be downloaded
  const useRow = (lang, d, sub) => pkRow({ id: d.id, sw: `<label class="trad"><input type="radio" name="use-${lang}" data-uselang="${lang}" value="${d.id}"${!S.dictPrefs.off.includes(d.id) && langTools(lang).find(x => !S.dictPrefs.off.includes(x.id)) === d ? ' checked' : ''}><i></i></label>`,
    name: esc(d.name), desc: sub, right: getBtn(d.id), del: delD(d.id) });
  const tLang = { grc: [], la: [] };
  for (const d of langTools('grc')) tLang.grc.push(useRow('grc', d, `lemma and form of every word${d.count ? ' · ' + d.count.toLocaleString('en') + ' forms' : ''}${d.size ? ' · ' + mbs(d.size) : ''}`));
  for (const d of langTools('la')) tLang.la.push(useRow('la', d, `lemma and form of every word${d.count ? ' · ' + d.count.toLocaleString('en') + ' lemmata' : ''}${d.size ? ' · ' + mbs(d.size) : ''}`));
  const none = lang => `<div class="item pkrow"><label class="trad"><input type="radio" name="use-${lang}" data-uselang="${lang}" value=""${langTools(lang).some(x => !S.dictPrefs.off.includes(x.id)) ? '' : ' checked'}><i></i></label><span class="t"><b>None</b><small>no analysis</small></span></div>`;
  const addons = { grc: S.hintsInst ? pkRow({ id: S.hintsInst.id, sw: SW(`data-dict-on="${S.hintsInst.id}"`, !S.dictPrefs.off.includes(S.hintsInst.id)), name: esc(S.hintsInst.name), desc: 'preferred lemma for ambiguous forms; word classes for the colours', right: getBtn(S.hintsInst.id), del: delD(S.hintsInst.id) }) : '', la: '' };
  const usedName = lang => langTools(lang).find(x => !S.dictPrefs.off.includes(x.id))?.name || 'none';
  const isTool = Object.assign(p => p.kind !== 'dictionary', { spacer: '<span class="trsp"></span>' });
  const toolBody = Object.entries(LANGS).map(([lang, name]) => { const av = avail(lang, isTool);
      return `<div class="navh2">${name}</div><div class="list plain">${tLang[lang].join('')}${tLang[lang].length ? none(lang) : ''}${av}${tLang[lang].length || av ? '' : '<p class="hint small">None available.</p>'}</div>`
        + (addons[lang] ? `<div class="navh3">Add-ons</div><div class="list plain">${addons[lang]}</div>` : ''); }).join('')
    + `<p class="hint small">The language of each word follows from its alphabet.</p>`;
  // 3. the map
  const mapBody = typeof mapSectionHTML === 'function' ? await mapSectionHTML() : '';
  const rows = [{ k: 'dict', title: 'Dictionaries', sub: Object.entries(LANGS).map(([l, n]) => `${n} ${nD(l)}`).join(' · ') },
    { k: 'tools', title: 'Analysis', sub: Object.entries(LANGS).map(([l, n]) => `${n}: ${esc(usedName(l))}`).join(' · ') },
    ...(mapBody ? [{ k: 'maps', title: 'Map', sub: await mapSummary() }] : [])];
  // after a delete: the summaries on the overview and the choice of analysis follow the new state
  S.instAfterDel = () => {
    const f = $('#dlgForm'); if (!f) return;
    const sd = f.querySelector('[data-pgsum="dict"]'), st = f.querySelector('[data-pgsum="tools"]');
    if (sd) sd.innerHTML = rows[0].sub = Object.entries(LANGS).map(([l, n]) => `${n} ${nD(l)}`).join(' · ');
    if (st) st.innerHTML = Object.entries(LANGS).map(([l, n]) => `${n}: ${esc(usedName(l))}`).join(' · ');
    for (const lang of Object.keys(LANGS)) {
      const tools = langTools(lang), used = tools.find(x => !S.dictPrefs.off.includes(x.id));
      f.querySelectorAll(`input[data-uselang="${lang}"]`).forEach(i => { i.checked = i.value === (used?.id || ''); });
      if (!tools.length) f.querySelector(`input[data-uselang="${lang}"][value=""]`)?.closest('.pkrow')?.remove();
    }
  };
  const r = await dialog(pagedHTML('inst', 'Instruments', rows, { dict: dictBody, tools: toolBody, ...(mapBody ? { maps: mapBody } : {}) },
    (man ? '' : '<p class="hint small">The website could not be reached (offline?) – downloads are not available right now. Everything installed works offline.</p>')
    + `<div class="ifoot"><button type="button" data-v="pult">Storage and clean-up …</button><label class="btn" for="fileDict">Import packages …</label></div>`), []);
  if (r.action === 'pult') return pultDialog();
  if (r.action === 'priv') {
    const q = await dialog(`<h3>Private repository</h3><p class="hint small">Dictionaries that may not be published can be downloaded from a private GitHub repository. ${info('<b>Repository:</b> owner and name of the private repository. <b>Token:</b> a GitHub fine-grained personal access token with read access to its contents. Both are kept on this device only.')}</p>
      <div class="privf"><label>GitHub repository<input type="text" name="privRepo" value="${esc(privCfgNow.repo)}" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="owner/repository"></label>
      <label>Access token<input type="password" name="privToken" value="${esc(privCfgNow.token)}" autocomplete="off" placeholder="github_pat_…"></label></div>`,
      [...(privCfgNow.token ? [['forget', 'Forget token']] : []), ['cancel', 'Cancel'], ['ok', 'Save and connect']], 'ok');
    if (q.action === 'ok') await setting('privRepo', { repo: (q.data.privRepo || '').trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, ''), token: (q.data.privToken || '').trim() });
    if (q.action === 'forget') await setting('privRepo', { repo: privCfgNow.repo, token: '' });
    return dictsDialog();
  }
  if (r.action.startsWith('del:')) {
    const id = r.action.slice(4), d = S.installed[id];
    if (DL.has(id)) { toast('Wait until the download has finished.'); return dictsDialog(); }
    const c = await dialog(`<h3>Delete ${esc(d?.name || id)}?</h3><p>It is deleted from this device and its space is freed. You can download or import it again later. To just stop using it, switch it off instead.</p>`, [['cancel', 'Cancel'], ['ok', 'Delete']], 'ok');
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
// analysis tools per language (☰ → Instruments); switching one on switches the others of that language off
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
// text size buttons: the letter A in the text's typeface, at the size it stands for (A++ too large for its box); 100 %: with a ↺
const TZ_SIZE = { tz1: 11, tz2: 17, tz3: 21, tz4: 26, tz5: 62 };
const tzBtn = (d, cls, label, extra = '') => `<button type="button" class="tzi ${cls}" data-tz="${d}" aria-label="${label}" title="${label}"><svg class="tzA" viewBox="0 0 40 40" aria-hidden="true"><text x="${cls === 'tz3' ? 17 : 20}" y="30" text-anchor="middle" font-size="${TZ_SIZE[cls]}">A</text></svg>${extra}</button>`;
const PULT_DATE = '17 Oct 2026';     // the date this version was published (with the version number in sw.js)
// focus: 'colours' | 'grammar' | 'map' – opened by holding that button: its section unfolded and in view
async function settingsDialog(focus) {
  await loadDicts();
  const dark = document.documentElement.dataset.theme === 'dark';
  // a joined switch for either/or settings: Light | Dark
  const seg = (k, cur, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" class="${cur === v ? 'on' : ''}" data-setk="${k}" data-setv="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
  const line = (label, ctl, hint = '') => `<div class="mline"><span>${label}${hint ? `<small class="hint">${hint}</small>` : ''}</span>${ctl}</div>`;
  let ver = '–'; try { const ks = (await caches.keys()).filter(k => k.startsWith('lesepult-v')).map(k => +k.split('-v')[1]); if (ks.length) ver = Math.max(...ks); } catch (_) { }
  const fold = (await setting('instFold')) || {};
  const want = { colours: 'read', grammar: 'read', map: 'map' }[focus];
  const sec = (k, title, sub, body) => `<details class="ifold" data-if="set-${k}"${(want ? want === k : fold['set-' + k]) ? ' open' : ''}><summary><b>${title}</b><small>${sub}</small></summary><section class="dsec">${body}</section></details>`;
  // vowel lengths come from Collatinus
  const coll = S.installed?.collatinus && !S.dictPrefs.off.includes('collatinus');
  const hasMap = typeof settingsHTML === 'function';
  if (hasMap) await mapCfg();
  // the sections of Reading: a heading each (a reset button at its right), a thin line between them; switches at the right
  const rsec = (cls, title, body, btn = '') => `<section class="rsec ${cls}"><div class="rhd"><span>${title}</span>${btn}</div>${body}</section>`;
  const swRow = (sw, label, hint = '', dis = false) => `<label class="srow1 swr${dis ? ' dis' : ''}"><span>${label}${hint ? `<small class="hint">${hint}</small>` : ''}</span>${sw}</label>`;
  const RST = '<svg class="tzrst" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M3.4 1.9v3.2h3.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const reading = rsec('stz', 'Text size', `<small class="hint rhint">pinch the text · ctrl + mouse wheel</small><div class="tzrow">${tzBtn(-7, 'tz1', 'Smaller by 7 %')}${tzBtn(-1, 'tz2', 'Smaller by 1 %')}<span id="tzVal">${Math.round((S.tz || 1) * 100)} %</span>${tzBtn(1, 'tz4', 'Larger by 1 %')}${tzBtn(7, 'tz5', 'Larger by 7 %')}${tzBtn(0, 'tz3', 'Back to 100 %', RST)}</div>`)
    + rsec('sglo', 'Glosses', line('Should a word’s particular gloss replace its lemma’s default gloss?', seg('glossMode', S.glossMode === 'both' ? 'both' : 'replace', [['replace', 'Replace'], ['both', 'Show both']])))
    + rsec('sgram', 'Grammar Line', gramRowsHTML(), `<button type="button" class="greset" data-gramreset="1" aria-label="Reset the grammar line" title="Reset the grammar line">Reset${RST}</button>`)
    + rsec('scolours', 'Colourisation', chipGroupsHTML('pos') + '<small class="hint rhint">hold a word to choose its colour</small>', `<button type="button" class="creset" data-posreset="1" aria-label="Reset colours" title="Reset colours"><span class="rr">R</span><span class="rg">e</span><span class="ry">s</span><span class="rb">e</span><span class="rr">t</span>${RST}</button>`)
    + rsec('slat', 'Latin', swRow(SW('data-set="latQuant"', S.latQuant && coll, !coll), 'Mark vowel lengths (ā, ĕ …)', coll ? '' : 'needs Collatinus (Instruments → Analysis)', !coll))
    + (hasMap ? rsec('splaces', 'Places', swRow(SW('data-mapset="mark"', M.cfg.mark !== false), 'Mark place names in the text', 'a dotted line beneath names found on the map')) : '');
  if (want) openAt('set', want);
  const rows = [{ k: 'read', title: 'Reading', sub: `text ${Math.round((S.tz || 1) * 100)} % · glosses, grammar line, colourisation` },
    { k: 'search', title: 'Search', sub: 'suggestions · Greek in Latin letters · typo tolerance · index of all texts' },
    ...(hasMap ? [{ k: 'map', title: 'Map', sub: 'places in texts · period · significance · engine' }] : [])];
  const dlgP = dialog(pagedHTML('set', 'Settings', rows, { read: reading, search: searchSettingsHTML(), ...(hasMap ? { map: `<div class="mapset">${settingsHTML()}</div>` } : {}) },
      `<div class="srow1 sapp"><b>Appearance</b>${seg('theme', dark ? 'dark' : 'light', [['light', 'Light'], ['dark', 'Dark']])}</div>`)
    + `<p class="sver">Pult · version ${ver} · published ${PULT_DATE}</p>`, []);
  syncGramRows($('#dlgForm')); scIdxInfo();
  if (focus) {                                                   // the part asked for, at the top of the dialog
    const el = focus === 'map' ? null : $('#dlgForm').querySelector(focus === 'colours' ? '.rsec.scolours' : '.rsec.sgram');
    const go = () => { if (!el || !$('#dlg').open) return; const d = $('#dlg'); d.scrollTop += el.getBoundingClientRect().top - d.getBoundingClientRect().top - 52; };
    requestAnimationFrame(go); setTimeout(go, 160); setTimeout(go, 620);   // (after the dialog's own scroll restore)
  }
  await dlgP;
}
// hold a top-bar button: its list opens when the finger is lifted (so nothing beneath it gets selected)
function holdButton(bp, held, open) {
  let t = null;
  bp.addEventListener('pointerdown', () => { held(false); clearTimeout(t); t = setTimeout(() => { held(true); bp.classList.add('held'); bp._held = true; }, 550); });
  bp.addEventListener('pointerup', () => {
    clearTimeout(t); if (!bp._held) return; bp._held = false; bp.classList.remove('held');
    setTimeout(() => { window.getSelection()?.removeAllRanges(); open(); setTimeout(() => window.getSelection()?.removeAllRanges(), 60); }, 30);
  });
  for (const e of ['pointercancel', 'pointerleave']) bp.addEventListener(e, () => { clearTimeout(t); bp._held = false; bp.classList.remove('held'); });
  bp.addEventListener('contextmenu', e => e.preventDefault());
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
  if (d.open && $('#dlgForm .dlghead[data-menu="inst"]')) { d.close(); dictsDialog(); }
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
    // map: corrected places, own places, the map settings
    places: Object.fromEntries((await getAll('settings')).filter(r => /^(pl|plw|plg|pown|draw|dset|mmap|wyear)\|/.test(r.k)).map(r => [r.k, r.v])),
    mapCfg: (await setting('mapCfg')) || null,
    favourites: (await setting('favs')) || {},
    prefs: { theme: document.documentElement.dataset.theme, textZoom: S.tz || 1, posCfg: S.posCfg, posOn: S.posOn, gramCfg: S.gramCfg, showGloss: !document.body.classList.contains('nogloss'),
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
    ['Readings chosen for single words', n(Object.keys(data.readings).length)],
    ['Lemmata chosen for forms (everywhere)', n(data.choices.length)],
    ['Highlights in dictionaries', n(Object.keys(data.highlights).length)],
    ['Markers', n(Object.keys(data.markers).length)],
    ['Favourites', n(Object.keys(data.favourites).length)],
    ['Instruments (dictionaries, analysis, maps)', `${n(dicts.length)}${dsize ? ` · ≈ ${mb(dsize)}` : ''}`],
    ['Storage', [use, prot].filter(Boolean).join(' · ') || '–']];
  const r = await dialog(`${dlgHead('This Pult')}
    <p class="hint small">Everything is stored only on this device. ${info('A backup contains your imported texts, glosses, default glosses, chosen readings, lemma choices, highlights, markers, favourites, colours and display settings. Library texts and dictionaries are not included – they can be downloaded again.')}</p>
    <div class="list plain pultlist">${rows.map(([k, v]) => `<div class="item"><span class="t">${k}</span><span class="pv">${v}</span></div>`).join('')}</div>`,
    [['link', 'Export backup', { href, name }], ['file', 'Import backup …', 'fileBackup'], ['clean', 'Clean up storage']]);
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
  for (const [k, r] of Object.entries(data.places || {})) if (/^(pl|plw|plg|pown|draw|dset|mmap|wyear)\|/.test(k)) await setting(k, r);
  if (typeof M !== 'undefined') M.draw = null;                    // drawings are read again
  if (data.mapCfg) { await setting('mapCfg', data.mapCfg); if (typeof M !== 'undefined') { M.cfg = null; M.P = null; M.own = new Map(); } }
  if (data.favourites) { S.favs = Object.assign((await setting('favs')) || {}, data.favourites); await setting('favs', S.favs); }
  const p = data.prefs;                           // colours and display settings
  if (p?.textZoom) { await setting('textZoom', p.textZoom); setTextZoom(p.textZoom); }
  if (p?.dictPrefs) { S.dictPrefs = Object.assign(S.dictPrefs || {}, p.dictPrefs); await setting('dictPrefs', S.dictPrefs); await loadDicts(); }
  if (p) {
    if (p.theme) setTheme(p.theme, true);
    if (p.posCfg) { S.posCfg = Object.assign(defaultPosCfg(), p.posCfg); await setting('posCfg', S.posCfg); }
    if (p.posOn != null) { S.posOn = !!p.posOn; await setting('posOn', S.posOn); }
    if (p.gramCfg) { S.gramCfg = Object.assign(defaultGramCfg(), p.gramCfg); await setting('gramCfg', S.gramCfg); applyGramCfg(); }
    applyPosColors();
    if (p.showGloss != null) setGlossVisible(!!p.showGloss, true);
    if (p.glossMode) { S.glossMode = p.glossMode; await setting('glossMode', p.glossMode); }
    if (p.latQuant != null) { S.latQuant = !!p.latQuant; await setting('latQuant', S.latQuant); }
    if (p.showGram != null) setGram(!!p.showGram, true);
  }
  toast('Restored'); await openText(data.texts[0]?.id ?? null);
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
  ['Maps', [
    ['Pleiades – gazetteer of ancient places (ISAW, New York University, and contributors)', 'https://pleiades.stoa.org', 'ancient places, their names, positions and dates', 'CC BY 3.0'],
    ['Ancient World Mapping Center (University of North Carolina) – geodata after the Barrington Atlas', 'https://github.com/AWMC/geodata', 'coastlines of the periods, empires and Roman provinces, names of regions and peoples, roads, aqueducts, frontier walls, canals, city outlines (map packages “Ancient landscape and states” and “Ancient structures”)', 'ODbL 1.0'],
    ['OpenStreetMap contributors – coasts and lakes, as edited by the Ancient World Mapping Center', 'https://www.openstreetmap.org/copyright', 'the exact coasts and lakes of the map package “Landscape – detailed”', 'ODbL 1.0'],
    ['Copernicus DEM GLO-90 – © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA; all rights reserved', 'https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model', 'the elevation of the relief packages (shading, colours by height, contour lines, heights and profiles)', 'Copernicus DEM licence (free use with attribution)'],
    ['Natural Earth II with Shaded Relief, Water and Drainages (Tom Patterson); Natural Earth bathymetry', 'https://www.naturalearthdata.com/', 'the painted base map “Natural Earth II” and the depths of the seas', 'public domain'],
    ['Itiner-e – P. de Soto, A. Pažout, T. Brughmans et al., a high-resolution dataset of roads of the Roman Empire (2025)', 'https://itiner-e.org/', 'the Roman roads of the map packages “Roman roads (Itiner-e)”', 'CC BY 4.0'],
    ['maplibre-contour (Michael Barry) and pmtiles.js (Protomaps)', 'https://github.com/onthegomap/maplibre-contour', 'contour lines drawn from the elevation; reading the map packages', 'BSD-3-Clause'],
    ['J. W. Hanson, An Urban Geography of the Roman World (2016), and J. W. Hanson & S. G. Ortman, estimating the populations of Greek and Roman settlements (2017)', 'https://oxrep.classics.ox.ac.uk/databases/cities/', 'areas and populations of about 900 cities (for the significance of places); data via the Roman ECI project (CC BY-SA 4.0)', 'CC BY-SA 4.0'],
    ['Natural Earth', 'https://www.naturalearthdata.com', 'land, lakes, rivers and modern borders of the base map', 'public domain'],
    ['MapLibre GL JS', 'https://maplibre.org', 'the map engine', 'BSD 3-Clause'],
  ]],
  ['Fonts', [
    ['Gentium Book Plus (SIL International)', 'https://software.sil.org/gentium/', 'type for Greek and Latin', 'SIL Open Font License 1.1'],
    ['Roboto Condensed (Google)', 'https://fonts.google.com/specimen/Roboto+Condensed', 'type of the grammar line', 'SIL Open Font License 1.1']]],
];
async function acksDialog() {
  const a = (t, u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`;
  await dialog(`${dlgHead('Acknowledgements')}
    <p class="hint small">Pult is built on the work of these projects and editions. The packages it downloads are reformatted conversions of their data, shared under the same licences.</p>
    ${ACKS.map(([h, items]) => `<section class="dsec ack"><h4>${esc(h)}</h4><ul>${items.map(([t, u, what, lic]) => `<li>${a(t, u)}<br><small>${esc(what)} · <i>${esc(lic)}</i></small></li>`).join('')}</ul></section>`).join('')}`, []);
}
