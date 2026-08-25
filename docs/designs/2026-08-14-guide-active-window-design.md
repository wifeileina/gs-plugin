---
design_type: feature
created_at: 2026-08-14
---

## Intent Contract
intent: Replace unreliable guide author-image aggregation with command-driven QQBot active delivery.
constraints: Modify only gs-plugin; preserve GSUID passive replies, Legacy behavior, QQBot global raw settings, and non-QQBot behavior; do not run tests or browser UI validation.
success_criteria: With active sending enabled, matching mode off actively sends all QQBot group replies; matching mode on actively sends only replies in the same bot and group session for 60 seconds after an incoming command ending in 攻略.
risk_level: medium

## Verification Contract
verify_steps:
  - check: inspect configuration normalization and both configuration surfaces for only the master and matching switches.
  - check: inspect incoming-message and Core-reply paths to confirm they share the same normalized bot/session key.
  - confirm: no guide aggregation, image waiting, timeout, group rule, or default-mode path remains.

## Governance Contract
approval_gates: [Confirmed behavior semantics]
rollback: Restore the previous gs-plugin revisions if active-message delivery causes regressions.
ownership: User controls runtime configuration and production deployment.

## Scope
| Area | Included |
| --- | --- |
| Active delivery | Global master switch and optional suffix-matched 60-second session window |
| Incoming commands | Mark QQBot group sessions for commands whose normalized text ends in 攻略 |
| Message dispatch | Use the active window to choose active versus existing passive replies |
| Configuration | Simplify YAML, Guoba, and WebAdapter to two active-message switches |
| Removed behavior | Guide author/image aggregation, timeout handling, default send mode, and bot/group rules |

## Decisions
| Decision | Choice | Rejected alternatives |
| --- | --- | --- |
| Activation key | Normalized bot ID plus normalized group/session ID | Global activation that leaks across groups or bots |
| Activation duration | 60 seconds from the accepted incoming command | Inferring guide output from Core response content |
| Matching mode on | Only active-send replies associated with a live 攻略 command window | Author text and image sequence detection |
| Matching mode off | Master switch actively sends all QQBot group replies | Requiring per-bot/per-group rule configuration |
| Expiration | Lazy expiration on lookup | Per-session timers that add cleanup races |

## Surface
`components/MessageBuild.js` retains normalized configuration and gains the small session-window helpers; guide aggregation exports are removed.

`apps/message/message.js` detects a QQBot group command ending in 攻略 after normal request eligibility checks and marks the one-minute window before reporting to GSUID Core.

`components/Client.js` resolves active delivery from the two switches and the matching window, without inspecting guide-author or image reply content.

`config/default_config/gs-config.yaml`, `guoba.support.js`, and `webadapter/page.html` expose only `forceActiveMessage.enabled` and `forceActiveMessage.matchingMode`.

## Risks & Open Questions
A reply that reaches GSUID Core after the window expires will correctly fall back to passive sending when matching mode is enabled. Direct messages remain outside active group delivery. Existing user configuration is normalized into the new shape, so obsolete settings are ignored rather than relied upon.