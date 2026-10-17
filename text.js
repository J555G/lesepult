/* Pult – The text pane: drawing the text (and the long-text modes), glosses, the marker, the text size.
   (see core.js for the order of the scripts) */
'use strict';
// ---------------------------------------------------------------- text rendering
function tokenize(text, wi = 0) {
  const toks = []; let last = 0;
  text = text.normalize('NFC');
  for (const m of text.matchAll(WORD_TOKEN)) {
    if (m.index > last) toks.push({ t: 'p', s: text.slice(last, m.index) });
    toks.push({ t: 'w', s: m[0], i: wi++ });
    last = m.index + m[0].length;
  }
  if (last < text.length) toks.push({ t: 'p', s: text.slice(last) });
  return toks;
}
// library books: blocks [kind, [[ref, text], …]] -> block, reference and word tokens
function tokenizeBlocks(blocks) {
  const toks = []; let wi = 0;
  for (const [k, runs] of blocks) {
    toks.push({ t: 'b', k });
    for (const [ref, txt] of runs) {
      if (ref) toks.push({ t: 'r', s: ref, l: k === 'l' || k === 'L' });
      for (const tk of tokenize(txt, wi)) { toks.push(tk); if (tk.t === 'w') wi = tk.i + 1; }
    }
  }
  return toks;
}
// iOS throws the text pane back to the top when the text is redrawn (after saving a gloss, choosing a lemma …)
// or when the keyboard of a gloss field opens/closes. Keep the reading position: remember which word is at the
// top of the pane (or the selected word) and its distance from the top, and put it back after the redraw.
function textAnchor() {
  const pane = $('#textPane'), top = pane.getBoundingClientRect().top, h = pane.clientHeight;
  let el = S.cur ? document.querySelector(`#textBody .w[data-i="${S.cur[0]}"]`) : null;
  if (el) { const r = el.getBoundingClientRect(); if (r.bottom < top || r.top > top + h) el = null; }
  if (!el) for (const w of drawnWords()) { if (w && w.getBoundingClientRect().bottom > top) { el = w; break; } }
  return { i: el?.dataset.i, off: el ? el.getBoundingClientRect().top - top : 0, y: pane.scrollTop };
}
function applyTextAnchor(a) {
  const pane = $('#textPane'), el = a.i != null ? (ensureWord(+a.i) || document.querySelector(`#textBody .w[data-i="${a.i}"]`)) : null;
  const want = el ? pane.scrollTop + el.getBoundingClientRect().top - pane.getBoundingClientRect().top - a.off : a.y;
  if (Math.abs(pane.scrollTop - want) > 2) pane.scrollTop = want;
}
function guardText(ms = 1000) {      // keep the position for a moment, unless the user scrolls the text themselves
  if (!S.text || !S.wordEls?.length) return;
  const g = S.tGuard = { a: textAnchor(), until: Date.now() + ms };
  const fix = () => { if (S.tGuard === g && Date.now() <= g.until && !S.tTouch) applyTextAnchor(g.a); };
  requestAnimationFrame(fix); setTimeout(fix, 120); setTimeout(fix, 400); setTimeout(fix, ms - 50);
  return g;
}
// ---- drawing the text. Long texts: only the parts near the screen are drawn, the rest is empty space of the
// right height (least memory); shorter texts are drawn whole
const LONG_TEXT = 2500;            // words: shorter texts are always drawn whole
const CHUNK_W = 200;               // words per part (parts begin at a section, so a part can be a little longer)
// the HTML of the tokens n0 … n1-1 (a part begins at a section break, or at the start of the text)
function textHTML(n0, n1, gl, covered) {
  const toks = S.tokens; let html = '';
  let open = false;
  for (let n = n0; n < n1; n++) {
    const tk = toks[n];
    if (tk.t === 'b') { html += `${open ? '</div>' : ''}<div class="blk k-${tk.k}">`; open = true; continue; }
    if (!open) { html += '<div class="para">'; open = true; }
    if (tk.t === 'r') {        // reference in the margin; verse lines are numbered every 5th line
      if (!tk.l || (/^\d+$/.test(tk.s) && +tk.s % 5 === 0)) html += `<span class="rf${tk.l ? ' ln' : ''}">${esc(tk.s)}</span>`;
      continue;
    }
    if (tk.t === 'p') {
      const s0 = tk.glued ? tk.s.slice(tk.glued) : tk.s;
      if (!s0) continue;
      html += s0.split(/\n\s*\n/).map(p => punctHTML(p).replace(/\n/g, '<br>')).join('</div><div class="para">');
      continue;
    }
    let gs = (gl[tk.i] || []).map(g => `<span data-g="${g.id}"${g.e > g.s ? ` title="gloss for ${g.e - g.s + 1} words"` : ''}>${g.e > g.s ? '⟨' : ''}${glossHTML(g.t)}${g.e > g.s ? '⟩' : ''}</span>`).join('');
    // the lemma's default gloss: only where the word has no gloss of its own, or always (Settings → Glosses)
    if (!covered.has(tk.i)) gs = dgHTML(tk);
    else if (S.glossMode === 'both' && tk.lemma) { const dg = S.lemmaGloss[gkey(tk.lemma)]; if (dg && !(gl[tk.i] || []).some(g => g.t === dg)) gs += dgHTML(tk); }
    // punctuation directly after the word stays on the same line as the word
    const nx = toks[n + 1]; let pu = '';
    if (nx && nx.t === 'p') { const m = nx.s.match(/^[^\sͰ-Ͽἀ-῿A-Za-zÀ-ɏ]+/); if (m) { pu = m[0]; nx.glued = pu.length; } }
    if (S.marker === tk.i) html += '<span class="mkr" title="Marker"></span>';
    html += `<span class="w${covered.has(tk.i) ? ' glossed' : ''}${tk.pos ? ' p-' + tk.pos : ''}" data-i="${tk.i}"><span class="g">${esc(S.latQuant && tk.q ? tk.q : tk.s)}${pu ? `<span class="pu">${esc(pu)}</span>` : ''}</span><span class="gm${tk.amb && !tk.anaSet ? ' amb' : ''}">${esc(tk.gram || '')}</span><span class="gl"${glW(gs)}>${gs}</span></span>`;
  }
  return html + (open ? '</div>' : '');
}
function glossMaps() {
  const gl = {}; for (const g of S.glosses) (gl[g.s] ??= []).push(g);
  const covered = S.covered = new Set(); for (const g of S.glosses) for (let i = g.s; i <= g.e; i++) covered.add(i);
  return [gl, covered];
}
// the parts of a long text: they begin at section breaks, about CHUNK_W words each
function textChunks() {
  const toks = S.tokens, out = []; let c = null, nw = 0;
  for (let n = 0; n < toks.length; n++) {
    const tk = toks[n];
    if (!c || (tk.t === 'b' && c.words >= CHUNK_W)) { if (c) c.n1 = n; c = { n0: n, n1: toks.length, w0: null, w1: null, words: 0, h: null }; out.push(c); }
    if (tk.t === 'w') { if (c.w0 == null) c.w0 = tk.i; c.w1 = tk.i; c.words++; nw++; }
  }
  // a text without section breaks, or with one very long section: not split (drawn whole)
  return out.length > 1 && Math.max(...out.map(x => x.words)) < CHUNK_W * 15 ? out : null;
}
function renderText() {
  const body = $('#textBody');
  const same = S.text && S.renderedText === S.text.id && S.wordEls?.length;   // the same text drawn again: keep the position
  const anchor = same ? textAnchor() : null;
  if (S.TW) { S.TW.io?.disconnect(); S.TW = null; }
  if (!S.text) { body.innerHTML = '<p class="hint">No text yet. Open the menu ☰ (top left) → Library to download Greek texts, or → Import text to paste or load your own.</p>'; return; }
  const [gl, covered] = glossMaps();
  const nWords = S.tokens.reduce((n, t) => n + (t.t === 'w'), 0);
  const chunks = nWords > LONG_TEXT ? textChunks() : null;
  const w = S.text.work, bi = S.text.bi;
  const bn = w && w.books.length > 1 ? `<div class="booknav">${bi > 0 ? `<button type="button" data-step="-1">◂ ${esc(w.books[bi - 1])}</button>` : '<span></span>'}${bi < w.books.length - 1 ? `<button type="button" data-step="1">${esc(w.books[bi + 1])} ▸</button>` : ''}</div>` : '';
  body.classList.toggle('tw', !!chunks); $('#textPane').style.overflowAnchor = chunks ? 'none' : '';   // (the browser's own scroll anchoring would move the text twice)
  if (chunks) textWindowStart(chunks, gl, covered, bn, same);
  else {
    body.innerHTML = textHTML(0, S.tokens.length, gl, covered) + bn;
    S.wordEls = body.querySelectorAll('.w');
  }
  body.classList.toggle('lib', !!S.text.blocks);
  if (typeof markPlaces === 'function') markPlaces();
  S.renderedText = S.text.id;
  if (anchor) { applyTextAnchor(anchor); const g = S.tGuard = { a: anchor, until: Date.now() + 1000 };
    const fix = () => { if (S.tGuard === g && Date.now() <= g.until && !S.tTouch) applyTextAnchor(g.a); };
    requestAnimationFrame(fix); setTimeout(fix, 120); setTimeout(fix, 400); }
  else S.tGuard = null;
  markTarget();
  fillGlossBox();
}
// ---- 'window': the parts near the screen are drawn (three screens ahead and behind), the others are empty boxes
// of their measured (or estimated) height. A part drawn or emptied above the screen moves the text by the
// difference, so what is on screen stays where it is.
function textWindowStart(chunks, gl, covered, bn, same) {
  const body = $('#textBody'), pane = $('#textPane');
  // the same text again (a gloss saved …): the measured heights are kept
  const old = same && S.TWold?.id === S.text.id && S.TWold.chunks.length === chunks.length ? S.TWold.chunks : null;
  if (old) chunks.forEach((c, k) => { c.h = old[k].h; c.hk = old[k].hk; });
  const TW = S.TW = { chunks, gl, covered, ppw: S.TWold?.ppw || 7 * (S.tz || 1), id: S.text.id };
  S.TWold = TW;
  body.innerHTML = chunks.map((c, k) => `<div class="tchunk" data-c="${k}" style="height:${Math.round(chEst(c))}px"></div>`).join('') + bn;
  chunks.forEach((c, k) => { c.el = body.children[k]; c.on = false; });
  S.wordEls = new Array((chunks[chunks.length - 1].w1 ?? 0) + 1);
  TW.io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) chDraw(chunks[+e.target.dataset.c]); }, { root: pane, rootMargin: '300% 0px' });
  for (const c of chunks) TW.io.observe(c.el);
  if (!pane._tw) { pane._tw = true; pane.addEventListener('scroll', () => { clearTimeout(pane._twt); pane._twt = setTimeout(chSweep, 400); }, { passive: true }); }
}
const chKey = () => `${Math.round((S.tz || 1) * 100)}|${$('#textBody').clientWidth}|${document.body.className}`;
function chEst(c) { const TW = S.TW; return c.h != null && c.hk === chKey() ? c.h : Math.max(20, c.words * (TW?.ppw || 7)); }
function chDraw(c) {
  const TW = S.TW; if (!TW || c.on) return;
  const pane = $('#textPane'), el = c.el, above = el.getBoundingClientRect().bottom <= pane.getBoundingClientRect().top + 1;
  const h0 = el.offsetHeight;
  el.innerHTML = textHTML(c.n0, c.n1, TW.gl, TW.covered); el.style.height = ''; c.on = true;
  for (const w of el.querySelectorAll('.w')) S.wordEls[+w.dataset.i] = w;
  const h1 = el.offsetHeight; c.h = h1; c.hk = chKey();
  if (above && h1 !== h0) pane.scrollTop += h1 - h0;
  // the average height per word, for the parts not yet drawn
  const m = TW.chunks.filter(x => x.h != null && x.hk === c.hk); TW.ppw = m.reduce((a, x) => a + x.h, 0) / Math.max(1, m.reduce((a, x) => a + x.words, 0));
  chDecorate(c);
}
function chErase(c) {
  if (!c.on) return;
  const h = c.el.offsetHeight; c.h = h; c.hk = chKey();
  for (let i = c.w0; i <= c.w1; i++) S.wordEls[i] = undefined;
  c.el.style.height = h + 'px'; c.el.innerHTML = ''; c.on = false;
}
// what lies on the words of a part that was just drawn: the selected word, places, the export range
function chDecorate(c) {
  if (S.cur && !S.curHidden) { const [a, b] = S.cur; for (let i = Math.max(a, c.w0); i <= Math.min(b, c.w1); i++) S.wordEls[i]?.classList.add(b > a ? 'rng' : 'cur'); }
  if (S.exPick?.a != null) { const p = S.exPick, b = p.b ?? p.a; for (let i = Math.max(Math.min(p.a, b), c.w0); i <= Math.min(Math.max(p.a, b), c.w1); i++) S.wordEls[i]?.classList.add('xsel'); }
  if (typeof M !== 'undefined' && M.hits?.size && M.cfg?.mark !== false) for (let i = c.w0; i <= c.w1; i++) { const h = M.hits.get(i); if (h && (!isPeople(h.p) || M.cfg?.peoples)) { const e = S.wordEls[i]; e?.classList.add('plc'); if (h.unsure) e?.classList.add('plcq'); } }
}
// parts more than six screens away are emptied again
function chSweep() {
  const TW = S.TW; if (!TW) return;
  const r = $('#textPane').getBoundingClientRect(), far = r.height * 6;
  for (const c of TW.chunks) if (c.on) { const b = c.el.getBoundingClientRect(); if (b.bottom < r.top - far || b.top > r.bottom + far) chErase(c); }
}
// the part that holds word i, drawn (for jumps: to a passage, a search hit, the marker)
function ensureWord(i) {
  const TW = S.TW; if (!TW || i == null) return S.wordEls?.[i] || null;
  const c = TW.chunks.find(x => x.w0 != null && i >= x.w0 && i <= x.w1); if (c) chDraw(c);
  return S.wordEls[i] || null;
}
// after a change of text size, width, glosses or grammar line: the empty parts get new heights (screen kept still)
function chReestimate() {
  const TW = S.TW; if (!TW) return;
  const pane = $('#textPane'), top = pane.getBoundingClientRect().top, k = chKey();
  const m = TW.chunks.filter(x => x.on); if (m.length) { for (const x of m) { x.h = x.el.offsetHeight; x.hk = k; } TW.ppw = m.reduce((a, x) => a + x.h, 0) / Math.max(1, m.reduce((a, x) => a + x.words, 0)); }
  let d = 0;
  const todo = TW.chunks.filter(c => !c.on).map(c => [c, c.el.offsetHeight, Math.round(chEst(c)), c.el.getBoundingClientRect().bottom <= top + 1]);   // (all measured before any changes)
  for (const [c, h0, h1, above] of todo) if (h0 !== h1) { c.el.style.height = h1 + 'px'; if (above) d += h1 - h0; }
  if (d) pane.scrollTop += d;
}
{ let t = 0; const later = () => { clearTimeout(t); t = setTimeout(chReestimate, 250); };
  document.addEventListener('DOMContentLoaded', () => {
    new ResizeObserver(later).observe($('#textPane'));
    new MutationObserver(later).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }); window.chLater = later; }
// the elements of the words now drawn, in reading order
const drawnWords = () => S.TW ? $('#textBody').querySelectorAll('.w') : (S.wordEls || []);
// a copy of the whole text for exports (in 'window' mode only parts of it are on the page)
function textRoot() {
  if (!S.TW) return $('#textBody');
  const d = document.createElement('div'); d.innerHTML = textHTML(0, S.tokens.length, S.TW.gl, S.TW.covered);
  return d;
}
// long glosses get wider in proportion to their length (about three lines), never wider than the text column
function glW(html) {
  const n = html.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, ' ').length;
  return n > 70 ? ` style="--gw:${Math.round(n / 5)}em"` : '';
}
function setGlossMax() { const b = $('#textBody'); if (b) b.style.setProperty('--glmax', Math.round(b.clientWidth * 0.8) + 'px'); }
// punctuation between words gets its own element, so that it can be coloured (Colours → Punctuation marks)
const punctHTML = t => t.split(/(\s+)/).map(x => /\S/.test(x) ? `<span class="pn">${esc(x)}</span>` : esc(x)).join('');
function dgHTML(tk) {
  const dg = tk.lemma && S.lemmaGloss[gkey(tk.lemma)];
  return dg ? `<span class="dg" data-dg="${esc(gkey(tk.lemma))}" title="default gloss for ${esc(tk.lemma)}">${glossHTML(dg)}</span>` : '';
}
function markTarget() {
  document.querySelectorAll('.w.cur,.w.rng').forEach(e => e.classList.remove('cur', 'rng'));
  if (!S.cur || S.curHidden) return;
  const [s, e] = S.cur;
  for (let i = s; i <= e; i++) document.querySelector(`.w[data-i="${i}"]`)?.classList.add(e > s ? 'rng' : 'cur');
}
async function openText(id, scroll = true) {
  saveReadPos();
  const t = id == null ? null : isBook(id) ? await loadBook(id) : await get('texts', id);
  S.text = t || null; S.cur = null;
  S.tokens = t ? (t.blocks ? tokenizeBlocks(t.blocks) : tokenize(t.text)) : [];
  if (t?.ann && t.work?.annL) applyAnnotation(t);
  S.refs = refsOf(S.tokens, t?.blocks);
  S.marker = t ? (await setting('mk|' + t.id)) ?? null : null;
  if (t?.work) { await setting('wk|' + t.work.id, t.bi); S.opened = (await setting('opened')) || {}; S.opened[t.work.id] = Date.now(); await setting('opened', S.opened); }
  else if (t) { S.opened = (await setting('opened')) || {}; S.opened['imp:' + t.id] = Date.now(); await setting('opened', S.opened); }
  titleBar();
  S.glosses = t ? await req2p(tx('glosses').objectStore('glosses').index('textId').getAll(t.id)) : [];
  S.tokCh = await loadTokCh(t);
  renderText();
  if (scroll) { S.tGuard = null; const y = t ? await setting('pos|' + t.id) : 0, pw = S.TW && t ? await setting('pw|' + t.id) : null;
    if (pw) { const a = { i: pw.i, off: pw.off }; applyTextAnchor(a); setTimeout(() => applyTextAnchor(a), 60); } else $('#textPane').scrollTop = y || 0; }
  if (t) await setting('currentText', t.id);
  if (!$('#listBody').hidden) renderList();
  resolveTokens();
}

// ---------------------------------------------------------------- glosses
function targetLemma() {      // lemma of the single selected word (as chosen in the dictionary pane, if open)
  if (!S.cur || S.cur[0] !== S.cur[1]) return null;
  const tk = S.tokens.find(t => t.t === 'w' && t.i === S.cur[0]); if (!tk) return null;
  if (S.view && canon(S.view.form) === canon(tk.s)) return S.view.lemma || S.view.pick || tk.lemma;
  return tk.lemma;
}
function spanGloss(s0, e0) { return S.glosses.find(g => g.s === s0 && g.e === e0) || null; }
// keep line breaks the user typed; tidy spaces and empty lines
function cleanGloss(t) { return t.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n'); }
const glossHTML = t => esc(t).replace(/\n/g, '<br>');
function joinGloss(old, add) { return old ? (old.split(/;\s*/).includes(add) ? old : old + '; ' + add) : add; }
async function setDefaultGloss(k, text) {
  if (text) { S.lemmaGloss[k] = text; await setting('lg|' + k, text); }
  else { delete S.lemmaGloss[k]; await del('settings', 'lg|' + k); }
}
async function saveSpanGloss(s0, e0, text) {     // create, update or (empty text) delete the gloss of a word/phrase
  const g = spanGloss(s0, e0);
  if (!text) { if (g) { await del('glosses', g.id); S.glosses = S.glosses.filter(x => x !== g); } return; }
  if (g) { g.t = text; await put('glosses', g); }
  else { const n = { textId: S.text.id, s: s0, e: e0, t: text, created: Date.now() }; n.id = await put('glosses', n); S.glosses.push(n); }
}
// add = true: the text is appended to an existing gloss (used for selections from the dictionary)
async function addGloss(text, asDefault = false, add = false) {
  if (!S.text && !asDefault) return toast('Open a text first.');
  text = add ? text.replace(/\s+/g, ' ').trim() : cleanGloss(text); if (!text) return;
  if (asDefault) {
    // from a selection in the dictionary pane: the lemma whose entry is shown there (also after following a link)
    const l = (add && S.view?.pick) || targetLemma(); if (!l) return toast('A default gloss needs a single word with a known lemma.');
    const k = gkey(l);
    await setDefaultGloss(k, add ? joinGloss(S.lemmaGloss[k], text) : text);
    renderText(); fillGlossBox(); return toast(`Default gloss for ${l} ${add && S.lemmaGloss[k] !== text ? 'extended' : 'set'}`);
  }
  if (!S.cur) return toast('First tap the word in the text that the gloss belongs to.');
  const old = spanGloss(S.cur[0], S.cur[1])?.t;
  await saveSpanGloss(S.cur[0], S.cur[1], add ? joinGloss(old, text) : text);
  renderText(); fillGlossBox(); toast(old && add ? 'Gloss extended' : 'Gloss saved');
}
async function writeGloss() {     // type a gloss directly, without the dictionary
  if (!S.text) return toast('Open a text first.');
  if (!S.cur) return toast('First tap a word in the text.');
  const words = S.tokens.filter(t => t.t === 'w' && t.i >= S.cur[0] && t.i <= S.cur[1]).map(t => t.s).join(' ');
  const l = targetLemma();
  const existing = spanGloss(S.cur[0], S.cur[1])?.t;
  const prefill = existing || (l && S.lemmaGloss[gkey(l)]) || '';
  const r = await dialog(`<h3>Gloss for <span class="gk">${esc(words)}</span></h3><input type="text" name="t" value="${esc(prefill)}" autocomplete="off">` +
    (l ? `<label class="opt"><input type="checkbox" name="def"${S.lastDefault ? ' checked' : ''}>Use as default gloss for <span class="gk">${esc(l)}</span> wherever it appears</label>` : ''),
    [['cancel', 'Cancel'], ['ok', 'Save']], 'ok');
  if (r.action === 'ok' && (r.data.t || '').trim()) { S.lastDefault = r.data.def === 'on'; addGloss(r.data.t, S.lastDefault); }
}
// open the selected word in the dictionary pane (if it is not shown already) and put the cursor into its gloss field
async function openGlossField(kind = 'span', lemma = null) {
  if (!S.text) return toast('Open a text first.');
  if (!S.cur) return toast('First tap a word in the text.');
  const i0 = S.cur[0];
  const shown = S.view && S.view.ti != null && S.cur[0] <= S.view.ti && S.view.ti <= S.cur[1] && !$('#dictBody').hidden;
  if (!shown) {
    const tk = S.tokens.find(t => t.t === 'w' && t.i === i0);
    S.hist = []; S.view = null; await showWord(tk.s, { ti: i0, lemma: lemma || tk.lemma || null });
  }
  fillGlossBox();
  const inp = $(kind === 'def' ? '#glossbox textarea[data-def]' : '#glossbox textarea[data-span]');
  if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); inp.scrollIntoView({ block: 'nearest' }); }
}
// gloss box at the top of the dictionary pane: gloss of the tapped word + default gloss of the lemma, editable in place
function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; }
function fillGlossBox() {
  const box = $('#glossbox'); if (!box || !S.view) return;
  const v = S.view, k = v.pick ? gkey(v.pick) : null;
  const sel = S.cur && v.ti != null && S.cur[0] <= v.ti && v.ti <= S.cur[1] ? S.cur : (v.ti != null ? [v.ti, v.ti] : null);
  let h = '';
  if (sel && S.text) {
    const g = spanGloss(sel[0], sel[1]);
    const words = S.tokens.filter(t => t.t === 'w' && t.i >= sel[0] && t.i <= sel[1]).map(t => t.s).join(' ');
    h += `<label class="gb"><span>Gloss${sel[1] > sel[0] ? ` <i>${esc(words)}</i>` : ''}</span><textarea rows="1" data-span="${sel[0]},${sel[1]}" placeholder="– none –" autocomplete="off">${esc(g?.t || '')}</textarea></label>`;
  }
  if (k) h += `<label class="gb"><span>Default</span><textarea rows="1" data-def="${esc(k)}" placeholder="– none –" autocomplete="off">${esc(S.lemmaGloss[k] || '')}</textarea></label>`;
  if (box.contains(document.activeElement)) return;   // do not disturb a field that is being edited
  box.innerHTML = h; box.hidden = !h;
  box.querySelectorAll('textarea').forEach(autoGrow);
}
async function editGloss(id) {
  const g = S.glosses.find(x => x.id === id); if (!g) return;
  const r = await dialog(`<h3>Edit gloss</h3><input type="text" name="t" value="${esc(g.t)}" autocomplete="off">`,
    [['delete', 'Delete'], ['cancel', 'Cancel'], ['ok', 'Save']], 'ok');
  if (r.action === 'ok') {
    const t = (r.data.t || '').trim();
    if (!t) { toast('Empty gloss not saved – use “Delete” to remove it.'); return; }
    g.t = t; await put('glosses', g);
  }
  if (r.action === 'delete') { await del('glosses', g.id); S.glosses = S.glosses.filter(x => x.id !== g.id); }
  renderText();
}

// ---------------------------------------------------------------- marker (one per book / text)
function markIcon() {
  const b = $('#btnMark'), has = S.marker != null;
  b.disabled = !S.text; b.classList.toggle('set', has);
  b.title = has ? 'Go to the marker · hold to move it here (hold again at the same place to remove it)' : 'Set a marker here (at the selected word, or the first line on screen)';
}
function anchorWord() {             // selected word if it is on screen, otherwise the first word at the top of the pane
  const pane = $('#textPane').getBoundingClientRect();
  const vis = e => { const r = e?.getBoundingClientRect(); return r && r.bottom > pane.top && r.top < pane.bottom; };
  if (S.cur && !S.curHidden) { const e = document.querySelector(`#textBody .w[data-i="${S.cur[0]}"]`); if (vis(e)) return S.cur[0]; }
  const ws = document.querySelectorAll('#textBody .w'); if (!ws.length) return null;
  let lo = 0, hi = ws.length - 1;                 // words are in reading order: binary search for the first visible one
  while (lo < hi) { const m = (lo + hi) >> 1; if (ws[m].getBoundingClientRect().bottom <= pane.top + 4) lo = m + 1; else hi = m; }
  return +ws[lo].dataset.i;
}
function renderMarker() {
  document.querySelectorAll('#textBody .mkr').forEach(e => e.remove());
  if (S.marker != null) document.querySelector(`#textBody .w[data-i="${S.marker}"]`)?.insertAdjacentHTML('beforebegin', '<span class="mkr" title="Marker"></span>');
}
async function setMarker(i) {
  if (!S.text) return;
  S.marker = i;
  if (i == null) await del('settings', 'mk|' + S.text.id); else await setting('mk|' + S.text.id, i);
  renderMarker(); markIcon();
}
function goMarker() {
  const e = ensureWord(S.marker) || document.querySelector(`#textBody .w[data-i="${S.marker}"]`); if (!e) return;
  const pane = $('#textPane');
  pane.scrollTop += e.getBoundingClientRect().top - pane.getBoundingClientRect().top - 56;
  e.classList.add('flash'); setTimeout(() => e.classList.remove('flash'), 1200);
}
function wireMarker() {
  const b = $('#btnMark'); let timer = null, long = false;
  b.addEventListener('pointerdown', () => {
    long = false; clearTimeout(timer);
    timer = setTimeout(async () => {
      long = true; const i = anchorWord(); if (i == null) return;
      if (i === S.marker) { await setMarker(null); toast('Marker removed'); } else { await setMarker(i); toast('Marker moved here'); }
    }, 550);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => clearTimeout(timer));
  b.addEventListener('contextmenu', e => e.preventDefault());
  b.addEventListener('click', async () => {
    if (long) { long = false; return; }
    if (S.marker == null) { const i = anchorWord(); if (i == null) return; await setMarker(i); toast('Marker set – tap the ribbon to come back here; hold it to move the marker.', 3500); }
    else goMarker();
  });
}

// ---------------------------------------------------------------- start
// ---- the size of the text: pinching the text pane (ctrl + wheel, trackpad) makes the text larger or smaller – all its
// parts in proportion (CSS variable --tz on #textBody) – instead of zooming the whole page; the word under the fingers stays put
const TZ_MIN = 0.6, TZ_MAX = 2.5;
function setTextZoom(z, at) {
  z = Math.max(TZ_MIN, Math.min(TZ_MAX, Math.round(z * 100) / 100));
  const b = $('#textBody'), pane = $('#textPane'); S.tz = z; if (!b) return;
  let el = null, top0 = 0;
  if (at && pane) { el = document.elementFromPoint(at.x, at.y)?.closest('#textBody .w, #textBody .blk'); if (el) top0 = el.getBoundingClientRect().top; }
  const anc = !at && pane && S.text ? textAnchor() : null;      // (buttons in Settings: the line at the top stays)
  b.style.setProperty('--tz', z);
  if (el) pane.scrollTop += el.getBoundingClientRect().top - top0;
  else if (anc) applyTextAnchor(anc);
  setGlossMax?.(); window.chLater?.();
  const v = document.getElementById('tzVal'); if (v) v.textContent = Math.round(z * 100) + ' %';
}
let tzSaveT = 0;
const tzSave = () => { clearTimeout(tzSaveT); tzSaveT = setTimeout(() => setting('textZoom', S.tz), 400); };
(function wireTextZoom() {
  let pinch = null, raf = 0, next = null;
  const run = () => { raf = 0; if (next) { setTextZoom(next.z, next.at); next = null; } };
  const mid = t => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  // on the text: either finger on the text pane (the target of a touch can be a text node or the other finger's element)
  const onText = e => [...e.touches].some(t => (t.target.nodeType === 1 ? t.target : t.target.parentElement)?.closest?.('#textPane')) && !document.querySelector('dialog[open]');
  const start = e => { pinch = { d0: Math.max(20, dist(e.touches)), z0: S.tz || 1 }; };
  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 2 || !onText(e)) return;
    e.preventDefault(); start(e);
  }, { passive: false });
  document.addEventListener('touchmove', e => {
    if (e.touches.length < 2) return;
    if (!e.target.closest?.('.maplibregl-canvas-container, .mtt')) e.preventDefault();   // never the page zoom (the map and the time slider pinch themselves)
    if (!pinch) { if (e.touches.length === 2 && onText(e)) start(e); return; }   // (when the start was missed)
    next = { z: pinch.z0 * Math.pow(dist(e.touches) / pinch.d0, 0.75), at: mid(e.touches) };   // (a little gentler than the fingers)
    if (!raf) raf = requestAnimationFrame(run);
  }, { passive: false });
  document.addEventListener('touchend', e => { if (pinch && e.touches.length < 2) { pinch = null; tzSave(); toast(`Text ${Math.round(S.tz * 100)} %`, 1200); } });
  // Safari (iPad, iPhone, Mac trackpad): its own pinch events – no page zoom anywhere; on the text: the text size
  let g0 = null;
  document.addEventListener('gesturestart', e => { e.preventDefault(); const tg = e.target?.nodeType === 1 ? e.target : e.target?.parentElement; g0 = tg?.closest?.('#textPane') && !document.querySelector('dialog[open]') ? S.tz || 1 : null; }, { passive: false });
  document.addEventListener('gesturechange', e => { e.preventDefault(); if (g0 != null && !pinch) { next = { z: g0 * Math.pow(e.scale, 0.75), at: { x: e.clientX, y: e.clientY } }; if (!raf) raf = requestAnimationFrame(run); } }, { passive: false });
  document.addEventListener('gestureend', e => { e.preventDefault(); if (g0 != null) { g0 = null; tzSave(); } }, { passive: false });
  // ctrl + wheel (and the pinch of a trackpad in Chrome): on the text the text size, elsewhere nothing
  document.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    if (e.target.closest?.('.maplibregl-canvas-container, .mtt')) return;
    e.preventDefault();
    if (e.target.closest?.('#textPane')) {
      // a mouse wheel notch (large steps): 7 % per notch; a trackpad pinch (many small steps): gently in proportion
      const dy = e.deltaMode ? e.deltaY * 40 : e.deltaY;
      const f = Math.abs(dy) >= 40 ? (dy < 0 ? 1.07 : 1 / 1.07) : Math.exp(-dy * 0.008);
      setTextZoom((S.tz || 1) * f, { x: e.clientX, y: e.clientY }); tzSave();
    }
  }, { passive: false });
  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-tz]'); if (!b) return;
    const d = +b.dataset.tz; setTextZoom(d ? Math.round((S.tz || 1) * 100 + d) / 100 : 1); tzSave();   // steps in percentage points (±1, ±7); 0: back to 100 %
  });
})();
// ---- touch screens: a scroll handle for the text pane with a wide grip (the browser's own indicator is hard to catch).
// It appears while the text scrolls and fades after a moment; drag it to move quickly through the text.
(function wireTextScrollHandle() {
  if (!matchMedia('(pointer: coarse)').matches) return;
  document.documentElement.classList.add('tsh');
  const h = Object.assign(document.createElement('div'), { id: 'tScroll' }); h.innerHTML = '<i></i>';
  let fade = 0, drag = null;
  const place = () => {
    const pane = $('#textPane'); if (!pane) return;
    const r = pane.getBoundingClientRect(), max = pane.scrollHeight - pane.clientHeight;
    if (max < pane.clientHeight * 0.5 || r.width < 40 || getComputedStyle(pane).visibility === 'hidden') { h.classList.remove('show'); return; }
    const th = Math.max(44, Math.min(r.height * 0.25, r.height * pane.clientHeight / pane.scrollHeight)), track = r.height - th - 8;
    h.style.height = th + 'px';
    h.style.left = (r.right - 34) + 'px';
    h.style.top = (r.top + 4 + track * (pane.scrollTop / max)) + 'px';
    h._track = track; h._th = th;
  };
  const show = () => { place(); h.classList.add('show'); clearTimeout(fade); if (!drag) fade = setTimeout(() => h.classList.remove('show'), 1400); };
  document.addEventListener('DOMContentLoaded', () => {
    document.body.append(h);
    $('#textPane').addEventListener('scroll', () => { if (!drag) show(); else place(); }, { passive: true });
  });
  h.addEventListener('pointerdown', e => {
    if (!h.classList.contains('show')) return;
    e.preventDefault(); e.stopPropagation(); h.setPointerCapture(e.pointerId);
    drag = { y: e.clientY - h.getBoundingClientRect().top }; h.classList.add('drag'); clearTimeout(fade); S.tGuard = null;
  });
  h.addEventListener('pointermove', e => {
    if (!drag) return;
    const pane = $('#textPane'), r = pane.getBoundingClientRect(), max = pane.scrollHeight - pane.clientHeight;
    const f = Math.max(0, Math.min(1, (e.clientY - drag.y - r.top - 4) / h._track));
    pane.scrollTop = f * max;
  });
  const end = () => { if (!drag) return; drag = null; h.classList.remove('drag'); show(); updateSecTitle?.(); saveReadPos(); };
  h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
  h.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
})();
