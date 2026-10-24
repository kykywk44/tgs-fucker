"""Package approved blue emoji only. Uses the Python standard library."""
import csv
import gzip
import hashlib
import io
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
READY = ROOT / 'packs/blue/ready'
OUTPUT = ROOT / 'exports/blue-pack.zip'
MAPPING = ROOT / 'packs/blue/emoji.txt'
EMOJI = dict(line.split(' ', 1) for line in MAPPING.read_text('utf-8').splitlines()
             if line.strip() and not line.startswith('#'))

files = sorted(READY.glob('*.tgs'))
assert files, 'No approved files'
assert not any(p.stem == 'technologist' for p in files), 'Old technologist is excluded; use technologist-bust'
assert {p.stem for p in files} == set(EMOJI), 'Update emoji mapping for ready files'
payloads = {}
manifest = []
for file in files:
    data = file.read_bytes()
    animation = json.loads(gzip.decompress(data))
    duration = (animation['op'] - animation['ip']) / animation['fr']
    assert len(data) <= 64 * 1024, f'{file.name}: exceeds 64 KiB'
    assert (animation['w'], animation['h']) == (512, 512), file.name
    assert animation['fr'] == 60 and 0 < duration <= 3, file.name
    payloads[f'tgs/{file.name}'] = data
    manifest.append({'file': file.name, 'emoji': EMOJI[file.stem],
                     'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})

readme = f'''Синий пак — {len(files)} анимированных эмодзи

В папке tgs — готовые файлы для Telegram, включая technologist-bust, если он добавлен в пак.
Формат: TGS, 512×512, 60 кадров/с, до 3 секунд, каждый файл до 64 КиБ.

ЗАГРУЗКА
1. Распакуйте архив.
2. Откройте официальный https://t.me/Stickers . Можно использовать его мини-приложение
   для создания набора эмодзи или команду /newemojipack в чате с ботом.
3. Для команды выберите анимированные эмодзи и задайте название набора.
4. Загружайте файлы из tgs как файлы/документы, следуя подсказкам Telegram.
   На запрос обычного эмодзи можно скопировать привязку из emoji-map.txt.
5. После всех файлов отправьте /publish и следуйте подсказкам бота.

ZIP служит для передачи файлов; в бота загружаются распакованные TGS.
Привязки в списке рекомендательные: для L использован 👆, для W — 🖖,
для 6–7 — 🤲. Их можно заменить при загрузке.

manifest.csv содержит размеры файлов и SHA-256 для проверки целостности.
Официальная справка: https://core.telegram.org/stickers
'''
payloads['README.txt'] = readme.encode('utf-8-sig')
payloads['emoji-map.txt'] = ('\n'.join(f"{m['file']}\t{m['emoji']}" for m in manifest) + '\n').encode('utf-8-sig')
csv_text = io.StringIO(newline='')
writer = csv.DictWriter(csv_text, fieldnames=['file', 'emoji', 'bytes', 'sha256'])
writer.writeheader()
writer.writerows(manifest)
payloads['manifest.csv'] = csv_text.getvalue().encode('utf-8-sig')
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(OUTPUT, 'w', ZIP_DEFLATED) as archive:
    for name, data in payloads.items():
        archive.writestr(name, data)
with ZipFile(OUTPUT) as archive:
    assert archive.testzip() is None, 'ZIP checksum failure'
    assert set(archive.namelist()) == set(payloads), 'ZIP entry mismatch'
    for name, data in payloads.items():
        assert archive.read(name) == data, f'ZIP payload differs: {name}'
print(f'{OUTPUT}: {len(files)} TGS, {OUTPUT.stat().st_size:,} bytes; validated format, sizes, hashes and ZIP contents')
