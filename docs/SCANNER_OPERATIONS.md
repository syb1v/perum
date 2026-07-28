# Scanner Operations Foundation

## Status

This foundation is fail-closed and does not enable attachment capabilities. Production activation remains blocked on a real EICAR and network-isolation pilot plus the attachment UI rollout.

Handoff status on 2026-07-19: Tenant worker/protocol and Core Docker drift/bounded relay hardening are complete. Disposable PostgreSQL 15 CI run `29691375244` confirms migration round-trip and real two-session lease/fencing. Approved images, real Docker inspect and EICAR/network pilot remain open. See `REMAINING_MEDIA_SUPPORT_PLAN.md` for the exact continuation order. Do not set `SCANNER_NODE_ENABLED=true` on production nodes and do not change attachment capability flags until all pilot gates have recorded evidence.

Image lifecycle разделяет CI-published `candidate`, explicitly reviewed `approved`
digest и `pilot-approved`. Workflow не повышает статус и не меняет deployment
variables. Relay candidate публикуется после constrained runtime check с
SBOM/provenance. Clamd candidate запрещён до least-privilege updater/import design:
internal backend не предоставляет freshclam egress.

Updater topology: `perum_node_freshclam` находится только в managed non-internal
update network и монтирует signature volume `rw`; `perum_node_clamd` находится
только в internal scanner backend и монтирует тот же volume `ro`. Updater не имеет
school/backend connectivity, clamd не имеет egress. Core запускает clamd только
после updater health: обе `main.cvd|cld` и `daily.cvd|cld` должны быть младше
48 часов, а aggregate directory должен проходить `clamscan` validation. Empty,
partial, stale или malformed signature set fail closed оставляет clamd незапущенным.

Recorded relay candidate: run `29693030308`, source `1e6929d`, exact OCI digest
`sha256:0193187f6d3af2d8a4f443ad341668e3c52d48d44f926970d3e6a8b62592c830`.
Он прошёл CI runtime/image/digest checks, но остаётся `candidate`; не переносить его
в production settings до explicit review и полного test-node pilot.

Recorded paired candidate run `29695347053`, source `6e37fff`: clamd
`sha256:48251e249021a5d36fa420d172b0bd4e319e4e1ceb01544f50d85b58d54044e8`,
relay `sha256:d36e7d760c26f38f8b416d65300b7e6749ad04581bb0579581fb1d1141745c27`.
Cold signatures, isolation и EICAR пройдены в disposable CI. Это не доказывает
test-node recreation persistence/outage/capacity и не повышает статус до approved.

Disposable recreation gate обязан доказать неизменный SHA-256 fingerprint
signature databases после удаления/пересоздания clamd, продолжение scanning при
остановленном updater, fail-closed request при остановленном clamd и clean/EICAR
recovery после recreation. Этот CI evidence не заменяет target-node outage pilot.

Recorded recreation candidate run `29695993596`, source `99c3110`: clamd
`sha256:61b2d06a30dff6891345d3002b9e5b8eaa7952344ddf7d58656a46b9498087b2`,
relay `sha256:c26731987bfe7ead0eb1d86f6d1fea2d553f50890a7b361cc7b2ce692949c7d7`.
Status остаётся `candidate`; target-node coordinates и approval отсутствуют.

Stale-signature gate должен использовать дату из реального `zVERSION`, которую
парсит production Tenant `ClamAVScanner`. Изменение filesystem mtime не является
signature freshness evidence. Strict test policy `0h` проверяет fail-closed
`stale_signatures`; штатная `48h` policy на той же DB проверяет recovery.

Recorded freshness candidate run `29700311274`, source `e68f7f1`: clamd
`sha256:ac2643c21d7f43e6dc65be76333c4a804553dc09340dafe050189910ca813002`,
relay `sha256:8d6af74ba6ce8d75203b82dcbce208bb0707b8761c9aab36f8bb9ed6e6566117`.
Production Tenant parser/gating пройдены; status остаётся `candidate`.

Disposable fairness gate использует 5 isolated school networks/relays,
`MAX_CONNECTIONS=2`, burst `6×1 MiB` у одной школы и concurrent peer requests у
остальных. Он доказывает bounded non-starvation и resource contract только на
GitHub runner; абсолютные latency/throughput не переносятся на production sizing.

Recorded fairness candidate run `29700812844`, source `380be3e`: clamd
`sha256:7bae7c5ad91408183d3e6813359ef9dfb231bd3f836aacaf7834db75e171863a`,
relay `sha256:2c9dc02e827a7878288cbe9f7674549b9bf601a28abf022b07635c0943f2d553`.

Protocol-restricted candidate run
`https://github.com/syb1v/perum/actions/runs/30375275580` зелёный. Он дополнительно
проверяет, что relay отклоняет `zSHUTDOWN\0` до upstream connection, после чего
общий daemon отвечает на direct `VERSION`, а relay продолжает clean/EICAR scans.
Source `0fde735`; clamd candidate
`sha256:6431e6c5a1307ff3e6b3990eab42a6a36e05faf367029140b68fee0424f1ae97`, relay
candidate `sha256:52cc6c19340a7210f2007c50847245d67f01a3c29079b1498503219b6f4fe6a0`.
Оба digest остаются candidate до operator review и target-node evidence.

Bounded-admission candidate run
`https://github.com/syb1v/perum/actions/runs/30377208978` зелёный. Source
`71a532e`; clamd candidate
`sha256:04684c8725a6bb77abb41a9ab2e501c09ca6c73a3e6776ed245e96b901a3967e`, relay
candidate `sha256:f35804972f4137f146774fbbd6b9785b1e87ee2292a892ffd90aa7848f87427a`.
Topology/recovery/fairness и immutable digest verification прошли; это не
target-node saturation evidence и не production sizing.
Status `candidate`; target-node load profile и operator approval отсутствуют.

## Node topology

Each scanner-capable school-hosting node runs one `clamd` on the internal `perum_scanner_backend` Docker network. Every school has a separate relay connected to exactly its own `school_<slug>_net` and the scanner backend. School apps never join the scanner backend; `clamd` never joins a school network; no scanner port is published on the host. Relays have no volume, and school files are sent as ClamAV `INSTREAM` bytes. Core and the node agent never carry file bytes.

The `clamd` signature volume belongs only to the node scanner. No school volume is mounted into `clamd` or a relay. School archive, reprovision, update, suspend and purge lifecycle operations include that school's relay through its school label without deleting the shared scanner.

## Requirements

- Scanner-capable node: minimum 8 GiB RAM. Capacity planning should reserve at least 3 GiB and 2 CPU for `clamd`, plus 128 MiB and 0.25 CPU per active relay.
- Set `SCANNER_CLAMD_IMAGE` and `SCANNER_RELAY_IMAGE` to immutable `@sha256:` digests. Mutable tags are rejected.
- `SCANNER_RELAY_IMAGE` is an immutable perum-core image containing `app.scanner_relay`; provisioning overrides its command to run the bounded relay. The relay accepts only exact null-terminated `zVERSION` and `zINSTREAM` commands before opening the shared `clamd` connection. Administrative, session, malformed and unterminated commands fail closed, so a school cannot send `SHUTDOWN` or `RELOAD` to the node daemon.
- Relay admission is bounded before command parsing: `MAX_CONNECTIONS` limits active sessions and `MAX_PENDING_CONNECTIONS` limits additional accepted sessions waiting for a slot. Overflow sockets close before upstream connection; normal, malformed, timeout and failed-upstream paths release admission. Defaults `4 + 8` are a conservative candidate envelope, not production sizing.
- Leave `SCANNER_NODE_ENABLED=false` until both approved images exist and the pilot gates below pass.
- Freshclam or the approved clamd image must update the private signature volume. Signatures older than 48 hours make readiness false and all ambiguous scans retry while content remains quarantined.
- Do not publish TCP 3310, add app/clamd cross-network attachments, or mount school data into scanner containers.

Tenant scanner tuning is injected by provisioning. Defaults are a 3 second connect timeout, 15 second operation timeout, 64 KiB INSTREAM chunks, two concurrent scans, a 120 second DB lease, and exponential retry from 30 seconds to one hour.

## Readiness and telemetry

Tenant startup probes `VERSION` and records engine, signature version and signature timestamp. Readiness is true only for a valid response with signatures at most 48 hours old. Scanner telemetry contains only readiness and aggregate pending backlog. It excludes filename, storage key, hash, object ID, user ID and malware name.

## Pilot gates

1. Run a real EICAR upload through each school relay and verify `FOUND`, quarantine deletion and evidence persistence.
2. Prove from app, relay and clamd containers that app cannot reach backend peers other than its own relay, clamd cannot reach school networks, and one school's app cannot address another school's relay.
3. Verify host firewall/socket inspection shows no published listener on 3310.
4. Stop scanner and tenant processes during active scans; verify lease recovery, no simultaneous duplicate claims and eventual retry.
5. Age/freeze signatures beyond 48 hours and verify readiness false and content remains unavailable.
6. Review operational dashboards and attachment UI before changing build capability flags.
