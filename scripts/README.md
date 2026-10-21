# Dev scripts

## check.sh: Telegram sticker validation

Checks `.tgs` files with python-lottie's own Telegram checker (`tgs_check.py`, lottie==0.7.2).

    bash scripts/check.sh                  # samples/*.tgs and exports/*.tgs
    bash scripts/check.sh path/a.tgs ...   # explicit files

- First run creates `.venv/` (with the first working `python3` / `python` / `py`) and installs lottie==0.7.2; later runs skip the install. Works in Git Bash on Windows (venv `Scripts/`).
- Relative paths are resolved from the repo root; use absolute paths for files elsewhere.
- No `.tgs` files to check is not an error (exit 0); a missing file is.
- A file fails (exit 1) on a checker Warning or Error (`--level Warning`), a crash, or a missing file.
- Notes (e.g. track mattes, masks) are printed for every file as informational and never fail it.

`npm run glyphs` (`build-glyphs.mjs`) bakes Roboto Black outlines into `src/core/glyphs/roboto-900.json` + `OFL.txt` (dev deps `opentype.js`, `@fontsource/roboto`; output is deterministic).

`node scripts/measure-corpus.mjs [files...]` (default `samples/*.tgs`) reports how stickers split into atoms (shape lists that own a paint): atom counts, tiny (< 16 px) and unpickable atoms from an antialias-free ID render, precomp reuse, trim paths / repeaters / gradients / mattes, root `nm` duplicates, and whether the hand profiles align to atoms. Read-only.

`node scripts/sticker-sheet.mjs [files...]` (default `samples/*.tgs`) renders PNG sheets into `exports/sheets/`: six frames, numbered solid atoms, numbered translucent atoms (effects), and an atom table — the material for marking up a sticker's parts.

`node scripts/parts-sheet.mjs [--profile src/core/profiles/x.ts] [files...]` renders `exports/sheets/<name>.parts.png` for stickers with a profile: each part highlighted (magenta outline) on three frames, plus a row with visible atoms in no part; prints atoms, key colour and coverage per part, or the fingerprint of a sticker without a profile.

`node scripts/text-motion.mjs <sticker.tgs> '<container selector JSON>'` measures an inscription's own motion (per-keyframe homographies, residual, face box at keyframe 0) and prints the TypeScript for a profile's TextSpec.

## motion.mjs: a sticker from a sketch + motion spec

    node scripts/motion.mjs blob          # stickers/blob/{sketch.svg,motion.json} → exports/blob.tgs

- `sketch.svg` — 512×512, every moving part a named group (Figma: export SVG with «Include id attribute»). Nesting is the rig: parts inside `body` move with it. Converted by python-lottie (`.venv`, run `bash scripts/check.sh` once).
- `motion.json` — `MotionSpec` (`src/core/motion/compile.ts`): `duration` (s); `rig.<part>` (name may use `*`): `pivot` (`[x, y]` canvas px or `center|bottom|top|left|right`), `hidden` (invisible unless `show`), `z` / `turnCenter` / `focal` (perspective turn), `zones` (`[{ box, z, thickness, feather }]` — a region of the part set back to another depth with its own extrusion, e.g. a trigger guard), `depth` (`thickness`, `color`, `layers`, `profile: "round"` + `cap` — side faces / a cylinder with an end face shown while it faces the viewer); `tracks`: `{ part, preset, at, ...params }`, `at` may be a list of starts, `each: true` hands the starts to the matching parts in turn, `launch: { part, point }` starts each throw at a point of a moving part; `sources` (`{ name: "gun_refs/X.tgs" }`) and `effects` (`{ source, comp, at, anchor: { part, point } | [x, y], origin, scale, stretch, rotate, aim, follow, speed, skip, len, grow, drift, fade, behind }`) copy precomps from other stickers.
- Presets (`src/core/motion/presets.ts`): `bounce` (height, squash, len), `float` (amp), `sway` (angle), `pulse` (amount), `pop` (peak), `blink`, `shake` (angle), `spin` (turns), `kick` (any channels: x, y, r, sx, sy, o, show, yaw, pitch; attack, hold, release, attackEase, releaseEase — recoil, blowback, trigger, light flash, turn in perspective), `eject` (vx, vy, gravity, spin, len — thrown shell), `follow` (of, from, to, gain, delay — secondary motion from another part's channel). `yaw`/`pitch` morph every path of the part (depth from `rig.z`).
- Variants for comparison: `stickers/<name>/variants/<v>.json` — shallow overrides of `motion.json` (may set `sketch`, add `sources`) → `exports/<name>-<v>.tgs`; `motion.json` stays the baseline `<name>.tgs`. With variants, `exports/sheets/<name>.compare.png` shows the baseline and every variant row by row (rows numbered, legend on stdout); `--compare=from-to,step` picks the frames (default `0-179,10`). Pistol: `python3 stickers/pistol/variants/make.py` writes its variants.
- A numeric preset parameter given as a list is cycled per start (`r: [-16, -12, -24]`, `vx: [...]` — every shot, every shell different); with `each` the order follows `at`. `eject` takes `tumble` (half-turns end over end, x squeezed to `tumbleMin` %); `puff` (from, to, dx, dy, fade, len — smoke puff, shock ring) grows, drifts, fades and hides.
- Output: `exports/<name>.tgs`, `exports/sheets/<name>.motion.png` (12 frames rendered by tlottie), Telegram checks. `"variants": { "a": {...} }` builds `<name>-a.tgs` … (a variant may set `"sketch": "other.svg"`); `--closeup=x,y,size,from-to` adds `<name>.closeup.png` (every frame in the range, cropped).

`node scripts/rest-diff.mjs <name>` checks what the motion compiler added: frame 0 of `exports/<name>.tgs` must look exactly like the static sketch (hidden parts hidden). Renders both at 2× and writes `exports/sheets/<name>.rest-diff.png` (differences in red) plus the differing regions; exits 1 if more than a few antialiasing pixels differ. Run `motion.mjs <name>` first.

`node scripts/fx-gallery.mjs` — muzzle steam candidates side by side: each on the baseline pistol with one shot (`exports/fx/<id>.tgs`, sizes in `exports/fx/gallery.json`, `exports/sheets/fx-gallery.png`). Our own steam precomps come from `stickers/pistol/fx/steam.json` (`node stickers/pistol/fx/build_fx.mjs`: trim-path wisps, a puff chain, Angry-style lines), used as a `sources` entry like `gun_refs/`. Run `node scripts/motion.mjs pistol` first (it writes the sketch base).

`node scripts/fit.mjs <name> [--margin=8] [--only=gun]` — the largest size that still fits, per build: renders every frame of `exports/<name>.tgs` and each variant at half size (so what leaves the canvas is measured too), shells hidden, and writes `stickers/<name>/view.json` (`{ "<name>": view, "<variant>": view }`, scale about the centre + offset, 8 px margin). The spec's `view` (`MotionSpec.view`) is applied through a null layer every top-level layer is parented to. Views already applied are undone before measuring, so rerun fit → make → motion.mjs until it is stable. Pistol: `python3 stickers/pistol/variants/make.py` reads view.json and camera.json (`wide`, `mixed.towards` / `mixed.away`: `fov` angle of view, `turn` amplitude ×). `rig.<part>.focal` may be a list of `[seconds, focal]` points (eased).

## restyle.mjs: an existing sticker in a pack's look

    node scripts/restyle.mjs blue/middle-finger   # packs/blue/middle-finger/{source.tgs,recipe.json} → exports/blue/middle-finger.tgs

- Animation untouched; only paints change. `recipe.json` `colors` maps each source colour to a new one or to `"body"` — those fills become the pack's body gradient (`packs/<pack>/style.json` `body.stops`, stop 0 at the bottom).
- The gradient spans all body-painted shapes together at `recipe.frame` (canvas space, so adjoining pieces have no seams); each fill gets it in its own coordinates and moves with the drawing.
- Shared colours live in `style.json` `colors`; `ramp` ([source, pack] pairs by lightness) recolours every other warm colour (glows, gradient stops). Each precomp asset gets its own body gradient (a mirrored pair of hands = one asset).
- Recipe extras: `fade` (`{ layer: percent }` — opacity of that layer's highlight fills, source colour `style.highlight`; 0 hides them), and for clothes: `remove` (layer names), `trims` (shorten a stroke that ran under a sleeve), `underlines` (outline a fill whose edge was hidden), `limbs` (round-capped body-colour line with an outline; `root: true` copies the parent chain to the root, where precomps don't clip). `gradients` (`[[layer names], …]`) gives each figure of one composition its own body gradient. `repaint` (`{ layer: { "#from": "#to", "gradient": "#to" } }`) swaps source colours in that layer only, before the mapping (a shadow colour that should be skin there); `gradient` turns its gradient fills into plain fills.
- Writes `exports/sheets/<pack>-<name>.png` (6 frames: original above, restyled below) and prints the Telegram checks.

`node scripts/library.mjs` — index and thumbnails for the editor's «Эмодзи» tab: `library/emoji/*.tgs` (Telegram's emoji, numbered; see `library/README.md`), `packs/blue/ready/*.tgs` and the drafts `exports/blue/*.tgs` → `library/index.json` + `library/thumbs/<set>-<n>.png` (128 px cells, 100 per sprite; the frame showing the most of the drawing). Emoji named by a recipe's `"library"` are marked done. ~15 s for 997 files; rerun after adding to `ready/`.
