from backend.core.config import Settings


def test_vercel_commit_sha_takes_precedence_over_manual_release_sha():
    config = Settings(
        _env_file=None,
        release_sha="old-manual-value",
        vercel_git_commit_sha="current-vercel-sha",
    )
    assert config.current_release == "current-vercel-sha"


def test_manual_release_sha_remains_local_fallback():
    config = Settings(
        _env_file=None, release_sha="manual-sha", vercel_git_commit_sha=""
    )
    assert config.current_release == "manual-sha"
