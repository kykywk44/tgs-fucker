import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer as httpServer } from 'node:http'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { createServer } from 'vite'
import { remote } from './remote.ts'
import { isRuntimeData } from './runtime-files.ts'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

describe('Telegram delivery does not reload the current page', () => {
  it('copies/packages/submits once and publishes a data-update event, with no full reload', async () => {
    const base = resolve('exports/ui-tests')
    await mkdir(base, { recursive: true })
    const root = await mkdtemp(join(base, 'delivery-'))
    cleanup.push(async () => {
      const target = await realpath(root), allowed = await realpath(base)
      if (!target.startsWith(allowed + sep)) throw new Error('Fixture cleanup outside workspace')
      await rm(target, { recursive: true, force: true })
    })
    for (const folder of ['exports/blue', 'packs/blue/ready', 'library', 'scripts']) await mkdir(join(root, folder), { recursive: true })
    await writeFile(join(root, 'index.html'), '<html><body>fixture</body></html>')
    await writeFile(join(root, 'exports/blue/new-card.tgs'), 'fixture-tgs')
    await writeFile(join(root, 'packs/blue/emoji.txt'), '')
    await writeFile(join(root, 'library/index.json'), '{"version":1}')
    await writeFile(join(root, 'scripts/package-blue.py'), "from pathlib import Path\nPath('exports/blue-pack.zip').write_bytes(b'fixture-archive')\n")
    await writeFile(join(root, 'scripts/library.mjs'), "import{writeFile,rename}from'node:fs/promises';await writeFile('library/next.tmp','{\"version\":2}');await rename('library/next.tmp','library/index.json');")
    const requests: unknown[] = []
    const control = httpServer(async (request, response) => {
      let text = ''
      for await (const chunk of request) text += chunk
      expect(request.headers.authorization).toBe('Bearer fixture-token')
      requests.push(JSON.parse(text))
      response.writeHead(202, { 'Content-Type': 'application/json' })
      response.end('{"started":true,"links":["https://t.me/addemoji/fixture"]}')
    })
    await new Promise<void>(done => control.listen(0, '127.0.0.1', done))
    cleanup.push(async () => { control.closeAllConnections(); await new Promise<void>(done => control.close(() => done())) })
    const address = control.address()
    if (!address || typeof address === 'string') throw new Error('No control address')
    const server = await createServer({ configFile: false, root, logLevel: 'silent', appType: 'custom',
      server: { host: '127.0.0.1', port: 0, watch: { ignored: file => isRuntimeData(root, file) } },
      plugins: [remote({ root, password: '', botToken: 'fixture-token', botPort: address.port })],
    })
    cleanup.push(() => server.close())
    const packets: unknown[] = []
    vi.spyOn(server.ws, 'send').mockImplementation((packet: unknown) => { packets.push(packet) })
    await server.listen()
    // Even if the runtime JSON has entered the module graph, regenerating it is data-only.
    await server.transformRequest('/library/index.json')
    const listener = server.httpServer?.address()
    if (!listener || typeof listener === 'string') throw new Error('No app address')
    const response = await fetch(`http://127.0.0.1:${listener.port}/api/telegram/add`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ set: 'drafts', items: [{ id: 'new-card', emoji: '🪪' }], names: ['fixture_by_bot'] }) })
    const result = await response.json()
    expect(response.status, JSON.stringify(result)).toBe(200)
    expect(result).toMatchObject({ started: true, copied: ['new-card'] })
    expect(requests).toEqual([{ names: ['fixture_by_bot'], files: ['new-card.tgs'] }])
    expect(await readFile(join(root, 'packs/blue/ready/new-card.tgs'), 'utf8')).toBe('fixture-tgs')
    await expect.poll(async () => JSON.parse(await readFile(join(root, 'library/index.json'), 'utf8')).version, { timeout: 6000 }).toBe(2)
    await expect.poll(() => packets.some(p => (p as { event?: string }).event === 'tgs:library-updated'), { timeout: 6000 }).toBe(true)
    expect(packets.filter(p => (p as { type?: string }).type === 'full-reload')).toEqual([])
  }, 20000)
})
