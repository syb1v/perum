# Scanner Operations Foundation

## Status

This foundation is fail-closed and does not enable attachment capabilities. Production activation remains blocked on a real EICAR and network-isolation pilot plus the attachment UI rollout.

Handoff status on 2026-07-19: Tenant worker/protocol and Core Docker drift/bounded relay hardening are complete. Disposable PostgreSQL 15 CI run `29691375244` confirms migration round-trip and real two-session lease/fencing. Approved images, real Docker inspect and EICAR/network pilot remain open. See `REMAINING_MEDIA_SUPPORT_PLAN.md` for the exact continuation order. Do not set `SCANNER_NODE_ENABLED=true` on production nodes and do not change attachment capability flags until all pilot gates have recorded evidence.

## Node topology

Each scanner-capable school-hosting node runs one `clamd` on the internal `perum_scanner_backend` Docker network. Every school has a separate relay connected to exactly its own `school_<slug>_net` and the scanner backend. School apps never join the scanner backend; `clamd` never joins a school network; no scanner port is published on the host. Relays have no volume, and school files are sent as ClamAV `INSTREAM` bytes. Core and the node agent never carry file bytes.

The `clamd` signature volume belongs only to the node scanner. No school volume is mounted into `clamd` or a relay. School archive, reprovision, update, suspend and purge lifecycle operations include that school's relay through its school label without deleting the shared scanner.

## Requirements

- Scanner-capable node: minimum 8 GiB RAM. Capacity planning should reserve at least 3 GiB and 2 CPU for `clamd`, plus 128 MiB and 0.25 CPU per active relay.
- Set `SCANNER_CLAMD_IMAGE` and `SCANNER_RELAY_IMAGE` to immutable `@sha256:` digests. Mutable tags are rejected.
- `SCANNER_RELAY_IMAGE` is an immutable perum-core image containing `app.scanner_relay`; provisioning overrides its command to run only the byte-transparent relay.
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
