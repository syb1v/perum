from typing import Protocol


class PushProvider(Protocol):
    async def deliver(self, category: str, target: str) -> None: ...


class UnavailablePushProvider:
    async def deliver(self, category: str, target: str) -> None:
        raise RuntimeError("push delivery is unavailable")
