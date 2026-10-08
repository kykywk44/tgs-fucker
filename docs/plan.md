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
