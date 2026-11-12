# Mobile helper areas and first-request introduction

The request is saved before any introduction is shown. Guests, failed requests,
accounts with saved helper areas, and deployments without registered helper areas
are not prompted. Looking at an introduction never enables receiving or samples GPS.

- Set up now opens `/settings/helper-areas?request=<id>`. Back explicitly returns
  to that request's detail, including when the request has already ended.
- Remind in three days, Close and Escape snooze the introduction. On the next map
  visit after three days it is offered again if no area has been saved.
- Never show again suppresses this introduction. Settings remain accessible under
  Settings → Notifications.
- The preference is stored per account in local browser storage. It does not sync
  between devices. Session memory is the fallback when storage is unavailable.
- Receiving is opt-in when the user saves the first area. Master pause preserves
  saved places and their individual selections. Each area may be paused, edited
  or deleted with confirmation, with a maximum of two saved areas.
- First-save retries use an explicit slot to avoid adding a second area when
  saving succeeded but the following enable/refresh operation failed.

Verification: `e2e/helper-area-onboarding.spec.ts` runs the mobile intro/setup,
return, switches, editing, map/search Back, keep/delete, error/retry and snooze
paths on 320/360/390/430px. It uses demo authentication and mocked helper APIs.
No production writes or LINE sends are part of these browser checks.
