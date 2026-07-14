# Multi-auth Pool Quota Indicator Design

## Goal

Show the combined `codex-multi-auth` quota pool in two places:

- `codex-multi-auth check` prints the total and per-account average for each
  available quota window.
- Codex Desktop shows a compact top-right circular estimate and a hover card
  with the same totals and averages.

The feature must survive future Codex Desktop DMG refreshes through the Linux
fork's existing optional-feature rebuild pipeline.

## Semantics

For each quota window, sum the percentage remaining across every configured
account with a valid value. Divide that total by the number of configured
accounts, not only the accounts that supplied a value. A missing window is
reported as unavailable rather than as zero.

Example for seven accounts with 7-day values `0, 0, 37, 40, 35, 26, 38`:

```text
7d: 176% total | 25% average
```

The displayed average is rounded to the nearest whole percent. Internal helper
results retain enough precision for deterministic rounding at presentation
time. The aggregate includes exhausted accounts because zero remaining is a
real pool value.

When the 5-hour window is disabled or absent for every account, both surfaces
show it as unavailable. When it returns, both surfaces display it automatically.

## Shared Data Ownership

`codex-multi-auth` owns the aggregation semantics. A small pure helper accepts
configured account count plus sanitized quota windows and returns per-window
account count, available-value count, total remaining percentage, and average
remaining percentage.

The account-check command uses this helper after its per-account rows. The
persistent Desktop router uses the same helper to write a redacted pool summary
to `runtime-rotation-app-bind-status.json`. The summary contains only counts,
window durations, percentages, reset bounds when known, and an update time. It
does not contain account IDs, emails, access tokens, refresh tokens, or raw
account records.

## CLI Output

After the account rows and before the existing result line, `check` prints:

```text
Combined limits (7 accounts):
  7d: 176% total | 25% average
  5h: unavailable
```

Window labels are derived from the existing duration classification so the
5-hour and 7-day values cannot be swapped by response ordering. JSON or other
machine-readable command contracts remain unchanged unless they already expose
an extensible aggregate field.

## Desktop UI

Extend the existing opt-in `multi-auth-thread-status` Linux feature rather than
patching generated `codex-app` files directly.

A small circular indicator appears in the top-right app toolbar beside the
existing layout controls. It displays the rounded 7-day average without a
percent sign to remain compact. Its accessible label includes the full meaning,
for example `Combined 7-day quota: 25% remaining across 7 accounts`.

Hovering or keyboard-focusing the indicator opens a card:

```text
Combined quota · 7 accounts

7-day    176% total    25% average
5-hour   Unavailable

Updated moments ago
```

The circular ring reflects the 7-day average. Color is supplementary rather
than the only signal. Missing or stale data displays an em dash and an
unavailable explanation; it is never displayed as zero.

The renderer receives only the sanitized aggregate through the feature's
existing narrow main-process/preload IPC bridge. It polls the local snapshot at
a modest interval and when the window regains focus. Desktop never starts live
quota probes.

## Freshness And Failure Handling

The router updates the aggregate whenever its quota cache or runtime status is
refreshed. Desktop displays the snapshot age. Invalid fields are discarded at
the main-process boundary. A missing status file, disabled router, malformed
summary, or stale summary produces the neutral unavailable state without
affecting the rest of Codex Desktop.

All ASAR patching stays fail-soft and idempotent. Upstream UI drift is reported
by feature tests and rebuild reports rather than preventing the app from
launching.

## Persistence Across Updates

The source changes live in the two existing personal feature branches:

- `codex-multi-auth`: aggregate helper, check output, and redacted router
  snapshot.
- `codex-desktop-linux`: optional feature IPC and toolbar UI patch.

`linux-features/features.json` already enables `multi-auth-thread-status` in the
local Linux checkout. Future DMG rebuilds reapply the feature from source. No
durability relies on editing `codex-app/resources/app.asar` by hand.

## Verification

Tests cover:

- total and average calculation, including zeros, missing windows, invalid
  values, rounding, and changing account counts;
- exact human-readable `check` output for available and unavailable windows;
- router snapshot redaction and freshness;
- main-process sanitization and preload exposure;
- toolbar patch insertion, idempotence, accessibility text, unavailable state,
  hover content, and upstream-drift failure behavior;
- a rebuilt candidate using the enabled local feature, followed by visual and
  runtime verification in the installed Codex Desktop.
