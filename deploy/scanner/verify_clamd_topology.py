import json
import subprocess
import sys
import time


def run(*args: str, check=True) -> str:
    return subprocess.run(args, check=check, capture_output=True, text=True).stdout.strip()


clamd, relay = sys.argv[1:3]
suffix = str(int(time.time()))
backend, updates, school = (f"scanner-{name}-{suffix}" for name in ("backend", "updates", "school"))
volume = f"scanner-signatures-{suffix}"
updater, daemon, proxy = (f"scanner-{name}-{suffix}" for name in ("updater", "clamd", "relay"))
try:
    run("docker", "network", "create", "--internal", backend)
    run("docker", "network", "create", updates)
    run("docker", "network", "create", "--internal", school)
    run("docker", "volume", "create", volume)
    run("docker", "run", "-d", "--name", updater, "--network", updates, "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "32", "--memory", "512m", "--cpus", "0.5", "-v", f"{volume}:/var/lib/clamav:rw", clamd, "freshclam", "--daemon", "--foreground", "--config-file=/etc/clamav/freshclam.conf")
    for _ in range(150):
        files = run("docker", "run", "--rm", "-v", f"{volume}:/db:ro", "--entrypoint", "sh", clamd, "-c", "find /db -maxdepth 1 -type f -name '*.c?d' -print -quit")
        if files:
            break
        time.sleep(2)
    else:
        raise RuntimeError(run("docker", "logs", updater, check=False))
    run("docker", "run", "-d", "--name", daemon, "--network", backend, "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "64", "--memory", "3g", "--cpus", "2", "-v", f"{volume}:/var/lib/clamav:ro", clamd)
    run("docker", "run", "-d", "--name", proxy, "--network", school, "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "32", "--memory", "128m", "--cpus", "0.25", "-e", f"UPSTREAM_HOST={daemon}", relay)
    run("docker", "network", "connect", backend, proxy)
    for _ in range(60):
        state = json.loads(run("docker", "inspect", daemon))[0]["State"]
        if state.get("Health", {}).get("Status") == "healthy":
            break
        time.sleep(2)
    else:
        raise RuntimeError(run("docker", "logs", daemon, check=False))
    base = ("docker", "run", "--rm", "--network", school, "-v", f"{sys.argv[3]}:/client.py:ro", "-e", f"SCANNER_HOST={proxy}", "--entrypoint", "python")
    clean = run(*base, "-e", "PAYLOAD=clean", relay, "/client.py")
    eicar = run(*base, "-e", "PAYLOAD=X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*", relay, "/client.py")
    assert "OK" in clean and "FOUND" in eicar
    daemon_networks = set(json.loads(run("docker", "inspect", daemon))[0]["NetworkSettings"]["Networks"])
    updater_networks = set(json.loads(run("docker", "inspect", updater))[0]["NetworkSettings"]["Networks"])
    assert daemon_networks == {backend} and updater_networks == {updates}
finally:
    for name in (proxy, daemon, updater):
        run("docker", "rm", "-f", name, check=False)
    run("docker", "volume", "rm", volume, check=False)
    for name in (school, updates, backend):
        run("docker", "network", "rm", name, check=False)
