# Legacy org-node reference

`docker-compose.yml` в этом каталоге — ранний reference template. Он не содержит
полный актуальный node stack и, в частности, монтирует raw Docker socket. Не
используйте его для production или как bootstrap instruction.

Актуальный compose/script генерируется Core из
`perum-core/app/services/node_bootstrap.py`. Процедура описана в
[NODE_DEPLOYMENT.md](../../docs/NODE_DEPLOYMENT.md), trust boundary — в
[WORKER.md](../../docs/WORKER.md).
