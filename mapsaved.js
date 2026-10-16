// ================================================================ Pult · several texts on one map, saved maps, export
// "Places from: Several texts" – the places of any works and imported texts of the library together.
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
// the texts of the scope: chosen ones, all works of the author, or all texts of the library
// ('w:<work id>' = all its parts, 'imp:<text id>' = an imported text)
async function scopeKeys() {
  const sc = M.cfg.scope;
  if (sc === 'multi') return M.cfg.multi || [];
  const works = await libWorks(), imp = await getAll('texts');
  if (sc === 'all') return [...works.map(w => 'w:' + w.id), ...imp.map(t => 'imp:' + t.id)];
  if (sc === 'author') {
    const t = S.text; if (!t) return [];
    if (t.work) return works.filter(w => w.authorId === t.work.authorId || (w.author && w.author === t.work.author)).map(w => 'w:' + w.id);
    return imp.filter(x => x.id === t.id || (t.author && x.author === t.author)).map(x => 'imp:' + x.id);
  }
  return [];
}
async function multiTextIds() {
  const out = [];
  for (const k of await scopeKeys()) {
    if (k.startsWith('imp:')) out.push(+k.slice(4));
    else { const w = await libGet('works', k.slice(2)); if (w) w.books.forEach((_, bi) => out.push(`w:${w.id}:${bi}`)); }
  }
  return out;
}
async function multiLabel() {
  const ks = M.cfg.multi || []; if (!ks.length) return 'no texts chosen';
  if (ks.length > 1) return `${ks.length} texts`;
  const k = ks[0]; if (k.startsWith('imp:')) return (await get('texts', +k.slice(4)))?.title || 'imported text';
  return (await libGet('works', k.slice(2)))?.title || 'a work';
}
// called from scopePlaces: all places of the chosen texts (with the texts each comes from)
async function multiPlaces(add) {
  const ids = await multiTextIds(), lbl = $('#mapScope');
  for (let n = 0; n < ids.length; n++) {
    if (lbl && ids.length > 2) lbl.innerHTML = `${esc(scopeLabel(M.cfg.scope))} <small>· reading ${n + 1} of ${ids.length} …</small>`;
    const r = await placesOfAny(ids[n]); if (!r) continue;
    for (const h of r.hits.values()) add(h, ids[n]);
  }
}
async function pickTextsDialog() {
  const works = (await libWorks()).sort((a, b) => (a.author || '').localeCompare(b.author || '') || a.title.localeCompare(b.title));
  const imp = await getAll('texts');
  const sel = new Set(M.cfg.multi?.length ? M.cfg.multi : S.text ? [S.text.work ? 'w:' + S.text.work.id : 'imp:' + S.text.id] : []);
  let h = '', last = null;
  for (const w of works) {
    if (w.author !== last) { h += `<div class="navh">${esc(w.author || '')}</div>`; last = w.author; }
    h += `<label class="mpick"><input type="checkbox" name="w:${esc(w.id)}"${sel.has('w:' + w.id) ? ' checked' : ''}> ${esc(w.title)}${w.books.length > 1 ? ` <small>${w.books.length} parts</small>` : ''}</label>`;
  }
  if (imp.length) { h += '<div class="navh">Imported</div>'; for (const t of imp) h += `<label class="mpick"><input type="checkbox" name="imp:${t.id}"${sel.has('imp:' + t.id) ? ' checked' : ''}> ${esc(t.title || 'Untitled')}</label>`; }
  const r = await dialog(`<h3>Places from several texts</h3><p class="hint small">The map shows the places of all texts chosen here. Long works take a moment the first time.</p><div class="mpicklist">${h || '<p class="hint">No texts in the library yet.</p>'}</div>`, [['cancel', 'Cancel'], ['ok', 'Show']], 'ok');
  if (r.action !== 'ok') return false;
  M.cfg.multi = Object.keys(r.data).filter(k => r.data[k] === 'on'); M.cfg.scope = 'multi'; await saveMapCfg();
  return true;
}
// the card of a place: its passages in all chosen texts
async function cardMulti(p) {
  const list = $('#mapCard .mpass'); if (!list) return;
  list.innerHTML = '<p class="hint small">Searching the chosen texts …</p>';
  let h = '';
  for (const id of await multiTextIds()) {
    const r = await placesOfAny(id); if (!r) continue;
    const words = r.toks.filter(x => x.t === 'w'), title = r.t.work ? `${r.t.work.title}${r.t.work.books.length > 1 ? ' ' + stripCommon(r.t.work.books)[r.t.bi] : ''}` : r.t.title;
    for (const [i, x] of r.hits) {
      if (x.p.id !== p.id) continue;
      let ref = ''; for (const y of r.refs || []) { if (y.i <= i) ref = y.s; else break; }
      const k = words.findIndex(z => z.i === i), c = words.slice(Math.max(0, k - 5), k + 6).map(z => z.i === i ? `<u>${esc(z.s)}</u>` : esc(z.s)).join(' ');
      h += `<button type="button" class="mps" data-mgoany="${esc(String(id))}" data-mi="${i}"><b>${esc(title)}${ref ? ' · ' + esc(ref) : ''}</b><span>${c}</span></button>`;
    }
  }
  list.innerHTML = h || '<p class="hint small">Not named in the chosen texts.</p>';
}
async function mapGoAny(id, i) {
  if (parseFloat(getSplit()) <= 0.5) { setSplit(M.splitBefore || '50%'); setTimeout(() => M.map?.resize(), 50); }
  if (navNarrowPhone()) { M.back = true; toggleMapTab(false); }
  if (!S.text || String(S.text.id) !== String(id)) await openText(/^\d+$/.test(id) ? +id : id, false);
  requestAnimationFrame(() => scrollToWord(i));
}

// ---------------------------------------------------------------- saved maps
const MAP_KEYS = ['sites', 'cats', 'coast', 'empires', 'regions', 'roads', 'urban', 'borders', 'peoples', 'names', 'time', 'tol', 'gone', 'undated', 'twoCol', 'rangeCols'];
function mapState() {
  const c = M.map.getCenter();
  return { scope: M.cfg.scope, multi: M.cfg.scope === 'multi' ? [...(M.cfg.multi || [])] : undefined, textId: S.text?.id ?? null, ref: curRef()?.s ?? null,
    view: { c: [+c.lng.toFixed(4), +c.lat.toFixed(4)], z: +M.map.getZoom().toFixed(2) }, ranges: JSON.parse(JSON.stringify(M.T?.ranges || [])),
    layers: Object.fromEntries(MAP_KEYS.map(k => [k, JSON.parse(JSON.stringify(M.cfg[k] ?? null))])) };
}
async function savedMaps() { return (await getAll('settings', IDBKeyRange.bound('mmap|', 'mmap|￿'))).map(r => r.v).sort((a, b) => b.created - a.created); }
async function saveMapDialog() {
  const t = S.text, sug = M.cfg.scope === 'multi' ? await multiLabel() : t ? `${t.work ? t.work.title : t.title} – ${scopeLabel(M.cfg.scope)}` : 'Map';
  const r = await dialog(`<h3>Save this map</h3><p class="hint small">Keeps the texts, the part, the view, the period and the layers – to open again later (Places from → Saved maps).</p><label>Name<input type="text" name="n" value="${esc(sug)}" autocomplete="off"></label>`, [['cancel', 'Cancel'], ['ok', 'Save']], 'ok');
  if (r.action !== 'ok' || !r.data.n?.trim()) return;
  const m = Object.assign(mapState(), { id: Date.now().toString(36), name: r.data.n.trim(), created: Date.now() });
  await setting('mmap|' + m.id, m); toast('Map saved');
}
async function openSavedMap(m) {
  $('#mapPop').hidden = true;
  if (m.textId != null && (!S.text || String(S.text.id) !== String(m.textId)) && m.scope !== 'multi') {
    await openText(m.textId); if (m.ref) await goTo(m.ref);
  }
  Object.assign(M.cfg, JSON.parse(JSON.stringify(m.layers || {})), { scope: m.scope, ...(m.multi ? { multi: m.multi } : {}) }); await saveMapCfg();
  timeFor(S.text); if (m.ranges) M.T.ranges = JSON.parse(JSON.stringify(m.ranges));
  if (m.layers?.borders != null) M.map.setLayoutProperty('borders', 'visibility', M.cfg.borders ? 'visible' : 'none');
  if (M.cfg.regions !== 'off') await loadAncientLabels();
  M.map.jumpTo({ center: m.view.c, zoom: m.view.z });
  markPlaces(); renderTime(); await refreshMapData();
}

// ---------------------------------------------------------------- the menu of the scope button
async function scopePop(keep) {
  const pop = $('#mapPop'); if (!keep && !pop.hidden && pop.dataset.k === 'scope') { pop.hidden = true; return; }
  pop.dataset.k = 'scope'; pop.classList.add('mlayers'); pop.classList.remove('right');
  const t = S.text, w = t?.work, cr = curRef();
  const author = w ? w.author : t?.author;
  // what each choice refers to, with the reading position
  const opts = [
    ['none', 'None', 'only the layers – no places of texts'],
    ['section', 'Section', cr ? `${esc(cr.s)} – the section at the top of the text` : 'the section you are reading'],
    ['chapter', 'Chapter', cr ? `${esc(chapterKey(cr.s) ?? cr.s)} – the chapter at the top of the text` : 'the chapter you are reading'],
    ['book', 'Book', w && w.books.length > 1 ? `${esc(w.books[t.bi])} – the part that is open` : 'the open text'],
    ['work', 'Work', w ? `${esc(w.title)} – all its parts` : t ? esc(t.title || 'the open text') : 'the open text'],
    ['author', 'Author', author ? `all works of ${esc(author)} in your library` : 'all works of the author in your library'],
    ['all', 'All', 'every text in your library'],
    ['multi', 'Several texts …', M.cfg.scope === 'multi' ? esc(await multiLabel()) + ' – tap to change' : 'texts you choose'],
  ];
  pop.innerHTML = `<div class="mph"><span class="navh">Places from</span><button type="button" class="mx" data-mpopx="1" aria-label="Close">✕</button></div>
    <div class="mscl">${opts.map(([v, l, d]) => `<button type="button" class="mso${M.cfg.scope === v ? ' on' : ''}" ${v === 'multi' ? 'data-mmulti="1"' : `data-mscopev="${v}"`}><span class="rd"></span><span><b>${l}</b><small>${d}</small></span></button>`).join('')}</div>
`;
  pop.hidden = false; if (!keep) pop.scrollTop = 0;
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
  if (d.mmulti) { const ok = await pickTextsDialog(); await scopePop(true); if (ok) { await refreshMapData(); await scopePop(true); } return true; }   // the card stays open
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
  const what = sc === 'multi' ? 'Several texts' : t ? `${t.work ? `${t.work.author ? t.work.author + ', ' : ''}${t.work.title}` : t.title} – ${scopeLabel(sc)}` : 'Map';
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
    const ids = M.cfg.scope === 'multi' ? await multiTextIds() : S.text ? [S.text.id] : [];
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
