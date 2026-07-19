import json
import subprocess
import sys
import time


def run(*args: str, check=True) -> str:
    result = subprocess.run(args, capture_output=True, text=True)
    if check and result.returncode:
        raise RuntimeError(f"command failed: {args!r}; stdout={result.stdout!r}; stderr={result.stderr!r}")
    return result.stdout.strip()


clamd, relay = sys.argv[1:3]
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
    run("docker", "run", "-d", "--name", daemon, "--network", backend, "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m,mode=1777", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "64", "--memory", "3g", "--cpus", "2", "-v", f"{volume}:/var/lib/clamav:ro", clamd)
    run("docker", "run", "-d", "--name", proxy, "--network", school, "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "32", "--memory", "128m", "--cpus", "0.25", "-e", f"UPSTREAM_HOST={daemon}", relay)
    run("docker", "network", "connect", backend, proxy)
    for _ in range(60):
        state = json.loads(run("docker", "inspect", daemon))[0]["State"]
        if state.get("Health", {}).get("Status") == "healthy":
            break
        time.sleep(2)
    else:
        state = run("docker", "inspect", "--format", "{{json .State}}", daemon, check=False)
        logs = run("docker", "logs", daemon, check=False)
        raise RuntimeError(f"clamd readiness failed: state={state} logs={logs}")
    version = run("docker", "run", "--rm", "--network", backend, "-v", f"{sys.argv[3]}:/client.py:ro", "-e", f"SCANNER_HOST={daemon}", "-e", "COMMAND=VERSION", "--entrypoint", "python", relay, "/client.py")
    assert "ClamAV" in version, f"direct version response mismatch: {version!r}"
    try:
        direct = run("docker", "run", "--rm", "--network", backend, "-v", f"{sys.argv[3]}:/client.py:ro", "-e", f"SCANNER_HOST={daemon}", "-e", "PAYLOAD=clean", "--entrypoint", "python", relay, "/client.py")
    except RuntimeError as exc:
        raise RuntimeError(f"{exc}; clamd_logs={run('docker', 'logs', daemon, check=False)!r}") from exc
    assert "OK" in direct, f"direct clean response mismatch: {direct!r}"
    base = ("docker", "run", "--rm", "--network", school, "-v", f"{sys.argv[3]}:/client.py:ro", "-e", f"SCANNER_HOST={proxy}", "--entrypoint", "python")
    clean = run(*base, "-e", "PAYLOAD=clean", relay, "/client.py")
    eicar = run(*base, "-e", "PAYLOAD=X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*", relay, "/client.py")
    relay_logs = run("docker", "logs", proxy, check=False)
    assert "OK" in clean, f"relay clean response mismatch: {clean!r}; logs={relay_logs!r}"
    assert "FOUND" in eicar, f"relay EICAR response mismatch: {eicar!r}; logs={relay_logs!r}"
    daemon_networks = set(json.loads(run("docker", "inspect", daemon))[0]["NetworkSettings"]["Networks"])
    updater_networks = set(json.loads(run("docker", "inspect", updater))[0]["NetworkSettings"]["Networks"])
    assert daemon_networks == {backend} and updater_networks == {updates}
finally:
    for name in (proxy, daemon, updater):
        run("docker", "rm", "-f", name, check=False)
    run("docker", "volume", "rm", volume, check=False)
    for name in (school, updates, backend):
        run("docker", "network", "rm", name, check=False)
