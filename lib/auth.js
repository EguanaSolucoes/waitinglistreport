const crypto = require('crypto');

const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS || 'Tagme2026';
const AUTH_SECRET = process.env.AUTH_SECRET || 'impettus-bi-session-secret';
const COOKIE_NAME = 'bi_auth';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function checkCredentials(user, password) {
  return user === AUTH_USER && password === AUTH_PASS;
}

function createSessionToken() {
  const exp = String(Date.now() + SESSION_MS);
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(exp).digest('hex');
  return `${exp}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot === -1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(exp).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function getAuthCookie(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    if (key === COOKIE_NAME) return decodeURIComponent(val);
  }
  return null;
}

function isAuthenticated(req) {
  return verifySessionToken(getAuthCookie(req));
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MS,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  res.status(401).json({ error: 'Não autenticado. Faça login novamente.' });
}

function requireAuthPage(req, res, next) {
  if (isAuthenticated(req)) return next();
  res.redirect('/login');
}

module.exports = {
  AUTH_USER,
  checkCredentials,
  createSessionToken,
  isAuthenticated,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  requireAuthPage,
};
