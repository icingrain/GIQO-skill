#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, extname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

const defaultFile = "templates/visual-review/mockup.html";

function printHelp() {
  console.log(`GIQO Visual Review launcher

Usage:
  node scripts/open-visual-review.mjs [html-file] [--port 8765] [--host 127.0.0.1] [--actual URL] [--open]

Examples:
  node scripts/open-visual-review.mjs
  node scripts/open-visual-review.mjs templates/visual-review/wireframe.html
  node scripts/open-visual-review.mjs ./ui-review/mockup.html --port 9000
  node scripts/open-visual-review.mjs ./ui-review/mockup.html --actual http://localhost:3000
  node scripts/open-visual-review.mjs --open
`);
}

function parseArgs(argv) {
  const options = {
    file: defaultFile,
    host: "127.0.0.1",
    port: 8765,
    actual: "",
    openBrowser: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--open") {
      options.openBrowser = true;
      continue;
    }
    if (arg === "--no-open") {
      options.openBrowser = false;
      continue;
    }
    if (arg === "--host") {
      options.host = argv[index + 1] || options.host;
      index += 1;
      continue;
    }
    if (arg === "--port") {
      options.port = Number.parseInt(argv[index + 1] || String(options.port), 10);
      index += 1;
      continue;
    }
    if (arg === "--mode") {
      index += 1;
      continue;
    }
    if (arg === "--actual") {
      options.actual = argv[index + 1] || options.actual;
      index += 1;
      continue;
    }
    if (!arg.startsWith("--")) {
      options.file = arg;
    }
  }

  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error("Port must be an integer between 1 and 65535.");
  }
  return options;
}

function contentType(pathname) {
  const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
  };
  return types[extname(pathname)] || "application/octet-stream";
}

function openUrl(url) {
  const commands = {
    darwin: ["open", [url]],
    linux: ["xdg-open", [url]],
    win32: ["cmd", ["/c", "start", "", url]],
  };
  const command = commands[process.platform];
  if (!command) {
    console.log(`Open this URL manually: ${url}`);
    return;
  }
  const child = spawn(command[0], command[1], { detached: true, stdio: "ignore" });
  child.unref();
}

function safePath(root, requestUrl) {
  const url = new URL(requestUrl, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const requested = pathname === "/" ? "mockup.html" : pathname.slice(1);
  const fullPath = normalize(join(root, requested));
  const rootWithSeparator = root.endsWith(sep) ? root : `${root}${sep}`;
  if (fullPath !== root && !fullPath.startsWith(rootWithSeparator)) {
    return null;
  }
  return fullPath;
}

function validateActualUrl(value) {
  if (!value) {
    return null;
  }
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("--actual must be an http or https URL.");
  }
  return url;
}

function actualTarget(actualUrl, requestUrl) {
  const url = new URL(requestUrl, "http://localhost");
  const pathname = url.pathname.replace(/^\/__gqo\/actual\/?/, "");
  const target = new URL(pathname || actualUrl.pathname || "/", actualUrl.origin);
  target.search = url.search || actualUrl.search;
  return target;
}

function actualBasePath(actualUrl) {
  if (actualUrl.pathname.endsWith("/")) {
    return actualUrl.pathname;
  }
  const lastSlash = actualUrl.pathname.lastIndexOf("/");
  return actualUrl.pathname.slice(0, lastSlash + 1) || "/";
}

function rewriteActualHtml(html, actualUrl) {
  const base = `<base href="/__gqo/actual${actualBasePath(actualUrl)}">`;
  const rewritten = html
    .replaceAll(/(src|href|action)="\//g, '$1="/__gqo/actual/')
    .replaceAll(/(src|href|action)='\//g, "$1='/__gqo/actual/");
  return /<head[^>]*>/i.test(rewritten) ? rewritten.replace(/<head[^>]*>/i, (match) => `${match}${base}`) : `${base}${rewritten}`;
}

function stateDir(filePath) {
  const screen = basename(filePath, extname(filePath)) || "review";
  return resolve(process.cwd(), ".giqo", "ui-review", screen);
}

function readBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    request.on("error", rejectBody);
  });
}

async function writeReviewState(dir, body) {
  const payload = JSON.parse(body);
  await mkdir(dir, { recursive: true });
  await Promise.all([
    writeFile(join(dir, "state.json"), JSON.stringify(payload, null, 2), "utf8"),
    writeFile(join(dir, "targets.json"), JSON.stringify(payload.targets || [], null, 2), "utf8"),
    writeFile(join(dir, "comments.json"), JSON.stringify(payload.comments || [], null, 2), "utf8"),
    writeFile(join(dir, "change-requests.json"), JSON.stringify(payload.changeRequests || { requests: [] }, null, 2), "utf8"),
    writeFile(join(dir, "review.md"), payload.markdown || "# Visual Review Comments\n", "utf8"),
  ]);
}

async function readReviewState(dir) {
  try {
    return await readFile(join(dir, "state.json"), "utf8");
  } catch {
    return "{}";
  }
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function serve(root, dir, actualUrl) {
  return createServer((request, response) => {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname === "/__gqo/state" && request.method === "GET") {
      readReviewState(dir).then((body) => {
        response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(body);
      }).catch((error) => json(response, 500, { ok: false, error: String(error) }));
      return;
    }
    if (url.pathname === "/__gqo/save" && request.method === "POST") {
      readBody(request)
        .then((body) => writeReviewState(dir, body))
        .then(() => json(response, 200, { ok: true }))
        .catch((error) => json(response, 400, { ok: false, error: String(error) }));
      return;
    }
    if (actualUrl && url.pathname.startsWith("/__gqo/actual")) {
      const target = actualTarget(actualUrl, request.url || "/");
      fetch(target, { redirect: "follow" })
        .then(async (actualResponse) => {
          const type = actualResponse.headers.get("content-type") || "application/octet-stream";
          response.writeHead(actualResponse.status, { "content-type": type, "cache-control": "no-store" });
          if (type.includes("text/html")) {
            response.end(rewriteActualHtml(await actualResponse.text(), actualUrl));
            return;
          }
          response.end(Buffer.from(await actualResponse.arrayBuffer()));
        })
        .catch((error) => json(response, 502, { ok: false, error: String(error) }));
      return;
    }
    const filePath = safePath(root, request.url || "/");
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "content-type": contentType(filePath) });
    createReadStream(filePath).pipe(response);
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const actualUrl = validateActualUrl(options.actual);
  const reviewFilePath = isAbsolute(options.file) ? options.file : resolve(process.cwd(), options.file);
  const liveShellPath = resolve(process.cwd(), "templates/visual-review/live-shell.html");
  const filePath = actualUrl ? liveShellPath : reviewFilePath;
  if (!existsSync(reviewFilePath) || !statSync(reviewFilePath).isFile()) {
    throw new Error(`Review HTML file not found: ${reviewFilePath}`);
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    throw new Error(`Review shell file not found: ${filePath}`);
  }
  const dashboardServe = dashboardServeTarget(filePath);
  const root = dashboardServe.root;
  const dir = stateDir(reviewFilePath);
  const fileName = dashboardServe.fileName;
  const query = new URLSearchParams();
  if (actualUrl) {
    query.set("actual", actualUrl.href);
  }
  const url = `http://${options.host}:${options.port}/${encodeURIComponent(fileName)}?${query.toString()}`;
  const server = serve(root, dir, actualUrl);

  server.listen(options.port, options.host, () => {
    console.log(`GIQO Visual Review is running at ${url}`);
    console.log(`Review state saves to ${dir}`);
    console.log("Press Ctrl+C to stop the server.");
    if (options.openBrowser) {
      openUrl(url);
    }
  });

  server.on("error", (error) => {
    console.error(error.message);
    process.exit(1);
  });
}

function dashboardServeTarget(filePath) {
  const parent = resolve(filePath, "..");
  const grandparent = resolve(parent, "..");
  if (filePath.endsWith(`${sep}.giqo${sep}plans${sep}dashboard${sep}dashboard.html`) || (parent.endsWith(`${sep}dashboard`) && grandparent.endsWith(`${sep}plans`))) {
    return { root: grandparent, fileName: `dashboard${sep}${filePath.split(sep).pop()}` };
  }
  return { root: parent, fileName: filePath.split(sep).pop() };
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
