import { sendSocketList, Config, Version } from '../../components/index.js'
import { makeGSUidReportMsg, setLatestMsg, setMsg, getGroup_id, getUser_id } from '../../model/index.js'
import _ from 'lodash'
import cfg from '../../../../lib/config/config.js'

Bot.on('message', async e => {
  if (!e.user_id) return false
  // 被禁言或者全体禁言
  if (Config.muteStop && (e.group?.mute_left > 0 || e.group?.all_muted)) return false
  // 临时会话
  if (Config.tempMsgReport && e.post_type === 'post_type' && e.message_type === 'private' && e.sub_type === 'group') return false
  // 如果没有已连接的Websocket
  if (sendSocketList.length == 0) return false
  if (e.group_id) {
    // 判断云崽白名单群
    const whiteGroup = Config.whiteGroup
    if (Array.isArray(whiteGroup) && whiteGroup.length > 0) {
      if (!whiteGroup.some(i => i == e.group_id)) return false
    }
    // 判断插件白名单群
    const yesGroup = Config.yesGroup
    if (Array.isArray(yesGroup) && yesGroup.length > 0) {
      if (!yesGroup.some(i => i == e.group_id)) return false
    }
    // 判断云崽黑名单群
    const blackGroup = Config.blackGroup
    if (Array.isArray(blackGroup) && blackGroup.length > 0) {
      if (blackGroup.some(i => i == e.group_id)) return false
    }
    // 判断插件黑名单群
    const noGroup = Config.noGroup
    if (Array.isArray(noGroup) && noGroup.length > 0) {
      if (noGroup.some(i => i == e.group_id)) return false
    }
  }
  // 判断云崽黑名单QQ
  if (e.user_id && Array.isArray(Config.blackQQ)) {
    if (Config.blackQQ.some(i => i == e.user_id)) return false
  }
  // 判断插件前缀
  if (Array.isArray(Config.noMsgStart) && Config.noMsgStart.length > 0) {
    if (e.message?.[0]?.type === 'text') {
      if (Config.noMsgStart.some(i => e.message[0].text.startsWith(i))) return false
    }
  }
  // 群聊消息拦截（按群聊+前缀+bot账号）
  if (e.group_id && Array.isArray(Config.groupIntercept) && Config.groupIntercept.length > 0) {
    const textSeg = e.message?.find(m => m.type === 'text')
    if (textSeg) {
      let rawText = textSeg.text || ''
      // 去掉前面的@提及（CQ码格式和纯文本格式）
      let cleanText = rawText.replace(/^(\[CQ:at,[^\]]*\]\s*)+/, '').replace(/^(@\S+\s*)+/, '')
      for (const rule of Config.groupIntercept) {
        // 检查botId（不填则对所有bot生效）
        if (rule.botId && String(rule.botId) !== String(e.self_id)) continue
        // 检查群聊ID
        if (!Array.isArray(rule.groupIds) || !rule.groupIds.some(id => String(id) === String(e.group_id))) continue
        // 检查前缀
        if (Array.isArray(rule.prefixes) && rule.prefixes.some(p => cleanText.startsWith(p))) {
          return false
        }
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
  const time = (new Date(e.time)).getTime() || Math.floor(Date.now() / 1000)
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
  if (e.guild_id || e.bot?.adapter?.id === 'QQBot' || e.bot?.adapter?.id === 'QQGuild' || e.adapter == 'QQBot' || e.adapter == 'QQGuild') {
    setLatestMsg(e.group_id || e.user_id, { time, message_id: e.message_id, reply: e.reply })
  }
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

      const adapterId = e.bot?.adapter?.id
      const botIdMap = {
        QQBot: 'qqgroup',
        QQGuild: 'qqguild',
        KOOK: 'kook',
        Telegram: 'telegram',
        Discord: 'discord'
      }
      const mappedBotId = botIdMap[adapterId]
      let botid = i.adapter?.gsBotId

      if (i.uin === 'all') {
        botid = mappedBotId || 'onebot'
      } else if (i.uin != e.self_id) {
        continue
      } else if (!botid) {
        botid = mappedBotId || 'onebot'
      }

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

      addGSUidBotPrefix(tmpMsg, e)
      reportMsg = await makeGSUidReportMsg(tmpMsg, botid)

      if (reportMsg) i.ws.send(reportMsg)
    }
  }
})

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

function reply (e) {
  if (!Version.isTrss) {
    const replyNew = e.reply
    return async function () {
      const ret = await replyNew.apply(this, arguments)
      if (ret) {
        setMsg({
          message_id: ret.message_id,
          time: ret.time,
          seq: ret.seq,
          rand: ret.rand,
          user_id: e.user_id,
          group_id: e.group_id,
          onebot_id: Math.floor(Math.random() * Math.pow(2, 32)) | 0
        })
      }
      return ret
    }
  } else {
    if (e.bot?.version?.name == 'ICQQ') {
      let replyNew
      if (e.reply) {
        replyNew = e.reply
      } else {
        replyNew = msg => {
          if (e.isGroup) {
            if (e.group?.sendMsg) {
              return e.group.sendMsg(msg)
            } else {
              return e.bot.pickGroup(e.group_id).sendMsg(msg)
            }
          } else {
            if (e.friend?.sendMsg) {
              return e.friend.sendMsg(msg)
            } else {
              return e.bot.pickFriend(e.user_id).sendMsg(msg)
            }
          }
        }
      }
      return async function () {
        const ret = await replyNew.apply(this, arguments)
        if (ret) {
          setMsg({
            message_id: ret.message_id,
            time: ret.time,
            seq: ret.seq,
            rand: ret.rand,
            user_id: e.user_id,
            group_id: e.group_id,
            onebot_id: Math.floor(Math.random() * Math.pow(2, 32)) | 0
          })
        }
        return ret
      }
    }
    return e.reply
  }
}

export {
  onlyReplyAt
}
