#!/usr/bin/env python3
"""Chunk a (large) PDF into text blocks ready to feed an LLM for flashcard generation.

Usage:
  python3 pdf_chunk.py input.pdf [pages_per_chunk]

Writes chunk_001.txt, chunk_002.txt ... into ./chunks/, each prefixed with a
ready-to-use prompt. Paste a chunk into Claude/ChatGPT (or pipe via API) and it
returns front,back CSV. Concatenate all CSVs, then:
  .venv/bin/python build_apkg.py all.csv out.apkg "Deck Name"

Needs poppler: pdftotext (already installed).
"""
import os, sys, subprocess, math

PROMPT = """You are making Anki flashcards. From the text below, output ONLY CSV rows
in the form: front,back  (one card per line, no header, quote fields containing commas).
Make atomic Q->A cards: one fact each, question on front, concise answer on back.
Skip references, page numbers, figure captions. Aim 8-15 cards per chunk.

--- TEXT ---
"""

def main():
    if len(sys.argv) < 2:
        print("usage: pdf_chunk.py input.pdf [pages_per_chunk]"); sys.exit(1)
    pdf = sys.argv[1]
    per = int(sys.argv[2]) if len(sys.argv) > 2 else 3

    info = subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout
    pages = next((int(l.split(":")[1]) for l in info.splitlines() if l.startswith("Pages")), 0)
    if not pages:
        print("could not read page count"); sys.exit(1)

    os.makedirs("chunks", exist_ok=True)
    nchunks = math.ceil(pages / per)
    print(f"{pages} pages -> {nchunks} chunks of {per} pages")

    for i in range(nchunks):
        first = i * per + 1
        last = min((i + 1) * per, pages)
        text = subprocess.run(
            ["pdftotext", "-f", str(first), "-l", str(last), pdf, "-"],
            capture_output=True, text=True).stdout
        out = f"chunks/chunk_{i+1:03d}.txt"
        with open(out, "w", encoding="utf-8") as f:
            f.write(PROMPT + text + "\n--- END ---\n")
        print(f"  {out}  (pages {first}-{last}, {len(text)} chars)")

    print("\nNext: paste each chunk into an LLM -> collect CSV rows -> concat -> build_apkg.py")

if __name__ == "__main__":
    main()
