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
// Library → + Import: paste a text or load a file (.txt, .odt, .docx), with its details; imported texts are listed in the Library
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
// housekeeping, silently, a while after each start: what can no longer be used is removed – databases of removed
// dictionaries, the pre-v3 database, old app caches, pieces of map downloads left for a week, the search index's
// entries of deleted texts, the place index without its package, deleted works and previous versions after 7 days
async function housekeep() {
  const step = async f => { try { await f(); } catch (_) { } };
  await step(async () => { const dbs = await listDBs(); if (!S.installed) await loadDicts();
    if (dbs) for (const { name } of dbs) if (name === OLD_DB || (name.startsWith(DICT_DB) && !S.installed[name.slice(DICT_DB.length)]))
      await new Promise(res => { const r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = () => res(); }); });
  await step(async () => { const keys = (await caches.keys()).filter(k => k.startsWith('lesepult-')).sort((a, b) => parseInt(b.split('-v')[1]) - parseInt(a.split('-v')[1]));
    for (const k of keys.slice(1)) await caches.delete(k); });
  await step(async () => {                                            // (not while a map is being downloaded)
    if ([...DL.keys()].some(id => id.startsWith('map:')) || !(await caches.has('pult-dl-parts'))) return;
    const tmp = await caches.open('pult-dl-parts');
    for (const rq of await tmp.keys()) { const r = await tmp.match(rq), at = +(r?.headers.get('x-pult-at') || 0); if (Date.now() - at > 7 * 864e5) await tmp.delete(rq); }
  });
  await step(async () => { if (typeof searchDB !== 'function' || !(await listDBs())?.some(x => x.name === 'pult-search')) return;
    const db = await searchDB(), live = new Set((await allParts()).map(p => p.k));
    const gone = (await req2p(db.transaction('part').objectStore('part').getAllKeys())).filter(k => k !== '#meta' && !live.has(k));
    if (!gone.length) return;
    const G = new Set(gone);
    await new Promise((res, rej) => { const t = db.transaction(['lem', 'part'], 'readwrite'), os = t.objectStore('lem');
      for (const k of gone) t.objectStore('part').delete(k);
      os.openCursor().onsuccess = e => { const c = e.target.result; if (!c) return;
        const r = c.value, ks = Object.keys(r.p).filter(k => G.has(k));
        if (ks.length) { for (const k of ks) delete r.p[k]; Object.keys(r.p).length ? c.update(r) : c.delete(); }
        c.continue(); };
      t.oncomplete = res; t.onerror = () => rej(t.error); }); });
  await step(async () => { if (typeof mapInstalled !== 'function' || (await mapInstalled()).places) return;
    if (!(await listDBs())?.some(x => /place/i.test(x.name))) return;
    if (await placeIndexInfo()) await dropPlaceIndex(); });
  await step(async () => { if (typeof trashLoad === 'function') await trashLoad(); });
  await step(async () => { if (typeof revPrevLoad === 'function') await revPrevLoad(); });
}
// Frisk and Bailly may not be published: they live in a PRIVATE GitHub repository, read with a personal
// access token that is stored only on this device (☰ → Instruments → Private dictionaries).
async function privCfg() { return (await setting('privRepo')) || { repo: '', token: '' }; }
async function privFetch(cfg, path, signal) {
  const r = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}`, {
    signal, cache: 'no-store', headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github.raw', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (!r.ok) throw new Error(r.status === 401 ? 'the token is not valid (any more)' : r.status === 404 ? 'repository not found, or the token has no access to it' : 'HTTP ' + r.status);
  return r;
}
function pkgFetch(p, signal) { return p.priv ? privFetch(p.priv, p.file, signal) : fetch('packages/' + p.file, { cache: 'no-cache', signal }); }
async function fetchManifest() {
  let man;
  try { man = await (await fetchT('packages/packages.json', { cache: 'no-cache' })).json(); } catch (_) { return null; }
  S.privErr = null;
  const cfg = await privCfg();
  if (cfg.token && cfg.repo) {
    try { const pm = await (await privFetch(cfg, 'packages.json')).json(); for (const p of pm.packages) man.packages.push(Object.assign(p, { priv: cfg })); }
    catch (e) { S.privErr = e.message; }
  }
  S.manifest = man;
  return man;
}
// ---- updates (Instruments, a row at the bottom): dictionaries, analysis and map packages with a newer version on the
// website. Checked when the app starts (online) and by the button; "Download all" (or a choice) goes to the download queue.
async function updCheck() {
  if (!S.installed) await loadDicts();
  const list = []; let ok = false;
  const man = await fetchManifest();
  if (man) { ok = true; for (const p of man.packages) { const d = S.installed[p.id]; if (d && d.version !== p.version) list.push({ id: p.id, name: p.name, bytes: p.bytes || 0, v: p.version }); } }
  if (typeof mapManifest === 'function') {
    const mm = await mapManifest(), inst = await mapInstalled();
    if (mm) for (const p of mm.packages) if (inst[p.id] && inst[p.id] !== p.v) list.push({ id: 'map:' + p.id, name: p.name, bytes: p.bytes || 0, v: p.v });
  }
  return S.upd = { list, ok, at: Date.now() };
}
// what is still to be updated (meanwhile installed or downloading: not)
async function updPending() {
  if (!S.upd) return [];
  const inst = typeof mapInstalled === 'function' ? await mapInstalled() : {};
  return S.upd.list.filter(u => !DL.has(u.id) && (u.id.startsWith('map:') ? inst[u.id.slice(4)] && inst[u.id.slice(4)] !== u.v : S.installed[u.id] && S.installed[u.id].version !== u.v));
}
async function updRowHTML() {
  const q = S.updQ, btn = l => `<button type="button" data-updchk="1"${S.updBusy ? ' disabled' : ''}>${l}</button>`;
  if (q) {                                                          // downloading: how far
    const left = q.filter(id => DL.has(id)).length, bad = q.filter(id => DLX.get(id)?.err).length;
    return btn('Look for updates') + `<span class="updsum">${left ? `Downloading updates · ${q.length - left} of ${q.length}` : bad ? `${q.length - bad} of ${q.length} updates downloaded · ${bad} failed` : 'Updates downloaded'}</span>`;
  }
  if (S.updBusy) return btn('Looking …');
  if (S.updMsg) return btn(S.updMsg);
  const P = await updPending(); if (!P.length) return btn('Look for updates');
  const mbT = P.reduce((a, u) => a + u.bytes, 0);
  return btn('Look for updates') + `<span class="updsum">${P.length} update${P.length === 1 ? '' : 's'} · ${mbs(mbT)}</span><button type="button" data-updall="1">Download all</button><button type="button" class="linkb${S.updPick ? ' on' : ''}" data-updpick="1">Choose …</button>`
    + (S.updPick ? `<div class="updpick">${P.map(u => `<label class="srow1"><input type="checkbox" data-updsel="${esc(u.id)}" checked><span>${esc(u.name)}<small class="hint">${mbs(u.bytes)}</small></span></label>`).join('')}<button type="button" data-updgo="1">Download selected</button></div>` : '');
}
async function updPaint() { const r = $('#instUpd'); if (r) r.innerHTML = await updRowHTML(); }
function updQueue(ids) {
  if (!ids.length) return;
  S.updQ = ids; S.updPick = false;
  for (const id of ids) queueDownload(id);
  updPaint();
}
document.addEventListener('click', async ev => {
  const b = ev.target.closest?.('#instUpd button'); if (!b) return;
  const d = b.dataset;
  if (d.updchk) {
    S.updQ = null; S.updPick = false; S.updBusy = true; S.updMsg = ''; await updPaint();
    const u = await updCheck(); S.updBusy = false;
    if (!(await updPending()).length) { S.updMsg = u.ok ? 'Up to date' : 'No connection'; clearTimeout(updPaint.t); updPaint.t = setTimeout(() => { S.updMsg = ''; updPaint(); }, 2500); }
    return updPaint();
  }
  if (d.updall) return updQueue((await updPending()).map(u => u.id));
  if (d.updpick) { S.updPick = !S.updPick; return updPaint(); }
  if (d.updgo) return updQueue([...document.querySelectorAll('#instUpd [data-updsel]:checked')].map(x => x.dataset.updsel));
});
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
  if (k === 'lib' && typeof ftDraw === 'function') requestAnimationFrame(() => ftDraw('def'));
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
  await loadDicts(); setTimeout(netCheck, 0);
  const man = await fetchManifest();
  const privCfgNow = await privCfg();
  const remote = Object.fromEntries((man?.packages || []).map(p => [p.id, p]));
  const fold = (await setting('instFold')) || {};
  const sec = (k, title, sub, body) => `<details class="ifold" data-if="${k}"${fold[k] ? ' open' : ''}><summary><b>${title}</b><small>${sub}</small></summary><section class="dsec">${body}</section></details>`;
  // the button on the right: Update when the website has a newer version, Download when not installed
  const getBtn = id => {
    const p = remote[id], have = !!S.installed[id]; if (!p && !have) return '';
    return dlIcon(id, { have, rev: have && !!p && S.installed[id].version !== p.version, size: p?.bytes, upd: 'Download update' });
  };
  const delD = () => '';                       // (Delete: on the download icon)
  // after a delete: the row of a package becomes an available one in place
  S.instAvailRow = id => { const p = remote[id]; if (!p) return '';
    return pkRow({ grip: p.kind === 'dictionary' ? spacer : '<span class="trsp"></span>', name: esc(p.name), desc: `${esc(p.title || '')}${p.title ? ' · ' : ''}${mbs(p.bytes)}${p.priv ? ' · private repository' : ''}`, right: getBtn(p.id), cls: 'avail' }); };
  const spacer = '<span class="grip ph" aria-hidden="true">⠿</span><span class="swsp"></span>';      // (names in line with the installed ones)
  const srcOf = p => p.src || (['ls', 'georges', 'collatinus', 'morph-la', 'whitaker', 'morph-la-ww'].includes(p.id) ? 'la' : 'grc');
  const avail = (lang, kinds) => Object.values(remote).filter(p => !S.installed[p.id] && kinds(p) && srcOf(p) === lang)
    .map(p => pkRow({ grip: kinds.spacer || '', name: esc(p.name), desc: `${esc(p.title || '')}${p.title ? ' · ' : ''}${mbs(p.bytes)}${p.priv ? ' · private repository' : ''}`, right: getBtn(p.id), cls: 'avail' })).join('');
  // 1. dictionaries, by language: ⠿ to reorder, the switch to use, ▸/▾ folded or open when a word is looked up
  const dictRows = lang => S.dicts.filter(d => d.src === lang).map(dictRow).join('');
  function dictRow(d) { return pkRow({ id: d.id, cls: 'dictrow',
    grip: '<span class="grip" title="Drag to reorder" aria-label="Drag to reorder">⠿</span>',
    sw: SW(`data-dict-on="${d.id}" aria-label="Use ${esc(d.name)}"`, !S.dictPrefs.off.includes(d.id)),
    name: esc(d.name), desc: `${esc(d.title || '')}${d.size ? ' · ' + mbs(d.size) : ''}`,
    right: getBtn(d.id) + `<button type="button" class="chev${S.dictPrefs.open.includes(d.id) ? ' on' : ''}" data-dict-fold="${d.id}" title="${S.dictPrefs.open.includes(d.id) ? 'Open when a word is looked up' : 'Folded when a word is looked up'}" aria-label="Open or folded when a word is looked up">${S.dictPrefs.open.includes(d.id) ? '▾' : '▸'}</button>${getBtn(d.id)}`,
    del: delD(d.id) }); }
  const privState = privCfgNow.token ? (S.privErr ? '<span class="bad">' + esc(S.privErr) + '</span>' : '<span class="ok">connected</span>') : 'not connected';
  const nD = lang => S.dicts.filter(d => d.src === lang).length;
  // installed and available dictionaries of a language in one list (available ones last, with Download)
  const isDict = Object.assign(p => p.kind === 'dictionary', { spacer });
  const dictBody = Object.entries(LANGS).map(([lang, name]) => { const ins = dictRows(lang), av = avail(lang, isDict);
      return `<div class="navh2">${name}</div><div class="list plain dictlist">${ins + av || '<p class="hint small">None available.</p>'}</div>`; }).join('')
    + `<p class="hint small">⠿ drag to reorder · ▸/▾ folded or open when a word is looked up</p>`
    + `<div class="srow1">${SW('id="optSrcCol"', S.srcColors)}<span>Colour marks of the Eulexis editors in Pape and LSJ ${info(`<span class="legend">${Object.entries(FONT_MEANING).map(([c, t]) => `<span class="fc" data-c="${c}">■</span> ${esc(t)}`).join('<br>')}</span>`)}</span></div>`;
  // 2. analysis, by language: which instrument is used (one per language), add-ons, what can be downloaded
  const useRow = (lang, d, sub) => pkRow({ id: d.id, sw: `<label class="trad"><input type="radio" name="use-${lang}" data-uselang="${lang}" value="${d.id}"${!S.dictPrefs.off.includes(d.id) && langTools(lang).find(x => !S.dictPrefs.off.includes(x.id)) === d ? ' checked' : ''}><i></i></label>`,
    name: esc(d.name), desc: sub, right: getBtn(d.id), del: delD(d.id) });
  const tLang = { grc: [], la: [] };
  const toolRow = (lang, d) => useRow(lang, d, `lemma and form of every word${d.count ? ' · ' + d.count.toLocaleString('en') + (lang === 'la' ? ' lemmata' : ' forms') : ''}${d.size ? ' · ' + mbs(d.size) : ''}`);
  for (const d of langTools('grc')) tLang.grc.push(toolRow('grc', d));
  for (const d of langTools('la')) tLang.la.push(toolRow('la', d));
  const none = lang => `<div class="item pkrow"><label class="trad"><input type="radio" name="use-${lang}" data-uselang="${lang}" value=""${langTools(lang).some(x => !S.dictPrefs.off.includes(x.id)) ? '' : ' checked'}><i></i></label><span class="t"><b>None</b><small>no analysis</small></span></div>`;
  const hintsRow = () => pkRow({ id: S.hintsInst.id, sw: SW(`data-dict-on="${S.hintsInst.id}"`, !S.dictPrefs.off.includes(S.hintsInst.id)), name: esc(S.hintsInst.name), desc: 'preferred lemma for ambiguous forms; word classes for the colours', right: getBtn(S.hintsInst.id), del: delD(S.hintsInst.id) });
  // after a download: the package's row becomes an installed one in place (the menu stays open)
  S.instRow = id => { const d = S.installed[id]; if (!d) return '';
    if (d.kind === 'dictionary') return dictRow(d);
    if (d.kind === 'morph') return toolRow('grc', d);
    if (d.kind === 'latmorph') return toolRow('la', d);
    if (d.kind === 'morphhints') return hintsRow();
    return ''; };
  const addons = { grc: S.hintsInst ? pkRow({ id: S.hintsInst.id, sw: SW(`data-dict-on="${S.hintsInst.id}"`, !S.dictPrefs.off.includes(S.hintsInst.id)), name: esc(S.hintsInst.name), desc: 'preferred lemma for ambiguous forms; word classes for the colours', right: getBtn(S.hintsInst.id), del: delD(S.hintsInst.id) }) : '', la: '' };
  const usedName = lang => langTools(lang).find(x => !S.dictPrefs.off.includes(x.id))?.name || 'none';
  const isTool = Object.assign(p => p.kind !== 'dictionary', { spacer: '<span class="trsp"></span>' });
  const toolBody = Object.entries(LANGS).map(([lang, name]) => { const av = avail(lang, isTool);
      return `<div class="navh2">${name}</div><div class="list plain">${tLang[lang].join('')}${tLang[lang].length ? none(lang) : ''}${av}${tLang[lang].length || av ? '' : '<p class="hint small">None available.</p>'}</div>`
        + (addons[lang] ? `<div class="navh3">Add-ons</div><div class="list plain">${addons[lang]}</div>` : ''); }).join('')
    + `<p class="hint small">The language of each word follows from its alphabet.</p>`;
  // 4. other sources: the private repository, packages from files
  const srcBody = `<div class="srow1"><span>Private repository: ${privState}<small class="hint">dictionaries that may not be published, from a private GitHub repository</small></span><button type="button" data-v="priv">Set up …</button></div>`
    + `<div class="srow1"><span>Packages from files<small class="hint">dictionary and analysis packages saved on this device</small></span><label class="btn" for="fileDict">Import packages …</label></div>`;
  const srcSub = `private repository ${privCfgNow.token ? (S.privErr ? 'not reachable' : 'connected') : 'not connected'} · packages from files`;
  // 3. the map
  const mapBody = typeof mapSectionHTML === 'function' ? await mapSectionHTML() : '';
  const rows = [{ k: 'dict', title: 'Dictionaries', sub: Object.entries(LANGS).map(([l, n]) => `${n} ${nD(l)}`).join(' · ') },
    { k: 'tools', title: 'Analysis', sub: Object.entries(LANGS).map(([l, n]) => `${n}: ${esc(usedName(l))}`).join(' · ') },
    ...(mapBody ? [{ k: 'maps', title: 'Map', sub: await mapSummary() }] : []),
    { k: 'src', title: 'Other sources', sub: srcSub }];
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
      else if (!f.querySelector(`input[data-uselang="${lang}"][value=""]`)) {        // the first analysis of a language: "None" beneath it
        const last = [...f.querySelectorAll(`input[data-uselang="${lang}"]`)].pop()?.closest('.pkrow');
        last?.insertAdjacentHTML('afterend', none(lang));
        const ch = f.querySelector(`input[data-uselang="${lang}"][value="${used?.id || ''}"]`); if (ch) ch.checked = true;
      }
    }
  };
  S.updMsg = ''; S.updPick = false; if (S.updQ && !S.updQ.some(id => DL.has(id))) S.updQ = null;
  const updRow = await updRowHTML();
  const r = await dialog(pagedHTML('inst', 'Instruments', rows, { dict: dictBody, tools: toolBody, ...(mapBody ? { maps: mapBody } : {}), src: srcBody },
    (man ? '' : '<p class="hint small">The website could not be reached (offline?) – downloads are not available right now. Everything installed works offline.</p>')
    + `<div class="iupd" id="instUpd">${updRow}</div>`), []);
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
  const reading = rsec('stz', 'Text size', `<div class="tzline"><small class="hint"><span class="nw">pinch the text ·</span> <span class="nw">ctrl + mouse wheel</span></small><div class="tzrow">${tzBtn(-7, 'tz1', 'Smaller by 7 %')}${tzBtn(-1, 'tz2', 'Smaller by 1 %')}<span id="tzVal">${Math.round((S.tz || 1) * 100)} %</span>${tzBtn(1, 'tz4', 'Larger by 1 %')}${tzBtn(7, 'tz5', 'Larger by 7 %')}${tzBtn(0, 'tz3', 'Back to 100 %', RST)}</div></div>`)
    + rsec('sglo', 'Glosses', line('Should a word’s particular gloss replace its lemma’s default gloss?', seg('glossMode', S.glossMode === 'both' ? 'both' : 'replace', [['replace', 'Replace'], ['both', 'Show both']])))
    + rsec('sgram', 'Grammar Line', gramRowsHTML(), `<button type="button" class="greset" data-gramreset="1" aria-label="Reset the grammar line" title="Reset the grammar line">Reset${RST}</button>`)
    + rsec('scolours', 'Colourisation', chipGroupsHTML('pos') + '<small class="hint rhint">hold a word to choose its colour</small>', `<button type="button" class="creset" data-posreset="1" aria-label="Reset colours" title="Reset colours"><span class="rr">R</span><span class="rg">e</span><span class="ry">s</span><span class="rb">e</span><span class="rr">t</span>${RST}</button>`)
    + rsec('slat', 'Latin', swRow(SW('data-set="latQuant"', S.latQuant && coll, !coll), 'Mark vowel lengths (ā, ĕ …)', coll ? '' : 'needs Collatinus (Instruments → Analysis)', !coll))
    + (hasMap ? rsec('splaces', 'Places', swRow(SW('data-mapset="mark"', M.cfg.mark !== false), 'Mark place names in the text', 'a dotted line beneath names found on the map')) : '');
  await libSettingsPrep();
  if (want) openAt('set', want);
  const rows = [{ k: 'read', title: 'Reading', sub: `text ${Math.round((S.tz || 1) * 100)} % · glosses, grammar line, colourisation` },
    { k: 'search', title: 'Search', sub: 'suggestions · Greek in Latin letters · typo tolerance · index of all texts' },
    { k: 'lib', title: 'Library', sub: 'revision notices · rejected revisions' },
    ...(hasMap ? [{ k: 'map', title: 'Map', sub: 'places in texts · period · significance · engine' }] : [])];
  const dlgP = dialog(pagedHTML('set', 'Settings', rows, { read: reading, search: searchSettingsHTML(), lib: libSettingsHTML(), ...(hasMap ? { map: `<div class="mapset">${settingsHTML()}</div>` } : {}) },
      `<div class="srow1 sapp"><b>Appearance</b>${seg('theme', dark ? 'dark' : 'light', [['light', 'Light'], ['dark', 'Dark']])}</div>`
      + `<label class="srow1 swr sapp2"><span>Fades<small class="hint">buttons light up briefly when tapped, switches fade in and out</small></span>${SW('data-fades="1"', !document.body.classList.contains('nofade'))}</label>`)
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
// ---------------------------------------------------------------- downloads (dictionaries, texts, maps): one queue, one button
// The button fills from the bottom like a vessel while its download runs; "Waiting" while queued, "Installing" at the end.
// A tap on a running or waiting download asks, in a line beneath its row, whether to stop it. A failed download shows ↻
// (tap: again) and the reason. Before each download: is the website reachable, is there room on the device.
// Ids: a dictionary package by its id, "work:<id>" a text of the library, "map:<id>" a map package.
const DL = new Map();          // id -> progress 0..1 (or -1 = waiting)
const DLX = new Map();         // id -> { ctl: AbortController, err: reason of a failure, bytes }
let dlRunning = false;
const dlName = id => id.startsWith('work:') ? (S.catWork?.[id.slice(5)]?.title || id.slice(5)) : id.startsWith('map:') ? (M.man?.packages.find(p => p.id === id.slice(4))?.name || id.slice(4))
  : (S.manifest?.packages?.find(p => p.id === id)?.name || id);
function dlButtonHTML(id, label) {
  const p = DL.get(id); const pct = p < 0 ? 0 : Math.round(p * 100);
  return `<button type="button" class="dlbtn busy${p < 0 ? ' wait' : p >= 0.9 ? ' inst' : ''}" data-dl="${id}" data-lbl="${esc(label || 'Download')}" style="--p:${pct}%" title="Tap to stop">${p < 0 ? 'Waiting' : p >= 0.9 ? 'Installing' : pct + ' %'}</button>`;
}
// every button of this download, wherever it is shown: its state
function paintDL(id, text) {
  if (id.startsWith('work:') && typeof authPaint === 'function') authPaint(id.slice(5));
  if (S.updQ?.includes(id)) { clearTimeout(paintDL.ut); paintDL.ut = setTimeout(updPaint, 150); }
  for (const b of document.querySelectorAll(`#dlg [data-get="${id}"], #dlg [data-dl="${id}"]`)) {
    const p = DL.get(id), x = DLX.get(id), icon = b.classList.contains('lmdl') || b.classList.contains('dli');
    if (b.dataset.lbl == null) b.dataset.lbl = icon ? b.innerHTML : b.textContent;
    b.classList.remove('busy', 'wait', 'inst', 'fail'); b.disabled = false;
    if (DL.has(id)) {
      b.removeAttribute('data-get'); b.dataset.dl = id; b.classList.add('dlbtn', 'busy'); if (p < 0) b.classList.add('wait'); else if (p >= 0.9) b.classList.add('inst');
      b.style.setProperty('--p', Math.round(Math.max(0, p) * 100) + '%');
      const t = p < 0 ? 'Waiting' : p >= 0.9 ? 'Installing' : Math.round(p * 100) + ' %';
      if (icon) b.title = t + ' – tap to stop'; else { b.textContent = t; b.title = 'Tap to stop'; }
    } else {
      b.removeAttribute('data-dl'); b.dataset.get = id; b.style.removeProperty('--p');
      if (x?.err) { b.classList.add('fail'); b.title = x.err + ' – tap to try again'; if (icon) b.innerHTML = '↻'; else b.textContent = '↻ ' + (text || 'Try again'); }
      else if (text && !icon) { b.textContent = text; if (text === 'Up to date') b.disabled = true; }
      else { if (icon) b.innerHTML = b.dataset.lbl; else b.textContent = b.dataset.lbl; b.title = ''; }
    }
  }
  if (!DL.has(id)) document.querySelectorAll(`#dlg .dlask[data-for="${CSS.escape(id)}"]`).forEach(x => x.remove());
}
// the download icon (Library, Instruments): an arrow of one quiet colour throughout; lit in the accent colour when tapped and
// while it downloads (the box filling from the bottom); once on the device the box is filled (neutral), with a faint "rev."
// when a revision / update is available. A tap on a downloaded icon shows two buttons to its left: the revision (or
// update) and Delete (no question: a deleted work can be restored for 7 days).
const DLARROW = '<svg class="dla" width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/></g></svg>';
// (a deleted work, kept on the device for 7 days: a return arrow – a tap brings it back at once)
const RSTARROW = '<svg class="dla" width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 13.5a6.5 6.5 0 1 0 1.9-6.1"/><path d="M5 4.5v4.2h4.2"/></g></svg>';
function dlIcon(id, { have = false, rev = false, size = 0, upd = 'Download revision', off = false, rst = 0 } = {}) {
  const p = DL.get(id), x = DLX.get(id);
  if (DL.has(id)) return `<button type="button" class="dli busy${p < 0 ? ' wait' : p >= 0.9 ? ' inst' : ''}" data-dl="${esc(id)}" data-lbl="${esc(DLARROW)}" style="--p:${Math.round(Math.max(0, p) * 100)}%" title="Tap to stop" aria-label="Downloading – tap to stop">${DLARROW}</button>`;
  if (x?.err && !have) return `<button type="button" class="dli fail" data-get="${esc(id)}" title="${esc(x.err)} – tap to try again" aria-label="Try again">↻</button>`;
  if (have) return `<button type="button" class="dli done" data-dlon="${esc(id)}" data-upd="${rev ? esc(upd) : ''}" title="On this device${rev ? ' – ' + esc(upd.toLowerCase().replace('download ', '')) + ' available' : ''}" aria-label="On this device">${DLARROW}${rev ? '<sup class="drev">rev.</sup>' : ''}</button>`;
  if (rst) return `<button type="button" class="dli rst" data-dlrst="${esc(id)}" title="Restore – kept on this device until ${new Date(rst + 7 * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}" aria-label="Restore">${RSTARROW}</button>`;
  return `<button type="button" class="dli" data-get="${esc(id)}" title="Download${size ? ' (' + mbs(size) + ')' : ''}" aria-label="Download"${off ? ' disabled' : ''}>${DLARROW}</button>`;
}
function dlPopClose() { document.querySelectorAll('.dlpop').forEach(x => x.remove()); document.querySelectorAll('.dli.open').forEach(x => x.classList.remove('open')); clearTimeout(dlPopClose.t); }
// the fade of a tapped button: its colour (the accent, or its own) comes in over 1/9 s and goes back over 1/3 s – only when
// the tap really counted, not when the finger slid off; Settings → Appearance → Fades switches it off (body.nofade)
const FADE_BTNS = ['.dli,.lwm,.lwi,.fti,.ftreset,.greset,.creset,.mtreset,.dirb,.tzi,#libFilterBtn',     // small icon buttons
  '#btnMenu,#btnSplit,#tabEntry,#tabList,#tabMap',                                                            // top bar
  'dialog .seg button,dialog .chip2,dialog .chip',                                                  // choices
  'dialog .pgrow,dialog .annrow',                                                                    // rows (not the Library's)
  '#dlgForm>.row>:is(button,a,label),dialog .dlpop button,dialog .dlask button,#instUpd button,dialog .lwmenu button,dialog .lwcont,dialog .srow1>button,dialog .ftrestore button,dialog .pgo',   // text buttons
  '#mapBody button'].join(',');                                                                     // the map's buttons
document.addEventListener('click', ev => {
  if (document.body.classList.contains('nofade')) return;
  const b0 = ev.target.closest?.(FADE_BTNS); if (!b0) return;
  // (many of these redraw their part of the page when tapped: the button drawn anew, found by its data-…, keeps the colour)
  const a = [...b0.attributes].find(x => x.name.startsWith('data-')), sel = a ? `[${a.name}="${CSS.escape(a.value)}"]` : null, t0 = performance.now();
  const cur = () => sel && !b0.isConnected ? document.querySelector(sel) : b0;
  const step = () => { cur()?.classList.add('fxon'); if (performance.now() - t0 < 111) return requestAnimationFrame(step); setTimeout(() => cur()?.classList.remove('fxon'), 0); };
  step();
}, true);
document.addEventListener('change', ev => {
  if (ev.target.dataset?.fades == null) return;
  document.body.classList.toggle('nofade', !ev.target.checked); setting('fades', ev.target.checked);
});
// the buttons to the left of an icon (tapped again, or after 5 s: gone)
function dlPopAt(b, html) {
  const open = b.classList.contains('open'); dlPopClose(); if (open) return;
  const row = b.closest('summary,.lrow,.pkrow,.lwl,.item') || b.parentElement;
  const rr = row.getBoundingClientRect(), br = b.getBoundingClientRect();
  row.classList.add('dlhost'); b.classList.add('open');
  row.insertAdjacentHTML('beforeend', `<span class="dlpop" style="right:${Math.round(rr.right - br.left + 6)}px;top:${Math.round(br.top - rr.top + br.height / 2)}px">${html}</span>`);
  dlPopClose.t = setTimeout(dlPopClose, 5000);
}
function dlPop(b) {
  const id = b.dataset.dlon;
  dlPopAt(b, `${b.dataset.upd ? `<button type="button" data-dlupd="${esc(id)}"${S.net === false ? ' disabled' : ''}>${esc(b.dataset.upd)}</button>` : ''}<button type="button" class="danger" data-dldel="${esc(id)}">${id.startsWith('work:') ? 'Remove' : 'Delete'}</button>`);
}
// a removed work (kept 7 days): Restore, or Erase (for good)
document.addEventListener('click', async ev => {
  const r = ev.target.closest?.('[data-dlrst]');
  if (r) { ev.preventDefault(); ev.stopPropagation(); const id = r.dataset.dlrst; return dlPopAt(r, `<button type="button" data-dlrestore="${esc(id)}">Restore</button><button type="button" class="danger" data-dlpurge="${esc(id)}">Erase</button>`); }
  const go = ev.target.closest?.('[data-dlrestore],[data-dlpurge]'); if (!go) return;
  ev.preventDefault(); ev.stopPropagation(); dlPopClose();
  if (go.dataset.dlrestore) return queueDownload(go.dataset.dlrestore);
  await workPurge(go.dataset.dlpurge.slice(5)); if ($('#libBody')) lmRender();
}, true);
document.addEventListener('click', async ev => {
  const on = ev.target.closest?.('[data-dlon]'); if (on) { ev.preventDefault(); ev.stopPropagation(); return dlPop(on); }
  const up = ev.target.closest?.('[data-dlupd]'), dl = ev.target.closest?.('[data-dldel]');
  if (!up && !dl) { if (!ev.target.closest?.('.dlpop,.dli.open')) dlPopClose(); return; }   // (a tap on the open icon: its own handler closes)
  ev.preventDefault(); ev.stopPropagation();
  const id = (up || dl).dataset[up ? 'dlupd' : 'dldel'], row = (up || dl).closest('.dlhost'); dlPopClose();
  if (up) return dlUpdate(id);
  return dlDelete(id, row);
}, true);
document.addEventListener('scroll', () => dlPopClose(), true);
async function dlUpdate(id) {
  if (id.startsWith('work:')) { const key = id.slice(5); if (!$('#libBody')) return; if (S.lmPage !== key) await lmGo(key); S.revDone = null; return revOpen(key); }
  queueDownload(id);
}
async function dlDelete(id, row) {
  if (DL.has(id)) return toast('Wait until the download has finished.');
  if (id.startsWith('work:')) { await trashWork(id.slice(5)); if ($('#libBody')) lmRender(); return; }
  if (id.startsWith('map:')) {
    const p = M.man?.packages.find(x => x.id === id.slice(4)); if (!p) return;
    await deleteMapPkg(p); const o = await mapOff(); delete o[p.id]; await setting('mapOff', o); await redrawMapSection(); toast(p.name + ' deleted'); if (S.tab === 'map') showMap(); return;
  }
  return dictDeleteRow(id, row?.closest('.pkrow') || row);
}
// a dictionary or analysis package deleted; its row stays where it is and becomes an available one
async function dictDeleteRow(id, row) {
  const name = S.installed[id]?.name || id;
  await deleteDict(id); await loadDicts(); bucketCache.clear(); if (S.view) renderView();
  const av = S.instAvailRow?.(id);
  if (row && av) row.outerHTML = av; else row?.remove();
  S.instAfterDel?.();
  toast(name + ' deleted');
}
function queueDownload(id) {
  if (DL.has(id)) return;
  navigator.storage?.persist?.().catch(() => { });
  DLX.delete(id); DL.set(id, -1); paintDL(id); runDownloads();
}
// stopping: asked in a line beneath the row of the button (the download goes on meanwhile)
function dlAsk(b) {
  const id = b.dataset.dl, row = b.closest('.lrow,.pkrow,.lwact,.lwmenu,.item') || b.parentElement;
  document.querySelectorAll('#dlg .dlask').forEach(x => x.remove());
  row.insertAdjacentHTML('afterend', `<div class="dlask" data-for="${esc(id)}"><span>Stop downloading ${esc(dlName(id))}?</span><button type="button" class="danger" data-dlstop="${esc(id)}">Stop</button><button type="button" data-dlgo="1">Continue</button></div>`);
}
function dlStop(id) {
  if (DL.get(id) < 0) { DL.delete(id); paintDL(id); return; }
  DLX.get(id)?.ctl?.abort();
}
document.addEventListener('click', ev => {
  const busy = ev.target.closest?.('#dlg [data-dl]'); if (busy) { ev.preventDefault(); ev.stopPropagation(); return dlAsk(busy); }
  const st = ev.target.closest?.('#dlg [data-dlstop]'); if (st) { ev.stopPropagation(); st.closest('.dlask').remove(); return dlStop(st.dataset.dlstop); }
  const go = ev.target.closest?.('#dlg .dlask [data-dlgo]'); if (go) { ev.stopPropagation(); go.closest('.dlask').remove(); }
}, true);
// is the website reachable? (a small request past every cache, at most 3.5 s): when the Library or Instruments open,
// before each download, when the network changes, after a failure. Offline: downloads faint; back online: as before.
async function netCheck() {
  let ok = false;
  try { const r = await fetchT('texts/catalog.json', { method: 'HEAD', cache: 'no-store' }, 3500); ok = r.ok; } catch (_) { ok = false; }
  const was = S.net; S.net = ok; if (!ok) S.catOnline = false; else if (S.catOnline === false) S.catOnline = null;
  document.body.classList.toggle('netoff', !ok);
  // Instruments: a line beneath the title while offline
  const h = $('#dlgForm .dlghead[data-menu="inst"]'), l = $('#dlgForm .netline');
  if (h && !ok && !l) h.insertAdjacentHTML('afterend', '<p class="lmoff netline">Offline · downloads need a connection</p>');
  if (ok && l) l.remove();
  // the Library: the catalogue fetched again when it is not from this session or older than a day; the rows follow
  if (ok && (S.catOnline !== true || Date.now() - (S.catAt || 0) > 864e5) && typeof fetchCatalog === 'function') fetchCatalog().then(() => { if ($('#libBody')) lmRender(); });
  else if (was !== ok && $('#libBody')) lmRender();
  return ok;
}
addEventListener('online', () => netCheck()); addEventListener('offline', () => netCheck());
// room on the device for a download of this size (with a margin)
async function dlRoom(bytes) {
  try { const e = await navigator.storage?.estimate?.(); if (!e?.quota || !bytes) return null; const free = e.quota - e.usage; return free < bytes * 1.3 ? `Not enough storage – needs ${mbs(bytes)}, about ${mbs(Math.max(0, free))} free` : null; } catch (_) { return null; }
}
const dlBytes = id => id.startsWith('work:') ? S.catWork?.[id.slice(5)]?.bytes : id.startsWith('map:') ? M.man?.packages.find(p => p.id === id.slice(4))?.bytes : S.manifest?.packages?.find(p => p.id === id)?.bytes;
async function runDownloads() {
  if (dlRunning) return; dlRunning = true;
  let dicts = false;
  for (;;) {
    const id = [...DL.keys()].find(k => DL.get(k) < 0); if (!id) break;
    const ctl = new AbortController(); DLX.set(id, { ctl });
    try {
      if (id.startsWith('work:') && await workRestore(id.slice(5))) { DL.delete(id); DLX.delete(id); paintDL(id); if ($('#libBody')) lmRender(); continue; }   // deleted within 7 days: back at once
      if (!(await netCheck())) throw new Error('No connection');
      if (id.startsWith('map:') && !M.man) M.man = await mapManifest();
      if (!id.startsWith('work:') && !id.startsWith('map:') && !S.manifest) S.manifest = await fetchManifest();
      const room = await dlRoom(dlBytes(id)); if (room) throw new Error(room);
      if (id.startsWith('work:')) await downloadWork(id, ctl.signal);
      else if (id.startsWith('map:')) await downloadMapQueued(id.slice(4), ctl.signal);
      else { dicts = true; await downloadDictPkg(id, ctl.signal); }
      DLX.delete(id);
    } catch (e) {
      DL.delete(id);
      if (e.name === 'AbortError') { DLX.delete(id); toast(`${dlName(id)}: stopped`); }
      else { DLX.set(id, { err: e.message }); toast(`${dlName(id)}: download failed (${e.message})`, 4000); netCheck(); }
      paintDL(id);
      if ($('#libBody')) lmRender();
    }
  }
  dlRunning = false;
  if (dicts) { await loadDicts(); bucketCache.clear(); if (S.view) renderView(); resetTokens(); resolveTokens(); }
}
async function downloadDictPkg(id, signal) {
  const man = S.manifest = S.manifest || await fetchManifest();
  if (!man) throw new Error('No connection');
  const p = man.packages.find(x => x.id === id); if (!p) throw new Error('not on the website');
  DL.set(id, 0); paintDL(id);
  const r = await pkgFetch(p, signal);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const reader = r.body.getReader(); const parts = []; let got = 0;
  for (;;) { const { done: fin, value } = await reader.read(); if (fin) break; parts.push(value); got += value.length; DL.set(id, 0.9 * got / p.bytes); paintDL(id); }
  DL.set(id, 0.9); paintDL(id);
  await importPackage(new File(parts, p.file), x => { DL.set(id, 0.9 + 0.1 * x); paintDL(id); }, p.version);
  DL.delete(id); paintDL(id, 'Up to date');
  document.querySelectorAll(`#dlg [data-get="${id}"]`).forEach(b => { b.classList.remove('busy'); b.style.removeProperty('--p'); });
  toast(`${p.name} installed`);
  await loadDicts(); bucketCache.clear();
  // the open Instruments menu: the row becomes an installed one where it is, the summaries follow (no redraw of the menu)
  if ($('#dlg').open && $('#dlgForm .dlghead[data-menu="inst"]') && S.instRow) {
    const html = S.instRow(id);
    document.querySelectorAll(`#dlg [data-get="${id}"]`).forEach(b => { const row = b.closest('.pkrow'); if (row && html) row.outerHTML = html; });
    S.instAfterDel?.();
  }
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
    ['Glosses', `${n(data.glosses.length)}${glossTexts ? ` in ${n(glossTexts)} text${glossTexts === 1 ? '' : 's'}` : ''}`, 'annot'],
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
    <div class="list plain pultlist">${rows.map(([k, v, go]) => go ? `<button type="button" class="item pgo" data-v="${go}"><span class="t">${k}</span><span class="pv">${v}</span><i aria-hidden="true">›</i></button>` : `<div class="item"><span class="t">${k}</span><span class="pv">${v}</span></div>`).join('')}</div>`,
    [['link', 'Export backup', { href, name }], ['file', 'Import backup …', 'fileBackup']]);
  setTimeout(() => URL.revokeObjectURL(href), 60000);
  if (r.action === 'annot') return annotDialog();
}
const backupDialog = pultDialog;
// ☰ → This Pult → Annotations: every text with something of yours in it – glosses, the marker, chosen readings, map
// places – whether it is on this device, removed (in the bin), erased or not downloaded; each can be deleted here
async function annotData() {
  const A = new Map(), at = k => { let x = A.get(k); if (!x) A.set(k, x = { key: k, g: 0, mk: 0, an: 0, pl: 0, tids: new Set() }); return x; };
  for (const g of await getAll('glosses')) { const k = keyOfText(g.textId); if (k) { const x = at(k); x.g++; x.tids.add(String(g.textId)); } }
  const keys = p => req2p(tx('settings').objectStore('settings').getAllKeys(IDBKeyRange.bound(p, p + '\uffff')));
  for (const k of await keys('mk|')) { const t = k.slice(3), w = keyOfText(t); if (w) { at(w).mk++; at(w).tids.add(t); } }
  for (const [p, f] of [['an|', 'an'], ['pl|', 'pl']]) for (const k of await keys(p)) { const t = k.split('|')[1], w = keyOfText(t); if (w) { at(w)[f]++; at(w).tids.add(t); } }
  for (const k of await keys('plw|')) at(k.split('|')[1]).pl++;
  const gone = Object.fromEntries((await getAll('settings', IDBKeyRange.bound('gone|', 'gone|\uffff'))).map(r => [r.k.slice(5), r.v]));
  const inst = Object.fromEntries((await libWorks()).map(w => [w.id, w])), imp = Object.fromEntries((await getAll('texts')).map(t => ['imp:' + t.id, t]));
  await cachedCatalog().catch(() => { }); await trashLoad();
  for (const x of A.values()) {
    const k = x.key, w = inst[k] || S.catWork?.[k], t = imp[k] || S.trashImp?.[k] && { title: S.trashImp[k].title, author: S.trashImp[k].author }, gn = gone[k];
    x.title = k.startsWith('imp:') ? (t?.title || gn?.title || 'A text no longer on this device') : (w?.title || k);
    x.author = k.startsWith('imp:') ? (t?.author || gn?.author || '') : (w?.author || '');
    x.state = k.startsWith('imp:') ? (imp[k] ? 'on this device' : S.trash?.[k] ? 'removed' : 'erased') : (inst[k] ? 'on this device' : S.trash?.[k] ? 'removed' : 'not on this device');
  }
  return [...A.values()].sort((a, b) => a.title.localeCompare(b.title));
}
async function annotDialog() {
  const L = await annotData(), n = x => x.toLocaleString('en');
  const sum = x => [x.g ? `${n(x.g)} gloss${x.g === 1 ? '' : 'es'}` : '', x.mk ? 'marker' : '', x.an ? `${n(x.an)} reading${x.an === 1 ? '' : 's'}` : '', x.pl ? `${n(x.pl)} place${x.pl === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  S.annot = L;
  const r = await dialog(`${dlgHead('Annotations')}
    <p class="hint small">What you have added to each text – glosses, the marker, chosen readings, places on the map. It stays when a text is removed or erased.</p>
    <div class="list plain annlist">${L.length ? L.map((x, i) => `<div class="item annrow" data-ai="${i}"><span class="t"><b>${esc(x.title)}</b><small>${[esc(x.author), x.state, sum(x)].filter(Boolean).join(' · ')}</small></span><button type="button" class="danger" data-annask="${i}">Delete</button></div>`).join('') : '<p class="hint">No annotations yet.</p>'}</div>`,
    [['back', 'Back']]);
  if (r.action === 'back') return pultDialog();
}
document.addEventListener('click', async ev => {
  const a = ev.target.closest?.('#dlg [data-annask]'), ok = ev.target.closest?.('#dlg [data-anndel]'), no = ev.target.closest?.('#dlg [data-annno]');
  if (!a && !ok && !no) return;
  ev.preventDefault(); ev.stopPropagation();
  if (no) return no.closest('.dlask').remove();
  if (a) {
    document.querySelectorAll('#dlg .dlask').forEach(x => x.remove());
    const x = S.annot[+a.dataset.annask];
    a.closest('.annrow').insertAdjacentHTML('afterend', `<div class="dlask"><span>Delete everything you added to “${esc(x.title)}”?</span><button type="button" class="danger" data-anndel="${a.dataset.annask}">Delete</button><button type="button" data-annno="1">Cancel</button></div>`);
    return;
  }
  const x = S.annot[+ok.dataset.anndel]; ok.closest('.dlask').remove();
  for (const g of await getAll('glosses')) if (keyOfText(g.textId) === x.key) await del('glosses', g.id);
  const keys = p => req2p(tx('settings').objectStore('settings').getAllKeys(IDBKeyRange.bound(p, p + '\uffff')));
  for (const t of x.tids) { await del('settings', 'mk|' + t); for (const p of [`an|${t}|`, `pl|${t}|`]) for (const k of await keys(p)) await del('settings', k); }
  for (const k of await keys(`plw|${x.key}|`)) await del('settings', k);
  await del('settings', 'gone|' + x.key);
  if (S.text && keyOfText(S.text.id) === x.key) await openText(S.text.id, false);
  const row = document.querySelector(`#dlg .annrow[data-ai="${ok.dataset.anndel}"]`); row?.remove();
  toast('Deleted', 1800);
});
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
