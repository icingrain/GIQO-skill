import { basename, extname, resolve, sep } from "node:path";

export function contentType(pathname) {
  const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
  };
  return types[extname(pathname)] || "application/octet-stream";
}

export function dashboardServeTarget(filePath) {
  const parent = resolve(filePath, "..");
  const grandparent = resolve(parent, "..");
  if (filePath.endsWith(`${sep}.giqo${sep}plans${sep}dashboard${sep}dashboard.html`) || (parent.endsWith(`${sep}dashboard`) && grandparent.endsWith(`${sep}plans`))) {
    return { root: grandparent, fileName: `dashboard${sep}${basename(filePath)}` };
  }
  return { root: parent, fileName: basename(filePath) };
}
