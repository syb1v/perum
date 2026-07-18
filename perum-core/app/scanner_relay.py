from __future__ import annotations

import asyncio
import os


async def _pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while data := await reader.read(64 * 1024):
            writer.write(data)
            await writer.drain()
    finally:
        writer.close()


async def _serve() -> None:
    upstream_host = os.environ["UPSTREAM_HOST"]
    upstream_port = int(os.environ.get("UPSTREAM_PORT", "3310"))
    listen_port = int(os.environ.get("LISTEN_PORT", "3310"))
    connect_timeout = float(os.environ.get("CONNECT_TIMEOUT_S", "3"))
    semaphore = asyncio.Semaphore(int(os.environ.get("MAX_CONNECTIONS", "4")))

    async def handle(client_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter) -> None:
        async with semaphore:
            try:
                upstream_reader, upstream_writer = await asyncio.wait_for(
                    asyncio.open_connection(upstream_host, upstream_port), connect_timeout
                )
            except (OSError, asyncio.TimeoutError):
                client_writer.close()
                await client_writer.wait_closed()
                return
            await asyncio.gather(
                _pipe(client_reader, upstream_writer),
                _pipe(upstream_reader, client_writer),
                return_exceptions=True,
            )

    server = await asyncio.start_server(handle, "0.0.0.0", listen_port)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(_serve())
