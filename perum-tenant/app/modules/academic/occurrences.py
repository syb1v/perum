from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Class, LessonOccurrence, Schedule, Subject


async def get_or_create_occurrence(
    db: AsyncSession, school_id: int, class_id: int, subject_id: int,
    lesson_date: date, lesson_number: int,
) -> LessonOccurrence:
    occurrence = await db.scalar(select(LessonOccurrence).where(
        LessonOccurrence.school_id == school_id,
        LessonOccurrence.class_id == class_id,
        LessonOccurrence.lesson_date == lesson_date,
        LessonOccurrence.lesson_number == lesson_number,
    ))
    if occurrence is not None:
        if occurrence.subject_id != subject_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "Слот урока уже занят другим предметом")
        return occurrence
    cls = await db.get(Class, class_id)
    subject = await db.get(Subject, subject_id)
    if cls is None or cls.school_id != school_id or subject is None or subject.school_id != school_id or subject.is_archived:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Класс или предмет не найден")
    schedule = await db.scalar(select(Schedule).where(
        Schedule.school_id == school_id, Schedule.class_id == class_id,
        Schedule.subject_id == subject_id, Schedule.day_of_week == lesson_date.weekday(),
        Schedule.lesson_number == lesson_number,
    ).with_for_update())
    if schedule is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Урок не соответствует расписанию")
    occurrence = await db.scalar(select(LessonOccurrence).where(
        LessonOccurrence.school_id == school_id,
        LessonOccurrence.class_id == class_id,
        LessonOccurrence.lesson_date == lesson_date,
        LessonOccurrence.lesson_number == lesson_number,
    ))
    if occurrence is not None:
        if occurrence.subject_id != subject_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "Слот урока уже занят другим предметом")
        return occurrence
    occurrence = LessonOccurrence(
        school_id=school_id, class_id=class_id, subject_id=subject_id,
        schedule_id=schedule.id, lesson_date=lesson_date, lesson_number=lesson_number,
        teacher_id=schedule.teacher_id,
    )
    db.add(occurrence)
    await db.flush()
    return occurrence
