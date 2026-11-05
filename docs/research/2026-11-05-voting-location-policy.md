# Voting location policy: evidence and limits

**Latest product decision:** use 500 m temporarily, per the user’s subsequent
explicit instruction. This is not a research-validated radius. The earlier
recommendation to keep the radius unset is superseded for implementation.

Reviewed 2026-11-05. This decision supersedes the proposed fixed 500 m voting
radius. It does not change request matching, Place IDW, or other coverage radii.

## What the sources support

- [W3C Geolocation](https://www.w3.org/TR/geolocation/), sections 9.1 and position
  acquisition: accuracy is a reported position-error radius in metres, nominally
  at 95% confidence. The API gives no guarantee of the device's actual location.
  This supports handling uncertainty, not choosing a voting radius or detecting
  spoofed coordinates. The currently published October 2026 text is a draft.
- [EPA sensor siting guide](https://www.epa.gov/air-sensor-toolbox/guide-siting-and-installing-air-sensors):
  monitoring purpose, local sources, buildings and placement affect interpretation;
  nearby measurements can differ due to hyperlocal influences. It does not specify
  a distance within which a person's vote validates a PM2.5 measurement.
- [40 CFR Part 58 Appendix D](https://www.govinfo.gov/link/cfr/40/58?link-type=pdf&year=mostrecent):
  middle and neighbourhood spatial scales describe dimensions of representative
  monitoring areas. They are not voting radii. Do not convert a quoted 0.5 km area
  dimension into a 500 m radius or a claim of identical PM2.5.
- [Li et al., ACP 21, 7199–7215 (2021)](https://acp.copernicus.org/articles/21/7199/2021/):
  mobile monitoring examines high-resolution urban variability. This is supporting
  context for local variation; it does not validate a ClearPath vote radius.

Conclusion: these sources provide no defensible universal numeric radius for
ClearPath voting. Replacing 500 m with another untested number would repeat the
same problem. Presence eligibility and independent measurement agreement are
separate questions. Likes/dislikes do not add/subtract points or evidence score.

## Implemented decision rule

The server owns R and its policy reference. The current implementation defaults
to 500 m, labelled `temporary-product-policy:2026-11-05:user-directed`. A nonempty
reference documents the decision; it does not prove scientific validation. If the
server deliberately unsets the radius, new votes fail closed. Comments and withdrawal
remain available. The release still starts in v1 until the wider v2 cutover.

Use private report coordinates, not displaced public map coordinates. Calculate
haversine distance d and error sum a = voter accuracy + report-location accuracy:

- d + a <= R: accept location eligibility under the reported error bounds.
- max(0, d - a) > R: outside the accepted area.
- Otherwise: uncertain; request another fix on the user's next attempt.

Both positions must have finite coordinates and nonnegative known accuracy. A
missing report accuracy cannot be replaced with zero. A fresh voter fix is required
for each new/changed vote. The 60-second fix freshness and 3-hour report window
are explicit product anti-replay settings, not distances inferred from research.
The sum of two nominal error radii is conservative geometry conditional on the
positions lying within their stated radii. It is neither a guarantee nor a joint
95% probability. The server never returns exact distance or retains voter GPS.

## How to establish R without inventing it

1. Define the vote as local feedback, not an independent PM2.5 measurement or a
   substitute for inspecting the photo. Define the physical presence area in a
   written protocol before collecting outcomes.
2. Collect consented independent location ground truth, across representative
   phones, open streets, buildings, parks and permission/signal conditions. Record
   the reference method's own error. Do not reuse blurred public pin positions as
   ground truth.
3. Compare candidate policies on held-out locations/devices. Report incorrect
   acceptance outside the intended area, incorrect rejection inside, uncertainty
   and repeat-location rates, sample counts and uncertainty intervals. Set the
   acceptance target before selecting the policy; it is a product decision.
4. If the vote is supposed to validate concentrations, it requires separate
   simultaneous independent measurements with compatible averaging periods and
   contexts. GPS proximity alone cannot do this. Follow the
   [EPA collocation approach](https://www.epa.gov/air-sensor-toolbox/air-sensor-collocation)
   for instrument evaluation rather than using votes as ground truth.
5. Retain protocol, dataset/window, results, limitations and policy version in the
   release record. Choose and document R only after evaluating those results.

No field evaluation has been performed by this code change. Numeric radii in unit
and isolated SQL tests are labelled fictitious fixtures and must not be deployed.
