/* Pult – the Suda tab (v422 as "People", renamed v423): persons from encyclopaedias and prosopographies (packages of kind "people"; for now William Smith's
   Dictionary of Greek and Roman Biography and Mythology), the People tab, and the marks on their names in the text.
   A package keeps its persons by number ("p:<n>", 64 each), an index of all names ("#ix": names -> numbers, and a short line
   per person) and, per library work, the passages where a person is cited ("w:<work>").
   Decisions 681–687, 732–737: every person goes in, marked by kinds (deity, hero, Homeric …) the reader may change; the
   sources of a person are shown separately, as in the dictionary; marks with a switch (Colours menu), unsure ones to check.
   (see core.js for the order of the scripts) */
'use strict';
const PP = { ix: new Map(), rec: new Map(), view: null, back: [], q: '' };
const PKINDS = ['deity', 'hero', 'Homeric', 'ruler', 'magistrate', 'military', 'author', 'philosopher', 'artist', 'physician', 'Christian', 'woman', 'family'];
// packages of persons (kind "people": also the marks in the text) and the other encyclopaedias (kind "encyclopedia": places, things)
const ENCK = new Set(['people', 'encyclopedia']);
const pplPkgs = (all = false) => Object.values(S.installed || {}).filter(d => (all ? ENCK.has(d.kind) : d.kind === 'people') && !S.dictPrefs?.off?.includes(d.id)).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
const sudaMerge = () => S.sudaMerge !== false;                   // Settings → Suda: the sections of one article as one entry (739)
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
  return { d, i, ref: pref(d, i), name: p[0], no: p[1], desc: p[2], kinds: own || (p[3] ? p[3].split(',') : []), y0: p[4], y1: p[5], see: p[6], sec: p[7] ?? null, ownKinds: !!own }; }
async function personsFor(k, all = false) {      // all persons (all: also places and things) with the key; sections of one article as one
  const out = [];
  for (const d of pplPkgs(all)) { const ix = await pplIx(d);
    for (const i of ix?.n?.[k] || []) { const sec = ix.p[i]?.[7]; const r = pref(d, sudaMerge() && sec != null ? sec : i); if (!out.includes(r)) out.push(r); } }
  return out;
}
// entries of other packages attached to this one (PIR persons found in Smith): [[package, [numbers]]]
async function attachedTo(d, i) {
  const out = [];
  for (const o of Object.values(S.installed || {})) { if (!ENCK.has(o.kind) || o.id === d.id || S.dictPrefs?.off?.includes(o.id)) continue;
    const at = await pplRec(o, '#at'); const m = at?.to === d.id ? at.m?.[String(i)] : null; if (m?.length) out.push([o, m]); }
  return out;
}
const MYTHK = new Set(['deity', 'hero', 'Homeric']);      // (years an article mentions say nothing of a god's life)
const ppPlain = s => isGreek(s) ? s : String(s || '').normalize('NFD').replace(/[\u0304\u0306]/g, '').normalize('NFC');   // (Latin lemmata carry ā, ĕ)
const capital = s => { const c = String(s || '').normalize('NFD')[0] || ''; return c !== c.toLowerCase(); };
const yearTxt = y => y == null ? '' : y < 0 ? `${-y} BC` : `AD ${y}`;
const yearsTxt = (a, b) => a == null ? '' : a === b ? yearTxt(a) : (a < 0 && b < 0 ? `${-a}–${-b} BC` : a > 0 ? `AD ${a}–${b}` : `${yearTxt(a)} – ${yearTxt(b)}`);

// ---------------------------------------------------------------- the names in the open text
// S.prs: Map(word index -> {k, cands: [ref], pick: ref|null, sure, why})
// certain: chosen by the reader; cited by the source at this place; the only person of the name; the only one of the name
// cited in this work. Otherwise unsure (dotted) – "to check".
// ---- what counts as a name (decisions 743–749)
const PRAEN = new Set(['a', 'ap', 'c', 'cn', 'd', 'k', 'l', 'm', 'mam', 'n', 'num', 'p', 'post', 'q', 's', 'ser', 'sex', 'sp', 't', 'ti', 'tib', 'u', 'uol']);   // praenomina, abbreviated (744)
const TITLES = new Set(['augustus', 'caesar', 'καισαρ', 'σεβαστοσ', 'αυγουστοσ']);   // names only beside a name (744)
function isAdjWord(tk, lem, n) {
  if (tk.ctx?.t) return tk.ctx.t[0] === 'a';                 // the annotation of the text (GLAUx)
  if (isGreek(lem)) return S.lemmapos?.[gkey(lem)] === 'ADJ';   // (treebank word classes)
  // Latin: the dictionaries know "Gallus" and "Romanus" both as noun and adjective – an adjective only beside a common noun
  // in the same case ("populus Romanus"), not beside a name ("Gallus Caesar")
  if (!S.latAdj && S.latEngine) { const E = S.latEngine; S.latAdj = new Set(E.L.filter(l => (E.type === 'whitaker' ? E.P[l[1]] : l[2]) === 'ADJ').map(l => gkey(l[0]))); }
  if (!S.latAdj?.has(gkey(lem)) && S.latPos?.[gkey(lem)] !== 'ADJ' && !/\b(masc|fem|neut)\b/.test(tk.ana || '')) return false;
  for (const d of [-1, 1]) {
    let m = n + d; while (S.tokens[m]?.t === 'p' && !/\S/.test(S.tokens[m].s)) m += d;
    const o = S.tokens[m]; if (o?.t === 'w' && !capital(o.s) && o.pos === 'noun' && casesAgree(tk, o)) return true;
  }
  return false;
}
function numberOf(tk) {
  const c = tk.ctx?.t?.[2]; if (c && c !== '-') return c;    // s, p, d
  const a = tk.ana || ''; return /\bdual\b/.test(a) ? 'd' : /\bpl\b/.test(a) ? 'p' : /\bsg\b/.test(a) ? 's' : '';
}
const isNom = tk => tk.ctx?.t ? tk.ctx.t[7] === 'n' : /\bnom\b/.test(tk.ana || '');
const CASES = /\b(nom|gen|dat|acc|voc|abl|loc)\b/g;
function casesAgree(a, b) {                                   // two words of one name stand in the same case (where it is known)
  const ca = new Set((a.ana || '').match(CASES) || []), cb = new Set((b.ana || '').match(CASES) || []);
  return !ca.size || !cb.size || [...ca].some(x => cb.has(x));
}
function pluralKeys(l) {                                      // the plural of a name as a headword: Ἀτρεΐδης → Ἀτρεῖδαι, Musa → Musae, Scipio → Scipiones
  const k = gkey(l), out = [];
  if (isGreek(l)) { for (const [a, b] of [['ησ', 'αι'], ['ασ', 'αι'], ['οσ', 'οι'], ['α', 'αι'], ['η', 'αι'], ['ευσ', 'εισ']]) if (k.endsWith(a)) out.push(k.slice(0, -a.length) + b); }
  else for (const [a, b] of [['us', 'i'], ['a', 'ae'], ['es', 'ae'], ['o', 'ones'], ['as', 'ae']]) if (k.endsWith(a)) out.push(k.slice(0, -a.length) + b);
  return out;
}
const dialectKeys = k => isGreek(k) || /[α-ω]/.test(k) ? [k.endsWith('ησ') ? k.slice(0, -2) + 'ασ' : k.endsWith('ασ') ? k.slice(0, -2) + 'ησ' : null,
  k.endsWith('η') ? k.slice(0, -1) + 'α' : k.endsWith('α') ? k.slice(0, -1) + 'η' : null].filter(Boolean) : [];
async function familiesOf(cands) { const out = []; for (const c of cands) { const { d, i } = pplParse(c), r = await pplRow(d, i); if (r?.kinds.includes('family')) out.push(c); } return out; }
// a Latin name of several words ("Cn. Fabius Maximus", "Gallus Caesar"): the part whose persons best fit the other parts
const wordsOf = s => String(s || '').split(/[^A-Za-zÀ-ɏ.]+/).map(w => latkey(w.replace(/\.$/, ''))).filter(Boolean);
const partFits = (f, x) => x === f || (f.length >= 5 && x.length >= 5 && (x.startsWith(f.slice(0, -2)) || f.startsWith(x.slice(0, -2))));
async function groupHit(run) {
  const name = run.map(x => x.tk.s + (x.abbr ? '.' : '')).join(' ');
  const parts = run.filter(x => !x.abbr && !x.title && x.cands?.length);
  if (!parts.length) return null;
  let best = null;
  for (const p of parts) {
    const others = run.filter(x => x !== p).map(x => x.abbr ? { f: latkey(x.tk.s), ab: true } : { f: gkey(x.lem || x.tk.s) });
    const scored = [];
    for (const c of p.cands) { const { d, i } = pplParse(c), r = await pplRow(d, i); if (!r) continue;
      const ws = wordsOf(r.name + ' ' + r.desc); scored.push([c, others.filter(o => ws.some(x => o.ab ? x === o.f : partFits(o.f, x))).length]); }
    const top = Math.max(0, ...scored.map(x => x[1])); if (!top) continue;
    const fit = scored.filter(x => x[1] === top).map(x => x[0]);
    if (!best || fit.length < best.cands.length || (fit.length === best.cands.length && top >= best.top)) best = { k: p.k, cands: fit, top, full: fit.length === 1 && top === others.length };
  }
  if (!best) { const p = parts.reduce((a, b) => b.cands.length <= a.cands.length ? b : a); best = { k: p.k, cands: p.cands }; }
  return Object.assign(best, { name, k: 'g:' + run.filter(x => !x.abbr).map(x => gkey(x.lem || x.tk.s)).join(' ') + '|' + best.k });
}
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
  // pass 1: every word that may be (part of) a name, with its candidates; null where a name cannot go on (punctuation, a block)
  const memo = new Map(), items = [], rjOf = new Map(); let rj = -1, start = true;
  // 753a: nobody who lived after the text was written (Smith: the earliest year his article mentions; PIR: the imperial period)
  const wy = typeof workYear === 'function' ? await workYear(t).catch(() => null) : null, ixs = new Map();
  for (const d of pk) ixs.set(d.id, await pplIx(d));
  const early = c => { if (wy == null) return true; const { d, i } = pplParse(c); const y0 = d?.id === 'people-pir' ? -31 : ixs.get(d?.id)?.p?.[i]?.[4]; return y0 == null || y0 <= wy + 40; };   // (DPRR: the beginning of the person's era)
  const look = async k => { if (!k) return []; let c = memo.get(k); if (!c) memo.set(k, c = (await personsFor(k)).filter(early)); return c; };
  for (let n = 0; n < S.tokens.length; n++) {
    const tk = S.tokens[n];
    if (tk.t === 'b') { if (tk.k !== 'l' && tk.k !== 'L') start = true; items.push(null); continue; }   // (a verse line is no new sentence)
    if (tk.t === 'p') {
      const prev = items[items.length - 1];
      if (prev?.abbr && /^\.\s*$/.test(tk.s)) continue;     // "Cn. Pompeius": the point of an abbreviation ends no sentence
      if (/[.!?;:·]/.test(tk.s)) start = true;
      if (/\S/.test(tk.s.replace(/[ʼ’'᾽]/g, ''))) items.push(null);
      continue;
    }
    if (tk.t !== 'w') continue;
    const st = start; start = false;
    while (rj + 1 < R.length && R[rj + 1].i <= tk.i) rj++;
    rjOf.set(tk.i, rj);
    const lem = tk.lemma || null, lat = !isGreek(tk.s), capF = capital(tk.s), capL = lem && capital(lem);
    const nx = S.tokens[n + 1];
    if (lat && capF && PRAEN.has(latkey(tk.s)) && nx?.t === 'p' && /^\./.test(nx.s)) { items.push({ tk, abbr: true, lat, st }); continue; }   // 744
    const lowOk = lem && !capL && capF && !st;                // 748: a capital mid-sentence beats a lemma in small letters (Ἠώς, Θρασύβουλος)
    if (lem ? !(capL || lowOk) : !capF) { items.push(null); continue; }
    if (capL && isAdjWord(tk, lem, n)) { items.push(null); continue; }   // 743a: "Ἀθηναῖος", "Ὀλύμπιος" – the morphology calls it an adjective
    const num = numberOf(tk);
    let k = gkey(lowOk ? tk.s : lem || tk.s), cands = [];
    if (num === 'p') {                                         // 746: plural – only groups and families (the Dioscuri, the Muses, the Gracchi)
      for (const pk of new Set([gkey(tk.s), ...pluralKeys(lem || tk.s)])) { const c = await look(pk); if (c.length) { k = pk; cands = c; break; } }
      if (!cands.length) cands = await familiesOf(await look(k));
      if (!cands.length) { items.push(null); continue; }
    } else {
      cands = await look(k);
      if (!cands.length && lowOk) { const c = await look(gkey(lem)); if (c.length) { k = gkey(lem); cands = c; } }   // ("Θρασυβούλου": the lemma θρασύβουλος)
      for (const v of cands.length ? [] : dialectKeys(k)) { const c = await look(v); if (c.length) { k = v; cands = c; break; } }   // 747: Τήρας ~ Τήρης
      if (!cands.length && lem && gkey(tk.s) !== k && isNom(tk)) { const c = await look(gkey(tk.s)); if (c.length) { k = gkey(tk.s); cands = c; } }   // 747: the form, only a nominative
    }
    items.push({ tk, k, cands, st, lem, lat, title: TITLES.has(k) });
    if (run !== personsForText.run) return;
  }
  // pass 2: Latin names of several words read together (745); the rest word by word
  const decide = (cands, ti, k, st, lem, why0) => {
    const ft = fix.t?.[t.bi + ':' + ti] ?? fix.t?.[ti], fk = fix.k?.[k];
    if (ft === 0 || (ft == null && fk === 0)) return null;     // "not a person"
    if (ft || fk) return { pick: ft || fk, sure: true, why: 'chosen by you' };
    const nh = near.get(rjOf.get(ti)), c1 = nh ? cands.filter(c => nh.has(c)) : [], cw = cands.filter(c => cited.has(c));
    if (c1.length === 1) return { pick: c1[0], sure: true, why: 'cited by the source at this place' };
    if (!lem && st) return null;                                // no lemma, at the start of a sentence: "Mene …" is no name
    if (cands.length === 1) return { pick: cands[0], sure: true, why: why0 || 'the only person of this name' };
    if (cw.length === 1) return { pick: cw[0], sure: false, why: 'probably – the only one of this name cited in this work' };   // 749: a preference, to check
    return { pick: null, sure: false, why: `${cands.length} persons of this name` };
  };
  const put = (h, its) => { h.grp = its.map(x => x.tk.i); for (const x of its) S.prs.set(x.tk.i, h); };
  for (let j = 0; j < items.length;) {
    if (!items[j]) { j++; continue; }
    let e = j + 1;                                             // a run of Latin name words (cases agreeing)
    if (items[j].lat) while (e < items.length && items[e]?.lat && casesAgree(items[e - 1].tk, items[e].tk)
      && !(items[e].abbr && items.slice(j, e).some(x => !x.abbr))      // "Cethego P. Sempronio": the praenomen begins the next name
      && !/(que|ve)$/i.test(items[e].tk.s)) e++;                        // "Hannonem Magonemque": two persons
    let seq = items.slice(j, e); j = e;
    while (seq.length > 1 && seq[seq.length - 1].abbr) seq = seq.slice(0, -1);   // "Constantio A.": no name follows
    if (seq.length === 1) {
      const x = seq[0]; if (x.abbr || x.title || !x.cands?.length) continue;   // 744: "Augustus", "Caesar" alone – left for the table of reigns
      const d = decide(x.cands, x.tk.i, x.k, x.st, x.lem); if (d) put(Object.assign({ k: x.k, cands: x.cands }, d), seq);
      continue;
    }
    const g = await groupHit(seq);
    if (!g) continue;
    const d = decide(g.cands, seq[0].tk.i, g.k, seq[0].st && !seq[0].abbr, seq.some(x => x.lem), g.full ? 'the whole name fits' : null);
    if (d) put(Object.assign({ k: g.k, cands: g.cands, name: g.name }, d), seq);
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
document.addEventListener('change', async ev => {      // Settings → Suda: the sections of one article as one entry
  if (ev.target.dataset?.sudamerge == null) return;
  S.sudaMerge = ev.target.checked; await setting('sudaMerge', S.sudaMerge); await personsForText(); if (S.tab === 'people') pplRender();
});
document.addEventListener('change', async ev => {      // Settings → Reading → Colourisation: the switch for the marks
  if (ev.target.dataset?.prsmark == null) return;
  S.prsMark = ev.target.checked; await setting('prsMark', S.prsMark); markPersons();
});

// ---------------------------------------------------------------- the Suda tab (the element ids keep the old name "people")
// views: {t:'text'} the names of the open text (to check first) · {t:'person', ref} · {t:'search', q} · {t:'name', k, ti} the persons of a name
function pplGo(v, push = true) { if (push && PP.view) { PP.back.push(PP.view); if (PP.back.length > 60) PP.back.shift(); } PP.view = v; pplRender(); $('#dictPane').scrollTop = 0; }
function pplWordTapped(ti) {                     // a word tapped while the Suda tab is open: its person, or all its entries; the dictionary behind
  const h = S.prs?.get(ti);
  if (h) pplGo(h.pick ? { t: 'person', ref: h.pick, ti } : { t: 'name', k: h.k, ti });
  else { const tk = S.tokens.find(x => x.t === 'w' && x.i === ti); if (!tk) return false; pplGo({ t: 'word', form: tk.s, lemma: tk.lemma || null, ti }); }
  return true;
}
async function showPeople() { showTab('people'); if (!PP.view) PP.view = { t: 'text' }; await pplRender(); }
// the bar (back · search · "In this text") is drawn once and stays: typing never redraws the field; only #pplRes changes.
// Each drawing is numbered: one that finishes after a newer one has started is dropped (a slow search for "Pe" cannot
// overwrite the results for "Peric")
function pplShell() {
  const body = $('#peopleBody'); if (!body) return null;
  if (!$('#pplQ')) body.innerHTML = `<form class="pptop" id="pplBar" action="#"><button type="button" class="ppback" data-ppback="1" aria-label="Back" title="Back">‹</button>`
    + `<input id="pplQ" type="search" enterkeyhint="search" placeholder="Find a person …" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">`
    + `<button type="button" data-pptext="1" class="pptxt">In this text</button></form><div id="pplRes"></div>`;
  return $('#pplRes');
}
async function pplRender() {
  const res = pplShell(); if (!res) return;
  const n = PP.rn = (PP.rn || 0) + 1;
  const v = PP.view || (PP.view = { t: 'text' });
  $('#peopleBody .ppback').disabled = !PP.back.length; $('#peopleBody .pptxt').disabled = v.t === 'text';
  const q = $('#pplQ'); if (v.t !== 'search' && document.activeElement !== q) q.value = '';
  let h;
  if (!pplPkgs(true).length && !S.installed?.suda) h = `<p class="hint">No encyclopaedia installed yet. Open the menu ☰ → Instruments → Suda – Encyclopaedias and Lexica and download one, e.g. “William Smith, A Dictionary of Greek and Roman Biography and Mythology”.</p>`;
  else if (v.t === 'person') h = await pplPersonHTML(v.ref, v.ti);
  else if (v.t === 'word') h = await pplWordHTML(v.form, v.lemma, v.ti);
  else if (v.t === 'search') h = await pplSearchHTML(v.q, v.all);
  else if (v.t === 'name') h = await pplNameHTML(v.k, v.ti);
  else h = await pplTextHTML();
  if (n !== PP.rn) return;                                    // a newer drawing has started meanwhile
  if (v.t === 'search' && v.all && h.rows) { res.innerHTML = h.head; pplRowsInto(res.querySelector('.list'), h.rows, n); return; }
  res.innerHTML = typeof h === 'string' ? h : h.head.replace('<div class="list plain"></div>', `<div class="list plain">${h.rows.join('')}</div>`);
  if (v.t === 'person' || v.t === 'word') res.querySelectorAll('details.src').forEach(el => wrapGreek(el));
}
function pplRowsInto(list, rows, n, from = 0) {                // all the results (Enter): drawn 300 at a time
  if (!list || n !== PP.rn) return;
  list.insertAdjacentHTML('beforeend', rows.slice(from, from + 300).join(''));
  if (from + 300 < rows.length) requestAnimationFrame(() => pplRowsInto(list, rows, n, from + 300));
}
const kindChips = (r, edit) => `<span class="ppkinds">${r.kinds.map(k => `<span class="ppk">${esc(k)}</span>`).join('')}${edit ? `<button type="button" class="ppkedit" data-ppkinds="${esc(r.ref)}" title="Change the kinds">${r.kinds.length ? 'edit' : '+ kind'}</button>` : ''}</span>`;
const srcTag = d => d.id === 'people-smith' ? '' : ` <small class="ppsrc">${esc({ 'people-pir': 'PIR', 'people-dprr': 'DPRR', 'enc-smith-geo': 'Geography', 'enc-smith-ant': 'Antiquities' }[d.id] || d.name)}</small>`;
const rowHTML = (r, extra = '') => `<button type="button" class="pprow" data-ppref="${esc(r.ref)}"><span class="ppn"><b>${esc(r.name)}</b>${srcTag(r.d)}${r.no ? ` <small>${r.no}</small>` : ''}${r.y0 != null && !r.kinds.some(k => MYTHK.has(k)) ? ` <small class="ppy">${yearsTxt(r.y0, r.y1)}</small>` : ''}</span><span class="ppd">${esc(r.desc || '')}</span>${r.kinds.length ? kindChips(r) : ''}${extra}</button>`;
async function pplTextHTML() {
  const t = S.text; if (!t) return '<p class="hint">Open a text: the persons named in it are listed here.</p>';
  const by = new Map();
  for (const [i, x] of S.prs || []) { if (x.grp && x.grp[0] !== i) continue;     // (a name of several words: once)
    const id = (x.sure ? '' : '?') + (x.pick || x.k); let g = by.get(id); if (!g) by.set(id, g = { x, is: [] }); g.is.push(i); }
  if (!by.size) return `<p class="hint">No names of persons found in this part${S.morph || S.latMorph ? '' : ' (the names are recognised from the lemmata – install the morphological analysis: ☰ → Instruments → Analysis)'}.</p>`;
  const unsure = [], sure = [];
  for (const [id, g] of by) (g.x.sure ? sure : unsure).push([id, g]);
  const occ = g => `<span class="ppocc">${g.is.slice(0, 12).map(i => `<button type="button" data-ppjump="${i}">${esc(refAt(i) || '·')}</button>`).join('')}${g.is.length > 12 ? `<small>+${g.is.length - 12}</small>` : ''}</span>`;
  let h = '';
  if (unsure.length) {
    h += `<div class="navh3">To check <small>${unsure.length}</small></div><div class="list plain">`;
    for (const [, g] of unsure.sort((a, b) => a[1].is[0] - b[1].is[0])) {
      const tk = S.tokens.find(x => x.t === 'w' && x.i === g.is[0]);
      let prob = ''; if (g.x.pick) { const { d, i } = pplParse(g.x.pick), r = d && await pplRow(d, i); if (r) prob = ` – ${esc(r.name)}${r.no ? ' ' + r.no : ''}: ${esc(r.desc)}`; }
      h += `<div class="ppchk"><button type="button" class="pprow" data-ppname="${esc(g.x.k)}" data-ti="${g.is[0]}"><span class="ppn"><b>${esc(g.x.name || ppPlain(tk?.lemma || tk?.s) || g.x.k)}</b></span><span class="ppd">${esc(g.x.why)}${prob} – choose</span></button>${occ(g)}</div>`;
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
  const hh = ti != null ? S.prs?.get(ti) : null, cands = hh?.k === k ? hh.cands : await personsFor(k), rows = [];
  for (const c of cands) { const { d, i } = pplParse(c); const r = await pplRow(d, i); if (r) rows.push(r); }
  const tk = ti != null ? S.tokens.find(x => x.t === 'w' && x.i === ti) : null, h0 = ti != null ? S.prs?.get(ti) : null;
  let h = `<div class="pphead"><div class="ppname">${esc(hh?.name || ppPlain(tk?.lemma || tk?.s) || k)}</div><div class="ppmeta">${rows.length} person${rows.length === 1 ? '' : 's'} of this name${tk ? ` · at ${esc(refAt(ti) || '')}` : ''}</div></div>`;
  if (tk) h += `<p class="hint small">Choose who is meant: “this one” for every <i>${esc(hh?.name || ppPlain(tk.lemma || tk.s))}</i> in this work, “here only” for this place. ${h0?.pick ? '' : ''}</p>`;
  h += '<div class="list plain">';
  for (const r of rows) h += `<div class="ppchk">${rowHTML(r)}${tk ? `<span class="ppchoose"><button type="button" data-ppfix="${esc(r.ref)}" data-k="${esc(k)}">This one</button><button type="button" data-ppfix="${esc(r.ref)}" data-k="${esc(k)}" data-ti="${ti}">Here only</button></span>` : ''}</div>`;
  h += '</div>';
  if (tk) h += `<div class="ppnot"><button type="button" data-ppfix="0" data-k="${esc(k)}">Not a person</button><button type="button" data-ppfix="0" data-k="${esc(k)}" data-ti="${ti}">Not a person here</button>${h0 && (h0.why === 'chosen by you') ? `<button type="button" data-ppfix="" data-k="${esc(k)}" data-ti="${ti}">Undo my choice</button>` : ''}</div>`;
  return h;
}
async function pplSearchHTML(q, all = false) {
  const k = gkey(q); if (!k) return '<p class="hint">Type a name – Greek or Latin letters. Enter shows all results.</p>';
  const hits = [];
  for (const d of pplPkgs(true)) { const ix = await pplIx(d); if (!ix) continue;
    for (const key of Object.keys(ix.n)) if (key.startsWith(k)) for (const i of ix.n[key]) { const sec = ix.p[i]?.[7]; hits.push({ d, i: sudaMerge() && sec != null ? sec : i, exact: key === k, key }); } }
  if (!hits.length) return `<p class="hint">Nothing found for “${esc(q)}”.</p>`;
  hits.sort((a, b) => b.exact - a.exact || a.key.length - b.key.length || a.key.localeCompare(b.key) || a.i - b.i);
  const seen = new Set(), ids = [];
  for (const x of hits) { const id = pref(x.d, x.i); if (!seen.has(id)) { seen.add(id); ids.push(x); } }
  const shown = all ? ids : ids.slice(0, 40), rows = [];
  for (const x of shown) { const r = await pplRow(x.d, x.i); if (r) rows.push(rowHTML(r)); }
  const more = !all && ids.length > shown.length ? ` <small>– the first ${shown.length}; Enter shows all</small>` : '';
  return { head: `<div class="navh3">${ids.length.toLocaleString('en')} entr${ids.length === 1 ? 'y' : 'ies'}${more}</div><div class="list plain"></div>`, rows };
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
  let secs = '';
  if (sudaMerge()) { const ix = await pplIx(d); for (let j = i + 1; j < ix.p.length && j < i + 40; j++) if (ix.p[j]?.[7] === i) { const se = await pplEntry(d, j); if (se) secs += `<div class="ppsec">${se.html}</div>`; } }
  h += `<details class="src" open data-pd="${d.id}"><summary>${esc(d.name)} <small>${esc(d.title || '')}</small></summary><div class="ent"><div class="eb">${e.html}${secs}</div></div></details>`;
  for (const [o, m] of await attachedTo(d, i)) {                    // the same person in another source (PIR …), by itself
    let inner = ''; for (const j of m) { const oe = await pplEntry(o, j); if (oe) inner += `<div class="ent"><div class="eb">${oe.html}</div></div>`; }
    h += `<details class="src" open data-pd="${o.id}"><summary>${esc(o.name)} <small>${esc(o.title || '')}</small></summary>${inner}</details>`;
  }
  const suda = S.installed?.suda, gks = (e.k || []).filter(isGreek);
  if (!suda) h += `<details class="src empty" data-pd="suda"><summary>Suda <small>not installed – <button type="button" class="ppget" data-ppget="suda">Download</button> (${mbs(S.manifest?.packages?.find(p => p.id === 'suda')?.bytes || 2.5e6)})</small></summary></details>`;
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
  const others = []; for (const k of (e.k || []).slice(0, 1)) for (const c of await personsFor(k, true)) if (c !== ref) { const x = pplParse(c), rr = await pplRow(x.d, x.i); if (rr) others.push(rowHTML(rr)); }
  if (others.length) h += `<details class="src"><summary>Others of the name ${esc(e.h.split(/[ ,]/)[0])} <small>${others.length}</small></summary><div class="list plain">${others.join('')}</div></details>`;
  return h;
}
// any word: its entries in the Suda and in every encyclopaedia, each source by itself (755)
async function pplWordHTML(form, lemma, ti) {
  const keys = [...new Set([lemma, form].filter(Boolean).map(gkey).filter(Boolean))];
  let h = `<div class="pphead"><div class="ppname">${esc(ppPlain(lemma || form))}</div>${lemma && canon(lemma) !== canon(form) ? `<div class="ppmeta">${esc(form)}</div>` : ''}</div>`, any = false;
  const suda = S.installed?.suda;
  if (suda && isGreek(form)) {
    let inner = '', n = 0;
    for (const k of keys) { const b = await bucket(suda, k); for (const x of (b?.e || []).filter(x => x.k.includes(k)).sort((a, b) => a.i - b.i)) { inner += await renderEntryHTML(Object.assign({ d: 'suda' }, x)); n++; } }
    if (n) { any = true; h += `<details class="src" data-pd="suda" open><summary>${esc(suda.name)} <small>${n} entr${n === 1 ? 'y' : 'ies'}</small></summary>${inner}</details>`; }
  } else if (!suda && isGreek(form)) h += `<details class="src empty" data-pd="suda"><summary>Suda <small>not installed – <button type="button" class="ppget" data-ppget="suda">Download</button></small></summary></details>`;
  for (const d of pplPkgs(true)) {
    const ix = await pplIx(d), seen = new Set(), rows = [];
    for (const k of keys) for (const i0 of ix?.n?.[k] || []) { const sec = ix.p[i0]?.[7], i = sudaMerge() && sec != null ? sec : i0; if (seen.has(i)) continue; seen.add(i); const r = await pplRow(d, i); if (r) rows.push(r); }
    if (!rows.length) continue; any = true;
    if (rows.length === 1 && d.kind === 'encyclopedia') { const e = await pplEntry(d, rows[0].i);     // one entry: the article itself
      h += `<details class="src" data-pd="${d.id}" open><summary>${esc(d.name)} <small>${esc(d.title || '')}</small></summary><div class="ent"><div class="eb">${e?.html || ''}</div></div><div class="list plain">${rowHTML(rows[0], '<span class="ppwhy">the whole entry, with its passages</span>')}</div></details>`; }
    else h += `<details class="src" data-pd="${d.id}" open><summary>${esc(d.name)} <small>${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}</small></summary><div class="list plain">${rows.map(r => rowHTML(r)).join('')}</div></details>`;
  }
  if (!any) h += `<p class="hint">No entry for <i>${esc(lemma || form)}</i> in the Suda or the encyclopaedias installed.</p>`;
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
  const b = t.closest('[data-ppback]'); if (b) { if (!PP.back.length) return; PP.view = PP.back.pop(); $('#pplQ').value = PP.view.t === 'search' ? PP.view.q : ''; pplRender(); return; }
  if (t.closest('[data-pptext]')) return pplGo({ t: 'text' });
  const ke = t.closest('[data-ppkinds]'); if (ke) return pplKindsDialog(ke.dataset.ppkinds);
  const gt = t.closest('[data-ppget]'); if (gt) { ev.preventDefault(); const id = gt.dataset.ppget; gt.disabled = true; gt.textContent = 'Downloading …'; queueDownload(id);
    const w = setInterval(() => { if (S.installed?.[id]) { clearInterval(w); pplRender(); } else if (!DL.has(id)) { clearInterval(w); gt.disabled = false; gt.textContent = 'Download'; } }, 700); return; }
  const fx = t.closest('[data-ppfix]'); if (fx) return pplFix(fx.dataset.ppfix, fx.dataset.k, fx.dataset.ti != null ? +fx.dataset.ti : null);
  const nm = t.closest('[data-ppname]'); if (nm) return pplGo({ t: 'name', k: nm.dataset.ppname, ti: nm.dataset.ti != null ? +nm.dataset.ti : null });
  const ps = t.closest('[data-pppass]'); if (ps) return pplPassage(ps.dataset.pppass, +ps.dataset.bi, ps.dataset.r, ps.dataset.ref);
  const j = t.closest('[data-ppjump]'); if (j) { const i = +j.dataset.ppjump; S.cur = [i, i]; S.curHidden = false; markTarget(); requestAnimationFrame(() => scrollToWord(i)); return; }
  const dx = t.closest('a.pxr[data-dprr]'); if (dx) { (async () => {   // DPRR relatives: the person (with Smith's entry, where he has one)
    const dp = S.installed?.['people-dprr'], i = +dx.dataset.dprr; if (!dp) return;
    const at = await pplRec(dp, '#at'); const sm = at && Object.entries(at.m || {}).find(([, v]) => v.includes(i));
    pplGo({ t: 'person', ref: sm && S.installed?.[at.to] ? at.to + '|' + sm[0] : 'people-dprr|' + i });
  })(); return; }
  const xr = t.closest('a.pxr'); if (xr) { (async () => {             // Smith's cross-references: [PARIS.]
    const k = gkey(xr.dataset.x), own = t.closest('details.src')?.dataset.pd, cs0 = await personsFor(k, true), cs = own && cs0.some(c => c.startsWith(own + '|')) ? cs0.filter(c => c.startsWith(own + '|')) : cs0;
    if (xr.dataset.no) for (const c of cs) { const x = pplParse(c), r = await pplRow(x.d, x.i); if (r && String(r.no) === xr.dataset.no) return pplGo({ t: 'person', ref: c }); }
    if (cs.length === 1) return pplGo({ t: 'person', ref: cs[0] });
    pplGo({ t: 'search', q: xr.dataset.x });
  })(); return; }
  const row = t.closest('[data-ppref]'); if (row) return pplGo({ t: 'person', ref: row.dataset.ppref });
});
// typing: a pause of 150 ms, nothing while an accent or breathing is being composed; the first letter opens the search
// (one step back leads to where you were), later letters only change it; Enter shows all results and closes the keyboard
function pplSearchNow(all = false) {
  const q = $('#pplQ')?.value || '';
  if (PP.view?.t === 'search') { PP.view.q = q; PP.view.all = all; pplRender(); }
  else { if (PP.view) PP.back.push(PP.view); PP.view = { t: 'search', q, all }; pplRender(); $('#dictPane').scrollTop = 0; }
}
document.addEventListener('compositionstart', ev => { if (ev.target.id === 'pplQ') PP.composing = true; });
document.addEventListener('compositionend', ev => { if (ev.target.id !== 'pplQ') return; PP.composing = false; clearTimeout(PP.qt); PP.qt = setTimeout(pplSearchNow, 150); });
document.addEventListener('input', ev => {
  if (ev.target.id !== 'pplQ' || PP.composing || ev.isComposing) return;
  clearTimeout(PP.qt); PP.qt = setTimeout(pplSearchNow, 150);
});
document.addEventListener('submit', ev => {
  if (ev.target.id !== 'pplBar') return;
  ev.preventDefault(); clearTimeout(PP.qt); pplSearchNow(true); $('#pplQ').blur();
});
// the dictionary: a line naming the persons of the word looked up (to the People tab)
async function pplDictLine(lemma, ti) {
  if (!pplPkgs(true).length) return '';
  if (!capital(lemma)) {                                              // a common word: its articles in the encyclopaedias of things (Agora, Consul …)
    let n = 0; for (const d of pplPkgs(true)) if (d.kind === 'encyclopedia') n += (await pplIx(d))?.n?.[gkey(lemma)]?.length || 0;
    return n ? `<div class="ppline"><span class="ppl1">Suda tab</span><button type="button" data-ppword="${esc(lemma)}" data-ti="${ti ?? ''}">${n} entr${n === 1 ? 'y' : 'ies'} in the encyclopaedias</button></div>` : '';
  }
  const h0 = ti != null ? S.prs?.get(ti) : null;
  const k = h0?.k || gkey(lemma), cs = h0?.cands || await personsFor(k); if (!cs.length) return '';
  if (h0?.pick) { const x = pplParse(h0.pick), r = await pplRow(x.d, x.i);
    if (r) return `<div class="ppline"><span class="ppl1">${h0.sure ? 'Person' : 'Probably'}</span><button type="button" data-ppopen="${esc(h0.pick)}" data-ti="${ti}"><b>${esc(r.name)}</b>${r.no ? ' ' + r.no : ''} – ${esc(r.desc)}</button>${cs.length > 1 ? `<button type="button" data-ppopenk="${esc(k)}" data-ti="${ti ?? ''}" class="ppmore">${cs.length - 1} other${cs.length > 2 ? 's' : ''}</button>` : ''}</div>`; }
  return `<div class="ppline"><span class="ppl1">People</span><button type="button" data-ppopenk="${esc(k)}" data-ti="${ti ?? ''}">${cs.length} person${cs.length === 1 ? '' : 's'} named <b>${esc(lemma)}</b></button><button type="button" class="ppmore" data-ppword="${esc(lemma)}" data-ti="${ti ?? ''}">all entries</button></div>`;
}
document.addEventListener('click', ev => {
  const o = ev.target.closest?.('#dictBody [data-ppopen],#dictBody [data-ppopenk],#dictBody [data-ppword]'); if (!o) return;
  const ti = o.dataset.ti === '' || o.dataset.ti == null ? null : +o.dataset.ti;
  if (PP.view) PP.back.push(PP.view);
  PP.view = o.dataset.ppword ? { t: 'word', form: S.view?.form || o.dataset.ppword, lemma: o.dataset.ppword, ti }
    : o.dataset.ppopen ? { t: 'person', ref: o.dataset.ppopen, ti } : { t: 'name', k: o.dataset.ppopenk, ti };
  showPeople();
});
