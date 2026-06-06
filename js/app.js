import { FSRS, Rating, State, fmtInterval } from "./fsrs.js";
import * as db from "./storage.js";

// ---------- State ----------
let DB = db.load();
let fsrs = new FSRS(undefined, DB.settings.requestRetention);
let view = "decks";          // decks | study | manage
let session = null;          // { deckId, mode, queue:[cardId], current:cardId|null, revealed, done, total }

const $ = (sel) => document.querySelector(sel);
const app = $("#app");

// ---------- Helpers ----------
const cardsOf = (deckId) => DB.cards.filter((c) => c.deckId === deckId);
const deckById = (id) => DB.decks.find((d) => d.id === id);
const isDue = (c, now = Date.now()) => c.due <= now;

function deckStats(deckId, now = Date.now()) {
  const cs = cardsOf(deckId);
  const due = cs.filter((c) => c.state !== State.New && isDue(c, now)).length;
  const fresh = cs.filter((c) => c.state === State.New).length;
  return { total: cs.length, due, fresh, learned: cs.length - fresh };
}

function persist() { db.save(DB); }

// ---------- Study session ----------
function buildQueue(deckId, mode) {
  const now = Date.now();
  let cs = cardsOf(deckId);
  if (mode === "continuous") {
    // Continuous practice: every card, ordered by lowest retrievability first, loops forever.
    return cs
      .map((c) => ({ id: c.id, r: retr(c, now) }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.id);
  }
  // Scheduled review: due review cards + capped new cards.
  const dueCards = cs.filter((c) => c.state !== State.New && isDue(c, now));
  const newCards = cs.filter((c) => c.state === State.New).slice(0, DB.settings.newPerDay);
  const q = [...dueCards, ...newCards];
  // interleave-ish: shuffle stable
  for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [q[i], q[j]] = [q[j], q[i]];
  }
  return q.map((c) => c.id);
}

function retr(c, now) {
  if (c.state === State.New || c.stability == null) return 0;
  const elapsed = c.last_review ? (now - c.last_review) / 86400000 : 0;
  return fsrs.retrievability(Math.max(elapsed, 0), c.stability);
}

function startSession(deckId, mode) {
  const queue = buildQueue(deckId, mode);
  if (!queue.length) { alert(mode === "continuous" ? "Deck is empty. Add cards first." : "Nothing due! Try Continuous practice or add cards."); return; }
  session = { deckId, mode, queue, current: queue[0], revealed: false, done: 0, total: queue.length };
  view = "study";
  render();
}

function rate(rating) {
  const card = DB.cards.find((c) => c.id === session.current);
  const proj = fsrs.project(card, rating);
  const now = Date.now();
  Object.assign(card, {
    stability: proj.stability,
    difficulty: proj.difficulty,
    due: proj.due,
    last_review: now,
    state: proj.state,
    reps: card.reps + 1,
    lapses: card.lapses + (rating === Rating.Again ? 1 : 0),
  });
  persist();

  // advance queue
  session.queue.shift();
  if (rating === Rating.Again) session.queue.push(card.id); // requeue lapses
  if (session.mode === "scheduled") session.done++;

  if (session.mode === "continuous") {
    if (!session.queue.length) session.queue = buildQueue(session.deckId, "continuous");
  }

  if (!session.queue.length) { session.current = null; }
  else { session.current = session.queue[0]; session.revealed = false; }
  render();
}

// ---------- Deck import ----------
async function loadSeedDecks() {
  try {
    const manifest = await fetch("./decks/manifest.json").then((r) => r.json());
    for (const m of manifest.decks) {
      if (DB.decks.some((d) => d.name === m.name)) continue; // skip already imported
      const text = await fetch("./decks/" + m.file).then((r) => r.text());
      const pairs = db.parseCSV(text);
      const deck = db.newDeck(m.name, m.description);
      DB.decks.push(deck);
      for (const p of pairs) DB.cards.push(db.newCard(p.front, p.back, deck.id));
    }
    persist();
    render();
  } catch (e) {
    alert("Could not load seed decks (are you serving over http? see README): " + e.message);
  }
}

function importCSVFile(file, deckName) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const pairs = db.parseCSV(reader.result);
      if (!pairs.length) { alert("No cards found in file."); return; }
      const deck = db.newDeck(deckName || file.name.replace(/\.csv$/i, ""), `Imported from ${file.name}`);
      DB.decks.push(deck);
      for (const p of pairs) DB.cards.push(db.newCard(p.front, p.back, deck.id));
      persist();
      alert(`Imported ${pairs.length} cards into "${deck.name}".`);
      render();
    } catch (e) { alert("Import failed: " + e.message); }
  };
  reader.readAsText(file);
}

// ---------- Rendering ----------
function render() {
  if (view === "study" && session) return renderStudy();
  if (view === "manage" && session) return renderManage(session.deckId);
  renderDecks();
}

function h(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }

function renderDecks() {
  const now = Date.now();
  const rows = DB.decks.map((d) => {
    const s = deckStats(d.id, now);
    return `<div class="deck" data-id="${d.id}">
      <div class="deck-main">
        <h3>${esc(d.name)}</h3>
        <p class="muted">${esc(d.description || "")}</p>
        <div class="pills">
          <span class="pill total">${s.total} cards</span>
          <span class="pill due">${s.due} due</span>
          <span class="pill new">${s.fresh} new</span>
        </div>
      </div>
      <div class="deck-actions">
        <button data-act="study" data-id="${d.id}">Review</button>
        <button class="ghost" data-act="cram" data-id="${d.id}">Continuous</button>
        <button class="ghost" data-act="manage" data-id="${d.id}">Edit</button>
      </div>
    </div>`;
  }).join("");

  app.innerHTML = `
    <header class="topbar">
      <h1>🗂️ Flashcards <span class="muted">· FSRS spaced repetition</span></h1>
    </header>
    <section class="toolbar">
      <button data-act="seed">＋ Load sample decks</button>
      <button class="ghost" data-act="newdeck">＋ New deck</button>
      <label class="filebtn ghost">＋ Import CSV<input type="file" accept=".csv,text/csv" id="csvFile" hidden></label>
      <button class="ghost" data-act="export">⭳ Export backup</button>
      <label class="filebtn ghost">⭱ Restore backup<input type="file" accept=".json" id="jsonFile" hidden></label>
    </section>
    ${DB.decks.length ? `<div class="decks">${rows}</div>` : `<div class="empty">No decks yet. Click <b>Load sample decks</b> or <b>Import CSV</b> to begin.</div>`}
    <footer class="muted">Tip: <b>Review</b> = due-only scheduled study · <b>Continuous</b> = practice every card on loop. Keys in study: Space reveal · 1-4 rate.</footer>
  `;

  app.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", onDeckAction));
  $("#csvFile")?.addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    const name = prompt("Deck name:", f.name.replace(/\.csv$/i, "")); if (name === null) return;
    importCSVFile(f, name);
  });
  $("#jsonFile")?.addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { DB = db.importJSON(r.result); fsrs = new FSRS(undefined, DB.settings.requestRetention); persist(); render(); alert("Backup restored."); } catch (err) { alert("Restore failed: " + err.message); } };
    r.readAsText(f);
  });
}

function onDeckAction(e) {
  const act = e.currentTarget.dataset.act;
  const id = e.currentTarget.dataset.id;
  if (act === "seed") return loadSeedDecks();
  if (act === "study") return startSession(id, "scheduled");
  if (act === "cram") return startSession(id, "continuous");
  if (act === "manage") { session = { deckId: id }; view = "manage"; return render(); }
  if (act === "export") {
    const blob = new Blob([db.exportJSON(DB)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "flashcards-backup.json"; a.click(); URL.revokeObjectURL(a.href); return;
  }
  if (act === "newdeck") {
    const name = prompt("New deck name:"); if (!name) return;
    DB.decks.push(db.newDeck(name)); persist(); render();
  }
}

function renderStudy() {
  const total = session.total;
  const done = session.mode === "scheduled" ? session.done : null;
  const left = session.queue.length;
  const deck = deckById(session.deckId);

  if (!session.current) {
    app.innerHTML = `<div class="study-done">
      <h2>✅ Session complete</h2>
      <p class="muted">${deck.name} — ${session.mode === "scheduled" ? "all due cards reviewed" : "loop ended"}.</p>
      <button data-act="back">← Back to decks</button>
    </div>`;
    $("[data-act=back]").addEventListener("click", () => { session = null; view = "decks"; render(); });
    return;
  }

  const card = DB.cards.find((c) => c.id === session.current);
  const pct = session.mode === "scheduled" ? Math.round((done / total) * 100) : 0;

  app.innerHTML = `
    <header class="topbar slim">
      <button class="ghost" data-act="back">← Decks</button>
      <span class="muted">${esc(deck.name)} · ${session.mode === "scheduled" ? `${done}/${total}` : "Continuous"} · ${left} in queue</span>
    </header>
    ${session.mode === "scheduled" ? `<div class="progress"><div style="width:${pct}%"></div></div>` : ""}
    <div class="card-stage">
      <div class="flashcard ${session.revealed ? "flipped" : ""}">
        <div class="face front"><div class="content">${esc(card.front)}</div></div>
        ${session.revealed ? `<hr><div class="face back"><div class="content">${esc(card.back)}</div></div>` : ""}
      </div>
      ${session.revealed ? renderRatings(card) : `<button class="reveal" data-act="reveal">Show answer <kbd>Space</kbd></button>`}
    </div>`;

  $("[data-act=back]").addEventListener("click", () => { session = null; view = "decks"; render(); });
  if (session.revealed) {
    app.querySelectorAll("[data-rate]").forEach((b) => b.addEventListener("click", () => rate(+b.dataset.rate)));
  } else {
    $("[data-act=reveal]").addEventListener("click", () => { session.revealed = true; render(); });
  }
}

function renderRatings(card) {
  const p = fsrs.preview(card);
  const labels = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };
  const btns = [1, 2, 3, 4].map((g) =>
    `<button class="rate r${g}" data-rate="${g}">
       <span class="lbl">${labels[g]}</span>
       <span class="iv">${fmtInterval(p[g].interval, g)}</span>
       <kbd>${g}</kbd>
     </button>`).join("");
  return `<div class="ratings">${btns}</div>`;
}

function renderManage(deckId) {
  const deck = deckById(deckId);
  const cs = cardsOf(deckId);
  const rows = cs.map((c) => `<tr data-id="${c.id}">
      <td>${esc(c.front)}</td><td>${esc(c.back)}</td>
      <td class="muted small">${stateLabel(c)}</td>
      <td><button class="ghost tiny" data-act="delcard" data-id="${c.id}">✕</button></td>
    </tr>`).join("");
  app.innerHTML = `
    <header class="topbar slim">
      <button class="ghost" data-act="back">← Decks</button>
      <h2>${esc(deck.name)} <span class="muted">· ${cs.length} cards</span></h2>
    </header>
    <div class="addcard">
      <input id="nf" placeholder="Front (question)">
      <input id="nb" placeholder="Back (answer)">
      <button data-act="addcard">＋ Add card</button>
    </div>
    <div class="manage-actions">
      <button class="ghost" data-act="renamedeck">Rename deck</button>
      <button class="ghost danger" data-act="deldeck">Delete deck</button>
    </div>
    <table class="cardtable"><thead><tr><th>Front</th><th>Back</th><th>State</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4" class="muted">No cards yet.</td></tr>`}</tbody></table>`;

  $("[data-act=back]").addEventListener("click", () => { session = null; view = "decks"; render(); });
  $("[data-act=addcard]").addEventListener("click", () => {
    const f = $("#nf").value.trim(), b = $("#nb").value.trim();
    if (!f) return $("#nf").focus();
    DB.cards.push(db.newCard(f, b, deckId)); persist(); render();
    setTimeout(() => $("#nf")?.focus(), 0);
  });
  $("#nb").addEventListener("keydown", (e) => { if (e.key === "Enter") $("[data-act=addcard]").click(); });
  $("[data-act=renamedeck]").addEventListener("click", () => {
    const n = prompt("Rename deck:", deck.name); if (!n) return; deck.name = n; persist(); render();
  });
  $("[data-act=deldeck]").addEventListener("click", () => {
    if (!confirm(`Delete "${deck.name}" and its ${cs.length} cards?`)) return;
    DB.cards = DB.cards.filter((c) => c.deckId !== deckId);
    DB.decks = DB.decks.filter((d) => d.id !== deckId);
    persist(); session = null; view = "decks"; render();
  });
  app.querySelectorAll("[data-act=delcard]").forEach((b) => b.addEventListener("click", () => {
    DB.cards = DB.cards.filter((c) => c.id !== b.dataset.id); persist(); render();
  }));
}

function stateLabel(c) {
  if (c.state === State.New) return "new";
  const days = Math.max(0, Math.round((c.due - Date.now()) / 86400000));
  return `due ${days === 0 ? "now" : "in " + days + "d"}`;
}

// ---------- utils ----------
function esc(s) { return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }

// ---------- keyboard ----------
document.addEventListener("keydown", (e) => {
  if (view !== "study" || !session || !session.current) return;
  if (e.target.tagName === "INPUT") return;
  if (e.code === "Space" || e.key === "Enter") {
    if (!session.revealed) { e.preventDefault(); session.revealed = true; render(); }
    return;
  }
  if (session.revealed && ["1", "2", "3", "4"].includes(e.key)) { e.preventDefault(); rate(+e.key); }
});

// ---------- boot ----------
render();
