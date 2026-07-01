"""Внутрипроцессные именованные блокировки для сериализации операций жизненного
цикла школ/орг.

Провижининг/заморозка/удаление школы — это длинные docker-цепочки с множеством
`await` (pull, health-wait, exec). Между чтением статуса и docker-мутацией event
loop отдаётся другим запросам, поэтому два параллельных запроса на одну школу
(reprovision+suspend, suspend+delete, два create с проверкой лимита) могли
интерливиться и гонять docker-операции над одним стеком (AUDIT иерархии,
lifecycle #2). Ядро запускается одним процессом uvicorn (без --workers), поэтому
keyed asyncio.Lock полностью закрывает гонку в рамках процесса.

Если в будущем ядро станет много-воркерным, эти локи нужно заменить на
БД-advisory-локи (pg_advisory_xact_lock) — здесь намеренно простой механизм под
текущую однопроцессную модель.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from contextlib import asynccontextmanager

# asyncio.Lock в современном Python не привязывается к loop при создании, поэтому
# defaultdict безопасен (лок берётся уже внутри работающего loop).
_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


@asynccontextmanager
async def keyed_lock(key: str):
    """Сериализует критическую секцию по строковому ключу (например
    ``school:42`` или ``org:7:create``). Держится на всё время операции."""
    lock = _locks[key]
    async with lock:
        yield


def school_key(school_id: int) -> str:
    return f"school:{school_id}"


def org_create_key(org_id: int) -> str:
    """Лок на создание/возрождение школ орг — делает проверку лимита плана и саму
    вставку атомарными (иначе параллельные create могли превысить лимит)."""
    return f"org:{org_id}:school-create"
