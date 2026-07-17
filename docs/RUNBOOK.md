# Операционный runbook

Документ не содержит production coordinates или credentials. Получите временный
least-privilege access, host inventory и секреты из approved secret manager и
внешнего operator runbook.

## Control plane deploy

1. Убедитесь, что CI зелёный для нужного commit. Текущий SSH workflow публикует
   immutable `git-<sha>`, но deploy использует mutable `latest` и `git pull`; он не
   гарантирует, что checkout и image совпадают с инициировавшим workflow SHA.
   Не запускайте параллельные deploy и перед миграциями вручную зафиксируйте
   фактически pulled image digests и checkout commit.
2. Сделайте backup control DB и проверьте restore point.
3. На host используйте repository checkout и production env вне VCS:

```bash
docker compose --env-file deploy/.env.prod \
  -f deploy/docker-compose.core.yml -f deploy/docker-compose.prod.yml pull perum_core perum_web
docker compose --env-file deploy/.env.prod \
  -f deploy/docker-compose.core.yml -f deploy/docker-compose.prod.yml up -d perum_core perum_web
```

Core command выполняет `alembic upgrade head` перед `uvicorn`. Проверьте health,
login, Caddy routes и metrics. Автоматический SSH deploy выполняет тот же compose
flow только при `DEPLOY_ENABLED=true`; детали в [RELEASING.md](RELEASING.md).

## Tenant update и rollback

Tenant release регистрируется Core после CI publication. `org_admin` проверяет
changelog/update status и запускает opt-in update одной школы. Наблюдайте переход
status и health. Provisioner сохраняет DB/appdata volumes и при app failure
пытается вернуть прежний image. После rollback проверьте совместимость DB migration;
не выполняйте downgrade schema без явно подготовленной migration strategy.

## Backup и restore

- Backup включает control DB, каждую school DB, school appdata и конфигурационные
  metadata/secrets из approved store.
- Шифруйте backup, ограничивайте retention/access и проверяйте restore регулярно.
- Restore школы: остановить writes/app, восстановить DB и appdata в isolated
  volumes, применить совместимые migrations, запустить app, проверить identity,
  auth и sample data до возврата routing.
- Purge разрешён только после проверенного backup; failure переводит действие в
  безопасный archive/failure state.

## Incidents

При возможной утечке: ограничьте affected route/account/node, сохраните immutable
logs и snapshots, определите school/organization scope, уведомите owner, ротируйте
tokens/keys/sessions и документируйте timeline. Не удаляйте контейнеры/volumes до
снятия evidence. Если credential когда-либо попал в repository или conversation,
считайте его скомпрометированным и ротируйте во всех системах.

При node offline проверьте Core monitor, network ACL/DNS, worker health/logs,
registry access, disk pressure и Docker daemon. Не перезапускайте все school stacks
до оценки impact. Node bootstrap: [NODE_DEPLOYMENT.md](NODE_DEPLOYMENT.md).

## Required external configuration

GitHub variables/secrets, production env, DNS/provider tokens, encryption keys,
metrics credentials, registry auth, SSH deploy access, mobile store/EAS credentials
и backup keys создаются операторами вне VCS. Значения должны ротироваться по policy.
Core production validation требует непустые `SECRET_KEY`, `ENCRYPTION_KEY`,
`PLATFORM_ADMIN_PASSWORD`, `AGENT_TOKEN` и разрешённый `CORS_ORIGINS`; сверяйте
полный набор с `perum-core/app/core/config.py`, даже если remote nodes ещё не
используются. Example env не заменяет startup validation.
