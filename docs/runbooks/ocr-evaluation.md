# OCR evaluation and model release gate

ClearPath treats OCR as one evidence signal. A model result never bypasses GPS,
capture time, burst continuity, duplicate-image checks, or the claimed-value
comparison. Uncertain cases remain `pending` for the administrator exception
queue.

## Private dataset

Store consented, labelled images under:

```text
data/private/ocr-evaluation/
  manifest.jsonl
  images/
```

The directory is ignored by Git. Do not commit images, exact coordinates,
names, e-mail addresses, provider responses, or API keys. Use stable anonymous
case IDs and keep the evaluator on a restricted development machine.

Each JSONL row has these fields:

```json
{
  "case_id": "lcd-normal-001",
  "image": "images/lcd-normal-001.jpg",
  "expected_pm25": 18.4,
  "device_family": "generic-lcd",
  "conditions": ["normal"],
  "split": "test"
}
```

Use `expected_pm25: null` for a negative case that must abstain, such as a
non-meter photo, unreadable display, AQI-only screen, or screenshot. The test
set must include low/medium/high values, decimals, LED/LCD devices, rotations,
glare, blur, low light, obstruction, non-meter images, misleading numbers, and
replays. A person must establish labels from the physical display; OCR output
must never become its own label.

For an offline result file, add `predicted_pm25`, `predicted_confidence`,
`predicted_device_detected`, and `predicted_display_clear` to each row. Validate
it without sending images:

```powershell
.venv/Scripts/python scripts/evaluate_ocr.py
```

Run a live evaluation only after consent and vendor/privacy approval:

```powershell
.venv/Scripts/python scripts/evaluate_ocr.py --live --confirm-private-image-processing
```

To compare a candidate, run the same immutable test split with `--model`. Never
put a candidate into Production merely because it is newer. The committed gate
requires at least 60 cases, 40 readable displays, 10 negative cases, three
device families, all required adverse conditions, MAE no greater than 2.0
µg/m³, at least 99% precision among high-confidence eligible results, and zero
eligible false positives on negative cases.

## Current model decision

Keep the configured `gpt-5.4-mini` model until a consented dataset passes the
gate. The current model supports image input and Structured Outputs; changing
models without comparative evidence cannot demonstrate better meter-reading
accuracy. For a reproducible candidate run, record the dated model snapshot in
the evaluation result, then promote it only after review. Production requests
set `store: false` and the browser never receives the API key.

## Release procedure

1. Freeze and checksum the labelled test split outside Git.
2. Run the current model and candidate against exactly the same cases.
3. Review every high-confidence error and every negative false positive.
4. Require the automated gate to pass and record reviewer/date/model snapshot.
5. Test iPhone and Android capture, denial/retry, rotation, and slow network.
6. Change `OPENAI_OCR_MODEL` only after approval; retain the previous value for rollback.
7. Monitor pending rate, disagreements, and corrections. Roll back on a critical false read.

The evaluator deliberately fails when the real dataset is absent or too small.
Synthetic labels and mocked unit tests are useful for code verification but do
not count as model evidence.
