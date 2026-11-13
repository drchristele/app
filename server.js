// Dental Management System - zero-dependency Node.js server
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000, DBF = path.join(__dirname, 'data', 'db.json');
fs.mkdirSync(path.dirname(DBF), { recursive: true });
const core = require('./core.js').create(fs.existsSync(DBF) ? JSON.parse(fs.readFileSync(DBF, 'utf8')) : null, {
  hash: p => crypto.createHash('sha256').update('dms-salt' + p).digest('hex'),
  uuid: () => crypto.randomUUID(),
  save: d => { fs.writeFileSync(DBF + '.tmp', JSON.stringify(d)); fs.renameSync(DBF + '.tmp', DBF); }
});
const sessions = new Map();
const send = (res, code, data, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(data) : data); };
http.createServer((req, res) => {
  const parts = new URL(req.url, 'http://x').pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api') return send(res, 200, fs.readFileSync(path.join(__dirname, 'index.html')), 'text/html; charset=utf-8');
  let body = '';
  req.on('data', c => { body += c; if (body.length > 50e6) req.destroy(); });
  req.on('end', () => {
    try {
      const b = body ? JSON.parse(body) : {};
      if (parts[1] === 'login' && req.method === 'POST') {
        const un = core.login(b.username, b.password), tok = crypto.randomBytes(24).toString('hex');
        sessions.set(tok, { u: un, t: Date.now() }); return send(res, 200, { token: tok });
      }
      const ss = sessions.get(req.headers.authorization); let un;
      if (ss) { const idle = core.idle() * 60000; if (idle > 0 && Date.now() - ss.t > idle) sessions.delete(req.headers.authorization); else { ss.t = Date.now(); un = ss.u; } }
      send(res, 200, core.handle(un, req.method, parts, b));
    } catch (e) { e.code ? send(res, e.code, { error: e.msg }) : send(res, 400, { error: 'Bad request' }); }
  });
}).listen(PORT, () => console.log(`Dental Management System: http://localhost:${PORT}  (login: admin / admin123)`));
