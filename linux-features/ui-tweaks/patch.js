"use strict";

const sidebarProjectName = require("./patches/sidebar-project-name.js");
const hideProfileName = require("./patches/hide-profile-name.js");

function patchesFrom(...modules) {
  return modules.flatMap((moduleExports) =>
    Array.isArray(moduleExports?.descriptors) ? moduleExports.descriptors : [],
  );
}

module.exports = {
  descriptors: patchesFrom(sidebarProjectName, hideProfileName),
};
