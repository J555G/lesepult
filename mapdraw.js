// ================================================================ Pult · drawing on the map: your own places and drawings
// The pen button opens a bar with the tools (place, line, arrow, area, freehand, text, select), colour, width, dashes,
// the set new drawings go to, undo and Done. Drawings belong to named sets (Layers → Your own: each set on or off).
// A drawing can carry a period (the time slider fades or hides it like places) and passages of texts (it is then shown
// only while "Places from" covers one of them). Lines show their length (km, Roman miles, stades); GeoJSON in and out.
// Settings: dset|<id> {id, name, created} · draw|<id> {id, set, kind: line|arrow|area|free|text, co: [[lon, lat], …],
//   t (name; the text of a text), note, c (colour), lw (1–3), dash, y0, y1, links: [items as in the selection], created}
// · pown|<id> (your own places: {id, t, lat, lon, own: 1, ty: [], names: []} with the same fields set, c, note, y0, y1, links)
// · mapCfg: dOff (hidden sets) · dSet (set for new drawings) · dLen (lengths on the map) · dTool, dCol, dLw, dDash
const D_COLS = ['#b23a3a', '#2f78b5', '#3c8a3c', '#c9922b', '#7a4fb0', '#3a3a3a'];
const D_LW = [0, 1.6, 3, 5], D_TS = [0, 13, 16, 21];
const D_KIND = { place: 'Place', line: 'Line', arrow: 'Arrow', area: 'Area', free: 'Freehand line', text: 'Text' };
const D_EMPTY = { type: 'FeatureCollection', features: [] };
const svg = (b, f = 'none') => `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="${f}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${b}</svg>`;
const PEN_ICON = svg('<path d="M4.5 19.5l1.1-4.4L15.9 4.8a1.9 1.9 0 0 1 2.7 0l.6.6a1.9 1.9 0 0 1 0 2.7L8.9 18.4z"/><path d="M13.8 6.9l3.3 3.3"/>');
const D_TOOLS = [
  ['place', 'Place', svg('<path d="M12 20.5s-6-5.4-6-10.2a6 6 0 0 1 12 0c0 4.8-6 10.2-6 10.2z"/><circle cx="12" cy="10.3" r="2.1"/>')],
  ['line', 'Line', svg('<path d="M4 18l5-9 5 6 6-10"/><circle cx="4" cy="18" r="1.3" fill="currentColor"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/><circle cx="14" cy="15" r="1.3" fill="currentColor"/><circle cx="20" cy="5" r="1.3" fill="currentColor"/>')],
  ['arrow', 'Arrow', svg('<path d="M5 19L18.5 5.5"/><path d="M10.5 5h8.5v8.5"/>')],
  ['area', 'Area', svg('<path d="M5 8.5l7-4.5 7 5-2.2 10H7.2z" fill="currentColor" fill-opacity=".18"/>')],
  ['free', 'Freehand', svg('<path d="M3 15.5c2.6-6 4.6 3.6 7.6-1.2S14.8 7 17 10.7s2.8 3.6 4 1.6"/>')],
  ['text', 'Text', svg('<path d="M6 5.5h12M12 5.5V19M9.3 19h5.4"/>')],
  ['edit', 'Select and change', svg('<path d="M6 3.5l12 8.7-5.4 1.1 2.6 5.6-2.4 1.1-2.6-5.7L6 17.9z"/>')],
];
const D_HINT = {
  place: 'Tap the map where your place lies.', line: 'Tap the map point by point; tap the last point again to end.',
  arrow: 'Tap point by point – the arrow points to the last one.', area: 'Tap the corners; tap the first corner to close the area.',
  free: 'Draw with one finger; two fingers move the map.', text: 'Tap where the text goes.',
  edit: 'Tap a drawing to select it; drag its points. Hold a point to remove it; drag a small point to add one.',
};

// ---------------------------------------------------------------- data
async function loadDrawings() {
  if (M.draw) return M.draw;
  const draw = new Map(), sets = new Map();
  for (const r of await getAll('settings', IDBKeyRange.bound('draw|', 'draw|￿'))) draw.set(r.v.id, r.v);
  for (const r of await getAll('settings', IDBKeyRange.bound('dset|', 'dset|￿'))) sets.set(r.v.id, r.v);
  if (!sets.size) { const s = { id: 'd0', name: 'My drawings', created: Date.now() }; sets.set(s.id, s); await setting('dset|d0', s); }
  M.draw = draw; M.dsets = sets;
  return draw;
}
const dNewId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const dGet = id => M.draw?.get(id) || M.own?.get(id);
const dSetOf = x => (x.set && M.dsets?.has(x.set)) ? x.set : 'd0';
const dKind = x => x.own ? 'place' : x.kind;
async function dSave(x) { if (x.own) { M.own.set(x.id, x); await setting('pown|' + x.id, x); } else { M.draw.set(x.id, x); await setting('draw|' + x.id, x); } }
async function dRemove(x) { if (x.own) { M.own.delete(x.id); await del('settings', 'pown|' + x.id); } else { M.draw.delete(x.id); await del('settings', 'draw|' + x.id); } }
const r5 = v => Math.round(v * 1e5) / 1e5;
const dClone = x => JSON.parse(JSON.stringify(x));
// shown at all: the layer "Your own" on, the set on, and (with passages) one of them covered by "Places from"
const dShown = x => M.cfg?.own !== false && !(M.cfg.dOff || []).includes(dSetOf(x)) && !M.dHide?.has(x.id);
// the period: undated drawings are always shown; otherwise like places (Map settings → Period)
function dState(x) { return x.y0 == null && x.y1 == null ? 1 : tState(x.y0, x.y1).o; }
function dOpacity(base) {
  const R = tRanges(); if (!R) return base;
  return ['*', base, ['case', UND, 1, ['any', ...R.map(tIn)], 1, ['any', ...R.map(tGone)], tGoneO(), tLateO()]];
}
const dTimeF = () => tRanges() ? ['>', dOpacity(1), 0] : null;

// ---------------------------------------------------------------- measuring
const KM_MILE = 1.479, KM_STADE = 0.185;            // Roman mile (mille passus); stade of about 185 m
function havKm(a, b) {
  const R = 6371.0088, rad = Math.PI / 180, dLa = (b[1] - a[1]) * rad, dLo = (b[0] - a[0]) * rad;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function lenKm(co, closed) { let s = 0; for (let i = 1; i < co.length; i++) s += havKm(co[i - 1], co[i]); if (closed && co.length > 2) s += havKm(co[co.length - 1], co[0]); return s; }
function areaKm2(co) {                                   // on the sphere (as in GIS programs)
  const R = 6371.0088, rad = Math.PI / 180; let s = 0;
  for (let i = 0; i < co.length; i++) { const a = co[i], b = co[(i + 1) % co.length]; s += (b[0] - a[0]) * rad * (2 + Math.sin(a[1] * rad) + Math.sin(b[1] * rad)); }
  return Math.abs(s * R * R / 2);
}
const fmtN = v => v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('en');
const fmtKm = km => `${fmtN(km)} km · ${fmtN(km / KM_MILE)} Roman miles · ${fmtN(km / KM_STADE)} stades`;
const fmtArea = a => `${a < 10 ? a.toFixed(1) : Math.round(a).toLocaleString('en')} km²`;
function dMeasure(x) {
  const k = dKind(x);
  if (k === 'area') return `Area ${fmtArea(areaKm2(x.co))} · outline ${fmtKm(lenKm(x.co, true))}`;
  if (['line', 'arrow', 'free'].includes(k)) return 'Length ' + fmtKm(lenKm(x.co));
  return '';
}
function dLenShort(km) { const u = M.cfg.dLen; return u === 'mi' ? `${fmtN(km / KM_MILE)} R. mi` : u === 'st' ? `${fmtN(km / KM_STADE)} stades` : `${fmtN(km)} km`; }
function dDates(x) {
  if (x.y0 == null && x.y1 == null) return '';
  if (x.y1 == null) return 'from ' + fmtY(x.y0);
  if (x.y0 == null) return 'until ' + fmtY(x.y1);
  return fmtR([x.y0, x.y1]);
}
function parseYear(s) {
  s = String(s || '').trim(); if (!s) return null;
  const m = s.match(/(-?\d+)/); if (!m) return undefined;
  let y = +m[1]; if (/\b(bc|bce|v\.?\s*chr)/i.test(s) && y > 0) y = -y;
  return y;
}

// ---------------------------------------------------------------- what the map draws
function arrowHead(co, lw) {
  if (!M.map || co.length < 2) return null;
  const a = M.map.project(co[co.length - 2]), b = M.map.project(co[co.length - 1]);
  const dx = b.x - a.x, dy = b.y - a.y, n = Math.hypot(dx, dy); if (n < 0.5) return null;
  const ux = dx / n, uy = dy / n, L = 9 + lw * 2.2, W = 4.5 + lw * 1.3, tip = { x: b.x + ux * lw * 0.8, y: b.y + uy * lw * 0.8 };
  const ll = (x, y) => { const q = M.map.unproject([x, y]); return [q.lng, q.lat]; };
  const t = ll(tip.x, tip.y);
  return [t, ll(tip.x - ux * L - uy * W, tip.y - uy * L + ux * W), ll(tip.x - ux * L * 0.72, tip.y - uy * L * 0.72), ll(tip.x - ux * L + uy * W, tip.y - uy * L - ux * W), t];
}
function drawFC() {
  const feats = [];
  for (const x of M.draw?.values() || []) {
    if (x.kind === 'text' || !dShown(x) || !x.co?.length) continue;
    const lw = D_LW[x.lw || 2], pr = { id: x.id, c: x.c || D_COLS[0], lw, d: x.dash ? 1 : 0, s: x.id === M.dSel ? 1 : 0 };
    if (x.y0 != null) pr.y0 = x.y0; if (x.y1 != null) pr.y1 = x.y1;
    if (x.kind === 'area' && x.co.length > 2) feats.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...x.co, x.co[0]]] }, properties: pr });
    else if (x.co.length > 1) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: x.co }, properties: pr });
    if (x.kind === 'arrow') { const h = arrowHead(x.co, lw); if (h) feats.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [h] }, properties: { ...pr, h: 1 } }); }
  }
  return { type: 'FeatureCollection', features: feats };
}
// called by layerStyle (maplayers.js): the sources and layers of the drawings
function drawStyle(st, C, before) {
  st.sources.draw = { type: 'geojson', data: drawFC() };
  st.sources.drawtmp = { type: 'geojson', data: D_EMPTY };
  const noH = ['!', ['has', 'h']];
  before('own',
    { id: 'd-area', type: 'fill', source: 'draw', filter: ['all', ['==', ['geometry-type'], 'Polygon'], noH], paint: { 'fill-color': ['get', 'c'], 'fill-opacity': 0.16 } },
    { id: 'd-halo', type: 'line', source: 'draw', filter: ['all', noH, ['==', ['get', 's'], 1]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.acc, 'line-opacity': 0.35, 'line-width': ['+', ['get', 'lw'], 7] } },
    { id: 'd-line', type: 'line', source: 'draw', filter: ['all', noH, ['==', ['get', 'd'], 0]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': ['get', 'lw'] } },
    { id: 'd-dash', type: 'line', source: 'draw', filter: ['all', noH, ['==', ['get', 'd'], 1]], layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': ['get', 'lw'], 'line-dasharray': [2.4, 1.6] } },
    { id: 'd-head', type: 'fill', source: 'draw', filter: ['has', 'h'], paint: { 'fill-color': ['get', 'c'] } },
    { id: 'd-tmp-a', type: 'fill', source: 'drawtmp', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': C.acc, 'fill-opacity': 0.12 } },
    { id: 'd-tmp', type: 'line', source: 'drawtmp', filter: ['!=', ['geometry-type'], 'Point'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['coalesce', ['get', 'c'], C.acc], 'line-width': ['coalesce', ['get', 'lw'], 2.5], 'line-opacity': 0.85 } },
    { id: 'd-tmp-v', type: 'circle', source: 'drawtmp', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': ['case', ['get', 'first'], 6, 4], 'circle-color': C.bg, 'circle-stroke-color': C.acc, 'circle-stroke-width': 2 } });
}
// called by layerProps: visibility, period filter and opacity
function drawLayerProps() {
  const v = M.cfg.own !== false ? 'visible' : 'none', tf = dTimeF(), all = f => tf ? ['all', f, tf] : f, noH = ['!', ['has', 'h']];
  return {
    'd-area': { vis: v, filter: all(['all', ['==', ['geometry-type'], 'Polygon'], noH]), paint: { 'fill-opacity': dOpacity(0.16) } },
    'd-halo': { vis: v, filter: all(['all', noH, ['==', ['get', 's'], 1]]) },
    'd-line': { vis: v, filter: all(['all', noH, ['==', ['get', 'd'], 0]]), paint: { 'line-opacity': dOpacity(1) } },
    'd-dash': { vis: v, filter: all(['all', noH, ['==', ['get', 'd'], 1]]), paint: { 'line-opacity': dOpacity(1) } },
    'd-head': { vis: v, filter: all(['has', 'h']), paint: { 'fill-opacity': dOpacity(1) } },
    own: { vis: v, filter: tf || true, paint: { 'circle-opacity': dOpacity(1), 'circle-stroke-opacity': dOpacity(1) } },
  };
}
// names of your places, texts, names and lengths of lines (called by drawLabels; drawn on top, exported with the map)
function drawLabelsOwn(placed, W, H) {
  M.dHit = []; if (!M.map || M.cfg.own === false) return '';
  const ctx = drawLabels.c, acc = mapColors().acc, out = (x, y) => x < -80 || x > W + 80 || y < -30 || y > H + 30;
  let h = '';
  const put = (cls, txt, x, y, fs, col, o, extra = '') => `<span class="mlbl ${cls}" style="left:${Math.round(x)}px;top:${Math.round(y)}px;font-size:${fs}px;color:${col};opacity:${o.toFixed(2)}${extra}">${esc(txt)}</span>`;
  for (const p of M.own?.values() || []) {
    if (!dShown(p) || M.shown?.has(p.id)) continue;
    const o = dState(p); if (!o) continue;
    const pt = M.map.project([p.lon, p.lat]); if (out(pt.x, pt.y)) continue;
    ctx.font = '600 13px "Gentium Book Plus", serif';
    const w = ctx.measureText(p.t).width + 4, r = [pt.x + 7, pt.y - 15, pt.x + 7 + w, pt.y + 1];
    placed.push(r); M.lblHit.push([r, p.id]);
    h += put('dl', p.t, r[0], r[1], 13, p.c || acc, o);
  }
  for (const x of M.draw?.values() || []) {
    if (!dShown(x) || !x.co?.length) continue;
    const o = dState(x); if (!o) continue;
    const col = x.c || D_COLS[0];
    if (x.kind === 'text') {
      const pt = M.map.project(x.co[0]); if (out(pt.x, pt.y)) continue;
      const fs = D_TS[x.lw || 2]; ctx.font = `600 ${fs}px "Gentium Book Plus", serif`;
      const w = ctx.measureText(x.t || '').width + 4, r = [pt.x - w / 2, pt.y - fs / 2 - 2, pt.x + w / 2, pt.y + fs / 2 + 2];
      placed.push(r); M.dHit.push([r, x.id]);
      h += put('dt' + (x.id === M.dSel ? ' sel' : ''), x.t || '', r[0], r[1], fs, col, o);
      continue;
    }
    if (x.t) {                                                   // the name of a line or area: in the middle
      const pts = x.co, c = x.kind === 'area' ? pts.reduce((a, q) => [a[0] + q[0] / pts.length, a[1] + q[1] / pts.length], [0, 0]) : pts[pts.length >> 1];
      const pt = M.map.project(c);
      if (!out(pt.x, pt.y)) { ctx.font = 'italic 600 12.5px "Gentium Book Plus", serif'; const w = ctx.measureText(x.t).width + 4, r = x.kind === 'area' ? [pt.x - w / 2, pt.y - 8, pt.x + w / 2, pt.y + 8] : [pt.x + 6, pt.y - 16, pt.x + 6 + w, pt.y];
        placed.push(r); M.dHit.push([r, x.id]); h += put('dn', x.t, r[0], r[1], 12.5, col, o); }
    }
    if (M.cfg.dLen && M.cfg.dLen !== 'off' && x.co.length > 1) {   // the length at the end of a line (an area: its size)
      const area = x.kind === 'area', c = area ? x.co.reduce((a, q) => [a[0] + q[0] / x.co.length, a[1] + q[1] / x.co.length], [0, 0]) : x.co[x.co.length - 1];
      const pt = M.map.project(c); if (out(pt.x, pt.y)) continue;
      const txt = area ? fmtArea(areaKm2(x.co)) : dLenShort(lenKm(x.co));
      h += put('dlen', txt, pt.x + (area ? -20 : 8), pt.y + (area && x.t ? 9 : 2), 11, col, o);
    }
  }
  return h;
}
// a tap on a drawing (lines and edges within reach of a finger, inside an area, a text); with own: also your places
function tapDrawing(pt, own) {
  if (!M.map || M.cfg.own === false) return null;
  const r = matchMedia('(pointer: coarse)').matches ? 18 : 8;
  for (const [b, id] of M.dHit || []) if (pt.x >= b[0] - 3 && pt.x <= b[2] + 3 && pt.y >= b[1] - 3 && pt.y <= b[3] + 3) return id;
  const sd = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy; let t = l ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
  const pip = (p, ps) => { let c = false; for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) if ((ps[i].y > p.y) !== (ps[j].y > p.y) && p.x < (ps[j].x - ps[i].x) * (p.y - ps[i].y) / (ps[j].y - ps[i].y) + ps[i].x) c = !c; return c; };
  let best = null;
  if (own) for (const p of M.own?.values() || []) { if (!dShown(p) || !dState(p)) continue; const q = M.map.project([p.lon, p.lat]), d = Math.hypot(q.x - pt.x, q.y - pt.y) - 4; if (d <= r && (!best || d < best.d)) best = { id: p.id, d }; }
  for (const x of M.draw?.values() || []) {
    if (x.kind === 'text' || !dShown(x) || !dState(x) || !x.co?.length) continue;
    const ps = x.co.map(c => M.map.project(c)), seq = x.kind === 'area' ? [...ps, ps[0]] : ps;
    let d = Infinity; for (let i = 1; i < seq.length; i++) d = Math.min(d, sd(pt, seq[i - 1], seq[i]));
    if (x.kind === 'area' && pip(pt, ps)) d = Math.min(d, r * 0.9);     // inside an area counts, but nearer lines win
    if (d <= r && (!best || d < best.d)) best = { id: x.id, d };
  }
  return best?.id ?? null;
}

// ---------------------------------------------------------------- "Places from": drawings linked to passages
const workOfId = id => (String(id).match(/^w:(.*):\d+$/) || [])[1] || null;
async function scopeCoverage() {
  const c = M.cfg, t = S.text, sc = c.scope;
  if (sc === 'sel') return (c.sel || []).map(x => x.kind === 'work' ? { w: x.w } : { t: x.t, w: workOfId(x.t), kind: x.kind, ref: x.ref });
  if (!t) return [];
  if (sc === 'author') return (await scopeParts()).map(p => ({ t: p.id, w: workOfId(p.id) }));
  if (sc === 'work') return t.work ? [{ w: t.work.id }] : [{ t: t.id }];
  if (sc === 'book') return [{ t: t.id, w: workOfId(t.id) }];
  return [{ t: t.id, w: workOfId(t.id), rg: scopeRange(sc) }];
}
async function linkCovered(l, cov) {
  const lw = l.kind === 'work' ? l.w : workOfId(l.t);
  for (const cv of cov) {
    if (l.kind === 'work' || cv.t == null) { if (lw && lw === (cv.w ?? workOfId(cv.t))) return true; continue; }
    if (String(l.t) !== String(cv.t)) continue;
    if (l.kind === 'book' || (!cv.rg && (!cv.kind || cv.kind === 'book'))) return true;
    const r = S.text && String(S.text.id) === String(l.t) ? { refs: S.refs, toks: S.tokens } : await placesOfAny(l.t);
    if (!r) continue;
    const a = refRange(r, l.kind, l.ref), b = cv.rg || refRange(r, cv.kind, cv.ref);
    if (!a || !b || (a[0] <= b[1] && b[0] <= a[1])) return true;
  }
  return false;
}
// called by refreshMapData: which linked drawings are hidden now
async function dScopeUpdate() {
  await loadDrawings();
  const hide = new Set(), linked = [...M.draw.values(), ...(M.own?.values() || [])].filter(x => x.links?.length);
  if (linked.length && M.cfg.pfOn !== false) {
    const cov = await scopeCoverage();
    for (const x of linked) { let ok = false; for (const l of x.links) if (await linkCovered(l, cov)) { ok = true; break; } if (!ok) hide.add(x.id); }
  }
  M.dHide = hide;
}
async function dGoLink(l) {
  const id = l.kind === 'work' ? `w:${l.w}:0` : l.t;
  if (parseFloat(getSplit()) <= 0.5) { setSplit(M.splitBefore || '50%'); setTimeout(() => M.map?.resize(), 50); }
  if (navNarrowPhone()) { M.back = true; toggleMapTab(false); }
  if (!S.text || String(S.text.id) !== String(id)) await openText(/^\d+$/.test(id) ? +id : id, false);
  const rg = l.ref ? refRange({ refs: S.refs, toks: S.tokens }, l.kind, l.ref) : null;
  requestAnimationFrame(() => { if (rg && rg[0] <= rg[1]) scrollToWord(rg[0]); else $('#textPane').scrollTop = 0; });
}

// ---------------------------------------------------------------- the card of a drawing (or of your own place)
async function showDrawCard(id) {
  const x = dGet(id); if (!x) return;
  if (!x.own) { M.sel = null; }
  M.dSel = id; applyLayers(); dHandles();
  if (M.dm) { $('#mapCard').hidden = true; dInfo(); return; }      // while drawing: the bar shows it (a card would cover the map)
  const card = $('#mapCard'), k = dKind(x), set = M.dsets?.get(dSetOf(x)), meas = dMeasure(x), dates = dDates(x);
  card.innerHTML = `<div class="mch"><b style="color:${esc(x.c || mapColors().acc)}">${esc(x.t || D_KIND[k])}</b><button type="button" class="mx" data-mclose="1" aria-label="Close">✕</button></div>
    <div class="mcs">${k === 'place' ? 'Your own place' : D_KIND[k]} · ${esc(set?.name || 'My drawings')}${dates ? ' · ' + esc(dates) : ''}</div>
    ${meas ? `<div class="dmeas">${esc(meas)}</div>` : ''}${x.note ? `<div class="dnote">${esc(x.note)}</div>` : ''}
    ${x.links?.length ? `<div class="navh">Passages</div><div class="mpass">${x.links.map((l, j) => `<button type="button" class="mps" data-dlink="${j}"><b>${esc(l.label)}</b><span>${esc(l.sub || l.kind)}</span></button>`).join('')}</div>` : ''}
    <div class="macts"><button type="button" data-dedit="${esc(id)}">Edit …</button><button type="button" data-dmove="${esc(id)}">Move points</button><button type="button" class="danger" data-ddel="${esc(id)}">Delete</button></div>`;
  card.hidden = false; card.scrollTop = 0;
}
async function dEditDialog(id) {
  const x = dGet(id); if (!x) return;
  const k = dKind(x), isLine = ['line', 'arrow', 'free'].includes(k), t = S.text;
  const sets = [...M.dsets.values()].map(s => `<option value="${esc(s.id)}"${s.id === dSetOf(x) ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  const adds = t ? ['section', 'chapter', 'book', 'work'].map(kd => { const it = selItem(kd); return it && !(x.links || []).some(l => selKey(l) === selKey(it)) ? `<label class="mpick"><input type="checkbox" name="add_${kd}"> + ${esc(it.label)} <small>${esc(it.sub || kd)}</small></label>` : ''; }).join('') : '<p class="hint small">Open a text to link this drawing to a passage.</p>';
  const r = await dialog(`<h3>${esc(D_KIND[k])}</h3>
    <label>${k === 'text' ? 'Text' : 'Name'}<input type="text" name="t" value="${esc(x.t || '')}" autocomplete="off"></label>
    <label>Note<textarea name="note" rows="3">${esc(x.note || '')}</textarea></label>
    <div class="drow"><label>Set<select name="set">${sets}<option value="__new">New set …</option></select></label>
      <label>Colour<input type="color" name="c" value="${esc(x.c || D_COLS[0])}"></label>
      ${k !== 'place' ? `<label>${k === 'text' ? 'Size' : 'Width'}<select name="lw">${[1, 2, 3].map(w => `<option value="${w}"${(x.lw || 2) === w ? ' selected' : ''}>${k === 'text' ? ['', 'Small', 'Medium', 'Large'][w] : ['', 'Thin', 'Medium', 'Thick'][w]}</option>`).join('')}</select></label>` : ''}</div>
    ${isLine || k === 'area' ? `<div class="drow"><label class="mpick"><input type="checkbox" name="dash"${x.dash ? ' checked' : ''}> Dashed</label>${isLine ? `<label class="mpick"><input type="checkbox" name="arrow"${k === 'arrow' ? ' checked' : ''}> Arrowhead at the end</label>` : ''}</div>` : ''}
    <div class="navh">Period <small>– for the time slider; empty: always shown</small></div>
    <div class="drow"><label>From<input type="text" name="y0" value="${x.y0 != null ? esc(fmtY(x.y0)) : ''}" placeholder="e.g. 401 BC" autocomplete="off" class="nofocus"></label><label>To<input type="text" name="y1" value="${x.y1 != null && x.y1 !== x.y0 ? esc(fmtY(x.y1)) : ''}" placeholder="same year" autocomplete="off" class="nofocus"></label></div>
    <div class="navh">Passages <small>– while “Places from” is on, shown only with these</small></div>
    ${(x.links || []).map((l, j) => `<label class="mpick"><input type="checkbox" name="lk${j}" checked> ${esc(l.label)} <small>${esc(l.sub || l.kind)}</small></label>`).join('')}${adds}`,
    [['cancel', 'Cancel'], ['ok', 'Save']], 'ok');
  if (r.action !== 'ok') return;
  const d = r.data, before = dClone(x);
  x.t = (d.t || '').trim() || (k === 'place' ? x.t : undefined); if (!x.t) delete x.t;
  x.note = (d.note || '').trim() || undefined; if (!x.note) delete x.note;
  x.c = d.c || x.c;
  if (d.lw) x.lw = +d.lw;
  if (isLine || k === 'area') { if (d.dash) x.dash = 1; else delete x.dash; }
  if (isLine && k !== 'free') x.kind = d.arrow ? 'arrow' : 'line'; else if (k === 'free' && d.arrow) x.kind = 'arrow';
  const y0 = parseYear(d.y0), y1 = parseYear(d.y1);
  if (y0 === undefined || y1 === undefined) toast('A year was not understood – write e.g. “401 BC” or “AD 117”.');
  else { if (y0 == null && y1 == null) { delete x.y0; delete x.y1; } else { x.y0 = y0 ?? undefined; x.y1 = y1 ?? (y0 ?? undefined); if (x.y0 == null) delete x.y0; if (x.y0 != null && x.y1 != null && x.y0 > x.y1) [x.y0, x.y1] = [x.y1, x.y0]; } }
  const links = (x.links || []).filter((_, j) => d['lk' + j]);
  for (const kd of ['section', 'chapter', 'book', 'work']) if (d['add_' + kd]) { const it = selItem(kd); if (it) links.push(it); }
  if (links.length) x.links = links; else delete x.links;
  if (d.set === '__new') { const s = await dNewSet(); x.set = s ? s.id : before.set; } else x.set = d.set;
  await dSave(x); M.dm?.undo.push({ id: x.id, before });
  await dScopeUpdate(); applyLayers(); if (!M.dm || M.dm.tool === 'edit') showDrawCard(x.id); else dInfo(); refreshLayersPop();
}
async function dNewSet() {
  const r = await dialog('<h3>New set</h3><p class="hint small">Sets keep drawings together (e.g. one journey); each set can be shown or hidden in the layer menu.</p><label>Name<input type="text" name="n" autocomplete="off"></label>', [['cancel', 'Cancel'], ['ok', 'Create']], 'ok');
  if (r.action !== 'ok' || !r.data.n?.trim()) return null;
  const s = { id: dNewId('s'), name: r.data.n.trim(), created: Date.now() };
  M.dsets.set(s.id, s); await setting('dset|' + s.id, s); return s;
}
async function dDelete(id) {
  const x = dGet(id); if (!x) return;
  const r = await dialog(`<h3>Delete</h3><p>Delete <b>${esc(x.t || D_KIND[dKind(x)])}</b>?</p>`, [['cancel', 'Cancel'], ['ok', 'Delete']], 'ok');
  if (r.action !== 'ok') return;
  M.dm?.undo.push({ id, before: dClone(x) });
  await dRemove(x); if (M.sel?.p?.id === id) M.sel = null;
  closeCard(); applyLayers(); refreshLayersPop(); toast('Deleted' + (M.dm ? ' – Undo brings it back' : ''));
}

// ---------------------------------------------------------------- drawing mode
// one slim row: the tools · a style button (colour, width, dashes, set in a small pop-up) · undo · Done;
// above it a chip only while something is going on (points being set, just saved, selected)
function drawBarHTML() {
  const d = M.dm, sets = [...M.dsets.values()].map(s => `<option value="${esc(s.id)}"${s.id === M.cfg.dSet ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  return `<div class="mdchip" id="mapDrawInfo" hidden></div>
    <div class="mdstyle" id="mapDrawStyle"${d.styleOpen ? '' : ' hidden'}>
      <div class="mdo">${D_COLS.map(c => `<button type="button" class="mdc${d.c === c ? ' on' : ''}" data-dcol="${c}" style="--c:${c}" aria-label="Colour ${c}"></button>`).join('')}<input type="color" id="dColIn" value="${esc(d.c)}" title="Another colour" aria-label="Another colour"></div>
      <div class="mdo"><span class="mdw">${[1, 2, 3].map(w => `<button type="button" data-dlw="${w}" class="${d.lw === w ? 'on' : ''}" title="${['', 'Thin', 'Medium', 'Thick'][w]}" aria-label="${['', 'Thin', 'Medium', 'Thick'][w]}"><i style="height:${D_LW[w]}px"></i></button>`).join('')}</span>
        <button type="button" class="mdd${d.dash ? ' on' : ''}" data-ddash="1" title="Dashed" aria-label="Dashed"><i></i></button><span class="small">dashed</span></div>
      <div class="mdo"><label class="mdset">Set <select id="dSetSel" aria-label="Set for new drawings">${sets}<option value="__new">New set …</option></select></label></div>
    </div>
    <div class="mdrow"><div class="mdt">${D_TOOLS.map(([k, l, ic]) => `<button type="button" data-dtool="${k}" class="${d.tool === k ? 'on' : ''}" title="${l}" aria-label="${l}">${ic}</button>`).join('')}</div>
      <button type="button" class="mdsb${d.styleOpen ? ' on' : ''}" data-dstyle="1" title="Colour, width, set" aria-label="Colour, width, set">${dStyleIcon()}</button>
      <span class="mdend"><button type="button" data-dundo="1" title="Undo" aria-label="Undo">↶</button><button type="button" class="acc" data-ddone="1">Done</button></span></div>`;
}
const dStyleIcon = () => `<i class="mdsw" style="--c:${esc(M.dm.c)}"></i><i class="mdsl" style="--c:${esc(M.dm.c)};height:${D_LW[M.dm.lw]}px${M.dm.dash ? ';background:none;border-top:' + D_LW[M.dm.lw] + 'px dashed ' + esc(M.dm.c) + ';height:0' : ''}"></i><small>▾</small>`;
function dStyleSync() { const b = $('#mapDraw [data-dstyle]'); if (b) b.innerHTML = dStyleIcon(); }
function dInfo() {
  const el = $('#mapDrawInfo'); if (!el || !M.dm) return;
  const d = M.dm, cur = d.cur, x = M.dSel ? dGet(M.dSel) : null;
  let h = '';
  if (cur?.co.length) {
    const km = lenKm(cur.co, cur.kind === 'area');
    h = `<span>${cur.co.length} point${cur.co.length === 1 ? '' : 's'}${km ? ` · <b>${esc(fmtN(km))} km</b> · ${esc(fmtN(km / KM_MILE))} R. mi · ${esc(fmtN(km / KM_STADE))} stades` : ''}${cur.kind === 'area' && cur.co.length > 2 ? ' · ' + fmtArea(areaKm2(cur.co)) : ''}</span><button type="button" class="acc" data-dfinish="1">Finish</button><button type="button" class="mx" data-dcancel="1" aria-label="Cancel">✕</button>`;
  } else if (d.last && dGet(d.last) && d.tool !== 'edit') { const y = dGet(d.last), m = dMeasure(y);
    h = `<span>${esc(D_KIND[dKind(y)])} saved${m ? ' · ' + esc(m.replace(/^Length /, '')) : ''}</span><button type="button" data-dedit="${esc(y.id)}">Edit …</button>`;
  } else if (d.tool === 'edit' && x) h = `<span><b>${esc(x.t || D_KIND[dKind(x)])}</b>${dMeasure(x) ? ' · ' + esc(dMeasure(x).replace(/^Length /, '')) : ''}${dDates(x) ? ' · ' + esc(dDates(x)) : ''}</span><button type="button" data-dedit="${esc(x.id)}">Edit …</button><button type="button" class="danger" data-ddel="${esc(x.id)}">Delete</button>`;
  el.innerHTML = h; el.hidden = !h;
  $('#mapBody').style.setProperty('--dbh', (($('#mapDraw .mdrow')?.offsetHeight || 46) + (h ? el.offsetHeight + 6 : 0)) + 'px');
}
function dTmp() {
  const cur = M.dm?.cur, src = M.map?.getSource('drawtmp'); if (!src) return;
  if (!cur?.co.length) { src.setData(D_EMPTY); return; }
  const f = [], pr = { c: M.dm.c, lw: D_LW[M.dm.lw] };
  if (cur.kind === 'area' && cur.co.length > 2) f.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...cur.co, cur.co[0]]] }, properties: pr });
  else if (cur.co.length > 1) f.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: cur.co }, properties: pr });
  if (cur.kind !== 'free') cur.co.forEach((c, i) => f.push({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { first: i === 0 && cur.kind === 'area' } }));
  src.setData({ type: 'FeatureCollection', features: f });
}
async function drawToggle(on = !M.dm) {
  const body = $('#mapBody'), bar = $('#mapDraw'); if (!bar || !M.map) return;
  if (on) {
    await loadDrawings();
    if (M.cfg.own === false) { M.cfg.own = true; toast('Your own places and drawings are shown again.'); }
    if (!M.dsets.has(M.cfg.dSet)) M.cfg.dSet = [...M.dsets.keys()][0];
    if ((M.cfg.dOff || []).includes(M.cfg.dSet)) M.cfg.dOff = M.cfg.dOff.filter(s => s !== M.cfg.dSet);
    saveMapCfg();
    M.dm = { tool: M.cfg.dTool || 'line', c: M.cfg.dCol || D_COLS[0], lw: M.cfg.dLw || 2, dash: !!M.cfg.dDash, cur: null, undo: [] };
    $('#mapPop').hidden = true; closeCard();
    bar.innerHTML = drawBarHTML(); bar.hidden = false; body.classList.add('drawing'); $('#mapDrawBtn')?.classList.add('on');
    M.map.doubleClickZoom.disable(); dTool(M.dm.tool);
  } else {
    if (M.dm?.cur) await dFinish();
    M.dm = null; bar.hidden = true; body.classList.remove('drawing'); $('#mapDrawBtn')?.classList.remove('on');
    M.map.doubleClickZoom.enable(); M.map.dragPan.enable(); M.map.getCanvas().style.cursor = '';
    dTmp(); dHandles();
  }
  applyLayers();
}
async function dTool(t) {
  if (M.dm.cur) await dFinish();
  M.dm.tool = t; M.dm.last = null; if (t) M.cfg.dTool = t; saveMapCfg();
  if (t === 'free') M.map.dragPan.disable(); else M.map.dragPan.enable();
  M.map.getCanvas().style.cursor = !t || t === 'edit' ? '' : 'crosshair';
  $('#mapDraw')?.querySelectorAll('[data-dtool]').forEach(b => b.classList.toggle('on', b.dataset.dtool === t));
  if (t !== 'edit') { M.dSel = null; $('#mapCard').hidden = true; applyLayers(); }
  if (t && M.dm.hinted !== t) { M.dm.hinted = t; toast(D_HINT[t], 3000, true); }
  dInfo(); dHandles();
}
async function dFinish() {
  const cur = M.dm?.cur; if (!cur) return; M.dm.cur = null; dTmp();
  if (cur.co.length < (cur.kind === 'area' ? 3 : 2)) { dInfo(); return; }
  const x = { id: dNewId('d'), set: M.cfg.dSet || 'd0', kind: cur.kind, co: cur.co, c: M.dm.c, lw: M.dm.lw, created: Date.now() };
  if (M.dm.dash && cur.kind !== 'text') x.dash = 1;
  await dSave(x); M.dm.undo.push({ id: x.id, before: null });
  M.dm.last = x.id; applyLayers(); dInfo();                        // (the card would cover the map: the bar tells what was saved)
}
// a tap on the map while drawing (called first by the click handler of the map)
function drawClick(e) {
  if (M.dm?.styleOpen) { M.dm.styleOpen = false; $('#mapDrawStyle').hidden = true; $('#mapDraw [data-dstyle]')?.classList.remove('on'); return true; }   // a tap closes the style pop-up
  if (!M.dm || !M.dm.tool) return false;                         // no tool chosen: the map as usual
  const ll = [r5(e.lngLat.lng), r5(e.lngLat.lat)], d = M.dm, t = d.tool;
  if (t === 'place') { dAddPoint(ll); return true; }
  if (t === 'text') { dAddText(ll); return true; }
  if (['line', 'arrow', 'area'].includes(t)) {
    d.last = null;
    const cur = d.cur ??= { kind: t, co: [] };
    const end = cur.kind === 'area' ? cur.co[0] : cur.co[cur.co.length - 1];
    if (cur.co.length >= (cur.kind === 'area' ? 3 : 2)) { const q = M.map.project(end); if (Math.hypot(q.x - e.point.x, q.y - e.point.y) < 16) { dFinish(); return true; } }
    cur.co.push(ll); dTmp(); dInfo(); return true;
  }
  // select (and freehand: a tap without drawing)
  const id = tapDrawing(e.point, true);
  if (id) (async () => { if (t !== 'edit') await dTool('edit'); await showDrawCard(id); })();
  else { M.dSel = null; $('#mapCard').hidden = true; applyLayers(); dHandles(); dInfo(); }
  return true;
}
async function dAddPoint(ll) {
  const r = await dialog('<h3>New place</h3><label>Name<input type="text" name="n" autocomplete="off"></label>', [['cancel', 'Cancel'], ['ok', 'Save']], 'ok');
  if (r.action !== 'ok' || !r.data.n?.trim()) return;
  const p = { id: dNewId('o'), t: r.data.n.trim(), lat: ll[1], lon: ll[0], own: 1, ty: [], names: [], set: M.cfg.dSet || 'd0', c: M.dm?.c, created: Date.now() };
  await dSave(p); M.dm?.undo.push({ id: p.id, before: null }); if (M.dm) M.dm.last = p.id; applyLayers(); dInfo();
}
async function dAddText(ll) {
  const r = await dialog('<h3>Text on the map</h3><label>Text<input type="text" name="n" autocomplete="off"></label>', [['cancel', 'Cancel'], ['ok', 'Save']], 'ok');
  if (r.action !== 'ok' || !r.data.n?.trim()) return;
  const x = { id: dNewId('d'), set: M.cfg.dSet || 'd0', kind: 'text', co: [ll], t: r.data.n.trim(), c: M.dm?.c || D_COLS[5], lw: M.dm?.lw || 2, created: Date.now() };
  await dSave(x); M.dm?.undo.push({ id: x.id, before: null }); if (M.dm) M.dm.last = x.id; applyLayers(); dInfo();
}
async function dUndo() {
  const d = M.dm; if (!d) return;
  if (d.cur?.co.length) { d.cur.co.pop(); if (!d.cur.co.length) d.cur = null; dTmp(); dInfo(); return; }
  const u = d.undo.pop(); if (!u) return toast('Nothing to undo.');
  const now = dGet(u.id);
  if (u.before == null) { if (now) await dRemove(now); if (M.dSel === u.id) { M.dSel = null; $('#mapCard').hidden = true; } }
  else { if (now && now.own !== u.before.own) await dRemove(now); if (u.before.own) M.own.set(u.id, u.before); await dSave(u.before); if (M.dSel === u.id) showDrawCard(u.id); }
  applyLayers(); dHandles(); dInfo(); refreshLayersPop();
}
// a change of colour, width or dashes: for new drawings, and for the selected one
async function dStyleSel(f) {
  const x = M.dSel && (!M.dm || M.dm.tool === 'edit') ? dGet(M.dSel) : null; if (!x) return;   // (choosing the colour of the next drawing)
  const before = dClone(x); f(x); await dSave(x); M.dm?.undo.push({ id: x.id, before }); applyLayers(); showDrawCard(x.id);
}

// ---------------------------------------------------------------- moving points (tool "Select")
function dHandles() {
  const box = $('#mapHandles'); if (!box || M.hdrag) return;
  const x = M.dm?.tool === 'edit' && M.dSel ? dGet(M.dSel) : null;
  if (!x || !dShown(x)) { if (box.innerHTML) box.innerHTML = ''; return; }
  const pts = x.own ? [[x.lon, x.lat]] : x.co, P = pts.map(c => M.map.project(c));
  const at = (p, cls, attr) => `<div class="mh${cls}" ${attr} style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px"></div>`;
  let h = '';
  if (x.kind === 'free') { h += at(P[0], '', 'data-hk="0"') + at(P[P.length - 1], '', `data-hk="${P.length - 1}"`); }
  else {
    P.forEach((p, k) => { h += at(p, '', `data-hk="${k}"`); });
    if (!x.own && x.kind !== 'text') {
      const segs = x.kind === 'area' ? P.length : P.length - 1;
      for (let k = 0; k < segs; k++) { const a = P[k], b = P[(k + 1) % P.length]; if (Math.hypot(b.x - a.x, b.y - a.y) < 44) continue; h += at({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ' mid', `data-hm="${k}"`); }
    }
  }
  if (P.length > 1) {                                            // the whole drawing: a handle in its middle
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of P) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    let c = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    if (P.some(p => Math.hypot(p.x - c.x, p.y - c.y) < 26)) c = { x: c.x + 26, y: c.y };   // not on a point
    h += at(c, ' all', 'data-hall="1" title="Move the whole drawing"');
  }
  box.innerHTML = h;
}
function wireHandles() {
  const box = $('#mapHandles'); if (!box || box._w) return; box._w = true;
  let g = null, lp = 0, raf = 0;
  const minPts = x => x.kind === 'area' ? 3 : 2;
  box.addEventListener('pointerdown', ev => {
    const h = ev.target.closest('.mh'); if (!h) return;
    ev.preventDefault(); ev.stopPropagation();
    const x = dGet(M.dSel); if (!x) return;
    h.setPointerCapture(ev.pointerId); h.classList.add('drag'); box.classList.add('dragging');
    g = { x, h, before: dClone(x), k: h.dataset.hk != null ? +h.dataset.hk : null, m: h.dataset.hm != null ? +h.dataset.hm : null, all: !!h.dataset.hall,
      x0: ev.clientX, y0: ev.clientY, l0: parseFloat(h.style.left), t0: parseFloat(h.style.top), start: (x.own ? [[x.lon, x.lat]] : x.co).map(c => M.map.project(c)) };
    M.hdrag = true;
    clearTimeout(lp); lp = setTimeout(async () => {                 // hold a point: it is removed
      if (!g || g.moved || g.k == null || x.own || x.kind === 'text' || x.co.length <= minPts(x)) return;
      const gg = g; g = null; M.hdrag = false; box.classList.remove('dragging');
      x.co.splice(gg.k, 1); navigator.vibrate?.(15); await dSave(x); M.dm?.undo.push({ id: x.id, before: gg.before }); applyLayers(); dHandles(); dInfo();
    }, 550);
  });
  box.addEventListener('pointermove', ev => {
    if (!g) return;
    const dx = ev.clientX - g.x0, dy = ev.clientY - g.y0;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    g.moved = true; clearTimeout(lp);
    const x = g.x, un = p => { const q = M.map.unproject([p.x, p.y]); return [r5(q.lng), r5(q.lat)]; };
    if (g.m != null) { const a = g.start[g.m], b = g.start[(g.m + 1) % g.start.length], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; g.start.splice(g.m + 1, 0, mid); x.co.splice(g.m + 1, 0, un(mid)); g.k = g.m + 1; g.m = null; }
    if (g.all) { const co = g.start.map(p => un({ x: p.x + dx, y: p.y + dy })); if (x.own) [x.lon, x.lat] = co[0]; else x.co = co; }
    else if (g.k != null) { const c = un({ x: g.start[g.k].x + dx, y: g.start[g.k].y + dy }); if (x.own) { x.lon = c[0]; x.lat = c[1]; } else x.co[g.k] = c; }
    g.h.style.left = (g.l0 + dx) + 'px'; g.h.style.top = (g.t0 + dy) + 'px';
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; M.map.getSource('draw')?.setData(drawFC()); M.map.getSource('own')?.setData(ownFC()); drawLabels(); dInfo(); });
  });
  const up = async () => {
    clearTimeout(lp); if (!g) return;
    const gg = g; g = null; M.hdrag = false; box.classList.remove('dragging'); gg.h.classList.remove('drag');
    if (gg.moved) { await dSave(gg.x); M.dm?.undo.push({ id: gg.x.id, before: gg.before }); if (gg.x.own) { M.workCache = null; M.anyCache = null; } }
    applyLayers(); dHandles(); dInfo();
  };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
}
// freehand: one finger draws (the map does not pan meanwhile); a second finger stops the stroke, so that pinching works
function wireFreehand() {
  const cc = M.map.getCanvasContainer(); if (cc._fw) return; cc._fw = true;
  let s = null; const down = new Set();
  const rect = () => cc.getBoundingClientRect();
  cc.addEventListener('pointerdown', ev => {
    if (M.dm?.tool !== 'free') return;
    down.add(ev.pointerId);
    if (down.size > 1) { s = null; M.dm.cur = null; dTmp(); return; }
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    M.dm.last = null; const r = rect(); s = { id: ev.pointerId, pts: [{ x: ev.clientX - r.left, y: ev.clientY - r.top }] };
  });
  cc.addEventListener('pointermove', ev => {
    if (!s || ev.pointerId !== s.id || M.dm?.tool !== 'free') return;
    const r = rect(), p = { x: ev.clientX - r.left, y: ev.clientY - r.top }, l = s.pts[s.pts.length - 1];
    if (Math.hypot(p.x - l.x, p.y - l.y) < 2.5) return;
    s.pts.push(p);
    M.dm.cur = { kind: 'free', co: s.pts.map(q => { const u = M.map.unproject([q.x, q.y]); return [u.lng, u.lat]; }) }; dTmp();
  });
  const up = async ev => {
    down.delete(ev.pointerId);
    if (!s || ev.pointerId !== s.id) return;
    const pts = s.pts; s = null;
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (!M.dm || len < 10) { if (M.dm) M.dm.cur = null; dTmp(); return; }
    M.dm.cur = { kind: 'free', co: simplify(pts, 1.4).map(q => { const u = M.map.unproject([q.x, q.y]); return [r5(u.lng), r5(u.lat)]; }) };
    await dFinish();
  };
  cc.addEventListener('pointerup', up); cc.addEventListener('pointercancel', up);
}
function simplify(P, tol) {                                     // Douglas–Peucker, in screen pixels
  if (P.length < 3) return P;
  const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
  const st = [[0, P.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const dx = P[b].x - P[a].x, dy = P[b].y - P[a].y, l = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * P[i].x - dx * P[i].y + P[b].x * P[a].y - P[b].y * P[a].x) / l; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return P.filter((_, i) => keep[i]);
}
// wired once, when the map has loaded (from showMap1)
function wireDraw() {
  wireHandles(); wireFreehand();
  let raf = 0;
  M.map.on('move', () => { if (M.dm?.tool === 'edit' && M.dSel) dHandles(); });
  M.map.on('zoom', () => { if (!raf && [...(M.draw?.values() || [])].some(x => x.kind === 'arrow')) raf = requestAnimationFrame(() => { raf = 0; M.map.getSource('draw')?.setData(drawFC()); }); });
}
document.addEventListener('keydown', ev => {
  if (!M.dm || ev.target.closest?.('input,textarea,select,dialog')) return;
  if (ev.key === 'Escape') { if (M.dm.cur) { M.dm.cur = null; dTmp(); dInfo(); } else drawToggle(false); }
  if (ev.key === 'Enter' && M.dm.cur) dFinish();
  if ((ev.ctrlKey || ev.metaKey) && ev.key === 'z') { ev.preventDefault(); dUndo(); }
});
document.addEventListener('change', async ev => {
  if (ev.target.id === 'dSetSel') {
    let v = ev.target.value;
    if (v === '__new') { const s = await dNewSet(); v = s ? s.id : M.cfg.dSet; M.cfg.dSet = v; $('#mapDraw').innerHTML = drawBarHTML(); dInfo(); }
    M.cfg.dSet = v; if ((M.cfg.dOff || []).includes(v)) M.cfg.dOff = M.cfg.dOff.filter(s => s !== v);
    saveMapCfg(); applyLayers();
  }
  if (ev.target.id === 'dColIn' && M.dm) { M.dm.c = M.cfg.dCol = ev.target.value; saveMapCfg(); dStyleSync(); $('#mapDraw').querySelectorAll('.mdc').forEach(b => b.classList.remove('on')); dStyleSel(x => { x.c = M.dm.c; }); }
});

// ---------------------------------------------------------------- Layers → Your own: the sets
function ownLayersHTML() {
  const c = M.cfg, off = c.dOff || [], cnt = {};
  for (const x of [...(M.draw?.values() || []), ...(M.own?.values() || [])]) { const s = dSetOf(x); cnt[s] = (cnt[s] || 0) + 1; }
  return tgl('own', 'Your places and drawings', c.own !== false)
    + `<div class="navh">Sets</div>${[...(M.dsets?.values() || [])].map(s => `<div class="dsetrow"><button type="button" class="mtg${off.includes(s.id) ? '' : ' on'}" data-dsettg="${esc(s.id)}"><span class="ck"></span>${esc(s.name)} <small>${cnt[s.id] || 0}</small></button><button type="button" class="mico2" data-dsetmenu="${esc(s.id)}" title="Rename, export, delete" aria-label="More">⋯</button></div>`).join('')}
    <div class="macts"><button type="button" data-dsetnew="1">+ New set</button><button type="button" data-dimport="1">Import GeoJSON …</button><button type="button" data-dexport="*">Export all</button></div>`
    + segc('dLen', [['off', 'Off'], ['km', 'km'], ['mi', 'Roman miles'], ['st', 'Stades']], 'Lengths on the map')
    + `<p class="hint small">Draw with the pen button of the map.</p>`;
}
async function dSetMenu(id) {
  const s = M.dsets.get(id); if (!s) return;
  const n = [...M.draw.values(), ...M.own.values()].filter(x => dSetOf(x) === id).length, last = M.dsets.size < 2;
  const r = await dialog(`<h3>Set</h3><label>Name<input type="text" name="n" value="${esc(s.name)}" autocomplete="off"></label><p class="hint small">${n} item${n === 1 ? '' : 's'}.${last ? '' : ' Deleting the set deletes its drawings and places.'}</p>`,
    [...(last ? [] : [['del', 'Delete set']]), ['exp', 'Export GeoJSON'], ['cancel', 'Cancel'], ['ok', 'Save']], 'ok');
  if (r.action === 'ok' && r.data.n?.trim()) { s.name = r.data.n.trim(); await setting('dset|' + id, s); }
  if (r.action === 'exp') await dExport(id);
  if (r.action === 'del') {
    const ok = await dialog(`<h3>Delete the set</h3><p>Delete <b>${esc(s.name)}</b> with its ${n} item${n === 1 ? '' : 's'}? This cannot be undone.</p>`, [['cancel', 'Cancel'], ['ok', 'Delete']], 'ok');
    if (ok.action !== 'ok') return;
    for (const x of [...M.draw.values(), ...M.own.values()]) if (dSetOf(x) === id) await dRemove(x);
    M.dsets.delete(id); await del('settings', 'dset|' + id);
    if (M.cfg.dSet === id) M.cfg.dSet = [...M.dsets.keys()][0];
    M.cfg.dOff = (M.cfg.dOff || []).filter(x => x !== id); await saveMapCfg();
    closeCard(); toast('Set deleted');
  }
  applyLayers(); refreshLayersPop();
}
// the clicks of the pen button, the drawing bar, the card and the layer menu (called by the click handler of the map)
async function drawUIClick(b) {
  const d = b.dataset;
  if (b.id === 'mapDrawBtn') { await drawToggle(); return true; }
  if (d.dtool) { await dTool(M.dm.tool === d.dtool ? null : d.dtool); return true; }   // the chosen tool again: none
  if (d.dcol) { M.dm.c = M.cfg.dCol = d.dcol; saveMapCfg(); b.parentElement.querySelectorAll('.mdc').forEach(x => x.classList.toggle('on', x === b)); $('#dColIn').value = d.dcol; dTmp(); dStyleSync(); await dStyleSel(x => { x.c = d.dcol; }); return true; }
  if (d.dlw) { M.dm.lw = M.cfg.dLw = +d.dlw; saveMapCfg(); b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); dTmp(); dStyleSync(); await dStyleSel(x => { if (!x.own) x.lw = +d.dlw; }); return true; }
  if (d.ddash) { M.dm.dash = M.cfg.dDash = !M.dm.dash; saveMapCfg(); b.classList.toggle('on', M.dm.dash); dStyleSync(); await dStyleSel(x => { if (!x.own && x.kind !== 'text') { if (M.dm.dash) x.dash = 1; else delete x.dash; } }); return true; }
  if (d.dstyle) { M.dm.styleOpen = !M.dm.styleOpen; $('#mapDrawStyle').hidden = !M.dm.styleOpen; b.classList.toggle('on', M.dm.styleOpen); return true; }
  if (d.dundo) { await dUndo(); return true; }
  if (d.ddone) { await drawToggle(false); return true; }
  if (d.dfinish) { await dFinish(); return true; }
  if (d.dcancel) { M.dm.cur = null; dTmp(); dInfo(); return true; }
  if (d.dedit) { await dEditDialog(d.dedit); return true; }
  if (d.dmove) { if (!M.dm) await drawToggle(true); await dTool('edit'); await showDrawCard(d.dmove); dInfo(); return true; }
  if (d.ddel) { await dDelete(d.ddel); dHandles(); dInfo(); return true; }
  if (d.dlink != null) { const x = dGet(M.dSel) || (M.sel?.p?.own ? M.sel.p : null), l = x?.links?.[+d.dlink]; if (l) await dGoLink(l); return true; }
  if (d.dsettg) { const off = new Set(M.cfg.dOff || []); off.has(d.dsettg) ? off.delete(d.dsettg) : off.add(d.dsettg); M.cfg.dOff = [...off]; await saveMapCfg(); applyLayers(); refreshLayersPop(); return true; }
  if (d.dsetmenu) { await dSetMenu(d.dsetmenu); return true; }
  if (d.dsetnew) { const s = await dNewSet(); if (s) { M.cfg.dSet = s.id; await saveMapCfg(); if (M.dm) { $('#mapDraw').innerHTML = drawBarHTML(); dInfo(); } } refreshLayersPop(); return true; }
  if (d.dexport) { await dExport(d.dexport); return true; }
  if (d.dimport) { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.geojson,.json,application/geo+json,application/json'; inp.onchange = () => inp.files[0] && dImport(inp.files[0]); inp.click(); return true; }
  return false;
}

// ---------------------------------------------------------------- GeoJSON
function dGeoJSON(setId) {
  const items = [...(M.own?.values() || []), ...(M.draw?.values() || [])].filter(x => setId === '*' || dSetOf(x) === setId);
  const feats = items.map(x => {
    const k = dKind(x), p = { name: x.t || '', pult_kind: k, pult_set: M.dsets.get(dSetOf(x))?.name || '' };
    if (x.note) p.description = x.note;
    if (x.y0 != null) p.from = x.y0; if (x.y1 != null) p.to = x.y1;
    if (x.links?.length) p.pult_passages = x.links.map(l => l.label);
    const c = x.c || (k === 'place' ? '#b23a3a' : D_COLS[0]);
    if (k === 'place' || k === 'text') { p['marker-color'] = c; if (k === 'text') p.pult_size = x.lw || 2; return { type: 'Feature', geometry: { type: 'Point', coordinates: x.own ? [x.lon, x.lat] : x.co[0] }, properties: p }; }
    p.stroke = c; p['stroke-width'] = D_LW[x.lw || 2]; if (x.dash) p.pult_dash = 1;
    if (k === 'area') { p.fill = c; p['fill-opacity'] = 0.16; p.area_km2 = +areaKm2(x.co).toFixed(2); return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...x.co, x.co[0]]] }, properties: p }; }
    p.length_km = +lenKm(x.co).toFixed(2);
    return { type: 'Feature', geometry: { type: 'LineString', coordinates: x.co }, properties: p };
  });
  return { type: 'FeatureCollection', features: feats };
}
async function dExport(setId) {
  await loadDrawings();
  const gj = dGeoJSON(setId); if (!gj.features.length) return toast('Nothing to export.');
  const name = (setId === '*' ? 'Pult drawings' : M.dsets.get(setId)?.name || 'drawings').replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.geojson';
  const blob = new Blob([JSON.stringify(gj)], { type: 'application/geo+json' }), href = URL.createObjectURL(blob);
  await dialog(`<h3>Export ready</h3><p>${esc(name)} (${mb(blob.size)}, ${gj.features.length} item${gj.features.length === 1 ? '' : 's'})</p><p class="hint small">GeoJSON opens in QGIS, Google My Maps, geojson.io and most other map programs.</p>`, [['link', 'Save file', { href, name }], ['cancel', 'Close']]);
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}
async function dImport(file) {
  await loadDrawings();
  let j; try { j = JSON.parse(await file.text()); } catch (_) { return toast('Not a GeoJSON file.'); }
  const feats = [];
  const walk = (g, p) => {
    if (!g) return;
    if (g.type === 'FeatureCollection') return g.features?.forEach(f => walk(f.geometry, f.properties || {}));
    if (g.type === 'Feature') return walk(g.geometry, g.properties || {});
    if (g.type === 'GeometryCollection') return g.geometries?.forEach(x => walk(x, p));
    const multi = { MultiPoint: 'Point', MultiLineString: 'LineString', MultiPolygon: 'Polygon' }[g.type];
    if (multi) return g.coordinates?.forEach(c => walk({ type: multi, coordinates: c }, p));
    if (['Point', 'LineString', 'Polygon'].includes(g.type)) feats.push({ g, p: p || {} });
  };
  walk(j, {});
  if (!feats.length) return toast('No points, lines or areas found in this file.');
  const sname = file.name.replace(/\.(geo)?json$/i, '').trim() || 'Imported';
  const r = await dialog(`<h3>Import GeoJSON</h3><p>${feats.length} item${feats.length === 1 ? '' : 's'} into a new set:</p><label>Name of the set<input type="text" name="n" value="${esc(sname)}" autocomplete="off"></label>`, [['cancel', 'Cancel'], ['ok', 'Import']], 'ok');
  if (r.action !== 'ok') return;
  const s = { id: dNewId('s'), name: (r.data.n || sname).trim(), created: Date.now() }; M.dsets.set(s.id, s); await setting('dset|' + s.id, s);
  const col = v => /^#[0-9a-f]{6}$/i.test(v || '') ? v : /^#[0-9a-f]{3}$/i.test(v || '') ? '#' + v.slice(1).split('').map(c => c + c).join('') : null;
  const pc = c => [r5(+c[0]), r5(+c[1])], ok = c => Array.isArray(c) && isFinite(c[0]) && isFinite(c[1]);
  let n = 0, x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const { g, p } of feats) {
    const name = p.name ?? p.Name ?? p.NAME ?? p.title ?? p.label ?? '', note = p.description ?? p.desc ?? p.note ?? '';
    const base = { set: s.id, created: Date.now(), c: col(p.stroke || p['marker-color'] || p.fill || p.color) || D_COLS[0] };
    if (name) base.t = String(name); if (note && typeof note === 'string') base.note = note;
    const yf = parseYear(p.from ?? p.pult_y0), yt = parseYear(p.to ?? p.pult_y1); if (yf != null) base.y0 = yf; if (yt != null) base.y1 = yt;
    const sw = +p['stroke-width']; base.lw = !sw ? 2 : sw < 2.3 ? 1 : sw < 4 ? 2 : 3; if (p.pult_size) base.lw = +p.pult_size;
    if (p.pult_dash) base.dash = 1;
    let x;
    if (g.type === 'Point') { if (!ok(g.coordinates)) continue; const c = pc(g.coordinates);
      x = p.pult_kind === 'text' ? { ...base, id: dNewId('d'), kind: 'text', co: [c], t: base.t || '' } : { ...base, id: dNewId('o'), t: base.t || 'Place', lat: c[1], lon: c[0], own: 1, ty: [], names: [] }; }
    else if (g.type === 'LineString') { const co = (g.coordinates || []).filter(ok).map(pc); if (co.length < 2) continue; x = { ...base, id: dNewId('d'), kind: ['arrow', 'free'].includes(p.pult_kind) ? p.pult_kind : 'line', co }; }
    else { const ring = (g.coordinates?.[0] || []).filter(ok).map(pc); if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop(); if (ring.length < 3) continue; x = { ...base, id: dNewId('d'), kind: 'area', co: ring }; }
    if (x.own) delete x.lw;
    await dSave(x); n++;
    for (const c of x.own ? [[x.lon, x.lat]] : x.co) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); }
  }
  M.cfg.own = true; await saveMapCfg(); applyLayers(); refreshLayersPop();
  if (n && M.map) M.map.fitBounds([[x0, y0], [x1, y1]], { padding: 60, maxZoom: 10, duration: 600 });
  toast(`${n} item${n === 1 ? '' : 's'} imported into “${s.name}”.`);
}
