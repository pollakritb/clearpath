# Mobile UX/UI review — 7 November 2026

## Scope and changes

The map remains the primary surface. The shared bottom sheet now has a shorter handle area, a quieter close control with a 44×44 target, smaller title/reading scale and tighter spacing. The collapsed place summary prioritizes the name, PM2.5 reading and status. Source count/radius and history/forecast actions share a compact footer; actions retain a 44px minimum height. Redundant context and zero report counts are omitted. Station/source rows are denser while preserving labels and source values. Long collapsed place names clamp to two lines; expanded names remain available in full.

Expanded sheets now fit their actual header and content instead of unconditionally covering nearly the full map. Long or asynchronously loaded content is measured with ResizeObserver and remains scrollable within available space. Existing keyboard, drag, touch and visual-viewport handling stays intact. Keyboard focus on the handle is inset so it does not cross the heading.

Collapsed sheet content is hidden during size transitions so details cannot peek below the summary. A passive GPS fallback status no longer stacks above an open map sheet; explicit geolocation error alerts remain visible.

The two-kilometre search label now sits at the top inside the circle, keeping it within a 320px viewport. The circle outlines and dashed radius remain visible. This changes presentation only, not search distance or estimation rules.

The satellite-hotspot warning is visible in the collapsed summary. Its regression test now follows the actual peek/full state model and checks that expanded FRP details are reachable. No source classification or data algorithm changed.

At 320px, the camera/gallery buttons no longer leave the last word of “เลือกจากคลังภาพ” on its own line. Both retain their previous actions and usable target sizes.

## Visual evidence

Browser-reviewed at 320px and 390px: map summary, expanded place details, Today, report intake, news, settings and profile. Automated coverage also includes 360px and 430px, admin and offline states, enlarged text, forced contrast, long content, camera capture and request/search flows.

The final collapsed place fixture occupies approximately 150px at a 320px viewport; regression checks require it to remain at most 180px at all four widths. Short expanded content fits its actual size while longer details use the available height. Values and source rows shown in these screenshots are local fixtures, not production air-quality readings.

Final screenshots: `output/playwright/mobile-verified-summary-320.png` and `output/playwright/mobile-verified-expanded-320.png`; page reviews: `output/playwright/mobile-review-*-390.png`. These are generated review artifacts, not source assets. Testing used desktop Chromium at mobile viewport sizes, not physical iOS/Android devices or their native keyboard.

## Validation

- Frontend unit tests: 362 passed in 79 files. Configured coverage scope (tested libraries/hooks/auth, not the entire UI): 92.77% statements, 86.34% branches, 90.56% functions and 93.8% lines; thresholds passed.
- Backend: 515 passed; one existing Starlette TestClient deprecation warning.
- TypeScript, ESLint, Prettier, Ruff checks and Python format check passed.
- Full mobile E2E run: 213 passed, 6 intentional skips and 1 timing-sensitive geometry assertion failed across 320/360/390/430px. The assertion sampled two animated rectangles separately; it now polls their relative position in one DOM measurement. The complete place suite then passed all 16 cases. After the final radius/transition changes, the two affected flows passed all 8 cases across four widths, including label viewport bounds, compact height and touch targets. Every one of the 214 runnable cases has a passing result across the full run and targeted reruns; this is not a claim of a single clean full-suite rerun. Skips are duplicate viewport-specific scenarios (map persistence only at 390px, 200% text reflow only at 320px).
- Browser coverage includes map stations/history/reports/stacks, search and history, place sources/forecast/history, tab continuity, report capture/gallery/OCR submission and retries, notification/settings flows, profile contribution/trust, read-only admin, offline states, enlarged text and forced colors. Accessibility checks cover serious/critical Axe findings on eight pages.
- Mechanical design scan: no findings in the changed UI files.

Scope excludes deployment, backend/data modifications and unrelated pre-existing untracked `output/` and `vendor/` content. No production data or credentials were changed. Validation used the locally built app and isolated demo/route fixtures. Live OAuth, LINE delivery, production notifications, real-provider freshness and physical-device gestures remain outside this verification.
