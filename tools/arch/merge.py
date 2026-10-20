#!/usr/bin/env python3
"""Pult · builds model.json for the component explorer from the hand-written parts (parts/*.json) and the code inventory.

    python3 tools/arch/merge.py <parts-dir> <inventory current.json> <out model.json>

Checks: every declaration of the current version belongs to exactly one part (left-overs go to the part that owns most
of their file); flows name existing parts (else their nearest existing ancestor); asset paths are matched to the inventory.
"""
import json, sys, glob, os
from collections import defaultdict, Counter

L1 = [  # id, name, tier, hue, desc
 ('shell', 'App shell', 'screen', 210, 'The page itself: start-up, navigation between panes, theme, fonts and styles.'),
 ('reader', 'Reader', 'screen', 160, 'Shows a text word by word, analyses each word and colours it by grammar.'),
 ('dict', 'Dictionary', 'screen', 35, 'Looks words up in the installed dictionaries, keeps glosses and searches.'),
 ('library', 'Library', 'screen', 280, 'The catalogue of texts: finding, downloading and arranging them, with their timeline.'),
 ('map', 'Map', 'screen', 120, 'The map of the ancient world: base map, layers, imagery, relief, sun and sky, drawing.'),
 ('settings', 'Settings', 'screen', 0, 'The dialogs: settings, installed packages, acknowledgements, sync.'),
 ('export', 'Export', 'screen', 60, 'Exports and backups of what you made.'),
 ('offline', 'Offline helper', 'behind', 190, 'The service worker: keeps the app and its data on the device and serves them without a network.'),
 ('storage', 'Device storage', 'behind', 330, 'Where Pult keeps things on your device: databases and caches.'),
 ('engine', 'Engines', 'engines', 250, 'Libraries Pult builds on, and the browser features it relies on.'),
 ('data', 'Data packages', 'sources', 95, 'What Pult downloads: dictionaries, texts, map packages, pictures, fonts.'),
 ('net', 'Online sources', 'sources', 15, 'Services on the internet that Pult reads when online.'),
 ('tools', 'Build tools', 'sources', 50, 'The toolkit on your PC that builds the dictionary, text and map packages.'),
]
TIERS = [{'id': 'screen', 'name': 'On screen'}, {'id': 'behind', 'name': 'Behind the scenes'}, {'id': 'engines', 'name': 'Engines'}, {'id': 'sources', 'name': 'Data and sources'}]

def main(parts_dir, inv_path, out):
    inv = json.load(open(inv_path)); files = inv['files']
    comps, flows, seen, report = {}, [], {}, []
    for l in L1: comps[l[0]] = {'id': l[0], 'name': l[1], 'desc': l[4]}
    for p in sorted(glob.glob(os.path.join(parts_dir, '*.json'))):
        d = json.load(open(p))
        for c in d.get('components', []):
            if c['id'] in comps and c['id'].count('.') == 0: continue
            if c['id'] in comps: report.append(f"duplicate part {c['id']} in {os.path.basename(p)} - merged"); comps[c['id']].update({k: v for k, v in c.items() if v}); continue
            comps[c['id']] = dict(c)
        flows += d.get('flows', [])
    # parents
    for cid in list(comps):
        parts = cid.split('.')
        for i in range(1, len(parts)):
            pid = '.'.join(parts[:i])
            if pid not in comps: comps[pid] = {'id': pid, 'name': parts[i - 1].replace('_', ' ').capitalize(), 'desc': ''}; report.append(f'made missing parent {pid}')
    # declarations: each to one part
    owner = {}
    for cid, c in comps.items():
        keep = []
        for k in c.get('decls', []) or []:
            if k in owner: report.append(f'{k} in {owner[k]} and {cid} - kept the first'); continue
            owner[k] = cid; keep.append(k)
        c['decls'] = keep
    cur = {d['k']: d for d in inv['decls']}
    for k in list(owner):
        if k not in cur: report.append(f'unknown declaration {k} (in {owner[k]})')
    byfile = defaultdict(Counter)
    for k, cid in owner.items():
        if k in cur: byfile[k.split('|')[0]][cid] += cur[k]['s']
    file_default = {}
    for f, cnt in byfile.items():
        top = cnt.most_common(1)[0][0]; file_default[f] = '.'.join(top.split('.')[:2])
    left = [k for k in cur if k not in owner]
    for k in left:
        f = k.split('|')[0]; cid = file_default.get(f)
        if cid: comps[cid].setdefault('decls', []).append(k); owner[k] = cid
    if left: report.append(f'{len(left)} declarations not placed by hand - given to the main part of their file: ' + ', '.join(left[:30]))
    # assets: inventory keys
    for c in comps.values():
        out_a = []
        for a in c.get('assets', []) or []:
            a = a.lstrip('./')
            if a in files or any(k.startswith(a.rstrip('/') + '/') for k in files): out_a.append(a)
            else:
                cont = [k for k in files if k.endswith('/') and a.startswith(k)]
                if cont: out_a.append(cont[0])
                else: report.append(f"asset {a} of {c['id']} not in the repository - dropped")
        c['assets'] = sorted(set(out_a))
    claimed = {}
    for c in comps.values():
        for a in list(c['assets']):
            if a in claimed and a.endswith('/'): c['assets'].remove(a)
            else: claimed[a] = c['id']
    # flows
    def fix(i):
        x = i
        while x and x not in comps: x = x.rsplit('.', 1)[0] if '.' in x else None
        if x != i: report.append(f'flow end {i} -> {x}')
        return x
    # a flow that names only a whole part (e.g. "map") is made precise from the code: the sub-part that the other end's code
    # actually uses or is used by most; failing that, from fixups.json ({"map": {"net.gibs": "map.imagery", ...}})
    fixups = json.load(open(os.path.join(parts_dir, '..', 'fixups.json'))) if os.path.exists(os.path.join(parts_dir, '..', 'fixups.json')) else {}
    pair = Counter()
    for k, d in cur.items():
        a = owner.get(k)
        for u in d['uses']:
            b = owner.get(u)
            if a and b and a != b: pair[(a, b)] += 1; pair[(b, a)] += 1
    inside = lambda x, top: x == top or x.startswith(top + '.')
    def refine(g, other):
        if g not in comps or not any(c.startswith(g + '.') for c in comps): return g
        best = Counter()
        for (a, b), n in pair.items():
            if inside(a, other) and inside(b, g) and not inside(b, other): best[b] += n
        if best: return best.most_common(1)[0][0]
        return fixups.get(g, {}).get(other) or next((v for k, v in fixups.get(g, {}).items() if inside(other, k)), g)
    fl = []
    for f in flows:
        a, b = fix(f['from']), fix(f['to'])
        if a and b and a.count('.') == 0 and b.count('.') > 0: a = refine(a, b)
        elif a and b and b.count('.') == 0 and a.count('.') > 0: b = refine(b, a)
        if a and b and a != b: fl.append({'from': a, 'to': b, 'label': f.get('label', ''), 'kind': f.get('kind', 'data')})
    model = {'generated': {'v': inv['v'], 'h': inv['h'], 'd': inv['d']},
             'tiers': TIERS, 'l1': [{'id': l[0], 'tier': l[2], 'hue': l[3]} for l in L1],
             'components': sorted(comps.values(), key=lambda c: c['id']), 'flows': fl,
             'fileDefault': file_default, 'declLine': {k: d['line'] for k, d in cur.items()}}
    json.dump(model, open(out, 'w'), separators=(',', ':'))
    gen = sum(1 for f in fl if f['from'].count('.') == 0 or f['to'].count('.') == 0)
    seen_f = set(); fl2 = []
    for f in fl:
        k = (f['from'], f['to'], f['label'])
        if k not in seen_f: seen_f.add(k); fl2.append(f)
    model['flows'] = fl2; json.dump(model, open(out, 'w'), separators=(',', ':'))
    print(len(comps), 'parts,', len(fl2), 'flows (', gen, 'still at a whole part ),', len(owner), 'declarations placed')
    for r in report: print(' -', r)

main(*sys.argv[1:4])
