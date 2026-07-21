// Workspace permission catalogue. The backend stores permission codes as
// opaque strings on the workspace (workspace_permission table), so these codes
// are the contract between this UI and what gets persisted.

export interface WorkspacePermissionDef {
  code: string;
  title: string;
  desc: string;
}

export const WORKSPACE_PERMISSIONS_LEFT: WorkspacePermissionDef[] = [
  {
    code: "CREATE_RULES",
    title: "Create rules",
    desc: "e.g send renewal reminder 30 days before expiry",
  },
  {
    code: "CONTACT_MANAGEMENT",
    title: "Contact Management",
    desc: "Import, group, manage contacts",
  },
  {
    code: "VIEW_ANALYTICS",
    title: "View Analytics",
    desc: "Reports, charts, etc ...",
  },
  {
    code: "EXPORT_ANALYTICS",
    title: "Export Analytics",
    desc: "Download analytic data",
  },
];

export const WORKSPACE_PERMISSIONS_RIGHT: WorkspacePermissionDef[] = [
  {
    code: "CREATE_TEMPLATE",
    title: "Create Template",
    desc: "Create new templates",
  },
  {
    code: "CUSTOM_MESSAGE",
    title: "Write Custom Message",
    desc: "Use dynamic values to write custom messages",
  },
  {
    code: "BULK_CAMPAIGN",
    title: "Bulk Campaign",
    desc: "Mass send to contact list",
  },
  {
    code: "SCHEDULE_MESSAGE",
    title: "Schedule Message",
    desc: "Schedule messages or set reoccurring ones",
  },
];

export const ALL_WORKSPACE_PERMISSION_CODES = [
  ...WORKSPACE_PERMISSIONS_LEFT,
  ...WORKSPACE_PERMISSIONS_RIGHT,
].map((p) => p.code);
