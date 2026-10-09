// Thin wrapper over the raw tlottie.wasm ABI (no wasm-bindgen glue). Pure TS:
// no DOM, no fs, no fetch. The caller supplies the wasm bytes.
// Pointers are byte offsets into `memory.buffer`; memory growth detaches every
// view, so views are created fresh per call and never cached.

interface TLottieExports {
  memory: WebAssembly.Memory
  tlottie_alloc(len: number): number
  tlottie_free(ptr: number, len: number): void
  tlottie_new(jsonPtr: number, jsonLen: number): number
  tlottie_drop(inst: number): void
  tlottie_frame_rate(inst: number): number
  tlottie_frame_count(inst: number): number
  tlottie_render(inst: number, frame: number, width: number, height: number, antialias: number): number
}

const REQUIRED_EXPORTS = [
  'memory',
  'tlottie_alloc',
  'tlottie_free',
  'tlottie_new',
  'tlottie_drop',
  'tlottie_frame_rate',
  'tlottie_frame_count',
  'tlottie_render',
] as const

export interface Animation {
  readonly frameCount: number // Math.max(1, tlottie_frame_count)
  readonly frameRate: number // tlottie_frame_rate
  /** Straight-alpha RGBA (w*h*4), a view into wasm memory valid until the next engine call. null after drop() or on engine failure. */
  render(frame: number, width: number, height: number): Uint8ClampedArray<ArrayBuffer> | null
  drop(): void // idempotent
}

export interface Engine {
  /** null: empty / alloc failure / tlottie rejected the JSON */
  create(json: string): Animation | null
}

const encoder = new TextEncoder()

export async function loadEngine(wasm: BufferSource): Promise<Engine> {
  const { instance } = await WebAssembly.instantiate(wasm, {})
  const exports = instance.exports as unknown as Record<string, unknown>
  for (const name of REQUIRED_EXPORTS) {
    if (!(name in exports)) throw new Error(`tlottie.wasm: нет экспорта ${name}`)
  }
  const api = exports as unknown as TLottieExports

  return {
    create(json: string): Animation | null {
      const bytes = encoder.encode(json)
      const len = bytes.length
      if (len === 0) return null

      const ptr = api.tlottie_alloc(len)
      if (ptr === 0) return null

      let inst: number
      try {
        new Uint8Array(api.memory.buffer, ptr, len).set(bytes)
        inst = api.tlottie_new(ptr, len)
      } finally {
        api.tlottie_free(ptr, len)
      }
      if (inst === 0) return null

      const frameCount = Math.max(1, api.tlottie_frame_count(inst))
      const frameRate = api.tlottie_frame_rate(inst)
      let handle = inst

      return {
        frameCount,
        frameRate,
        render(frame, width, height) {
          if (handle === 0) return null
          const out = api.tlottie_render(handle, frame, width, height, 1)
          if (out === 0) return null
          return new Uint8ClampedArray(api.memory.buffer, out, width * height * 4)
        },
        drop() {
          if (handle === 0) return
          api.tlottie_drop(handle)
          handle = 0
        },
      }
    },
  }
}
