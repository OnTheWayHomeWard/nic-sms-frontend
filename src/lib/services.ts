import { api } from "./api";

// ── Error helper ──────────────────────────────────────────────────────────────
// Backend errors are RFC 7807 problem+json: { type, title, status }

export function apiErrorMessage(err: unknown, fallback: string): string {
  const data = (
    err as {
      response?: {
        data?: {
          title?: string;
          detail?: string;
          status?: number;
          message?: string;
          errors?: { error?: string; message?: string; field?: string }[];
        };
      };
    }
  )?.response?.data;
  // A failed upload (POST /groups/{id}/upload, /groups/uploads) returns the
  // raw ContactUpload/ProblemDetail entity with neither `title` nor
  // `message` — the real reason lives in errors[0].error (or .message for
  // validation ProblemDetail field errors). Without this fallback, every
  // upload-time failure showed the generic fallback string instead of e.g.
  // "Required columns 'phone' not found. Detected columns: [...]".
  const firstError = data?.errors?.[0];
  // GlobalExceptionHandler maps IllegalArgumentException to a 400 whose
  // title is the generic "Bad request" and whose detail is the actual reason
  // (e.g. "Message is too long: ... 11 SMS segments, but the maximum is 10").
  if (data?.status === 400 && data?.title === "Bad request" && data?.detail) {
    return data.detail;
  }
  return (
    data?.title ??
    data?.message ??
    firstError?.error ??
    firstError?.message ??
    fallback
  );
}

/** Summarizes a ContactUpload's row-level results for display — see the
 * granular-error-visibility requirement: partial success (some rows
 * imported, some skipped) must never be reported as a plain, unqualified
 * "success" toast. */
export function summarizeUpload(upload: ContactUpload): {
  hasIssues: boolean;
  title: string;
  description?: string;
} {
  const imported = upload.importedCount ?? 0;
  const duplicates = upload.duplicateCount ?? 0;
  const errorCount = upload.errorCount ?? 0;

  if (errorCount === 0 && duplicates === 0) {
    return { hasIssues: false, title: `${imported} contact${imported === 1 ? "" : "s"} imported` };
  }

  const parts = [`${imported} imported`];
  if (duplicates > 0) parts.push(`${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped`);
  if (errorCount > 0) parts.push(`${errorCount} row${errorCount === 1 ? "" : "s"} failed`);

  const preview = (upload.errors ?? [])
    .slice(0, 3)
    .map((e) => `Row ${e.row}: ${e.error}`)
    .join(" · ");
  const more = errorCount > 3 ? ` (+${errorCount - 3} more)` : "";

  return {
    hasIssues: true,
    title: parts.join(", "),
    description: preview ? `${preview}${more}` : undefined,
  };
}

// ── Auth (GET /auth/me) ───────────────────────────────────────────────────────
// Server-side source of truth for the current session. Used to validate a
// persisted access token on app load instead of trusting a client-decoded JWT.

export interface AuthMeWorkspace {
  id: string;
  name: string;
  code: string;
  division: string | null;
  role: string; // backend role code, e.g. SUPER_ADMIN | DEPT_HEAD | OPERATOR | VIEWER
  status: string;
}

export interface AuthMe {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  status: string;
  lastLoginAt: string | null;
  workspaces: AuthMeWorkspace[];
  currentWorkspaceId: string | null;
}

export const authApi = {
  me: () => api.get<AuthMe>("/auth/me").then((r) => r.data),
};

// ── Roles (GET /roles) ────────────────────────────────────────────────────────

export interface ApiRole {
  id: string;
  code: string;
  name: string;
  scope: string; // PLATFORM | WORKSPACE
  immutable: boolean;
  status: string;
}

export const rolesApi = {
  list: () => api.get<ApiRole[]>("/roles").then((r) => r.data),
};

// ── Role vocabulary mapping ───────────────────────────────────────────────────
// The UI presents four role labels (Admin/Operator/Supervisor/Viewer); the
// backend has workspace roles DEPT_HEAD/OPERATOR/VIEWER (+ platform SUPER_ADMIN).
// These maps keep the UI untouched while wiring real membership assignment.

export type UiRoleLabel = "Admin" | "Operator" | "Supervisor" | "Viewer" | "Delegate";

/**
 * Backend role *code* a UI label assigns to when creating a workspace
 * membership. "Supervisor" has no backend equivalent yet → null (the account is
 * still created, but no membership is assigned). "Delegate" (backend code
 * "CEO") is assigned via the workspace's delegate picker, not this map.
 */
export const UI_ROLE_TO_CODE: Record<UiRoleLabel, string | null> = {
  Admin: "DEPT_HEAD",
  Operator: "OPERATOR",
  Supervisor: null,
  Viewer: "VIEWER",
  Delegate: null,
};

/**
 * Backend role code → UI label for read-only display in grids. The backend's
 * "CEO" role is always presented as "Delegate" in the UI — never show the raw
 * code.
 */
export function codeToUiRole(code: string | null | undefined): UiRoleLabel | "" {
  switch (code) {
    case "SUPER_ADMIN":
    case "DEPT_HEAD":
      return "Admin";
    case "OPERATOR":
      return "Operator";
    case "VIEWER":
      return "Viewer";
    case "CEO":
      return "Delegate";
    default:
      return "";
  }
}

// ── Users (GET/POST /users) ─────────────────────────────────────────────

export type ApiUserStatus = "ACTIVE" | "DISABLED";

export interface ApiMembership {
  workspaceId: string;
  workspaceName: string;
  division: string | null;
  role: string; // backend role code
  assignedAt: string | null;
}

export interface ApiUser {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  status: ApiUserStatus;
  lastLoginAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  // Enriched from the user's primary (first) workspace membership
  primaryRole: string | null;
  primaryWorkspace: string | null;
  division: string | null;
  memberships: ApiMembership[];
}

/**
 * Active Directory owns identity: username (= sAMAccountName), display name,
 * email and password all come from AD and can't be set or changed here. The
 * only thing sent is which AD account to add.
 */
export interface AddAdUserBody {
  /** sAMAccountName of the AD account (from adApi.searchUsers). */
  adSam: string;
}

export const usersApi = {
  list: (status?: ApiUserStatus) =>
    api
      .get<ApiUser[]>("/users", { params: status ? { status } : undefined })
      .then((r) => r.data),
  get: (id: string) => api.get<ApiUser>(`/users/${id}`).then((r) => r.data),
  /**
   * Adds an AD account to eSMS, or returns its existing eSMS user if it
   * already has one. Grant workspace + role afterwards via
   * workspacesApi.addMember.
   */
  addFromAd: (body: AddAdUserBody) =>
    api.post<ApiUser>("/users", body).then((r) => r.data),
  activate: (id: string) =>
    api.post<ApiUser>(`/users/${id}/activate`).then((r) => r.data),
  deactivate: (id: string) =>
    api.post<ApiUser>(`/users/${id}/deactivate`).then((r) => r.data),
};

// ── Active Directory (GET /ad/users) ──────────────────────────────────────────

export interface ApiAdUser {
  samAccountName: string;
  displayName: string;
  email: string | null;
  /** The eSMS user already linked to this AD account, or null. */
  existingUserId: string | null;
}

export interface ApiAdUserSearch {
  users: ApiAdUser[];
  /** More accounts matched than were returned — narrow the query. */
  truncated: boolean;
}

export const adApi = {
  searchUsers: (q: string, limit = 50, signal?: AbortSignal) =>
    api
      .get<ApiAdUserSearch>("/ad/users", { params: { q, limit }, signal })
      .then((r) => r.data),
};

// ── Workspaces (GET/POST/PATCH /workspaces + members) ─────────────────────────

export type ApiWorkspaceStatus = "ACTIVE" | "SUSPENDED";

export interface ApiWorkspace {
  id: string;
  code: string;
  name: string;
  kind: string;
  division: string | null;
  status: ApiWorkspaceStatus;
  senderMask: string | null;
  dailySmsLimit: number | null;
  permissions: string[];
  // Enriched by the backend list/get response
  memberCount: number;
  adminName: string | null;
  adminUserId: string | null;
  delegateUserId: string | null;
  delegateName: string | null;
  // Branch hierarchy. A branch sets parentWorkspaceId (+ parentName) and
  // inherits its umbrella's permissions. An umbrella sets isBranchParent and
  // reports how many branches it owns.
  parentWorkspaceId: string | null;
  parentName: string | null;
  isBranchParent: boolean;
  branchCount: number;
}

export interface ApiWorkspaceMember {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  assignedAt: string | null;
}

export interface CreateWorkspaceBody {
  code: string;
  name: string;
  kind?: string;
  division?: string;
  dailySmsLimit?: number;
  adminUserId?: string;
  delegateUserId?: string;
  permissions?: string[];
  // Branch hierarchy. parentWorkspaceId ⇒ create a branch under that umbrella
  // (inherits its permissions). isBranchParent ⇒ create an umbrella together
  // with its mandatory first branch (firstBranchName + firstBranchAdminUserId).
  parentWorkspaceId?: string;
  isBranchParent?: boolean;
  firstBranchName?: string;
  firstBranchAdminUserId?: string;
}

export interface UpdateWorkspaceBody {
  name?: string;
  division?: string;
  senderMask?: string;
  dailySmsLimit?: number;
  permissions?: string[];
  adminUserId?: string;
  delegateUserId?: string;
}

export const workspacesApi = {
  list: () => api.get<ApiWorkspace[]>("/workspaces").then((r) => r.data),
  get: (id: string) =>
    api.get<ApiWorkspace>(`/workspaces/${id}`).then((r) => r.data),
  create: (body: CreateWorkspaceBody) =>
    api.post<ApiWorkspace>("/workspaces", body).then((r) => r.data),
  update: (id: string, body: UpdateWorkspaceBody) =>
    api.patch<ApiWorkspace>(`/workspaces/${id}`, body).then((r) => r.data),
  members: (id: string) =>
    api
      .get<ApiWorkspaceMember[]>(`/workspaces/${id}/members`)
      .then((r) => r.data),
  addMember: (id: string, userId: string, roleId: string) =>
    api
      .post(`/workspaces/${id}/members`, { userId, roleId })
      .then((r) => r.data),
  changeMemberRole: (id: string, userId: string, roleId: string) =>
    api
      .patch(`/workspaces/${id}/members/${userId}`, { roleId })
      .then((r) => r.data),
  removeMember: (id: string, userId: string) =>
    api.delete(`/workspaces/${id}/members/${userId}`).then((r) => r.data),
  activate: (id: string) =>
    api.post<ApiWorkspace>(`/workspaces/${id}/activate`).then((r) => r.data),
  deactivate: (id: string) =>
    api.post<ApiWorkspace>(`/workspaces/${id}/deactivate`).then((r) => r.data),
};

// ── Templates (GET /templates) ────────────────────────────────────────────────

export interface TemplateRecipient {
  id: string;
  phoneE164: string;
  name: string | null;
}

export interface ApiTemplate {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  body: string;
  encoding: string | null;
  status: string;
  rejectionReason: string | null;
  variables: string[];
  sender: string | null;
  recipientGroupId: string | null;
  recipients: TemplateRecipient[];
  recipientCount: number;
  approvedBy: string | null;
  approverName: string | null;
  approvedAt: string | null;
  createdBy: string;
  creatorName: string | null;
  createdAt: string;
}

export interface CreateTemplateBody {
  name: string;
  description?: string;
  body: string;
  /** Ignored by the backend: always derived from the body. Not sent. */
  encoding?: string;
  variables?: string[];
  sender?: string;
  recipientGroupId?: string;
  recipients?: { phoneE164: string; name?: string }[];
}

export interface UpdateTemplateBody {
  name?: string;
  description?: string;
  body?: string;
  encoding?: string;
  sender?: string;
  recipientGroupId?: string | null;
  variables?: string[];
}

export const templatesApi = {
  list: (status?: string) =>
    api
      .get<ApiTemplate[]>("/templates", {
        params: status ? { status } : undefined,
      })
      .then((r) => r.data),
  get: (id: string) =>
    api.get<ApiTemplate>(`/templates/${id}`).then((r) => r.data),
  create: (body: CreateTemplateBody) =>
    api.post<ApiTemplate>("/templates", body).then((r) => r.data),
  update: (id: string, body: UpdateTemplateBody) =>
    api.patch<ApiTemplate>(`/templates/${id}`, body).then((r) => r.data),
  approve: (id: string) =>
    api.post<ApiTemplate>(`/templates/${id}/approve`).then((r) => r.data),
  reject: (id: string, rejectionReason: string) =>
    api
      .post<ApiTemplate>(`/templates/${id}/reject`, { rejectionReason })
      .then((r) => r.data),
  retire: (id: string) =>
    api.post<ApiTemplate>(`/templates/${id}/retire`).then((r) => r.data),
  reactivate: (id: string) =>
    api.post<ApiTemplate>(`/templates/${id}/reactivate`).then((r) => r.data),
  addRecipients: (
    id: string,
    recipients: { phoneE164: string; name?: string }[],
  ) =>
    api
      .post<TemplateRecipient[]>(`/templates/${id}/recipients`, recipients)
      .then((r) => r.data),
  removeRecipient: (id: string, phoneE164: string) =>
    api
      .delete(`/templates/${id}/recipients/${encodeURIComponent(phoneE164)}`)
      .then((r) => r.data),
};

// ── Contact Groups (GET /groups) ──────────────────────────────────────────────

export interface ApiGroup {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  fields: string[];
  status: string;
  memberCount: number;
  originalFileName: string | null;
  recordCount: number | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  uploadDate: string | null;
  uploadCount: number;
}

export interface UploadRowError {
  row: number;
  error: string;
}

export interface ContactUpload {
  id: string;
  workspaceId: string;
  originalName: string;
  fileSize: number;
  contentType: string;
  status: string; // "DRAFT" | "MAPPED" | "COMMITTED" | "FAILED"
  detectedCols: string[] | null;
  mapping: Record<string, string> | null;
  rowCount: number | null;
  importedCount: number;
  duplicateCount: number;
  errorCount: number;
  errors: UploadRowError[];
  createdAt: string;
  completedAt: string | null;
}

export interface GroupMember {
  phoneE164?: string;
  phone?: string;
  name?: string;
  [key: string]: string | undefined;
}

export interface ApiUploadHistory {
  id: string;
  originalFileName: string | null;
  fileSize: number;
  status: string;
  rowCount: number | null;
  importedCount: number | null;
  duplicateCount: number | null;
  errorCount: number | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
  completedAt: string | null;
}

/**
 * The backend (ExcelUploadService) never accepts a client-supplied column
 * mapping — it auto-detects the phone column by matching the header against
 * this fixed list, ignoring case, spaces, underscores and hyphens (so
 * "Phone Number" == "phone_number" == "PHONE-NUMBER"), and fails the whole
 * upload with "Required columns 'phone' not found" if none match. Keep this
 * in sync with ExcelUploadService.PHONE_HEADERS so the UI can warn *before*
 * uploading a file whose header the backend will never recognize.
 */
export const BACKEND_RECOGNIZED_PHONE_HEADERS = [
  "phone",
  "phone_number",
  "Phone Number",
  "phoneE164",
  "phone_e164",
  "Mobile",
  "Mobile Number",
];

function phoneHeaderKey(header: string): string {
  return header
    .replace(/[\uFEFF\u200B]/g, "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");
}

export function isBackendRecognizedPhoneHeader(header: string): boolean {
  const h = phoneHeaderKey(header);
  return BACKEND_RECOGNIZED_PHONE_HEADERS.some((c) => phoneHeaderKey(c) === h);
}

/**
 * The backend only rejects a row as an import error when the phone cell is
 * literally empty — it does NOT validate phone format. A very common Excel
 * gotcha is a phone column stored as a Number, which silently drops the
 * leading 0 (e.g. "0913602814" becomes "913602814"); normalizePhone() only
 * rewrites numbers that already start with "09"/"07"/"251", so that row
 * still gets imported, just with a malformed phoneE164. This checks for a
 * well-formed Ethiopian E.164 number so those "wrong" rows can be surfaced.
 */
export function isValidEthiopianE164(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return /^\+251[79]\d{8}$/.test(phone.trim());
}

export const groupsApi = {
  list: () => api.get<ApiGroup[]>("/groups").then((r) => r.data),
  create: (body: { name: string; description?: string }) =>
    api.post<ApiGroup>("/groups", body).then((r) => r.data),
  update: (id: string, body: { name?: string; description?: string }) =>
    api.patch<ApiGroup>(`/groups/${id}`, body).then((r) => r.data),
  deactivate: (id: string) =>
    api.post(`/groups/${id}/deactivate`).then((r) => r.data),
  activate: (id: string) =>
    api.post<ApiGroup>(`/groups/${id}/activate`).then((r) => r.data),
  uploadToGroup: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<ContactUpload>(`/groups/${id}/upload`, form).then((r) => r.data);
  },
  exportMembers: (id: string) =>
    api
      .get(`/groups/${id}/members/export`, { responseType: "blob" })
      .then((r) => r.data as Blob),
  listMembers: (id: string) =>
    api.get<GroupMember[]>(`/groups/${id}/members`).then((r) => r.data),
  uploadHistory: (id: string) =>
    api.get<ApiUploadHistory[]>(`/groups/${id}/uploads`).then((r) => r.data),
  standaloneUpload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api
      .post<ContactUpload>("/groups/uploads", form)
      .then((r) => r.data);
  },
};

// ── Individual contacts (GET/POST/PATCH /contacts) ────────────────────────────

export interface ApiContact {
  id: string;
  workspaceId: string;
  name: string | null;
  phoneE164: string;
  branch: string | null;
  extra: Record<string, string>;
  uploadId: string | null;
  optOut: boolean;
  status: string; // ACTIVE | INACTIVE
  createdAt: string;
}

export interface UpdateContactBody {
  name?: string;
  branch?: string;
  optOut?: boolean;
  extra?: Record<string, string>;
}

export const contactsApi = {
  list: (status?: string) =>
    api
      .get<ApiContact[]>("/contacts", { params: status ? { status } : undefined })
      .then((r) => r.data),
  get: (id: string) => api.get<ApiContact>(`/contacts/${id}`).then((r) => r.data),
  create: (body: { name?: string; phoneE164: string; branch?: string; extra?: Record<string, string> }) =>
    api.post<ApiContact>("/contacts", body).then((r) => r.data),
  update: (id: string, body: UpdateContactBody) =>
    api.patch<ApiContact>(`/contacts/${id}`, body).then((r) => r.data),
  activate: (id: string) =>
    api.post<ApiContact>(`/contacts/${id}/activate`).then((r) => r.data),
  deactivate: (id: string) =>
    api.post<ApiContact>(`/contacts/${id}/deactivate`).then((r) => r.data),
};

// ── Campaigns (GET /campaigns, PUT /campaigns/:id, actions) ───────────────────

export interface ApiCampaign {
  id: string;
  name: string;
  /** "INSTANT" | "SCHEDULED" */
  kind: string;
  /** "DRAFT" | "PENDING_APPROVAL" | "PENDING_HEAD" | "PENDING_CEO" | "APPROVED" | "QUEUED" | "CANCELLED" | "COMPLETED" */
  status: string;
  templateId: string | null;
  customBody: string | null;
  recipientGroupId: string | null;
  uploadId: string | null;
  recipientCount: number | null;
  scheduledAt: string | null;
  createdBy: string;
  creatorName: string | null;
  createdAt: string;
  workspaceId: string;
  totalMessages: number;
  deliveredMessages: number;
  failedMessages: number;
  deliveryRatePct: number;
}

export interface UpdateCampaignBody {
  name?: string;
  kind?: string;
  templateId?: string;
  recipientGroupId?: string;
  uploadId?: string;
  customBody?: string;
  scheduledAt?: string;
}

export interface CreateCampaignBody {
  name: string;
  kind: string; // "INSTANT" | "SCHEDULED"
  templateId?: string;
  recipientGroupId?: string;
  uploadId?: string;
  customBody?: string;
  scheduledAt?: string; // ISO 8601
}

export const campaignsApi = {
  list: (params?: { status?: string; workspaceId?: string }) =>
    api.get<ApiCampaign[]>("/campaigns", { params }).then((r) => r.data),
  create: (body: CreateCampaignBody) =>
    api.post<ApiCampaign>("/campaigns", body).then((r) => r.data),
  update: (id: string, body: UpdateCampaignBody) =>
    api.put<ApiCampaign>(`/campaigns/${id}`, body).then((r) => r.data),
  submit: (id: string) =>
    api.post<ApiCampaign>(`/campaigns/${id}/submit`).then((r) => r.data),
  approve: (id: string, note?: string) =>
    api
      .post<ApiCampaign>(`/campaigns/${id}/approve`, { note: note ?? null })
      .then((r) => r.data),
  reject: (id: string, note: string) =>
    api.post<ApiCampaign>(`/campaigns/${id}/reject`, { note }).then((r) => r.data),
  cancel: (id: string, note?: string) =>
    api
      .post<ApiCampaign>(`/campaigns/${id}/cancel`, { note: note ?? null })
      .then((r) => r.data),
  recipients: (id: string) =>
    api.get<ApiRecipient[]>(`/campaigns/${id}/recipients`).then((r) => r.data),
  /** Re-send failed messages: one recipient (messageId) or all failed ones.
   * With newNumber, re-sends that one recipient to a corrected number. */
  retryFailed: (id: string, messageId?: string, newNumber?: string) =>
    api
      .post<RetryResult<ApiCampaign>>(`/campaigns/${id}/retry-failed`, {
        messageId: messageId ?? null,
        newNumber: newNumber ?? null,
      })
      .then((r) => r.data),
};

// ── Reports ────────────────────────────────────────────────────────────────────

export interface DashboardSummary {
  totalMessages: number;
  sentMessages: number;
  deliveredMessages: number;
  failedMessages: number;
  deliveryRatePct: number;
  totalCampaigns: number;
  activeWorkspaces: number;
  totalUsers: number;
  activeUsers30d: number;
  /** Messages created today (for the daily-limit usage bar). */
  todayMessages: number;
  /** SMS segments created today (a 3-part message counts 3). Newer backends only. */
  todaySegments?: number;
  /** The workspace's daily SMS cap, or null if unlimited. */
  dailySmsLimit: number | null;
  workspaceId: string | null;
}

// ── Message delivery log (GET /reports/messages) ──────────────────────────────

export interface DeliveryMessageRow {
  id: string;
  to: string; // masked, e.g. ****6789
  status: string;
  campaignId: string | null;
  carrier: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface DeliveryReport {
  totals: { sent: number; delivered: number; failed: number; pending: number };
  rows: DeliveryMessageRow[];
  totalCount: number;
}

// ── Report exports (POST/GET /reports/exports) ────────────────────────────────

export interface ReportExportStatus {
  id: string;
  status: string; // QUEUED | PROCESSING | DONE | FAILED
  format: string; // XLSX | CSV
  createdAt: string;
  completedAt: string | null;
  filePath: string | null;
}

export interface ReportExportRequestBody {
  format?: string;
  campaignId?: string;
  status?: string;
  from?: string;
  to?: string;
  branch?: string;
}

/** One (day × status) point from GET /reports/aggregations/daily */
export interface DailyTrendPoint {
  day: string;    // "2024-01-15"
  status: string; // "DELIVERED" | "SENT" | "FAILED" | "PENDING" | "QUEUED" | "EXPIRED"
  total: number;
}

/** One campaign row from GET /reports/aggregations/campaigns */
export interface CampaignSummaryPoint {
  campaignId: string;
  sent: number;
  delivered: number;
  failed: number;
  pending: number;
}

/** One action row from GET /reports/users-activity */
export interface UserActivityPoint {
  action: string;
  total: number;
}

// All four report endpoints accept an optional workspaceId override: a
// SUPER_ADMIN passes the all-zeros sentinel (or a real workspace id) to pick
// the scope; for everyone else the backend ignores it and uses their own
// workspace. These params MUST be declared here — callers were passing them
// while the functions took none, so TypeScript's arity check was the only
// thing that caught the filter being silently dropped.
export const reportsApi = {
  dashboardSummary: (workspaceId?: string) =>
    api
      .get<DashboardSummary>("/reports/dashboard/summary", {
        params: workspaceId ? { workspaceId } : undefined,
      })
      .then((r) => r.data),

  dailyTrend: (from?: string, to?: string, workspaceId?: string) =>
    api
      .get<DailyTrendPoint[]>("/reports/aggregations/daily", {
        params: { ...(from && { from }), ...(to && { to }), ...(workspaceId && { workspaceId }) },
      })
      .then((r) => r.data),

  campaignSummaries: (from?: string, to?: string, workspaceId?: string) =>
    api
      .get<CampaignSummaryPoint[]>("/reports/aggregations/campaigns", {
        params: { ...(from && { from }), ...(to && { to }), ...(workspaceId && { workspaceId }) },
      })
      .then((r) => r.data),

  usersActivity: (days?: number, workspaceId?: string) =>
    api
      .get<UserActivityPoint[]>("/reports/users-activity", {
        params: { ...(days && { days }), ...(workspaceId && { workspaceId }) },
      })
      .then((r) => r.data),

  // Per-message delivery log — paginated, filterable by campaign/status/date.
  messages: (params?: {
    from?: string;
    to?: string;
    campaignId?: string;
    status?: string;
    workspaceId?: string;
    page?: number;
    size?: number;
  }) =>
    api.get<DeliveryReport>("/reports/messages", { params }).then((r) => r.data),

  // Async server-side exports.
  listExports: () =>
    api.get<ReportExportStatus[]>("/reports/exports").then((r) => r.data),
  requestExport: (body: ReportExportRequestBody) =>
    api
      .post<{ id: string; status: string }>("/reports/exports", body)
      .then((r) => r.data),
  exportStatus: (id: string) =>
    api.get<ReportExportStatus>(`/reports/exports/${id}`).then((r) => r.data),
  downloadExport: (id: string) =>
    api
      .get(`/reports/exports/${id}`, { responseType: "blob" })
      .then((r) => r.data as Blob),
};

// ── Audit Logs (GET /audit-logs) ───────────────────────────────────────────────

export type AuditSeverity = "INFO" | "WARN" | "CRITICAL";
export type AuditOutcome = "SUCCESS" | "FAILURE";

/** One changed field of an update; secrets arrive already masked as "***". */
export interface AuditChange {
  before: unknown;
  after: unknown;
}

export interface ApiAuditLog {
  id: string;
  seq: number | null;
  workspaceId: string | null;
  actorUserId: string | null;
  /** Username, or the attempted username for a failed login. */
  actorUsername: string | null;
  actorDisplayName: string | null;
  actorRole: string | null;
  category: string;
  severity: AuditSeverity;
  /** Machine action code, e.g. CONTACT_UPDATED. */
  action: string;
  /** Human-readable action, e.g. "Updated contact". */
  description: string | null;
  entityType: string | null;
  entityId: string | null;
  outcome: AuditOutcome;
  errorReason: string | null;
  changes: Record<string, AuditChange> | null;
  detail: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  /** UTC ISO instant. */
  createdAt: string;
}

export interface AuditLogQuery {
  severity?: string;
  workspaceId?: string;
  search?: string;
  outcome?: AuditOutcome;
  category?: string;
  entityType?: string;
  entityId?: string;
  actor?: string;
  action?: string;
  /** ISO instants (UTC). */
  startDate?: string;
  endDate?: string;
  page?: number;
  size?: number;
  /** e.g. "createdAt,desc" */
  sort?: string;
}

export interface SpringPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

const listAuditLogs = (params?: AuditLogQuery): Promise<SpringPage<ApiAuditLog>> =>
  api
    .get<SpringPage<ApiAuditLog>>("/audit-logs", { params })
    .then((r) => r.data);

export const auditLogsApi = {
  list: listAuditLogs,
  /**
   * Every entry matching the filters (not just the visible page), fetched
   * page by page for export. Capped so a huge log cannot hang the browser.
   */
  listAll: async (params: Omit<AuditLogQuery, "page" | "size">, max = 10000) => {
    const out: ApiAuditLog[] = [];
    const size = 500;
    for (let page = 0; out.length < max; page++) {
      const res = await listAuditLogs({ ...params, page, size });
      out.push(...res.content);
      if (page + 1 >= res.totalPages) break;
    }
    return out.slice(0, max);
  },
};

// ── Delegations (GET/POST /delegations) ───────────────────────────────────────

export interface ApiDelegation {
  id: string;
  workspaceId: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  startsAt: string;
  endsAt: string | null;
  reason: string | null;
  revoked: boolean;
  createdAt: string;
}

export interface CreateDelegationBody {
  toUserId: string;
  workspaceId?: string;
  startsAt?: string;
  endsAt?: string;
  reason?: string;
}

export const delegationsApi = {
  list: (activeOnly?: boolean) =>
    api
      .get<ApiDelegation[]>("/delegations", {
        params: activeOnly ? { activeOnly: true } : undefined,
      })
      .then((r) => r.data),
  mine: (activeOnly?: boolean) =>
    api
      .get<ApiDelegation[]>("/delegations/mine", {
        params: activeOnly ? { activeOnly: true } : undefined,
      })
      .then((r) => r.data),
  create: (body: CreateDelegationBody) =>
    api.post<ApiDelegation>("/delegations", body).then((r) => r.data),
  revoke: (id: string) =>
    api.post<ApiDelegation>(`/delegations/${id}/revoke`).then((r) => r.data),
};

// ── Reminder templates (GET/POST/PATCH /reminder-templates) ───────────────────
// A reminder template is the reusable definition (name, message, days-left
// rule) managed on the Reminders page. It's active/inactive and needs no
// approval. Sending one (below) creates a separate approval-gated run.

export interface ApiReminderTemplate {
  id: string;
  workspaceId: string;
  name: string;
  customBody: string | null;
  templateId: string | null;
  triggerDays: number;
  kind: string;
  status: string; // ACTIVE | INACTIVE
  createdBy: string | null;
  createdAt: string;
}

export interface CreateReminderTemplateBody {
  name: string;
  templateId?: string;
  customBody?: string;
  triggerDays: number;
  kind?: string;
}

export const reminderTemplatesApi = {
  list: (status?: string) =>
    api
      .get<ApiReminderTemplate[]>("/reminder-templates", {
        params: status ? { status } : undefined,
      })
      .then((r) => r.data),
  get: (id: string) =>
    api.get<ApiReminderTemplate>(`/reminder-templates/${id}`).then((r) => r.data),
  create: (body: CreateReminderTemplateBody) =>
    api.post<ApiReminderTemplate>("/reminder-templates", body).then((r) => r.data),
  update: (
    id: string,
    updates: Partial<CreateReminderTemplateBody>,
  ) =>
    api.patch<ApiReminderTemplate>(`/reminder-templates/${id}`, updates).then((r) => r.data),
  activate: (id: string) =>
    api.post<ApiReminderTemplate>(`/reminder-templates/${id}/activate`).then((r) => r.data),
  deactivate: (id: string) =>
    api.post<ApiReminderTemplate>(`/reminder-templates/${id}/deactivate`).then((r) => r.data),
};

// ── Reminder runs (GET/POST /reminders) ───────────────────────────────────────
// A run is one send of a reminder template against uploaded policy data.
// Created every time Send is pressed; every run is approval-gated (approving
// it fires it immediately) and one-shot.

export interface ApiReminder {
  id: string;
  workspaceId: string;
  name: string;
  reminderTemplateId: string | null;
  recipientGroupId: string | null;
  uploadId: string | null;
  templateId: string | null;
  customBody: string | null;
  triggerDays: number;
  kind: string;
  status: string; // PENDING_APPROVAL | APPROVED | FIRED | CANCELLED
  createdAt: string;
  totalMessages: number;
  deliveredMessages: number;
  failedMessages: number;
  deliveryRatePct: number;
  recipientEstimate: number | null;
}

export interface CreateReminderRunBody {
  reminderTemplateId: string;
  uploadId: string;
}

export interface ApiRecipient {
  /** Message id once dispatched — the handle for retrying that recipient.
   * Null pre-dispatch (recipient list is still an estimate). */
  messageId: string | null;
  phone: string;
  name: string | null;
  status: string | null; // per-message delivery status once fired, else null
  errorCode: string | null; // gateway failure reason when status is FAILED
}

/** Response of the retry-failed endpoints: how many messages were re-queued
 * plus the fresh parent row so tables can update without a refetch. */
export interface RetryResult<T> {
  retried: number;
  campaign?: T;
  reminder?: T;
}

export const remindersApi = {
  list: (status?: string) =>
    api
      .get<ApiReminder[]>("/reminders", {
        params: status ? { status } : undefined,
      })
      .then((r) => r.data),
  get: (id: string) =>
    api.get<ApiReminder>(`/reminders/${id}`).then((r) => r.data),
  create: (body: CreateReminderRunBody) =>
    api.post<ApiReminder>("/reminders", body).then((r) => r.data),
  approve: (id: string, note?: string) =>
    api.post<ApiReminder>(`/reminders/${id}/approve`, { note: note ?? null }).then((r) => r.data),
  reject: (id: string, note?: string) =>
    api.post<ApiReminder>(`/reminders/${id}/reject`, { note: note ?? null }).then((r) => r.data),
  recipients: (id: string) =>
    api.get<ApiRecipient[]>(`/reminders/${id}/recipients`).then((r) => r.data),
  /** Re-send failed messages: one recipient (messageId) or all failed ones.
   * With newNumber, re-sends that one recipient to a corrected number. */
  retryFailed: (id: string, messageId?: string, newNumber?: string) =>
    api
      .post<RetryResult<ApiReminder>>(`/reminders/${id}/retry-failed`, {
        messageId: messageId ?? null,
        newNumber: newNumber ?? null,
      })
      .then((r) => r.data),
};

// ── System Settings (GET/PATCH /settings) ─────────────────────────────────────

export type SystemSettings = Record<string, string>;

export const settingsApi = {
  getAll: () => api.get<SystemSettings>("/settings").then((r) => r.data),
  update: (updates: SystemSettings) =>
    api.patch<SystemSettings>("/settings", updates).then((r) => r.data),
};
