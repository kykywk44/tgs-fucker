import { readStored, writeStored } from './workspaceSession'

export interface BotStatus { running: boolean; status: string; links: string[] }
export interface TelegramSession { emoji: Record<string, string>; status: BotStatus | null }
export const completed = (status: BotStatus) => !status.running && /^Готово[.!:]/.test(status.status)
export const panelKey = (set: string, ids: string[]) => `tgs.telegram.v1:${set}/${ids.join(',')}`
export const targetsKey = 'tgs.telegram.targets.v1'
export const stringList = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === 'string')
export function isTelegramSession(v: unknown): v is TelegramSession {
  if (!v || typeof v !== 'object') return false
  const value = v as TelegramSession
  if (!value.emoji || typeof value.emoji !== 'object' || !Object.values(value.emoji).every(s => typeof s === 'string')) return false
  const s = value.status
  return s === null || (!!s && typeof s.running === 'boolean' && typeof s.status === 'string' && stringList(s.links))
}
export const readTelegramSession = (key: string) => readStored(key, isTelegramSession)
export const saveTelegramSession = (key: string, value: TelegramSession) => writeStored(key, value)
