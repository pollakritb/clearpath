from backend.core.config import Settings


def test_deployment_release_sha_is_exposed():
    config = Settings(_env_file=None, release_sha="deployed-sha")
    assert config.current_release == "deployed-sha"


def test_unconfigured_release_defaults_to_local():
    assert Settings(_env_file=None).current_release == "local"
