import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { IncomingMessage, ServerResponse } from 'node:http'

const run = promisify(execFile)
export const PHOTO_TEMPLATES: Record<string, string> = { '554': 'phone-photo-554', '556': 'laptop-photo-556', '558': 'printer-photo-558', '573': 'id-photo-573', '606': 'painting-photo-606', '621': 'letter-photo-621', '632': 'ballot-photo-632', '950': 'flag-photo-950', '255': 'egg-photo-255', '222': 'hat-photo-222', '569': 'barrel', '704': 'stas-704' }
const isText = (template: string) => template === '569' || template === '704'
const extension = (template: string) => isText(template) ? 'tgs' : 'webm'
export function isPrivatePhotoPath(path: string): boolean {
  try { for (let n = 0; n < 3; n++) path = decodeURIComponent(path) } catch { return true }
  path = path.replaceAll('\\', '/').toLowerCase()
  return /\/private(?:\/|$)/.test(path) || path.includes('/exports/photo-custom') || path.endsWith('/packs/emoji/photo-devices/photo.png')
}
interface Job { id: string; template: string; phase: string; ready: boolean; sent: boolean; error?: string }
const reply = (res: ServerResponse, code: number, data: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)) }
async function input(req: IncomingMessage) {
  let size = 0; const chunks: Buffer[] = []
  for await (const chunk of req) { const b = Buffer.from(chunk); size += b.length; if (size > 20 * 1024 * 1024) throw new Error('Файл слишком большой: до 15 MB.'); chunks.push(b) }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}
export function photoStickers(root: string, execute = run) {
  const jobs = new Map<string, Job>(); let queue = Promise.resolve(); let pending = 0
  const directory = (id: string) => join(root, 'exports/photo-custom', id)
  const snapshot = (job: Job) => ({ ...job, video: job.ready ? `/api/photo-stickers/jobs/${job.id}/video` : null })
  const enqueue = (job: Job, work: () => Promise<void>) => {
    pending++
    queue = queue.then(async () => { try { await work() } catch { job.phase = 'error'; job.error = isText(job.template) ? 'Не удалось создать или отправить стикер. Проверь символы текста и подключение бота.' : 'Не удалось обработать фото или отправить стикер. Проверь изображение и подключение бота.' } finally { pending-- } })
  }
  const send = async (job: Job) => {
    job.phase = 'sending'
    await execute('python', [join(root, 'packs/emoji/photo-devices/send.py'), '--job', directory(job.id)], { cwd: root, timeout: 120000 })
    job.sent = true; job.phase = 'done'
  }
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const path = new URL(req.url ?? '/', 'http://local').pathname
    if (!path.startsWith('/api/photo-stickers')) return false
    try {
      if (req.method === 'POST') {
        const origin = req.headers.origin
        if (req.headers['x-photo-sticker'] !== '1' || (origin && new URL(origin).host !== req.headers.host)) { reply(res, 403, { error: 'Недопустимый источник запроса.' }); return true }
      }
      const match = path.match(/^\/api\/photo-stickers\/jobs\/([a-f0-9-]{36})(?:\/(video|send))?$/)
      if (match) {
        const job = jobs.get(match[1]); if (!job) { reply(res, 404, { error: 'Задание не найдено.' }); return true }
        if (req.method === 'GET' && match[2] === 'video' && job.ready) {
          const bytes = await readFile(join(directory(job.id), `${PHOTO_TEMPLATES[job.template]}.${extension(job.template)}`))
          res.writeHead(200, { 'Content-Type': isText(job.template) ? 'application/gzip' : 'video/webm', 'Content-Length': bytes.length, 'Cache-Control': 'no-store' }); res.end(bytes); return true
        }
        if (req.method === 'GET' && !match[2]) { reply(res, 200, snapshot(job)); return true }
        if (req.method === 'POST' && match[2] === 'send') {
          if (!job.ready || job.phase === 'sending' || job.phase === 'queued') { reply(res, 409, { error: 'Дождись окончания операции.' }); return true }
          if (!job.sent) { job.phase = 'queued'; delete job.error; enqueue(job, () => send(job)) }
          reply(res, 202, snapshot(job)); return true
        }
      }
      if (path === '/api/photo-stickers/jobs' && req.method === 'POST') {
        if (pending >= 4) { reply(res, 429, { error: 'Очередь заполнена. Подожди окончания обработки.' }); return true }
        const data = await input(req), template = String(data.template)
        if (!Object.hasOwn(PHOTO_TEMPLATES, template)) { reply(res, 400, { error: 'Неизвестный шаблон.' }); return true }
        let text: string | null = null
        if (isText(template)) {
          text = typeof data.text === 'string' ? data.text.normalize('NFC').trim().toUpperCase() : null
          if (!text || [...text].length > 32 || !/^[\p{Script=Latin}\p{Script=Cyrillic}\p{N}\p{P}\p{Zs}+\-=<>$€₽%&@#*^~|]+$/u.test(text)) { reply(res, 400, { error: 'Введи от 1 до 32 символов: кириллица, латиница, цифры и знаки.' }); return true }
        }
        let image: Buffer | null = null
        if (data.photo !== undefined) {
          if (isText(template)) { reply(res, 400, { error: 'Для этого стикера нужен текст.' }); return true }
          if (typeof data.photo !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data.photo)) { reply(res, 400, { error: 'Выбери PNG, JPEG или WebP.' }); return true }
          image = Buffer.from(data.photo.slice(data.photo.indexOf(',') + 1), 'base64')
          if (image.length > 15 * 1024 * 1024) { reply(res, 413, { error: 'Фото должно быть меньше 15 MB.' }); return true }
        }
        const job: Job = { id: randomUUID(), template, phase: 'queued', ready: false, sent: false }
        await mkdir(directory(job.id), { recursive: true })
        if (image) await writeFile(join(directory(job.id), 'photo'), image)
        if (text) await writeFile(join(directory(job.id), 'input.json'), JSON.stringify({ text }))
        jobs.set(job.id, job)
        enqueue(job, async () => {
          if (text) {
            job.phase = 'rendering'
            const script = template === '569' ? 'barrel' : 'stas-704'
            await execute(process.execPath, [join(root, `packs/emoji/${script}/build.mjs`), `--job=${directory(job.id)}`], { cwd: root, timeout: 120000 })
          } else if (image) {
            job.phase = 'rendering'
            try {
              await execute('python', [join(root, 'packs/emoji/photo-devices/compose.py'), join(root, 'packs/emoji/photo-devices'), join(root, 'exports/photo-devices'), '--id', template, '--photo', join(directory(job.id), 'photo'), '--dest', directory(job.id)], { cwd: root, timeout: 240000 })
            } finally { await rm(join(directory(job.id), 'photo'), { force: true }) }
          } else await copyFile(join(root, 'exports/photo-devices', `${PHOTO_TEMPLATES[template]}.webm`), join(directory(job.id), `${PHOTO_TEMPLATES[template]}.webm`))
          job.ready = true; job.phase = 'done'
          if (data.send === true) await send(job)
        })
        reply(res, 202, snapshot(job)); return true
      }
      reply(res, 404, { error: 'Нет такого запроса.' }); return true
    } catch { reply(res, 400, { error: 'Не удалось прочитать запрос.' }); return true }
  }
}
