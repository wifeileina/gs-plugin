const GUIDE_ACTIVE_WINDOW_MS = 60 * 1000
const guideActiveWindows = new Map()

export function normalizeBotId (value) {
  return String(value || '').trim().split(':').pop()
}

export function normalizeTargetId (value) {
  return normalizeBotId(value)
}

/** QQBot 官方会话目标都是 openid（32 位十六进制），纯数字属于 OneBot 等协议端 */
export function isQQBotTargetId (value) {
  // target_id 可能带 bot 前缀（如 4015042124:openid），先剥掉再判断
  return /^[0-9a-f]{32}$/i.test(normalizeTargetId(value))
}

/** 按适配器判断账号是否 QQBot（不看目标 ID） */
export function isQQBotAdapter (adapter) {
  return [adapter?.id, adapter?.name, adapter?.platform, adapter]
    .some(value => String(value || '').toLowerCase() === 'qqbot')
}

/** 判断回包是否属于 QQBot：适配器、QQBot 账号配置、openid 目标三者任一命中 */
export function isQQBotMessage (data, bot) {
  const adapterMatched = isQQBotAdapter(bot?.adapter) ||
    String(data?.bot_adapter || '').toLowerCase() === 'qqbot'
  const accountMatched = Object.hasOwn(Bot.QQBotConfig?.config?.markdown || {}, normalizeBotId(data?.bot_self_id))
  // GSUID 回包可能缺失 bot_adapter，QQBot 群/频道/私聊目标 ID 都是 32 位十六进制
  return adapterMatched || accountMatched || isQQBotTargetId(data?.target_id)
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

function isGuideActiveWindow (botId, targetId, now = Date.now()) {
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
