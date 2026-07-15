#!/usr/bin/env bash
set -euo pipefail

app_dir="${1:-${CODEX_LINUX_APP_DIR:-}}"
assets_dir="$app_dir/content/webview/assets"
title="CODEX NATIVE CAPABILITY ERROR"

fail_closed() {
    local message="$1"
    printf '%s: %s\n' "$title" "$message" >&2
    if [ "${CODEX_MULTI_AUTH_GUARD_TEST:-0}" != "1" ]; then
        if command -v notify-send >/dev/null 2>&1; then
            notify-send --urgency=critical --icon=dialog-error "$title" "$message" 2>/dev/null || true
        elif command -v zenity >/dev/null 2>&1; then
            zenity --error --title="$title" --text="$message" 2>/dev/null || true
        fi
    fi
    exit 78
}

[ -n "$app_dir" ] || fail_closed "Desktop app directory is unavailable. Codex was not started."
[ -d "$assets_dir" ] || fail_closed "Desktop webview assets are unavailable. Codex was not started."

mapfile -t bundles < <(find "$assets_dir" -maxdepth 1 -type f -name 'app-initial*.js' -print)
[ "${#bundles[@]}" -gt 0 ] || fail_closed "Desktop routing bundle is unavailable. Codex was not started."

if grep -Fq 'codex-multi-auth-runtime-proxy' "${bundles[@]}"; then
    fail_closed "The routed provider would remove ImageGen, browser, dictation, and bundled skills. Codex was stopped before any tokens could be spent."
fi
if ! grep -Fq 'modelProvider:`openai`' "${bundles[@]}"; then
    fail_closed "The native OpenAI provider guard is missing. Codex was stopped before any tokens could be spent."
fi
if ! grep -Fq 'skipDynamicTools:!1' "${bundles[@]}" ||
   ! grep -Fq 'native Desktop tools and skills are unavailable' "${bundles[@]}"; then
    fail_closed "The fail-closed guard is missing. Codex was stopped before any tokens could be spent."
fi

exit 0
