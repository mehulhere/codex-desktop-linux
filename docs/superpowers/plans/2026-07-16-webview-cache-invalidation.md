# Webview Cache Invalidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent random renderer failures after Linux app rebuilds by clearing only disposable Chromium web caches when the installed webview build changes.

**Architecture:** A focused Python helper derives a stable fingerprint from the installed Linux build, compares it with an atomic launcher-state marker, and removes three fixed cache directories only when the fingerprint changes. The launcher calls it during cold startup before Electron starts, and direct-install plus update-builder staging copy the same helper.

**Tech Stack:** Python 3 standard library, Bash launcher/install scripts, existing shell smoke-test harness.

## Global Constraints

- Preserve authentication, cookies, IndexedDB, local storage, session storage, settings, chats, rollout files, and all of `~/.codex`.
- Remove only `Cache`, `Code Cache`, and `Service Worker` beneath the resolved Electron user-data directory.
- Run cleanup only on cold startup; never mutate cache during a warm-start handoff.
- Cache cleanup failures must warn and must not advance the fingerprint marker.
- Do not modify generated `codex-app/` files as the durable source fix.

---

### Task 1: Build-Fingerprint Cache Helper

**Files:**
- Create: `launcher/webview-cache.py`
- Modify: `tests/scripts_smoke.sh`

**Interfaces:**
- Consumes: `--app-dir`, `--state-dir`, and `--user-data-dir` absolute directory arguments.
- Produces: exit status `0` after unchanged or successful cleanup; a marker at `<state-dir>/webview-cache-fingerprint-v1`; one status line describing `unchanged` or `cleared`; nonzero status plus a warning on invalid paths or cleanup failure.

- [ ] **Step 1: Write the failing behavior test**

Add `test_webview_cache_invalidation()` to `tests/scripts_smoke.sh`. It creates a fake app with `resources/codex-linux-build-info.json`, a fake launcher state directory, disposable cache sentinels, and protected `Local Storage`, `Cookies`, and `settings.json` sentinels. The test invokes:

```bash
python3 "$REPO_DIR/launcher/webview-cache.py" \
    --app-dir "$app_dir" \
    --state-dir "$state_dir" \
    --user-data-dir "$user_data_dir"
```

Assert that the first invocation removes only the three disposable cache directories and writes the marker. Recreate a cache sentinel, invoke again without changing build info, and assert the sentinel survives. Change build info, invoke again, and assert the cache sentinel is removed while every protected sentinel survives.

- [ ] **Step 2: Run the focused smoke test and verify RED**

Run:

```bash
bash tests/scripts_smoke.sh
```

Expected: `FAIL` because `launcher/webview-cache.py` does not exist.

- [ ] **Step 3: Implement the minimal helper**

Create `launcher/webview-cache.py` with:

```python
#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

CACHE_NAMES = ("Cache", "Code Cache", "Service Worker")
MARKER_NAME = "webview-cache-fingerprint-v1"
```

Use the SHA-256 digest of raw `codex-linux-build-info.json` bytes when present. Otherwise hash a JSON encoding of the size and nanosecond mtime for `resources/app.asar` and `content/webview/index.html`. Resolve all three input paths, require absolute non-root state/user-data paths, remove only `user_data_dir / cache_name`, and atomically replace the marker with a temporary file in `state_dir`.

- [ ] **Step 4: Run the smoke suite and verify GREEN**

Run:

```bash
bash tests/scripts_smoke.sh
```

Expected: `All script smoke tests passed.`

- [ ] **Step 5: Commit the helper behavior**

```bash
git add launcher/webview-cache.py tests/scripts_smoke.sh
git commit -m "fix: invalidate stale webview caches"
```

### Task 2: Cold-Launch And Packaging Integration

**Files:**
- Modify: `launcher/start.sh.template`
- Modify: `install.sh`
- Modify: `scripts/lib/package-common.sh`
- Modify: `tests/scripts_smoke.sh`

**Interfaces:**
- Consumes: `CODEX_ELECTRON_USER_DATA_DIR` for explicit/side-by-side profiles, otherwise `${XDG_CONFIG_HOME:-$HOME/.config}/Codex` for the primary app.
- Produces: one cold-start invocation of `.codex-linux/webview-cache.py` before `start_webview_server`; installed helper at `codex-app/.codex-linux/webview-cache.py`; update-builder source at `update-builder/launcher/webview-cache.py`.

- [ ] **Step 1: Write failing integration assertions**

Extend `tests/scripts_smoke.sh` to require:

```bash
assert_contains "$REPO_DIR/launcher/start.sh.template" 'webview-cache.py'
assert_contains "$REPO_DIR/install.sh" 'webview-cache.py'
assert_contains "$REPO_DIR/scripts/lib/package-common.sh" 'webview-cache.py'
```

In the existing side-by-side install test, assert `codex-app/.codex-linux/webview-cache.py` exists. In the update-builder staging test, assert `update-builder/launcher/webview-cache.py` exists.

- [ ] **Step 2: Run the smoke suite and verify RED**

Run:

```bash
bash tests/scripts_smoke.sh
```

Expected: `FAIL` because the helper is not staged or invoked.

- [ ] **Step 3: Integrate the cold-start helper**

Add a launcher function that resolves the user-data directory and runs:

```bash
python3 "$SCRIPT_DIR/.codex-linux/webview-cache.py" \
    --app-dir "$SCRIPT_DIR" \
    --state-dir "$APP_STATE_DIR" \
    --user-data-dir "$electron_user_data_dir"
```

Call it only inside the existing `needs_cold_start` branch after packaged prelaunch and before starting the webview server. Copy the helper beside `webview-server.py` in `install.sh`, and include it in the update-builder launcher payload in `scripts/lib/package-common.sh`.

- [ ] **Step 4: Verify syntax and integration GREEN**

Run:

```bash
python3 -m py_compile launcher/webview-cache.py
bash -n launcher/start.sh.template install.sh scripts/lib/package-common.sh
bash tests/scripts_smoke.sh
```

Expected: all commands exit `0` and the smoke suite prints `All script smoke tests passed.`

- [ ] **Step 5: Commit launcher integration**

```bash
git add launcher/start.sh.template install.sh scripts/lib/package-common.sh tests/scripts_smoke.sh
git commit -m "fix: reset renderer cache after rebuilds"
```

### Task 3: Rebuild, Recover, And Validate The Live App

**Files:**
- Regenerate: `codex-app/` through `./install.sh ./Codex.dmg`
- Runtime only: `~/.config/Codex/{Cache,Code Cache,Service Worker}`

**Interfaces:**
- Consumes: the verified source helper and the dated recovery backup.
- Produces: a normal non-debug Codex Desktop process using a fresh renderer cache and a persisted fingerprint marker.

- [ ] **Step 1: Validate pending Farfield changes before committing**

Run:

```bash
node --test linux-features/farfield-bridge/test.js
```

Expected: all Farfield bridge tests pass. Commit only the README, patch, and test changes with `fix: refresh completed farfield chats without reload`.

- [ ] **Step 2: Rebuild the generated app**

Run:

```bash
./install.sh ./Codex.dmg
```

Expected: installation completes with the selected local feature set and stages `.codex-linux/webview-cache.py`.

- [ ] **Step 3: Archive and remove the current disposable caches**

Move `Cache`, `Code Cache`, and `Service Worker` from `~/.config/Codex` into the dated recovery backup's `stale-renderer-cache/` directory. Do not remove any other profile entry.

- [ ] **Step 4: Launch normally and exercise chats**

Run:

```bash
codex-desktop
```

Expected: the launcher starts without `--remote-debugging-port`, writes `~/.local/state/codex-desktop/webview-cache-fingerprint-v1`, and `http://127.0.0.1:5175/index.html` returns HTTP `200`.

- [ ] **Step 5: Verify logs and repository state**

Open multiple existing chats, then confirm no new `error boundary`, `Failed to fetch dynamically imported module`, or `te is not a function` entries were appended after the launch timestamp. Run the relevant smoke and feature tests once more, inspect `git diff --check`, and remove the temporary `scripts/dev/diagnose-renderer-exceptions.mjs` diagnostic before final commit/push.

