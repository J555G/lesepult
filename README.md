# Greek Reader (iPad app)

Offline web app: Greek text on one side, Frisk / Pape / LSJ / Bailly on the other.
Everything you load (dictionaries, texts, glosses) stays on the device (IndexedDB).
This folder contains **only the app code** – no dictionary data – so it can be hosted publicly
(e.g. GitHub Pages). Fonts: Gentium Book Plus, SIL Open Font License (fonts/OFL.txt).

## First start on the iPad
1. Open the app URL in Safari → Share → "Add to Home Screen". Start it from the home screen icon
   (only then is its storage kept permanently).
2. "Wörterbücher" → "Pakete importieren …" → select all `*.gdpkg.gz` files
   (frisk, pape, lsj, bailly, morph) from Files/iCloud. Takes about 1–3 minutes, once.
3. ☰ → "Datei laden …" → `phaedros.gdtext.json` (or "Neuer Text" and paste any Greek text).

## Use
- Tap a word: the dictionary shows its analysis (lemma + parse) and all dictionary entries.
  Several lemmas possible? Tap the right one; "★ … immer" makes it the default for that form.
- Every Greek word inside an entry is a link. "‹" goes back.
- Select words in an entry → "＋ als Glosse übernehmen": the selection is written under the word
  you tapped in the text. For a phrase: tap first word, "Bereich", tap last word.
- Tap a gloss to edit or delete it. "Glossen" switches the interlinear line on/off.
- "Lemmata": all lemmata of the text, in text order or alphabetically.
- "⇆" or dragging the divider changes the split. Portrait: text above, dictionary below.
- "Sicherung": export/import texts + glosses + lemma choices as a JSON file.

## More dictionaries
Build packages with the toolkit (`python gd.py packages`, one adapter function per dictionary in
`greekdict/packages.py`) and import them the same way; they appear as additional sections.
