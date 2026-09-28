'use strict';
/* =========================================================
   خادم الشبكة المحلية — يحتفظ بنسخة البيانات المشتركة
   ويقدّمها لكل الأجهزة على الشبكة عبر HTTP بسيط.
   ========================================================= */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// الملفات الوحيدة المسموح بتقديمها للمتصفحات
const PUBLIC_FILES = new Set(['/index.html', '/app.js', '/styles.css', '/build/icon.png']);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };

function localAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
    }
  }
  return out;
}

function startServer({ port, dataFile, appDir, appVersion }) {
  const baseDir = path.resolve(appDir);
  let state = { rev: 0, data: null };
  try {
    if (fs.existsSync(dataFile)) state = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    if (typeof state.rev !== 'number') state = { rev: 0, data: null };
  } catch (e) { state = { rev: 0, data: null }; }

  let writeTimer = null;
  const persist = () => {
    clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      try {
        const tmp = dataFile + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(state));
        fs.renameSync(tmp, dataFile);
      } catch (e) { console.error('persist failed', e); }
    }, 200);
  };

  const json = (res, code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  };

  const readBody = req => new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => { size += c.length; if (size > 50 * 1024 * 1024) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/api/info') return json(res, 200, { app: 'RestoPrime', version: appVersion, rev: state.rev, hasData: !!state.data, addresses: localAddresses(), port });
      if (url.pathname === '/api/rev') return json(res, 200, { rev: state.rev });
      if (url.pathname === '/api/state') {
        if (req.method === 'GET') return json(res, 200, state);
        if (req.method === 'PUT') {
          const body = JSON.parse(await readBody(req) || '{}');
          if (!body.data || typeof body.data !== 'object') return json(res, 400, { error: 'bad data' });
          state = { rev: state.rev + 1, data: body.data, updatedAt: Date.now() };
          persist();
          return json(res, 200, { rev: state.rev });
        }
      }
      // تقديم ملفات التطبيق نفسها حتى يمكن فتحه من متصفح أي جهاز على الشبكة
      const file = url.pathname === '/' ? '/index.html' : url.pathname;
      const full = path.resolve(baseDir, '.' + file);
      if (PUBLIC_FILES.has(file) && full.startsWith(baseDir + path.sep) && fs.existsSync(full) && fs.statSync(full).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        return fs.createReadStream(full).pipe(res);
      }
      json(res, 404, { error: 'not found' });
    } catch (e) {
      json(res, 500, { error: String(e.message || e) });
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '0.0.0.0', () => resolve({ server, port, addresses: localAddresses() }));
  });
}

module.exports = { startServer, localAddresses };
