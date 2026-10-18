/* Pult – revisions of the library's works (v213). When a corrected version of a downloaded work is in the catalogue,
   the Library marks it with a faint "rev."; the work's page leads to the changes: the passages whose words or punctuation
   changed (old and new), how many annotations (lemma and grammar of a word) were corrected, and changes of the structure
   (parts, references). The revision is accepted or rejected as a whole. Accepting moves your glosses, chosen analyses,
   place marks, marker and reading position to their words in the new text; a gloss whose word itself changed is marked
   (in the text and in a list) to be checked. The previous version is kept for 7 days and can be returned to.
   Settings → Library: the notices on or off, rejected revisions reconsidered.
   (see core.js for the order of the scripts) */
'use strict';
const REV_KEEP = 7 * 864e5;                 // the previous version is kept for 7 days

// ---------------------------------------------------------------- comparing two versions of a part
// the compared sequence: the words and the punctuation marks (spaces left out); a word keeps its number
function revSeq(toks) {
  const s = [], w = [];
  for (const x of toks) {
    if (x.t === 'w') { s.push(x.s); w.push(x.i); }
    else if (x.t === 'p') for (const ch of x.s.replace(/\s+/g, '')) { s.push(ch); w.push(-1); }
  }
  return { s, w };
}
// the matching items of two sequences (Myers' diff, after the common beginning and end are taken off);
// null when they differ too much to be worth comparing item by item
function revMatch(a, b, maxD = 1500) {
  let p = 0; const N0 = a.length, M0 = b.length;
  while (p < N0 && p < M0 && a[p] === b[p]) p++;
  let q = 0; while (q < N0 - p && q < M0 - p && a[N0 - 1 - q] === b[M0 - 1 - q]) q++;
  const A = a.slice(p, N0 - q), B = b.slice(p, M0 - q), N = A.length, M = B.length;
  const pairs = [];
  for (let i = 0; i < p; i++) pairs.push([i, i]);
  if (N && M) {
    const off = maxD + 1, V = new Int32Array(2 * maxD + 3), trace = [];
    let found = -1;
    outer: for (let d = 0; d <= maxD; d++) {
      trace.push(V.slice(off - d - 1, off + d + 2));
      for (let k = -d; k <= d; k += 2) {
        let x = (k === -d || (k !== d && V[off + k - 1] < V[off + k + 1])) ? V[off + k + 1] : V[off + k - 1] + 1, y = x - k;
        while (x < N && y < M && A[x] === B[y]) { x++; y++; }
        V[off + k] = x;
        if (x >= N && y >= M) { found = d; break outer; }
      }
    }
    if (found < 0) return null;
    const mid = []; let x = N, y = M;
    for (let d = found; d > 0; d--) {
      const T = trace[d], at = k => T[k + d + 1], k = x - y;
      const pk = (k === -d || (k !== d && at(k - 1) < at(k + 1))) ? k + 1 : k - 1;
      const px = at(pk), py = px - pk;
      while (x > px && y > py) { x--; y--; mid.push([x, y]); }   // the diagonal back to the edit
      x = px; y = py;
    }
    while (x > 0 && y > 0) { x--; y--; mid.push([x, y]); }
    mid.reverse(); for (const [i, j] of mid) pairs.push([i + p, j + p]);
  }
  for (let i = 0; i < q; i++) pairs.push([N0 - q + i, M0 - q + i]);
  return pairs;
}
// one part, old against new: the word map (old word number → new, or -1 where the word changed), the changed passages,
// the corrected annotations
function revPart(oldP, newP, oldW, newW) {
  const so = revSeq(oldP.toks), sn = revSeq(newP.toks);
  const pairs = revMatch(so.s, sn.s);
  const nOld = so.w.filter(x => x >= 0).length, map = new Int32Array(nOld).fill(-1);
  if (!pairs) return { map, whole: true, hunks: [{ ref: '', del: '…', ins: '…', whole: true }], ann: 0, annEx: [] };
  for (const [i, j] of pairs) if (so.w[i] >= 0 && sn.w[j] >= 0) map[so.w[i]] = sn.w[j];
  // the passages between matching items
  const refs = refsOf(oldP.toks, oldP.blocks), refAt = wi => { let r = ''; for (const x of refs) { if (x.i <= wi) r = x.s; else break; } return r; };
  const hunks = []; let pi = -1, pj = -1;
  const ctx = (seq, from, to) => seq.s.slice(Math.max(0, from), Math.max(0, to)).join(' ');
  const flush = (i, j) => {
    if (i - pi > 1 || j - pj > 1) {
      const del = so.s.slice(pi + 1, i), ins = sn.s.slice(pj + 1, j);
      const wi = so.w.slice(0, pi + 2).filter(x => x >= 0).pop() ?? 0;
      hunks.push({ ref: refAt(wi), before: ctx(so, pi - 5, pi + 1), del: del.join(' '), ins: ins.join(' '), after: ctx(so, i, i + 5) });
    }
  };
  for (const [i, j] of pairs) { flush(i, j); pi = i; pj = j; }
  flush(so.s.length, sn.s.length);
  // annotations (lemma and grammar) of the words that stayed the same
  let ann = 0; const annEx = [];
  const A = (P, W) => { const ws = P.toks.filter(x => x.t === 'w'); return ws.map(tk => tk.ctx ? tk.ctx.l + ' ' + tk.ctx.t : ''); };
  const ao = A(oldP, oldW), an = A(newP, newW), wo = oldP.toks.filter(x => x.t === 'w'), wn = newP.toks.filter(x => x.t === 'w');
  for (let i = 0; i < map.length; i++) {
    const j = map[i]; if (j < 0 || ao[i] === an[j]) continue;
    ann++; if (annEx.length < 40) annEx.push({ ref: refAt(i), w: wo[i]?.s || '', from: ao[i] || '–', to: an[j] || '–' });
  }
  return { map, whole: false, hunks, ann, annEx, refsOld: refs.map(r => r.s), refsNew: refsOf(newP.toks, newP.blocks).map(r => r.s), words: wn.length };
}
// the whole work: the new version fetched (not installed) and compared part by part
async function revCompare(key, progress) {
  const c = S.catWork?.[key]; if (!c) throw new Error('not in the catalogue');
  const r = await fetch('texts/works/' + key + '.json.gz', { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status);
  const blob = await r.blob(), pkg = await readPackage(new File([blob], key + '.json.gz'));
  const oldW = await libGet('works', key);
  const newW = { id: key, annL: pkg.annL, books: pkg.books.map(b => b.label) };
  // parts: by number when there are as many, otherwise by their names
  const pairs = [], addN = [], remO = [];
  if (oldW.books.length === newW.books.length) oldW.books.forEach((_, i) => pairs.push([i, i]));
  else { oldW.books.forEach((l, i) => { const j = newW.books.indexOf(l); if (j >= 0) pairs.push([i, j]); else remO.push(i); }); newW.books.forEach((l, j) => { if (!pairs.some(p => p[1] === j)) addN.push(j); }); }
  const parts = [];
  for (const [n, [i, j]] of pairs.entries()) {
    progress?.(n / pairs.length);
    const ob = await libGet('books', key + '|' + i), nb = pkg.books[j]; if (!ob || !nb) continue;
    const ot = tokenizeBlocks(ob.blocks), nt = tokenizeBlocks(nb.blocks);
    if (ob.ann && oldW.annL) applyAnnotation({ ann: ob.ann, work: oldW, blocks: ob.blocks }, ot);
    if (nb.ann && newW.annL) applyAnnotation({ ann: nb.ann, work: newW, blocks: nb.blocks }, nt);
    const R = revPart({ toks: ot, blocks: ob.blocks }, { toks: nt, blocks: nb.blocks }, oldW, newW);
    parts.push(Object.assign(R, { oi: i, ni: j, label: newW.books[j] }));
    await new Promise(res => setTimeout(res, 0));
  }
  progress?.(1);
  const struct = [];
  if (addN.length) struct.push(`${addN.length === 1 ? 'a part added' : addN.length + ' parts added'}: ${addN.map(j => newW.books[j]).join(', ')}`);
  if (remO.length) struct.push(`${remO.length === 1 ? 'a part removed' : remO.length + ' parts removed'}: ${remO.map(i => oldW.books[i]).join(', ')}`);
  if (oldW.books.length === newW.books.length && oldW.books.some((l, i) => l !== newW.books[i])) struct.push('parts renamed');
  for (const P of parts) {
    if (P.whole || !P.refsOld) continue;
    const so = new Set(P.refsOld), sn = new Set(P.refsNew), add = P.refsNew.filter(x => !so.has(x)).length, rem = P.refsOld.filter(x => !sn.has(x)).length;
    if (add || rem) struct.push(`${P.label}: references ${[add ? add + ' new' : '', rem ? rem + ' no longer' : ''].filter(Boolean).join(', ')}`);
  }
  return { key, v: c.v, blob, pkg, parts, struct, remO, at: Date.now() };
}

// ---------------------------------------------------------------- moving your traces to the new text
// a word number in the new text: the same word, or (where it changed) the nearest word that stayed
function revNear(map, i) {
  if (i < map.length && map[i] >= 0) return { j: map[i], same: true };
  for (let d = 1; d < map.length; d++) {
    if (i - d >= 0 && i - d < map.length && map[i - d] >= 0) return { j: map[i - d] + 1, same: false };
    if (i + d < map.length && map[i + d] >= 0) return { j: Math.max(0, map[i + d] - 1), same: false };
  }
  return { j: 0, same: false };
}
async function revMoveTraces(key, parts) {
  let flagged = 0;
  for (const P of parts) {
    const from = `w:${key}:${P.oi}`, to = `w:${key}:${P.ni}`, map = P.map;
    for (const g of await req2p(tx('glosses').objectStore('glosses').index('textId').getAll(from))) {
      const a = revNear(map, g.s), b = revNear(map, g.e);
      let same = a.same && b.same; for (let i = g.s; same && i <= g.e; i++) if (map[i] < 0) same = false;
      g.textId = to; g.s = a.j; g.e = Math.max(a.j, b.j);
      if (!same) { g.rv = 1; flagged++; }
      await put('glosses', g);
    }
    for (const pre of ['an|', 'pl|']) {
      const rs = await getAll('settings', IDBKeyRange.bound(`${pre}${from}|`, `${pre}${from}|￿`));
      for (const r of rs) {
        const i = +r.k.slice(r.k.lastIndexOf('|') + 1), m = revNear(map, i);
        await del('settings', r.k);
        if (m.same) await setting(`${pre}${to}|${m.j}`, r.v);
      }
    }
    const mk = await setting('mk|' + from);
    if (mk != null) { await del('settings', 'mk|' + from); await setting('mk|' + to, revNear(map, mk).j); }
    const pw = await setting('pw|' + from);
    if (pw?.i != null) { await del('settings', 'pw|' + from); await setting('pw|' + to, { i: revNear(map, pw.i).j, off: pw.off }); }
    if (from !== to) { const pos = await setting('pos|' + from); if (pos != null) { await del('settings', 'pos|' + from); await setting('pos|' + to, pos); } }
  }
  return flagged;
}
// a work written into the library from records (the previous version, when returning to it)
async function revWrite(work, books) {
  const d = await libDB(); const t = d.transaction(['works', 'books'], 'readwrite'); const bs = t.objectStore('books');
  bs.delete(IDBKeyRange.bound(work.id + '|', work.id + '|￿'));
  for (const b of books) bs.put(b);
  t.objectStore('works').put(work);
  await done(t);
}
async function revAccept(key) {
  const R = S.revData?.[key]; if (!R) return;
  const old = await libGet('works', key), books = [];
  for (let i = 0; i < old.books.length; i++) { const b = await libGet('books', key + '|' + i); if (b) books.push(b); }
  await setting('rprev|' + key, { at: Date.now(), work: old, books, v: R.v });                // kept for 7 days
  const flagged = await revMoveTraces(key, R.parts);
  await installWork(new File([R.blob], key + '.json.gz'), R.v);
  S.libInst[key] = await libGet('works', key);
  if (S.revRej?.[key]) { delete S.revRej[key]; await setting('revRej', S.revRej); }
  S.partRefCache = {}; S.lmPT = new Map(); S.revData[key] = null; await revPrevLoad();
  if (curKey() === key) await openText(S.text.id);
  S.revDone = { key, flagged };
  await lmTraces();
}
async function revReject(key) {
  const c = S.catWork?.[key]; if (!c) return;
  (S.revRej ??= {})[key] = c.v; await setting('revRej', S.revRej);
  S.revData && (S.revData[key] = null);
}
// back to the previous version (within 7 days): your traces move back the same way
async function revReturn(key) {
  const P = await setting('rprev|' + key); if (!P) return;
  const curW = await libGet('works', key), parts = [];
  const pairs = curW.books.length === P.work.books.length ? curW.books.map((_, i) => [i, i]) : curW.books.map((l, i) => [i, P.work.books.indexOf(l)]).filter(p => p[1] >= 0);
  for (const [i, j] of pairs) {
    const cb = await libGet('books', key + '|' + i), pb = P.books.find(b => b.k === key + '|' + j); if (!cb || !pb) continue;
    const ct = tokenizeBlocks(cb.blocks), pt = tokenizeBlocks(pb.blocks);
    const R = revPart({ toks: ct, blocks: cb.blocks }, { toks: pt, blocks: pb.blocks }, curW, P.work);
    parts.push(Object.assign(R, { oi: i, ni: j }));
  }
  const flagged = await revMoveTraces(key, parts);
  await revWrite(P.work, P.books);
  await del('settings', 'rprev|' + key);
  const c = S.catWork?.[key]; if (c?.v) { (S.revRej ??= {})[key] = c.v; await setting('revRej', S.revRej); }   // the revision is not offered again
  S.libInst[key] = await libGet('works', key); S.partRefCache = {}; S.lmPT = new Map(); await revPrevLoad();
  if (curKey() === key) await openText(S.text.id);
  S.revDone = { key, flagged, back: true };
  await lmTraces();
}
// previous versions kept: loaded with the Library (and dropped after 7 days)
async function revPrevLoad() {
  S.rprev = {};
  for (const r of await getAll('settings', IDBKeyRange.bound('rprev|', 'rprev|￿'))) {
    const key = r.k.slice(6);
    if (Date.now() - (r.v?.at || 0) > REV_KEEP) await del('settings', r.k); else S.rprev[key] = r.v.at;
  }
}

// ---------------------------------------------------------------- in the Library
// on the page of a work: returning to the previous version, and the glosses to be checked
function revBackHTML(key) {
  let h = '';
  const at = S.rprev?.[key];
  if (at) { const until = new Date(at + REV_KEEP).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    h += `<p class="lwrev">Revision accepted on ${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · <button type="button" class="linkb" data-revback="${esc(key)}">Return to the previous version</button> <small>(until ${until})</small></p>`; }
  const n = S.revFlags?.get(key) || 0;
  if (n) h += `<p class="lwrev">${n} gloss${n === 1 ? '' : 'es'} on changed words · <button type="button" class="linkb" data-revflags="${esc(key)}">check them</button></p>`;
  return h;
}
// glosses marked to be checked, per work
async function revFlagsLoad() {
  const F = new Map();
  for (const g of await getAll('glosses')) if (g.rv) { const k = keyOfText(g.textId); if (k) F.set(k, (F.get(k) || 0) + 1); }
  S.revFlags = F;
}
// the revision page: Library › Work › Revision
async function revPageHTML(key) {
  const W = workInfo(key), a = authorOf(W);
  let h = `<div class="dlghead lmhead lwhead"><h3><button type="button" class="crumb" data-lmback="1" title="Back to the Library">Library</button><span class="csep" aria-hidden="true">›</span><button type="button" class="crumb" data-revclose="1" title="Back to the work">${esc(W.title)}</button><span class="csep" aria-hidden="true">›</span><span class="ccur">${S.lmRev === 'flags' ? 'Glosses to check' : 'Revision'}</span></h3></div>`;
  if (S.lmRev === 'flags') return h + await revFlagsHTML(key);
  const D = S.revDone?.key === key ? S.revDone : null;
  if (D) {
    h += `<p class="rvdone">${D.back ? 'The previous version is back.' : 'The revision is accepted.'} ${D.flagged ? `${D.flagged} gloss${D.flagged === 1 ? '' : 'es'} belonged to changed words – they are marked in the text and listed below; please check them.` : 'Your glosses, markers and choices were moved to their words.'}</p>`;
    return h + (D.flagged ? await revFlagsHTML(key) : '') + `<div class="lwact"><button type="button" class="acc" data-revclose="1">Back to the work</button></div>`;
  }
  const R = S.revData?.[key];
  if (!R) return h + `<p class="hint">${S.revBusy === key ? `Fetching and comparing the corrected version … ${Math.round((S.revP || 0) * 100)} %` : S.revErr ? 'The corrected version could not be fetched: ' + esc(S.revErr) : ''}</p>`;
  const nH = R.parts.reduce((t, P) => t + P.hunks.length, 0), nA = R.parts.reduce((t, P) => t + P.ann, 0), multi = R.parts.length > 1;
  h += `<div class="rvsum"><span>${a.name} · ${esc(W.title)}: a corrected version.</span>
    <ul><li>Text: ${nH ? `${nH} passage${nH === 1 ? '' : 's'} changed` : 'no change'}</li><li>Annotations (lemma, grammar): ${nA ? `${nA.toLocaleString('en')} word${nA === 1 ? '' : 's'} corrected` : 'no change'}</li><li>Structure: ${R.struct.length ? R.struct.map(esc).join('; ') : 'no change'}</li></ul></div>
    <div class="lwact rvbtn"><button type="button" class="acc" data-revok="1">Accept the revision</button><button type="button" data-revno="1">Reject</button></div>
    <p class="hint small">Accepting moves your glosses, markers and choices to their words in the new text; the previous version is kept for 7 days. Rejecting keeps your copy; the notice returns only with a newer revision.</p>`;
  if (nH) {
    h += '<div class="lsh"><span>Changed passages</span></div>';
    for (const P of R.parts) {
      if (!P.hunks.length) continue;
      if (multi) h += `<div class="rvpart">${esc(P.label)}</div>`;
      h += P.hunks.slice(0, 300).map(x => x.whole ? `<div class="rvh"><span class="rvr"></span><span class="rvt">This part was rewritten too much to compare word by word.</span></div>`
        : `<div class="rvh"><span class="rvr">${esc(x.ref)}</span><span class="rvt gk">${x.before ? '… ' + esc(x.before) + ' ' : ''}${x.del ? `<del>${esc(x.del)}</del>` : ''}${x.del && x.ins ? ' ' : ''}${x.ins ? `<ins>${esc(x.ins)}</ins>` : ''}${x.after ? ' ' + esc(x.after) + ' …' : ''}</span></div>`).join('')
        + (P.hunks.length > 300 ? `<p class="hint small">… and ${P.hunks.length - 300} more.</p>` : '');
    }
  }
  if (nA) {
    const ex = R.parts.flatMap(P => P.annEx.map(x => Object.assign({ part: multi ? stripCommon(W.books)[P.oi] : '' }, x))).slice(0, 40);
    h += `<details class="rvann"><summary>Annotations corrected: ${nA.toLocaleString('en')} word${nA === 1 ? '' : 's'}${nA > ex.length ? ` (the first ${ex.length})` : ''}</summary>`
      + ex.map(x => `<div class="rvh"><span class="rvr">${esc((x.part ? x.part + '.' : '') + x.ref)}</span><span class="rvt"><span class="gk">${esc(x.w)}</span> <small>${esc(x.from)} → ${esc(x.to)}</small></span></div>`).join('') + '</details>';
  }
  return h;
}
// the glosses whose word changed: where they are, and a button to mark each as checked
async function revFlagsHTML(key) {
  const W = workInfo(key), rows = [];
  const parts = W.imported ? [null] : W.books.map((_, i) => i);
  for (const bi of parts) {
    const gl = (await req2p(tx('glosses').objectStore('glosses').index('textId').getAll(textIdOf(key, bi)))).filter(g => g.rv);
    if (!gl.length) continue;
    const list = await refsFor(key, bi), P = await workPart(key, bi), ws = P ? P.toks.filter(x => x.t === 'w') : [];
    for (const g of gl.sort((a, b) => a.s - b.s)) {
      let r = ''; for (const x of list) { if (x.i <= g.s) r = x.s; else break; }
      const words = ws.slice(g.s, g.e + 1).map(x => x.s).join(' ');
      rows.push(`<div class="rvh rvg"><button type="button" class="rvr linkb" data-revgo="${bi ?? ''}" data-i="${g.s}">${esc((W.books?.length > 1 ? stripCommon(W.books)[bi] + '.' : '') + r)}</button><span class="rvt"><span class="gk">${esc(words)}</span> <small>${esc(g.t)}</small></span><button type="button" data-revok1="${g.id}">Checked</button></div>`);
    }
  }
  return rows.length ? `<div class="lsh"><span>Glosses to check (${rows.length})</span>${rows.length > 1 ? `<button type="button" class="linkb" data-revokall="1">All checked</button>` : ''}</div>${rows.join('')}` : '<p class="hint small">No glosses to check.</p>';
}
async function revOpen(key) {
  S.lmRev = 'rev'; S.revErr = null;
  if (!S.revData?.[key] && S.revBusy !== key && !(S.revDone?.key === key)) {
    S.revBusy = key; S.revP = 0;
    revCompare(key, p => { S.revP = p; if (S.lmRev && S.lmPage === key) lmRender(); })
      .then(R => { (S.revData ??= {})[key] = R; })
      .catch(e => { S.revErr = e.message; })
      .finally(() => { S.revBusy = null; if (S.lmRev && S.lmPage === key) lmRender(); });
  }
  await lmRender(false); $('#dlg').scrollTop = 0;
}
function wireRevisions() {
  document.addEventListener('click', async ev => {
    const b = ev.target.closest?.('#libBody button'); if (!b) return;
    const d = b.dataset, key = S.lmPage;
    if (d.revshow) { S.revDone = null; S.lwMenu = null; return revOpen(d.revshow); }
    if (d.revflags) { S.lmRev = 'flags'; await lmRender(false); $('#dlg').scrollTop = 0; return; }
    if (d.revclose) { S.lmRev = null; S.revDone = null; await revFlagsLoad(); return lmRender(false); }
    if (d.revok) { b.disabled = true; b.textContent = 'Accepting …'; await revAccept(key); await revFlagsLoad(); return lmRender(false); }
    if (d.revno) { await revReject(key); S.lmRev = null; return lmRender(false); }
    if (d.revback) { b.disabled = true; b.textContent = 'Returning …'; await revReturn(key); await revFlagsLoad(); S.lmRev = 'rev'; return lmRender(false); }
    if (d.revok1 || d.revokall) {
      const ids = d.revok1 ? [+d.revok1] : (await getAll('glosses')).filter(g => g.rv && keyOfText(g.textId) === key).map(g => g.id);
      for (const id of ids) { const g = await get('glosses', id); if (g) { delete g.rv; await put('glosses', g); const x = S.glosses?.find(y => y.id === id); if (x) delete x.rv; } }
      await revFlagsLoad(); if (curKey() === key) renderText();
      return lmRender();
    }
    if (d.revgo != null) { await lmGoPlace(key, d.revgo === '' ? null : +d.revgo, null, +d.i); return; }
  });
  // Settings → Library → Date filter: the range of the line (typed); the default view and periods on a line of their own
  document.addEventListener('change', ev => {
    const k = ev.target.dataset?.ftlim; if (k == null) return;
    const sec = ev.target.closest('.ftset'), ins = sec.querySelectorAll('[data-ftlim]'), err = sec.querySelector('.fterr'), v = S.lib;
    const ys = [...ins].map((x, i) => ftParseYear(x.value, !!i)), [lo0, hi0] = [YMIN, YMAX];
    const bad = m => { err.textContent = m; err.hidden = false; ev.target.classList.add('bad'); };
    ins.forEach(x => x.classList.remove('bad')); err.hidden = true;
    const y0 = ys[0] === null ? lo0 : ys[0], y1 = ys[1] === null ? hi0 : ys[1];
    if (ys[+k] === undefined) return bad('Not a year: e.g. “500 BC”, “-500”, “AD 120”, “120” or “5th c. BC”.');
    if (y0 < -4000 || y1 > 2100) return bad('The line reaches from 4000 BC to AD 2100 at most.');
    if (y1 - y0 < 100) return bad('The latest date must come at least a century after the earliest.');
    v.ftMin = Math.round(y0 / FT_STEP) * FT_STEP; v.ftMax = Math.round(y1 / FT_STEP) * FT_STEP;
    ins[0].value = fmtY(v.ftMin); ins[1].value = fmtY(v.ftMax);
    // the default view and periods: cut to the new range
    const before = JSON.stringify([v.ftView0, v.ftDefs]);
    if (v.ftView0) { const a = Math.max(v.ftMin, v.ftView0[0]), b = Math.min(v.ftMax, v.ftView0[1]); v.ftView0 = b - a >= 60 ? [a, b] : null; }
    v.ftDefs = (v.ftDefs || []).map(([a, b]) => [Math.max(v.ftMin, a), Math.min(v.ftMax, b)]).filter(([a, b]) => a <= b);
    v.periods = v.periods.map(([a, b]) => [Math.max(v.ftMin, a), Math.min(v.ftMax, b)]).filter(([a, b]) => a <= b);
    const note = sec.querySelector('.ftnote'); note.hidden = before === JSON.stringify([v.ftView0, v.ftDefs]);
    S.ftView = null; saveLibView(); ftDraw('def');
  });
  document.addEventListener('change', ev => {
    if (ev.target.dataset?.fteras == null) return;
    S.lib.ftEras = ev.target.checked; saveLibView(); ftRender();
  });
  document.addEventListener('click', ev => {
    if (!ev.target.closest?.('#dlg [data-ftrestore]')) return;
    const v = S.lib; delete v.ftMin; delete v.ftMax; delete v.ftView0; v.ftDefs = []; v.ftEras = true;
    S.ftView = null; saveLibView();
    const sec = ev.target.closest('.ftset'), ins = sec.querySelectorAll('[data-ftlim]');
    ins[0].value = fmtY(YMIN); ins[1].value = fmtY(YMAX); ins.forEach(x => x.classList.remove('bad'));
    sec.querySelector('.fterr').hidden = sec.querySelector('.ftnote').hidden = true;
    sec.querySelector('[data-fteras]').checked = true; ftRender();
  });
  // Settings → Library
  document.addEventListener('change', async ev => {
    if (ev.target.dataset?.revon == null) return;
    S.revOn = ev.target.checked; await setting('revOn', S.revOn);
  });
  document.addEventListener('click', async ev => {
    const b = ev.target.closest?.('#dlg [data-revunrej]'); if (!b) return;
    delete S.revRej[b.dataset.revunrej]; await setting('revRej', S.revRej);
    b.closest('.rvrej').remove();
    if (!$('#dlg .rvrej')) $('#dlg [data-revrejlist]').innerHTML = '<p class="hint small">No rejected revisions.</p>';
  });
}
// Settings → Library: the notices, and the revisions rejected (to reconsider)
async function libSettingsPrep() {
  S.revRej = (await setting('revRej')) || {}; S.revOn = (await setting('revOn')) ?? true;
  S.lib = S.lib || (await setting('libView')) || null; libView();
  await cachedCatalog();
}
function libSettingsHTML() {
  const rej = Object.keys(S.revRej || {});
  // the date filter: the range of the line, the default view and periods (on a line like the Library's), the era names
  const [lo, hi] = ftLim();
  return `<section class="rsec ftset"><div class="rhd"><span>Date filter</span></div>
      <div class="mline"><span>Range of the line<small class="hint">its earliest and latest dates</small></span><div class="mtlim"><input type="text" data-ftlim="0" value="${esc(fmtY(lo))}" placeholder="e.g. 2000 BC" autocomplete="off" class="nofocus" aria-label="Earliest date"><span>–</span><input type="text" data-ftlim="1" value="${esc(fmtY(hi))}" placeholder="e.g. AD 1500" autocomplete="off" class="nofocus" aria-label="Latest date"></div></div>
      <small class="fterr" role="alert" hidden></small>
      <div class="ftsetl"><span>Default view and periods<small class="hint">the Library opens with this view; the periods (or none) are set when the filters are reset ↺</small></span>${ftLineHTML('def')}</div>
      <small class="ftnote" hidden>The default view and periods were cut to the new range.</small>
      <label class="srow1 swr"><span>Era names<small class="hint">above the line</small></span>${SW('data-fteras="1"', S.lib?.ftEras !== false)}</label>
      <div class="ftrestore"><button type="button" data-ftrestore="1">Restore defaults</button></div></section>
    <section class="rsec"><div class="rhd"><span>Revisions</span></div>
      <label class="srow1 swr"><span>Show revision notices<small class="hint">a faint “rev.” beside works for which a corrected version is available</small></span>${SW('data-revon="1"', S.revOn !== false)}</label></section>
    <section class="rsec"><div class="rhd"><span>Rejected revisions</span></div><div data-revrejlist="1">${rej.length ? rej.map(k => { const w = S.catWork?.[k]; return `<div class="srow1 swr rvrej"><span>${esc(w ? w.title : k)}${w ? `<small class="hint">${esc(w.author)}</small>` : ''}</span><button type="button" data-revunrej="${esc(k)}">Reconsider</button></div>`; }).join('') : '<p class="hint small">No rejected revisions.</p>'}</div>
      <small class="hint rhint">A revision you reconsider is offered again on the work’s page.</small></section>`;
}
