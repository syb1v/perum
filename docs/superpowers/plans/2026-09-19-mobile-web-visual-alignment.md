# Mobile Web Visual Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align the native mobile client with the existing Web dark/cyan visual language while preserving the shared API architecture, role flows, local caches, and backend behavior.

**Architecture:** `packages/design-tokens` becomes the canonical cross-client token source. Web CSS values remain behaviorally unchanged, while Mobile consumes equivalent dark surfaces, cyan/blue accents, typography scale, spacing, radii, borders, and shadows through its theme adapter. UI changes stay within shared tokens and mobile presentation components.

**Tech Stack:** TypeScript, React Native, Expo SDK 57, React Native `StyleSheet`, Next.js CSS variables, existing workspace packages.

**Spec:** User-approved variant B in conversation: shared tokens, unified dark/cyan theme, common card/button/input/status patterns, and mobile-native layout rather than pixel-copying Web DOM.

## Global Constraints

- Do not change backend routes, API contracts, auth semantics, capabilities, query keys, or cache persistence behavior.
- Do not add dependencies; use existing workspace packages and React Native primitives.
- Keep mobile touch targets and safe-area behavior appropriate for native devices.
- Web remains the visual reference: dark `#09090b` base, cyan/blue accent, light text, dark cards, subtle blue borders.
- Update `CHANGELOG.md` and `docs/VERSIONS.md` after the implementation cycle.

### Task 1: Canonical shared visual tokens

**Files:**
- Modify: `packages/design-tokens/src/index.ts`
- Modify: `perum-mobile/src/theme.ts`
- Modify: `perum-mobile/README.md` only if token usage needs a developer note

- [ ] Extend the shared package with named `surfaces`, `text`, `borders`, `shadows`, `typography`, and `motion` values matching `perum-web/src/styles/variables.css`.
- [ ] Keep existing token exports source-compatible and add `as const` types.
- [ ] Replace Mobile's beige/green `colors` object with an adapter importing shared tokens, preserving the existing Mobile property names temporarily so screen code remains type-safe during migration.
- [ ] Run `npm run typecheck --workspace perum-mobile` and the shared package checks.

### Task 2: Mobile foundation and shell

**Files:**
- Modify: `perum-mobile/src/components/Screen.tsx`
- Modify: `perum-mobile/src/components/RootShell.tsx`
- Modify: `perum-mobile/app/_layout.tsx`
- Modify: `perum-mobile/src/components/HomeScreen.tsx`
- Modify: `perum-mobile/app/login.tsx`
- Modify: `perum-mobile/app/accounts.tsx`

- [ ] Apply shared dark surfaces, Web-style typography hierarchy, 8–16px component radii, cyan primary action, and subtle border/shadow treatment to the shell.
- [ ] Update status bar appearance for the dark background.
- [ ] Preserve all current providers, routing, account switching, auth actions, offline messaging, and query calls.
- [ ] Keep native safe-area padding and minimum touch targets.
- [ ] Run Mobile typecheck, tests, and Expo config validation.

### Task 3: Role screens and reusable visual patterns

**Files:**
- Modify: `perum-mobile/app/**/*.tsx` screens containing local beige/green styles
- Modify: `perum-mobile/src/components/FeatureUnavailable.tsx`
- Add if useful: `perum-mobile/src/components/ui/SurfaceCard.tsx`
- Add if useful: `perum-mobile/src/components/ui/ActionButton.tsx`

- [ ] Replace direct beige/green colors and inconsistent local radii with the shared theme adapter.
- [ ] Standardize screen headers, back actions, cards, status banners, primary buttons, secondary actions, inputs, chips, and metric cards.
- [ ] Preserve role-specific information architecture and existing loading/error/empty/offline states.
- [ ] Avoid a mass mechanical rewrite where a screen needs a native list or chart layout; use the same visual tokens while retaining its native composition.
- [ ] Run typecheck and Mobile tests after the screen migration.

### Task 4: Verification and documentation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/VERSIONS.md`

- [ ] Run `npm run typecheck --workspace perum-mobile`.
- [ ] Run `npm test --workspace perum-mobile`.
- [ ] Run `npm run validate:config --workspace perum-mobile`.
- [ ] Run `npm run export:ios --workspace perum-mobile` and Android export if available.
- [ ] Run `git diff --check` and inspect all modified UI files.
- [ ] Record the implementation in the Unreleased changelog and version ledger.
