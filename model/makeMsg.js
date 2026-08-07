import { join } from 'path'
import { Config, Version } from '../components/index.js'
import { CQToMsg } from './CQCode.js'
import { getMsg, setMsg, getUser_id } from './DataBase.js'
import { TMP_DIR, decodeHtml } from './tool.js'
import common from '../../../lib/common/common.js'
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
  if (e.source) {
    message.push({
      type: 'reply',
      data: String(e.source.message_id)
    })
    // 从被引用消息中提取图片，注入到 content 中
    try {
      const bot = Bot[e.self_id] || Bot
      if (typeof bot?.getMsg === 'function') {
        const sourceMsg = await bot.getMsg(e.source.message_id)
        if (sourceMsg?.message && Array.isArray(sourceMsg.message)) {
          for (const seg of sourceMsg.message) {
            if (seg.type === 'image') {
              message.push({
                type: 'image',
                data: seg.url || seg.file
              })
            }
          }
        }
      }
    } catch (_) {
      // 无法获取被引用消息时静默忽略
    }
    // 如果 e.source 本身包含图片信息（Red 协议），也一并提取
    if (Array.isArray(e.source.images)) {
      for (const img of e.source.images) {
        message.push({
          type: 'image',
          data: img.url || img.file
        })
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
      case 'reply':
        message.push({
          type: 'reply',
          data: String(i.id)
        })
        break
      default:
        break
    }
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

/**
 * 制作gsuid发送消息
 * @param {*} data
 */
async function makeGSUidSendMsg (data) {
  let content = data.content; let quote = null; let bot = Bot[data.bot_self_id] || Bot
  const sendMsg = []
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
        case 'text':
          sendMsg.push(msg.data)
          break
        case 'at':
          sendMsg.push(segment.at(Number(msg.data) || String(msg.data)))
          break
        case 'reply':
          quote = await bot.getMsg?.(msg.data) || await bot[target].getChatHistory?.(msg.data, 1)?.[0] || null
          break
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
        case 'markdown':
          sendMsg.push(toMD(msg.data))
          break
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
