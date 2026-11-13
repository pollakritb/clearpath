"""Compatibility entrypoint: python -m scripts.line_worker."""

from backend.workers.line import main

if __name__ == "__main__":
    main()
