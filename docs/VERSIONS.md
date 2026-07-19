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
| 216 | 2026-07-19 | _______ | fix(ci): исправлен ClamAV binary preflight |
