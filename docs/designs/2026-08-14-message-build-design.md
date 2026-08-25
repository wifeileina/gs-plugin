---
design_type: feature
created_at: 2026-08-14
---

## Intent Contract
status: Superseded by `2026-08-14-guide-active-window-design.md`.

The earlier per-bot/per-group active-send routing and guide author-image aggregation design is no longer active.
constraints: Modify only files under gs-plugin; do not modify QQBot-Plugin or any other plugin; preserve global QQBot raw mode; do not probe active-message permissions outside configured bot/group rules; retain compatibility with existing top-level legacyReply configuration.
success_criteria: Configured groups can use all or guide active sends, guide author text waits up to 10 seconds for a following image, and all other replies keep their existing send path.
risk_level: medium

## Verification Contract
verify_steps:
  - run focused Node tests for rule matching, aggregation success, timeout fallback, and guide/all routing.
  - check YAML, Guoba, and WebAdapter all expose the same messageBuild structure.
  - confirm syntax checks pass where Node is available.

governance: Existing active-send behavior must be tested in a real configured QQBot group before enabling it broadly.
rollback: Disable messageBuild or remove a group rule; legacyReply remains readable from its former top-level location.
ownership: gs-plugin maintainer.

## Scope
| Area | Included |
| --- | --- |
| Configuration | messageBuild with legacyReply, forceActiveMessage rules, and guideMerge switch/timeout |
| GSUID replies | QQBot group-only aggregation and explicit active routing |
| Management | Guoba and WebAdapter read/write support |
| Compatibility | Fallback to existing reply/send APIs and former legacyReply key |
| Excluded | Every file outside gs-plugin, non-QQBot active-send probing, changes to Core payloads |

## Decisions
| # | Decision | Choice | Rejected alternatives |
| --- | --- | --- | --- |
| 1 | Active routing | Rules are an editable array of bot, group, and mode | Nested bot/group maps are difficult in the Guoba form |
| 2 | Aggregation state | Dedicated gs-plugin module keyed by bot and target | Stateful parsing inside makeMsg.js |
| 3 | Timeout | Author text sends after 10 seconds by default; late images are independent | Dropping author text or merging stale images |
| 4 | Legacy compatibility | Prefer messageBuild.legacyReply and read old top-level legacyReply as fallback | Breaking current user configuration |

## Surface
The configuration uses `messageBuild.legacyReply`, `messageBuild.forceActiveMessage`, and `messageBuild.guideMerge`. Active rules identify one QQBot account and one QQBot group target, with `all` applying to every Core reply and `guide` applying only to a successful aggregation.

A new message-build module owns pending author messages and makes route decisions. `Client.js` remains responsible for turning Core content into segments and dispatching the resolved message through passive or explicit active delivery.

Guoba and the WebAdapter page present this as a single tab named “消息构造”. The WebAdapter page exposes list-backed group selectors for legacy and active-message scope, a list-backed bot selector for each active-message rule, and guide aggregation controls. The page groups matching active rules for editing and expands each selected group into the normalized one-bot/one-group rule structure when saving.

## Risks & Open Questions
QQBot adapter internals for the legacy active-send path are not locally executable in the current environment, so runtime behavior must be checked in a configured group. Aggregation is intentionally limited to QQBot group replies to avoid changing private, channel, or non-QQBot delivery semantics.
