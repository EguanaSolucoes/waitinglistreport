const crypto = require('crypto');

const AUTH_SECRET = process.env.AUTH_SECRET || 'impettus-bi-session-secret';
const COOKIE_NAME = 'bi_auth';
const OIDC_COOKIE_NAME = 'bi_oidc';
const SESSION_MS = Number(process.env.SESSION_MS) || 7 * 24 * 60 * 60 * 1000;
const OIDC_MS = 10 * 60 * 1000;

function sign(data) {
  return crypto.createHmac('sha256', AUTH_SECRET).update(data).digest('hex');
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodePayload(encoded) {
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function verifyLegacyToken(token) {
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || !sig) return null;
  if (Number(exp) < Date.now()) return null;
  const expected = sign(exp);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
  } catch {
    return null;
  }
  const legacyUser = process.env.AUTH_USER || 'admin';
  return {
    sub: 'legacy',
    userId: null,
    email: legacyUser,
    name: legacyUser,
    role: 'legacy',
    venueIds: [],
    bypassAcl: true,
    idToken: null,
    exp: Number(exp),
  };
}

function createSignedToken(payload, maxAgeMs = SESSION_MS) {
  const body = { ...payload, exp: Date.now() + maxAgeMs };
  const encoded = encodePayload(body);
  const sig = sign(encoded);
  return `${encoded}.${sig}`;
}

function verifySignedToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!encoded || !sig) return null;

  // Cookie do login legado anterior (apenas timestamp + HMAC)
  if (/^\d+$/.test(encoded)) {
    return verifyLegacyToken(token);
  }

  const expected = sign(encoded);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
  } catch {
    return null;
  }

  const payload = decodePayload(encoded);
  if (!payload?.exp || Number(payload.exp) < Date.now()) return null;
  return payload;
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    if (key === name) return decodeURIComponent(val);
  }
  return null;
}

function setCookie(res, name, value, maxAgeMs) {
  res.cookie(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: maxAgeMs,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}

function clearCookie(res, name) {
  res.clearCookie(name, { path: '/' });
}

function getSession(req, res = null) {
  const raw = readCookie(req, COOKIE_NAME);
  if (!raw) return null;
  const session = verifySignedToken(raw);
  if (!session && res) {
    clearSession(res);
    clearOidcState(res);
  }
  return session;
}

function setSession(res, session) {
  setCookie(res, COOKIE_NAME, createSignedToken(session), SESSION_MS);
}

function clearSession(res) {
  clearCookie(res, COOKIE_NAME);
}

function setOidcState(res, state) {
  setCookie(res, OIDC_COOKIE_NAME, createSignedToken(state, OIDC_MS), OIDC_MS);
}

function getOidcState(req) {
  return verifySignedToken(readCookie(req, OIDC_COOKIE_NAME));
}

function clearOidcState(res) {
  clearCookie(res, OIDC_COOKIE_NAME);
}

module.exports = {
  COOKIE_NAME,
  SESSION_MS,
  getSession,
  setSession,
  clearSession,
  setOidcState,
  getOidcState,
  clearOidcState,
};
