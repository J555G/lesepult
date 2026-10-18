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
