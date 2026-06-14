const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const pathname = decodeURIComponent(url.pathname);
    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^[/\\]+/, "");
    const normalizedPath = path.normalize(relativePath);

    if (normalizedPath.startsWith("..") || path.isAbsolute(normalizedPath)) {
      send(res, 403, "Forbidden");
      return;
    }

    const filePath = path.join(root, normalizedPath);

    fs.stat(filePath, (statErr, stat) => {
      if (statErr || !stat.isFile()) {
        send(res, 404, "Not found");
        return;
      }

      fs.readFile(filePath, (readErr, data) => {
        if (readErr) {
          send(res, 500, "Server error");
          return;
        }

        send(res, 200, data, types[path.extname(filePath)] || "application/octet-stream");
      });
    });
  })
  .listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });
