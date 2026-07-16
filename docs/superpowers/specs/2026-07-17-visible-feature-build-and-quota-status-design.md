# Visible Feature Build and Aggregate Quota Status

## Problem

The Linux Desktop build currently has no durable visual indicator showing which
source revision is running. The aggregate multi-account quota data is healthy,
but the compact sidebar row is missing because its footer mount anchor drifted
out of the upstream profile-footer bundle.

## Approved design

### Feature-build badge

- Add a centered, compact red `FEATURE BUILD · <7-char-commit>` badge through
  the enabled `ui-tweaks` feature.
- Read the commit from the existing embedded
  `resources/codex-linux-build-info.json` through the existing trusted
  `codex-linux-get-build-info` IPC request; do not duplicate or hard-code the
  revision in the webview patch.
- Make the badge clickable. It opens the existing full build-information
  dialog through `codex-linux-show-build-info`.
- Keep the badge non-draggable and above the webview so it remains visible on
  the home screen and in chats.
- Log a visible console warning if build metadata cannot be loaded; never hide
  a failure silently.

### Aggregate quota row

- Keep the existing privacy boundary: only account count, aggregate
  percentages, and update time reach the renderer.
- Update the profile-footer patch to support the current upstream minified
  footer shape, remove the individual account marker, retain Help, and emit the
  stable `data-codex-linux-sidebar-footer` mount anchor.
- Preserve the existing five-hour omission behavior when that window is not
  available.
- Keep both patches idempotent and fail-soft when upstream assets drift.

## Verification

- Unit-test both patch transformations and their idempotence.
- Rebuild the local app from the source feature set, inspect the patch report,
  and verify the generated webview contains both runtime markers.
- Restart the installed launcher and manually verify the badge and the
  aggregate quota row in the Desktop sidebar.
