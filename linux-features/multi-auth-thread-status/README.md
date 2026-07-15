# Multi-auth Per-thread Status

Opt-in integration for `codex-multi-auth` quota-aware Desktop routing. It adds
the locally routed account to the current thread's `/status` dialog and a
pool-wide indicator in the upper title bar:

```text
Account:  Account 4 (oc***@icloud.com)
5h limit: 96% left (resets 09:42)
7d limit: 99% left (resets 18 Jul)

Title-bar circle: 25
Hover card: 176% total | 25% average across 7 accounts
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
- The title-bar circle shows the rounded combined 7-day average without
  covering the app's layout controls. Hovering or keyboard-focusing it shows
  pool totals and averages for both windows.
- Missing 5-hour data reads `Unavailable`; it is never treated as zero. The
  local status snapshot refreshes on focus and every 60 seconds without
  launching live quota probes from Desktop.
- The 5-hour and 7-day rows use that assigned account's redacted quota
  windows, including percentage remaining and reset time. Native Desktop quota
  rows remain the fallback when multi-auth has no valid quota snapshot.
- Resuming or forking a task created under the native `openai` provider routes
  its next request through `codex-multi-auth-runtime-proxy`, so legacy tasks do
  not bypass quota rotation.
- A routed thread is assigned as soon as the router selects a usable account,
  and that redacted assignment survives router restarts for up to 90 days.
- A thread with no assignment explains why: no current assignment record exists,
  assignment storage is unavailable, the router is unavailable, or its status
  file is unavailable.
- Malformed, stale, or untrusted status requests return no account data.
- The pool IPC response contains aggregate counts and percentages only. The
  renderer never receives the account pool, IDs, emails, or tokens.
- Patch drift is fail-soft and reported during the Linux build.
- The indicator is part of this source feature, so future DMG rebuilds reapply
  it through `linux-features/features.json`; generated `app.asar` files are not
  the durable source.

## Test

```bash
node --test linux-features/multi-auth-thread-status/test.js
```
