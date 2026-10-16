// ================================================================ Pult · several texts on one map, saved maps, export
// "Places from": the author's works, or a saved selection of works, books, chapters and sections of the library.
// Saved maps (settings key mmap|<id>): what the map showed – texts, part, view, period, layers – to be opened again.
// Export: an image (PNG), a PDF, or a Pult map file (the saved map with its places and the corrections that belong to it).

// ---------------------------------------------------------------- the places of any text of the library
async function placesOfAny(id) {
  if (S.text && S.text.id === id) return { hits: M.hits, toks: S.tokens, t: S.text, refs: S.refs };
  M.anyCache ??= new Map(); if (M.anyCache.has(id)) return M.anyCache.get(id);
  const t = isBook(id) ? await loadBook(id) : await get('texts', id); if (!t) return null;
  const toks = t.blocks ? tokenizeBlocks(t.blocks) : tokenize(t.text);
  if (t.ann && t.work?.annL) applyAnnotation(t, toks);
  const memo = M.lemMemo ??= new Map();
  const lemmaOf = async tk => {
    if (tk.ctx) return tk.ctx.l;
    if (!memo.has(tk.s)) { const A = await analyses(tk.s); memo.set(tk.s, A.pick || A.lemmas[0]?.lemma || null); }
    return memo.get(tk.s);
  };
  const hits = await findPlaceHits(toks, lemmaOf);
  const res = await choosePlaces(hits, t.id, workKeyOf(t), await workYear(t));
  const r = { hits: res, toks, t, refs: refsOf(toks, t.blocks) };
  M.anyCache.set(id, r); return r;
}
// ---------------------------------------------------------------- what "Places from" covers
// cfg.pfOn – the switch (off: no restriction – every place of the gazetteer, filtered in the layer menu)
// cfg.scope – section · chapter · book · work · author · sel (the selection)
// cfg.sel – the selection, saved: [{kind: 'work', w} | {kind: 'book', t} | {kind: 'chapter'|'section', t, ref}, …, with a label]
const selKey = x => x.kind === 'work' ? 'w|' + x.w : `${x.kind}|${x.t}|${x.ref ?? ''}`;
// the parts of texts to read, each with the word range that counts (null = all of it)
async function scopeParts() {
  const sc = M.cfg.scope, out = [];
  if (sc === 'author') {
    const t = S.text; if (!t) return out;
    if (t.work) { for (const w of await libWorks()) if (w.authorId === t.work.authorId || (w.author && w.author === t.work.author)) w.books.forEach((_, bi) => out.push({ id: `w:${w.id}:${bi}` })); }
    else for (const x of await getAll('texts')) if (x.id === t.id || (t.author && x.author === t.author)) out.push({ id: x.id });
    return out;
  }
  if (sc !== 'sel') return out;
  for (const x of M.cfg.sel || []) {
    if (x.kind === 'work') { const w = await libGet('works', x.w); if (w) w.books.forEach((_, bi) => out.push({ id: `w:${w.id}:${bi}` })); }
    else out.push({ id: x.t, kind: x.kind, ref: x.ref });
  }
  return out;
}
// the word range of a chapter or section in a text
function refRange(r, kind, ref) {
  if (!kind || kind === 'book') return null;
  const R = r.refs || [], last = r.toks.filter(x => x.t === 'w').length - 1;
  let a = -1, b = -1;
  R.forEach((x, j) => { if (x.s === ref || (kind === 'chapter' && chapterKey(x.s) === ref)) { if (a < 0) a = j; b = j; } });
  if (a < 0) return [1, 0];                                        // no longer found: nothing
  return [R[a].i, (R[b + 1]?.i ?? last + 1) - 1];
}
async function eachScopeHit(fn, progress) {
  const parts = await scopeParts();
  for (let n = 0; n < parts.length; n++) {
    progress?.(n, parts.length);
    const r = await placesOfAny(parts[n].id); if (!r) continue;
    const rg = refRange(r, parts[n].kind, parts[n].ref);
    for (const [i, h] of r.hits) if (!rg || (i >= rg[0] && i <= rg[1])) fn(h, i, r, parts[n].id);
  }
}
// called from scopePlaces: the places of the author's works or of the selection
async function multiPlaces(add) {
  const lbl = $('#mapScope');
  await eachScopeHit((h, i, r, id) => add(h, id), (n, all) => { if (lbl && all > 2) lbl.innerHTML = `${esc(scopeLabel(M.cfg.scope))} <small>· reading ${n + 1} of ${all} …</small>`; });
}
function selSummary() {
  const s = M.cfg.sel || []; if (!s.length) return 'nothing chosen yet';
  const c = {}; for (const x of s) c[x.kind] = (c[x.kind] || 0) + 1;
  const works = new Set(s.map(x => x.kind === 'work' ? x.w : String(x.t).replace(/^w:(.*):\d+$/, '$1')));
  const nm = { work: ['work', 'works'], book: ['book', 'books'], chapter: ['chapter', 'chapters'], section: ['section', 'sections'] };
  return ['work', 'book', 'chapter', 'section'].filter(k => c[k]).map(k => `${c[k]} ${nm[k][c[k] === 1 ? 0 : 1]}`).join(', ') + (works.size > 1 ? ` from ${works.size} works` : '');
}
const shortWork = t => t.work ? `${t.work.author ? t.work.author + ', ' : ''}${t.work.title}` : (t.title || 'Text');
// add what is being read to the selection
function selAdd(kind) {
  const t = S.text; if (!t) return toast('Open a text first.');
  const cr = curRef(), multi = t.work && t.work.books.length > 1, part = multi ? stripCommon(t.work.books)[t.bi] : '';
  let x;
  if (kind === 'work') x = t.work ? { kind: 'work', w: t.work.id, label: shortWork(t), sub: 'the whole work' } : { kind: 'book', t: t.id, label: shortWork(t), sub: 'the whole text' };
  else if (kind === 'book' || !cr) x = { kind: 'book', t: t.id, label: `${shortWork(t)}${multi ? ' · ' + t.work.books[t.bi] : ''}`, sub: multi ? 'the whole book' : 'the whole text' };
  else { const ref = kind === 'chapter' ? (chapterKey(cr.s) ?? cr.s) : cr.s; x = { kind, t: t.id, ref, label: `${shortWork(t)} · ${part && !String(ref).startsWith(part + '.') ? part + '.' : ''}${ref}`, sub: kind }; }
  M.cfg.sel ??= [];
  if (M.cfg.sel.some(y => selKey(y) === selKey(x))) return toast('Already in the selection.');
  M.cfg.sel.push(x); saveMapCfg();
}
// the editor of the selection: a list (with ✕) and ways to add to it
function selPop() {
  const pop = $('#mapPop'); pop.dataset.k = 'sel'; pop.classList.add('mlayers'); pop.classList.remove('right');
  const s = M.cfg.sel || [];
  pop.innerHTML = `<div class="mph"><span class="navh">Selection</span><small class="mcnt">${s.length} item${s.length === 1 ? '' : 's'}</small><button type="button" class="mx" data-mpopx="1" aria-label="Close">✕</button></div>
    ${s.length ? s.map((x, k) => `<div class="msel"><div><span>${esc(x.label)}</span><small>${esc(x.sub || x.kind)}</small></div><button type="button" class="mico2" data-mseldel="${k}" aria-label="Remove">✕</button></div>`).join('') : '<p class="hint small">Nothing chosen yet. Add what you are reading, or browse the library.</p>'}
    <div class="macts"><button type="button" data-mseladd="section">+ this section</button><button type="button" data-mseladd="chapter">+ this chapter</button><button type="button" data-mseladd="book">+ this book</button><button type="button" data-mseladd="work">+ this work</button></div>
    <div class="macts"><button type="button" data-mselbrowse="1">Browse the library …</button><button type="button" class="acc" data-mselshow="1" style="margin-left:auto">Show on the map</button></div>`;
  pop.hidden = false;
}
// the library as a tree: works → books → chapters (chapters are read when a book is unfolded)
async function selBrowse() {
  const works = (await libWorks()).sort((a, b) => (a.author || '').localeCompare(b.author || '') || a.title.localeCompare(b.title)), imp = await getAll('texts');
  const sel = M.cfg.sel || [], has = k => sel.some(x => selKey(x) === k);
  const loaded = new Set();
  let h = '';
  for (const w of works) {
    const any = sel.some(x => x.kind === 'work' ? x.w === w.id : String(x.t).startsWith(`w:${w.id}:`));
    h += `<details class="mtree"${any ? ' open' : ''}><summary><input type="checkbox" name="w|${esc(w.id)}"${has('w|' + w.id) ? ' checked' : ''}> <span>${esc(w.author ? w.author + ' · ' : '')}${esc(w.title)}</span></summary>`
      + w.books.map((b, bi) => { const id = `w:${w.id}:${bi}`, part = sel.some(x => x.t === id && x.kind !== 'book');
        return `<details class="mtree l1" data-bk="${esc(id)}"><summary><input type="checkbox" name="book|${esc(id)}|"${has(`book|${id}|`) ? ' checked' : ''}> <span>${esc(b)}</span>${part ? '<small>part chosen</small>' : ''}</summary><div class="mchs"><p class="hint small">…</p></div></details>`; }).join('') + '</details>';
  }
  if (imp.length) h += '<div class="navh">Imported</div>' + imp.map(t => `<label class="mpick"><input type="checkbox" name="book|${t.id}|"${has(`book|${t.id}|`) ? ' checked' : ''}> ${esc(t.title || 'Untitled')}</label>`).join('');
  const onToggle = async ev => {
    const d = ev.target; if (!d.matches?.('details[data-bk]') || !d.open || loaded.has(d.dataset.bk)) return;
    loaded.add(d.dataset.bk);
    const r = await placesOfAny(d.dataset.bk) || {}, keys = [];
    for (const x of r.refs || []) { const k = chapterKey(x.s) ?? x.s; if (!keys.includes(k)) keys.push(k); }
    d.querySelector('.mchs').innerHTML = keys.length ? keys.map(k => `<label class="mpick l2"><input type="checkbox" name="chapter|${esc(d.dataset.bk)}|${esc(k)}"${has(`chapter|${d.dataset.bk}|${k}`) ? ' checked' : ''}> ${esc(k)}</label>`).join('') : '<p class="hint small">No chapters.</p>';
  };
  document.addEventListener('toggle', onToggle, true);
  const r = await dialog(`<h3>Selection</h3><p class="hint small">Tick whole works, books or chapters. Sections are added with “+ this section” while reading.</p><div class="mpicklist">${h || '<p class="hint">No texts in the library yet.</p>'}</div>`, [['cancel', 'Cancel'], ['ok', 'Apply']], 'ok');
  document.removeEventListener('toggle', onToggle, true);
  if (r.action !== 'ok') return false;
  const on = new Set(Object.keys(r.data).filter(k => r.data[k] === 'on'));
  const wOf = id => String(id).replace(/^w:(.*):\d+$/, '$1');
  const titleOf = async id => { const p = await placesOfAny(id); return p ? p.t : null; };
  const out = [];
  // kept: sections, and chapters of books whose chapters were not unfolded
  for (const x of sel) if (x.kind === 'section' || (x.kind === 'chapter' && !loaded.has(x.t))) if (!on.has('w|' + wOf(x.t)) && !on.has(`book|${x.t}|`)) out.push(x);
  for (const k of on) {
    const [kind, a, ref] = k.split('|');
    if (kind === 'w') { const w = works.find(z => z.id === a); out.push({ kind: 'work', w: a, label: `${w?.author ? w.author + ', ' : ''}${w?.title || a}`, sub: 'the whole work' }); continue; }
    const id = /^\d+$/.test(a) ? +a : a;
    if (on.has('w|' + wOf(id)) && String(id).startsWith('w:')) continue;
    if (kind === 'chapter' && on.has(`book|${a}|`)) continue;
    const old = sel.find(x => selKey(x) === `${kind}|${id}|${ref || ''}`); if (old) { out.push(old); continue; }
    const t = await titleOf(id); if (!t) continue;
    const multi = t.work && t.work.books.length > 1;
    out.push(kind === 'book' ? { kind, t: id, label: `${shortWork(t)}${multi ? ' · ' + t.work.books[t.bi] : ''}`, sub: multi ? 'the whole book' : 'the whole text' }
      : { kind, t: id, ref, label: `${shortWork(t)} · ${multi ? stripCommon(t.work.books)[t.bi] + '.' : ''}${ref}`, sub: 'chapter' });
  }
  M.cfg.sel = out; await saveMapCfg(); return true;
}
// the card of a place: its passages in the author's works or in the selection
async function cardMulti(p) {
  const list = $('#mapCard .mpass'); if (!list) return;
  list.innerHTML = '<p class="hint small">Searching …</p>';
  let h = '';
  await eachScopeHit((x, i, r, id) => {
    if (x.p.id !== p.id) return;
    const words = r.toks.filter(z => z.t === 'w'), title = r.t.work ? `${r.t.work.title}${r.t.work.books.length > 1 ? ' ' + stripCommon(r.t.work.books)[r.t.bi] : ''}` : r.t.title;
    let ref = ''; for (const y of r.refs || []) { if (y.i <= i) ref = y.s; else break; }
    const k = words.findIndex(z => z.i === i), c = words.slice(Math.max(0, k - 5), k + 6).map(z => z.i === i ? `<u>${esc(z.s)}</u>` : esc(z.s)).join(' ');
    h += `<button type="button" class="mps" data-mgoany="${esc(String(id))}" data-mi="${i}"><b>${esc(title)}${ref ? ' · ' + esc(ref) : ''}</b><span>${c}</span></button>`;
  });
  list.innerHTML = h || '<p class="hint small">Not named here.</p>';
}
async function mapGoAny(id, i) {
  if (parseFloat(getSplit()) <= 0.5) { setSplit(M.splitBefore || '50%'); setTimeout(() => M.map?.resize(), 50); }
  if (navNarrowPhone()) { M.back = true; toggleMapTab(false); }
  if (!S.text || String(S.text.id) !== String(id)) await openText(/^\d+$/.test(id) ? +id : id, false);
  requestAnimationFrame(() => scrollToWord(i));
}

// ---------------------------------------------------------------- saved maps
const MAP_KEYS = ['pfOn', 'sel', 'sites', 'cats', 'coast', 'empires', 'regions', 'roads', 'urban', 'borders', 'peoples', 'names', 'time', 'tol', 'gone', 'undated', 'twoCol', 'rangeCols'];
function mapState() {
  const c = M.map.getCenter();
  return { scope: M.cfg.scope, textId: S.text?.id ?? null, ref: curRef()?.s ?? null,
    view: { c: [+c.lng.toFixed(4), +c.lat.toFixed(4)], z: +M.map.getZoom().toFixed(2) }, ranges: JSON.parse(JSON.stringify(M.T?.ranges || [])),
    layers: Object.fromEntries(MAP_KEYS.map(k => [k, JSON.parse(JSON.stringify(M.cfg[k] ?? null))])) };
}
async function savedMaps() { return (await getAll('settings', IDBKeyRange.bound('mmap|', 'mmap|￿'))).map(r => r.v).sort((a, b) => b.created - a.created); }
async function saveMapDialog() {
  const t = S.text, sug = M.cfg.scope === 'sel' ? 'Selection – ' + selSummary() : t ? `${t.work ? t.work.title : t.title} – ${scopeLabel(M.cfg.scope)}` : 'Map';
  const r = await dialog(`<h3>Save this map</h3><p class="hint small">Keeps the texts, the part, the view, the period and the layers – to open again later (the bookmark button of the map).</p><label>Name<input type="text" name="n" value="${esc(sug)}" autocomplete="off"></label>`, [['cancel', 'Cancel'], ['ok', 'Save']], 'ok');
  if (r.action !== 'ok' || !r.data.n?.trim()) return;
  const m = Object.assign(mapState(), { id: Date.now().toString(36), name: r.data.n.trim(), created: Date.now() });
  await setting('mmap|' + m.id, m); toast('Map saved');
}
async function openSavedMap(m) {
  $('#mapPop').hidden = true;
  if (m.textId != null && (!S.text || String(S.text.id) !== String(m.textId)) && !['sel', 'author'].includes(m.scope)) {
    await openText(m.textId); if (m.ref) await goTo(m.ref);
  }
  Object.assign(M.cfg, JSON.parse(JSON.stringify(m.layers || {})), { scope: m.scope }); await saveMapCfg();
  timeFor(S.text); if (m.ranges) M.T.ranges = JSON.parse(JSON.stringify(m.ranges));
  if (m.layers?.borders != null) M.map.setLayoutProperty('borders', 'visibility', M.cfg.borders ? 'visible' : 'none');
  if (M.cfg.regions !== 'off') await loadAncientLabels();
  M.map.jumpTo({ center: m.view.c, zoom: m.view.z });
  markPlaces(); renderTime(); await refreshMapData();
}

// ---------------------------------------------------------------- the menu of the scope button ("Places from")
const SCOPES = [['section', 'Section'], ['chapter', 'Chapter'], ['book', 'Book'], ['work', 'Work'], ['author', 'Author'], ['sel', 'Selection']];
function scopeExplain() {
  const t = S.text, w = t?.work, cr = curRef(), sc = M.cfg.scope;
  if (!M.cfg.pfOn) return '<b>Switched off</b> – every place is shown, whether a text names it or not (choose which in the layer menu)';
  if (sc === 'section') return cr ? `<b>Section ${esc(cr.s)}</b> – the section at the top of the text` : '<b>Section</b> – the section you are reading';
  if (sc === 'chapter') return cr ? `<b>Chapter ${esc(chapterKey(cr.s) ?? cr.s)}</b> – the chapter at the top of the text` : '<b>Chapter</b> – the chapter you are reading';
  if (sc === 'book') return w && w.books.length > 1 ? `<b>${esc(w.books[t.bi])}</b> – the part that is open` : '<b>Book</b> – the open text';
  if (sc === 'work') return w ? `<b>${esc(w.title)}</b> – all its parts` : `<b>${esc(t?.title || 'Work')}</b> – the open text`;
  if (sc === 'author') { const a = w ? w.author : t?.author; return `<b>${esc(a || 'Author')}</b> – all works in your library`; }
  return `<b>Selection</b> – ${esc(selSummary())}`;
}
async function scopePop(keep) {
  const pop = $('#mapPop'); if (!keep && !pop.hidden && pop.dataset.k === 'scope') { pop.hidden = true; return; }
  pop.dataset.k = 'scope'; pop.classList.add('mlayers'); pop.classList.remove('right');
  const on = M.cfg.pfOn !== false;
  pop.innerHTML = `<div class="mph"><span class="navh">Places from</span><button type="button" class="mswitch${on ? ' on' : ''}" data-mpfon="1" role="switch" aria-checked="${on}" aria-label="Places from texts"><i></i></button><button type="button" class="mx" data-mpopx="1" aria-label="Close">✕</button></div>
    <div class="mseg${on ? '' : ' off'}" role="group">${SCOPES.map(([v, l]) => `<button type="button" data-mscopev="${v}" class="${M.cfg.scope === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="mex">${scopeExplain()}</div>
    ${on && M.cfg.scope === 'sel' ? '<div class="macts"><button type="button" class="acc" data-mseledit="1">Edit selection …</button></div>' : ''}`;
  pop.hidden = false;
}
// the third map button: saved maps, saving, opening a map file, export
const SAVE_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h11v17l-5.5-4-5.5 4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 7.5v5.5M9.5 10.5 12 13l2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
async function savePop(keep) {
  const pop = $('#mapPop'); if (!keep && !pop.hidden && pop.dataset.k === 'save') { pop.hidden = true; return; }
  pop.dataset.k = 'save'; pop.classList.add('mlayers', 'right');
  const maps = await savedMaps();
  pop.innerHTML = `<div class="mph"><span class="navh">Saved maps</span><button type="button" class="mx" data-mpopx="1" aria-label="Close">✕</button></div>
    ${maps.length ? maps.map(m => `<div class="msaved"><button type="button" class="mckt" data-mopen="${m.id}">${esc(m.name)}<small>${new Date(m.created).toLocaleDateString('en-GB')}</small></button><button type="button" class="mico2" data-mdelmap="${m.id}" title="Delete" aria-label="Delete">✕</button></div>`).join('') : '<p class="hint small">None yet.</p>'}
    <div class="macts"><button type="button" data-msave="1">Save this map …</button><button type="button" data-mimport="1">Open a map file …</button></div>
    <div class="navh">Export this map</div><div class="macts"><button type="button" data-mexp="png">Image</button><button type="button" data-mexp="pdf">PDF</button><button type="button" data-mexp="pult">Pult map file</button></div>`;
  pop.hidden = false;
}
async function savedClick(b) {
  const d = b.dataset;
  if (d.mpfon) { M.cfg.pfOn = M.cfg.pfOn === false; await saveMapCfg(); await refreshMapData(); await scopePop(true); return true; }
  if (d.mseledit) { selPop(); return true; }
  if (d.mseladd) { selAdd(d.mseladd); selPop(); return true; }
  if (d.mseldel != null) { M.cfg.sel.splice(+d.mseldel, 1); await saveMapCfg(); selPop(); if (M.cfg.scope === 'sel') refreshMapData(); return true; }
  if (d.mselbrowse) { if (await selBrowse() && M.cfg.scope === 'sel') refreshMapData(); selPop(); return true; }   // the card stays open
  if (d.mselshow) { M.cfg.scope = 'sel'; M.cfg.pfOn = true; await saveMapCfg(); await refreshMapData(); await scopePop(true); return true; }
  if (d.mgoany != null) { mapGoAny(d.mgoany, +d.mi); return true; }
  if (d.msave) { $('#mapPop').hidden = true; await saveMapDialog(); return true; }
  if (d.mopen) { const m = await setting('mmap|' + d.mopen); if (m) await openSavedMap(m); return true; }
  if (d.mdelmap) { await del('settings', 'mmap|' + d.mdelmap); await savePop(true); toast('Map deleted'); return true; }
  if (d.mexp) { $('#mapPop').hidden = true; await exportMap(d.mexp); return true; }
  if (d.mimport) {
    $('#mapPop').hidden = true;
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,.pultmap,application/json';
    inp.onchange = () => inp.files[0] && importMapFile(inp.files[0]); inp.click(); return true;
  }
  return false;
}

// ---------------------------------------------------------------- export
function mapTitle() {
  const t = S.text, sc = M.cfg.scope;
  const what = sc === 'sel' ? 'Selection' : t ? `${t.work ? `${t.work.author ? t.work.author + ', ' : ''}${t.work.title}` : t.title} – ${scopeLabel(sc)}` : 'Map';
  const R = M.cfg.time && M.T?.ranges?.length ? M.T.ranges.map(fmtR).join(' · ') : '';
  return [what, R].filter(Boolean).join(' · ');
}
// the map as it is on screen, with its labels, a title and the sources below
async function mapCanvas() {
  const mc = M.map.getCanvas(), dpr = mc.width / mc.clientWidth, W = mc.width, foot = Math.round(46 * dpr);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = mc.height + foot;
  const ctx = cv.getContext('2d');
  await new Promise(res => { M.map.once('render', () => { ctx.drawImage(mc, 0, 0); res(); }); M.map.triggerRepaint(); });
  const box = $('#mapCanvas').getBoundingClientRect(), bg = mapColors().bg;
  ctx.save(); ctx.scale(dpr, dpr);
  for (const s of document.querySelectorAll('#mapLabels .mlbl')) {
    const cs = getComputedStyle(s), op = +cs.opacity; if (!op) continue;
    ctx.globalAlpha = op; ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    const txt = cs.textTransform === 'uppercase' ? s.textContent.toUpperCase() : s.textContent;
    ctx.lineWidth = 3; ctx.strokeStyle = bg; ctx.fillStyle = cs.color; ctx.lineJoin = 'round';
    const rot = (s.style.transform.match(/rotate\(([-\d.]+)deg/) || [])[1];
    if (rot != null) {
      ctx.save(); ctx.translate(parseFloat(s.style.left), parseFloat(s.style.top)); ctx.rotate(+rot * Math.PI / 180);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText(txt, 0, 0); ctx.fillText(txt, 0, 0); ctx.restore();
    } else {
      const r = s.getBoundingClientRect(), x = r.left - box.left + 2, y = r.top - box.top + 1;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.strokeText(txt, x, y); ctx.fillText(txt, x, y);
    }
  }
  ctx.globalAlpha = 1; ctx.letterSpacing = '0px';
  const fg = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim(), H = mc.clientHeight;
  ctx.fillStyle = bg; ctx.fillRect(0, H, W / dpr, 46);
  ctx.fillStyle = fg; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  ctx.font = '600 14px "Gentium Book Plus", serif'; ctx.fillText(mapTitle(), 10, H + 7, W / dpr - 20);
  ctx.globalAlpha = 0.65; ctx.font = '10px Inter, system-ui, sans-serif';
  ctx.fillText('Places: Pleiades (CC BY) · Map: Natural Earth' + (M.anc ? ' · Ancient world: Ancient World Mapping Center (ODbL)' : '') + ' · made with Pult', 10, H + 27, W / dpr - 20);
  ctx.restore();
  return cv;
}
// a PDF with one page: the image, fitted to A4 landscape
async function pdfOf(cv) {
  const jpg = new Uint8Array(await (await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92))).arrayBuffer());
  const PW = 842, PH = 595, m = 24, sc = Math.min((PW - 2 * m) / cv.width, (PH - 2 * m) / cv.height), w = cv.width * sc, h = cv.height * sc, x = (PW - w) / 2, y = (PH - h) / 2;
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const push = b => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); len += u.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); for (const b of [].concat(body)) push(b); push('\nendobj\n'); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, [`<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, jpg, '\nendstream']);
  const cs = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;
  obj(5, `<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`);
  const xref = len;
  push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map(n => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}
async function exportMap(fmt) {
  const base = (mapTitle().replace(/[\\/:*?"<>|…]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'map');
  let blob, name;
  if (fmt === 'pult') {
    const st = Object.assign(mapState(), { id: Date.now().toString(36), name: base, created: Date.now() });
    const ids = ['sel', 'author'].includes(M.cfg.scope) ? (await scopeParts()).map(x => x.id) : S.text ? [S.text.id] : [];
    const corr = (await getAll('settings')).filter(r => /^(plg|pown)\|/.test(r.k) || ids.some(id => r.k.startsWith(`pl|${id}|`)) || (r.k.startsWith('plw|') && ids.some(id => { const w = String(id).match(/^w:(.*):\d+$/); return r.k.startsWith(`plw|${w ? w[1] : 'imp:' + id}|`); })));
    const places = [...(M.shown?.values() || [])].map(x => ({ id: x.p.id, t: x.p.t, lat: x.p.lat, lon: x.p.lon, n: x.n, names: x.names }));
    blob = new Blob([JSON.stringify({ format: 'pult-map-1', date: new Date().toISOString(), map: st, places, corrections: Object.fromEntries(corr.map(r => [r.k, r.v])) })], { type: 'application/json' });
    name = base + '.pultmap.json';
  } else {
    toast('Preparing the image …');
    const cv = await mapCanvas();
    if (fmt === 'png') { blob = await new Promise(r => cv.toBlob(r, 'image/png')); name = base + '.png'; }
    else { blob = await pdfOf(cv); name = base + '.pdf'; }
  }
  const href = URL.createObjectURL(blob);
  await dialog(`<h3>Export ready</h3><p>${esc(name)} (${mb(blob.size)})</p>`, [['link', 'Save file', { href, name }], ['cancel', 'Close']]);
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}
async function importMapFile(file) {
  let j; try { j = JSON.parse(await file.text()); } catch (_) { return toast('Not a map file.'); }
  if (j.format !== 'pult-map-1' || !j.map) return toast('Not a Pult map file.');
  const n = Object.keys(j.corrections || {}).length;
  const r = await dialog(`<h3>Open map</h3><p><b>${esc(j.map.name || 'Map')}</b></p><p class="hint small">${(j.places || []).length} places${n ? ` · ${n} corrections of places (they replace yours where they differ)` : ''}. The texts must be in your library.</p>`, [['cancel', 'Cancel'], ['ok', 'Save and open']], 'ok');
  if (r.action !== 'ok') return;
  for (const [k, v] of Object.entries(j.corrections || {})) if (/^(pl|plw|plg|pown)\|/.test(k)) { await setting(k, v); if (k.startsWith('pown|')) M.own.set(v.id, v); }
  const m = Object.assign({}, j.map, { id: Date.now().toString(36), created: Date.now() });
  await setting('mmap|' + m.id, m);
  M.anyCache = null; M.workCache = null; await placesForText();
  if (S.tab !== 'map') { toggleMapTab(true); await showMap(); }
  await openSavedMap(m);
}
