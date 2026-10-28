// E2E-1: мінімальний статичний сервер для Playwright (без залежностей). Віддає корінь репозиторію; без кешу.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const port = Number(process.env.E2E_PORT || 8935);
http.createServer(function(req, res){
  let p = decodeURIComponent((req.url || '/').split('?')[0]); if(p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  if(!file.startsWith(ROOT) || file.includes(path.sep + 'node_modules' + path.sep)){ res.writeHead(403); return res.end(); }
  fs.readFile(file, function(err, buf){
    if(err){ res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(port, '127.0.0.1', function(){ console.log('e2e server http://127.0.0.1:' + port); });
