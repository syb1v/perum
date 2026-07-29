import asyncio
from types import SimpleNamespace

from app.services.node_monitor import _reconcile_landing_status


class Scalars:
    def __init__(self, values):
        self.values = values

    def all(self):
        return self.values


class Result:
    def __init__(self, values):
        self.values = values

    def scalars(self):
        return Scalars(self.values)


class DB:
    def __init__(self, organizations):
        self.organizations = organizations
        self.commits = 0

    async def execute(self, statement):
        return Result(self.organizations)

    async def commit(self):
        self.commits += 1


def test_landing_status_reconciles_from_agent_observation():
    async def run():
        active = SimpleNamespace(domain="active.example", landing_status="failed")
        failed = SimpleNamespace(domain="failed.example", landing_status="active")
        untouched = SimpleNamespace(domain="unknown.example", landing_status="pending")
        db = DB([active, failed, untouched])
        node = SimpleNamespace(id=7)

        await _reconcile_landing_status(node, [
            {"domain": "ACTIVE.EXAMPLE", "running": True, "routed": True},
            {"domain": "failed.example", "running": True, "routed": False},
        ], db)

        assert active.landing_status == "active"
        assert failed.landing_status == "failed"
        assert untouched.landing_status == "pending"
        assert db.commits == 1

    asyncio.run(run())


def test_empty_landing_observation_does_not_overwrite_status():
    async def run():
        org = SimpleNamespace(domain="example.test", landing_status="active")
        db = DB([org])

        await _reconcile_landing_status(SimpleNamespace(id=1), [], db)

        assert org.landing_status == "active"
        assert db.commits == 0

    asyncio.run(run())
