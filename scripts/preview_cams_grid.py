"""Local QA API backed by embedded Postgres; does not connect to production.

python -m scripts.preview_cams_grid --data /tmp/clearpath-cams-grid.json --port 8001
Run a separate Next build/start pointing BACKEND_ORIGIN at this port.
Production continues using Supabase, not this development-only bridge.
"""

import argparse
import os
import subprocess
import time
from pathlib import Path

import httpx
import uvicorn


class Query:
    def __init__(self, table):
        self.data = {"table": table, "fields": "*", "filters": []}

    def select(self, fields):
        self.data["fields"] = fields
        return self

    def eq(self, key, value):
        self.data["filters"].append([key, "=", value])
        return self

    def gte(self, key, value):
        self.data["filters"].append([key, ">=", value])
        return self

    def lte(self, key, value):
        self.data["filters"].append([key, "<=", value])
        return self

    def order(self, key):
        self.data["order"] = key
        return self

    def limit(self, count):
        self.data["limit"] = count
        return self


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--database-port", type=int, default=8087)
    args = parser.parse_args()
    # Test profile disables remote reads/writes in every non-grid feature.
    os.environ["APP_ENVIRONMENT"] = "test"
    os.environ["LOCAL_DEMO_MODE"] = "true"
    os.environ["SUPABASE_URL"] = ""
    os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""
    os.environ["CAMS_GRID_COLLECTION_ENABLED"] = "false"
    process = subprocess.Popen(
        [
            "node",
            str(Path(__file__).with_name("cams-grid-local-db.mjs")),
            str(args.data.resolve()),
            str(args.database_port),
        ]
    )
    try:
        origin = f"http://127.0.0.1:{args.database_port}"
        for _ in range(60):
            try:
                if httpx.get(origin + "/health", timeout=1).is_success:
                    break
            except httpx.HTTPError:
                pass
            if process.poll() is not None:
                raise RuntimeError("local grid database failed to start")
            time.sleep(0.1)
        else:
            raise RuntimeError("local grid database startup timeout")
        from backend.main import app
        from backend.services import forecast_grid_store

        def read(table, configure):
            query = configure(Query(table))
            response = httpx.post(origin + "/read", json=query.data, timeout=10)
            response.raise_for_status()
            return response.json()

        forecast_grid_store.read = read
        uvicorn.run(app, host="127.0.0.1", port=args.port)
    finally:
        process.terminate()
        process.wait(timeout=10)


if __name__ == "__main__":
    main()
