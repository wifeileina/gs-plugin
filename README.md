# gs-plugin

> GS（GScore）连接适配器插件，用于 TRSS-Yunzai Bot 与 GS 核心服务之间的消息转发。纯ai，无人工，hh
> > 基于 [小叶](https://gitee.com/xiaoye12123/ws-plugin) 的插件修改

## 功能

- 将 Bot 收到的消息（文字、图片、文件、引用、at 等）上报给 GS 核心
- 接收 GS 核心下发的回复消息，并通过 Bot 发送回对应平台
- 支持多协议适配：OneBot、QQBot、QQGuild、KOOK、Telegram、Discord 等（可能吧，其实只支持yunzai和qqbot）
- 自动处理引用消息中的图片提取
- 配置文件热更新，无需重启
- 支持 **锅巴面板** 可视化配置

## 安装

将 `gs-plugin` 文件夹放入 `TRSS-Yunzai/plugins/` 目录下：

```
TRSS-Yunzai/
└── plugins/
    └── gs-plugin/
        ├── index.js
        ├── components/
        ├── model/
        ├── apps/
        └── config/
```

重启 Bot 即可自动加载插件。

## 说明（安装锅巴插件填写即可）
<details><summary>配置 </summary>

    看不懂看不懂

首次启动后，插件会在 `plugins/gs-plugin/config/config/` 下生成 `gs-config.yaml`，默认内容与 `config/default_config/gs-config.yaml` 相同。

### 完整配置项

```yaml
# ── 连接服务列表 ──
servers:
  - name: ktxy          # 连接名称（必须唯一）依旧暗藏
    address: ws://127.0.0.1:8765/ws   # GS 服务地址
    reconnectInterval: 5   # 重连间隔（秒）
    maxReconnectAttempts: 0 # 最大重连次数，0 为无限

# ── 消息过滤 ──
noMsgStart: []             # 不转发的消息前缀列表
noMsgInclude: []           # 不转发的消息包含内容列表
noGroup: []                # 插件黑名单群
yesGroup: []               # 插件白名单群（设置后仅白名单群上报）
muteStop: false            # 禁言时不转发

# ── 仅艾特/前缀 ──
ignoreOnlyReplyAt: false   # 忽略仅艾特/前缀限制
onlyReplyAt:
  enable: false            # 是否开启仅艾特才上报
  prefix: []               # 额外前缀列表

# ── GS 前缀配置 ──
# 按 bot 账号为消息添加前缀，用于 GS 多 Bot 路由
gsuidBotPrefix:
  "你的Bot账号":
    prefix: "cmd"          # 前缀内容
    skipIfHasPrefix: true  # 已有前缀时跳过（默认 true）
    noPrefixCommands:      # 不加前缀的命令白名单
      - "扫码登陆"

# ── 通知主人 ──
disconnectToMaster: false   # 断开时通知主人
reconnectToMaster: false    # 重连成功时通知主人
firstconnectToMaster: false # 首次连接成功时通知主人
howToMaster: 0              # 0=通知所有主人, >0=通知指定序号

# ── 其他 ──
msgStoreTime: 300           # 消息存储时间（秒），0=不存储
tempMsgReport: false        # 是否上报临时会话
taskQueue: 0                # 数据库同步锁（0=关闭）
```

### 配置示例

**连接本地 GS 服务：**
```yaml
servers:
  - name: 本地GS
    address: ws://127.0.0.1:8765/ws
    reconnectInterval: 5
    maxReconnectAttempts: 0
```

**连接远程 GS 服务（带 Token）：**
```yaml
servers:
  - name: 远程GS
    address: ws://example.com:443/ws
    accessToken: your_token_here
    reconnectInterval: 10
    maxReconnectAttempts: 5
```

**配置多个连接：**
```yaml
servers:
  - name: ktxy
    address: ws://192.168.1.100:8765/ws
    reconnectInterval: 5
    maxReconnectAttempts: 0
  - name: dny
    address: ws://192.168.1.101:8765/ws
    reconnectInterval: 5
    maxReconnectAttempts: 0
```

**多 Bot 前缀路由：**
```yaml
gsuidBotPrefix:
  "123456789":
    prefix: "bot1"
  "987654321":
    prefix: "bot2"
    skipIfHasPrefix: false
```
</details>

## 日志
<details><summary>真的有必要写吗</summary>

所有日志前缀为 `[gs-plugin]`，可通过日志级别过滤：

- `MARK` — 连接成功
- `WARN` — 连接断开、重连
- `ERROR` — 连接失败、消息处理错误
- `DEBUG` — 引用消息提取、文件注入等调试信息

</details>

## 文件结构

<details><summary>谁看这个</summary>

```
gs-plugin/
├── index.js                    # 入口
├── components/
│   ├── Config.js               # 配置管理
│   ├── Client.js               # GS WebSocket 客户端
│   └── WebSocket.js            # 连接生命周期
├── model/
│   ├── makeMsg.js              # GS 消息格式转换
│   ├── DataBase.js             # 消息 ID 映射
│   └── db/                     # SQLite 数据库
├── apps/message/message.js     # 消息路由
└── config/
    ├── default_config/         # 默认配置
    └── config/                 # 用户配置（运行时生成）
```
</details>


## 常见问题？

/
