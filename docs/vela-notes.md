# Vela notes

Things learned while building Flash Card for the Smart Band 11 that the Vela docs do not say. Vela 5.0 runtime, aiot-toolkit 2.0.5.

## rpk size and installation

- The debug build (`aiot build`) pretty-prints object literals. A 1160-card deck as an array of objects made `app.js` 425 KB and AstroBox failed with `install result message missing` (the band never answered). The deck is therefore generated as one tab-separated string, parsed lazily on the band: `app.js` 162 KB debug / 101 KB release.
- `aiot release` needs `sign/release/{private,certificate}.pem`. The repo ships the toolkit's default debug certificate there (CN=localhost), so the release build is signed exactly like the debug build the band accepts. Replace it with your own key to publish.
- `npm run build` and `npm run release` both wipe `dist/` first.
- The runtime tries `*.jsc` before `*.js`; the resulting `openFile` error in the log is harmless.

## Components

- `<picker type="text">` is a native inline wheel (same widget as the band's Pomodoro app): inertial scrolling, tap a neighbour to jump. Styles: `color`, `selected-color`, `font-size`, `selected-font-size`. `change` gives `{ newValue, newSelected }`. **Never change its font size after creation** (class or inline style): the renderer hangs and the picker shows "Option 1 / Option 2". Create it only once the data is known, one picker per size in `block if/elif`.
- Settings use a `<list>` of flat `<list-item>`s (fixed `type` and height). A `for` nested inside a `<list-item>` does not render; a `<scroll>` taller than ~1100 px squashes rows on the emulator.
- `@keyframes` is rejected (`Unknown style - keyframes`); `transition` on opacity/height/background-color works. Transitioning `width` on a centred element misplaces it during the transition.
- The platform `swipe` event needs a fast flick. The study page also derives swipes from `touchstart`/`touchend` (≥ 50 px) and dedupes the two within 400 ms.
- The exit animation of the entry page belongs to the system and cannot be configured.

## Emulator

- Mouse drags scroll `<list>` and `<picker>`; on plain `div`s a drag is a tap. The emulator agent's gRPC `sendTouch` produces no events.
- The system font lacks many Vietnamese diacritics (boxes); kana/kanji are fine. The band renders Vietnamese correctly.
- `pm install` over an installed app fails: uninstall first or use `aiot start --watch`.
- `invoke complete callback failed` and `Unsupported type for setDomAttributes` in the log come from the framework.
