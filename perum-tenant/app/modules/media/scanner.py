from __future__ import annotations

import asyncio
import re
import struct
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Literal, Protocol

from pydantic import BaseModel

from app.core.config import Settings, get_settings


class ScanVerdict(BaseModel):
    verdict: Literal["clean", "infected", "unavailable", "error"]
    scanner: str
    engine_version: str | None = None
    signature_version: str | None = None
    signature_at: datetime | None = None
    detail_code: str | None = None
    duration_ms: int | None = None


class ScannerProbe(BaseModel):
    ready: bool
    engine_version: str | None = None
    signature_version: str | None = None
    signature_at: datetime | None = None
    detail_code: str | None = None


class MediaScanner(Protocol):
    async def scan(self, path: Path) -> ScanVerdict: ...
    async def probe(self) -> ScannerProbe: ...


class UnavailableScanner:
    async def scan(self, path: Path) -> ScanVerdict:
        return ScanVerdict(verdict="unavailable", scanner="unavailable", detail_code="not_configured")

    async def probe(self) -> ScannerProbe:
        return ScannerProbe(ready=False, detail_code="not_configured")


class FakeScanner:
    def __init__(self, verdict: Literal["clean", "infected"]):
        self.verdict = verdict

    async def scan(self, path: Path) -> ScanVerdict:
        return ScanVerdict(verdict=self.verdict, scanner="fake")

    async def probe(self) -> ScannerProbe:
        return ScannerProbe(ready=True, engine_version="fake", signature_version="fake", signature_at=datetime.now(timezone.utc))


@dataclass
class ScannerRuntimeState:
    probe: ScannerProbe
    checked_at: datetime | None = None


class ClamAVScanner:
    _SCAN_RE = re.compile(r"^stream: (OK|.+ FOUND|.+ ERROR)$")
    _VERSION_RE = re.compile(r"^ClamAV ([^/\s]{1,40})/([^/\s]{1,40})/(.*)$")

    def __init__(self, host: str, port: int, *, timeout_s: float = 15, connect_timeout_s: float = 3, chunk_bytes: int = 64 * 1024, max_parallel: int = 2, max_signature_age_h: int = 48):
        self.host = host
        self.port = port
        self.timeout_s = timeout_s
        self.connect_timeout_s = connect_timeout_s
        self.chunk_bytes = chunk_bytes
        self.max_signature_age = timedelta(hours=max_signature_age_h)
        self._semaphore = asyncio.Semaphore(max_parallel)
        self.state = ScannerRuntimeState(ScannerProbe(ready=False, detail_code="not_probed"))

    async def _connect(self):
        return await asyncio.wait_for(asyncio.open_connection(self.host, self.port), self.connect_timeout_s)

    async def _response(self, reader: asyncio.StreamReader) -> str:
        data = await asyncio.wait_for(reader.readuntil(b"\0"), self.timeout_s)
        if len(data) > 4096:
            raise ValueError("response_too_large")
        return data[:-1].decode("utf-8", errors="strict")

    async def _close(self, writer: asyncio.StreamWriter) -> None:
        writer.close()
        try:
            await asyncio.wait_for(writer.wait_closed(), self.connect_timeout_s)
        except (OSError, asyncio.TimeoutError):
            pass

    async def _version(self) -> ScannerProbe:
        reader, writer = await self._connect()
        try:
            writer.write(b"zVERSION\0")
            await asyncio.wait_for(writer.drain(), self.timeout_s)
            raw = await self._response(reader)
        finally:
            await self._close(writer)
        match = self._VERSION_RE.fullmatch(raw)
        if not match:
            return ScannerProbe(ready=False, detail_code="malformed_version")
        try:
            signature_at = datetime.strptime(match.group(3), "%a %b %d %H:%M:%S %Y").replace(tzinfo=timezone.utc)
        except ValueError:
            return ScannerProbe(ready=False, engine_version=match.group(1), signature_version=match.group(2), detail_code="malformed_signature_date")
        age = datetime.now(timezone.utc) - signature_at
        fresh = -timedelta(minutes=5) <= age <= self.max_signature_age
        detail = None if fresh else "future_signatures" if age < -timedelta(minutes=5) else "stale_signatures"
        return ScannerProbe(ready=fresh, engine_version=match.group(1), signature_version=match.group(2), signature_at=signature_at, detail_code=detail)

    async def probe(self) -> ScannerProbe:
        try:
            probe = await self._version()
        except (OSError, asyncio.TimeoutError, asyncio.IncompleteReadError, UnicodeError, ValueError):
            probe = ScannerProbe(ready=False, detail_code="probe_failed")
        self.state = ScannerRuntimeState(probe=probe, checked_at=datetime.now(timezone.utc))
        return probe

    def ready(self) -> bool:
        signature_at = self.state.probe.signature_at
        return bool(self.state.probe.ready and signature_at and datetime.now(timezone.utc) - signature_at <= self.max_signature_age)

    async def scan(self, path: Path) -> ScanVerdict:
        started = time.monotonic()
        async with self._semaphore:
            try:
                async with asyncio.timeout(self.timeout_s):
                    return await self._scan(path, started)
            except asyncio.TimeoutError:
                return ScanVerdict(verdict="unavailable", scanner="clamav", detail_code="operation_timeout", duration_ms=int((time.monotonic() - started) * 1000))

    async def _scan(self, path: Path, started: float) -> ScanVerdict:
        probe = await self.probe()
        evidence = dict(engine_version=probe.engine_version, signature_version=probe.signature_version, signature_at=probe.signature_at)
        if not probe.ready:
            return ScanVerdict(verdict="unavailable", scanner="clamav", detail_code=probe.detail_code, duration_ms=int((time.monotonic() - started) * 1000), **evidence)
        try:
            reader, writer = await self._connect()
            try:
                writer.write(b"zINSTREAM\0")
                with path.open("rb") as source:
                    while chunk := await asyncio.to_thread(source.read, self.chunk_bytes):
                        writer.write(struct.pack("!I", len(chunk)))
                        writer.write(chunk)
                        await asyncio.wait_for(writer.drain(), self.timeout_s)
                writer.write(b"\0\0\0\0")
                await asyncio.wait_for(writer.drain(), self.timeout_s)
                raw = await self._response(reader)
            finally:
                await self._close(writer)
        except (OSError, asyncio.TimeoutError, asyncio.IncompleteReadError):
            return ScanVerdict(verdict="unavailable", scanner="clamav", detail_code="transport_failed", duration_ms=int((time.monotonic() - started) * 1000), **evidence)
        except (UnicodeError, ValueError):
            return ScanVerdict(verdict="error", scanner="clamav", detail_code="malformed_response", duration_ms=int((time.monotonic() - started) * 1000), **evidence)
        if not self._SCAN_RE.fullmatch(raw):
            verdict, code = "error", "malformed_response"
        elif raw == "stream: OK":
            verdict, code = "clean", None
        elif raw.endswith(" FOUND"):
            verdict, code = "infected", "malware_found"
        else:
            verdict, code = "error", "scanner_error"
        return ScanVerdict(verdict=verdict, scanner="clamav", detail_code=code, duration_ms=int((time.monotonic() - started) * 1000), **evidence)


@lru_cache(maxsize=1)
def scanner_runtime() -> MediaScanner:
    settings = get_settings()
    if not settings.SCANNER_HOST:
        return UnavailableScanner()
    return ClamAVScanner(settings.SCANNER_HOST, settings.SCANNER_PORT, timeout_s=settings.SCANNER_TIMEOUT_S, connect_timeout_s=settings.SCANNER_CONNECT_TIMEOUT_S, chunk_bytes=settings.SCANNER_CHUNK_BYTES, max_parallel=settings.SCANNER_MAX_PARALLEL, max_signature_age_h=settings.SCANNER_MAX_SIGNATURE_AGE_H)
