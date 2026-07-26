# Turn Completion Diagnostics

This optional feature enables focused `RUST_LOG` tracing for the Codex core
turn lifecycle and app-server delivery path. It is intended for diagnosing a
turn that emits `task_complete` or `turn/completed` without a final assistant
message while Electron and the app-server remain alive.

The trace is written through the normal Desktop launcher log:

```text
~/.cache/codex-desktop/launcher.log
```

The filter intentionally excludes general HTTP, MCP, Git watcher, and renderer
debug traffic. Diagnostic output can still contain local task identifiers,
paths, tool names, and error details, so treat the launcher log as private.

## Enable

Add `turn-completion-diagnostics` to `linux-features/features.json`, stage or
rebuild the app, and restart Codex Desktop. The launcher should report the
feature environment hook during startup.

## Verify

After starting a short disposable task, confirm the launcher log contains
entries from `codex_core::session::turn` or
`codex_app_server::outgoing_message`. Disable the feature after reproducing the
problem to return to the default logging volume.
