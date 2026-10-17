/* Pult – offline reader with a composite dictionary and interlinear glosses.
   All data (dictionaries, texts, glosses, settings) is stored on the device in IndexedDB.
   Dictionary packages (*.gdpkg.gz) are produced by the greekdict toolkit (python gd.py packages).
   The code is in several plain scripts sharing one global scope, loaded in this order (index.html):
     core.js – utilities, the database, the shared state     analysis.js – word classes, packages, lookup
     text.js – the text pane                                 dictview.js – the dictionary pane
     dialogs.js – dialogs, Instruments, Settings             export.js – export of the text
     library.js – library and navigation                     app.js – wiring and start-up
     then the map: maps.js, maplayers.js, mapsaved.js, mapdraw.js, maprelief.js
   Code that runs while a script loads may only use what earlier scripts define; everything else runs later. */
'use strict';

// ---------------------------------------------------------------- utilities
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const GREEK_TOKEN = /[Ͱ-Ͽἀ-῿][Ͱ-Ͽἀ-῿̀-ͯ]*[ʼ’'᾽]?/g;
const ELISION = /[ʼ'᾽]/g;
// Latin words: the same tokenizer finds them; a word's language follows from its alphabet
const LATIN_TOKEN = /[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ\u0300-\u036f]*/;
const WORD_TOKEN = new RegExp(GREEK_TOKEN.source + '|' + LATIN_TOKEN.source, 'g');
const isGreek = s => /[Ͱ-Ͽἀ-῿]/.test(s || '');
const langOf = s => isGreek(s) ? 'grc' : 'la';
const LANGS = { grc: 'Greek', la: 'Latin' };
function latkey(s) {              // Latin lookup key: lower case, no diacritics, j -> i, v -> u
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/æ/g, 'ae').replace(/Æ/g, 'Ae').replace(/œ/g, 'oe').replace(/Œ/g, 'Oe')
    .toLowerCase().replace(/j/g, 'i').replace(/v/g, 'u');
}
function canon(s) {               // exact form: circumflex fixed, grave -> acute, elision mark unified, lower case
  if (!isGreek(s)) return latkey(s);
  return s.normalize('NFD').replace(/̃/g, '͂').replace(/̀/g, '́').normalize('NFC').replace(ELISION, '’').toLowerCase();
}
function gkey(s) {                // accent-insensitive key
  if (!isGreek(s)) return latkey(s).replace(/[^a-z]/g, '');
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ').replace(/[^Ͱ-Ͽ]/g, '');
}
function stripSecondAccent(f) {  // enclitic accent: αἴτιός -> αἴτιος, μεῖζόν -> μεῖζον
  const d = f.normalize('NFD'); const idx = [];
  for (let i = 0; i < d.length; i++) if (d[i] === '́' || d[i] === '͂') idx.push(i);
  if (idx.length < 2 || d[idx[idx.length - 1]] !== '́') return null;
  const last = idx[idx.length - 1];
  return (d.slice(0, last) + d.slice(last + 1)).normalize('NFC');
}
function toast(msg, ms = 2500, high = false) { const t = $('#toast'); t.textContent = msg; t.classList.toggle('high', !!high); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); }

// ---------------------------------------------------------------- IndexedDB
// Storage layout (since v3):
//   'greekreader'           – your own data: texts, glosses, lemma choices, settings, list of installed dictionaries
//   'greekreader-dict-<id>' – one database per dictionary (store 'b': key-prefix buckets)
// Deleting a dictionary deletes its whole database, so the space is really given back.
// Older versions kept everything in one database 'greekdict'; it is migrated once and then deleted.
const DB_NAME = 'greekreader', DB_VER = 1, OLD_DB = 'greekdict', DICT_DB = 'greekreader-dict-';
let db;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('dicts', { keyPath: 'id' });
      d.createObjectStore('texts', { keyPath: 'id', autoIncrement: true });
      d.createObjectStore('glosses', { keyPath: 'id', autoIncrement: true }).createIndex('textId', 'textId');
      d.createObjectStore('choices', { keyPath: 'f' });
      d.createObjectStore('settings', { keyPath: 'k' });
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const dictConns = new Map();
function dictDB(id) {
  if (dictConns.has(id)) return dictConns.get(id);
  const p = new Promise((res, rej) => {
    const r = indexedDB.open(DICT_DB + id, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('b', { keyPath: 'b' });
    r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); dictConns.delete(id); }; res(r.result); };
    r.onerror = () => rej(r.error);
  });
  dictConns.set(id, p); return p;
}
async function dropDictDB(id) {
  if (dictConns.has(id)) { try { (await dictConns.get(id)).close(); } catch (_) { } dictConns.delete(id); }
  await new Promise(res => { const r = indexedDB.deleteDatabase(DICT_DB + id); r.onsuccess = r.onerror = r.onblocked = () => res(); });
}
async function listDBs() { try { return (await indexedDB.databases?.()) || null; } catch (_) { return null; } }
// one-time move from the old single database into the new layout
async function migrateOld() {
  const dbs = await listDBs();
  if (dbs && !dbs.some(d => d.name === OLD_DB)) return;
  const old = await new Promise(res => { const r = indexedDB.open(OLD_DB); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
  if (!old) return;
  const has = n => old.objectStoreNames.contains(n);
  if (!has('settings')) { old.close(); indexedDB.deleteDatabase(OLD_DB); return; }
  const dlg = $('#dlg'), f = $('#dlgForm');
  f.innerHTML = '<h3>Tidying up storage</h3><p id="impMsg">Moving your data into the new storage layout (only once) …</p><div class="prog"><i id="impBar"></i></div>'; dlg.showModal();
  const oget = st => new Promise((res, rej) => { const r = old.transaction(st).objectStore(st).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  for (const st of ['texts', 'glosses', 'choices', 'settings', 'dicts']) if (has(st)) await bulkPut(st, await oget(st));
  if (has('buckets') && has('dicts')) {
    const metas = await oget('dicts');
    for (const [n, m] of metas.entries()) {
      if (m.kind === 'morphhints') continue;
      $('#impMsg').textContent = `Moving ${m.name} …`;
      const ddb = await dictDB(m.id);
      let last = m.id + '|', size = 0;
      for (;;) {      // copy in chunks: read 200 records after the last key, write them
        const rows = await new Promise((res, rej) => { const r = old.transaction('buckets').objectStore('buckets').getAll(IDBKeyRange.bound(last, m.id + '|\uffff', true, false), 200); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        if (!rows.length) break;
        const t = ddb.transaction('b', 'readwrite'); const os = t.objectStore('b');
        for (const row of rows) { os.put(Object.assign({}, row, { b: row.b.slice(m.id.length + 1) })); size += JSON.stringify(row).length; }
        await done(t); last = rows[rows.length - 1].b;
        if (rows.length < 200) break;
      }
      await put('dicts', Object.assign(m, { size }));
      $('#impBar').style.width = ((n + 1) / metas.length * 100).toFixed(0) + '%';
    }
  }
  old.close();
  await new Promise(res => { const r = indexedDB.deleteDatabase(OLD_DB); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  dlg.close(); toast('Storage reorganised – the old copy was removed.');
}
function tx(stores, mode = 'readonly') { return db.transaction(stores, mode); }
function req2p(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
function done(t) { return new Promise((res, rej) => { t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error); }); }
const get = (store, k) => req2p(tx(store).objectStore(store).get(k));
const getAll = (store, q) => req2p(tx(store).objectStore(store).getAll(q));
async function put(store, v) { const t = tx(store, 'readwrite'); const r = t.objectStore(store).put(v); await done(t); return r.result; }
async function del(store, k) { const t = tx(store, 'readwrite'); t.objectStore(store).delete(k); await done(t); }
async function setting(k, v) { if (v === undefined) { const r = await get('settings', k); return r ? r.v : undefined; } return put('settings', { k, v }); }

// ---------------------------------------------------------------- state
const S = {
  dicts: [], morph: null, lemmapos: {},
  text: null,            // {id,title,text}
  tokens: [],            // [{t:'w'|'p', s, i, pos}]  i = word index
  glosses: [],
  cur: null,             // [start,end] word indices of the gloss target
  hist: [], fwd: [], view: null,  // dictionary navigation
  lastSel: '', listSort: 'pos',
  posOn: false, posCfg: null, srcColors: true,
  lemmaGloss: {},        // lemma key -> default gloss (all texts)
};
