import * as React from "react";
import {
  api,
  clearAuthHeader,
  clearStoredAccessToken,
  storeAccessToken,
  TOKEN_STORAGE_KEY,
} from "@/lib/api";
import { authApi, workspacesApi, type AuthMe } from "@/lib/services";
import type { UserRole } from "@/lib/permissions";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  workspaceId: string | null;
  workspaceName: string | null;
  division: string | null;
  displayName: string;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** Backend authorities the current role grants (JWT permissions claim). */
  rolePermissions: string[];
  /** Feature codes enabled for the current workspace (workspace_permission table). */
  workspacePermissions: string[];
  /** False until the current workspace's permissions have been fetched (or determined N/A). */
  permissionsReady: boolean;
  /** True once the backend has rejected a request because this user's workspace was suspended. */
  workspaceDeactivated: boolean;
  /**
   * Signs in against Active Directory (with a local-password fallback for
   * accounts AD does not hold) and establishes the session in one step. There
   * is no OTP: the platform is reachable only from the NIC LAN.
   */
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

// ── JWT helpers ───────────────────────────────────────────────────────────────

function decodeJwt(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return {};
  }
}

function userFromToken(token: string): AuthUser | null {
  const claims = decodeJwt(token);
  if (!claims.sub) return null;
  return {
    id: String(claims.sub),
    username: String(claims.username ?? claims.sub),
    role: (claims.role as UserRole) ?? "VIEWER",
    workspaceId: claims.workspace_id ? String(claims.workspace_id) : null,
    // JWT carries no workspace name/division — filled in once /auth/me resolves.
    workspaceName: null,
    division: null,
    displayName: String(claims.display_name ?? claims.username ?? claims.sub),
    email: String(claims.email ?? ""),
  };
}

/**
 * The role's backend authorities (e.g. CONTACT_VIEW, SCHEDULE_VIEW, AUDIT_VIEW),
 * read from the JWT `permissions` claim. This is exactly the authority set the
 * backend enforces via @PreAuthorize, so the UI gates pages on the same source.
 */
function permissionsFromToken(token: string | null): string[] {
  if (!token) return [];
  const perms = decodeJwt(token).permissions;
  return Array.isArray(perms) ? perms.map(String) : [];
}

/**
 * Build the auth user from the server's /auth/me response. This is the
 * authoritative source: the current role is derived from the membership that
 * matches currentWorkspaceId rather than trusting a client-decoded token.
 */
function userFromMe(me: AuthMe): AuthUser {
  // A SUPER_ADMIN is a platform role: treat them as such regardless of which
  // membership currentWorkspaceId happens to point at. Otherwise resolve the
  // role from the current workspace, falling back to the first membership so a
  // stale/mismatched currentWorkspaceId never silently downgrades the user to
  // VIEWER (which, for a super admin, would flip reports onto per-workspace
  // counts instead of platform-wide totals).
  const superAdmin = me.workspaces.find((w) => w.role === "SUPER_ADMIN");
  const current =
    me.workspaces.find((w) => w.id === me.currentWorkspaceId) ?? me.workspaces[0];
  const role = (superAdmin?.role ?? current?.role ?? "VIEWER") as UserRole;
  return {
    id: me.id,
    username: me.username,
    role,
    workspaceId: me.currentWorkspaceId ?? current?.id ?? null,
    workspaceName: current?.name ?? null,
    division: current?.division ?? null,
    displayName: me.displayName,
    email: me.email ?? "",
  };
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(() => {
    const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    return stored ? userFromToken(stored) : null;
  });

  const [rolePermissions, setRolePermissions] = React.useState<string[]>(() =>
    permissionsFromToken(sessionStorage.getItem(TOKEN_STORAGE_KEY)),
  );
  const [workspacePermissions, setWorkspacePermissions] = React.useState<string[]>([]);
  const [permissionsReady, setPermissionsReady] = React.useState(false);
  const [workspaceDeactivated, setWorkspaceDeactivated] = React.useState(false);

  // Listen for interceptor-triggered logout (refresh token expired)
  React.useEffect(() => {
    function handleForceLogout() {
      clearStoredAccessToken();
      clearAuthHeader();
      setUser(null);
      setRolePermissions([]);
      setWorkspaceDeactivated(false);
    }
    window.addEventListener("auth:logout", handleForceLogout);
    return () => window.removeEventListener("auth:logout", handleForceLogout);
  }, []);

  // Listen for the interceptor's workspace-suspended signal (see api.ts). The
  // session/token stays intact — only the UI drops into a dedicated screen —
  // so reactivating the workspace lets the same session resume without a
  // fresh login.
  React.useEffect(() => {
    function handleWorkspaceDeactivated() {
      setWorkspaceDeactivated(true);
    }
    window.addEventListener("workspace:deactivated", handleWorkspaceDeactivated);
    return () => window.removeEventListener("workspace:deactivated", handleWorkspaceDeactivated);
  }, []);

  // Validate a persisted session against the server on load. The decoded-token
  // value above gives an instant optimistic render; /auth/me then confirms the
  // session is still valid and refreshes the user from the server's truth.
  // Hard auth failures (expired/revoked token) are handled by the api
  // interceptor, which fires auth:logout — so a network/transient error here is
  // intentionally left to keep the optimistic user rather than logging out.
  React.useEffect(() => {
    const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) return;
    let cancelled = false;
    authApi
      .me()
      .then((me) => {
        if (!cancelled) setUser(userFromMe(me));
      })
      .catch(() => {
        /* interceptor handles 401 via refresh / auth:logout */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the current workspace's feature permissions. These gate page access
  // before the user's role does (see canAccessRoute). SUPER_ADMIN has no
  // workspace and bypasses feature gating, so we mark permissions ready
  // immediately and leave the list empty.
  React.useEffect(() => {
    if (!user) {
      setWorkspacePermissions([]);
      setPermissionsReady(false);
      return;
    }
    if (user.role === "SUPER_ADMIN" || !user.workspaceId) {
      setWorkspacePermissions([]);
      setPermissionsReady(true);
      return;
    }
    let cancelled = false;
    setPermissionsReady(false);
    workspacesApi
      .get(user.workspaceId)
      .then((ws) => {
        if (!cancelled) setWorkspacePermissions(ws.permissions ?? []);
      })
      .catch(() => {
        if (!cancelled) setWorkspacePermissions([]);
      })
      .finally(() => {
        if (!cancelled) setPermissionsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.workspaceId, user?.role]);

  /**
   * One round trip. The backend checks the credentials against Active
   * Directory — falling back to a local password only for accounts AD does not
   * hold — and returns the access token plus an HttpOnly refresh cookie. The
   * OTP round trip that used to sit in the middle is gone.
   */
  async function login(username: string, password: string) {
    const { data } = await api.post<{
      accessToken: string;
      expiresIn?: number;
      user?: Partial<AuthUser>;
    }>("/auth/login", { username, password });

    storeAccessToken(data.accessToken);
    const decoded = userFromToken(data.accessToken);
    // Merge any explicit user fields from the response body
    setUser(
      decoded ? { ...decoded, ...(data.user as Partial<AuthUser>) } : null,
    );
    setRolePermissions(permissionsFromToken(data.accessToken));
    setWorkspaceDeactivated(false);

    // The JWT alone can't carry workspaceName/division, so without this the
    // sidebar shows "role only" for the rest of the session — the only other
    // place that enriches the user is the mount-time /auth/me effect, which
    // runs once and doesn't re-fire on a fresh login. Best-effort: a failure
    // here just leaves the optimistic decoded user in place.
    try {
      const me = await authApi.me();
      setUser(userFromMe(me));
    } catch {
      /* keep the optimistic decoded user */
    }
  }

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // best-effort
    } finally {
      clearStoredAccessToken();
      clearAuthHeader();
      setUser(null);
      setRolePermissions([]);
      setWorkspaceDeactivated(false);
    }
  }

  const value: AuthState = {
    user,
    isAuthenticated: !!user,
    rolePermissions,
    workspacePermissions,
    permissionsReady,
    workspaceDeactivated,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
