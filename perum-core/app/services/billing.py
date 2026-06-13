"""Биллинг ядра (R2): план, лимит школ, подписка (trial/paid_until), просрочка,
ручная запись платежа. Структурно готов под платёжный провайдер (ЮKassa) —
Invoice хранит provider/provider_ref, ручной платёж = invoice со status='paid'.
Реальная интеграция с провайдером (создание счёта + webhook) — следующий шаг.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Invoice, Organization, School, Subscription

logger = logging.getLogger("perum.billing")

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
    # Если есть открытые счета (дебиторка, выставленная при просрочке) — закрываем
    # их этой оплатой, а не плодим параллельный «paid» (AUDIT, billing #5): первый
    # открытый становится оплаченным, остальные аннулируются.
    open_invoices = (await db.execute(
        select(Invoice).where(Invoice.org_id == org.id, Invoice.status == "open").order_by(Invoice.id)
    )).scalars().all()
    if open_invoices:
        invoice = open_invoices[0]
        invoice.plan = org.plan
        invoice.amount_rub = amount
        invoice.period_start = base
        invoice.period_end = period_end
        invoice.status = "paid"
        invoice.provider = "manual"
        invoice.paid_at = now
        for extra in open_invoices[1:]:
            extra.status = "void"
    else:
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


async def open_invoice_for(
    db: AsyncSession, org: Organization, sub: Subscription, now: datetime, *, commit: bool = False
) -> Invoice | None:
    """Материализовать дебиторку: открытый счёт на сумму к оплате. Возвращает
    существующий открытый счёт орг, если он есть (идемпотентно), иначе создаёт
    новый. Для бесплатного плана (trial, price=0) долга нет → None.

    Закрывает дыру «платформа не видит, кто и сколько должен» (AUDIT, billing #5):
    до этого Invoice писался только постфактум как 'paid'."""
    price = plan_price(org.plan)
    if price <= 0:
        return None
    existing = (await db.execute(
        select(Invoice).where(Invoice.org_id == org.id, Invoice.status == "open").order_by(Invoice.id)
    )).scalars().first()
    if existing is not None:
        return existing
    base = expires_at(sub) or now
    invoice = Invoice(
        org_id=org.id, plan=org.plan, amount_rub=price,
        period_start=base, period_end=base + timedelta(days=_MONTH_DAYS),
        status="open", provider="manual",
    )
    db.add(invoice)
    if commit:
        await db.commit()
        await db.refresh(invoice)
    else:
        await db.flush()
    return invoice


async def outstanding_total(db: AsyncSession) -> int:
    """Суммарная дебиторка платформы (₽) по всем открытым счетам."""
    return int(await db.scalar(
        select(func.coalesce(func.sum(Invoice.amount_rub), 0)).where(Invoice.status == "open")
    ) or 0)


async def receivables(db: AsyncSession) -> list[dict]:
    """Кто и сколько должен: открытые счета с привязкой к организации."""
    rows = (await db.execute(
        select(Invoice, Organization)
        .join(Organization, Invoice.org_id == Organization.id)
        .where(Invoice.status == "open")
        .order_by(Invoice.id.desc())
    )).all()
    return [
        {
            "invoice_id": iv.id,
            "org_slug": org.slug,
            "org_name": org.name,
            "plan": iv.plan,
            "amount_rub": iv.amount_rub,
            "org_status": org.status,
            "period_start": iv.period_start.isoformat() if iv.period_start else None,
            "period_end": iv.period_end.isoformat() if iv.period_end else None,
            "created_at": iv.created_at.isoformat() if iv.created_at else None,
        }
        for iv, org in rows
    ]


async def run_billing_enforcement(db: AsyncSession) -> dict:
    """Свип просроченных организаций: материализует дебиторку (открытый счёт),
    замораживает стеки школ и саму орг. Идемпотентно (берёт только active-орг).
    Используется и ручным /api/billing/enforce, и фоновым планировщиком (#4)."""
    # Ленивый импорт: school_provisioner не должен затягиваться в граф импорта
    # биллинг-сервиса (его тянут лёгкие auth-зависимости).
    from app.core.locks import keyed_lock, school_key
    from app.services.school_provisioner import suspend_school

    # Лок на весь свип: ручной /api/billing/enforce и фоновый планировщик не должны
    # идти параллельно (иначе оба создадут открытый счёт → дубль дебиторки, и оба
    # будут морозить одни школы). AUDIT-fix review.
    async with keyed_lock("billing:enforce"):
        now = datetime.utcnow()
        orgs = (await db.execute(select(Organization).where(Organization.status == "active"))).scalars().all()
        suspended: list[str] = []
        for org in orgs:
            sub = await get_or_create_subscription(db, org)
            if not is_delinquent(sub, now):
                continue
            await open_invoice_for(db, org, sub, now)  # зафиксировать долг
            schools = (await db.execute(select(School).where(School.org_id == org.id))).scalars().all()
            for s in schools:
                if s.status == "active":
                    try:
                        # Тот же per-school лок, что и у пользовательских lifecycle-операций
                        # (reprovision/update/unsuspend) — чтобы docker-мутации не гонялись.
                        async with keyed_lock(school_key(s.id)):
                            await suspend_school(s, db, reason="org")
                    except Exception as exc:  # noqa: BLE001
                        logger.error("billing enforce: suspend school %s failed: %s", s.slug, exc)
            org.status = "suspended"
            org.suspended_at = now
            sub.status = "past_due"
            sub.updated_at = now
            await db.commit()
            suspended.append(org.slug)
            logger.info("billing enforce: suspended org %s (delinquent)", org.slug)
    return {"checked": len(orgs), "suspended": suspended}
