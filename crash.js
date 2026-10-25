// ================================================================ Pult · crash reports (657a–662a, v409)
// A flight recorder: what the app was doing is written to the device every two seconds and at every error – the camera, the map's
// state, the last hundred actions, the errors – so that when the page is killed (on iPad: the screen white, then black, the app
// starting anew – the graphics memory run out), the record of its last seconds is still there at the next start. A mark "running"
// is set at the start and taken away when the page is closed or put in the background: found again at a start, the last session
// ended unexpectedly while in use, and a report is offered (Copy · Save as file), kept under ☰ → This Pult → Crash reports (the
// last five). Errors while the app runs and the graphics being lost go into the same record. Nothing leaves the device by itself.
const CR = { t0: Date.now(), log: [], err: [], snaps: [], dev: null, ver: '', fr: 0, frT: performance.now(), gest: null, pending: null };
const CR_LIVE = 'pult.crash.live', CR_BOX = 'pult.crash.box', CR_REPS = 'pult.crash.reports';
const crM = () => (typeof M !== 'undefined' ? M : null);   // (the app's state – a const of core.js, not a property of window)
const crGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
const crSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (_) { } };
const crT = () => Math.round((Date.now() - CR.t0) / 100) / 10;           // (seconds since the start)
function crNote(kind, msg) { CR.log.push([crT(), kind, String(msg ?? '').slice(0, 160)]); if (CR.log.length > 100) CR.log.shift(); }
function crErr(kind, msg, where) {
  CR.err.push([crT(), kind, String(msg ?? '').slice(0, 300), String(where || '').slice(0, 1500)]); if (CR.err.length > 30) CR.err.shift();
  crNote('error', kind + ': ' + String(msg ?? '').slice(0, 100)); crSnap(true);
}
// the record as it stands
function crBox() {
  let cfg = null; try { cfg = crM()?.cfg ? JSON.parse(JSON.stringify(crM().cfg)) : null; } catch (_) { }
  return { app: 'Pult', ver: CR.ver, t0: CR.t0, dev: CR.dev, cfg, snaps: CR.snaps, log: CR.log, err: CR.err };
}
// the state every two seconds (and at once at an error): the camera, the map, its tiles, how fast it draws, the memory if told
function crSnap(now) {
  const s = { t: crT(), vis: document.visibilityState === 'visible' ? 1 : 0 };
  try {
    const m = crM()?.map, c = crM()?.cam, r = v => Math.round(v * 1e4) / 1e4;
    s.pane = $('#mapBody') && !$('#mapBody').hidden ? 'map' : 'text';
    if (c) s.cam = { mode: c.mode, lng: r(c.lng), lat: r(c.lat), alt: Math.round(c.alt), pt: +c.pt.toFixed(1), br: +c.br.toFixed(1), roll: +(c.roll || 0).toFixed(1), ...(c.mode === 'fly' ? { bank: +(c.bank || 0).toFixed(1), hd: +(c.hd ?? 0).toFixed(1), v: Math.round(Math.hypot(c.vF || 0, c.vR || 0)) } : {}) };
    if (m) {
      const T = m.style?.tileManagers || {}; let n = 0; const per = {};
      for (const k in T) { try { const v = T[k].getVisibleCoordinates?.().length || 0; n += v; if (v) per[k] = v; } catch (_) { } }
      s.map = { z: +m.getZoom().toFixed(2), glb: m.transform?.isGlobeRendering ? 1 : 0, tiles: n, per, ter: m.terrain ? m.terrain.tileManager?.getRenderableTiles?.().length || 1 : 0, fov: +(m.getVerticalFieldOfView?.() || 0).toFixed(1) };
      const cv = m.getCanvas(); s.map.cv = cv.width + '×' + cv.height;
    }
    if (crM()?.sdOpen) s.dial = 1;
    const t = performance.now(); s.fps = Math.round(CR.fr / Math.max(0.5, (t - CR.frT) / 1000)); CR.fr = 0; CR.frT = t;
    if (performance.memory) s.mem = Math.round(performance.memory.usedJSHeapSize / 1e6);
  } catch (e) { s.snapErr = String(e?.message || e).slice(0, 100); }
  CR.snaps.push(s); if (CR.snaps.length > 30) CR.snaps.shift();
  crSet(CR_BOX, crBox()); const L = crGet(CR_LIVE); if (L && L.t0 === CR.t0) { L.last = Date.now(); crSet(CR_LIVE, L); }
  crPerf(s);
}
// ---- at the start: did the last session end unexpectedly?
(function crStart() {
  const L = crGet(CR_LIVE), B = crGet(CR_BOX);
  if (L && !L.bg && B && B.t0 === L.t0) {
    const rep = { ...B, kind: 'closed unexpectedly', ended: L.last || null, found: Date.now() };
    const reps = crGet(CR_REPS) || []; reps.unshift(rep); crSet(CR_REPS, reps.slice(0, 5)); CR.pending = rep;
  }
  // (a start out of sight – the app woken in the background, or reloaded while another was in front – is not "in use": when it ends
  // there, it is no crash; it counts once it has been seen – v415)
  crSet(CR_LIVE, { t0: CR.t0, last: Date.now(), bg: document.visibilityState !== 'visible' });
  addEventListener('pagehide', () => crSet(CR_LIVE, null));         // (closed or reloaded on purpose: no crash)
  document.addEventListener('visibilitychange', () => { const v = crGet(CR_LIVE) || { t0: CR.t0 }; v.bg = document.visibilityState !== 'visible'; v.last = Date.now(); crSet(CR_LIVE, v); crNote('app', v.bg ? 'to the background' : 'back'); });
  // errors
  addEventListener('error', e => { if (e.target && e.target !== window) return; crErr('error', e.message, `${(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno}\n${e.error?.stack || ''}`); });
  // (a promise refused without a reason – e.g. the device's database closing a request while the app is put away – says little: what
  // was going on is kept with it: the page in sight or not, the app's last step, the last action)
  addEventListener('unhandledrejection', e => { const r = e.reason, m = crM();
    crErr('promise', r?.message || (r == null ? `refused without a reason (page ${document.visibilityState}, step ${m?.step || '–'}, last: ${(CR.log.at(-1) || []).slice(1).join(' ')})` : String(r)), r?.stack || ''); });
  for (const k of ['error', 'warn']) { const o = console[k].bind(console); console[k] = (...a) => { try { const msg = a.map(x => x?.message || (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
    if (k === 'error') crErr('console', msg, a.find(x => x?.stack)?.stack || ''); else crNote('warn', msg); } catch (_) { } o(...a); }; }
  // actions: taps on buttons, gestures on the map (how many fingers, how long)
  document.addEventListener('click', e => { const b = e.target.closest?.('button, a, [role="tab"], summary, label'); if (!b) return;
    const d = Object.entries(b.dataset || {})[0]; crNote('tap', b.id || (d ? `${d[0]}=${d[1]}` : '') || b.title || (b.textContent || '').trim().slice(0, 24)); }, true);
  document.addEventListener('pointerdown', e => { if (!e.target.closest?.('#mapBody canvas, #mapCanvas')) return;
    const g = CR.gest ||= { n: 0, max: 0, t: Date.now(), btn: e.button, kind: e.pointerType }; g.n++; g.max = Math.max(g.max, g.n); }, true);
  const up = e => { const g = CR.gest; if (!g) return; g.n = Math.max(0, g.n - 1); if (g.n) return; CR.gest = null;
    crNote('gesture', `${g.max} ${g.kind === 'mouse' ? (g.btn === 2 ? 'right button' : 'button') : g.max === 1 ? 'finger' : 'fingers'}, ${((Date.now() - g.t) / 1000).toFixed(1)} s`); };
  document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', up, true);
  document.addEventListener('keydown', e => { if (e.repeat || !crM()?.cam || e.target.closest?.('input, textarea')) return; crNote('key', e.key); }, true);
  // the app's version (from the offline cache's name), the device
  // (the version running, as the offline helper says – the store may still hold an older one's files for a while – v415)
  setTimeout(() => { try { swVer?.().then(v => { if (v) CR.ver = 'v' + v; }).catch(() => { }); } catch (_) { } }, 1500);
  caches?.keys?.().then(ks => { if (!CR.ver) { const n = ks.map(k => +((k.match(/^lesepult-v(\d+)/) || [])[1] || 0)).sort((a, b) => b - a)[0]; if (n) CR.ver = 'v' + n; } }).catch(() => { });
  CR.dev = { ua: navigator.userAgent, plat: navigator.platform, scr: `${screen.width}×${screen.height}`, dpr: devicePixelRatio, mem: navigator.deviceMemory || null, cpu: navigator.hardwareConcurrency || null, touch: navigator.maxTouchPoints || 0 };
  setInterval(crSnap, 2000);
  addEventListener('load', crHooks);
})();
// ---- after everything has loaded: the camera's modes, the map's frames and graphics chip, the note about the last session
function crHooks() {
  const wrap = (name, label) => { const f = window[name]; if (typeof f !== 'function' || f._cr) return; const g = function (...a) { crNote('do', label || name); return f.apply(this, a); }; g._cr = true; window[name] = g; };
  for (const n of ['camTake', 'camLeave', 'camFly', 'camObelisk', 'camNadir', 'showMap', 'mapFailed', 'sdOpen', 'bigMount', 'bigClose']) wrap(n);
  const t = setInterval(() => { const m = crM()?.map; if (!m || m._crHook) return; m._crHook = true;
    m.on('render', () => { CR.fr++; });
    try { const gl = m.painter?.context?.gl, x = gl?.getExtension('WEBGL_debug_renderer_info'); if (gl) CR.dev.gpu = x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); if (gl) CR.dev.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE); } catch (_) { }
    crNote('map', 'made'); }, 1000);
  if (CR.pending) setTimeout(crOffer, 1500);
}
// ---- the report, as text: to copy, or to save as a file
const crText = rep => JSON.stringify(rep);
const crName = rep => `pult-crash-${new Date(rep.ended || rep.found || Date.now()).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
async function crCopy(rep, b) { try { await navigator.clipboard.writeText(crText(rep)); if (b) b.textContent = 'Copied'; } catch (_) { crSave(rep); } }
function crSave(rep) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([crText(rep)], { type: 'application/json' })); a.download = crName(rep); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000); }
function crWhen(rep) { const t = rep.ended || rep.found; return t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; }
function crSummary(rep) { const s = rep.snaps?.[rep.snaps.length - 1] || {}, c = s.cam;
  return [s.pane === 'map' ? 'the map open' : 'reading', c ? ({ exp: 'exploring', fly: 'in flight', obel: 'from the obelisk' }[c.mode] || c.mode) + ` at ${c.alt?.toLocaleString('en')} m` : '', s.map ? `${s.map.tiles} tiles` : '', rep.err?.length ? `${rep.err.length} error${rep.err.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '); }
// the note at the start, after an unexpected end
function crOffer() {
  const rep = CR.pending; if (!rep || $('#crNote')) return;
  const d = document.createElement('div'); d.id = 'crNote'; d.className = 'crnote';
  d.innerHTML = `<div><b>Pult closed unexpectedly last time</b><small>${esc(crWhen(rep))} · ${esc(crSummary(rep))}</small></div><span><button type="button" data-cr="copy">Copy report</button><button type="button" data-cr="save">Save as file</button><button type="button" data-cr="x" aria-label="Dismiss">✕</button></span>`;
  document.body.append(d);
  d.addEventListener('click', e => { const b = e.target.closest('[data-cr]'); if (!b) return; const k = b.dataset.cr;
    if (k === 'copy') crCopy(rep, b); else if (k === 'save') crSave(rep); else { d.remove(); CR.pending = null; } });
}
// ☰ → This Pult → Crash reports
async function crashDialog() {
  const reps = crGet(CR_REPS) || [];
  const r = await dialog(`${dlgHead('Crash reports')}
    <p class="hint small">When Pult closes unexpectedly, a record of its last minute is kept here (the last five). Copy one, or save it as a file, and send it to whoever looks into it. Nothing leaves the device by itself.</p>
    <div class="list plain crlist">${reps.length ? reps.map((p, i) => `<div class="item crrow"><span class="t">${esc(crWhen(p))}<small>${esc(p.ver || '')} · ${esc(crSummary(p))}</small></span><span class="crb"><button type="button" data-crcopy="${i}">Copy</button><button type="button" data-crsave="${i}">Save</button></span></div>`).join('') : '<p class="hint">None so far.</p>'}</div>
    <div class="crnow"><span>The record of this session so far – when something goes wrong without the app closing</span><span class="crb"><button type="button" data-crcopy="now">Copy</button><button type="button" data-crsave="now">Save</button></span></div>`, [['cancel', 'Close']]);
  return r;
}
document.addEventListener('click', e => {
  const b = e.target.closest?.('[data-crcopy], [data-crsave]'); if (!b) return; const k = b.dataset.crcopy ?? b.dataset.crsave;
  const rep = k === 'now' ? { ...crBox(), kind: 'this session', found: Date.now() } : (crGet(CR_REPS) || [])[+k]; if (!rep) return;
  if (b.dataset.crcopy != null) crCopy(rep, b); else crSave(rep);
});
// ---- the live gauge (661a): frames a second, tiles in use, memory where the browser tells it – ☰ → Settings → Map → Performance
function crPerf(s) {
  const box = $('#mapPerf'); if (!box) return; const on = !!crM()?.cfg?.perf && s.map; box.hidden = !on; if (!on) return;
  box.textContent = `${s.fps ? s.fps + ' frames/s' : 'still'} · ${s.map.tiles} tiles${s.map.ter ? ` · terrain ${s.map.ter}` : ''}${s.mem ? ` · ${s.mem} MB` : ''} · zoom ${s.map.z}`;
}
// ---- a report replayed (660a): its settings, and the camera where it last was (for testing)
async function crashReplay(rep) {
  if (typeof rep === 'string') rep = JSON.parse(rep);
  await mapCfg(); if (rep.cfg) Object.assign(M.cfg, rep.cfg); await saveMapCfg();
  const s = [...(rep.snaps || [])].reverse().find(x => x.cam); if (!s) return 'no camera in the report';
  if (!M.map) await showMap(); if (!M.cam) camExplore();
  Object.assign(M.cam, { lng: s.cam.lng, lat: s.cam.lat, alt: s.cam.alt, pt: s.cam.pt, br: s.cam.br, roll: s.cam.roll || 0 }); camApply();
  return `at ${s.cam.lat}, ${s.cam.lng}, ${s.cam.alt} m (${s.cam.mode})`;
}
