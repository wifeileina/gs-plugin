import { join } from 'path'
import { Config, Version } from '../components/index.js'
import { TMP_DIR } from './tool.js'
import { randomUUID } from 'crypto'
import fs from 'fs'
import fetch from 'node-fetch'

/**
 * 制作gsuid_core上报消息
 * @param {*} e
 * @returns
 */
async function makeGSUidReportMsg (e, botId = 'onebot') {
  let message = []
  let msg = e.message
  // 引用（reply）上报：拉取被引用消息原文，让 AI 能读到引用内容
  let replyId = ''
  let quoted = null
  let appended = false
  if (e.source) {
    replyId = String(e.source.message_id)
    quoted = await fetchSourceMessage(e, replyId) || e.source
    if (Array.isArray(e.source.images) && e.source.images.length) {
      // Red 协议自带引用图，合并进被引用消息的 message 里统一处理
      const base = (quoted && Array.isArray(quoted.message)) ? quoted.message : []
      if (!base.some(seg => seg?.type === 'image')) {
        quoted = {
          ...(quoted || {}),
          message: base.concat(e.source.images.map(img => ({ type: 'image', data: { url: img.url || img.file } })))
        }
      }
    }
  }
  for (const i of msg) {
    switch (i.type) {
      case 'at':
        message.push({
          type: 'at',
          data: i.qq
        })
        break
      case 'text':
        if (Config.noMsgInclude.length > 0 && Array.isArray(Config.noMsgInclude)) {
          if (Config.noMsgInclude.some(item => i.text.includes(item))) {
            return []
          }
        }
        message.push({
          type: 'text',
          data: i.text
        })
        break
      case 'image':
        message.push({
          type: 'image',
          data: i.url
        })
        break
      case 'file': {
        let fileUrl, name
        // 私聊文件（非 TRSS）：通过 friend.getFileUrl 获取下载链接
        if (!e.isGroup && !Version.isTrss && e.friend?.getFileUrl) {
          fileUrl = await e.friend.getFileUrl(e.file.fid)
          name = i.name
        } else {
          // 群聊文件 / TRSS 私聊文件：从消息段中获取 URL
          fileUrl = i.url || i.file || i.data?.url
          name = i.name || i.data?.name || i.filename || 'file'
        }
        if (fileUrl) {
          try {
            let res = await fetch(fileUrl)
            let arrayBuffer = await res.arrayBuffer()
            let buffer = Buffer.from(arrayBuffer)
            let base64 = buffer.toString('base64')
            message.push({
              type: 'file',
              data: `${name}|${base64}`
            })
          } catch (err) {
            logger.debug(`[gs-plugin] 下载文件失败: ${err.message}`)
          }
        }
        break
      }
      case 'reply': {
        // 与 e.source 重复引用时只处理一次；否则从 reply 段拉取被引用消息
        const segReplyId = String(i.id ?? i.data?.id ?? i.message_id ?? '')
        if (segReplyId && segReplyId !== replyId) {
          replyId = segReplyId
          const segQuoted = await fetchSourceMessage(e, segReplyId)
          if (segQuoted) {
            await appendReply(message, segReplyId, segQuoted, e)
            appended = true
          }
        }
        break
      }
      case 'node':
      case 'forward':
      case 'forward_msg': {
        // 收到的合并转发：开关开启时展开节点上报，关闭时跳过
        if (Config.mergeForward !== false) {
          await appendGSUidNode(message, i.data ?? i, e)
        }
        break
      }
      default:
        break
    }
  }
  // e.source 引用在此统一组装（若已由 reply 段处理则跳过）
  if (replyId && !appended) {
    await appendReply(message, replyId, quoted, e)
  }
  if (message.length == 0) {
    return false
  }
  let user_pm = 6
  if (e.isMaster) {
    user_pm = 1
  } else if (e.isGroup) {
    if (e.sender.role === 'owner') {
      user_pm = 2
    } else if (e.sender.role === 'admin') {
      user_pm = 3
    }
  }
  const MessageReceive = {
    bot_id: botId,
    bot_self_id: String(e.self_id),
    msg_id: String(e.message_id),
    user_id: String(e.user_id),
    user_pm,
    content: message,
    sender: {
      ...e.sender,
      user_id: String(e.user_id)
    }
  }
  if (e.avatar) {
    MessageReceive.sender.avatar = e.avatar
  }
  if (e.isGroup) {
    MessageReceive.user_type = 'group'
    MessageReceive.group_id = String(e.group_id)
  } else if (e.isGuild) {
    MessageReceive.user_type = 'channel'
    MessageReceive.group_id = String(e.group_id)
  } else {
    MessageReceive.user_type = 'direct'
  }
  return Buffer.from(JSON.stringify(MessageReceive))
}

// —— 收到的合并转发展开 ——
const NODE_MAX_DEPTH = 3
const NODE_MARK = '[合并转发]'

function stringifyGSUidId (v) {
  return v === undefined || v === null || v === '' ? '' : String(v)
}

// 转发段里的 url 常被反引号包裹（`` `https://...` ``），去掉首尾反引号再上报
function cleanGSUidUrl (v) {
  if (typeof v !== 'string') return v
  return v.replace(/^`+|`+$/g, '')
}

function getGSUidForwardId (value) {
  if (typeof value === 'string' || typeof value === 'number') return stringifyGSUidId(value)
  if (!value || typeof value !== 'object') return ''
  return stringifyGSUidId(value.id || value.message_id || value.data?.id || value.data?.message_id)
}

/** OneBot：按合并转发 id 拉取节点内容 */
async function fetchGSUidForwardItems (e, forwardId, depth, seen) {
  if (!forwardId || depth >= NODE_MAX_DEPTH || seen.has(forwardId)) return [{ type: 'text', data: NODE_MARK }]
  seen.add(forwardId)
  try {
    const bot = e?.bot || Bot[e?.self_id] || Bot
    if (typeof bot?.sendApi !== 'function') throw new Error('当前实例不支持 sendApi')
    const response = await bot.sendApi('get_forward_msg', { message_id: forwardId })
    const messages = Array.isArray(response)
      ? response
      : response?.data?.messages || response?.messages || response?.data
    if (!Array.isArray(messages)) return [{ type: 'text', data: NODE_MARK }]
    return flattenGSUidForwardItems(e, messages, depth + 1, seen)
  } catch (_) {
    return [{ type: 'text', data: NODE_MARK }]
  }
}

/**
 * 递归展平转发内容为 gs 段。
 * 兼容三种结构：原生 node(data 为节点数组)、命名节点({sender/user_id,nickname,message})、纯段。
 */
async function expandGSUidNode (result, node, e, depth, seen) {
  if (Array.isArray(node)) {
    for (const el of node) await expandGSUidNode(result, el, e, depth, seen)
    return
  }
  if (!node || typeof node !== 'object') return

  const nickname = node.sender?.nickname || node.name || ''
  const inner = node.type === 'node' ? (node.data ?? node) : node

// 内联可展开的子内容：content / message / data
  const childArray = Array.isArray(inner)
    ? inner
    : [inner?.content, inner?.message, inner?.data, inner?.frame].find(v => Array.isArray(v))

  if (childArray) {
    if (nickname) result.push({ type: 'text', data: `${nickname}:` })
    const innerForwardId = ['forward', 'forward_msg'].includes(node.type)
      ? (getGSUidForwardId(node) || getGSUidForwardId(inner))
      : ''
    // 嵌套转发无内联内容时按 id 拉取
    if (innerForwardId && childArray.length === 0) {
      result.push({ type: 'text', data: NODE_MARK })
      result.push(...await fetchGSUidForwardItems(e, innerForwardId, depth, seen))
      return
    }
    await expandGSUidNode(result, childArray, e, depth, seen)
    return
  }

  // 叶子段
  const leaf = inner ?? node
  const t = node.type || leaf.type
  if (t === 'text') {
    const text = leaf.text ?? leaf.data?.text ?? leaf.data
    if (typeof text === 'string' && text) result.push({ type: 'text', data: text })
  } else if (t === 'image') {
    const image = cleanGSUidUrl(leaf.url || leaf.file || leaf.data?.url || leaf.data?.file)
    if (image) result.push({ type: 'image', data: stringifyGSUidId(image) })
  } else if (t === 'at') {
    result.push({ type: 'at', data: stringifyGSUidId(leaf.qq || leaf.data?.qq || leaf.data) })
  } else if (t === 'file') {
    const file = cleanGSUidUrl(leaf.url || leaf.file || leaf.data?.url || leaf.data?.file)
    if (file) result.push({ type: 'file', data: `file|${file}` })
  } else if (t === 'record' || t === 'voice') {
    const rec = cleanGSUidUrl(leaf.url || leaf.file || leaf.data?.url || leaf.data?.file)
    if (rec) result.push({ type: 'record', data: stringifyGSUidId(rec) })
  }
}

/** 递归展平转发节点为 gs 消息段 */
async function flattenGSUidForwardItems (e, items, depth, seen) {
  const result = []
  await expandGSUidNode(result, items, e, depth, seen)
  return result
}

/** 把转发段并入上报内容：优先内联展开，内联为空时按 id 拉取，输出 gs {type:'node',data} */
async function appendGSUidNode (message, node, e) {
  const items = []
  await expandGSUidNode(items, node, e, 0, new Set())
  if (!items.length) {
    const forwardId = getGSUidForwardId(node)
    if (forwardId) {
      items.push({ type: 'text', data: NODE_MARK })
      items.push(...await fetchGSUidForwardItems(e, forwardId, 0, new Set()))
    }
  }
  if (!items.length) return
  // 平铺开启（默认）：按仅文字开关平铺；平铺关闭：回退 node 原样上报
  pushFlatOrNode(message, items)
}

/** 合并转发展开结果的统一上报：平铺或回退 node（由 mergeForwardFlatten / mergeForwardTextOnly 决定） */
function pushFlatOrNode (message, items) {
  if (Config.mergeForwardFlatten) {
    message.push(...(Config.mergeForwardTextOnly ? items.filter(s => s.type === 'text') : items))
  } else {
    message.push({ type: 'node', data: items })
  }
}

// —— 引用（reply）上报：让 AI 能读到被引用内容 ——
function getReplyText (reply) {
  if (!reply || typeof reply !== 'object') return ''
  if (reply.text || reply.message_str) return String(reply.text || reply.message_str)
  if (typeof reply.message === 'string') return reply.message.replace(/\[CQ:[^\]]+\]/g, '').trim()
  if (Array.isArray(reply.message)) {
    return reply.message
      .filter(item => item?.type === 'text')
      .map(item => item.text || item.data?.text || item.data?.content || (typeof item.data === 'string' ? item.data : ''))
      .join('')
  }
  if (typeof reply.raw_message === 'string') return reply.raw_message.replace(/\[CQ:[^\]]+\]/g, '').trim()
  return ''
}

/** 把合并转发展开结果转成可读文字摘要（图片/语音等用占位），供 AI 读引用内容 */
function formatNodePreview (items, quotedText = '') {
  const lines = [NODE_MARK]
  if (quotedText && !quotedText.includes(NODE_MARK)) lines.push(quotedText)
  let pendingNickname = ''
  for (const item of items) {
    if (item.type === 'text' && item.data) {
      const text = String(item.data).trim()
      if (text.endsWith(':') || text.endsWith('：')) {
        pendingNickname = `${text.slice(0, -1)}：`
        continue
      }
      lines.push(`${pendingNickname}${text}`)
      pendingNickname = ''
    } else if (item.type === 'image') {
      lines.push(`${pendingNickname}[图片]`)
      pendingNickname = ''
    } else if (item.type === 'record' || item.type === 'voice') {
      lines.push(`${pendingNickname}[语音]`)
      pendingNickname = ''
    } else if (item.type === 'video') {
      lines.push(`${pendingNickname}[视频]`)
      pendingNickname = ''
    } else if (item.type === 'file') {
      lines.push(`${pendingNickname}[文件]`)
      pendingNickname = ''
    }
  }
  if (pendingNickname) lines.push(pendingNickname)
  return lines.filter(Boolean).join('\n')
}

/** 拉取被引用消息对象，兼容 getMsg / sendApi(get_msg) */
async function fetchSourceMessage (e, id) {
  try {
    const bot = Bot[e.self_id] || Bot
    const response = typeof bot?.getMsg === 'function'
      ? await bot.getMsg(id)
      : typeof bot?.sendApi === 'function'
        ? (await bot.sendApi('get_msg', { message_id: id }))
        : null
    const data = response?.data || response
    if (Array.isArray(data?.message) || typeof data?.message === 'string' || typeof data?.raw_message === 'string') {
      return data
    }
    return null
  } catch (err) {
    logger.debug(`[gs-plugin] 获取被引用消息 ${id} 失败: ${err.message}`)
    return null
  }
}

/** 按官方方式上报引用：reply 段带被引用正文，reply_id 段带原消息 id，并展开被引用消息里的图片/合并转发 */
async function appendReply (message, replyId, quoted, e) {
  if (replyId != null && replyId !== '') message.push({ type: 'reply_id', data: String(replyId) })

  const quotedMsg = Array.isArray(quoted?.message) ? quoted.message : []
  for (const seg of quotedMsg) {
    if (seg?.type === 'image') {
      const img = seg.url || seg.file || seg.data?.url || seg.data?.file
      if (img) message.push({ type: 'image', data: String(img).trim() })
    }
  }

  const forward = quotedMsg.find(item => item?.type === 'forward' || item?.type === 'forward_msg')
  let nodeItems = []
  if (forward) {
    const direct = forward.data?.content || forward.data?.message
    nodeItems = Array.isArray(direct)
      ? await flattenGSUidForwardItems(e, direct, 0, new Set())
      : await fetchGSUidForwardItems(e, getGSUidForwardId(forward.data), 0, new Set())
  }

  const quotedText = getReplyText(quoted)
  const replyText = nodeItems.length ? formatNodePreview(nodeItems, quotedText) : quotedText
  if (replyText) message.push({ type: 'reply', data: replyText })
  if (nodeItems.length) pushFlatOrNode(message, nodeItems)
}

const CODE_RE = /^兑换码[:：]\s*(.+?)\s*$/
const REWARD_RE = /^奖励[:：]\s*(.+?)\s*$/
const EXPIRY_RE = /^(有效期.*)$/

function tryBuildGachacodeMarkdown (content) {
  if (typeof content !== 'string' || !content.includes('兑换码')) return null

  const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const entries = []
  let index = 0

  while (index < lines.length) {
    const codeMatch = lines[index].match(CODE_RE)
    if (!codeMatch) {
      index++
      continue
    }

    const code = codeMatch[1].trim()
    let reward = ''
    let expiry = ''
    let nextIndex = index + 1

    while (nextIndex < lines.length && !CODE_RE.test(lines[nextIndex])) {
      const rewardMatch = lines[nextIndex].match(REWARD_RE)
      const expiryMatch = lines[nextIndex].match(EXPIRY_RE)
      if (rewardMatch) reward = rewardMatch[1].trim()
      else if (expiryMatch) expiry = expiryMatch[1].trim()
      nextIndex++
    }

    entries.push({ code, reward, expiry })
    index = nextIndex
  }

  if (!entries.length) return null

  return entries.map(({ code, reward, expiry }) => {
    // QQBot 的代码块需在标题、围栏和奖励行之间保留空行。
    const formattedReward = reward.replaceAll('*', '×')
    const fenceInfo = expiry || '长期'
    return `##兑换码：\n\n>奖励: ${formattedReward}\n\n\`\`\`${fenceInfo}\n\n${code}\n\n\`\`\``
  }).join('\n\n')
}

/** 按魔数识别音频格式后缀：QQBot 用 ffmpeg 按内容识别，OneBot 等依赖扩展名决定转码 */
function sniffAudioExt (buffer) {
  if (buffer.length < 12) return '.mp3'
  const head = buffer.subarray(0, 12).toString('latin1')
  if (head.startsWith('#!SILK') || head.includes('SKIP') || head.startsWith('#!AMR')) return '.silk'
  if (head.startsWith('OggS')) return '.ogg'
  if (head.startsWith('ID3') || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return '.mp3'
  if (head.startsWith('RIFF') && head.includes('WAVE')) return '.wav'
  if (head.includes('ftyp')) return '.m4a'
  return '.mp3'
}

/**
 * 制作gsuid发送消息
 * @param {*} data
 */
async function makeGSUidSendMsg (data) {
  let content = data.content; let quote = null; let bot = Bot[data.bot_self_id] || Bot
  const replyIdData = (Array.isArray(content) ? content : []).find(s => s?.type === 'reply_id')?.data
  const sendMsg = []
  const adapter = bot?.adapter
  const botSelfId = String(data.bot_self_id).split(':')[0]
  const isQQBotAdapter = [data.bot_adapter, adapter?.id, adapter?.name, adapter?.platform, adapter]
    .some(value => String(value || '').toLowerCase() === 'qqbot')
  const isQQBotAccount = Object.hasOwn(Bot.QQBotConfig?.config?.markdown || {}, botSelfId)
  // QQBot 群聊和私聊的目标 ID 是 32 位十六进制字符串；GSUID 回包缺 bot_self_id 时用作兑换码转换兜底。
  const isQQBotTarget = /^(?:[0-9a-f]{32})$/i.test(String(data.target_id || '').split(':').pop())
  const isQQBot = isQQBotAdapter || isQQBotAccount || isQQBotTarget
  const gachaSegments = content.filter(msg => {
    const value = typeof msg.data === 'string' ? msg.data : msg.data?.content || msg.data?.text
    return typeof value === 'string' && value.includes('兑换码')
  })
  if (gachaSegments.length) {
    logger.mark(`[gs-plugin] 兑换码响应入口: bot=${botSelfId}, qqbot=${isQQBot}, segments=${gachaSegments.map(msg => msg.type).join(',')}`)
  }
  if (content[0].type.startsWith('log')) {
    logger.info(content[0].data)
  } else {
    let target = data.target_type == 'direct' ? 'pickFriend' : 'pickGroup'
    for (const msg of content) {
      switch (msg.type) {
        case 'image':
          if (!/^(http|base64|link)/.test(msg.data)) {
            msg.data = 'base64://' + msg.data
          }
          if (msg.data.startsWith('link://')) {
            msg.data = msg.data.replace('link://', '')
            if (!msg.data.startsWith('http')) {
              msg.data = 'http://' + msg.data
            }
          }
          sendMsg.push(segment.image(msg.data))
          break
        case 'text': {
          const gachaMarkdown = isQQBot
            ? tryBuildGachacodeMarkdown(String(msg.data))
            : null

          if (gachaMarkdown) {
            logger.mark('[gs-plugin] QQBot 兑换码文本已转为原生 Markdown')
            sendMsg.push(toMD(gachaMarkdown))
            break
          }
          sendMsg.push(msg.data)
          break
        }
        case 'at':
          sendMsg.push(segment.at(Number(msg.data) || String(msg.data)))
          break
        case 'reply':
      case 'reply_id': {
        // GS 可能回 reply_id（原消息 id）或 reply（引用文字），优先用 reply_id 作为引用
        const rid = String(replyIdData || msg.data || '').trim()
        const quotedId = /^\d+$/.test(rid) || /^[0-9a-f]{16,}$/i.test(rid) ? rid : null
        if (quotedId) {
          quote = await bot.getMsg?.(quotedId) || await bot[target].getChatHistory?.(quotedId, 1)?.[0] || quote || null
        }
        break
      }
        case 'file':{
          let file = msg.data.split('|')
          let buffer = Buffer.from(file[1], 'base64')
          let name = file[0]
          const target = data.target_type === 'group' || data.target_type === 'channel'
            ? bot.pickGroup(data.target_id)
            : bot.pickFriend(data.target_id)
          if (target && typeof target.sendFile === 'function') {
            await target.sendFile(buffer, name)
          } else {
            // QQBot 等适配器：绕过 SDK 发送器，直接调用 QQ 文件上传 API 确保文件名正确
            const sdk = bot.sdk
            if (sdk?.request) {
              try {
                const fileData = buffer.toString('base64')
                const targetId = data.target_id.includes(':')
                  ? data.target_id.split(':').pop()
                  : data.target_id
                const apiType = data.target_type === 'direct' ? 'users' : 'groups'
                const uploadRet = await sdk.request.post(`/v2/${apiType}/${targetId}/files`, {
                  file_name: name,
                  file_type: 4,
                  file_data: fileData,
                  srv_send_msg: false
                })
                const fileInfo = uploadRet?.data?.file_info
                if (fileInfo) {
                  // 直接发送文件消息，绕过 SDK 发送器
                  await sdk.request.post(`/v2/${apiType}/${targetId}/messages`, {
                    msg_type: 7,
                    media: { file_info: fileInfo },
                    msg_id: data.msg_id || '',
                    msg_seq: data.msg_seq || 1
                  })
                  logger.debug(`[gs-plugin] QQBot 文件直传成功: ${name}`)
                }
              } catch (err) {
                logger.error(`[gs-plugin] QQBot 文件直传失败: ${err.message}`)
                // 回退：写入临时文件走 segment.file
                const tmpPath = join(TMP_DIR, `${randomUUID()}_${name}`)
                fs.writeFileSync(tmpPath, buffer)
                sendMsg.push(segment.file(tmpPath, name))
              }
            } else {
              // 回退
              const tmpPath = join(TMP_DIR, `${randomUUID()}_${name}`)
              fs.writeFileSync(tmpPath, buffer)
              sendMsg.push(segment.file(tmpPath, name))
            }
          }
          break
        }
        case 'record':
        case 'voice':
        case 'audio': {
          const file = msg.data
          // GSCore 语音段通常为 base64:// 或 http(s) 链接，base64 落盘为临时文件走后端转码
          if (typeof file === 'string' && /^https?:\/\//.test(file)) {
            sendMsg.push(segment.record(file))
          } else {
            const base64 = String(file).startsWith('base64://')
              ? String(file).slice(9)
              : String(file)
            const buffer = Buffer.from(base64, 'base64')
            const tmpPath = join(TMP_DIR, `${randomUUID()}${sniffAudioExt(buffer)}`)
            fs.writeFileSync(tmpPath, buffer)
            sendMsg.push(segment.record(tmpPath))
          }
          break
        }
        case 'node':{
          let arr = []
          for (const i of msg.data) {
            const { sendMsg: message } = await makeGSUidSendMsg({ content: [i], target_type: data.target_type, target_id: data.target_id })
            arr.push({
              message,
              nickname: '小助手',
              user_id: 2854196310
            })
          }
          sendMsg.push(await bot[target](data.target_id).makeForwardMsg?.(arr) || { type: 'node', data: arr })
          break
        }
        case 'template_markdown':{
          const markdown_parms = []
          for (const key in msg.data.para) {
            markdown_parms.push({ key, values: [msg.data.para[key]] })
          }
          const md = { custom_template_id: msg.data.template_id, params: markdown_parms }
          sendMsg.push(toMD(md))
          break
        }
        case 'buttons':
          sendMsg.push(toGSButton(msg.data))
          break
        case 'markdown': {
          const markdownContent = typeof msg.data === 'string'
            ? msg.data
            : msg.data?.content
          const markdown = isQQBot
            ? tryBuildGachacodeMarkdown(markdownContent)
            : null

          if (markdown) {
            logger.mark('[gs-plugin] QQBot 兑换码 markdown 段已转为原生 Markdown')
            sendMsg.push(toMD(markdown))
            break
          }
          sendMsg.push(toMD(msg.data))
          break
        }
        default:
          break
      }
    }
  }
  return { sendMsg, quote }
}

function toMD (data) {
  if (Version.isTrss) {
    return segment.markdown(data)
  } else {
    return {
      type: 'markdown',
      ...data
    }
  }
}

function toGSButton (rawButtons) {
  // 如果值均为Button，则按照预先设定行列发送（例如Nonebot2-qq为默认两个按钮一行）
  if (!rawButtons.every(i => Array.isArray(i))) {
    rawButtons = rawButtons.reduce((acc, cur, i) => {
      // 每行2个
      if (i % 2 == 0) {
        if (i < rawButtons.length - 1) {
          acc.push([cur, rawButtons[i + 1]])
        } else {
          acc.push([cur])
        }
      }
      return acc
    }, [])
  }
  const buttons = []
  for (const rawButton of rawButtons) {
    const button = []
    for (const i of rawButton) {
      const action = {
        0: 'link',
        1: 'callback',
        2: 'input'
      }[i.action] || 'input'
      const permission = {
        0: i.specify_user_ids,
        1: 'admin'
      }[i.permisson] || null
      button.push({
        text: i.text,
        [action]: i.data,
        clicked_text: i.pressed_text,
        send: i.enter,
        permission
      })
    }
    buttons.push(button)
  }
  if (Version.isTrss) {
    return segment.button(...buttons)
  } else {
    return Bot.Button(buttons)
  }
}

export {
  makeGSUidReportMsg,
  makeGSUidSendMsg
}
