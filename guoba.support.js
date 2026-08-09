import lodash from 'lodash'
import { Config, getBotList } from './components/index.js'

// 支持锅巴
export function supportGuoba() {
  let groupList = Array.from(Bot.gl.values())
  groupList = groupList.map(item => item = { label: `${item.group_name}-${item.group_id}`, value: item.group_id })

  // 获取已连接的BOT列表（含协议端信息）
  const botList = getBotList()

  return {
    // 插件信息，将会显示在前端页面
    pluginInfo: {
      name: 'gs-plugin',
      title: 'gs-plugin',
      author: '@Ileina',
      authorLink: 'https://gitee.com/Ileina',
      link: 'https://gitee.com/Ileina/ws-plugin',
      isV3: true,
      isV2: false,
      description: 'GS（GScore）连接适配器插件，用于 Bot 与 GS 核心服务之间的消息转发',
      icon: 'bx:link',
      iconColor: 'rgb(152, 212, 241)',
    },
    // 配置项信息
    configInfo: {
      // 配置项 schemas
      schemas: [
        {
          component: 'Divider',
          label: '插件开关'
        },
        {
          field: 'gs.pluginEnabled',
          label: '插件总开关',
          bottomHelpMessage: '关闭后停止所有连接和消息转发',
          component: 'Switch',
        },
        {
          component: 'Divider',
          label: 'GS连接设置'
        },
        {
          field: 'gs.serversName',
          label: '连接名字',
          bottomHelpMessage: '连接的名称标识',
          component: 'Input',
          required: true
        },
        {
          field: 'gs.serversAddress',
          label: '连接地址',
          bottomHelpMessage: 'GS 服务的 WebSocket 地址',
          component: 'Input',
          required: true
        },
        {
          field: 'gs.serversReconnectInterval',
          label: '重连间隔',
          component: 'InputNumber',
          required: true,
          componentProps: {
            addonAfter: '秒'
          }
        },
        {
          field: 'gs.serversMaxReconnectAttempts',
          label: '最大连接次数',
          bottomHelpMessage: '0 为无限制',
          component: 'InputNumber',
          required: true,
          componentProps: {
            addonAfter: '次'
          }
        },
        {
          field: 'gs.serversAccessToken',
          label: '鉴权Token',
          bottomHelpMessage: 'GS 服务需要鉴权时填写',
          component: 'Input',
        },
        {
          component: 'Divider',
          label: 'BOT分发'
        },
        {
          field: 'gs.enabledBotsAll',
          label: '转发全部BOT',
          bottomHelpMessage: '开启后转发所有BOT的消息，无需手动指定',
          component: 'Switch',
        },
        {
          field: 'gs.enabledBots',
          label: '指定BOT',
          bottomHelpMessage: '关闭"转发全部BOT"后生效，选择要转发消息的BOT',
          component: 'Select',
          componentProps: {
            mode: 'multiple',
            options: botList,
            placeholder: '请选择要启用的BOT'
          }
        },
        {
          component: 'Divider',
          label: '群聊消息拦截'
        },
        {
          field: 'gs.groupIntercept',
          label: '拦截规则列表',
          bottomHelpMessage: '指定群聊中，消息前缀匹配时不上报（自动忽略前面的@提及）。botId不填则对所有bot生效',
          component: 'GSubForm',
          componentProps: {
            multiple: true,
            schemas: [
              {
                field: 'botId',
                label: 'BOT账号',
                bottomHelpMessage: '可选，不填则对所有bot生效',
                component: 'Input',
                componentProps: {
                  placeholder: '留空=所有bot'
                }
              },
              {
                field: 'groupIds',
                label: '目标群聊',
                bottomHelpMessage: '要拦截的群聊列表',
                component: 'GSelectGroup',
                componentProps: {
                  allowAdd: true,
                  allowDel: true,
                  mode: 'multiple',
                  options: groupList
                }
              },
              {
                field: 'prefixes',
                label: '拦截前缀',
                bottomHelpMessage: '消息以这些前缀开头时不上报（自动忽略前面的@提及）',
                component: 'GTags',
                componentProps: {
                  allowAdd: true,
                  allowDel: true,
                },
              },
            ]
          }
        },
        {
          component: 'Divider',
          label: '通知设置'
        },
        {
          field: 'gs.noMsgStart',
          label: '不转发前缀',
          bottomHelpMessage: '以数组内开头的消息不转发',
          component: 'GTags',
          componentProps: {
            allowAdd: true,
            allowDel: true,
          },
        },
        {
          field: 'gs.noMsgInclude',
          label: '不转发包含',
          bottomHelpMessage: '包含了数组内的消息不转发',
          component: 'GTags',
          componentProps: {
            allowAdd: true,
            allowDel: true,
          },
        },
        {
          field: 'gs.noGroup',
          label: '黑名单群聊',
          bottomHelpMessage: '数组内的群消息不转发',
          component: 'GSelectGroup',
          componentProps: {
            allowAdd: true,
            allowDel: true,
            mode: 'multiple',
            options: groupList
          }
        },
        {
          field: 'gs.yesGroup',
          label: '白名单群聊',
          bottomHelpMessage: '只转发数组内的群消息',
          component: 'GSelectGroup',
          componentProps: {
            allowAdd: true,
            allowDel: true,
            mode: 'multiple',
            options: groupList
          }
        },
        {
          field: 'gs.disconnectToMaster',
          label: '断开通知',
          bottomHelpMessage: '断开连接时是否通知主人',
          component: 'Switch',
        },
        {
          field: 'gs.reconnectToMaster',
          label: '重连通知',
          bottomHelpMessage: '重新连接成功时是否通知主人',
          component: 'Switch',
        },
        {
          field: 'gs.firstconnectToMaster',
          label: '首次连接通知',
          bottomHelpMessage: '首次连接成功/失败时是否通知主人',
          component: 'Switch',
        },
        {
          component: 'Divider',
          label: 'GS前缀设置'
        },
        {
          field: 'gs.gsuidBotPrefixList',
          label: '转发前缀',
          bottomHelpMessage: '按bot账号在转发时自动添加前缀（设置后自动移除 / 前缀）。',
          component: 'GSubForm',
          componentProps: {
            multiple: true,
            schemas: [
              {
                field: 'self_id',
                label: 'BOT账号',
                component: 'Input',
                required: true
              },
              {
                field: 'prefix',
                label: '前缀',
                component: 'Input',
                required: true
              },
              {
                field: 'skipIfHasPrefix',
                label: '有前缀不插入',
                bottomHelpMessage: '开启后，若命令开头是大小写字母或数字，则不再插入自定义前缀',
                component: 'Switch',
                componentProps: {
                  defaultValue: true
                }
              },
              {
                field: 'noPrefixCommands',
                label: '不加前缀命令',
                bottomHelpMessage: '仅当前BOT生效；命中这些命令时不自动添加自定义前缀',
                component: 'Select',
                componentProps: {
                  allowClear: true,
                  mode: 'tags',
                  options: []
                }
              }
            ]
          }
        },
        {
          component: 'Divider',
          label: '其他设置'
        },
        {
          field: 'gs.muteStop',
          label: '禁言拦截',
          bottomHelpMessage: '被禁言或全体禁言时不转发消息',
          component: 'Switch',
        },
        {
          field: 'gs.ignoreOnlyReplyAt',
          label: '忽略仅艾特',
          bottomHelpMessage: '忽略云崽配置文件的仅艾特/前缀限制',
          component: 'Switch',
        },
        {
          field: 'gs.tempMsgReport',
          label: '临时会话',
          bottomHelpMessage: '是否转发临时会话消息',
          component: 'Switch',
        },
        {
          field: 'gs.msgStoreTime',
          label: '消息存储时间',
          bottomHelpMessage: '消息存储时间，用于回复消息',
          component: 'InputNumber',
          required: true,
          componentProps: {
            min: 0,
            placeholder: '请输入时间',
            addonAfter: '秒'
          },
        },
        {
          field: 'gs.taskQueue',
          label: '数据库同步锁',
          bottomHelpMessage: '0为关闭，大于0为开启并设置并发数',
          component: 'InputNumber',
          required: true,
          componentProps: {
            min: 0,
            placeholder: '0',
          },
        },
      ],
      // 获取配置数据方法（用于前端填充显示数据）
      getConfigData() {
        const gs = Config.getDefOrConfig('gs-config')
        const prefixMap = gs.gsuidBotPrefix || {}
        gs.gsuidBotPrefixList = Object.keys(prefixMap).map(self_id => {
          const item = prefixMap[self_id]
          return {
            self_id,
            prefix: String(item?.prefix || ''),
            skipIfHasPrefix: typeof item?.skipIfHasPrefix === 'boolean' ? item.skipIfHasPrefix : true,
            noPrefixCommands: Array.isArray(item?.noPrefixCommands) ? item.noPrefixCommands : []
          }
        })
        // 确保 pluginEnabled 有默认值
        if (gs.pluginEnabled === undefined) gs.pluginEnabled = true
        // 确保 enabledBots 有默认值
        if (!gs.enabledBots || gs.enabledBots.length === 0) {
          gs.enabledBots = ['all']
        }
        // 拆分 enabledBots：如果包含 'all' 则开关打开，否则展示具体列表
        if (gs.enabledBots.includes('all')) {
          gs.enabledBotsAll = true
          gs.enabledBots = []
        } else {
          gs.enabledBotsAll = false
        }
        // 提取单连接设置
        const server = (Array.isArray(gs.servers) && gs.servers.length > 0) ? gs.servers[0] : {}
        gs.serversName = server.name || ''
        gs.serversAddress = server.address || ''
        gs.serversReconnectInterval = server.reconnectInterval ?? 5
        gs.serversMaxReconnectAttempts = server.maxReconnectAttempts ?? 0
        gs.serversAccessToken = server.accessToken || ''
        return { gs }
      },
      // 设置配置的方法（前端点确定后调用的方法）
      setConfigData(data, { Result }) {
        let config = Config.getCfg()
        // 合并 enabledBotsAll + enabledBots → 写入 enabledBots
        if ('gs.enabledBotsAll' in data || 'gs.enabledBots' in data) {
          const all = data['gs.enabledBotsAll'] ?? config.enabledBots?.includes?.('all')
          const bots = data['gs.enabledBots'] ?? (config.enabledBots?.filter?.(b => b !== 'all') || [])
          const merged = all ? ['all'] : (Array.isArray(bots) ? bots : [])
          if (!lodash.isEqual(config.enabledBots || [], merged)) {
            Config.modify('gs-config', 'enabledBots', merged)
          }
          delete data['gs.enabledBotsAll']
          delete data['gs.enabledBots']
        }
        // 合并单连接字段 → 写入 servers[0]
        if ('gs.serversName' in data || 'gs.serversAddress' in data || 'gs.serversReconnectInterval' in data || 'gs.serversMaxReconnectAttempts' in data || 'gs.serversAccessToken' in data) {
          const oldServer = (Array.isArray(config.servers) && config.servers.length > 0) ? config.servers[0] : {}
          const newServer = {
            name: data['gs.serversName'] ?? oldServer.name ?? '',
            address: data['gs.serversAddress'] ?? oldServer.address ?? '',
            enabled: true,
            reconnectInterval: Number(data['gs.serversReconnectInterval'] ?? oldServer.reconnectInterval ?? 5),
            maxReconnectAttempts: Number(data['gs.serversMaxReconnectAttempts'] ?? oldServer.maxReconnectAttempts ?? 0),
            accessToken: data['gs.serversAccessToken'] ?? oldServer.accessToken ?? ''
          }
          if (!lodash.isEqual(config.servers?.[0], newServer)) {
            Config.modify('gs-config', 'servers', [newServer])
          }
          delete data['gs.serversName']
          delete data['gs.serversAddress']
          delete data['gs.serversReconnectInterval']
          delete data['gs.serversMaxReconnectAttempts']
          delete data['gs.serversAccessToken']
        }
        for (const key in data) {
          let split = key.split('.')
          if (key === 'gs.gsuidBotPrefixList') {
            const list = Array.isArray(data[key]) ? data[key] : []
            const map = {}
            for (const item of list) {
              const self_id = String(item?.self_id || '').trim()
              const prefix = String(item?.prefix || '')
              const skipIfHasPrefix = typeof item?.skipIfHasPrefix === 'boolean' ? item.skipIfHasPrefix : true
              const noPrefixCommands = Array.isArray(item?.noPrefixCommands)
                ? item.noPrefixCommands.map(cmd => String(cmd || '').trim()).filter(Boolean)
                : []
              if (!self_id || !prefix) continue
              map[self_id] = {
                prefix,
                skipIfHasPrefix,
                noPrefixCommands
              }
            }
            if (!lodash.isEqual(config.gsuidBotPrefix || {}, map)) {
              Config.modify('gs-config', 'gsuidBotPrefix', map)
            }
            continue
          }
          if (lodash.isEqual(config[split[1]], data[key])) continue
          Config.modify('gs-config', split[1], data[key])
        }
        return Result.ok({}, '保存成功~')
      },
    },
  }
}