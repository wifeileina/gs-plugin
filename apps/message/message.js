import { sendSocketList, Config, Version } from '../../components/index.js'
import { isQQBotMessage, markGuideActiveWindow } from '../../components/MessageBuild.js'
import { makeGSUidReportMsg, makeGSUidMetaReportMsg, setLatestMsg, setMsg, getGroup_id, getUser_id } from '../../model/index.js'
import _ from 'lodash'
import cfg from '../../../../lib/config/config.js'
import PluginsLoader from '../../../../lib/plugins/loader.js'

// 取消息开头的“有效指令文本”：跳过前置的@提及（at 段 / CQ 码 / 纯文本@）及其后的空格
function getLeadingCleanText (message) {
  const segs = Array.isArray(message) ? message : []
  let text = ''
  for (const seg of segs) {
    if (!seg) continue
    if (seg.type === 'at') continue
    if (seg.type !== 'text') break
    text += seg.text || ''
    if (text.trim()) break
  }
  return text
    .replace(/^[\s\u3000]+/, '')
    .replace(/^(\[CQ:at,[^\]]*\]\s*)+/, '')
    .replace(/^(@\S+\s*)+/, '')
    .replace(/^[\s\u3000]+/, '')
}

Bot.on('message', async e => {
  if (!e.user_id) return false
  // 联动 yunzai 关机状态：关机时不上报消息（"关机状态联动"关闭时不生效）
  if (Config.shutdownStop && isYunzaiPoweredOff()) return false
  // 被禁言或者全体禁言
  if (Config.muteStop && (e.group?.mute_left > 0 || e.group?.all_muted)) return false
  // 临时会话
  if (Config.tempMsgReport && e.post_type === 'post_type' && e.message_type === 'private' && e.sub_type === 'group') return false
  // 如果没有已连接的Websocket
  if (sendSocketList.length == 0) return false
  // 联动 yunzai 的仅@设置：yunzai 判定为非主动提及的消息不上报（"忽略仅@"开启时不生效）
  if (!Config.ignoreOnlyReplyAt && isYunzaiOnlyReplyAtBlocked(e)) return false
  if (isReportBlocked(e)) return false
  // 判断插件前缀（跳过前置@提及及@后的空格再匹配）
  if (Array.isArray(Config.noMsgStart) && Config.noMsgStart.length > 0) {
    const cleanText = getLeadingCleanText(e.message)
    if (cleanText && Config.noMsgStart.some(i => cleanText.startsWith(i))) return false
  }
  // 群聊消息拦截（按群聊+前缀+bot账号）
  if (e.group_id && Array.isArray(Config.groupIntercept) && Config.groupIntercept.length > 0) {
    const cleanText = getLeadingCleanText(e.message)
    for (const rule of Config.groupIntercept) {
      // 检查botId（不填则对所有bot生效）
      if (rule.botId && String(rule.botId) !== String(e.self_id)) continue
      // 检查群聊ID
      if (!Array.isArray(rule.groupIds) || !rule.groupIds.some(id => String(id) === String(e.group_id))) continue
      // 检查前缀
      if (cleanText && Array.isArray(rule.prefixes) && rule.prefixes.some(p => cleanText.startsWith(p))) {
        return false
      }
    }
  }
  let isMaster = e.isMaster
  if (Version.isTrss) {
    if (e.user_id && cfg.master[e.self_id]?.includes(String(e.user_id))) {
      isMaster = true
    }
  }
  const message_id = Math.floor(Math.random() * Math.pow(2, 32)) | 0
  const self_id = await getUser_id({ user_id: e.self_id })
  const user_id = await getUser_id({ user_id: e.user_id })
  const now = Math.floor(Date.now() / 1000)
  const rawEventTime = Number(e.time)
  const parsedEventTime = Number.isFinite(rawEventTime)
    ? rawEventTime
    : Math.floor(new Date(e.time).getTime() / 1000)
  // latestMsg 以秒为单位过期；避免秒级时间被 Date 误当作毫秒。
  const time = parsedEventTime >= 1000000000 && parsedEventTime <= now + 300
    ? Math.floor(parsedEventTime > 100000000000 ? parsedEventTime / 1000 : parsedEventTime)
    : now
  let msg = {
    time: e.time,
    message_id: e.message_id,
    message: _.cloneDeep(e.message),
    rand: e.rand,
    seq: e.seq,
    source: e.source,
    user_id: e.user_id,
    self_id: e.self_id,
    isMaster,
    sender: e.sender,
    param: {
      time,
      self_id,
      post_type: e.post_type,
      message_type: e.message_type,
      sub_type: e.sub_type || e.message_type == 'group' ? 'normal' : 'friend',
      message_id,
      user_id,
      font: 0,
      sender: {
        user_id,
        nickname: e.sender.nickname,
        card: e.sender.card,
        sex: e.sender.sex || 'unknown',
        role: e.sender.role || 'member'
      }
    }
  }
  const sessionId = String(e.group_id || e.user_id)
  const latestMessage = { time, message_id: e.message_id, reply: e.reply, e }
  // 回包不会稳定携带 bot_self_id，因此所有请求都缓存会话上下文；最终是否使用 QQBot Markdown 仍由回填的账号配置决定。
  for (const cacheId of new Set([sessionId, sessionId.split(':').pop()])) {
    setLatestMsg(cacheId, latestMessage)
  }
  logger.debug(`[gs-plugin] 已缓存 GSUID 请求上下文: target_id=${sessionId}, bot=${e.self_id}`)
  let userInfo
  if (e.message_type == 'group') {
    msg.isGroup = true
    const group_id = await getGroup_id({ group_id: e.group_id })
    msg.group_id = e.group_id
    msg.param.group_id = group_id
    userInfo = await e.bot?.pickMember?.(e.group_id, e.user_id)
  } else if (e.message_type == 'private') {
    userInfo = await e.bot?.pickFriend?.(e.user_id)
    msg.isPrivate = true
  } else {
    return false
  }
  const avatar = await userInfo?.getAvatarUrl?.()
  if (avatar) {
    msg.param.avatar = avatar
    msg.avatar = avatar
  }
  // 判断云崽前缀
  msg = onlyReplyAt(msg, 'gs')
  if (!msg) return false
  for (const i of sendSocketList) {
    if (i.status == 1) {
      msg.onlyReplyAt = Config.onlyReplyAt[i.other.rawName || i.name] || Config.onlyReplyAt
      const tmpMsg = onlyReplyAt(_.cloneDeep(msg), 'gs')
      if (!tmpMsg) continue
      let reportMsg = null

      const botid = resolveGsBotId(i, e)
      if (!botid) continue

      // 从被引用消息中提取图片，注入到消息数组中
      const replyId = tmpMsg.source?.message_id || e.reply_id
      if (replyId) {
        try {
          let sourceMsg = null
          // 优先使用 e.getReply()（OneBot 协议，调用 get_msg API）
          if (typeof e.getReply === 'function') {
            sourceMsg = await e.getReply()
            logger.debug(`[gs-plugin] 通过 getReply 获取被引用消息 ${replyId}: ${sourceMsg?.message?.map?.(s => s.type)?.join(',') || '无消息体'}`)
          }
          // 回退到 Bot.getMsg（Red 协议或本地数据库反查）
          if (!sourceMsg) {
            const bot = Bot[tmpMsg.self_id] || Bot
            if (typeof bot?.getMsg === 'function') {
              sourceMsg = await bot.getMsg(replyId)
              logger.debug(`[gs-plugin] 通过 Bot.getMsg 获取被引用消息 ${replyId}: ${sourceMsg?.message?.map?.(s => s.type)?.join(',') || '无消息体'}`)
            }
          }
          if (sourceMsg?.message && Array.isArray(sourceMsg.message)) {
            const images = sourceMsg.message.filter(s => s.type === 'image')
            if (images.length > 0) {
              logger.info(`[gs-plugin] 从被引用消息中提取到 ${images.length} 张图片，注入到 gscore 消息中`)
              for (let idx = images.length - 1; idx >= 0; idx--) {
                const img = images[idx]
                const url = img.url || img.data?.url || img.file || img.data?.file || ''
                const file = img.file || img.data?.file || url
                tmpMsg.message.unshift({ type: 'image', url, file })
              }
            }
          }
          if (!tmpMsg.source) {
            tmpMsg.source = { message_id: replyId }
          }
        } catch (err) {
          logger.debug(`[gs-plugin] 获取被引用消息失败: ${err.message}`)
        }
      }

      // QQBot 协议判断（提前声明，供后续复用）
      const isQQBotAdapter = e.adapter === 'QQBot' || e.bot?.adapter?.id === 'QQBot'

      // QQBot 协议：通过 e.raw_event 中的 reply_element 获取被引用消息
      if (!replyId) {
        if (isQQBotAdapter) {
          try {
            const rawData = e.raw_event?.d || e.raw_event
            const replyElem = rawData?.msg_elements?.[0]?.reply_element
            const refMsg = replyElem?.referenced_message
            const flatElem = e.msg_elements?.[0]
            const source = refMsg || flatElem
            logger.debug(`[gs-plugin] QQBot 引用检测: replyElem=${!!replyElem}, refMsg=${!!refMsg}, flatElem=${!!flatElem}, ref_msg_idx=${e.ref_msg_idx}`)
            if (source) {
              const images = []
              const attachments = source.attachments || source.attachment || []
              const attList = Array.isArray(attachments) ? attachments : [attachments]
              for (const att of attList) {
                if (att?.content_type?.startsWith('image/') && att?.url) {
                  images.push({ type: 'image', url: att.url, file: att.url })
                }
              }
              if (images.length > 0) {
                for (let idx = images.length - 1; idx >= 0; idx--) {
                  tmpMsg.message.unshift(images[idx])
                }
              }
              const refId = replyElem?.referenced_message_id || e.ref_msg_idx
              if (refId && !tmpMsg.source) {
                tmpMsg.source = { message_id: refId }
                logger.debug(`[gs-plugin] QQBot 设置 source.message_id = ${refId}`)
              }
            }
          } catch (err) {
            logger.debug(`[gs-plugin] QQBot获取被引用消息失败: ${err.message}`)
          }
        }
      }

      // QQBot 协议：兜底处理文件消息（若 SDK 未将 msg_elements 中文件附件转为标准 file 段）
      if (isQQBotAdapter) {
        try {
          const rawData = e.raw_event?.d || e.raw_event
          const msgElements = rawData?.msg_elements || e.msg_elements || []
          for (const elem of msgElements) {
            const attachments = elem.attachments || elem.attachment || []
            const attList = Array.isArray(attachments) ? attachments : [attachments]
            for (const att of attList) {
              if (att?.content_type === 'file' && att?.url) {
                const hasFile = tmpMsg.message.some(m => m.type === 'file' && (m.url === att.url || m.file === att.url))
                if (!hasFile) {
                  tmpMsg.message.push({
                    type: 'file',
                    name: att.filename || 'file',
                    url: att.url,
                    file: att.url,
                    size: att.size || 0
                  })
                  logger.debug(`[gs-plugin] QQBot 文件消息注入: ${att.filename}`)
                }
              }
            }
          }
        } catch (err) {
          logger.debug(`[gs-plugin] QQBot 文件消息注入失败: ${err.message}`)
        }
      }

      applyPrefixIgnore(tmpMsg)
      addGSUidBotPrefix(tmpMsg, e)
      reportMsg = await makeGSUidReportMsg(tmpMsg, botid)

      if (reportMsg) {
        markGuideCommandWindow(e)
        i.ws.send(reportMsg)
      }
    }
  }
})

function isYunzaiPoweredOff () {
  try {
    const priority = PluginsLoader.priority
    return Array.isArray(priority) && priority.length === 1 && priority[0]?.plugin?.name === '开机'
  } catch (_) {
    return false
  }
}

// 复刻 yunzai lib/plugins/loader.js 的 onlyReplyAt() 判定。
// 插件 handler 先于 deal() 执行，e.only_reply_at 尚未设置，需自行按原始消息计算。
// 返回 true 表示 yunzai 判定该消息非主动提及，应不上报。
function isYunzaiOnlyReplyAtBlocked (e) {
  if (!e.message || e.message_type === 'private') return false
  const message = Array.isArray(e.message) ? e.message : [{ type: 'text', text: String(e.message) }]
  const groupCfg = cfg.getGroup(e.self_id, e.group_id)
  // 模式0未开启，或未配置前缀：不受限制
  if (groupCfg.onlyReplyAt === 0 || !groupCfg.botAlias) return false
  // 模式2：主人不受限
  if (groupCfg.onlyReplyAt === 2 && isYunzaiMaster(e)) return false
  // 被@机器人
  if (message.some(m => m.type === 'at' && String(m.qq) === String(e.self_id))) return false
  // 消息带前缀
  const msg = yunzaiDealText(message)
  const alias = groupCfg.botAlias
  for (const i of Array.isArray(alias) ? alias : [alias]) {
    if (i && msg.startsWith(i)) return false
  }
  return true
}

function isYunzaiMaster (e) {
  if (e.isMaster) return true
  return !!(e.user_id && cfg.master[e.self_id]?.includes(String(e.user_id)))
}

// 复刻 yunzai dealText()：拼接文本段并标准化前缀
function yunzaiDealText (message) {
  let msg = ''
  for (const i of message) {
    if (i?.type !== 'text') continue
    let text = String(i.text || '')
    if (cfg.bot['/→#']) text = text.replace(/^\s*\/\s*/, '#')
    msg += text
      .replace(/^\s*[＃井]\s*/, '#')
      .replace(/^\s*[＊※]\s*/, '*')
      .trim()
  }
  return msg
}

function markGuideCommandWindow (e) {
  if (!e.group_id || e.message_type !== 'group') return
  if (!isQQBotMessage({ target_id: e.group_id, bot_adapter: e.bot?.adapter?.id }, e.bot)) return

  const segments = Array.isArray(e.message) ? e.message : [{ type: 'text', text: e.message }]
  const text = segments
    .filter(segment => segment?.type === 'text')
    .map(segment => String(segment.text || segment.data?.text || segment.data || ''))
    .join('')
    .replace(/^(?:\[CQ:at,[^\]]*\]\s*|@\S+\s*)+/, '')
    .trim()

  if (text.endsWith('攻略')) {
    markGuideActiveWindow(e.self_id, e.group_id)
    logger.debug(`[gs-plugin] 已开启攻略主动发送窗口: target_id=${e.group_id}, bot=${e.self_id}`)
  }
}

function applyPrefixIgnore (e) {
  const ignoreList = Config.gsuidPrefixIgnore
  if (!Array.isArray(ignoreList) || ignoreList.length === 0) return
  if (!Array.isArray(e.message)) return

  const textIndex = e.message.findIndex(item => item?.type === 'text')
  if (textIndex < 0) return

  let rest = String(e.message[textIndex].text || '').replace(/^\s+/, '')
  let changed = false
  for (;;) {
    let matched = false
    for (const p of ignoreList) {
      const prefix = String(p || '').trim()
      if (!prefix) continue
      if (rest.startsWith(prefix)) {
        rest = rest.slice(prefix.length)
        matched = true
        break
      }
    }
    if (!matched) break
    changed = true
  }

  if (changed) {
    e.message[textIndex].text = rest
    logger.debug(`[gs-plugin] 前缀忽略后上报: ${rest}`)
  }
}

function addGSUidBotPrefix (e, rawEvent) {
  const prefixCfg = Config.gsuidBotPrefix
  if (!prefixCfg || typeof prefixCfg !== 'object') return

  const selfId = String(rawEvent?.self_id || e?.self_id || '')
  if (!selfId) return

  const prefixItem = prefixCfg[selfId]
  if (!prefixItem || typeof prefixItem !== 'object') return

  const prefix = String(prefixItem.prefix || '')
  const skipIfHasPrefix = typeof prefixItem.skipIfHasPrefix === 'boolean' ? prefixItem.skipIfHasPrefix : true

  if (!prefix) return
  if (!Array.isArray(e.message)) return

  const textIndex = e.message.findIndex(item => item?.type === 'text')
  if (textIndex >= 0) {
    const rawText = String(e.message[textIndex].text || '')
    if (isSkipByCustomCommand(rawText, prefixItem)) return
    if (skipIfHasPrefix && hasCustomCommandPrefix(rawText)) return
    const trimmedText = rawText.replace(/^\s*\/*\s*/, '')
    e.message[textIndex].text = `${prefix}${trimmedText}`
  } else {
    e.message.unshift({ type: 'text', text: prefix })
  }
}

function isSkipByCustomCommand (text = '', prefixItem = {}) {
  const list = Array.isArray(prefixItem?.noPrefixCommands) ? prefixItem.noPrefixCommands : []
  if (!Array.isArray(list) || list.length === 0) return false
  const command = String(text).replace(/^\s*\/*\s*/, '')
  return list.some(item => {
    const custom = String(item || '').trim()
    return custom && command.startsWith(custom)
  })
}

function hasCustomCommandPrefix (text = '') {
  const command = String(text).replace(/^\s*\/*\s*/, '')
  return /^[A-Za-z0-9]/.test(command)
}

function onlyReplyAt (e, source = 'gs') {
  // 自动判断是否为仅At或前缀
  let onlyReplyAt_group = false
  let onlyReplyAt_private = false
  let onlyReplyAt = false
  let prefix = []
  if (e.onlyReplyAt) {
    if (typeof e.onlyReplyAt === 'object') {
      onlyReplyAt = e.onlyReplyAt.enable || false
      if (Array.isArray(e.onlyReplyAt.prefix)) {
        prefix = e.onlyReplyAt.prefix
      }
    }
  }
  if (e.isGroup && onlyReplyAt_group) {
    onlyReplyAt = true
  } else if (e.isPrivate && onlyReplyAt_private) {
    onlyReplyAt = true
  }
  if (e.isMaster) {
    onlyReplyAt = false
  }
  if (Config.ignoreOnlyReplyAt) {
    onlyReplyAt = false
  }
  if (onlyReplyAt) {
    for (const i of e.message) {
      if (i.type === 'at' && i.qq == e.self_id) {
        return e
      }
    }
    for (const i of prefix) {
      if (e.message[0]?.type === 'text') {
        if (e.message[0].text.startsWith(i)) {
          return e
        }
      }
    }
    return false
  }
  return e
}

// ── 戳一戳上报：平台 notice 事件 → GS meta 事件 ──
Bot.on('notice', async e => {
  // 各适配器（OneBotv11/Milky/ComWeChat）都会把戳一戳归一化为 sub_type === 'poke'，
  // 且 notice_type 已被改写成 group/friend，不能再按 notify 判断。
  if (e.sub_type !== 'poke') return false
  if (!Config.pokeReport) return false
  // 归一化后 operator_id 与 user_id 都指向发起者
  const pokerId = String(e.operator_id || e.user_id || '')
  if (!pokerId) return false
  if (Config.shutdownStop && isYunzaiPoweredOff()) return false
  if (sendSocketList.length == 0) return false
  if (isReportBlocked(e, pokerId)) return false

  const group_id = e.group_id ? String(e.group_id) : ''
  // 平台不提供 target_id 时，被戳者即机器人自身
  const data = {
    user_id: pokerId,
    target_id: String(e.target_id || e.self_id || '')
  }
  if (group_id) data.group_id = group_id

  const ctx = {
    self_id: e.self_id,
    user_id: pokerId,
    group_id,
    user_pm: e.isMaster ? 1 : 6,
    sender: await resolvePokeSender(e, pokerId)
  }

  for (const i of sendSocketList) {
    if (i.status != 1) continue
    const botid = resolveGsBotId(i, e)
    if (!botid) continue
    i.ws.send(makeGSUidMetaReportMsg('poke', data, { ...ctx, botId: botid }))
  }
})

// 解析某条连接对应的 gsBotId；返回 null 表示该连接不处理当前 bot
function resolveGsBotId (socket, e) {
  const botIdMap = {
    QQBot: 'qqgroup',
    QQGuild: 'qqguild',
    KOOK: 'kook',
    Telegram: 'telegram',
    Discord: 'discord'
  }
  const mappedBotId = botIdMap[e.bot?.adapter?.id]
  if (socket.uin === 'all') return mappedBotId || 'onebot'
  if (socket.uin != e.self_id) return null
  return socket.adapter?.gsBotId || mappedBotId || 'onebot'
}

// 群聊黑白名单与黑名单QQ过滤；返回 true 表示应跳过上报
function isReportBlocked (e, userId = e.user_id) {
  if (e.group_id) {
    const whiteGroup = Config.whiteGroup
    if (Array.isArray(whiteGroup) && whiteGroup.length > 0 && !whiteGroup.some(i => i == e.group_id)) return true
    const yesGroup = Config.yesGroup
    if (Array.isArray(yesGroup) && yesGroup.length > 0 && !yesGroup.some(i => i == e.group_id)) return true
    const blackGroup = Config.blackGroup
    if (Array.isArray(blackGroup) && blackGroup.length > 0 && blackGroup.some(i => i == e.group_id)) return true
    const noGroup = Config.noGroup
    if (Array.isArray(noGroup) && noGroup.length > 0 && noGroup.some(i => i == e.group_id)) return true
  }
  if (userId && Array.isArray(Config.blackQQ)) {
    if (Config.blackQQ.some(i => i == userId)) return true
  }
  return false
}

// 戳一戳发起者的昵称/头像；notice 事件通常不带 sender 资料，取不到就留空由 GS 侧回查用户库
async function resolvePokeSender (e, userId) {
  const sender = {}
  const nickname = e.sender?.nickname || e.sender?.card
  if (nickname) sender.nickname = String(nickname)
  const uid = String(userId || e.operator_id || e.user_id || '')
  if (!e.group_id || !uid) return sender
  try {
    const member = await e.bot?.pickMember?.(e.group_id, uid)
    if (!sender.nickname) {
      const name = member?.info?.nickname || member?.info?.card || member?.nickname || member?.card
      if (name) sender.nickname = String(name)
    }
    const avatar = await member?.getAvatarUrl?.()
    if (avatar) sender.avatar = String(avatar)
  } catch (_) {}
  return sender
}

export {
  onlyReplyAt
}
