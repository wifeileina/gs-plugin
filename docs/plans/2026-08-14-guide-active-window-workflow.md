---
intent: Replace guide aggregation with a command-triggered QQBot active-send window.
success_criteria: The two-switch configuration selects either global QQBot active sends or a 60-second per-session active window after a command ending in 攻略.
risk_level: medium
auto_approve: true
worktree: host
dirty_worktree: allow
---

## Steps

- [ ] **Step 1: Simplify active message state**
action: Update `components/MessageBuild.js` to normalize only `forceActiveMessage.enabled` and `forceActiveMessage.matchingMode`, remove guide aggregation and active rule helpers, and expose normalized bot/session window key, marking, and lookup helpers with lazy 60-second expiry.
loop: false
max_iterations: 1
verify:
  type: artifact
  path: components/MessageBuild.js
  assert:
    kind: exists

- [ ] **Step 2: Mark guide command windows**
action: Update `apps/message/message.js` so accepted QQBot group messages with normalized text ending in 攻略 mark their bot/group active window before the request is sent to GSUID Core.
loop: false
max_iterations: 1
verify:
  type: artifact
  path: apps/message/message.js
  assert:
    kind: exists

- [ ] **Step 3: Replace reply dispatch routing**
action: Update `components/Client.js` to remove author/image aggregation and dispatch every Core reply immediately, choosing active delivery for all QQBot groups when matching mode is off or for a live command window when it is on.
loop: false
max_iterations: 1
verify:
  type: artifact
  path: components/Client.js
  assert:
    kind: exists

- [ ] **Step 4: Reduce configuration surfaces**
action: Update `config/default_config/gs-config.yaml`, `guoba.support.js`, and `webadapter/page.html` so message construction exposes only the active-send master switch and matching-mode switch; remove guide merge, default mode, and bot/group rule UI and serialization.
loop: false
max_iterations: 1
verify:
  type: artifact
  path: config/default_config/gs-config.yaml
  assert:
    kind: exists

- [ ] **Step 5: Perform static change review**
action: Inspect the final diffs and search the gs-plugin source for obsolete guide aggregation and force-active rule references; do not run automated tests or browser validation per user instruction.
loop: false
max_iterations: 1
verify:
  type: artifact
  path: docs/designs/2026-08-14-guide-active-window-design.md
  assert:
    kind: exists
