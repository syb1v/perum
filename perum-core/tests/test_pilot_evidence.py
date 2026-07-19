from uuid import UUID

from tools.pilot_evidence import EvidenceCollector, render_markdown, synthetic_evidence


SCHOOL = UUID("12345678-1234-5678-9234-567812345678")


class FakeClient:
    def get(self, path, metrics=False):
        if path == "/health": return 200, {"status": "ok"}
        if path.startswith("/api/diagnostics/"): return 200, {"schema_valid": True, "release_match": True, "snapshot_present": True, "snapshot_fresh": True, "snapshot_accepted": True}
        if path == "/api/releases/current": return 200, {"private": "ignored"}
        if path == "/metrics": return 200, "perum_mobile_descriptor_release_total\nperum_mobile_descriptor_deployment_total\n"
        return 404, None

    def post(self, path, payload):
        return 200, self.descriptor()

    def descriptor(self):
        return {"tenant_id": str(SCHOOL), "school_id": str(SCHOOL), "descriptor_revision": "secret", "schema_version": 1, "compatibility": {}, "capabilities": {}}


def test_collector_redacts_and_requires_unavailable_proofs_for_go():
    evidence = EvidenceCollector(FakeClient(), SCHOOL, b"test-key").collect()
    serialized = str(evidence)
    assert evidence["decision"] == "NO-GO"
    assert evidence["findings"] == ["rollback_proven", "mobile_telemetry_proven"]
    assert str(SCHOOL) not in serialized
    assert "private.example" not in serialized
    assert "secret" not in serialized
    assert evidence["pilot"].startswith("pilot-")


def test_synthetic_modes_are_explicit_and_no_go():
    evidence = synthetic_evidence("stale-snapshot")
    assert evidence["synthetic"] is True
    assert evidence["decision"] == "NO-GO"
    assert "Synthetic: YES" in render_markdown(evidence)
