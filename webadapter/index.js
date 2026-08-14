/**
 * gs-plugin WebAdapter 操作模块
 * 由 QQBot-Web-Adapter 自动扫描并调用 init(ctx)
 */
import { Config, getBotList } from '../components/index.js'
import { normalizeMessageBuild } from '../components/MessageBuild.js'

export function init(ctx) {
  const { registerPage, registerApi } = ctx

  // 注册管理页面
  registerPage({
    id: 'gs-manage',
    title: 'Gs适配器',
    icon: '📡',
    priority: 50,
    src: 'page.html',
  })

  // ====== API 接口 ======

  // 获取当前配置
  registerApi('get', '/gs-plugin/config', (_req, res) => {
    try {
      const cfg = Config.getDefOrConfig('gs-config')
      const bots = getBotList()
      const globalEnabledBots = cfg.enabledBots || []
      const servers = Array.isArray(cfg.servers) ? cfg.servers.map(server => ({
        ...server,
        enabled: server.enabled !== false,
        enabledBots: Array.isArray(server.enabledBots) ? server.enabledBots : globalEnabledBots
      })) : []
      res.json({
        ok: true,
        data: {
          pluginEnabled: cfg.pluginEnabled === true,
          servers,
          botList: bots,
          groupIntercept: cfg.groupIntercept || [],
          noMsgStart: cfg.noMsgStart || [],
          noMsgInclude: cfg.noMsgInclude || [],
          noGroup: cfg.noGroup || [],
          yesGroup: cfg.yesGroup || [],
          muteStop: cfg.muteStop !== false,
          ignoreOnlyReplyAt: cfg.ignoreOnlyReplyAt !== false,
          tempMsgReport: cfg.tempMsgReport === true,
          // 保留 legacyReply 字段供旧 Web 前端读取；新前端统一使用 messageBuild。
          legacyReply: Config.messageBuild.legacyReply,
          messageBuild: Config.messageBuild,
          disconnectToMaster: cfg.disconnectToMaster === true,
          reconnectToMaster: cfg.reconnectToMaster === true,
          firstconnectToMaster: cfg.firstconnectToMaster === true,
          msgStoreTime: cfg.msgStoreTime ?? 300,
          taskQueue: cfg.taskQueue ?? 0,
          heartbeatInterval: cfg.heartbeatInterval ?? 5,
          gsuidBotPrefix: cfg.gsuidBotPrefix || {},
          gsuidPrefixIgnore: Array.isArray(cfg.gsuidPrefixIgnore) ? cfg.gsuidPrefixIgnore : []
        }
      })
    } catch (e) {
      res.json({ ok: false, error: e.message })
    }
  })

  // 保存配置
  registerApi('post', '/gs-plugin/config', (req, res) => {
    try {
      const body = req.body || {}
      const allowedKeys = [
        'pluginEnabled', 'enabledBots', 'servers', 'groupIntercept',
        'noMsgStart', 'noMsgInclude', 'noGroup', 'yesGroup',
        'muteStop', 'ignoreOnlyReplyAt', 'tempMsgReport', 'legacyReply', 'messageBuild',
        'disconnectToMaster', 'reconnectToMaster', 'firstconnectToMaster',
        'msgStoreTime', 'taskQueue', 'heartbeatInterval', 'gsuidBotPrefix', 'gsuidPrefixIgnore'
      ]
      for (const key of Object.keys(body)) {
        if (!allowedKeys.includes(key)) continue
        if (key === 'messageBuild') {
          Config.modify('gs-config', key, normalizeMessageBuild(body[key]))
          continue
        }
        Config.modify('gs-config', key, body[key])
      }
      res.json({ ok: true })
    } catch (e) {
      res.json({ ok: false, error: e.message })
    }
  })

  // 获取 BOT 列表
  registerApi('get', '/gs-plugin/bots', (_req, res) => {
    try {
      res.json({ ok: true, data: getBotList() })
    } catch (e) {
      res.json({ ok: false, error: e.message })
    }
  })

  // 获取群聊列表
  registerApi('get', '/gs-plugin/groups', (_req, res) => {
    try {
      const groupList = Array.from(Bot.gl.values()).map(item => ({
        label: `${item.group_name}-${item.group_id}`,
        value: item.group_id,
        group_name: item.group_name,
        avatar: `https://p.qlogo.cn/gh/${item.group_id}/${item.group_id}/100`
      }))
      res.json({ ok: true, data: groupList })
    } catch (e) {
      res.json({ ok: false, error: e.message })
    }
  })
}
