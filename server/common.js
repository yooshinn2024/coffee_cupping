'use strict';
// Shared database and cryptography utilities
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

/** When started as root, assign ownership of DATA_DIR to PUID:PGID and drop privileges */
function dropPrivileges() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) return;
  const uid = Number(process.env.PUID || 1000);
  const gid = Number(process.env.PGID || 1000);
  if (uid === 0) return;
  (function chownTree(p) {
    fs.lchownSync(p, uid, gid);
    if (fs.lstatSync(p).isDirectory()) for (const f of fs.readdirSync(p)) chownTree(path.join(p, f));
  })(DATA_DIR);
  process.setgid(gid);
  process.setuid(uid);
}

function openDb() {
  const db = new DatabaseSync(path.join(DATA_DIR, 'cupping.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      pw_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      disabled INTEGER NOT NULL DEFAULT 0,
      lang TEXT NOT NULL DEFAULT 'ja',
      created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS invites(
      code TEXT PRIMARY KEY,
      created_by INTEGER,
      created_at INTEGER NOT NULL,
      used_by INTEGER,
      used_at INTEGER,
      revoked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS auth_sessions(
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS cuppings(
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      data TEXT NOT NULL,
      shared INTEGER NOT NULL DEFAULT 0,
      shared_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_cuppings_user ON cuppings(user_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_cuppings_shared ON cuppings(shared, shared_at DESC);
    CREATE TABLE IF NOT EXISTS drafts(
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS comments(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cupping_id TEXT NOT NULL REFERENCES cuppings(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_comments_cupping ON comments(cupping_id, created_at);
  `);
  return db;
}

function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}
function checkPw(pw, stored) {
  const [alg, s, h] = String(stored).split('$');
  if (alg !== 'scrypt' || !s || !h) return false;
  const hb = Buffer.from(h, 'hex');
  const c = crypto.scryptSync(pw, Buffer.from(s, 'hex'), hb.length);
  return crypto.timingSafeEqual(c, hb);
}
/** Generate a random numeric invite code (default: 6 digits) */
function randomCode(len = 6) {
  const digits = '0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += digits[crypto.randomInt(digits.length)];
  return s;
}

module.exports = { DATA_DIR, BACKUP_DIR, dropPrivileges, openDb, hashPw, checkPw, randomCode };
