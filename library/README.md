# Библиотека эмодзи

`emoji/001.tgs … 997.tgs` — анимированные эмодзи Telegram в порядке набора (архив `RestrictedEmoji_tgs.zip`
от пользователя, 2026-10-21; 36 MB). Номер файла — его ID во вкладке «Эмодзи» редактора. Имена внутри
файлов (`nm`) ненадёжные («Comp 1»), поэтому ищем по картинкам.

В git не хранится (`.gitignore`): чужие файлы и 36 MB. Восстановить:

    unzip RestrictedEmoji_tgs.zip -d library/emoji
    node scripts/library.mjs     # library/index.json + library/thumbs/*.png для вкладки «Эмодзи»

`scripts/library.mjs` надо перезапускать после новых синих эмодзи: наборы вкладки — «Эмодзи Telegram», «Синий пак · готово»
(`packs/blue/ready/`) и «Синий пак · черновики» (`exports/blue/`, выход `restyle.mjs`; ID — имя файла). Синяя точка
в общей сетке — у эмодзи, для которых есть рецепт.
