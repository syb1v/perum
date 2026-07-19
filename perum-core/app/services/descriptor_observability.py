from collections import Counter
from threading import Lock


RELEASE_REASONS = ("missing_release", "unknown_release", "invalid_manifest")
DEPLOYMENT_REASONS = ("missing_snapshot", "stale_snapshot", "release_mismatch")
_release = Counter({reason: 0 for reason in RELEASE_REASONS})
_deployment = Counter({reason: 0 for reason in DEPLOYMENT_REASONS})
_lock = Lock()


def observe_descriptor_reason(reason: str) -> None:
    with _lock:
        if reason in RELEASE_REASONS:
            _release[reason] += 1
        elif reason in DEPLOYMENT_REASONS:
            _deployment[reason] += 1
        else:
            raise ValueError("unsupported descriptor reason")


def descriptor_counter_samples() -> tuple[dict[str, int], dict[str, int]]:
    with _lock:
        return dict(_release), dict(_deployment)


def reset_descriptor_counters() -> None:
    with _lock:
        for counter in (_release, _deployment):
            for reason in counter:
                counter[reason] = 0
