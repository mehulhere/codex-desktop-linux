# Unified Provider History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep native and multi-auth Codex threads visible together while Desktop remains bound to quota-aware account routing.

**Architecture:** Add an optional Desktop webview patch that uses the app-server protocol's explicit all-provider sentinel, `modelProviders: []`, for thread-list calls. Correct multi-auth diagnostics so history visibility no longer causes agents to disable the router.

**Tech Stack:** Node.js CommonJS patch descriptors, Electron webview assets, TypeScript ESM, Vitest, Codex app-server protocol 0.144.0.

## Global Constraints

- Do not modify SQLite thread rows or rollout JSONL files.
- Do not change the provider used to execute, resume, or fork a thread.
- Keep the Desktop feature opt-in and disabled in committed example config.
- Preserve the existing masked per-thread account status feature.
- All ASAR rewrites must be idempotent and fail-soft.

---

### Task 1: Desktop Unified History Feature

**Files:**
- Create: `linux-features/unified-provider-history/feature.json`
- Create: `linux-features/unified-provider-history/README.md`
- Create: `linux-features/unified-provider-history/patch.js`
- Create: `linux-features/unified-provider-history/test.js`

**Interfaces:**
- Produces: `applyUnifiedProviderHistoryPatch(source: string): string`
- Produces: one optional `webview-asset` patch descriptor.

- [ ] **Step 1: Write a failing feature test**

Use a current minified fixture containing `sendRequest(\`thread/list\`, {...,
modelProviders:null,...})`. Assert the patch changes the value to `[]`, leaves
non-thread requests unchanged, and is idempotent.

- [ ] **Step 2: Verify RED**

Run: `node --test linux-features/unified-provider-history/test.js`

Expected: FAIL because `patch.js` and the feature descriptor do not exist.

- [ ] **Step 3: Implement the minimal patch**

Match JavaScript assets that contain `thread/list`, replace only
`modelProviders:null` in those assets, and return the original source when the
markers are absent.

- [ ] **Step 4: Verify GREEN and regressions**

Run: `node --test linux-features/unified-provider-history/test.js`

Run: `node --test scripts/patch-linux-window-ui.test.js`

Expected: all feature tests and all core patch tests pass.

- [ ] **Step 5: Commit**

```bash
git add linux-features/unified-provider-history docs/superpowers
git commit -m "feat: show history across model providers"
```

### Task 2: Multi-auth Diagnostic Guidance

**Files:**
- Modify: `lib/runtime/app-bind.ts`
- Modify: `test/app-bind.test.ts`
- Modify: `README.md`
- Modify: `docs/troubleshooting.md`

**Interfaces:**
- Changes: `formatAppBindStatus(status: AppBindStatus): string` guidance only.

- [ ] **Step 1: Write a failing diagnostic test**

Assert bound status recommends `unified-provider-history` and no longer
presents `rotation disable` as the normal history-visibility repair.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run --maxWorkers=1 test/app-bind.test.ts`

Expected: FAIL because the old guidance recommends disabling or unbinding.

- [ ] **Step 3: Update guidance and documentation**

Explain that the optional Linux feature lists both providers and that
`codex-multi-auth history list --json` verifies storage on unpatched builds.
Retain `unbind-app` only as an explicit routing-removal operation.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run --maxWorkers=1 test/app-bind.test.ts`

Run: `npm run typecheck && npm run lint && npm run build`

Expected: all commands exit zero.

- [ ] **Step 5: Commit**

```bash
git add lib/runtime/app-bind.ts test/app-bind.test.ts README.md docs/troubleshooting.md
git commit -m "docs: keep routing enabled for unified history"
```

### Task 3: Package, Restore Routing, And Publish

**Files:**
- Local-only: `linux-features/features.json`
- Generated: `codex-app-next/`

**Interfaces:**
- Consumes both completed feature branches.

- [ ] **Step 1: Enable both local Desktop features**

Set the local feature list to `multi-auth-thread-status` and
`unified-provider-history`.

- [ ] **Step 2: Rebuild and inspect the candidate**

Run: `./scripts/rebuild-candidate.sh ./Codex.dmg`

Extract the candidate ASAR and assert thread-list assets contain
`modelProviders:[]`, plus the existing per-thread status IPC and account row.

- [ ] **Step 3: Stage installation after Desktop exits**

Use the existing safe side-by-side swap and retain a timestamped `codex-app`
backup.

- [ ] **Step 4: Restore runtime routing**

Run: `codex-multi-auth rotation enable`

Run: `codex-multi-auth rotation bind-app`

Verify `rotation status` reports enabled, bound, and running.

- [ ] **Step 5: Publish both branches**

Push `feature/per-thread-multi-auth-status` and
`feature/quota-aware-thread-routing` to the `personal` remotes, then verify the
remote branch SHA equals local HEAD.

