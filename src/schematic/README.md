# Netlist → schematic

Captures the live netlist off a Jumperless, lets the user declare the components the
board cannot see, and exports a **KiCad** schematic (`.kicad_sch` + `.net`) or a
**Falstad CircuitJS** circuit. Opens from *Tools → 📐 Netlist → schematic*.

The premise: a Jumperless knows its **nets** — which rows, rails and header pins its
crossbar tied together — but has no idea what is physically plugged in. A resistor
bridging two rows is invisible to the firmware. So a capture is exactly half a
schematic, and the parts table is the other half.

---

## Status

Working and verified end to end **from pasted JSON**. Every stage is drivable from a
fixture, which is how it was built.

| | |
|---|---|
| KiCad export | Verified by round-trip through `kicad-cli` — see below |
| Falstad export | Loads and simulates; transistor geometry taken from circuitjs source |
| KiCanvas preview | Renders live in the panel |
| Autosave / project files | Survives reload |
| **Capture from real hardware** | **Never run against a board** |

### Not yet confirmed

1. **The hardware capture path has never executed.** `captureJumperlessState()` in
   `app.js` is built to the documented API but no board has been attached. This is
   the first thing to try.
2. **Row `N` ↔ row `N+30` pairing is an assumption.** The whole DIP placement model
   assumes row N sits directly across the centre channel from N+30. It is the natural
   reading of `JumperlessDefines.h:340-349` but was never confirmed on hardware.
3. **The JumperlOS fix is built but not flashed** (see *Firmware* below).

---

## Running it

```bash
npm run start     # dev server on :10001 (rollup watch)
npm test          # 44 tests, node --test
```

The KiCad round-trip is the load-bearing test and it needs KiCad installed
(`/Applications/KiCad/…/kicad-cli`); it skips itself otherwise. It exports a
schematic, has **KiCad** derive a netlist from the raw geometry, and diffs that
against the parts table. Nothing in a `.kicad_sch` declares connectivity — it emerges
from wires and labels landing on exact coordinates — so this is the only check that
proves a pin ended up on the net the UI claims.

To drive the panel without a board: *Paste JSON…* and feed it
`test/fixtures/shift_register.json`.

---

## The one design decision to understand

**A part pin binds to a node (a breadboard row), never to a net.**

Net numbers are ephemeral — the firmware renumbers them the moment a jumper moves.
Rows are physically stable. So a part records *where its pins sit*, and the net is
derived at render time from the newest capture:

| user action | if pins bound to nets | pins bound to nodes (what we do) |
|---|---|---|
| move an unrelated jumper | every binding is garbage | nothing changes |
| add a jumper to U1 pin 3 | binding points at a stale net | pin 3 is still row 12; it resolves into the new net |
| reseat the chip one row over | ambiguous | edit `anchorRow`; all pins move together |

The only thing needing cross-capture matching is user-supplied **net names**
(`matchNets`: exact signature → symbolic anchor → Jaccard ≥ 0.5 → orphaned). Parts
never participate, so a bad match costs a label, never a connection.

---

## Verified external-format facts

These cost real effort to establish. Don't re-derive them; don't casually change them.

### KiCad — we emit format `20230121` (KiCad 7), deliberately

KiCad 7/8/9/10 all read it and silently upgrade on open, **and** it is the dialect
KiCanvas parses natively. One output stream serves both the desktop app and the
in-panel preview. Hence the dated spellings: bare `hide` inside `effects`, `(id N)`
on properties, `(power)` unqualified, `(generator jumperide)` as a bare atom.

- Ground truth for the dialect: `debug/examples/*.kicad_sch` in the KiCanvas repo.
  The installed KiCad 10 libraries are the *new* dialect and must be translated —
  that is what `scripts/extract-kicad-symbols.py` does to produce
  `kicad_symbols.js`.
- **Connectivity is geometric.** Pin → short wire stub → `(label "NET")`. Identical
  label text = same net. Every endpoint must land where intended to the micron; a
  rounding slip yields a schematic that looks right and nets wrong, with no error.
- Library pins use +Y up, the sheet uses +Y down. Everything is placed at rotation 0,
  so the whole transform is that one Y flip.
- A pin's `(at x y angle)` is its *connection point*; the angle points back toward the
  body, so stubs run the opposite way.
- Pin **numbers** are not always numbers: `Device:Q_NPN` numbers its pins `B`/`C`/`E`,
  `Device:Q_NMOS` uses `D`/`G`/`S`, and `Device:LED` numbers the **cathode** `1`.
  Getting these wrong produces a plausible schematic with wrong nets.
- Label text: `/` → `{slash}`, `{` → `{brace}`; empty labels are rejected.
- A KiCad power symbol **renames** the net it touches to its own Value, outranking any
  local label. So one is only placed when the net already carries that exact name —
  otherwise KiCad silently renames the net and the exported netlist stops matching the
  parts table. A user-renamed net therefore gets no power symbol.

### Falstad CircuitJS

Format is `<type> <x1> <y1> <x2> <y2> <flags> <extra…>`; the type table is
`CirSim.createCe()` in `sharpie7/circuitjs1`.

- Routing is done entirely with **labeled nodes (type `207`)**: each pin gets a stub
  to a label named after its net. No wire routing, parts sit on a grid.
- ⚠️ **Two-terminal elements have both posts at the dump coordinates. Elements with
  three or more posts derive the rest in `setPoints()`.** Getting that geometry subtly
  wrong yields a circuit that loads and simulates but is wired to something other than
  the parts table says. Only add a multi-post element after actually reading its
  `setPoints()`. This is why MOSFETs, pots and SPDT switches are still exported as
  text annotations — their geometry was never verified.
- The bipolar transistor **was** verified: `TransistorElm.setPoints()` puts collector
  and emitter at `point2` displaced ±16 perpendicular, sign following `pnp`;
  `getPost` order is base, collector, emitter.
- ⚠️ **Never represent an unknown chip as `CustomLogicElm` (208).** Its declared
  outputs actively drive nets and corrupt the whole simulation. Unknown parts become a
  text annotation listing their pin→net mapping.
- `162` LED and `z` zener extend `DiodeElm`, so they inherit its `modelName` field
  *and* `FLAG_MODEL = 2`. The model name comes **before** the colour triple.
- Text/label fields use `CustomLogicModel.escape()` (space → `\s`, `+` → `\p`, …) and
  need `FLAG_ESCAPE = 4`.
- The `?cct=` query decoder is not a full `decodeURIComponent` — a percent-escaped `:`
  arrives literally as `%3A`. Display-only (both labels of a net escape identically,
  so they still match), but it is why annotation text avoids punctuation and why the
  downloaded `.txt` is the lossless path.

### KiCanvas

Vendored at `vendor/kicanvas/` — MIT, not on npm. See its README.

- Inline source works: `<kicanvas-source>` with the file text as a child. Type is
  sniffed from `(kicad_sch`.
- **It loads its source once**, in `initialContentCallback`. Refreshing means
  replacing the element — which spawns a new WebGL context each time, and browsers cap
  those at a dozen or so, so the outgoing canvas is explicitly `loseContext()`ed.
- Its parser **warns and skips** unknown tokens rather than throwing, so format drift
  degrades cosmetically.
- It appends a `<link>` to **fonts.googleapis.com** on import. Loaded lazily, so
  nothing is requested until someone opens the panel.

---

## Firmware (JumperlOS) — changed, built, **not flashed**

Three files: `src/routing/JsonState.{cpp,h}`, `src/GraphicOverlays.cpp`.
Builds clean with `pio run -e jumperless_v5`.

**1. `get_state()` raised `UnicodeError` and took the whole netlist with it.**
`escapeJson()` escaped only `"`, `\n`, `\r` — not backslashes — and nothing bounded or
sanitised the bytes. Names live in fixed `char[32]` buffers
(`DisplayState::NetNameEntry::name`, `GraphicOverlay::name`), so an unterminated one
made `strlen()` read into adjacent memory. `mp_obj_new_str()` then validates UTF-8 and
rejects the **entire** document — one stray byte made the whole netlist unreachable
from MicroPython. Overlay names were being appended with no escaping at all, so a `"`
in one produced invalid JSON outright.

`escapeJson()` is now bounded and sanitising, declared in the header, and used by the
overlay serialiser too. Algorithm was checked on the host under ASan/UBSan against an
unterminated buffer.

**2. Unconnected infrastructure nets are no longer reported.** Nets 1–5 are reserved —
`GND`, `Top Rail`, `Bottom Rail`, `DAC 0`, `DAC 1` (`MatrixState.cpp:21-25`) — each
seeded with a single node, its own, whether or not anything is attached. (That is why
`listNets` starts its scans at index 6.) They were showing up as phantom supplies and
a second, empty GND net. `get_state()` now skips any net with fewer than two nodes; a
DAC that *is* wired still appears. Rail and DAC voltages come from the `power` block
regardless.

The IDE applies the same filter on capture (`normaliseNet`), so this works against
boards running older firmware without reflashing. **Keep both.**

---

## Traps

- **`rollup.config.mjs` has `onwarn: () => { throw }`.** Any rollup warning fails the
  build. Avoid new npm deps; everything here is string generation.
- **`src/schematic/package.json` marks this directory as ESM** so `node --test` can
  import it. It cannot live at `src/` or the repo root: `scripts/generate-api-ref-data.js`
  `require()`s `src/api_ref_help_overrides.js` as CommonJS and would *silently* stop
  applying the overrides.
- **Do not put the autosave in `settings.js`.** `_persistSettings()` rebuilds the
  settings object from `#menu-settings` DOM inputs and hand-preserves only two extra
  keys — anything else is dropped the next time a checkbox is toggled.
- **The `special` field in `get_state()` is unreliable for net identity.**
  `JsonState.cpp` lets the *last* matching node win, so a net holding both GND and
  ADC_0 reports `"ADC"`. Classify from node membership; `special`/`voltage` are
  supplements only. Same reason `voltage` can be missing from a rail — the model falls
  back to the board-level `power` block.
- **FontAwesome uses an explicit allowlist** (`app.js:51-61`). An unregistered `fa-*`
  class renders nothing.
- `npm run build` regenerates `src/generated/api_ref_data.js`. Unrelated to this work;
  revert it if it dirties your diff.
- Two component legs in a row the crossbar never touched are genuinely one node but
  the firmware reports nothing. `buildModel` synthesises a net for those — but only
  when **≥2 pins** share the node, or every dangling pin would grow a stub to nowhere.

---

## File map

| File | Role |
|---|---|
| `ir.js` | The model. Node vocabulary, net classification, DIP pin math, inference, `buildModel()`. Pure — no DOM, no `app.js` import (that would be circular). |
| `capture.js` | The MicroPython run on the board. Separate so tests can execute it. |
| `export_kicad.js` | `.kicad_sch` + `.net`. Procedural DIP/connector symbols. |
| `export_falstad.js` | CircuitJS text + `?cct=` URL. |
| `kicad_symbols.js` | **Generated** by `scripts/extract-kicad-symbols.py`. Do not edit. |
| `panel.js` | The UI. Three delegated listeners; narrow repaints so typing never loses the caret. |
| `store.js` | localStorage autosave + `.json` project files. |
| `panel.css` | Styles; theme vars from `app_common.css`. |

Wired into the app at: `app.js` (CSS import, `captureJumperlessState`,
`SCHEMATIC_TAB_FN` + opener, the `saveCurrentFile` guard, `tabClosed` cleanup),
`ViperIDE.html` (Tools menu row), `rollup.config.mjs` (copies the KiCanvas bundle).

Tests: `test/schematic.test.mjs` (model), `test/export_kicad.test.mjs` (incl. the
round-trip), `test/export_falstad.test.mjs`, `test/capture.test.mjs` (runs the
on-board Python under CPython against a stub).

---

## Next

1. **Capture from a real board.** If the "read net by net" toast appears, `get_state()`
   is still producing bad bytes and it would be worth seeing the raw output.
2. **Confirm the row N ↔ N+30 pairing**, then trust or fix `dipPinNode`.
3. Flash the JumperlOS build and re-check that reserved nets are gone at the source.

Deferred by choice: capture over the raw serial terminal port (`J nets` + a
brace-balance accumulator); the noisy "suggest 2-pin parts" heuristic; importing a
schematic back onto the board via `set_state()`; a real footprint library; multi-post
Falstad elements (MOSFET, pot, SPDT).
