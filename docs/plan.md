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

### Blue pack: base stickers (user, 2026-10-21)
- New direction: a sticker pack in the style of Telegram's blue silhouette people. The four source emoji (👤 bust, 👥 busts, 🫂 hugging, 🗣 speaking head) live in `packs/blue/base/` (untouched originals; style colours in `packs/blue/README.md`). Plan: recolour/restyle existing emoji into this style and make new poses from these parts.
- Not in `samples/`: every sample must resolve to a profile, and three of the four have none yet. 🫂 is byte-identical to `samples/HugsSticker.tgs`.
- Measured: all pass `scripts/check.sh` (mattes note on 👥/🫂), 2.5–7.9 KB, tlottie 0.6–1.8 ms per 512 px frame, seamless loops.
- `scripts/check.sh` and `scripts/motion.mjs` run on Windows (Git Bash): python found as `python3`/`python`/`py`, venv `Scripts/`, the converter run through the venv's python.

### Blue pack: 🖕 restyled (2026-10-21)
- `scripts/restyle.mjs` + `packs/blue/style.json` + `packs/blue/<name>/{source.tgs,recipe.json}`: paints swapped by colour, `"body"` fills → one vertical gradient over all body shapes at a reference frame, written into each fill's own coordinates. Telegram's yellow emoji are built like the blue people (fills + 8-px round strokes), so the animation stays as is.
- 🖕 (`middle-finger`): outline → #335375, skin → body gradient, lights → #a5d6ea, shadows → #44688b (with #335375 the palm read too dark next to 👤). 17.5 KB, check.sh PASS, tlottie ~1 ms/frame. Awaiting the user's review.

### Emoji library tab (user, 2026-10-21)
- 🖕 approved («супер вышел») → `packs/blue/ready/middle-finger.tgs`; `ready/` holds approved blue emoji only.
- 997 Telegram animated emoji in `library/emoji/NNN.tgs` (gitignored: 36 MB, not ours; `library/README.md`). 🖕 = 167.
- Editor: toolbar switch «Редактор / Эмодзи». The «Эмодзи» tab (`src/ui/Library.tsx`) is what the user asked for: a grid of **static** thumbnails, click selects (Shift+click — range), a bottom bar «Скопировать ID» copies `003, 004, 017`; sets «Эмодзи Telegram» and «Синий пак · готово»; a blue dot marks emoji that already have a blue version; double-click opens one in the editor. Data from `node scripts/library.mjs` (index + sprites, dev server only — not bundled).
- Workflow from now on: the user sends a batch of IDs with an instruction; recipes name their source with `"library": "NNN"`.

### Blue pack: hands batch, 🙏, 6-7 draft (2026-10-21)
- User's batch: 128 129 130 131 132 133 134 135 136 143 144 147 157 158 159 160 161 162 163 164 165 168 170 → `packs/blue/<slug>/` with `recipe.json` `{ emoji, library }`; the skin colours moved to `style.json` (`colors`, plus `ramp` for any other warm colour by lightness); precomp assets get their own gradient. Grey motion lines → #335375 / #a5d6ea / #6086a7. All pass check.sh. The user will choose which go to `ready/`.
- 169 🙏: user wanted the sleeves gone. Long thin forearms — rejected («что-то тонкое выходит»); short forearm stubs — rejected («пилюли»). Decision: floating hands cut at the wrist — sleeves removed, the palm's hidden bottom edge outlined (`underlines`), the palm stroke's end that ran under the sleeve trimmed to 82 % (`trims`). Within 16–476 px.
- 6-7: draft from 🤲 129 (`packs/blue/six-seven/build.mjs` + `motion.json`): pose frozen at frame 100 (proper eased + spatial interpolation), sparkles dropped, hands apart, alternating up/down swing with a lagging tilt, seamless 180-frame loop, view fitted. The user said it will be redone later (the requested view: fingers towards the viewer, palms barely visible).

### Blue pack: softer highlights; «Эмодзи» tab plays (user, 2026-10-21)
- On-hand highlights were too white: `#ffd75d` → `#8cb7d3` (instead of the rim colour #a5d6ea) in clapping-hands, hand-with-fingers-splayed, heart-hands, leftwards-hand, open-hands, palms-up-together, raised-hand, raising-hands, thumbs-down, thumbs-up, vulcan-salute, waving-hand (per recipe). Effects above the hands (triangles, sparkles) stay bright.
- «Эмодзи» tab: toggle «Анимация» (top right, off by default, remembered in localStorage). On: a tile gets a canvas + animation only while on screen (IntersectionObserver), dropped when it leaves; nothing starts and playback pauses while scrolling, tiles start 500 ms after the scroll rests. `src/player/grid.ts` (GridPlayer: shared clock, visible-only drawing, ≤ 30 fps, LRU) + `grid.worker.ts`; tiles shared between up to 4 workers, drawn at ≤ 96 px (56 complex emoji at 128 px cost ~65 ms per frame on one core).
- The tab stays mounted while the editor is shown (selection and scroll kept); a file opened from it gets «← Назад» in the toolbar.
- (later, 2026-10-21) Still too white in hand-with-fingers-splayed, leftwards-hand, open-hands, raised-hand, vulcan-salute, waving-hand: the palm-centre highlight layers («Palm … Light», «palm light») are now removed with the recipe's new `fade` (layer opacity %, 0 = gone), big thumb-base lights at 40 %; finger lights and leftwards-hand's top light stay (user: top is fine, the middle is not).
- (later, 2026-10-21) 👍 / 👎: highlights made small and alike — the big ones (👍 «Light 1», «Light 4»; 👎 «arm») gone, the finger ones at 45 %. `fade` now scales only the highlight fills (`style.highlight`, #ffd75d) of a layer: in 👍/👎 a finger's highlight shares its layer with the finger. call-me-hand, flexed-biceps, heart-hands, ok-hand, oncoming-fist, rightwards-hand, writing-hand: highlights #8cb7d3 like the others.

### Blue pack: 👉👌 finger-ok (user, 2026-10-21)
- Source: the user's static scene MadEmoji2 (pointing hand 153 + OK hand 147 drawn as one composition; the OK ring is a separate layer above the pointing hand). `packs/blue/finger-ok/`: restyled with a gradient per hand (restyle.mjs recipe `gradients`: groups of layer names), then `build.mjs` + `motion.json`: the pointing hand slides along its finger axis (out 60 px … in 6 px past the reference) 4 times in 3 s, tilting 3°; the OK hand sways 14 px and 2° against each push, 3 frames behind; a view null moves the scene 26 px right so the stroke stays in the canvas (18–494 px). Seamless loop, 5.4 KB.
- Interpretation to confirm: «повторять анимацию, которая уже есть» taken as keeping the user's composition exactly; 153's own idle wiggle is not used.
- `library.mjs`: a recipe's `library` may list several emoji.
- (later, 2026-10-21) finger-ok physics and shadows (user: «чуть-чуть физики», «тени запечены»): the ring's shadow on the finger (pointing «Shape 11») is counter-moved so it stays at the ring; the finger's shadow on the palm inside the ring (OK «Shape 4») moves with the finger and its opacity follows the depth (0 when out) — both baked every 2 frames. The three open OK fingers bend: points above the finger bases (canvas y < 205) shift sideways by θ·height·weight (more for the little finger), θ a damped spring (period 16 frames, damping 0.16, peak 7°) driven by the OK hand's acceleration, run to steady state; keys only at its 26 peaks with an in-out ease. The three stacked shadow copies are merged into one at the combined opacity (84.5 → 47 KB). Seamless, 18–494 px.
- (later, 2026-10-21) User: the shadow under the pointing finger must ride with the finger (pinning it to the ring was wrong) — reverted; only the finger's shadow on the palm inside the ring moves with the finger and fades. The fingers swayed too much: bend 3° (was 7°), damping 0.3, period 14. 43 KB.
- (later, 2026-10-21) The finger's underside shadow («Shape 11») is the OK hand's shadow on the finger: it must stay under the ring yet show only on the finger. Now: a copy of the strip on its own layer, carried by the OK hand's sway, under an alpha track matte made of the pointing hand's fills (moves with the finger). check.sh notes «Mattes are not officially supported» (Telegram's own 🫂/👥 use mattes; tlottie renders them). The palm shadow inside the ring no longer moves (on the top layer it showed as a «cloud» over the thumb) — it only fades with the finger's depth. 43 KB.
- (later, 2026-10-21) User: the part of the strip left of the ring must ride with the finger and stretch, not stand still; the palm shadow must move with the finger but under the thumb and the ring's top finger. Now: the strip's points left of the ring's edge (strip-local x < −6, fully at < −20; `motion.json` `strip.edge`) follow the finger relative to the OK hand (path baked every 2 frames), so the strip stretches; the palm shadow («Shape 4») moved off the ring layer onto its own layer under the pointing hand, following the finger, under an alpha matte of the palm (Shape Layer 1 fills); no fade. 47.5 KB, seamless.
- (later, 2026-10-21) User: a micro gap under the fingertip inside the ring. Cause: the pointing hand tips 3° as it pushes in, the palm shadow was only translated. Now the palm-shadow layer is a child of the pointing hand (the ring layer's rest transform in the hand's space), so it follows translation and tilt; no baked position. 46.5 KB.
- (later, 2026-10-21) User: the palm shadow sat too high (gap below, to the ring's lower finger) and was jagged. The drawn shadow is dropped; the shadow is now the pointing hand's own silhouette («Shape 5») offset 5 px right, 15 px down (`motion.json` `palm_shadow`), at 56 % on the layer, still a child of the hand under the palm matte. Smooth edge following the finger, reaches the ring's lower finger. 46.4 KB.
- (2026-10-21) User approved every draft in exports/blue (27: the hands, 🙏, 6-7, 👉👌) — copied to packs/blue/ready/. (6-7 may still be redone later.)
- (2026-10-21) User: 198, 199, 200 (technologists at a laptop) — replace the person with a blue silhouette; then: remove the hair and the clothes too, and make ONE sticker, not three. `packs/blue/technologist/` from 200: face features and hair removed, skin and shirt → body gradient, the head's back and the ears (drawn in the shadow colour) repainted to skin first — new restyle.mjs recipe key `repaint` (per-layer source colour swap). Laptop untouched. 13.4 KB, draft.
- (2026-10-21) User: a copy in the original 👤's manner — rounder skull, ears drawn into the head, dark outline down the neck under the ears. `packs/blue/technologist-bust/` (`build.mjs` + `head.json`): after restyle the oval head and Ears are replaced by bust.tgs's silhouette (vertices 2–14: head, ears, neck; scaled 1.22, crowns level) on a layer parented to HEAD, under the shirt, plus bust's crown rim; shoulder rims = the shirt outline in #a5d6ea trimmed (L 0–68 %, R 32–100 %). `technologist/` kept as is. 12.7 KB.
- (2026-10-21) User approved technologist-bust («идеально») → packs/blue/ready/. Next: 221 (family photo) — the user wants to try it in OpenAI Codex; the brief is docs/prompts/codex-221-family.md (who is which layer, mouth key frames, style references).

### Синий пак: 👨‍👩‍👧‍👦 семейное фото 221 (2026-10-21)

- Сначала разобраны исходные пути ртов и крупные кадры. Пользователю показана таблица:
  дети начинают с открытыми ртами и по очереди закрывают их; позднее правый ребёнок
  смеётся одновременно с папой; у мамы меняется улыбка, отдельного широко открытого рта нет.
  Пользователь выбрал: **«Точно сохранить мимику и тайминги оригинала»**.
- Уточнение по первому рендеру: **«шею надо убрать … чтобы только головы были»**;
  **толщина обводки головы и тела должна совпадать**. Итог: замкнутые головы без шей,
  контур и блик 8 px, как исходная обводка тела.
- `packs/blue/family/`: неизменённая копия `library/emoji/221.tgs`, `recipe.json`,
  `heads.json`, `build.mjs`, `analyze.mjs`, `verify.mjs`, README с таблицей мимики.
  Сборка вызывает общий restyle, затем ставит головы из 👤 с ушами и новым подбородком,
  сохраняя исходную высоту и ключи деформации головы. Тела — исходные простые формы,
  синие контуры/тени/блики, свой общий градиент головы и тела для каждого человека.
- Рты: исходные линия и полость у детей/папы, исходная линия улыбки у мамы — белые;
  цветная кожа под губами и помада исключены. Контуры, ключи, easing, transform и
  родительские цепочки не менялись. Головы родителей позади детей.
- `top hair 3` оказался белой вспышкой по всей семье, а не волосами. Её экспозиция
  65–70 и transform сохранены, контур заменён снимком новых силуэтов. Корень целиком
  восстановлен из оригинала: фото, фон, рамка, матт, вспышка и короткие жёлтые лучи
  не меняются. Жёлтого/оранжевого в самих людях нет. Исходный голубой фон читается.
- `exports/blue/family.tgs`: 14.2 KB, 512×512, 60 fps, 3 с. Все 180 кадров отрендерены
  и просмотрены; точное покрытие белых ртов во всех кадрах совпало с исходными группами,
  перекрашенными в белый. Проверены исходник, transform, геометрия тел, ключи голов,
  обводка 8 px, отсутствие шей и палитра людей. Сравнение оригинал/синий:
  `exports/sheets/blue-family.png`; крупные кадры, шесть полных листов и отчёт:
  `exports/sheets/family/`. Подробности — `packs/blue/family/README.md`.
- В `ready/` не переносился, коммитов нет. Общий restyle и UI не менялись.
- Итоговые проверки: `bash scripts/check.sh exports/blue/family.tgs` — PASS с одной исходной
  заметкой про матт; `npm run typecheck`, `npm test` (18 файлов, 627 тестов), `npm run build`
  — PASS. Индекс и миниатюры библиотеки обновлены, `family` доступен в черновиках.

### Синий пак: одобрение family и 🫣 069 (2026-10-21)

- Пользователь одобрил family: **«Супер вообще утверждаю, получилось хорошо»**.
  `exports/blue/family.tgs` скопирован в `packs/blue/ready/family.tgs`; утверждённые
  головы без шеи и обводка 8 px — эталон для следующих эмоций.
- По просьбе пользователя открыта вкладка Codex с приложением `http://localhost:5173/`.
- 069 🫣: круг заменён головой family с ушами и округлым подбородком; руки перекрашены
  в синий, у каждой свой градиент, контуры и блик головы/обводки рук — 8 px.
  После первого просмотра пользователь уточнил: **«глаза не нужно, только рот»**.
  Итоговая мимика — только белый рот: исходные тёмный край и полость, без тёплых бликов,
  глаз и бровей. Напряжённая линия, испуганный открытый рот и дрожание — по оригиналу.
- `packs/blue/peeking-face/`: source, recipe, head.json, build.mjs, verify.mjs, README.
  `BODY` и весь риг/ключи сохранены, пути рук и рта не меняются. Убраны только старые
  тени рук, рассчитанные на круг. Геометрия головы читается из family/heads.json и 👤.
- 27.0 KB, 512×512, 60 fps, 3 с. Покрытие белого рта, включая перекрытие руками,
  совпало с исходником во всех 180 кадрах; рот остаётся внутри головы. Палитра,
  одинаковая обводка 8 px, отсутствие глаз/бровей, сохранение рига/путей проверены.
  Все 180 кадров просмотрены; сравнение — `exports/sheets/blue-peeking-face.png`.
  Черновик, в `ready/` не переносился. Общий restyle и UI не менялись; коммитов нет.
- Итоговые проверки 069: Telegram PASS; typecheck, 18 файлов / 627 тестов и production
  build — PASS. Вкладка Codex с приложением обновлена, 069 открыт в редакторе.
- После просмотра пользователь одобрил 069: **«супер вообще»** — скопирован в
  `packs/blue/ready/peeking-face.tgs`, индекс библиотеки обновлён.

### Синий пак: 💩 111 и 💙 сердце (2026-10-21)

- Пользователь: у 111 поменять цвет на синий, убрать мух/дым/глаза, оставить рот
  и исходное движение из стороны в сторону. `packs/blue/poop/`: source.tgs,
  recipe.json, build.mjs, README. Тело сохраняет объёмные градиенты, перекрашенные
  в палитру пака, контуры #335375 и мягкие блики #8cb7d3. Улыбка белая, исходные
  пути Group 1/2/3; внешние тени губ исключены. Все 47 ассетов удалённого дыма
  исключены из результата. Риг, геометрия тела/рта, ключи и движения исходные. 6.2 KB.
- Одновременно пользователь попросил взять любое сердце и просто перекрасить
  в цвета пака. Выбрано обычное красное сердце 649 с пульсацией и поворотом:
  `packs/blue/heart/{source.tgs,recipe.json,README.md}`; сборка общим restyle.
  Контур #335375, заливки #44688b / #6086a7 / #7ba3c3, блики #8cb7d3 / #a5d6ea.
  Поменялись только цвета; геометрия, матты, непрозрачность и движение сохранены.
  Силуэт/alpha рендера побайтно совпали с оригиналом во всех 180 кадрах. 55.4 KB.
- Оба: 512×512, 60 fps, 180 кадров / 3 с; исходники побайтно совпадают с библиотекой,
  тёплых красок не осталось. Кадры отрендерены, крупные планы и фазы поворотов
  просмотрены. Сравнения — `exports/sheets/blue-poop.png`, `blue-heart.png`;
  общий лист — `blue-poop-heart.png`; отчёт — `poop-heart-verification.json`.
  Это черновики, в `ready/` до одобрения не переносить. Общий restyle и UI не менялись,
  коммитов нет.

### Синий пак: одобрение 💩/💙 и facepalm 211–213 (2026-10-21)

- Пользователь одобрил какаху и сердце («По этим двум … всё хорошо»):
  экспорты побайтно скопированы в `packs/blue/ready/poop.tgs` и `heart.tgs`.
- Следующая задача — один facepalm из 211/212/213. Сравнены три исходника:
  движение одинаковое, отличаются волосы/одежда; основа — неизменённый 213.
  `packs/blue/facepalm/{source.tgs,recipe.json,build.mjs,README.md}`.
- Уточнение пользователя: **«Футболку надо будет убрать … Они просто силуэты …
  просто синее тело должно быть снизу»**. Сохранена исходная форма плеч, исключены
  воротник, шея, швы, рукав и манжета. Предплечье построено до анимированного
  запястья; у кисти разомкнут поперечный контур запястья, общий градиент руки
  непрерывен при поворотах. Старые тени ладони с поперечной границей исключены.
- Голова — одобренная family без шеи, с ушами и округлым подбородком; параметры
  читаются из `family/heads.json` и `base/bust.tgs`. Обводки головы, руки и тела —
  8 px, #335375; блик макушки #a5d6ea, тело #44688b / #6086a7 / #7ba3c3.
  Волосы, глаза, брови и нос исключены, сохранён белый исходный рот.
- Риг, родители, исходные transforms, ключи рта и Splash не изменены.
  Стык предплечья и координаты общего градиента запечены на 180 кадров,
  без выражений/масок. Сборка проверяет исходник, риг, пути плеч/рта, родителей,
  Telegram и все 180 непустых кадров. Просмотрены лист всех кадров и крупные фазы.
- `exports/blue/facepalm.tgs`: 36.6 KB, 512×512, 60 fps, 3 с, Telegram PASS.
  Сравнение — `exports/sheets/blue-facepalm.png`, все кадры —
  `exports/sheets/facepalm/all.png`. Typecheck, 18 файлов / 627 тестов и build PASS.
  Индекс обновлён: 32 готовых, 34 черновика, все читаются. Facepalm пока черновик.
- Пользователь сам управляет интерфейсом; дальнейшие действия в UI не выполнялись.
  Общие скрипты не менялись, коммитов нет.

### Синий пак: 🫡 072, 🤷 214–216 и исправление facepalm (2026-10-21)

- Пользователь одобрил facepalm («тоже апрувую»); он перенесён в `ready/facepalm.tgs`.
  Затем пользователь показал две чёрточки на контуре под кистью. Причина — концы
  раздельных обводок кисти/предплечья. Заменены одним непрерывным замкнутым контуром
  всей руки, без концов линий на запястье. Контур запечён через два кадра с округлением
  до 0.01; заливки кисти, детали пальцев и исходные transforms не менялись.
  Контур следует исходной экспозиции кисти. Исправлены и экспорт, и готовая копия:
  они побайтно совпадают. 63.4 KB, Telegram PASS; крупные кадры проверены.
- 072: `packs/blue/saluting-face/`, неизменённый исходник 072, recipe и build.
  Круг заменён одобренной головой 069/family, руки синие, рот исходный белый.
  Глаз нет; их слой оставлен пустым null, потому что он анимирует положение рта.
  Рот Group 9/10, внешние тёплые тени исключены. Исходные риг, движения руки,
  геометрия рта и кадрирование справа сохранены. 163 кадра, 32.3 KB, Telegram PASS.
- 🤷: `packs/blue/shrug/`, один вариант для 214–216 на основе 215.
  По прямому указанию **губы именно из 215**: исходные Group 1/2 перекрашены в белый,
  их геометрия/ключи не менялись. Нос — пустой анимированный родитель рта.
  Волосы, глаза, брови, нос и старые уши исключены, голова family без шеи.
- Уточнения пользователя по 🤷: не делать палочные руки; ориентироваться на
  официальные синие силуэты; убрать линии перехода от тела к рукам; сделать руки
  толще, корпус не толстым; уменьшить относительный размер головы и проработать формы.
  Проверены официальные 👤/👥/🫂 как визуальные референсы. Итоговое тело и обе руки
  **одна векторная заливка с общими внешними контурами**, без стыковых обводок плеч.
  Корпус вытянут, талия уже плеч; локти округлые, предплечья мягко расширяются
  от запястий, добавлен блик вдоль плеч по образцу 👤. Голова уменьшена на 10%,
  её обводка компенсирует масштаб слоя и совпадает с телом (8 px).
  Исходный жест, движения ладоней, пальцев и корпуса сохранены; новый контур
  тела/рук запечён через три кадра, градиент ладоней продолжает градиент предплечий.
  Без masks/expressions/merge paths. 55.4 KB, 180 кадров, Telegram PASS.
- Помощники новых вариантов: `packs/blue/lib/silhouette.mjs` — шаблон головы,
  градиенты, выборка ключей/матрицы и рендеры. Общий restyle не менялся.
  Сравнения — `exports/sheets/blue-saluting-face.png`, `blue-shrug.png`;
  все кадры/крупные планы и отчёты в одноимённых папках.
  Источники проверены побайтно, тёплых пикселей нет во всех кадрах обоих вариантов.
  Все 180 кадров 🤷 имеют один связный видимый силуэт; начало/конец совпадают.
  Отчёт — `exports/sheets/new-silhouettes-verification.json`.
- Typecheck, 18 файлов / 627 тестов, production build PASS. Индекс обновлён:
  33 готовых, 36 черновиков, все читаются. 072 и 🤷 пока черновики до одобрения.
  Действий в интерфейсе нет, коммитов нет.
- (2026-10-21) User: 🤦 (facepalm) approved; 🤷 «получилось очень плохо… тело глупость, руки странные, обводка неправильная — переделать полностью». Redone by Claude: 215's own body and arms recoloured by recipe (greys → body gradient / #335375 outline / #44688b shadow; restyle `repaint.gradient` flattens a layer's gradient fills first), the approved facepalm head (packs/blue/lib/silhouette.mjs `head`) on HEAD 2, 215's lips white, cuffs merged into the forearms with one continuous outline per arm side (baked every 3 frames). 24.6 KB, PASS. Codex's version backed up outside the repo, not kept.

### 🤷: обводка головы и тень запястий (2026-10-22)

- Пользователь попросил сохранить текущую переделку Claude и исправить только:
  обводку головы сделать толще под тело, тень на бывшем стыке рукава/кисти смягчить.
- `packs/blue/shrug/build.mjs`: контур и блик головы — ширина обводки BODY,
  делённая на собственный масштаб HEAD 2 (68.394%). Локально 11.697 px вместо 8,
  видимая толщина — 8 px, как у тела, до общего масштаба фигуры.
- Градиенты ладоней преобразуются из координат предплечий через обратную матрицу
  текущего запястья, запечены через 3 кадра. У тени ладони Group 5 вместо плоской
  заливки — тот же #44688b с плавным затуханием до alpha 0 на стыке за 32 единицы;
  ось затухания следует морфу запястья. Нет резкой тёмной полосы на месте обшлага.
- Все пути, layer transforms, рот и прочие слои версии Claude сохранены.
  Проверены побайтное совпадение исходника 215, геометрия/риг/остальные слои,
  равенство видимой ширины обводки и совпадение осей градиентов на ключах
  с ошибкой менее 0.002. Отчёт: `exports/sheets/shrug/wrist-fix-verification.json`.
- 28.9 KB, 180 кадров, Telegram PASS. Typecheck, 18 файлов / 627 тестов и build PASS.
  До/после: `exports/sheets/shrug-wrist-fix.png`; обычный лист кадров обновлён.
  Индекс/превью библиотеки обновлены. Вариант остаётся черновиком до одобрения.
  Общие скрипты и UI не менялись, коммитов нет.

### 🤷: остаточный стык запястий (2026-10-22)

- Пользователь показал остаточные полосы на бывших обшлагах и попросил сделать
  переход менее заметным. Удалён замыкающий поперечный отрезок обводки ладоней
  (вершины 1→2); верхние вершины бывшего обшлага и концы боковых контуров теперь
  точно следуют двум нижним вершинам движущейся ладони через её transform.
- Тень ладони ослаблена до 60%; начало затухания отодвинуто на 14 единиц от стыка,
  полная сила достигается к расстоянию 62. Убрана цветовая полоса на запястье.
  Голова/её обводка, тело, губы и риг сохранены. 29.5 KB, Telegram PASS.
  Все 180 кадров отрендерены, листы и черновик обновлены. В ready не переносился.

### 🤷: кисти крупнее, плавное сужение, без пиксельного зазора (2026-10-22)

- Пользователь: предыдущий стык стал заметнее, есть пиксель между кистью и рукавом;
  увеличить кисти и сгладить резкое сужение. Кисти увеличены на 10% вокруг прежней
  опоры; ширина их контуров обратно компенсирует масштаб. Сдвиг кистей к центру
  на 10 единиц удерживает увеличенные пальцы в холсте во всех фазах.
- Бывшие отдельные обшлаги и короткие угловатые участки контуров исключены:
  у каждого предплечья одна заливка до ладони и плавные кубические стороны,
  сопряжённые с касательными краёв ладони. Сохранены локти/их тени из исходника.
  Заливка заходит в ладонь на 2.5 единицы, ладони рисуются поверх перекрытия.
- Проверены все 180 кадров в 512×512: 9000 проб поперёк обоих стыков и на ±2 px
  имеют alpha 255; прозрачных пикселей нет. Пальцы с обводкой в границах холста.
  Остальные слои, включая тело, голову/обводку и губы, совпадают с предыдущими.
  Отчёт: `exports/sheets/shrug/wrist-shape-verification.json`.
- 27.2 KB, Telegram PASS. Typecheck, 18 файлов / 627 тестов, build PASS.
  Черновик, кадры и индекс обновлены; в ready не переносился. UI не трогали.

### 🤷: шире на стыке кистей с предплечьями (2026-10-22)

- Пользователь: руки странно сужаются к кистям, сделать шире на стыке.
  Расширена нижняя часть ладоней/запястья на 35%, с плавным спадом изменения
  к пальцам. Вершины и управляющие точки кривых деформируются вместе.
  Предплечья автоматически сопрягаются с расширенными краями ладоней.
- Ширина стыков выросла в 1.349 / 1.343 раза; все 180 кадров и 9000 проб
  поперёк стыков проверены — alpha 255. Голова, тело, рот и остальные слои
  сохранены. Отчёт: `exports/sheets/shrug/wide-wrists-verification.json`.
- 29.1 KB, Telegram PASS; черновик и превью обновлены. В ready не переносился.

### 🤷: естественный изгиб 60/120 и подготовка ветки (2026-10-22)

- Пользователь показал неестественную впадину при изгибе левой кисти около кадра 60,
  слабее около 120, и попросил исправить, закоммитить и отправить в отдельную ветку.
- Причина: фиксированная направляющая длиной 34 тянула верхнюю часть предплечья
  внутрь, когда ладонь поворачивалась от оси предплечья. Длина теперь ограничивается
  углом и боковым отклонением; направление касательной к ладони сохраняется.
  Проверены крупные кадры 55/60/65 и 115/120/125. Остальные формы и движения сохранены.
- Добавлен воспроизводимый `packs/blue/shrug/verify.mjs`: 180 кадров плюс 42
  промежуточных позы, 11100 проб стыков (alpha 255). Максимальная впадина контура
  относительно хорды — 0.455 единицы; тело/риг и одинаковая обводка проверены.
  Сравнение: `exports/sheets/shrug-bend-fix.png`, отчёт — `shrug/bend-verification.json`.
- Typecheck, 18 файлов / 627 тестов, production build PASS. Проверены 33 готовых
  стикера и черновики shrug/saluting-face: 35 TGS, 0 ошибок. Индекс обновлён.
  README дополнен запуском библиотеки после клонирования и командами сборки/проверки.
- Ветка для накопленной работы: `codex/blue-pack` (исходники/готовые стикеры,
  рецепты, сборки, библиотека с анимированными превью и совместимость скриптов с Windows).
  Сгенерированные exports, миниатюры и исходный архив 997 эмодзи остаются вне git.
  Сборка shrug, verify и индекс дополнительно прошли на копии только подготовленных
  к коммиту файлов, без library/emoji и прежних exports: 33 готовых и новый черновик
  доступны; внешние зависимости переиспользованы из установленного node_modules.

### Family: серый фон; новая рука из ZIP (2026-10-22)

- По просьбе пользователя фон фотографии family заменён на `#A2A2A2`.
  Цвет вынесен в `recipe.photoBackground`; сборка меняет только заливку корневого
  слоя `background`. Проверка подтверждает неизменность остальных корневых слоёв,
  рамки/движений и совпадение белых ртов во всех 180 кадрах. Обновлена одобренная
  копия `ready/family.tgs`, 14.2 KB.
- Из архива `gifts_emoji_by_gifts_changes_bot_AgADQYMAAuJoeEs.tgs.zip` создан
  `gift-hand/`: синий жест рукой без банта/манжеты, металлических бликов и звёзд.
  Сохранены исходные закрытые заливки, линии пальцев, морфинг и родительский риг;
  градиент един для всех частей, обводка 8 px в цветах пака. 22.3 KB, 180 кадров.
- `gift-hand/verify.mjs` сверяет геометрию/риг с исходником, палитру/обводку и все
  180 кадров на обрезание краями холста. Крупные позы и общий лист просмотрены.
  Новый эмодзи остаётся в черновиках «Жест рукой · синий», индекс обновлён.
- Оба TGS прошли Telegram checker. Typecheck, 36 файлов / 1254 теста и build PASS.
  UI не трогали; изменения локальные, новых коммитов и push не было.

### Рука из ZIP: объём в стиле остальных рук (2026-10-22)

- Пользователь подтвердил движение, но попросил добавить тени и хайлайты:
  плоская версия слишком простая. Сравнены готовые middle-finger, victory-hand
  и raised-hand. Добавлены светлые края пальцев и ладони `#a5d6ea`, тени между
  пальцами, у большого пальца и по краю ладони `#335375`.
- Шесть светлых и двенадцать теневых деталей следуют исходным анимированным
  путям и transform; золотые блики/полосы и белые звёзды не возвращались.
  Матт по прежнему силуэту убирает выступавшие за низ ладони мягкие тени.
- Проверены исходные контуры, риг, пути света/теней, палитра и все 180 кадров:
  обрезания и выхода теней за контур нет. 44.2 KB, Telegram PASS.
  Черновик и индекс обновлены. Typecheck, тесты и production build PASS.

### Рука из ZIP: убрать мягкие затемнения (2026-10-22)

- Пользователь: затемнения слишком гладкие по сравнению с другими руками;
  между пальцами и снизу ладони их убрать, хайлайты устраивают.
- Удалены все 11 мягких теней между пальцами и на ладони. Единственная тень
  у большого пальца заменена плоской заливкой `#44688b`, без размытого перехода.
  Все шесть хайлайтов побайтно совпадают с предыдущей версией JSON.
- Геометрия и анимация прежние; проверены все 180 кадров. 38.6 KB, Telegram PASS.
  Черновик и индекс обновлены, в ready не переносился.

### Одобрение пака и крупные головы 070/089/082/035 (2026-10-22)

- Пользователь одобрил все существовавшие варианты, кроме technologist.
  Добавлены ready-копии gift-hand, saluting-face, shrug; оба technologist остаются
  черновиками, прежний ready/technologist-bust исключён. В готовом паке 35 файлов.
- Четыре новых черновика: 070 — хихикает за синей рукой, 089 — зевает с Z из 090,
  082 — стиснутые белые зубы и стекающие капли, 035 — шапка и свистелка с конфетти.
  Головы используют одобренный контур 069 размером 300×378.29418, без шеи и глаз.
  Риги, морфинг ртов и движения рук исходные. Капли 082 перенесены к более узкому
  контуру; шапка 035 сдвинута внутрь, макушка не обрезается при верхнем прыжке.
- По замечанию пользователя в 089 добавлена белая заливка самой полости рта,
  вместе с верхним краем: Group 1 + Group 2. Z из 090 стали белыми с синим контуром;
  их непрозрачность привязана к фактическому раскрытию рта (при закрытом букв нет).
- Проверка `lib/verify-large-faces.mjs`: неизменённые исходники, риги/контуры ртов,
  пути рук и аксессуаров, отсутствие глаз, согласованность Z с зевком и 180 кадров
  каждой головы без обрезания. Все 7 новых/перенесённых TGS прошли Telegram checker.
  Typecheck, 36 файлов / 1254 теста и production build PASS. Индекс обновлён:
  35 готовых, 41 черновик. Новые четыре пока в черновиках, UI не трогали.

### 096/075/045/074 и полная белая заливка губ 035 (2026-10-22)

- Пользователь одобрил предыдущие 070/089/082/035 («супер вообще») и запросил ещё
  четыре. Предыдущие варианты перенесены в ready: теперь 39 готовых, technologist
  по-прежнему исключён. По скриншоту 035 исправлена пропущенная основная заливка
  губ Group 5: теперь группы 1–5 белые. Ready-копия и превью обновлены, 22.7 KB.
- 096: крупная синяя голова без глаз, белый рот, исходная синяя рука. Бегунок и
  звенья молнии сохранены целиком в оригинальном металлическом цвете. 25.4 KB.
- 075: синяя голова без глаз/бровей, белая мимика, растущий синий нос. Заливка
  основания носа согласована с градиентом головы на каждом кадре. 21.7 KB.
- 045: синяя голова и руки, натягивающие белую улыбку. Сохранены и общий риг,
  и дополнительный анимированный поворот группы головы. 5.3 KB.
- 074: верх головы и уши из 069; нижние 17 узлов и управляющие точки переносят
  исходные смещения растекания, с компенсацией ширины головы. Исходные времена,
  easing, наклоны и белый рот сохранены; цикл замкнут. 7.3 KB.
- Общая проверка расширена до 8 больших голов: неизменённые исходники/риги,
  геометрия ртов/рук/аксессуаров, контроль морфинга 074 и 180 кадров каждого без
  обрезания. Пять TGS (четыре новых и 035) прошли Telegram checker.
  Typecheck, 36 файлов / 1254 теста и production build PASS. Новые четыре остаются
  в черновиках, индекс обновлён: 39 готовых, 45 черновиков. UI не трогали.

### Одобрение 096/075/045/074 и статичный L-жест (2026-10-22)

- Пользователь: «Супер, все добавляй». Четыре последние головы перенесены в
  ready, всего 43 готовых, оба technologist по-прежнему исключены.
- Запрошен L-жест в стиле W/gift-hand: сначала только статичный рисунок,
  позже быстрое качание влево/вправо. Создан `loser-hand/`: указательный вверх,
  большой вправо, три согнутых пальца; единая ладонь, толстая синяя обводка,
  узкие светлые хайлайты и одна плоская тень. Кубические пути редактируются
  в build.mjs, JSON рисунка сохранён для редактора.
- Статичный TGS 1.4 KB, 180 идентичных кадров; проверены отсутствие ключей,
  одинаковый рендер на 8 кадрах и Telegram checker. В ready не переносился.
  PNG с прозрачностью и превью — `exports/sheets/loser-hand/`.
  Индекс обновлён: 43 готовых, 46 черновиков. UI не трогали.

### L: исходная анатомия 145 и покачивание 143 (2026-10-22)

- Пользователь отверг ручную отрисовку и указал на готовую L-позу в 145;
  запросил взять её и анимировать как 143. Просмотрены 137/145/143 и крупные
  фазы 145; выбрана поза кадра 70 (три согнутых пальца, большой в сторону).
- Ручной рисунок заменён полностью. 145 перекрашивается общим restyle пака,
  затем замораживается в кадре 70; невидимые в этой фазе слои исключены.
  Исходные контуры/складки/пальцы сохранены. На всю позу перенесены три null-слоя
  рига 143 без изменения ключей/easing, включая вращение и движение вверх-вниз.
- Сравнение замороженной позы с кадром исходника: 13 каналов на границе сглаживания,
  максимальная видимая разница 1.008/255. Внутри позы нет ключей анимации;
  180 кадров общего движения проверены, минимальный запас до края 13 px.
  8.4 KB, Telegram PASS. Typecheck, 36 файлов / 1254 теста и build PASS.
  Черновик и индекс обновлены; в ready L не переносился, UI не трогали.

### L: упругость указательного и большого пальца (2026-10-22)

- Пользователь попросил добавить живости пальцам при махах: указательному как
  в 143, большому слабее. Перенесены исходные смещения кончика Index 4 из 143
  с его ключами/easing; деформация плавно затухает к основанию. Большой получает
  повёрнутый в свою ось изгиб с амплитудой 30% от указательного.
- Деформируются согласованно 21 путь: контуры, заливки, блики, тени и примыкающие
  участки ладони. Риг покачивания целиком и три согнутых пальца сохранены.
  Величины задаются `recipe.fingerFlex`, алгоритм — `loser-hand/finger-flex.mjs`.
- Проверены ключи/нейтральная поза/основания и амплитуды: указательный в кадре 36
  смещается как в 143 на [43.547, 23.144], большой — [-6.943, 13.064], отношение 0.3.
  Все 180 кадров без обрезания, запас 15 px. 21.3 KB, Telegram PASS.
  Typecheck, 36 файлов / 1254 теста и build PASS. Черновик/индекс обновлены,
  в ready L не переносился. Сравнение — `loser-hand/finger-flex-compare.png`.

### Одобрение L и архив для Telegram (2026-10-22)

- Пользователь одобрил L и попросил собрать весь готовый пак, кроме technologist.
  L перенесён в ready; всего 44 эмодзи, оба technologist остаются вне ready.
- `scripts/package-blue.py` собирает `exports/blue-pack.zip`: 44 исходных TGS
  без перекодирования, инструкция, предложенные привязки к обычным эмодзи,
  CSV с размерами и SHA-256. Проверены размеры/частота/длительность, лимит 64 КиБ,
  целостность ZIP и точное совпадение распакованного содержимого с ready.
- Индекс библиотеки обновлён: 44 готовых, 46 черновиков, нечитаемых файлов нет.

### Локальный Telegram pack bot (2026-10-22)

- По просьбе пользователя добавлен `scripts/telegram-pack-bot.py` без сторонних
  библиотек, Windows-запуск `scripts/start-telegram-bot.cmd`, `.env.example`
  и инструкция `docs/telegram-pack-bot.md`. `.env` и Python-кэш исключены из Git.
- Бот читает ZIP/manifest.csv, проверяет хэши/лимиты, назначает привязки с учётом
  составных эмодзи. Диалог: эмодзи/стикеры/оба → название → ссылка → публикация.
  `user_id` владельца — аккаунт пользователя, доступ привязывается кодом из консоли.
- Ссылки получают обязательный суффикс `_by_<bot_username>`. Загруженные file_id
  и параметры публикации сохраняются локально: второй тип использует тот же кэш,
  повтор после сетевого сбоя проверяет уже созданный набор и избегает дубликатов.
- 10 офлайн-тестов PASS: архив 44 TGS, повреждение ZIP, составные эмодзи,
  ограничения имён, владелец/привязка, параметры API, кэш и восстановление после
  неопределённого результата createNewStickerSet. Публикация в Telegram без токена
  не выполнялась; установка набора остаётся действием пользователя по ссылке.

### Диагностика паузы на 10/44 (2026-10-22)

- Проверены только состояние процесса, счётчики локального кэша и read-only getMe:
  процесс жив, токен действителен, 10 файлов сохранены, создание наборов ещё
  не запускалось. Токен и file_id не выводились; текущая загрузка не прерывалась.
- Старый статус обновлялся раз в пять файлов и молчал при retry_after. Это не
  позволяло отличить сетевой запрос от ожидания лимита Telegram; конкретный 429
  текущего процесса не подтверждён. Добавлены статус каждого файла, консольный
  прогресс и обработчик 429 с временем ожидания и оставшимися секундами в /status.
- 12 офлайн-тестов PASS, включая точное соблюдение retry_after и статус паузы.
  Изменения применятся после перезапуска пользователем; кэш загрузки сохранён.

### Pack bot V2 и исправление six-seven (2026-10-22)

- По просьбе пользователя подготовлена отдельная V2 без остановки/перезапуска
  действующего процесса. Новый запуск — `scripts/start-telegram-bot-v2.cmd`.
- `/add` сверяет ZIP с существующим набором и добавляет только отсутствующие
  файлы, `/packs` показывает известные ссылки. Совместимость с кэшем/историей V1;
  архив перечитывается для каждой операции. Поддержаны порции создания по 50,
  пределы 200 эмодзи / 120 обычных стикеров, восстановление после частичного
  добавления и потери ответа API без дубликатов, сверка file_unique_id.
- Одна последовательная очередь передач с базовой паузой 8 с, адаптивным
  замедлением и сохранением retry_after между перезапусками. Сообщения имеют
  отдельное ограничение частоты. Одно сообщение прогресса редактируется раз в 5 с,
  показывает текущий файл, ожидание и ссылки; итог фиксируется от перезаписи
  статусом следующего задания. Тесты используют только mock API и временное состояние.
- Пользователь прислал реальный лог: после корректного ожидания 429 Telegram
  отклонил six-seven с wrong file type. Найдены 17 статических скалярных свойств
  с k:[number] вместо k:number. Исправлена заморозка в six-seven/build.mjs.
  Все 180 кадров до/после совпали пиксель в пиксель. Один проверочный uploadStickerFile
  исправленного файла принят Telegram; публикация/сообщения/текущий polling не трогались.
  Готовый файл и ZIP обновлены; квитанция загрузки в отдельном файле, V2 импортирует
  её только для соответствующего бота. Добавлена проверка статических скаляров
  при чтении архива. Токен в выводы не попадал.
- Проверки: 13 тестов V1 + 18 тестов V2 PASS, typecheck, 36 файлов / 1254 теста
  редактора и build PASS; checker six-seven PASS. Индекс: 44 готовых, 46 черновиков,
  нечитаемых нет. Действующий процесс и его файл состояния не изменялись.

### L: приглушение блика большого пальца (2026-10-22)

- Пользователь попросил приглушить слишком яркий блик L и дать файл для ручной
  замены. Возможность замены через бота отложена; код бота не менялся.
- Только два светлых заполнения Thumb Down Shad 2 изменены на #8cb7d3, opacity 55.
  Параметры записаны в recipe.thumbHighlight, рисунок и движение сохранены.
- Проверка исходников/рига/амплитуд и всех 180 кадров PASS, Telegram checks PASS.
  Файл ready и ZIP обновлены. Привязка L остаётся 👆.
- (2026-10-22) User: work from the phone over a Cloudflare tunnel, a password on the page, a «В Telegram» button for a draft, the site usable on a phone. Done: `server/remote.ts` (Vite plugin: /__login with SITE_PASSWORD for tunnel requests, local requests pass; /api/telegram/{info,sets,status,add}); bot V2 got a 127.0.0.1-only control server (BOT_CONTROL_TOKEN, POST /append = /add «Добавить», 409 while busy; 2 new offline tests, 20 pass); the emoji map of package-blue.py moved to packs/blue/emoji.txt (archive contents unchanged); Library: «Открыть» and «В Telegram» (TelegramPanel) in the bottom bar, short set names on phones; Toolbar icon-only on phones, «Образцы» hidden; Preview stage fluid up to 512 px. `scripts/remote.mjs` starts editor + bot + quick tunnel. Checked: tunnel without login → 303/401 for pages, files, API, .env; right password → 200; 375 px layout without horizontal scroll. No real add to Telegram was triggered by Claude. docs/remote.md.
- (2026-10-22) User: 022 (blown kiss) like Codex's large faces, no eyes, white mouth, make the kiss look right. `packs/blue/kissing-face/`: 069 head in the circle's group, eyes removed, smile and pucker white, the big flying lips white with #335375 outline and light-blue shade, the lip print on the glass white. 19.7 KB, PASS, draft.
- (2026-10-22) User: 062 (😱) and 068 (🤔). `packs/blue/screaming-face/`, `packs/blue/thinking-face/`: hands by recipe, eyes/brows/hand shadows removed, mouths white, the 069 head in place of the circle; new `packs/blue/lib/fit-head.mjs` builds it per keyframe of the circle narrowed to 300:378, so the 😱 head stretches with the scream. 7.2 / 9.1 KB, PASS, drafts.
- (2026-10-22) User: «Добавить» on the site must just add the chosen sticker, not walk the whole pack. Found: V2 never recognised stickers already in a real set (a set sticker has other file_id/file_unique_id than its upload), so the first site add sent all 45 files; Telegram itself skipped identical files except a second new 👆 (emoji set positions 44 and 46). Fix: the site sends `files: [<id>.tgs]`, the bot adds only those; presence by SHA-256 of set stickers of the same size (downloaded once, cached in `set_hashes`). Publisher.save retries os.replace on Windows locks. V1 13 / V2 22 tests pass. The duplicate 👆 is left for the user to decide.
- (2026-10-22) User: 026 (tongue out) + a small V hand, back of the hand to the camera, the tongue between the two fingers; the hand rises, the tongue wags, the hand goes down, looped. `packs/blue/tongue-victory/`: 069 head, white mouth, light-blue tongue; the hand from 154 (backhand index up) frozen at frame 0 (new `packs/blue/lib/freeze.mjs`, static values written as Telegram wants), the index copied as the middle finger over the first knuckle and spread 24°, outline trimmed to the knuckles; parented to the mouth, up 50–64, down 146–166. 13.4 KB, PASS, draft.
- (2026-10-22) tongue-victory, user feedback (phone screenshot + photo of a real V): face smaller and higher (Resize 78 %, y 165), tongue 80 %, hand fully visible; both fingers now under the hand's fill and turned from their own knuckles (index −14°, middle +17° on the middle knuckle), the fill's top flattened at the knuckle line over them, the middle knuckle arc trimmed from the outline, knuckle highlights removed, finger gradients carried back to match the hand's on the canvas. No mattes.
- (2026-10-22) tongue-victory, user: knuckle shadow still on the middle finger, a sharp cut where the fingers begin, keep the knuckle highlights except the middle one. Now the fingers' outlines are paths inside the hand's own fills (one silhouette, one gradient), finger fills/shade dropped, outlines on top trimmed at computed points with a crotch curve, only the middle knuckle's highlight flattened away.
- (2026-10-22) tongue-victory, user: gesture a bit left (tongue in the middle of the V), no wrist (round bottom like the pack's hands), loop: hand on the left and head on the right meet in the middle for the wag and part again, fingers a little alive on sharp moves. Done: Palm Shad 2 path cut below the wrist line and closed with a round bottom + outline, wrist layers dropped; Resize and the hand holder travel (46–64 in, 148–170 out); a damped spring from the hand's sideways acceleration on the canvas rotates both finger pivots. Composition 73 %, bounds 8–490 px. 15.8 KB, PASS.
- (2026-10-22) tongue-victory, user: gesture still a bit right of the tongue, the jiggle moved only the outlines (fill static, out of sync), a dark dot at the crotch, a sharp knuckle-highlight sliver at the middle finger's base, use the free room left and below. Done: hand `at` 46→38; hand.mjs returns bend(keys), which keys the pivots and bakes the same turn into the finger paths in the hand's fill (only the opaque `With Finger 4`) and the crotch ends (keys only where the swing bends, 0.3°); crotch collapsed to one point; the middle knuckle highlight's points gathered to where the ring one starts; a 'Grow' null 103 % from the top right; rest hand x −215, y +34. 32.4 KB, PASS, bounds 57–421 × 9–502.
- (2026-10-22) Site → Telegram, user: the add button also on the sticker's own page, several stickers at once added in turn, several sets in turn, the pack shown newest first on the site, and the bot sends back each emoji/sticker as it came out. Done: TelegramPanel takes `ids` (click order) with an emoji per sticker and set checkboxes; «Добавить в пак» in the editor's inspector for a sticker opened from drafts/ready; `/api/telegram/add {set, items, names}` checks all first, copies, binds, packages once; bot `remote_append(names, files)` runs them in order per set, then `show()` sends each via `sendSticker` (found by bytes, `Publisher.placed`); library.mjs orders ready/ by reverse emoji.txt. Bot tests 23.
- (2026-10-22) 573 identification-card: пользователь попросил синий улыбающийся портрет, заменить данные на n и сделать рукописную подпись n. Затем уточнил: вместо трёх строк нужна одна большая n справа, и широкая улыбка после появления содержимого. Добавлена папка identification-card/ с неизменённым source.tgs, recipe/build/verify. Сохранены корневой риг, переворот, материал карточки, глобус, появление портрета и ключи прорисовки подписи. Портрет — голова family/069 без глаз/шеи, белый рот. Одна большая строчная n из контуров Roboto Black; росчерк n одним путём. Улыбка растягивается 1.65× по ширине / 2.2× по высоте после появления элементов, удерживается и возвращается. 5.3 KB, 180 кадров, Telegram checks PASS; исходники/риг/замена текста/амплитуда улыбки проверены, минимальный запас до края 20 px. Черновик, без добавления в ready/Telegram.
- (2026-10-22) 573, композиция по замечанию пользователя: голова была низко в рамке, n слишком справа. Портрет целиком поднят на 8 px в координатах холста (рот наследует смещение), n сдвинута влево на 12 px. Визуально проверены центрирование и широкая улыбка; проверка всех 180 кадров PASS, запас 20 px.
- (2026-10-22) Пользователь: отправка с сайта обновляет страницу и сбрасывает открытый эмодзи. Генерируемые exports/, library/, ready/ и emoji.txt исключены из watcher Vite; индекс отслеживается отдельно с custom-событием tgs:library-updated, обновляется только библиотека, без навигации. library.mjs больше не удаляет активные спрайты: новые имеют уникальные имена, индекс заменяется атомарно. Состояние вкладки сохраняется в sessionStorage: открытый документ с текущими правками и семьями цветов, источник, раздел, панель Telegram, выделение в порядке кликов и прокрутка каждого списка/редактора. Документ связан с его именем/источником, сбой записи в хранилище не переименовывает старый документ в новый. Панель Telegram сохраняет привязки/наборы/статус, восстанавливает polling без повторения POST, блокирует двойной клик и показывает ошибки; idle-статус бота больше не считается успехом. Вместо таймера 20 с используется событие готовности индекса. Интеграционный тест реального локального HTTP/Vite с имитацией control API проверяет один /append и отсутствие full-reload; настоящие Telegram-паки тестом не затрагиваются.
- (2026-10-22) Ошибка sendMessage при отправке с сайта: запуск очереди синхронно ждал сообщения прогресса, из-за чего сетевой сбой отменял загрузку, а долгий запрос превышал таймаут control API. Сообщение создаёт отдельный LiveProgress-поток; HTTP подтверждает старт сразу, публикация не зависит от уведомления. Убрано дополнительное блокирующее подтверждение при запуске из чата. Потерянный ответ sendMessage не вызывает повторную отправку сообщения; состояние доступно на сайте и по /status. Подсказка сайта отличает занятость от других ошибок. Регрессии проверяются офлайн, без реальных сообщений/изменений Telegram. Работающий процесс не остановлен, изменения бота применятся при следующем запуске.
  Проверки: V1 13 / V2 26 тестов PASS, typecheck, 39 файлов / 1274 теста редактора и build PASS. Отдельный HTTP-тест подтверждает 202 и добавление файла, пока sendMessage заблокирован; сетевой сбой уведомления не отменяет загрузку и не повторяет сообщение. Read-only getMe подтвердил доступность Telegram; локальный running=false. Токен, сообщения, паки и текущий процесс не изменялись диагностикой.
- (2026-10-22) Пользовательский MemeEmoji_AgADdRwAAmsAAcFK.tgs.zip: два варианта troll face, со складками / гладкий. `packs/blue/troll-face/` сохраняет точный source.tgs из ZIP; общий build собирает `troll-face` и `troll-face-smooth` (рецепт второго в отдельной папке). Сохранены внешняя форма troll face, форма улыбки, риг и все исходные тайминги. Глаза/брови/нос скрыты невидимыми родителями; градиент и обводка из пака, верхняя дуга светлая на исходных анимированных вершинах. Складки — #335375, 65%; в гладком варианте исключены. Зубные ряды белые, широкие фиолетовые просветы заменены тонкими синими разделителями по исходному движению. Нулевой skew удалён для совместимости. 12.0 / 8.6 KB; 180 кадров каждого проверены, запас 32 px, checker Telegram PASS. Оба добавлены в черновики библиотеки, ready/ и Telegram не затрагиваются.
- (2026-10-22) Technologist Bust: пользователь выбрал эту версию и попросил n в кружке вместо самолётика Telegram. В logo.json сохранён точный контур строчной n с identification-card; build подставляет его как вырез в прежнюю серую заливку, используя анимированные оси кружка для перспективы. Побайтовое сравнение структуры подтвердило: изменён только путь самолётика, все остальные данные прежнего Bust совпадают. verify.mjs: 180 кадров, буква внутри кружка, материал/круг/риг прежние, запас 38 px. Telegram checker PASS; typecheck, 39 файлов / 1274 теста и build PASS. Черновик technologist-bust обновлён, индекс библиотеки пересобран.
- (2026-10-22) Сайт не добавлял Bust из-за старого blanket-запрета Technologist is excluded в package-blue.py. Запрет сужен до прежнего technologist; technologist-bust разрешён, README архива обновлён. На изолированной копии проверена упаковка Bust с привязкой 🧑‍💻 и сохранение исключения старой версии. Рабочий ZIP успешно пересобран (50 готовых TGS); отправка в Telegram не запускалась, пользователь может повторить «Добавить» без перезапуска.
- (2026-10-22) 070 Face with Hand Over Mouth: пользователь заметил синюю полосу при закрытии рта. Попытку пересобрать рот целиком пользователь отклонил: старый смех лучше, менять нужно только конец. Восстановлены все прежние контуры и морфинг; изменены исключительно два свойства opacity: плавный переход от открытого рта к исходной маленькой улыбке на 120–126 вместо резкого переключения 130–131. Кадры 0–120 пиксельно совпадают; отдельное сравнение структуры с прежним ready подтверждает, что других отличий нет. После 126 проблемная схлопнутая форма не рисуется. Общая проверка лиц, все 180 кадров, Telegram checker, typecheck, 39 файлов / 1274 теста и build PASS. Ready, ZIP и черновик обновлены. Для замены в Telegram подготовлен одноразовый скрипт в ignored exports: точный старый SHA-256, только третья позиция в двух принадлежащих владельцу наборах, API replaceStickerInSet, без addStickerToSet, без сообщений и перезаписи состояния работающего бота.
  Замена выполнена и проверена скачиванием нового файла: blues_emoji_by_jhthkjbot (53 элемента) и blues_stickers_by_jhthkjbot (51 элемент), третья позиция сохранена, остальные file_unique_id и их порядок совпадают. Новых элементов и сообщений нет. Квитанция загрузки и результат лежат в ignored exports/telegram-bot/, основной state-файл работающего бота не перезаписывался.
- (2026-10-22) zombie-stamp (new sticker, user's idea): a blue zombie rises, a stamp hits its face leaving a bluish n, the head recoils, the stamp flies off, the zombie walks a little and sinks; looped, one zombie and one strike per 3 s. Built in stages with a stop for comments after each. Stage 1, the stamp: user rejected a flat blue one and a flat grey top view ("не уровень телеграмовский", "объёмности нету", no n on the stamp, no white line, must turn and fly in at an angle, out of frame before and after); approved a projected 3D model (packs/blue/zombie-stamp/stamp.mjs, method in docs/3d-objects.md), the knob as one radial gradient (spot glints/arcs rejected); motion shown as video (scripts/video.mjs). Stage 2: 207/208/209 restyled (parts packs/blue/zombie-stamp-<n>), heads replaced by the pack head; restyle.mjs `remove` keeps a removed layer as a null when others hang on it.
- (2026-10-22) zombie-stamp stage 3 approved as a first version («нормас, добавляй пока так») and added to the emoji set (🧟). Telegram's uploadStickerFile answered «wrong file type» although check.sh passed: a keyframe without o/i (the print's opacity, `linear` ease missing) — found by uploading cut-down copies. Spatial to/ti copied onto a scale property were removed too. Lesson: every non-final keyframe needs o/i, Telegram rejects the file otherwise.

- (2026-10-23) Трейлер синего проекта: trailers/blue-crowd/ (scene.json, assets.mjs, render.py, README, loop preview). Видео 1920×1080, 60 fps, 12 с, H.264 BT.709, без звука. Шесть рядов из точной графики technologist-bust с n: независимо сдвинутые фазы/скорости печати, крышки обычных персонажей не закрываются. Пролёт вправо с параллаксом, плавное торможение, остановка 4–8.5 с, затем разгон. Герой первого ряда опускает ноутбук правой рукой, левой показывает отзеркаленный фак, белая улыбка, возвращается к работе. По уточнениям пользователя исключены исходный тычок и тряска кулака (спокойная поза, мягкий подъём/удержание/опускание, обводка согласована с другой кистью); персонажи непрозрачны, один общий белый→прозрачный вертикальный градиент наложен только над пятью задними рядами, первый ряд поверх него. Цикл пространственно и по фазам точен: кадры t=0 и t=12 совпадают побайтно, скорости камеры на стыке равны. MP4: exports/blue-crowd/blue-crowd-trailer.mp4, 720 кадров, 22.5 MB; ffprobe и полное декодирование PASS. Графика рендерится tlottie, композиция установленным Pillow, кодирование установленным FFmpeg; новые зависимости не устанавливались. Typecheck, 39 файлов / 1274 теста и build PASS. Стикеры и паки не изменялись.
- (2026-10-23) Трейлер V2 по замечаниям пользователя: раздельные body/laptop-проходы; внутри каждого ряда все ноутбуки поверх всех тел, плечи соседей за крышками. У героя непрерывное затухание печати в неподвижную позу (3–3.8 с), пауза, опускание ноутбука и выглядывание, затем небольшой наклон головы и жест. Вместо проигрывания исходной анимации всего тела меняется только геометрия крышки; статичная правая кисть привязана к её углу и скрывается за панелью. Левая кисть увеличена до 48%, нижняя часть за ноутбуком, обводка 7.44 px как у второй кисти, покачивание ±1.2°. Рот непрозрачен и морфится из тонкой улыбки в широкую. Камера трогается в 6.5 с при удерживаемом жесте; затем рука опускается, голова возвращается, крышка открывается 8.15–9.45 с. Герой остаётся задумчивым без печати до ухода из кадра. Период мира увеличен до восьми колонок для точного цикла после его ухода. Проверены пиксельное совпадение входной позы с печатью, петля t=0/t=12, отсутствие повторной печати и фейда рта; ffprobe: 1920×1080 / 60 fps / 720 кадров / 12 с, полное декодирование PASS. Новый файл exports/blue-crowd/blue-crowd-trailer-v2.mp4 (22.5 MB), первая версия сохранена. Typecheck, 39 файлов / 1274 теста и build PASS.
- (2026-10-23) Трейлер V3: по просьбе пользователя рот и покачивание головы перенесены из готового face-with-hand-over-mouth (кривые и зубные ряды кадров 20–115, без проблемного закрытия). Рот сначала увеличен до 40%, затем по уточнению ещё в 1.5 раза — до 60% исходника; минимальная высота 65%, без фейда и слишком тонкой линии. Голова наследует мягкое движение и небольшое сжатие/растяжение исходного смеха. Правая кисть подходит к точке захвата по дуге из-за крышки, стартовая позиция скрыта внутри панели. После начала движения камеры левый жест дополнительно раскачивается до ±8° с плавным набором и затуханием, опускается позже (7.8–8.4 с); крышка открывается 8.55–9.65 с. Ноутбуки по-прежнему поверх всех тел своего ряда. Сборка V3: exports/blue-crowd/blue-crowd-trailer-v3.mp4. Typecheck, 39 файлов / 1274 теста и build PASS; проверка пиксельного стыка героя и полного цикла PASS.
- (2026-10-23) По просьбе пользователя сохранён воспроизводимый пайплайн трейлера: docs/trailers.md (сцена, наложение рядов/крышек, исходные кривые, решение рывков и появления кисти, бесшовная камера, проверка и компрессия); ссылка добавлена в CLAUDE.md и scripts/README.md. trailers/blue-crowd/build.ps1 собирает всё одной командой; -TelegramOnly только сжимает мастер. telegram.py фиксирует 720p / 30 fps / H.264 High CABAC / 1400 kbit/s / faststart и проверяет число кадров, длительность и полное декодирование. Проверен и сам скрипт, и PowerShell-обёртка: 2.09 MB, исходный мастер 22.86 MB сохранён отдельно.
- (2026-10-23) 584 coffin: коричневый материал гроба, ручки, обивка и тени переведены в нейтральный серый с сохранением фактуры и исходных градиентов; цветы/стебли прежние. Внутри на подушке — лежащий синий силуэт с головой family/069, без глаз, белая улыбка, руки на груди, цельное тело без одежды/пояса. Векторные пути и градиенты спроецированы в наклонную плоскость ложа; персонаж внутри grob, под оригинальной крышкой. Окно исходника ip=120/op=300 уже равно 180 кадрам/3 с, тайминги и риг не менялись. Папка packs/blue/coffin содержит точный source.tgs, recipe/build/verify/README. Черновик 13.8 KB в библиотеке, без изменения ready/Telegram. Проверки: исходник побайтно, transforms и исходные контуры совпадают, серый материал; все 180 кадров имеют точно исходную внешнюю альфу, стык совпадает. Python-lottie Telegram checker PASS. Визуально проверены открытие, положение на подушке и перекрытие крышкой.
  Общие проверки: typecheck PASS; первый общий тестовый прогон получил таймаут файлового наблюдателя server/remote.test.ts, отдельный повтор и затем полный прогон 39 файлов / 1274 теста PASS; build PASS. Код сервера не менялся.

### 2026-10-23 · 584, 2.5D silhouette revision

User rejected extruded primitive body. Replaced flat caps and vertical side walls with continuous rounded arm/body outlines and radial shading in the coffin floor projection. Rounded the head and removed the waist seam. Original rig and outer alpha preserved across 180 frames; TGS remains a draft, 13.7 KB. Restarted Vite on port 5173. Typecheck and all 1274 tests pass.

### 2026-10-23 · 584 anatomy from 188–190

User requested exact blue skull with ears, connected shoulders, believable legs/feet; 190 primary reference. Inspected rendered 188/189/190. Reused family skull with ears, replaced body silhouette and integrated upper arms, folded forearms and rounded feet without toes. Kept original 584 rig, grey materials, timing, exact outer alpha for all 180 frames. Draft only; no Telegram/ready changes.

### 2026-10-23 · 584 approved raster → static vector

User approved the slim minimalist ImageGen revision (reference saved in packs/blue/coffin/reference/approved.png) and requested close reconstruction with no character animation. Replaced prior procedural anatomy with hand-traced cubic paths and local gradients; preserved original coffin rig/lid animation. Output about 14.9 KB, exact outer alpha over 180 frames, zero loop delta, python-lottie validation passes. Draft only.

### 2026-10-23 · 584 near-wall occlusion and lighting polish

User marked blue bleed behind the inner near rim, uneven crown, oversized near leg, droplet feet and harsh bright rims. Added cubic path clipping against the existing near inner wall with 0.65 px inset (no masks, no rim overpaint), static-path/inside-plane regression check. Smoothed crown, narrowed near leg, simplified/darkened feet, softened rim lights with translucent nested strokes, extended leg gradient and added fading arm contact shadow. TGS 15.8 KB; 180-frame outer alpha and source rig verification pass.

### 2026-10-23 · 193–194 blue clipboard, write → present

User requested replacing police with blue character, keeping clipboard held at both loop ends, writing then turning page to camera instead of stowing. Grey board, white paper under metal clip/rivet; lettering deferred. User clarified original bust framing: clipboard only peeks at the bottom when writing, then approaches almost full canvas when presented. Added packs/blue/clipboard (one variant from 193/194; source files untouched), family head without eyes, white mouth, blue body and 168 writing hand; perspective rotation of board/page/clip with shared grip projection. 180f/60fps, 39 KB; exact loop, all-frame rendering, cropping/presentation regression and python-lottie checks pass. Typecheck, 1274 tests and build pass. Draft only.

### 2026-10-23 · Clipboard: replace custom scene with original 193 rig

User rejected the reconstructed scene. Rebuilt clipboard from original policewoman 193: preserved original NULL SCALE/BODY/HEAD/NULL FACE/Mouth rig and original framing/crop, removed hair/hat/uniform details, transferred original body and neck animation to blue shoulder silhouette; family head in source HEAD space. Original tablet and pen contours and writing motion retained and recoloured grey/black. Removed imported 168 hand and all added arm/grip shapes. Only tablet independently flips/approaches after writing; blank paper/clip/rivet on front.

Latest steering: replace feminine lips with simple white smile; presentation leaves roughly top 1/6 clear and crops board bottom. Updated accordingly. 47.3 KB; 180 frames, exact loop; original rig movement within 0.15 px, source tablet/pen coordinates within 0.02 px while writing, no added hands, top-space and all-frame checks pass; python-lottie passes. Typecheck, 1274 tests, build pass. Draft only.

### 2026-10-23 · Clipboard: facepalm scale and continuous motion

User rejected small/floating framing, rushed tablet travel and end-of-return shaking. Increased original rig uniformly to 142%, aligned original matte bottom to canvas bottom; top of character y=61 px vs facepalm y=60 px. Independent cubic Bezier channels: turn in 44–80, approach 48–96; retreat 126–176, turn back 140–174. Retained top 1/6 margin of presented board, bottom crop, simple white smile, no extra hands. Pen retracts below frame before presentation.

Removed piecewise clock with hidden hold and compressed 140→38 rewind. Character uses continuous source writing clock 38+29*(1-cos(2*pi*f/179)); max source speed 1.018 frames/frame, no fast-forward. Original breathing curve at half amplitude for close-up. Added checks for framing at bottom edge, facepalm-scale top, clock speed and bounded return head speed. 180 frames/exact loop, python-lottie and Telegram limits pass, 59.2 KB. Typecheck, 1274 tests and build pass. Draft only.

### 2026-10-23 · Clipboard: шестисекундная сцена и исследование длительности

Пользователь: сначала взгляд в камеру и кивок, затем письмо и показ планшета; проверить способ загрузить больше 3 секунд через ложную длительность. Проверены официальные требования Telegram и первичные документы sticker-convert: Duration spoof описан для WebM/Matroska EBML, для TGS аналогичного подтверждения не найдено (rlottie связывает время с диапазоном кадров/fps).

Сохранён обычный трёхсекундный черновик. Отдельная сборка `node packs/blue/clipboard/build.mjs --six`: 360 кадров / 60 fps, прямое смешение исходной фронтальной и пишущей позы без прокрутки убирания, мягкий кивок, исходная геометрия/анимация ручки, показ с верхом y=84 и обрезанным низом. В библиотеке `clipboard-6s-preview.tgs` с честной длительностью, красная проверка 3с намеренно. Оба края цикла пиксельно совпадают.

В exports/clipboard-6s — MP4-превью, прозрачные VP9 WebM 512x512 (207.0 KB) и 100x100 (68.5 KB). scripts/spoof-webm-duration.mjs меняет только Duration на 2.99с, все пакеты остаются побайтно прежними. Проверено полное декодирование всех 180 кадров / 30 fps = 6с и alpha. Документация/источники в docs/telegram-duration.md. Серверный приём и воспроизведение клиентами Telegram не проверены; пак не меняли, сообщений не отправляли. Typecheck, 39 файлов / 1274 теста и build PASS.

### 2026-10-23 · Clipboard: approved torso, animated smile, exact source clip

User rejected shoulder highlights, neck, a mismatching front clip and static mouth; asked whether TGS/WebM can share a pack, and for a regular 3s write/show loop. Confirmed the official API documentation explicitly permits mixing static, animated and video stickers in one set. Six-second file acceptance remains untested.

Reused the approved facepalm BODY outline/fill/material through one affine fit into the original 193 rig; removed the old police neck and bright shoulder bands. Torso overlaps the chin throughout the cycle. Smile reuses the approved identification-card contour (frame 110), smoothly morphs from 46 to 58 local units in 3s / 46 to 57.25 in 6s, with no opacity fade. Removed the replacement rectangular front clip: the exact five original Tablet > Group 3 paths now project continuously with the board above its blank paper. Top fit uses the actual taller clip, leaving 85px; board bottom cropped.

Updated both 3s TGS (52.9 KB, writing immediately, no initial camera pause) and 6s WebM candidates / master. verify.mjs checks source rig and tablet/pen/clip projected geometry at writing and turn keyframes (<0.008 px error), 180 frames and exact loop. New verify-appearance.mjs checks original torso contours/material and connected head/body in all 180 + 360 frames, animated mouth and source clip path count. Long WebM fully decodes all 180 frames at 30fps with alpha despite metadata 2.99s; 512px 205.8 KB / 100px 68.5 KB. Updated draft library; ready/ and Telegram untouched. Typecheck, all 1274 tests, build and 3s Telegram checks PASS.

### 2026-10-23 · Clipboard 6s published to both existing Telegram sets

User explicitly authorized adding the six-second version to both their emoji and sticker packs. Used a separate script scripts/publish-clipboard-webm.py, correct video/webm multipart + format=video, without restarting the running bot or overwriting live publisher state. Inspected both live sets, uploaded and added only the approved files with 📝 association, downloaded each placed file and verified SHA-256 against the local original. Receipts: exports/clipboard-6s/telegram-publication.json. Existing-set video/static/TGS mixing confirmed by real successful additions.

Telegram rejected the first 100px emoji (70143 bytes) at addStickerToSet with STICKER_VIDEO_BIG, despite upload success. Re-encoded just the emoji at CRF34, 47422 bytes (46.3 KiB), all 180 frames / 30 fps retained; metadata 2.99s. Updated long-preview.mjs to use CRF34 and enforce <=64 KiB for videoemoji, <=256 KiB for regular video sticker. The actual server enforces a tighter emoji size than the general WebM guide.

Success: blues_emoji_by_jhthkjbot, custom_emoji, 100x100, set count 56; blues_stickers_by_jhthkjbot, regular, 512x512, 210756 bytes, count 54. Both live entries is_video=true and server bytes unchanged. Server acceptance is now confirmed; actual user-device playback still requires viewing in Telegram. No chat messages sent.

### 2026-10-23 · Private clipboard photo, standalone WebM

User requested inserting their supplied photo onto the paper, ignoring the photo in Git, and exporting only a standalone six-second 512px video sticker. Added /packs/blue/clipboard/private/ to .gitignore before copying the image to private/photo.png; git check-ignore confirms exclusion and git ls-files confirms it is untracked. Source photo remains unchanged. photo-video.mjs --six and photo-video.py project the photo using the same board.front homography onto the existing 180 RGBA frames, only on the front face, preserving white paper margins and source clip. No Telegram calls or pack changes. Output exports/clipboard-photo/clipboard-photo-6s.webm, 214024 bytes, VP9 512x512 / 30fps / alpha, 180 decoded frames = 6s, Duration metadata 2.99s. Exact loop checked; displayed full-presentation PNG inspected.

### 2026-10-23 · Clipboard head ratio and in-place Telegram replacement

User requested taller facepalm-like head in 3s and 6s pack variants, bounds checks and replacement without duplicates; explicitly exclude the photo version. Normalised head silhouette/rim to facepalm height/width ratio 1.341 in every pose (old writing ratio 1.188; original frontal envelope also compressed differently). Jaw-relative transform, local clearance 10/22 units, presentation framing drop 50/74 keeps top margin when board fills frame. All other geometry/motion retained. Full padded-canvas rendering verify-head.mjs checks all 540 frames for crown/ears outside canvas: 3s bounds [113,30,425,464], 6s [80,13,421,458]. Rig/clip/paper, connected torso/head, smooth smile and exact loops checks pass.

Live inspection found only the six-second clipboard in the two packs; no 3s clipboard present. Updated 3s draft (52.2 KB) without adding a new element. Used replaceStickerInSet on each exact previous 6s file, verified live count and position preserved and downloaded replacement bytes match. Emoji: 56 items, index 55, 46444 bytes; regular sticker: 54 items, index 53, 208037 bytes. Receipts exports/clipboard-6s/head-replacement.json, updated original publication receipt for future replacement. Photo WebM SHA256 remains 8E81B50750F5EB4C3D9F6E61F38AC1492B4EABADA13377098B78E5C4EAE0094C, not rebuilt or resent.

Validation for taller head: verify.mjs, verify-head.mjs, verify-appearance.mjs and python-lottie 3s checker PASS. Typecheck and production build PASS. Default Vitest also discovered the separate exports/branch-smoke checkout and timed out running duplicate suites; rerun scoped to main project with --exclude exports/** --maxWorkers 4 passed 21 files / 647 tests. No application test/config changes made for this task.

### 2026-10-23 · Eight user SVG clipboard signs sent privately

User supplied packs/blue/signs/Frame 2087331232.svg through 2087331239.svg and explicitly requested each on the paper, each sent as a standalone sticker through their bot, no pack additions. Added signs-video.mjs --six: python-lottie SVG import retains exact cubic lettering; bakeSourceLayer + board.front project ink onto the latest approved six-second master, front only, under source clip. Rendered eight 512px VP9/alpha/30fps variants, 180 frames each, fake Duration2.99, 216–240 KiB all under256 KiB. Checked exact loop and full decoding; inspected all eight full-show previews on comparison.png. Outputs/manifest in exports/clipboard-signs. Original SVGs and private photo unchanged; photo SHA256 still 8E81B50750F5EB4C3D9F6E61F38AC1492B4EABADA13377098B78E5C4EAE0094C.

Added scripts/send-clipboard-signs.py: direct multipart sendSticker avoids the generic-upload-as-document issue; numbered labels on each message; persisted receipts guard duplicates and uncertain sends. Sent and confirmed messages 289–296 to owner1336169515, all sticker.is_video=true,512x512,no set_name. All eight sent; no pack mutation endpoints called. Receipts exports/clipboard-signs/private-messages.json. Waiting for user's selection.

### 2026-10-23 · Ninth sign variant

User added signs/соси.svg and asked for one more variant with the same private-send workflow. Added --only-new to signs-video.mjs: retained the first eight outputs and receipts, rendered only new SVG as 09-sign.webm (238648 bytes, 512px VP9 alpha, 180frames/30fps/6s with metadata2.99). Inspected preview, loop and decode checks passed. Sent only variant9 via direct sendSticker: message297, confirmed video sticker with no set_name; no pack changes or repeat sends.

### 2026-10-23 · Selected sign 9 published; 752 flag and 727 bubble drafts

User chose sign9 (signs/соси.svg) for the main pack, then requested blue 752 flag with the existing n and 727 blue message bubble with n instead of dots. Replaced the blank six-second clipboard in both existing sets using replaceStickerInSet; unchanged positions/counts 56 emoji (index55),54 regular stickers(index53); downloaded replacement bytes match. Emoji100px CRF34 48671 bytes, sticker512px238648 bytes. Receipts exports/clipboard-6s/sign-selection.json; selection reproducibility in clipboard/selection.json. No new blank/sign duplicate added.

Added n-flag/source.tgs (exact752), recipe/build/README: removed national star+yellow stripes, retained original cloth/outline/fold/light/shadow paths and rig; body palette matched blue pack. n is exact approved technologist-bust/logo.json path, attached to cloth through arc-length-sampled cubic top/bottom boundaries and baked every3f, including handles. Original highlights/shadows pass over white print. About41.5KB/180frames. Original flag cycle retained (lastframe is a moving pose, as in source).

Added n-bubble/source.tgs (exact727), recipe/build/README: same round bubble/tail/radial volume and original NULL rotation bounce, blue gradient/outline/rim; removed three dot layers and inserted same white n at middle-dot centre, fixed to bubble rig. Source overshoot reached x515; entire rig fit95% about centre gives >=8px margin. Removed unused AE slider effects/expressions on NULL; actual bounce already baked to rotation. About2.9KB/180frames, pixel-exact loop.

verify-n-symbols.mjs checks exact sources, unchanged source transforms, removed original emblems/dots, all180frames each have exact source alpha (bubble source given same framing) and no symbol spills, margins56/8px. Both Python-lottie Telegram checks pass. Draft library refreshed; new symbols not published or sent through bot pending user review. Private photo unchanged.

### 2026-10-23 · Bubble shading and flag print stability

User found727 bubble too pale and lower n slipping near70f on752; explicitly suggested another flag. Removed bubble's large inner pale overlay (Layer2 opacity0), restrained upper reflection (Layer3 opacity18), darkened blue radial ramp to6086a7/517594/44688b. Original bounce/framing and white n retained.

Compared nearby flag rigs: external boundary points slide through folds. Replaced source752 with exact756, whose central circle supplies eight persistent print anchors. Removed circle; thin-plate deformation maps approved n through its original motion. Symmetric sigma2.5-frame smoothing softens short source key changes, baked every3f with rounded3digit coordinates to fit56.2KB. Original cloth shading, contour and transforms preserved. All180 frames retain exact source exterior alpha;56px margin. Max letter step in60–90f is2.514px/frame; no sudden lower-only relocation. Bubble retains8px margin and exact loop. No Telegram sends or pack changes.

Validation for this correction: typecheck, scoped Vitest (21files/647tests), production build PASS. Both TGS files pass python-lottie Warning-level validation. Library refreshed with756 as the replacement flag source.

### 2026-10-23 · Centre the flag n

User approved bubble shading but requested n right/up on the flag. Shifted print sampling point in rest-material coordinates by[28,-10], about22px right/9px up in the open pose; the offset follows the existing deformation. Checked rendered poses0–179, exact exterior alpha,56px clearance, max step60–90f2.786px, Python-lottie PASS,56.3KB. Updated local draft only.

### 2026-10-23 — Кастомизация текста и стабильный фотофлаг

В общих «Черновиках» 569 (бочка) и 704 (подгузник) открывают ввод своего текста,
предпросмотр, скачивание TGS и отправку отдельным стикером через существующего
бота. Надпись до 32 символов переводится в контуры Roboto 900, сохраняет
цилиндрическую проекцию бочки / исходный поворот подгузника. Персональная сборка
изолирована в exports/photo-custom; общие варианты не перезаписываются.
Фотофлаг 950 переведён на периодическую сетку 24×12 без складок с инверсией
координат. Тесты проверяют отсутствие переворота ячеек, скачков и стык цикла.
Фото бюллетеней 632 следует кривым Безье бумаги через сетку Coons.
Проверены typecheck, 1288 тестов, production build, оба TGS валидатором и
реальные задания через localhost API без отправки тестовых стикеров.

### 2026-10-24 — Стас в яйце 255 и шляпе 222

Добавлены egg-photo-255.webm и hat-photo-222.webm в общие «Черновики».
Источник private/staspng.png сохраняет альфа-канал, игнорируется Git и закрыт
от статической выдачи существующим правилом private. Цыплёнок заменён фото
с исходной иерархией движения головы/тела, уши в шляпе удалены; фото выезжает
и уходит внутрь, родная анимированная кривая переднего края служит маской.
Оба шаблона подключены к выбору фото и отправке отдельным стикером в бота.
В существующий Telegram-набор автоматически не добавлялись.
Проверены листы кадров, VP9 alpha, 512×512, 30 fps, 3 секунды, размер до 256 KiB,
интервалы появления, typecheck, 1288 тестов и production build.

### 2026-10-24 — Зацикленный ролик с четырьмя синими в лифте

Новая независимая сцена trailers/blue-elevator. Сгенерирован пустой фон кабины
в стиле Telegram-эмодзи; пользовательский blue.svg сохранён побайтно как
source.svg, 24 его пути переводятся в кубические контуры tlottie и перекрашиваются
в #335375 / #44688b / #6086a7 / #7ba3c3 / #a5d6ea. Передний левый зеркален,
передний правый в исходной позе, блики направлены к центру потолочного света.
Деформация гладкая, с контрольными зонами таза, груди, шеи, головы, локтей и кистей.
Общее ускорение кабины возбуждает разные затухающие пружины; периодическое
решение даёт бесшовный цикл без стартового перехода. Нет растровых разрезов тела.
Экспорты: 10 секунд, 4:3, мастер 1440×1080×60 (5.86 MB), Telegram 960×720×30
(1.65 MB), PNG-постер, раскадровка, motion.json и отчёт проверок. Пиксельное
совпадение стыка и непрерывность рига проверены, оба MP4 полностью декодированы.
Typecheck, 1288 тестов и production build проходят. В бота не отправлялись.

### 2026-10-24 — Лифт v2: постоянная вибрация и устойчивые фигуры

По замечанию пользователя убран упругий волнообразный риг корпуса. Таз/грудь
и голова поворачиваются жёстко, руки имеют отдельные повороты плеча и локтя;
у четырёх людей разные фазы и частоты idle. Высокочастотная вибрация кабины
идёт постоянно; человеческий отклик фильтруется и сильно затухает. Тесты
проверяют сохранение ширины головы, груди и предплечий, разные движения рук,
периодичность и отсутствие инверсии. Дальний ряд затемняется только ниже плеч
с плавным градиентом до 22%, головы сохраняют верхний свет. Выходы v2 отдельные,
видео v1 и его метаданные сохранены в exports/blue-elevator/v1/.

### 2026-10-24 — Лифт v3: спокойная камера и малый idle рук

По просьбе пользователя убрана частая тряска кабины: спокойное покачивание
с периодами 3–5 секунд и редкие небольшие толчки. Ускоренный размах рук v2
уменьшен примерно вчетверо, циклы плеч/локтей замедлены. Согласованные наклоны
корпуса и головы сохранены побайтно в параметрах всех 2400 поз; затемнение
заднего ряда не меняется. Отдельные файлы blue-elevator-v3.mp4 и
blue-elevator-telegram-v3.mp4. Проверки рига, typecheck, 1288 тестов и build
проходят. Источники и все предыдущие MP4 сохранены.

### 2026-10-24 — Лифт v4: почесать ногу в начале

На 0.35–2.55 секунды крайний правый персонаж внутренней (экранной левой)
рукой подводит ладонь к бедру, делает три маленьких почёсывания, затем
возвращает руку. У жеста отдельные локоть и запястье: ладонь поворачивается
и немного поджимается. Отдельный проход предплечья накладывается поверх бедра,
верх тела и другая рука проверены побайтно как неизменные. Базовые движения
v3, освещение и 10-секундный цикл сохранены. Код: scratch.py, данные:
exports/blue-elevator/scratch.json. Typecheck, 1288 тестов и build проходят.

### 2026-10-24 — Лифт v6: исходные кисти, сгиб пальцев, жест головы

Исправлена причина вытянутых кистей и толстой нижней обводки: продолжение
обрезанных бёдер ниже кадра ошибочно растягивало также пальцы. Теперь действует
только на ноги, кисти сохраняют исходную геометрию SVG. Растровый разрез руки
и сгиб всей ладони убраны. В начале сгибаются только четыре длинных пальца
правого переднего персонажа, ладонь и большой палец неподвижны относительно
предплечья. Предплечье чуть (2.3°) подводится к бедру для реального контакта.
На 7.9–8.85 секунды левый передний персонаж наклоняет голову на 2.2° вправо,
к центру кадра, затем возвращает. Спокойная поездка и затемнение сохранены.
Проверены неизменность ладони/большого пальца от сгиба пальцев, отсутствие
растяжения кистей, направление наклона, периодичность. Typecheck, 1288 тестов
и build проходят. Артефакты blue-elevator-v6.mp4 и telegram-v6.mp4.

### 2026-10-24 — Сохранённые видео, синий Skibidi и широкая лента

Одобренные crowd v3 и elevator v6 скопированы в exports/post-videos/01-blue-crowd
и 02-blue-elevator (мастер и Telegram-версия). Хэши/метаданные в manifest.json,
галерея index.html. Новый ролик 03-emoji-strip: 1920×360 / 60 fps и 1280×240 /
30 fps, 11.6 секунды. N-bubble вырастает из наклонённого маленького состояния,
эмодзи синего пака переключаются с ускорением до 0.05с и замедлением, N-флаг
играет полный исходный цикл один раз, уменьшается/исчезает. Skibidi исключён.

По приложенному TGS создан packs/blue/skibidi-toilet: синяя модель головы,
синяя шея, дружелюбная белая улыбка из mouth 3 стикера 070, серая бумага.
После явного уточнения пользователя о разрешённой работе с синим паком
перенесён из отдельной emoji-папки в синие черновики exports/blue.
Убран просвет головы под сиденьем на 18–22 кадрах: нижние кубические сегменты
подрезаются по родному сокращению исходного лица; обратное появление также
проверено. Рот использует родное окно видимости. 30 KB, 180×60 fps, валидатор
без предупреждений; 180 кадров рендерятся. В Telegram не публиковался.
Проверки рига, ленты, typecheck, 1288 тестов и production build проходят.

### 2026-10-24 — порядок широкой ленты v2

После N-bubble: facepalm в момент удара, identification-card, partying-face. Середина случайная с ускорением. Замедление: coffin, screaming-face, закрывающийся technologist-bust, family, затем полный цикл n-flag. Ролик 11.7 с, мастер и Telegram-копия обновлены в exports/post-videos/03-emoji-strip; v1 сохранён в exports/blue-carousel.

### 2026-10-24 · New189 scrolling counter

User requested a separate long emoji: freeze the left silhouette from189, duplicate it into an infinite-looking row moving left (camera right), left copies over right, sequential numbers above each head using the same font as n, maximize length within size. Added counting-crowd/{source.tgs,build.mjs,verify.mjs,recipe.json,README.md}; exact original L-light/L-dark/L-silhouette frozen at0, no right bust/fingers/late smile. Cached40 body phases and10 Roboto Black glyph sprites; each frame only composes cached sprites with advancing numbers, no huge Lottie timeline.

Optimized100×100 transparent VP9:10fps,20px/s,40px pitch,CRF42,long GOP.92 full passages=184s/1840frames,261686bytes (under262144), numbers through94 visible. Next93passages/186s264461bytes fails size, so92 chosen for this quality/speed profile. Source untouched; left/front draw order retained. exports/emoji/counting-crowd.webm uses2.99 metadata; honest full-length preview and probes retained in exports/counting-crowd. Full decoding verified1840 nonempty frames with transparency, unchanged payload outsideDuration, body-cycle mean codec error0.466. Actual184s Telegram acceptance/client playback not tested; no bot send or pack changes.

Validation: source/render verification PASS; typecheck,24 test files/661 tests, production build PASS. Refreshed library with counting-crowd in emoji drafts; no existing sticker edits.

### 2026-10-24 — финал широкой ленты v3

По просьбе пользователя флаг быстро линейно уменьшается в ноль за 0.18 с, без вращения и растворения. Выход 0.2 с, весь ролик 11.2 с. Остальные кадры и порядок сохранены. Обе копии в папке поста обновлены; v1/v2 сохранены.

### 2026-10-24 · Separate15s clipboard dozing sticker

User rejected low-res long counter quality and requested a new15s clipboard scene: writes/smiles/nods/listens, smile fades geometrically, head droops, source Zs appear, sudden wake, two nods, resume seamless writing; never show tablet front. Added clipboard-sleep/ independent of approved clipboard/sign/photo. Stored approved6s vector base and090 Z source locally. Retimed only writing master90–168, integrated activity slows/stops pen during sleep and resumes without fast-forward. Frontal listening blends, quintic ease nods/droop and short wake overshoot; mouth height10→1.5px shape morph. Three090 Z outlines stagger/float. Removed presentation-page layer completely; original tablet/clip held steady, torso breathing frozen to preserve bitrate, pen still moves. 900frame/60fps local vector master, exact pixel loop; head/Z overscan bounds[82,18,494,436].

Rendered450 native512px frames,30fps. After final polish, head keeps its writing pose except explicit listening/nod/sleep/wake curves rather than bobbing with each pen cycle. Final CRF35/38 exceed limit (315858/276578bytes);41 fits243253bytes (237.6KiB). Chose full resolution/frame rate with compression instead of100px downscaling. VP9/alpha/no audio, patched onlyDuration2.99, honest WebM/MP4 previews and verification in exports/clipboard-sleep. Draft exports/emoji/clipboard-sleep-15s.webm. Fully decoded450frames beyond spoofed metadata; all checks passed. Typecheck,24Vitestfiles/661tests and production build PASS. No existing pack files/Telegram sets/private photo changed;15s server/client acceptance not yet tested.

### 2026-10-24 · Clipboard sleep: exact approved Z animation

User approved the15s scene but requested the exact larger Z appearance/positions/motion from the existing yawning sticker instead of small custom letters. Stored exact ready/yawning-face.tgs as clipboard-sleep/zzz-donor.tgs. Removed manually normalized23/29/36px glyphs and hand-made trajectories. Imported donor Z1/Z2/Z3 with every path, paint, scale/anchor/rotation/position and original Resize103.3% parent. Source100..179 emergence runs at its original60fps starting7.9s, then holds until wake fade10.42–10.56s. No spatial change. Isolated mature Z rig renders pixel-exactly like donor179; head/Z bounds[82,18,448,436]. All other scene channels unchanged; pixel-exact loop retained.

Rebuilt450frames/512px/30fps VP9 alpha: CRF35=300199B,38=263146B exceeds262144;41=232145B fits226.7KiB. Full decode/format/alpha/bounds/nods/smile/donor regressions PASS. Typecheck PASS;660 tests initially pass with one remote integration timeout during encoding, that exact failed test passed on isolated rerun; production build PASS. Updated local WebM/MP4 previews and editor draft; no Telegram publication.

### 2026-10-24 ·149 blue hand, unified hand highlights, continuous sleeping Zs

User requested149 blue, and approximate highlight consistency across all standalone hands, specifically victory,raised-back,palms-up,finger-ok,heart-hands,middle-finger. Added pinching-hand exact149 source/recipe/README, restyled37.6KiB/180f/60fps; original rig/paths retained, Python-lottie PASS. Added hand-highlights.mjs palette helper, hand-only opt-in recipes and style8cb7d3/85% peak for dense fills; head rim unchanged. Normalizes solid blue highlights and uniform blue alpha-gradient reflections, retains softer opacity envelopes and thin strokes, skips mattes and original heterogeneous sparkle gradients. Existing approved/current hand files processed directly to preserve manual geometry fixes:54 ready/draft files updated, non-paint JSON structure exactly equal, palette idempotent, Telegram checks PASS. Backups and comparison sheet saved; gift builder/verification and loser selector adapted for reproducibility. New149 remains a draft. Local56-item archive rebuilt/validated; no Telegram mutations.

User also disliked Z freeze during sleep and requested flight plus disappearance small→large. Original donor emergence/scale retained. After9.217s, each Z smoothly picks up a gentle outward/upward drift (small6/-10,medium9/-13,large12/-16px/s). No static terminal hold. At wake, rapid80ms fades begin10.42/10.51/10.60s, smallest first. verify.mjs confirms positive continuous flight, ordered fades, exact donor glyph rig after factoring drift,900f exact loop, bounds[82,18,464,436]. Rebuilt512px/30fps/15s WebM249689bytes CRF41, all450frames decoded with alpha. No existing clipboard/sign/photo variants changed.

Validation for this batch:149 Python-lottie PASS; all modified hand files Telegram format/size checks PASS, exact non-paint structure and palette idempotence; gift-hand source-rig/contour/all180frame checks PASS. Typecheck PASS;660 tests passed in initial run and the single remote integration polling timeout passed on isolated rerun; production build PASS. Library refreshed (149 draft),56-item ZIP verified. No bot sends or Telegram set replacements.

### 2026-10-24 · Requested publication of all updated hands,149; earlier Z and slower pen

User explicitly requested adding149 and replacing the already published hands in the pack. Added approved pinching-hand to ready/emoji.txt and rebuilt57-item local ZIP. Prepared live SHA256/decompressed non-paint geometry matches for both existing owned sets. Emoji set59items contains29 matching hand versions (including3old L colour revisions); regular set57items contains27. No missing base hand types. Publication script publish-hand-updates.py preserves every old position and unrelated sticker, only appends149, shares uploads across sets, paces heavy calls5s, persists intent/acks/verification and handles ambiguous replies by reconciliation. For pre-existing duplicate L slots, gzip header variants have identical decoded Lottie but distinct uploaded file bytes; no duplicates appended. Running publisher control service was stopped; elevated CIM confirmed no local bot publisher process. Bot process/state untouched.

Independent scene edit: motion.json writing speed1→.82@3s→.55@5s→.27@6.5s→0@8.1s, stays asleep then smoothly resumes after waking,3integrated cycles for exact loop. Z clock starts6.4s, actual visible opacity>1% begins6.474s; donor size/entry, continuous drift and small→large wake disappearance retained. Bounds[82,14,482,436]. Native512px/30fps15s video CRF42=256580bytes,450frames fully decoded; visual/temporal/loop checks PASS. Existing 3s/6s selected signs/private photo unchanged.

### 2026-10-24 · Steered Z flight: bobbing rise and sequential pops

While hand publication was in progress, user requested a livelier up/down rise with upward tendency and popping at the end. Added smoothly enveloped vertical sine1.3s(amplitudes5/7/9px) and horizontal sway1.8s with per-letter phase offsets, layered over existing gentle upward/outward drift after donor emergence. At wake each glyph briefly inflates12%, contracts, fades and emits4short outlined white rays; original small→medium→large timing retained. Earlier writing slowdown and Z onset6.474s retained. Verify now asserts both signs of vertical velocity plus net ascent, inflation and visible pop rays, ordered disappearance, exact glyph source rig excluding custom position, exact loop and full decode. All effects overscan bounds[82,12,482,436]. Final native512px/30fps15s VP9258553bytes(CRF42). Updated draft and honest previews; typecheck,24files/661tests,production build PASS.

### 2026-10-24 · Hand publication completed and verified; seamless Z handover

Completed requested Telegram changes: emoji set60items (29existing hand versions replaced in place,149 appended once); regular set58items (27replaced,149 appended once). Every new downloaded file SHA256 matches planned bytes, all unrelated sticker UIDs/positions unchanged, only+1 count per set. Existing3L slots retained; gzip-only distinct headers decode to identical updated Lottie. One108s upload429 was honored with adaptive pacing, then all operations completed. Durable complete receipt exports/hand-publication/result.json and30 importable upload receipts; bot process/state never stopped/restarted/edited, no chat messages sent.

User then requested removing the pause between donor Z emergence and floating. Added zHandoverLead0.45s and zFloatRate0.85: extra flight starts during the last27source frames and is already moving before source179, preserving the approved wave/pops, early6.474s appearance and progressive writing slowdown. Verify asserts the early overlap, bobbing and net ascent, ordered pops, exact glyph source/loop, all450video frames. Bounds[82,12,480,436]; final WebM259157bytes,CRF42,512px/30fps/15s. Updated preview/draft; scene remains a separate draft, not added/replaced in Telegram. Latest app checks24files/661tests,typecheck,build PASS; targeted final scene checks PASS.

### 2026-10-24 · Approved dozing clipboard published in both sets

User explicitly approved the final15s scene and requested adding it to both sets. Prepared a separate100×100/30fps emoji directly from the450 native frames; main512×512 sticker unchanged. First emoji111909bytes(CRF30) uploaded but addStickerToSet rejectedSTICKER_VIDEO_BIG (no set mutation). Preserved rejected receipt; encoded compact100px CRF40/cpu1/longGOP62954bytes with identical450frame/15s scene and alpha, successfully added. prepare-telegram.mjs now conservatively caps emoji64000bytes; no claim that the generic documented256KB limit applies to this observed server behavior.512px259157bytes(CRF42) accepted unchanged.

Both additions verified by exact SHA256 downloads, dimensions/is_video and prefix UID/order comparison: blues_emoji_by_jhthkjbot61items,new index60; blues_stickers_by_jhthkjbot59items,new index58. Associated both📝 and😴. Stored durable complete receipt exports/clipboard-sleep/telegram-publication.json and stable local publication.json/recipe statuspublished for future replacements. Source scene/loop/timing unchanged; no chat messages or bot restart/state edits. Compact emoji fully decoded450frames with alpha. Typecheck,24testfiles/661tests,production build PASS.

### 2026-10-24 · Censorship saw blue draft; blue WebM draft placement

User supplied censpoop.tgs: replace poop with blue head only, keep its mouth and saw action, remove eyes/fly/green stink/black connecting arms, blue detached gloves, grey saw grip. Added censorship-saw/{source.tgs,build.mjs,verify.mjs,recipe.json,drawing.json,README.md}. Source stored byte-exact (SHA2562c96b25629ee3a56151a19a94cd2fd252cf75fa5757c9af768ee18f701d4e03d). Canonical neckless head with ears,314x421 facepalm proportions,12px outline and common palette replaces BODY geometry; all inherited rig/motion/timing kept. Original mouth/teeth shapes retained and whitened, tooth separators blue. Static head alpha mattes clip the original side entrance behind cheek instead of leaving mouth outside the narrower silhouette. Connector layers become invisible parents to retain original hand motion; red sign/diagonal/chips/blade layers exact. Output exports/blue/censorship-saw.tgs18284bytes,180frames/60fps/3s. Contact sheet exports/sheets/blue-censorship-saw.png.

User requested all new blue work in blue drafts and reported sleeping clipboard missing there. Moved its preview alias from exports/emoji to exports/blue; patched video.mjs for reproducible placement, unchanged SHA256ba46fddabfab14aa827f13e15d49ae6773abd446a4bcb2483d9b323fda66a8fa (matches published512px file). Library now indexes WebM in blue drafts and counts decoded frames via ffprobe instead of hardcoded90; existing video preview reused. TGS-only Telegram panel excluded for video selections. Library index contains both censorship-saw and450-frame clipboard-sleep-15s in drafts, not general emoji-drafts. No Telegram mutations; sleep publication and private photo untouched. Future blue draft placement documented.

Verification: original non-paint geometry/rig checks, all180frames mouth-within-head and nonempty, pixel-exact loop, Telegram app checks, python-lottie Warning-level PASS. localhost5173 HEAD200 for both output files (WebM MIME video/webm). Typecheck PASS,24Vitestfiles/661tests PASS (single worker), production build PASS. No UI navigation or process restart.

### 2026-10-24 · Censorship saw: blue cuff, consistent hand outline, turning ears

User reported white fragment at left hand around95–98, grey right-hand outline, and stationary ears during the source face turn. Left fragment was the white sign seen through an open thumb seam plus the original30%-opacity glove shadow. Added a small animated blue seam backing; made the cuff backing opaque blue6086a7 and placed it below the original finger contours. All original finger shapes/rig/timing remain. Recoloured the separate SAW Shadow stroke335375 and its low-opacity fill44688b; recoloured previously yellow SAW Back to the same grey grip palette.

Head now morphs only ear segments: front contour through15, smooth earless temple/jaw by23, hold through27, ears restore by35. Crown rim endpoints/control handles match exact subdivided side curves; mouth alpha mattes inherit the same animated contour. Original mouth, body rig, saw, sign, duration and exact loop retained. Final20514bytes,512px/60fps/180frames, blue draft replaced in place. Updated build/verify/README; visual review of turn and95/98, all180frame containment/rig/loop checks and Python-lottie PASS. No Telegram mutations or app navigation.

### 2026-10-24 · Censorship saw: last opening-hand seam at65–67

User approved everything except tiny white gap between blue finger/palm pieces near65. Isolated the left hand at61–68 and reproduced the triangular opening between the middle finger and palm (old thumb-only backing stopped too early). Extended the existing behind-fingers blue backing to the middle-finger base, sampling the original geometry every frame instead of every3frames to follow the quick entrance precisely. No original finger/hand/head/mouth/saw keyframes changed. Before/after contact sheets exports/censorship-saw/seam-before.png and seam-after.png confirm gap closure at65–67 with original outlines intact. Rebuilt blue draft23839bytes/3s/60fps; all180frame rig/mouth/loop checks and python-lottie PASS. Refreshed library; no Telegram changes.

### 2026-10-24 · New blue Chill draft from chillstick.tgs

User approved the censorship-saw fixes and said they would add it themselves; no publication performed. Requested another supplied sticker recoloured purple to blue, including the late heart. Added packs/blue/chill/{source.tgs,build.mjs,recipe.json,drawing.json,README.md}; source SHA25622ccaccc1a67a066a6d6ac51c6f905734e99c0b9a462b478e33b293a00053006. Build changes only RGB for blue/violet/magenta paints, including all animated gradient colours, maintaining source luminance through a blue ramp233d58→335375→44688b→6086a7→7ba3c3→a5d6ea→white. Hearts, glow, buttons, collar violet edging and small pink sparks recoloured too; water-drop layers exact, neutral/cyan/white reflections preserved. All source geometry, animation/easing, stop positions/alpha, opacity and timing exact.

Output exports/blue/chill.tgs24196bytes,512px/60fps/180frames/3s; exact loop. Comparison exports/sheets/blue-chill.png visually reviewed. Independent full JSON comparison after zeroing RGB confirms only RGB changed; alpha pixel-exact against source on all180frames. Telegram checks and Python-lottie PASS; refreshed library places Chill in blue drafts. No ready additions, bot sends or set edits.

### 2026-10-24 · Corporate gadget stack from clay.tgs

User supplied clay.tgs and requested replacing three clay tablets with556 laptop,557 keyboard,554 phone, replacing bone with black168 pen, removing impact dust, and replacing laptop Telegram logo with the existing n. Stored exact local sources under office-clay/; source SHA256e4166d4371acbe35f117ff88cce69b15d67b0f7d08a74adb890cb1e37a898dbd. During review user set final order bottom→top laptop/keyboard/phone, requested realistic smaller phone, and then90degree in-plane rotation of laptop/keyboard so long axes follow the stack. Final layouts implement all steering.

Built using source tablet/pen ks and null hierarchy unchanged; sampled plane contours control nested rotation/scale/rotation via SVD, so detailed frozen donor keys/icons stay static rather than thousands of animated paths. Donor poses laptop25closed,keyboard0,phone0front/37back,pen0. Laptop keyboard hidden under closed lid omitted; full compound Telegram logo replaced by grey disc and exact approved technologist-bust Roboto Black n. Phone screen icons imported from nested asset, its yellow alpha matte omitted; no yellow screen artifact. Keyboard dense shadow/matte pair omitted for size; actual keys/case/bevels retained. Source clay, writing, bone shadow, impact dust/debris removed. Phone compact34%width/62%length; laptop108%/80%,keyboard100%/43% before the requested90degree turn.

Output exports/blue/office-clay.tgs48880bytes,512px/60fps/180frames/3s; blue drafts only, no bot or set changes. Source comparison exports/sheets/blue-office-clay.png and1024px poses reviewed. Verify asserts exact source ks/parents/in-out timing and final order, original detailed keyboard, N logo and Telegram checks; all180frames on expanded768pxcanvas fit inside original512px bounds[48,44,469,499], no empty frames, pixel-exact loop. Python-lottie PASS. App typecheck,24Vitestfiles/661tests,production build PASS. Build/verify/README/donors/recipe/drawing saved for reproducibility, library refreshed.
