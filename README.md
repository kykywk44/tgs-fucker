# TGS Editor

Прототип редактора анимированных стикеров Telegram (.tgs): открывает, показывает превью, перекрашивает и экспортирует.

Требования: Node 22, npm; python3 для скрипта проверки.

    npm install
    npm run dev       # открыть страницу и перетащить на неё .tgs или .json
    npm test

Проверить экспортированный файл валидатором Telegram (подробности в scripts/README.md):

    bash scripts/check.sh <file.tgs>
