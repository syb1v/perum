"""Биллинг-заглушки (Фаза 9). Без реальных платежей: план организации + лимиты.

План хранится в `organizations.plan`. Лимит — максимум школ на план; проверяется
при провижининге школы. Расширяется до полноценного биллинга позже.
"""

from __future__ import annotations

# Максимум школ на план (стаб). 0 интерпретируется как «без лимита» нигде не нужно.
PLAN_SCHOOL_LIMITS: dict[str, int] = {
    "trial": 1,
    "basic": 5,
    "pro": 50,
    "enterprise": 1000,
}

PLANS = list(PLAN_SCHOOL_LIMITS.keys())


def school_limit(plan: str) -> int:
    return PLAN_SCHOOL_LIMITS.get(plan, PLAN_SCHOOL_LIMITS["trial"])
