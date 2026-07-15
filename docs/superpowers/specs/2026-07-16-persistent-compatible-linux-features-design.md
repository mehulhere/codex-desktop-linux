# Persistent Compatible Linux Features Design

## Goal

Persist the useful optional Codex Desktop Linux features that are compatible
with this Fedora GNOME Wayland machine while keeping platform-specific,
provider-specific, unavailable, example, and experimental features disabled.

## Enabled Profile

The tracked personal profile enables these feature ids:

- `appshots`
- `codex-wrapper-updater`
- `composer-dictation`
- `conversation-mode`
- `farfield-bridge`
- `mcp-helper-reaper`
- `multi-auth-thread-status`
- `node-repl-reaper`
- `open-target-discovery`
- `persistent-status-panel`
- `read-aloud`
- `read-aloud-mcp`
- `remote-control-ui`
- `ui-tweaks`
- `unified-provider-history`

## Deliberately Disabled

- `agent-workspace`: the companion binary is not installed.
- `api-key-service-tier`: the active setup uses ChatGPT multi-auth rather than
  an API-key provider.
- `authenticated-proxy`: no authenticated proxy is configured.
- `copilot-reasoning-effort`: the active setup does not use Copilot auth.
- `example-feature`: repository development example only.
- `frameless-titlebar`: unnecessary for the current GNOME window setup.
- `record-and-replay`: specialized native capture prerequisites are not
  configured.
- `remote-mobile-control`: experimental account-level plumbing.
- `thorium-chrome-plugin`: Thorium is not installed.
- `x11-ewmh-computer-use`: the active desktop session is Wayland.

## Persistence

`linux-features/features.json` remains the loader's normal configuration path,
but it is force-added to this personal fork despite the repository ignore rule.
Once tracked, Git preserves it across pulls and rebuilds without changing the
empty upstream example profile.

This is intentionally a personal-fork policy. It is not suitable for an
upstream pull request because upstream optional features must remain disabled by
default.

## Runtime Safety

The existing confirmed-good plain `14421b8` runtime remains running while the
expanded main build is produced. The expanded source must remain a descendant
of `14421b8` containing only the approved documentation and configuration
commits, with no later feature implementation commits. The normal desktop
launcher moves to the expanded build only after build provenance, the
enabled-feature list, the webview endpoint, and the generated patch report are
verified.

The feature profile does not attempt to solve native dynamic-tool rehydration.
ImageGen, browser, dictation, plugins, and bundled-skill preservation will be a
separate design that avoids broad regex rewrites of minified bundles.

## Validation

1. Parse the JSON and assert the exact 15-id set.
2. Run every available focused `test.js` for the enabled features.
3. Rebuild from the pinned upstream DMG in `fedora-toolbox-43`.
4. Verify build provenance is clean and descends from `14421b8` without later
   feature implementation commits.
5. Verify all 15 ids appear in the generated patch report.
6. Reject any enabled feature whose generated patches are missing or skipped.
7. Cold-launch through the normal desktop wrapper and verify one main Electron
   process, webview HTTP 200, and the visible build badge.
8. Open and resume chats while checking for the renderer error boundary.

## Rollback

If the expanded profile fails validation, keep the committed configuration out
of `personal/main`, restore the desktop wrapper to the confirmed-good plain
`14421b8` worktree, and bisect only the feature list. Git recovery refs for the
previous main and later faulty feature branch remain available.
