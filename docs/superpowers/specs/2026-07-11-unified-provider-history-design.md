# Unified Provider History Design

## Problem

Codex Desktop records each thread with its configured `model_provider`. Native
threads use `openai`; app-bound multi-account threads use
`codex-multi-auth-runtime-proxy`. Passing `modelProviders: null` to the current
app-server protocol applies the active-provider default, so changing the bind
makes one group appear to vanish even though all rollout files and state rows
remain under the same `~/.codex`.

The live incident was not random cleanup: another Codex thread followed the
existing diagnostic guidance and ran `codex-multi-auth rotation disable` to
restore native-provider visibility. That command persistently disabled rotation
and removed the app bind.

## Design

Add an opt-in Linux feature named `unified-provider-history`. Its webview asset
patch changes only thread-list request parameters from `modelProviders: null`
to `modelProviders: []`. Codex app-server 0.144.0 defines an explicitly present
empty array as “include all providers.” Thread execution, resume, fork, auth,
and storage remain unchanged.

The patch is idempotent, fail-soft, and scoped to JavaScript assets containing
both `thread/list` and `modelProviders:null`. It must not rewrite model provider
values in SQLite, rollout JSONL, config files, or thread start/resume requests.

Update `codex-multi-auth` status and troubleshooting guidance to explain that
the unified-history Desktop feature permits keeping the app bind enabled. The
generic `history list --json` command remains the source-of-truth fallback for
unpatched Desktop builds.

## Verification

- Unit-test the asset patch with current minified request shapes.
- Verify RED before implementation and idempotent GREEN afterward.
- Run the Desktop feature test and the complete patch regression suite.
- Rebuild a side-by-side Desktop candidate with both
  `multi-auth-thread-status` and `unified-provider-history` enabled.
- Verify the packaged ASAR contains `modelProviders:[]` in thread-list paths.
- Re-enable and bind runtime rotation, then verify the source history catalog
  still contains both provider groups without modifying their stored values.
