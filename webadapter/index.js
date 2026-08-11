/**
 * gs-plugin WebAdapter 操作模块
 * 由 QQBot-Web-Adapter 自动扫描并调用 init(ctx)
 */
import { Config, getBotList } from '../components/index.js'

export function init(ctx) {
  const { pluginName, registerPage, registerApi } = ctx

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
      // 拆分 enabledBots 供前端展示
      const enabledBots = cfg.enabledBots || []
      const allBots = enabledBots.includes('all')
      const specBots = allBots ? [] : enabledBots
      const servers = Array.isArray(cfg.servers) ? cfg.servers.map(server => ({ ...server, enabled: server.enabled !== false })) : []
      res.json({
        ok: true,
        data: {
          pluginEnabled: cfg.pluginEnabled === true,
          enabledBotsAll: allBots,
          enabledBots: specBots,
          servers,
          groupIntercept: cfg.groupIntercept || [],
          noMsgStart: cfg.noMsgStart || [],
          noMsgInclude: cfg.noMsgInclude || [],
          noGroup: cfg.noGroup || [],
          yesGroup: cfg.yesGroup || [],
          muteStop: cfg.muteStop !== false,
          ignoreOnlyReplyAt: cfg.ignoreOnlyReplyAt !== false,
          tempMsgReport: cfg.tempMsgReport === true,
          disconnectToMaster: cfg.disconnectToMaster === true,
          reconnectToMaster: cfg.reconnectToMaster === true,
          firstconnectToMaster: cfg.firstconnectToMaster === true,
          msgStoreTime: cfg.msgStoreTime ?? 300,
          taskQueue: cfg.taskQueue ?? 0,
          heartbeatInterval: cfg.heartbeatInterval ?? 5,
          gsuidBotPrefix: cfg.gsuidBotPrefix || {},
          botList: bots,
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
        'muteStop', 'ignoreOnlyReplyAt', 'tempMsgReport',
        'disconnectToMaster', 'reconnectToMaster', 'firstconnectToMaster',
        'msgStoreTime', 'taskQueue', 'heartbeatInterval', 'gsuidBotPrefix'
      ]
      for (const key of Object.keys(body)) {
        if (!allowedKeys.includes(key)) continue
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