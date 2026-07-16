# Visible Feature Build and Aggregate Quota Status Plan

1. Add red tests in `linux-features/ui-tweaks/test.js` for the feature-build
   descriptor, runtime marker, IPC request, and idempotence.
2. Add a red regression fixture in `linux-features/ui-tweaks/test.js` matching
   the current `jsxs(div)` profile-footer bundle shape; assert that the profile
   control is removed, Help remains, and the quota anchor is present.
3. Implement the build badge as a focused `webview-asset` patch registered by
   `ui-tweaks`, using build-info IPC and the existing show-build-info IPC.
4. Extend `hide-profile-name.js` with the current footer transformation while
   retaining the legacy transformation and its fail-soft behavior.
5. Update feature configuration documentation and focused tests.
6. Rebuild `codex-app`, inspect patch status and generated markers, restart the
   canonical launcher, and perform the available UI smoke check.
7. Commit the scoped fix with a Conventional Commit, push `main`, and record
   the exact verification commands and any manual check remaining.
