# Flashcards / Anki Setup — Session Log

Record of what was asked, what was built, and how each problem was fixed.

## Goal
Practice **spaced repetition** and **continuous practice** for learning, using open-source flashcard tooling.

---

## Timeline of prompts → fixes

### 1. "Get open-source flashcard, practice continuous + spaced repetition"
**Decisions chosen:** Web app · content from both (import open decks + own cards) · FSRS algorithm.

**Built:** a zero-dependency static web app under this folder:
```
index.html            app shell
css/style.css          dark UI
js/fsrs.js             FSRS-5 engine (pure JS, 19 default weights)
js/storage.js          localStorage + CSV/JSON import-export
js/app.js              study queues, deck/card CRUD, keyboard
decks/*.csv            3 sample decks + manifest.json
```
- **Review mode** = scheduled, due-only.
- **Continuous mode** = every card on loop, hardest-first (lowest predicted recall).
- FSRS verified with a Node sanity test (stability/difficulty/interval all sane).

### 2. "Don't reinvent the wheel — use the open-source project everyone uses"
**Fix:** Pivoted off the custom build to **Anki** (most-used SRS, AGPL, FSRS native).
- Checked Arch repos: `anki 25.09.2` in `extra`.
- User installed via `sudo pacman -S anki`.
- Custom web app kept as lightweight fallback only.

### 3. "Help me enable FSRS"
**Fix (steps given):** Deck Options → FSRS section → toggle FSRS ON → Desired retention `0.9` → Save.
- Note: FSRS is global once enabled; retention is per-preset.
- `Optimize` button fits weights to your history later (~400+ reviews).

### 4. "Create flashcards from this PDF" — `AI/Agents/agent evals.pdf`
**Fix:**
- Read the 20-page PDF (paper: *Survey on Evaluation of LLM-based Agents*, Yehudai et al. 2025).
- Authored **36 Q→A cards** covering: 4 eval dimensions, foundational capabilities (planning/tool-use/reflection/memory), web/SWE/scientific/conversational agents, GAIA/HAL, frameworks, trends, gaps.
- Saved CSV next to the PDF:
  `Documents/Obsidian Vault/AI/Agents/agent-evals-flashcards.csv`

### 5. "How to access the content in Anki" → "unable to do this"
**Diagnosis:** Anki was already running (pid found), profile `User 1` existed → launch was fine. The blocker was the **CSV import field-mapping dialog**.

**Fix — removed the hard step entirely:** generated a ready-to-import **`.apkg`** (no field mapping, deck auto-creates).
- Installed `genanki` in a project venv (Arch is externally-managed, so a venv not system pip):
  ```bash
  python3 -m venv .venv
  .venv/bin/pip install genanki
  ```
- Built the package with `build_apkg.py`:
  ```bash
  .venv/bin/python build_apkg.py
  # Wrote 36 cards -> .../AI/Agents/agent-evals.apkg
  ```
- Opened it in the running Anki to trigger import:
  ```bash
  anki "/home/deva/Documents/Obsidian Vault/AI/Agents/agent-evals.apkg"
  ```

---

## Key file locations
| What | Path |
|---|---|
| Web app | `/home/deva/Documents/work/flashcards/` |
| Card CSV | `…/Obsidian Vault/AI/Agents/agent-evals-flashcards.csv` |
| Anki package | `…/Obsidian Vault/AI/Agents/agent-evals.apkg` |
| apkg builder | `…/work/flashcards/build_apkg.py` |
| Anki data (your machine) | `~/.local/share/Anki2/User 1/collection.anki2` |

## Reproduce: any PDF → Anki deck
1. Save Q&A as `front,back` CSV.
2. `.venv/bin/python build_apkg.py <input.csv> <output.apkg> "<Deck Name>"`
3. `anki <output.apkg>` → Import → Study.

## Run the web app (fallback)
```bash
cd /home/deva/Documents/work/flashcards
python3 -m http.server 8000   # open http://localhost:8000
```

## Gotchas hit
- **Arch externally-managed Python** → must use a venv for `pip install genanki`.
- **CSV import in Anki** needs manual field mapping → `.apkg` avoids it.
- **Web app needs HTTP** (ES modules + fetch); `file://` won't load decks.
