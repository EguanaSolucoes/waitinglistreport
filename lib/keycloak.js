const { Issuer, generators } = require('openid-client');
const { resolveUserSession } = require('./usersService');

const KEYCLOAK_ENABLED = String(process.env.KEYCLOAK_ENABLED || 'true').toLowerCase() !== 'false';
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER
  || 'https://sso.ditti.com.br/realms/ditti-painel-realm';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'tagme-report';
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || '';
const KEYCLOAK_USE_PKCE = String(process.env.KEYCLOAK_USE_PKCE || 'false').toLowerCase() === 'true';
const APP_BASE_URL = process.env.APP_BASE_URL
  || `http://localhost:${process.env.PORT || 3847}`;

let clientPromise;

function getRedirectUri() {
  if (process.env.KEYCLOAK_REDIRECT_URI) return process.env.KEYCLOAK_REDIRECT_URI;
  return `${APP_BASE_URL.replace(/\/$/, '')}/auth/keycloak`;
}

async function getClient() {
  if (!KEYCLOAK_ENABLED) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      const issuer = await Issuer.discover(KEYCLOAK_ISSUER);
      const opts = {
        client_id: KEYCLOAK_CLIENT_ID,
        redirect_uris: [getRedirectUri()],
        response_types: ['code'],
      };
      if (KEYCLOAK_CLIENT_SECRET) opts.client_secret = KEYCLOAK_CLIENT_SECRET;
      return new issuer.Client(opts);
    })();
  }
  return clientPromise;
}

function isKeycloakEnabled() {
  return KEYCLOAK_ENABLED;
}

async function createLoginRequest() {
  const client = await getClient();
  if (!client) throw new Error('SSO Keycloak não configurado.');

  const state = generators.state();
  const authParams = {
    scope: 'openid profile email',
    state,
    response_type: 'code',
    approval_prompt: 'auto',
  };

  const oidcState = { state };

  if (KEYCLOAK_USE_PKCE) {
    const codeVerifier = generators.codeVerifier();
    authParams.code_challenge = generators.codeChallenge(codeVerifier);
    authParams.code_challenge_method = 'S256';
    oidcState.codeVerifier = codeVerifier;
  }

  const url = client.authorizationUrl(authParams);

  return { url, oidcState };
}

async function handleCallback(req, oidcState) {
  const client = await getClient();
  if (!client) throw new Error('SSO Keycloak não configurado.');

  const params = client.callbackParams(req);
  const callbackChecks = { state: oidcState.state };
  if (KEYCLOAK_USE_PKCE) {
    if (!oidcState.codeVerifier) {
      throw new Error('Sessão SSO sem code verifier.');
    }
    callbackChecks.code_verifier = oidcState.codeVerifier;
  }

  const tokenSet = await client.callback(getRedirectUri(), params, callbackChecks);

  const claims = tokenSet.claims();
  const email = claims.email || claims.preferred_username;
  if (!email) {
    const err = new Error('Conta SSO sem e-mail. Contate o suporte Tagme.');
    err.status = 403;
    throw err;
  }

  const profile = await resolveUserSession(email);
  if (!profile) {
    const err = new Error(`Usuário ${email} não encontrado no Tagme Manager.`);
    err.status = 403;
    throw err;
  }

  return {
    sub: claims.sub,
    idToken: tokenSet.id_token,
    ...profile,
  };
}

async function getLogoutUrl(idToken) {
  const client = await getClient();
  if (!client || !idToken) return `${APP_BASE_URL.replace(/\/$/, '')}/login`;
  try {
    return client.endSessionUrl({
      id_token_hint: idToken,
      post_logout_redirect_uri: `${APP_BASE_URL.replace(/\/$/, '')}/login`,
    });
  } catch {
    return `${APP_BASE_URL.replace(/\/$/, '')}/login`;
  }
}

module.exports = {
  isKeycloakEnabled,
  getRedirectUri,
  createLoginRequest,
  handleCallback,
  getLogoutUrl,
  KEYCLOAK_USE_PKCE,
  APP_BASE_URL,
};
