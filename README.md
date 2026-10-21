# TGS Fucker

Прототип редактора анимированных стикеров Telegram (.tgs): открывает, показывает превью, перекрашивает и экспортирует.

Требования: Node 22, npm; python3 для скрипта проверки.

    npm install
    npm run dev       # открыть страницу и перетащить на неё .tgs или .json
    npm test

Проверить экспортированный файл валидатором Telegram (подробности в scripts/README.md):

    bash scripts/check.sh <file.tgs>

Вкладка «Эмодзи» показывает готовый синий пак и черновики с анимированными превью.
После клонирования создайте индекс и миниатюры:

    node scripts/library.mjs
    npm run dev

Готовые стикеры — `packs/blue/ready/`, исходники, рецепты и сборки —
[`packs/blue/README.md`](packs/blue/README.md). Библиотека из 997 исходных эмодзи
в git не хранится; её восстановление описано в [`library/README.md`](library/README.md).
Без неё вкладка всё равно показывает готовый синий пак.

Пересобрать и проверить текущий черновик 🤷:

    node packs/blue/shrug/build.mjs
    node packs/blue/shrug/verify.mjs
    node scripts/library.mjs
