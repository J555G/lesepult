#!/usr/bin/env python3
"""Pult · the code inventory behind the component explorer (tools/arch).

For every commit of the app: the files and their sizes (data folders summed), the top-level declarations of every script
(functions, constants, classes) with their sizes, and which declarations of one script use those of another. Written as
history.json (each commit as the change from the one before; `du`: which declarations each declaration uses) and current.json (the latest commit, declaration by declaration).

    python3 tools/arch/archgen.py [repo] [out-dir]
"""
import json, re, subprocess, sys, os
from collections import defaultdict

REPO = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), 'out')
git = lambda *a: subprocess.run(['git', '-C', REPO, *a], capture_output=True, check=True).stdout

DECL = re.compile(r'^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)|^class\s+([A-Za-z_$][\w$]*)')
IDENT = re.compile(r'[A-Za-z_$][\w$]*')
CONT = tuple('})].+?:,\'"`*/-|&')

def strip_comments(t):
    t = re.sub(r'/\*.*?\*/', ' ', t, flags=re.S)
    return re.sub(r'(^|[\s;{}),])//[^\n]*', r'\1', t, flags=re.M)

def analyse_js(text):
    """[(name, size, line, identifiers used)] – declarations at the left margin; other top-level code as '(top level)'."""
    lines = text.split('\n'); starts = []
    for i, ln in enumerate(lines):
        if not ln or ln[0] in ' \t' or ln.startswith('//') or ln.startswith(CONT): continue
        m = DECL.match(ln)
        starts.append((i, (m.group(1) or m.group(2) or m.group(3)) if m else None))
    out = {}
    for k, (i, name) in enumerate(starts):
        j = starts[k + 1][0] if k + 1 < len(starts) else len(lines)
        body = '\n'.join(lines[i:j]); key = name or '(top level)'
        ids = set(IDENT.findall(strip_comments(body)))
        if key in out: s, l, ids0 = out[key]; out[key] = (s + len(body.encode()) + 1, l, ids0 | ids)
        else: out[key] = (len(body.encode()) + 1, i + 1, ids)
    return out

def group_path(p):
    """root files one by one; folders summed two levels deep (texts/works, packages/x.gdpkg.gz, maps/base …)"""
    parts = p.split('/')
    if len(parts) == 1: return p
    if parts[0] in ('tools', '.github', 'atlas'): return None    # (the atlas itself and its tools are not part of the app)
    d = 3 if parts[0] == 'maps' else 2                               # (the map folders one level deeper: maps/base/lib5/ …)
    return '/'.join(parts[:d]) + ('/' if len(parts) > d else '')

def main():
    os.makedirs(OUT, exist_ok=True)
    commits = git('log', '--reverse', '--format=%H%x09%cI%x09%s').decode().strip().split('\n')
    blobs = {}                                                       # sha → analysis (blobs repeat across commits)
    cat = subprocess.Popen(['git', '-C', REPO, 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    def blob(sha):
        cat.stdin.write((sha + '\n').encode()); cat.stdin.flush()
        hdr = cat.stdout.readline().split(); n = int(hdr[2]); data = cat.stdout.read(n); cat.stdout.read(1); return data.decode('utf-8', 'replace')
    hist, prev = [], {'files': {}, 'decls': {}, 'fedges': {}, 'du': {}}
    cur = None
    for row in commits:
        h, date, msg = row.split('\t', 2)
        files, decls, defs, used = defaultdict(int), {}, {}, {}
        sw = None
        for ln in git('ls-tree', '-r', '-l', h).decode().split('\n'):
            if not ln: continue
            meta, path = ln.split('\t', 1); _, typ, sha, size = meta.split()
            g = group_path(path)
            if g is None or typ != 'blob': continue
            files[g] += int(size) if size != '-' else 0
            if '/' not in path and path.endswith('.js'):
                if sha not in blobs: blobs[sha] = analyse_js(blob(sha))
                for name, (s, line, ids) in blobs[sha].items():
                    decls[f'{path}|{name}'] = s
                    if name != '(top level)': defs.setdefault(name, path)
                    used[f'{path}|{name}'] = (ids, line)
            if path == 'sw.js': sw = blob(sha)
        v = re.search(r"lesepult-v(\d+)", sw or ''); v = int(v.group(1)) if v else None
        # who uses whom: a declaration names a top-level name defined in another script (or another of its own)
        dedges, fedges = defaultdict(set), defaultdict(int)
        for key, (ids, _) in used.items():
            f = key.split('|')[0]; me = key.split('|')[1]
            for i in ids:
                g = defs.get(i)
                if g and not (g == f and i == me):
                    dedges[key].add(f'{g}|{i}')
                    if g != f: fedges[f'{f}>{g}'] += 1
        snap = {'files': dict(files), 'decls': decls, 'fedges': dict(fedges), 'du': {k: sorted(v) for k, v in dedges.items()}}
        delta = {k: {n: x for n, x in snap[k].items() if prev[k].get(n) != x} | {n: None for n in prev[k] if n not in snap[k]} for k in snap}
        if hist and not any(delta.values()): continue                # (commits that change nothing of the app – the atlas, tools)
        hist.append({'h': h[:7], 'd': date, 'm': msg, 'v': v, **delta})
        prev = snap
        cur = {'h': h[:7], 'd': date, 'v': v, 'files': dict(files),
               'decls': [{'k': k, 's': decls[k], 'line': used[k][1], 'uses': sorted(dedges.get(k, ()))} for k in sorted(decls)]}
    cat.stdin.close()
    json.dump({'commits': hist}, open(os.path.join(OUT, 'history.json'), 'w'), separators=(',', ':'))
    json.dump(cur, open(os.path.join(OUT, 'current.json'), 'w'), separators=(',', ':'), indent=None)
    print(len(hist), 'commits;', len(cur['decls']), 'declarations now; version', cur['v'])

main()
