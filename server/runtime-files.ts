import { relative, resolve } from 'node:path'

// Generated pack/library files are fetched as data. They must never reload the app.
export function isRuntimeData(root: string, file: string): boolean {
  const path = relative(resolve(root), resolve(root, file)).replaceAll('\\', '/')
  return ['exports', 'library', 'packs/blue/ready'].some(dir => path === dir || path.startsWith(`${dir}/`)) || path === 'packs/blue/emoji.txt'
}
