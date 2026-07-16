import hashlib
import json
from collections import defaultdict
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.academic import LessonOccurrence, Schedule
from app.models.journal import ControlWork, Grade, Homework, LessonTemplate


def _day(value) -> date | None:
    return value.date() if value is not None and hasattr(value, "date") else value


async def build_plan(db: AsyncSession, school_id: int) -> dict:
    groups: dict[tuple[int, int, date], dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))
    missing: list[dict] = []
    sources = (
        ("grades", Grade, Grade.lesson_date),
        ("lesson_templates", LessonTemplate, LessonTemplate.lesson_date),
        ("control_works", ControlWork, ControlWork.work_date),
    )
    for table, model, date_column in sources:
        rows = (await db.execute(select(model).where(model.school_id == school_id, model.occurrence_id.is_(None)))).scalars().all()
        for row in rows:
            lesson_date = _day(getattr(row, date_column.key))
            if lesson_date is None:
                missing.append({"reason": "missing_legacy_date", "table": table, "ids": [row.id]})
            else:
                groups[(row.class_id, row.subject_id, lesson_date)][table].append(row.id)

    safe: list[dict] = []
    ambiguities = list(missing)
    for (class_id, subject_id, lesson_date), rows in sorted(groups.items(), key=lambda item: (item[0][2], item[0][0], item[0][1])):
        occurrences = (await db.scalars(select(LessonOccurrence).where(
            LessonOccurrence.school_id == school_id,
            LessonOccurrence.class_id == class_id,
            LessonOccurrence.subject_id == subject_id,
            LessonOccurrence.lesson_date == lesson_date,
        ).order_by(LessonOccurrence.id))).all()
        candidate = None
        create = False
        candidates: list[dict] = []
        reason = None
        if len(occurrences) == 1:
            candidate = occurrences[0]
        elif len(occurrences) > 1:
            reason = "multiple_existing_occurrences"
            candidates = [{"occurrence_id": item.id, "lesson_number": item.lesson_number} for item in occurrences]
        else:
            schedules = (await db.scalars(select(Schedule).where(
                Schedule.school_id == school_id,
                Schedule.class_id == class_id,
                Schedule.subject_id == subject_id,
                Schedule.day_of_week == lesson_date.weekday(),
            ).order_by(Schedule.lesson_number, Schedule.id))).all()
            candidates = [{"schedule_id": item.id, "lesson_number": item.lesson_number} for item in schedules]
            if len(schedules) == 1:
                occupied = await db.scalar(select(LessonOccurrence.id).where(
                    LessonOccurrence.school_id == school_id,
                    LessonOccurrence.class_id == class_id,
                    LessonOccurrence.lesson_date == lesson_date,
                    LessonOccurrence.lesson_number == schedules[0].lesson_number,
                ))
                if occupied is not None:
                    reason = "slot_occupied_by_other_subject"
                else:
                    candidate = schedules[0]
                    create = True
            else:
                reason = "no_schedule_candidate" if not schedules else "multiple_schedule_candidates"
        item = {"class_id": class_id, "subject_id": subject_id, "lesson_date": lesson_date.isoformat(), "source_rows": {name: sorted(ids) for name, ids in sorted(rows.items())}, "candidates": candidates}
        if reason:
            ambiguities.append({**item, "reason": reason})
        else:
            safe.append({**item, "create": create, "occurrence_id": None if create else candidate.id, "schedule_id": candidate.id if create else candidate.schedule_id, "lesson_number": candidate.lesson_number})

    legacy_homework = list((await db.scalars(select(Homework.id).where(
        Homework.school_id == school_id,
        Homework.target_occurrence_id.is_(None),
        Homework.due_date.is_not(None),
    ).order_by(Homework.id))).all())
    if legacy_homework:
        ambiguities.append({"reason": "unsupported_homework_semantics", "table": "homework", "ids": legacy_homework[:100], "total_count": len(legacy_homework), "truncated": len(legacy_homework) > 100})
    stable = {"school_id": school_id, "safe": safe, "ambiguities": ambiguities}
    token = "sha256:" + hashlib.sha256(json.dumps(stable, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    rows_to_link = sum(sum(len(ids) for ids in item["source_rows"].values()) for item in safe)
    return {**stable, "plan_token": token, "summary": {"groups": len(groups), "safe_groups": len(safe), "ambiguous_groups": len(ambiguities), "occurrences_to_create": sum(item["create"] for item in safe), "rows_to_link": rows_to_link}}


async def apply_plan(db: AsyncSession, school_id: int, plan_token: str) -> dict:
    plan = await build_plan(db, school_id)
    if plan["plan_token"] != plan_token:
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "BACKFILL_PLAN_CHANGED", "current_plan_token": plan["plan_token"]})
    linked = 0
    created = 0
    for item in plan["safe"]:
        occurrence_id = item["occurrence_id"]
        if item["create"]:
            occurrence = LessonOccurrence(school_id=school_id, class_id=item["class_id"], subject_id=item["subject_id"], schedule_id=item["schedule_id"], lesson_date=date.fromisoformat(item["lesson_date"]), lesson_number=item["lesson_number"])
            db.add(occurrence)
            await db.flush()
            occurrence_id = occurrence.id
            created += 1
        for table, model in (("grades", Grade), ("lesson_templates", LessonTemplate), ("control_works", ControlWork)):
            ids = item["source_rows"].get(table, [])
            if ids:
                result = await db.execute(update(model).where(model.id.in_(ids), model.school_id == school_id, model.occurrence_id.is_(None)).values(occurrence_id=occurrence_id))
                linked += result.rowcount
    await db.commit()
    return {"applied": True, "occurrences_created": created, "rows_linked": linked, "ambiguities": plan["ambiguities"]}
