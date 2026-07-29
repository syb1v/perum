from app.main import _school_route_is_owned_by_node


def test_remote_school_route_is_owned_only_by_assigned_node():
    node_map = {2: "87.120.196.143"}

    assert _school_route_is_owned_by_node(2, node_map) is True
    assert _school_route_is_owned_by_node(3, node_map) is False
