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
- **Do not reinvent**: rendering = `tlottie`; gzip = native `CompressionStream` / `DecompressionStream`; Telegram validation = python-lottie (dev script); UI = Tailwind CSS v4 + shadcn/ui (style Luma, Base UI primitives) + Fluid Functionalism registry components (fluid-hover, ColorPicker, …) with `framer-motion@^12` (added 2026-10-08, see "Design decisions"). Add a dependency not listed here only with a one-line justification in the report.
- Core logic in `src/core/` is pure TS with no DOM/React imports, so it can be tested in Node.
- Functions in `src/core/` never mutate their input; they return new objects.
- Every task ends with `npm run typecheck && npm test && npm run build` passing.
- Sample stickers live in `samples/*.tgs` (provided by the user). Tests that iterate samples must also run (and pass) when the folder is empty, using fixtures in `src/core/__fixtures__/`.

## Design decisions (user, 2026-10-08 — replace the original Task 6)

- D1 The design covers the whole app, including restyling the Preview controls/stage (Preview logic and props stay as in Task 3).
- D2 Layout like a macOS app: top toolbar · centre canvas 512×512 with playback controls · right inspector (Палитра, Проверки Telegram).
- D3 UI copy in Russian; technical units (KB, fps, 512×512) as is.
- D4 Light theme only; every colour is a CSS-variable token so a dark theme can be added later.
- D5 Empty state: centred card «Перетащите .tgs или .json» + button «Выбрать файл». After a file is loaded the whole window stays a drop target (overlay while dragging) and the toolbar has «Открыть». Loading a new file resets undo/redo history.
- D6 Recolor: click a swatch → popover with the Fluid `ColorPicker`, initialised to the swatch colour; live preview while picking (throttled ≤ 1 update / 150 ms, because tlottie remounts on every `data` change); one history step is committed when the popover closes or on Enter; Esc cancels and restores the preview.
- D7 History: Undo and Redo buttons in the toolbar plus ⌘Z / ⇧⌘Z (Ctrl+Z / Ctrl+Shift+Z on other OS).
- D8 Export is disabled while any Telegram check is red; a tooltip on the button lists the failing checks.
- D9 fluid-hover (`useFluidHover` + `FluidHoverHighlight`) on the palette swatch grid (axis `xy`) and on the toolbar group Открыть / Отменить / Повторить (axis `x`). Export is a separate accent button outside that group. Not used on the checks list or the preview controls.
- D10 Design system: Tailwind CSS v4 + shadcn/ui on Base UI primitives with the Luma style + Fluid Functionalism registry items (Base UI flavour). Install with the shadcn CLI, non-interactively.
- D11 Font: system stack `-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, sans-serif`; no web font.
- D12 Telegram checks: checklist rows (✓ / ✕ icon, name, «значение / лимит», e.g. «Размер файла — 23.9 KB / 64 KB»); when any row is red, a Banner «Экспорт недоступен» above the list.
- Desktop-first (≥ 1024 px wide); below that the inspector stacks under the canvas. Swatches and toolbar items are real buttons; keyboard focus moves the fluid highlight (`setActiveIndex`). An unreadable file shows an error Banner and keeps the current animation.

## Execution order

Task 1 → (Task 2, Task 3, Task 5 in any order) → Task 4 → Task 6a → (Task 6c, Task 6d in parallel) → Task 6e. Task 6b only needs Task 2 and may run any time before 6c/6d.

Suggested model tier (superpowers rules): Tasks 1, 2, 3, 5, 6b — cheap (Haiku). Task 4 (library evaluation) and Tasks 6a, 6c, 6d, 6e — standard (Sonnet) unless the orchestrator decides otherwise.

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

### Task 6a: Design-system foundation + Preview restyle

Files: `vite.config.ts`, `tsconfig.app.json`, `components.json`, `src/index.css`, `src/main.tsx`, `src/components/ui/*`, `src/hooks/*`, `src/lib/*` (generated by the shadcn CLI), `src/preview/Preview.tsx`; delete `src/preview/preview.css`. This is the only UI task that changes dependencies.

1. Tailwind CSS v4 via `@tailwindcss/vite` (plugin in `vite.config.ts`); `src/index.css` starts with `@import "tailwindcss"` and is imported in `src/main.tsx`.
2. Path alias `@/*` → `src/*`: `"paths"` in `tsconfig.app.json` (keep the existing `tlottie/react` mapping; TS 6 — no `baseUrl`) and `resolve.alias` in `vite.config.ts`.
3. vitest: in `vite.config.ts` add `test.exclude` = vitest's default excludes + `.claude/**`, so tests inside agent worktrees under `.claude/worktrees/` never run in this checkout's gate.
4. shadcn/ui init for Vite: Base UI primitives, style **Luma**, base colour neutral, CSS variables, `rsc: false`, `tsx: true`, aliases `@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks`. Use CLI flags / non-interactive mode; if the CLI cannot select Luma non-interactively, write `components.json` per the shadcn docs and apply the Luma theme tokens by hand. Never leave a CLI waiting on a prompt.
5. Fluid Functionalism items, Base UI flavour (`npx shadcn@latest add` with the `@fluid` registry or `https://www.fluidfunctionalism.com/r/...json` URLs): `tokens`, `springs`, `utils`, `use-fluid-hover` (hook + `FluidHoverHighlight`), `button`, `slider`, `tooltip`, `badge`, `banner`, `color-picker`; plus whatever popover primitive the colour picker needs (Fluid's own, else shadcn `popover`). Pin `framer-motion` to `^12` (the registry was built on 12; npm latest is 14).
6. Theme: light only (no `.dark` class is ever applied; generated dark tokens may stay unused). Font tokens use the system stack from D11; no web font package.
7. Generated code must pass TypeScript 6 strict and the build; minimal type fixes in generated files are allowed and listed in the report.
8. Restyle `Preview` (D1) with the new system, keeping its props, the tlottie wiring and all behaviour from Task 3: Play/Pause → Fluid `Button` (icon, `aria-label` «Воспроизвести» / «Пауза»); frame range → Fluid `Slider` (min 0, max `totalFrames - 1`, on change: pause, then seek — same semantics as before); label «кадр N / totalFrames»; error text in Russian; 512×512 stage with a CSS checkerboard, rounded corners and a hairline border. `preview.css` is deleted.
9. `src/App.tsx` keeps the temporary minimal.json preview, restyled (Task 6e replaces it).

Done when: global gate passes; `npm run dev` page shows the Luma-styled preview with working Play/Pause and slider and no console errors (report what you observed; if you cannot open a browser, say so).

### Task 6b: Telegram checks core

Files: `src/core/checks.ts`, `src/core/checks.test.ts`.

Interface (exact):

```ts
import type { Lottie } from './tgs';
export type CheckId = 'canvas' | 'fps' | 'duration' | 'size';
export interface Check { id: CheckId; label: string; value: string; limit: string; ok: boolean }
export function telegramChecks(anim: Lottie, exportBytes: number): Check[]; // always 4 checks, in the order above
```

Rules (labels and strings verbatim):
- canvas: label «Размер холста», value `${w}×${h}`, limit `512×512`, ok iff w === 512 && h === 512.
- fps: label «Частота кадров», value `${fr} fps`, limit `60 fps`, ok iff fr === 60.
- duration: label «Длительность», seconds = (op − ip) / fr, value = seconds with 1 decimal + ` с` (e.g. `3.0 с`), limit `3 с`, ok iff fr > 0 and (op − ip) ≤ 3 × fr. If fr ≤ 0 or not finite: value `—`, ok false.
- size: label «Размер файла», value = (exportBytes / 1024) rounded to 1 decimal + ` KB`, limit `64 KB`, ok iff exportBytes ≤ 64 × 1024.

Tests: each rule's pass and fail side including the boundaries (512/511, 60/30, 180 frames at 60 fps ok / 181 not, 65536 bytes ok / 65537 not, fr 0), the exact strings above, and that the input is not mutated.

Done when: tests pass; global gate passes.

### Task 6c: Palette

Files: `src/ui/Palette.tsx`.

Props (exact):

```ts
import type { Lottie } from '@/core/tgs';
interface PaletteProps {
  anim: Lottie;                               // the committed animation (never the preview)
  onPreview: (next: Lottie | null) => void;   // live preview while picking; null = clear preview
  onCommit: (next: Lottie) => void;           // one history step
}
export function Palette(props: PaletteProps): JSX.Element;
```

Behaviour:
- Title «Палитра». Swatches = `listColors(anim)` in that order, as a grid of real `<button>`s: colour square, hex (lowercase) and `×count` under it; `aria-label` «Цвет <hex>, <count> — изменить». Empty list → «В стикере нет цветов».
- fluid-hover on the grid: `useFluidHover(gridRef, { axis: 'xy' })` + `<FluidHoverHighlight>`; keyboard focus on a swatch calls `setActiveIndex(i)`.
- Click → popover anchored to the swatch with the Fluid `ColorPicker`, initialised to the swatch colour. While picking, at most every 150 ms call `onPreview(replaceColor(anim, from, current))` (always from `anim`, never compounding). Close (outside click) or Enter: if the colour changed → `onCommit(replaceColor(anim, from, picked))`; then `onPreview(null)`. Esc: `onPreview(null)`, no commit.
- If remounting the preview at that rate looks broken, fall back to calling `onPreview` only on pointer release and say so in the report.
- Uses only `listColors` / `replaceColor` from `src/core/colors.ts`; no colour logic of its own.

Done when: global gate passes. Optionally verify in the browser with an uncommitted local harness; Task 6e wires it into the app.

### Task 6d: Toolbar, history, drop zone, checks panel

Files: `src/ui/useHistory.ts`, `src/ui/useHistory.test.ts`, `src/ui/Toolbar.tsx`, `src/ui/DropZone.tsx`, `src/ui/Checks.tsx`.

Interfaces (exact):

```ts
// useHistory.ts
export interface HistoryState<T> { past: T[]; present: T | null; future: T[] }
export type HistoryAction<T> = { type: 'set'; value: T } | { type: 'reset'; value: T } | { type: 'undo' } | { type: 'redo' };
export function historyReducer<T>(state: HistoryState<T>, action: HistoryAction<T>): HistoryState<T>; // pure
export function useHistory<T>(): { present: T | null; set(v: T): void; reset(v: T): void; undo(): void; redo(): void; canUndo: boolean; canRedo: boolean };
export function useUndoShortcuts(h: { undo(): void; redo(): void; canUndo: boolean; canRedo: boolean }): void; // ⌘Z / ⇧⌘Z, Ctrl on other OS; ignored while focus is in an input, textarea or contenteditable

// Toolbar.tsx
interface ToolbarProps { fileName: string | null; canUndo: boolean; canRedo: boolean; onOpen(): void; onUndo(): void; onRedo(): void; exportBlockedReasons: string[]; onExport(): void }

// DropZone.tsx
export function useFilePicker(onFile: (file: File) => void): { open(): void; input: JSX.Element }; // hidden <input type="file" accept=".tgs,.json">
interface DropZoneProps { hasFile: boolean; onFile(file: File): void; error: string | null; children: React.ReactNode }

// Checks.tsx
interface ChecksProps { checks: Check[] }  // Check from '@/core/checks'
```

Behaviour:
- historyReducer: `set` pushes the current present onto past and clears future; `reset` clears past and future; `undo` / `redo` move one step and are no-ops at the ends. Unit tests cover all four actions, the no-op ends and that the input state is not mutated.
- Toolbar: left — file name (or «TGS Editor» when none); group Открыть / Отменить / Повторить as Fluid Buttons with fluid-hover axis `x` (disabled items skipped via `isItemDisabled`), titles «Отменить (⌘Z)» / «Повторить (⇧⌘Z)»; right — accent Fluid Button «Экспорт», hidden when no file, disabled when `exportBlockedReasons` is non-empty, with a Fluid Tooltip «Экспорт недоступен: <reasons joined by "; ">» (wrap the disabled button so the tooltip still triggers).
- DropZone: when `hasFile` is false, render a centred card «Перетащите .tgs или .json» with button «Выбрать файл» instead of `children`; always listen for drag events on the window and show an overlay «Отпустите, чтобы открыть» while a file is dragged (enter/leave depth counter); on drop pass the first file to `onFile`. `error` renders as an error Fluid Banner above the content.
- Checks: title «Проверки Telegram»; one row per check: ✓ (green) or ✕ (red) icon, label, `value / limit`; when any check fails, an error/warning Banner «Экспорт недоступен» above the rows.

Done when: tests pass; global gate passes.

### Task 6e: Editor integration

Files: `src/App.tsx`.

Behaviour:
- Layout per D2 (toolbar on top, canvas centre, inspector right with Palette then Checks; inspector stacks under the canvas below 1024 px).
- State: `useHistory<Lottie>()`, `fileName`, `error`, `previewAnim: Lottie | null`. `useUndoShortcuts` enabled.
- Open: `useFilePicker` + DropZone `onFile` → `readTgs(new Uint8Array(await file.arrayBuffer()))`; success → `reset(anim)`, `fileName`, clear error and preview; failure → error «Не удалось открыть файл: <message or "неизвестная ошибка">», keep the current animation.
- Preview: `<Preview json={JSON.stringify(previewAnim ?? present)} totalFrames={anim.op - anim.ip} />` (memoise the string).
- Palette: `anim={present}`, `onPreview={setPreviewAnim}`, `onCommit={set}`.
- Checks: whenever `present` changes, `writeTgs(present)` → `telegramChecks(present, bytes.length)` (ignore stale results); failing checks → toolbar `exportBlockedReasons` as «<label>: <value> (нужно <limit>)».
- Export: `writeTgs(present)` → Blob `application/gzip` → download `<fileName without .tgs/.json>-edited.tgs`.

Done when: global gate passes; in the browser: load a sample, recolor one swatch (live preview, one undo step), undo/redo via buttons and ⌘Z/⇧⌘Z, export downloads a file that `bash scripts/check.sh <file>` accepts; a 30 fps file disables Export with the tooltip.

---

## Final acceptance (orchestrator + user)

- Final whole-branch review (most capable model).
- Orchestrator checks the app in a browser with files from `samples/`.
- User compares the preview with Telegram and sends an exported recolored sticker to Telegram (@Stickers or a chat).

---

# Iteration 2 — Live preview + colour families

Spec: this section's "Context" and "Design decisions" (approved by the user on 2026-10-09; full Russian write-up in the approved plan).

## Context

1. Recolouring one colour at a time is tedious: stickers have 10–28 colours, but in practice they are 2–4 hue "families" (shades, highlights, gradients of one colour). Measured: Heart 10 colours → Красные (7) + Белые (3); Cool 20 → Жёлтые (8) + Голубые (11) + Белые (1); Animated 28 → Оранжевые (9) + Белые (3) + Серые (15) + Чёрные (1).
2. The preview restarts on every edit: `LottiePlayer` from `tlottie/react` remounts whenever `data` changes.

Goal: recolour by family (one action per family, shades move together) while the preview keeps playing from the current frame and shows changes instantly.

User decisions: scope is only live preview + families; palette = family cards that expand into individual shades; NO "apply brand" automation; NO global hue/saturation/lightness sliders. Later iterations (not now): elements panel (hide/delete, click-to-select), logo/text (SVG → Lottie shapes, parenting, animation presets), templates with a manifest.

Verified facts (Node, real wasm, samples): `node_modules/tlottie/dist/core/tlottie.wasm` instantiates with empty imports; its raw ABI is described in `node_modules/tlottie/dist/core/core/wasm.d.ts`. tlottie_new ≈ 1.6–1.9 ms, render 512² ≈ 1.4 ms, 1024² ≈ 4.7 ms; one main-thread preview update ≈ 8.4 ms; memory flat (~48 MB) after 600 rebuilds. Fractional frames are accepted; out-of-range frames clamp. The engine reports frame count 1 for the static `minimal.json`. `hd: true` is respected.

## Extra global constraints (in addition to the Global Constraints above)

- `src/player/{engine,clock,player}.ts` follow the `src/core` rules: no DOM/React at runtime, testable in Node. Only `player.worker.ts` and `Preview.tsx` touch Worker, OffscreenCanvas, ImageData or fetch.
- Engine tests read `node_modules/tlottie/dist/core/tlottie.wasm` with `fs`. Keep `tlottie@0.1.24` pinned — it is the wasm source.
- No new dependencies (OKLCH maths is ~60 lines).

## Design decisions (user-approved 2026-10-09)

- D13 Own player: the preview runs its own player on tlottie's wasm in a module Web Worker with an OffscreenCanvas. Edits, undo/redo and live previews swap the animation in place — same frame, same play state, no blank frame. Opening a file restarts at frame 0 (Preview remounts via `key`). Backing store 512 × min(2, devicePixelRatio). Live preview updates at most once per animation frame. Replaces D6's 150 ms throttle and Task 3's remount rule.
- D14 Families: computed once per opened file and fixed until the next file. Identity is by colour site (walk-order ordinal), not by hex, so recoloured families never merge. Chromatic families first (most sites first), then Белые, Серые, Чёрные; Russian names from the key colour's hue. Whole-family recolour: chromatic families rotate hue, scale chroma and map lightness piecewise; neutral families are tinted.
- D15 Palette: one card per family — key swatch (opens the picker, recolours the whole family), name, shade strip, and a «Оттенки · N» toggle when N > 1 that reveals today's swatch grid; an edit there changes only that shade within that family. fluid-hover (axis `xy`) only on the shade grid. One history step per commit.

## Execution order (Iteration 2)

7a, 7b, 8a, 8b independent. Player: 7c after 7a + 7b → 7d → 7e. Families: 8c after 8a + 8b. 8d after 8c and 7d (both edit `App.tsx`; 8d's browser check needs the new player). Executed sequentially by one controller.

### Task 7a: tlottie wasm wrapper
Files: `src/player/engine.ts`, `src/player/engine.test.ts`.

```ts
export interface Animation {
  readonly frameCount: number // Math.max(1, tlottie_frame_count)
  readonly frameRate: number  // tlottie_frame_rate
  /** Straight-alpha RGBA (w*h*4), a view into wasm memory valid until the next engine call. null after drop() or on engine failure. */
  render(frame: number, width: number, height: number): Uint8ClampedArray<ArrayBuffer> | null
  drop(): void // idempotent
}
export interface Engine { create(json: string): Animation | null } // null: empty / alloc failure / tlottie rejected the JSON
export async function loadEngine(wasm: BufferSource): Promise<Engine>
```

- **loadEngine.** Calls `WebAssembly.instantiate(wasm, {})`, then checks that these exports exist: `memory`, `tlottie_alloc`, `tlottie_free`, `tlottie_new`, `tlottie_drop`, `tlottie_frame_rate`, `tlottie_frame_count`, `tlottie_render`. If one is missing it throws `` `tlottie.wasm: нет экспорта ${name}` ``. This is the ABI guard.
- **create.**
  - Encode the JSON as UTF-8; length 0 → null.
  - `tlottie_alloc`; 0 → null.
  - Copy through a fresh `new Uint8Array(memory.buffer, ptr, len)`. Never cache views: memory growth detaches them.
  - Call `tlottie_new`, then always `tlottie_free`. A result of 0 → null.
- **render.** Calls `tlottie_render(inst, frame, w, h, 1)`, byte-identical to tlottie's default quality. Fractional frames are passed as is. A pointer of 0 → null.
- **drop.** Calls `tlottie_drop` once and zeroes the handle.

Tests:
- `colors.json`:
  - frameCount 60 and frameRate 60.
  - `render(0,64,64)` has length 16384, and pixel (32,32) is `[255,0,0,255]`.
- After `replaceColor(colors,'#ff0000','#0000ff')`, `render(30,64,64)` at (32,32) is `[0,0,255,255]`.
- `minimal.json` at (1,1) has alpha 0.
- `create('')`, `create('{not json')` and `create('{}')` → null.
- Calling `drop()` twice doesn't throw; `render` after `drop` → null.
- A wasm without exports (`[0,0x61,0x73,0x6d,1,0,0,0]`) rejects with «нет экспорта».
- For every `samples/*.tgs` (or `colors.json` as fallback): frameCount === op − ip, and `render(0,64,64)` is not null.
- Never use `minimal.json` for frame counts: it is static and reports 1.

### Task 7b: Playback clock
Files: `src/player/clock.ts`, `src/player/clock.test.ts`.

```ts
export class PlaybackClock {
  get frame(): number      // fractional; 0 until retime() gives a frame count
  get playing(): boolean   // true from construction (stickers autoplay)
  retime(frameCount: number, frameRate: number): void // clamps frame to [0, frameCount-1] (0 if ≤ 0); keeps playing and anchor
  play(): void             // playing = true; drops the anchor
  pause(): void
  seek(frame: number): void // clamp as retime; drops the anchor; playing unchanged
  tick(nowMs: number): boolean // true iff frame changed. Not playing / frameCount ≤ 0 / frameRate ≤ 0 → false.
                               // No anchor → anchor = now, false. Else dt = min(now − anchor, 100); anchor = now;
                               // frame = (frame + dt·frameRate/1000) mod frameCount; return dt > 0
}
```

Tests:
- A new clock: frame 0, playing; `tick` → false before `retime`.
- After `retime(180,60)`: `tick(1000)` → false (anchor only); `tick(1100)` → frame 6; `tick(1150)` → 9; `tick(6000)` → 15 (dt clamped to 100 ms).
- Wrap: `seek(179)`, `tick(t)`, `tick(t+50)` → frame 2.
- `pause()`: `tick` → false and the frame is kept. After `play()`, `tick(t+5000)` only sets the anchor with no jump; the next +100 ms → +6 frames.
- `seek(-5)` → 0, `seek(500)` → 179, `seek(12.5)` → 12.5; `seek` doesn't change `playing`.
- From 42.5: `retime(180,60)` keeps 42.5, `retime(30,60)` → 29, `retime(0,60)` → 0 and `tick` → false.

### Task 7c: Preview player controller
Files: `src/player/player.ts`, `src/player/player.test.ts`. Depends on 7a and 7b.

```ts
import type { Engine } from './engine'
export type Blit = (rgba: Uint8ClampedArray<ArrayBuffer>, width: number, height: number) => void
export interface PlayerState { playing: boolean; frame: number /* Math.floor(clock.frame) */; error: string | null }
export type ToWorker =
  | { type: 'init'; canvas: OffscreenCanvas; size: number }
  | { type: 'load'; json: string }
  | { type: 'play'; seq: number } | { type: 'pause'; seq: number }
  | { type: 'seek'; seq: number; frame: number }
  | { type: 'resize'; size: number }
export interface FromWorker extends PlayerState { type: 'state'; seq: number }
export class PreviewPlayer {
  constructor(engine: Engine, blit: Blit, size: number)
  load(json: string): void      // stored as pending; only the latest pending JSON is ever built
  play(): void
  pause(): void
  seek(frame: number): void     // pause + clock.seek + redraw on next step
  resize(size: number): void    // redraw on next step
  step(nowMs: number): boolean  // one display frame; true = schedule another (playing && an animation exists)
  get state(): PlayerState
  destroy(): void               // drops the animation; later calls are no-ops
}
```

What `step` does, in order:
1. If a JSON is pending, call `engine.create` on it.
   - Success: drop the old animation, call `clock.retime(frameCount, frameRate)` (frame and play state are kept), set `error = null`, and mark a redraw.
   - Failure: set `error = 'движок не принял анимацию'` and keep the old animation.
2. If `clock.tick(now)` returns true, mark a redraw.
3. If a redraw is marked and an animation exists, call `render(clock.frame, size, size)` and pass the result to `blit`. If render returns null, set `error = 'не удалось отрисовать кадр'`.

Tests run on the real engine with `colors.json`, a fake `blit` that records the size and centre pixel, and a wrapper that counts `create` calls:
- Before any load: state `{playing:true, frame:0, error:null}`; `step` → false with no blit.
- `load(red)` + `step(1000)`: one blit at size×size and `true`. `step(1100)` → frame 6.
- **Swap keeps the frame:** `load(blue)` + `step(1150)` → frame 9 (not 0) and a blue pixel.
- **Coalescing:** `load(a)`, `load(b)`, `step` → `create` called once, pixel from b.
- **Bad JSON after a good one:** error set, the frame keeps advancing, the old image is still blitted. The next good load clears the error.
- **Bad first load:** error set, no blit, `step` → false.
- `seek(30.5)`: `playing` false; the next `step` blits once with frame 30, later steps neither blit nor return true. `play()`: anchor, then +100 ms → frame 36.
- `resize(64)`: the next `step` blits 64×64 even while paused.
- After `destroy()`: no blits.

### Task 7d: Worker + Preview on the new player
Files: `src/player/player.worker.ts`, `src/preview/Preview.tsx`, `src/App.tsx`. Depends on 7c.

**Worker** (glue only):
- Imports `import wasmUrl from '../../node_modules/tlottie/dist/core/tlottie.wasm?url'`. The relative path bypasses tlottie's `exports` map; the `*?url` types come from `vite/client`.
- Uses `addEventListener('message', …)` and `postMessage` from the DOM lib; don't add the WebWorker lib.
- Uses `raf` if the worker has it, else `setTimeout(…, 16)`.
- **`init`:**
  - `getContext('2d')`, otherwise the error «нет 2D-контекста OffscreenCanvas».
  - Fetch the wasm (a non-ok response throws), then `loadEngine`, then `new PreviewPlayer`, then replay the messages queued while the engine was loading.
  - On failure, post state with error `не удалось загрузить движок: …`.
- **`blit`:** resize the canvas if needed, then `putImageData(new ImageData(rgba, w, h), 0, 0)`.
- **Other messages:** go to the player (or the queue), remember the last `seq`, set `force = true`, then `schedule()`.
- **Loop:** `again = player.step(now)`. Post `{type:'state', seq, ...state}` if `force` is set or ≥ 100 ms have passed since the last post. If `again`, schedule the next frame.

**Preview** (same props and UI: Play/Pause, slider, «кадр N / total», «Ошибка предпросмотра: …»):
- Remove the `tlottie/react` import and its CSS. The stage `div` (checkerboard, 512 px, ring) gets a ref and has no React children.
- **Mount effect (`[]`):**
  - No `transferControlToOffscreen` → error «браузер не поддерживает OffscreenCanvas».
  - Otherwise create a **new `<canvas class="block size-full">` imperatively** and append it to the stage. This is what makes the StrictMode double effect safe.
  - `new Worker(new URL('../player/player.worker.ts', import.meta.url), { type: 'module' })`.
  - `init` with `size = round(512 × min(2, devicePixelRatio || 1))`, transferring the canvas.
  - Watch `matchMedia('(resolution: <dpr>dppx)')` → `resize`, then re-subscribe.
  - `worker.onerror` → «сбой потока предпросмотра».
  - Cleanup: unsubscribe, `terminate()`, remove the canvas, set `sentJson = null`.
- **Effect on `[json]`** (declared after the mount effect): if `json !== sentJson.current`, send `load` and remember it. After a StrictMode re-mount it always sends again.
- **Controls:** `++seqRef` before every `play`, `pause` and `seek`.
  - Toggle: updates `playing` optimistically.
  - Slider: sets `frame` locally, sets `playing = false`, sends `seek`.
  - `onmessage` applies `state` only when `m.seq === seqRef.current`, so stale echoes cause no flicker.

**App:** `fileSeq` state, incremented on every successful load; `<Preview key={fileSeq} …/>`.

Done when:
- The gate passes, and `npm run build` emits a worker chunk and a `*.wasm` file in `dist/assets`.
- In the dev server (`tgs-dev`) with the current palette:
  - A sample plays; Play/Pause, the slider and the label work.
  - Recolour, undo and redo change the colours while the frame counter keeps going.
  - A new file starts from 0.
  - There are no console errors, including "already transferred" after a reload.
- If the relative `?url` import doesn't resolve, the fallback is to import the URL in Preview and pass it in `init`.

### Task 7e: Remove LottiePlayer leftovers
Files: `vite.config.ts`, `tsconfig.app.json`.
- Delete `optimizeDeps.exclude: ['tlottie']` and drop "tlottie glue" from the `chunkSizeWarningLimit` comment.
- Delete the `"tlottie/react"` entry and its comment from `paths`, keeping `@/*`.

Done when: `grep -rn "tlottie/react" src vite.config.ts tsconfig.app.json` finds nothing, the gate passes, and in dev the preview plays and the wasm request returns 200.

### Task 8a: Colour sites
Files: `src/core/colors.ts`, `src/core/colors.test.ts`.

```ts
export interface ColorSite {
  index: number            // walk-order ordinal, 0-based; stable while structure is unchanged
  hex: string              // '#rrggbb' lowercase, alpha ignored
  gradient: number | null  // walk-order ordinal of the gf/gs shape the stop belongs to; null for fl/st
}
export function readColorSites(anim: Lottie): ColorSite[]
export function mapColorSites(anim: Lottie, fn: (site: ColorSite) => string | null): Lottie
```

- Rename the internal visitor type to `Visit` and give it a third argument, `gradient`.
- The gradient counter increases for every `gf`/`gs` with a numeric `g.p`.
- `mapColorSites` works on a `structuredClone` and walks in the same order.
  - If `fn` returns `null` **or the current hex**, the site is left alone and keeps its original float values.
  - Otherwise the hex is normalised (a malformed one throws) and only r, g, b are written.
- `listColors` and `replaceColor` behave as before, and their tests stay unchanged.

Tests:
- `readColorSites(colors.json)` returns exactly 13 sites:
  - indices 0–9, `gradient: null`: `#3366cc, #00ff00, #ff0000, #00ff00, #0000ff, #ffff00, #ffff00, #ff00ff, #008080, #0000ff`
  - indices 10–12, `gradient: 0`: `#ff8000, #00ffff, #ff0000`
- The hex counts from `readColorSites` match `listColors`.
- `mapColorSites(·, () => null)` returns a new object equal to the input, and the input is not mutated.
- Changing only index 12 changes only that gradient stop; index 2 (`#ff0000`) keeps its colour.
- A fill of `[0.996,0,0,1]` keeps 0.996 when `fn` returns `'#fe0000'`.
- `'#ABCDEF'` is accepted; `'red'` and `'#12345'` throw.
- A `gf` followed by a `gs` get gradients 0 and 1.
- Samples (or the fixture as fallback):
  - The number of sites equals the sum of `listColors` counts.
  - A `null` map returns an equal copy.
  - After recolouring every other site, the length and `gradient` values are unchanged.

### Task 8b: OKLCH helpers
Files: `src/core/oklch.ts`, `src/core/oklch.test.ts`.

```ts
export interface Oklch { l: number; c: number; h: number } // l 0..1, c ≥ 0, h degrees [0, 360)
export function hexToOklch(hex: string): Oklch     // any case; throws on malformed
export function oklchToHex(color: Oklch): string   // l clamped [0,1], c<0 → 0; out of sRGB gamut → chroma reduced (binary search, same l,h); lowercase
export function maxChroma(l: number, h: number): number // largest in-gamut chroma at (l,h), ±1e-4
```

Use Ottosson's OKLab matrices and the sRGB transfer function. A colour is in gamut when every linear channel is in [−1e-6, 1+1e-6].

Tests:
- Reference values (±0.001 for l and c, ±0.2° for h):
  - `#ff0000` → (0.628, 0.258, 29.2)
  - `#0000ff` → (0.452, 0.313, 264.1)
  - `#00ff00` → (0.866, 0.295, 142.5)
  - `#ffff00` → (0.968, 0.211, 109.8)
- `#ffffff` → l 1, c < 1e-4; `#000000` → l 0, c 0.
- Every colour on a step-15 grid round-trips exactly.
- `{l:0.7, c:0.4, h:264}` → a valid hex within l ±0.01 and h ±2°.
- `maxChroma(0.628, 29.23)` ≈ 0.258 (±0.002); `maxChroma(1,100)` and `maxChroma(0,100)` are < 0.005.
- l = 1.2 → `#ffffff`; l = −0.1 → `#000000`.

### Task 8c: Colour families
Files: `src/core/families.ts`, `src/core/families.test.ts`. Depends on 8a and 8b.

```ts
export interface ColorFamily { id: number; name: string; neutral: boolean; sites: number[] /* asc */; keySite: number }
export interface FamilyView { key: string; shades: { hex: string; count: number }[] } // shades by OKLCH l asc, then hex
export function findFamilies(anim: Lottie): ColorFamily[]
export function viewFamily(sites: ColorSite[], family: ColorFamily): FamilyView // sites = readColorSites(current anim)
export function recolorFamily(anim: Lottie, family: ColorFamily, target: string): Lottie
export function recolorShade(anim: Lottie, family: ColorFamily, from: string, to: string): Lottie // only family sites with hex === from
```

`findFamilies`:
1. Take the unique hexes from `readColorSites`, each with its count, first index and OKLCH value.
2. A colour is neutral if `c < 0.01 || c < 0.25 · maxChroma(l, h)`. Relative chroma reliably separates the greys (≤ 0.153) from the grey-blues (≥ 0.346).
3. Cluster the chromatic colours: sort by (h, hex), start right after the largest circular gap, and join neighbours whose gap is ≤ **40°**.
4. For every gradient, merge the clusters of its **chromatic** stops; neutral stops are ignored. Otherwise white chains every family in Cool into one.
5. Group the neutral colours by l: ≥ 0.9 Белые, ≤ 0.25 Чёрные, the rest Серые.
6. For each family:
   - `sites` are all indices whose hex belongs to the group.
   - The key is the colour with the highest count, then the highest c, then the smallest hex.
   - `keySite` is the key's first index.
7. Name chromatic families by the key's hue: [0,45) Красные, [45,80) Оранжевые, [80,125) Жёлтые, [125,180) Зелёные, [180,250) Голубые, [250,290) Синие, [290,325) Фиолетовые, [325,360) Розовые.
8. Order chromatic families by `sites.length` descending, then key hue ascending, then Белые, Серые, Чёрные. Repeated names get « 2», « 3». `id` is the position in the list.

`recolorFamily`:
- `k` is the OKLCH of the current hex at `keySite`; `t` is the OKLCH of the target.
- Tint mode applies if `family.neutral || k.c < 0.01`.
- For each distinct hex in the family:
  - The key hex maps to `target` exactly.
  - Lightness: `l' = l ≤ k.l ? (k.l > 0 ? l·t.l/k.l : t.l) : (k.l < 1 ? t.l + (l−k.l)(1−t.l)/(1−k.l) : t.l)`.
  - Tint mode: `c' = t.c, h' = t.h`. Otherwise: `c' = c·t.c/k.c, h' = (h + t.h − k.h) mod 360`.
  - Convert with `oklchToHex`.
- All writes happen in a single `mapColorSites` pass over the family's sites.

Tests (helpers build animations from `minimal.json` with `fl`/`gf`):
- Fixture families: Красные `[2,8,10,11,12]` (key 2), Зелёные `[1,3,5,6]` (key 1), Синие `[0,4,9]` (key 4), Розовые `[7]` (key 7). All are chromatic.
- `#ffffff #fffffb #f4f4f4 #847375 #3e3531 #000000 #c7d6e4` → Голубые [#c7d6e4], Белые [3], Серые [#847375, #3e3531], Чёрные [#000000].
- `#ff0000` + `#ff8000` → 1 family. `#ffff00` + `#0000ff` → 2 families.
- Gradient `[#ff0000, #ffff00]` → 1 family, Красные. Gradient `[#ff0000, #ffffff]` plus a separate `#ffffff` → Красные and Белые (white is not pulled in).
- `#9b0016 ×2, #ff2f00 ×2, #cd0a14` → key `#ff2f00`, keySite 2.
- `#00ffff` + `#5f7b93` → «Голубые» and «Голубые 2».
- Partition: on the fixture and on the samples, every index is in exactly one family.
- Samples (when present), counts are shades:
  - Heart: Красные 7, Белые 3.
  - Cool: Жёлтые 8, Голубые 11, Белые 1.
  - Animated: Оранжевые 9, Белые 3, Серые 15, Чёрные 1.
- `viewFamily` on fixture Красные: key `#ff0000`; shades `#008080(1) #ff0000(2) #ff8000(1) #00ffff(1)`.
- `recolorFamily`:
  - With targets `#2266ff #8a2be2 #808080 #000000 #ffffff #00ff00`: `keySite` equals the target and sites outside the family are unchanged.
  - Chromatic families keep their lightness order (tolerance 0.01).
  - Recolouring to its own key changes nothing.
  - Белые `[#ffffff, #f4f4f4]` → `#ffd1dc`: white becomes exactly `#ffd1dc`; `#f4f4f4` gets a hue within ±5° of the target and lower l.
  - A grey family: every result with c > 0.02 has a hue within ±5° of the target.
  - The input is not mutated.
- `recolorShade(fixture, Зелёные, '#00ff00', '#ff0000')`, then `recolorShade(result, Красные, '#ff0000', '#000000')`: sites 2 and 12 become black, while sites 1 and 3 stay `#ff0000`.

### Task 8d: Palette family cards
Files: `src/ui/Palette.tsx`, `src/App.tsx`. Depends on 8c and 7d.

```ts
interface PaletteProps {
  anim: Lottie; families: ColorFamily[]
  onPreview: (next: Lottie | null) => void; onCommit: (next: Lottie) => void
}
```

**Data:**
- `sites = useMemo(() => readColorSites(anim), [anim])`
- `views = families.map(f => viewFamily(sites, f))`

**Layout:**
- Title «Палитра». With no families, show «В стикере нет цветов».
- One `li` per family:
  - **Key swatch** (`PopoverTrigger`, `size-10`, filled with `view.key`), aria-label `«${name}»: ${key} — изменить всё семейство`.
  - **Name**, with an `aria-hidden` strip of shades under it (equal segments, dark to light).
  - **Toggle** «Оттенки · N» with a chevron: a ghost compact Fluid Button with `aria-expanded`/`aria-controls`. Shown only when N > 1; collapsed by default; its state is local to the card.
- **Expanded:** a `ShadeGrid` with its own `useFluidHover(gridRef, { axis: 'xy', gapClick: false })` and `FluidHoverHighlight`.
  - Swatches look like today's (hex, ×count), with `data-family` and `data-hex`.
  - aria-label `Оттенок ${hex}, ${count} — изменить`.

**Editing session:**
- At most one session at a time: `{ family, shade: string | null, from, picked }`. `shade` is null for the key swatch.
- Popover, picker, Enter, Esc and outside-click semantics are copied from the current code.
- `apply` is `shade === null ? recolorFamily(anim, fam, picked) : recolorShade(anim, fam, from, picked)`, always applied to the committed `anim`.
- **Live preview:** at most one pending `requestAnimationFrame`, which calls `onPreview(picked === from ? null : apply(...))`.
  - `PREVIEW_THROTTLE_MS` and the `setTimeout` are removed.
  - Cancel the rAF on finish and on unmount.
- **Commit** only if `picked !== from`, then `onPreview(null)`.
- **`anim` change** while the popover is open cancels the session, as now.
- **Focus:** after an Enter commit of a shade, focus `[data-family=…][data-hex=<picked>]`.
- Palette does no colour maths of its own.

**App:**
- `families` state. On a successful load, `setFamilies(findFamilies(anim))`.
- `<Palette key={fileSeq} anim={present} families={families} … />`.

Done when: the gate passes and end-to-end steps 1–7 pass in the browser.

---

## Final acceptance (Iteration 2)

Orchestrator, dev server `tgs-dev` (port 5173):
1. Each sample shows the families listed in Context; no console errors; wasm request 200.
2. While playing, drag the first family's key picker ~3 s while sampling «кадр N» every 50 ms: N only decreases at loop wraps (≥ 170 → ≤ 10); screenshots show live colour changes, no blank/flashing frames.
3. Pause → seek 90 → recolour: label stays 90, still frame shows new colours.
4. Esc restores committed colours; Enter = one history step; Undo/Redo (buttons, ⌘Z/⇧⌘Z) work without interrupting playback.
5. Expand «Оттенки», edit one shade: only it changes; Undo works.
6. Heart: recolour Белые to pink — whites turn pink, reds unchanged.
7. Open another file: preview from frame 0, cards collapsed, history empty; canvas stays sharp at browser zoom.
8. Export a recoloured sticker → `bash scripts/check.sh <file>` passes, < 64 KB; re-opening rebuilds families from the new colours.
9. `npm run build` + `npx vite preview`: plays, wasm and worker load from `dist/assets`.
10. User: compare with Telegram, send an exported sticker.

---

# Iteration 3 — Sticker parts + editable inscription

Spec: this section's "Context" and "Design decisions" (approved by the user on 2026-10-14; full Russian write-up in the approved plan `~/.claude/plans/indexed-knitting-fox.md`).

## Context

Family editing (Iteration 2) works on any file but edits abstract hues, not what a person sees. The user wants the system to know a sticker's real parts and edit those: Eye — iris, pupil, sclera and lids separately; Heart — its main colour; Cool — the box, its effects and the **inscription text**. Family/shade editing stays but moves below.

Verified facts (samples):
- Layer names are arbitrary («Group 8», «Слой 9»), so parts need hand-written knowledge.
- Cool's letters are shapes, not text (text layers are forbidden). Container `COOL › 1 › Group 1 › Group 1` holds letter groups `4,3,2,1` (= L,O,O,C, reverse reading order; the first item of `it` draws on top) plus its `tr`. Each letter group = [face `gr` (white `fl`), shadow `gr` (`fl` #5f7b93, drawn under the face, 3 px higher at kf 0), `tr`]. Letter `tr`: `p = a` (letter centre), scale pop keyframes 100 → 140 → 100 at start+0/+12/+23 with easing `i {x:[.5,.5],y:[1,1]}`, `o {x:[.333,.333],y:[0,0]}` then `i/o .833/1`; starts 124/130/136/142. Face/shadow `sh` paths have 9 keyframes at t = [0,26,39,44,65,80,83,84,123] with `{i,o,t,s}` (last one `s` only); shadow vertices correspond 1:1 to face vertices. Keyframes 0 and 8 face the viewer.
- **For every keyframe k one 2D homography maps all face vertices + absolute handles at kf 0 (container coordinates) onto kf k with max error ≤ 0.11 px; likewise face kf 0 → shadow kf k.** Affine fails (up to 38 px). New text is laid out flat at kf 0 and animated by applying the fitted homographies.
- Cap box of the original letters at kf 0 (container coordinates, from L): x 78.35…433.65, y 198.78…313.22. op = 180.
- Original letters ≈ 6.3 KB gzipped; whole Cool 24.4 KB gzipped; limit 64 KB.
- The walk visits `assets` before `layers`; `comp_0` is walked once, so recolouring it changes every instance.
- `recolorFamily` only reads `sites`, `keySite`, `neutral`, so a part can be recoloured by it.
- `samples/` is untracked: core tests use synthetic fixtures; sample tests skip when files are absent.

## Extra global constraints (Iteration 3)

- `src/core/{parts,glyphs,homography,text}.ts` and `src/core/profiles/*` follow the `src/core` rules (pure TS, no DOM/React, never mutate inputs, testable in Node).
- New dependencies: devDependencies `opentype.js` and `@fontsource/roboto` (Roboto 900, OFL-1.1), used **only** by `scripts/build-glyphs.mjs`; the app bundle never imports them. Nothing else unless the controller rules so.
- Tests that need `samples/*.tgs` skip (not fail) when the file is absent.
- UI copy in Russian.

## Design decisions (user-approved 2026-10-14)

- D16 Sticker profiles in code. A profile names parts and selects them by layer/group names. A file matches a profile when its root `nm` equals the profile's, every selector finds ≥ 1 node, every part has ≥ 1 colour site, the key site lies inside its part, and parts don't overlap. Unknown stickers show only the palette, as today. (AI-written profiles: later, not now.)
- D17 Parts: Eye — Радужка, Зрачок, Белок, Веки (glints stay in the palette). Heart — Сердце. Cool — Коробка (incl. letter shadows), Надпись, Огонь, Искры, Блики.
- D18 Inscription (amends D14): any Cyrillic + Latin text, 1–6 characters after normalisation (upper-cased, trimmed, inner whitespace runs → one space), at least one non-space. Letters come from bundled Roboto 900 glyph data and replay the original letters' animation (box turn via homographies, staggered pops 6 frames apart). A text edit changes the site count, so palette families are **carried over** through a site-origin map, never recomputed; history stores `{ anim, families }`.
- D19 Inspector order: Части → Палитра → Проверки Telegram. The palette itself is unchanged.
- D20 One colour-editing session for the whole inspector (shared hook used by Palette and Parts).

## Execution order (Iteration 3)

9a, 9b, 9d are independent. 9c after 9b. 9e after 9c + 9d. 9f after 9a + 9c. 9g after 9e + 9f. Executed sequentially by one controller: 9a → 9b → 9d → 9c → 9e → 9f → 9g.

### Task 9a: Shared colour session
Files: `src/ui/colorSession.tsx` (new), `src/ui/Palette.tsx`, `src/App.tsx`.

Move the editing-session machinery out of `Palette.tsx` **without behaviour change**: the session ref, the single pending rAF live preview, `pick`, `finish(commit, viaKeyboard)`, open/close handling (opening another target commits the current one; Esc cancels; outside click / second click / focus leaving commit), cancelling the session when `anim` changes, cleanup on unmount, `OWN_ENTER_SELECTOR` + the popup Enter handler, and `PickerPopup`.

```ts
export interface ColorTarget {
  id: string                                         // 'family:<id>' | 'shade:<id>:<hex>' | 'part:<id>'
  from: string                                       // colour the picker starts from
  apply(committed: Lottie, picked: string): Lottie   // always applied to the committed animation
  refocus?(picked: string): string[]                 // selectors tried in order inside rootRef after an Enter commit
}
export interface ColorSession {
  openId: string | null
  onOpenChange(target: ColorTarget, open: boolean, reason: string): void
  onPick(hex: string): void
  onPopupKeyDown(event: KeyboardEvent<HTMLElement>): void
}
export function useColorSession(options: {
  anim: Lottie | null
  onPreview(next: Lottie | null): void
  onCommit(next: Lottie): void
  rootRef: RefObject<HTMLElement | null>
}): ColorSession
export function PickerPopup(props: { from: string; session: ColorSession }): JSX.Element
```

- `App` owns the hook (one call, unconditional), `rootRef` = the inspector `<aside>`, and passes `session` to `Palette`. `Palette` props become `{ anim, families, session }` (no `onPreview`/`onCommit`).
- Palette targets: key swatch `family:${id}` → `recolorFamily`; shade swatch `shade:${id}:${hex}` → `recolorShade(committed, family, hex, picked)` with `refocus: p => [\`[data-family="${id}"][data-hex="${p}"]\`, \`[data-family-key="${id}"]\`]`.
- Focus after an Enter commit: the old `focusShade` becomes "pending refocus selectors", consumed by an effect on `[anim]` one rAF late, exactly as today.
- Return a memoised session object.

Done when: gate passes; in the browser (Heart, Eye) family key live preview while dragging, Esc restores, Enter = one history step, Enter on a shade keeps keyboard focus on the shade with the new colour, Undo/Redo work, no console errors.

### Task 9b: Sites inside nodes
Files: `src/core/colors.ts`, `src/core/colors.test.ts`.

```ts
// Indices (ascending = readColorSites walk order) of the colour sites lying inside one of
// `nodes`, matched by object identity (a layer, a shape group, an asset, the root …).
export function sitesWithin(anim: Lottie, nodes: ReadonlySet<object>): number[]
```
- Reuse the internal `walk`: track an "inside" depth by node identity while descending. `readColorSites`, `mapColorSites`, `listColors`, `replaceColor` behave exactly as before (their tests stay unchanged).

Tests (on `colors.json`, expected index lists written out explicitly after reading the fixture):
- empty set → `[]`; `{ anim }` → `0..12`.
- the precomp asset's layer → exactly that asset's sites; a nested `gr` → only its sites; the outer group of a nested group includes the inner group's sites.
- a node and its descendant together → no duplicates.
- a fixture variant with two precomp layers referencing one asset: the asset's sites appear once.

Done when: tests pass; gate passes.

### Task 9c: Parts and profiles
Files: `src/core/parts.ts`, `src/core/parts.test.ts`, `src/core/profiles/eye.ts`, `src/core/profiles/heart.ts`, `src/core/profiles/cool.ts`, `src/core/profiles/index.ts`, `src/core/families.ts`, `src/core/__fixtures__/parts.json`.

```ts
export interface Selector {
  asset?: string    // id of an `assets[]` entry: search its layers; absent = root `layers`
  layer: string     // layer `nm`; '*' = any layer; 'Ding_*' (trailing *) = name prefix
  path?: string[]   // groups inside the layer's `shapes`, outermost first: a name (all `gr` with that nm),
                    // '*' (every `gr`), '#n' (the n-th `gr` item, 0-based, counting `gr` items only)
}
export interface TextSpec {
  container: Selector                                   // the group whose `gr` items are the letter groups
  original: string                                      // text of the original letters, reading order
  box: { x0: number; y0: number; x1: number; y1: number } // cap box of the original letters at path kf 0, container coords
  pop: { first: number; step: number }                  // first letter's pop start frame; frames between starts
  maxLength: number
  motion: { face: Mat3[]; shadow: Mat3[] }              // per path keyframe: face kf0 → face kf k / → shadow kf k (measured once from the original letters; see final-review fix)
}
export interface PartSpec { id: string; name: string; select: Selector[]; key: { select: Selector; nth?: number }; text?: TextSpec }
export interface StickerProfile { id: string; match: { nm: string }; parts: PartSpec[] }
export interface Part { id: string; name: string; sites: number[]; keySite: number; neutral: boolean; text: TextSpec | null }

export function resolveSelector(anim: Lottie, selector: Selector): object[]   // matched layers (no path) or groups
export function resolveParts(anim: Lottie, profile: StickerProfile): Part[] | null
export function matchProfile(anim: Lottie): { profile: StickerProfile; parts: Part[] } | null // first PROFILES entry that resolves
```
- `Part.sites` = `sitesWithin` of the union of its selectors' nodes. `keySite` = the `nth` (default 0) site of `sitesWithin(key.select nodes)`. `neutral` = `isNeutral` of the current hex at `keySite`. `text` = `spec.text ?? null`. Parts keep profile order.
- `resolveParts` returns `null` when: `anim.nm !== profile.match.nm`; any selector (part, key, text container) matches nothing; a part has no sites; `nth` is out of range; the key site is not in the part; two parts share a site.
- `families.ts`: export `isNeutral(color: Oklch)`; widen `recolorFamily` and `viewFamily` to `Pick<ColorFamily, 'sites' | 'keySite' | 'neutral'>` (no behaviour change).

Profiles (exact):

| nm | id · name | select | key |
|---|---|---|---|
| `Eye` | `iris` · Радужка | `{layer:'Group 11'}`, `{layer:'Group 1'}` | `{layer:'Group 11', path:['Group 4']}`, nth 1 (#9c620d) |
| | `pupil` · Зрачок | `{layer:'Zrachok'}` | `{layer:'Zrachok'}`, nth 0 (#200302) |
| | `sclera` · Белок | `{layer:'Group 3'}`, `{layer:'Group 2'}` | `{layer:'Group 3'}`, nth 0 (#fcfcfc) |
| | `lids` · Веки | `{layer:'Group 8'}`, `{layer:'Group 9'}`, `{layer:'Слой 9'}` | `{layer:'Group 8'}`, nth 3 (#534f55) |
| `HEART RED` | `heart` · Сердце | `{asset:'comp_0', layer:'base'}`, `…'base 4'`, `…'volume stroke'`, `…'volume stroke 2'` | `{asset:'comp_0', layer:'base', path:['fill']}`, nth 0 (#fe1512) |
| `COOL_emoji_🆒` | `box` · Коробка | `{layer:'COOL', path:['1','Group 3']}`, `['1','Group 2']`, `['1','Group 1','0']`, `['1','Group 1','1']`, `['1','Group 1','Group 5']`, `['1','Group 1','Group 1','*','#1']` (letter shadows) | `{layer:'COOL', path:['1','Group 1','1']}`, nth 0 (#86bfe4) |
| | `text` · Надпись | `{layer:'COOL', path:['1','Group 1','Group 1','*','#0']}` (letter faces) | `{layer:'COOL', path:['1','Group 1','Group 1','#0','#0']}`, nth 0 (#ffffff) |
| | `fire` · Огонь | `{asset:'comp_0', layer:'*'}`, `{layer:'Flame_glow_*'}`, `{layer:'COOL', path:['1','Group 1','2']}` (fire reflection) | `{asset:'comp_0', layer:'1', path:['Group 3']}`, nth 0 (#fb9600) |
| | `sparks` · Искры | `{layer:'Ding_*'}` | `{layer:'Ding_1', path:['1']}`, nth 0 (#ffc600) |
| | `glints` · Блики | `{layer:'Shine'}`, `{layer:'blik'}`, `{layer:'blik 3'}` | `{layer:'Shine'}`, nth 1 (#7ff7ff) |

Cool's `text` part has `text: { container: {layer:'COOL', path:['1','Group 1','Group 1']}, original: 'COOL', box: {x0: 78.35, y0: 198.78, x1: 433.65, y1: 313.22}, pop: {first: 124, step: 6}, maxLength: 6 }`.

Tests:
- Synthetic `parts.json` (root nm `Fixture`): an asset `comp_x` with layers `a`, `b` (fills); two precomp layers `pre` → `comp_x`; shape layer `Body` with group `Outer` › [`Inner` (fl), `Inner` (fl, same name), `Other` (gf)]; shape layers `Spark_1`, `Spark_2`. Cover: whole layer; duplicate group names both match; `#1`; `*`; `Spark_*`; `{asset, layer:'*'}`; missing name → `[]`.
- `resolveParts` null cases: nm mismatch, renamed layer, overlapping parts, `nth` out of range, key outside part. Correct `keySite`/`neutral` otherwise.
- `recolorFamily(anim, part, '#00ff00')` changes only that part's sites.
- Samples (skip when absent): `matchProfile` returns the right profile with parts in table order; key hexes as in the table; parts of each sticker are disjoint; Heart's part has no neutral colour; Cool `fire` contains every `comp_0` site; recolouring each part leaves every site outside it unchanged. `minimal.json` → `null`.

Done when: tests pass; gate passes.

### Task 9d: Glyph data
Files: `scripts/build-glyphs.mjs`, `scripts/README.md` (one line), `package.json` (devDependencies + script `"glyphs": "node scripts/build-glyphs.mjs"`), `src/core/glyphs/roboto-900.json`, `src/core/glyphs/OFL.txt`, `src/core/glyphs.ts`, `src/core/glyphs.test.ts`.

Build script (dev only): parse `@fontsource/roboto/files/roboto-latin-900-normal.woff` and `…-cyrillic-900-normal.woff` with `opentype.js` (if opentype.js cannot read WOFF, unwrap WOFF 1.0 to SFNT with `node:zlib` in the script). For every character of
`ABCDEFGHIJKLMNOPQRSTUVWXYZ`, `АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ`, `0123456789`, `!?.,:;-+&'"*#%@()` and space, take the glyph from the first font that has it and write:

```ts
export interface GlyphContour { v: [number, number][]; i: [number, number][]; o: [number, number][] } // closed, y down, v absolute, i/o relative (Lottie)
export interface GlyphSet {
  unitsPerEm: number
  capHeight: number                                              // font units
  glyphs: Record<string, { advance: number; contours: GlyphContour[] }> // space: no contours
  kerning: Record<string, number>                                // 'AV' → units; non-zero pairs within the set only
}
```
- Quadratic segments → exact cubic elevation; lines → zero handles; the duplicate closing vertex is dropped. Coordinates rounded to integers. Copy the font licence to `OFL.txt`.

`glyphs.ts`:
```ts
export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface PlacedGlyph { char: string; contours: GlyphContour[]; bounds: Box | null } // box coordinates; bounds null for space
export function layoutLine(set: GlyphSet, text: string, box: Box): PlacedGlyph[]           // throws on a char missing from set
```
- Pen positions use advances + kerning. Scale `s = min(boxHeight / capHeight, boxWidth / inkWidth)` where inkWidth is the horizontal ink extent of the line in font units. The block (ink width × cap height) is centred in the box: baseline `y = box.y1 − (boxHeight − capHeight·s) / 2`, ink extent centred on `(x0 + x1) / 2`. y is already down in the data.

Tests (import the JSON directly): every listed character exists and all but space have ≥ 1 contour; `O` has 2 contours with opposite signed area; `layoutLine(set, 'COOL', {x0:0, y0:0, x1:1000, y1:100})` (height-limited) — the ink of `L` spans y 0…100 (±0.5) and the line's ink is centred on x 500 (±0.5); a long line in a narrow box fits its width; a kerned pair is narrower than its advances sum when the font kerns it; the set is not mutated.

Done when: `npm run glyphs` regenerates the identical JSON; tests pass; gate passes.

### Task 9e: Inscription replacement
Files: `src/core/homography.ts`, `src/core/homography.test.ts`, `src/core/text.ts`, `src/core/text.test.ts`, `src/core/families.ts`, `src/core/families.test.ts`.

```ts
export type Mat3 = [number, number, number, number, number, number, number, number, number]
export function fitHomography(src: [number, number][], dst: [number, number][]): Mat3 // least-squares DLT with Hartley normalisation; throws on < 4 points or a degenerate set
export function applyHomography(h: Mat3, p: [number, number]): [number, number]       // throws when w ≤ 0

export function readText(anim: Lottie, spec: TextSpec): string
export type TextCheck = { ok: true; text: string } | { ok: false; error: string }
export function validateText(input: string, spec: TextSpec, set: GlyphSet): TextCheck
export function replaceText(anim: Lottie, spec: TextSpec, text: string, set: GlyphSet): { anim: Lottie; siteOrigin: number[] }

export function remapFamilies(families: ColorFamily[], siteOrigin: number[]): ColorFamily[] // in families.ts
```

- `validateText`: upper-case, trim, inner whitespace runs → one space. Errors (exact): «Пустая надпись»; «Не больше ${maxLength} символов»; «Нет символа «${char}» в шрифте».
- `readText`: if every `gr` item of the container is named `txt:<char>`, join the chars in reading order (reverse of `it`); otherwise `spec.original`.
- `replaceText` (validates first, throws `Error(error)` on failure; works on a `structuredClone`; the container must resolve to exactly one group):
  1. Letter groups = container `gr` items with ≥ 2 `gr` children (face = first, shadow = second); `txt: ` space groups are skipped. Template = the first letter group. A point in a face/shadow group maps to container coordinates as `local + tr.p − tr.a` of that group.
  2. Fit `H_k` (face kf 0 → face kf k) and `G_k` (face kf 0 → shadow kf k) on all letters' vertices and absolute handles (`v`, `v+i`, `v+o`). **Amended by the final-review fix:** the matrices come from `spec.motion` (measured once from the original letters and stored in the profile), never from the current letters, so thin or user-made glyphs cannot degrade or break the motion.
  3. `layoutLine(set, text, spec.box)`.
  4. For each character build a group `nm: 'txt:<char>'` copied from the template letter group's fields except `it`: `[face, shadow, tr]`.
     - face/shadow: the template group's fields; `it` = one `sh` per contour, then clones of the template group's non-`sh`, non-`tr` items (the `fl`, so colours carry over), then its `tr` with `p = a = [0,0]`.
     - Each `sh` gets `ks: { a: 1, k }`, where `k` copies every template keyframe (from the template's first face `sh`) with `s = [shape_k]` (and `e` if the template has `e`). `shape_k = { c: true, v, i, o }` maps vertices and absolute handles through `H_k`/`G_k`, turns handles back to offsets, and rounds to 1 decimal.
     - letter `tr`: clone of the template letter's `tr`. `p = a =` centre of the face ∪ shadow vertex bounds at kf 0. The `s` keyframes are shifted so the j-th non-space letter starts at `pop.first + j·pop.step`.
     - Space: `{ ty: 'gr', nm: 'txt: ', it: [template letter tr with p = a = [0,0] and static s 100] }`.
  5. Container `it` = new groups in reverse reading order, then the container's non-letter items (its `tr`) unchanged.
  6. `siteOrigin[i]` (length = new site count) = index of the input site that new site i comes from. Sites before the container keep their index. Sites after it shift by the size change. A new letter's face/shadow sites map position-wise onto the template letter's face/shadow sites. Use `sitesWithin` for the container and template ranges.
- `remapFamilies`: for each family, new sites = `{ i | siteOrigin[i] ∈ family.sites }` ascending; `keySite` = the first new site whose origin is the old key site, else the family's first new site; `id`, `name`, `neutral` kept; a family left without sites is dropped.

Tests:
- Homography: a known H recovered from 20 points (reprojection < 1e-6); < 4 points and collinear points throw; `w ≤ 0` throws.
- A synthetic animation built in the test with known `H_k`/`G_k` (3 keyframes, 2 letters, red faces, blue shadows), plus a fill before and a fill after the container:
  - `replaceText(·, 'AB')` → groups `txt:B`, `txt:A` in `it` order and `readText` = `'AB'`.
  - Keyframe times and easing equal the template's; fitting on the result recovers each `H_k`/`G_k` with < 0.1 px reprojection on the original points (output is rounded to 0.1).
  - Fills copied; pop starts `first`, `first + step`; input not mutated.
  - `siteOrigin` maps the outside fills to themselves (same hex at the mapped index).
  - `remapFamilies(findFamilies(input), siteOrigin)` covers every new site exactly once and keeps ids and names.
- Replacing twice (`'AB'` then `'XYZ'`) equals replacing once with `'XYZ'` (coordinates ±0.15).
- `'A B'` → 3 groups, the middle one is `txt: ` with no paths; `readText` = `'A B'`; pops counted over letters only.
- `validateText`: `'привет'` → `'ПРИВЕТ'`; `'  a   b '` → `'A B'`; `''` and `'   '` → «Пустая надпись»; `'ABCDEFG'` → «Не больше 6 символов»; `'中'` → «Нет символа «中» в шрифте».
- Cool sample (skip when absent):
  - `readText` = `'COOL'`, and the fit on the original letters is < 0.2 px.
  - After `replaceText('ПРИВЕТ')`, `matchProfile` still matches and `readText` = `'ПРИВЕТ'`.
  - `Надпись` key is still `#ffffff`, and the `Коробка` sites include the new shadows (#5f7b93).
  - The last pop ends ≤ op − 1, and `telegramChecks` all pass.
  - **Budget:** `writeTgs` size ≤ 65536 bytes for `'COOL'`, `'ЖЖЖЖЖЖ'`, `'ШЩЖФЫЮ'`, `'WWWWWW'`; log each size. If the budget fails, report BLOCKED with the sizes; do not change limits or the glyph data on your own.

Done when: tests pass; gate passes.

### Task 9f: Parts panel
Files: `src/ui/Parts.tsx` (new), `src/App.tsx`.

- App history becomes `useHistory<Doc>` with `interface Doc { anim: Lottie; families: ColorFamily[] }`.
  - On load: `families = findFamilies(anim)`, `profile = matchProfile(anim)?.profile ?? null` (before any state change), then `reset({ anim, families })`.
  - A colour commit `set({ anim: next, families: present.families })`.
  - Preview, checks and export read `present.anim`.
- `parts = useMemo(() => profile && present ? resolveParts(present.anim, profile) : null, …)`.
- Inspector order: `<Parts>` (only when `parts` is non-empty) → `<Palette>` → `<Checks>`.
- `Parts` props `{ anim, parts, session }`: section titled «Части» (same heading style as «Палитра»), one `li` per part with the same top row as a family card.
  - Key swatch: `PopoverTrigger` + `PickerPopup`, target `part:${id}`, `apply = (c, p) => recolorFamily(c, part, p)`, `data-part-key`, aria-label `«${name}»: ${key} — изменить`.
  - Name, plus a shade strip from `viewFamily(readColorSites(anim), part)`.
  - No shade grid.

Done when: gate passes; in the browser each sample shows its parts (table order) above the palette; Eye: recolouring Зрачок leaves Радужка unchanged (and vice versa); Esc/Enter/Undo/Redo work; `minimal.json` shows no «Части».

### Task 9g: Inscription field
Files: `src/ui/Parts.tsx`, `src/App.tsx`.

- When a shown part has `text`, load the glyph data lazily with `import('@/core/glyphs/roboto-900.json')` (its own chunk). While loading, the field is disabled with placeholder «Загрузка шрифта…». On failure show «Не удалось загрузить шрифт».
- Under the Надпись card's top row: a labelled text input «Текст».
  - The draft equals `readText(anim, spec)` and re-syncs whenever `anim` changes.
  - Enter or blur: `validateText`.
    - On error: show the message under the field (`aria-describedby`, `aria-invalid`); nothing is committed.
    - If the normalised text equals the current text: only normalise the draft.
    - Otherwise: `replaceText` → `onTextCommit(next, siteOrigin)`.
  - Esc restores the draft and clears the error.
- App `onTextCommit`: `set({ anim: next, families: remapFamilies(present.families, siteOrigin) })`.

Done when: gate passes; final acceptance steps 5–7 pass; `bash scripts/check.sh <exported file>` passes.

## Final acceptance (Iteration 3)

Orchestrator, dev server `tgs-dev` (port 5173):
1. Each sample shows its parts in table order, then the palette, then the checks; no console errors.
2. Eye: recolouring Зрачок leaves the iris unchanged and vice versa; Белок and Веки are independent; Undo/Redo work.
3. Heart: «Сердце» recolours all the red; the highlights stay white.
4. Cool: Коробка (with letter shadows), Огонь (every instance + reflection), Искры, Блики each recolour on their own.
5. Надпись: type «привет», press Enter → «ПРИВЕТ». The preview shows the letters turning with the box and popping in turn. ⌘Z restores «COOL» and the previous palette families; ⇧⌘Z brings «ПРИВЕТ» back.
6. «中», an empty field or 7 characters → message, file unchanged.
7. Export after a text change + recolour: size check green; `bash scripts/check.sh <file>` passes; re-opening shows the same text and parts.
8. `minimal.json`: no «Части», palette works as before.
9. `npm run build` + `npx vite preview`: works; the glyph JSON loads as a separate chunk.
10. User: compare with Telegram, send an exported sticker.

---

# Iteration 4 — Parts for any sticker (atoms + click selection)

Spec: this section (approved by the user on 2026-10-18; full write-up with the LLM-council verdict in the approved plan `~/.claude/plans/gentle-pondering-metcalfe.md`).

## Context

Parts exist only for the three profiled stickers. The user wants any uploaded sticker split into editable parts. Council verdict: no neural net; a script splits the file into **atoms**, the person assembles parts with clicks; Lottie structure only feeds "expand selection" and "select similar"; an LLM may later suggest parts (set-of-marks), never on the critical path. Operations on a part (user, 2026-10-18): recolour, hide/delete, move/scale, replace content (inscription stays profile-only).

Measured on 17 samples (`node scripts/measure-corpus.mjs`, task 10a):
- Every hand-profile part is a whole set of atoms (0 split atoms). Eye parts = 1–3 atoms.
- 1525 atoms, median 68 per sticker, max 353; Cool «Искры» = 112 atoms, «Огонь» = 44.
- ID render with antialias 0 and opacity as 0/100 hold keyframes: 0.00% non-ID pixels on every file.
- 10% of atoms are < 16 px, 6.6% never topmost → an atom tree/list is needed besides canvas clicks.
- Precomp reuse only in Cool (`comp_0` × 8). Root `nm` duplicated (Case/Suitcase) or missing (Target) → user profiles are keyed by a structural fingerprint.

## Extra global constraints (Iteration 4)

- `src/core/atoms.ts` (and later `src/core/idmap.ts`) follow the `src/core` rules.
- `scripts/measure-corpus.mjs` loads core TS through Vite's `runnerImport` (no new dependency) and must stay read-only.

## Tasks

### Task 10a: Corpus measurement (done)
`scripts/measure-corpus.mjs`, `scripts/README.md`. Per file: KB, layers, atoms, max atoms per layer, tiny (< 16 px) and unpickable atoms from the ID render over 45 frames, trim paths, repeaters, gradients, mattes/masks, deepest atom, impure-pixel share, precomp reuse; root `nm` duplicates/missing; hand profiles vs atoms.

### Task 10b: Atoms core
Files: `src/core/colors.ts` (+ `siteNodes`), `src/core/atoms.ts`, `src/core/atoms.test.ts`, `src/core/__fixtures__/atoms.json`; the measurement script uses `findAtoms`.

```ts
export function siteNodes(anim: Lottie): object[]   // colors.ts: fl/st/gf/gs node of every site, by identity
export interface AtomLocation { asset?: string; layer: number; groups: number[] }
export interface Atom { id: number; at: AtomLocation; layerName: string | null; sites: number[]; instances: number }
export function findAtoms(anim: Lottie): Atom[]
export function expandLevels(anim: Lottie, atoms: readonly Atom[], id: number): number[][]
export function similarAtoms(anim: Lottie, atoms: readonly Atom[], ids: readonly number[]): number[]
export function fingerprint(anim: Lottie): string
```
- Atom = shape list (`shapes` / `gr.it`) directly holding a paint; order = assets first, then root layers, pre-order. `sites` = sites of its own paints only. `instances` = times an asset is drawn through precomp layers.
- `expandLevels`: atom → each enclosing group (innermost first) → layer → layers sharing each ancestor of the parent chain → whole asset; only strictly growing levels.
- `similarAtoms`: same signature (shape kinds with path vertex counts + child-group count + paint kinds + colours) or same group path in a layer that is a copy by name: equal stems with at least one numbered (`Ding_1` ↔ `Ding_14`, `Paper` ↔ `Paper 2`; two unnumbered `Arm` are not; generic stems like «Shape Layer», «Слой» excluded).
- `fingerprint`: FNV-1a over layer kinds, names, `ind`/`parent`, `refId` and shape-tree kinds; blind to colours.

Tests: fixture cases for each function; samples (skipped when absent): atoms partition the sites, levels grow strictly, hand-profile parts are whole atom sets; Cool: one spark → layer level → similar = exactly «Искры»; fire atoms have `instances` 8.

### Task 10c: ID map and picking
Files: `src/core/atoms.ts` (export `locateAtoms`), `src/core/idmap.ts` (+ test), `src/player/engine.ts` (+ test), `src/player/player.ts` (+ test), `src/player/player.worker.ts`, `src/preview/Preview.tsx`, `scripts/measure-corpus.mjs` (uses `idColorize`, `decodeId`, `loadEngine`).

```ts
export function idColor(id: number): [number, number, number]          // atom k → bytes of k + 1
export function decodeId(r, g, b, a, atomCount): number | null          // a must be 255
export function pickAt(rgba, size, x, y, atomCount): number | null      // x, y fractions of the canvas
export function idColorize(anim: Lottie): Lottie                        // atom-coloured copy
Animation.render(frame, w, h, antialias = true)
PreviewPlayer.pick(x, y): number | null                                 // current frame, ID map built lazily
ToWorker  { type: 'pick'; id; x; y }   FromWorker  { type: 'pick'; id; atom }
```
- `idColorize`: opacity 0/100 with hold keyframes (a segment is on when either end is > 0; `e` kept), gradients → solid paints keeping `hd`/`o`, `bm` → 0, luma-matte sources white.
- The player builds the ID map on the first pick per animation, renders it at 512 without antialiasing and keeps the last frame.
- Preview: a click on the stage posts `pick`; only the latest reply counts; the result is mirrored in `data-picked-atom` on the stage (−1 = nothing) and passed to optional `onPick`. No visible UI yet.

Verified: worker picks on Cool (frame 128) equal Node's at five points; all samples render with 0 impure pixels on three frames.
Found: translucent overlays (Cool `Flame_glow_1`) are opaque in the ID map and win clicks over the box under them → 10d: Alt-click cycles through the atoms under the point; consider skipping atoms whose effective opacity is low.

### Samples menu (user request, 2026-10-19)
Files: `src/ui/samples.ts`, `src/ui/Toolbar.tsx`, `src/App.tsx`. Toolbar «Образцы» (in the fluid group after «Открыть», hidden when `samples/` is empty) lists `samples/*.tgs` (`import.meta.glob`, `?url`); a click fetches the file and opens it like a chosen file; the open one is `aria-current`.

### Change of direction (user, 2026-10-19)
The user did not like parts guessed from file structure. New approach: parts are marked up **here, with Claude**, per sticker, from how it looks: Claude renders the sticker, proposes a part list, the user corrects it (`docs/parts-proposals.md`), Claude writes the profile and shows the parts highlighted for approval. The editor only knows marked-up stickers (unknown ones keep the palette). Atoms, the ID map and picking stay as Claude's tooling (numbering elements, checking parts) and as the editor's click mechanism.

### Task 10d: Sheets and translucent split (done)
- `scripts/sticker-sheet.mjs` → `exports/sheets/<name>.frames.png` (6 frames), `.marks.png` (solid atoms numbered on 3 frames), `.effects.png` (translucent atoms), `.atoms.txt`.
- `idmap.ts`: `translucentAtoms(anim)` (every paint below 95 % opacity or a gradient with an opacity stop below 0.95) and `idColorize(anim, { only: 'solid' | 'translucent' })`. Glass highlights and glows (Cool `blik`, `Flame_glow_*`) no longer cover the body.
- Player pick: the solid map first, the translucent map where nothing solid is drawn.

### Task 10e: Profiles from the approved list
Done 2026-10-19: `match.fingerprint` + `Selector.ind` in `parts.ts`; `scripts/parts-sheet.mjs` (parts highlighted, leftovers, keys; `--profile` to try an unregistered one); profiles for all 17 samples in `src/core/profiles/` (14 new, by fingerprint), each checked on its parts sheet; test: every sample resolves to its profile. ID map fix: a fade-in stays hidden before its first keyframe. EvilEye: the eyeball's red tint is a colour animation of the same shapes, so it stays in «Белок» (cannot be split into «Красная фаза»).
- After the user edits `docs/parts-proposals.md`: profiles for every sticker (existing three extended), written as data, matched by `fingerprint` (root `nm` is duplicated / missing).
- A parts sheet per sticker (each part highlighted on 3 frames) for the user's approval.
- The part list is agreed (`docs/parts-proposals.md`, 2026-10-19). Next operation after colour: **text replacement in NEW** (like COOL); hide and move/scale later.
- LipsSticker: the mouth interior is a dependent colour that follows the tongue (keeps its lightness offset), not a part.

### Task 10f: Inscription replacement in NEW (done 2026-10-19)
- `text.ts`: a letter's face/shadow may wrap one inner group placed by a static translation (NEW); the container may hold other groups after the letters (NEW's button face) — they are kept, and `readText` only looks at inscription items; replaced letters are written flat. `measureTextMotion(anim, container)` fits the per-keyframe homographies + face box from a sticker's own letters (residual: COOL 0.108 px, NEW 0.0016 px); `scripts/text-motion.mjs` prints them for a profile.
- `parts.ts`: path step `'@letter'` (groups with ≥ 2 groups, or named `txt:`) so a text part's selectors hold before and after an edit.
- NEW profile: text part with spec (container `NEW › Group 1`, 6 keyframes, box from the faces, pop 118/6, max 6 characters); matched by root `nm`, because an inscription edit changes the fingerprint.
- Verified: NEW → «ПРИВЕТ» turns, squashes and pops like the original; 20 KB; `scripts/check.sh` passes; in the editor the «Текст» field replaces it and the parts stay.

### Task 11a: Motion from prompts (done 2026-10-19)
A static sketch (SVG with named groups, via python-lottie) + `motion.json` → animated .tgs. `src/core/motion/`: `easing.ts` (named cubic-bezier curves, `valueAt` evaluator), `presets.ts` (bounce, float, sway, pulse, pop, blink, shake, spin; each starts and ends at rest), `compile.ts` (`compileMotion(base, spec)`: parts are groups by `nm`, anchors moved to pivots without moving the drawing, one track per property → preset keys with eases, several tracks or `follow` → per-frame samples thinned to 0.05). `scripts/motion.mjs` builds the .tgs and a 12-frame sheet. Demo: `stickers/blob` (1 KB, check.sh PASS). Next: the user's Figma sketch (review/completion of missing poses in Figma, then motion by prompts).

### Task 11b: Pistol from the user's Figma sketch (in progress 2026-10-20)
- `stickers/pistol/sketch.svg` rebuilt from the Figma vector export (`figma-ref.svg`, `build_sketch.py`): named parts gun › trigger, frame (grip texture clipped without a mask), pin, barrel, slide, gun_light (one-frame solid yellow flash); shell_1..3. No masks, no gradient strokes. Review copy: Figma page «Pistol — clean».
- Compiler: several starts per track, `each`, hidden parts + `show`, rig globs, `kick`/`eject` presets, `yaw`/`pitch` perspective turn (path morph, depth `z`), effects copied as precomps from other stickers (`sources`, `effects`).
- `motion.json`: turns like WaterGun, four shots with SpamEffects timings (recoil −18° in 1.5 frames, slide 28 px in 2 frames), flash `collision` and smoke `comp_11` from ExplosivesEffects. 37.6 KB, check.sh PASS.
- Iteration 2 (2026-10-20): shot from reference particles without black outlines (variant A chosen: Meteor glow along the barrel + FireEffects cream smoke), effects `follow`/`aim`/`stretch`/`speed`; slide travel 44 with a hold and an overshoot, recoil a frame later; extruded side faces (`depth`), the barrel as a cylinder with a muzzle face; ejection port opens on recoil (`port_open`, `port_case`); bigger shells launched from the port (`launch`) falling off the bottom; frame top cut to the rail in front. 59 KB, check.sh PASS.
- Iteration 3: the muzzle tip belongs to the barrel (one dark cylinder, guide rod under it); its round end face is drawn over the slide (`cap.into: "muzzle_face"`) and shows whenever the muzzle faces the viewer; the frame front is cut to the slide's bottom edge, so no beige shows above the rail on recoil. 57 KB.
- Iteration 4: highlights in the Telegram sticker manner — tapered crescents hugging the contour (`crescent()` in build_sketch.py), one light from the top left. Two drawings: `sketch.svg` (the sketch's highlights redrawn: crescent under the trigger, slide-top crescents, a front specular) and `sketch-own.svg` (own set: rim lights on the grip back and frame top, core shadows, guard arc, trigger, sights, speculars); `motion.json` variants `fixed` / `own` (`"sketch"` per variant in motion.mjs). 56.6 / 63.7 KB.
- Iteration 5: own highlights are the default (`build_sketch.py` mode `own`), flat faces get even bands that fade only at their ends (`taper`); depth outlines are the part's own width less the simplification error and take the part's outline colour (frame #58462A), contained shapes are left out of the extrusion; `scripts/rest-diff.mjs` proves frame 0 equals the sketch (0 px). 61.6 KB.
- Iteration 6: the gun is 0.72 (was 0.8) and further right, so recoil + the away turn never clip (gun 18–430 px over all frames); one highlight under the trigger (front of the guard opening and its bottom bar); the slide's rear edge highlight joins the top band; removed the frame-front core shadow and the rear end of the frame-top highlight. 60 KB.
- Iteration 7: highlights as Telegram stickers draw them — open lines of even width with round caps, solid light tints, line + dot (variant `a`, lines inside the outline; variant `b`, lines on the outline's inner edge). Depth zones (`rig.<part>.zones`): the trigger guard is set back to z −12 with a 16-unit extrusion (frame 40), so on a turn it is narrower than the frame; the trigger sits inside it (z −20). 53 KB.
- Iteration 8: variant `b` is the default drawing (lines on the outline, 8 units wide); the highlight under the trigger follows the guard opening's own outline (`edge_run` over Subtract_4), 4.5 wide, pale #EBD7AA. 53.8 KB.
- Iteration 9: highlight width and colours live in `stickers/pistol/style.json` (one width for every highlight line and dot; grip highlights golden #E4C27A / #DDBB78); the frame-top highlight sits clear of the slide's bottom outline. 53.8 KB.

### Task 11c: Pistol — tempo, shot effects, shell variety as variants (2026-10-20)
- Rule from now on: the current animation (`motion.json` → `pistol.tgs`) stays the untouched baseline; every new idea is a variant in `stickers/pistol/variants/` (written by `make.py`) built next to it, compared on `exports/sheets/pistol.compare.png`.
- `docs/weapon-animation.md`: weapon animation principles with numbers (shot timing, rhythm, shells, smoke, loop layout).
- Compiler: per-start parameter lists (keyed directly per start when the starts don't overlap), `eject.tumble`, `puff` preset; zero-gravity eject fixed. `build_sketch.py` also writes `sketch-fx.svg` (own flashes `fx_flash_a/b`, puffs `fx_puff_1..8`, port puffs `fx_port_1..4`, ring `fx_ring`, shells 1–8); `sketch.svg` is unchanged.
- Variants: `tempo-burst` (anticipation → shot → double tap → accelerating string with stacking climb → hero shot with hit-stop; 34 KB), `tempo-doubletap` (baseline turns, double taps + hero; 63 KB), `fx-drawn` (burst + own star flashes, grey puffs, port puffs, ring; 38 KB), `fx-refs` (burst + SpamEffects pop flash, ExplosivesEffects grey puffs, Dynomite port sparks; 51 KB). All shells fly on their own arcs with tumble. Baseline 53.8 KB, rest-diff 2 px.

### Task 11d: Six shots, shells behind the gun, steam from CoffeeSticker (2026-10-20)
- Variants `tempo-*`, `fx-*` rejected and removed; own drawn effects removed from `sketch-fx.svg`. `sketch-fx.svg` draws shells 1–8 under the gun (they come out from behind the slide top and fall behind it); no `tumble` (a squeezed shell reads as a square).
- `six-shots`: the baseline's turns, 6 shots (shot, double tap, shot; double tap, heavier last shot), per-shot recoil; 50.8 KB.
- Steam: `stickers/pistol/fx/build_fx.mjs` → `steam.json` (own effects source). Picked: CoffeeSticker's tall ribbon (`coffee_one_rise`) — grows out of the top of the muzzle (y scale 0 → 100 around its foot), rises without the cup's hang, stretches up to 150 % and clears from the bottom (animated gradient alpha stops). `scripts/fx-gallery.mjs` shows candidates on one shot (page «Pistol Steam Options»).
- `six-steam`: six-shots + that wisp after every shot (size and lean vary); 54.9 KB.

### Task 11e: The slow-slide pistol is the baseline (2026-10-20)
- `motion.json` is now written by `stickers/pistol/variants/make.py`: 5 shots (two on the first turn, three on the second), a seamless swing between the turns (release and attack overlap with the same ease), the slide back in 3 frames / held 3 / forward in 5 with an overshoot, shells from the top of the ejection port — three in front, two (`back_shell_1..2`, drawn under the gun) behind — and one wisp of steam from the top of the muzzle after the last shot (`coffee_one_rise`, no pause between growing and clearing). Trigger highlight dimmed (#55524F). `sketch.svg` holds all shells; `sketch-fx.svg` is gone. 46.3 KB.
- Variant `camera`: the same with another camera from `stickers/pistol/camera.json` — `fov` (angle of view, baseline ≈54°; focal = 355.5 / tan(fov/2) gun units) and `turn` (turn amplitude ×). Default 80° / ×1.35.

### Task 11f: Colours on turns, mixed camera, fit to the canvas (2026-10-20)
- The slide highlight no longer runs down the rear edge and the sights have no light dots (on a turn they read as a light grey back face and light rims; checked in lottie-web via `exports/view.html` on the dev server).
- `rig.focal` may be `[seconds, focal]` points; variant `camera-mixed`: the turn towards the viewer (the first) with `camera.json` `mixed.towards` (80°, ×1.35), the turn away with `mixed.away` (54°, ×1), the camera moving during the swing.
- `MotionSpec.view` (null layer) + `scripts/fit.mjs`: each build as large as fits with 8 px margin (baseline 107.8 %, camera-mixed 101.6 %, camera 96.3 % — the wide turn spans the canvas). The muzzle flash is about a third shorter so it fits.
