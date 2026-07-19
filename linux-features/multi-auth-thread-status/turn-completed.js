"use strict";

const TURN_COMPLETED_EVENT = "codex-linux-turn-completed";

function applyTurnCompletedRefreshPatch(source) {
  if (source.includes(TURN_COMPLETED_EVENT)) return source;
  const needle =
    /case`turn\/completed`:\{if\(this\.frameTextDeltaQueue\.drainBefore\(\(\)=>\{this\.onNotification\(`turn\/completed`,([A-Za-z_$][\w$]*)\.params\)\}\)\)break;/;
  const match = source.match(needle);
  if (match == null) return source;
  return source.replace(
    match[0],
    `${match[0]}window.dispatchEvent(new Event(${JSON.stringify(TURN_COMPLETED_EVENT)}));`,
  );
}

module.exports = { applyTurnCompletedRefreshPatch, TURN_COMPLETED_EVENT };
