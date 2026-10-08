export interface Lottie {
  v?: string; fr: number; ip: number; op: number; w: number; h: number;
  layers: unknown[]; assets?: unknown[]; tgs?: number;
  [key: string]: unknown;
}

const GZIP_MAGIC_0 = 0x1f
const GZIP_MAGIC_1 = 0x8b

// Runs bytes through a native (de)compression stream and returns the result.
// The input is copied into an ArrayBuffer-backed view because the Blob and
// stream APIs do not accept Uint8Array<ArrayBufferLike>.
async function transform(
  input: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const piped = new Blob([new Uint8Array(input)]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(piped).arrayBuffer())
}

// Reads a .tgs (gzip-compressed Lottie JSON) or a plain Lottie JSON file.
export async function readTgs(bytes: Uint8Array): Promise<Lottie> {
  const isGzip = bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1
  const raw = isGzip
    ? await transform(bytes, new DecompressionStream('gzip'))
    : bytes
  return JSON.parse(new TextDecoder().decode(raw)) as Lottie
}

// Writes a Telegram-ready .tgs: sets tgs: 1, compact JSON, gzip. Never mutates `anim`.
export async function writeTgs(anim: Lottie): Promise<Uint8Array> {
  const json = JSON.stringify({ ...anim, tgs: 1 })
  return transform(new TextEncoder().encode(json), new CompressionStream('gzip'))
}

export function sizeKb(bytes: Uint8Array): number {
  return Math.round((bytes.length / 1024) * 10) / 10
}
