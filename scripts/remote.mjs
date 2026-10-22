// Everything for working from the phone, in one process (Ctrl+C stops all three):
//   the editor (vite dev server, :5173, password for the tunnel — server/remote.ts),
//   the Telegram bot V2 (scripts/telegram-pack-bot-v2.py, with its control server for «В Telegram»),
//   a quick Cloudflare tunnel to the editor. Its https://….trycloudflare.com address is printed
//   and written to exports/remote-url.txt; it changes on every start.
// Usage: node scripts/remote.mjs   (or scripts/start-remote.cmd)   [--no-bot]

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const PORT = 5173
const withBot = !process.argv.includes('--no-bot')
const children = []

function start(label, command, args, onLine) {
  const child = spawn(command, args, { cwd: ROOT, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, shell: false })
  children.push(child)
  const relay = (stream) => {
    let rest = ''
    stream.on('data', (chunk) => {
      const lines = (rest + chunk).split(/\r?\n/)
      rest = lines.pop()
      for (const line of lines) {
        if (line.trim()) console.log(`[${label}] ${line}`)
        onLine?.(line)
      }
    })
  }
  relay(child.stdout)
  relay(child.stderr)
  child.on('exit', (code) => console.log(`[${label}] остановлен (${code})`))
  return child
}

// the first path that exists, else the last candidate (a bare command name, looked up in PATH)
function which(candidates) {
  return candidates.slice(0, -1).find((c) => existsSync(c)) ?? candidates.at(-1)
}

// 127.0.0.1, not «localhost»: the tunnel connects there, and Node may bind «localhost» to ::1 only
const vite = ['vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort']
start('editor', process.platform === 'win32' ? 'cmd' : 'npx', process.platform === 'win32' ? ['/c', 'npx', ...vite] : vite)

if (withBot) {
  const python = which([join(ROOT, '.venv/Scripts/python.exe'), join(ROOT, '.venv/bin/python'), process.platform === 'win32' ? 'python' : 'python3'])
  start('bot', python, [join(ROOT, 'scripts/telegram-pack-bot-v2.py')])
}

const cloudflared = which(['C:/Program Files (x86)/cloudflared/cloudflared.exe', 'C:/Program Files/cloudflared/cloudflared.exe', 'cloudflared'])
let announced = false
start('tunnel', cloudflared, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PORT}`], async (line) => {
  const url = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0]
  if (!url || announced) return
  announced = true
  await mkdir(join(ROOT, 'exports'), { recursive: true })
  await writeFile(join(ROOT, 'exports/remote-url.txt'), url + '\n')
  console.log(`\n  С телефона: ${url}\n  (пароль — SITE_PASSWORD в .env; адрес меняется при каждом запуске)\n`)
})

const stop = () => {
  for (const child of children) child.kill()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
