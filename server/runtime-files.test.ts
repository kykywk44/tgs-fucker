import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { isRuntimeData } from './runtime-files.ts'

describe('pack data never triggers source hot reload', () => {
  const root = resolve('workspace-fixture')
  it.each(['exports/blue/family.tgs', 'exports/telegram-bot/123.json', 'exports/blue-pack.zip',
    'packs/blue/ready/family.tgs', 'packs/blue/emoji.txt', 'library/index.json', 'library/thumbs/blue-1.png'])('ignores generated %s', file => {
    expect(isRuntimeData(root, resolve(root, file))).toBe(true)
  })
  it.each(['src/App.tsx', 'src/index.css', 'server/remote.ts', 'vite.config.ts', 'samples/CoolSticker.tgs', '../other/library/index.json'])('continues watching source %s', file => {
    expect(isRuntimeData(root, resolve(root, file))).toBe(false)
  })
})
