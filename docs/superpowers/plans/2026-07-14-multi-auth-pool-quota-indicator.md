# Multi-auth Pool Quota Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one shared combined-quota calculation to `codex-multi-auth`, print it from `check`, publish a redacted snapshot for Codex Desktop, and render a persistent top-right quota indicator.

**Architecture:** `codex-multi-auth` owns a pure duration-keyed pool aggregation helper. The health check formats the helper result, while the runtime proxy publishes the same result through the existing owner-only router snapshot. The existing optional Desktop feature sanitizes that aggregate in the main process and injects a fail-soft toolbar indicator into the current upstream webview bundle.

**Tech Stack:** TypeScript, Vitest, Node.js, Electron IPC/preload, minified JavaScript ASAR patch descriptors, Node test runner, Linux Desktop DMG rebuild pipeline.

## Global Constraints

- Divide each window's total by all configured accounts, including exhausted accounts and accounts whose value is missing.
- Treat a window as unavailable only when no valid account value exists; never convert missing data to zero.
- Identify 5-hour and 7-day windows by `windowMinutes` (`300` and `10080`), not by primary/secondary ordering.
- Expose only counts, percentages, reset bounds, and update time to Desktop; expose no account IDs, emails, or tokens.
- Desktop must not launch live quota probes.
- Keep the Linux feature optional, idempotent, fail-soft, keyboard accessible, and enabled through the existing local `features.json` rebuild configuration.

---

### Task 1: Pure Pool Aggregation And CLI Formatting

**Files:**
- Create: `/var/home/poodle/Documents/Codex/2026-07-10/i-am-using-this-codex-desktop/work/codex-multi-auth/lib/quota-pool-aggregate.ts`
- Create: `/var/home/poodle/Documents/Codex/2026-07-10/i-am-using-this-codex-desktop/work/codex-multi-auth/test/quota-pool-aggregate.test.ts`
- Modify: `/var/home/poodle/Documents/Codex/2026-07-10/i-am-using-this-codex-desktop/work/codex-multi-auth/lib/codex-manager/formatters/quota-formatters.ts`
- Modify: `/var/home/poodle/Documents/Codex/2026-07-10/i-am-using-this-codex-desktop/work/codex-multi-auth/lib/codex-manager/formatters/index.ts`
- Test: `/var/home/poodle/Documents/Codex/2026-07-10/i-am-using-this-codex-desktop/work/codex-multi-auth/test/codex-manager-formatters.test.ts`

**Interfaces:**
- Consumes: quota-like objects with `primary` and `secondary` windows containing optional `usedPercent`, `windowMinutes`, and `resetAtMs`.
- Produces: `aggregateQuotaPool(accountCount, snapshots)` returning `QuotaPoolAggregate`, plus `formatQuotaPoolAggregate(aggregate)` returning the three human-readable CLI lines.

- [ ] **Step 1: Write failing aggregation tests**

```ts
expect(aggregateQuotaPool(7, snapshots)).toEqual({
  accountCount: 7,
  fiveHour: null,
  sevenDay: {
    windowMinutes: 10_080,
    reportedCount: 7,
    totalRemainingPercent: 176,
    averageRemainingPercent: 176 / 7,
    earliestResetAtMs: expect.any(Number),
    latestResetAtMs: expect.any(Number),
  },
});
```

Add cases for zero remaining, absent 5-hour windows, partially reported windows divided by seven, invalid numbers, reversed primary/secondary ordering, and nearest-integer presentation rounding.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- --run test/quota-pool-aggregate.test.ts test/codex-manager-formatters.test.ts`

Expected: FAIL because `quota-pool-aggregate.ts` and `formatQuotaPoolAggregate` do not exist.

- [ ] **Step 3: Implement the pure helper and formatter**

```ts
export interface QuotaPoolWindowAggregate {
  windowMinutes: 300 | 10_080;
  reportedCount: number;
  totalRemainingPercent: number;
  averageRemainingPercent: number;
  earliestResetAtMs?: number;
  latestResetAtMs?: number;
}

export interface QuotaPoolAggregate {
  accountCount: number;
  fiveHour: QuotaPoolWindowAggregate | null;
  sevenDay: QuotaPoolWindowAggregate | null;
}

export function aggregateQuotaPool(
  accountCount: number,
  snapshots: readonly QuotaPoolSnapshotLike[],
): QuotaPoolAggregate;
```

Iterate both windows, accept only finite `usedPercent`, clamp remaining to `0..100`, sum without rounding individual averages, divide by `accountCount`, and return `null` for a duration with no reported values.

```ts
export function formatQuotaPoolAggregate(value: QuotaPoolAggregate): string[] {
  return [
    `Combined limits (${value.accountCount} accounts):`,
    `  7d: ${formatWindow(value.sevenDay)}`,
    `  5h: ${formatWindow(value.fiveHour)}`,
  ];
}
```

- [ ] **Step 4: Run focused tests and verify pass**

Run: `npm test -- --run test/quota-pool-aggregate.test.ts test/codex-manager-formatters.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the helper**

```bash
git add lib/quota-pool-aggregate.ts lib/codex-manager/formatters/quota-formatters.ts lib/codex-manager/formatters/index.ts test/quota-pool-aggregate.test.ts test/codex-manager-formatters.test.ts
git commit -m "feat: aggregate multi-auth pool quota"
```

### Task 2: Check Output And Redacted Router Snapshot

**Files:**
- Modify: `/var/home/poodle/Documents/Codex/2026-07-10/i-am-using-this-codex-desktop/work/codex-multi-auth/lib/codex-manager/health-check.ts`
- Modify: `/var/home/poodle/Documents/Codex/2026-07-10/i-am-using-this-codex-desktop/work/codex-multi-auth/lib/runtime/rotation-server-types.ts`
- Modify: `/var/home/poodle/Documents/Codex/2026-07-10/i-am-using-this-codex-desktop/work/codex-multi-auth/lib/runtime/rotation-proxy-state.ts`
- Modify: `/var/home/poodle/Documents/Codex/2026-07-10/i-am-using-this-codex-desktop/work/codex-multi-auth/lib/runtime-rotation-proxy.ts`
- Modify: `/var/home/poodle/Documents/Codex/2026-07-10/i-am-using-this-codex-desktop/work/codex-multi-auth/scripts/codex-app-router.js`
- Test: `/var/home/poodle/Documents/Codex/2026-07-10/i-am-using-this-codex-desktop/work/codex-multi-auth/test/codex-manager-cli.test.ts`
- Test: `/var/home/poodle/Documents/Codex/2026-07-10/i-am-using-this-codex-desktop/work/codex-multi-auth/test/runtime-rotation-proxy.test.ts`
- Test: `/var/home/poodle/Documents/Codex/2026-07-10/i-am-using-this-codex-desktop/work/codex-multi-auth/test/codex-app-router.test.ts`

**Interfaces:**
- Consumes: Task 1's `aggregateQuotaPool` and `formatQuotaPoolAggregate`.
- Produces: `RuntimeRotationProxyStatus.poolQuota` and status-file `poolQuota: { accountCount, fiveHour, sevenDay, updatedAt }`.

- [ ] **Step 1: Write failing command and router tests**

Assert a seven-account health check prints exactly:

```text
Combined limits (7 accounts):
  7d: 176% total | 25% average
  5h: unavailable
```

Assert `proxy.getStatus().poolQuota` contains only aggregate fields and that serialized router status contains neither `@example.com` nor token fixtures.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --run test/codex-manager-cli.test.ts test/runtime-rotation-proxy.test.ts test/codex-app-router.test.ts`

Expected: FAIL because neither output nor `poolQuota` exists.

- [ ] **Step 3: Wire live check snapshots into the formatter**

Create `const quotaSnapshots: CodexQuotaSnapshot[] = []` before the account loop, append each successful live snapshot in both probe branches, and print `formatQuotaPoolAggregate(aggregateQuotaPool(storage.accounts.length, quotaSnapshots))` after the optional cache save and before the blank line preceding `Result:`.

- [ ] **Step 4: Publish a redacted proxy aggregate**

Extend `RuntimeRotationProxyStatus` with:

```ts
poolQuota: QuotaPoolAggregate & { updatedAt: number };
```

In `getStatus()`, map the active account snapshot through `findQuotaCacheEntryForAccount(state.quotaCache, account, accounts)`, aggregate the resulting entries, and stamp `updatedAt: state.now()`.

In `scripts/codex-app-router.js`, add `sanitizePoolQuota` that accepts only account count, the two known durations, counts, percentages in valid finite ranges, optional reset bounds, and update time. Include only the sanitized result in `createStatusPayload`.

- [ ] **Step 5: Run focused tests and verify pass**

Run: `npm test -- --run test/quota-pool-aggregate.test.ts test/codex-manager-cli.test.ts test/runtime-rotation-proxy.test.ts test/codex-app-router.test.ts`

Expected: PASS.

- [ ] **Step 6: Run typecheck and commit**

Run: `npm run typecheck`

Expected: exit 0.

```bash
git add lib/codex-manager/health-check.ts lib/runtime/rotation-server-types.ts lib/runtime/rotation-proxy-state.ts lib/runtime-rotation-proxy.ts scripts/codex-app-router.js test/codex-manager-cli.test.ts test/runtime-rotation-proxy.test.ts test/codex-app-router.test.ts
git commit -m "feat: publish combined quota pool status"
```

### Task 3: Desktop IPC And Toolbar Indicator

**Files:**
- Modify: `linux-features/multi-auth-thread-status/main-process.js`
- Create: `linux-features/multi-auth-thread-status/toolbar.js`
- Modify: `linux-features/multi-auth-thread-status/patch.js`
- Modify: `linux-features/multi-auth-thread-status/test.js`
- Modify: `linux-features/multi-auth-thread-status/README.md`

**Interfaces:**
- Consumes: Task 2's redacted status-file `poolQuota` object.
- Produces: preload method `getMultiAuthPoolStatus()` and a toolbar component marker `codexLinuxMultiAuthPoolQuota`.

- [ ] **Step 1: Write failing sanitizer, bridge, and toolbar patch tests**

Tests must assert:

```js
assert.deepEqual(sanitizePoolStatus(validStatus, now), {
  accountCount: 7,
  fiveHour: null,
  sevenDay: { windowMinutes: 10080, reportedCount: 7, totalRemainingPercent: 176, averageRemainingPercent: 176 / 7 },
  updatedAt: now,
});
assert.match(patchedPreload, /getMultiAuthPoolStatus/);
assert.match(patchedToolbar, /Combined quota/);
assert.match(patchedToolbar, /aria-label/);
assert.match(patchedToolbar, /codexLinuxMultiAuthPoolQuota/);
assert.equal(applyPoolQuotaToolbarPatch(patchedToolbar), patchedToolbar);
```

Add malformed, stale, missing-window, hover/focus, and upstream-drift no-op cases.

- [ ] **Step 2: Run the feature test and verify failure**

Run: `node --test linux-features/multi-auth-thread-status/test.js`

Expected: FAIL because the pool sanitizer, preload method, and toolbar patch do not exist.

- [ ] **Step 3: Extend the narrow IPC bridge**

Add a separate owner-only IPC channel `codex_linux:multi-auth-pool-status`. Read the same status file, validate a maximum snapshot age, return only sanitized aggregate fields, and expose:

```js
getMultiAuthPoolStatus: async () =>
  electron.ipcRenderer.invoke("codex_linux:multi-auth-pool-status")
```

- [ ] **Step 4: Implement the fail-soft toolbar patch**

Locate the current top-right layout-control component in the extracted upstream asset and inject one React component invocation adjacent to those controls. The injected component fetches on mount, every 60 seconds, and on `window.focus`; shows the rounded seven-day average or `—`; supplies a descriptive `aria-label`; and uses hover plus keyboard focus to show total, average, account count, 5-hour unavailable state, and snapshot age.

Keep all styles inline or in existing utility classes so the feature needs no global stylesheet patch. Guard insertion with the `codexLinuxMultiAuthPoolQuota` marker and return the original source on non-unique or drifted anchors.

- [ ] **Step 5: Register the descriptor and document behavior**

Add a `pool-toolbar` `webview-asset` descriptor targeting the exact current toolbar bundle. Update the README examples and explain the 60-second local snapshot refresh and update persistence.

- [ ] **Step 6: Run feature and patch suites**

Run: `node --test linux-features/multi-auth-thread-status/test.js scripts/patch-linux-window-ui.test.js`

Expected: PASS.

- [ ] **Step 7: Commit the Desktop feature**

```bash
git add linux-features/multi-auth-thread-status docs/superpowers/plans/2026-07-14-multi-auth-pool-quota-indicator.md
git commit -m "feat: show combined multi-auth quota in toolbar"
```

### Task 4: Install, Persist, And Verify

**Files:**
- Generated candidate: `codex-app-next/`
- Verify local config: `linux-features/features.json`
- Verify generated report: `codex-app-next/.codex-linux/patch-report.json`

**Interfaces:**
- Consumes: Tasks 1-3 and the existing enabled feature list.
- Produces: an installed Codex Desktop build and globally installed `codex-multi-auth` containing the shared aggregation behavior.

- [ ] **Step 1: Run full relevant multi-auth verification**

Run: `npm run build && npm run typecheck && npm test -- --run test/quota-pool-aggregate.test.ts test/codex-manager-cli.test.ts test/runtime-rotation-proxy.test.ts test/codex-app-router.test.ts`

Expected: all commands exit 0.

- [ ] **Step 2: Install the verified multi-auth checkout globally**

Run: `npm install -g .`

Expected: exit 0 and `codex-multi-auth --version` resolves to the checkout version.

- [ ] **Step 3: Rebind or restart the persistent app router**

Run: `codex-multi-auth rotation bind-app`

Expected: `codex-multi-auth rotation status` reports enabled, bound, and running; the owner-only status JSON contains sanitized `poolQuota`.

- [ ] **Step 4: Build and inspect a Desktop candidate**

Run: `./scripts/rebuild-candidate.sh`

Expected: exit 0; `codex-app-next/.codex-linux/patch-report.json` reports all `multi-auth-thread-status` descriptors as `applied` or `already-applied`, including `pool-toolbar`.

- [ ] **Step 5: Install after the running app exits**

Use the repository's existing candidate install flow rather than editing `app.asar` manually. Preserve the current app as a timestamped backup and promote the verified candidate only after Electron exits.

- [ ] **Step 6: Verify CLI arithmetic with current accounts**

Run: `codex-multi-auth check`

Expected: combined 7-day total equals the sum of the seven printed rows and the average equals that total divided by seven; 5-hour displays unavailable while disabled.

- [ ] **Step 7: Verify Desktop visually and functionally**

Launch Codex Desktop, confirm the top-right circle matches the CLI average, hover and keyboard-focus it to inspect the card, confirm missing 5-hour data reads `Unavailable`, and confirm task creation plus existing per-thread `/status` still work.

- [ ] **Step 8: Final repository checks**

Run in both repositories: `git status --short --branch` and `git log -3 --oneline`.

Expected: only intentional committed changes; no generated app directory is accidentally committed.
