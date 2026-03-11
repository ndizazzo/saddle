import React from "react";
import os from "os";
import path from "path";

export const h = React.createElement;

const HOME = os.homedir();

export function contractHome(p) {
  if (typeof p !== "string" || !p) return p;
  if (p === HOME || p.startsWith(HOME + path.sep)) {
    return "~" + p.slice(HOME.length);
  }
  return p;
}
