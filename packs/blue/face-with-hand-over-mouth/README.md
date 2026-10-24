# 070 · Хихикает за рукой

Источник `source.tgs` — неизменённый `library/emoji/070.tgs`.
Крупная голова как в 069: ширина 300, высота 378.29418, без шеи и глаз.
Синяя исходная рука с обводкой 8 px; белая улыбка и зубы, синие разделители.
Исходные контуры, морфинг рта и пальцев сохранены. Румянец и тень под рукой убраны.
2026-10-22: при закрытии исходный морфинг оставлял синюю полосу над зубами. По уточнению
пользователя сохранён прежний рисунок смеха; изменён только переход непрозрачности в конце:
120–126, к исходной маленькой улыбке, до проблемного схлопывания зубов. Кадры 0–120
пиксельно совпадают с прежней версией; новые контуры и новая анимация рта не используются.

```bash
node packs/blue/face-with-hand-over-mouth/build.mjs
node packs/blue/lib/verify-large-faces.mjs
node packs/blue/face-with-hand-over-mouth/verify.mjs
node scripts/library.mjs
```

Одобрен 2026-10-22, копия в `ready/face-with-hand-over-mouth.tgs`.
Результат: `exports/blue/face-with-hand-over-mouth.tgs`, 23.2 KB, 180 кадров / 60 fps.
Сравнение: `exports/sheets/blue-face-with-hand-over-mouth.png`.
Все кадры и крупные позы: `exports/sheets/face-with-hand-over-mouth/`.
