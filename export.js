/* Pult – Export of the text (HTML, PDF via printing, Word).
   (see core.js for the order of the scripts) */
'use strict';
// ---------------------------------------------------------------- export of the text (HTML, PDF via printing, Word)
// The text is exported as it is shown: same words (with vowel lengths if shown), word-class colours,
// grammatical information and glosses – each of the three can be switched on or off in the export dialog.
function exportTitle() {
  const t = S.text, w = t?.work;
  return (!t ? 'Text' : w ? `${w.author} – ${w.title}${w.books.length > 1 ? ' – ' + w.books[t.bi] : ''}` : t.title) + (S.exportLabel ? ', ' + S.exportLabel : '');
}
// the displayed text as plain data: blocks of words, punctuation, line breaks and references
function exportModel(rng = null) {
  const posC = el => { const c = [...el.classList].find(x => x.startsWith('p-')); const id = c?.slice(2); return id && S.posCfg[id]?.on !== false ? S.posCfg[id].c : null; };
  const punctC = S.posCfg.punct?.on !== false ? S.posCfg.punct?.c : null;
  const blocks = [];
  for (const b of textRoot().children) {
    if (!b.matches('.para,.blk')) continue;
    const kind = b.classList.contains('blk') ? ([...b.classList].find(c => c.startsWith('k-')) || 'k-p').slice(2) : 'p';
    const items = [];
    const walk = node => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { if (n.nodeValue) items.push({ t: 'p', s: n.nodeValue }); continue; }
        if (n.nodeType !== 1 || n.matches('.mkr')) continue;
        if (n.matches('.rf')) items.push({ t: 'ref', s: n.textContent });
        else if (n.matches('br')) items.push({ t: 'br' });
        else if (n.matches('.pn')) items.push({ t: 'p', s: n.textContent, c: punctC });
        else if (n.matches('.w')) {
          const g = n.querySelector('.g');
          items.push({ t: 'w', i: +n.dataset.i, s: g.firstChild?.nodeValue || '', pu: g.querySelector('.pu')?.textContent || '', c: posC(n), pc: punctC,
            gram: n.querySelector('.gm')?.textContent || '',
            gloss: [...n.querySelectorAll('.gl>span')].map(x => ({ s: x.innerHTML.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'), dg: x.classList.contains('dg') })) });
        } else walk(n);
      }
    };
    walk(b);
    if (items.some(x => x.t === 'w' || (x.t === 'p' && x.s.trim()))) blocks.push({ kind, items });
  }
  if (!rng) return blocks;
  // only the words a…b; references and punctuation in between, punctuation right after the last word
  const flat = blocks.flatMap(b => b.items); let prev;
  for (const x of flat) { if (x.t === 'w') prev = x.i; else x.prev = prev; }
  let next; for (let j = flat.length - 1; j >= 0; j--) { const x = flat[j]; if (x.t === 'w') next = x.i; else x.next = next; }
  const inR = i => i != null && i >= rng.a && i <= rng.b;
  return blocks.map(b => ({ kind: b.kind, items: b.items.filter(x => x.t === 'w' ? inR(x.i)
      : inR(x.next) ? (inR(x.prev) || x.prev == null || x.prev < rng.a || x.t === 'ref')
      : inR(x.prev) && x.t === 'p' && x.s.trim() !== '' && !/\S\s+\S/.test(x.s.trim())) }))
    .filter(b => b.items.some(x => x.t === 'w'));
}
// the reference points of the current book for "from … to": lines for verse, sections for prose, paragraphs otherwise
function exportRefs() {
  const words = new Map(S.tokens.filter(t => t.t === 'w').map(t => [t.i, t.s]));
  const list = []; let pend = null, nl = 0;
  for (const tk of S.tokens) { if (tk.t === 'r') { pend = tk.s; if (tk.l) nl++; } else if (tk.t === 'w' && pend != null) { list.push({ s: pend, i: tk.i }); pend = null; } }
  const verse = S.text.work?.verse ?? nl > list.length / 2;               // verse quotations in prose do not count
  let kind = verse ? 'Line' : 'Section';
  if (!list.length) {
    kind = 'Paragraph'; let n = 0;
    for (const b of textRoot().children) { const w = b.matches?.('.para,.blk') && b.querySelector('.w'); if (w) list.push({ s: '¶ ' + (++n), i: +w.dataset.i }); }
  }
  const last = Math.max(...words.keys());
  list.forEach((r, j) => { r.end = (list[j + 1]?.i ?? last + 1) - 1; r.lab = [...Array(4).keys()].map(k => words.get(r.i + k)).filter(Boolean).join(' '); });
  return { kind, list, words };
}
const exportSelLabel = (W, r) => { const a = [W.get(r.a), W.get(r.a + 1)].filter(Boolean).join(' '), b = [W.get(r.b - 1), W.get(r.b)].filter(Boolean).join(' ');
  return r.b - r.a < 4 ? [...Array(r.b - r.a + 1).keys()].map(k => W.get(r.a + k)).join(' ') : `${a} … ${b}`; };
// B: marking the range in the text – first tap = first word, second tap = last word
function exportPickStart() {
  S.exPick = { a: null, b: null }; document.body.classList.add('expick'); exportPickPaint();
}
function exportPickPaint() {
  const p = S.exPick, els = S.wordEls || [];
  document.querySelectorAll('#textBody .w.xsel').forEach(e => e.classList.remove('xsel'));
  if (p && p.a != null) { const b = p.b ?? p.a; for (let i = Math.min(p.a, b); i <= Math.max(p.a, b); i++) els[i]?.classList.add('xsel'); }
  let bar = $('#exBar');
  if (!p) { bar?.remove(); document.body.classList.remove('expick'); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'exBar'; document.body.append(bar); }
  const n = p.a == null ? 0 : p.b == null ? 1 : p.b - p.a + 1;
  bar.innerHTML = `<span>${p.a == null ? 'Tap the first word of the passage' : p.b == null ? 'Now tap the last word' : `${n.toLocaleString('en')} word${n === 1 ? '' : 's'} marked`}</span>`
    + `<button type="button" data-xp="ok"${p.a == null ? ' disabled' : ''}>Export …</button><button type="button" data-xp="cancel">Cancel</button>`;
  const r = $('#textPane').getBoundingClientRect();
  Object.assign(bar.style, { left: r.left + 'px', width: r.width + 'px' });
}
const EXPORT_CSS = `
.xt{font-family:'Gentium Book Plus','Gentium Plus','Times New Roman',serif;font-size:13pt;line-height:1.5;color:#111;position:relative;padding-left:3.2em}
.xt h1{font:600 12pt/1.3 'Source Sans 3',Arial,sans-serif;color:#555;margin:0 0 1.2em -3.2em}
.xt .b{margin:0 0 .8em}.xt .b.k-h{text-align:center;font-weight:700}.xt .b.k-s{font:600 10pt 'Source Sans 3',Arial,sans-serif;letter-spacing:.04em;color:#7a2e2e;margin:.9em 0 .1em}
.xt .b.k-L{margin:0}
.xt .rf{position:absolute;left:0;width:2.8em;font:8pt/2.4 'Source Sans 3',Arial,sans-serif;color:#888;white-space:nowrap}
.xt .w{display:inline-flex;flex-direction:column;align-items:flex-start;vertical-align:top}
.xt .g{display:block;white-space:nowrap}
.xt .gm{display:block;font:7.5pt/1.2 'Source Sans 3',Arial,sans-serif;color:#777;max-width:11em}
.xt .gl{display:block;font:8.5pt/1.25 'Source Sans 3',Arial,sans-serif;color:#2e5a7a;max-width:14em}
.xt .gl .dg{color:#777;font-style:italic}
.xt .gl span{display:block}`;
function exportHTML(blocks, o) {
  const st = c => o.colour && c ? ` style="color:${c}"` : '';
  let h = `<div class="xt"><h1>${esc(exportTitle())}</h1>`;
  for (const b of blocks) {
    h += `<div class="b k-${b.kind}">`;
    for (const x of b.items) {
      if (x.t === 'ref') h += `<span class="rf">${esc(x.s)}</span>`;
      else if (x.t === 'br') h += '<br>';
      else if (x.t === 'p') h += x.s.trim() ? `<span${st(x.c)}>${esc(x.s)}</span>` : esc(x.s);
      else {
        const sub = (o.gram && x.gram ? `<span class="gm">${esc(x.gram)}</span>` : '')
          + (o.gloss && x.gloss.length ? `<span class="gl">${x.gloss.map(g => `<span${g.dg ? ' class="dg"' : ''}>${esc(g.s).replace(/\n/g, '<br>')}</span>`).join('')}</span>` : '');
        const word = `<span${st(x.c)}>${esc(x.s)}</span>${x.pu ? `<span${st(x.pc)}>${esc(x.pu)}</span>` : ''}`;
        h += `<span class="w"><span class="g">${word}</span>${sub}</span>`;
      }
    }
    h += '</div>';
  }
  return h + '</div>';
}
// fonts are put into the HTML file itself, so that it looks the same on any computer
async function fontFacesInline() {
  try {
    let css = await (await fetch('fonts.css')).text();
    const urls = [...new Set([...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1]))];
    for (const u of urls) {
      const buf = new Uint8Array(await (await fetch(u)).arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      css = css.split(`url(${u})`).join(`url(data:font/woff2;base64,${btoa(bin)})`);
    }
    return css;
  } catch (_) { return ''; }
}
async function exportHTMLFile(blocks, o) {
  return `<!doctype html><html lang="grc"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(exportTitle())}</title>
<style>${await fontFacesInline()}
body{margin:2.5em auto;max-width:46em;padding:0 1.5em;background:#fff}${EXPORT_CSS}
@media print{body{margin:0;max-width:none;padding:0}@page{size:A4;margin:2cm}}</style></head><body>${exportHTML(blocks, o)}</body></html>`;
}
// PDF: the browser's own printing (on the iPad: Print → share → Save to Files; elsewhere: "Save as PDF")
function exportPrint(blocks, o) { printHTML(exportHTML(blocks, o), EXPORT_CSS); }
function printHTML(html, css) {
  let root = $('#printRoot'); if (!root) { root = document.createElement('div'); root.id = 'printRoot'; document.body.append(root); }
  root.innerHTML = `<style>${css}@page{size:A4;margin:2cm}</style>` + html;
  document.documentElement.classList.add('printing');
  const done = () => { document.documentElement.classList.remove('printing'); root.innerHTML = ''; removeEventListener('afterprint', done); };
  addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(() => { if (!matchMedia('print').matches) done(); }, 1500); }, 50);
}
// ---- Word (.docx): with glosses or grammar, each printed line becomes a borderless table (one column per word,
// the word above its grammar and gloss) – Word has no other way to stack text under a word. The lines are
// measured in the browser at the width of an A4 page.
const xe = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function wRun(text, { c, sz = 26, font = 'Times New Roman', i = false, b = false } = {}) {
  if (!text) return '';
  return `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>${b ? '<w:b/>' : ''}${i ? '<w:i/>' : ''}${c ? `<w:color w:val="${c.replace('#', '')}"/>` : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${xe(text)}</w:t></w:r>`;
}
const wP = (runs, { jc, after = 0, before = 0 } = {}) => `<w:p><w:pPr><w:spacing w:before="${before}" w:after="${after}" w:line="240" w:lineRule="auto"/>${jc ? `<w:jc w:val="${jc}"/>` : ''}</w:pPr>${runs}</w:p>`;
function exportDocxBody(blocks, o) {
  const has = f => blocks.some(b => b.items.some(f));
  const inter = (o.gloss && has(x => x.gloss?.length)) || (o.gram && has(x => x.gram));   // tables only where something stands under the words
  const col = c => o.colour ? c : null;
  const textSz = b => b.kind === 's' ? 20 : 26;
  let body = wP(wRun(exportTitle(), { font: 'Arial', sz: 22, b: true, c: '#555555' }), { after: 240 });
  if (!inter) {                      // running text: one paragraph per block, references as small grey numbers
    for (const b of blocks) {
      let runs = '';
      for (const x of b.items) {
        if (x.t === 'ref') runs += wRun(x.s + ' ', { font: 'Arial', sz: 15, c: '#888888' });
        else if (x.t === 'br') runs += '<w:r><w:br/></w:r>';
        else if (x.t === 'p') runs += wRun(x.s, { c: col(x.c), sz: textSz(b) });
        else runs += wRun(x.s, { c: col(x.c), sz: textSz(b), b: b.kind === 'h' }) + wRun(x.pu, { c: col(x.pc), sz: textSz(b) });
      }
      body += wP(runs, { jc: b.kind === 'h' ? 'center' : null, after: b.kind === 'L' ? 0 : 160 });
    }
    return body;
  }
  // interlinear: lay the text out once at A4 width (17 cm ≈ 643 px; 13 pt) and read off which words share a line
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-20000px;top:0;width:643px;visibility:hidden';
  box.innerHTML = `<style>${EXPORT_CSS}</style>` + exportHTML(blocks, o).replace('<h1>', '<h1 hidden>');
  document.body.append(box);
  const TW = 15;                                                        // twips per px
  const bEls = box.querySelectorAll('.b');
  blocks.forEach((b, bi) => {
    const el = bEls[bi]; const lines = []; let cur = null, lastTop = null, pendRef = '', pendPre = [];
    // walk the block's children in order: refs, words (.w or plain word spans), punctuation
    let k = 0;
    for (const x of b.items) {
      if (x.t === 'ref') { pendRef = x.s; continue; }
      if (x.t === 'br') { lastTop = null; continue; }
      if (x.t === 'p' && !x.s.trim()) continue;
      if (x.t === 'p') { if (cur && lastTop !== null) cur.cells[cur.cells.length - 1].post.push(x); else pendPre.push(x); continue; }
      const we = el.querySelectorAll('.w')[k++];                         // the measured word
      const r = we ? we.getBoundingClientRect() : { top: 0, width: 40 };
      if (lastTop === null || Math.abs(r.top - lastTop) > 4) { cur = { ref: '', cells: [] }; lines.push(cur); lastTop = r.top; }
      if (pendRef) { cur.ref = cur.ref || pendRef; pendRef = ''; }
      cur.cells.push({ x, pre: pendPre, post: [], w: Math.ceil(r.width) + 6 }); pendPre = [];
    }
    for (const ln of lines) {
      const cells = [];
      const refW = 3.2 * 17;                                            // the reference column (≈ 3.2 em)
      cells.push(`<w:tc><w:tcPr><w:tcW w:w="${Math.round(refW * TW)}" w:type="dxa"/></w:tcPr>${wP(wRun(ln.ref, { font: 'Arial', sz: 15, c: '#888888' }))}</w:tc>`);
      for (const c of ln.cells) {
        const x = c.x;
        let first = c.pre.map(p => wRun(p.s, { c: col(p.c), sz: textSz(b) })).join('') + wRun(x.s, { c: col(x.c), sz: textSz(b), b: b.kind === 'h' })
          + wRun(x.pu, { c: col(x.pc), sz: textSz(b) }) + c.post.map(p => wRun(p.s, { c: col(p.c), sz: textSz(b) })).join('');
        let ps = wP(first);
        if (o.gram && x.gram) ps += wP(wRun(x.gram, { font: 'Arial', sz: 14, c: '#777777' }));
        if (o.gloss) for (const g of x.gloss) for (const line of g.s.split('\n')) ps += wP(wRun(line, { font: 'Arial', sz: 16, c: g.dg ? '#777777' : '#2E5A7A', i: g.dg }));
        cells.push(`<w:tc><w:tcPr><w:tcW w:w="${c.w * TW}" w:type="dxa"/></w:tcPr>${ps}</w:tc>`);
      }
      const grid = [Math.round(refW * TW), ...ln.cells.map(c => c.w * TW)];
      body += `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${b.kind === 'h' ? '<w:jc w:val="center"/>' : ''}<w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid.map(g => `<w:gridCol w:w="${g}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cells.join('')}</w:tr></w:tbl>`;
      body += wP(wRun(' ', { sz: 8 }), { after: 40 });                  // keeps the line tables apart (Word would merge them)
    }
    body += wP(wRun(' ', { sz: 8 }), { after: b.kind === 'L' ? 0 : 120 });
  });
  box.remove();
  return body;
}
async function exportDocx(blocks, o) {
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${exportDocxBody(blocks, o)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', doc]];
  return zipFiles(files.map(([n, s]) => [n, new TextEncoder().encode(s)]));
}
// a minimal ZIP writer, enough for a .docx (compressed where the browser can, otherwise stored)
async function zipFiles(files) {
  const out = [];
  for (const [name, data] of files) {
    let z = null;
    try { if (typeof CompressionStream !== 'undefined') z = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); } catch (_) { z = null; }
    out.push([name, data, z]);
  }
  return zipStore(out);
}
function zipStore(files) {
  const crcT = zipStore.t ??= Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = d => { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = crcT[(c ^ d[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const parts = [], central = []; let off = 0;
  for (const [name, raw, z] of files) {
    const nm = new TextEncoder().encode(name), c = crc(raw), data = z || raw, meth = z ? 8 : 0;
    const lh = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, meth, 2], [10, 0, 2], [12, 0x21, 2], [14, c, 4], [18, data.length, 4], [22, raw.length, 4], [26, nm.length, 2], [28, 0, 2]]
      .forEach(([p, v, n]) => n === 4 ? lh.setUint32(p, v, true) : lh.setUint16(p, v, true));
    parts.push(lh, nm, data);
    const ch = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, meth, 2], [12, 0, 2], [14, 0x21, 2], [16, c, 4], [20, data.length, 4], [24, raw.length, 4], [28, nm.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, off, 4]]
      .forEach(([p, v, n]) => n === 4 ? ch.setUint32(p, v, true) : ch.setUint16(p, v, true));
    central.push(ch, nm);
    off += 30 + nm.length + data.length;
  }
  const csize = central.reduce((a, x) => a + x.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, csize, 4], [16, off, 4], [20, 0, 2]]
    .forEach(([p, v, n]) => n === 4 ? end.setUint32(p, v, true) : end.setUint16(p, v, true));
  return new Blob([...parts, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
async function exportDialog() {
  if (!S.text) return toast('Open a text first.');
  const O = S.exportOpts ??= { fmt: 'pdf', gloss: !document.body.classList.contains('nogloss'), gram: !!S.gram, colour: !!S.posOn, range: 'all', from: null, to: null };
  const R = exportRefs(), sel = S.exRange && S.exRange.text === S.text.id ? S.exRange : null;
  if (O.range === 'sel' && !sel) O.range = 'all';
  const cb = (n, on, label) => `<label class="srow1 xsw">${SW(`name="${n}"`, on)}<span>${label}</span></label>`;
  const seg = (name, cur, opts) => `<div class="seg segr">${opts.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}"${v === cur ? ' checked' : ''}>${l}</label>`).join('')}</div>`;
  const opt = (r, j, cur) => `<option value="${j}"${j === cur ? ' selected' : ''}>${esc(r.s)}${r.lab ? ' – ' + esc(r.lab) : ''}</option>`;
  const fi = Math.min(O.from ?? 0, R.list.length - 1), ti = Math.min(O.to ?? R.list.length - 1, R.list.length - 1);
  const r = await dialog(`<h3>Export text</h3>
    <p class="hint small">${(S.exportLabel = '', esc(exportTitle()))} – as it is shown now.</p>
    <div class="srow"><span class="sl">Format</span><div class="sc">${seg('fmt', O.fmt, [['pdf', 'PDF'], ['html', 'HTML'], ['docx', 'Word']])}
      <small class="sh">PDF opens the print dialog – choose “Save as PDF” (iPad: share icon → Save to Files).</small></div></div>
    <div class="srow"><span class="sl">Range</span><div class="sc">${seg('range', O.range, [['all', 'Whole text'], ['ft', 'From – to'], ['sel', 'Selection']])}
      <div class="xr xr-ft">${R.list.length ? `<label>From ${R.kind.toLowerCase()} <select name="from">${R.list.map((x, j) => opt(x, j, fi)).join('')}</select></label>
        <label>to ${R.kind.toLowerCase()} <select name="to">${R.list.map((x, j) => opt(x, j, ti)).join('')}</select></label>` : '<small class="sh">This text has no reference points.</small>'}</div>
      <div class="xr xr-sel">${sel ? `<small class="sh">${(sel.b - sel.a + 1).toLocaleString('en')} words: ${esc(exportSelLabel(R.words, sel))}</small>` : '<small class="sh">No passage marked yet.</small>'}
        <button type="button" data-v="pick">${sel ? 'Mark again in the text …' : 'Mark in the text …'}</button></div></div></div>
    <div class="srow"><span class="sl">Include</span><div class="sc">${cb('gloss', O.gloss, 'Glosses')}${cb('gram', O.gram, 'Grammar line')}${cb('colour', O.colour, 'Colourisation')}</div></div>`,
    [['cancel', 'Cancel'], ['ok', 'Export']]);
  if (r.action === 'cancel') return;
  Object.assign(O, { fmt: r.data.fmt || 'pdf', gloss: r.data.gloss === 'on', gram: r.data.gram === 'on', colour: r.data.colour === 'on', range: r.data.range || 'all',
    from: r.data.from != null ? +r.data.from : O.from, to: r.data.to != null ? +r.data.to : O.to });
  if (r.action === 'pick') { O.range = 'sel'; return exportPickStart(); }
  const o = { gloss: O.gloss, gram: O.gram, colour: O.colour };
  let rng = null; S.exportLabel = '';
  if (O.range === 'ft' && R.list.length) {
    let f = R.list[O.from ?? 0], t = R.list[O.to ?? R.list.length - 1]; if (t.i < f.i) [f, t] = [t, f];
    rng = { a: f.i, b: t.end }; S.exportLabel = f === t ? f.s : `${f.s}–${t.s.replace(/^¶ /, '')}`;
  } else if (O.range === 'sel' && sel) { rng = sel; S.exportLabel = exportSelLabel(R.words, sel); }
  const blocks = exportModel(rng);
  if (O.fmt === 'pdf') { exportPrint(blocks, o); S.exportLabel = ''; return; }
  const base = exportTitle().replace(/[\\/:*?"<>|…]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'text';
  const blob = O.fmt === 'html' ? new Blob([await exportHTMLFile(blocks, o)], { type: 'text/html' }) : await exportDocx(blocks, o);
  S.exportLabel = '';
  const name = base + (O.fmt === 'html' ? '.html' : '.docx');
  const href = URL.createObjectURL(blob);
  // the file is saved by a tap on the link (on the iPad a download has to start from a tap)
  await dialog(`<h3>Export ready</h3><p>${esc(name)} (${mb(blob.size)})</p>`, [['link', 'Save file', { href, name }], ['cancel', 'Close']]);
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}
