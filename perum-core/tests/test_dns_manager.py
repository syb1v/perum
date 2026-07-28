from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services.dns_manager import DnsManager, DnsRecord


class _Scalars:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def scalars(self):
        return _Scalars(self.rows)


@pytest.mark.asyncio
async def test_sync_org_dns_deletes_only_records_owned_by_schools():
    manager = DnsManager()
    manager._enabled = True
    manager.list_records = AsyncMock(return_value=[
        DnsRecord("example.org", "example.org", "A", "192.0.2.1", "", "apex-id"),
        DnsRecord("admin", "admin.example.org", "A", "192.0.2.1", "", "admin-id"),
        DnsRecord("old", "old.example.org", "A", "192.0.2.2", "", "school-id"),
    ])
    manager.delete_record = AsyncMock(return_value=True)
    school = SimpleNamespace(id=1, subdomain=None, cf_record_id="school-id")
    db = SimpleNamespace(execute=AsyncMock(return_value=_Result([school])))
    org = SimpleNamespace(id=1, domain="example.org", cf_zone_id="zone-id")

    result = await manager.sync_org_dns(org, db)

    manager.delete_record.assert_awaited_once_with("zone-id", "school-id")
    assert result.deleted == 1
