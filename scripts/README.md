# Dev scripts

## check.sh: Telegram sticker validation

Checks `.tgs` files with python-lottie's own Telegram checker (`tgs_check.py`, lottie==0.7.2).

    bash scripts/check.sh                  # samples/*.tgs and exports/*.tgs
    bash scripts/check.sh path/a.tgs ...   # explicit files

- First run creates `.venv/` and installs lottie==0.7.2; later runs skip the install.
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
- Output: `exports/<name>.tgs`, `exports/sheets/<name>.motion.png` (12 frames rendered by tlottie), Telegram checks. `"variants": { "a": {...} }` builds `<name>-a.tgs` … (a variant may set `"sketch": "other.svg"`); `--closeup=x,y,size,from-to` adds `<name>.closeup.png` (every frame in the range, cropped).

`node scripts/rest-diff.mjs <name>` checks what the motion compiler added: frame 0 of `exports/<name>.tgs` must look exactly like the static sketch (hidden parts hidden). Renders both at 2× and writes `exports/sheets/<name>.rest-diff.png` (differences in red) plus the differing regions; exits 1 if more than a few antialiasing pixels differ. Run `motion.mjs <name>` first.
