# Mobile helper areas and first-request introduction

The request is saved before any introduction is shown. Guests, failed requests, and deployments without registered helper areas
are not prompted. Accounts with saved helper areas still receive their first
introduction, with copy and an action for managing existing areas. Looking at an introduction never enables receiving or samples GPS.

- Set up now opens `/settings/helper-areas?request=<id>`. Back explicitly returns
  to that request's detail, including when the request has already ended.
- Remind in three days, Close and Escape snooze the introduction. On the next map
  visit after three days it is offered again unless the introduction has been permanently dismissed or setup was chosen.
- Never show again suppresses this introduction. Settings remain accessible under
  Settings → Notifications.
- The preference is stored per account in local browser storage. It does not sync
  between devices. Session memory is the fallback when storage is unavailable.
- Receiving is opt-in when the user saves the first area. Master pause preserves
  saved places and their individual selections. Each area may be paused, edited
  or deleted with confirmation, with a maximum of two saved areas.
- New areas use POST to create. A retry after a successful create reuses the
  returned slot with PATCH; new areas must never PATCH a slot that does not exist.

Verification: `e2e/helper-area-onboarding.spec.ts` runs the mobile intro/setup,
return, switches, editing, map/search Back, keep/delete, error/retry and snooze
paths on 320/360/390/430px. It uses demo authentication and mocked helper APIs.
No production writes or LINE sends are part of these browser checks.

## Map picker and privacy

Saved helper areas are no longer rendered as markers on the main map. The icon
selector is removed; the existing API metadata remains compatible. Receiving
still uses the saved private coordinates. Manage these areas from settings.

The helper editor reuses the request center picker and locate control, without
any radius circle. The SVG and its anchor have the same compact size. No point
is chosen merely by opening the country view: the user must search, pan or
explicitly locate themselves before confirming. GPS errors leave search usable;
late GPS callbacks after closing the picker are ignored.

Browser coverage: `e2e/helper-area-picker.spec.ts`. Optional real HTTP/backend
coverage: `e2e/helper-area-backend.spec.ts`, with isolated local demo mode,
`MEASUREMENT_REGISTERED_LOCATIONS_ENABLED=true` and
`RUN_HELPER_BACKEND_INTEGRATION=true`. This checks creation, editing, deletion
and persisted coordinates through the actual frontend/backend contract.
