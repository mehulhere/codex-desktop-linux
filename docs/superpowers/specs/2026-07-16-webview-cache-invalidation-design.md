# Webview Cache Invalidation Design

## Problem

Codex Desktop for Linux serves patched webview assets from the stable local
origin `http://127.0.0.1:5175`. Linux feature patches can change JavaScript
content without changing the upstream hashed asset filenames. Chromium may
therefore retain compiled code or cached module state for a URL whose content
changed during a rebuild. The observed failures include stale dynamic-import
URLs and renderer bridge exceptions such as `te is not a function` while the
Electron process and local webview server remain healthy.

## Selected Approach

On every cold launch, calculate a lightweight fingerprint of the installed
Linux build. Compare it with a marker stored under the app's launcher state
directory. When the marker is missing or the fingerprint changed, remove only
the disposable Chromium web caches from the Electron user-data directory:

- `Cache`
- `Code Cache`
- `Service Worker`

Then atomically write the new fingerprint marker. An unchanged build leaves
the caches intact. Warm-start handoffs never clear a live renderer's cache.

The fingerprint uses `resources/codex-linux-build-info.json` when present. A
fallback based on the installed ASAR and webview entrypoint metadata supports
older or manually assembled installs without hashing the 260 MB ASAR on every
launch.

## Safety

The cleanup must never touch authentication, settings, cookies, IndexedDB,
local storage, session storage, Codex history, or `~/.codex`. Cache paths are
fixed children of the resolved Electron user-data directory. The standard app
uses `${XDG_CONFIG_HOME:-$HOME/.config}/Codex`; side-by-side installs already
provide an explicit `CODEX_ELECTRON_USER_DATA_DIR`.

Cache removal is best-effort. A failure emits a visible warning and leaves the
fingerprint unchanged so the next cold launch retries instead of silently
claiming success.

## Components

- `launcher/webview-cache.py`: calculate the fingerprint, compare/write the
  state marker, validate cache paths, and remove changed-build caches.
- `launcher/start.sh.template`: resolve the active Electron user-data path and
  invoke the helper only during cold startup before Electron launches.
- `install.sh` and packaging helpers: stage the helper beside the existing
  webview server so direct installs and update-builder payloads behave alike.
- `tests/scripts_smoke.sh`: exercise first-run cleanup, unchanged-build cache
  preservation, changed-build cleanup, protected-data preservation, and staged
  helper presence.

## Current-Machine Recovery

After installing the change, archive the existing disposable caches inside the
dated recovery backup, remove them from `~/.config/Codex`, and launch the app
normally without the temporary remote-debugging flag. Verify the webview
origin, open several existing chats, and confirm the launcher log contains no
new renderer error boundary.

