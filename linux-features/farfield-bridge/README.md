# Farfield Bridge

This opt-in feature connects an authenticated Farfield follower to Desktop's
native task UI without simulating keyboard input. It adds acknowledged follower
requests for:

- navigating to a task, placing the exact follower prompt in its native
  composer, and invoking Desktop's normal submit action;
- appending one message to a task's native queued follow-ups;
- reading and updating a persistent per-task composer draft; and
- opening Desktop's native temporary side task;
- rehydrating the open native task after its rollout becomes terminal.

Takeover submission waits for the requested task's native composer to mount,
then calls the same submit function used by Desktop. The follower receives
success only after Desktop reports either a started turn or a persisted native
queued-follow-up ID. Composer readiness is bounded to ten seconds, and the
request returns an error instead of switching transports.

Farfield watches the durable rollout lifecycle after an accepted takeover. If
Desktop's live renderers miss the terminal app-server event, Farfield asks the
Desktop main process to reload its registered app windows after completion.
Refreshing both the primary window and auxiliary task overlays makes the
completed answer visible immediately and lets Desktop drain any shared native
follow-up queue. Any surviving renderer may acknowledge this refresh request,
so a primary window that lost its IPC registration after a router restart can
self-reconnect without restarting Desktop.

Queue appends merge into Desktop's current global queue state, persist that
state, publish `thread-queued-followups-changed`, and return the accepted
per-task queue. A follower never has to replace queues belonging to other
tasks.

Composer drafts are stored per conversation in the Desktop renderer and use
monotonic revisions. The mounted native composer and remote follower publish
through the same draft state. Stale revisions return the current authoritative
draft instead of overwriting it. `thread-composer-draft-changed` broadcasts
notify followers after accepted local or remote changes.

Queue and side-task requests still enforce Desktop ownership. Draft requests
use the renderer's persistent per-task draft store even when that task is not
currently mounted. The feature does not synchronize queued-message editing or
deletion beyond Desktop's existing queue-state behavior.

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

All five patch descriptors are optional and idempotent. Each skips with a
drift report if the current Desktop bundle no longer exposes the required
integration needles.
