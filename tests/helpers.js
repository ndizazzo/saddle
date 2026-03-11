"use strict";

const os = require("os");
const fs = require("fs");
const path = require("path");

function makeTempDir(prefix = "saddle-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function mkfile(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function mkdir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function clearConfigModules() {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes(path.join("scripts", "load-config")) ||
      key.includes(path.join("scripts", "install-core"))
    ) {
      delete require.cache[key];
    }
  }
}

module.exports = { makeTempDir, rmrf, mkfile, mkdir, clearConfigModules };
