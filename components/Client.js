import WebSocket from 'ws'
import { makeGSUidSendMsg, getLatestMsg, setMsg } from '../model/index.js'
import { Version, Config } from './index.js'
import {
  normalizeBotId,
  normalizeTargetId,
  shouldForceActiveMessage
} from './MessageBuild.js'

/** 判断是否应该对该消息启用 legacy 模式 */
function shouldUseLegacy (legacyCfg, scopeGroupId, botSelfId) {
  if (!legacyCfg?.enabled) return false

  const { groups = [], bots = [] } = legacyCfg
  const groupMatch = !scopeGroupId || !groups.length || groups.includes(normalizeTargetId(scopeGroupId))
  const botMatch = !bots.length || bots.includes(normalizeBotId(botSelfId))
  return groupMatch && botMatch
}

function isQQBotMessage (data, bot) {
  const botSelfId = normalizeBotId(data.bot_self_id)
  const adapter = bot?.adapter
  const adapterIds = [data.bot_adapter, adapter?.id, adapter?.name, adapter?.platform]
  const isQQBotAdapter = adapterIds.some(value => String(value || '').toLowerCase() === 'qqbot')
  const isQQBotAccount = Object.hasOwn(Bot.QQBotConfig?.config?.markdown || {}, botSelfId)
  const isQQBotTarget = /^[0-9a-f]{32}$/i.test(normalizeTargetId(data.target_id))
  return isQQBotAdapter || isQQBotAccount || isQQBotTarget
}

/** 仅让 GSUID 的 QQBot 主动消息携带单次 legacy 标记 */
async function sendLegacyQQBotMsg (bot, targetType, targetId, msg, botSelfId) {
  const markdownConfig = Bot.QQBotConfig?.config?.markdown || {}
  const adapters = Array.isArray(Bot.adapter) ? Bot.adapter : []
  const qqBotAdapter = adapters.find(adapter => String(adapter?.id).toLowerCase() === 'qqbot')

  if (!Object.hasOwn(markdownConfig, normalizeBotId(botSelfId)) || !qqBotAdapter) return null

  try {
    if (targetType === 'group') {
      const target = bot.pickGroup(targetId)
      return await qqBotAdapter.sendGroupMsg({ ...target, legacy: true }, msg)
    }

    if (targetType === 'direct') {
      const target = bot.pickFriend(targetId)
      return await qqBotAdapter.sendFriendMsg({ ...target, legacy: true }, msg)
    }
  } catch (error) {
    logger.warn(`[gs-plugin] QQBot Legacy 主动发送失败，改用普通主动发送: ${error.message}`)
  }

  return null
}

export default class Client {
  constructor ({ name, address, reconnectInterval, maxReconnectAttempts, accessToken, uin = Bot.uin, closed = false, ...other }) {
    this.name = name
    this.address = address
    this.reconnectInterval = reconnectInterval
    this.maxReconnectAttempts = maxReconnectAttempts
    this.accessToken = accessToken
    this.uin = Number(uin) || uin
    this.self_id = uin
    this.ws = null
    this.status = 0
    this.closed = closed
    this.other = other
  }

  reconnectCount = 1
  timer = null
  stopReconnect = false

  async dispatchBuiltMessage (context, sendMsg) {
    const { data, bot, isQQBot } = context
    const messageBuild = Config.messageBuild
    let sendRet, group_id, user_id
    const isGroup = data.target_type === 'group' || data.target_type === 'channel'
    const isDirect = data.target_type === 'direct'

    if (!isGroup && !isDirect) {
      logger.warn(`[gs-plugin] 未知 target_type: ${data.target_type}`)
      return
    }

    const targetId = data.target_id
    const forceActive = isGroup && isQQBot
      ? shouldForceActiveMessage(messageBuild, data.bot_self_id, targetId)
      : false
    const legacy = shouldUseLegacy(messageBuild.legacyReply, isGroup ? targetId : null, data.bot_self_id)

    if (isGroup) {
      if (typeof bot.pickGroup !== 'function') {
        logger.error('[gs-plugin] bot 对象缺少 pickGroup 方法')
        return
      }
      group_id = targetId
      const latest = getLatestMsg(group_id)
      if (!forceActive && latest && typeof latest.reply === 'function') {
        if (latest.e) latest.e.legacy = legacy
        await latest.reply(sendMsg)
        sendRet = { message_id: `passive_${Date.now()}` }
      } else {
        const useLegacy = data.target_type === 'group' && isQQBot && legacy
        sendRet = useLegacy
          ? await sendLegacyQQBotMsg(bot, 'group', group_id, sendMsg, data.bot_self_id)
          : null
        sendRet ||= await bot.pickGroup(group_id).sendMsg(sendMsg)
      }
    } else {
      if (typeof bot.pickFriend !== 'function') {
        logger.error('[gs-plugin] bot 对象缺少 pickFriend 方法')
        return
      }
      user_id = targetId
      const latest = getLatestMsg(user_id)
      if (latest && typeof latest.reply === 'function') {
        if (latest.e) latest.e.legacy = legacy
        await latest.reply(sendMsg)
        sendRet = { message_id: `passive_${Date.now()}` }
      } else {
        const useLegacy = isQQBot && legacy
        sendRet = useLegacy
          ? await sendLegacyQQBotMsg(bot, 'direct', user_id, sendMsg, data.bot_self_id)
          : null
        sendRet ||= await bot.pickFriend(user_id).sendMsg(sendMsg)
      }
    }

    if (sendRet?.message_id) {
      setMsg({
        message_id: sendRet.message_id,
        time: sendRet.time || Math.floor(Date.now() / 1000),
        seq: sendRet.seq || 0,
        rand: sendRet.rand || 0,
        user_id,
        group_id,
        onebot_id: Math.floor(Math.random() * Math.pow(2, 32)) | 0
      })
    }
  }

  async handleCoreMessage (data) {
    const latest = getLatestMsg(data.target_id)
    // GSUID 回包不含 bot_self_id 时，使用发起该会话请求的最近事件身份。
    if (!data.bot_self_id && latest?.e?.self_id) data.bot_self_id = String(latest.e.self_id)
    if (!data.bot_adapter && latest?.e?.adapter_id) data.bot_adapter = latest.e.adapter_id
    if (!data.bot_self_id && data.content?.some(msg => String(msg.data || '').includes('兑换码'))) {
      logger.warn(`[gs-plugin] 兑换码回包未关联到请求上下文: target_id=${data.target_id}, target_type=${data.target_type}`)
    }

    const bot = Bot[data.bot_self_id] || Bot[normalizeBotId(data.bot_self_id)] || Bot
    if (!bot) {
      logger.error('[gs-plugin] bot 对象无效')
      return
    }

    const isQQBot = isQQBotMessage(data, bot)
    const { sendMsg } = await makeGSUidSendMsg(data)
    if (!sendMsg.length) return

    await this.dispatchBuiltMessage({ data, bot, isQQBot }, sendMsg)
  }

  createGSUidWs () {
    let wsAddress = this.address
    if (this.accessToken) {
      try {
        const urlObj = new URL(wsAddress)
        if (!urlObj.searchParams.has('token')) urlObj.searchParams.set('token', this.accessToken)
        wsAddress = urlObj.toString()
      } catch (error) {
        const hasQuery = wsAddress.includes('?')
        const hasToken = /([?&])token=/.test(wsAddress)
        if (!hasToken) wsAddress += `${hasQuery ? '&' : '?'}token=${encodeURIComponent(this.accessToken)}`
      }
    }
    try {
      this.ws = new WebSocket(wsAddress)
    } catch (error) {
      logger.error(`[gs-plugin] 出错了,可能是ws地址填错了~\nws名字: ${this.name}\n地址: ${this.address}`)
      return
    }

    this.ws.on('open', async () => {
      logger.mark(`[gs-plugin] ${this.name} 已连接`)
      if (this.status == 3 && this.reconnectCount > 1 && Config.reconnectToMaster) {
        await this.sendMasterMsg(`${this.name} 重连成功~`)
      } else if (this.status == 0 && Config.firstconnectToMaster) {
        await this.sendMasterMsg(`${this.name} 连接成功~`)
      }
      this.status = 1
      this.reconnectCount = 1
    })

    this.ws.on('message', async event => {
      try {
        await this.handleCoreMessage(JSON.parse(event.toString()))
      } catch (err) {
        logger.error(`[gs-plugin] 处理 GS 消息时出错: ${err.message}`)
      }
    })

    this.ws.on('close', async code => {
      logger.warn(`[gs-plugin] ${this.name} 连接已关闭`)
      if (Config.disconnectToMaster && this.reconnectCount == 1 && this.status == 1) {
        await this.sendMasterMsg(`${this.name} 已断开连接...`)
      } else if (Config.firstconnectToMaster && this.reconnectCount == 1 && this.status == 0) {
        await this.sendMasterMsg(`${this.name} 连接失败...`)
      }
      this.status = 3
      if (!this.stopReconnect && ((this.reconnectCount < this.maxReconnectAttempts) || this.maxReconnectAttempts <= 0)) {
        if (code === 1005) {
          logger.warn('[gs-plugin] 连接异常,停止重连')
          this.status = 0
        } else {
          logger.warn(`[gs-plugin] ${this.name} 开始尝试重新连接第 ${this.reconnectCount} 次`)
          this.reconnectCount++
          setTimeout(() => this.createGSUidWs(), this.reconnectInterval * 1000)
        }
      } else {
        this.stopReconnect = false
        this.status = 0
        logger.warn('[gs-plugin] 达到最大重连次数或关闭连接,停止重连')
      }
    })

    this.ws.on('error', event => logger.error(`[gs-plugin] ${this.name} 连接失败\n${event}`))
  }

  close () {
    this.stopReconnect = true
    if (this.status == 1) {
      this.ws?.close?.()
      this.status = 0
    }
  }

  async sendMasterMsg (msg) {
    const bot = Bot[this.uin] || Bot
    let masterQQ = []
    const master = Version.isTrss ? Config.master[this.uin] : Config.masterQQ
    if (Config.howToMaster > 0) {
      masterQQ.push(master?.[Config.howToMaster - 1])
    } else if (Config.howToMaster == 0) {
      masterQQ.push(...master)
    }
    for (const i of masterQQ) {
      if (!i) continue
      let result
      try {
        result = await bot?.pickFriend?.(i)?.sendMsg?.(msg) || true
      } catch (error) {
        result = true
      }
      if (result) {
        logger.mark(`[gs-plugin] 连接名字:${this.name} 通知主人:${i} 处理完成`)
      } else {
        const timer = setInterval(async () => {
          try {
            result = await bot?.pickFriend?.(i)?.sendMsg?.(msg) || true
          } catch (error) {
            result = true
          }
          if (result) {
            clearInterval(timer)
            logger.mark(`[gs-plugin] 连接名字:${this.name} 通知主人:${i} 处理完成`)
          }
        }, 5000)
      }
    }
  }
}
