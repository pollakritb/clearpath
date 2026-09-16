# Production backlog and dependency map

The task IDs in
`docs/superpowers/plans/2026-09-16-clearpath-production-completion-plan.md` are
the canonical backlog. Checkboxes in that file are authoritative; this file
defines ordering and ownership so independent work cannot bypass a safety gate.

## Dependency map

| Phase | Task families                                                   | Depends on                                   | Completion authority                                            |
| ----- | --------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| 0     | `CP-BASE-*`                                                     | None                                         | AI prepares evidence; user names accountable owners             |
| 1     | `CP-SEC-*`, `CP-CI-*`                                           | Phase 0 identity                             | Automated checks plus production verification                   |
| 2     | `CP-DATA-*`                                                     | Phase 1 green                                | Automated checks plus live scheduler evidence                   |
| 3     | `CP-TEST-*`                                                     | Stable contracts from Phase 2                | Automated test evidence                                         |
| 4     | `CP-AUTH-*`                                                     | Phases 1–3                                   | Shared; real Google/Supabase owner access required              |
| 5     | `CP-REPORT-*`, `CP-OCR-*`, `CP-MOD-*`                           | Auth and private storage                     | Shared; real device/OCR evidence required                       |
| 6     | `CP-COMM-*`, `CP-TRUST-*`, `CP-GAP-*`, `CP-GRAT-*`, `CP-PRIV-*` | Approved reports from Phase 5                | Shared; field trial and privacy approval required               |
| 7     | `CP-NOTI-*`, `CP-LINE-*`, `CP-PUSH-*`                           | Auth, preferences, consent                   | Shared; owner credentials and device delivery required          |
| 8     | `CP-ADMIN-*`                                                    | Phases 4–7                                   | Automated E2E plus named-role acceptance                        |
| 9     | `CP-FCAST-EXT-*`, `CP-FCAST-SURF-*`                             | Fresh station data and provider snapshots    | Shared; licensing remains human-owned                           |
| 10    | `CP-FIRE-*`                                                     | Notification and operations paths            | Automated fixtures plus a live positive-event drill             |
| 11    | `CP-UX-*`, `CP-A11Y-*`, `CP-DEVICE-*`, `CP-PERF-*`              | Stable user flows                            | Automated browser checks plus real-device checks                |
| 12    | `CP-OPS-*`                                                      | Stable production behavior                   | Shared; dashboard quotas and restore drill require owner access |
| 13    | `CP-SEC-1*`, `CP-PRIV-1*`                                       | Final contracts/data flows                   | Automated review plus accountable security/privacy approval     |
| 14    | `CP-LEGAL-*`, `CP-HEALTH-*`, `CP-PILOT-*`                       | Phases 1–13                                  | Human approval and invite-only pilot evidence                   |
| 15    | `CP-ML-*`                                                       | At least six months/multiple seasons of data | Human model release decision; keep runtime gate closed          |

## Scheduling rules

1. P0/P1 defects pre-empt feature work.
2. A task may start only when its contract, fixtures, rollback, and privacy
   impact are known.
3. AI-completable work includes code, tests, non-secret inventories, runbooks,
   and read-only verification.
4. Human-required work remains unchecked and explicitly names the missing
   owner, account action, physical device, elapsed observation window, legal
   decision, or field evidence.
5. No task is marked complete from UI appearance alone. It needs a repeatable
   command, immutable run URL, or signed human decision as applicable.

## Human-owned blockers

These categories cannot be approved by an AI agent:

- accountable owner names and backups (`CP-BASE-004`);
- Google/Supabase consent and real-account acceptance (`CP-AUTH-*`);
- real iPhone/Android camera, GPS, Web Push, VoiceOver, and TalkBack checks;
- LINE real-message delivery and account mismatch checks;
- provider licences, DPA/vendor, health-copy, privacy, and terms approvals;
- restore drill on an isolated owner-controlled project;
- field trials, public pilot, observation windows, and ML promotion decisions.

All other safe work proceeds in dependency order without waiting for those
approvals. A blocked human gate must not be replaced with mock evidence.
