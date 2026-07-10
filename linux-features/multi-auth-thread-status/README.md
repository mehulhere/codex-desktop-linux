# Multi-auth Per-thread Status

Opt-in integration for `codex-multi-auth` quota-aware Desktop routing. It adds
the locally routed account to the current thread's `/status` dialog:

```text
Account:  Account 4 (oc***@icloud.com)
```

The feature reads the owner-only app-router status file through a narrow
main-process IPC handler. The renderer receives only the requested thread's
account ordinal, masked email, quota windows, and update timestamp. It never
receives the account pool, full email, account ID, access token, or refresh
token.

## Enable

Add the feature ID before installing or rebuilding:

```json
{
  "enabled": ["multi-auth-thread-status"]
}
```

The configuration file is `linux-features/features.json` and remains local and
gitignored. The feature is useful only when `codex-multi-auth rotation bind-app`
is active and its persistent router writes
`~/.codex/multi-auth/app-bind/runtime-rotation-app-bind-status.json`.

## Behavior

- `/status` shows `Account N (masked email)` for the open thread.
- A thread without a successful routed response shows `Not assigned yet`.
- Malformed, stale, or untrusted status requests return no account data.
- Existing 5-hour and 7-day quota rows remain owned by Codex Desktop.
- Patch drift is fail-soft and reported during the Linux build.

## Test

```bash
node --test linux-features/multi-auth-thread-status/test.js
```
