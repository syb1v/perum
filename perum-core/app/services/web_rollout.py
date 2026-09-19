from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Node, NodeAssignment, Organization, School
from app.core.config import get_settings
from app.services.remote_node_client import RemoteNodeClient


async def rollout_web_to_active_organization_nodes(image: str, db: AsyncSession) -> dict:
    active_orgs = await db.scalar(select(func.count()).select_from(Organization).where(Organization.status == "active"))
    nodes = (
        await db.execute(
            select(Node)
            .where(
                Node.status == "active",
                Node.enabled.is_(True),
                or_(
                    exists(
                        select(Organization.id).where(
                            or_(Organization.id == Node.org_id, Organization.node_id == Node.id),
                            Organization.status == "active",
                        )
                    ),
                    exists(
                        select(NodeAssignment.id)
                        .join(School, School.id == NodeAssignment.school_id)
                        .join(Organization, Organization.id == School.org_id)
                        .where(
                            NodeAssignment.node_id == Node.id,
                            Organization.status == "active",
                        )
                    ),
                ),
            )
            .order_by(Node.id)
        )
    ).scalars().all()
    if active_orgs and not nodes:
        return {
            "success": False,
            "image": image,
            "nodes_total": 0,
            "nodes_succeeded": 0,
            "nodes_failed": 1,
            "receipts": [{"success": False, "message": "active organizations have no eligible workload nodes"}],
        }
    client = RemoteNodeClient(timeout=300.0)
    deadline_raw = getattr(get_settings(), "WEB_ROLLOUT_LEGACY_DEADLINE", "")
    deadline = None
    if deadline_raw:
        try:
            deadline = datetime.fromisoformat(deadline_raw.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("WEB_ROLLOUT_LEGACY_DEADLINE must be an ISO-8601 timestamp") from exc
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
    legacy_pending_allowed = deadline is not None and datetime.now(timezone.utc) < deadline

    async def rollout(node: Node) -> dict:
        if getattr(node, "web_rollout_version", None) != "web_rollout_v1":
            return {
                "node_id": node.id,
                "hostname": node.hostname,
                "success": legacy_pending_allowed,
                "pending": legacy_pending_allowed,
                "image": image,
                "message": (
                    "node is pending Agent Web rollout capability transition"
                    if legacy_pending_allowed
                    else "node lacks required Agent Web rollout capability"
                ),
            }
        try:
            receipt = await client.rollout_web(node, image)
            if receipt.get("image") != image:
                return {"node_id": node.id, "success": False, "message": "agent returned an invalid rollout receipt"}
            receipt["message"] = None if receipt.get("success") is True else "agent reported rollout failure"
            return {"node_id": node.id, "hostname": node.hostname, **receipt}
        except Exception:
            return {
                "node_id": node.id,
                "hostname": node.hostname,
                "success": False,
                "image": image,
                "rolled_back": False,
                "protected_containers_unchanged": False,
                "routes_resynced": False,
                "message": "agent rollout request failed",
            }

    receipts = await asyncio.gather(*(rollout(node) for node in nodes))
    allowed = {
        "success", "image", "previous_image_id", "deployed_image_id", "rolled_back",
        "protected_containers_unchanged", "routes_resynced", "pending", "message",
    }
    receipts = [
        {"node_id": receipt["node_id"], **{key: value for key, value in receipt.items() if key in allowed}}
        for receipt in receipts
    ]
    succeeded = sum(
        receipt.get("success") is True and receipt.get("pending") is not True
        for receipt in receipts
    )
    pending = sum(receipt.get("pending") is True for receipt in receipts)
    failed = sum(receipt.get("success") is not True for receipt in receipts)
    return {
        "success": failed == 0,
        "image": image,
        "nodes_total": len(receipts),
        "nodes_succeeded": succeeded,
        "nodes_failed": failed,
        "nodes_pending": pending,
        "receipts": receipts,
    }
