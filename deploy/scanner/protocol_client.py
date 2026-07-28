import asyncio
import os
import struct


async def main():
    reader, writer = await asyncio.open_connection(os.environ["SCANNER_HOST"], 3310)
    command = os.environ.get("COMMAND")
    if command:
        writer.write(f"z{command}\0".encode("ascii"))
    else:
        payload = b"A" * int(os.environ["PAYLOAD_BYTES"]) if os.environ.get("PAYLOAD_BYTES") else os.environ["PAYLOAD"].encode()
        writer.write(b"zINSTREAM\0" + struct.pack("!I", len(payload)) + payload + struct.pack("!I", 0))
    await writer.drain()
    print((await asyncio.wait_for(reader.readuntil(b"\0"), 10)).decode())
    writer.close()
    await writer.wait_closed()


asyncio.run(main())
