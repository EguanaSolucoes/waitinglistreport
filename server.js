require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDashboard } = require('./lib/dashboardService');
const { getContextAnalysis } = require('./lib/contextService');
const { searchVenues } = require('./lib/venuesService');
const {
  checkCredentials,
  createSessionToken,
  isAuthenticated,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  requireAuthPage,
  AUTH_USER,
} = require('./lib/auth');

const app = express();
const PORT = process.env.PORT || 3847;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DASHBOARD_HTML = path.join(__dirname, 'dashboard.html');
const LOGIN_HTML = path.join(PUBLIC_DIR, 'login.html');

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
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

app.post('/api/login', (req, res) => {
  const { user, password } = req.body || {};
  if (!checkCredentials(String(user || '').trim(), String(password || ''))) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }
  setAuthCookie(res, createSessionToken());
  res.json({ ok: true, user: AUTH_USER });
});

app.post('/api/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: AUTH_USER });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.get('/', requireAuthPage, sendDashboard);
app.get('/dashboard', requireAuthPage, sendDashboard);
app.get('/dashboard_restaurante_bi.html', (_req, res) => res.redirect(301, '/'));

app.get('/api/venues/search', requireAuth, async (req, res) => {
  try {
    const { q = '', limit = 40 } = req.query;
    const venues = await searchVenues(q, limit);
    res.json({ venues });
  } catch (err) {
    console.error('Erro /api/venues/search:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    const venueIds = parseVenueIds(req.query);
    const data = await getDashboard(inicio, fim, venueIds);
    res.json(data);
  } catch (err) {
    console.error('Erro /api/dashboard:', err);
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/context', requireAuth, async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    const venueIds = parseVenueIds(req.query);
    const data = await getContextAnalysis(inicio, fim, venueIds);
    res.json(data);
  } catch (err) {
    console.error('Erro /api/context:', err);
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Bi Tagme → http://localhost:${PORT}/`);
  console.log(`Login → http://localhost:${PORT}/login`);
});
