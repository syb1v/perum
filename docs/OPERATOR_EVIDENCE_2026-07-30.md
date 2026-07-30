# Operator evidence — 2026-07-30

Этот record фиксирует non-secret production observations текущей operator-сессии.
Пароли, токены, private keys, dumps и персональные access tokens здесь не хранятся.

## Synthetic school seed

- Target: production school ID `1`, `school-1.grsn-panel.ru`.
- Pre-seed exact restore proof: `78` tables, `31` rows, checksum
  `be243921bc34c25d6590f8a5b9f6c2575e9c9fbba2dd8281583abc90d0a97df0`.
- Seed runner image: `ghcr.io/syb1v/perum-tenant:git-94f3676b309d`, digest
  `sha256:7ee554431628830e24cfd4975359f28e910d2e5e8023cfd35c0e9ee866890450`.
- Alembic head after preflight: `tenant_0039_synru_ownership`.
- Marker `synru:1`: `status=complete`, `scale=medium`,
  `reference_date=2026-05-22`, `activity_date=2026-07-29`.
- Created: `24` classes, `60` teachers, `624` students, `450` parents,
  `17,280` lesson occurrences, `94,848` grade/attendance rows, `59,904`
  homework states, `92,447` transactions and `1,715` grade-derived subject-average
  snapshots for exchange analytics.
- Ownership registry: `297,455` rows.
- All `1,134` synthetic accounts were inactive at seed completion. Afterwards exactly
  one teacher, one student and one parent persona were activated by explicit request;
  each passed production login and `/api/user/me` role verification. Existing school
  admin credentials and state were not changed.
- Database checks: 11 grade levels, 26 students per class, mean numeric grade `3.79`,
  non-negative student balances and canonical transaction types.
- Temporary restore dumps, password files and operator scripts were deleted. Password
  values are intentionally absent from this record.

## Control-plane deploy bootstrap

- Target commit: `671dd87255038dfd5b5152530c4084b1317c0bf3`.
- CI: `30538272557`; release workflow checks: `30538451772`, `30538661456`.
- An invalid full commit SHA failed during checkout preflight; Core/Web containers were
  not recreated and public health remained successful.
- Successful temporary target-script bootstrap kept Core on runtime image ID
  `sha256:0d4ace701206c64f0d9be971ab737ae596f6b92e734648eb774c55312fd3ee26`.
- Web changed to registry/runtime digest
  `sha256:09f54e446e5b5d88d240cff1bbc930a2d960f020f50fd7190151d3ccac53b21d`.
- Production checkout after bootstrap: `671dd87255038dfd5b5152530c4084b1317c0bf3`.
- Core, landing and school health returned HTTP `200` after bootstrap.
- `.env.prod` retained portable refs and contained no persisted runtime overrides.

## Tenant release publication

- CI `30533681065` passed for source
  `bc96c77141efe887de8d1d4dea1d2f1c4e4c6fbb`.
- In release run `30533853252`, Tenant image build and `tenant-release` registration
  jobs succeeded; the overall run failed in the separate control-plane deploy job.
- Registered Tenant version: `1.1.4`; image tag `git-bc96c77141ef`; OCI digest
  `sha256:9871aa97ae5bcf4d029a838c7e61c3fb8046a52c21076abe5a0dd1f1745c6855`.

## Open gates

- No two-school production isolation proof: only one active production school exists.
- Scanner images remain candidates; attachments stay disabled.
- No signed physical-device Stage F pilot, push-provider delivery proof or store proof.
