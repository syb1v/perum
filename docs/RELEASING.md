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

Текущий automatic control-plane deploy не pin-ит checkout/image к `RELEASE_SHA`:
он делает `git pull --ff-only` и pull mutable `latest`. До исправления workflow
это известный release risk; не запускайте параллельные deploy, фиксируйте deployed
digests/commit и не утверждайте SHA provenance только по trigger workflow.

## Control plane

Если изменён Core/Web и repository variable `DEPLOY_ENABLED` равна `true`, deploy
job использует configured SSH secrets, делает fast-forward pull на `DEPLOY_PATH`,
pull images и пересоздаёт `perum_core`/`perum_web`. Tenant schools этот job не
обновляет. Manual fallback описан в [RUNBOOK.md](RUNBOOK.md).

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

Не фиксируйте значения в документации. GitHub environment хранит variables
`PUBLIC_BASE_DOMAIN`, `CORE_URL`, `DEPLOY_ENABLED`, optional `DEPLOY_PATH` и secrets
`RELEASE_PUBLISH_TOKEN`, `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_KEY`,
optional `DEPLOY_SSH_PORT`. Server-side matching secrets находятся в secret
manager/production env. Mobile preview workflow имеет отдельные EAS settings.

Тарифные продуктовые требования и rollout roadmap находятся только в
[PRODUCT_MASTER_PLAN.md](PRODUCT_MASTER_PLAN.md).
