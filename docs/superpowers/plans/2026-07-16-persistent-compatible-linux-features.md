# Persistent Compatible Linux Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist and validate the approved 15-feature personal Codex Desktop Linux profile on the stable `14421b8` source baseline.

**Architecture:** Force-track the loader's existing `linux-features/features.json` path in the personal fork, without changing upstream defaults or feature-loader code. Validate the exact set through the loader, run feature-owned tests, then rebuild and inspect generated provenance and patch results before switching the desktop launcher.

**Tech Stack:** JSON, Node.js test runner, Bash, Electron packaging scripts, Toolbox.

## Global Constraints

- The source branch and build provenance must descend from `14421b8` and contain
  no later feature implementation commits.
- The tracked profile contains exactly the 15 approved feature ids.
- `linux-features/features.example.json` remains unchanged and empty.
- Generated `codex-app` files are never committed.
- The working plain `14421b8` runtime remains available until validation passes.
- Any selected feature with missing or skipped generated patches blocks promotion.

---

### Task 1: Persist and validate the approved feature profile

**Files:**
- Create and force-track: `linux-features/features.json`
- Verify unchanged: `linux-features/features.example.json`
- Test: selected `linux-features/*/test.js` files
- Inspect generated: `codex-app/.codex-linux/build-info.json`
- Inspect generated: `codex-app/.codex-linux/patch-report.json`

**Interfaces:**
- Consumes: `enabledLinuxFeatureIds()` from `scripts/lib/linux-features.js`.
- Produces: an exact ordered 15-id profile consumed by `install.sh` and the updater.

- [ ] **Step 1: Write the approved configuration**

```json
{
  "enabled": [
    "appshots",
    "codex-wrapper-updater",
    "composer-dictation",
    "conversation-mode",
    "farfield-bridge",
    "mcp-helper-reaper",
    "multi-auth-thread-status",
    "node-repl-reaper",
    "open-target-discovery",
    "persistent-status-panel",
    "read-aloud",
    "read-aloud-mcp",
    "remote-control-ui",
    "ui-tweaks",
    "unified-provider-history"
  ]
}
```

- [ ] **Step 2: Verify the loader returns the exact set**

Run a Node assertion that loads `enabledLinuxFeatureIds()` with the repository
configuration and compares it to the JSON array.

Expected: exit code 0 and `enabled_feature_count=15`.

- [ ] **Step 3: Run selected feature tests**

Run `node --test` for every existing `test.js` owned by the 15 selected feature
directories.

Expected: exit code 0 with zero failed tests.

- [ ] **Step 4: Rebuild from the pinned DMG**

```bash
toolbox run --container fedora-toolbox-43 sh -lc \
  'cd /var/home/poodle/.gemini/antigravity/scratch/codex-desktop-linux && \
   ./install.sh /var/home/poodle/.gemini/antigravity/scratch/codex-desktop-linux/Codex.dmg'
```

Expected: installer exit code 0 and `Installation complete!`.

- [ ] **Step 5: Verify generated provenance and patch results**

Assert that build info reports the clean profile commit, that commit descends
from `14421b8`, the patch report contains all 15 selected ids, and no selected
feature result is missing or skipped.

Expected: exit code 0, `enabled_feature_count=15`, and
`selected_feature_skips=0`.

- [ ] **Step 6: Cold-launch and inspect the renderer**

Add a generated-only `MAIN 14421b8 · 15 FEATURES` badge, point the normal
desktop wrapper at the main build, stop stale Codex Electron/webview processes,
and launch through `/var/home/poodle/.local/bin/codex-desktop`.

Expected: one main Electron process from the main checkout, HTTP 200 from
`127.0.0.1:5175`, correct served badge, and no immediate `error boundary` or
`te is not a function` marker in the new process logs.

- [ ] **Step 7: Commit and push the persistent profile**

```bash
git add -f linux-features/features.json
git commit -m "feat: persist compatible Linux features"
git push personal main
```

Expected: local `main` and `personal/main` point to the new commit and the
tracked profile contains exactly the approved ids.
