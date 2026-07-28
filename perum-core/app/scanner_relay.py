from __future__ import annotations

import asyncio
import os


_ALLOWED_COMMANDS = {b"zVERSION\0", b"zINSTREAM\0"}
_MAX_COMMAND_BYTES = max(map(len, _ALLOWED_COMMANDS))


async def _close(writer: asyncio.StreamWriter) -> None:
    writer.close()
    try:
        await asyncio.wait_for(writer.wait_closed(), 2)
    except (OSError, asyncio.TimeoutError):
        pass


async def _pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter, *, idle_timeout: float, max_bytes: int) -> None:
    transferred = 0
    try:
        while data := await asyncio.wait_for(reader.read(64 * 1024), idle_timeout):
            transferred += len(data)
            if transferred > max_bytes:
                raise ValueError("relay byte limit exceeded")
            writer.write(data)
            await asyncio.wait_for(writer.drain(), idle_timeout)
    finally:
        await _close(writer)


async def _read_command(reader: asyncio.StreamReader, *, idle_timeout: float) -> bytes:
    command = bytearray()
    while len(command) < _MAX_COMMAND_BYTES:
        byte = await asyncio.wait_for(reader.read(1), idle_timeout)
        if not byte:
            raise ValueError("incomplete scanner command")
        command.extend(byte)
        if byte == b"\0":
            break
    value = bytes(command)
    if value not in _ALLOWED_COMMANDS:
        raise ValueError("scanner command not allowed")
    return value


async def _handle(
    client_reader: asyncio.StreamReader,
    client_writer: asyncio.StreamWriter,
    *,
    upstream_host: str,
    upstream_port: int,
    connect_timeout: float,
    idle_timeout: float,
    total_timeout: float,
    max_bytes: int,
) -> None:
    upstream_writer = None
    try:
        async with asyncio.timeout(total_timeout):
            command = await _read_command(client_reader, idle_timeout=idle_timeout)
            upstream_reader, upstream_writer = await asyncio.wait_for(
                asyncio.open_connection(upstream_host, upstream_port), connect_timeout
            )
            upstream_writer.write(command)
            await asyncio.wait_for(upstream_writer.drain(), idle_timeout)
            await asyncio.gather(
                _pipe(client_reader, upstream_writer, idle_timeout=idle_timeout, max_bytes=max_bytes),
                _pipe(upstream_reader, client_writer, idle_timeout=idle_timeout, max_bytes=max_bytes),
            )
    except (OSError, asyncio.TimeoutError, ValueError):
        if upstream_writer is not None:
            await _close(upstream_writer)
        await _close(client_writer)


async def _serve() -> None:
    upstream_host = os.environ["UPSTREAM_HOST"]
    upstream_port = int(os.environ.get("UPSTREAM_PORT", "3310"))
    listen_port = int(os.environ.get("LISTEN_PORT", "3310"))
    connect_timeout = float(os.environ.get("CONNECT_TIMEOUT_S", "3"))
    idle_timeout = float(os.environ.get("IDLE_TIMEOUT_S", "10"))
    total_timeout = float(os.environ.get("TOTAL_TIMEOUT_S", "30"))
    max_bytes = int(os.environ.get("MAX_BYTES", str(12 * 1024 * 1024)))
    max_connections = int(os.environ.get("MAX_CONNECTIONS", "4"))
    if not 1 <= upstream_port <= 65535 or not 1 <= listen_port <= 65535 or min(connect_timeout, idle_timeout, total_timeout) <= 0 or max_bytes < 1024 or max_connections < 1:
        raise ValueError("invalid relay configuration")
    semaphore = asyncio.Semaphore(max_connections)

    async def handle(client_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter) -> None:
        async with semaphore:
            await _handle(
                client_reader,
                client_writer,
                upstream_host=upstream_host,
                upstream_port=upstream_port,
                connect_timeout=connect_timeout,
                idle_timeout=idle_timeout,
                total_timeout=total_timeout,
                max_bytes=max_bytes,
            )

    server = await asyncio.start_server(handle, "0.0.0.0", listen_port)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(_serve())
