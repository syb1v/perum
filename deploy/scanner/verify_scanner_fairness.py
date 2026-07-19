import json
import subprocess
import sys
import time


def run(*args: str, check=True) -> str:
    result = subprocess.run(args, capture_output=True, text=True)
    if check and result.returncode:
        raise RuntimeError(f"command failed: {args!r}; stdout={result.stdout!r}; stderr={result.stderr!r}")
    return result.stdout.strip()


relay, daemon, backend, client = sys.argv[1:5]
suffix = str(int(time.time()))
networks = [f"scanner-fair-school-{index}-{suffix}" for index in range(5)]
proxies = [f"scanner-fair-relay-{index}-{suffix}" for index in range(5)]
try:
    for network, proxy in zip(networks, proxies, strict=True):
        run("docker", "network", "create", "--internal", network)
        run("docker", "run", "-d", "--name", proxy, "--network", network, "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "32", "--memory", "128m", "--cpus", "0.25", "-e", f"UPSTREAM_HOST={daemon}", "-e", "MAX_CONNECTIONS=2", "-e", "TOTAL_TIMEOUT_S=45", relay)
        run("docker", "network", "connect", backend, proxy)
    client_base = ("docker", "run", "--rm", "-v", f"{client}:/client.py:ro", "--entrypoint", "python")
    burst = [subprocess.Popen((*client_base, "--network", networks[0], "-e", f"SCANNER_HOST={proxies[0]}", "-e", "PAYLOAD_BYTES=1048576", relay, "/client.py"), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for _ in range(6)]
    started = time.monotonic()
    peers = [subprocess.Popen((*client_base, "--network", network, "-e", f"SCANNER_HOST={proxy}", "-e", "PAYLOAD=peer-clean", relay, "/client.py"), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for network, proxy in zip(networks[1:], proxies[1:], strict=True)]
    for process in peers:
        stdout, stderr = process.communicate(timeout=20)
        assert process.returncode == 0 and "OK" in stdout, f"peer scan failed: stdout={stdout!r}; stderr={stderr!r}"
    assert time.monotonic() - started < 20
    for process in burst:
        stdout, stderr = process.communicate(timeout=45)
        assert process.returncode == 0 and "OK" in stdout, f"burst scan failed: stdout={stdout!r}; stderr={stderr!r}"
    daemon_networks = set(json.loads(run("docker", "inspect", daemon))[0]["NetworkSettings"]["Networks"])
    assert not daemon_networks.intersection(networks)
    for network, proxy in zip(networks, proxies, strict=True):
        attrs = json.loads(run("docker", "inspect", proxy))[0]
        assert set(attrs["NetworkSettings"]["Networks"]) == {network, backend}
        assert attrs["Mounts"] == []
        assert attrs["HostConfig"]["Memory"] == 128 * 1024 * 1024
        assert attrs["HostConfig"]["NanoCpus"] == 250_000_000
        assert attrs["HostConfig"]["PidsLimit"] == 32
finally:
    for proxy in proxies:
        run("docker", "rm", "-f", proxy, check=False)
    for network in networks:
        run("docker", "network", "rm", network, check=False)
