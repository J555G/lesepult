/* Pult – Search (the field in the top bar): suggestions while typing, the results page in the right pane,
   the headword lists it works on, Greek in Latin letters, typo tolerance, wildcards, and the index of all texts.
   (see core.js for the order of the scripts) */
'use strict';
// ---------------------------------------------------------------- settings (Settings → Search)
const SC_DEF = { sugg: true, n: 7, tr: true, loose: true, tog: false, typo: true, dist: 1, dicts: 'on', groups: [], libWords: true };
// the groups of the results page; more kinds of data (places, people, encyclopedias …) add a group here
const SEARCH_GROUPS = [];
async function loadSearchCfg() {
  const c = Object.assign({}, SC_DEF, (await setting('searchCfg')) || {});
  const known = new Set(c.groups.map(g => g[0]));
  if (![7, 14, 21].includes(c.n)) c.n = 7;
  c.groups = c.groups.filter(g => SEARCH_GROUPS.some(x => x.id === g[0])).concat(SEARCH_GROUPS.filter(x => !known.has(x.id)).map(x => [x.id, true]));
  S.sc = c; S.srchLang ??= (await setting('srchLang')) || 'all';
}
const saveSearchCfg = () => setting('searchCfg', S.sc);

// ---------------------------------------------------------------- headword lists
// Each dictionary package carries its lookup keys (sorted, one per line); a dictionary installed before that
// gets its list built once on the device (one pass over its records) and stored with it.
async function dictKeys(d) {
  const ddb = await dictDB(d.id), st = () => ddb.transaction('b').objectStore('b');
  const r = await req2p(st().get('#hw')); if (r?.s != null) return r.s;
  const set = new Set();
  await new Promise((res, rej) => { const c = st().openCursor(); c.onerror = () => rej(c.error);
    c.onsuccess = () => { const cur = c.result; if (!cur) return res(); const v = cur.value; if (v.b[0] !== '#') for (const e of v.e || []) for (const k of e.k || []) if (k) set.add(k); cur.continue(); }; });
  const s = [...set].sort().join('\n');
  try { const t = ddb.transaction('b', 'readwrite'); t.objectStore('b').put({ b: '#hw', s, built: Date.now() }); await done(t); } catch (_) { }
  return s;
}
// a sorted list packed into one string (one key per line) with the start of each key: little memory, quick to search
function packKeys(keys) {
  const s = keys.join('\n') + '\n', off = new Uint32Array(keys.length + 1); let p = 0;
  for (let i = 0; i < keys.length; i++) { off[i] = p; p += keys[i].length + 1; }
  off[keys.length] = p;
  return { s, off, n: keys.length, key(i) { return this.s.slice(this.off[i], this.off[i + 1] - 1); }, len(i) { return this.off[i + 1] - this.off[i] - 1; } };
}
// Greek in Latin letters, the lenient way: e and o also find η and ω
const foldG = k => k.replace(/η/g, 'ε').replace(/ω/g, 'ο');
const HW = { grc: null, la: null };
const scDicts = lang => (S.sc?.dicts === 'all' ? S.dicts : S.shown).filter(d => d.src === lang);
async function hwIndex(lang) {
  const ds = scDicts(lang), sig = ds.map(d => d.id + ':' + (d.version || d.count)).join(',');
  const cur = HW[lang];
  if (cur && cur.sig === sig) return cur.p || cur.wait;
  const wait = (async () => {
    const parts = await Promise.all(ds.map(dictKeys));
    const all = parts.length === 1 ? parts[0].split('\n') : [...new Set(parts.flatMap(s => s ? s.split('\n') : []))].sort();
    const keys = all.filter(Boolean), X = { sig, P: packKeys(keys) };
    if (lang === 'grc') {               // the folded twins (η → ε, ω → ο), sorted, each pointing to its key
      const ord = keys.map((k, i) => [foldG(k), i]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
      X.F = packKeys(ord.map(x => x[0])); X.fi = Uint32Array.from(ord, x => x[1]);
    }
    HW[lang] = { sig, p: X }; return X;
  })();
  HW[lang] = { sig, wait };
  return wait;
}
function lowerBound(P, q) { let lo = 0, hi = P.n; while (lo < hi) { const m = (lo + hi) >> 1; if (P.key(m) < q) lo = m + 1; else hi = m; } return lo; }
function prefixHits(P, q, limit) { const out = []; for (let i = lowerBound(P, q); i < P.n && out.length < limit; i++) { const k = P.key(i); if (!k.startsWith(q)) break; out.push(i); } return out; }
function wildHits(P, pat, limit) {           // * any letters, ? one letter – on the whole list at once
  const rx = new RegExp('^' + pat.split('').map(c => c === '*' ? '[^\\n]*' : c === '?' ? '[^\\n]' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('') + '$', 'gm');
  const out = []; let m;
  while ((m = rx.exec(P.s)) && out.length < limit) { if (!m[0].length) { rx.lastIndex++; continue; } out.push(m[0]); }
  return out;
}
// edit distance with a ceiling (a swapped pair of letters counts as one)
function editDist(a, b, max) {
  const n = a.length, m = b.length; if (Math.abs(n - m) > max) return max + 1;
  let pp = null, p = Array.from({ length: m + 1 }, (_, j) => j), c = new Array(m + 1);
  for (let i = 1; i <= n; i++) {
    c[0] = i; let low = i;
    for (let j = 1; j <= m; j++) {
      let v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (pp && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, pp[j - 2] + 1);
      c[j] = v; if (v < low) low = v;
    }
    if (low > max) return max + 1;
    [pp, p, c] = [p, c, pp || new Array(m + 1)];
  }
  return p[m];
}
function fuzzyHits(P, q, max, limit) {
  const out = [], L = q.length;
  for (let i = 0; i < P.n; i++) {
    const l = P.len(i); if (l < L - max || l > L + max || l < 2) continue;
    const k = P.key(i); if (k === q) continue;
    const d = editDist(q, k, max); if (d <= max) out.push([i, d, Math.abs(l - L)]);
  }
  return out.sort((a, b) => a[1] - b[1] || a[2] - b[2]).slice(0, limit);
}

// ---------------------------------------------------------------- the query
// Latin letters → Greek (transliteration; betacode when it has accent signs): λόγος from "logos" or "lo/gos"
const BETA = { a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ε', z: 'ζ', h: 'η', q: 'θ', i: 'ι', k: 'κ', l: 'λ', m: 'μ', n: 'ν', c: 'ξ', o: 'ο', p: 'π', r: 'ρ', s: 'σ', t: 'τ', u: 'υ', f: 'φ', x: 'χ', y: 'ψ', w: 'ω' };
const TRL = [['nch', 'γχ'], ['rh', 'ρ'], ['th', 'θ'], ['ph', 'φ'], ['ch', 'χ'], ['kh', 'χ'], ['ps', 'ψ'], ['ks', 'ξ'], ['ng', 'γγ'], ['nk', 'γκ'], ['nx', 'γξ'],
  ['a', 'α'], ['b', 'β'], ['g', 'γ'], ['d', 'δ'], ['e', 'ε'], ['z', 'ζ'], ['i', 'ι'], ['j', 'ι'], ['k', 'κ'], ['c', 'κ'], ['q', 'κ'], ['l', 'λ'], ['m', 'μ'], ['n', 'ν'],
  ['x', 'ξ'], ['o', 'ο'], ['p', 'π'], ['r', 'ρ'], ['s', 'σ'], ['t', 'τ'], ['u', 'υ'], ['y', 'υ'], ['f', 'φ'], ['w', 'ω'], ['v', 'β']];
function latinToGreek(s) {
  s = s.normalize('NFD').toLowerCase();
  if (/[\/\\=()|+]/.test(s) || s.startsWith('*')) return s.replace(/[\/\\=()|+*'’]/g, '').replace(/[a-z]/g, c => BETA[c] || '');
  let out = '';
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '*' || c === '?') { out += c; i++; continue; }
    if ((c === 'e' || c === 'o') && /[̄̂]/.test(s[i + 1] || '')) { out += c === 'e' ? 'η' : 'ω'; i += 2; continue; }   // ē ō ê ô
    if (/[̀-ͯ]/.test(c)) { i++; continue; }
    const r = TRL.find(([l]) => s.startsWith(l, i));
    if (r) { out += r[1]; i += r[0].length; continue; }
    i++;                                   // h (breathing) and anything else: left out
  }
  return out;
}
const hasWild = s => /[*?]/.test(s);
const finalS = s => s.replace(/σ(?![\u0370-\u03ff\u1f00-\u1fff])/g, 'ς');      // a Greek key shown: final sigma
const keyKeepWild = (s, f) => s.split(/([*?])/).map(p => p === '*' || p === '?' ? p : f(p)).join('');
// what to look for: one target per language (Greek letters → Greek; Latin letters → Latin and, as Greek in Latin letters, Greek)
function searchPlan(raw) {
  raw = raw.trim().replace(/\s+/g, ' ');
  const greek = isGreek(raw.replace(/[*?]/g, '')), mode = S.sc?.tog ? S.srchLang : 'all', T = [];
  if (greek) { if (mode !== 'la') T.push({ lang: 'grc', key: keyKeepWild(raw, gkey), via: 'grc' }); }
  else {
    if (mode !== 'grc') T.push({ lang: 'la', key: keyKeepWild(raw, s => latkey(s).replace(/[^a-z]/g, '')), via: 'la' });
    if (mode !== 'la' && (S.sc?.tr !== false || mode === 'grc')) {
      const g = keyKeepWild(latinToGreek(raw), gkey);
      if (g.replace(/[*?]/g, '')) T.push({ lang: 'grc', key: foldG(g), via: 'tr', fold: true, shown: g });   // (e and o also η and ω: always)
    }
  }
  return { raw, T: T.filter(t => t.key.replace(/[*?]/g, '')), wild: hasWild(raw) };
}
// headword keys for a plan: [{lang, k, d (0 exact · 1… similar · -1 begins with)}]
async function findKeys(plan, { limit = 40, fuzzy = true } = {}) {
  const out = [], seen = new Set();
  const add = (lang, k, d) => { const id = lang + '|' + k; if (seen.has(id)) return; seen.add(id); out.push({ lang, k, d }); };
  for (const t of plan.T) {
    const X = await hwIndex(t.lang); if (!X.P.n) continue;
    const P = t.fold ? X.F : X.P, real = i => t.fold ? X.P.key(X.fi[i]) : P.key(i);
    if (plan.wild) { for (const w of wildHits(P, t.key, 2000)) { if (t.fold) { for (const i of prefixHits(P, w, 50)) if (P.key(i) === w) add(t.lang, real(i), 0); } else add(t.lang, w, 0); } continue; }
    const pre = prefixHits(P, t.key, 600);             // (all of them, then the shortest first)
    for (const i of pre) if (P.key(i) === t.key) add(t.lang, real(i), 0);
    for (const i of pre) if (P.key(i) !== t.key) add(t.lang, real(i), -1);
  }
  out.sort((a, b) => (a.d === 0 ? 0 : 1) - (b.d === 0 ? 0 : 1) || a.k.length - b.k.length || (a.k < b.k ? -1 : 1));
  const res = out.slice(0, limit);
  if (fuzzy && !plan.wild && S.sc?.typo !== false && !res.some(x => x.d === 0) && res.length < 4) {
    for (const t of plan.T) {
      if (t.key.length < 3) continue;
      const X = await hwIndex(t.lang), P = t.fold ? X.F : X.P, real = i => t.fold ? X.P.key(X.fi[i]) : P.key(i);
      const max = S.sc?.dist === 2 && t.key.length >= 6 ? 2 : 1;
      for (const [i, d] of fuzzyHits(P, t.key, max, 12)) { const k = real(i); const id = t.lang + '|' + k; if (!seen.has(id)) { seen.add(id); res.push({ lang: t.lang, k, d }); } }
    }
  }
  return res;
}
// the entries of a key in the searched dictionaries (Settings → Search: switched on or all installed)
async function entriesIn(k, lang) {
  const out = [];
  for (const d of scDicts(lang)) {
    const b = await bucket(d, k); if (!b) continue;
    for (const e of b.e || []) if (e.k.includes(k)) out.push({ d, e });
  }
  return out;
}
const snipEl = document.createElement('template');
function snippet(html, k, max = 90) {
  snipEl.innerHTML = html; let t = snipEl.content.textContent.replace(/\s+/g, ' ').trim();
  const ws = t.split(' '); let i = 0;
  while (i < ws.length - 1 && i < 4 && (gkey(ws[i].replace(/[,;:.]+$/, '')) === k || !/\p{L}/u.test(ws[i]))) i++;
  t = ws.slice(i).join(' ').replace(/^[,;:.\s]+/, '');
  return t.length > max ? t.slice(0, t.lastIndexOf(' ', max) > 40 ? t.lastIndexOf(' ', max) : max) + ' …' : t;
}
// one line for a key: its headwords (accents, homographs), the dictionaries, the beginning of the first entry
async function hitInfo(h) {
  const es = await entriesIn(h.k, h.lang); if (!es.length) return null;
  const heads = [...new Set(es.map(x => x.e.h))].slice(0, 3), dn = [...new Set(es.map(x => x.d.name))];
  return Object.assign({ heads, dn, snip: snippet(es[0].e.html, h.k) }, h);
}
// the forms of the morphological analyses (accents not needed): "λογου" → λόγου, gen. sg. of λόγος
async function formsFor(plan) {
  const out = [];
  for (const t of plan.T) {
    if (plan.wild) continue;
    if (t.lang === 'la') {
      if (!S.latMorph) continue;
      const A = await latAnalyses(plan.raw);
      for (const x of A.lemmas) out.push({ lang: 'la', form: plan.raw, lemma: x.lemma, ana: x.ana });
      continue;
    }
    if (!S.morph) continue;
    let keys = [t.via === 'tr' ? (t.fold ? t.shown : t.key) : t.key];
    if (t.fold) {             // e and o: also η and ω (all combinations, at most 64)
      keys = [''];
      for (const c of t.key) { const alt = c === 'ε' ? ['ε', 'η'] : c === 'ο' ? ['ο', 'ω'] : [c]; keys = keys.flatMap(p => alt.map(a => p + a)); if (keys.length > 64) { keys = [t.shown]; break; } }
    }
    for (const k of keys) {
      const b = await bucket(S.morph, k); if (!b?.f) continue;
      for (const [f, an] of Object.entries(b.f)) if (gkey(f) === k) {
        const by = new Map(); for (const [l, a] of an) { if (!by.has(l)) by.set(l, []); by.get(l).push(a); }
        for (const [l, a] of by) out.push({ lang: 'grc', form: f, lemma: l, ana: a });
      }
    }
  }
  return out.slice(0, 60);
}

// ---------------------------------------------------------------- suggestions while typing (a list beneath the field)
let sgSeq = 0, sgT = null;
function sugBox() {
  let b = $('#sugg'); if (b) return b;
  b = document.createElement('div'); b.id = 'sugg'; b.hidden = true; b.setAttribute('role', 'listbox'); document.body.appendChild(b);
  b.addEventListener('pointerdown', e => e.preventDefault());           // the field keeps the keyboard
  b.addEventListener('click', e => { const r = e.target.closest('[data-sg]'); if (!r) return; pickSuggestion(+r.dataset.sg); });
  return b;
}
function placeSug() {
  const b = $('#sugg'), f = $('#search'); if (!b || b.hidden) return;
  const r = f.getBoundingClientRect(), vw = document.documentElement.clientWidth;
  const w = Math.min(vw - 12, Math.max(r.width, 300)), left = Math.max(6, Math.min(r.right - w, vw - w - 6));
  b.style.left = left + 'px'; b.style.top = r.bottom + 4 + 'px'; b.style.width = w + 'px';
  b.style.maxHeight = Math.max(160, (visualViewport?.height || innerHeight) - r.bottom - 14) + 'px';
}
const hideSug = () => { const b = $('#sugg'); if (b) b.hidden = true; S.sgItems = null; S.sgSel = -1; };
const langTag = l => `<i class="lt">${l === 'la' ? 'Lat' : 'Gr'}</i>`;
async function updateSuggestions() {
  const q = $('#search').value.trim(), my = ++sgSeq;
  if (!S.sc?.sugg || q.length < 2) return hideSug();
  const plan = searchPlan(q); if (!plan.T.length) return hideSug();
  const b = sugBox();
  if (!HW[plan.T[0].lang]?.p) { b.innerHTML = '<div class="sgnote">Preparing the word lists …</div>'; b.hidden = false; placeSug(); }
  const hits = await findKeys(plan, { limit: S.sc.n || 7 });
  const forms = plan.wild || hits.some(h => h.d === 0) ? [] : (await formsFor(plan)).slice(0, 2);
  const infos = (await Promise.all(hits.slice(0, S.sc.n || 7).map(hitInfo))).filter(Boolean);
  if (my !== sgSeq) return;
  const items = [...forms.map(x => ({ t: 'form', x })), ...infos.map(x => ({ t: 'hw', x }))];
  S.sgItems = items; S.sgSel = -1;
  const tr = plan.T.find(t => t.via === 'tr');
  const head = S.sc.tog && S.srchLang === 'grc' && tr ? `<div class="sgnote gk">→ ${esc(finalS(tr.shown))}</div>` : '';
  b.innerHTML = head + (items.length ? items.map((it, i) => it.t === 'form'
    ? `<div class="sgr sgf" data-sg="${i}" role="option"><span class="sgh gk">${esc(it.x.form)}</span><span class="sgs">→ <span class="gk">${esc(it.x.lemma)}</span> · ${esc(gramText(it.x.ana.slice(0, 1)) || '')}</span>${langTag(it.x.lang)}</div>`
    : `<div class="sgr" data-sg="${i}" role="option"><span class="sgh gk">${it.x.heads.map(esc).join(', ')}</span>${it.x.d > 0 ? '<i class="sim">similar</i>' : ''}<span class="sgs">${esc(it.x.snip)}</span>${langTag(it.x.lang)}</div>`).join('')
    : '<div class="sgnote">No headword found – Enter searches everything</div>')
    + '<div class="sgfoot">Enter: all results</div>';
  b.hidden = false; placeSug();
}
function moveSuggestion(d) {
  const b = $('#sugg'); if (!b || b.hidden || !S.sgItems?.length) return false;
  const n = S.sgItems.length; let k = S.sgSel + d; if (k < -1) k = n - 1; if (k >= n) k = -1; S.sgSel = k;
  b.querySelectorAll('[data-sg]').forEach(r => r.classList.toggle('sel', +r.dataset.sg === k));
  b.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  return true;
}
function pickSuggestion(i) {
  const it = S.sgItems?.[i]; if (!it) return;
  hideSug(); $('#search').blur();
  if (it.t === 'form') showWord(it.x.form, { lemma: it.x.lemma, fresh: true });
  else showWord(it.x.heads[0], { lemma: it.x.heads[0], fresh: true });
}

// ---------------------------------------------------------------- the results page (right pane)
function openSearch(q) {
  q = q.trim(); if (!q) return;
  hideSug(); $('#search').blur();
  saveSearchQuery(q);
  S.hist = []; S.fwd = [];
  S.view = { search: q };
  navButtons(); showTab('entry'); renderView();
}
function saveSearchQuery(q) { /* (a search history can be added here later) */ }
const SG_SHOW = 6;
function sgSection(id, title, inner, n = '') {
  return `<section class="sgrp" data-g="${id}"><h4>${title}${n !== '' ? ` <small>${n}</small>` : ''}</h4><div class="sgi">${inner}</div></section>`;
}
async function renderSearch(v, body) {
  const my = S.srchSeq = (S.srchSeq || 0) + 1, plan = searchPlan(v.search);
  const tr = plan.T.find(t => t.via === 'tr');
  body.innerHTML = `<div class="srch"><div class="vtop"><div class="form srq">${esc(v.search)}</div>${tr ? `<p class="note">Greek in Latin letters: <span class="gk">${esc(finalS(tr.shown))}</span>${tr.fold ? ' (e, o also η, ω)' : ''}</p>` : ''}</div>`
    + S.sc.groups.filter(g => g[1]).map(([id]) => { const G = SEARCH_GROUPS.find(x => x.id === id); return G ? sgSection(id, G.title, '<p class="hint small">searching …</p>') : ''; }).join('') + '</div>';
  S.dictRendering = false;
  const ctx = { plan, v, live: () => my === S.srchSeq && S.view === v };
  ctx.keys = findKeys(plan, { limit: 60 });
  ctx.forms = formsFor(plan);
  ctx.lemmas = (async () => {      // the lemmata the query stands for: exact headwords and the lemmata of matching forms
    const L = new Map();
    for (const h of await ctx.keys) if (h.d === 0) L.set(h.lang + '|' + h.k, { lang: h.lang, k: h.k });
    for (const f of await ctx.forms) { const k = gkey(f.lemma); L.set(f.lang + '|' + k, { lang: f.lang, k }); }
    return [...L.values()];
  })();
  for (const [id, on] of S.sc.groups) {
    if (!on) continue;
    const G = SEARCH_GROUPS.find(x => x.id === id); if (!G) continue;
    G.run(ctx).then(r => {
      if (!ctx.live()) return;
      const sec = body.querySelector(`.sgrp[data-g="${id}"]`); if (!sec) return;
      if (!r || !r.n) { sec.remove(); if (!body.querySelector('.sgrp')) body.querySelector('.srch').insertAdjacentHTML('beforeend', '<p class="hint">Nothing found.</p>'); return; }
      sec.outerHTML = sgSection(id, G.title, r.html, r.n);
    }).catch(e => { console.error(e); body.querySelector(`.sgrp[data-g="${id}"]`)?.remove(); });
  }
}
// rows with "more …": the first few shown, the rest one tap away
function moreList(rows, more = SG_SHOW) {
  if (rows.length <= more) return rows.join('');
  return rows.slice(0, more).join('') + `<div class="sgmore" hidden>${rows.slice(more).join('')}</div><button type="button" class="sgmb" data-sgmore="1">${rows.length - more} more …</button>`;
}
// 1. dictionaries: headwords (exact, beginning with, similar)
SEARCH_GROUPS.push({ id: 'dict', title: 'Dictionaries', async run(ctx) {
  const hits = await ctx.keys; if (!hits.length) return null;
  const infos = (await Promise.all(hits.slice(0, 40).map(hitInfo))).filter(Boolean);
  const rows = infos.map(x => `<button type="button" class="sgrow" data-sghw="${esc(x.heads[0])}" data-lang="${x.lang}"><span class="sgh gk">${x.heads.map(esc).join(', ')}</span>${x.d > 0 ? '<i class="sim">similar</i>' : x.d < 0 ? '' : ''}${langTag(x.lang)}<small class="sgd">${esc(x.dn.join(' · '))}</small><span class="sgs">${esc(x.snip)}</span></button>`);
  return { n: rows.length, html: moreList(rows) };
} });
// 2. forms
SEARCH_GROUPS.push({ id: 'forms', title: 'Forms', async run(ctx) {
  const F = await ctx.forms; if (!F.length) return null;
  const rows = F.map(x => `<button type="button" class="sgrow sgfr" data-sgform="${esc(x.form)}" data-lemma="${esc(x.lemma)}"><span class="sgh gk">${esc(x.form)}</span><span class="sgs">→ <b class="gk">${esc(x.lemma)}</b> · ${esc(x.ana.map(a => gramText([a]) || a).join('; '))}</span>${langTag(x.lang)}</button>`);
  return { n: rows.length, html: moreList(rows) };
} });
// 3. the open text (all parts of the open work): every occurrence of the lemmata
SEARCH_GROUPS.push({ id: 'text', title: 'In this text', async run(ctx) {
  const t = S.text; if (!t) return null;
  const L = await ctx.lemmas; if (!L.length) return null;
  const want = new Set(L.map(x => x.k));
  const hits = await findLemmasInWork(want, () => ctx.live());
  if (!hits.length) return null;
  const rows = hits.map(h => `<button type="button" class="sgrow sgctx${h.ref ? '' : ' noref'}" data-sggo="${h.bi ?? ''}" data-i="${h.i}">${h.ref ? `<small class="sgref">${esc(h.ref)}</small>` : ''}<span class="sgc gk">${h.ctx}</span></button>`);
  return { n: hits.length >= 2000 ? '2000+' : hits.length, html: moreList(rows, 8) };
} });
// the open work, part by part: words whose lemma is one of `want` (keys)
async function findLemmasInWork(want, live) {
  const t = S.text, w = t?.work, parts = w ? w.books.map((_, bi) => bi) : [null], out = [];
  const memo = S.lemMemo ??= new Map();
  const lemmaKeys = async f => { let r = memo.get(f); if (!r) { const A = await analyses(f); r = new Set(A.lemmas.map(x => gkey(x.lemma))); memo.set(f, r); } return r; };
  for (const bi of parts) {
    if (!live()) return out;
    const pid = w ? `w:${w.id}:${bi}` : `i:${t.id}`;
    let toks, blocks;
    if (bi == null || bi === t.bi) { toks = S.tokens; blocks = t.blocks; }
    else { const b = await libGet('books', w.id + '|' + bi); if (!b) continue; blocks = b.blocks; toks = tokenizeBlocks(blocks); if (b.ann && w.annL) applyAnnotation({ ann: b.ann, work: w, blocks }, toks); }
    const words = toks.filter(x => x.t === 'w'), refs = refsOf(toks, blocks);
    const ix = await idxPositions(pid, want);           // from the index of all texts, when it covers this part
    let ri = -1;
    for (let k = 0; k < words.length; k++) {
      const tk = words[k];
      const hit = ix ? ix.has(tk.i) : tk.ctx ? want.has(gkey(tk.ctx.l)) : [...await lemmaKeys(tk.s)].some(x => want.has(x));
      if (!hit) continue;
      while (ri + 1 < refs.length && refs[ri + 1].i <= tk.i) ri++;
      const ctx = words.slice(Math.max(0, k - 6), k + 7).map(x => x === tk ? `<b>${esc(x.s)}</b>` : esc(x.s)).join(' ');
      out.push({ bi, i: tk.i, ref: (w && w.books.length > 1 ? stripCommon(w.books)[bi] + ' · ' : '') + (ri >= 0 ? refs[ri].s : ''), ctx });
      if (out.length >= 2000) return out;
    }
  }
  return out;
}
// 4. all texts (the index)
SEARCH_GROUPS.push({ id: 'texts', title: 'In all texts', async run(ctx) {
  const L = await ctx.lemmas;
  const st = await idxState();
  let note = '';
  if (st.missing.length || st.stale) {
    if (!S.idxBuilding) idxBuild({ full: st.stale }).then(() => { if (S.view === ctx.v) renderView(); });
    note = `<p class="hint small idxprog">${st.done ? 'Adding' : 'Indexing'} the texts in the library … <span class="ixp">${S.idxProg || ''}</span></p>`;
  }
  if (!L.length) return note ? { n: '', html: note } : null;
  const by = await idxLookup(L.map(x => x.k));
  const titles = await partTitles();
  const rows = [...by.entries()].filter(([pid]) => titles.has(pid)).sort((a, b) => b[1].length - a[1].length)
    .map(([pid, pos]) => `<div class="sgpart"><button type="button" class="sgrow sgpt" data-sgpart="${esc(pid)}"><span class="sgh">${esc(titles.get(pid))}</span><small class="sgn">${pos.length}</small></button><div class="sgpc" hidden></div></div>`);
  if (!rows.length) return note ? { n: '', html: note } : null;
  return { n: rows.length + (rows.length === 1 ? ' text' : ' texts'), html: note + moreList(rows, 8) };
} });

// ---------------------------------------------------------------- the index of all texts
// lemma key → {part: positions}; parts: the books of the library's works ("w:<id>:<n>") and imported texts ("i:<id>")
let sdb = null;
function searchDB() {
  if (sdb) return Promise.resolve(sdb);
  return new Promise((res, rej) => { const r = indexedDB.open('pult-search', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('lem', { keyPath: 'k' }); r.result.createObjectStore('part', { keyPath: 'k' }); };
    r.onsuccess = () => res(sdb = r.result); r.onerror = () => rej(r.error); });
}
const idxSig = () => [S.morph?.version || S.morph?.count || '-', S.latMorph ? S.latMorph.id + ':' + (S.latMorph.version || '') : '-', S.hints?.version || '-'].join('|');
function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i += 7) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + s.length; }
async function allParts() {
  const out = [];
  for (const w of await libWorks()) w.books.forEach((_, bi) => out.push({ k: `w:${w.id}:${bi}`, v: w.version || w.added || '', title: `${w.title} · ${w.books[bi]}`, work: w, bi }));
  for (const t of await getAll('texts')) out.push({ k: `i:${t.id}`, v: strHash(t.text || JSON.stringify(t.blocks || '')), title: t.title || 'Text ' + t.id, t });
  return out;
}
async function partTitles() { return new Map((await allParts()).map(p => [p.k, p.title])); }
async function idxState() {
  const d = await searchDB(), have = await req2p(d.transaction('part').objectStore('part').getAll());
  const meta = have.find(p => p.k === '#meta'), H = new Map(have.filter(p => p.k !== '#meta').map(p => [p.k, p]));
  const parts = await allParts();
  const stale = !!meta && meta.sig !== idxSig() || parts.some(p => H.has(p.k) && H.get(p.k).v !== p.v);
  return { parts, done: H.size, missing: parts.filter(p => !H.has(p.k)), stale, built: meta?.built || null, words: [...H.values()].reduce((a, p) => a + (p.n || 0), 0) };
}
async function idxLookup(keys) {
  const d = await searchDB(), os = d.transaction('lem').objectStore('lem'), by = new Map();
  for (const r of await Promise.all(keys.map(k => req2p(os.get(k))))) if (r) for (const [pid, s] of Object.entries(r.p)) { const a = by.get(pid) || new Set(); for (const x of s.split(',')) a.add(+x); by.set(pid, a); }
  return new Map([...by].map(([k, v]) => [k, [...v].sort((a, b) => a - b)]));
}
async function idxPositions(pid, want) {         // the positions of `want` in one part, if the index covers it (else null)
  const d = await searchDB(), p = await req2p(d.transaction('part').objectStore('part').get(pid));
  if (!p) return null;
  const by = await idxLookup([...want]); return new Set(by.get(pid) || []);
}
async function partTokens(p) {
  if (p.work) { const b = await libGet('books', p.work.id + '|' + p.bi); if (!b) return null; const toks = tokenizeBlocks(b.blocks); if (b.ann && p.work.annL) applyAnnotation({ ann: b.ann, work: p.work, blocks: b.blocks }, toks); return { toks, blocks: b.blocks }; }
  const t = p.t; return { toks: t.blocks ? tokenizeBlocks(t.blocks) : tokenize(t.text || ''), blocks: t.blocks };
}
// built once (in the background, a part at a time); new texts are added; Settings → Search: Rebuild
async function idxBuild({ full = false } = {}) {
  if (S.idxBuilding) return S.idxBuilding;
  S.idxBuilding = (async () => {
    const d = await searchDB();
    if (full) { const t = d.transaction(['lem', 'part'], 'readwrite'); t.objectStore('lem').clear(); t.objectStore('part').clear(); await done(t); }
    const st = await idxState(), todo = st.missing;
    const memo = new Map();
    const lemmaKeys = async f => { let r = memo.get(f); if (!r) { const A = await analyses(f); r = A.lemmas.map(x => gkey(x.lemma)); memo.set(f, r); } return r; };
    let acc = new Map(), accN = 0;
    const flush = async () => {
      if (!acc.size) return;
      const keys = [...acc.keys()];
      for (let i = 0; i < keys.length; i += 400) {
        const t = d.transaction('lem', 'readwrite'), os = t.objectStore('lem');
        await Promise.all(keys.slice(i, i + 400).map(async k => { const r = (await req2p(os.get(k))) || { k, p: {} }; Object.assign(r.p, acc.get(k)); os.put(r); }));
        await done(t);
      }
      acc = new Map(); accN = 0;
    };
    let n = 0;
    for (const p of todo) {
      S.idxProg = `${++n} of ${todo.length}`; document.querySelectorAll('.ixp').forEach(e => { e.textContent = S.idxProg; });
      const pt = await partTokens(p); if (!pt) continue;
      const pos = new Map(); let nw = 0;
      for (const tk of pt.toks) {
        if (tk.t !== 'w') continue; nw++;
        const ks = tk.ctx?.l ? [gkey(tk.ctx.l)] : await lemmaKeys(tk.s);
        for (const k of ks) { if (!k) continue; let a = pos.get(k); if (!a) pos.set(k, a = []); a.push(tk.i); }
      }
      for (const [k, a] of pos) { let r = acc.get(k); if (!r) acc.set(k, r = {}); r[p.k] = a.join(','); }
      accN += nw;
      { const t = d.transaction('part', 'readwrite'); t.objectStore('part').put({ k: p.k, v: p.v, n: nw }); await done(t); }
      if (accN > 150000) await flush();
      await new Promise(r => setTimeout(r, 0));
    }
    await flush();
    { const t = d.transaction('part', 'readwrite'); t.objectStore('part').put({ k: '#meta', sig: idxSig(), built: Date.now() }); await done(t); }
    S.idxEverBuilt = true; S.idxProg = '';
  })().finally(() => { S.idxBuilding = null; });
  return S.idxBuilding;
}

// ---------------------------------------------------------------- the field, the results page's taps
// the Greek/Latin icon: the letters a and α of Gentium Book Plus as outlines, centred (not text)
const SRCH_LANG_ICON = '<svg viewBox="0 0 30 20" width="30" height="20" aria-hidden="true"><path class="la" d="M12.78 13.77Q11.92 14.35 11.25 14.68Q10.58 15 10.27 15Q9.89 15 9.66 14.47Q9.42 13.94 9.42 13.04V7.66Q9.42 6.99 9.09 6.54Q8.76 6.09 7.85 6.11Q7.26 6.12 6.76 6.48Q6.27 6.85 6.33 7.45Q6.34 7.56 6.08 7.68Q5.82 7.8 5.45 7.91Q5.09 8.02 4.76 8.08Q4.43 8.14 4.31 8.11L4.15 7.67Q4.46 6.95 5.2 6.34Q5.94 5.74 6.9 5.37Q7.85 5 8.8 5Q9.99 5 10.62 5.62Q11.24 6.24 11.24 7.27V12.7Q11.24 13.48 11.64 13.48Q11.78 13.48 11.99 13.43Q12.21 13.37 12.61 13.21ZM9.52 9.82Q8.46 9.99 7.86 10.15Q7.27 10.31 6.95 10.49Q6.64 10.68 6.43 10.89Q6.17 11.16 6.01 11.49Q5.84 11.83 5.84 12.28Q5.84 12.79 6.03 13.06Q6.22 13.33 6.46 13.43Q6.71 13.54 6.88 13.54Q7.43 13.54 8.08 13.24Q8.72 12.94 9.52 12.23L9.6 13.11Q8.65 14.13 7.71 14.57Q6.77 15 6.09 15Q5.57 15 5.07 14.77Q4.56 14.54 4.22 14.04Q3.88 13.55 3.88 12.77Q3.88 12.02 4.15 11.52Q4.41 11.02 4.78 10.65Q5.11 10.31 5.59 10.03Q6.08 9.74 6.99 9.48Q7.9 9.22 9.52 8.98Z"/><path class="gr" d="M19.31 15Q17.98 15 17.05 13.85Q16.12 12.7 16.12 10.54Q16.12 9.07 16.67 7.81Q17.23 6.56 18.19 5.78Q19.15 5 20.36 5Q21.29 5 22.04 5.75Q22.78 6.49 23.18 7.99Q23.34 7.3 23.44 6.66Q23.55 6.01 23.53 5.44Q23.97 5.37 24.66 5.25Q25.34 5.13 25.81 5Q25.88 5.1 25.93 5.24Q25.98 5.38 26.03 5.46Q25.47 5.77 25.07 6.23Q24.67 6.69 24.33 7.53Q23.99 8.37 23.6 9.85Q23.79 11.09 23.95 11.81Q24.12 12.54 24.26 12.89Q24.41 13.24 24.54 13.35Q24.67 13.45 24.81 13.45Q24.97 13.45 25.29 13.39Q25.61 13.33 25.97 13.18Q25.99 13.27 26.04 13.43Q26.08 13.59 26.12 13.74Q25.42 14.31 24.74 14.66Q24.07 15 23.63 15Q23.22 15 22.97 14.43Q22.72 13.86 22.51 12.22Q21.72 13.7 20.86 14.35Q19.99 15 19.31 15ZM19.76 13.4Q20.28 13.4 20.74 12.97Q21.2 12.55 21.58 11.88Q21.96 11.21 22.25 10.49Q21.96 8.26 21.3 7.2Q20.64 6.13 19.81 6.13Q19.34 6.13 18.88 6.52Q18.43 6.9 18.13 7.69Q17.83 8.48 17.83 9.72Q17.83 10.64 18.07 11.48Q18.3 12.32 18.73 12.86Q19.16 13.4 19.76 13.4Z"/></svg>';
function srchLangBtn() {
  let b = $('#srchLang');
  if (!S.sc?.tog) { b?.remove(); return; }
  if (!b) { b = document.createElement('button'); b.id = 'srchLang'; b.type = 'button'; $('#search').after(b);
    b.onclick = () => { S.srchLang = { all: 'grc', grc: 'la', la: 'all' }[S.srchLang] || 'all'; setting('srchLang', S.srchLang); srchLangBtn(); if ($('#search').value.trim()) updateSuggestions(); }; }
  const m = S.srchLang || 'all';
  b.innerHTML = SRCH_LANG_ICON; b.dataset.m = m;     // the language(s) searched light up, the other is faint
  b.setAttribute('aria-label', m === 'grc' ? 'Greek only' : m === 'la' ? 'Latin only' : 'Greek and Latin');
  b.title = m === 'grc' ? 'Searching Greek (Latin letters become Greek) – tap for Latin' : m === 'la' ? 'Searching Latin – tap for both' : 'Searching Greek and Latin – tap for Greek only';
}
function wireSearch() {
  const f = $('#search');
  f.addEventListener('input', () => { clearTimeout(sgT); sgT = setTimeout(updateSuggestions, 110); });
  f.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { if (moveSuggestion(ev.key === 'ArrowDown' ? 1 : -1)) ev.preventDefault(); return; }
    if (ev.key === 'Escape') { if (!$('#sugg')?.hidden) { hideSug(); ev.preventDefault(); } return; }
    if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); if (S.sgSel >= 0 && S.sgItems?.[S.sgSel]) pickSuggestion(S.sgSel); else if (f.value.trim()) openSearch(f.value); }
  });
  f.addEventListener('blur', () => setTimeout(hideSug, 150));
  f.addEventListener('focus', () => { if (f.value.trim()) updateSuggestions(); });
  addEventListener('resize', placeSug); visualViewport?.addEventListener('resize', placeSug);
  $('#dictBody').addEventListener('click', async ev => {
    const m = ev.target.closest('[data-sgmore]'); if (m) { m.previousElementSibling.hidden = false; m.remove(); return; }
    const hw = ev.target.closest('[data-sghw]'); if (hw) return showWord(hw.dataset.sghw, { lemma: hw.dataset.sghw });
    const fr = ev.target.closest('[data-sgform]'); if (fr) return showWord(fr.dataset.sgform, { lemma: fr.dataset.lemma });
    const go = ev.target.closest('[data-sggo]'); if (go) return goToHit(go.dataset.sggo === '' ? null : +go.dataset.sggo, +go.dataset.i);
    const pt = ev.target.closest('[data-sgpart]'); if (pt) return togglePart(pt);
    const pc = ev.target.closest('[data-sgopen]'); if (pc) return openHit(pc.dataset.sgopen, +pc.dataset.i);
  });
}
// an occurrence in the open text: there, marked, its entry in the pane (the results page stays one step back)
async function goToHit(bi, i) {
  if (bi != null && S.text?.work && bi !== S.text.bi) await openText(`w:${S.text.work.id}:${bi}`, false);
  await selectWordAt(i);
}
async function selectWordAt(i) {
  S.cur = [i, i]; S.curHidden = false; markTarget();
  requestAnimationFrame(() => scrollToWord(i));
  const tk = S.tokens.find(t => t.t === 'w' && t.i === i); if (tk) await showWord(tk.s, { ti: i, keep: true });
}
async function openHit(pid, i) {
  const id = pid.startsWith('w:') ? pid : +pid.slice(2);
  if (S.text?.id !== id) await openText(id, false);
  await selectWordAt(i);
}
async function togglePart(btn) {
  const box = btn.nextElementSibling; if (!box.hidden) { box.hidden = true; btn.classList.remove('on'); return; }
  btn.classList.add('on'); box.hidden = false;
  if (box.dataset.done) return;
  box.innerHTML = '<p class="hint small">…</p>';
  const v = S.view, plan = searchPlan(v.search), pid = btn.dataset.sgpart;
  const keys = new Set(); for (const h of await findKeys(plan, { limit: 60, fuzzy: false })) if (h.d === 0) keys.add(h.k);
  for (const f of await formsFor(plan)) keys.add(gkey(f.lemma));
  const pos = new Set((await idxLookup([...keys])).get(pid) || []);
  const p = (await allParts()).find(x => x.k === pid), pt = p && await partTokens(p); if (!pt) { box.innerHTML = ''; return; }
  const words = pt.toks.filter(x => x.t === 'w'), refs = refsOf(pt.toks, pt.blocks); let ri = -1; const rows = [];
  for (let k = 0; k < words.length; k++) {
    const tk = words[k]; if (!pos.has(tk.i)) continue;
    while (ri + 1 < refs.length && refs[ri + 1].i <= tk.i) ri++;
    const rf = ri >= 0 ? refs[ri].s : '';
    rows.push(`<button type="button" class="sgrow sgctx${rf ? '' : ' noref'}" data-sgopen="${esc(pid)}" data-i="${tk.i}">${rf ? `<small class="sgref">${esc(rf)}</small>` : ''}<span class="sgc gk">${words.slice(Math.max(0, k - 6), k + 7).map(x => x === tk ? `<b>${esc(x.s)}</b>` : esc(x.s)).join(' ')}</span></button>`);
  }
  box.innerHTML = moreList(rows, 8); box.dataset.done = 1;
}

// ---------------------------------------------------------------- Settings → Search
const scSw = (k, label, hint = '') => `<label class="srow1 swr"><span>${label}${hint ? `<small class="hint">${hint}</small>` : ''}</span>${SW(`data-scset="${k}"`, !!S.sc[k])}</label>`;
const scSeg = (k, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" class="${String(S.sc[k]) === String(v) ? 'on' : ''}" data-scseg="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
const scLine = (label, ctl, hint = '') => `<div class="mline"><span>${label}${hint ? `<small class="hint">${hint}</small>` : ''}</span>${ctl}</div>`;
const scSec = (title, body) => `<section class="rsec"><div class="rhd"><span>${title}</span></div>${body}</section>`;
function scGroupsHTML() {
  const G = S.sc.groups;
  return G.map(([id, on], i) => { const g = SEARCH_GROUPS.find(x => x.id === id);
    // ⠿ drag to reorder · the switch on the left · the name
    return `<div class="srow1 swr scg" data-gid="${esc(id)}"><span class="grip" title="Drag to reorder" aria-label="Drag to reorder">⠿</span>${SW(`data-scgrp="${i}"`, on)}<span>${g?.title || id}</span></div>`; }).join('');
}
function searchSettingsHTML() {
  return scSec('Suggestions', scSw('sugg', 'Suggestions while typing', 'a list beneath the search field; Enter shows all results')
      + scLine('Lines in the list', scSeg('n', [[7, '7'], [14, '14'], [21, '21']])))
    + scSec('Greek in Latin letters', scSw('tr', 'Find Greek words typed in Latin letters', 'logos → λόγος, psyche → ψυχή; e and o also find η and ω; betacode too (lo/gos)')
      + scSw('tog', 'Greek/Latin button beside the search field', 'to search one language only'))
    + scSec('Typo tolerance', scSw('typo', 'Similar words when nothing matches exactly')
      + scLine('How far off', scSeg('dist', [[1, '1 letter'], [2, '2 letters']]), '2 letters only for words of 6 letters or more'))
    + scSec('Results page', `<div class="scgroups">${scGroupsHTML()}</div><small class="hint rhint">⠿ drag to change the order of the groups; more kinds of data will appear here</small>`)
    + scSec('Library', scSw('libWords', 'Find words in the texts too', 'the Library’s search also lists the works on this device in which the word occurs'))
    + scSec('Dictionaries searched', scLine('Which dictionaries', scSeg('dicts', [['on', 'Switched on'], ['all', 'All installed']])))
    + scSec('Index of all texts', `<div class="srow1 swr"><span id="scIdx">…<small class="hint">built once; new texts are added when you search</small></span><button type="button" data-scidx="1">Rebuild</button></div>`);
}
async function scIdxInfo() {
  const el = $('#scIdx'); if (!el) return;
  const st = await idxState(), hint = '<small class="hint">built once; new texts are added when you search</small>';
  const date = st.built ? new Date(st.built).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  el.innerHTML = S.idxBuilding ? `Building … <span class="ixp">${S.idxProg || ''}</span>${hint}`
    : !st.done ? `Not built yet · ${st.parts.length} texts in the library${hint}`
    : `${st.done} of ${st.parts.length} texts · ${st.words.toLocaleString('en')} words${date ? ' · ' + date : ''}${st.stale ? ' · <b>out of date</b>' : ''}${hint}`;
}
function wireSearchSettings() {
  document.addEventListener('change', async ev => {
    const t = ev.target, k = t.dataset?.scset, g = t.dataset?.scgrp; if (!k && g == null) return;
    if (k) S.sc[k] = t.checked; else S.sc.groups[+g][1] = t.checked;
    await saveSearchCfg();
    if (k === 'tog') srchLangBtn();
  });
  document.addEventListener('click', async ev => {
    const s = ev.target.closest?.('#dlg [data-scseg]');
    if (s) { const k = s.dataset.scseg, v = s.dataset.v; S.sc[k] = /^\d+$/.test(v) ? +v : v;
      s.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === s));
      if (k === 'dicts') { HW.grc = HW.la = null; }
      return saveSearchCfg(); }
    if (ev.target.closest?.('#dlg [data-scidx]')) { const b = ev.target.closest('[data-scidx]'); b.disabled = true;
      const tick = setInterval(scIdxInfo, 700); scIdxInfo();
      try { await idxBuild({ full: true }); } finally { clearInterval(tick); b.disabled = false; scIdxInfo(); } }
  });
}
