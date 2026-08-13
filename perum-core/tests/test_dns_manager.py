import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx

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


def test_sync_org_dns_deletes_only_records_owned_by_schools():
    async def run():
        manager = DnsManager()
        manager._enabled = True
        manager.list_records = AsyncMock(return_value=[
            DnsRecord("example.org", "example.org", "A", "192.0.2.1", "", "apex-id"),
            DnsRecord("admin", "admin.example.org", "A", "192.0.2.1", "", "admin-id"),
            DnsRecord("old", "old.example.org", "A", "192.0.2.2", "", "school-id"),
        ])
        manager.delete_record = AsyncMock(return_value=True)
        school = SimpleNamespace(id=1, subdomain=None, cf_record_id="school-id")
        db = SimpleNamespace(execute=AsyncMock(return_value=_Result([school])), commit=AsyncMock())
        org = SimpleNamespace(id=1, domain="example.org", cf_zone_id="zone-id", node_id=None)

        result = await manager.sync_org_dns(org, db)

        manager.delete_record.assert_awaited_once_with("zone-id", "school-id")
        assert result.deleted == 1

    asyncio.run(run())


def test_create_record_posts_dns_only_ipv4_a():
    async def run():
        manager = DnsManager()
        manager._enabled = True
        response = httpx.Response(
            200,
            request=httpx.Request("POST", "https://api.cloudflare.com/client/v4/zones/zone-id/dns_records"),
            json={"success": True, "result": {"id": "record-id"}},
        )
        client = SimpleNamespace(post=AsyncMock(return_value=response))
        manager._cf = AsyncMock(return_value=client)

        record = await manager.create_record("zone-id", "school-1", "example.org", "192.0.2.10")

        assert record.cf_record_id == "record-id"
        client.post.assert_awaited_once_with(
            "/zones/zone-id/dns_records",
            json={
                "type": "A",
                "name": "school-1.example.org",
                "content": "192.0.2.10",
                "ttl": 1,
                "proxied": False,
            },
        )

    asyncio.run(run())


def test_create_record_rejects_non_ipv4_target():
    async def run():
        manager = DnsManager()
        manager._enabled = True
        manager._cf = AsyncMock()

        record = await manager.create_record("zone-id", "school-1", "example.org", "node.example.org")

        assert record.status == "error"
        manager._cf.assert_not_awaited()

    asyncio.run(run())


def test_sync_org_dns_updates_school_and_apex_to_dns_only():
    async def run():
        manager = DnsManager()
        manager._enabled = True
        school_record = DnsRecord(
            "school-1", "school-1.example.org", "A", "192.0.2.1", "", "school-id", True,
        )
        apex_record = DnsRecord(
            "example.org", "example.org", "A", "192.0.2.1", "", "apex-id", True,
        )
        manager.list_records = AsyncMock(return_value=[school_record, apex_record])
        manager.update_record = AsyncMock(return_value=True)
        manager.delete_record = AsyncMock(return_value=True)
        school = SimpleNamespace(id=1, subdomain="school-1", cf_record_id="school-id")
        assignment = SimpleNamespace(node_id=2)
        node = SimpleNamespace(id=2, hostname="192.0.2.10", name="Node 1")

        async def scalar(_query):
            return assignment

        async def get(model, object_id):
            return node if object_id == 2 else None

        db = SimpleNamespace(
            execute=AsyncMock(return_value=_Result([school])),
            scalar=scalar,
            get=get,
            commit=AsyncMock(),
        )
        org = SimpleNamespace(id=1, domain="example.org", cf_zone_id="zone-id", node_id=2)

        result = await manager.sync_org_dns(org, db)

        assert result.synced == 2
        assert result.errors == []
        assert school_record.content == "192.0.2.10"
        assert school_record.proxied is False
        assert apex_record.content == "192.0.2.10"
        assert apex_record.proxied is False
        assert manager.update_record.await_count == 2
        manager.create_record = AsyncMock()

    asyncio.run(run())


def test_sync_org_dns_creates_missing_apex_and_persists_school_record_id():
    async def run():
        manager = DnsManager()
        manager._enabled = True
        manager.list_records = AsyncMock(return_value=[])
        school_created = DnsRecord(
            "school-1", "school-1.example.org", "A", "192.0.2.10", "Node 1", "school-id",
        )
        apex_created = DnsRecord(
            "", "example.org", "A", "192.0.2.10", "Node 1", "apex-id",
        )
        manager.create_record = AsyncMock(side_effect=[school_created, apex_created])
        manager.delete_record = AsyncMock(return_value=True)
        school = SimpleNamespace(id=1, subdomain="school-1", cf_record_id=None)
        assignment = SimpleNamespace(node_id=2)
        node = SimpleNamespace(id=2, hostname="192.0.2.10", name="Node 1")

        async def scalar(_query):
            return assignment

        async def get(model, object_id):
            return node if object_id == 2 else None

        db = SimpleNamespace(
            execute=AsyncMock(return_value=_Result([school])),
            scalar=scalar,
            get=get,
            commit=AsyncMock(),
        )
        org = SimpleNamespace(id=1, domain="example.org", cf_zone_id="zone-id", node_id=2)

        result = await manager.sync_org_dns(org, db)

        assert result.synced == 2
        assert school.cf_record_id == "school-id"
        assert manager.create_record.await_args_list[1].args[:4] == (
            "zone-id", "", "example.org", "192.0.2.10",
        )

    asyncio.run(run())
