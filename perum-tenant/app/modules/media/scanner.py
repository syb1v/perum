from pathlib import Path
from typing import Literal, Protocol

from pydantic import BaseModel


class ScanVerdict(BaseModel):
    verdict: Literal["clean", "infected", "unavailable", "error"]
    scanner: str


class MediaScanner(Protocol):
    async def scan(self, path: Path) -> ScanVerdict: ...


class UnavailableScanner:
    async def scan(self, path: Path) -> ScanVerdict:
        return ScanVerdict(verdict="unavailable", scanner="unavailable")


class FakeScanner:
    def __init__(self, verdict: Literal["clean", "infected"]):
        self.verdict = verdict

    async def scan(self, path: Path) -> ScanVerdict:
        return ScanVerdict(verdict=self.verdict, scanner="fake")
