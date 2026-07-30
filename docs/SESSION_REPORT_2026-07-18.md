# Отчёт о сессии 2026-07-18

> **Исторический статус:** это снимок handoff на 2026-07-18. Его body намеренно не
> обновляется и содержит статусы/счётчики, superseded последующими изменениями.
> Единственный текущий источник статуса и roadmap:
> [PRODUCT_MASTER_PLAN.md](PRODUCT_MASTER_PLAN.md).

## Выполнено

- Подготовлен Stage F pilot checklist; pilot отложен на `11/12`.
- Реализованы durable support read cursor и offline support ticket creation.
- Реализован durable direct-chat read cursor.
- Завершён Friends hardening: audit/telemetry, pagination/isolation, fail-closed
  rollout и 30-дневная read-only история после school shutdown.
- Реализованы Native Friends UI и controlled rollout: platform grant, отдельный
  org enable, revoke reset, generation fencing, app swap/rollback и heartbeat.
- Зафиксированы prerequisites отложенных Stage F и Homework conflict QA.

## Решения

- Platform revoke использует bounded convergence без lease и сбрасывает
  `org_enabled=false`; новый grant требует повторного org enable.
- Operator shutdown не запускает удаление истории.
- School shutdown оставляет историю read-only на 30 дней; re-enable отменяет
  удаление, moderation hold сохраняет evidence.
- Юридические ADR отложены до профильного владельца.

## Проверки

- Core full pytest: `173 passed`.
- Tenant full unit pytest: `113 passed`.
- Mobile tests: `71 passed`; shared API client: `14 passed`.
- Web/mobile TypeScript и web production build: passed.
- Core/Tenant Alembic single-head и OpenAPI parity: passed.

## Осталось

- Production media scanner и attachment pilot.
- Native school support admin inbox и delivery observability.
- Stage F pilot и Homework multi-device QA после внешних prerequisites.
- Реальный local/remote Docker controlled-rollout pilot; automation готова, но
  production evidence не собрано.

Порядок продолжения: [REMAINING_MEDIA_SUPPORT_PLAN.md](REMAINING_MEDIA_SUPPORT_PLAN.md).
