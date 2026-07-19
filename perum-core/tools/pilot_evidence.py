import argparse
import hashlib
import hmac
import json
import os
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import UUID

MAX_RESPONSE_BYTES = 512 * 1024
TIMEOUT_SECONDS = 10
REASON_METRICS = ("perum_mobile_descriptor_release_total", "perum_mobile_descriptor_deployment_total")
SIMULATIONS = ("unknown-release", "stale-snapshot", "grace-incompatible", "rollback-readiness")


class EvidenceError(Exception):
    pass


class NoCrossOriginRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        current = urllib.parse.urlsplit(req.full_url)
        target = urllib.parse.urlsplit(newurl)
        if current.scheme != target.scheme or current.netloc != target.netloc:
            raise EvidenceError("cross-origin redirect refused")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class HttpClient:
    def __init__(self, base_url: str, token: str, metrics_token: str | None = None):
        parsed = urllib.parse.urlsplit(base_url)
        if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}):
            raise EvidenceError("HTTPS required except localhost")
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise EvidenceError("invalid base URL")
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.metrics_token = metrics_token
        self.opener = urllib.request.build_opener(NoCrossOriginRedirect())

    def get(self, path: str, metrics: bool = False) -> tuple[int, Any]:
        headers = {"Accept": "text/plain" if metrics else "application/json"}
        credential = self.metrics_token if metrics else self.token
        if credential:
            headers["Authorization"] = f"Bearer {credential}"
        request = urllib.request.Request(f"{self.base_url}{path}", headers=headers, method="GET")
        try:
            response = self.opener.open(request, timeout=TIMEOUT_SECONDS)
            data = response.read(MAX_RESPONSE_BYTES + 1)
            if len(data) > MAX_RESPONSE_BYTES:
                raise EvidenceError("response too large")
            return response.status, data.decode("utf-8") if metrics else json.loads(data)
        except (urllib.error.URLError, urllib.error.HTTPError, socket.timeout, UnicodeDecodeError, json.JSONDecodeError, EvidenceError):
            return 0, None

    def post(self, path: str, payload: dict[str, str]) -> tuple[int, Any]:
        if path != "/api/public/tenant-discovery" or set(payload) != {"school_public_id"}:
            raise EvidenceError("only read-only discovery POST is permitted")
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=json.dumps(payload).encode(),
            headers={"Accept": "application/json", "Content-Type": "application/json", "Authorization": f"Bearer {self.token}"},
            method="POST",
        )
        try:
            response = self.opener.open(request, timeout=TIMEOUT_SECONDS)
            data = response.read(MAX_RESPONSE_BYTES + 1)
            if len(data) > MAX_RESPONSE_BYTES:
                raise EvidenceError("response too large")
            return response.status, json.loads(data)
        except (urllib.error.URLError, urllib.error.HTTPError, socket.timeout, UnicodeDecodeError, json.JSONDecodeError, EvidenceError):
            return 0, None


@dataclass
class EvidenceCollector:
    client: Any
    school_public_id: UUID
    hmac_key: bytes

    def _get(self, path: str, metrics: bool = False) -> tuple[int, Any]:
        return self.client.get(path, metrics=metrics)

    def collect(self) -> dict[str, Any]:
        health_status, health = self._get("/health")
        post = getattr(self.client, "post", None)
        discovery_status, descriptor = (0, None)
        if post:
            discovery_status, descriptor = post(
                "/api/public/tenant-discovery",
                {"school_public_id": str(self.school_public_id)},
            )
        diagnostic_status, diagnostic = self._get(f"/api/diagnostics/schools/{self.school_public_id}/deployment-descriptor")
        release_status, release = self._get("/api/releases/current")
        metrics_status, metrics = self._get("/metrics", metrics=True)
        metrics_ready = metrics_status == 200 and isinstance(metrics, str) and all(name in metrics for name in REASON_METRICS)
        diagnostic_ready = diagnostic_status == 200 and isinstance(diagnostic, dict)
        checks = {
            "control_health": health_status == 200 and health == {"status": "ok"},
            "school_scope": diagnostic_status == 200,
            "stable_id_discovery": discovery_status == 200 and isinstance(descriptor, dict),
            "release_status": release_status == 200 and isinstance(release, dict),
            "descriptor_diagnostic": diagnostic_ready,
            "descriptor_metrics_baseline": metrics_ready,
            "descriptor_schema_valid": diagnostic_ready and diagnostic.get("schema_valid") is True,
            "descriptor_release_match": diagnostic_ready and diagnostic.get("release_match") is True,
            "descriptor_snapshot_present": diagnostic_ready and diagnostic.get("snapshot_present") is True,
            "descriptor_snapshot_fresh": diagnostic_ready and diagnostic.get("snapshot_fresh") is True,
            "snapshot_accepted": diagnostic_ready and diagnostic.get("snapshot_accepted") is True,
            "rollback_proven": False,
            "mobile_telemetry_proven": False,
        }
        findings = [name for name, passed in checks.items() if not passed]
        return {
            "synthetic": False,
            "pilot": self._pseudonym(str(self.school_public_id)),
            "decision": "NO-GO" if findings else "GO",
            "checks": checks,
            "findings": findings,
        }

    def _pseudonym(self, value: str) -> str:
        return "pilot-" + hmac.new(self.hmac_key, value.encode(), hashlib.sha256).hexdigest()[:16]


def synthetic_evidence(mode: str) -> dict[str, Any]:
    findings = {
        "unknown-release": ["descriptor_schema_valid", "descriptor_release_match"],
        "stale-snapshot": ["descriptor_snapshot_fresh", "snapshot_accepted"],
        "grace-incompatible": ["mobile_grace_or_compatibility_gate"],
        "rollback-readiness": ["rollback_proven"],
    }[mode]
    return {"synthetic": True, "simulation": mode, "decision": "NO-GO", "checks": {name: False for name in findings}, "findings": findings}


def template_evidence() -> dict[str, Any]:
    checks = {name: False for name in (
        "control_health", "school_scope", "stable_id_discovery", "release_status",
        "descriptor_diagnostic", "descriptor_metrics_baseline", "rollback_proven", "mobile_telemetry_proven",
    )}
    return {"synthetic": True, "simulation": "template", "decision": "NO-GO", "checks": checks, "findings": list(checks)}


def render_markdown(evidence: dict[str, Any]) -> str:
    lines = ["# Pilot Evidence", "", f"Synthetic: {'YES' if evidence['synthetic'] else 'NO'}", f"Decision: **{evidence['decision']}**"]
    if evidence.get("pilot"):
        lines.append(f"Pilot: `{evidence['pilot']}`")
    if evidence.get("simulation"):
        lines.append(f"Simulation: `{evidence['simulation']}`")
    lines.extend(["", "## Checks"])
    lines.extend(f"- {'PASS' if passed else 'FAIL'}: `{name}`" for name, passed in evidence["checks"].items())
    lines.extend(["", "## Findings"])
    lines.extend(f"- NO-GO: `{finding}`" for finding in evidence["findings"])
    return "\n".join(lines) + "\n"


def _uuid(value: str) -> UUID:
    try:
        parsed = UUID(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("exact school public UUID required") from exc
    if str(parsed) != value.lower():
        raise argparse.ArgumentTypeError("canonical school public UUID required")
    return parsed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only pilot evidence collector")
    parser.add_argument("--base-url")
    parser.add_argument("--school-public-id", type=_uuid)
    parser.add_argument("--output", type=Path, default=Path("pilot-evidence"))
    parser.add_argument("--simulate", choices=SIMULATIONS)
    parser.add_argument("--template", action="store_true")
    args = parser.parse_args(argv)
    if args.template:
        evidence = template_evidence()
    elif args.simulate:
        evidence = synthetic_evidence(args.simulate)
    else:
        if not args.base_url or not args.school_public_id:
            parser.error("--base-url and --school-public-id are required")
        token = os.environ.get("PERUM_PILOT_TOKEN")
        key = os.environ.get("PERUM_PILOT_HMAC_KEY")
        if not token or not key:
            parser.error("PERUM_PILOT_TOKEN and PERUM_PILOT_HMAC_KEY are required")
        evidence = EvidenceCollector(HttpClient(args.base_url, token, os.environ.get("PERUM_PILOT_METRICS_TOKEN")), args.school_public_id, key.encode()).collect()
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "evidence.json").write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (args.output / "evidence.md").write_text(render_markdown(evidence), encoding="utf-8")
    return 0 if evidence["decision"] == "GO" else 2


if __name__ == "__main__":
    sys.exit(main())
