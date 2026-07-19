import asyncio

import pytest

from app.scanner_relay import _pipe


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
