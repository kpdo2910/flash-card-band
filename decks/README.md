# Decks

Put your vocabulary file in this folder and run:

```bash
npm run deck -- decks/<file>
```

This generates `src/infrastructure/deck/deck.generated.js`. Then run `npm run build` to repackage the `.rpk`.

## Supported formats

| Format | Notes |
|--------|-------|
| `.tsv` / `.csv` | Delimiter detected automatically (tab, comma, semicolon, pipe). Cells may be double-quoted; newlines inside cells are supported. |
| Anki "Notes in Plain Text" (`.txt`) | Reads the `#separator:`, `#html:`… header lines; strips HTML, `&nbsp;`, `[sound:…]`; `<br>` becomes ` / `. |
| Anki `.apkg` | Exported from Anki (*Export → Anki Deck Package*). Read directly with Node ≥ 22 (`node:sqlite`), nothing else to install; the new format (`collection.anki21b`, zstd) is supported. Media is ignored. The note type's field names become the header; the Anki `guid` becomes the card id. Several decks/note types in one file: filter with `--deck=<name>` and `--model=<name>`. |
| Anki-style furigana | `日本[にほん]語[ご]` → front `日本語`, reading `にほんご` (when there is no separate reading column). |

General rules: an empty front cell with a reading (kana-only words) makes the reading the front; a reading equal to the front is dropped; `--extra=<column>` adds a small secondary line under the meaning (e.g. the Sino-Vietnamese reading).

Example for the Mimikara Oboeru N2 deck (note type "Japanese Vocab" with fields STT, Word, Sino-Vietnamese, Meaning, Ex, Ex-trans, Hiragana):

```bash
npm run deck -- "decks/mimikara_oboeru_N2.apkg" --front=Word --reading=Hiragana --back=Meaning --extra=Sino-Vietnamese --name="Mimikara N2"
```

## Columns

Defaults:

- With a header: recognises `front/word/kanji/vocab/term`, `reading/kana/furigana`, `back/meaning/nghĩa`, `id/guid`.
- No header, 3+ columns: `front, reading, back`.
- No header, 2 columns: `front, back` (reading taken from furigana when present).

Manual mapping (1-based column numbers or header names):

```bash
npm run deck -- decks/anki.txt --id=1 --front=3 --back=4
```

```bash
npm run deck -- decks/words.csv --front=word --reading=kana --back=meaning --header=yes --name="N5"
```

Other options: `--extra=<column>` (secondary line under the meaning), `--header=auto|yes|no`, `--sep=tab|comma|semicolon|pipe`, `--name=<deck name>`, `--out=<path>`; `.apkg` only: `--deck=<deck name>`, `--model=<note type name>`.

## Keeping progress across deck changes

Every card has an `id`. If the file has an id column (e.g. the Anki guid) it is used. Otherwise the id is a hash of the **front**: editing the meaning or reading keeps the progress, editing the front creates a new card.

## Display limits

The band screen is 212 px wide. Fronts longer than ~12 characters or meanings longer than ~60 characters are shrunk/truncated; the script warns about those rows.
