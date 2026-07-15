"use strict";

const sidebarProjectName = require("./patches/sidebar-project-name.js");
const hideProfileName = require("./patches/hide-profile-name.js");
const modelPickerModelList = require("./patches/model-picker-model-list.js");
const reasoningEffortLabels = require("./patches/reasoning-effort-labels.js");

function patchesFrom(...modules) {
  return modules.flatMap((moduleExports) =>
    Array.isArray(moduleExports?.descriptors) ? moduleExports.descriptors : [],
  );
}

module.exports = {
  descriptors: patchesFrom(
    sidebarProjectName,
    modelPickerModelList,
    reasoningEffortLabels,
    hideProfileName,
  ),
};
