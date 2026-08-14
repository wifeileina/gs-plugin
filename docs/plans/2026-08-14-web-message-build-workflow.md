---
intent: 为 WebAdapter 增加群聊列表选择器和完整的 QQBot 消息构造配置。
success_criteria: 管理员可从已加载的群聊中选择黑白名单群聊，在 Web 页面配置 messageBuild 的 Legacy、主动消息规则和攻略聚合，并保存为与现有后端兼容的规范化配置。
risk_level: low
auto_approve: true
worktree: host
---

## Steps

- [x] **Step 1: 定义 Web 配置行为**
action: 核对 webadapter/page.html 和 webadapter/index.js，确认黑白名单支持已选群聊与手工 ID；messageBuild 使用 legacyReply、forceActiveMessage 和 guideMerge；主动规则中的多选群聊保存时展开为单 bot、单群规则。
loop: false
max_iterations: 1
verify:
  type: artifact
  path: webadapter/page.html
  assert:
    kind: exists

- [ ] **Step 2: 添加聚焦的 UI 行为检查**
action: 在可执行 JavaScript 的 Yunzai 环境中运行现有消息构造测试，并补充页面静态断言，覆盖规则展开与群聊、机器人选择控件。
loop: false
max_iterations: 1
verify: node --test tests/message-build.test.js

- [x] **Step 3: 实现复用的群聊选择控件**
action: 修改 webadapter/page.html，使黑名单和白名单通过已加载群聊列表多选，保留手工 target ID 输入，并保持脏状态追踪。
loop: false
max_iterations: 1
verify:
  type: artifact
  path: webadapter/page.html
  assert:
    kind: exists

- [x] **Step 4: 实现消息构造面板**
action: 修改 webadapter/page.html，新增消息构造导航和面板，包含 Legacy 回复的群聊与机器人选择器、主动消息总开关及 bot/群聊/范围规则、攻略图文聚合开关和超时。
loop: false
max_iterations: 1
verify:
  type: artifact
  path: webadapter/page.html
  assert:
    kind: exists

- [x] **Step 5: 保存和回显 messageBuild**
action: 修改页面配置加载与 buildConfigBody，使新控件读取 messageBuild、保存规范化 messageBuild，并将多选群聊展开为后端要求的单 bot/单群/模式规则。
loop: false
max_iterations: 1
verify:
  type: artifact
  path: webadapter/page.html
  assert:
    kind: exists

- [x] **Step 6: 更新设计说明**
action: 更新 docs/designs/2026-08-14-message-build-design.md，明确 WebAdapter 页面具备消息构造与列表选择器。
loop: false
max_iterations: 1
verify:
  type: artifact
  path: docs/designs/2026-08-14-message-build-design.md
  assert:
    kind: exists

- [ ] **Step 7: 复核行为与范围**
action: 检查最终改动，确认仅修改 gs-plugin；在 WebAdapter 页面验证黑白名单选择、Legacy 回显、主动规则的 bot/群聊/范围选择、保存及重新加载。
loop: false
max_iterations: 1
verify:
  type: human-review
  check: 确认页面提供黑白名单群聊选择、主动规则机器人与群聊选择，且没有修改 gs-plugin 以外文件。
