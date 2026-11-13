"""Replay distinct mobile UI paths through playwright-cli, with isolated API fixtures.

Start the demo frontend at 127.0.0.1:3117 and backend at :8017 first.
No external LINE requests are permitted. Paths are reproducible by --start/--count.
"""

import argparse
import json
import os
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--count", type=int, default=1000)
    parser.add_argument("--batch", type=int, default=24)
    args = parser.parse_args()
    if args.start < 0 or args.count < 1 or args.start + args.count > 1000:
        parser.error("choose a range inside 0..999")
    root = Path(__file__).resolve().parents[1]
    wrapper = Path.home() / ".codex/skills/playwright/scripts/playwright_cli.sh"
    template = (
        (root / "scripts/browser/line-mobile-routes.js")
        .read_text()
        .replace("export default ", "", 1)
    )
    output = root / "output/playwright"
    output.mkdir(parents=True, exist_ok=True)
    results = []
    env = dict(os.environ)
    env["PATH"] = str(Path.home() / ".local/bin") + os.pathsep + env.get("PATH", "")
    report_path = output / f"line-mobile-routes-{args.start}-{args.count}.json"
    with TemporaryDirectory(prefix="clearpath-ui-paths-") as temp:
        for start in range(args.start, args.start + args.count, args.batch):
            count = min(args.batch, args.start + args.count - start)
            code = template.replace('"START_CASE"', str(start)).replace(
                '"CASE_COUNT"', str(count)
            )
            batch_file = Path(temp) / "routes.js"
            batch_file.write_text(code)
            result = subprocess.run(
                [
                    "bash",
                    str(wrapper),
                    "-s=clearpath-1000",
                    "run-code",
                    "--filename",
                    str(batch_file),
                ],
                capture_output=True,
                text=True,
                env=env,
                cwd=root,
                timeout=180,
            )
            (output / f"line-mobile-batch-{start}.log").write_text(
                result.stdout + result.stderr
            )
            if "### Result\n" not in result.stdout:
                raise RuntimeError(
                    f"CLI batch {start} did not return a report; inspect its log"
                )
            raw = result.stdout.split("### Result\n", 1)[1].split("\n### ", 1)[0]
            batch = json.loads(raw.strip())
            results.extend(batch["paths"])
            passed = sum(row["status"] == "passed" for row in results)
            report = {
                "scope": "real Chromium mobile UI, page-isolated mocked notification API, no LINE sends",
                "requested": args.count,
                "completed": len(results),
                "passed": passed,
                "failed": len(results) - passed,
                "paths": results,
            }
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
            print(
                f"mobile paths {len(results)}/{args.count}: {passed} passed, {len(results) - passed} failed",
                flush=True,
            )
    print(report_path)
    if any(row["status"] != "passed" for row in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
