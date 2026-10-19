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
