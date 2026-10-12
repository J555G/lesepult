# Greek texts – sources and licence

These reading packages are downloaded by the app (☰ → Library). They are a reformatted conversion
(gzip-compressed JSON, one file per work, divided into books / parts) of the TEI XML editions of:

- **Perseus Digital Library**, *canonical-greekLit* – https://github.com/PerseusDL/canonical-greekLit
- **Open Greek and Latin**, *First1KGreek* – https://github.com/OpenGreekAndLatin/First1KGreek
- **Perseus Digital Library**, *canonical-latinLit* – https://github.com/PerseusDL/canonical-latinLit
- **Open Greek and Latin**, *csel-dev* (Corpus Scriptorum Ecclesiasticorum Latinorum) – https://github.com/OpenGreekAndLatin/csel-dev

Both are licensed under the **Creative Commons Attribution-ShareAlike 4.0** licence
(https://creativecommons.org/licenses/by-sa/4.0/). This conversion is shared under the same licence.
The printed edition each text is based on is named in the work's package (`edition`) and in the app.

Made with the `greekdict` toolkit: `python gd.py texts --perseus … --first1k …`.
Notes, apparatus and translations of the source files are left out; references (books, chapters,
sections, Stephanus pages, line numbers) are kept.

Author dates and genre classes in `catalog.json` follow the TLG canon as distributed with the
Classical Language Toolkit (https://github.com/cltk/cltk, MIT licence), with some additions by hand;
the dates and genres of the Latin authors were added by hand (approximate).
