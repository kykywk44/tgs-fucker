import { describe, expect, it } from 'vitest'

describe('node runtime', () => {
  it('provides native gzip streams as globals', () => {
    expect(typeof CompressionStream).toBe('function')
    expect(typeof DecompressionStream).toBe('function')
    expect(() => new CompressionStream('gzip')).not.toThrow()
    expect(() => new DecompressionStream('gzip')).not.toThrow()
  })
})
