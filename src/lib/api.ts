import axios from "axios";

const TOKEN_KEY = "nic_access_token";
// When this browser received the current token (ms, local clock). See
// tokenExpiryMs for why the token's exp alone isn't trusted.
const RECEIVED_AT_KEY = "nic_access_token_received_at";

// Deploy-time override (VITE_API_BASE_URL in .env.production). Defaults to
// "/api": in dev the Vite proxy strips the prefix and forwards to :8080; in
// production the web server must do the same (e.g. nginx `location /api/`
// with a rewrite), keeping the app itself origin-agnostic.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
const REFRESH_URL = `${API_BASE}/auth/refresh`;

// Refresh this many ms before the token's exp so a request never goes out with
// a token that expires in-flight.
const EXPIRY_SKEW_MS = 10_000;

// Endpoints that must NOT carry/refresh an access token: the unauthenticated
// credential endpoint and the refresh call itself. /auth/login completes
// sign-in on its own — the OTP step it used to lead into is gone, since the
// platform is only reachable from the NIC LAN.
const UNAUTHENTICATED_PATHS = ["/auth/login", "/auth/refresh"];

// Sent with the access token (so the backend can deny-list it) but never
// refreshed or retried: signing out must not first extend the session, and the
// backend accepts it with an expired token (it works off the refresh cookie).
const NO_REFRESH_PATHS = ["/auth/logout"];

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// ── Token helpers ─────────────────────────────────────────────────────────────

function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

/** Store a freshly issued access token, stamped with when it arrived. */
export function storeAccessToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(RECEIVED_AT_KEY, String(Date.now()));
}

export function clearStoredAccessToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(RECEIVED_AT_KEY);
}

// The token's exp is stamped by the server's clock; comparing it to this
// machine's Date.now() is off by however far the two clocks disagree. With the
// client a minute or more behind, the "Session expiring" dialog would only
// appear after the server had already expired the session — so "Stay signed
// in" could never succeed. Instead the expiry is measured on the local clock:
// arrival time + the token's lifetime (exp - iat).
function tokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (typeof payload.exp !== "number") return null;
    const receivedAt = Number(sessionStorage.getItem(RECEIVED_AT_KEY));
    if (typeof payload.iat === "number" && receivedAt > 0) {
      return receivedAt + (payload.exp - payload.iat) * 1000;
    }
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

/** Local-clock expiry (ms) of the stored access token, or null if none. */
export function getAccessTokenExpiryMs(): number | null {
  const token = getToken();
  return token ? tokenExpiryMs(token) : null;
}

function isExpiredSoon(token: string): boolean {
  const exp = tokenExpiryMs(token);
  if (exp == null) return false; // can't tell — let the server decide
  return Date.now() >= exp - EXPIRY_SKEW_MS;
}

function isUnauthenticatedPath(url: string | undefined): boolean {
  return (
    typeof url === "string" &&
    UNAUTHENTICATED_PATHS.some((p) => url.startsWith(p))
  );
}

function isNoRefreshPath(url: string | undefined): boolean {
  return (
    typeof url === "string" && NO_REFRESH_PATHS.some((p) => url.startsWith(p))
  );
}

// ── Refresh (deduped via a shared in-flight promise) ──────────────────────────
// The backend's access token has a short (5 min) TTL, so we refresh
// proactively rather than waiting for the 401 an expired token gets. The
// shared promise collapses concurrent refreshes (interceptor, "Stay signed
// in") into one /auth/refresh call.

let refreshPromise: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<{ accessToken: string }>(REFRESH_URL, {}, { withCredentials: true })
      .then((res) => {
        const token = res.data.accessToken;
        storeAccessToken(token);
        api.defaults.headers.common.Authorization = `Bearer ${token}`;
        return token;
      })
      .catch((err) => {
        clearStoredAccessToken();
        clearAuthHeader();
        window.dispatchEvent(new Event("auth:logout"));
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// ── Request interceptor: proactively refresh, then attach the token ───────────

api.interceptors.request.use(async (config) => {
  if (isUnauthenticatedPath(config.url)) {
    return config;
  }

  let token = getToken();
  if (token && !isNoRefreshPath(config.url) && isExpiredSoon(token)) {
    try {
      token = await refreshAccessToken();
    } catch {
      // refreshAccessToken already dispatched auth:logout; send the (stale)
      // token so the request fails fast rather than hanging.
    }
  }
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: fallback refresh on 401 (e.g. revoked session) ──────

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    // The backend blocks every request once a user's workspace is suspended
    // (see JwtAuthenticationFilter), on this exact error code. Surface it
    // globally so the app can drop into a dedicated "workspace deactivated"
    // screen immediately, mid-session — never treat it as a retryable 401.
    if (error.response?.data?.code === "WORKSPACE_DEACTIVATED") {
      window.dispatchEvent(new Event("workspace:deactivated"));
      return Promise.reject(error);
    }

    // The login endpoint returns 401 for a bad username/password — surface
    // that, never refresh on it.
    if (isUnauthenticatedPath(original?.url) || isNoRefreshPath(original?.url)) {
      return Promise.reject(error);
    }

    // Only retry once, and only for 401 (proactive refresh handles expiry; this
    // catches a token revoked mid-session).
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    original._retry = true;
    try {
      const token = await refreshAccessToken();
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  },
);

export const TOKEN_STORAGE_KEY = TOKEN_KEY;

/**
 * Drop the stale Authorization default left over from a previous session.
 * Without this, a revoked/expired token set via refreshAccessToken() stays
 * attached to every request the axios instance makes afterwards — including
 * a fresh /auth/login — since it lives on `api.defaults`, not per-request.
 * That's what caused a "session revoked" error on the very next login attempt
 * until the page was reloaded (which reset the in-memory axios instance).
 */
export function clearAuthHeader(): void {
  delete api.defaults.headers.common.Authorization;
}

/** Force an immediate token refresh (e.g. the user chose "Stay signed in"). */
export function forceRefresh(): Promise<string> {
  return refreshAccessToken();
}
