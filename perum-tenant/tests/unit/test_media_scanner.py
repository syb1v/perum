import asyncio
import struct
from datetime import datetime, timedelta, timezone

import pytest

from app.modules.media.scanner import ClamAVScanner


async def fake_clamd(version: str, response: bytes, *, delay: float = 0):
    received = bytearray()

    async def handler(reader, writer):
        command = await reader.readuntil(b"\0")
        if command == b"zVERSION\0":
            writer.write(version.encode() + b"\0")
        else:
            while True:
                size = struct.unpack("!I", await reader.readexactly(4))[0]
                if not size:
                    break
                received.extend(await reader.readexactly(size))
            await asyncio.sleep(delay)
            writer.write(response)
        await writer.drain()
        writer.close()
    server = await asyncio.start_server(handler, "127.0.0.1", 0)
    return server, received


@pytest.mark.parametrize(("response", "verdict"), [(b"stream: OK\0", "clean"), (b"stream: Eicar-Test-Signature FOUND\0", "infected"), (b"stream: size limit ERROR\0", "error"), (b"nonsense\0", "error")])
def test_instream_framing_and_strict_verdicts(tmp_path, response, verdict):
    async def run():
        stamp = datetime.now(timezone.utc).strftime("%a %b %d %H:%M:%S %Y")
        server, received = await fake_clamd(f"ClamAV 1.4.2/27500/{stamp}", response)
        path = tmp_path / "sample"
        path.write_bytes(b"content" * 20000)
        try:
            scanner = ClamAVScanner("127.0.0.1", server.sockets[0].getsockname()[1], chunk_bytes=1024)
            result = await scanner.scan(path)
            assert result.verdict == verdict
            assert received == path.read_bytes()
            assert result.engine_version == "1.4.2"
        finally:
            server.close()
            await server.wait_closed()
    asyncio.run(run())


def test_timeout_and_stale_signatures_fail_closed(tmp_path):
    async def run():
        old = (datetime.now(timezone.utc) - timedelta(hours=49)).strftime("%a %b %d %H:%M:%S %Y")
        server, _ = await fake_clamd(f"ClamAV 1.4.2/1/{old}", b"stream: OK\0")
        path = tmp_path / "sample"
        path.write_bytes(b"content")
        try:
            scanner = ClamAVScanner("127.0.0.1", server.sockets[0].getsockname()[1])
            result = await scanner.scan(path)
            assert (result.verdict, result.detail_code) == ("unavailable", "stale_signatures")
        finally:
            server.close()
            await server.wait_closed()

        stamp = datetime.now(timezone.utc).strftime("%a %b %d %H:%M:%S %Y")
        server, _ = await fake_clamd(f"ClamAV 1/1/{stamp}", b"stream: OK\0", delay=.1)
        try:
            scanner = ClamAVScanner("127.0.0.1", server.sockets[0].getsockname()[1], timeout_s=.01)
            assert (await scanner.scan(path)).verdict == "unavailable"
        finally:
            server.close()
            await server.wait_closed()
    asyncio.run(run())
