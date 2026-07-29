# Legacy org-node reference

Ранний `docker-compose.yml` удалён: он не содержал полный актуальный node stack,
использовал mutable images и монтировал raw Docker socket. Не восстанавливайте его
для production или как bootstrap instruction.

Актуальный compose/script генерируется Core из
`perum-core/app/services/node_bootstrap.py`. Процедура описана в
[NODE_DEPLOYMENT.md](../../docs/NODE_DEPLOYMENT.md), trust boundary — в
[WORKER.md](../../docs/WORKER.md).
