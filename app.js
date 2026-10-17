/* Pult – Wiring up the buttons and gestures (wire), and the start-up (main). Loaded after the other Pult scripts.
   (see core.js for the order of the scripts) */
'use strict';
// ---------------------------------------------------------------- events
function wire() {
  // marking a passage for the export: taps on words set the first and the last word (nothing else happens)
  $('#textBody').addEventListener('click', ev => {
    const p = S.exPick; if (!p) return;
    ev.stopPropagation(); ev.preventDefault();
    const w = ev.target.closest('.w'); if (!w) return;
    const i = +w.dataset.i;
    if (p.a == null || p.b != null) { p.a = i; p.b = null; } else { p.b = i; if (p.b < p.a) [p.a, p.b] = [p.b, p.a]; }
    exportPickPaint();
  }, true);
  document.addEventListener('click', ev => {
    const b = ev.target.closest('#exBar [data-xp]'); if (!b) return;
    const p = S.exPick; S.exPick = null; exportPickPaint();
    if (b.dataset.xp === 'ok' && p?.a != null) { S.exRange = { a: p.a, b: p.b ?? p.a, text: S.text?.id }; exportDialog(); }
  });
  $('#textBody').addEventListener('click', async ev => {
    // tapping a gloss opens its word in the dictionary pane and puts the cursor into the gloss field there
    const dg = ev.target.closest('.gl .dg'), gsp = ev.target.closest('.gl span[data-g]');
    if (dg || gsp) {
      const g = gsp ? S.glosses.find(x => x.id === +gsp.dataset.g) : null;
      const i0 = g ? g.s : +ev.target.closest('.w').dataset.i;
      S.cur = g ? [g.s, g.e] : [i0, i0]; S.curHidden = false; markTarget();
      S.view = null;                                  // always reopen the tapped word
      return openGlossField(dg ? 'def' : 'span');
    }
    const st = ev.target.closest('[data-step]'); if (st) return stepBook(+st.dataset.step);
    const w = ev.target.closest('.w');
    if (!w) { if (!String(window.getSelection())) { S.curHidden = true; markTarget(); } return; }
    S.curHidden = false;
    const i = +w.dataset.i;
    S.cur = [i, i]; markTarget();
    const tk = S.tokens.find(t => t.t === 'w' && t.i === i);
    S.hist = []; S.view = null; await showWord(tk.s, { ti: i });
  });
  let tipT = null, tipShown = false;
  document.addEventListener('pointerdown', ev => { const t = ev.target.closest?.('[data-tip]'); clearTimeout(tipT); tipShown = false; if (t) tipT = setTimeout(() => { tipShown = true; toast(t.dataset.tip, 3500); }, 500); }, true);
  for (const e of ['pointerup', 'pointercancel', 'pointermove']) document.addEventListener(e, ev => { if (e !== 'pointermove' || Math.abs(ev.movementX) + Math.abs(ev.movementY) > 4) clearTimeout(tipT); }, true);
  document.addEventListener('click', ev => { if (tipShown && ev.target.closest?.('[data-tip]')) { ev.stopPropagation(); ev.preventDefault(); tipShown = false; } }, true);
  document.addEventListener('contextmenu', ev => { if (ev.target.closest?.('[data-tip]')) ev.preventDefault(); }, true);
  $('#dictBody').addEventListener('click', async ev => {
    if (ev.target.closest('.tip')) return toast(ev.target.closest('.tip').dataset.tip, 3500);
    const chip = ev.target.closest('.chip');
    if (chip) { if (S.view.ti != null && S.text) return setTokChoice(S.view.ti, chip.dataset.lemma, null); S.view.lemma = chip.dataset.lemma; return renderView(); }
    const an = ev.target.closest('[data-ana]');
    if (an && S.view.ti != null) return setTokChoice(S.view.ti, S.view.pick, S.view.anaList[+an.dataset.ana]);
    if (ev.target.closest('[data-anareset]') && S.view.ti != null) return setTokChoice(S.view.ti, null);
    const pin = ev.target.closest('[data-pin]');
    if (pin) { const tk = S.view.ti != null ? S.tokens.find(t => t.t === 'w' && t.i === S.view.ti) : null;
      await put('choices', Object.assign({ f: canon(S.view.form), lemma: pin.dataset.pin }, tk?.anaSet && tk.lemma === pin.dataset.pin ? { ana: tk.ana } : {})); S.view.lemma = null; const f0 = canon(S.view.form); resetTokens(tk => canon(tk.s) === f0); await renderView(); resolveTokens(); renderText(); return; }
    const gw = ev.target.closest('.gw');
    if (gw && !String(window.getSelection())) return showWord(gw.textContent, { openDict: gw.closest('details.src')?.dataset.d });
  });
  $('#dictBody').addEventListener('change', async ev => {
    const inp = ev.target; const t = cleanGloss(inp.value);
    if (inp.dataset.span) { const [a, b] = inp.dataset.span.split(',').map(Number); await saveSpanGloss(a, b, t); renderText(); toast(t ? 'Gloss saved' : 'Gloss removed'); }
    if (inp.dataset.def) { await setDefaultGloss(inp.dataset.def, t); renderText(); toast(t ? 'Default gloss saved' : 'Default gloss removed'); }
    setTimeout(fillGlossBox, 0);
  });
  $('#dictBody').addEventListener('input', ev => { if (ev.target.matches('#glossbox textarea')) autoGrow(ev.target); });
  // Enter completes a gloss (saved when the field is left); Shift+Enter starts a new line in it
  $('#dictBody').addEventListener('keydown', ev => { if (ev.target.matches('#glossbox textarea') && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); ev.target.blur(); } });
  $('#dictBody').addEventListener('toggle', ev => { if (ev.target.matches?.('details.src')) saveOpenState(); }, true);
  $('#listBody').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-sort]'); if (b) { S.listSort = b.dataset.sort; await renderList(); $('#dictPane').scrollTop = 0; return; }
    const fb = ev.target.closest('[data-filter]'); if (fb) { S.listFilter = fb.dataset.filter; await renderList(); $('#dictPane').scrollTop = 0; return; }
    if (ev.target.closest('[data-vexport]')) return vocabExportDialog();
    if (ev.target.closest('textarea.lg')) return;
    const r = ev.target.closest('.lrow'); if (!r) return;
    const pos = +r.dataset.pos; S.cur = [pos, pos]; S.curHidden = false; markTarget();
    (ensureWord(pos) || document.querySelector(`.w[data-i="${pos}"]`))?.scrollIntoView({ block: 'center', behavior: S.TW ? 'auto' : 'smooth' });
    const tk = S.tokens.find(t => t.t === 'w' && t.i === pos);
    S.hist = []; S.view = null; await showWord(tk.s, { lemma: r.dataset.lemma, ti: pos });
  });
  $('#listBody').addEventListener('input', ev => { if (ev.target.matches('textarea.lg')) autoGrow(ev.target); });
  $('#listBody').addEventListener('change', ev => { if (ev.target.matches('textarea.lg')) saveListGloss(ev.target); });
  $('#listBody').addEventListener('focusout', ev => { if (ev.target.matches('textarea.lg')) saveListGloss(ev.target); });
  $('#listBody').addEventListener('keydown', ev => { if (ev.target.matches('textarea.lg') && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); ev.target.blur(); } });
  $('#textPane').addEventListener('click', ev => { if (ev.target.id === 'textPane') { S.curHidden = true; markTarget(); } });
  new ResizeObserver(setGlossMax).observe($('#textBody'));
  $('#btnBack').onclick = goBack;
  $('#textTitle').onclick = navDialog;
  wireMarker();
  wireReading();
  $('#textPane').addEventListener('scroll', () => {
    clearTimeout(S.posT); S.posT = setTimeout(saveReadPos, 500);
    if (!S.secRaf) S.secRaf = requestAnimationFrame(() => { S.secRaf = 0; updateSecTitle(); });
  }, { passive: true });
  $('#textPane').addEventListener('touchstart', () => { S.tTouch = true; S.tGuard = null; }, { passive: true });
  $('#textPane').addEventListener('touchend', () => { S.tTouch = false; }, { passive: true });
  $('#textPane').addEventListener('wheel', () => { S.tGuard = null; }, { passive: true });
  for (const ev of ['focusin', 'focusout']) $('#dictPane').addEventListener(ev, () => guardText(1200), true);
  $('#dictPane').addEventListener('pointerdown', ev => { if (ev.target.closest('.chip,[data-pin]')) guardText(); }, true);
  window.visualViewport?.addEventListener('resize', () => { const g = S.tGuard; if (g && Date.now() <= g.until && !S.tTouch) requestAnimationFrame(() => applyTextAnchor(g.a)); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveReadPos(); });
  $('#btnFwd').onclick = goFwd;
  $('#tabEntry').onclick = () => {
    if (!$('#dictBody').hidden) return;
    showTab('entry');
    const y = S.view?.scroll || 0; $('#dictPane').scrollTop = y; requestAnimationFrame(() => { $('#dictPane').scrollTop = y; releaseTabSw(); });   // where this entry was left
  };
  $('#tabList').onclick = async () => {
    if (!$('#listBody').hidden) return;
    showTab('list'); await renderList();
    const y = S.listScroll?.id === S.text?.id ? S.listScroll.y : 0;
    $('#dictPane').scrollTop = y; requestAnimationFrame(() => { $('#dictPane').scrollTop = y; releaseTabSw(); });
  };
  // when "Look up a word…" does not fit into the search box, a magnifying glass stands in for it
  { const sb = $('#search'), ph = sb.placeholder, cv = document.createElement('canvas').getContext('2d');
    const fit = () => {
      const cs = getComputedStyle(sb); cv.font = `${cs.fontSize} ${cs.fontFamily}`;
      const room = sb.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const ok = cv.measureText(ph).width + 8 <= room;                 // a little room to spare (Safari draws a bit wider)
      sb.placeholder = ok ? ph : ''; sb.classList.toggle('phicon', !ok);
    };
    // Safari does not count an empty placeholder as shown, so emptiness is marked by a class of its own
    const filled = () => sb.classList.toggle('filled', !!sb.value);
    sb.addEventListener('input', filled); sb.addEventListener('change', filled); filled();
    new ResizeObserver(fit).observe(sb); document.fonts?.ready.then(fit); }
  $('#search').addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.value.trim()) { showWord(ev.target.value.trim()); ev.target.blur(); } });
  $('#btnGlossToggle').onclick = () => setGlossVisible(document.body.classList.contains('nogloss'), true);
  $('#btnGram').onclick = () => { if (S.gramHeld) { S.gramHeld = false; return; } setGram(!S.gram, true); };
  holdButton($('#btnGram'), v => S.gramHeld = v, () => settingsDialog('grammar'));   // hold: Settings → Grammar line
  document.addEventListener('click', ev => {          // joined switches in Settings
    const b = ev.target.closest('[data-setk]'); if (!b) return;
    const k = b.dataset.setk, v = b.dataset.setv;
    b.parentElement.querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    if (k === 'theme') setTheme(v, true);
    if (k === 'glossMode') { S.glossMode = v; setting('glossMode', v); renderText(); }
    if (k === 'textMode') { S.textMode = v; setting('textMode', v); renderText(); }
  });
  $('#btnPos').onclick = async () => { if (S.posHeld) { S.posHeld = false; return; } S.posOn = !S.posOn; await setting('posOn', S.posOn); applyPosColors(); };
  { let t = null; const bp = $('#btnPos');          // hold the Colours button: the list of word-class colours
    bp.addEventListener('pointerdown', () => { S.posHeld = false; clearTimeout(t); t = setTimeout(() => { S.posHeld = true; bp.classList.add('held'); }, 550); });
    bp.addEventListener('pointerup', () => {           // opened only when the finger is lifted: nothing beneath it gets selected
      clearTimeout(t); if (!S.posHeld) return; bp.classList.remove('held');
      setTimeout(() => { window.getSelection()?.removeAllRanges(); settingsDialog('colours'); setTimeout(() => window.getSelection()?.removeAllRanges(), 60); }, 30);   // hold: Settings → Word-class colours
    });
    for (const e of ['pointercancel', 'pointerleave']) bp.addEventListener(e, () => { clearTimeout(t); bp.classList.remove('held'); });
    bp.addEventListener('contextmenu', e => e.preventDefault()); }

  $('#btnSplit').onclick = cycleSplit;
  matchMedia('(orientation:portrait)').addEventListener('change', splitIcon);

  // three-bar menu for everything that is not part of reading itself
  const menu = $('#menu');
  $('#btnMenu').onclick = ev => { ev.stopPropagation(); menu.hidden = !menu.hidden; };
  document.addEventListener('click', ev => { if (!menu.hidden && !ev.target.closest('.menuwrap')) menu.hidden = true; });
  menu.addEventListener('click', ev => {
    const b = ev.target.closest('[data-m]'); if (!b) return;
    menu.hidden = true;
    ({ settings: settingsDialog, texts: importDialog, library: libraryDialog, dicts: dictsDialog, pos: posDialog, backup: pultDialog, pult: pultDialog, export: exportDialog, acks: acksDialog })[b.dataset.m]();
  });
  document.addEventListener('click', async ev => {
    const b = ev.target.closest?.('[data-dict-fold]'); if (!b) return;
    const id = b.dataset.dictFold, o = new Set(S.dictPrefs.open);
    o.has(id) ? o.delete(id) : o.add(id); S.dictPrefs.open = [...o];
    b.textContent = o.has(id) ? '▾' : '▸'; b.classList.toggle('on', o.has(id)); b.title = o.has(id) ? 'Open when a word is looked up' : 'Folded when a word is looked up';
    await setting('dictPrefs', S.dictPrefs); if (S.view) renderView();
  });
  document.addEventListener('change', async ev => {
    const id = ev.target.dataset?.dictOn; if (!id) return;
    const off = new Set(S.dictPrefs.off); ev.target.checked ? off.delete(id) : off.add(id);
    S.dictPrefs.off = [...off]; if (!S.dictPrefs.order.length) S.dictPrefs.order = S.dicts.map(d => d.id);
    await setting('dictPrefs', S.dictPrefs); await loadDicts(); bucketCache.clear(); if (S.view) renderView();
    if (id === 'morph' || id === 'morphhints') { resetTokens(); renderText(); resolveTokens(); }
  });
  document.addEventListener('change', async ev => {
    const t = ev.target, on = t.dataset?.poson, c = t.dataset?.posc; if (!on && !c) return;
    const id = on || c; S.posCfg[id] = Object.assign({}, S.posCfg[id], on ? { on: t.checked } : { c: t.value });
    await setting('posCfg', S.posCfg); applyPosColors();
  });
  document.addEventListener('input', ev => { const c = ev.target.dataset?.posc; if (c) { S.posCfg[c] = Object.assign({}, S.posCfg[c], { c: ev.target.value }); applyPosColors(); } });
  document.addEventListener('click', async ev => {
    if (ev.target.closest('[data-info]')) { const b = ev.target.closest('[data-info]'), t = b.nextElementSibling; t.hidden = !t.hidden; b.setAttribute('aria-expanded', !t.hidden); ev.preventDefault(); return; }
    if (ev.target.closest('[data-posreset]')) { S.posCfg = defaultPosCfg(); await setting('posCfg', S.posCfg); applyPosColors();
      for (const [id] of POS) { const cb = document.querySelector(`[data-poson="${id}"]`), ci = document.querySelector(`[data-posc="${id}"]`); if (cb) cb.checked = true; if (ci) ci.value = S.posCfg[id].c; } }
  });
  document.addEventListener('toggle', ev => { if (ev.target.matches?.('details.sgram')) S.gramOpen = ev.target.open; else if (ev.target.matches?.('details.scol')) S.colOpen = ev.target.open; }, true);
  document.addEventListener('toggle', async ev => { if (!ev.target.matches?.('details.ifold, details.subfold')) return; const f = (await setting('instFold')) || {}; f[ev.target.dataset.if] = ev.target.open; setting('instFold', f); }, true);
  document.addEventListener('change', async ev => {
    const t = ev.target, id = t.dataset?.gramon, g = t.dataset?.gramgrp; if (!id && g == null) return;
    if (id) S.gramCfg[id] = t.checked; else for (const x of GRAM_GROUPS[+g][1]) S.gramCfg[x] = t.checked;
    syncGramRows(); await setting('gramCfg', S.gramCfg); applyGramCfg();
  });
  document.addEventListener('change', ev => { const sl = ev.target.closest?.('select[data-langtool]'); if (sl) setLangTool(sl.dataset.langtool, sl.value); });
  document.addEventListener('change', ev => { const r = ev.target; if (r.dataset?.uselang && r.checked) setLangTool(r.dataset.uselang, r.value); });
  document.addEventListener('change', async ev => {      // settings take effect immediately
    const k = ev.target.dataset?.set; if (!k || (ev.target.type === 'radio' && !ev.target.checked)) return;
    if (k === 'theme') setTheme(ev.target.value, true);
    if (k === 'latQuant') { S.latQuant = ev.target.checked; await setting('latQuant', S.latQuant); renderText(); }
    if (k === 'posOn') { S.posOn = ev.target.checked; await setting('posOn', S.posOn); applyPosColors(); }
    if (k === 'showGram') setGram(ev.target.checked, true);
    if (k === 'glossMode') { S.glossMode = ev.target.value; await setting('glossMode', S.glossMode); renderText(); }
  });
  document.addEventListener('change', ev => { if (ev.target.id === 'optSrcCol') { S.srcColors = ev.target.checked; setting('srcColors', S.srcColors); document.body.classList.toggle('nosrccol', !S.srcColors); } });
  $('#fileDict').onchange = ev => { const fs = [...ev.target.files]; ev.target.value = ''; if (fs.length) importFiles(fs); };
  $('#fileBackup').onchange = ev => { const f = ev.target.files[0]; ev.target.value = ''; if (f) restoreBackup(f); };
  document.addEventListener('change', async ev => {
    if (ev.target.id !== 'fileImport') return;
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
    const fm = $('#dlgForm');
    try {
      if (/\.json$/i.test(f.name)) {
        const j = JSON.parse(await f.text());
        if (j.format === 'greekdict-backup-1') { $('#dlg').close(); return restoreBackup(f); }
        if (j.format === 'greekdict-text-1') { fm.text.value = j.text; if (!fm.title.value) fm.title.value = j.title || ''; return; }
      }
      fm.text.value = await readTextFile(f);
      if (!fm.title.value) fm.title.value = f.name.replace(/\.[^.]+$/, '');
      toast(`${f.name} loaded`);
    } catch (e) { toast(`${f.name}: ${e.message}`, 4000); }
  });
  $('#fileText').onchange = async ev => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
    const raw = await f.text();
    if (f.name.endsWith('.json')) {
      const j = JSON.parse(raw);
      if (j.format === 'greekdict-text-1') return saveText(j.title, j.text, j.choices);
      if (j.format === 'greekdict-backup-1') return restoreBackup(f);
    }
    saveText(f.name.replace(/\.[^.]+$/, ''), raw);
  };
  // selection inside the dictionary -> offer "add as gloss"
  document.addEventListener('pointerdown', e => { S.lastPointer = e.pointerType; }, true);
  wirePencilSelect();
  wireDictScroll();
  if (/Android/i.test(navigator.userAgent) || S.forceTouchSel) { document.body.classList.add('android'); wireTouchSelect(); }
  addEventListener('resize', () => { if (!$('#fabBar').hidden) updateFab(); });
  wireDictDrag();
  document.addEventListener('click', e => { const b = e.target.closest('#dlg [data-get]'); if (b) { if (b.closest('summary')) e.preventDefault(); queueDownload(b.dataset.get); } });
  wireLibrary();
  document.addEventListener('click', ev => { const b = ev.target.closest('#navBody [data-nav]'); if (b) navChoose(b.dataset.nav); });
  wireNav();
  document.addEventListener('selectionchange', () => {
    clearTimeout(S.selT);
    S.selT = setTimeout(() => { S.sel = dictSelection(); if (S.sel) S.lastSel = S.sel.text; updateFab(); }, 60);
  });

  for (const id of ['#fabHl', '#fabGloss', '#fabDefault']) $(id).addEventListener('pointerdown', ev => ev.preventDefault());   // keep the selection
  $('#fabHl').onclick = toggleHighlight;
  const fab = asDefault => { const t = S.lastSel; window.getSelection().removeAllRanges(); S.tsel = null; paintTsel(); S.sel = null; $('#fabBar').hidden = true; addGloss(t, asDefault, true); };
  $('#fabGloss').onclick = () => fab(false);
  $('#fabDefault').onclick = () => fab(true);
  // divider drag; pulled all the way to one side, only the other pane is left (pure reading / pure dictionary);
  // an invisible strip at that edge (#edgeGrab) pulls it back in
  const drag = ev => {
    ev.preventDefault();                         // no text selection while dragging
    const portrait = matchMedia('(orientation:portrait)').matches;
    const r = $('#panes').getBoundingClientRect(), a = textAnchor(), id = ev.pointerId;
    const mv = e => {
      if (e.pointerId !== id) return;
      const x = portrait ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
      const v = x < 0.07 ? 0 : x > 0.93 ? 100 : Math.min(85, Math.max(15, x * 100));
      if (Math.abs(v - parseFloat(getSplit())) < 0.05) return;
      setSplit(v.toFixed(1) + '%', false);
      if (v > 0) applyTextAnchor(a);
    };
    const up = e => { if (e.pointerId !== id) return; removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); setting('split', getSplit()); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  };
  $('#divider').addEventListener('pointerdown', drag);
  $('#edgeGrab').addEventListener('pointerdown', drag);
  $('#edgeGrab').addEventListener('touchmove', e => e.preventDefault(), { passive: false });
}
function setTheme(t, save) {
  document.documentElement.dataset.theme = t;
  if (typeof M !== 'undefined' && M.map) { M.map.setStyle(mapStyle(mapColors())); M.map.once('styledata', () => setTimeout(refreshMapData, 50)); }
  document.querySelector('meta[name=theme-color]').content = t === 'dark' ? '#2a2926' : '#efe9da';
  if (save) setting('theme', t);
}
// grammatical information beneath each word (button in the top bar; whether the button is shown: Settings)
function setGram(on, save) {
  S.gram = on; document.body.classList.toggle('gram', on);
  $('#btnGram').classList.toggle('on', on); $('#btnGram').setAttribute('aria-pressed', on);
  if (save) setting('showGram', on);
}
function applyTopButtons() { $('#btnGram').hidden = !S.gramBtn; }
// "nom sg", "voc sg", "abl sg" -> "nom/voc/abl sg"; otherwise the first reading and how many more
// words that do not inflect: the grammar line names their word class, and their colour follows the same class.
// Order: the treebank reading of this very passage (GLAUx), then the analysis itself (Greek: conj, prep, particle …),
// then the usual class of the lemma (Latin analyses only say "indecl"; Greek ones call e.g. ἀλλά an adverb)
const INDECL_RE = /^(?:indecl|adverb|conj|prep|particle|exclam|numeral)(?:\/(?:adverb|conj|prep|particle|exclam))*$/;
const INDECL_LAB = { adv: 'adverb', prep: 'prep', conj: 'conj', ptcl: 'particle', num: 'numeral' };
const CTX_POS = { c: ['conj', 'conj'], d: ['adv', 'adverb'], g: ['ptcl', 'particle'], r: ['prep', 'prep'], i: ['ptcl', 'exclam'] };
function indeclClass(tk, lemma, g) {
  const m = (g || '').match(/^(.*?)( \+ -\w+)$/);                // Latin enclitic: "indecl + -que"
  if (m) { const r = indeclClass(tk, lemma, m[1]); return r && [r[0], r[1] + m[2]]; }
  if (!g || !INDECL_RE.test(g)) return null;
  if (tk.ctx && lemma && gkey(tk.ctx.l) === gkey(lemma) && CTX_POS[tk.ctx.t?.[0]]) return CTX_POS[tk.ctx.t[0]];
  const one = { conj: 'conj', prep: 'prep', particle: 'ptcl', exclam: 'ptcl' }[g];
  if (one && tk.pos !== 'ptcl') return [one, g];
  if (INDECL_LAB[tk.pos]) return [tk.pos, INDECL_LAB[tk.pos]];
  return g === 'indecl' ? [tk.pos, 'indeclinable'] : null;
}
function gramText(anas) {
  const clean = a => a.replace(/\b(pro|en)clitic\s+/g, '').replace(/^(?:(?:attic|epic|doric|ionic|aeolic|homeric|poetic|later|late|koine|contr|unaugmented)\s+)+(?=\(?indeclform)/i, '')
    .replace(/^\(\s*indeclform\s+(\w+)\s*\)$/, '$1').replace(/indeclform\s*\((\w+)\)/, '$1').replace(/indeclform\s+(\w+)/, '$1').replace(/\s*\((?:attic|epic|doric|ionic|aeolic|homeric|poetic|later|late|koine|contr|unaugmented|[a-z]+ [a-z ]*)\)/gi, '').replace(/\s+/g, ' ').trim();
  const as = [...new Set((anas || []).map(clean).filter(Boolean))];
  if (as.length < 2) return as[0] || '';
  const t = as.map(a => a.split(' '));
  if (t.every(x => x.length === t[0].length)) {
    const diff = t[0].map((_, i) => new Set(t.map(x => x[i])).size > 1);
    if (diff.filter(Boolean).length === 1) { const i = diff.indexOf(true); return t[0].map((w, j) => j === i ? [...new Set(t.map(x => x[i]))].join('/') : w).join(' '); }
  }
  return `${as[0]} (+${as.length - 1})`;
}
function setGlossVisible(on, save) {
  document.body.classList.toggle('nogloss', !on);
  $('#btnGlossToggle').classList.toggle('on', on); $('#btnGlossToggle').setAttribute('aria-pressed', on);
  if (save) setting('showGloss', on);
}
function getSplit() { return document.documentElement.style.getPropertyValue('--split').trim() || '50%'; }
function setSplit(v, save = true) {
  const n = parseFloat(v), cl = document.body.classList, port = matchMedia('(orientation:portrait)').matches;
  const P = $('#panes').style, size = el => (port ? el.offsetHeight : el.offsetWidth) + 'px';
  // a pane that disappears keeps its size (hidden, behind the other one): no new line breaks, the reading position stays
  if (!cl.contains('solo-dict')) P.setProperty('--tw', size($('#textPane')));
  if (!cl.contains('solo-text')) P.setProperty('--dw', size($('#dictPane')));
  cl.toggle('solo-dict', n <= 0.5); cl.toggle('solo-text', n >= 99.5);
  document.documentElement.style.setProperty('--split', v); splitIcon(); setGlossMax();
  if (save) setting('split', v);
}
// split button: bounces 0 (dictionary only) -> 1/3 -> 1/2 -> 2/3 -> 1 (text only) -> 2/3 -> … -> 0 -> 1/3 …
const SPLITS = [0, 100 / 3, 50, 200 / 3, 100];
function cycleSplit() {
  const cur = parseFloat(getSplit());
  const i = SPLITS.reduce((b, x, j) => Math.abs(x - cur) < Math.abs(SPLITS[b] - cur) ? j : b, 2);
  if (i === SPLITS.length - 1) S.splitDir = -1; else if (i === 0) S.splitDir = 1; else S.splitDir = S.splitDir || 1;
  const a = textAnchor(), v = SPLITS[i + S.splitDir];
  setSplit(v.toFixed(3) + '%');
  if (v > 0) { applyTextAnchor(a); requestAnimationFrame(() => applyTextAnchor(a)); }
}
function splitIcon() {   // an open book: the fold sits where the split is, the lines on both pages slope down toward it
  const b = $('#btnSplit'); if (!b) return;
  const f = Math.min(1, Math.max(0, parseFloat(getSplit()) / 100));
  const portrait = matchMedia('(orientation:portrait)').matches;
  const W = 30, H = 20, x0 = 1.5, x1 = W - 1.5, fx = x0 + (x1 - x0) * f, dip = 2;
  const p = [];
  const top = 2.5, bot = 17.5;                                                                   // pitch (bot-top)/5 = 3 exactly
  p.push(`M${x0} ${top} Q${(x0 + fx) / 2} ${top - 1} ${fx} ${top + dip} Q${(fx + x1) / 2} ${top - 1} ${x1} ${top}`);     // top edges
  p.push(`M${x0} ${bot} Q${(x0 + fx) / 2} ${bot - 1} ${fx} ${bot + dip} Q${(fx + x1) / 2} ${bot - 1} ${x1} ${bot}`);     // bottom edges
  p.push(`M${x0} ${top} V${bot} M${x1} ${top} V${bot} M${fx} ${top + dip} V${bot + dip}`);                                // outer edges + fold
  // text lines: the page-edge curve shifted down in equal steps (trimmed a little at both ends)
  const sub = (P0, P1, P2, t0, t1) => {          // part t0..t1 of a quadratic Bézier, again as a quadratic Bézier
    const at = t => [0, 1].map(k => (1 - t) ** 2 * P0[k] + 2 * (1 - t) * t * P1[k] + t * t * P2[k]);
    const dt = t => [0, 1].map(k => 2 * (1 - t) * (P1[k] - P0[k]) + 2 * t * (P2[k] - P1[k]));
    const A = at(t0), B = at(t1), dA = dt(t0), h = (t1 - t0) / 2;
    return [A, [A[0] + dA[0] * h, A[1] + dA[1] * h], B];
  };
  const q = ([A, C, B]) => `M${A[0].toFixed(2)} ${A[1].toFixed(2)} Q${C[0].toFixed(2)} ${C[1].toFixed(2)} ${B[0].toFixed(2)} ${B[1].toFixed(2)}`;
  const n = 4;
  for (let i = 1; i <= n; i++) {
    const dy = (bot - top) * i / (n + 1);
    // a narrow page keeps its lines; they only get shorter, down to dots (round caps)
    p.push(q(sub([x0, top + dy], [(x0 + fx) / 2, top - 1 + dy], [fx, top + dip + dy], 0.12, 0.9)));
    p.push(q(sub([fx, top + dip + dy], [(fx + x1) / 2, top - 1 + dy], [x1, top + dy], 0.1, 0.88)));
  }
  const g = `<path d="${p.join(' ')}" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>`;
  b.innerHTML = portrait
    ? `<svg width="${(H * 0.75).toFixed(1)}" height="${(W * 0.75).toFixed(1)}" viewBox="0 0 ${H} ${W}" aria-hidden="true"><g transform="translate(${H} 0) rotate(90)">${g}</g></svg>`
    : `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${g}</svg>`;
  const pct = Math.round(f * 100);
  b.title = `${pct < 1 ? 'Dictionary only' : pct > 99 ? 'Text only' : 'Text ' + (pct < 40 ? '1/3' : pct > 60 ? '2/3' : '1/2')} – tap to change the split`;
}

(async function main() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
  // the map scripts (maps.js, maplayers.js, mapsaved.js) load after this one: wait until all of them have run,
  // otherwise opening the last text could reach the map code while one of them is still on its way (slow connections)
  if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
  db = await openDB();
  await migrateOld();
  wire();
  setTheme((await setting('theme')) || 'dark');
  S.glossMode = (await setting('glossMode')) || 'replace';
  S.latQuant = !!(await setting('latQuant'));
  S.textMode = (await setting('textMode')) || 'window';
  for (const r of await getAll('settings', IDBKeyRange.bound('lg|', 'lg|\uffff'))) S.lemmaGloss[r.k.slice(3)] = r.v;
  await loadDicts();
  setGlossVisible((await setting('showGloss')) !== false);
  S.gramBtn = true; applyTopButtons();          // (the Grammar button is always shown)
  setGram(!!(await setting('showGram')));
  if (typeof applyMapsOn === 'function') applyMapsOn();
  const sp = await setting('split'); setSplit(sp || '50%', false);
  setTextZoom((await setting('textZoom')) || 1);
  S.srcColors = (await setting('srcColors')) !== false; document.body.classList.toggle('nosrccol', !S.srcColors);
  S.posCfg = Object.assign(defaultPosCfg(), (await setting('posCfg')) || {});
  S.posOn = !!(await setting('posOn')); applyPosColors();
  S.gramCfg = Object.assign(defaultGramCfg(), (await setting('gramCfg')) || {}); applyGramCfg();
  const cur = await setting('currentText');
  if (cur != null) await openText(cur);
  if (!S.dicts.length) $('#dictBody').innerHTML = '<p class="hint">Welcome! <button id="btnFirstSync">Download the free dictionaries</button> (Greek: Pape, LSJ and morphology; Latin: Lewis &amp; Short, Georges and Collatinus – about 60 MB). More dictionaries: ☰ → Instruments → Dictionaries. Then get a text via ☰ → Library, or import your own via ☰ → Import text.</p>';
  $('#btnFirstSync')?.addEventListener('click', () => syncPackages());
  navigator.storage?.persist?.().catch(() => { });
})();
