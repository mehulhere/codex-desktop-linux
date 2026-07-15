"use strict";

const JS_IDENT = "[A-Za-z_$][\\w$]*";

function applyLinuxDictationAvailabilityPatch(source) {
  if (source.includes('navigator.userAgent.includes("Linux")?!0:')) {
    return source;
  }
  if (!source.includes('Ql(`3207467860`)') || !source.includes("isDictationButtonVisible")) {
    return source;
  }

  const availabilityPattern = new RegExp(
    `(${JS_IDENT}=Ql\\(` +
      "`3207467860`" +
      `\\),${JS_IDENT}=${JS_IDENT},)(${JS_IDENT})=(${JS_IDENT}\\(${JS_IDENT}\\))`,
  );
  const match = source.match(availabilityPattern);
  if (!match) {
    console.warn(
      "WARN: Could not find current dictation availability gate - skipping Linux composer dictation patch",
    );
    return source;
  }

  return source.replace(
    availabilityPattern,
    `$1$2=navigator.userAgent.includes("Linux")?!0:$3`,
  );
}

module.exports = {
  applyLinuxDictationAvailabilityPatch,
  descriptors: [
    {
      id: "linux-dictation-availability",
      phase: "webview-asset",
      order: 20685,
      ciPolicy: "optional",
      pattern: /^app-initial~app-main~page-.*\.js$/,
      missingDescription: "current composer page bundle",
      skipDescription: "Linux composer dictation patch",
      apply: applyLinuxDictationAvailabilityPatch,
    },
  ],
};
