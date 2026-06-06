// Persistence layer — localStorage JSON. Schema versioned for safe migrations.
import { State } from "./fsrs.js";

const KEY = "flashcards.db.v1";

export function newCard(front, back, deckId) {
  return {
    id: crypto.randomUUID(),
    deckId,
    front,
    back,
    // FSRS fields
    stability: null,
    difficulty: null,
    due: Date.now(),       // new cards are immediately due
    last_review: null,
    reps: 0,
    lapses: 0,
    state: State.New,
    created: Date.now(),
  };
}

export function newDeck(name, description = "") {
  return { id: crypto.randomUUID(), name, description, created: Date.now() };
}

const empty = () => ({ version: 1, decks: [], cards: [], settings: { requestRetention: 0.9, newPerDay: 20 } });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const db = JSON.parse(raw);
    if (!db.settings) db.settings = empty().settings;
    return db;
  } catch (e) {
    console.error("load failed, resetting", e);
    return empty();
  }
}

export function save(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

export function exportJSON(db) {
  return JSON.stringify(db, null, 2);
}

export function importJSON(text) {
  const db = JSON.parse(text);
  if (!Array.isArray(db.decks) || !Array.isArray(db.cards)) throw new Error("bad file: missing decks/cards");
  return db;
}

// Parse CSV with columns: front,back  (header optional). Handles quoted fields.
export function parseCSV(text) {
  const rows = [];
  let i = 0, field = "", row = [], inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { if (row.length) rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { pushField(); i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { pushField(); pushRow(); i++; continue; }
    field += c; i++;
  }
  pushField(); pushRow();
  // Drop header if it looks like one.
  if (rows.length && /^(front|question|q|term)$/i.test((rows[0][0] || "").trim())) rows.shift();
  return rows.filter((r) => (r[0] || "").trim().length > 0).map((r) => ({ front: r[0].trim(), back: (r[1] || "").trim() }));
}
