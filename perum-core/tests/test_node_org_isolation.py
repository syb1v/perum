import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.routers.nodes import get_org_node, get_org_node_utilization, list_org_nodes


class _Scalars:
    def all(self):
        return []


class _Result:
    def scalars(self):
        return _Scalars()


class _NodeDb:
    def __init__(self, node=None):
        self.node = node
        self.query = None

    async def execute(self, query):
        self.query = query
        return _Result()

    async def get(self, _model, _key):
        return self.node


def test_org_node_list_is_scoped_by_admin_org_id():
    db = _NodeDb()
    admin = SimpleNamespace(id=7, org_id=42)

    response = asyncio.run(list_org_nodes(db=db, admin=admin))

    assert response.total == 0
    sql = str(db.query.compile(compile_kwargs={"literal_binds": True}))
    assert "nodes.org_id = 42" in sql
    assert "nodes.org_id = 7" not in sql


@pytest.mark.parametrize("endpoint", [get_org_node, get_org_node_utilization])
def test_org_node_detail_rejects_node_matching_admin_id_but_not_org_id(endpoint):
    db = _NodeDb(node=SimpleNamespace(id=1, org_id=7))
    admin = SimpleNamespace(id=7, org_id=42)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(endpoint(node_id=1, db=db, admin=admin))

    assert exc.value.status_code == 404
