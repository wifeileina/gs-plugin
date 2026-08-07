import WebSocket from 'ws'
import { makeGSUidSendMsg, getLatestMsg, setMsg } from '../model/index.js'
import { Version, Config } from './index.js'

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

  createGSUidWs () {
    let wsAddress = this.address
    if (this.accessToken) {
      try {
        const urlObj = new URL(wsAddress)
        if (!urlObj.searchParams.has('token')) {
          urlObj.searchParams.set('token', this.accessToken)
        }
        wsAddress = urlObj.toString()
      } catch (error) {
        const hasQuery = wsAddress.includes('?')
        const hasToken = /([?&])token=/.test(wsAddress)
        if (!hasToken) {
          wsAddress += `${hasQuery ? '&' : '?'}token=${encodeURIComponent(this.accessToken)}`
        }
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
        const data = JSON.parse(event.toString())
        const { sendMsg } = await makeGSUidSendMsg(data)
        if (sendMsg.length > 0) {
          let sendRet, group_id, user_id
          const bot = Bot[data.bot_self_id] || Bot

          if (!bot || typeof bot.pickGroup !== 'function' || typeof bot.pickFriend !== 'function') {
            logger.error(`[gs-plugin] bot 对象无效或缺少必要方法`)
            return
          }

          if (data.target_type === 'group' || data.target_type === 'channel') {
            group_id = data.target_id
            const latest = getLatestMsg(group_id)
            if (latest && typeof latest.reply === 'function') {
              await latest.reply(sendMsg)
              sendRet = { message_id: `passive_${Date.now()}` }
            } else {
              sendRet = await bot.pickGroup(group_id).sendMsg(sendMsg)
            }
          } else if (data.target_type === 'direct') {
            user_id = data.target_id
            const latest = getLatestMsg(user_id)
            if (latest && typeof latest.reply === 'function') {
              await latest.reply(sendMsg)
              sendRet = { message_id: `passive_${Date.now()}` }
            } else {
              sendRet = await bot.pickFriend(user_id).sendMsg(sendMsg)
            }
          } else {
            logger.warn(`[gs-plugin] 未知 target_type: ${data.target_type}`)
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
          logger.warn(`[gs-plugin] ${this.name} 连接异常,停止重连`)
          this.status = 0
        } else {
          logger.warn(`[gs-plugin] ${this.name} 开始尝试重新连接第 ${this.reconnectCount} 次`)
          this.reconnectCount++
          setTimeout(() => {
            this.createGSUidWs()
          }, this.reconnectInterval * 1000)
        }
      } else {
        this.stopReconnect = false
        this.status = 0
        logger.warn(`[gs-plugin] ${this.name} 达到最大重连次数或关闭连接,停止重连`)
      }
    })

    this.ws.on('error', (event) => {
      logger.error(`[gs-plugin] ${this.name} 连接失败\n${event}`)
    })
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
