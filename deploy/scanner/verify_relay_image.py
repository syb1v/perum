import json
import subprocess
import sys


def run(*args: str) -> str:
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()


image = sys.argv[1]
attrs = json.loads(run("docker", "image", "inspect", image))[0]
config = attrs["Config"]
assert config["User"] == "65532:65532"
assert config["WorkingDir"] == "/app"
assert config["Cmd"] == ["python", "-m", "app.scanner_relay"]
assert config["Labels"]["org.opencontainers.image.source"] == "https://github.com/syb1v/perum"
assert config["Labels"]["org.opencontainers.image.revision"]
run("docker", "run", "--rm", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "32", "--memory", "128m", "--cpus", "0.25", "--entrypoint", "python", image, "-c", "import app.scanner_relay")
