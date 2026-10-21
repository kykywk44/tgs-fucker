# 💙 Синее сердце

Черновик от 2026-10-21. По просьбе пользователя выбран один обычный анимированный
эмодзи сердца — красное сердце 649, с пульсацией и поворотом.

```bash
node scripts/restyle.mjs blue/heart
bash scripts/check.sh exports/blue/heart.tgs
node scripts/library.mjs
```

`source.tgs` — неизменённая копия `library/emoji/649.tgs`.
Достаточно `recipe.json`: красные объёмные заливки заменены на палитру тела пака,
контур #335375, основные градиенты #44688b / #6086a7 / #7ba3c3,
блики #8cb7d3 / #a5d6ea. Геометрия, матты, непрозрачность, ключи и анимация исходные.
Силуэт и прозрачность рендера побайтно совпадают с оригиналом во всех 180 кадрах.

`exports/blue/heart.tgs`: 55.4 KB, 512×512, 60 fps, 3 с.
Сравнение: `exports/sheets/blue-heart.png`; крупные и все 180 кадров:
`exports/sheets/heart/`. Общий лист — `exports/sheets/blue-poop-heart.png`.
Отчёт: `exports/sheets/poop-heart-verification.json`.

Одобрен пользователем 2026-10-21 («По этим двум … всё хорошо»), скопирован
в `packs/blue/ready/heart.tgs`. Общие скрипты и UI не менялись, коммитов нет.
