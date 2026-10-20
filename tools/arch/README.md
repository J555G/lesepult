# Pult Component Atlas (tools/arch)

An interactive map of Pult's parts: what each does, what it relies on, how data moves, what it costs the device, and how
it grew version by version. Published as a private Claude artifact (see ARTIFACT below); rebuilt after every change.

- `parts/*.json` – the hand-written description of the parts (3 levels: part → sub-part → sub-sub-part), their data
  flows, network needs and load estimates (memory, storage, CPU, GPU, 0–5 with notes). Edit these when a change adds,
  removes or reshapes a part.
- `archgen.py` – reads every commit of the repository: files and sizes, every top-level declaration of every script and
  which declarations use which (→ `out/history.json`, `out/current.json`).
- `merge.py` – joins the parts with the inventory into `out/model.json`; declarations not placed in `parts/` go to the
  main part of their file, and are listed in its report.
- `atlas.html` – the page (d3 from cdnjs); reads `model.json` and `history.json` beside it.
- `build.sh` – all of the above; `build.sh --site` also writes the web app into `atlas/` (`site.py`, `site/`).
- The web app: https://j555g.github.io/lesepult/atlas/ – installable, offline, rebuilt by GitHub after every push
  (`.github/workflows/atlas.yml`, commits only `atlas/`). Pull before pushing: the bot commits to main.

After each change to the app: `tools/arch/build.sh`, read the merge report (new functions to place in `parts/`), then
republish `out/atlas.html` with `model.json` and `history.json` to the artifact.

ARTIFACT: https://claude.ai/artifact/8hfEfcfQKD6mHoAYwuiyps (publish out/atlas.html with files model.json and history.json; pass this URL as `url` from a new conversation)
