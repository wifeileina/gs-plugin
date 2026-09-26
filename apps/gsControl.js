import { enableGSUid, disableGSUid } from '../components/WebSocket.js'

export class GsControl extends plugin {
  constructor () {
    super({
      name: 'gs连接控制',
      dsc: '#gs开启 #gs关闭',
      event: 'message',
      priority: 500,
      rule: [
        {
          reg: /^#gs开启$/i,
          fnc: 'enable',
          permission: 'master'
        },
        {
          reg: /^#gs关闭$/i,
          fnc: 'disable',
          permission: 'master'
        }
      ]
    })
  }

  async enable () {
    await enableGSUid()
    return this.reply('gs-plugin 已开启，正在连接 Core')
  }

  async disable () {
    disableGSUid()
    return this.reply('gs-plugin 已关闭，已断开与 Core 的连接')
  }
}