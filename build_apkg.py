#!/usr/bin/env python3
"""Build an Anki .apkg from a front,back CSV. No field-mapping needed on import."""
import csv, sys, genanki

CSV = sys.argv[1] if len(sys.argv) > 1 else "/home/deva/Documents/Obsidian Vault/AI/Agents/agent-evals-flashcards.csv"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/home/deva/Documents/Obsidian Vault/AI/Agents/agent-evals.apkg"
DECK_NAME = sys.argv[3] if len(sys.argv) > 3 else "Agent Evals"

# Stable IDs so re-import updates instead of duplicating.
MODEL_ID = 1607392319
DECK_ID = 2059400110

CSS = """
.card {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 28px;            /* big, readable; bump to taste */
  line-height: 1.55;
  text-align: center;
  color: #e6e8ee;
  background: #15171e;
  padding: 28px 22px;
  max-width: 820px;
  margin: 0 auto;
}
.card.nightMode { color: #e6e8ee; background: #15171e; }
#answer { border: none; border-top: 1px solid #2a2f3c; margin: 22px 0; }
b, strong { color: #6c8cff; }
.back { color: #3ec98a; }
"""

model = genanki.Model(
    MODEL_ID, "Basic (q/a)",
    fields=[{"name": "Front"}, {"name": "Back"}],
    templates=[{
        "name": "Card 1",
        "qfmt": '<div class="front">{{Front}}</div>',
        "afmt": '{{FrontSide}}<hr id="answer"><div class="back">{{Back}}</div>',
    }],
    css=CSS,
)

deck = genanki.Deck(DECK_ID, DECK_NAME)

with open(CSV, newline="", encoding="utf-8") as f:
    reader = csv.reader(f)
    rows = list(reader)

# Drop header if present.
if rows and rows[0][0].strip().lower() in ("front", "question", "q", "term"):
    rows = rows[1:]

n = 0
for r in rows:
    if not r or not r[0].strip():
        continue
    front = r[0].strip()
    back = (r[1].strip() if len(r) > 1 else "")
    deck.add_note(genanki.Note(model=model, fields=[front, back]))
    n += 1

genanki.Package(deck).write_to_file(OUT)
print(f"Wrote {n} cards -> {OUT}")
