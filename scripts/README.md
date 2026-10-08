# Dev scripts

## check.sh: Telegram sticker validation

Checks `.tgs` files with python-lottie's own Telegram checker (`tgs_check.py`, lottie==0.7.2).

    bash scripts/check.sh                  # samples/*.tgs and exports/*.tgs
    bash scripts/check.sh path/a.tgs ...   # explicit files

- First run creates `.venv/` and installs lottie==0.7.2; later runs skip the install.
- Relative paths are resolved from the repo root; use absolute paths for files elsewhere.
- No `.tgs` files to check is not an error (exit 0); a missing file is.
- Exit 1 if any file fails: the checker reports an issue (default level Note, so notes and warnings count) or crashes.
