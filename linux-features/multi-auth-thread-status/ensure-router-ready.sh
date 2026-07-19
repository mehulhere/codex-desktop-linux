#!/usr/bin/env bash
set -euo pipefail

app_dir="${1:?usage: ensure-router-ready.sh <app-dir>}"
codex_home="${CODEX_HOME:-${HOME:-}/.codex}"
state_path="$codex_home/multi-auth/app-bind/runtime-rotation-app-bind.json"

[ -f "$state_path" ] || exit 0

reader="$app_dir/resources/node-runtime/bin/node"
if [ ! -x "$reader" ]; then
    echo "Multi-auth router prelaunch check failed: bundled Node runtime is unavailable." >&2
    exit 1
fi

mapfile -t router_fields < <(
    "$reader" -e '
const fs = require("node:fs");
const path = require("node:path");
const state = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const fields = ["nodePath", "routerScriptPath", "statusPath", "statePath", "logPath"];
if (state.host !== "127.0.0.1" || !Number.isInteger(state.port) || state.port < 1 || state.port > 65535) {
  throw new Error("invalid loopback router endpoint");
}
for (const field of fields) {
  if (typeof state[field] !== "string" || !path.isAbsolute(state[field]) || /[\r\n]/u.test(state[field])) {
    throw new Error(`invalid ${field}`);
  }
}
process.stdout.write([String(state.port), ...fields.map((field) => state[field])].join("\n"));
' "$state_path"
)

if [ "${#router_fields[@]}" -ne 6 ]; then
    echo "Multi-auth router prelaunch check failed: saved bind state is incomplete." >&2
    exit 1
fi

router_port="${router_fields[0]}"
router_node="${router_fields[1]}"
router_script="${router_fields[2]}"
router_status="${router_fields[3]}"
router_state="${router_fields[4]}"
router_log="${router_fields[5]}"

router_is_ready() {
    (exec 3<>"/dev/tcp/127.0.0.1/$router_port") 2>/dev/null
}

router_is_ready && exit 0

if [ ! -x "$router_node" ] || [ ! -f "$router_script" ]; then
    echo "Multi-auth router prelaunch check failed: saved router runtime is unavailable." >&2
    exit 1
fi

mkdir -p "$(dirname "$router_log")"
if command -v setsid >/dev/null 2>&1; then
    nohup setsid "$router_node" "$router_script" \
        --port "$router_port" \
        --status "$router_status" \
        --state "$router_state" \
        --log "$router_log" \
        --max-log-bytes 1048576 \
        </dev/null >>"$router_log" 2>&1 &
else
    nohup "$router_node" "$router_script" \
        --port "$router_port" \
        --status "$router_status" \
        --state "$router_state" \
        --log "$router_log" \
        --max-log-bytes 1048576 \
        </dev/null >>"$router_log" 2>&1 &
fi

for _ in $(seq 1 100); do
    router_is_ready && exit 0
    sleep 0.05
done

echo "Multi-auth router prelaunch check failed: router did not become ready on 127.0.0.1:$router_port." >&2
exit 1
