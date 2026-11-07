# Flash Card

Japanese flashcards for the Xiaomi Smart Band 11 (standard model, 212×520). A Xiaomi Vela quick app with **FSRS-6** scheduling. Front: the word. Back: reading + Vietnamese meaning. On-device UI is in Vietnamese.

## Usage

| Gesture | Meaning |
|---------|---------|
| Tap | Flip the card. The timer stops at the flip; time spent reading the back is not graded |
| Swipe up | Known. Time to recall sets the grade: ≤5 s Easy, ≤10 s Good, ≤15 s Hard, longer = Again |
| Swipe down | Not known (Again) |
| Swipe right | End the session |

Settings: grading thresholds, which swipe means "known", new cards per day (10–200), target retention, reading on the front. Long-press to reset progress.

## Build

Requires Node.js ≥ 22.

```bash
npm install
```

```bash
npm run deck -- decks/sample.tsv
```

```bash
npm run release
```

Output: `dist/com.kinkaze.cardband.release.0.1.0.rpk`. Install it with [AstroBox](https://github.com/AstralSightStudios/AstroBox-NG) (iPhone or Android). `npm run build` makes a debug build (larger, see [docs/vela-notes.md](docs/vela-notes.md)); `npm start` runs the Vela emulator, set up per the [Vela quick app docs](https://iot.mi.com/vela/quickapp/).

Do not change `package` in `src/manifest.json`: progress on the band is tied to it.

### AstroBox cannot import devices for a non-Chinese Xiaomi account

AstroBox 2.2.5 fails with `failed to import bound devices: invalid type: null` for accounts outside China ([issue #25](https://github.com/AstralSightStudios/AstroBox-NG/issues/25)). Fetch the AuthKey yourself and enter it manually in AstroBox:

```bash
npm run authkey -- --user <email, phone or Xiaomi ID>
```

The script asks for your password, signs in to account.xiaomi.com, queries the regional servers and prints your devices with their AuthKey. Nothing leaves your machine except the Xiaomi sign-in. For two-step verification follow the printed link, then rerun with `--cookie "userId=...; passToken=..."` and the printed `--device-id`.

## Your own deck

CSV/TSV, Anki "Notes in Plain Text" and Anki `.apkg` are accepted; see [decks/README.md](decks/README.md). Example:

```bash
npm run deck -- decks/mimikara_oboeru_N2.apkg --front=Word --reading=Hiragana --back=Meaning --extra=Sino-Vietnamese --name="Mimikara N2"
```

Progress is keyed by card id (the Anki guid for `.apkg`), so it survives deck updates.

## Code

```
src/domain/          FSRS-6, scheduler, grading, recall timer, queue, session, settings (pure JS)
src/application/     use cases
src/infrastructure/  storage, generated deck, clock, Vela wiring
src/presentation/    UI helpers (font fitting, time bar, formatters)
src/pages/           .ux pages: home, study, summary, settings, select
tools/               build-deck (CSV/Anki/.apkg), make-icon, mi-authkey
tests/               node:test, mirrors src/
```

Dependencies point inwards: `domain ← application ← infrastructure/presentation ← pages`. Only `infrastructure/vela/wiring.js` and the pages touch `@system.*`, so everything else runs under `npm test`.

Screenshots: [docs/screenshots](docs/screenshots). Vela-specific findings (picker hang, rpk size, emulator input): [docs/vela-notes.md](docs/vela-notes.md).

## License

[MIT](LICENSE)
