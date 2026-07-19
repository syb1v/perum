import json
import subprocess
import sys
import time


def run(*args: str, check=True) -> str:
    result = subprocess.run(args, capture_output=True, text=True)
    if check and result.returncode:
        raise RuntimeError(f"command failed: {args!r}; stdout={result.stdout!r}; stderr={result.stderr!r}")
    return result.stdout.strip()


def start_clamd(image: str, name: str, network: str, signatures: str) -> None:
    run("docker", "run", "-d", "--name", name, "--network", network, "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m,mode=1777", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "64", "--memory", "3g", "--cpus", "2", "-v", f"{signatures}:/var/lib/clamav:ro", image)


def wait_healthy(name: str) -> None:
    for _ in range(60):
        state = json.loads(run("docker", "inspect", name))[0]["State"]
        if state.get("Health", {}).get("Status") == "healthy":
            return
        time.sleep(2)
    state = run("docker", "inspect", "--format", "{{json .State}}", name, check=False)
    logs = run("docker", "logs", name, check=False)
    raise RuntimeError(f"clamd readiness failed: state={state} logs={logs}")


clamd, relay, tenant = sys.argv[1:4]
suffix = str(int(time.time()))
backend, updates, school = (f"scanner-{name}-{suffix}" for name in ("backend", "updates", "school"))
volume = f"scanner-signatures-{suffix}"
updater, daemon, proxy = (f"scanner-{name}-{suffix}" for name in ("updater", "clamd", "relay"))
try:
    run("docker", "run", "--rm", "--entrypoint", "sh", clamd, "-c", "command -v clamscan && command -v clamdscan && command -v freshclam")
    run("docker", "network", "create", "--internal", backend)
    run("docker", "network", "create", updates)
    run("docker", "network", "create", "--internal", school)
    run("docker", "volume", "create", volume)
    run("docker", "run", "-d", "--name", updater, "--network", updates, "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "32", "--memory", "512m", "--cpus", "0.5", "-v", f"{volume}:/var/lib/clamav:rw", clamd, "freshclam", "--daemon", "--foreground", "--config-file=/etc/clamav/freshclam.conf")
    for _ in range(150):
        valid = run("docker", "run", "--rm", "-v", f"{volume}:/db:ro", "--entrypoint", "sh", clamd, "-c", "if test -n \"$(find /db -maxdepth 1 -type f -name 'main.c?d' -print -quit)\" && test -n \"$(find /db -maxdepth 1 -type f -name 'daily.c?d' -print -quit)\" && clamscan --database=/db --version >/dev/null; then echo ready; fi")
        if valid == "ready":
            break
        time.sleep(2)
    else:
        raise RuntimeError(run("docker", "logs", updater, check=False))
    fingerprint = run("docker", "run", "--rm", "-v", f"{volume}:/db:ro", "--entrypoint", "sh", clamd, "-c", "sha256sum /db/*.c?d | sort")
    start_clamd(clamd, daemon, backend, volume)
    run("docker", "run", "-d", "--name", proxy, "--network", school, "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "32", "--memory", "128m", "--cpus", "0.25", "-e", f"UPSTREAM_HOST={daemon}", relay)
    run("docker", "network", "connect", backend, proxy)
    wait_healthy(daemon)
    version = run("docker", "run", "--rm", "--network", backend, "-v", f"{sys.argv[4]}:/client.py:ro", "-e", f"SCANNER_HOST={daemon}", "-e", "COMMAND=VERSION", "--entrypoint", "python", relay, "/client.py")
    assert "ClamAV" in version, f"direct version response mismatch: {version!r}"
    try:
        direct = run("docker", "run", "--rm", "--network", backend, "-v", f"{sys.argv[4]}:/client.py:ro", "-e", f"SCANNER_HOST={daemon}", "-e", "PAYLOAD=clean", "--entrypoint", "python", relay, "/client.py")
    except RuntimeError as exc:
        raise RuntimeError(f"{exc}; clamd_logs={run('docker', 'logs', daemon, check=False)!r}") from exc
    assert "OK" in direct, f"direct clean response mismatch: {direct!r}"
    run("docker", "run", "--rm", "--network", backend, "--workdir", "/app", "-v", f"{sys.argv[5]}:/app/freshness.py:ro", "--entrypoint", "python", tenant, "freshness.py", daemon)
    base = ("docker", "run", "--rm", "--network", school, "-v", f"{sys.argv[4]}:/client.py:ro", "-e", f"SCANNER_HOST={proxy}", "--entrypoint", "python")
    clean = run(*base, "-e", "PAYLOAD=clean", relay, "/client.py")
    eicar = run(*base, "-e", "PAYLOAD=X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*", relay, "/client.py")
    relay_logs = run("docker", "logs", proxy, check=False)
    assert "OK" in clean, f"relay clean response mismatch: {clean!r}; logs={relay_logs!r}"
    assert "FOUND" in eicar, f"relay EICAR response mismatch: {eicar!r}; logs={relay_logs!r}"
    run("docker", "stop", updater)
    assert "OK" in run(*base, "-e", "PAYLOAD=updater-outage", relay, "/client.py")
    run("docker", "stop", daemon)
    failed = subprocess.run((*base, "-e", "PAYLOAD=clamd-outage", relay, "/client.py"), capture_output=True, text=True)
    assert failed.returncode != 0 and "Traceback" in failed.stderr
    run("docker", "rm", daemon)
    start_clamd(clamd, daemon, backend, volume)
    wait_healthy(daemon)
    assert fingerprint == run("docker", "run", "--rm", "-v", f"{volume}:/db:ro", "--entrypoint", "sh", clamd, "-c", "sha256sum /db/*.c?d | sort")
    assert "OK" in run(*base, "-e", "PAYLOAD=recreated", relay, "/client.py")
    assert "FOUND" in run(*base, "-e", "PAYLOAD=X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*", relay, "/client.py")
    daemon_networks = set(json.loads(run("docker", "inspect", daemon))[0]["NetworkSettings"]["Networks"])
    updater_networks = set(json.loads(run("docker", "inspect", updater))[0]["NetworkSettings"]["Networks"])
    assert daemon_networks == {backend} and updater_networks == {updates}
    daemon_attrs = json.loads(run("docker", "inspect", daemon))[0]
    assert daemon_attrs["HostConfig"]["Tmpfs"] == {"/tmp": "rw,noexec,nosuid,size=16m,mode=1777"}
    assert [(item["Destination"], item["RW"]) for item in daemon_attrs["Mounts"]] == [("/var/lib/clamav", False)]
    run("python", sys.argv[6], relay, daemon, backend, sys.argv[4])
finally:
    for name in (proxy, daemon, updater):
        run("docker", "rm", "-f", name, check=False)
    run("docker", "volume", "rm", volume, check=False)
    for name in (school, updates, backend):
        run("docker", "network", "rm", name, check=False)
