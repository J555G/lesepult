#!/usr/bin/env python3
"""Pult · the atlas as an installable web app on GitHub Pages (atlas/): the page of tools/arch/atlas.html with a head of its
own, d3 and the fonts from the site instead of the CDNs, an offline helper, the manifest and icons, and the data.

    python3 tools/arch/site.py <out dir with model.json, history.json> <site dir, e.g. atlas>
"""
import os, re, shutil, sys
D = os.path.dirname(os.path.abspath(__file__)); out, site = sys.argv[1], sys.argv[2]
os.makedirs(site, exist_ok=True)
page = open(os.path.join(D, 'atlas.html'), encoding='utf-8').read()
page = re.sub(r'<meta name="claude:[^>]*>\n?', '', page)
page = re.sub(r'<link rel="preconnect"[^>]*>\n?|<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>\n?', '', page)
page = re.sub(r'<script src="https://cdnjs\.cloudflare\.com/ajax/libs/d3/[^"]+"></script>', '<script src="d3.min.js"></script>', page)
i = page.index('</style>') + len('</style>')
head = open(os.path.join(D, 'site', 'head.html'), encoding='utf-8').read()
html = head + page[:i] + '\n</head>\n<body>\n' + page[i:] + """
<script>if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));</script>
</body>
</html>
"""
open(os.path.join(site, 'index.html'), 'w', encoding='utf-8').write(html)
for f in ['sw.js', 'manifest.webmanifest', 'd3.min.js', 'LICENSE-d3.txt', 'icon-180.png', 'icon-192.png', 'icon-512.png']:
    shutil.copy(os.path.join(D, 'site', f), os.path.join(site, f))
for f in ['model.json', 'history.json']:
    shutil.copy(os.path.join(out, f), os.path.join(site, f))
print('atlas web app written to', site)
