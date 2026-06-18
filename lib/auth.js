const {
  getSession,
  setSession,
  clearSession,
  setOidcState,
  getOidcState,
  clearOidcState,
} = require('./session');

const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS || 'Tagme2026';
const LEGACY_AUTH_ENABLED = String(process.env.AUTH_LEGACY_ENABLED || 'true').toLowerCase() !== 'false';

function checkLegacyCredentials(user, password) {
  return user === AUTH_USER && password === AUTH_PASS;
}

function createLegacySession() {
  return {
    sub: 'legacy',
    userId: null,
    email: AUTH_USER,
    name: AUTH_USER,
    role: 'legacy',
    venueIds: [],
    bypassAcl: true,
    idToken: null,
  };
}

function isAdminSession(session) {
  if (!session) return false;
  if (session.bypassAcl) return true;
  return Boolean(session.impersonator?.bypassAcl);
}

function buildImpersonatedSession(adminSession, profile) {
  const impersonator = adminSession.impersonator?.bypassAcl
    ? { ...adminSession.impersonator }
    : {
      sub: adminSession.sub,
      userId: adminSession.userId,
      email: adminSession.email,
      name: adminSession.name,
      role: adminSession.role,
      venueIds: adminSession.venueIds || [],
      bypassAcl: Boolean(adminSession.bypassAcl),
      idToken: adminSession.idToken || null,
    };

  return {
    sub: profile.userId,
    userId: profile.userId,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    venueIds: profile.venueIds || [],
    bypassAcl: false,
    idToken: null,
    impersonating: true,
    impersonator,
  };
}

function restoreAdminSession(session) {
  if (!session?.impersonator) return null;
  return {
    ...session.impersonator,
    impersonating: false,
    impersonator: null,
  };
}

function requireAdmin(req, res, next) {
  const session = req.session || getSession(req);
  if (!isAdminSession(session)) {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }
  req.session = session;
  return next();
}

function requireAdminPage(req, res, next) {
  const session = req.session || getSession(req);
  if (!isAdminSession(session)) return res.redirect('/');
  req.session = session;
  return next();
}

function attachSession(req, res, next) {
  req.session = getSession(req, res);
  next();
}

function isAuthenticated(req) {
  return Boolean(req.session || getSession(req));
}

function requireAuth(req, res, next) {
  const session = req.session || getSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Não autenticado. Faça login novamente.' });
  }
  req.session = session;
  return next();
}

function requireAuthPage(req, res, next) {
  const session = req.session || getSession(req);
  if (!session) return res.redirect('/login');
  req.session = session;
  return next();
}

function assertVenueAccess(req, venueIds) {
  const session = req.session || getSession(req);
  if (!session) {
    const err = new Error('Não autenticado.');
    err.status = 401;
    throw err;
  }
  const unique = [...new Set((venueIds || []).filter(Boolean))];
  if (!unique.length) return unique;
  if (session.bypassAcl) return unique;

  const allowed = new Set(session.venueIds || []);
  const denied = unique.filter((id) => !allowed.has(id));
  if (denied.length) {
    const err = new Error('Sem permissão para uma ou mais lojas selecionadas.');
    err.status = 403;
    throw err;
  }
  return unique;
}

function getAllowedVenueIds(req) {
  const session = req.session || getSession(req);
  if (!session) return [];
  // Admin real (não impersonando) vê todas as lojas na busca
  if (session.bypassAcl && !session.impersonating) return null;
  return session.venueIds || [];
}

function sessionToMe(session) {
  if (!session) return null;
  const admin = isAdminSession(session);
  return {
    ok: true,
    user: session.name || session.email,
    email: session.email,
    userId: session.userId,
    role: session.role,
    venueCount: session.bypassAcl ? null : (session.venueIds || []).length,
    bypassAcl: Boolean(session.bypassAcl),
    auth: session.bypassAcl ? 'legacy' : 'sso',
    isAdmin: admin,
    impersonating: Boolean(session.impersonating),
    impersonator: session.impersonator
      ? { email: session.impersonator.email, name: session.impersonator.name }
      : null,
  };
}

module.exports = {
  AUTH_USER,
  LEGACY_AUTH_ENABLED,
  checkLegacyCredentials,
  createLegacySession,
  isAdminSession,
  buildImpersonatedSession,
  restoreAdminSession,
  attachSession,
  isAuthenticated,
  requireAuth,
  requireAuthPage,
  requireAdmin,
  requireAdminPage,
  assertVenueAccess,
  getAllowedVenueIds,
  sessionToMe,
  setSession,
  clearSession,
  setOidcState,
  getOidcState,
  clearOidcState,
};
