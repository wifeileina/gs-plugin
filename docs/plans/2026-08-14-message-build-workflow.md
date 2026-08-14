---
intent: Provide opt-in QQBot message construction for GSUID Core replies, including per-bot/per-group active-send routing, legacy rendering, and guide author-image aggregation.
success_criteria: Configured groups can use all or guide active sends, guide author text waits up to 10 seconds for a following image, and all other replies keep their existing send path.
risk_level: medium
auto_approve: true
worktree: host
dirty_worktree: allow
---

## Steps

- [x] **Step 1: Add behavior tests**
action: Add a focused Node test file for normalized messageBuild configuration, force-active rule selection, guide aggregation, and timeout fallback without importing the live bot runtime.
loop: false
max_iterations: 1
verify: node --test tests/message-build.test.js
status: Test file added. Execution remains pending because the current host has no callable Node runtime.

- [x] **Step 2: Implement message-build module**
action: Create the isolated message-build module that normalizes legacy configuration, matches explicit QQBot active rules, detects guide author text, merges the next image, and emits timed-out author text.
loop: until focused tests pass
max_iterations: 3
verify: node --test tests/message-build.test.js
status: Implemented in components/MessageBuild.js. Runtime verification remains pending.

- [x] **Step 3: Wire reply delivery**
action: Refactor Client.js to route converted Core replies through the new module, keep unmatched replies passive, and use explicit active delivery only for configured QQBot group rules.
loop: until focused tests pass
max_iterations: 3
verify: node --test tests/message-build.test.js
status: Implemented in components/Client.js. Legacy active-send failures now fall back to standard active sending.

- [x] **Step 4: Expose configuration**
action: Add normalized messageBuild defaults and user configuration, then expose its legacy, aggregation, and active-rule fields in Guoba and WebAdapter.
loop: false
max_iterations: 1
verify: node --check components/Config.js
status: Implemented. WebAdapter normalizes messageBuild before writing.

- [ ] **Step 5: Validate integration**
action: Review changed files for compatibility with top-level legacyReply, verify YAML parsing and test coverage, and report the required real QQBot group checks.
loop: until all focused checks pass
max_iterations: 3
verify: node --test tests/message-build.test.js
status: Static review completed; runtime and real QQBot group checks remain blocked on the Yunzai host environment.
