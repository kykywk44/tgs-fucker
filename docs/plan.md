# TGS Editor Prototype — Implementation Plan

Spec: this file's "Context" and "Global Constraints" sections (approved by the user on 2026-10-08).

## Context

Prove that Telegram animated stickers (.tgs) can be opened, previewed exactly as Telegram renders them, edited (recolor) and saved so that Telegram accepts the result. Prototype only — no AI generation, no element replacement yet.

Facts the plan relies on (verified against primary sources):
- `.tgs` = gzip-compressed Lottie JSON with `"tgs": 1` at the root.
- Telegram sticker rules (core.telegram.org/stickers): 512×512 canvas, 60 fps, ≤ 3 s, looped, ≤ 64 KB file. Forbidden: expressions, masks, layer effects, images, solids, text, 3D layers, merge paths, star shapes, gradient strokes, repeaters, time stretch/remap, auto-orient, auto-bezier.
- Telegram clients render stickers with the **tlottie** engine. npm package `tlottie@0.1.24` (MIT) wraps it: React component `LottiePlayer` from `tlottie/react`, props `data` (Lottie JSON string or Uint8Array, gzipped OK), `loop`, `autoplay`, `reportFrames`, `lottieRefCallback` (gives the `TLottie` instance with `play()`, `pause()`, `seek(frame)`, `on('frame' | 'load' | 'error', cb)`).

## Global Constraints

- Stack: Vite + React + TypeScript (strict), vitest. npm (not pnpm). Node 22.
- **Do not reinvent**: rendering = `tlottie`; gzip = native `CompressionStream` / `DecompressionStream`; Telegram validation = python-lottie (dev script). Add a dependency not listed here only with a one-line justification in the report.
- Core logic in `src/core/` is pure TS with no DOM/React imports, so it can be tested in Node.
- Functions in `src/core/` never mutate their input; they return new objects.
- Every task ends with `npm run typecheck && npm test && npm run build` passing.
- Sample stickers live in `samples/*.tgs` (provided by the user). Tests that iterate samples must also run (and pass) when the folder is empty, using fixtures in `src/core/__fixtures__/`.

## Execution order

Task 1 → (Task 2, Task 3, Task 5 in any order) → Task 4 → Task 6.

Suggested model tier (superpowers rules): Tasks 1, 2, 3, 5 — cheap (Haiku). Task 4 (library evaluation) and Task 6 (multi-file integration) — standard (Sonnet) unless the orchestrator decides otherwise.

---

### Task 1: Project scaffold

Files: project root (`package.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`).

1. Scaffold Vite `react-ts` into the existing repo root without deleting `.claude/`, `docs/`, `samples/`, `.gitignore` (e.g. scaffold into a temp dir with `npm create vite@latest`, then move files in).
2. Install dependencies: `tlottie@0.1.24`, `@lottiefiles/lottie-js`, `lottie-colorify`; dev: `vitest`.
3. `package.json` scripts: `dev`, `build`, `typecheck` (`tsc -b --noEmit` or equivalent for the template), `test` (`vitest run`).
4. `vite.config.ts`: add `optimizeDeps: { exclude: ['tlottie'] }` so its worker and `.wasm` asset are served as files.
5. Replace template `App.tsx` with a placeholder `<h1>TGS Editor</h1>`; remove template assets/CSS you don't use.
6. Add one trivial test `src/core/sanity.test.ts` so `npm test` runs.

Done when: `npm run typecheck && npm test && npm run build` pass; `git status` clean after commit.

### Task 2: TGS read/write core

Files: `src/core/tgs.ts`, `src/core/tgs.test.ts`, `src/core/__fixtures__/minimal.json`.

Interface (exact):

```ts
export interface Lottie {
  v?: string; fr: number; ip: number; op: number; w: number; h: number;
  layers: unknown[]; assets?: unknown[]; tgs?: number;
  [key: string]: unknown;
}
export async function readTgs(bytes: Uint8Array): Promise<Lottie>;   // gzip if bytes start with 0x1f 0x8b, else plain JSON text
export async function writeTgs(anim: Lottie): Promise<Uint8Array>;   // sets tgs: 1, compact JSON.stringify, gzip
export function sizeKb(bytes: Uint8Array): number;                    // bytes.length / 1024, rounded to 1 decimal
```

Use `DecompressionStream('gzip')` / `CompressionStream('gzip')` (available in Node 22 and browsers).

Tests:
- `minimal.json`: a tiny valid Lottie (512×512, fr 60, ip 0, op 60, one shape layer with a rectangle `rc` and fill `fl` color `[1,0,0,1]`).
- read plain JSON fixture → write → read again → `toEqual` original plus `tgs: 1`.
- written bytes start with `0x1f 0x8b`.
- for every `samples/*.tgs` (if any): read → write → read deep-equals first read; log size before/after.

Done when: tests pass; global gate passes.

### Task 3: Preview component

Files: `src/preview/Preview.tsx`, `src/preview/preview.css`.

Props (exact):

```ts
interface PreviewProps {
  json: string;          // Lottie JSON string
  totalFrames: number;   // op - ip
}
```

Behavior:
- Renders `LottiePlayer` from `tlottie/react` with `data={json}`, `loop`, `autoplay`, `reportFrames`, displayed at 512×512 CSS px on a checkerboard background (pure CSS, `preview.css`).
- Gets the `TLottie` instance via `lottieRefCallback`; subscribes to `'frame'` to show `frame N / totalFrames`.
- Controls: Play/Pause toggle; `<input type="range" min=0 max=totalFrames-1>` — on input, pause and `seek(value)`.
- Shows error text if the player emits `'error'`.
- When `json` changes the player reloads (tlottie remounts on `data` change — do not add extra logic).
- Temporary: render `<Preview>` in `App.tsx` with `src/core/__fixtures__/minimal.json` imported as a string (`?raw`) if Task 2 is done, else an inline minimal JSON.

Done when: global gate passes; `npm run dev` page shows the animation and controls with no console errors (report what you observed; if you cannot open a browser, say so).

### Task 4: Color extraction and replacement

Files: `src/core/colors.ts`, `src/core/colors.test.ts`, `src/core/__fixtures__/colors.json`.

Interface (exact):

```ts
import type { Lottie } from './tgs';
export interface ColorEntry { hex: string; count: number }       // hex like '#ff0000', lowercase, alpha ignored
export function listColors(anim: Lottie): ColorEntry[];           // unique colors, sorted by count desc
export function replaceColor(anim: Lottie, fromHex: string, toHex: string): Lottie; // new object, input untouched
```

Fixture `colors.json` must contain each case: static fill (`fl.c.k` array), static stroke (`st`), animated color (`c.a = 1`, keyframes with `s` and optionally `e`), gradient fill `gf` (`g.p` stops, `g.k.k` flat array `[offset,r,g,b,...]` followed by opacity stops), shapes nested in groups (`gr.it`), and a precomp layer (`ty: 0`) whose shapes live in `assets[].layers`.

Steps:
1. Write the tests for every case first (list + replace, and "input not mutated").
2. Try implementing with `lottie-colorify`; then with `@lottiefiles/lottie-js` if colorify fails cases. Use whichever passes all tests.
3. Only if neither covers all cases: write a small tree walker in `colors.ts` (allowed by the plan) — keep it focused on the cases above.
4. In the report, state which approach was chosen and which cases each library failed.

Done when: all case tests pass; global gate passes.

### Task 5: Telegram validation script (dev)

Files: `scripts/check.sh`, `scripts/README.md` (≤ 15 lines).

- `scripts/check.sh [files...]`: creates `.venv` with `python3 -m venv` if missing, installs `lottie==0.7.2` into it once, then runs python-lottie's TGS checker (find the installed entry point, e.g. `tgs_check.py`) on the given files, defaulting to `samples/*.tgs exports/*.tgs`.
- Prints one block per file: name, size KB, checker output; exits non-zero if any file has errors.
- `.venv/` and `exports/` are already in `.gitignore`.

Done when: running `bash scripts/check.sh` with a `.tgs` built from `minimal.json` (create it in a temp dir) prints a report; global gate passes.

### Task 6: Editor UI (integration)

Files: `src/App.tsx`, `src/ui/DropZone.tsx`, `src/ui/Palette.tsx`, `src/ui/Info.tsx`, `src/ui/ui.css`.

Behavior:
- **DropZone**: drag & drop or file input accepting `.tgs,.json` → `readTgs` → state `anim: Lottie`, plus `fileName`.
- **Preview**: `<Preview json={JSON.stringify(anim)} totalFrames={anim.op - anim.ip} />`.
- **Palette**: `listColors(anim)` as swatches with hex and count. Clicking a swatch opens `<input type="color">`; on `change` (commit, not every `input`), `anim = replaceColor(anim, from, to)` and push the previous `anim` onto an undo stack. Undo button.
- **Info**: w×h, fps, duration `(op - ip) / fr` s, and current export size `sizeKb(await writeTgs(anim))` shown as `N KB / 64`. Each of 512×512, 60 fps, ≤ 3 s, ≤ 64 KB shown green/red.
- **Export** button: `writeTgs(anim)` → download `<fileName>-edited.tgs`.
- Minimal clean layout: preview left, palette + info right. No UI library.

Done when: global gate passes; in the browser: load a sample, recolor one swatch, preview updates, undo works, export downloads a file that `bash scripts/check.sh <file>` accepts.

---

## Final acceptance (orchestrator + user)

- Final whole-branch review (most capable model).
- Orchestrator checks the app in a browser with files from `samples/`.
- User compares the preview with Telegram and sends an exported recolored sticker to Telegram (@Stickers or a chat).
