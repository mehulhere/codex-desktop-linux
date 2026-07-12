# Farfield Bridge

This opt-in feature adds one targeted Desktop follower request for Farfield:
`thread-follower-open-side-chat`. The request accepts the parent
`conversationId`, calls the same empty side-task callback used by Desktop's
`/side` command, and returns the resulting side-task conversation ID.

The Desktop owner still performs the native ownership and side-task context
checks. Side tasks remain ephemeral, appear in Desktop's right panel, and use
Desktop's existing fork and injected-boundary behavior. The feature does not
simulate keyboard input or synchronize panel closing between clients.

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

All three asset descriptors are optional and idempotent. Each skips with a
drift report if its current Desktop bundle no longer exposes the required
integration needles.
