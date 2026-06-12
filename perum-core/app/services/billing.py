"""Биллинг ядра (R2): план, лимит школ, подписка (trial/paid_until), просрочка,
ручная запись платежа. Структурно готов под платёжный провайдер (ЮKassa) —
Invoice хранит provider/provider_ref, ручной платёж = invoice со status='paid'.
Реальная интеграция с провайдером (создание счёта + webhook) — следующий шаг.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Invoice, Organization, Subscription

# Максимум школ на план.
PLAN_SCHOOL_LIMITS: dict[str, int] = {
    "trial": 1,
    "basic": 5,
    "pro": 50,
    "enterprise": 1000,
}

# Цена плана, ₽/мес (для счетов). trial бесплатен.
PLAN_PRICES_RUB: dict[str, int] = {
    "trial": 0,
    "basic": 2900,
    "pro": 9900,
    "enterprise": 49900,
}

PLANS = list(PLAN_SCHOOL_LIMITS.keys())

TRIAL_DAYS = 14      # длительность пробного периода новой организации
GRACE_DAYS = 3       # отсрочка после истечения оплаты, прежде чем считать просроченной
_MONTH_DAYS = 30     # упрощённый «месяц» для продления подписки


def school_limit(plan: str) -> int:
    return PLAN_SCHOOL_LIMITS.get(plan, PLAN_SCHOOL_LIMITS["trial"])


def plan_price(plan: str) -> int:
    return PLAN_PRICES_RUB.get(plan, 0)


def expires_at(sub: Subscription) -> datetime | None:
    """Дата, до которой подписка действительна: оплачено-до либо конец триала."""
    if sub.paid_until is not None:
        return sub.paid_until
    return sub.trial_ends_at


def is_delinquent(sub: Subscription | None, now: datetime, grace_days: int = GRACE_DAYS) -> bool:
    """Просрочена ли подписка (с учётом отсрочки). Нет подписки/нет срока → нет."""
    if sub is None:
        return False
    if sub.status == "canceled":
        return True
    exp = expires_at(sub)
    if exp is None:
        return False
    return now > exp + timedelta(days=grace_days)


def billing_state(sub: Subscription | None, now: datetime) -> dict:
    exp = expires_at(sub) if sub else None
    days_left = int((exp - now).total_seconds() // 86400) if exp else None
    return {
        "status": sub.status if sub else "none",
        "trial_ends_at": sub.trial_ends_at.isoformat() if sub and sub.trial_ends_at else None,
        "paid_until": sub.paid_until.isoformat() if sub and sub.paid_until else None,
        "expires_at": exp.isoformat() if exp else None,
        "days_left": days_left,
        "delinquent": is_delinquent(sub, now),
    }


async def get_or_create_subscription(db: AsyncSession, org: Organization, *, commit: bool = True) -> Subscription:
    """Подписка организации; при отсутствии заводит пробную (trial на TRIAL_DAYS).
    Устойчиво к гонке двух одновременных создателей (PK org_id): при конфликте
    откатываемся и перечитываем существующую запись."""
    sub = await db.get(Subscription, org.id)
    if sub is not None:
        return sub
    now = datetime.utcnow()
    sub = Subscription(
        org_id=org.id, status="trial", trial_ends_at=now + timedelta(days=TRIAL_DAYS),
    )
    db.add(sub)
    try:
        if commit:
            await db.commit()
            await db.refresh(sub)
        else:
            await db.flush()
    except IntegrityError:
        # Параллельный запрос уже создал подписку — берём её.
        await db.rollback()
        existing = await db.get(Subscription, org.id)
        if existing is None:
            raise
        return existing
    return sub


async def record_payment(db: AsyncSession, org: Organization, sub: Subscription, months: int) -> Invoice:
    """Ручная отметка оплаты: продлевает paid_until на months «месяцев», переводит
    подписку в active и создаёт оплаченный счёт (аудит-след). Для провайдера позже
    счёт будет создаваться открытым и закрываться по webhook."""
    months = max(1, int(months))
    now = datetime.utcnow()
    base = max(now, sub.paid_until or now)
    period_end = base + timedelta(days=_MONTH_DAYS * months)
    amount = plan_price(org.plan) * months
    invoice = Invoice(
        org_id=org.id, plan=org.plan, amount_rub=amount,
        period_start=base, period_end=period_end,
        status="paid", provider="manual", paid_at=now,
    )
    db.add(invoice)
    sub.paid_until = period_end
    sub.status = "active"
    sub.updated_at = now
    await db.commit()
    await db.refresh(invoice)
    return invoice
