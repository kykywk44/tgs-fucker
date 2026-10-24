param([switch]$TelegramOnly)
$ErrorActionPreference = 'Stop'
Push-Location (Resolve-Path (Join-Path $PSScriptRoot '../..'))
try {
    if (-not $TelegramOnly) {
        node trailers/blue-crowd/assets.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Sprite rendering failed' }
        python trailers/blue-crowd/render.py
        if ($LASTEXITCODE -ne 0) { throw 'Video rendering failed' }
    }
    python trailers/blue-crowd/telegram.py
    if ($LASTEXITCODE -ne 0) { throw 'Telegram export failed' }
    Copy-Item -LiteralPath trailers/blue-crowd/preview.html -Destination exports/blue-crowd/preview.html
} finally { Pop-Location }
