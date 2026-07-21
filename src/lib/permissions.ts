export type UserRole = "SUPER_ADMIN" | "DEPT_HEAD" | "CEO" | "OPERATOR" | "VIEWER";

const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 4,
  DEPT_HEAD: 3,
  CEO: 3,
  OPERATOR: 2,
  VIEWER: 1,
};

/**
 * Role-hierarchy helper. Still used for a few in-page presentation decisions
 * (e.g. which dashboard sections to render). Page/feature ACCESS is NOT decided
 * by hierarchy — see canAccessRoute, which checks the role's actual backend
 * permissions intersected with the workspace's feature flags.
 */
export function atLeast(userRole: UserRole | null | undefined, min: UserRole): boolean {
  if (!userRole) return false;
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[min];
}

// ── Access model ────────────────────────────────────────────────────────────
// Access is the INTERSECTION of two independent checks, evaluated in order:
//
//   1. Role permission  — does the user's role actually grant the backend
//      authority this page requires? These come from the JWT `permissions`
//      claim, which is exactly what the backend enforces via @PreAuthorize.
//      (We do NOT approximate this with a role hierarchy — that previously
//      over-granted, e.g. it showed Reminders to OPERATOR even though only
//      DEPT_HEAD/SUPER_ADMIN are granted SCHEDULE_VIEW.)
//
//   2. Workspace feature flag — even if the role grants it, the workspace must
//      have the corresponding feature enabled (workspace_permission table). A
//      view-only workspace blocks the feature even for a DEPT_HEAD.
//
// SUPER_ADMIN is a platform role with no workspace: it bypasses both checks.

/**
 * Backend permission (authority) a role must hold to access each page.
 * Sourced from the controllers' @PreAuthorize rules (see V006/V010 seed data).
 * Pages not listed are gated by role alone (see SUPER_ADMIN_ONLY / DEPT_HEAD_ONLY).
 */
export const PAGE_PERMISSION: Record<string, string> = {
  "/campaigns":     "CAMPAIGN_VIEW",     // all workspace roles
  "/campaigns/new": "CAMPAIGN_DRAFT",    // OPERATOR+
  "/reports":       "REPORT_VIEW",       // all workspace roles
  "/reminder":      "SCHEDULE_VIEW",     // DEPT_HEAD+ only (NOT OPERATOR)
  "/templates":     "TEMPLATE_CREATE",   // OPERATOR+ (the page manages templates)
  "/contacts":      "CONTACT_CREATE",    // OPERATOR+ (the page manages contacts)
};

/** Pages restricted to SUPER_ADMIN (platform pages with no single workspace authority). */
const SUPER_ADMIN_ONLY = new Set<string>([
  "/workspaces",
  "/all-users",
  "/system-settings",
  "/audit-logs", // product decision: audit logs are SUPER_ADMIN-only on the frontend
]);

/**
 * Workspace feature code required to access each route. Even when the role
 * grants the page, the workspace must have this feature enabled. Routes not
 * listed have no feature gate. See src/lib/workspace-permissions.ts for codes.
 */
export const FEATURE_GATE: Record<string, string> = {
  "/reminder":      "CREATE_RULES",
  "/contacts":      "CONTACT_MANAGEMENT",
  "/reports":       "VIEW_ANALYTICS",
  "/templates":     "CREATE_TEMPLATE",
  "/campaigns/new": "BULK_CAMPAIGN",
};

/** A role grants a backend authority iff it appears in the JWT permissions claim. */
export function hasPermission(
  rolePermissions: string[],
  code: string,
): boolean {
  return rolePermissions.includes(code);
}

/**
 * Whether the current workspace has a feature flag enabled. For gating in-page
 * actions (e.g. custom-message composing, scheduling) the same way routes are
 * gated. SUPER_ADMIN (no workspace) bypasses.
 */
export function hasWorkspaceFeature(
  userRole: UserRole | null | undefined,
  workspacePermissions: string[],
  code: string,
): boolean {
  if (userRole === "SUPER_ADMIN") return true;
  return workspacePermissions.includes(code);
}

/**
 * Whether the current workspace's enabled feature flags permit this route.
 * SUPER_ADMIN bypasses (no workspace). Routes without a feature gate are allowed.
 */
export function isFeatureAllowed(
  userRole: UserRole | null | undefined,
  workspacePermissions: string[],
  path: string,
): boolean {
  if (userRole === "SUPER_ADMIN") return true;
  const required = FEATURE_GATE[path];
  if (!required) return true;
  return workspacePermissions.includes(required);
}

/**
 * Single source of truth for page access, used by both the sidebar and the
 * route guard so a URL can never be reachable when the nav would hide it.
 *
 * @param userRole             current role (from JWT)
 * @param rolePermissions      backend authorities the role grants (JWT claim)
 * @param workspacePermissions feature flags enabled on the current workspace
 */
export function canAccessRoute(
  userRole: UserRole | null | undefined,
  rolePermissions: string[],
  workspacePermissions: string[],
  path: string,
): boolean {
  if (!userRole) return false;

  // Dashboard is the universal landing/redirect target — always reachable.
  if (path === "/dashboard") return true;

  // SUPER_ADMIN sees everything except the workspace-scoped user-management page
  // (they use /all-users instead).
  if (userRole === "SUPER_ADMIN") return path !== "/user-management";

  // Workspace-scoped user management: DEPT_HEAD only (needs WORKSPACE_MEMBER_ADD).
  if (path === "/user-management") {
    return hasPermission(rolePermissions, "WORKSPACE_MEMBER_ADD");
  }

  // Platform pages are SUPER_ADMIN-only; non-super-admins never see them.
  if (SUPER_ADMIN_ONLY.has(path)) return false;

  // Feature pages: role must grant the authority AND the workspace must enable it.
  const required = PAGE_PERMISSION[path];
  if (!required) return false; // unknown route → deny by default
  return (
    hasPermission(rolePermissions, required) &&
    isFeatureAllowed(userRole, workspacePermissions, path)
  );
}
