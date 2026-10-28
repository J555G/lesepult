/* Pult – The dictionary pane: entries, the highlighter, the list of lemmata of the text.
   (see core.js for the order of the scripts) */
'use strict';
// ---------------------------------------------------------------- dictionary view
// colours used by the Eulexis editors in Pape and LSJ, with their meaning (shown as a tooltip)
const FONT_MEANING = {
  '#494': 'name of author / scholar', brown: 'contrast (Pape) · variant reading, v.l. (LSJ)', darkgreen: 'derived adverb',
  blue: 'variant / parallel form ("neben")', darkblue: 'hapax legomenon', darkorange: 'doubtful reading (dub.)', red: 'false reading / to be deleted',
};
function normalizeHTML(h) {
  return h.replace(/<font color="([^"]+)">/g, (_, c) => `<span class="fc" data-c="${esc(c)}" title="${esc(FONT_MEANING[c] || '')}">`)
          .replace(/<font[^>]*>/g, '<span>').replace(/<\/font>/g, '</span>');
}
// Latin words in Latin dictionary entries become tappable when the Latin analysis recognises them
// (translations in italics, authors, references and Greek are left alone)
// common English and German words that the Latin analysis would also accept
const NOT_LATIN = new Set('der die das den dem des und oder mit von uom zum zur bei aus wie auch ist sind eine einer einem einen nicht als auf nach wenn mich dich sich sein seine ihr ihm ihn wir uns euch man dah übh etw jmd usw bes eig übtr übertr sprichw ggstz gew zw bzw ders dass daß the and of to is as an be by or it on at he his her use also are was were has had this that from with for which'.split(' '));
async function wrapLatin(root) {
  const E = await latEngine(); if (!E) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  const known = new Map(), ok = w => { const k = latkey(w); if (!known.has(k)) known.set(k, !NOT_LATIN.has(k) && latAnalyze(E, w).length > 0); return known.get(k); };
  for (const n of nodes) {
    const pe = n.parentElement;
    if (!/[A-Za-z]/.test(n.nodeValue) || pe.closest('.gw,summary,.au,.lab,.grk,.num,.us,.lb,.ps,.it,.gn,.hw,.tr,b')) continue;
    const s = n.nodeValue;
    // Georges and Lewis & Short run German/English and Latin together in one line ("frutex rosae, Rosenstock, Colum.:
    // in rosa, mit Rosen bekränzt"). The line is cut into short stretches at punctuation; a stretch counts as Latin
    // if most of its words are Latin forms – so German and English stay plain, the Latin phrases between them are linked.
    const isAbbr = (w, i) => s[i + w.length] === '.' && (w.length <= 3 || /^[A-Z]/.test(w));
    const segOf = [], segLatin = [];
    { let seg = 0; const SEP = /[,:;–—()\[\]!?«»„“”"]|\s-\s|\.\s/g; const cuts = [...s.matchAll(SEP)].map(m => m.index);
      const words = [...s.matchAll(new RegExp(LATIN_TOKEN.source, 'g'))];
      const stat = [];
      for (const m of words) { while (seg < cuts.length && cuts[seg] < m.index) seg++; segOf.push(seg);
        if (m[0].length < 2 || isAbbr(m[0], m.index)) continue;
        const st = stat[seg] ??= [0, 0]; st[1]++; if (ok(m[0])) st[0]++; }
      stat.forEach((st, i) => { segLatin[i] = st && st[1] && st[0] / st[1] >= 0.6; }); }
    const frag = document.createDocumentFragment(); let last = 0, wi = -1;
    for (const m of s.matchAll(new RegExp(LATIN_TOKEN.source, 'g'))) {
      wi++;
      if (m[0].length < 2) continue;
      const latin = segLatin[segOf[wi]];
      // cross-references (v. / s. / cf. / vid. / = word) are always links; other words only in Latin stretches
      const xref = /(?:\b(?:v|s|cf|vid|vgl|vergl)\.|=)\s*(?:\d+\.\s*)?$/.test(s.slice(Math.max(0, m.index - 14), m.index));
      if (!ok(m[0]) || !(xref || latin)) continue;
      if (!xref && s[m.index + m[0].length] === '.' && (m[0].length <= 3 || /^[A-Z]/.test(m[0]))) continue;     // abbreviations: Sal., ap., Cic.
      if (m.index > last) frag.append(s.slice(last, m.index));
      const sp = document.createElement('span'); sp.className = 'gw'; sp.textContent = m[0]; frag.append(sp);
      last = m.index + m[0].length;
    }
    if (last === 0) continue;
    if (last < s.length) frag.append(s.slice(last));
    n.replaceWith(frag);
  }
}
function wrapGreek(root) {      // make every Greek word in entries tappable
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    if (!/[Ͱ-Ͽἀ-῿]/.test(n.nodeValue) || n.parentElement.closest('.gw,summary')) continue;
    const frag = document.createDocumentFragment(); let last = 0; const s = n.nodeValue;
    for (const m of s.matchAll(GREEK_TOKEN)) {
      if (m[0].replace(/[^Ͱ-Ͽἀ-῿]/g, '').length < 2) continue;
      if (m.index > last) frag.append(s.slice(last, m.index));
      const sp = document.createElement('span'); sp.className = 'gw'; sp.textContent = m[0]; frag.append(sp);
      last = m.index + m[0].length;
    }
    if (last === 0) continue;
    if (last < s.length) frag.append(s.slice(last));
    n.replaceWith(frag);
  }
}
async function renderEntryHTML(e, depth = 0, seen = new Set()) {
  seen.add(e.d + ':' + e.i);
  // the headword line is added only where the entry does not begin with its own (the Latin dictionaries keep theirs,
  // with vowel lengths and variants: "āh or ā")
  const own = e.d === 'frisk' || /^\s*(?:<div class="hw">|<div class="ent-la">\s*<b class="hw-o">)/.test(e.html);
  let h = `<div class="ent">${own ? '' : `<div class="hw">${esc(e.h)}</div>`}<div class="eb" data-hl="${e.d}:${e.i}">${normalizeHTML(e.html)}</div>`;
  if (e.r && depth < 3) {
    for (const ref of e.r) {
      if (seen.has(e.d + ':' + ref[1])) continue;
      const r = await entryByRef(e.d, ref); if (!r) continue;
      h += `<div class="ref"><div class="rl">→ see: ${esc(r.h)}</div>${await renderEntryHTML(r, depth + 1, seen)}</div>`;
    }
  }
  return h + '</div>';
}
// ---------------------------------------------------------------- highlighter (Apple Pencil / mouse)
// highlights are stored per dictionary entry as character ranges of the entry text: settings 'hl|<dict>:<id>' -> [[start,end],…]
function textNodes(root) { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const a = []; while (w.nextNode()) a.push(w.currentNode); return a; }
function offsetIn(root, node, off) {          // character offset of (node, off) inside root
  let n = 0;
  for (const t of textNodes(root)) { if (t === node) return n + off; n += t.nodeValue.length; }
  if (node.nodeType === 1) {                   // caret given relative to an element
    const r = document.createRange(); r.setStart(root, 0); r.setEnd(node, off); return r.toString().length;
  }
  return n;
}
// a space between two inline elements (e.g. two Greek words) is highlighted too, otherwise the highlight has gaps;
// whitespace between blocks is left alone
function inlineGap(t) {
  const inl = n => !n || n.nodeType === 3 || /^inline/.test(getComputedStyle(n).display);
  return inl(t.previousSibling) && inl(t.nextSibling) && /^inline|^block|^list|^table-cell/.test(getComputedStyle(t.parentElement).display);
}
function wrapRange(root, start, end, idx) {
  let n = 0;
  for (const t of textNodes(root)) {
    const len = t.nodeValue.length, a = Math.max(start, n), b = Math.min(end, n + len);
    if (a < b && (t.nodeValue.trim() || inlineGap(t))) {
      let mid = t; if (a > n) mid = t.splitText(a - n);
      if (b < n + len) mid.splitText(b - a);
      const m = document.createElement('mark'); m.className = 'hl'; m.dataset.r = idx;
      mid.replaceWith(m); m.append(mid);
    }
    n += len; if (n >= end) break;
  }
}
function unwrapMarks(root) { root.querySelectorAll('mark.hl').forEach(m => m.replaceWith(...m.childNodes)); root.normalize(); }
async function paintEntry(eb) {
  unwrapMarks(eb);
  const ranges = (await setting('hl|' + eb.dataset.hl)) || [];
  (S.hlCache ??= {})[eb.dataset.hl] = ranges;
  ranges.forEach(([a, b], i) => wrapRange(eb, a, b, i));
}
async function applyHighlights(root) { for (const eb of root.querySelectorAll('.eb[data-hl]')) await paintEntry(eb); }
function mergeRanges(rs) {
  rs.sort((x, y) => x[0] - y[0]); const out = [];
  for (const r of rs) { const l = out[out.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else out.push([...r]); }
  return out;
}
function subtractRange(rs, [a, b]) {
  const out = [];
  for (const [x, y] of rs) {
    if (y <= a || x >= b) { out.push([x, y]); continue; }
    if (x < a) out.push([x, a]);
    if (y > b) out.push([b, y]);
  }
  return out.filter(([x, y]) => y - x > 0);
}
function caretAt(x, y) {
  if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); return r && { node: r.startContainer, off: r.startOffset }; }
  if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && { node: p.offsetNode, off: p.offset }; }
  return null;
}
function posAt(root, off) {                      // (text node, offset) at character offset off inside root
  let n = 0, last = null;
  for (const t of textNodes(root)) { const len = t.nodeValue.length; if (off <= n + len) return [t, off - n]; n += len; last = t; }
  return last ? [last, last.nodeValue.length] : [root, 0];
}
// current selection inside ONE dictionary entry -> {eb, a, b, text}; anything else -> {text} or null
function dictSelection() {
  if (S.tsel) { const t = tselRange()?.toString().trim(); return t ? (S.tsel.eb ? { eb: S.tsel.eb, a: S.tsel.a, b: S.tsel.b, text: t } : { text: t }) : null; }
  const sel = window.getSelection(); if (!sel.rangeCount) return null;
  const text = String(sel).trim(); if (!text) return null;
  const r = sel.getRangeAt(0);
  if (!$('#dictPane').contains(r.commonAncestorContainer) || $('#temporaBody')?.contains(r.commonAncestorContainer)) return null;   // (Tempora: no highlighting or glosses)
  const el = n => n.nodeType === 1 ? n : n.parentElement;
  const eb = el(r.startContainer)?.closest('.eb'), eb2 = el(r.endContainer)?.closest('.eb');
  if (!eb || eb !== eb2 || !eb.dataset.hl) return { text };
  let a = offsetIn(eb, r.startContainer, r.startOffset), b = offsetIn(eb, r.endContainer, r.endOffset);
  if (a > b) [a, b] = [b, a];
  return { eb, a, b, text };
}
// highlighter button: marks the selected text, or removes the marking if all of it is already marked
async function toggleHighlight() {
  const d = S.sel; if (!d?.eb || d.b - d.a < 1) return;
  const key = 'hl|' + d.eb.dataset.hl;
  let ranges = (await setting(key)) || [];
  const covered = ranges.some(([x, y]) => x <= d.a + 1 && y >= d.b - 1);
  ranges = covered ? subtractRange(ranges, [d.a, d.b]) : mergeRanges([...ranges, [d.a, d.b]]);
  await setting(key, ranges); await paintEntry(d.eb);
  // keep the same text selected, so that it can still be added as a gloss
  if (S.tsel) paintTsel();
  else { const [n1, o1] = posAt(d.eb, d.a), [n2, o2] = posAt(d.eb, d.b); try { window.getSelection().setBaseAndExtent(n1, o1, n2, o2); } catch (_) { } }
  updateFab();
}
function updateFab() {
  const fb = $('#fabBar'), d = S.sel;
  if (!d) { fb.hidden = true; return; }
  const ranges = d.eb ? (S.hlCache?.[d.eb.dataset.hl] || []) : [];
  const covered = d.eb && ranges.some(([x, y]) => x <= d.a + 1 && y >= d.b - 1);
  $('#fabHl').disabled = !d.eb; $('#fabHl').classList.toggle('on', !!covered);
  $('#fabHl').title = covered ? 'Remove the highlighting' : 'Highlight the selected text';
  const r = $('#dictPane').getBoundingClientRect();         // float at the bottom of the dictionary section
  Object.assign(fb.style, { left: r.left + 'px', width: r.width + 'px', bottom: Math.max(12, innerHeight - r.bottom + 14) + 'px' });
  fb.hidden = false;
}
// Apple Pencil: dragging over dictionary text selects it (instead of scrolling); fingers scroll and select as usual
function wirePencilSelect() {
  const pane = $('#dictPane');
  let drag = null;
  const stylusInEntry = e => [...e.changedTouches].some(t => t.touchType === 'stylus') && e.target.closest?.('.eb');
  pane.addEventListener('touchstart', e => { if (stylusInEntry(e)) e.preventDefault(); }, { passive: false });
  pane.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });
  pane.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'pen') return;
    const eb = e.target.closest('.eb'); if (!eb) return;
    const c = caretAt(e.clientX, e.clientY); if (!c) return;
    drag = { eb, start: c, moved: false, x: e.clientX, y: e.clientY, target: e.target };
    pane.setPointerCapture?.(e.pointerId);
  });
  pane.addEventListener('pointermove', e => {
    if (!drag) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
    if (!drag.moved) return;
    const c = caretAt(e.clientX, e.clientY); if (!c || !drag.eb.contains(c.node)) return;
    try { window.getSelection().setBaseAndExtent(drag.start.node, drag.start.off, c.node, c.off); } catch (_) { }
  });
  pane.addEventListener('pointerup', () => {
    if (!drag) return; const d = drag; drag = null;
    if (!d.moved) { window.getSelection().removeAllRanges(); d.target.closest('.gw')?.click(); }    // a Pencil tap works like a finger tap
  });
  pane.addEventListener('pointercancel', () => { drag = null; });
}

// Android: a long press selects the word without the system's selection menu (copy, web search …) or the
// search panel from the bottom edge – the native selection is switched off and drawn by the app instead
// (CSS Custom Highlight); dragging without lifting the finger extends it word by word. Only the floating
// buttons (highlighter, + Gloss, + Default) appear.
const WCH = /[\p{L}\p{M}\p{N}'’ʼ\-]/u;
function tselRange() {
  const t = S.tsel; if (!t || !t.root.isConnected) return null;
  const [n1, o1] = posAt(t.root, t.a), [n2, o2] = posAt(t.root, t.b);
  const r = document.createRange(); try { r.setStart(n1, o1); r.setEnd(n2, o2); } catch (_) { return null; }
  return r;
}
function paintTsel() {
  if (!window.CSS?.highlights) return;
  const r = S.tsel && tselRange();
  if (r) CSS.highlights.set('tsel', new Highlight(r)); else CSS.highlights.delete('tsel');
}
function setTsel(t) {
  S.tsel = t; paintTsel();
  S.sel = dictSelection(); if (S.sel) S.lastSel = S.sel.text; updateFab();
}
function clearTsel() { if (S.tsel) setTsel(null); }
// character offset (inside root) of the word start / end at a caret position
function wordBounds(node, off) {
  const v = node.nodeValue || ''; let a = off, b = off;
  while (a > 0 && WCH.test(v[a - 1])) a--;
  while (b < v.length && WCH.test(v[b])) b++;
  return [a, b];
}
function wireTouchSelect() {
  const pane = $('#dictPane'); let hold = null, drag = null;
  const pt = e => e.touches[0] || e.changedTouches[0];
  const at = (x, y, root) => { const c = caretAt(x, y); if (!c || c.node.nodeType !== 3 || !root.contains(c.node)) return null; const [wa, wb] = wordBounds(c.node, c.off); const o = offsetIn(root, c.node, 0); return { a: o + wa, b: o + wb, c: o + c.off }; };
  pane.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || e.target.closest('input,textarea,select,button,summary,[contenteditable],#temporaBody')) { hold = null; return; }   // (Tempora: no selecting)
    const p = pt(e), x = p.clientX, y = p.clientY, target = e.target;
    hold = { x, y, moved: false, timer: setTimeout(() => {
      const root = target.closest?.('.eb') || $('#dictBody'); const w = at(x, y, root);
      if (!w || w.b <= w.a) { hold = null; return; }
      drag = { root, wa: w.a, wb: w.b }; hold = null;
      navigator.vibrate?.(8);
      setTsel({ root, eb: root.classList.contains('eb') && root.dataset.hl ? root : null, a: w.a, b: w.b });
      drag.fresh = true;                                   // the click that follows the long press does not open a word
    }, 450) };
  }, { passive: true });
  pane.addEventListener('touchmove', e => {
    if (drag) {
      e.preventDefault();                                  // extending the selection, not scrolling
      const p = pt(e), w = at(p.clientX, p.clientY, drag.root); if (!w) return;
      const t = w.c >= drag.wa ? { a: drag.wa, b: Math.max(drag.wb, w.b) } : { a: w.a, b: drag.wb };
      if (t.a !== S.tsel.a || t.b !== S.tsel.b) setTsel(Object.assign({}, S.tsel, t));
      return;
    }
    if (hold) { const p = pt(e); if (Math.hypot(p.clientX - hold.x, p.clientY - hold.y) > 8) { clearTimeout(hold.timer); hold.moved = true; } }
  }, { passive: false });
  const end = () => { if (hold) clearTimeout(hold.timer); if (drag?.fresh) S.tselNoClick = Date.now() + 600; drag = null; };
  pane.addEventListener('touchend', end); pane.addEventListener('touchcancel', end);
  document.addEventListener('click', e => { if (S.tselNoClick > Date.now() && !e.target.closest('#fabBar')) { S.tselNoClick = 0; e.preventDefault(); e.stopPropagation(); } }, true);
  // a tap anywhere else ends the selection (scrolling keeps it)
  let tap = null;
  document.addEventListener('touchstart', e => { const p = pt(e); tap = { x: p.clientX, y: p.clientY, t: Date.now() }; }, { passive: true, capture: true });
  document.addEventListener('touchend', e => {
    const p = pt(e);
    if (tap && !drag && Date.now() - tap.t < 400 && Math.hypot(p.clientX - tap.x, p.clientY - tap.y) < 8 && !e.target.closest('#fabBar')) clearTsel();
    tap = null;
  }, { capture: true });
  document.addEventListener('contextmenu', e => { if (e.target.closest('#dictPane,#textPane') && !e.target.closest('input,textarea')) e.preventDefault(); });
}

// ---- the dictionary pane remembers its scroll position: per tapped word of a text (kept on the device),
// otherwise per lemma; Back/Forward return to the position the entry had when it was left
const scrollKey = v => v.ti != null && S.text ? `sc|${S.text.id}|${v.ti}` : `sc|@${gkey(v.pick || v.form)}`;
function flushDictScroll() {
  const v = S.scPend; S.scPend = null; clearTimeout(S.scT);
  if (v?.skey && v.scroll != null) setting(v.skey, v.scroll > 0 ? { l: v.scrollL, y: Math.round(v.scroll) } : null);
}
function wireDictScroll() {
  const pane = $('#dictPane');
  pane.addEventListener('scroll', () => {
    if (S.tabSw) return;                                     // switching between entry and Lemmata: not the reader's scrolling
    if (!$('#listBody').hidden) { if (S.text) S.listScroll = { id: S.text.id, y: pane.scrollTop }; return; }   // the list's own position
    const v = S.view; if (!v || S.dictRendering || !v.skey) return;
    v.scroll = pane.scrollTop; v.scrollL = v.pick;
    S.scPend = v; clearTimeout(S.scT); S.scT = setTimeout(flushDictScroll, 300);
  }, { passive: true });
}
async function showWord(word, opts = {}) {
  // a word from the text starts a new history (no pill until the next step inside the dictionary);
  // lookups from the dictionary itself and the search field go into the history – the same word again not twice
  const same = S.view && S.view.form === word && (S.view.ti ?? null) === (opts.ti ?? null);
  if ((opts.ti != null && !opts.keep) || opts.fresh) S.hist = [];
  else if (S.view && !opts.replace && !same) { S.hist.push(S.view); if (S.hist.length > 200) S.hist.shift(); }
  S.fwd = [];
  S.view = { form: word, lemma: opts.lemma || null, openDict: opts.openDict || null, ti: opts.ti ?? null, tid: opts.ti != null ? S.text?.id : null, ref: opts.ti != null ? refAt(opts.ti) : null };
  navButtons();
  if (S.tab === 'map') { if (opts.ti != null) mapWordTapped(opts.ti); }       // the map stays; the entry is prepared behind it
  else if (S.tab === 'people' && opts.ti != null && typeof pplWordTapped === 'function' && pplWordTapped(opts.ti)) { }   // a person: shown in the People tab, the entry behind
  else showTab('entry');
  await renderView();
}
// ---- back and forward between entries: a slim bar at the top of the dictionary pane ("‹ λόγος" … "φημί ›");
// holding it opens the whole history as a scrollable list
const viewName = v => v ? (v.browse ? (v.browse.ix ? 'index' : v.browse.k) : v.search != null ? '“' + v.search + '”' : v.lemma || v.pick || v.form || '') : '';
function refAt(i) { const R = S.refs || []; let r = null; for (const x of R) { if (x.i > i) break; r = x; } return r?.s || null; }
function navButtons() {
  const bar = $('#dictNav'); if (!bar) return;
  const back = S.hist.at(-1), fwd = S.fwd?.at(-1), show = S.tab !== 'list' && S.tab !== 'map' && S.tab !== 'people' && (back || fwd);
  const was = bar.hidden; bar.hidden = !show; if (!show) { $('#dictHist').hidden = true; return; }
  if (was) requestAnimationFrame(alignNav);
  const [b, f] = bar.querySelectorAll('.dnb');
  b.disabled = !back; f.disabled = !fwd;
  b.title = back ? `Back to ${viewName(back)} · hold for the history` : 'Hold for the history';
  f.title = fwd ? `Forward to ${viewName(fwd)} · hold for the history` : 'Hold for the history';
}
function goBack() { if (!S.hist.length) return; S.fwd.push(S.view); S.view = S.hist.pop(); navButtons(); showTab('entry'); renderView(); }
function goFwd() { if (!S.fwd?.length) return; S.hist.push(S.view); S.view = S.fwd.pop(); navButtons(); showTab('entry'); renderView(); }
function goHist(k) {          // k: position in the whole history, oldest first
  const L = [...S.hist, S.view, ...[...(S.fwd || [])].reverse()]; if (!L[k]) return;
  S.hist = L.slice(0, k); S.view = L[k]; S.fwd = L.slice(k + 1).reverse();
  navButtons(); showTab('entry'); renderView();
}
function histList() {
  const box = $('#dictHist'), L = [...S.hist, S.view, ...[...(S.fwd || [])].reverse()], cur = S.hist.length;
  box.innerHTML = L.map((v, k) => [v, k]).reverse().map(([v, k]) => `<button type="button" data-hk="${k}" class="${k === cur ? 'on' : ''}"><b>${esc(viewName(v))}</b>${v.form && viewName(v) !== v.form ? `<small>${esc(v.form)}</small>` : ''}<i>${v.ref ? esc(v.ref) : v.ti == null ? 'look-up' : ''}</i></button>`).join('');
  box.style.maxWidth = Math.min(352, Math.max(200, $('#dictPane').clientWidth - 16)) + 'px';      // never wider than the pane
  box.style.maxHeight = '';
  box.hidden = false;
  // never below the pane's bottom edge (on a phone the dictionary is the lower half of the screen)
  const room = $('#dictPane').getBoundingClientRect().bottom - box.getBoundingClientRect().top - 10;
  box.style.maxHeight = Math.max(120, Math.min(box.offsetHeight, room)) + 'px';
  const on = box.querySelector('.on'); if (on) box.scrollTop = on.offsetTop - box.clientHeight / 2 + on.offsetHeight / 2;
}
// the pill sits on the line of the headword and its chips (vertically centred on the headword), so it takes no room
function alignNav() {
  const bar = $('#dictNav'), form = $('#dictBody .vtop .form'), pane = $('#dictPane');
  if (!bar || bar.hidden) return;
  if (!form) { bar.style.marginTop = ''; return; }
  bar.style.marginTop = '0px'; bar.style.position = 'static';            // (measured without its sticking)
  const fr = form.getBoundingClientRect(), nr = bar.getBoundingClientRect();
  const lh = parseFloat(getComputedStyle(form).lineHeight) || fr.height;        // the first line of the headword
  const h1 = fr.height < lh * 1.6 ? fr.height : lh;                              // one line: its whole box
  const off = Math.max(0, Math.round(fr.top + h1 / 2 - nr.height / 2 - nr.top));
  bar.style.marginTop = off + 'px'; bar.style.position = '';
}
(function wireDictNav() {
  document.addEventListener('DOMContentLoaded', () => {
    const bar = $('#dictNav'); if (!bar) return;
    let ar = 0; const later = () => { cancelAnimationFrame(ar); ar = requestAnimationFrame(alignNav); };
    new MutationObserver(later).observe($('#dictBody'), { childList: true });
    new ResizeObserver(later).observe($('#dictPane'));
    let t = 0, held = false;
    // (a disabled arrow does not get pointer events: the pill listens for both)
    bar.addEventListener('pointerdown', e => { if (e.target.closest('#dictHist')) return; held = false; clearTimeout(t); t = setTimeout(() => { held = true; histList(); }, 500); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) bar.addEventListener(ev, () => clearTimeout(t));
    bar.addEventListener('contextmenu', e => { if (e.target.closest('#dictHist')) return; e.preventDefault(); histList(); });
    bar.addEventListener('click', e => {
      const h = e.target.closest('[data-hk]'); if (h) { $('#dictHist').hidden = true; return goHist(+h.dataset.hk); }
      const b = e.target.closest('[data-dn]'); if (!b) return;
      if (held) { held = false; return; }
      if (!$('#dictHist').hidden) { $('#dictHist').hidden = true; return; }      // the list open: a tap on the pill only closes it
      b.dataset.dn === 'back' ? goBack() : goFwd();
    });
    document.addEventListener('pointerdown', e => { if (!e.target.closest('#dictNav')) $('#dictHist').hidden = true; });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#dictHist').hidden) { $('#dictHist').hidden = true; e.preventDefault(); } });
    // touch: scrolling the history list never scrolls the dictionary pane behind it (also at the list's ends,
    // and where the browser ignores overscroll-behavior)
    const hb = $('#dictHist'); let y0 = 0;
    hb.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
    hb.addEventListener('touchmove', e => {
      const dy = e.touches[0].clientY - y0, top = hb.scrollTop <= 0, end = hb.scrollTop + hb.clientHeight >= hb.scrollHeight - 1;
      if ((dy > 0 && top) || (dy < 0 && end)) e.preventDefault();
    }, { passive: false });
  });
})();
async function renderView() {
  const body = $('#dictBody'); const v = S.view; if (!v) return;
  flushDictScroll();
  const keep = S.lastRendered === v ? $('#dictPane').scrollTop : null;     // the same entry drawn again: stay where it is
  S.dictRendering = true;
  if (S.tsel) { S.tsel = null; paintTsel(); }
  if (v.browse) { S.lastRendered = v; await renderBrowse(v, body); if (keep != null) $('#dictPane').scrollTop = keep; else $('#dictPane').scrollTop = 0; S.dictRendering = false; return; }
  if (v.search != null) { S.lastRendered = v; await renderSearch(v, body); requestAnimationFrame(alignNav); if (keep != null) $('#dictPane').scrollTop = keep; else $('#dictPane').scrollTop = 0; return; }
  if (!S.dicts.length) { body.innerHTML = '<p class="hint">No dictionaries installed yet. Open the menu ☰ → Instruments → Dictionaries and import the packages (*.gdpkg.gz).</p>'; S.dictRendering = false; return; }
  const lang = langOf(v.form);
  const A = await analyses(v.form);
  const tk = v.ti != null ? S.tokens.find(t => t.t === 'w' && t.i === v.ti) : null;      // a word of the text: its own reading
  const lemma = v.lemma || tk?.lemma || A.pick || v.form;
  v.pick = lemma;
  const k = gkey(lemma);
  v.key = k;
  // Latin: the form with its vowel lengths (macron long, breve short) – one per distinct reading of the chosen lemma
  const px = A.lemmas.find(x => x.lemma === lemma), qs = [...new Set((px?.q || []).filter(Boolean))];
  let h = `<div class="vtop"><div class="form">${qs.length ? qs.slice(0, 3).map(esc).join(' <span class="qor">/</span> ') : esc(v.form)}</div>`;
  if (!A.lemmas.length && (lang === 'la' ? S.latMorph : S.morph)) h += '<p class="note">Form not found in the morphological analysis – looking up the form itself.</p>';
  if (A.lemmas.length) {
    const many = A.lemmas.length > 1 || (px?.ana.length || 0) > 1;
    const icons = '';
    // the default reading (lemma and form) is marked (dashed); tapping it goes back to it
    const dflt = tk && (tk.amb || S.tokCh?.has(tk.i));
    h += `<div class="anas">` + A.lemmas.map(x => `<button class="chip${x.lemma === lemma ? ' on' : ''}${dflt && A.lemmas.length > 1 && x.lemma === tk.defL ? ' pre' : ''}" data-lemma="${esc(x.lemma)}"><b>${esc(x.lemma)}</b>${x.ana.length > 1 ? ` <small>${x.ana.length}</small>` : ''}</button>`).join('')
      + (!(tk && px && px.lemma === tk.lemma && px.ana.length) ? icons : '') + '</div>';
    // the forms of the chosen lemma, without the word; what all of them share is written once in front
    if (tk && px && px.lemma === tk.lemma && px.ana.length) {          // also a single form: the reading is always shown
      v.anaList = px.ana;
      const labs = px.ana.map(a => (gramText([a]) || a).split(' '));
      let pre = '', parts = labs.map(l => l.join(' '));
      if (labs.every(l => l.length === labs[0].length && l.length > 1)) {
        const same = labs[0].map((w, i) => labs.every(l => l[i] === w));
        if (same.some(Boolean) && same.some(x => !x)) { pre = labs[0].filter((_, i) => same[i]).join(' '); parts = labs.map(l => l.filter((_, i) => !same[i]).join(' ')); }
      }
      const qd = new Set((px.q || []).filter(Boolean)).size > 1;          // vowel lengths only where they tell the forms apart
      h += '<div class="anarows">' + (pre ? `<span class="pre">${esc(pre)}:</span>` : '') + px.ana.map((a, i) => `<button class="ana${a === tk.ana && (tk.anaSet || !tk.amb) ? ' on' : ''}${dflt && px.lemma === tk.defL && a === tk.defA ? ' pre' : ''}" data-ana="${i}">${qd && px.q[i] ? `<span class="qf">${esc(px.q[i])}</span> ` : ''}${esc(parts[i])}</button>`).join('') + icons + '</div>';
    }
  }
  h += '</div><div id="glossbox" hidden></div>';
  if (typeof pplDictLine === 'function') h += await pplDictLine(lemma, v.ti).catch(() => '');
  const by = await entriesFor(k, lang);
  const ost = await setting('open|' + k);
  const isOpen = id => Array.isArray(ost) ? ost.includes(id) : S.dictPrefs.open.includes(id) !== !!ost?.x?.includes(id);
  const shown = S.shown.filter(d => d.src === lang);
  if (!shown.length) h += `<p class="hint">${S.dicts.some(d => d.src === lang) ? `All ${LANGS[lang]} dictionaries are switched off` : `No ${LANGS[lang]} dictionary installed`} (menu ☰ → Instruments → Dictionaries).</p>`;
  for (const d of shown) {
    let inner = '', has = false;
    const ents = by[d.id] || [];
    if (ents.length) { has = true; for (const e of ents) inner += await renderEntryHTML(e); }
    else if (by[d.id + '#m']) {
      has = true; inner += `<p class="note">No entry of its own – <i>${esc(lemma)}</i> is discussed under:</p>`;
      const seen = new Set();
      for (const ref of by[d.id + '#m']) { const e = await entryByRef(d.id, ref); if (e && !seen.has(d.id + ':' + e.i)) inner += await renderEntryHTML(e, 0, seen); }
    }
    if (!has) inner = '<p class="none">– no entry –</p>';
    inner += `<p class="dbrw"><button type="button" data-dbr="-1" data-d="${d.id}" data-k="${esc(k)}">‹ previous</button><button type="button" data-dbr="ix" data-d="${d.id}" data-k="${esc(k)}">Index</button><button type="button" data-dbr="1" data-d="${d.id}" data-k="${esc(k)}">next ›</button></p>`;   // (990a: page through this dictionary)
    h += `<details class="src${has ? '' : ' empty'}" data-d="${d.id}"${has && (isOpen(d.id) || v.openDict === d.id) ? ' open' : ''}><summary>${esc(d.name)} <small>${esc(d.title || '')}</small></summary>${inner}</details>`;
  }
  body.innerHTML = h;
  body.querySelectorAll('details.src').forEach(el => wrapGreek(el));
  if (lang === 'la') for (const el of body.querySelectorAll('details.src')) await wrapLatin(el);
  await applyHighlights(body);
  fillGlossBox();
  v.skey = scrollKey(v);
  let y = keep ?? (v.scroll != null && v.scrollL === lemma ? v.scroll : null);
  if (y == null) { const st = await setting(v.skey); if (st && st.l === lemma) { y = st.y; v.scroll = y; v.scrollL = lemma; } }
  $('#dictPane').scrollTop = y || 0;
  S.lastRendered = v;
  if (typeof mapIconForView === 'function') mapIconForView();
  requestAnimationFrame(() => requestAnimationFrame(() => { if (S.view === v) S.dictRendering = false; S.tabSw = false; }));
}
async function saveOpenState() {   // remembered per lemma
  if (!S.view?.key) return;
  const x = [...document.querySelectorAll('#dictBody details.src:not(.empty)')].filter(d => d.open !== S.dictPrefs.open.includes(d.dataset.d)).map(d => d.dataset.d);
  await setting('open|' + S.view.key, x.length ? { x } : null);
}

// ---------------------------------------------------------------- lemma list for the current text
// ---- Lemmata: the vocabulary of the open section, with the default glosses (editable here) and an export
function vocabRows() {
  const map = new Map();
  for (const tk of S.tokens || []) {
    if (tk.t !== 'w') continue;
    if (!tk.lemma && tk.s.length > 1 && tk.s === tk.s.toUpperCase()) continue;     // speaker labels (ΣΩ., ΦΑΙ.) and the like
    const l = tk.lemma || canon(tk.s);
    let x = map.get(l); if (!x) map.set(l, x = { lemma: l, key: gkey(l), pos: tk.i, forms: new Set(), n: 0, known: !!tk.lemma });
    x.forms.add(tk.s); x.n++;
  }
  const rows = [...map.values()];
  if (S.listSort === 'alpha') rows.sort((a, b) => a.key.localeCompare(b.key, 'el') || a.lemma.localeCompare(b.lemma));
  else if (S.listSort === 'freq') rows.sort((a, b) => b.n - a.n || a.pos - b.pos);
  else rows.sort((a, b) => a.pos - b.pos);
  return rows;
}
async function renderList() {
  const lb = $('#listBody');
  if (!S.text) { lb.innerHTML = '<p class="hint">No text open.</p>'; return; }
  const all = vocabRows(), none = all.filter(r => !S.lemmaGloss[r.key]).length;
  const rows = S.listFilter === 'nogloss' ? all.filter(r => !S.lemmaGloss[r.key]) : all;
  const chip = (attr, v, cur, l) => `<button data-${attr}="${v}" class="${cur === v ? 'on' : ''}">${l}</button>`;
  const sort = S.listSort || 'pos', flt = S.listFilter || 'all';
  lb.innerHTML = `<div class="lhead"><span class="ln">${all.length} lemmata · ${none} without gloss</span><button class="lexp" data-vexport="1">Export …</button></div>
    <div class="lhead"><span class="seg2">${chip('filter', 'all', flt, 'All')}${chip('filter', 'nogloss', flt, 'No gloss')}</span>
    <span class="seg2">${chip('sort', 'pos', sort, 'Text order')}${chip('sort', 'alpha', sort, 'A–Z')}${chip('sort', 'freq', sort, 'Frequency')}</span></div>`
    + (rows.length ? rows.map(r => `<div class="lrow" data-lemma="${esc(r.lemma)}" data-pos="${r.pos}">
      <div class="lw"><b>${esc(r.lemma)}</b><small>${esc([...r.forms].join(', '))} · ${r.n}×${r.known ? '' : ' · not analysed'}</small></div>
      <textarea class="lg nofocus" rows="1" data-k="${esc(r.key)}" placeholder="– default gloss –" autocomplete="off" spellcheck="false">${esc(S.lemmaGloss[r.key] || '')}</textarea></div>`).join('')
      : '<p class="hint">Every lemma of this section has a default gloss.</p>');
  lb.querySelectorAll('textarea.lg').forEach(t => { if (t.value) autoGrow(t); });     // the empty ones are one line high anyway
}
async function saveListGloss(ta) {
  const k = ta.dataset.k, t = cleanGloss(ta.value);
  if ((S.lemmaGloss[k] || '') === t) return;
  lemmaNameSet(k, ta.closest('.lrow')?.dataset.lemma); await setDefaultGloss(k, t);
  const n = $('#listBody .ln'); if (n) n.textContent = `${vocabRows().length} lemmata · ${vocabRows().filter(r => !S.lemmaGloss[r.key]).length} without gloss`;
  renderText();
}
async function vocabExportDialog() {
  if (!S.text) return;
  const O = S.vocabOpts ??= { fmt: 'pdf', only: false, forms: true };
  const seg = (name, cur, opts) => `<div class="seg segr">${opts.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}"${v === cur ? ' checked' : ''}>${l}</label>`).join('')}</div>`;
  const cb = (n, on, label) => `<label class="sopt"><input type="checkbox" name="${n}"${on ? ' checked' : ''}> ${label}</label>`;
  const r = await dialog(`<h3>Export vocabulary</h3>
    <p class="hint small">${esc(exportTitle())} – the lemmata as listed now (${S.listFilter === 'nogloss' ? 'only those without gloss' : 'all'}, ${({ alpha: 'A–Z', freq: 'by frequency' })[S.listSort] || 'in text order'}).</p>
    <div class="srow"><span class="sl">Format</span><div class="sc">${seg('fmt', O.fmt, [['pdf', 'Printable list'], ['csv', 'Spreadsheet (CSV)'], ['anki', 'Anki flashcards']])}
      <small class="sh">Printable list: the print dialog opens – choose “Save as PDF” (iPad: share icon → Save to Files). Anki: a text file; in Anki choose File → Import.</small></div></div>
    <div class="srow"><span class="sl">Include</span><div class="sc">${cb('only', O.only, 'Only lemmata with a gloss')}${cb('forms', O.forms, 'Forms in the text and how often')}</div></div>`,
    [['cancel', 'Cancel'], ['ok', 'Export']]);
  if (r.action !== 'ok') return;
  Object.assign(O, { fmt: r.data.fmt || 'pdf', only: r.data.only === 'on', forms: r.data.forms === 'on' });
  let rows = vocabRows();
  if (S.listFilter === 'nogloss') rows = rows.filter(x => !S.lemmaGloss[x.key]);
  if (O.only) rows = rows.filter(x => S.lemmaGloss[x.key]);
  if (!rows.length) return toast('No lemmata to export.');
  const title = exportTitle(), gl = x => S.lemmaGloss[x.key] || '', fm = x => [...x.forms].join(', ');
  if (O.fmt === 'pdf') {
    const css = `.vx{font:11pt/1.35 "Gentium Book Plus",serif;color:#000}.vx h1{font-size:15pt;margin:0 0 .8em}
      .vx table{border-collapse:collapse;width:100%}.vx td{padding:.25em .5em .25em 0;vertical-align:top;border-bottom:.5pt solid #ccc}
      .vx td.l{font-weight:700;white-space:nowrap;width:1%}.vx td.f{font:8.5pt/1.3 Arial,sans-serif;color:#666;width:30%}.vx tr{break-inside:avoid}`;
    const html = `<div class="vx"><h1>${esc(title)} – vocabulary</h1><table>${rows.map(x => `<tr><td class="l">${esc(x.lemma)}</td><td>${glossHTML(gl(x))}</td>${O.forms ? `<td class="f">${esc(fm(x))} · ${x.n}×</td>` : ''}</tr>`).join('')}</table></div>`;
    return printHTML(html, css);
  }
  const q = v => /[",;\n\t]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  let body, name, type;
  const base = (title.replace(/[\\/:*?"<>|…]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'text') + ' – vocabulary';
  if (O.fmt === 'csv') {
    body = '﻿' + [['Lemma', 'Gloss', ...(O.forms ? ['Forms', 'Count'] : [])], ...rows.map(x => [x.lemma, gl(x), ...(O.forms ? [fm(x), String(x.n)] : [])])].map(r => r.map(q).join(',')).join('\r\n');
    name = base + '.csv'; type = 'text/csv';
  } else {
    const tag = title.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '').slice(0, 60) || 'Pult';
    const h = t => esc(t).replace(/\n/g, '<br>');
    body = `#separator:tab\n#html:true\n#tags:${tag}\n` + rows.map(x => [h(x.lemma), h(gl(x)) + (O.forms ? `<br><small>${esc(fm(x))}</small>` : '')].join('\t')).join('\n') + '\n';
    name = base + ' (Anki).txt'; type = 'text/plain';
  }
  const href = URL.createObjectURL(new Blob([body], { type: type + ';charset=utf-8' }));
  await dialog(`<h3>Export ready</h3><p>${esc(name)} – ${rows.length} lemmata</p>`, [['link', 'Save file', { href, name }], ['cancel', 'Close']]);
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}
function releaseTabSw() { requestAnimationFrame(() => requestAnimationFrame(() => { S.tabSw = false; clearTimeout(S.tabSwT); })); }
function showTab(which) {
  // leaving the Lemmata list: remember where it was scrolled to (per text), for the way back
  // the pane is shared: while one tab is swapped for the other, its scroll events must not be stored as a position
  const cur = S.tab || ($('#listBody').hidden ? 'entry' : 'list');
  if (cur !== which) { S.tabSw = true; clearTimeout(S.tabSwT); S.tabSwT = setTimeout(() => { S.tabSw = false; }, 1500); }
  S.tab = which;
  $('#tabEntry').classList.toggle('on', which === 'entry'); $('#tabList').classList.toggle('on', which === 'list'); $('#tabMap')?.classList.toggle('on', which === 'map'); $('#tabPeople')?.classList.toggle('on', which === 'people'); $('#tabTempora')?.classList.toggle('on', which === 'tempora');
  $('#dictBody').hidden = which !== 'entry'; $('#listBody').hidden = which !== 'list';
  const mb = $('#mapBody'); if (mb) mb.hidden = which !== 'map';
  const pb = $('#peopleBody'); if (pb) pb.hidden = which !== 'people';
  const tb = $('#temporaBody'); if (tb) tb.hidden = which !== 'tempora';
  $('#dictPane').classList.toggle('mapmode', which === 'map' || which === 'tempora');
  navButtons();
}

// ---------------------------------------------------------------- 990a: browsing a dictionary like the printed book
// From any entry: ‹ previous · Index · next › (in that dictionary's own order of headwords); the index: letters, a field that
// jumps as you type, and the headwords around the place. Each step goes into the history (the pill brings you back).
const DBR = {};                                              // packed key lists, per dictionary
async function dbrKeys(d) { const sig = d.id + ':' + (d.version || d.count); if (DBR[d.id]?.sig !== sig) DBR[d.id] = { sig, P: packKeys((await dictKeys(d)).split('\n').filter(Boolean)) }; return DBR[d.id].P; }
async function showBrowse(dId, k, ix = false) {
  if (S.view) { S.hist.push(S.view); if (S.hist.length > 200) S.hist.shift(); } S.fwd = [];
  S.view = { browse: { d: dId, k, ix }, form: k }; navButtons(); showTab('entry'); await renderView();
}
async function dbrStep(dId, k, dir) { const d = S.dicts.find(x => x.id === dId); if (!d) return; const P = await dbrKeys(d);
  let i = lowerBound(P, k); if (dir > 0 && i < P.n && P.key(i) === k) i++; else if (dir < 0) i--;
  if (i < 0 || i >= P.n) return toast(dir > 0 ? 'The last headword.' : 'The first headword.');
  return showBrowse(dId, P.key(i)); }
async function renderBrowse(v, body) {
  const d = S.dicts.find(x => x.id === v.browse.d); if (!d) { body.innerHTML = '<p class="hint">This dictionary is not installed.</p>'; return; }
  const P = await dbrKeys(d), k = v.browse.k, pos = Math.min(P.n - 1, lowerBound(P, k));
  const bar = `<div class="dbrbar"><button type="button" data-dbr="-1" data-d="${d.id}" data-k="${esc(k)}">‹</button><b>${esc(d.name)}</b> <small class="hint">${esc(d.title || '')}</small>`
    + `<button type="button" data-dbr="ix" data-d="${d.id}" data-k="${esc(k)}">Index</button><button type="button" data-dbr="1" data-d="${d.id}" data-k="${esc(k)}">›</button></div>`;
  if (v.browse.ix) {                                          // the index: letters, a field, the headwords around the place
    const letters = []; let last = ''; for (let i = 0; i < P.n; i += Math.max(1, Math.floor(P.n / 4000))) { const c = P.key(i)[0]; if (c && c !== last && !letters.includes(c)) { letters.push(c); last = c; } }
    const a = Math.max(0, pos - 60), z = Math.min(P.n, pos + 140), rows = [];
    for (let i = a; i < z; i++) rows.push(`<button type="button" class="dbrk${i === pos ? ' on' : ''}" data-dbk="${esc(P.key(i))}" data-d="${d.id}">${esc(P.key(i).replace(/σ(?=$|[^α-ω])/g, 'ς'))}</button>`);
    body.innerHTML = bar + `<div class="dbrlet">${letters.map(c => `<button type="button" data-dbl="${esc(c)}" data-d="${d.id}">${esc(c)}</button>`).join('')}</div>`
      + `<input type="search" class="dbrq" data-d="${d.id}" placeholder="Jump to …" autocomplete="off" autocapitalize="off" spellcheck="false">`
      + `<p class="hint small">${P.n.toLocaleString('en')} headwords · ${a + 1}–${z}</p>`
      + (a > 0 ? `<button type="button" class="dbrmore" data-dbk="${esc(P.key(Math.max(0, a - 100)))}" data-d="${d.id}" data-dbix="1">earlier …</button>` : '')
      + `<div class="dbrlist">${rows.join('')}</div>`
      + (z < P.n ? `<button type="button" class="dbrmore" data-dbk="${esc(P.key(Math.min(P.n - 1, z + 60)))}" data-d="${d.id}" data-dbix="1">later …</button>` : '');
    requestAnimationFrame(() => body.querySelector('.dbrk.on')?.scrollIntoView({ block: 'center' }));
    return;
  }
  const b = await bucket(d, k), ents = (b?.e || []).filter(e => e.k.includes(k)).map(e => Object.assign({ d: d.id }, e)).sort((x, y) => x.i - y.i);
  let inner = ''; for (const e of ents) inner += await renderEntryHTML(e);
  if (!ents.length && b?.m?.[k]) { inner += '<p class="note">No entry of its own – discussed under:</p>'; for (const r of b.m[k]) { const e = await entryByRef(d.id, r); if (e) inner += await renderEntryHTML(e); } }
  body.innerHTML = bar + `<div class="src dbrent" data-d="${d.id}">${inner || '<p class="none">– no entry –</p>'}</div>`
    + `<p class="dbrw"><button type="button" data-dbr="-1" data-d="${d.id}" data-k="${esc(k)}">‹ previous</button><button type="button" data-dbr="all" data-k="${esc(k)}">In all dictionaries</button><button type="button" data-dbr="1" data-d="${d.id}" data-k="${esc(k)}">next ›</button></p>`;
  wrapGreek(body.querySelector('.dbrent')); if (d.src === 'la') await wrapLatin(body.querySelector('.dbrent'));
  await applyHighlights(body);
}
document.addEventListener('click', async ev => {
  const b = ev.target.closest?.('#dictBody [data-dbr],#dictBody [data-dbk],#dictBody [data-dbl]'); if (!b) return;
  ev.preventDefault(); ev.stopPropagation(); const D = b.dataset;
  if (D.dbr === 'ix') return showBrowse(D.d, D.k, true);
  if (D.dbr === 'all') return showWord(D.k);
  if (D.dbr) return dbrStep(D.d, D.k, +D.dbr);
  if (D.dbk) { if (D.dbix) { S.view.browse.k = D.dbk; return renderView(); } return showBrowse(D.d, D.dbk); }
  if (D.dbl) { S.view.browse.k = D.dbl; return renderView(); }
}, true);
document.addEventListener('input', ev => {
  const t = ev.target; if (!t.matches?.('#dictBody .dbrq')) return;
  clearTimeout(t._t); t._t = setTimeout(async () => { const q = gkey(t.value.trim()); if (!q) return; const v = S.view; if (!v?.browse) return; v.browse.k = q; const val = t.value; await renderView(); const f = $('#dictBody .dbrq'); if (f) { f.value = val; f.focus(); } }, 250);
});
