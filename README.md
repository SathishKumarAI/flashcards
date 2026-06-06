# 🗂️ Flashcards — FSRS Spaced Repetition

A zero-dependency, offline-first flashcard web app for **spaced repetition** and **continuous practice**. Open source, runs fully in your browser, data stored locally.

## Features

- **FSRS-5 scheduler** — the modern Free Spaced Repetition Scheduler (same algorithm family as current Anki). Optimizes review timing from your own ratings.
- **Two study modes**
  - **Review** — scheduled, due-only study. The core SRS loop.
  - **Continuous** — practice *every* card on a loop, hardest-first (lowest predicted recall). Good for cramming.
- **Both content sources**
  - 3 built-in open sample decks (Spanish, World Capitals, CS Fundamentals).
  - Import any `front,back` CSV. Add/edit/delete your own cards in the UI.
- **Local & private** — all data in `localStorage`. Export/restore JSON backups.
- **Keyboard-driven** — `Space` reveal, `1`–`4` rate (Again / Hard / Good / Easy).

## Run

The app uses ES modules + `fetch`, so it must be served over HTTP (not `file://`).

```bash
cd flashcards
python3 -m http.server 8000
# then open http://localhost:8000
```

Or any static server (`npx serve`, `php -S`, etc.).

First launch: click **Load sample decks**, then **Review** or **Continuous**.

## CSV format

```csv
front,back
Hello,Hola
Capital of France,Paris
```

Header row optional. Quoted fields with commas/newlines supported.

## How FSRS works here

Each card tracks **stability** (memory durability, days) and **difficulty** (1–10). After each rating the scheduler:
1. Computes current **retrievability** from time elapsed since last review.
2. Updates stability & difficulty per FSRS-5 formulas.
3. Schedules the next review at the interval where recall probability drops to your target retention (default **90%**).

Rating buttons preview the resulting interval before you click. Default parameters are the FSRS-5 defaults (`js/fsrs.js` → `DEFAULT_W`); swap in personally-optimized weights there if you have them.

## Project layout

```
index.html          app shell
css/style.css        styles
js/fsrs.js           FSRS-5 engine (pure, testable)
js/storage.js        localStorage + CSV/JSON I/O
js/app.js            UI, study queues, deck/card CRUD
decks/*.csv          open sample decks + manifest.json
```

## License

MIT — content decks are original / public-domain facts.
