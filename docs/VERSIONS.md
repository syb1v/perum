# Версии и commit ledger

> Этот файл хранит только ручной исторический ledger. Текущий статус, проценты и
> roadmap находятся исключительно в [PRODUCT_MASTER_PLAN.md](PRODUCT_MASTER_PLAN.md).
> Git history является первичным источником commit metadata, а
> [CHANGELOG.md](../CHANGELOG.md) — человекочитаемой историей изменений.

Исторические оценки старого rewrite scope сохранены в
[archive/README.md](archive/README.md) и архивных progress/plan snapshots. Они не
описывают готовность полного утверждённого продукта.

## Журнал коммитов

| № | Дата/время | Хеш | Описание |
|---:|---|---|---|
| 1 | 2026-05-24 07:54 | 3fbf701 | Phase 0 — скелет монорепо + архитектурные доки |
| 2 | 2026-05-24 08:01 | 8e5ace5 | Phase 1 starter — FastAPI + Postgres + Caddy |
| 3 | 2026-05-24 08:37 | 0cedc0b | тесты slug/health + фикс длины slug |
| 4 | 2026-05-24 08:41 | aaeb6e2 | fix deploy — локальная сборка core, RU mirror |
| 5 | 2026-05-24 08:49 | 50ac870 | параметризация IMAGE_REGISTRY |
| 6 | 2026-05-24 08:54 | 4ed6c3c | PLAN.md + PROGRESS.md |
| 7 | 2026-05-24 08:55 | 9dfa01f | CHANGELOG.md (0.0.1) |
| 8 | 2026-05-24 09:23 | 3dc132a | provisioning org-стеков (Phase 1 end-to-end) |
| 9 | 2026-05-24 09:38 | 725e8de | модель обновлений «по кнопке» (доки) |
| 10 | 2026-05-24 09:45 | 9d21374 | platform_admin auth (закрыта Phase 1) |
| 11 | 2026-05-24 10:01 | 32113ac | Phase 2 — tenant auth + модели + bootstrap |
| 12 | 2026-05-24 10:34 | f1a9dd9 | Phase 3 wip — легаси-фронт как perum-web |
| 13 | 2026-05-24 10:53 | cb40308 | мультитенант-роутинг + платформенный UI |
| 14 | 2026-05-24 11:05 | 121d1d9 | tenant auth под контракт легаси (вход в школу) |
| 15 | 2026-05-24 11:10 | beab498 | fix — распознавание org_admin (вечная загрузка) |
| 16 | 2026-05-24 11:22 | 147e858 | Phase 5 — academic core (предметы/виды работ) |
| 17 | 2026-05-24 11:31 | ac04e86 | Phase 5 — классы/годы/периоды/звонки/учителя + демо |
| 18 | 2026-05-24 11:45 | 316868a | Phase 6 — журнал учителя + оценки/ливки |
| 19 | 2026-05-24 11:51 | a1ab7d9 | доки — статус по фазам (роадмап) |
| 20 | 2026-05-24 11:56 | f558429 | доки — VERSIONS.md (журнал версий + оценка готовности) |
| 21 | 2026-05-24 16:20 | 55ff820 | Phase 6 — кабинет ученика (дневник/оценки/аналитика/итоговые) |
| 22 | 2026-05-24 18:57 | 0e5bf95 | доки — ledger #20–21 + готовность ≈48% |
| 23 | 2026-05-24 19:04 | 650229f | Phase 6 — ДЗ и контрольные (CRUD + вложения) |
| 24 | 2026-05-24 19:05 | e4a8483 | доки — ledger #22–23 + готовность ≈50% |
| 25 | 2026-05-24 19:10 | 14c25ab | Phase 6 — кабинет родителя (оценки/история ребёнка) |
| 26 | 2026-05-24 19:10 | fcf730c | доки — ledger #24–25 + готовность ≈51% |
| 27 | 2026-05-24 19:22 | 574bcff | Phase 6 — импорт оценок из PDF (Фаза 6 закрыта) |
| 28 | 2026-05-24 19:23 | 894d20b | доки — Фаза 6 закрыта, готовность ≈52% |
| 29 | 2026-05-24 19:27 | 29797ef | Phase 7 start — рейтинг по предмету |
| 30 | 2026-05-24 19:28 | 2f5df01 | доки — ledger #28–29 + готовность ≈54% |
| 31 | 2026-05-24 20:26 | 3f32132 | Phase 7 — маркет (каталог/покупка/инвентарь/экипировка) |
| 32 | 2026-05-24 20:27 | c09850e | доки — ledger #30–31 + готовность ≈58% |
| 33 | 2026-05-24 20:33 | 4fd7bad | Phase 7 — квесты (взять/прогресс/награда) |
| 34 | 2026-05-24 20:34 | e8f2494 | доки — ledger #32–33 + готовность ≈62% |
| 35 | 2026-05-24 20:46 | 47ae70f | Phase 7 — биржа ливок (Фаза 7 закрыта) |
| 36 | 2026-05-24 20:47 | 205ca37 | доки — ledger #34–35 + готовность ≈68% |
| 37 | 2026-05-24 21:12 | 92a0064 | Phase 8 start — новости (лента/лайки/админ-CRUD) |
| 38 | 2026-05-24 21:13 | 1e6961e | доки — ledger #36–37 + готовность ≈71% |
| 39 | 2026-05-25 12:06 | a38291f | Phase 8 — аналитика (учитель + админ-экономика/успеваемость) |
| 40 | 2026-05-25 12:08 | f07bd57 | доки — ledger #38–39 + готовность ≈76% |
| 41 | 2026-05-25 12:27 | faa82e9 | апелляции (Фаза 8 закрыта) + хвосты Фазы 5 (юзеры/расписание/sync) |
| 42 | 2026-05-25 12:28 | bffd858 | доки — ledger #40–41 + готовность ≈77% |
| 43 | 2026-05-25 12:44 | b3c5573 | мульти-школа для org_admin (реальное закрытие Фазы 5) |
| 44 | 2026-05-25 12:46 | 7838fe7 | доки — ledger #42–43 + готовность ≈78% |
| 45 | 2026-05-25 12:52 | 24a3d4c | UI управления школами (org_admin) |
| 46 | 2026-05-25 13:38 | ad569b5 | исправлена роль-модель org_admin (управляющий слой над школами) |
| 47 | 2026-05-25 13:40 | f8a0681 | доки — ledger #44–46 + ROLES под роль-модель org_admin |
| 48 | 2026-05-25 13:43 | b75d840 | доки — сводная таблица «что осталось» |
| 49 | 2026-05-25 13:56 | e983c16 | доки — архитектура v2 «узел организации» (silo=школа, OTA) + план |
| 50 | 2026-05-25 13:59 | 786efb0 | v2 этап 1 — модели School/Release в ядре (+миграция 0003) |
| 51 | 2026-05-25 14:08 | 095e8f4 | v2 этап 2 — провижининг школьных стеков + auth org_admin |
| 52 | 2026-05-25 14:08 | 6bd5490 | доки — ledger #47–51 + этапы 1–2 v2 |
| 53 | 2026-05-25 19:35 | 8366e01 | v2 этап 3 — тенант-стек = одна школа (bootstrap school_admin) |
| 54 | 2026-05-25 19:35 | d7076d2 | доки — ledger #52–53 + этап 3 v2 |
| 55 | 2026-05-25 19:41 | 05351fb | v2 этап 4 — OTA-обновления школ «по кнопке» (volume-preserving + rollback) |
| 56 | 2026-05-25 19:41 | f3bc0d3 | доки — ledger #54–55 + этап 4 v2 |
| 57 | 2026-05-25 19:55 | 1e0fe11 | v2 этап 6 — портал орг (UI) + публикация релизов + кнопка OTA |
| 58 | 2026-05-25 19:56 | 9332e7d | доки — ledger #56–57 + этап 6 v2 |
| 59 | 2026-05-26 00:57 | 0daed44 | v2 этап 5 — enrollment узла орг (токен + handshake + bootstrap-шаблон) |
| 60 | 2026-05-26 00:58 | 5a7da78 | доки — ledger #58–59 + этап 5 v2 |
| 61 | 2026-05-26 01:09 | e6b1e00 | v2 — вынос агента орг (ROLE=org_agent + enroll-on-boot) |
| 62 | 2026-05-26 01:09 | 704a9d4 | доки — ledger #60–61 + вынос агента |
| 63 | 2026-05-26 01:14 | e87b093 | v2 этап 7 — доки/Caddy/деплой под «узел организации» (все 7 этапов закрыты) |
| 64 | 2026-05-26 01:14 | 9a1a86b | доки — ledger #62–63 + готовность ≈80% (v2 закрыт) |
| 65 | 2026-05-26 01:23 | 56ec351 | Фаза 9 — биллинг-заглушки + observability (Prometheus/Grafana) |
| 66 | 2026-05-26 01:23 | b391f04 | доки — Фаза 9 ✅ + готовность ≈86% |
| 67 | 2026-05-26 01:32 | eb5884e | Фаза 4 — кастомные домены школ + on-demand TLS gate |
| 68 | 2026-05-26 11:37 | 536d473 | доки — Фаза 4 ✅ + готовность ≈89% |
| 69 | 2026-05-27 00:25 | dbd756d | Фаза 10 — hardening: RBAC-тесты + isolation E2E + k6 + матрица |
| 70 | 2026-05-27 00:26 | f4c59ba | доки — Фаза 10 ✅ + готовность ≈95% |
| 71 | 2026-05-27 00:57 | 1ce5f1b | Фаза 11 — CI (pytest+tsc) + release в GHCR + прод-env |
| 72 | 2026-05-27 00:58 | 0bd284e | доки — Фаза 11 ~75% + готовность ≈98% |
| 73 | 2026-05-27 21:56 | ce86a07 | hardening B — шифрование секретов/rate-limit/metrics-токен/вложения на volume |
| 74 | 2026-05-27 22:00 | 7c3cc7b | C — оживлены админ-заглушки (настройки/уведомления/обращения/поддержка) |
| 75 | 2026-06-12 20:35 | 14db95b | observability — аутентификация скрейпа Prometheus через credentials_file (METRICS_TOKEN) |
| 76 | 2026-06-12 23:03 | e636e6e | caddy — уникальный route-id на каждый домен школы при ресинке (sch-<slug>/dom-<id>) |
| 77 | 2026-06-13 01:04 | a9c2999 | web — редизайн консолей ядра/орг в стиле админки школы + вход с лендинга на admin-поддомен |
| 78 | 2026-06-13 03:31 | 0f43cfa | web — страница логина ядра/организации в дизайне школьного логина |
| 79 | 2026-06-13 10:58 | 65f15b4 | audit — закрыты находки аудита иерархии (RBAC/lifecycle/billing/isolation) |
| 80 | 2026-06-13 11:37 | 563478f | audit — #1 асинхронный провижининг + #7 docker.sock вынесен из ядра (docker_proxy) |
| 81 | 2026-06-13 12:28 | 27f6b89 | tenant — гард /internal под разведение токенов (telemetry/internal) |
| 82 | 2026-06-13 12:38 | d7e9fdc | релизы тенанта привязаны к реальному коду (source_commit) + per-component CI + ченджлоги в UI |
| 83 | 2026-06-16 12:54 | 983423d | web — улучшена диаграмма «Средний балл по предметам» во вкладке успеваемости ученика (градиенты, аннотации, сортировка) + AGENTS.md |
| 84 | 2026-06-16 13:23 | e62b7ce | fix — исправлены 403/404/503: дашборд ученика, ассеты маркета, teacher-эндпоинты (diary/my-class/topics CRUD) |
| 85 | 2026-06-18 15:55 | 7ea2754 | feat(infrastructure) — управление нодами, capacity planning, тарифные лимиты, OTA-прозрачность |
| 86 | 2026-06-18 16:20 | d02ab1f | docs — обновлён README с инфраструктурным управлением |
| 87 | 2026-06-18 16:25 | 71b04ad | docs — обновлён адрес прод-сервера |
| 88 | 2026-06-18 17:00 | efc458e | feat(web) — инфраструктура интегрирована в админки: platform/infrastructure и org/infrastructure
| 101 | 2026-06-20 | a05446f | fix: 500 bootstrap-скрипта, nullable enrollment_token.org_id, редизайн нод (remnawave-стиль, offline-индикатор)
| 102 | 2026-06-20 | 6332173 | feat(news/support): новости с таргетингом + колокол уведомлений у организатора + плавающий чат и тикеты поддержки (раздел «Поддержка» в ядре)
| 103 | 2026-06-20 | d9e1379 | feat(ota): версии x.y.z из perum-tenant/VERSION + дедуп fetch-latest (up_to_date) + скрытые настройки источника + fix наблюдаемости/диагностики апдейта школ
| 104 | 2026-06-20 | eec2a0a | docs(web): актуализирован FAQ управления нодами (скрипт установки, авто-железо/статусы, питание/перезагрузка/массовые действия) + VERSION=1.1.0 + не залипающее предупреждение об откате апдейта (прод-конфиг OTA исправлен вручную)
| 105 | 2026-06-20 | 6817c1d | release(tenant): VERSION 1.1.1 → CI собрал ghcr.io/syb1v/perum-tenant:git-6817c1dfbab1, релиз 1.1.1 опубликован текущим (пуллящийся образ из реестра для новых школ/нод)
| 106 | 2026-06-20 | 83bd036 | chore(deploy): авто-публикация релизов из CI (RELEASE_PUBLISH_TOKEN в ядро + CORE_URL/секрет в GitHub) + документировано ограничение: провижининг/апдейт школ пока только на хосте платформы
| 107 | 2026-06-20 | 29fb6d3 | feat(nodes): провижининг и обновление школ на удалённых нодах (ядро→воркер) + маршрут платформа→нода + переписан bootstrap ноды; проверено вживую на 2-й ноде (nodeschool.avari-land.ru)
| 108 | 2026-06-20 | 0961755 | feat(nodes): полный жизненный цикл школы на ноде — заморозка/удаление + управление админами (worker internal-rpc proxy)
| 109 | 2026-06-20 | c82a079 | fix(nodes): route-sync ведёт школу на ноде к нода:80 (переживает рестарт ядра); проверено форс-рестартом на проде
| 110 | 2026-06-20 | 9001065 | feat(nodes): реальные метрики нод (CPU/ОЗУ/ПЗУ/пинг), реал-тайм 2с, авто-обновление воркора (Watchtower), полный рестарт стека, ёмкость по лимиту оператора, docs/WORKER.md
| 111 | 2026-07-04 | 443989d | feat(deploy): deploy-node.sh + landing refresh (_refresh_org_landing при изменении школ) |
| 112 | 2026-07-04 | 74914e1 | feat(dns): Cloudflare DNS manager — авто-зонирование школ (dns_manager.py, миграция 0025, интеграция в provisioner/schools/org) |
| 113 | 2026-07-04 | e4cbfd2 | feat(web): DNS-модалка с CF-статусом, записями школ и кнопкой синхронизации |
| 114 | 2026-07-05 | 4ec136e | chore(deploy): CF DNS env vars в docker-compose.core.yml + .env.prod.example |
| 115 | 2026-07-05 | 3399b4f | fix(core): punycode-домены в validate-domain (Caddy шлёт xn--, ядро ждало Unicode) |
| 116 | 2026-07-05 | a0a6c4f | fix(web): punycode-домены в isApexHostname (лендинг редиректил на логин) |
| 117 | 2026-07-05 | 0e40267 | fix(core): пропущенный import select в dns_manager.py (500 на sync) |
| 118 | 2026-07-05 | 4fb0dc2 | fix(core): защита apex/www DNS-записей от удаления (CF возвращает FQDN, не @) |
| 119 | 2026-07-05 | 8bea0d3 | chore(core): убрана защита wildcard DNS — не используется |
| 120 | 2026-07-05 | 944af85 | feat(deploy): HTTPS на нодах (on_demand TLS, 443 порт, Caddyfile.prod с /internal/validate-domain) |
| 121 | 2026-07-05 | 4a3d916 | fix(core): pool-ноды в _resync_node_caddy_routes + shadow-record при провижининге |
| 122 | 2026-07-05 | 0e000aa | fix(deploy): плейсхолдеры вместо heredoc-переменных в Caddyfile deploy-node.sh |
| 123 | 2026-07-05 | a8361f4 | fix(deploy): пропущенный else в генерации Caddyfile + убран run/eval |
| 124 | 2026-07-05 | 35b080d | fix(deploy): AGENT_TOKEN показывается явно с инструкцией при авто-генерации |
| 125 | 2026-07-05 | a64efd2 | fix(core): active school with no metrics treated as online, not offline |
| 126 | 2026-07-05 | 33693ee | fix(web): enable text selection in admin panel (allow copying tokens, domains, etc.) |
| 127 | 2026-07-05 | 75cfaa7 | fix(core): sanitize node/org names — replace spaces in node names (used in filenames) |
| 128 | 2026-07-05 | 2ee0aef | fix(security): auth on /restart /schools /heartbeat + prod validators + CORS + docs off |
| 129 | 2026-07-05 | b683de4 | perf(core): add indexes on School.status, Node.status + unique constraint on (org_id, subdomain) |
| 130 | 2026-07-05 | cb579c7 | fix(core): non-fatal landing refresh + DNS sync after provisioning + store error in School.status_message |
| 131 | 2026-07-05 | 13ce041 | docs(plan): 3 варианта тарификации с анализом и рекомендацией |
| 132 | 2026-07-05 | a6d4803 | fix(core+web): store and display provisioning error on failed schools |
| 133 | 2026-07-06 | 1f294a3 | fix(node): add perum_web to node compose + use add_route for school domains |
| 134 | 2026-07-06 | a0dfb34 | security: per-school network isolation + per-school Redis (own network + redis per school) |
| 135 | 2026-07-08 | 1adfbf9 | fix(dns): DNS cleanup on archive + update on IP change + auto-sweep + org_admin status; fix(tests): StackSpec field order + telemetry tests |
| 136 | 2026-07-08 | 27a2c40 | fix(web+tenant): remove dead SupportInbox + clear-cache btn, fix ControlWorksSection URL, add enable-all-exchange endpoint |
| 137 | 2026-07-08 | daf79aa | feat(web+tenant): HW stub-fixes (teacher lesson modal/works/activity feed) + grades with lesson topic end-to-end |
| 138 | 2026-07-11 | 03c7c0c | feat(web+tenant): учебная целостность, экземпляры уроков, родительский кабинет, аналитика и portable-миграции |
| 139 | 2026-07-11 | d12eba7 | feat(platform): подготовлена portable-основа для mobile |
| 140 | 2026-07-12 | 2871e35 | feat(social): реализован раздел друзей |
| 141 | 2026-07-12 | de6e695 | fix(social): стабилизирована пагинация и опубликованы API-контракты |
| 142 | 2026-07-15 | 5047c49 | feat(platform): реализованы mobile, chats, media foundation и school support по master plan |
| 143 | 2026-07-15 | 431482e | docs(versions): зафиксирован хеш продуктового цикла |
| 144 | 2026-07-15 | 3f927e3 | feat(support): завершён version-safe metadata workflow школьной поддержки |
| 145 | 2026-07-15 | 3f927e3 | feat(support): реализована organization-gated эскалация в Core |
| 146 | 2026-07-15 | 3f927e3 | feat(mobile): добавлен безопасный deep-link foundation |
| 147 | 2026-07-15 | 3f927e3 | feat(push): добавлен provider-neutral registration foundation |
| 148 | 2026-07-15 | 0e9ccc7 | fix(journal): добавлен optimistic locking при удалении оценки |
| 149 | 2026-07-16 | ce74acd | fix(platform): закрыты OpSec-дефекты и добавлен version-safe перенос урока |
| 150 | 2026-07-16 | 58148fe | docs(versions): зафиксирован хеш OpSec и учебного цикла |
| 151 | 2026-07-16 | 7b6f613 | fix(push): защищена принадлежность mobile installation |
| 152 | 2026-07-16 | 7fd9df5 | fix(support): восстановлена org-gated видимость ответов |
| 153 | 2026-07-16 | 6c42486 | feat(homework): разделены уроки публикация и deadline |
| 154 | 2026-07-16 | 4521d3d | docs(versions): зафиксирован хеш push, support и homework цикла |
| 155 | 2026-07-16 | 28beb39 | feat(web): подключена новая Homework-семантика учителя |
| 156 | 2026-07-16 | 113bfc1 | feat(web): добавлен статус выполнения Homework ученика |
| 157 | 2026-07-16 | d1b836e | feat(mobile): добавлен offline outbox статусов Homework |
| 158 | 2026-07-16 | 0e823c4 | feat(tenant): добавлен безопасный occurrence backfill |
| 159 | 2026-07-16 | 325aa2e | feat(tenant): темы и предметы переведены в архив |
| 160 | 2026-07-16 | 37bcb8d | fix(web): закрыт stored XSS в школьных новостях |
| 161 | 2026-07-16 | e13d9ba | fix(ci): release заблокирован успешным CI |
| 162 | 2026-07-16 | 0400aa1 | chore(contracts): синхронизирован tenant OpenAPI |
| 163 | 2026-07-16 | 331db06 | docs(versions): зафиксированы хеши восьмишагового цикла |
| 164 | 2026-07-16 | 5bc9d2b | feat(mobile): добавлено разрешение конфликтов Homework |
| 165 | 2026-07-16 | ecd2524 | feat(web): добавлен интерфейс occurrence backfill |
| 166 | 2026-07-16 | abf2861 | fix(tenant): усилена безопасность occurrence backfill |
| 167 | 2026-07-16 | 0077090 | fix(tenant): запрещено повторное использование архива |
| 168 | 2026-07-16 | dd455ff | ci: расширены обязательные release gates |
| 169 | 2026-07-16 | bd5bd8e | docs(versions): закрыты placeholder-хеши и синхронизированы статусы |
| 170 | 2026-07-16 | 3f3cfe2 | fix(homework): унифицирован контракт version conflict |
| 171 | 2026-07-16 | edb1a56 | fix(core): discovery поддерживает активные aliases домена организации |
| 172 | 2026-07-16 | 8a89273 | fix(core): discovery ограничен rate limit по IP |
| 173 | 2026-07-16 | e59d937 | feat(discovery): добавлено TTL-обновление tenant descriptor |
| 174 | 2026-07-17 | e315144 | fix(mobile): descriptor preflight и атомарная ротация refresh token |
| 175 | 2026-07-17 | ace40db | docs(plan): спроектирован динамический mobile descriptor |
| 176 | 2026-07-17 | 83db72f | docs: подготовлены отчёт о готовности и техническая передача |
| 177 | 2026-07-17 | fc3cecc | feat(discovery): release manifest определяет mobile contract tenant descriptor |
| 178 | 2026-07-17 | 6bcde86 | feat(discovery): добавлен deployment snapshot runtime readiness |
| 179 | 2026-07-17 | be395b9 | feat(tenant): синхронизирован mobile descriptor contract |
| 180 | 2026-07-17 | 9084155 | feat(mobile): добавлены capability gating и descriptor grace period |
| 181 | 2026-07-17 | 7652b94 | docs: актуализирована и очищена документация проекта |
| 182 | 2026-07-17 | b29b8f2 | feat(mobile): автоматизированы lifecycle и release gates descriptor-а |
| 183 | 2026-07-17 | 4dba925 | fix(ci): исправлен Python resolver OpenAPI generator-а |
| 184 | 2026-07-17 | 68ac827 | docs: зафиксирован зелёный Stage F CI evidence |
| 185 | 2026-07-17 | 9449b1e | docs(plan): подготовлен безопасный Stage F one-school pilot checklist |
| 186 | 2026-07-17 | e377f4b | feat(support): добавлен durable mobile read cursor |
| 187 | 2026-07-17 | f6801cc | feat(support): добавлено offline-создание mobile ticket |
| 188 | 2026-07-17 | 91374e9 | docs(plan): переоценён roadmap после support slices |
| 189 | 2026-07-17 | 368b407 | docs(plan): зафиксированы deferred requirements и следующий roadmap |
| 190 | 2026-07-17 | 7b5f40c | docs(plan): отложены юридические ADR и очищен индекс |
| 191 | 2026-07-18 | 8160822 | feat(social): добавлен durable mobile read cursor |
| 192 | 2026-07-18 | 8eca47b | feat(social): завершён Friends hardening |
| 193 | 2026-07-18 | e15ea19 | feat(social): реализованы Native Friends и controlled rollout |
| 194 | 2026-07-18 | 08fa665 | docs(handoff): зафиксирован остаток media/support плана и отчёт сессии |
| 195 | 2026-07-18 | 2e99715 | docs(plan): синхронизирован live product status |
| 196 | 2026-07-18 | ca75564 | feat(media): добавлен foundation node-local ClamAV и durable scan queue |
| 197 | 2026-07-19 | 9e2e177 | feat(discovery): добавлен privacy-safe foundation Stage F pilot |
| 198 | 2026-07-19 | 0bd36a8 | feat(mobile): добавлен school support admin inbox foundation |
| 199 | 2026-07-19 | 088b0d1 | feat(mobile): добавлено conflict-safe управление support inbox |
| 200 | 2026-07-19 | c4ca135 | feat(support): добавлена privacy-safe delivery observability |
| 201 | 2026-07-19 | 2b6203f | feat(observability): добавлен dashboard support delivery SLA |
| 202 | 2026-07-19 | 7885cb1 | fix(media): усилены scanner lease и crash recovery |
| 203 | 2026-07-19 | c586ae5 | fix(media): добавлены scanner drift checks и relay limits |
| 204 | 2026-07-19 | 4be745e | test(media): добавлен PostgreSQL scanner integration gate |
| 205 | 2026-07-19 | e0912d8 | fix(migrations): расширен Alembic revision column |
| 206 | 2026-07-19 | 5d07885 | test(media): разделены PostgreSQL scanner fixtures |
| 207 | 2026-07-19 | 65169f6 | docs(media): зафиксирован PostgreSQL scanner evidence |
| 208 | 2026-07-19 | c15c4ad | feat(media): добавлен relay image candidate gate |
| 209 | 2026-07-19 | 55144cd | fix(ci): исправлена relay candidate provenance verification |
| 210 | 2026-07-19 | 1e6929d | fix(ci): уточнён relay candidate digest handoff |
| 211 | 2026-07-19 | f350c00 | docs(media): зафиксирован relay candidate evidence |
| 212 | 2026-07-19 | 6ffed7e | feat(media): добавлена isolated ClamAV updater topology |
| 213 | 2026-07-19 | 8b9405c | fix(ci): исправлен ClamAV cold-volume readiness gate |
| 214 | 2026-07-19 | f1f2f44 | fix(media): добавлен ClamAV database validation CLI |
| 215 | 2026-07-19 | 853c736 | fix(media): добавлен clamdscan client package |
| 216 | 2026-07-19 | a1ebad6 | fix(ci): исправлен ClamAV binary preflight |
| 217 | 2026-07-19 | 7a7e15c | fix(media): исправлен clamd stream limit config |
| 218 | 2026-07-19 | 226875b | fix(media): исправлен clamd foreground logging |
| 219 | 2026-07-19 | 46b60d4 | test(media): добавлена диагностика ClamAV verdict gate |
| 220 | 2026-07-19 | 8b13c16 | test(media): разделены direct и relay ClamAV gates |
| 221 | 2026-07-19 | 97d9d00 | fix(ci): синхронизирован ClamAV response framing |
| 222 | 2026-07-19 | 1fb2bb3 | test(media): добавлена Docker protocol stderr diagnostics |
| 223 | 2026-07-19 | 2289479 | test(media): добавлен direct ClamAV VERSION control |
| 224 | 2026-07-19 | 6e37fff | fix(media): добавлен bounded clamd scan tmpfs |
| 225 | 2026-07-19 | 8f930c8 | docs(media): зафиксирован ClamAV candidate evidence |
| 226 | 2026-07-19 | 99c3110 | test(media): добавлен scanner recreation outage gate |
| 227 | 2026-07-19 | 0916f6c | docs(media): зафиксирован scanner recreation evidence |
| 228 | 2026-07-19 | 5b32e80 | test(media): добавлен stale-signature recovery gate |
| 229 | 2026-07-19 | e68f7f1 | fix(ci): исправлен Tenant freshness harness import |
| 230 | 2026-07-19 | 1e87bcc | docs(media): зафиксирован stale-signature evidence |
| 231 | 2026-07-19 | 380be3e | test(media): добавлен multi-school scanner fairness gate |
| 232 | 2026-07-19 | ad0d9a7 | docs(media): зафиксирован scanner fairness evidence |
| 233 | 2026-07-19 | 49ddf93 | fix(academic): добавлен acknowledgement ambiguity report |
| 234 | 2026-07-21 | 9d03e7d | feat(mobile): добавлена очередь действий support admin |
| 235 | 2026-07-21 | c7ed0d3 | fix(social): добавлено истечение заявок в друзья |
| 236 | 2026-07-21 | 9b10404 | feat(mobile): добавлена очередь ответов support admin |
| 237 | 2026-07-21 | e33ecc4 | feat(mobile): добавлен read cursor support admin |
| 238 | 2026-07-21 | 5150f0c | fix(social): закрыты гонки заявок в друзья |
| 239 | 2026-07-22 | 57ee8b6 | feat(support): добавлены уведомления об ответе организации |
| 240 | 2026-07-22 | 9329261 | feat(web): добавлен переход из уведомления в support ticket |
| 241 | 2026-07-22 | 38f8b46 | feat(mobile): добавлен переход из уведомления в support ticket |
| 242 | 2026-07-22 | 57e76fb | refactor(domain): унифицированы роли операторов поддержки |
| 243 | 2026-07-22 | 92ff849 | refactor(contracts): унифицированы Friends DTO |
| 244 | 2026-07-22 | 6fd6385 | fix(contracts): типизированы Homework responses |
| 245 | 2026-07-22 | 19be330 | fix(contracts): типизированы moderation responses |
| 246 | 2026-07-22 | bbf9b92 | refactor(mobile): унифицирована инвалидация social cache |
| 247 | 2026-07-22 | aa77c73 | refactor(mobile): разделена инвалидация support cache |
| 248 | 2026-07-22 | 0bd29cc | fix(telemetry): добавлен общий delivery contract fixture |
| 249 | 2026-07-22 | 2a050cf | fix(telemetry): добавлена очистка metrics payload |
| 250 | 2026-07-22 | ed8903d | test(contracts): добавлен deployment snapshot fixture |
| 251 | 2026-07-22 | a12b3f1 | fix(contracts): типизирован preferences response |
| 252 | 2026-07-22 | 0c30c0c | fix(push): восстановлен registration status |
| 253 | 2026-07-22 | 6a76ead | fix(contracts): типизированы social mutation payloads |
| 254 | 2026-07-22 | f687e9b | fix(contracts): типизированы requester support payloads |
| 255 | 2026-07-22 | 9405c91 | fix(contracts): типизированы admin support payloads |
| 256 | 2026-07-22 | fe3abca | fix(contracts): типизирован список классов учителя |
| 257 | 2026-07-22 | dfd4a71 | fix(contracts): типизирована лента заданий учителя |
| 258 | 2026-07-22 | 25c8643 | fix(contracts): типизированы виды работ журнала |
| 259 | 2026-07-22 | c66412a | fix(contracts): типизирован выбор предметов учителя |
| 260 | 2026-07-22 | 8e2e234 | fix(contracts): типизировано чтение тем журнала |
| 261 | 2026-07-22 | 89bff30 | fix(contracts): типизированы мутации тем журнала |
| 262 | 2026-07-22 | a60f8aa | fix(contracts): типизированы активные периоды |
| 263 | 2026-07-22 | 598a1f2 | fix(contracts): типизирован receipt изменения урока |
| 264 | 2026-07-22 | a0e2d27 | fix(contracts): типизированы детали оценки |
| 265 | 2026-07-22 | f26b78b | fix(contracts): типизирован receipt изменения оценки |
| 266 | 2026-07-22 | 5112c95 | fix(contracts): типизировано создание оценки |
| 267 | 2026-07-24 | bee433b | fix(contracts): типизировано удаление оценки |
| 268 | 2026-07-24 | c97b0b8 | fix(contracts): типизирован lifecycle тем журнала |
| 269 | 2026-07-24 | 82cffed | fix(contracts): типизированы темы аналитики |
| 270 | 2026-07-24 | 4adb49f | fix(contracts): типизирован dashboard аналитики |
| 271 | 2026-07-24 | acbeef7 | fix(contracts): типизированы проблемные ученики |
| 272 | 2026-07-24 | 0994d3a | fix(contracts): типизированы работы учителя |
| 273 | 2026-07-24 | d688f7f | fix(contracts): типизирован дневник учителя |
| 274 | 2026-07-24 | fccdb2f | fix(contracts): типизирован класс учителя |
| 275 | 2026-07-24 | 08d91d2 | fix(contracts): типизирована аналитика родителя |
| 276 | 2026-07-24 | 8c45d62 | fix(contracts): закрыты live shared boundaries |
| 277 | 2026-07-24 | 4a1b856 | test(discovery): усилена готовность Stage F |
| 278 | 2026-07-24 | 104ea80 | feat(mobile): завершён автономный foundation |
| 279 | 2026-07-24 | 61f7c39 | fix(mobile): связан Expo EAS project |
| 280 | 2026-07-24 | b0a9793 | feat(mobile): добавлен Expo publish script |
| 281 | 2026-07-24 | 1ad7ed2 | fix(mobile): исправлен iOS EAS preflight |
| 282 | 2026-07-24 | f8dff1c | feat(mobile): настроен EAS Update channel |
| 283 | 2026-07-25 | c4dab25 | fix(contracts): типизированы Core support escalations |
| 284 | 2026-07-25 | 4b38835 | feat(mobile): добавлена эскалация поддержки |
| 285 | 2026-07-25 | 70eedb1 | fix(support): закрыты internal RPC receipts |
| 286 | 2026-07-25 | be590af | fix(support): ограничены escalation retries |
| 287 | 2026-07-25 | 30e21e3 | docs(plan): синхронизирован support roadmap |
| 288 | 2026-07-25 | 808b4cf | feat(observability): добавлены escalation alerts |
| 289 | 2026-07-25 | 132eb0f | fix(contracts): закрыты homework state receipts |
| 290 | 2026-07-25 | bd2fa8e | chore(contracts): обновлены homework schemas |
| 291 | 2026-07-25 | 23791e2 | fix(contracts): закрыты Friends DTO |
| 292 | 2026-07-25 | 0d7bde1 | fix(contracts): закреплён lifecycle заявок |
| 293 | 2026-07-25 | b3abca3 | fix(contracts): закрыты chat receipts |
| 294 | 2026-07-25 | ee3d308 | fix(contracts): закрыты moderation schemas |
| 295 | 2026-07-25 | 58a0562 | fix(contracts): закрыты social settings DTO |
| 296 | 2026-07-25 | 045de58 | feat(mobile): добавлена успеваемость ученика |
| 297 | 2026-07-25 | 6ea31a7 | feat(mobile): добавлена успеваемость родителя |
| 298 | 2026-07-25 | 858dcb5 | feat(mobile): добавлен дневник учителя |
| 299 | 2026-07-25 | 4d190be | feat(mobile): добавлен класс учителя |
| 300 | 2026-07-25 | 58b1cbd | docs(plan): синхронизирован Mobile parity |
| 301 | 2026-07-25 | 5e76d9d | feat(mobile): добавлены работы учителя |
| 302 | 2026-07-25 | 3647441 | feat(mobile): добавлена аналитика учителя |
| 303 | 2026-07-25 | fe67da7 | feat(mobile): добавлена аналитика родителя |
| 304 | 2026-07-25 | 55a5a19 | feat(mobile): добавлена аналитика ученика |
| 305 | 2026-07-25 | c713c52 | feat(mobile): добавлен обзор школы |
| 306 | 2026-07-25 | b663b89 | feat(mobile): добавлена модерация школы |
| 307 | 2026-07-25 | 7dbd788 | feat(mobile): добавлен учебный календарь |
| 308 | 2026-07-25 | 529e308 | feat(mobile): добавлен каталог классов |
| 309 | 2026-07-25 | 2652213 | feat(mobile): добавлен каталог учителей |
| 310 | 2026-07-26 | 81c2b15 | feat(mobile): добавлено расписание звонков |
| 311 | 2026-07-27 | d8eacf3 | fix(deploy): подготовлен двухсерверный demo contour |
| 312 | 2026-07-27 | 5e8d930 | chore(deploy): добавлен installer ядра |
| 313 | 2026-07-27 | 5e8d930 | fix(core): поддержано создание организации с IDN-доменом |
| 314 | 2026-07-28 12:00 | 5d2d22a | CI/release: защищён DNS sweep, исправлены PWA fallback, Web Docker context, immutable deploy и IDN defaults |
| 315 | 2026-07-28 15:00 | d6779a1 | test(ci): DNS regression test не зависит от локального pytest plugin; audit запускается после Web build |
| 316 | 2026-07-28 16:00 | 089ab46 | fix(scanner): per-school relay ограничен безопасными ClamAV-командами до upstream connection |
| 317 | 2026-07-28 16:30 | c758f08 | fix(ci): восстановлен scanner relay context и расширены trigger/YAML gates |
| 318 | 2026-07-28 16:45 | 0fde735 | fix(ci): разрешена exact clamd configuration в scanner candidate context |
| 319 | 2026-07-28 17:00 | 6d467c3 | docs(scanner): зафиксирован зелёный protocol-restricted candidate run 30375275580 |
| 320 | 2026-07-28 17:15 | 25ca2d5 | fix(scanner): Core updater требует обе свежие и валидные signature DB |
| 321 | 2026-07-28 17:30 | 71a532e | fix(scanner): bounded active+pending admission закрывает unbounded relay waiters |
| 322 | 2026-07-28 17:45 | 4989f46 | docs(scanner): зафиксирован bounded-admission candidate run 30377208978 |
| 323 | 2026-07-28 18:00 | d520786 | fix(scanner): OTA relay preflight останавливает update до destructive app swap |
| 324 | 2026-07-28 18:20 | 7703d9b | feat(mobile): добавлен read-only справочник видов работ для школьных операторов |
| 325 | 2026-07-28 18:40 | c145d93 | chore(tenant): версия 1.1.3 для immutable production provisioning release |
| 326 | 2026-07-28 19:00 | be32d5e | fix(deploy): provisioning требует registered immutable Tenant release и диагностирует registration drift |
| 327 | 2026-07-28 19:20 | 1a54266 | fix(agent): internal RPC выполняется внутри isolated Tenant app через Docker exec |
| 328 | 2026-07-28 19:45 | 02875e1 | fix(node): Caddy routes используют inspect-derived upstream IP для host network |
| 329 | 2026-07-28 19:55 | a9d534b | docs(node): зафиксирован production rollout устойчивого school route |
| 330 | 2026-07-28 20:20 | 534a58b | fix(identity): provisioning reconciles organization и school по stable UUID |
| 331 | 2026-07-28 20:45 | 59d6e39 | fix(node): org Agent восстанавливает apex landing после Caddy restart |
| 332 | 2026-07-28 20:55 | _______ | docs(node): зафиксирован restart proof landing и school routes |
| 333 | 2026-07-29 09:00 | f73b5e4 | fix(monitor): status landing синхронизируется с фактом Agent |
| 334 | 2026-07-29 09:45 | 8b57259 | fix(routes): remote school ownership делегирована node Caddy |
| 335 | 2026-07-29 10:00 | 07fa91c | docs(routes): зафиксирован simultaneous production proof |
| 336 | 2026-07-29 10:15 | 6b1f54f | fix(dns): public org и school records закреплены за Cloudflare proxy |
| 337 | 2026-07-29 10:20 | _______ | docs(dns): зафиксирован VPN/Cloudflare production proof |
| 338 | 2026-07-29 13:30 | 0a1ec57 | fix(deploy): immutable fail-closed deploy и resilience verification tooling |
| 339 | 2026-07-29 15:10 | ee48275 | fix(ci): синхронизированы contracts и exact dependency audit gate |
| 340 | 2026-07-29 15:20 | e20b93f | fix(monitor): исправлен import path scheduled synthetic check |
| 341 | 2026-07-29 15:40 | _______ | fix(backup): stdin transport подтверждён real restore proof |
| 342 | 2026-07-29 15:55 | _______ | chore(node): удалена доказанно orphan legacy organization metadata |
| 343 | 2026-07-29 18:10 | _______ | feat(tenant): добавлен comprehensive Russian synthetic school seed |
| 344 | 2026-07-29 19:45 | _______ | chore(tenant): повышена release version до 1.1.4 |
| 345 | 2026-07-29 19:50 | _______ | chore(contracts): синхронизирована Tenant OpenAPI version 1.1.4 |
| 346 | 2026-07-29 21:15 | _______ | fix(billing): просрочка переведена на non-destructive reconciliation |
| 347 | 2026-07-30 09:10 | _______ | feat(mobile): добавлены conflict-safe действия школьной модерации |
| 348 | 2026-07-30 10:05 | _______ | feat(student): добавлена bounded история последних транзакций |
| 349 | 2026-07-30 12:00 | _______ | fix(deploy): portable refs отделены от verified runtime identity и rollback proof |
| 350 | 2026-07-30 14:43 | _______ | docs: reconciled live rollout, Stage F, support и scanner evidence through 671dd87 |
| 351 | 2026-07-30 15:30 | _______ | feat(mobile): добавлены filters и local detail для Teacher Works |
| 352 | 2026-07-30 16:30 | _______ | feat(mobile): добавлены accessible charts в Parent analytics |
| 353 | 2026-07-30 17:30 | _______ | feat(mobile): добавлено read-only расписание учителя для администрации школы |
| 354 | 2026-07-30 17:45 | _______ | chore(release): повышена Tenant version до 1.1.5 |
| 355 | 2026-07-30 18:30 | _______ | feat(mobile): добавлен privacy-minimized read-only инвентарь ученика |
| 356 | 2026-07-30 18:35 | _______ | test(contracts): закреплён closed Student inventory response |
| 357 | 2026-07-30 18:40 | _______ | chore(release): повышена Tenant version до 1.1.6 |
| 358 | 2026-07-31 20:43 | _______ | feat(mobile): добавлено privacy-minimized read-only расписание класса |
| 359 | 2026-07-31 20:50 | _______ | chore(release): повышена Tenant version до 1.1.7 |
| 360 | 2026-07-31 21:56 | _______ | fix(student): исправлена сериализация ключей дней дневника и social polling при rollout 503 |
| 361 | 2026-07-31 22:05 | _______ | docs(plan): master plan очищен и переведён на измеримый live progress |
| 362 | 2026-07-31 22:10 | _______ | chore(release): повышена Tenant version до 1.1.8 |
| 363 | 2026-07-31 22:25 | _______ | docs(plan): roadmap упрощён до Web-first Launch V1 и post-launch backlog |
| 364 | 2026-08-02 12:35 | _______ | fix(ci): audit allowlist допускает исчезновение исправленных findings |
| 365 | 2026-08-02 13:15 | _______ | test(launch): добавлен PostgreSQL academic role journey gate |
| 366 | 2026-08-02 13:50 | _______ | docs(prod): зафиксирован успешный Tenant 1.1.8 diary incident rollout |
| 367 | 2026-08-04 15:45 | _______ | feat(admin): добавлена штатная привязка родителей к ученикам |
| 368 | 2026-08-04 21:30 | _______ | test(web): добавлен browser academic role journey gate |
| 369 | 2026-08-04 21:45 | _______ | fix(ci): Playwright запускается из Web workspace |
| 370 | 2026-08-04 22:15 | _______ | chore(web): сформирован role-acceptance release candidate 2.3.6 |
| 371 | 2026-08-04 23:05 | _______ | fix(admin): нормализованы academic dates для PostgreSQL |
| 372 | 2026-08-04 23:35 | _______ | fix(schedule): назначенный Teacher видит обычные уроки класса |
| 373 | 2026-08-05 00:25 | _______ | fix(web): опубликованное ДЗ видно ученику в дневнике |
| 374 | 2026-08-05 09:05 | _______ | docs(launch): закрыта M2 role acceptance matrix |
| 375 | 2026-08-05 12:35 | _______ | docs(incident): зафиксирована недоступность production Core |
| 376 | 2026-08-05 13:25 | _______ | fix(security): изолированы node и academic authorization boundaries |
| 377 | 2026-08-05 13:50 | _______ | test(core): node auth regression не требует pytest-asyncio |
| 378 | 2026-08-12 16:30 | _______ | fix(ci): Web audit изолирован от Mobile dependency graph |
| 379 | 2026-08-12 16:45 | _______ | fix(release): добавлена recovery-публикация пропущенных компонентов |
| 380 | 2026-08-12 17:00 | _______ | chore(prod): добавлена безопасная диагностика control plane |
| 381 | 2026-08-12 17:10 | _______ | chore(prod): диагностировано заполнение диска Core host |
| 382 | 2026-08-12 17:20 | _______ | fix(prod): добавлено bounded disk recovery без удаления volumes |
| 383 | 2026-08-12 17:35 | _______ | chore(prod): локализуется оставшийся school edge outage |
| 384 | 2026-08-12 17:45 | _______ | chore(prod): разделены Cloudflare и organization-node probes |
| 385 | 2026-08-12 17:55 | _______ | chore(prod): добавлена read-only диагностика organization node |
| 386 | 2026-08-12 18:05 | _______ | chore(prod): диагностируется Caddy-to-Tenant route drift |
