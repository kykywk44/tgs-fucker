// Remote access to the dev server (a Cloudflare tunnel from the phone) and the «В Telegram» button.
//
// Password: every request that came through the tunnel needs the session cookie, which the
// /__login page gives for SITE_PASSWORD (.env). Requests from this computer itself (no proxy
// headers, loopback address) pass without it, so localhost:5173 works as before. No SITE_PASSWORD:
// the tunnel gets nothing (fails closed). The HMR websocket is checked the same way.
//
// API (behind the same password):
//   GET  /api/telegram/info?set=drafts|blue&ids=a,b     for each: the emoji proposed, whether ready/ has it
//   GET  /api/telegram/sets                             the bot's sets (scripts/telegram-pack-bot-v2.py)
//   GET  /api/telegram/status                           the bot's current job
//   POST /api/telegram/add {set, items: [{id, emoji}], names: [set, …]}
//        copy the stickers to packs/blue/ready, bind their emoji in packs/blue/emoji.txt (appended in
//        this order: the library lists the pack newest first), rebuild exports/blue-pack.zip
//        (scripts/package-blue.py) once, and ask the bot to add them, in this order, to each of the
//        sets in turn (its local control server, BOT_CONTROL_TOKEN); it then sends each as it came out

import { execFile, spawn } from 'node:child_process'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { existsSync, watchFile, unwatchFile, type Stats } from 'node:fs'
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { Plugin } from 'vite'
import { photoStickers, isPrivatePhotoPath } from './photo-stickers.ts'

const run = promisify(execFile)
const COOKIE = 'tgs_session'
const MONTH = 30 * 24 * 3600
const LOCKOUT = { tries: 5, ms: 15 * 60 * 1000 }

export interface RemoteOptions {
  root: string
  password: string // '' → nothing through the tunnel
  botToken: string
  botPort: number
}

// ---------- password ----------

const sessionValue = (password: string) => createHmac('sha256', password).update('tgs-session-v1').digest('hex')

function cookies(req: IncomingMessage): Record<string, string> {
  return Object.fromEntries(
    (req.headers.cookie ?? '').split(';').map((part) => {
      const at = part.indexOf('=')
      return [part.slice(0, at).trim(), decodeURIComponent(part.slice(at + 1).trim())]
    }),
  )
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

// This computer: no proxy in between (cloudflared always adds these headers) and a loopback peer.
function isLocal(req: IncomingMessage): boolean {
  const proxied = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.headers['cf-ray']
  const peer = req.socket.remoteAddress ?? ''
  return !proxied && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)
}

function clientIp(req: IncomingMessage): string {
  return String(req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress ?? '?')
}

const loginPage = (message = '') => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>TGS Editor — вход</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0; min-height: 100svh; display: grid; place-items: center; background: Canvas; color: CanvasText; }
  form { width: min(320px, calc(100vw - 32px)); display: flex; flex-direction: column; gap: 12px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  input, button { font: inherit; font-size: 16px; padding: 12px 14px; border-radius: 12px; border: 1px solid #8888; }
  button { background: #335375; color: white; border: 0; cursor: pointer; }
  p { margin: 0; color: #c0392b; font-size: 14px; }
</style></head>
<body><form method="post" action="/__login">
  <h1>TGS Editor</h1>
  <input type="password" name="password" placeholder="Пароль" autocomplete="current-password" autofocus required>
  <button type="submit">Войти</button>
  ${message ? `<p>${message}</p>` : ''}
</form></body></html>`

function send(res: ServerResponse, code: number, body: string, type = 'text/html; charset=utf-8', headers: Record<string, string> = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers })
  res.end(body)
}

const json = (res: ServerResponse, code: number, body: unknown) => send(res, code, JSON.stringify(body), 'application/json; charset=utf-8')

async function body(req: IncomingMessage, limit = 4096): Promise<string> {
  let data = ''
  for await (const chunk of req) {
    data += chunk
    if (data.length > limit) throw new Error('слишком большой запрос')
  }
  return data
}

// ---------- the pack ----------

const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/
const SETS = { drafts: 'exports/blue', blue: 'packs/blue/ready' } as const
type SetId = keyof typeof SETS

function python(root: string): string {
  for (const p of ['.venv/Scripts/python.exe', '.venv/bin/python']) if (existsSync(join(root, p))) return join(root, p)
  return process.platform === 'win32' ? 'python' : 'python3'
}

async function readMapping(root: string): Promise<string[]> {
  return (await readFile(join(root, 'packs/blue/emoji.txt'), 'utf8')).split(/\r?\n/)
}

function mapped(lines: string[], id: string): string | null {
  const line = lines.find((l) => !l.startsWith('#') && l.split(' ', 1)[0] === id)
  return line ? line.slice(id.length + 1).trim() : null
}

// The emoji to propose: the one already bound, else the recipe's.
async function proposedEmoji(root: string, id: string): Promise<string> {
  const bound = mapped(await readMapping(root), id)
  if (bound) return bound
  try {
    const recipe = JSON.parse(await readFile(join(root, 'packs/blue', id, 'recipe.json'), 'utf8')) as { emoji?: string }
    return recipe.emoji ?? ''
  } catch {
    return ''
  }
}

async function bot(opts: RemoteOptions, path: string, payload?: unknown): Promise<{ code: number; body: Record<string, unknown> }> {
  if (!opts.botToken) return { code: 503, body: { error: 'В .env нет BOT_CONTROL_TOKEN.' } }
  try {
    const response = await fetch(`http://127.0.0.1:${opts.botPort}${path}`, {
      method: payload ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${opts.botToken}`, 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(15000),
    })
    return { code: response.status, body: (await response.json()) as Record<string, unknown> }
  } catch {
    return { code: 503, body: { error: 'Бот не запущен: scripts/start-telegram-bot-v2.cmd.' } }
  }
}

interface Item {
  id: string
  emoji: string
}

async function itemInfo(root: string, set: SetId, id: string) {
  const src = join(root, SETS[set], `${id}.tgs`)
  const ready = join(root, SETS.blue, `${id}.tgs`)
  const inReady = existsSync(ready)
  const sameAsReady = inReady && existsSync(src) && (await readFile(src)).equals(await readFile(ready))
  return { id, emoji: await proposedEmoji(root, id), inReady, sameAsReady }
}

async function addToTelegram(opts: RemoteOptions, input: Record<string, unknown>): Promise<{ code: number; body: Record<string, unknown> }> {
  const { root } = opts
  const set = String(input.set) as SetId
  const items: Item[] = Array.isArray(input.items)
    ? input.items.map((it: { id?: unknown; emoji?: unknown }) => ({ id: String(it?.id ?? ''), emoji: String(it?.emoji ?? '').trim() }))
    : []
  const names = Array.isArray(input.names) ? [...new Set(input.names.map(String).filter(Boolean))] : []
  if (!(set in SETS) || !items.length || items.some((it) => !NAME.test(it.id))) return { code: 400, body: { error: 'Неизвестный стикер.' } }
  if (new Set(items.map((it) => it.id)).size !== items.length) return { code: 400, body: { error: 'Стикер выбран дважды.' } }
  const noEmoji = items.filter((it) => !it.emoji || it.emoji.length > 16 || /[\s#]/.test(it.emoji))
  if (noEmoji.length) return { code: 400, body: { error: `Нужен один эмодзи для привязки: ${noEmoji.map((it) => it.id).join(', ')}.` } }
  if (!names.length) return { code: 400, body: { error: 'Не выбран набор.' } }

  // everything checked before anything is written
  const files = await Promise.all(
    items.map(async (it) => {
      const src = join(root, SETS[set], `${it.id}.tgs`)
      const ready = join(root, SETS.blue, `${it.id}.tgs`)
      const data = existsSync(src) ? await readFile(src) : null
      const before = existsSync(ready) ? await readFile(ready) : null
      return { ...it, src, ready, data, before }
    }),
  )
  const missing = files.filter((f) => !f.data)
  if (missing.length) return { code: 404, body: { error: `Файл не найден: ${missing.map((f) => f.id).join(', ')}.` } }
  const conflicts = files.filter((f) => f.before && !f.before.equals(f.data!))
  if (conflicts.length) {
    return {
      code: 409,
      body: { error: `В паке уже другая версия: ${conflicts.map((f) => f.id).join(', ')}. Замена в наборе пока не поддерживается: бот добавил бы её второй.` },
    }
  }

  // ready/ and the bindings first, the archive from them; a failed build puts all of it back
  const lines = await readMapping(root)
  let text = lines.join('\n')
  for (const f of files) {
    if (!f.before) await copyFile(f.src, f.ready)
    const rows = text.split('\n')
    const old = mapped(rows, f.id)
    if (old === f.emoji) continue
    text =
      old === null
        ? text.replace(/\n*$/, '\n') + `${f.id} ${f.emoji}\n`
        : rows.map((l) => (!l.startsWith('#') && l.split(' ', 1)[0] === f.id ? `${f.id} ${f.emoji}` : l)).join('\n')
  }
  await writeFile(join(root, 'packs/blue/emoji.txt'), text)
  try {
    await run(python(root), [join(root, 'scripts/package-blue.py')], { cwd: root, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
  } catch (err) {
    for (const f of files) if (!f.before) await rm(f.ready, { force: true })
    await writeFile(join(root, 'packs/blue/emoji.txt'), lines.join('\n'))
    const detail = (err as { stderr?: string }).stderr?.trim().split('\n').pop() ?? String(err)
    return { code: 422, body: { error: `Архив не собрался: ${detail}` } }
  }
  // the «готово» tab of the library catches up in the background
  spawn(process.execPath, [join(root, 'scripts/library.mjs')], { cwd: root, stdio: 'ignore', detached: false })

  // only these stickers: the bot adds each to each set unless the set already has it
  const copied = files.filter((f) => !f.before).map((f) => f.id)
  const started = await bot(opts, '/append', { names, files: files.map((f) => `${f.id}.tgs`) })
  if (started.code >= 300) {
    const note = started.code === 409
      ? 'Файлы уже в ready/ и в архиве; повтори, когда бот освободится.'
      : 'Файлы сохранены в ready/ и в архиве. Проверь связь бота с Telegram и повтори отправку.'
    return { code: started.code, body: { ...started.body, copied, note } }
  }
  return { code: 200, body: { ...started.body, copied } }
}

// ---------- the plugin ----------

export function remote(opts: RemoteOptions): Plugin {
  const photo = photoStickers(opts.root)
  const expected = opts.password ? sessionValue(opts.password) : ''
  const failures = new Map<string, { count: number; until: number }>()
  const authed = (req: IncomingMessage) => isLocal(req) || (!!expected && same(cookies(req)[COOKIE] ?? '', expected))

  return {
    name: 'tgs-remote',
    configureServer(server) {
      // Separate data notification: neither a newly approved TGS nor rebuilding
      // the thumbnail index is a source-code change requiring page navigation.
      const indexFile = join(opts.root, 'library/index.json')
      const changed = (current: Stats, previous: Stats) => {
        if (current.size && current.mtimeMs !== previous.mtimeMs) {
          server.ws.send({ type: 'custom', event: 'tgs:library-updated', data: { revision: current.mtimeMs } })
        }
      }
      watchFile(indexFile, { interval: 1500, persistent: false }, changed)
      server.httpServer?.once('close', () => unwatchFile(indexFile, changed))
      server.httpServer?.prependListener('upgrade', (req: IncomingMessage, socket: Duplex) => {
        if (!authed(req)) socket.destroy()
      })

      // Sprite names change with their content (scripts/library.mjs): the phone may keep them.
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/library/thumbs/')) res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
        next()
      })

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://x')
        try {
          if (isPrivatePhotoPath(url.pathname)) return send(res, 404, '', 'text/plain')
          if (url.pathname === '/__login') {
            if (req.method !== 'POST') return send(res, 200, loginPage())
            const ip = clientIp(req)
            const lock = failures.get(ip)
            if (lock && lock.until > Date.now()) return send(res, 429, loginPage('Слишком много попыток. Подожди 15 минут.'))
            const password = new URLSearchParams(await body(req)).get('password') ?? ''
            if (!expected || !same(sessionValue(password), expected)) {
              // a lockout that has run out starts the count again
              const count = lock && lock.until && lock.until <= Date.now() ? 1 : (lock?.count ?? 0) + 1
              failures.set(ip, { count, until: count >= LOCKOUT.tries ? Date.now() + LOCKOUT.ms : 0 })
              await new Promise((r) => setTimeout(r, 800))
              return send(res, 401, loginPage(expected ? 'Неверный пароль.' : 'Пароль не задан: SITE_PASSWORD в .env.'))
            }
            failures.delete(ip)
            const secure = req.headers['x-forwarded-proto'] === 'https' || !!req.headers['cf-ray'] ? '; Secure' : ''
            return send(res, 303, '', 'text/plain', {
              Location: '/',
              'Set-Cookie': `${COOKIE}=${expected}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MONTH}${secure}`,
            })
          }
          if (url.pathname === '/__logout') {
            return send(res, 303, '', 'text/plain', { Location: '/__login', 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0` })
          }
          if (!authed(req)) {
            const page = (req.headers.accept ?? '').includes('text/html')
            return page ? send(res, 303, '', 'text/plain', { Location: '/__login' }) : json(res, 401, { error: 'нужен вход' })
          }

          if (await photo(req, res)) return
          if (!url.pathname.startsWith('/api/telegram/')) return next()
          const route = url.pathname.slice('/api/telegram/'.length)
          if (route === 'info' && req.method === 'GET') {
            const set = url.searchParams.get('set') as SetId
            const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean)
            if (!(set in SETS) || !ids.length || ids.length > 200 || ids.some((id) => !NAME.test(id))) {
              return json(res, 400, { error: 'Неизвестный стикер.' })
            }
            return json(res, 200, { items: await Promise.all(ids.map((id) => itemInfo(opts.root, set, id))) })
          }
          if (route === 'sets' && req.method === 'GET') {
            const r = await bot(opts, '/sets')
            return json(res, r.code, r.body)
          }
          if (route === 'status' && req.method === 'GET') {
            const r = await bot(opts, '/status')
            return json(res, r.code, r.body)
          }
          if (route === 'add' && req.method === 'POST') {
            const r = await addToTelegram(opts, JSON.parse(await body(req, 65536)) as Record<string, unknown>)
            return json(res, r.code, r.body)
          }
          return json(res, 404, { error: 'нет такого запроса' })
        } catch (err) {
          return json(res, 500, { error: err instanceof Error ? err.message : String(err) })
        }
      })
    },
  }
}
