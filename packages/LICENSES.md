# Dictionary packages – sources and licences

These packages are downloaded by the app ("Dictionaries → Download / update").
Only freely licensed material is published here.

| File | Content | Source | Licence |
|---|---|---|---|
| `pape.gdpkg.gz` | W. Pape, *Handwörterbuch der griechischen Sprache*, 3rd ed. (1914) | Eulexis data (Philipp Roelli, rev. Chaeréphon / André Charbonnet and Jean-Paul Woitrain), https://github.com/PhVerkerk/Eulexis_off_line | GNU GPL v3 |
| `lsj.gdpkg.gz` | Liddell–Scott–Jones, *A Greek–English Lexicon*, 9th ed. | Eulexis data (Philipp Roelli, rev. Chaeréphon / André Charbonnet), same repository | GNU GPL v3 |
| `morph.gdpkg.gz` | Greek word forms → lemma + morphological analysis | Eulexis `analyses_gr.txt` (from Diogenes / Perseus Morpheus), same repository | GNU GPL v3 |
| `morphhints.gdpkg.gz` | Preferred lemma for ambiguous forms; most frequent word class per lemma | Derived from the Universal Dependencies Ancient Greek treebanks (PROIEL, Perseus), https://universaldependencies.org | CC BY-NC-SA (as the treebanks) |

The packages are a reformatted conversion of the sources above (grouped by lookup key, gzip-compressed JSON),
made with the `greekdict` toolkit (`python gd.py packages`). The full GPL v3 text: https://www.gnu.org/licenses/gpl-3.0.html

Not included (copyright / no-derivatives licences): Frisk, *Griechisches etymologisches Wörterbuch*; Bailly 2020.
Those are imported privately on each device.
