# Миграция из legacy PERUM

Автоматизированный production migration pipeline в текущем коде не подтверждён.
Нельзя обещать дату, read-only cutover или сохранение конкретных ID без отдельного
audited migration project. Live приоритет хранится в
[PRODUCT_MASTER_PLAN.md](PRODUCT_MASTER_PLAN.md).

## Обязательный процесс

1. Инвентаризировать legacy schema, data quality, attachments, auth hashes,
   retention/legal requirements и активные integrations.
2. Зафиксировать mapping одной legacy school в одну новую school silo и политику
   ID/timezone/financial history.
3. Создать repeatable export-transform-import tool с checkpoint/idempotency.
4. Провести dry run в isolated environment; сверить counts, FK, balances,
   academic history, file checksums и representative UI/API reads.
5. Согласовать freeze window, rollback, user communication и DNS/domain cutover.
6. Выполнить pilot, период наблюдения и только затем staged migration.

Legacy DB credentials и dumps не передаются Core API и не хранятся в repository.
Каждый импорт авторизуется оператором, журналируется и создаёт новый tenant backup
до открытия writes. Исходную систему не удалять до истечения утверждённого rollback
и legal retention периода.
