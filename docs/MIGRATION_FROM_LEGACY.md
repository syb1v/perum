# Migration from Legacy PERUM (stub)

> Документ — заглушка. Реальный план миграции с `пэрум.рф` на новую систему будет написан после Phase 11. Сейчас зафиксирована только общая стратегия.

## Стратегия

Принято решение: **новая система для новых клиентов, старая в read-only**. Старый PERUM (`/home/sybiv/Рабочий стол/PERUM`, домен `пэрум.рф`) продолжает работать без новых фич ~6 месяцев. Новые организации регистрируются только в новой системе.

После Phase 11 (production launch новой системы) оценивается:

1. Сколько клиентов осталось в legacy.
2. Готовы ли они переходить (UX, цена, мотивация).
3. Стоимость поддержки двух систем vs стоимость миграционного скрипта.

Если миграция оправдана — пишется `legacy_migrator.py` в `perum-core/app/services/`.

## Структура миграционного скрипта (когда будет)

```python
async def migrate_school_from_legacy(
    legacy_db_url: str,
    new_org_slug: str,
    legacy_school_id: int,
    new_school_name: str,
):
    # 1. pg_dump legacy DB по фильтру school_id = legacy_school_id
    # 2. Создать новую организацию в perum_control (если нет)
    # 3. Создать новую School внутри org-стека
    # 4. Маппинг: legacy User.id → new User.id (сохраняем для preservation истории)
    # 5. Импорт по таблицам в порядке зависимостей:
    #    - User
    #    - Class, Subject, AcademicYear
    #    - TeacherSubject, ClassStudent
    #    - Schedule, BellSchedule
    #    - Grade, FinalGrade, Topic, WorkType
    #    - Homework, ControlWork
    #    - Transaction, Quest, UserQuest
    #    - ShopItem, UserInventory, MarketDeliveryCode
    #    - Investment, SubjectAverage, TradingWindow
    #    - News, GradeAppeal, ContactInquiry
    #    - ParentStudent, PageVisit
    # 6. Перепривязка cross-table FKs через mapping
    # 7. Валидация: количество записей, sample comparison
    # 8. Cutover: DNS legacy школьного поддомена → новая система
    # 9. Установка read-only режима для этой школы в legacy
```

## Что предстоит решить

- **ID-сохранение vs ID-rewriting.** Сохранять старые ID (UX-предсказуемость) vs autoincrement (проще). Скорее всего sохранение для оценок и пользователей, autoincrement для остального.
- **Что делать со старым PERUM после миграции последней школы.** Архивировать БД, выключить контейнеры, сохранить дамп S3 на N лет (legal requirement?).
- **Поведение URL.** Старые URL вида `пэрум.рф/student/journal/...` → 301 redirect на `<org>.perum.ru/...` или хостинг старого UI как archive read-only.

## Не делать пока

- Не писать миграционный скрипт сейчас. Сначала закончить Phase 11. Возможно, миграция не понадобится вовсе.
- Не модифицировать legacy PERUM кроме критических багфиксов.
- Не пытаться запустить старый и новый код в одном процессе.

## Когда обновлять этот документ

После Phase 11, когда:
- Прод новой системы стабилен.
- Есть pilot-орг с реальными данными.
- Известно количество и желание legacy-клиентов мигрировать.

До этого — текущий stub.
