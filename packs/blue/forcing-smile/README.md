# 045 · Натягивает улыбку

Неизменённый исходник `library/emoji/045.tgs` сохранён как `source.tgs`.
Крупная голова 069 без шеи и глаз, белый рот, синие руки с исходными бликами/тенями.
Все пути пальцев, рта и тайминги сохранены. Дополнительный поворот головы внутри
группы `Group 7` тоже сохранён; ширина контура компенсирует масштаб этой группы.
Тени от рук, рассчитанные на круглое лицо, исключены.

```bash
node packs/blue/forcing-smile/build.mjs
node packs/blue/lib/verify-large-faces.mjs
node scripts/library.mjs
```

Одобрен 2026-10-22 («Супер, все добавляй»), копия в `ready/forcing-smile.tgs`.
Результат `exports/blue/forcing-smile.tgs`, 5.3 KB, 512×512, 60 fps, 180 кадров.
Сравнение: `exports/sheets/blue-forcing-smile.png`, все кадры — в `forcing-smile/` рядом.
