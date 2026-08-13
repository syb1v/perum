# Операционный runbook

Документ не содержит production coordinates или credentials. Получите временный
least-privilege access, host inventory и секреты из approved secret manager и
внешнего operator runbook.

## Control plane deploy

GitHub Environment `production` должен содержать SSH credentials хоста, а сам
production checkout — отдельный read-only deploy key к репозиторию для исходящего
`git fetch`. Это разные направления доступа; входящий `DEPLOY_SSH_KEY` не даёт
серверу права читать GitHub. Repository variables и production `.env.prod` обязаны
содержать один и тот же punycode `PUBLIC_BASE_DOMAIN`.
Canonical GitHub contract хранит `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, optional
`DEPLOY_SSH_PORT` и required `DEPLOY_PATH` как variables; единственный SSH secret workflow —
`DEPLOY_SSH_KEY`. Не переносите host или path в secrets.

1. Убедитесь, что CI зелёный для нужного commit. Release публикует immutable
   `git-<sha>` images, а production deploy detached-checkout-ит тот же SHA и
   передаёт соответствующие image refs в Compose. Не используйте `latest` как
   deployment identity.
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

До создания или reprovision школы проверьте четыре инварианта:

1. В Core существует ровно один current stable release с immutable
   `ghcr.io/.../perum-tenant:git-<sha>` или digest image, `source_commit` и
   descriptor manifest.
2. Target node успешно выполняет `docker pull` этого exact image. Не используйте
   semver tag, если workflow его фактически не публиковал, и не используйте
   `latest` как provisioning identity.
3. `TENANT_IMAGE` в node env совпадает с current release и служит только fallback;
   после изменения env Agent должен быть пересоздан и снова стать healthy.
4. На host-network Caddy убедитесь, что school host присутствует в TLS server, а
   общий `perum_web` доступен из Caddy. Проверяйте отдельно HTTPS `/health` (Tenant)
   и `/` (Web), certificate SAN/expiry и фактический image school app.

Agent не должен подключаться к `school_<slug>_net`: это нарушает межшкольную
изоляцию. Внутренние Core→Tenant операции выполняются Agent через Docker exec
внутри app container к loopback. Ошибка `Temporary failure in name resolution`
означает старый Agent image с прямым Docker-DNS вызовом; обновите Agent, а не
подключайте его к каждой school network и не публикуйте `/internal` через Caddy.

Node Caddy работает в host network и не должен получать upstream вида
`school_<slug>_app:3000` или `perum_web:3000`: host resolver не видит Docker DNS,
что проявляется как public `502` при healthy containers. Agent обязан записывать
inspect-derived bridge IP и пересинхронизировать их после своего restart. При
диагностике сопоставьте upstreams из Caddy admin config с `docker inspect` app/Web;
не подключайте host-network Caddy к изолированным school networks.

При reprovision/rename сверяйте `Organization.public_id` и `School.public_id`
между Core и node shadow DB. Slug/domain являются mutable routing metadata и не
могут определять создание новой identity. Reconciliation не должна удалять school
DB/volume; ambiguous legacy rows оставляются для отдельной ручной проверки.
`perum_web` должен иметь Watchtower enable label: `pull_policy: missing` не
обновляет уже загруженный image сам по себе, и без Watchtower браузеры продолжат
получать старый PWA worker. После Web rollout проверьте, что `/sw.js` удаляет caches, `/login`
отдаёт `200`, а shaped `/api/login` достигает Tenant.

При `ghcr.io ... i/o timeout` не останавливайте рабочий Core/Agent и не запускайте
Compose без production `--env-file`: это может подставить пустые secrets и начать
локальный build. Скачайте image на доверенной машине, проверьте digest, передайте
`docker save IMAGE | ssh root@HOST 'docker load'`, затем выполните
`docker compose --pull never ... up -d --no-deps --force-recreate SERVICE`. Node
templates используют `pull_policy: missing`, чтобы не требовать registry pull,
если image уже загружен локально.

Version-controlled deploy scripts требуют exact immutable application images. Core
update запускайте с `--commit <full-sha> --core-image <digest-or-git-tag>
--web-image <digest-or-git-tag>`. Exact local runtime ID `sha256:<64>` передаётся
отдельно через `--core-runtime-image`/`--web-runtime-image`; portable image arguments
должны оставаться registry refs. Git tag никогда не считается надёжным local-only identity: в обычном
режиме он всегда pull-ится, затем inspect разрешает его в exact image ID. Registry
digest переиспользуется локально либо pull-ится при отсутствии. `--pull-never`
не разрешает cached git tag как runtime proof: для portable git ref одновременно
передайте `--core-runtime-image`/`--web-runtime-image` с доступным local ID. Registry
digest может доказать local availability самостоятельно. Historical recovery
использует portable ref плюс сохранённый runtime ID либо доступный digest, но не
cached tag без ID.
Target и rollback Compose используют только resolved IDs и `--pull never`; после
health script сверяет container `.Image`. IDs передаются только как ephemeral
`CORE_RUNTIME_IMAGE`/`WEB_RUNTIME_IMAGE` текущему Compose invocation и не сохраняются
в `.env.prod`: portable `CORE_IMAGE`/`AGENT_IMAGE`/`WEB_IMAGE` остаются registry refs
для node bootstrap. После completed target checkout rollback, оставаясь на target
commit, восстанавливает portable env, запускает captured previous runtime IDs через
runtime-aware target Compose, проверяет health/identity и только затем возвращает
checkout на previous commit. Если target checkout не завершился, script не трогает
services и только восстанавливает previous checkout. Runtime override keys в
`.env.prod` не добавляйте. Node bootstrap аналогично требует immutable Agent/Tenant/Web refs.
Скрипты используют deploy lock и сохраняют существующие DB/application secrets;
credential rotation выполняется только отдельной операторской процедурой. Watchtower
не входит в актуальный node template.

Для первого rollout identity-aware script нельзя полагаться на старый remote
checkout: workflow вызывает находящийся там script до переключения commit. Безопасный
bootstrap: получите `deploy/scripts/deploy-core.sh` exact target commit во временный
путь, проверьте commit/source provenance и запустите этот файл с production
`--path`, exact `--commit` и registry digest Core/Web refs. Не заменяйте working-tree
script до запуска и не используйте mutable tags. Target script переключит checkout,
а при post-checkout failure восстановит services target Compose-ом до возврата Git.
После успешного bootstrap следующие workflow rollout используют versioned script.

Public organization apex и school hosts должны быть IPv4 `A` records на назначенную
organization node с `proxied=false` (`DNS only`). Node Caddy завершает публичный TLS;
Core DNS manager создаёт apex/school records сразу при provisioning и затем
reconcile-ит target/proxy drift background sweep-ом. Наличие generated AAAA или
orange-cloud proxy у этих records является incident, а не допустимым fallback.
Platform/Core zone управляется независимо и может оставаться Cloudflare `Proxied`,
если её IPv4/IPv6/VPN browser contours доказаны. Cloudflare Worker для organization
или school routing не используется: Worker config в репозитории отсутствует.

На organization node exact `PUBLIC_BASE_DOMAIN` может быть apex landing этой org.
Он разрешён только для `add_proxy_route` в `ROLE=org_agent`; school route и
`admin`/`www` не должны обходить reserved-host guard. После Agent restart в логах
должны быть успешны обе строки `node caddy sync: landing <domain>` и
`node caddy sync: school <host>`.

Release registration обязана завершиться `201` и вернуть тот же image/SHA с
`is_current=true`. `401` означает token drift между GitHub secret и Core;
`422` означает descriptor/schema drift. Не вставляйте release напрямую в DB и не
добавляйте неизвестные Core capabilities: обновите Core либо используйте явно
зафиксированную compatibility projection только как временный recovery шаг.

## Synthetic school data

`python -m app.scripts.seed_synthetic_ru` заполняет только явно выбранную существующую
school. Перед запуском обязательны свежий restore proof и `alembic upgrade head`.
Сначала выполните `--dry-run`, затем задайте exact `--school-id`, `--scale`,
`--reference-date` и `--activity-date`. Default создаёт все synthetic accounts
неактивными; не используйте `--activate-personas` на публичной школе без отдельного
временного password/rotation плана.

Seed хранит marker `synru:<school_id>` и ownership rows. Повторный запуск без
`--rebuild` fail closed; rebuild отказывается удалять данные, если unowned rows уже
ссылаются на synthetic entities. Не удаляйте marker/ownership вручную и не выполняйте
downgrade ownership migration до controlled cleanup. JSON summary не содержит
паролей; synthetic logins имеют namespace `synru` и используют только вымышленные
данные `example.invalid`.

## Billing reconciliation

`POST /api/billing/enforce` сохранён как совместимый platform-admin endpoint, но
не является командой остановки. Он сверяет просроченные active subscriptions,
создаёт или переиспользует open invoice и переводит subscription в `past_due`.
Organization, schools, containers и routes не меняются. Поле `suspended` остаётся
пустым compatibility field; проверяйте `delinquent`, `invoices_created`,
`invoices_existing` и `subscriptions_marked_past_due`.

Текущая гарантия сериализации payment/reconciliation рассчитана на один Core
worker/instance. Перед горизонтальным масштабированием Core требуется PostgreSQL
advisory/row locking и DB-ограничение одного open invoice на organization. Один
open invoice пока представляет один 30-дневный snapshot; не начисляйте несколько
пропущенных периодов вручную до утверждения billing/fiscalization ADR.

## Ограниченный demo school stack

`deploy/demo-school/` предназначен только для временного показа одной синтетической
школы, когда remote node provisioning ещё не прошёл production gates. Он запускает
отдельные Tenant PostgreSQL/Redis/API, общий Web и Caddy TLS; наружу публикуются
только `80/443`. Создайте `deploy/demo-school/.env` вне VCS с `RELEASE_TAG`,
`TENANT_DB_PASSWORD`, `TENANT_SECRET_KEY`, `SCHOOL_HOST`,
`PLATFORM_BASE_DOMAIN` и `ACME_EMAIL`, затем выполните:

```bash
docker compose --env-file deploy/demo-school/.env \
  -f deploy/demo-school/docker-compose.yml build tenant web
docker compose --env-file deploy/demo-school/.env \
  -f deploy/demo-school/docker-compose.yml up -d
docker compose --env-file deploy/demo-school/.env \
  -f deploy/demo-school/docker-compose.yml exec tenant python -m app.scripts.seed_defaults
docker compose --env-file deploy/demo-school/.env \
  -f deploy/demo-school/docker-compose.yml exec tenant python -m app.scripts.seed_test_data
```

`seed_test_data` создаёт только synthetic data и известный seed password. До
передачи доступа обязательно замените пароль каждого созданного пользователя,
проверьте login → `/api/user/me` для выбранных ролей и убедитесь, что seed password
больше не принимается. Этот stack не регистрирует organization/school в Core, не
доказывает Agent transport, provisioning, backup/restore, scanner, attachments,
push или production rollout и не закрывает соответствующие пункты master plan.

## Backup и restore

- Backup включает control DB, каждую school DB, school appdata и конфигурационные
  metadata/secrets из approved store.
- Шифруйте backup, ограничивайте retention/access и проверяйте restore регулярно.
- Для PostgreSQL restore proof используйте
  `perum-core/tools/backup_restore_verify.py` только с явно указанными source/target
  containers и exact `--approve-target-container`. Пароль передавайте через
  `PERUM_PG_PASSWORD`/`PERUM_TARGET_PG_PASSWORD` или mode-600 password files, не в
  argv. Tool создаёт custom dump и checksum manifest, восстанавливает в уникальную
  temporary DB, сравнивает schema/table counts и удаляет target. Target container
  должен быть disposable/approved; успешный local test не заменяет production restore
  evidence.

`pg_restore` и facts query используют interactive Docker exec, потому что backup и
`psql` meta-command `\gexec` передаются через stdin. Если verifier падает, он сообщает
только safe operation name/exit code; не включайте stderr с SQL/data/secrets в
operator evidence. После proof сохраните checksum/aggregate counts в approved
evidence store и удалите временные plaintext dumps либо немедленно зашифруйте их.
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

## Support delivery monitoring

Platform и org dashboard показывают Tenant escalation delivery из последнего
school telemetry snapshot. `healthy` означает свежую валидную телеметрию без
очереди; `warning` — pending/retrying в пределах SLA; `critical` — хотя бы один
SLA breach или dead-letter; `unknown` — snapshot отсутствует, старше 180 секунд или malformed.
`unknown` нельзя интерпретировать как нулевой backlog.

Prometheus экспортирует unlabeled gauges с префиксом
`perum_support_escalation_delivery_`: `pending`, `retrying`, `failed`, `sla_breached`,
`oldest_pending_seconds`, `reporting_schools`, `unknown_schools`. Начните triage с
`sla_breached > 0`, затем проверьте `retrying` и freshness telemetry выбранной
школы. При диагностике outbox не выводите `payload_json`, `last_error`, message
content или identifiers; используйте только status/count/timestamps.

Tenant `error` означает автоматический retry, `dead_letter` — terminal failure после
permanent 4xx или 8 неуспешных попыток. В school operator Mobile UI откройте ticket,
проверьте `failed` без просмотра payload и выполните явный manual retry только после
устранения причины. Retry сохраняет исходные correlation/payload identities и
создаёт audit event. Core relay
является pull/ACK и имеет только pending/delivered. Prometheus gauges и PromQL
rules находятся в `deploy/observability/rules/support-escalation.yml`; локальный
Alertmanager использует `local-null`, поэтому rules не означают доставку уведомлений.
Approved contact point считается готовым только после test alert и подтверждённых
firing/resolved receipts во внешнем incident record.

## Required external configuration

GitHub variables/secrets, production env, DNS/provider tokens, encryption keys,
metrics credentials, registry auth, SSH deploy access, mobile store/EAS credentials
и backup keys создаются операторами вне VCS. Значения должны ротироваться по policy.
Core production validation требует непустые `SECRET_KEY`,
`SECRETS_ENCRYPTION_KEY`, `BOOTSTRAP_ADMIN_PASSWORD` и `AGENT_TOKEN`; сверяйте
полный набор с `perum-core/app/core/config.py`, даже если remote nodes ещё не
используются. CORS origins строятся из `PUBLIC_BASE_DOMAIN`. Example env не
заменяет startup validation.

Mobile runtime config не должен содержать credentials. `EXPO_PUBLIC_CORE_API_URL`
обязан быть HTTPS URL без userinfo/query/fragment, `EXPO_PUBLIC_LINK_HOST` —
lowercase DNS hostname, `EXPO_PUBLIC_BUILD_ENV` — `development`, `preview` или
`production`, а `EXPO_PUBLIC_PROJECT_ID` — public EAS UUID. APNs/FCM/EAS tokens,
signing material и provider keys остаются только в approved secret stores.
