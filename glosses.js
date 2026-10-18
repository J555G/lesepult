// ---------------------------------------------------------------- glosses: what each keeps, and their export
// Besides its place (text, first and last word), a gloss keeps: the glossed words (w), the lemma (l), the reference (ref),
// five words on each side (cb, ca), the text's title and author (tt, ta) – taken when it is made; older glosses get them
// once, in the background, from their text if it is on this device. This lets a gloss be exported with its word and found
// again when its text comes back in another version.
const GL_CTX = 5;
// the words of a text with references and lemmata: the open text, a part of a work, or an imported text (null: not here)
async function glossSource(textId) {
  if (S.text && String(S.text.id) === String(textId) && S.tokens) {
    const w = S.text.work;
    return { words: S.tokens.filter(t => t.t === 'w'), refs: S.refs || [], lemma: async tk => tk.lemma || '',
      tt: w ? w.title + (w.books.length > 1 ? ' · ' + w.books[S.text.bi] : '') : S.text.title || '', ta: w ? w.author || '' : S.text.author || '' };
  }
  const lem = async tk => { try { return (await analyses(tk.s)).lemmas[0]?.lemma || ''; } catch (_) { return ''; } };
  const s = String(textId);
  if (s.startsWith('w:')) {
    const j = s.lastIndexOf(':'), wid = s.slice(2, j), bi = +s.slice(j + 1);
    const b = await libGet('books', wid + '|' + bi), w = await libGet('works', wid); if (!b || !w) return null;
    const toks = tokenizeBlocks(b.blocks);
    return { words: toks.filter(t => t.t === 'w'), refs: refsOf(toks, b.blocks), lemma: lem, tt: w.title + (w.books.length > 1 ? ' · ' + w.books[bi] : ''), ta: w.author || '' };
  }
  const t = await get('texts', +s); if (!t) return null;
  const toks = t.blocks ? tokenizeBlocks(t.blocks) : tokenize(t.text || '');
  return { words: toks.filter(x => x.t === 'w'), refs: refsOf(toks, t.blocks), lemma: lem, tt: t.title || 'Text ' + t.id, ta: t.author || '' };
}
// the words, lemma, reference and context of a gloss, from its source
async function glossMeta(g, src) {
  const W = src.words, k0 = W.findIndex(x => x.i === g.s); if (k0 < 0) return null;
  let k1 = k0; while (k1 + 1 < W.length && W[k1 + 1].i <= g.e) k1++;
  let ref = ''; for (const r of src.refs) { if (r.i > g.s) break; ref = r.s; }
  return { w: W.slice(k0, k1 + 1).map(x => x.s).join(' '), l: await src.lemma(W[k0]), ref,
    cb: W.slice(Math.max(0, k0 - GL_CTX), k0).map(x => x.s).join(' '), ca: W.slice(k1 + 1, k1 + 1 + GL_CTX).map(x => x.s).join(' '), tt: src.tt, ta: src.ta };
}
// a new or changed gloss in the open text: its data at once
async function glossStamp(g) { const src = await glossSource(g.textId); const m = src && await glossMeta(g, src); if (m) Object.assign(g, m); return g; }
// older glosses (without their data): filled in once, quietly, text by text
async function glossMigrate() {
  const by = new Map(); for (const g of await getAll('glosses')) if (g.w == null) { const k = String(g.textId); (by.get(k) || by.set(k, []).get(k)).push(g); }
  for (const [tid, gs] of by) {
    const src = await glossSource(/^\d+$/.test(tid) ? +tid : tid).catch(() => null); if (!src) continue;
    for (const g of gs) { const m = await glossMeta(g, src); if (m) { Object.assign(g, m); await put('glosses', g); } }
    await new Promise(r => setTimeout(r, 0));
  }
}
// names of lemmata with a default gloss (the gloss is kept under an accent-free key; its lemma is remembered beside it)
async function lemmaNames() { return (S.lgName ??= (await setting('lgName')) || {}); }
// default glosses made before their lemma was remembered: the lemma found among the words of a text opened
async function lemmaNamesFill() {
  const N = await lemmaNames(); let ch = false;
  for (const tk of S.tokens || []) { if (!tk.lemma) continue; const k = gkey(tk.lemma); if (S.lemmaGloss?.[k] && !N[k]) { N[k] = tk.lemma; ch = true; } }
  if (ch) await setting('lgName', N);
}
async function lemmaNameSet(k, l) { const N = await lemmaNames(); if (l && N[k] !== l) { N[k] = l; await setting('lgName', N); } }

// ---- export (☰ → This Pult → Annotations): all glosses, or those of one text; a spreadsheet (CSV) or a readable document
async function glossExportDialog(keys, title) {
  const O = S.glExp ??= { fmt: 'csv', order: 'read', defs: true };
  const seg = (name, cur, opts) => `<div class="seg segr">${opts.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}"${v === cur ? ' checked' : ''}>${l}</label>`).join('')}</div>`;
  const r = await dialog(`<h3>Export glosses</h3><p class="hint small">${esc(title)}</p>
    <div class="srow"><span class="sl">Format</span><div class="sc">${seg('fmt', O.fmt, [['csv', 'Spreadsheet (CSV)'], ['pdf', 'PDF'], ['html', 'HTML'], ['docx', 'Word']])}
      <small class="sh">PDF: the print dialog opens – choose “Save as PDF”. CSV opens in Excel, Numbers or LibreOffice.</small></div></div>
    <div class="srow"><span class="sl">Order</span><div class="sc">${seg('order', O.order, [['read', 'Reading order'], ['lemma', 'Lemma A–Z']])}</div></div>
    ${keys ? '' : `<div class="srow"><span class="sl">Include</span><div class="sc"><label class="sopt"><input type="checkbox" name="defs"${O.defs ? ' checked' : ''}> Default glosses (one per lemma)</label></div></div>`}`,
    [['cancel', 'Cancel'], ['ok', 'Export']]);
  if (r.action !== 'ok') return false;
  Object.assign(O, { fmt: r.data.fmt || 'csv', order: r.data.order || 'read', defs: !keys && r.data.defs === 'on' });
  await glossMigrate().catch(() => { });
  const A = await annotData(), names = Object.fromEntries(A.map(x => [x.key, x])), want = keys ? new Set(keys) : null;
  let G = (await getAll('glosses')).filter(g => { const k = keyOfText(g.textId); return k && (!want || want.has(k)); });
  const part = g => { const s = String(g.textId); return s.startsWith('w:') ? +s.slice(s.lastIndexOf(':') + 1) : 0; };
  const textOf = g => g.tt || names[keyOfText(g.textId)]?.title || '';
  if (O.order === 'lemma') G.sort((a, b) => gkey(a.l || a.w || '').localeCompare(gkey(b.l || b.w || ''), 'el') || textOf(a).localeCompare(textOf(b)) || a.s - b.s);
  else G.sort((a, b) => textOf(a).localeCompare(textOf(b)) || part(a) - part(b) || a.s - b.s);
  const LN = await lemmaNames(), D = O.defs ? Object.entries(S.lemmaGloss || {}).map(([k, t]) => ({ l: LN[k] || k, t })).sort((a, b) => gkey(a.l).localeCompare(gkey(b.l), 'el')) : [];
  if (!G.length && !D.length) { toast('No glosses to export.'); return false; }
  const day = ms => { if (!ms) return ''; const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };   // (the local date)
  const ctx = g => g.w != null ? [g.cb, `[${g.w}]`, g.ca].filter(Boolean).join(' ') : '';
  const base = (title.replace(/[\\/:*?"<>|…]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Pult') + ' – glosses';
  if (O.fmt === 'csv') {
    const q = v => /[",;\n\t]/.test(v ?? '') ? '"' + String(v).replace(/"/g, '""') + '"' : (v ?? '');
    let rows = [['Text', 'Reference', 'Word', 'Lemma', 'Gloss', 'Context', 'Date']].concat(G.map(g => [textOf(g), g.ref || '', g.w || '', g.l || '', g.t, ctx(g), day(g.created)]));
    if (D.length) rows = rows.concat([[]], [['Default glosses', '', '', 'Lemma', 'Gloss']], D.map(d => ['', '', '', d.l, d.t]));
    return glossSave(new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' }), base + '.csv');
  }
  // a readable document: grouped by text (reading order) or by lemma
  const groups = []; const add = (h, x) => { let g = groups[groups.length - 1]; if (!g || g.h !== h) groups.push(g = { h, x: [] }); g.x.push(x); };
  for (const g of G) add(O.order === 'lemma' ? (g.l || g.w || '–') : textOf(g), g);
  const DOC = { title: base, sub: `${G.length} gloss${G.length === 1 ? '' : 'es'} · exported ${day(Date.now())}`, groups, D };
  if (O.fmt === 'pdf') { printHTML(glossDocHTML(DOC, O.order), GLOSS_CSS); return true; }
  const blob = O.fmt === 'html' ? new Blob([`<!doctype html><html lang="grc"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(base)}</title><style>${await fontFacesInline()}body{margin:2.5em auto;max-width:46em;padding:0 1.5em;background:#fff}${GLOSS_CSS}</style></head><body>${glossDocHTML(DOC, O.order)}</body></html>`], { type: 'text/html' }) : await glossDocx(DOC, O.order);
  return glossSave(blob, base + (O.fmt === 'html' ? '.html' : '.docx'));
}
// saved by a tap on a link (on the iPad a download has to start from a tap)
async function glossSave(blob, name) {
  const href = URL.createObjectURL(blob);
  await dialog(`<h3>Export ready</h3><p class="hint small">${esc(name)}</p>`, [['cancel', 'Close'], ['link', 'Save', { href, name }]]);
  setTimeout(() => URL.revokeObjectURL(href), 60000); return true;
}
const GLOSS_CSS = `body{font:12pt/1.45 'Gentium Book Plus','Gentium Plus',serif;color:#111}h1{font:600 15pt 'Source Sans 3',Arial,sans-serif;margin:0 0 .2em}p.sub{font:10pt 'Source Sans 3',Arial,sans-serif;color:#555;margin:0 0 1.2em}
  h2{font:600 12pt 'Source Sans 3',Arial,sans-serif;margin:1.2em 0 .3em;break-after:avoid}.gl{margin:0 0 .45em;break-inside:avoid}.gl .r{font:9pt 'Source Sans 3',Arial,sans-serif;color:#666;margin-right:.5em}
  .gl b{font-weight:700}.gl .t{color:#1f4f8a}.gl .c{display:block;font-size:10pt;color:#555}.gl .c u{text-decoration:none;font-weight:700;color:#111}`;
function glossDocHTML(DOC, order) {
  const one = g => `<p class="gl"><span class="r">${esc([order === 'lemma' ? g.tt : '', g.ref].filter(Boolean).join(' '))}</span><b>${esc(g.w || '')}</b>${g.l && order !== 'lemma' ? ` (${esc(g.l)})` : ''} – <span class="t">${esc(g.t)}</span>`
    + (g.w != null ? `<span class="c">${esc(g.cb || '')} <u>${esc(g.w)}</u> ${esc(g.ca || '')}</span>` : '') + '</p>';
  return `<h1>${esc(DOC.title)}</h1><p class="sub">${esc(DOC.sub)}</p>` + DOC.groups.map(g => `<h2>${esc(g.h)}</h2>${g.x.map(one).join('')}`).join('')
    + (DOC.D.length ? `<h2>Default glosses</h2>${DOC.D.map(d => `<p class="gl"><b>${esc(d.l)}</b> – <span class="t">${esc(d.t)}</span></p>`).join('')}` : '');
}
async function glossDocx(DOC, order) {
  const R = (t, o) => wRun(t, Object.assign({ font: 'Gentium Book Plus', sz: 24 }, o));
  let body = wP(wRun(DOC.title, { font: 'Arial', sz: 28, b: true }), { after: 60 }) + wP(wRun(DOC.sub, { font: 'Arial', sz: 20, c: '#555555' }), { after: 240 });
  for (const g of DOC.groups) {
    body += wP(wRun(g.h, { font: 'Arial', sz: 22, b: true }), { before: 200, after: 80 });
    for (const x of g.x) {
      body += wP(wRun([order === 'lemma' ? x.tt : '', x.ref].filter(Boolean).join(' ') + '\t', { font: 'Arial', sz: 18, c: '#666666' }) + R(x.w || '', { b: true }) + (x.l && order !== 'lemma' ? R(` (${x.l})`) : '') + R(' – ') + R(x.t, { c: '#1F4F8A' }), { after: x.w != null ? 0 : 60 });
      if (x.w != null) body += wP(R(`${x.cb || ''} `, { sz: 20, c: '#555555' }) + R(x.w, { sz: 20, b: true }) + R(` ${x.ca || ''}`, { sz: 20, c: '#555555' }), { after: 80 });
    }
  }
  if (DOC.D.length) { body += wP(wRun('Default glosses', { font: 'Arial', sz: 22, b: true }), { before: 200, after: 80 }); for (const d of DOC.D) body += wP(R(d.l, { b: true }) + R(' – ') + R(d.t, { c: '#1F4F8A' }), { after: 40 }); }
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', doc]];
  return zipFiles(files.map(([n, x]) => [n, new TextEncoder().encode(x)]));
}

// ---------------------------------------------------------------- reattaching glosses to a text in another version
// A gloss whose text is gone (an imported text erased), or no longer fits its text (a backup restored into a corrected
// version), is looked for by its word and the 5 words on each side: the word must be there (accents, breathings, case and
// punctuation aside) with at least 7 of the 10 words around it in order – or, when at least 9 of 10 match, the word itself
// may differ by a letter or two. The best place wins (equal ones: the nearest to where it was). Every match is shown for
// approval; "Auto-approve" takes the certain ones (the word itself and 9–10 of 10).
const glFold = s => gkey(String(s || ''));
function glLcs(a, b) { const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]); return d[m][n]; }
function glEdit(a, b) { if (Math.abs(a.length - b.length) > 2) return 9; const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length]; }
// the best place of one gloss in one text (its words: src.words) – or null
function glFind(g, W, F) {
  const gw = String(g.w || '').split(' ').map(glFold), n = gw.length, cb = String(g.cb || '').split(' ').filter(Boolean).map(glFold), ca = String(g.ca || '').split(' ').filter(Boolean).map(glFold);
  const ctxN = cb.length + ca.length; if (!gw[0] || !ctxN) return null;
  const score = k => glLcs(cb, F.slice(Math.max(0, k - cb.length - 2), k)) + glLcs(ca, F.slice(k + n, k + n + ca.length + 2));
  let best = null;
  const consider = (k, exact) => {
    const sc = score(k), need = exact ? Math.ceil(ctxN * 0.7) : Math.ceil(ctxN * 0.9); if (sc < need) return;
    const dist = Math.abs(W[k].i - g.s);
    if (!best || sc > best.sc || (sc === best.sc && dist < best.dist)) best = { k, k2: k + n - 1, sc, of: ctxN, exact, dist };
  };
  for (let k = 0; k + n <= F.length; k++) {
    if (F[k] === gw[0] && gw.every((x, j) => F[k + j] === x)) consider(k, true);
  }
  if (!best) {                                                       // the word itself changed a little: found by its surroundings
    for (let k = 0; k + n <= F.length; k++) {
      if ((cb.length && F[k - 1] !== cb[cb.length - 1]) && (ca.length && F[k + n] !== ca[0])) continue;
      if (gw.every((x, j) => F[k + j] && glEdit(x, F[k + j]) <= 2) && !gw.every((x, j) => F[k + j] === x)) consider(k, false);
    }
  }
  if (!best) return null;
  return Object.assign(best, { certain: best.exact && best.sc >= Math.ceil(best.of * 0.9) });
}
// glosses (with their data) matched against texts (list of [textId, src]); the found places
async function glMatch(gs, texts) {
  const out = [];
  for (const g of gs) {
    let best = null;
    for (const [tid, src] of texts) { const F = src.F ??= src.words.map(x => glFold(x.s)); const m = glFind(g, src.words, F); if (m && (!best || m.sc / m.of > best.sc / best.of)) best = Object.assign(m, { tid, src }); }
    if (best) out.push({ g, m: best });
    await new Promise(r => setTimeout(r, 0));
  }
  return out;
}
// glosses whose text is gone: an imported text erased (not in the bin)
async function glOrphans() {
  const texts = new Set((await getAll('texts')).map(t => String(t.id))); await trashLoad();
  return (await getAll('glosses')).filter(g => { const s = String(g.textId); return /^\d+$/.test(s) && !texts.has(s) && !S.trash?.['imp:' + s] && g.w != null; });
}
// glosses that no longer fit their own text (the word at their place differs): to be placed again in it
async function glMisfits(textIds) {
  const out = [];
  for (const tid of textIds) {
    const src = await glossSource(tid).catch(() => null); if (!src) continue;
    const gs = await req2p(tx('glosses').objectStore('glosses').index('textId').getAll(tid));
    for (const g of gs) { if (g.w == null) continue; const k = src.words.findIndex(x => x.i === g.s); if (k < 0 || glFold(src.words[k].s) !== glFold(String(g.w).split(' ')[0])) out.push(g); }
  }
  return out;
}
// the review: each gloss with its old context and the place found (differences marked); Accept / Reject; Auto-approve
async function glReview(found, title) {
  if (!found.length) return 0;
  // (in the old context: the words no longer there, struck through)
  const G = (s, other) => { const o = new Set(String(other || '').split(' ').filter(Boolean).map(glFold)); return String(s || '').split(' ').filter(Boolean).map(x => o.has(glFold(x)) ? esc(x) : `<s>${esc(x)}</s>`).join(' '); };
  const W = (s, other) => { const o = new Set(String(other || '').split(' ').filter(Boolean).map(glFold)); return String(s || '').split(' ').filter(Boolean).map(x => o.has(glFold(x)) ? esc(x) : `<mark>${esc(x)}</mark>`).join(' '); };
  const row = (f, i) => { const { g, m } = f, ws = m.src.words, newW = ws.slice(m.k, m.k2 + 1).map(x => x.s).join(' ');
    const nb = ws.slice(Math.max(0, m.k - GL_CTX), m.k).map(x => x.s).join(' '), na = ws.slice(m.k2 + 1, m.k2 + 1 + GL_CTX).map(x => x.s).join(' ');
    return `<div class="glrv${m.certain ? ' sure' : ''}" data-gi="${i}"><div class="glg"><b>${esc(g.w)}</b> – ${esc(g.t)} <small>${m.sc} of ${m.of} words around it${m.exact ? '' : ' · the word itself differs'}</small></div>
      <div class="glc"><span class="gll">was</span> ${G(g.cb, nb)} <u>${G(g.w, newW)}</u> ${G(g.ca, na)}</div>
      <div class="glc"><span class="gll">now</span> ${W(nb, g.cb)} <u>${W(newW, g.w)}</u> ${W(na, g.ca)}${m.src.tt && found.some(x => x.m.src !== m.src) ? ` <small>· ${esc(m.src.tt)}</small>` : ''}</div>
      <div class="seg glab" role="group"><button type="button" data-glok="${i}">Accept</button><button type="button" data-glno="${i}">Reject</button></div></div>`; };
  const st = found.map(() => null);
  const paint = () => document.querySelectorAll('#dlg .glrv').forEach(el => { const i = +el.dataset.gi; el.querySelector('[data-glok]').classList.toggle('on', st[i] === true); el.querySelector('[data-glno]').classList.toggle('on', st[i] === false); });
  const on = ev => { const b = ev.target.closest?.('#dlg [data-glok],#dlg [data-glno],#dlg [data-glauto],#dlg [data-glall]'); if (!b) return; ev.preventDefault();
    if (b.dataset.glok) st[+b.dataset.glok] = true; else if (b.dataset.glno) st[+b.dataset.glno] = false;
    else if (b.dataset.glauto) found.forEach((f, i) => { if (f.m.certain) st[i] = true; });
    else found.forEach((_, i) => { st[i] = b.dataset.glall === 'yes'; });
    paint(); };
  document.addEventListener('click', on, true);
  const r = await dialog(`<h3>Reattach glosses</h3><p class="hint small">${esc(title)} – ${found.length} gloss${found.length === 1 ? '' : 'es'} found a place. Marked: what differs from before.</p>
    <div class="glbar"><button type="button" data-glauto="1">Auto-approve</button><button type="button" data-glall="yes">Accept all</button><button type="button" data-glall="no">Reject all</button></div>
    <div class="glrvs">${found.map(row).join('')}</div>`, [['cancel', 'Not now'], ['ok', 'Apply']]);
  document.removeEventListener('click', on, true);
  if (r.action !== 'ok') return 0;
  let n = 0;
  for (let i = 0; i < found.length; i++) {
    if (st[i] !== true) continue;
    const { g, m } = found[i], ws = m.src.words;
    Object.assign(g, { textId: m.tid, s: ws[m.k].i, e: ws[m.k2].i }); Object.assign(g, await glossMeta(g, m.src)); await put('glosses', g); n++;
  }
  if (S.text && found.some((f, i) => st[i] === true && String(f.m.tid) === String(S.text.id))) await openText(S.text.id, false);
  return n;
}
// after an import: orphaned glosses that find a place in the new text (asked only when some do)
async function glAfterImport(tid) {
  const gs = await glOrphans(); if (!gs.length) return;
  const src = await glossSource(tid); if (!src) return;
  const found = await glMatch(gs, [[tid, src]]); if (!found.length) return;
  const n = await glReview(found, src.tt);
  if (n) toast(`Reattached ${n} of ${gs.length} orphaned gloss${gs.length === 1 ? '' : 'es'}.`, 3500);
}
// after a backup is restored: glosses that no longer fit their text are placed again in it
async function glAfterRestore(textIds) {
  const gs = await glMisfits(textIds); if (!gs.length) return;
  const texts = []; for (const tid of new Set(gs.map(g => g.textId))) { const s = await glossSource(tid); if (s) texts.push([tid, s]); }
  const found = []; for (const [tid, s] of texts) found.push(...await glMatch(gs.filter(g => String(g.textId) === String(tid)), [[tid, s]]));
  const n = await glReview(found, 'Restored glosses');
  toast(`Reattached ${n} of ${gs.length}; ${gs.length - n} could not be placed.`, 4000);
}
// by hand (Annotations → an erased text → Find a place …): the text to look in, chosen from those on this device
async function glFindPlace(key, title) {
  const tid = key.slice(4), gs = (await glOrphans()).filter(g => String(g.textId) === tid);
  if (!gs.length) { toast('These glosses have no word and context stored, so they cannot be placed.'); return; }
  const imp = await getAll('texts'), works = await libWorks();
  const r = await dialog(`<h3>Find a place</h3><p class="hint small">${gs.length} gloss${gs.length === 1 ? '' : 'es'} of “${esc(title)}” – look for them in:</p>
    <select name="t" class="glsel">${imp.map(t => `<option value="i:${t.id}">${esc(t.title || 'Text ' + t.id)}${t.author ? ' – ' + esc(t.author) : ''}</option>`).join('')}${works.map(w => `<option value="w:${esc(w.id)}">${esc(w.title)}${w.author ? ' – ' + esc(w.author) : ''}</option>`).join('')}</select>`,
    [['cancel', 'Cancel'], ['ok', 'Look']]);
  if (r.action !== 'ok' || !r.data.t) return;
  const texts = [];
  if (r.data.t.startsWith('i:')) { const id = +r.data.t.slice(2), s = await glossSource(id); if (s) texts.push([id, s]); }
  else { const w = works.find(x => x.id === r.data.t.slice(2)); for (let bi = 0; bi < (w?.books.length || 0); bi++) { const id = `w:${w.id}:${bi}`, s = await glossSource(id); if (s) texts.push([id, s]); } }
  const found = await glMatch(gs, texts);
  if (!found.length) { toast('None of these glosses could be placed in that text.'); return; }
  const n = await glReview(found, title);
  if (n) toast(`Reattached ${n} of ${gs.length}.`, 3500);
}
