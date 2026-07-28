import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.scanner_relay import _handle, _pipe, _read_command


class Reader:
    def __init__(self, chunks):
        self.chunks = iter(chunks)

    async def read(self, size):
        await asyncio.sleep(0)
        return next(self.chunks)


class Writer:
    def __init__(self):
        self.data = bytearray()
        self.closed = False

    def write(self, data): self.data.extend(data)
    async def drain(self): pass
    def close(self): self.closed = True
    async def wait_closed(self): pass


def stream(*chunks):
    reader = asyncio.StreamReader()
    for chunk in chunks:
        reader.feed_data(chunk)
    reader.feed_eof()
    return reader


def test_relay_pipe_forwards_with_byte_limit_and_closes():
    async def run():
        writer = Writer()
        await _pipe(Reader([b"abc", b""]), writer, idle_timeout=1, max_bytes=3)
        assert writer.data == b"abc" and writer.closed
        with pytest.raises(ValueError, match="byte limit"):
            await _pipe(Reader([b"abcd"]), Writer(), idle_timeout=1, max_bytes=3)
    asyncio.run(run())


def test_relay_pipe_enforces_idle_timeout():
    class SlowReader:
        async def read(self, size): await asyncio.sleep(1)
    with pytest.raises(asyncio.TimeoutError):
        asyncio.run(_pipe(SlowReader(), Writer(), idle_timeout=.01, max_bytes=1024))


def test_relay_accepts_only_version_and_instream_without_consuming_payload():
    async def run():
        assert await _read_command(stream(b"zVERSION\0"), idle_timeout=1) == b"zVERSION\0"
        reader = stream(b"zINSTREAM\0\0\0\0\x03abc\0\0\0\0")
        assert await _read_command(reader, idle_timeout=1) == b"zINSTREAM\0"
        assert await reader.read() == b"\0\0\0\x03abc\0\0\0\0"

    asyncio.run(run())


@pytest.mark.parametrize("command", [b"zSHUTDOWN\0", b"zRELOAD\0", b"nVERSION\n", b"zSESSION\0", b"zINSTREAMX", b"zVERSION"])
def test_relay_rejects_unsafe_or_malformed_commands_before_upstream(command):
    async def run():
        writer = Writer()
        opener = AsyncMock()
        with patch("app.scanner_relay.asyncio.open_connection", opener):
            await _handle(
                stream(command),
                writer,
                upstream_host="clamd",
                upstream_port=3310,
                connect_timeout=1,
                idle_timeout=1,
                total_timeout=1,
                max_bytes=1024,
            )
        opener.assert_not_awaited()
        assert writer.closed

    asyncio.run(run())
