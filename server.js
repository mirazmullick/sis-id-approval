// Local preview server for the approval dashboard (also handy for hosting it
// on the office LAN: node server.js, then share http://<your-ip>:4319/).
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 4319;
const TYPES = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.json': 'application/json', '.js': 'text/javascript' };

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/SIS-Employee-ID-Approval.html';
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('ID approval dashboard on http://localhost:' + PORT));
