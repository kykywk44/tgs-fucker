import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from 'vite'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { remote } from './remote.ts'
import { photoStickers, isPrivatePhotoPath } from './photo-stickers.ts'
const clean: (() => Promise<unknown>)[] = []
afterEach(async () => { while (clean.length) await clean.pop()!() })
async function fixture() {
  const base = resolve('exports/photo-api-tests'); await mkdir(base, { recursive: true })
  const root = await mkdtemp(join(base, 'case-'))
  clean.push(async () => { if (!root.startsWith(base + sep)) throw Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }) })
  await mkdir(join(root, 'library'), { recursive: true })
  return root
}
async function listen(root: string, extra?: ReturnType<typeof photoStickers>) {
  const server = await createServer({ configFile: false, root, logLevel: 'silent', appType: 'custom', server: { host: '127.0.0.1', port: 0 },
    plugins: extra ? [{ name: 'photo-test', configureServer(s) { s.middlewares.use((req, res, next) => { void extra(req, res).then(handled => { if (!handled) next() }) }) } }] : [remote({ root, password: 'test-password', botToken: '', botPort: 0 })] })
  await server.listen(); clean.push(() => server.close())
  const address = server.httpServer!.address(); if (!address || typeof address === 'string') throw Error('No listener')
  return `http://127.0.0.1:${address.port}`
}
describe('private photo templates', () => {
  it.each([['569', 'barrel'], ['704', 'stas-704']])('builds custom text %s as an animated TGS', async (template, name) => {
    const root = await fixture(), calls: string[][] = []
    const execute = async (_cmd: string, args: readonly string[]) => {
      calls.push([...args])
      const dest = String(args[1]).slice('--job='.length)
      expect(JSON.parse(await readFile(join(dest, 'input.json'), 'utf8')).text).toBe('ПРИВЕТ AI 123')
      await writeFile(join(dest, `${name}.tgs`), 'fixture-tgs')
      return { stdout: '', stderr: '' }
    }
    const url = await listen(root, photoStickers(root, execute as never))
    const post = (text: string) => fetch(url + '/api/photo-stickers/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Photo-Sticker': '1' }, body: JSON.stringify({ template, text }) })
    expect((await post('   ')).status).toBe(400)
    expect((await post('x'.repeat(33))).status).toBe(400)
    const response = await post(' привет ai 123 '), job = await response.json() as { id: string }
    expect(response.status).toBe(202)
    await expect.poll(async () => ((await (await fetch(url + `/api/photo-stickers/jobs/${job.id}`)).json()) as { ready: boolean }).ready).toBe(true)
    const result = await fetch(url + `/api/photo-stickers/jobs/${job.id}/video`)
    expect(result.headers.get('content-type')).toBe('application/gzip')
    expect(await result.text()).toBe('fixture-tgs')
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe(join(root, `packs/emoji/${name}/build.mjs`))
  })
  it.each(['/packs/emoji/photo-devices/private/photo.png', '/packs/emoji/photo-devices/photo.png', '/@fs/D:/project/packs/emoji/photo-devices/private/photo.png', '/packs/emoji/photo-devices/%2570rivate/photo.png', '/exports/photo-custom/any/photo'])('blocks original %s', path => expect(isPrivatePhotoPath(path)).toBe(true))
  it('allows generated standard previews', () => expect(isPrivatePhotoPath('/exports/emoji/laptop-photo-556.webm')).toBe(false))
  it('denies raw images even for local requests and requires login remotely', async () => {
    const root = await fixture(), url = await listen(root)
    expect((await fetch(url + '/packs/emoji/photo-devices/private/photo.png')).status).toBe(404)
    expect((await fetch(url + '/api/photo-stickers/jobs', { method: 'POST', headers: { 'cf-connecting-ip': '198.51.100.1' } })).status).toBe(401)
    expect((await fetch(url + '/api/photo-stickers/jobs', { method: 'POST', headers: { Origin: 'https://other.example', 'X-Photo-Sticker': '1' }, body: '{}' })).status).toBe(403)
  })
  it('validates templates, sends only on explicit request, and does not resend a sent job', async () => {
    const root = await fixture(), calls: string[][] = []
    const execute = async (_cmd: string, args: readonly string[]) => {
      calls.push([...args])
      if (String(args[0]).endsWith('compose.py')) {
        const dest = args[args.indexOf('--dest') + 1]
        await writeFile(join(dest, 'laptop-photo-556.webm'), 'fixture-webm')
      }
      return { stdout: '', stderr: '' }
    }
    const url = await listen(root, photoStickers(root, execute as never))
    const post = async (path: string, body: unknown) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Photo-Sticker': '1' }, body: JSON.stringify(body) })
    expect((await post('/api/photo-stickers/jobs', { template: '../556' })).status).toBe(400)
    expect((await post('/api/photo-stickers/jobs', { template: '556', photo: 'data:image/svg+xml;base64,AAAA' })).status).toBe(400)
    const response = await post('/api/photo-stickers/jobs', { template: '556', photo: 'data:image/png;base64,AAAA' }), job = await response.json() as { id: string }
    const status = async () => await (await fetch(url + `/api/photo-stickers/jobs/${job.id}`)).json() as { ready: boolean; sent: boolean }
    expect(response.status).toBe(202)
    await expect.poll(async () => (await status()).ready).toBe(true)
    expect(calls).toHaveLength(1)
    await expect(readFile(join(root, 'exports/photo-custom', job.id, 'photo'))).rejects.toThrow()
    const video = await fetch(url + `/api/photo-stickers/jobs/${job.id}/video`)
    expect(video.headers.get('content-type')).toBe('video/webm'); expect(await video.text()).toBe('fixture-webm')
    await post(`/api/photo-stickers/jobs/${job.id}/send`, {})
    await expect.poll(async () => (await status()).sent).toBe(true)
    await post(`/api/photo-stickers/jobs/${job.id}/send`, {})
    expect(calls).toHaveLength(2)
    expect(calls[1][0]).toMatch(/send\.py$/)
  })
})
