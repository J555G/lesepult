// ---------------------------------------------------------------- the Library's date line
// One line, drawn in two places: the Library's filters ('lib': the periods of the list) and Settings → Library ('def':
// the view the Library opens with and the periods set when the filters are reset). It scrolls and zooms in steps of
// ten years; the eras are named above it, broader or finer with the zoom. A tap on the empty line makes the first
// period; holding the line makes another, holding a period splits it, holding a single date opens it into a period;
// pulling two ends together joins them.
const FT_STEP = 10, FT_MAX = 6;
// the eras by level of zoom: [name, short name, from, to]
const ERA_LV = (() => {
  const PRE = [['Middle Palaeolithic', 'M. Palaeol.', -300000, -50000], ['Upper Palaeolithic', 'U. Palaeol.', -50000, -10000], ['Mesolithic', 'Mesol.', -10000, -7000], ['Neolithic', 'Neol.', -7000, -4500], ['Chalcolithic', 'Chalc.', -4500, -3300]];
  const broad = [['Palaeolithic', 'Palaeol.', -300000, -10000], ['Mesolithic', 'Mesol.', -10000, -7000], ['Neolithic', 'Neol.', -7000, -3300], ['Bronze Age', 'Bronze', -3300, -1200], ['Iron Age', 'Iron', -1200, -800], ['Classical Antiquity', 'Antiquity', -800, 300], ['Late Antiquity', 'Late Ant.', 300, 600], ['Middle Ages', 'Med.', 600, 1453], ['Modern', 'Mod.', 1453, 2100]];
  const mid = [...PRE, ['Bronze Age', 'Bronze', -3300, -1200], ['Early Iron Age', 'E. Iron', -1200, -800], ['Archaic', 'Arch.', -800, -500], ['Classical', 'Class.', -500, -323], ['Hellenistic', 'Hell.', -323, -31], ['Imperial', 'Imp.', -31, 300],
    ['Late Antique', 'L. Ant.', 300, 600], ['Byzantine', 'Byz.', 600, 1453], ['Early Modern', 'E. Mod.', 1453, 1789], ['Modern', 'Mod.', 1789, 2100]];
  const fine = [['Early Archaic', 'E. Arch.', -800, -650], ['Late Archaic', 'L. Arch.', -650, -479], ['Pentecontaetia', 'Pentec.', -479, -431], ['Peloponnesian War', 'Pelop. War', -431, -404], ['4th century', '4th c.', -404, -323],
    ['Diadochi', 'Diad.', -323, -281], ['High Hellenistic', 'High Hell.', -281, -133], ['Late Republic', 'L. Rep.', -133, -31], ['Augustan', 'Aug.', -31, 14], ['Julio-Claudian', 'Jul.-Cl.', 14, 68], ['Flavian', 'Flav.', 68, 96],
    ['Antonine', 'Anton.', 96, 192], ['Severan', 'Sev.', 192, 235], ['Crisis', 'Crisis', 235, 284], ['Tetrarchy & Constantine', 'Tetr. & Const.', 284, 363], ['Theodosian', 'Theod.', 379, 457], ['Justinian', 'Just.', 527, 565]];
  // the fine level: where it has no names, those of the middle level (cut to the gap)
  const full = []; let at = -Infinity;
  const fill = (x, y) => { for (const [n, s, a, b] of mid) { const lo = Math.max(a, x), hi = Math.min(b, y); if (hi > lo) full.push([n, s, lo, hi]); } };
  for (const e of fine) { if (e[2] > at) fill(at, e[2]); full.push(e); at = e[3]; }
  fill(at, Infinity);
  return [broad, mid, full];
})();
const ftLevel = span => span > 3000 ? 0 : span > 400 ? 1 : 2;
const ftView = () => S.ftView ??= ftView0();
const ftPct = y => { const [a, b] = ftView(); return (y - a) / (b - a) * 100; };
const ftSnap = y => { const [lo, hi] = ftLim(); return Math.max(lo, Math.min(hi, Math.round(y / FT_STEP) * FT_STEP)); };
function ftLabel([a, b]) {
  const bc = y => y < 0 ? -y : y;
  if (a === b) return `c. ${a < 0 ? -a + ' BC' : 'AD ' + a}`;
  return a < 0 && b <= 0 ? `${bc(a)}–${bc(b)} BC` : a >= 0 ? `AD ${a}–${b}` : `${bc(a)} BC – AD ${b}`;
}
// the two lines: their periods, their view (and what follows a change)
const FTS = { lib: {}, def: {} };                 // per line: the period touched or under the mouse (hot), the year shown while pulling (lab)
const FTC = {
  lib: { per: () => libView().periods, view: () => ftView(), set: v => { S.ftView = v; },
    done: () => { saveLibView(); filterIcon(); S.libLimit = 250; renderLibList(); const r = $('#libCtl .ftreset'); if (r) r.disabled = filtersAtDefault(libView()); }, viewDone: () => { } },
  def: { per: () => (libView().ftDefs ??= []), view: () => ftView0(), set: v => { S.lib.ftView0 = v; S.ftView = null; },
    done: () => saveLibView(), viewDone: () => saveLibView() },
};
const ftRoot = L => document.querySelector(`.ftl[data-ftl="${L}"]`);
function ftLineHTML(L) {
  return `<div class="ftl" data-ftl="${L}"><div class="fteras"${S.lib?.ftEras === false ? ' hidden' : ''}></div><div class="fttrack"><div class="ftaxis"></div><div class="ftclip"><div class="ftranges"></div></div><div class="ftlab"><div></div></div></div>`
    + `<button type="button" class="ftx" data-ftclear="${L}" title="Remove all periods" aria-label="Remove all periods" hidden>✕</button></div>`;
}
function ftTextW(s) { const c = (ftTextW.c ??= document.createElement('canvas').getContext('2d')); c.font = '10.5px "Source Sans 3", sans-serif'; return (ftTextW.m ??= {})[s] ??= c.measureText(s).width; }
function ftDraw(L) {
  const root = ftRoot(L); if (!root) return;
  const c = FTC[L], st = FTS[L], [a, b] = c.view(), span = b - a, P = c.per(), tr = root.querySelector('.fttrack'), W = tr.clientWidth;
  if (!W) { if ((st.tries = (st.tries || 0) + 1) < 30) requestAnimationFrame(() => ftDraw(L)); return; } st.tries = 0;     // (not laid out yet)
  const pc = y => ((y - a) / span * 100).toFixed(2) + '%';
  // the years beneath: four or five
  const step = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000].find(s => span / s <= W / 80) || 100000;
  let h = '';
  for (let y = Math.ceil(a / step) * step; y <= b; y += step) { const p = (y - a) / span * 100; h += `<i${p < 6 ? ' class="l"' : p > 94 ? ' class="r"' : ''} style="left:${pc(y)}"><span>${y === 0 ? 'BC | AD' : Math.abs(y) >= 10000 ? Math.abs(y).toLocaleString('en') : Math.abs(y)}</span></i>`; }
  root.querySelector('.ftaxis').innerHTML = h;
  // the eras above: the names that fit (else the short ones); those a period touches in the accent colour
  const er = root.querySelector('.fteras'); er.hidden = S.lib?.ftEras === false;
  if (!er.hidden) {
    h = '';
    for (const [n, s, x, y] of ERA_LV[ftLevel(span)]) {
      const lo = Math.max(a, x), hi = Math.min(b, y); if (hi <= lo) continue;
      const px = (hi - lo) / span * W, t = ftTextW(n) + 6 <= px ? n : ftTextW(s) + 6 <= px ? s : '';
      if (x > a && x < b) h += `<b style="left:${pc(x)}"></b>`;
      if (!t) continue;
      const on = P.some(([p, q]) => p === q ? p >= x && p < y : p < y && q > x);
      h += `<span${on ? ' class="on"' : ''} style="left:${pc(lo)};width:${((hi - lo) / span * 100).toFixed(2)}%" title="${esc(n)}">${esc(t)}</span>`;
    }
    er.innerHTML = h;
  }
  // the periods: a pill, its ends grow into knobs while it is touched (or under the mouse)
  root.querySelector('.ftranges').innerHTML = P.map(([p, q], k) => `<div class="ftp${p === q ? ' pt' : ''}${st.hot === k ? ' on' : ''}">`
    + (p === q ? '' : `<i class="ftr" style="left:calc(${pc(p)} - 3px);width:calc(${((q - p) / span * 100).toFixed(2)}% + 6px)"></i>`)
    + `<i class="fth" style="left:${pc(p)}"></i>${p === q ? '' : `<i class="fth" style="left:${pc(q)}"></i>`}</div>`).join('');
  // the years over the knobs being pulled (two that would meet: one range); past the ends of the line they fade out
  let lab = st.lab || [];
  if (lab.length === 2 && Math.abs(lab[1].y - lab[0].y) / span * W < (ftTextW(lab[0].t) + ftTextW(lab[1].t)) * 0.55 + 12) lab = [{ y: (lab[0].y + lab[1].y) / 2, t: ftLabel([lab[0].y, lab[1].y]) }];
  root.querySelector('.ftlab>div').innerHTML = lab.map(l => `<span style="left:${pc(l.y)}">${esc(l.t)}</span>`).join('');
  root.querySelector('.ftx').hidden = !P.length;
}
function ftRender() { ftDraw('lib'); ftDraw('def'); }
const FT_HELP = [['Tap the empty line', 'a first period'], ['Hold the line', 'another period'], ['Pull an end', 'a longer or shorter period'], ['Drag a period', 'move it'],
  ['Hold a period', 'split it (a single date: open it)'], ['Pull two ends together', 'join them'], ['Pinch or wheel', 'zoom'], ['Drag above or below the line', 'move the view'], ['Double-tap', 'the default view']];
const ftHelpHTML = () => `<ul class="fthelp" hidden>${FT_HELP.map(([a, b]) => `<li><b>${a}</b> – ${b}</li>`).join('')}</ul>`;
// the touches: an end pulled (snapping onto another end), a period moved or held (split), the line tapped or held
// (a new period), two fingers or the wheel (zoom), dragged (move), tapped twice (the default view)
function wireDateLine() {
  const ptrs = new Map(); let drag = null, pinch = null, lp = 0, L = null, lastTap = null;
  const geo = Lk => { const r = ftRoot(Lk).querySelector('.fttrack').getBoundingClientRect(), [a, b] = FTC[Lk].view(); return { r, a, b, y: x => a + (x - r.left) / r.width * (b - a), x: y => r.left + (y - a) / (b - a) * r.width }; };
  const setView = (Lk, a, b) => { const [lo, hi] = ftLim(), span = Math.max(60, Math.min(hi - lo, b - a)); a = Math.round(Math.max(lo, Math.min(hi - span, a))); FTC[Lk].set([a, Math.round(a + span)]); ftDraw(Lk); };
  const homeView = Lk => Lk === 'lib' ? ftView0() : ftLim();
  const norm = P => { const R = P.map(([a, b]) => [Math.min(a, b), Math.max(a, b)]).sort((x, y) => x[0] - y[0]), out = [];
    for (const r of R) { const l = out[out.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else out.push(r); }
    P.splice(0, P.length, ...out); };
  const changed = (Lk, fin) => { if (fin) norm(FTC[Lk].per()); ftDraw(Lk); if (fin) FTC[Lk].done(); };
  // what is under the pointer: an end (the nearest within reach), a period, or nothing
  // (a period's middle is taken only in a band along the line: above it, the era names, and below, the years, move the view)
  const inBand = (Lk, cy) => Math.abs(cy - (geo(Lk).r.top + 7.5)) <= 10;
  const hit = (Lk, cx, mouse, cy) => {
    const g = geo(Lk), reach = mouse ? 14 : 30, P = FTC[Lk].per(), y = g.y(cx); let best = null;
    P.forEach(([a, b], k) => { const rc = a === b ? reach : Math.min(reach, (g.x(b) - g.x(a)) / 3); for (const [e, v] of [[0, a], [1, b]]) { const d = Math.abs(g.x(v) - cx); if (d <= rc && (!best || d < best.d)) best = { k, e, d }; } });
    if (best) return best;
    if (cy != null && !inBand(Lk, cy)) return null;
    // (and only while the period covers less than half of the view: a wider one moves the view, its ends still pull)
    const k = P.findIndex(([a, b]) => a < b && y >= a && y <= b && (b - a) < (g.b - g.a) / 2); return k >= 0 ? { k, e: 'm' } : null;
  };
  // a new period: a fifth of the visible line, around the place (within the line's range)
  const opened = (Lk, y0) => { const [a, b] = FTC[Lk].view(), [lo, hi] = ftLim(), w = Math.max(2 * FT_STEP, Math.round((b - a) / 5 / FT_STEP) * FT_STEP);
    let s = Math.round((y0 - w / 2) / FT_STEP) * FT_STEP; s = Math.max(lo, Math.min(hi - w, s)); return [s, Math.min(hi, s + w)]; };
  document.addEventListener('pointerdown', ev => {
    const t = ev.target.closest?.('.ftl'); if (!t || ev.target.closest('button')) return;
    if (ptrs.size && t.dataset.ftl !== L) return;
    L = t.dataset.ftl; const c = FTC[L], st = FTS[L];
    ev.preventDefault(); ptrs.set(ev.pointerId, ev.clientX); t.setPointerCapture(ev.pointerId);
    if (ptrs.size === 2) { clearTimeout(lp); drag = null; st.hot = null; st.lab = null; const [x1, x2] = [...ptrs.values()], v = c.view(); pinch = { d0: Math.max(10, Math.abs(x1 - x2)), span0: v[1] - v[0], ym: geo(L).y((x1 + x2) / 2) }; ftDraw(L); return; }
    if (ptrs.size > 2) return;
    const y = ftSnap(geo(L).y(ev.clientX)), h = hit(L, ev.clientX, ev.pointerType === 'mouse', ev.clientY);
    if (h && h.e !== 'm') drag = { k: h.k, e: h.e, x0: ev.clientX };
    else if (h) drag = { k: h.k, e: 'm', x0: ev.clientX, y0: y, r0: [...c.per()[h.k]] };
    else drag = { pan: true, x0: ev.clientX, v0: [...c.view()], y, band: inBand(L, ev.clientY) };
    drag.type = ev.pointerType; st.hot = h ? h.k : null; ftDraw(L);
    clearTimeout(lp); lp = setTimeout(() => {
      if (!drag || drag.moved) return;
      const P = c.per(), [a, b] = c.view();
      if (drag.pan) {                                               // holding the empty line: a new period there
        if (P.length >= FT_MAX || !drag.band) return;
        P.push(opened(L, drag.y)); st.hot = null;
      } else if (drag.e !== 'm') {                                  // holding a single date: it opens into a period
        const r = P[drag.k]; if (!r || r[0] !== r[1]) return;
        const o = opened(L, r[0]); r[0] = o[0]; r[1] = o[1];
      } else {                                                      // holding a period: it splits in two
        const r = P[drag.k], g = Math.max(FT_STEP, ftSnap((b - a) / 60) - ftSnap(0));
        if (P.length >= FT_MAX || r[1] - r[0] < 6 * FT_STEP) return;
        P.splice(drag.k, 1, [r[0], Math.max(r[0], drag.y0 - g)], [Math.min(r[1], drag.y0 + g), r[1]]); st.hot = null;
      }
      navigator.vibrate?.(15); drag = null; lastTap = null; changed(L, true);
    }, 550);
  });
  document.addEventListener('pointermove', ev => {
    if (!ptrs.has(ev.pointerId)) {                                  // the mouse over a line: the period under it shows its knobs
      if (ev.pointerType !== 'mouse' || ptrs.size) return;
      const t = ev.target.closest?.('.ftl');
      for (const Lk of ['lib', 'def']) { const k = t?.dataset.ftl === Lk ? hit(Lk, ev.clientX, true, ev.clientY)?.k ?? null : null; if (FTS[Lk].hot !== k && (k != null || FTS[Lk].hot != null)) { FTS[Lk].hot = k; ftDraw(Lk); } }
      return;
    }
    if (!ftRoot(L)) return;
    ptrs.set(ev.pointerId, ev.clientX);
    const c = FTC[L], st = FTS[L], g = geo(L);
    if (pinch && ptrs.size >= 2) { const [x1, x2] = [...ptrs.values()], span = pinch.span0 * pinch.d0 / Math.max(10, Math.abs(x1 - x2)), f = ((x1 + x2) / 2 - g.r.left) / g.r.width; setView(L, pinch.ym - f * span, pinch.ym - f * span + span); return; }
    if (!drag) return;
    if (Math.abs(ev.clientX - drag.x0) > 4) drag.moved = true; if (!drag.moved) return;
    if (drag.pan) { const d = (ev.clientX - drag.x0) / g.r.width * (drag.v0[1] - drag.v0[0]); setView(L, drag.v0[0] - d, drag.v0[1] - d); return; }
    const P = c.per(), r = P[drag.k]; if (!r) return;
    // pulled past the end of the line: the line moves along, a little with each movement
    const vw = c.view(), sh = (vw[1] - vw[0]) * 0.02;
    if (ev.clientX > g.r.right) setView(L, vw[0] + sh, vw[1] + sh); else if (ev.clientX < g.r.left) setView(L, vw[0] - sh, vw[1] - sh);
    const g2 = geo(L), y = ftSnap(g2.y(Math.max(g2.r.left, Math.min(g2.r.right, ev.clientX)))), [lo, hi] = ftLim();
    if (drag.e === 'm') { const w = drag.r0[1] - drag.r0[0], a = Math.max(lo, Math.min(hi - w, drag.r0[0] + y - drag.y0)); r[0] = a; r[1] = a + w; st.lab = [{ y: a, t: fmtY(a) }, { y: a + w, t: fmtY(a + w) }]; }
    else {
      // an end near another end (of its own period or the next) snaps onto it: they join when let go
      const near = drag.type === 'mouse' ? 10 : 16, x = g2.x(y); let yy = y, bd = near + 1, snap = null;
      P.forEach(([a, b], k) => [[0, a], [1, b]].forEach(([e, val]) => { if (k === drag.k && (e === drag.e || r[0] === r[1])) return; const d = Math.abs(g2.x(val) - x); if (d <= near && d < bd) { bd = d; yy = val; snap = k + ':' + e; } }));
      if (snap && snap !== drag.snap) navigator.vibrate?.(8); drag.snap = snap;
      if (r[0] === r[1]) r[0] = r[1] = yy; else { r[drag.e] = yy; if (r[0] > r[1]) { r.reverse(); drag.e = 1 - drag.e; } }
      st.lab = r[0] === r[1] ? [{ y: yy, t: fmtY(yy) }] : [{ y: r[drag.e], t: fmtY(r[drag.e]) }];
    }
    changed(L, false);
  });
  const up = ev => {
    if (!ptrs.has(ev.pointerId)) return;
    ptrs.delete(ev.pointerId); clearTimeout(lp);
    const c = FTC[L], st = FTS[L];
    if (pinch) { if (ptrs.size < 2) { pinch = null; c.viewDone(); } drag = null; return; }
    const d = drag; drag = null; st.lab = null; if (d?.type !== 'mouse') st.hot = null;
    if (!d) { ftDraw(L); return; }
    if (d.pan) {
      if (d.moved) { c.viewDone(); ftDraw(L); return; }
      // a tap twice (touch): the default view; a tap on the empty line: a period – only while there is none
      const now = Date.now();
      if (d.type !== 'mouse' && lastTap && lastTap.L === L && now - lastTap.t < 320 && Math.abs(lastTap.x - d.x0) < 30) {
        if (lastTap.made) c.per().splice(c.per().indexOf(lastTap.made), 1);
        lastTap = null; c.set([...homeView(L)]); changed(L, true); c.viewDone(); return;
      }
      lastTap = { L, t: now, x: d.x0, made: null };
      if (!c.per().length) { const r = opened(L, d.y); c.per().push(r); lastTap.made = r; changed(L, true); return; }
      ftDraw(L); return;
    }
    lastTap = d.moved ? null : { L, t: Date.now(), x: d.x0, made: null };
    changed(L, true);
  };
  document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  let wt = 0;
  document.addEventListener('wheel', ev => {
    const t = ev.target.closest?.('.ftl'); if (!t) return;
    ev.preventDefault();
    const Lk = t.dataset.ftl, g = geo(Lk), span = g.b - g.a;
    if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) { const d = ev.deltaX / g.r.width * span; setView(Lk, g.a + d, g.b + d); }
    else { const y = g.y(ev.clientX), f = (ev.clientX - g.r.left) / g.r.width, ns = span * Math.exp(ev.deltaY * 0.0015); setView(Lk, y - f * ns, y - f * ns + ns); }
    clearTimeout(wt); wt = setTimeout(() => FTC[Lk].viewDone(), 400);
  }, { passive: false });
  document.addEventListener('dblclick', ev => { const t = ev.target.closest?.('.ftl'); if (!t || ev.target.closest('button')) return; const Lk = t.dataset.ftl; FTC[Lk].set([...homeView(Lk)]); ftDraw(Lk); FTC[Lk].viewDone(); });
  document.addEventListener('click', ev => {
    const x = ev.target.closest?.('[data-ftclear]'); if (x) { const Lk = x.dataset.ftclear; FTC[Lk].per().length = 0; FTS[Lk].hot = null; changed(Lk, true); return; }
    const i = ev.target.closest?.('[data-ftinfo]'); if (i) { const h = i.closest('.ftsetl')?.querySelector('.fthelp'); if (h) { h.hidden = !h.hidden; i.classList.toggle('on', !h.hidden); i.setAttribute('aria-expanded', !h.hidden); } }
  });
}
// ---- years typed in Settings (the range of the line). Years: "500", "-500", "−500", "+120", "2.000", "2,000"; with
// "BC", "B.C.", "v. Chr.", "vor Christus", "a. Chr. (n.)", "ante Christum", "a.C.", "av. J.-C." or "AD", "A.D.", "n. Chr.",
// "nach Christus", "p. Chr. (n.)", "post Christum", "d.C.", "apr. J.-C." before or after; "c.", "ca.", "circa", "um" before.
// Centuries ("5th c. BC", "5th cent.", "5th century", "5 c.", "V c.", "5. Jh. v. Chr.", "5. Jhdt.", "V. Jahrhundert",
// "s. V a.C.", "saec. V") and millennia, also early / mid / late (a third) or the first / second half ("late 5th c. BC",
// "mid-4th century", "Anfang 5. Jh. v. Chr.", "erste Hälfte des 4. Jh.", "first half of the 2nd millennium BC"), ("2nd millennium BC", "2. Jt. v. Chr.", "2. Jahrtausend") as their first year
// (end = false) or their last (end = true). BCE, CE, B.C.E., C.E., v. u. Z. and u. Z. are not taken.
// A wrong entry: undefined; an empty one: null.
const FT_BC = /(?<![a-z])(?:b\.? ?c\.?|v\.? ?chr(?:\.|isti|istus)?(?: ?g(?:eb)?\.?)?|vor chr(?:\.|isti|istus)?(?: ?geb(?:\.|urt)?)?|a\.? ?chr\.?(?: ?n\.?)?|ante christum(?: natum)?|a\.? ?c\.?|av\.? ?j\.? ?-? ?c\.?)(?![a-z])/;
const FT_AD = /(?<![a-z])(?:a\.? ?d\.?|n\.? ?chr(?:\.|isti|istus)?(?: ?g(?:eb)?\.?)?|nach chr(?:\.|isti|istus)?(?: ?geb(?:\.|urt)?)?|p\.? ?chr\.?(?: ?n\.?)?|post christum(?: natum)?|d\.? ?c\.?|apr?\.? ?j\.? ?-? ?c\.?)(?![a-z])/;
const FT_NO = /(?<![a-z])(?:b\.? ?c\.? ?e\.?|c\.? ?e\.?|v\.? ?u\.? ?z\.?|u\.? ?z\.?)(?![a-z])/;
function ftRoman(r) { const V = { i: 1, v: 5, x: 10, l: 50 }; if (!/^[ivxl]+$/.test(r)) return null; let n = 0; for (let i = 0; i < r.length; i++) { const a = V[r[i]], b = V[r[i + 1]] || 0; n += a < b ? -a : a; } return n || null; }
function ftParseYear(s, end) {
  s = String(s || '').toLowerCase().replace(/[−–—]/g, '-').replace(/\s+/g, ' ').trim(); if (!s) return null;
  if (FT_NO.test(s)) return undefined;
  s = s.replace(/^(?:circa|ca\.?|c\.|um)\s*(?=[-+\d])/, '');
  const bcM = s.match(FT_BC), adM = s.match(FT_AD);
  if (bcM && adM) return undefined;
  const bc = !!bcM; if (bcM || adM) s = s.replace(bcM ? FT_BC : FT_AD, ' ').replace(/\s+/g, ' ').trim();
  const num = x => /^\d+$/.test(x) ? +x : ftRoman(x);
  // early / mid / late (a third), first / second half: of a century or a millennium
  const QUAL = [[/^(?:early|beginning of|start of|anfang|beginn|frühe[sn]?|fruehe[sn]?|frühe)\b/, 0, 1 / 3], [/^(?:mid|middle of|mitte|mittlere[sn]?)\b/, 1 / 3, 2 / 3],
    [/^(?:late|end of|ende|späte[sn]?|spaete[sn]?)\b/, 2 / 3, 1], [/^(?:first half of|1st half of|erste hälfte|erste haelfte|1\. ?hälfte|1\. ?haelfte)\b/, 0, .5],
    [/^(?:second half of|2nd half of|zweite hälfte|zweite haelfte|2\. ?hälfte|2\. ?haelfte)\b/, .5, 1]];
  let part = null; s = s.replace(/^the /, '');
  for (const [re, f0, f1] of QUAL) if (re.test(s)) { part = [f0, f1]; s = s.replace(re, '').replace(/^[-\s]*(?:(?:of )?the |des |der )?/, '').trim(); break; }
  // a century or a millennium: the number, then the word (or the word, then the number)
  const UNIT = '(c|cent|century|centuries|jh|jhd|jhdt|jahrhundert|s|sec|saec|saeculum|siècle|siecle|secolo|siglo|mill|millennium|jt|jtd|jts|jtsd|jahrtausend|millénaire)';
  let m = s.match(new RegExp(`^(\\d{1,2}|[ivxl]+)\\.?\\s?(?:st|nd|rd|th|er|e|ème)?\\.?\\s?${UNIT}\\.?$`)) || s.match(new RegExp(`^${UNIT}\\.?\\s?(\\d{1,2}|[ivxl]+)\\.?$`));
  if (m) {
    const [n, u] = /^\d|^[ivxl]+$/.test(m[1]) && num(m[1]) != null ? [num(m[1]), m[2]] : [num(m[2]), m[1]];
    if (!n) return undefined;
    const k = /^(mill|jt|jahrtausend)/.test(u) ? 1000 : 100, lo = bc ? -n * k : (n - 1) * k + 1, [f0, f1] = part || [0, 1];
    return end ? lo + Math.round(f1 * k) - 1 : lo + Math.round(f0 * k);
  }
  if (part) return undefined;                                       // (early, late … only with a century or a millennium)
  // a year
  m = s.match(/^([-+])?\s?(\d{1,3}(?:[.,' ]\d{3})+|\d+)$/); if (!m) return undefined;
  let y = +m[2].replace(/[.,' ]/g, ''); if (!Number.isSafeInteger(y)) return undefined;
  if (m[1] === '-') { if (bcM || adM) return undefined; y = -y; }
  else if (m[1] === '+' && bc) return undefined;
  return bc ? -y : y;
}
// ---- the filter panel: language and form side by side (labels above them on phones), the date beneath
function libControlsHTML() {
  const v = libView();
  return `<button type="button" class="ftreset" data-freset="1" title="Reset the filters" aria-label="Reset the filters"${filtersAtDefault(v) ? ' disabled' : ''}>↺</button>
    <div class="fgrid2">
      <div class="fgr"><span class="fl">Language</span>${seg('langs', [['', 'All'], ['grc', 'Greek'], ['la', 'Latin']])}</div>
      <div class="fgr"><span class="fl">Form</span>${seg('form', [['', 'All'], ['prose', 'Prose'], ['verse', 'Verse']])}</div>
    </div>
    <div class="fdrow"><span class="fl">Date</span>
      <button type="button" class="chip2${v.undated ? ' on' : ''}" data-undch="1" aria-pressed="${v.undated}" title="Works without a known date">Undated</button></div>
    ${ftLineHTML('lib')}`;
}
// what is filtered, as small removable chips (while the filter panel is closed)
function libActiveHTML() {
  const v = libView(), out = [];
  const x = (label, f, val = '') => out.push(`<button type="button" class="chip2 on" data-unf="${f}" data-val="${esc(val)}" title="Remove this filter">${esc(label)} <span aria-hidden="true">×</span></button>`);
  for (const l of v.langs) x(l === 'la' ? 'Latin' : 'Greek', 'langs', l);
  for (const f of v.form) x(f === 'verse' ? 'Verse' : 'Prose', 'form', f);
  v.periods.forEach((p, k) => x(ftLabel(p), 'date', String(k)));
  if (!v.undated) x('Dated works only', 'undated');
  return out.join('');
}
