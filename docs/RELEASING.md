# CI/CD и релизы

## CI

`.github/workflows/ci.yml` запускается на push/PR в `main` и проверяет:

- Core full pytest;
- Tenant unit tests, Alembic single head, SQLite migration smoke и academic gates;
- shared workspace typechecks/tests и dependency audit;
- Web typecheck и production build;
- Mobile typecheck/tests/config и Android/iOS exports;
- OpenAPI generation, clean generated diff и curated contracts;
- workflow YAML parse.

Локальные команды: [TESTING.md](TESTING.md).

## Image publication

`.github/workflows/release.yml` запускается после успешного CI commit или вручную.
Paths filter независимо определяет изменения `perum-core/**`, `perum-web/**` и
`perum-tenant/**`. Только изменённые images публикуются в GHCR с immutable
`git-<12-char-sha>` и mutable `latest` tags.

Scanner relay выпускается отдельным workflow `scanner-images.yml`. Он публикует
только immutable candidate tag `git-<full-sha>`, генерирует SBOM/provenance и
выдаёт JSON artifact с digest и `status=candidate`. Artifact не разрешает
deployment: exact digest должен пройти security/operator review и test-node pilot;
workflow не включает scanner node или attachment flags.

SBOM и provenance публикуются BuildKit как OCI referrers. GitHub Attestations API
не используется: он недоступен для user-owned private repository. Workflow после
push отдельно проверяет exact registry digest через `buildx imagetools inspect`.

Automatic control-plane deploy передаёт exact `RELEASE_SHA` и portable Core/Web refs
в version-controlled deploy script. Build matrix публикует digest artifact каждого
изменённого компонента; deploy превращает его в `ghcr.io/...@sha256:<64>`. Для
неизменённого компонента workflow сохраняет portable ref из `.env.prod` и отдельно
передаёт текущий container `.Image` как local runtime override. Compose запускается
с resolved IDs, но Core продолжает получать portable Agent/Web refs для node
bootstrap; фактические container IDs сверяются после health gate. Manual git tag
остаётся online-only movable ref и всегда pull-ится перед resolution.

## Control plane

Если изменён Core/Web и repository variable `DEPLOY_ENABLED` равна `true`, deploy
job использует configured SSH access, переключает checkout на exact release commit,
проверяет immutable images, пересоздаёт `perum_core`/`perum_web` и выполняет health
gate с rollback на предыдущие commit/env/runtime image IDs. Tenant schools этот job
не обновляет. Manual fallback описан в [RUNBOOK.md](RUNBOOK.md).

## Tenant release

При изменении `perum-tenant/**` workflow читает `perum-tenant/VERSION`, строит
changelog из git log, включает `perum-tenant/mobile-descriptor.json` и при
настроенных `CORE_URL`/`RELEASE_PUBLISH_TOKEN` вызывает
`POST /api/ci/release`. Core отклоняет duplicate version/image/source commit.

До Tenant image publication automatic и manual release paths выполняют named job
`Tenant release descriptor contract gate`: checked-in manifest валидируется Core
Pydantic schema и сравнивается с Core/Tenant OpenAPI descriptor shapes. Локально:

```bash
(cd perum-core && python -m pytest tests/test_release_manifest.py -q)
```

Release publication считается подтверждённой только после successful named CI
run для конкретного commit SHA. Первое полное зелёное evidence после введения
gate: [CI run 29598407038](https://github.com/syb1v/perum/actions/runs/29598407038).

Publication release record не обновляет школы автоматически. `org_admin` ставит
текущий release opt-in для каждой школы; provisioner сохраняет volumes и имеет
application-image rollback. Перед rollout проверьте migration compatibility,
descriptor manifest и pilot school.

## Configuration

Не фиксируйте значения в документации. Canonical GitHub environment contract:
variables `PUBLIC_BASE_DOMAIN`, `CORE_URL`, `DEPLOY_ENABLED`, `DEPLOY_SSH_HOST`,
`DEPLOY_SSH_USER`, `DEPLOY_PATH` и optional `DEPLOY_SSH_PORT`; secrets
`RELEASE_PUBLISH_TOKEN` и `DEPLOY_SSH_KEY`. Host, username, port и path не являются
секретами и не должны дублироваться в GitHub secrets. Server-side matching secrets
находятся в secret manager/production env. Mobile preview workflow имеет отдельные
EAS settings.

Миграция production environment на этот contract выполнена: host/user/path variables
настроены, SSH key остаётся secret. Workflow preflight выводит имена отсутствующих
settings без раскрытия значений. Первый rollout имеет bootstrap caveat: удалённый
host выполняет script из текущего checkout, поэтому старая версия не может сама
применить новый identity contract. Оператор должен один раз выполнить проверенную
копию `deploy/scripts/deploy-core.sh` exact target commit из временного пути с exact
commit и registry digest refs. Script не заменяется в старом checkout заранее:
post-checkout rollback должен использовать runtime-aware target Compose и вернуть
Git назад только после service recovery. Последующие rollout выполняются обычным
exact-commit flow.

`.github/workflows/eas-preview.yml` использует pinned EAS CLI `21.2.0` и до
project lookup/build запускает mobile preflight. Environment `mobile-preview`
должен содержать public variables `EXPO_PROJECT_ID`,
`EXPO_PUBLIC_CORE_API_URL`, `EXPO_PUBLIC_LINK_HOST` и secret `EXPO_TOKEN`.
Expo project identity — `@sybiv/perum`; checked-in slug — `perum`, при этом iOS
bundle ID и Android application ID остаются `app.perum.mobile`.
Workflow отображает project ID в `EXPO_PUBLIC_PROJECT_ID`; это build identifier,
не credential. Preview/production config fail closed без явных Core URL, link host
и project ID. Смена host требует нового native build и синхронной проверки iOS
associated domains, Android asset links и link DNS.

Тарифные продуктовые требования и rollout roadmap находятся только в
[PRODUCT_MASTER_PLAN.md](PRODUCT_MASTER_PLAN.md).
