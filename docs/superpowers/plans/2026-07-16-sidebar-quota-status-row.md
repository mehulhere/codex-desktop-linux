# Sidebar Quota Status Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the combined multi-auth quota into a compact sidebar-footer row in Codex Desktop and Codex Mobile, remove the Desktop profile marker, and omit missing 5-hour data.

**Architecture:** Desktop keeps the existing sanitized IPC bridge, adds a stable footer anchor through the profile-footer bundle patch, and mounts its preload-owned quota control into that anchor. Codex Mobile keeps its strict typed quota API, converts `AccountQuotaStrip` into the same compact footer control, and renders it from the shared desktop/mobile sidebar function.

**Tech Stack:** Node.js bundle patchers and `node:test` for Codex Desktop; React, TypeScript, Tailwind CSS, Vitest, Testing Library, and Zod-validated HTTP data for Codex Mobile.

## Global Constraints

- The summary value is rounded `sevenDay.averageRemainingPercent`, not the total pool percentage.
- The summary copy is `<percent>% quota` and `<count> accounts`.
- Missing 5-hour data produces no 5-hour label or placeholder.
- The Desktop Help control remains present and the profile/avatar control is removed.
- Codex Mobile retains strict types and must not add `as any`, `unknown`, or non-Zod payload inspection.
- No raw traces, credentials, account emails, or generated debug artifacts are committed.

---

### Task 1: Add the Desktop footer contract tests

**Files:**
- Modify: `linux-features/ui-tweaks/test.js`
- Modify: `linux-features/multi-auth-thread-status/test.js`

**Interfaces:**
- Consumes: the existing profile-footer fixture and preload patch fixture.
- Produces: regression assertions for `data-codex-linux-sidebar-footer`, footer mounting, compact summary copy, and conditional 5-hour detail.

- [ ] **Step 1: Change the profile-footer test to require the anchor and avatar removal**

```js
test("profile footer keeps Help, removes the account marker, and exposes a quota anchor", () => {
  const source = profileFooterBundleFixture();
  const patched = applyHideProfileNamePatch(source);

  assert.notEqual(patched, source);
  assert.match(patched, /data-codex-linux-sidebar-footer/);
  assert.doesNotMatch(patched, /children:\[H,help\]/);
  assert.match(patched, /children:\[help\]/);
  assert.equal(applyHideProfileNamePatch(patched), patched);
});
```

- [ ] **Step 2: Change the preload test to require footer mounting and reject title-bar positioning**

```js
assert.match(patchedPreload, /data-codex-linux-sidebar-footer/);
assert.match(patchedPreload, /MutationObserver/);
assert.match(patchedPreload, /% quota/);
assert.match(patchedPreload, /accounts/);
assert.doesNotMatch(patchedPreload, /top:\s*["']4px["']/);
assert.doesNotMatch(patchedPreload, /right:\s*["']88px["']/);
assert.match(patchedPreload, /value\?\.fiveHour/);
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
node --test linux-features/ui-tweaks/test.js linux-features/multi-auth-thread-status/test.js
```

Expected: FAIL because the current profile patch keeps the avatar and the current quota bootstrap still uses fixed title-bar coordinates.

---

### Task 2: Implement the Desktop footer anchor and compact quota row

**Files:**
- Modify: `linux-features/ui-tweaks/patches/hide-profile-name.js`
- Modify: `linux-features/ui-tweaks/README.md`
- Modify: `linux-features/multi-auth-thread-status/main-process.js`
- Modify: `linux-features/multi-auth-thread-status/README.md`

**Interfaces:**
- Consumes: `getMultiAuthPoolStatus(): Promise<SanitizedPoolStatus | null>` from the existing preload bridge.
- Produces: one `[data-codex-linux-sidebar-footer]` anchor and one `#codex-linux-multi-auth-pool-quota` control mounted inside it.

- [ ] **Step 1: Replace the profile wrapper children with Help and a stable anchor**

Inside the marker-scoped component, replace the wrapper form:

```js
(`div`,{children:[profileButton,help]})
```

with:

```js
(`div`,{"data-codex-linux-sidebar-footer":"",children:[help]})
```

Keep the transformation idempotent and limited to `PROFILE_FOOTER_ASSET_PATTERN` plus `codex.profileFooter.openProfileMenu`.

- [ ] **Step 2: Convert `poolQuotaUiBootstrap` from fixed chrome to an anchored row**

Create a row with this semantic structure:

```html
<div id="codex-linux-multi-auth-pool-quota">
  <button type="button" aria-expanded="false" aria-controls="codex-linux-multi-auth-pool-panel">
    <span aria-hidden="true"><span>47</span></span>
    <span><strong>47% quota</strong><small>7 accounts</small></span>
  </button>
  <div id="codex-linux-multi-auth-pool-panel" role="tooltip"></div>
</div>
```

Use a `MutationObserver` to prepend the root into
`[data-codex-linux-sidebar-footer]`, then disconnect after mounting or after a
30-second bound. The panel uses `bottom: 42px` and `left: 0`; no root style may
use the old `top: 4px` or `right: 88px` coordinates.

- [ ] **Step 3: Render only available quota windows**

Build the panel lines as:

```js
const detailLines = [
  `Combined quota · ${value.accountCount} accounts`,
  "",
  formatWindow("7-day", value.sevenDay),
];
if (value.fiveHour) detailLines.push(formatWindow("5-hour", value.fiveHour));
detailLines.push("", formatAge(value.updatedAt));
panel.textContent = detailLines.join("\n");
```

Set the visible label from the seven-day average and account count. Preserve
the existing green, amber, red, and unavailable ring states.

- [ ] **Step 4: Run focused Desktop tests and verify GREEN**

Run:

```bash
node --test linux-features/ui-tweaks/test.js linux-features/multi-auth-thread-status/test.js
node --test scripts/patch-linux-window-ui.test.js
```

Expected: PASS with no warnings or syntax failures.

- [ ] **Step 5: Commit the Desktop implementation**

```bash
git add linux-features/ui-tweaks linux-features/multi-auth-thread-status
git commit -m "feat: move quota status into sidebar footer"
```

---

### Task 3: Add Codex Mobile footer placement tests

**Files:**
- Modify: `/var/home/poodle/Documents/Codex/2026-07-10/i-am-using-this-codex-desktop/work/codex-mobile/apps/web/test/mobile-shell.test.tsx`
- Modify: `/var/home/poodle/Documents/Codex/2026-07-10/i-am-using-this-codex-desktop/work/codex-mobile/apps/web/test/app.test.tsx`

**Interfaces:**
- Consumes: the existing strict `ThreadAccountStatus.poolQuota` object.
- Produces: behavior tests for average summary percentage, account count, expandable detail, and missing 5-hour omission.

- [ ] **Step 1: Make the component test require the compact average summary**

```tsx
expect(screen.getByText("59% quota")).toBeTruthy();
expect(screen.getByText("7 accounts")).toBeTruthy();
expect(screen.queryByText(/5h quota unavailable/i)).toBeNull();
fireEvent.click(screen.getByRole("button", { name: /59% quota across 7 accounts/i }));
expect(screen.getByText("7-day total 412%")) .toBeTruthy();
expect(screen.queryByText(/5-hour/i)).toBeNull();
```

- [ ] **Step 2: Make the application test require quota in the sidebar and reject the conversation strip**

Open the sidebar in the test fixture, assert the quota button is within the
sidebar, and assert no quota strip occurs between the task header and message
viewport.

- [ ] **Step 3: Run focused PWA tests and verify RED**

Run:

```bash
pnpm --filter @farfield/web test -- mobile-shell.test.tsx app.test.tsx
```

Expected: FAIL because the current component shows total percentage and is rendered above the conversation.

---

### Task 4: Implement the Codex Mobile footer row

**Files:**
- Modify: `/var/home/poodle/Documents/Codex/2026-07-10/i-am-using-this-codex-desktop/work/codex-mobile/apps/web/src/components/AccountQuotaStrip.tsx`
- Modify: `/var/home/poodle/Documents/Codex/2026-07-10/i-am-using-this-codex-desktop/work/codex-mobile/apps/web/src/App.tsx`
- Modify: `/var/home/poodle/Documents/Codex/2026-07-10/i-am-using-this-codex-desktop/work/codex-mobile/apps/web/src/index.css`

**Interfaces:**
- Consumes: `status: Omit<ThreadAccountStatus, "ok"> | null` and `now: number`.
- Produces: `AccountQuotaStrip`, a compact button suitable for either sidebar footer, with strict typed rendering only.

- [ ] **Step 1: Render the average 7-day ring and compact labels**

Use `useId()` for the detail-panel ID. Render the rounded
`poolQuota.sevenDay.averageRemainingPercent` inside a CSS conic-gradient ring,
`<percent>% quota` as the primary label, and `<accountCount> accounts` as the
secondary label. Set `aria-expanded` and `aria-controls` on the button.

- [ ] **Step 2: Omit missing 5-hour detail**

Render combined and assigned-account 5-hour rows only inside conditions that
have a non-null `fiveHour` or `quota5h` value. Do not emit the string
`5h quota unavailable` from the footer component.

- [ ] **Step 3: Move the component into `renderSidebarContent`**

Remove:

```tsx
{selectedThreadId && <AccountQuotaStrip status={accountStatus} now={Date.now()} />}
```

from the main conversation area. Add the component to the sidebar footer ahead
of the compact system and GitHub controls so the same function renders it in
desktop-width and mobile-width sidebars.

- [ ] **Step 4: Run focused PWA tests and verify GREEN**

Run:

```bash
pnpm --filter @farfield/web test -- mobile-shell.test.tsx app.test.tsx
pnpm --filter @farfield/web typecheck
pnpm --filter @farfield/web lint
```

Expected: PASS with no TypeScript or ESLint errors.

- [ ] **Step 5: Commit the PWA implementation**

```bash
git add apps/web/src apps/web/test
git commit -m "feat: move quota status into mobile sidebar"
```

---

### Task 5: Build, install, and verify both surfaces

**Files:**
- Modify only if required by a failing current-build patch needle or focused regression.

**Interfaces:**
- Consumes: both committed implementations.
- Produces: a staged Desktop candidate and restarted Codex Mobile user service.

- [ ] **Step 1: Run Desktop verification**

Run the focused feature tests, the window patch test, and the repository's safe candidate rebuild command documented by the current checkout. Confirm the patch report marks the profile-footer and multi-auth preload patches applied.

- [ ] **Step 2: Run full Codex Mobile verification**

```bash
pnpm verify
```

Expected: build, tests, typecheck, and lint all pass.

- [ ] **Step 3: Restart the PWA service and verify health**

```bash
systemctl --user restart codex-mobile.service
systemctl --user is-active codex-mobile.service
curl -fsS http://127.0.0.1:4311/api/health
```

Expected: the service is `active` and health returns a successful JSON payload.

- [ ] **Step 4: Perform visual checks**

Verify in both dark and light themes:

- the compact row is at the sidebar bottom;
- Desktop no longer shows the title-bar ring or blue avatar marker;
- PWA no longer shows quota above the conversation;
- `47% quota` and the account count remain legible at narrow mobile width;
- expanding the row shows 7-day detail and does not show a missing 5-hour row;
- Help/system/GitHub controls remain reachable.

- [ ] **Step 5: Push the verified commits**

```bash
git push personal main
git -C /var/home/poodle/Documents/Codex/2026-07-10/i-am-using-this-codex-desktop/work/codex-mobile push private feature/personal-codex-pwa
```
