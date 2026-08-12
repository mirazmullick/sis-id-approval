// Local preview server for the approval dashboard (also handy for hosting it
// on the office LAN: node server.js, then share http://<your-ip>:4319/).
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 4319;
const TYPES = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.json': 'application/json', '.js': 'text/javascript' };

// Stands in for the Google Apps Script web app so the sync flow can be tested
// locally. Same request/response shape as apps-script/Code.gs.
const mock = { rows: {} };
function mockSync(req, res) {
  const url = new URL(req.url, 'http://x');
  const reply = obj => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(obj));
  };
  if (req.method === 'GET') {
    if (url.searchParams.get('token') !== 'mock-token') return reply({ ok: false, error: 'bad token' });
    return reply({ ok: true, responses: Object.values(mock.rows) });
  }
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    try {
      const d = JSON.parse(body);
      if (d.token !== 'mock-token') return reply({ ok: false, error: 'bad token' });
      if (!d.id) return reply({ ok: false, error: 'missing employee id' });
      mock.rows[d.id] = { at: new Date().toISOString(), id: d.id, name: d.name, designation: d.designation,
        status: d.status, approved: !!d.approved, remarks: d.remarks || '', by: d.by || '' };
      reply({ ok: true });
    } catch (e) { reply({ ok: false, error: String(e) }); }
  });
}

http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/mock-sync') return mockSync(req, res);
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
