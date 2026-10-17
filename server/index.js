'use strict';
// A Little Coffee - HTTP API Server (zero third-party dependencies, built on Node.js 22)
const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const common = require('./common');

common.dropPrivileges();
const db = common.openDb();

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PKG_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version || '1.0.0';
const COOKIE = 'cupping_sess';
const SESSION_MS = 30 * 86400 * 1000;
const BACKUP_KEEP = Number(process.env.BACKUP_KEEP || 14);
const LANGS = ['ja', 'zh', 'en'];

/* ========= SQL ========= */
const q = {
  userByToken: db.prepare(`SELECT u.* FROM users u JOIN auth_sessions s ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`),
  userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  hasAdmin: db.prepare('SELECT 1 AS x FROM users WHERE is_admin = 1 LIMIT 1'),
  createUser: db.prepare(`INSERT INTO users(username, display_name, pw_hash, is_admin, lang, created_at)
    VALUES(?, ?, ?, ?, ?, ?) RETURNING id`),
  setLang: db.prepare('UPDATE users SET lang = ? WHERE id = ?'),
  setDisplay: db.prepare('UPDATE users SET display_name = ? WHERE id = ?'),
  setPw: db.prepare('UPDATE users SET pw_hash = ? WHERE id = ?'),
  setDisabled: db.prepare('UPDATE users SET disabled = ? WHERE id = ? AND is_admin = 0'),

  createSession: db.prepare('INSERT INTO auth_sessions(token_hash, user_id, expires_at) VALUES(?, ?, ?)'),
  delSession: db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?'),
  delUserSessions: db.prepare('DELETE FROM auth_sessions WHERE user_id = ?'),
  delOtherSessions: db.prepare('DELETE FROM auth_sessions WHERE user_id = ? AND token_hash <> ?'),
  purgeSessions: db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?'),

  getInvite: db.prepare('SELECT * FROM invites WHERE code = ?'),
  useInvite: db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL AND revoked = 0'),
  createInvite: db.prepare('INSERT INTO invites(code, created_by, created_at) VALUES(?, ?, ?)'),
  revokeInvite: db.prepare('UPDATE invites SET revoked = 1 WHERE code = ? AND used_by IS NULL'),
  listInvites: db.prepare(`SELECT i.code, i.created_at, i.used_at, i.revoked, u.display_name AS used_by_name
    FROM invites i LEFT JOIN users u ON u.id = i.used_by ORDER BY i.created_at DESC LIMIT 100`),
  listUsers: db.prepare(`SELECT u.id, u.username, u.display_name, u.is_admin, u.disabled, u.created_at,
    (SELECT COUNT(*) FROM cuppings c WHERE c.user_id = u.id) AS cupping_count
    FROM users u ORDER BY u.created_at ASC`),

  getDraft: db.prepare('SELECT data FROM drafts WHERE user_id = ?'),
  saveDraft: db.prepare(`INSERT INTO drafts(user_id, data, updated_at) VALUES(?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`),
  delDraft: db.prepare('DELETE FROM drafts WHERE user_id = ?'),

  myCuppings: db.prepare(`SELECT id, date, data, shared FROM cuppings WHERE user_id = ?
    ORDER BY date DESC, created_at DESC`),
  cuppingById: db.prepare(`SELECT c.*, u.display_name AS author, u.disabled AS author_disabled
    FROM cuppings c JOIN users u ON u.id = c.user_id WHERE c.id = ?`),
  cuppingExists: db.prepare('SELECT user_id FROM cuppings WHERE id = ?'),
  insertCupping: db.prepare(`INSERT INTO cuppings(id, user_id, date, data, shared, shared_at, created_at, updated_at)
    VALUES(?, ?, ?, ?, 0, NULL, ?, ?)`),
  delCupping: db.prepare('DELETE FROM cuppings WHERE id = ? AND user_id = ?'),
  shareCupping: db.prepare('UPDATE cuppings SET shared = ?, shared_at = ? WHERE id = ? AND user_id = ?'),
  listShared: db.prepare(`SELECT c.id, c.date, c.data, c.shared_at, c.user_id, u.display_name AS author,
    (SELECT COUNT(*) FROM comments m WHERE m.cupping_id = c.id) AS comment_count
    FROM cuppings c JOIN users u ON u.id = c.user_id
    WHERE c.shared = 1 AND u.disabled = 0 ORDER BY c.shared_at DESC LIMIT 200`),

  comments: db.prepare(`SELECT m.id, m.body, m.created_at, m.user_id, u.display_name AS author
    FROM comments m JOIN users u ON u.id = m.user_id WHERE m.cupping_id = ? ORDER BY m.created_at ASC`),
  addComment: db.prepare('INSERT INTO comments(cupping_id, user_id, body, created_at) VALUES(?, ?, ?, ?)'),
  commentById: db.prepare(`SELECT m.*, c.user_id AS owner_id FROM comments m
    JOIN cuppings c ON c.id = m.cupping_id WHERE m.id = ?`),
  delComment: db.prepare('DELETE FROM comments WHERE id = ?'),
};

const defUser = (process.env.ADMIN_USER || 'admin').trim();
const defPass = process.env.ADMIN_PASS || 'ineedacupofcoffee';
if (!q.userByName.get(defUser)) {
  q.createUser.get(defUser, defUser, common.hashPw(defPass), 1, 'ja', Date.now());
  console.log('Initialized default admin account:', defUser);
}

/* ========= Utilities ========= */
class HttpError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
const fail = (status, code) => { throw new HttpError(status, code); };
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const newId = () => crypto.randomBytes(9).toString('base64url');
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const USERNAME_RE = /^[A-Za-z0-9_.-]{2,32}$/;

function send(res, status, obj, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(obj));
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const i = c.indexOf('=');
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
function clientIp(req) {
  return req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
}
function isHttps(req) { return req.headers['x-forwarded-proto'] === 'https'; }
function sessionCookie(req, token, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
}
function publicUser(u) {
  return { id: u.id, username: u.username, display_name: u.display_name, is_admin: !!u.is_admin, lang: u.lang };
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > 5 * 1024 * 1024) { reject(new HttpError(413, 'too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new HttpError(400, 'bad_json')); }
    });
    req.on('error', reject);
  });
}
function login(req, user) {
  const token = crypto.randomBytes(32).toString('hex');
  q.createSession.run(sha256(token), user.id, Date.now() + SESSION_MS);
  return { 'Set-Cookie': sessionCookie(req, token, SESSION_MS / 1000) };
}
function validateNewUser(body) {
  const username = str(body.username, 64);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!USERNAME_RE.test(username)) fail(400, 'invalid_username');
  if (password.length < 6) fail(400, 'password_too_short');
  if (q.userByName.get(username)) fail(400, 'username_taken');
  const display = str(body.display_name, 32) || username;
  const lang = LANGS.includes(body.lang) ? body.lang : 'ja';
  return { username, password, display, lang };
}

/* Rate limiting: max 10 failed login attempts per IP within 15 minutes */
const loginFails = new Map();
function checkRate(ip) {
  const r = loginFails.get(ip);
  if (r && r.until > Date.now() && r.count >= 10) fail(429, 'too_many_attempts');
}
function noteFail(ip) {
  const r = loginFails.get(ip);
  if (!r || r.until < Date.now()) loginFails.set(ip, { count: 1, until: Date.now() + 15 * 60 * 1000 });
  else r.count++;
}

/* Return lightweight summary for shared list items */
function summarize(data) {
  return {
    type: data.type === 'daily' ? 'daily' : 'cupping',
    blind: !!data.blind,
    method: data.method || '',
    grind: data.grind || '',
    temp: data.temp || '',
    cups: (Array.isArray(data.cups) ? data.cups : []).map(c => ({
      name: c.name || '', origin: c.origin || '', process: c.process || '', roast: c.roast || '',
      tags: Array.isArray(c.tags) ? c.tags.slice(0, 6) : [],
      bodyLevel: c.bodyLevel || '',
      diag: Array.isArray(c.diag) ? c.diag : [],
      star: c.final && c.final.star ? c.final.star : null,
      note: c.final && c.final.note ? String(c.final.note).slice(0, 120) : '',
    })),
  };
}
function canSee(c, user) { return c && ((user && c.user_id === user.id) || (c.shared && !c.author_disabled)); }

/* ========= Routes ========= */
const routes = [];
function route(method, pattern, opts, handler) {
  if (typeof opts === 'function') { handler = opts; opts = {}; }
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, opts, handler });
}

route('GET', '/api/health', () => ({ ok: true, version: PKG_VERSION }));
route('GET', '/api/status', () => ({ needsFirstRun: !q.hasAdmin.get(), version: PKG_VERSION }));

// First-run admin setup (restricted to LAN; requests via Cloudflare include cf-connecting-ip)
route('POST', '/api/init', ({ req, body }) => {
  if (q.hasAdmin.get()) fail(403, 'already_initialized');
  if (req.headers['cf-connecting-ip']) fail(403, 'setup_lan_only');
  const u = validateNewUser(body);
  const r = q.createUser.get(u.username, u.display, common.hashPw(u.password), 1, u.lang, Date.now());
  const user = q.userById.get(r.id);
  return { status: 200, body: { ok: true, user: publicUser(user) }, headers: login(req, user) };
});

route('POST', '/api/login', ({ req, body }) => {
  const ip = clientIp(req);
  checkRate(ip);
  const u = q.userByName.get(str(body.username, 64));
  if (!u || !common.checkPw(String(body.password || ''), u.pw_hash)) { noteFail(ip); fail(401, 'invalid_credentials'); }
  if (u.disabled) fail(403, 'account_disabled');
  loginFails.delete(ip);
  return { status: 200, body: { ok: true, user: publicUser(u) }, headers: login(req, u) };
});

route('POST', '/api/register', ({ req, body }) => {
  const code = str(body.invite, 32).toUpperCase();
  const inv = q.getInvite.get(code);
  if (!inv || inv.used_by || inv.revoked) fail(400, 'invalid_invite');
  const u = validateNewUser(body);
  let user;
  db.exec('BEGIN');
  try {
    const r = q.createUser.get(u.username, u.display, common.hashPw(u.password), 0, u.lang, Date.now());
    if (q.useInvite.run(r.id, Date.now(), code).changes !== 1) fail(400, 'invalid_invite');
    db.exec('COMMIT');
    user = q.userById.get(r.id);
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { status: 200, body: { ok: true, user: publicUser(user) }, headers: login(req, user) };
});

route('POST', '/api/logout', ({ req }) => {
  const t = parseCookies(req)[COOKIE];
  if (t) q.delSession.run(sha256(t));
  return { status: 200, body: { ok: true }, headers: { 'Set-Cookie': sessionCookie(req, '', 0) } };
});

route('GET', '/api/me', { auth: true }, ({ user }) => ({ user: publicUser(user) }));
route('POST', '/api/lang', { auth: true }, ({ user, body }) => {
  if (LANGS.includes(body.lang)) q.setLang.run(body.lang, user.id);
  return { ok: true };
});
route('POST', '/api/profile', { auth: true }, ({ user, body }) => {
  const d = str(body.display_name, 32);
  if (!d) fail(400, 'bad_request');
  q.setDisplay.run(d, user.id);
  return { ok: true };
});
route('POST', '/api/password', { auth: true }, ({ req, user, body }) => {
  if (!common.checkPw(String(body.old || ''), user.pw_hash)) fail(400, 'wrong_password');
  if (typeof body.new !== 'string' || body.new.length < 6) fail(400, 'password_too_short');
  q.setPw.run(common.hashPw(body.new), user.id);
  q.delOtherSessions.run(user.id, sha256(parseCookies(req)[COOKIE] || ''));
  return { ok: true };
});

// Active cupping draft (persisted across devices)
route('GET', '/api/draft', { auth: true }, ({ user }) => {
  const d = q.getDraft.get(user.id);
  return { draft: d ? JSON.parse(d.data) : null };
});
route('POST', '/api/draft', { auth: true }, ({ user, body }) => {
  if (!body || typeof body !== 'object' || !Array.isArray(body.cups)) fail(400, 'bad_request');
  q.saveDraft.run(user.id, JSON.stringify(body), Date.now());
  return { ok: true };
});
route('DELETE', '/api/draft', { auth: true }, ({ user }) => { q.delDraft.run(user.id); return { ok: true }; });

// Personal tasting & cupping records
function cleanCupping(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.cups) || !body.cups.length || body.cups.length > 6) fail(400, 'bad_request');
  const data = { ...body };
  delete data.id; delete data.shared; delete data.author; delete data.mine;
  data.date = isDate(body.date) ? body.date : new Date().toISOString().slice(0, 10);
  return data;
}
route('GET', '/api/cuppings', { auth: true }, ({ user }) => ({
  cuppings: q.myCuppings.all(user.id).map(r => ({ ...JSON.parse(r.data), id: r.id, date: r.date, shared: !!r.shared })),
}));
route('POST', '/api/cuppings', { auth: true }, ({ user, body }) => {
  const wantShare = !!body.shared;
  const data = cleanCupping(body);
  const id = newId(), now = Date.now();
  q.insertCupping.run(id, user.id, data.date, JSON.stringify(data), now, now);
  if (wantShare) q.shareCupping.run(1, now, id, user.id);
  return { ok: true, id, shared: wantShare };
});
route('DELETE', '/api/cuppings/:id', { auth: true }, ({ user, params }) => {
  if (q.delCupping.run(params.id, user.id).changes !== 1) fail(404, 'not_found');
  return { ok: true };
});
route('POST', '/api/cuppings/:id/share', { auth: true }, ({ user, params, body }) => {
  const on = !!body.shared;
  if (q.shareCupping.run(on ? 1 : 0, on ? Date.now() : null, params.id, user.id).changes !== 1) fail(404, 'not_found');
  return { ok: true, shared: on };
});
// Import records (compatible with standalone JSON exports)
route('POST', '/api/import', { auth: true }, ({ user, body }) => {
  const list = Array.isArray(body) ? body : (body && Array.isArray(body.sessions) ? body.sessions : null);
  if (!list) fail(400, 'bad_request');
  let imported = 0, skipped = 0;
  db.exec('BEGIN');
  try {
    for (const item of list) {
      let data;
      try { data = cleanCupping(item); } catch (e) { skipped++; continue; }
      let id = typeof item.id === 'string' && /^[\w-]{4,40}$/.test(item.id) ? item.id : newId();
      const ex = q.cuppingExists.get(id);
      if (ex && ex.user_id === user.id) { skipped++; continue; } // Already imported
      if (ex) id = newId();
      const ts = Number(item.finishedAt) || Date.now();
      q.insertCupping.run(id, user.id, data.date, JSON.stringify(data), ts, Date.now());
      imported++;
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { ok: true, imported, skipped };
});

// Community tasting feed (read-only for guests with masked usernames; set REQUIRE_LOGIN_FOR_HOME=1 to require login)
const REQUIRE_LOGIN_HOME = process.env.REQUIRE_LOGIN_FOR_HOME === '1';
function maskName(name, isLoggedIn) {
  const s = String(name || '').trim();
  if (isLoggedIn) return s;
  const ch = Array.from(s);
  if (!ch.length) return '***';
  if (ch.length === 1) return ch[0] + '**';
  if (ch.length === 2) return ch[0] + '*';
  if (ch.length === 3) return ch[0] + '*' + ch[2];
  return ch[0] + '*'.repeat(Math.min(4, ch.length - 2)) + ch[ch.length - 1];
}
route('GET', '/api/shared', ({ user }) => {
  if (REQUIRE_LOGIN_HOME && !user) fail(401, 'unauthorized');
  return {
    items: q.listShared.all().map(r => ({
      id: r.id, date: r.date, author: maskName(r.author, !!user), shared_at: r.shared_at, mine: !!(user && r.user_id === user.id),
      comment_count: r.comment_count, ...summarize(JSON.parse(r.data)),
    })),
  };
});
route('GET', '/api/shared/:id', ({ user, params }) => {
  if (REQUIRE_LOGIN_HOME && !user) fail(401, 'unauthorized');
  const c = q.cuppingById.get(params.id);
  if (!canSee(c, user)) fail(404, 'not_found');
  return {
    cupping: { ...JSON.parse(c.data), id: c.id, date: c.date, author: maskName(c.author, !!user), shared: !!c.shared, mine: !!(user && c.user_id === user.id) },
    comments: q.comments.all(c.id).map(m => ({
      id: m.id, body: m.body, created_at: m.created_at, author: maskName(m.author, !!user),
      can_delete: !!(user && (m.user_id === user.id || c.user_id === user.id || !!user.is_admin)),
    })),
  };
});
route('POST', '/api/shared/:id/comments', { auth: true }, ({ user, params, body }) => {
  const c = q.cuppingById.get(params.id);
  if (!canSee(c, user) || !c.shared) fail(404, 'not_found');
  const text = str(body.body, 1000);
  if (!text) fail(400, 'empty_comment');
  q.addComment.run(c.id, user.id, text, Date.now());
  return { ok: true };
});
route('DELETE', '/api/comments/:id', { auth: true }, ({ user, params }) => {
  const m = q.commentById.get(Number(params.id));
  if (!m) fail(404, 'not_found');
  if (m.user_id !== user.id && m.owner_id !== user.id && !user.is_admin) fail(403, 'forbidden');
  q.delComment.run(m.id);
  return { ok: true };
});

// Admin endpoints
route('GET', '/api/admin/overview', { admin: true }, () => ({ users: q.listUsers.all(), invites: q.listInvites.all() }));
route('POST', '/api/admin/invites', { admin: true }, ({ user }) => {
  const code = common.randomCode(8);
  q.createInvite.run(code, user.id, Date.now());
  return { ok: true, code };
});
route('POST', '/api/admin/invites/:code/revoke', { admin: true }, ({ params }) => { q.revokeInvite.run(params.code); return { ok: true }; });
route('POST', '/api/admin/users/:id/disable', { admin: true }, ({ params, body }) => {
  const id = Number(params.id);
  if (q.setDisabled.run(body.disabled ? 1 : 0, id).changes !== 1) fail(400, 'bad_request');
  if (body.disabled) q.delUserSessions.run(id);
  return { ok: true };
});
route('POST', '/api/admin/users/:id/reset_pw', { admin: true }, ({ params, body }) => {
  const u = q.userById.get(Number(params.id));
  if (!u || u.is_admin) fail(400, 'bad_request');
  if (typeof body.password !== 'string' || body.password.length < 6) fail(400, 'password_too_short');
  q.setPw.run(common.hashPw(body.password), u.id);
  q.delUserSessions.run(u.id);
  return { ok: true };
});
route('GET', '/api/admin/backup', { admin: true }, ({ res }) => {
  // Use VACUUM INTO for a consistent SQLite snapshot under WAL mode
  const tmp = path.join(common.BACKUP_DIR, `.download-${newId()}.db`);
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  const name = `cupping-${new Date().toISOString().slice(0, 10)}.db`;
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${name}"` });
  const s = fs.createReadStream(tmp);
  s.pipe(res);
  s.on('close', () => fs.unlink(tmp, () => {}));
  return null; // Response already streamed
});

/* ========= Static File Server ========= */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};
function serveStatic(req, res, urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch (e) { res.writeHead(400); return res.end(); }
  if (rel === '/' || rel === '' || rel === '/admin' || rel === '/admin/') rel = '/index.html';
  const p = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!p.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(p, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(p).pipe(res);
  });
}

/* ========= HTTP Server ========= */
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  const urlPath = (req.url || '/').split('?')[0];

  if (!urlPath.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, urlPath);
  }

  try {
    let found = null, params = {};
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(urlPath);
      if (m) { found = r; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); break; }
    }
    if (!found) fail(404, 'not_found');

    let body = {};
    if (req.method !== 'GET') {
      // Basic CSRF protection: reject cross-origin state-changing requests
      const origin = req.headers.origin;
      if (origin) { try { if (new URL(origin).host !== req.headers.host) fail(403, 'forbidden'); } catch (e) { fail(403, 'forbidden'); } }
      body = await readBody(req);
      if (body === null || typeof body !== 'object') body = {};
    }

    const tok = parseCookies(req)[COOKIE];
    const user = tok ? q.userByToken.get(sha256(tok), Date.now()) : null;
    if (found.opts.auth || found.opts.admin) {
      if (!user) fail(401, 'unauthorized');
      if (found.opts.admin && !user.is_admin) fail(403, 'forbidden');
    }

    const out = await found.handler({ req, res, body, params, user });
    if (out === null) return;
    if (out && out.status && out.body) return send(res, out.status, out.body, out.headers);
    send(res, 200, out || { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.code });
    console.error(new Date().toISOString(), req.method, urlPath, e);
    if (!res.headersSent) send(res, 500, { error: 'server_error' });
    else res.end();
  }
});

/* ========= Scheduled Tasks: Daily Backup & Session Cleanup ========= */
function autoBackup() {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(common.BACKUP_DIR, `cupping-${day}.db`);
    if (!fs.existsSync(file)) {
      db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
      console.log('Backup written:', file);
    }
    const files = fs.readdirSync(common.BACKUP_DIR).filter(n => /^cupping-\d{4}-\d{2}-\d{2}\.db$/.test(n)).sort();
    while (files.length > BACKUP_KEEP) fs.unlinkSync(path.join(common.BACKUP_DIR, files.shift()));
    for (const n of fs.readdirSync(common.BACKUP_DIR)) if (n.startsWith('.download-')) fs.unlink(path.join(common.BACKUP_DIR, n), () => {});
  } catch (e) { console.error('Backup failed:', e); }
}
function housekeeping() {
  q.purgeSessions.run(Date.now());
  for (const [ip, r] of loginFails) if (r.until < Date.now()) loginFails.delete(ip);
}
setTimeout(autoBackup, 15 * 1000);
setInterval(autoBackup, 6 * 3600 * 1000);
setInterval(housekeeping, 3600 * 1000);
housekeeping();

server.listen(PORT, '0.0.0.0', () => console.log(`Coffee cupping server listening on :${PORT}`));
function shutdown() { server.close(() => { try { db.close(); } catch (e) { /* ignore */ } process.exit(0); }); setTimeout(() => process.exit(0), 3000); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
