import WebSocket from 'ws'
import { makeGSUidSendMsg, getLatestMsg, setMsg } from '../model/index.js'
import { Version, Config } from './index.js'
import {
  normalizeBotId,
  normalizeTargetId,
  shouldForceActiveMessage
} from './MessageBuild.js'

/** 兑换码跨回包去抖合并的静默窗口（毫秒）：窗口内连续到达的兑换码合并为一条发送 */
const GACHA_BATCH_WINDOW = 2000

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

/** 目标已注销/已解散时 QQ 返回 11255「请求的资源不存在」 */
const UNREACHABLE_TTL = 30 * 60 * 1000
const unreachableTargets = new Map()
/** 普通发送失败的重试上限与退避基数 */
const SEND_RETRY_MAX = 3
const SEND_RETRY_BASE_MS = 1000

function isTargetGoneError (err) {
  const message = String(err?.message || err || '')
  return /11255|资源不存在|已注销/.test(message)
}

function targetKeyOf (data) {
  return `${data?.target_type}:${data?.target_id}`
}

/** QQBot 官方账号的会话目标都是 openid（32 位十六进制），纯数字属于 OneBot 等协议端 */
function isQQBotTargetId (id) {
  return /^[0-9a-f]{32}$/i.test(String(id || ''))
}

/** 只按适配器判断账号是否 QQBot，不看 target */
function isQQBotAdapterOf (bot) {
  const adapter = bot?.adapter
  return [adapter?.id, adapter?.name, adapter?.platform, adapter]
    .some(value => String(value || '').toLowerCase() === 'qqbot')
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
    // 回包按会话串行：兑换码合并、引用上下文都依赖同一会话内的先后顺序
    this.sessionQueue = new Map()
  }

  reconnectCount = 1
  timer = null
  stopReconnect = false

  /**
   * 回包入队：同一会话内保序，不同会话之间并发。
   * 避免一张大图的上传堵塞其它群/其它私聊的回包。
   */
  enqueueCoreMessage (data) {
    const key = `${data?.target_type}:${data?.target_id}`
    const prev = this.sessionQueue.get(key) || Promise.resolve()
    const next = prev
      .then(() => this.handleCoreMessage(data))
      .catch(err => logger.error(`[gs-plugin] 处理 GS 消息时出错: ${err.message}`))
    this.sessionQueue.set(key, next)
    next.finally(() => {
      if (this.sessionQueue.get(key) === next) this.sessionQueue.delete(key)
    })
    return next
  }

  async dispatchBuiltMessage (context, sendMsg) {
    const key = targetKeyOf(context?.data)
    const blocked = unreachableTargets.get(key)
    if (blocked) {
      if (Date.now() - blocked.at < UNREACHABLE_TTL) {
        logger.debug(`[gs-plugin] 跳过不可达目标 ${key}：${blocked.reason}`)
        return
      }
      unreachableTargets.delete(key)
    }

    // 对齐 core 的发送队列语义：失败不直接丢，有限次退避重试；只有目标已注销这类永久错误才放弃
    for (let attempt = 1; ; attempt++) {
      try {
        await this.sendBuiltMessage(context, sendMsg)
        return
      } catch (err) {
        if (isTargetGoneError(err)) {
          unreachableTargets.set(key, { at: Date.now(), reason: String(err?.message || err) })
          logger.warn(`[gs-plugin] 目标不可达，已暂停发送 ${key}：${err?.message || err}`)
          return
        }
        if (attempt >= SEND_RETRY_MAX) throw err
        const delay = SEND_RETRY_BASE_MS * 2 ** (attempt - 1)
        logger.warn(`[gs-plugin] 发送失败（第 ${attempt}/${SEND_RETRY_MAX} 次），${delay}ms 后重试 ${key}：${err?.message || err}`)
        await new Promise(resolve => {
          const timer = setTimeout(resolve, delay)
          timer.unref?.()
        })
      }
    }
  }

  async sendBuiltMessage (context, sendMsg) {
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

    const declared = Bot[data.bot_self_id] || Bot[normalizeBotId(data.bot_self_id)] || Bot
    let bot = declared
    // core 主动消息可能把「人格绑定的 bot 账号」与「历史会话目标」拼在一起，
    // 出现 QQBot 账号 + 纯数字 QQ 号的跨平台错配；此时按目标格式回到会话本身的 bot
    if (bot && !isQQBotTargetId(data.target_id) && isQQBotAdapterOf(bot)) {
      const sessionSelfId = String(latest?.e?.self_id || '')
      const sessionBot = sessionSelfId && Bot[sessionSelfId]
      if (sessionBot && !isQQBotAdapterOf(sessionBot)) {
        logger.warn(
          `[gs-plugin] 回包账号与目标平台不符（${data.bot_self_id} → ${data.target_id}），改用会话 bot ${sessionSelfId}`,
        )
        data.bot_self_id = sessionSelfId
        bot = sessionBot
      }
    }
    if (!bot) {
      logger.error('[gs-plugin] bot 对象无效')
      return
    }

    const isQQBot = isQQBotMessage(data, bot)
    const gachaKey = `${data.bot_self_id}:${data.target_type}:${data.target_id}`
    const gachaBatch = this.gachaBatch?.[gachaKey]
    const { sendMsg, quote, gachaMdList, isPureGacha } = await makeGSUidSendMsg(data, gachaBatch?.mdList)

    const flushGacha = async () => {
      const batch = this.gachaBatch?.[gachaKey]
      if (!batch) return
      clearTimeout(batch.timer)
      delete this.gachaBatch[gachaKey]
      await this.dispatchBuiltMessage(batch.ctx, batch.sendMsg)
    }

    if (isPureGacha) {
      // 连续到达的兑换码累积进同一条 markdown，窗口内静默，窗口到才发送
      if (gachaBatch) clearTimeout(gachaBatch.timer)
      this.gachaBatch = this.gachaBatch || {}
      this.gachaBatch[gachaKey] = {
        ctx: { data, bot, isQQBot },
        mdList: gachaMdList,
        sendMsg,
        timer: setTimeout(flushGacha, GACHA_BATCH_WINDOW)
      }
      return
    }

    // 非兑换码回包：先冲刷未发送的兑换码批次，保持顺序
    if (gachaBatch) await flushGacha()
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

    this.ws.on('message', event => {
      let data
      try {
        data = JSON.parse(event.toString())
      } catch (err) {
        logger.error(`[gs-plugin] 解析 GS 消息失败: ${err.message}`)
        return
      }
      this.enqueueCoreMessage(data)
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
