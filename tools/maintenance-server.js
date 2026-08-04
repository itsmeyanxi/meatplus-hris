// Tiny HTTP server that serves the "Under Maintenance" page for EVERY request.
// Used during a frontend rebuild: we stop Next.js (which frees port 80), run this
// so visitors see a friendly page instead of ERR_CONNECTION_REFUSED, then stop it
// and hand port 80 back to Next.js. Responds 503 + Retry-After so bots/devices
// know it's temporary; the HTML auto-refreshes so humans land back in the app.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 80);
const HOST = process.env.HOST || "0.0.0.0";
const html = fs.readFileSync(path.join(__dirname, "maintenance.html"));

const server = http.createServer((req, res) => {
  res.writeHead(503, {
    "Content-Type": "text/html; charset=utf-8",
    "Retry-After": "30",
    "Cache-Control": "no-store",
  });
  res.end(html);
});

server.on("error", (err) => {
  console.error("maintenance-server error:", err.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`maintenance page serving on ${HOST}:${PORT}`);
});
