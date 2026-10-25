/* Pult – People (v422): persons from encyclopaedias and prosopographies (packages of kind "people"; for now William Smith's
   Dictionary of Greek and Roman Biography and Mythology), the People tab, and the marks on their names in the text.
   A package keeps its persons by number ("p:<n>", 64 each), an index of all names ("#ix": names -> numbers, and a short line
   per person) and, per library work, the passages where a person is cited ("w:<work>").
   Decisions 681–687, 732–737: every person goes in, marked by kinds (deity, hero, Homeric …) the reader may change; the
   sources of a person are shown separately, as in the dictionary; marks with a switch (Colours menu), unsure ones to check.
   (see core.js for the order of the scripts) */
'use strict';
const PP = { ix: new Map(), rec: new Map(), view: null, back: [], q: '' };
const PKINDS = ['deity', 'hero', 'Homeric', 'ruler', 'magistrate', 'military', 'author', 'philosopher', 'artist', 'physician', 'Christian', 'woman', 'family'];
const pplPkgs = () => Object.values(S.installed || {}).filter(d => d.kind === 'people' && !S.dictPrefs?.off?.includes(d.id)).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
async function pplRec(d, name) {               // one record of a package (cached: the index is read once)
  const id = d.id + '|' + d.version + '|' + name;
  if (PP.rec.has(id)) return PP.rec.get(id);
  const ddb = await dictDB(d.id), r = await req2p(ddb.transaction('b').objectStore('b').get(name)) || null;
  if (name !== '#ix') { if (PP.rec.size > 80) PP.rec.delete([...PP.rec.keys()].find(k => !k.endsWith('|#ix'))); }
  PP.rec.set(id, r); return r;
}
const pplIx = d => pplRec(d, '#ix');
async function pplEntry(d, i) { const r = await pplRec(d, 'p:' + (i >> 6)); return r?.e?.find(e => e.i === i) || null; }
const pref = (d, i) => d.id + '|' + i;
function pplParse(ref) { const j = ref.lastIndexOf('|'); return { d: S.installed?.[ref.slice(0, j)], i: +ref.slice(j + 1) }; }
// the short line of a person (from the index): name, number among those of the name, description, kinds, years, "see"
async function pplRow(d, i) { const ix = await pplIx(d), p = ix?.p?.[i]; if (!p) return null;
  const own = await setting('pk|' + pref(d, i));
  return { d, i, ref: pref(d, i), name: p[0], no: p[1], desc: p[2], kinds: own || (p[3] ? p[3].split(',') : []), y0: p[4], y1: p[5], see: p[6], ownKinds: !!own }; }
async function personsFor(k) {                  // all persons with the key, of all packages
  const out = [];
  for (const d of pplPkgs()) { const ix = await pplIx(d); for (const i of ix?.n?.[k] || []) out.push(pref(d, i)); }
  return out;
}
const MYTHK = new Set(['deity', 'hero', 'Homeric']);      // (years an article mentions say nothing of a god's life)
const capital = s => { const c = String(s || '').normalize('NFD')[0] || ''; return c !== c.toLowerCase(); };
const yearTxt = y => y == null ? '' : y < 0 ? `${-y} BC` : `AD ${y}`;
const yearsTxt = (a, b) => a == null ? '' : a === b ? yearTxt(a) : (a < 0 && b < 0 ? `${-a}–${-b} BC` : a > 0 ? `AD ${a}–${b}` : `${yearTxt(a)} – ${yearTxt(b)}`);

// ---------------------------------------------------------------- the names in the open text
// S.prs: Map(word index -> {k, cands: [ref], pick: ref|null, sure, why})
// certain: chosen by the reader; cited by the source at this place; the only person of the name; the only one of the name
// cited in this work. Otherwise unsure (dotted) – "to check".
async function personsForText() {
  const t = S.text, run = personsForText.run = (personsForText.run || 0) + 1;
  S.prs = new Map();
  const pk = pplPkgs();
  if (!t || !pk.length) { markPersons(); return; }
  const fix = (await setting('prs|' + workKeyOfText(t))) || { k: {}, t: {} };
  const cited = new Set(), here = new Map();               // persons cited in this work; reference -> persons cited there
  if (t.work) for (const d of pk) {
    const r = await pplRec(d, 'w:' + t.work.id);
    for (const [bi, ref, i] of r?.r || []) { cited.add(pref(d, i)); if (bi === t.bi) { if (!here.has(ref)) here.set(ref, new Set()); here.get(ref).add(pref(d, i)); } }
  }
  const R = S.refs || [], near = new Map();               // word index -> persons cited in its section (verse: two lines either side)
  if (here.size) R.forEach((r, j) => { const set = new Set(); for (let x = Math.max(0, j - (R.verse ? 2 : 0)); x <= Math.min(R.length - 1, j + (R.verse ? 2 : 0)); x++) for (const p of here.get(R[x].s) || []) set.add(p);
    if (set.size) near.set(j, set); });
  const memo = new Map(); let rj = -1, start = true;
  for (const tk of S.tokens) {
    if (tk.t === 'b') { if (tk.k !== 'l' && tk.k !== 'L') start = true; continue; }   // (a verse line is no new sentence)
    if (tk.t === 'p') { if (/[.!?;:·]/.test(tk.s)) start = true; continue; }
    if (tk.t !== 'w') continue;
    const st = start; start = false;
    while (rj + 1 < R.length && R[rj + 1].i <= tk.i) rj++;
    const lem = tk.lemma || null;
    if (lem ? !capital(lem) : !capital(tk.s)) continue;     // names only (a lemma in small letters is a common word)
    if (tk.ana && /\bpl\b|plur/.test(tk.ana)) continue;       // "the Athenians": a people, not Athenaeus
    let k = gkey(lem || tk.s), cands = memo.get(k);
    if (!cands) { cands = await personsFor(k); if (!cands.length && lem && gkey(tk.s) !== k) { k = gkey(tk.s); cands = await personsFor(k); } memo.set(k, cands); }
    if (!cands.length) continue;
    const ft = fix.t?.[t.bi + ':' + tk.i] ?? fix.t?.[tk.i], fk = fix.k?.[k];
    let pick = null, sure = false, why = '';
    if (ft === 0 || (ft == null && fk === 0)) continue;     // "not a person"
    if (ft || fk) { pick = ft || fk; sure = true; why = 'chosen by you'; }
    else {
      const nh = near.get(rj), c1 = nh ? cands.filter(c => nh.has(c)) : [];
      const cw = cands.filter(c => cited.has(c));
      if (c1.length === 1) { pick = c1[0]; sure = true; why = 'cited by the source at this place'; }
      else if (!lem && st) continue;                          // no lemma, at the start of a sentence: "Mene …" is no name
      else if (cands.length === 1) { pick = cands[0]; sure = true; why = 'the only person of this name'; }
      else if (cw.length === 1) { pick = cw[0]; sure = true; why = 'the only one of this name cited in this work'; }
      else why = `${cands.length} persons of this name`;
    }
    S.prs.set(tk.i, { k, cands, pick, sure, why });
    if (run !== personsForText.run) return;
  }
  if (run !== personsForText.run) return;
  markPersons();
  if (S.tab === 'people' && (!PP.view || PP.view.t === 'text')) pplRender();
}
const workKeyOfText = t => t?.work ? t.work.id : 'imp:' + t?.id;
async function prsMarkOn() { return (S.prsMark ??= (await setting('prsMark')) ?? true); }
function markPersons() {
  document.querySelectorAll('#textBody .w.prs').forEach(e => e.classList.remove('prs', 'prsq'));
  if (S.prsMark === false || !S.wordEls || !S.prs) return;
  for (const [i, h] of S.prs) { const e = S.wordEls[i]; if (!e) continue; e.classList.add('prs'); if (!h.sure) e.classList.add('prsq'); }
}
function markPersonsIn(c) {                       // a part of a long text just drawn (text.js chDecorate)
  if (S.prsMark === false || !S.prs?.size) return;
  for (let i = c.w0; i <= c.w1; i++) { const h = S.prs.get(i); if (!h) continue; const e = S.wordEls[i]; e?.classList.add('prs'); if (!h.sure) e?.classList.add('prsq'); }
}
document.addEventListener('change', async ev => {      // Settings → Reading → Colourisation: the switch for the marks
  if (ev.target.dataset?.prsmark == null) return;
  S.prsMark = ev.target.checked; await setting('prsMark', S.prsMark); markPersons();
});

// ---------------------------------------------------------------- the People tab
// views: {t:'text'} the names of the open text (to check first) · {t:'person', ref} · {t:'search', q} · {t:'name', k, ti} the persons of a name
function pplGo(v, push = true) { if (push && PP.view) { PP.back.push(PP.view); if (PP.back.length > 60) PP.back.shift(); } PP.view = v; pplRender(); $('#dictPane').scrollTop = 0; }
function pplWordTapped(ti) {                     // a word tapped while the People tab is open: its person here, the entry behind
  const h = S.prs?.get(ti); if (!h) return false;
  pplGo(h.pick ? { t: 'person', ref: h.pick, ti } : { t: 'name', k: h.k, ti });
  return true;
}
async function showPeople() { showTab('people'); if (!PP.view) PP.view = { t: 'text' }; await pplRender(); }
async function pplRender() {
  const body = $('#peopleBody'); if (!body) return;
  const v = PP.view || (PP.view = { t: 'text' });
  const pk = pplPkgs();
  let h = `<div class="pptop">${PP.back.length ? '<button type="button" class="ppback" data-ppback="1" aria-label="Back">‹</button>' : ''}<input id="pplQ" type="search" placeholder="Find a person …" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(v.t === 'search' ? v.q : '')}">`
    + `${v.t !== 'text' ? '<button type="button" data-pptext="1" class="pptxt">In this text</button>' : ''}</div>`;
  if (!pk.length) { body.innerHTML = h + `<p class="hint">No people package installed yet. Open the menu ☰ → Instruments → People and download “William Smith, A Dictionary of Greek and Roman Biography and Mythology”.</p>`; return; }
  if (v.t === 'person') h += await pplPersonHTML(v.ref, v.ti);
  else if (v.t === 'search') h += await pplSearchHTML(v.q);
  else if (v.t === 'name') h += await pplNameHTML(v.k, v.ti);
  else h += await pplTextHTML();
  body.innerHTML = h;
  if (v.t === 'person') { body.querySelectorAll('details.src').forEach(el => wrapGreek(el)); }
  if (v.t === 'search') { const q = $('#pplQ'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}
const kindChips = (r, edit) => `<span class="ppkinds">${r.kinds.map(k => `<span class="ppk">${esc(k)}</span>`).join('')}${edit ? `<button type="button" class="ppkedit" data-ppkinds="${esc(r.ref)}" title="Change the kinds">${r.kinds.length ? 'edit' : '+ kind'}</button>` : ''}</span>`;
const rowHTML = (r, extra = '') => `<button type="button" class="pprow" data-ppref="${esc(r.ref)}"><span class="ppn"><b>${esc(r.name)}</b>${r.no ? ` <small>${r.no}</small>` : ''}${r.y0 != null && !r.kinds.some(k => MYTHK.has(k)) ? ` <small class="ppy">${yearsTxt(r.y0, r.y1)}</small>` : ''}</span><span class="ppd">${esc(r.desc || '')}</span>${r.kinds.length ? kindChips(r) : ''}${extra}</button>`;
async function pplTextHTML() {
  const t = S.text; if (!t) return '<p class="hint">Open a text: the persons named in it are listed here.</p>';
  const by = new Map();
  for (const [i, x] of S.prs || []) { const id = x.pick || '?' + x.k; let g = by.get(id); if (!g) by.set(id, g = { x, is: [] }); g.is.push(i); }
  if (!by.size) return `<p class="hint">No names of persons found in this part${S.morph || S.latMorph ? '' : ' (the names are recognised from the lemmata – install the morphological analysis: ☰ → Instruments → Analysis)'}.</p>`;
  const unsure = [], sure = [];
  for (const [id, g] of by) (g.x.pick ? sure : unsure).push([id, g]);
  const occ = g => `<span class="ppocc">${g.is.slice(0, 12).map(i => `<button type="button" data-ppjump="${i}">${esc(refAt(i) || '·')}</button>`).join('')}${g.is.length > 12 ? `<small>+${g.is.length - 12}</small>` : ''}</span>`;
  let h = '';
  if (unsure.length) {
    h += `<div class="navh3">To check <small>${unsure.length}</small></div><div class="list plain">`;
    for (const [, g] of unsure.sort((a, b) => a[1].is[0] - b[1].is[0])) {
      const tk = S.tokens.find(x => x.t === 'w' && x.i === g.is[0]);
      h += `<div class="ppchk"><button type="button" class="pprow" data-ppname="${esc(g.x.k)}" data-ti="${g.is[0]}"><span class="ppn"><b>${esc(tk?.lemma || tk?.s || g.x.k)}</b></span><span class="ppd">${esc(g.x.why)} – choose</span></button>${occ(g)}</div>`;
    }
    h += '</div>';
  }
  if (sure.length) {
    h += `<div class="navh3">Named in this part <small>${sure.length}</small></div><div class="list plain">`;
    const rows = [];
    for (const [id, g] of sure) { const { d, i } = pplParse(id); const r = d && await pplRow(d, i); if (r) rows.push([r, g]); }
    rows.sort((a, b) => a[1].is[0] - b[1].is[0]);
    for (const [r, g] of rows) h += `<div class="ppchk">${rowHTML(r, `<span class="ppwhy">${esc(g.x.why)}</span>`)}${occ(g)}</div>`;
    h += '</div>';
  }
  return h;
}
async function pplNameHTML(k, ti) {             // the persons of a name: choose one (for this work, or this place only)
  const cands = await personsFor(k), rows = [];
  for (const c of cands) { const { d, i } = pplParse(c); const r = await pplRow(d, i); if (r) rows.push(r); }
  const tk = ti != null ? S.tokens.find(x => x.t === 'w' && x.i === ti) : null, h0 = ti != null ? S.prs?.get(ti) : null;
  let h = `<div class="pphead"><div class="ppname">${esc(tk?.lemma || tk?.s || k)}</div><div class="ppmeta">${rows.length} person${rows.length === 1 ? '' : 's'} of this name${tk ? ` · at ${esc(refAt(ti) || '')}` : ''}</div></div>`;
  if (tk) h += `<p class="hint small">Choose who is meant: “this one” for every <i>${esc(tk.lemma || tk.s)}</i> in this work, “here only” for this place. ${h0?.pick ? '' : ''}</p>`;
  h += '<div class="list plain">';
  for (const r of rows) h += `<div class="ppchk">${rowHTML(r)}${tk ? `<span class="ppchoose"><button type="button" data-ppfix="${esc(r.ref)}" data-k="${esc(k)}">This one</button><button type="button" data-ppfix="${esc(r.ref)}" data-k="${esc(k)}" data-ti="${ti}">Here only</button></span>` : ''}</div>`;
  h += '</div>';
  if (tk) h += `<div class="ppnot"><button type="button" data-ppfix="0" data-k="${esc(k)}">Not a person</button><button type="button" data-ppfix="0" data-k="${esc(k)}" data-ti="${ti}">Not a person here</button>${h0 && (h0.why === 'chosen by you') ? `<button type="button" data-ppfix="" data-k="${esc(k)}" data-ti="${ti}">Undo my choice</button>` : ''}</div>`;
  return h;
}
async function pplSearchHTML(q) {
  const k = gkey(q); if (!k) return '';
  const hits = [];
  for (const d of pplPkgs()) { const ix = await pplIx(d); if (!ix) continue;
    for (const key of Object.keys(ix.n)) if (key.startsWith(k)) for (const i of ix.n[key]) hits.push({ d, i, exact: key === k, key }); }
  if (!hits.length) return `<p class="hint">No person found for “${esc(q)}”.</p>`;
  hits.sort((a, b) => b.exact - a.exact || a.key.length - b.key.length || a.key.localeCompare(b.key) || a.i - b.i);
  const seen = new Set(), rows = [];
  for (const x of hits) { const id = pref(x.d, x.i); if (seen.has(id)) continue; seen.add(id); if (rows.length >= 150) break; const r = await pplRow(x.d, x.i); if (r) rows.push(rowHTML(r)); }
  return `<div class="navh3">${seen.size >= 150 ? '150+' : seen.size} person${seen.size === 1 ? '' : 's'}</div><div class="list plain">${rows.join('')}</div>`;
}
async function pplPersonHTML(ref, ti) {
  const { d, i } = pplParse(ref); if (!d) return '<p class="hint">This person’s package is not installed.</p>';
  const e = await pplEntry(d, i), r = await pplRow(d, i); if (!e || !r) return '<p class="hint">Not found.</p>';
  const h0 = ti != null ? S.prs?.get(ti) : null;
  let h = `<div class="pphead"><div class="ppname">${esc(e.h)}${r.no ? ` <small>${r.no}</small>` : ''}</div>${e.g ? `<div class="ppgreek gk">${esc(e.g)}</div>` : ''}`
    + `<div class="ppmeta">${r.y0 != null ? `<span title="the years the article mentions">years mentioned: ${yearsTxt(r.y0, r.y1)}</span> · ` : ''}${kindChips(r, true)}${r.ownKinds ? ' <small class="hint">(your kinds)</small>' : ''}</div>`
    + (h0 ? `<div class="ppat">${h0.sure ? `Marked in the text: ${esc(h0.why)}.` : 'Not yet certain in the text.'} <button type="button" data-ppname="${esc(h0.k)}" data-ti="${ti}">${h0.cands.length > 1 ? 'Someone else?' : 'Not this person?'}</button></div>` : '')
    + '</div>';
  // the sources, each by itself (as in the dictionary): the encyclopaedia, then the Suda under the person's Greek names
  h += `<details class="src" open data-pd="${d.id}"><summary>${esc(d.name)} <small>${esc(d.title || '')}</small></summary><div class="ent"><div class="eb">${e.html}</div></div></details>`;
  const suda = S.installed?.suda, gks = (e.k || []).filter(isGreek);
  if (suda) {
    let inner = '', n = 0;
    for (const k of gks) { const b = await bucket(suda, k); for (const x of (b?.e || []).filter(x => x.k.includes(k)).sort((a, b) => a.i - b.i)) { inner += await renderEntryHTML(Object.assign({ d: 'suda' }, x)); n++; } }
    h += `<details class="src${n ? '' : ' empty'}" data-pd="suda"${n && n <= 3 ? ' open' : ''}><summary>${esc(suda.name)} <small>${n ? n + ' entr' + (n === 1 ? 'y' : 'ies') + ' under ' + gks.map(esc).join(', ') : gks.length ? '– no entry –' : '– no Greek name –'}</small></summary>${inner}</details>`;
  }
  // the passages of the library where the source cites the person
  const ps = e.ps || [];
  if (ps.length) {
    if (!S.catWork) await cachedCatalog();
    const inst = new Set((await libWorks()).map(w => w.id)), byW = new Map();
    for (const p of ps) { if (!byW.has(p[0])) byW.set(p[0], []); byW.get(p[0]).push(p); }
    let inner = '';
    for (const [wid, list] of byW) {
      const w = S.catWork?.[wid];
      inner += `<div class="ppw"><div class="ppwt">${esc(w ? `${w.author}, ${w.title}` : wid)}${inst.has(wid) ? '' : ' <small class="hint">not on this device – tap a place to download</small>'}</div><div class="ppocc">`
        + list.map(p => `<button type="button" data-pppass="${esc(wid)}" data-bi="${p[1]}" data-r="${esc(p[2])}" data-ref="${esc(ref)}" title="${esc(p[3])}">${esc(p[3].replace(/^\S+\s+(?:\S+\.\s+)?/, ''))}</button>`).join('') + '</div></div>';
    }
    h += `<details class="src ppass" open><summary>Passages in the library <small>${ps.length} cited by ${esc(d.name.split(',')[0])}</small></summary>${inner}</details>`;
  }
  // others of the same name
  const others = []; for (const k of (e.k || []).slice(0, 1)) for (const c of await personsFor(k)) if (c !== ref) { const x = pplParse(c), rr = await pplRow(x.d, x.i); if (rr) others.push(rowHTML(rr)); }
  if (others.length) h += `<details class="src"><summary>Others named ${esc(e.h.split(/[ ,]/)[0])} <small>${others.length}</small></summary><div class="list plain">${others.join('')}</div></details>`;
  return h;
}
// the kinds of a person (735A): the reader's own choice is kept (and goes into the backup)
async function pplKindsDialog(ref) {
  const { d, i } = pplParse(ref), r = await pplRow(d, i); if (!r) return;
  const res = await dialog(`<h3>Kinds – ${esc(r.name)}${r.no ? ' ' + r.no : ''}</h3><p class="hint small">Guessed from the first lines of the article; several may apply.</p><div class="ppkdlg">`
    + PKINDS.map(k => `<label class="sopt"><input type="checkbox" name="k_${k}"${r.kinds.includes(k) ? ' checked' : ''}> ${esc(k)}</label>`).join('') + '</div>',
    [['reset', 'As guessed'], ['cancel', 'Cancel'], ['ok', 'Save']]);
  if (res.action === 'reset') await del('settings', 'pk|' + ref);
  else if (res.action === 'ok') await setting('pk|' + ref, PKINDS.filter(k => res.data['k_' + k] === 'on'));
  else return;
  pplRender();
}
async function pplFix(ref, k, ti) {                // the reader's choice: a person (ref), not a person (0), or undone ('')
  const t = S.text; if (!t) return;
  const key = 'prs|' + workKeyOfText(t), fx = (await setting(key)) || { k: {}, t: {} };
  fx.k ??= {}; fx.t ??= {};
  const v = ref === '' ? undefined : ref === '0' ? 0 : ref;
  if (ti != null) { const tk = t.bi + ':' + ti; if (v === undefined) delete fx.t[tk]; else fx.t[tk] = v; if (v === undefined) delete fx.k[k]; }
  else if (v === undefined) delete fx.k[k]; else fx.k[k] = v;
  await setting(key, fx);
  await personsForText();
  if (v && v !== 0) pplGo({ t: 'person', ref: v, ti }, false); else pplGo({ t: 'text' }, false);
}
async function pplPassage(wid, bi, r, personRef) {  // open a cited place: the work at that section, the name there selected
  if (!(await libGet('works', wid))) {
    if (!S.catWork?.[wid]) return toast('This work is not in the catalogue.');
    note('Downloading ' + S.catWork[wid].title + ' …');
    try { await downloadWork('work:' + wid); } catch (e) { return toast('Download failed: ' + e.message, 4000); }
  }
  if (S.text?.id !== `w:${wid}:${bi}`) await openText(`w:${wid}:${bi}`, false);
  const R = S.refs || [], j = R.findIndex(x => x.s === r); if (j < 0) return toast('Place not found: ' + r);
  const end = R[j + 1]?.i ?? Infinity; let i = R[j].i;
  const { d, i: pi } = pplParse(personRef), e = d && await pplEntry(d, pi), ks = new Set(e?.k || []);
  const lo = R[Math.max(0, j - (R.verse ? 2 : 0))].i, hi = R.verse ? (R[j + 3]?.i ?? Infinity) : end;
  for (let n = 0; n < 40 && S.tokens.some(tk => tk.t === 'w' && tk.i >= lo && tk.i < hi && tk.lemma === undefined); n++) await new Promise(r => setTimeout(r, 100));   // (the lemmata of the part just opened)
  const hit = S.tokens.find(tk => tk.t === 'w' && tk.i >= lo && tk.i < hi && (ks.has(gkey(tk.lemma || '')) || ks.has(gkey(tk.s))));
  if (hit) i = hit.i;
  S.cur = [i, i]; S.curHidden = false; markTarget();
  requestAnimationFrame(() => scrollToWord(i));
}
document.addEventListener('click', ev => {
  if (!ev.target.closest?.('#peopleBody')) return;
  const t = ev.target;
  const b = t.closest('[data-ppback]'); if (b) { PP.view = PP.back.pop() || { t: 'text' }; pplRender(); return; }
  if (t.closest('[data-pptext]')) return pplGo({ t: 'text' });
  const ke = t.closest('[data-ppkinds]'); if (ke) return pplKindsDialog(ke.dataset.ppkinds);
  const fx = t.closest('[data-ppfix]'); if (fx) return pplFix(fx.dataset.ppfix, fx.dataset.k, fx.dataset.ti != null ? +fx.dataset.ti : null);
  const nm = t.closest('[data-ppname]'); if (nm) return pplGo({ t: 'name', k: nm.dataset.ppname, ti: nm.dataset.ti != null ? +nm.dataset.ti : null });
  const ps = t.closest('[data-pppass]'); if (ps) return pplPassage(ps.dataset.pppass, +ps.dataset.bi, ps.dataset.r, ps.dataset.ref);
  const j = t.closest('[data-ppjump]'); if (j) { const i = +j.dataset.ppjump; S.cur = [i, i]; S.curHidden = false; markTarget(); requestAnimationFrame(() => scrollToWord(i)); return; }
  const xr = t.closest('a.pxr'); if (xr) { (async () => {             // Smith's cross-references: [PARIS.]
    const k = gkey(xr.dataset.x), cs = await personsFor(k);
    if (xr.dataset.no) for (const c of cs) { const x = pplParse(c), r = await pplRow(x.d, x.i); if (r && String(r.no) === xr.dataset.no) return pplGo({ t: 'person', ref: c }); }
    if (cs.length === 1) return pplGo({ t: 'person', ref: cs[0] });
    pplGo({ t: 'search', q: xr.dataset.x });
  })(); return; }
  const row = t.closest('[data-ppref]'); if (row) return pplGo({ t: 'person', ref: row.dataset.ppref });
});
document.addEventListener('input', ev => {
  if (ev.target.id !== 'pplQ') return;
  clearTimeout(PP.qt); const q = ev.target.value;
  PP.qt = setTimeout(() => { if (!q.trim()) { if (PP.view?.t === 'search') { PP.view = PP.back.pop() || { t: 'text' }; pplRender(); } return; }
    if (PP.view?.t === 'search') { PP.view.q = q; pplRender(); } else pplGo({ t: 'search', q }); }, 220);
});
// the dictionary: a line naming the persons of the word looked up (to the People tab)
async function pplDictLine(lemma, ti) {
  if (!pplPkgs().length || !capital(lemma)) return '';
  const h0 = ti != null ? S.prs?.get(ti) : null;
  const k = h0?.k || gkey(lemma), cs = h0?.cands || await personsFor(k); if (!cs.length) return '';
  if (h0?.pick) { const x = pplParse(h0.pick), r = await pplRow(x.d, x.i);
    if (r) return `<div class="ppline"><span class="ppl1">Person</span><button type="button" data-ppopen="${esc(h0.pick)}" data-ti="${ti}"><b>${esc(r.name)}</b>${r.no ? ' ' + r.no : ''} – ${esc(r.desc)}</button>${cs.length > 1 ? `<button type="button" data-ppopenk="${esc(k)}" data-ti="${ti ?? ''}" class="ppmore">${cs.length - 1} other${cs.length > 2 ? 's' : ''}</button>` : ''}</div>`; }
  return `<div class="ppline"><span class="ppl1">People</span><button type="button" data-ppopenk="${esc(k)}" data-ti="${ti ?? ''}">${cs.length} person${cs.length === 1 ? '' : 's'} named <b>${esc(lemma)}</b></button></div>`;
}
document.addEventListener('click', ev => {
  const o = ev.target.closest?.('#dictBody [data-ppopen],#dictBody [data-ppopenk]'); if (!o) return;
  const ti = o.dataset.ti === '' || o.dataset.ti == null ? null : +o.dataset.ti;
  if (PP.view) PP.back.push(PP.view);
  PP.view = o.dataset.ppopen ? { t: 'person', ref: o.dataset.ppopen, ti } : { t: 'name', k: o.dataset.ppopenk, ti };
  showPeople();
});
