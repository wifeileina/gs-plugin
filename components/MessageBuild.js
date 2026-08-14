const GUIDE_ACTIVE_WINDOW_MS = 60 * 1000
const guideActiveWindows = new Map()

export function normalizeBotId (value) {
  return String(value || '').trim().split(':').pop()
}

export function normalizeTargetId (value) {
  return String(value || '').trim().split(':').pop()
}

export function isQQBotMessage (data, bot) {
  const adapter = bot?.adapter
  const adapterMatched = [data?.bot_adapter, adapter?.id, adapter?.name, adapter?.platform, adapter]
    .some(value => String(value || '').toLowerCase() === 'qqbot')
  // GSUID 回包可能缺失 bot_adapter；QQBot 群/频道目标 ID 为 32 位十六进制。
  const targetMatched = /^(?:[0-9a-f]{32})$/i.test(normalizeTargetId(data?.target_id))
  return adapterMatched || targetMatched
}

function normalizeLegacyReply (value) {
  if (value && typeof value === 'object') {
    return {
      enabled: value.enabled === true,
      groups: Array.isArray(value.groups) ? value.groups.map(normalizeTargetId).filter(Boolean) : [],
      bots: Array.isArray(value.bots) ? value.bots.map(normalizeBotId).filter(Boolean) : []
    }
  }

  return {
    enabled: value === true,
    groups: [],
    bots: []
  }
}

export function normalizeMessageBuild (value, legacyFallback) {
  const config = value && typeof value === 'object' ? value : {}
  const active = config.forceActiveMessage && typeof config.forceActiveMessage === 'object'
    ? config.forceActiveMessage
    : {}

  return {
    legacyReply: normalizeLegacyReply(config.legacyReply ?? legacyFallback),
    forceActiveMessage: {
      enabled: active.enabled === true,
      matchingMode: active.matchingMode === true
    }
  }
}

function getGuideActiveWindowKey (botId, targetId) {
  const normalizedBotId = normalizeBotId(botId)
  const normalizedTargetId = normalizeTargetId(targetId)
  return normalizedBotId && normalizedTargetId ? `${normalizedBotId}:${normalizedTargetId}` : ''
}

export function markGuideActiveWindow (botId, targetId, now = Date.now()) {
  const key = getGuideActiveWindowKey(botId, targetId)
  if (!key) return false

  guideActiveWindows.set(key, now + GUIDE_ACTIVE_WINDOW_MS)
  return true
}

export function isGuideActiveWindow (botId, targetId, now = Date.now()) {
  const key = getGuideActiveWindowKey(botId, targetId)
  if (!key) return false

  const expiresAt = guideActiveWindows.get(key)
  if (!expiresAt) return false
  if (expiresAt > now) return true

  guideActiveWindows.delete(key)
  return false
}

export function shouldForceActiveMessage (messageBuild, botId, targetId) {
  const active = normalizeMessageBuild(messageBuild).forceActiveMessage
  if (!active.enabled) return false
  return !active.matchingMode || isGuideActiveWindow(botId, targetId)
}
