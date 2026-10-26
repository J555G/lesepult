# Dictionary packages – sources and licences

These packages are downloaded by the app ("Dictionaries → Download / update").
Only freely licensed material is published here.

| File | Content | Source | Licence |
|---|---|---|---|
| `pape.gdpkg.gz` | W. Pape, *Handwörterbuch der griechischen Sprache*, 3rd ed. (1914) | Eulexis data (Philipp Roelli, rev. Chaeréphon / André Charbonnet and Jean-Paul Woitrain), https://github.com/PhVerkerk/Eulexis_off_line | GNU GPL v3 |
| `lsj.gdpkg.gz` | Liddell–Scott–Jones, *A Greek–English Lexicon*, 9th ed. | Eulexis data (Philipp Roelli, rev. Chaeréphon / André Charbonnet), same repository | GNU GPL v3 |
| `morph.gdpkg.gz` | Greek word forms → lemma + morphological analysis | Eulexis `analyses_gr.txt` (from Diogenes / Perseus Morpheus), same repository | GNU GPL v3 |
| `ls.gdpkg.gz` | Lewis & Short, *A Latin Dictionary* (1879) | Perseus Digital Library, https://github.com/PerseusDL/lexica | CC BY-SA 4.0 (text provided by Perseus Digital Library, http://www.perseus.tufts.edu, with funding from The National Endowment for the Humanities) |
| `georges.gdpkg.gz` | K. E. Georges, *Ausführliches lateinisch-deutsches Handwörterbuch*, 8th ed. (1913) | TEI edition by Thibault Clérice, https://github.com/PonteIneptique/K-E-Georges-1913-TEI | public domain (text) |
| `collatinus.gdpkg.gz` | short meanings (English, German, French) of the Collatinus lexicon | Collatinus (Yves Ouvrard, Philippe Verkerk), https://github.com/biblissima/collatinus | GNU GPL v3 |
| `morph-la.gdpkg.gz` | Latin morphology: lemmata, inflection models, irregular forms (the app analyses forms from them as Collatinus does) | Collatinus, same repository | GNU GPL v3 |
| `whitaker.gdpkg.gz` | short English meanings of Whitaker's Words | Whitaker's Words (William Whitaker), https://github.com/mk270/whitakers-words | "Permission is hereby freely given for any and all use of program and data" |
| `morph-la-ww.gdpkg.gz` | Latin morphology from Whitaker's Words (stems, endings, unique forms; analysed in the app as Words does) | same | same |
| `morphhints.gdpkg.gz` | Preferred lemma for ambiguous forms; most frequent word class per lemma | Derived from the Universal Dependencies Ancient Greek treebanks (PROIEL, Perseus), https://universaldependencies.org | CC BY-NC-SA (as the treebanks) |
| `suda.gdpkg.gz` | The *Suda* (Suidae Lexicon), ed. A. Adler (Teubner 1928–1938) – incomplete: Ζ, Η, Θ, Ι, Υ, Φ, Χ, Ψ and the end of ε (after 2878), σ (after 1815) and τ (after 598) are not yet in the source file | Open Greek and Latin, First1KGreek, https://github.com/OpenGreekAndLatin/First1KGreek (tlg9010.tlg001.1st1K-grc1) | CC BY-SA 4.0 |
| `people-smith.gdpkg.gz` | William Smith (ed.), *A Dictionary of Greek and Roman Biography and Mythology* (London 1849): 19,460 persons, with the passages of the library where they are cited | Perseus Digital Library, https://github.com/PerseusDL/canonical-pdlrefwk – text provided under a CC BY-SA license by the Perseus Digital Library, with funding from the National Endowment for the Humanities and Tufts University | CC BY-SA 4.0 |
| `people-pir.gdpkg.gz` | *Prosopographia Imperii Romani* (PIR², the online database): 15,061 persons, 31 BC – AD 284; those found in Smith are shown with his entry | Berlin-Brandenburg Academy of Sciences and Humanities, https://pir.bbaw.de (retrieved 2026-10-25) | CC BY 4.0 |
| `enc-smith-geo.gdpkg.gz` | William Smith (ed.), *Dictionary of Greek and Roman Geography* (London 1854): 11,594 entries | Perseus Digital Library, https://github.com/PerseusDL/canonical-pdlrefwk – text provided under a CC BY-SA license by the Perseus Digital Library, with funding from the National Endowment for the Humanities and Tufts University | CC BY-SA 4.0 |
| `enc-smith-ant.gdpkg.gz` | William Smith, William Wayte, G. E. Marindin (eds.), *A Dictionary of Greek and Roman Antiquities* (3rd ed., London 1890): 3,767 entries | the same | CC BY-SA 4.0 |
| `fasti-liebenam.gdpkg.gz` | W. Liebenam, *Fasti consulares imperii Romani von 30 v. Chr. bis 565 n. Chr. mit Kaiserliste und Anhang* (Bonn 1909): 108 emperors and the consuls of each year, read from the scan; 5 Caesars who never became Augustus from H. F. Clinton, *Fasti Romani* I (Oxford 1845) | Internet Archive, https://archive.org/details/fasticonsularesi0000lieb | public domain |

The packages are a reformatted conversion of the sources above (grouped by lookup key, gzip-compressed JSON),
made with the `greekdict` toolkit (`python gd.py packages`). The full GPL v3 text: https://www.gnu.org/licenses/gpl-3.0.html

Not included (copyright / no-derivatives licences): Frisk, *Griechisches etymologisches Wörterbuch*; Bailly 2020.
Those are imported privately on each device.
