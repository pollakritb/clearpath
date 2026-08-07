import base64
import hashlib
import hmac

from backend.algorithms.line_security import (
    extract_link_code,
    hash_link_code,
    valid_line_signature,
)


def test_line_signature_uses_raw_request_body():
    body = b'{"events":[]}'
    secret = "channel-secret"
    signature = base64.b64encode(
        hmac.new(secret.encode(), body, hashlib.sha256).digest()
    ).decode()
    assert valid_line_signature(body, signature, secret)
    assert not valid_line_signature(body + b" ", signature, secret)


def test_link_code_parsing_and_hashing_are_normalized():
    assert extract_link_code("เชื่อม clearpath cp-abcd2345 ครับ") == "CP-ABCD2345"
    assert extract_link_code("hello") is None
    assert hash_link_code("cp-abcd2345", "secret") == hash_link_code(
        "CP-ABCD2345", "secret"
    )
