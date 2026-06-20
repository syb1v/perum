"""Capacity planning и планирование нод для размещения школ."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Node, NodeAssignment, Organization, School
from app.schemas.node import (
    CapacityRecommendationResponse,
    NodeConfig,
    NodeUtilizationResponse,
)

logger = logging.getLogger("perum.node_planner")


@dataclass
class NodeResources:
    cpu_cores: int
    ram_gb: float
    disk_gb: float
    schools_per_node: int


NODE_TIERS = [
    NodeResources(cpu_cores=2, ram_gb=2.0, disk_gb=20.0, schools_per_node=5),
    NodeResources(cpu_cores=4, ram_gb=4.0, disk_gb=50.0, schools_per_node=15),
    NodeResources(cpu_cores=8, ram_gb=8.0, disk_gb=100.0, schools_per_node=35),
    NodeResources(cpu_cores=16, ram_gb=16.0, disk_gb=200.0, schools_per_node=75),
]


class NodePlanner:
    SCHOOL_RAM_MB = 192
    SCHOOL_CPU_CORES = 0.15
    SCHOOL_DISK_MB = 500
    NODE_OVERHEAD_RAM_MB = 1024
    NODE_OVERHEAD_CPU = 0.5
    SAFETY_MARGIN = 0.8

    def __init__(self, db: AsyncSession):
        self.db = db

    def calculate_capacity(self, node: Node) -> int:
        available_ram_mb = (node.ram_gb * 1024 - self.NODE_OVERHEAD_RAM_MB) * self.SAFETY_MARGIN
        available_cpu = (node.cpu_cores - self.NODE_OVERHEAD_CPU) * self.SAFETY_MARGIN

        by_ram = int(available_ram_mb / self.SCHOOL_RAM_MB)
        by_cpu = int(available_cpu / self.SCHOOL_CPU_CORES)

        return min(by_ram, by_cpu, node.max_schools)

    async def get_utilization(self, node: Node) -> NodeUtilizationResponse:
        result = await self.db.execute(
            select(func.count()).select_from(NodeAssignment).where(NodeAssignment.node_id == node.id)
        )
        schools_count = result.scalar() or 0

        max_capacity = self.calculate_capacity(node)
        capacity_percent = (schools_count / max_capacity * 100) if max_capacity > 0 else 100.0

        return NodeUtilizationResponse(
            node_id=node.id,
            schools_count=schools_count,
            max_schools=max_capacity,
            capacity_percent=round(capacity_percent, 1),
            ram_used_gb=None,
            cpu_used_percent=None,
            disk_used_gb=None,
        )

    async def find_best_node(self, org_id: int | None = None) -> Node | None:
        # enabled=False — нода выключена оператором (визуально): не назначаем на неё школы.
        query = select(Node).where(Node.status == "active", Node.enabled.is_(True))
        if org_id is not None:
            query = query.where((Node.org_id == org_id) | (Node.org_id.is_(None)))

        result = await self.db.execute(query)
        nodes = result.scalars().all()

        if not nodes:
            return None

        best_node = None
        best_score = -1

        for node in nodes:
            util = await self.get_utilization(node)
            if util.schools_count >= util.max_schools:
                continue
            score = util.max_schools - util.schools_count
            if score > best_score:
                best_score = score
                best_node = node

        return best_node

    def recommend(self, school_count: int) -> CapacityRecommendationResponse:
        recommendations = []

        for tier in NODE_TIERS:
            nodes_needed = (school_count + tier.schools_per_node - 1) // tier.schools_per_node
            recommendations.append(
                NodeConfig(
                    cpu_cores=tier.cpu_cores,
                    ram_gb=tier.ram_gb,
                    disk_gb=tier.disk_gb,
                    schools_per_node=tier.schools_per_node,
                    nodes_needed=nodes_needed,
                )
            )

        if school_count <= 10:
            summary = f"Для {school_count} школ рекомендуется 1 нода S (2/2/20)"
        elif school_count <= 30:
            summary = f"Для {school_count} школ рекомендуется 1-2 ноды M (4/4/50)"
        elif school_count <= 100:
            summary = f"Для {school_count} школ рекомендуется 2-3 ноды L (8/8/100)"
        else:
            summary = f"Для {school_count} школ рекомендуется кластер из {recommendations[-1].nodes_needed} нод XL"

        return CapacityRecommendationResponse(
            recommendations=recommendations,
            total_schools=school_count,
            summary=summary,
        )

    async def check_org_limits(self, org: Organization) -> dict:
        schools_count = await self.db.scalar(
            select(func.count()).select_from(School).where(School.org_id == org.id)
        ) or 0

        nodes_count = await self.db.scalar(
            select(func.count()).select_from(Node).where(Node.org_id == org.id, Node.status != "decommissioned")
        ) or 0

        return {
            "schools": {"used": schools_count, "limit": org.max_schools, "exceeded": schools_count >= org.max_schools},
            "nodes": {"used": nodes_count, "limit": org.max_nodes, "exceeded": nodes_count >= org.max_nodes},
            "custom_domains": {"limit": org.max_custom_domains},
            "custom_landing": {"enabled": org.custom_landing_enabled},
        }
