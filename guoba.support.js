import lodash from 'lodash'
import { Config, getBotList } from './components/index.js'

function parseAddress(address) {
  const match = String(address || '').match(/^(wss?):\/\/([^:/]+):(\d+)(\/.*)?$/)
  if (match) return { protocol: match[1], host: match[2], port: Number(match[3]), path: match[4] || '/ws/yunzai' }
  return { protocol: 'ws', host: '127.0.0.1', port: 8765, path: '/ws/yunzai' }
}

function buildAddress({ protocol, host, port, path }) {
  const safeProtocol = protocol === 'wss' ? 'wss' : 'ws'
  const safeHost = String(host || '127.0.0.1').trim()
  const safePort = Number(port) || 8765
  let safePath = String(path || '/ws/yunzai').trim()
  if (!safePath.startsWith('/')) safePath = `/${safePath}`
  return `${safeProtocol}://${safeHost}:${safePort}${safePath}`
}

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
      // 配置项 schemas（使用 SOFT_GROUP_BEGIN 实现 Tab 分页）
      schemas: [
        // ── Tab: 核心连接 ──
        {
          component: 'SOFT_GROUP_BEGIN',
          label: '核心连接'
        },
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
          field: 'gs.serversList',
          label: '连接列表',
          bottomHelpMessage: '支持多个 GS 连接；完整地址会保存为 协议://IP:端口/路径，例如 ws://127.0.0.1:8765/ws/yunzai',
          component: 'GSubForm',
          componentProps: {
            multiple: true,
            schemas: [
              {
                field: 'name',
                label: '连接名字',
                component: 'Input',
                required: true
              },
              {
                field: 'protocol',
                label: '协议',
                component: 'Select',
                required: true,
                componentProps: {
                  options: [
                    { label: 'ws', value: 'ws' },
                    { label: 'wss', value: 'wss' }
                  ]
                }
              },
              {
                field: 'host',
                label: '连接地址',
                component: 'Input',
                required: true,
                componentProps: {
                  placeholder: '127.0.0.1'
                }
              },
              {
                field: 'port',
                label: '服务端口',
                component: 'InputNumber',
                required: true,
                componentProps: {
                  min: 1,
                  max: 65535,
                  placeholder: '8765'
                }
              },
              {
                field: 'path',
                label: '连接路径',
                bottomHelpMessage: '例如 /ws/yunzai，可按 bot 或服务端配置填写不同路径',
                component: 'Input',
                required: true,
                componentProps: {
                  placeholder: '/ws/yunzai'
                }
              },
              {
                field: 'enabled',
                label: '启用连接',
                component: 'Switch',
                componentProps: {
                  defaultValue: false
                }
              },
              {
                field: 'reconnectInterval',
                label: '重连间隔',
                component: 'InputNumber',
                required: true,
                componentProps: {
                  addonAfter: '秒'
                }
              },
              {
                field: 'maxReconnectAttempts',
                label: '最大连接次数',
                bottomHelpMessage: '0 为无限制',
                component: 'InputNumber',
                required: true,
                componentProps: {
                  addonAfter: '次'
                }
              },
              {
                field: 'enabledBotsAll',
                label: '转发全部BOT',
                bottomHelpMessage: '开启后转发所有BOT的消息，无需手动指定',
                component: 'Switch'
              },
              {
                field: 'enabledBots',
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
                field: 'accessToken',
                label: '鉴权Token',
                bottomHelpMessage: 'GS 服务需要鉴权时填写',
                component: 'Input'
              }
            ]
          }
        },
        // ── Tab: 消息规则 ──
        {
          component: 'SOFT_GROUP_BEGIN',
          label: '消息规则'
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
        // ── Tab: 前缀设置 ──
        {
          component: 'SOFT_GROUP_BEGIN',
          label: '前缀设置'
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
          field: 'gs.gsuidPrefixIgnore',
          label: '前缀忽略',
          bottomHelpMessage: '上报GS前，忽略/剥离消息开头的这些前缀。例如配置 "/" 后，收到 "/ww帮助" 会上报为 "ww帮助"。',
          component: 'Select',
          componentProps: {
            allowClear: true,
            mode: 'tags',
            options: []
          }
        },
        // ── Tab: 消息构造 ──
        {
          component: 'SOFT_GROUP_BEGIN',
          label: '消息构造'
        },
        {
          component: 'Divider',
          label: 'Legacy 模式'
        },
        {
          field: 'gs.messageBuildLegacyReplyEnabled',
          label: '启用 Legacy',
          bottomHelpMessage: '仅对 GSUID 回包使用旧版发送方式，不改变 QQBot 的全局 raw 配置',
          component: 'Switch',
        },
        {
          field: 'gs.messageBuildLegacyReplyGroups',
          label: '生效群聊',
          bottomHelpMessage: '留空=所有群聊生效；私聊不受此限制',
          component: 'GSelectGroup',
          componentProps: {
            allowAdd: true,
            allowDel: true,
            mode: 'multiple',
            options: groupList
          }
        },
        {
          field: 'gs.messageBuildLegacyReplyBots',
          label: '生效机器人',
          bottomHelpMessage: '留空=所有机器人生效',
          component: 'Select',
          componentProps: {
            mode: 'multiple',
            options: botList,
            placeholder: '请选择生效的机器人'
          }
        },
        {
          component: 'Divider',
          label: '强制主动消息'
        },
        {
          field: 'gs.messageBuildForceActiveEnabled',
          label: '启用强制主动消息',
          bottomHelpMessage: '启用后，不做权限探测，对所有 QQBot 群聊生效。',
          component: 'Switch'
        },
        {
          field: 'gs.messageBuildForceActiveMatchingMode',
          label: '匹配模式',
          bottomHelpMessage: '关闭时所有回包主动发送；开启时，仅在收到末尾为“攻略”的指令后，当前会话 60 秒内主动发送。',
          component: 'Switch'
        },
        // ── Tab: 高级设置 ──
        {
          component: 'SOFT_GROUP_BEGIN',
          label: '高级设置'
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
        gs.gsuidPrefixIgnore = Array.isArray(gs.gsuidPrefixIgnore) ? gs.gsuidPrefixIgnore : []
        // 确保 pluginEnabled 有默认值
        if (gs.pluginEnabled === undefined) gs.pluginEnabled = false
        const messageBuild = Config.messageBuild
        gs.messageBuildLegacyReplyEnabled = messageBuild.legacyReply.enabled
        gs.messageBuildLegacyReplyGroups = messageBuild.legacyReply.groups
        gs.messageBuildLegacyReplyBots = messageBuild.legacyReply.bots
        gs.messageBuildForceActiveEnabled = messageBuild.forceActiveMessage.enabled
        gs.messageBuildForceActiveMatchingMode = messageBuild.forceActiveMessage.matchingMode === true
        const fallbackEnabledBots = Array.isArray(gs.enabledBots) && gs.enabledBots.length > 0 ? gs.enabledBots : ['all']
        // 提取多连接设置
        gs.serversList = (Array.isArray(gs.servers) ? gs.servers : []).map(server => {
          const addr = parseAddress(server.address || '')
          const enabledBots = Array.isArray(server.enabledBots) ? server.enabledBots : fallbackEnabledBots
          return {
            name: server.name || '',
            protocol: addr.protocol,
            host: addr.host,
            port: addr.port,
            path: addr.path,
            enabled: server.enabled === true,
            enabledBotsAll: enabledBots.includes('all'),
            enabledBots: enabledBots.includes('all') ? [] : enabledBots,
            reconnectInterval: server.reconnectInterval ?? 5,
            maxReconnectAttempts: server.maxReconnectAttempts ?? 0,
            accessToken: server.accessToken || ''
          }
        })
        return { gs }
      },
      // 设置配置的方法（前端点确定后调用的方法）
      setConfigData(data, { Result }) {
        let config = Config.getCfg()
        // 合并多连接字段 → 写入 servers
        if ('gs.serversList' in data) {
          const list = Array.isArray(data['gs.serversList']) ? data['gs.serversList'] : []
          const servers = list.map(item => {
            const enabledBots = item?.enabledBotsAll ? ['all'] : (Array.isArray(item?.enabledBots) ? item.enabledBots : [])
            return {
              name: String(item?.name || '').trim(),
              address: buildAddress({
                protocol: item?.protocol,
                host: item?.host,
                port: item?.port,
                path: item?.path
              }),
              enabled: item?.enabled === true,
              enabledBots,
              reconnectInterval: Number(item?.reconnectInterval ?? 5) || 5,
              maxReconnectAttempts: Number(item?.maxReconnectAttempts ?? 0) || 0,
              accessToken: String(item?.accessToken || '')
            }
          }).filter(server => server.name && server.address)
          if (!lodash.isEqual(config.servers || [], servers)) {
            Config.modify('gs-config', 'servers', servers)
          }
          delete data['gs.serversList']
        }
        if ('gs.enabledBotsAll' in data || 'gs.enabledBots' in data) {
          delete data['gs.enabledBotsAll']
          delete data['gs.enabledBots']
        }
        // 收集消息构造表单字段，合并为 messageBuild 对象后写入
        const messageBuildKeys = [
          'gs.messageBuildLegacyReplyEnabled',
          'gs.messageBuildLegacyReplyGroups',
          'gs.messageBuildLegacyReplyBots',
          'gs.messageBuildForceActiveEnabled',
          'gs.messageBuildForceActiveMatchingMode'
        ]
        if (messageBuildKeys.some(key => key in data)) {
          const current = Config.messageBuild
          const next = {
            legacyReply: {
              enabled: 'gs.messageBuildLegacyReplyEnabled' in data
                ? data['gs.messageBuildLegacyReplyEnabled'] === true
                : current.legacyReply.enabled,
              groups: 'gs.messageBuildLegacyReplyGroups' in data
                ? (Array.isArray(data['gs.messageBuildLegacyReplyGroups']) ? data['gs.messageBuildLegacyReplyGroups'].map(String) : [])
                : current.legacyReply.groups,
              bots: 'gs.messageBuildLegacyReplyBots' in data
                ? (Array.isArray(data['gs.messageBuildLegacyReplyBots']) ? data['gs.messageBuildLegacyReplyBots'].map(String) : [])
                : current.legacyReply.bots
            },
            forceActiveMessage: {
              enabled: 'gs.messageBuildForceActiveEnabled' in data
                ? data['gs.messageBuildForceActiveEnabled'] === true
                : current.forceActiveMessage.enabled,
              matchingMode: 'gs.messageBuildForceActiveMatchingMode' in data
                ? data['gs.messageBuildForceActiveMatchingMode'] === true
                : current.forceActiveMessage.matchingMode === true
            }
          }
          if (!lodash.isEqual(config.messageBuild, next)) {
            Config.modify('gs-config', 'messageBuild', next)
          }
          for (const key of messageBuildKeys) delete data[key]
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