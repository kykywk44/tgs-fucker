#!/usr/bin/env bash
# Dev only: validate .tgs files with python-lottie's Telegram sticker checker (tgs_check.py).
# Usage: bash scripts/check.sh [file.tgs ...]   (default: samples/*.tgs exports/*.tgs)
# Relative paths are resolved from the repo root. A file fails on a checker Warning or Error
# (python-lottie --level Warning); Notes are printed but never fail. Exits 1 if any file fails.

ROOT="$(cd "$(dirname "$0")/.." && pwd)" || exit 1
cd "$ROOT" || exit 1

LOTTIE_VERSION="0.7.2"
VENV="$ROOT/.venv"
PY="$VENV/bin/python"
CHECKER="$VENV/bin/tgs_check.py"

if [ ! -x "$PY" ]; then
  echo "Creating $VENV"
  python3 -m venv "$VENV" || { echo "error: python3 -m venv $VENV failed" >&2; exit 1; }
fi

# Install lottie once; skip pip when the pinned version is already present.
if ! "$PY" -c "import sys, importlib.metadata as md; sys.exit(0 if md.version('lottie') == '$LOTTIE_VERSION' else 1)" 2>/dev/null; then
  echo "Installing lottie==$LOTTIE_VERSION into $VENV"
  "$PY" -m pip install --quiet --disable-pip-version-check "lottie==$LOTTIE_VERSION" \
    || { echo "error: pip install lottie==$LOTTIE_VERSION failed" >&2; exit 1; }
fi
[ -f "$CHECKER" ] || { echo "error: checker not found: $CHECKER" >&2; exit 1; }

if [ "$#" -gt 0 ]; then
  inputs=("$@")
else
  shopt -s nullglob
  inputs=(samples/*.tgs exports/*.tgs)
  shopt -u nullglob
fi

if [ "${#inputs[@]}" -eq 0 ]; then
  echo "No .tgs files in samples/ or exports/; nothing to check."
  exit 0
fi

total=0
failed=0
for input in "${inputs[@]}"; do
  total=$((total + 1))
  case "$input" in
    /*) path="$input" ;;
    *) path="$ROOT/$input" ;;
  esac

  echo
  if [ ! -f "$path" ]; then
    echo "== $input"
    echo "   FAIL (file not found: $path)"
    failed=$((failed + 1))
    continue
  fi

  bytes="$(wc -c < "$path" | tr -d ' ')"
  kb="$(awk -v b="$bytes" 'BEGIN { printf "%.1f", b / 1024 }')"
  echo "== $(basename "$path")  ${kb} KB  $path"

  # Print every issue at the checker's default level (Note and up), so notes stay visible.
  # The verdict is the checker's own --level Warning run: exit 1 there means a Warning or
  # Error, and that fails the file. Notes never fail a file.
  all="$("$PY" "$CHECKER" "$path" 2>&1)"
  if [ -n "$all" ]; then
    printf '%s\n' "$all" | sed 's/^/   /'
  fi
  "$PY" "$CHECKER" --level Warning "$path" >/dev/null 2>&1
  rc=$?
  notes="$(printf '%s\n' "$all" | awk '/^Note: /{n++} END{print n+0}')"
  if [ "$rc" -eq 0 ]; then
    if [ "$notes" -gt 0 ]; then
      echo "   PASS ($notes note(s), informational)"
    else
      echo "   PASS"
    fi
  else
    echo "   FAIL (checker --level Warning exit $rc)"
    failed=$((failed + 1))
  fi
done

echo
echo "$total file(s) checked, $failed failed"
if [ "$failed" -gt 0 ]; then
  exit 1
fi
exit 0
