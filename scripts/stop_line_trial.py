"""Scale the bounded LINE trial to zero after its UTC deadline (safe to repeat)."""

import json
import os
from datetime import UTC, datetime
from urllib.request import Request, urlopen

DEADLINE = datetime(2026, 11, 20, 17, tzinfo=UTC)
PROJECT = "prj_LBBUoNxhDIIWfpqvXirlzWR1DrVO"


def main() -> None:
    if datetime.now(UTC) < DEADLINE:
        print("Trial remains within the authorized window; no change")
        return
    token = os.environ["VERCEL_LINE_WORKER_TOKEN"]
    url = f"https://api.vercel.com/v1/projects/{PROJECT}/daemons/line-worker/instances?target=production"
    request = Request(
        url,
        data=json.dumps({"sin1": 0}).encode(),
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
        },
        method="PUT",
    )
    with urlopen(request, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError("Worker shutdown was not accepted")
    print("LINE worker desired instances set to zero")


if __name__ == "__main__":
    main()
