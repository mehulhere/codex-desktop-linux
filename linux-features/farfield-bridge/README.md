# Farfield Bridge

This opt-in feature connects an authenticated Farfield follower to Desktop's
native task UI without simulating keyboard input. It adds acknowledged follower
requests for:

- navigating to a task, placing the exact follower prompt in its native
  composer, and invoking Desktop's normal submit action;
- appending one message to a task's native queued follow-ups;
- opening Desktop's native temporary side task;
- rehydrating the open native task after its rollout becomes terminal.

Takeover submission waits for the requested task's native composer to mount,
then calls the same submit function used by Desktop. The follower receives
success only after Desktop reports either a started turn or a persisted native
queued-follow-up ID. Composer readiness is bounded to ten seconds, and the
request returns an error instead of switching transports.

Farfield watches the durable rollout lifecycle after an accepted takeover. If
Desktop's live renderers miss the terminal app-server event, Farfield asks the
Desktop main process to refresh the primary renderer's recent-conversation
store. Desktop re-queries its local thread list and updates the sidebar without
reloading any window. Any surviving primary renderer may acknowledge this
refresh request, so a renderer that lost its IPC registration after a router
restart can self-reconnect without restarting Desktop.

Queue appends merge into Desktop's current global queue state, persist that
state, publish `thread-queued-followups-changed`, and return the accepted
per-task queue. A follower never has to replace queues belonging to other
tasks.

Queue and side-task requests still enforce Desktop ownership. Composer drafts
remain local to the surface where they were typed and are never copied between
Desktop and Farfield. The feature does not synchronize queued-message editing
or deletion beyond Desktop's existing queue-state behavior.

Enable it only in the gitignored local feature config before rebuilding:

```json
{
  "enabled": ["farfield-bridge"]
}
```

Run the focused verification with:

```bash
node --test linux-features/farfield-bridge/test.js
node --test scripts/patch-linux-window-ui.test.js
```

All six patch descriptors are optional and idempotent. Each skips with a
drift report if the current Desktop bundle no longer exposes the required
integration needles. The safe candidate rebuild additionally treats any
missing or skipped Farfield descriptor as a build failure whenever this
feature is enabled, preventing an incomplete bridge from being staged.
