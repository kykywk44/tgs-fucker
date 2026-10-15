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
