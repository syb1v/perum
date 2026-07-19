import asyncio
import os
import struct


async def main():
    payload = os.environ["PAYLOAD"].encode()
    reader, writer = await asyncio.open_connection(os.environ["SCANNER_HOST"], 3310)
    writer.write(b"zINSTREAM\0" + struct.pack("!I", len(payload)) + payload + struct.pack("!I", 0))
    await writer.drain()
    print((await reader.read()).decode())
    writer.close()
    await writer.wait_closed()


asyncio.run(main())
