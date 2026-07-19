import asyncio
import sys
import tempfile
from pathlib import Path

from app.modules.media.scanner import ClamAVScanner


EICAR = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"


async def main():
    host = sys.argv[1]
    stale = ClamAVScanner(host, 3310, max_signature_age_h=0)
    probe = await stale.probe()
    assert not probe.ready and probe.detail_code == "stale_signatures"
    with tempfile.TemporaryDirectory() as directory:
        clean_path = Path(directory) / "clean"
        clean_path.write_bytes(b"clean")
        blocked = await stale.scan(clean_path)
        assert blocked.verdict == "unavailable" and blocked.detail_code == "stale_signatures"
        current = ClamAVScanner(host, 3310, max_signature_age_h=48)
        current_probe = await current.probe()
        assert current_probe.ready and current_probe.detail_code is None
        clean = await current.scan(clean_path)
        assert clean.verdict == "clean"
        eicar_path = Path(directory) / "eicar"
        eicar_path.write_bytes(EICAR)
        infected = await current.scan(eicar_path)
        assert infected.verdict == "infected" and infected.detail_code == "malware_found"


asyncio.run(main())
