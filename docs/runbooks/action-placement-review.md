# Mobile action placement review — 13 November 2026

The primary navigation owns general destinations. A contextual shortcut is kept
when it carries a selected place/request, recovers a failed task, or moves to a
different level of the current flow.

| Surface                                      | Decision                                                                                                                                                  | Remaining path                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Map layers                                   | Remove general Settings shortcut                                                                                                                          | Profile → Settings; layers retain data controls and the station list                                                |
| Community report pin                         | Remove “view this report in community” and network-station shortcut; both linked to `/community`, which now displays news rather than the selected report | The selected report retains its photo, evidence, author, reactions and comments; News remains in primary navigation |
| My reports                                   | Remove general Send report shortcut in the section header                                                                                                 | Primary navigation → Send report; rejected reports retain their contextual retake action                            |
| Admin overview                               | Remove Open report history button adjacent to the report-stat card doing the same thing                                                                   | Report-stat card and persistent Reports navigation still open the read-only report history                          |
| Selected place                               | Keep Ask for measurement here                                                                                                                             | Carries the selected place, unlike starting a general request                                                       |
| Measurement requests                         | Keep Track request and general New request in their respective contexts                                                                                   | Existing-request follow-up and new-request creation are different tasks                                             |
| Report failure                               | Keep retake/retry actions                                                                                                                                 | Recovery should stay next to the error rather than forcing a new navigation task                                    |
| Nested settings/location editor              | Keep Back and Close                                                                                                                                       | Back unwinds a step; Close exits the flow to its recorded origin                                                    |
| News notifications and notification settings | Keep both                                                                                                                                                 | One reads received notifications; the other configures channels/conditions                                          |
| Map overview and My location                 | Keep both                                                                                                                                                 | One resets the map extent; the other locates the user's GPS position                                                |
| Helper areas and LINE switches               | Keep both                                                                                                                                                 | Area availability controls matching; LINE controls the delivery channel                                             |

Validation covers mobile widths 320, 360, 390 and 430px: absence of removed
shortcuts, working replacement paths, profile/settings return, selected-report
photo/details and admin report-card/navigation access. Changes are local until a
separate release is requested.
