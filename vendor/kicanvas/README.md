# KiCanvas (vendored)

In-browser KiCad renderer, used by the Schematic Export panel to preview the
`.kicad_sch` file it is about to hand you.

- Upstream: <https://github.com/theacodes/kicanvas> — (c) 2022 Alethea Katherine Flowers
- License: MIT (see `LICENSE.md`)
- Bundle source: <https://kicanvas.org/kicanvas/kicanvas.js>
- Fetched: 2026-08-14
- sha256: `ca910f25276c3efb9aacb3a5d6341d4d9af4736d4c875fb0440d2cc856865ab7`

## Why vendored

KiCanvas is not published to npm, so there is nothing to `npm install`. Keeping the
prebuilt bundle in-tree also means:

- it is **not** run through rollup, which matters because `rollup.config.mjs` is
  configured with `onwarn: () => { throw }` — any warning from a 477 KB third-party
  bundle would fail the whole build;
- the IDE keeps working offline and does not pull a script from a third-party origin
  at runtime.

`rollup.config.mjs` copies `kicanvas.js` into `build/` alongside the other static
assets. It is loaded as `<script type="module" src="./kicanvas.js">`.

## One caveat: it fetches Google Fonts

On import the bundle appends a `<link rel="stylesheet">` for
`fonts.googleapis.com` (Nunito + Material Symbols, used by its own toolbar). So
opening the Schematic Export panel makes one third-party request that the rest of
JumperIDE does not.

The panel loads `kicanvas.js` lazily -- nothing is requested until someone actually
opens the panel -- and if the request fails the preview still renders; only
KiCanvas's own toolbar glyphs degrade. Removing the line from the bundle is
possible (it is MIT) at the cost of those icons.

## Updating

Re-download the bundle, update the date and hash above, then re-check the schematic
preview against `src/export_kicad.js` output — KiCanvas parses a KiCad 6/7-era dialect,
which is why the exporter emits schematic format version `20230121`.
