# Station marker age and health alerts

Marker colour describes a measurement, while age describes when that measurement
was recorded. ClearPath uses the following display-only policy; these limits are
product policy, not an international guarantee of measurement accuracy.

| Source age                                                    | Map marker                                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Up to 60 minutes, currently eligible                          | Normal concentration colour                                                         |
| Over 60 through 120 minutes, valid value and source timestamp | Concentration colour and clock; detail says “ข้อมูลก่อนหน้า ไม่ใช้คำนวณค่าปัจจุบัน” |
| Over 120 minutes, missing time or invalid value               | Neutral grey; prior values remain accessible in details/history                     |

Clusters use current values for their colour when any exist. Only when none
exist may they use previous values within 120 minutes, with a clock and a label
identifying the colour as previous data. Older values never enter that average.

This display allowance does not change `currentStationValue`, Place IDW,
backend surface eligibility, readiness, or notification source-age rules. The
backend retains 60-minute fresh and 90-minute delayed/surface boundaries. The
source timestamp, not the last successful sync time, determines age. Air4Thai
ingestion remains every 30 minutes.

Automatic PM2.5 LINE alerts require at least 37.6 µg/m³, covering the Thai
orange band (37.6–75.0) and red band (75.1 and above). A higher personal threshold
still applies. Legacy lower thresholds cannot cause lower-band notifications.
The existing maximum alert age of 90 minutes and all consent, area, quiet-hour
and deduplication checks remain in force; marker age never extends alert age.
