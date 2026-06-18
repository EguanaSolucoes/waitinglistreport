require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { getDashboard } = require('./lib/dashboardService');
const { getContextAnalysis } = require('./lib/contextService');
const { searchVenues, getVenuesByIds } = require('./lib/venuesService');
const { listUsersWithVenues } = require('./lib/adminService');
const { getAllowedVenueIds, resolveUserSessionById } = require('./lib/usersService');
const {
  LEGACY_AUTH_ENABLED,
  checkLegacyCredentials,
  createLegacySession,
  attachSession,
  isAuthenticated,
  requireAuth,
  requireAuthPage,
  requireAdmin,
  requireAdminPage,
  assertVenueAccess,
  getAllowedVenueIds,
  sessionToMe,
  buildImpersonatedSession,
  restoreAdminSession,
  setSession,
  clearSession,
  setOidcState,
  getOidcState,
  clearOidcState,
} = require('./lib/auth');
const {
  isKeycloakEnabled,
  createLoginRequest,
  handleCallback,
  getLogoutUrl,
} = require('./lib/keycloak');

const app = express();
const PORT = process.env.PORT || 3847;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DASHBOARD_HTML = path.join(__dirname, 'dashboard.html');
const LOGIN_HTML = path.join(PUBLIC_DIR, 'login.html');
const ADMIN_HTML = path.join(PUBLIC_DIR, 'admin.html');

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(attachSession);
app.use(express.static(PUBLIC_DIR, { index: false }));

function parseVenueIds(query) {
  const raw = query.venues ?? query.venue ?? '';
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}

function sendDashboard(_req, res) {
  res.sendFile(DASHBOARD_HTML);
}

app.get('/login', (req, res) => {
  if (isAuthenticated(req)) return res.redirect('/');
  res.sendFile(LOGIN_HTML);
});

app.get('/auth/keycloak/login', async (req, res) => {
  try {
    if (!isKeycloakEnabled()) {
      return res.redirect('/login?error=SSO+indisponível');
    }
    const { url, oidcState } = await createLoginRequest();
    setOidcState(res, oidcState);
    res.redirect(url);
  } catch (err) {
    console.error('Erro /auth/keycloak/login:', err);
    res.redirect(`/login?error=${encodeURIComponent(err.message || 'Falha ao iniciar SSO')}`);
  }
});

app.get('/auth/keycloak/callback', async (req, res) => {
  try {
    const oidcState = getOidcState(req);
    clearOidcState(res);
    if (!oidcState?.state || !oidcState?.codeVerifier) {
      return res.redirect('/login?error=Sessão+SSO+expirada.+Tente+novamente.');
    }

    const profile = await handleCallback(req, oidcState);
    setSession(res, {
      sub: profile.sub,
      userId: profile.userId,
      email: profile.email,
      name: profile.name,
      role: profile.role,
      venueIds: profile.venueIds,
      bypassAcl: false,
      idToken: profile.idToken,
    });
    res.redirect('/?sso=1');
  } catch (err) {
    console.error('Erro /auth/keycloak/callback:', err);
    const msg = err.message || 'Falha na autenticação SSO';
    res.redirect(`/login?error=${encodeURIComponent(msg)}`);
  }
});

app.post('/api/login', (req, res) => {
  if (!LEGACY_AUTH_ENABLED) {
    return res.status(403).json({ error: 'Use o login SSO Tagme.' });
  }
  const { user, password } = req.body || {};
  if (!checkLegacyCredentials(String(user || '').trim(), String(password || ''))) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }
  setSession(res, createLegacySession());
  res.json(sessionToMe(createLegacySession()));
});

app.post('/api/logout', async (req, res) => {
  const session = req.session;
  const idToken = session?.idToken;
  clearSession(res);
  if (idToken && isKeycloakEnabled()) {
    try {
      const logoutUrl = await getLogoutUrl(idToken);
      return res.json({ ok: true, logoutUrl });
    } catch (err) {
      console.error('Erro logout SSO:', err);
    }
  }
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const me = sessionToMe(req.session);
    if (!me.bypassAcl || me.impersonating) {
      const venueIds = req.session.venueIds || [];
      me.venueIds = venueIds;
      me.venues = venueIds.length ? await getVenuesByIds(venueIds) : [];
    } else {
      me.venueIds = [];
      me.venues = [];
    }

    if (req.session.venueBootstrap) {
      const session = { ...req.session, venueBootstrap: false };
      setSession(res, session);
      req.session = session;
    }

    res.json(me);
  } catch (err) {
    console.error('Erro /api/me:', err);
    res.status(500).json({ error: 'Falha ao carregar perfil.' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    sso: isKeycloakEnabled(),
    legacyAuth: LEGACY_AUTH_ENABLED,
  });
});

app.get('/api/auth/config', (_req, res) => {
  res.json({
    sso: isKeycloakEnabled(),
    legacyAuth: LEGACY_AUTH_ENABLED,
    loginUrl: '/auth/keycloak/login',
  });
});

app.get('/', requireAuthPage, sendDashboard);
app.get('/dashboard', requireAuthPage, sendDashboard);
app.get('/dashboard_restaurante_bi.html', (_req, res) => res.redirect(301, '/'));

app.get('/api/venues/search', requireAuth, async (req, res) => {
  try {
    const { q = '', limit = 40 } = req.query;
    const allowed = getAllowedVenueIds(req);
    const venues = await searchVenues(q, limit, allowed);
    res.json({ venues });
  } catch (err) {
    console.error('Erro /api/venues/search:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    const venueIds = assertVenueAccess(req, parseVenueIds(req.query));
    const data = await getDashboard(inicio, fim, venueIds);
    res.json(data);
  } catch (err) {
    console.error('Erro /api/dashboard:', err);
    res.status(err.status || 400).json({ error: err.message });
  }
});

app.get('/api/context', requireAuth, async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    const venueIds = assertVenueAccess(req, parseVenueIds(req.query));
    const data = await getContextAnalysis(inicio, fim, venueIds);
    res.json(data);
  } catch (err) {
    console.error('Erro /api/context:', err);
    res.status(err.status || 400).json({ error: err.message });
  }
});

app.get('/admin', requireAdminPage, (_req, res) => {
  res.sendFile(ADMIN_HTML);
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { q = '', venueQ = '', page = 1, limit = 50 } = req.query;
    const data = await listUsersWithVenues({ q, venueQ, page, limit });
    res.json(data);
  } catch (err) {
    console.error('Erro /api/admin/users:', err);
    res.status(500).json({ error: err.message || 'Falha ao listar usuários.' });
  }
});

app.post('/api/admin/impersonate/:userId', requireAdmin, async (req, res) => {
  try {
    const profile = await resolveUserSessionById(req.params.userId);
    if (!profile) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    // Sempre todas as lojas do usuário, independente do filtro da listagem admin
    profile.venueIds = await getAllowedVenueIds(profile.userId);
    const newSession = buildImpersonatedSession(req.session, profile);
    setSession(res, newSession);
    res.json({
      ok: true,
      redirect: '/?viewAs=1',
      user: { email: profile.email, name: profile.name, venueCount: profile.venueIds.length },
    });
  } catch (err) {
    console.error('Erro /api/admin/impersonate:', err);
    res.status(500).json({ error: err.message || 'Falha ao impersonar usuário.' });
  }
});

app.post('/api/admin/stop-impersonate', requireAuth, (req, res) => {
  const restored = restoreAdminSession(req.session);
  if (!restored) {
    return res.status(400).json({ error: 'Não há sessão de impersonação ativa.' });
  }
  setSession(res, restored);
  res.json({ ok: true, redirect: '/admin' });
});

app.listen(PORT, () => {
  console.log(`Tagme Report → http://localhost:${PORT}/`);
  console.log(`Login → http://localhost:${PORT}/login`);
  console.log(`Admin → http://localhost:${PORT}/admin`);
  console.log(`SSO Keycloak → ${isKeycloakEnabled() ? 'ativado' : 'desativado'}`);
});
