"""The former live model-feature export is retired; use archived datasets offline."""

import argparse
from pathlib import Path


def export(since: str, output: Path) -> dict:
    raise ValueError(
        "forecast_training_live_export_retired: use archived datasets offline"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.error("live model-feature export retired; use archived datasets offline")


if __name__ == "__main__":
    main()
