# perum-web

Next.js 16 / React 19 web workspace для platform/org и school interfaces.

Из корня monorepo:

```bash
npm ci
npm run dev --workspace perum-web
npm run typecheck:web
npm run build:web
```

Server state использует TanStack Query, стили — CSS Modules, общие contracts и
transport приходят из `packages/`. Не создавайте собственные API types вместо
generated contracts: [API_CONTRACTS.md](../docs/API_CONTRACTS.md).

Architecture и local setup: [ARCHITECTURE.md](../docs/ARCHITECTURE.md) и
[LOCAL_DEVELOPMENT.md](../docs/LOCAL_DEVELOPMENT.md).
