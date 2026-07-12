import json
import os
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: export_openapi.py <service-dir> <output-json>")
    service_dir = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2]).resolve()
    sys.path.insert(0, str(service_dir))
    os.chdir(service_dir)
    from app.main import app

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
