"""Livki (points) calculation — ported from legacy app/services/points_calculator.py.

base_points × category_coef × weight × profile_bonus
"""

from __future__ import annotations

GRADE_POINTS = {5: 25, 4: 10, 3: -5, 2: -20, 1: -30}

CATEGORY_COEFFICIENTS = {"profile": 1.3, "normal": 1.0, "minor": 0.5}

#: grade value → display colour (hex), matching the legacy journal.
GRADE_COLORS = {5: "#4CAF50", 4: "#8BC34A", 3: "#FF9800", 2: "#F44336", 1: "#B71C1C"}


def calculate_points(
    grade_value: int | None,
    subject_category: str,
    weight: float,
    profile_weight: float,
    is_profile_track: bool,
    class_is_profile: bool,
) -> int:
    if grade_value is None:
        return 0
    base = GRADE_POINTS.get(grade_value, 0)
    category_coef = CATEGORY_COEFFICIENTS.get(subject_category, 1.0) if class_is_profile else 1.0
    profile_bonus = profile_weight if (class_is_profile and is_profile_track) else 1.0
    return int(round(base * category_coef * weight * profile_bonus))


def grade_color(grade_value: int | None, attendance_mark: str | None = None) -> str | None:
    if grade_value is not None:
        return GRADE_COLORS.get(grade_value)
    if attendance_mark:
        return "#9E9E9E"
    return None
