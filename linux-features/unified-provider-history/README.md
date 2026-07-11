# Unified Provider History

This opt-in Linux feature keeps Codex Desktop history visible across model
provider changes. It is intended for local routers such as `codex-multi-auth`,
where new threads use a custom provider ID while older native threads remain
recorded as `openai`.

Enable it in `linux-features/features.json` before rebuilding:

```json
{
  "enabled": ["multi-auth-thread-status", "unified-provider-history"]
}
```

The current app-server protocol treats `modelProviders: []` on `thread/list`
as “include all providers.” This feature changes only those history-list
parameters. It does not rewrite SQLite, rollout files, config providers, or
thread execution/resume/fork requests.

Run its focused test with:

```bash
node --test linux-features/unified-provider-history/test.js
```
