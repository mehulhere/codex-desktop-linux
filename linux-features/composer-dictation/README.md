# Composer Dictation

Opt-in support for the standard Codex composer microphone on Linux.

This feature only enables voice-to-text message dictation. It does not add
speaker buttons to assistant responses, read responses aloud, or start a
continuous voice conversation.

## Enable

Add `composer-dictation` to `linux-features/features.json`, then rebuild the
app. Microphone permission is requested by Electron the first time dictation
starts.

## Test

```bash
node --test linux-features/composer-dictation/test.js
```
