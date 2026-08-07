# Vendor and data-provider inventory

Status: **prepared for owner/legal review; not approved**
Last source review: 2026-08-03

This register is derived from the deployed source and environment contract. It
does not establish a lawful basis, sign a DPA, decide cross-border transfer
requirements or replace qualified Thai privacy counsel.

| Service                                                          | Role in ClearPath                               | Data exposed or stored                                                  | Personal/private data risk                                                                              | Contract/source to review                                                                                                                  | Owner decision                            |
| ---------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Vercel                                                           | Hosts Next.js/FastAPI, cron and server logs     | HTTP metadata, aggregate operational logs, environment secrets          | IP/request metadata; application traffic may be customer data                                           | [DPA](https://vercel.com/legal/dpa), [privacy notice](https://vercel.com/legal/privacy-notice), subprocessor register linked from DPA      | Pending                                   |
| Supabase                                                         | PostgreSQL, Auth, private report images and API | Account email, reports, precise coordinates, private images, audit data | Primary private-data processor; highest application-data exposure                                       | [DPA](https://supabase.com/downloads/docs/Supabase%2BDPA%2B260601.pdf), [security controls](https://supabase.com/docs/guides/security)     | Pending                                   |
| OpenAI API (optional)                                            | OCR and evidence-quality signal                 | Private report image sent server-to-server; no browser key              | Image may contain display/context or incidental personal data                                           | [DPA](https://openai.com/policies/data-processing-addendum/), [subprocessor list](https://platform.openai.com/subprocessors)               | Pending; keep OCR disabled until accepted |
| OpenWeather                                                      | Current and forecast weather features           | Official station coordinates and API key                                | No community/user coordinates should be sent                                                            | [Terms](https://openweather.co.uk/terms), [privacy policy](https://openweather.co.uk/privacy-policy)                                       | Pending                                   |
| NASA FIRMS                                                       | Satellite hotspot-derived features              | Nakhon Pathom bounding box, requested date/source and MAP key           | No user data; hotspot is not a confirmed fire                                                           | [API documentation](https://firms.modaps.eosdis.nasa.gov/api/)                                                                             | Pending provider/attribution review       |
| Air4Thai / Pollution Control Department                          | Official PM2.5 source of truth                  | Public station identifiers, coordinates and observations                | No community/user data sent upstream                                                                    | [Air4Thai](http://air4thai.pcd.go.th/), [PCD](https://www.pcd.go.th/)                                                                      | Pending data-use/attribution review       |
| OpenStreetMap Foundation tile service                            | Browser map tiles                               | Browser IP, referrer and viewed tile coordinates                        | Tile requests can reveal approximate viewed area; no precise report coordinate may be embedded in a URL | [Tile usage policy](https://operations.osmfoundation.org/policies/tiles/), [privacy policy](https://osmfoundation.org/wiki/Privacy_Policy) | Pending usage/privacy review              |
| Browser push services (Apple/Google/Mozilla, endpoint-dependent) | Delivers Web Push notifications                 | Push endpoint, encrypted payload and delivery metadata                  | Endpoint is account/device-related data; payload must stay minimal                                      | Browser/platform terms chosen by the recipient endpoint                                                                                    | Pending; document supported platforms     |

## Required owner actions

1. Confirm controller/processor/independent-controller role for every row.
2. Record account/legal entity, plan tier, processing region and data residency.
3. Obtain the current DPA or document why no DPA is required.
4. Review subprocessors, cross-border transfer mechanism, breach notice,
   deletion/return, audit rights and change-notification process.
5. Confirm retention and support-log exposure against the ClearPath retention
   policy; prohibit support tickets from containing private images or secrets.
6. Decide whether OpenAI OCR and Web Push may be enabled. Disabled optional
   vendors remain in the inventory with status `not enabled`.
7. Record approver, approval date, reviewed document versions, open exceptions,
   expiry and next review date outside Git.
8. Only then set `security.vendor_inventory_complete` and
   `security.dpa_review_approved` in the private evidence file.

## Sign-off record

| Field                      | Value |
| -------------------------- | ----- |
| Privacy/legal approver     | TBD   |
| Security approver          | TBD   |
| Reviewed at (UTC)          | TBD   |
| Evidence/change-ticket ID  | TBD   |
| Open exceptions and expiry | TBD   |
| Next review date           | TBD   |
