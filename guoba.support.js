import lodash from 'lodash'
import { Config } from './components/index.js'

// 支持锅巴
export function supportGuoba() {
  let groupList = Array.from(Bot.gl.values())
  groupList = groupList.map(item => item = { label: `${item.group_name}-${item.group_id}`, value: item.group_id })
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
          label: 'GS连接设置'
        },
        {
          field: 'gs.servers',
          label: '连接服务列表',
          component: 'GSubForm',
          componentProps: {
            multiple: true,
            schemas: [
              {
                field: 'name',
                label: '连接名字',
                bottomHelpMessage: '请保证每个名字都不相同,否则会出问题',
                component: 'Input',
                required: true
              },
              {
                field: 'address',
                label: '连接地址',
                bottomHelpMessage: 'GS 服务的 WebSocket 地址',
                component: 'Input',
                required: true
              },
              {
                field: 'uin',
                label: '绑定账号',
                bottomHelpMessage: '填写BOT账号(uin)则仅转发该BOT消息；不填或填 "all" 则转发所有BOT消息',
                component: 'Input',
                componentProps: {
                  placeholder: 'all'
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
                field: 'accessToken',
                label: '鉴权Token',
                bottomHelpMessage: 'GS 服务需要鉴权时填写',
                component: 'Input',
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
        return { gs }
      },
      // 设置配置的方法（前端点确定后调用的方法）
      setConfigData(data, { Result }) {
        let config = Config.getCfg()
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