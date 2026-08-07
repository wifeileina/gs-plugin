import Client from './Client.js'
import { Config, Version } from './index.js'
import { getUser_id } from '../model/index.js'
import _ from 'lodash'

let sendSocketList = []
let allSocketList = []

const adapterName = {
  qg_: {
    name: 'QQGuild',
    user_like: 'qg_%',
    group_like: 'qg_%',
    gsBotId: 'qqguild'
  },
  wx_: {
    name: 'WeChat',
    user_like: 'wx_%',
    group_like: 'wx_%'
  },
  wxi: {
    name: 'WeChat',
    user_like: 'wxid_%',
    group_like: '%@chatroom'
  },
  mv_: {
    name: 'mysVilla',
    user_like: 'mv_%',
    group_like: 'mv_%',
    gsBotId: 'villa'
  },
  ko_: {
    name: 'KOOK',
    user_like: 'ko_%',
    group_like: 'ko_%',
    gsBotId: 'kook'
  },
  tg_: {
    name: 'Telegram',
    user_like: 'tg_%',
    group_like: 'tg_%',
    gsBotId: 'telegram'
  },
  dc_: {
    name: 'Discord',
    user_like: 'dc_%',
    group_like: 'dc_%',
    gsBotId: 'discord'
  },
  std: {
    name: 'stdin',
    user_like: 'std%',
    group_like: 'std%'
  }
}

async function createWebSocket (data) {
  if (typeof data.close != 'undefined' && typeof data.closed == 'undefined') {
    data.closed = data.close
    delete data.close
  }
  // uin 默认值：不填或填 "all" 则转发所有 BOT 的消息
  if (!data.uin || data.uin === 'all') {
    data.uin = 'all'
  }
  data.rawName = data.rawName || data.name
  if (Array.isArray(data.uin)) {
    for (const uin of data.uin) {
      const str = String(uin)
      const i = _.cloneDeep(data)
      i.name += `(${str.slice(0, 4) + '...' + str.slice(-2)})`
      i.rawName = data.name
      i.uin = uin
      await createWebSocket(i)
    }
    return
  }
  const client = new Client(data)
  const getQQBotAdapter = (self_id) => ({
    name: 'QQBot',
    user_like: [
      self_id + '%',
      'qg_%'
    ],
    group_like: [
      self_id + '%',
      'qg_%'
    ],
    gsBotId: 'qqgroup'
  })
  const isQQBotLikeId = (self_id) => {
    if (!self_id) return false
    return (/^(2854|3889|401)/.test(self_id) && self_id.length === 10) || (!Version.isTrss && self_id.startsWith('1020') && self_id.length === 9)
  }

  const botAdapterId = Bot?.[client.uin]?.adapter?.id || Bot?.[client.self_id]?.adapter?.id

  if (typeof client.self_id === 'string') {
    client.self_id = await getUser_id({ user_id: client.self_id })
    client.adapter = adapterName[client.uin?.substring?.(0, 3)]
    const self_id = String(client.self_id)
    if (!client.adapter && (botAdapterId === 'QQBot' || isQQBotLikeId(self_id))) {
      client.adapter = getQQBotAdapter(self_id)
    }
  } else {
    const self_id = String(client.self_id)
    if (botAdapterId === 'QQBot' || isQQBotLikeId(self_id)) {
      client.adapter = getQQBotAdapter(self_id)
    }
  }
  setAllSocketList(client)
  if (data.address == 'gs_address') return
  if (data.closed) return
  sendSocketList = sendSocketList.filter(i => i.name != data.name)

  if (!await checkVersion(data)) return
  client.createGSUidWs()
  sendSocketList.push(client)
}

function setAllSocketList (data) {
  allSocketList = allSocketList.filter(i => i.name != data.name)
  allSocketList.push(data)
}

async function checkVersion (data) {
  // uin 为 'all' 时跳过版本检查，允许转发所有 BOT 的消息
  if (data.uin === 'all') return true
  if (Version.isTrss) {
    if (!data.uin) {
      logger.warn(`[gs-plugin] ${data.name} 缺少配置项uin 请删除连接后重新#gs添加连接`)
      return false
    }
  } else if (Bot.uin == '88888') {
    if (!data.uin) {
      logger.warn(`[gs-plugin] ${data.name} 缺少配置项uin 请删除连接后重新#gs添加连接`)
      return false
    }
  }
  return true
}

async function modifyWebSocket (target) {
  switch (target.type) {
    case 'add':
    case 'open':
      await createWebSocket(target.data)
      break
    case 'del':
    case 'close':
      for (const i of allSocketList) {
        const reg = new RegExp(`^${target.data.name}\\\(.{1,6}\\\)$`)
        if (i.name == target.data.name || reg.test(i.name)) {
          i.close()
        }
      }
      break
    default:
  }
}

function clearWebSocket () {
  for (const i of allSocketList) {
    i.close()
  }
}

async function initWebSocket () {
  for (const i of Config.servers) {
    await createWebSocket(i)
  }
}

export {
  initWebSocket,
  clearWebSocket,
  modifyWebSocket,
  allSocketList,
  setAllSocketList,
  sendSocketList,
  createWebSocket
}