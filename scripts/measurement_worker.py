"""Local demo scheduler. Never sends production notifications.

Run: .venv/bin/python -m scripts.measurement_worker
"""

import time

import httpx

from backend.core.config import settings


def main():
    if not settings.local_demo_mode:
        raise SystemExit(
            "Local demo mode is required; production uses the protected cron endpoint"
        )
    while True:
        try:
            headers = (
                {
                    "Authorization": f"Bearer {settings.cron_secret or settings.supabase_cron_secret}"
                }
                if (settings.cron_secret or settings.supabase_cron_secret)
                else {}
            )
            response = httpx.get(
                "http://127.0.0.1:8000/api/cron/measurement-requests",
                headers=headers,
                timeout=55,
            )
            response.raise_for_status()
            print(response.json(), flush=True)
        except Exception as exc:
            print(type(exc).__name__, flush=True)
        time.sleep(30)


if __name__ == "__main__":
    main()
