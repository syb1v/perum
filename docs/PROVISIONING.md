# Провижининг

## Organization

`platform_admin` создаёт organization metadata и Core account. Организация не
является tenant silo и не получает общую school DB. Domain/node attributes
проверяются Core routes/services; exact payload берётся из OpenAPI.

## School

`org_admin` создаёт школу через Core. Core:

1. проверяет organization scope, limits, domain uniqueness и node availability;
2. создаёт school metadata, stable identity, secrets и provisioning state;
3. выбирает local host или `NodeAssignment`;
4. асинхронно вызывает local `school_provisioner` либо remote Agent API;
5. создаёт отдельные app/DB/volumes, запускает tenant migrations и bootstrap admin;
6. регистрирует route и фиксирует release/deployment state.

Create/reprovision/update возвращают asynchronous status where implemented;
клиент поллит status endpoint. Temporary school-admin password не должен
возвращаться из general school create response: управление выполняется отдельным
admin/reset flow.

## Failure и deletion

Provision failure переводит school в failed state и сохраняет diagnostics.
Destructive purge требует explicit confirmation и успешный backup DB/attachments;
если backup не подтверждён, persistent volumes не удаляются. Archive/suspend не
равны purge.

Секреты генерируются сервером, шифруются при настроенном encryption key и никогда
не логируются/документируются. Operational recovery: [RUNBOOK.md](RUNBOOK.md).
