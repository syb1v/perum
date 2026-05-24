"""Tenant-side models live in org_<slug>_db.

Phase 1 ships only `TenantMeta` — a tiny key/value table that gives the first
migration something real to create and proves app↔db writes work. The full
domain models (Organization meta, School, User, academic, journal, market, …)
arrive from Phase 2 onward.
"""

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class TenantMeta(Base):
    __tablename__ = "tenant_meta"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(255), nullable=False)
