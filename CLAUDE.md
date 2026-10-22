# TGS Editor — контекст для Claude

Редактор анимированных стикеров Telegram (`.tgs` = gzip-Lottie JSON). Два направления в одном репозитории:

1. **Редактор в браузере** (`src/`): открывает `.tgs`, показывает превью движком Telegram (tlottie), перекрашивает по частям и семействам цветов, заменяет надпись в COOL/NEW, проверяет лимиты Telegram, экспортирует.
2. **Стикеры из эскиза + описания движения** (`stickers/`, `scripts/motion.mjs`): SVG-эскиз с именованными группами + `motion.json` → готовый `.tgs`. Сейчас в работе — пистолет (`stickers/pistol`).

Общаемся и пишем текст интерфейса по-русски; технические единицы (KB, fps, 512×512) как есть.

## Где что читать

- `docs/plan.md` — полный план и журнал решений по итерациям (1–4: редактор, живое превью, части и надпись, атомы; Task 11a–11f: движение и пистолет). **Начинай с него**: там «Global Constraints», решения пользователя (D1…D20) и состояние каждой задачи.
- `docs/parts-proposals.md` — согласованный пользователем список частей каждого из 17 стикеров и решения по спорным местам.
- `docs/weapon-animation.md` — правила анимации оружия с числами (выстрел, ритм, гильзы, дым).
- `scripts/README.md` — все dev-скрипты с параметрами.
- `README.md` — запуск.

## Команды

```bash
npm install
npm run dev          # редактор; перетащить .tgs/.json или выбрать в меню «Образцы»
npm test             # vitest
npm run typecheck
npm run build        # каждая задача должна заканчиваться: typecheck && test && build
bash scripts/check.sh [file.tgs]   # валидатор Telegram (python-lottie 0.7.2, .venv создаётся сам)
node scripts/motion.mjs <name>     # stickers/<name>/{sketch.svg,motion.json} → exports/<name>.tgs
```

Нужны Node 22, npm, python 3 (на Windows — Git Bash; скрипты сами находят `python3`/`python`/`py` и `.venv/Scripts`).

## Ограничения Telegram

512×512, 60 fps, ≤ 3 с (180 кадров), зацикленно, ≤ 64 KB. Запрещены: expressions, masks, effects, images, solids, text-слои, 3D, merge paths, star shapes, gradient strokes, repeaters, time stretch/remap. Поэтому буквы — это фигуры, «случайность» запекается в ключи, свечение имитируется вложенными плоскими фигурами. Превью и экспорт проверяются на это: красная проверка блокирует экспорт.

## Структура

- `src/core/` — **чистый TS без DOM/React**, функции не мутируют вход, всё тестируется в Node.
  - `tgs.ts` чтение/запись, `colors.ts` сайты цвета, `oklch.ts`/`families.ts` семейства оттенков, `checks.ts` проверки Telegram.
  - `atoms.ts` разбиение на атомы (списки фигур с краской), `idmap.ts` ID-карта для выбора кликом.
  - `parts.ts` + `profiles/*.ts` — профили стикеров (части по селекторам, узнаются по `fingerprint` структуры файла, т.к. имена корня повторяются или отсутствуют; Eye/Heart/Cool/NEW — по корневому `nm`).
  - `glyphs.ts`, `homography.ts`, `text.ts` — замена надписи (Roboto 900 из `glyphs/roboto-900.json`, анимация коробки через гомографии).
  - `motion/` — компилятор `compileMotion(base, spec)`, пресеты (`bounce`, `kick`, `eject`, `puff`, …), easing.
- `src/player/` — tlottie в воркере (`engine`, `player`, `clock`), `src/preview/Preview.tsx`.
- `src/ui/`, `src/components/ui/` — Tailwind v4 + shadcn (Base UI) + Fluid Functionalism; `src/ui/samples.ts` строит меню «Образцы» из `samples/*.tgs`.
- `samples/` — 17 стикеров пользователя (тесты на них пропускаются, если файлов нет; ядро тестируется на фикстурах `src/core/__fixtures__/`).
- `gun_refs/` — чужие `.tgs` как источники эффектов (`sources` в `motion.json`: вспышки, дым, пар из CoffeeSticker).
- `library/emoji/` — 997 анимированных эмодзи Telegram (не в git, см. `library/README.md`); номер файла = ID во вкладке «Эмодзи» (`src/ui/Library.tsx`, индекс и превью — `node scripts/library.mjs`). Пользователь выделяет пачку и присылает ID — работаем по номерам.
- `server/remote.ts`, `scripts/remote.mjs` — доступ с телефона через Cloudflare-туннель (пароль `SITE_PASSWORD`) и кнопка «В Telegram» → бот V2 (`docs/remote.md`).
- `packs/blue/` — синий пак (человечки-силуэты); `base/` — 4 исходных стикера Telegram 👤 👥 🫂 🗣, стиль и цвета в `packs/blue/README.md`; `<имя>/{source.tgs,recipe.json}` → `node scripts/restyle.mjs blue/<имя>`; одобренные — в `ready/`.
- `stickers/<name>/` — `sketch.svg`, `motion.json`, `variants/`; у pistol ещё `build_sketch.py`, `style.json`, `camera.json`, `view.json`, `fx/`.
- `exports/`, `dist/`, `node_modules/`, `.venv/` — в `.gitignore`, это артефакты.

## Правила работы

- **Не изобретай заново**: рендер — `tlottie`, gzip — нативный `CompressionStream`, валидация — python-lottie, UI — shadcn/Fluid. Новая зависимость — только с обоснованием в одну строку.
- Части стикеров размечаются **вместе с пользователем по виду**, а не угадываются по структуре: `node scripts/sticker-sheet.mjs` → листы с номерами атомов, пользователь правит список, потом пишется профиль и проверяется `node scripts/parts-sheet.mjs`.
- Пистолет: текущая анимация (`stickers/pistol/motion.json` → `pistol.tgs`) — **неприкосновенная база**; каждая новая идея — вариант в `stickers/pistol/variants/` (генерирует `python3 stickers/pistol/variants/make.py`), сравнение на `exports/sheets/pistol.compare.png`. `motion.json` пишется `make.py`, руками не правится.
- После любой правки пистолета: `node scripts/motion.mjs pistol`, `node scripts/rest-diff.mjs pistol` (кадр 0 должен совпасть с эскизом), `bash scripts/check.sh`, при необходимости `node scripts/fit.mjs pistol` (вписать в холст с полем 8 px) и снова motion/make до стабильности.
- Тесты, которым нужны `samples/*.tgs`, должны пропускаться, а не падать, при пустой папке.
- Решения пользователя в `docs/plan.md` не пересматриваем без его слова; новые решения дописываем туда с датой.
