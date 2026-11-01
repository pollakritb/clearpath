"""Creation retry keys for remote inserts, readable sequences for offline demo.

Production keys are aliases only. Postgres allocates the actual BIGINT primary
key. Keeping a retry alias allows an interrupted draft submission to resume.
"""

from collections import defaultdict
from threading import RLock
from uuid import uuid4

from ..core.config import settings
from ..core.identifiers import code

_LOCK = RLock()
_COUNTERS: dict[str, int] = defaultdict(int)
_REPLAYS: dict[tuple[str, str], str] = {}


def creation_key(entity: str, retry_key: str | None = None) -> str:
    if not settings.local_demo_mode:
        return retry_key or str(uuid4())
    with _LOCK:
        if retry_key is not None and (entity, retry_key) in _REPLAYS:
            return _REPLAYS[(entity, retry_key)]
        _COUNTERS[entity] += 1
        value = code(entity, _COUNTERS[entity])
        if retry_key is not None:
            _REPLAYS[(entity, retry_key)] = value
        return value
