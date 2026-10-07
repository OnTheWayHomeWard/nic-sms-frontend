/**
 * Per-page walkthrough content for the header's "?" guide button
 * (components/page-guide.tsx renders these).
 *
 * Each step should carry a `selector` so the tour scrolls to, spotlights, and
 * explains the exact control it's describing. `optional: true` means the step
 * is silently skipped when its element isn't on the page — used for role-gated
 * controls (approve buttons, admin-only fields) so users are never walked
 * through things they don't have.
 */

/**
 * Optional live demonstration: as a step is shown, the guide drives the real
 * UI so the user sees the effect instead of just reading about it. All fields
 * are element selectors; the engine (page-guide.tsx) runs them on step enter.
 * `on`/`off` are idempotent (they read the control's checked state and only
 * click when needed), so stepping back and forth stays consistent.
 */
export interface GuideAction {
  /** Ensure this toggle/switch/checkbox ends up ON (clicks only if currently off). */
  on?: string;
  /** Ensure this toggle/switch/checkbox ends up OFF (clicks only if currently on). */
  off?: string;
  /** Click this element to select/activate it (tabs, radio-style option cards). */
  click?: string;
}

export interface GuideStep {
  title: string;
  body: string;
  /** CSS selector of the element to spotlight (usually a [data-guide=...] tag). */
  selector?: string;
  /** Skip this step silently when the selector matches nothing. */
  optional?: boolean;
  /** Drive the real UI live as the step opens (see GuideAction). */
  action?: GuideAction;
}

export interface PageGuide {
  title: string;
  steps: GuideStep[];
}

const GUIDES: Record<string, PageGuide> = {
  "/dashboard": {
    title: "Dashboard",
    steps: [
      {
        title: "Your control center",
        body: "The dashboard summarizes what's happening: message volumes, delivery performance, campaigns, and recent activity. Numbers reflect your workspace — or the whole platform for a super admin.",
      },
      {
        title: "Key statistics",
        body: "These cards show all-time totals — messages sent, delivery rate, failures, and (for admins) users and workspaces. They come straight from the reporting service, so they match the Reports page.",
        selector: '[data-guide="dash-stats"]',
        optional: true,
      },
      {
        title: "Daily-limit usage",
        body: "When your workspace has a daily SMS limit, this bar shows how much of today's allowance has been used, so you can tell before a big send whether you'll hit the cap.",
        selector: '[data-guide="dash-usage"]',
        optional: true,
      },
      {
        title: "Tables below",
        body: "Recent campaigns, contact lists, users, and audit events follow. Most rows are clickable and open the full page for that item.",
        selector: '[data-guide="dash-tables"]',
        optional: true,
      },
      {
        title: "Getting around",
        body: "The sidebar switches pages — what you see depends on your role and your workspace's enabled features. The header has dark/light mode, and this ? button opens a guide like this on every page.",
        selector: '[data-guide="app-nav"]',
        optional: true,
      },
    ],
  },

  "/campaigns": {
    title: "Campaign Management",
    steps: [
      {
        title: "What campaigns are",
        body: "A campaign is one bulk SMS send: a message (custom text or an approved template), an audience (contact group, uploaded file, or a template's recipients), and optionally a scheduled date.",
      },
      {
        title: "New Campaign",
        body: "Opens the compose page where you pick recipients, write the message, and submit it for approval.",
        selector: '[data-guide="campaign-new"]',
        optional: true,
      },
      {
        title: "The tabs",
        body: "Campaigns lists everything and its status. Campaign Activity shows delivery stats for sends that went out. Approval tabs appear for approvers. Reminders shows every reminder send with its results.",
        selector: '[data-guide="campaign-tabs"]',
      },
      {
        title: "Search & filter",
        body: "Find a campaign by name or creator, and narrow by type or status. Sortable columns have arrows in their headers.",
        selector: '[data-guide="campaign-search"]',
        optional: true,
      },
      {
        title: "The lifecycle",
        body: "Draft → Pending Approval → Approved → Queued → Completed. A draft is edited and submitted only by its creator; approval is by a department head (Finance also needs delegate sign-off). Rejected returns to Draft; Approved/Queued can be cancelled.",
        selector: '[data-guide="campaign-tabs"]',
      },
      {
        title: "Delivery results & retry",
        body: "In Activity and Reminders, Delivered/Failed update automatically while messages are still in flight. When something fails, the red retry icon re-sends all failed messages, or open a row to retry individual numbers — no new approval needed.",
        selector: '[data-guide="campaign-tabs"]',
      },
      {
        title: "Approving",
        body: "Approval tabs badge how many items wait. Open one to review the exact message and full recipient list before Approve or Reject (with a reason). Approving a reminder sends it now; a scheduled campaign sends at its time.",
        selector: '[data-guide="campaign-tabs"]',
      },
    ],
  },

  "/campaigns/new": {
    title: "New Campaign",
    steps: [
      {
        title: "Name your campaign",
        body: "Give it a clear, descriptive name — approvers and reports identify the campaign by this.",
        selector: '[data-guide="compose-name"]',
        optional: true,
      },
      {
        title: "Use a template",
        body: "Watch — toggling this on reveals the template picker. An approved template brings its own message and recipient list, so there's nothing else to write or re-review.",
        selector: '[data-guide="compose-recipients"]',
        action: { on: '[data-guide="compose-template-switch"]' },
        optional: true,
      },
      {
        title: "…or compose your own",
        body: "Toggling it back off brings back the manual steps below — choose your own audience and write the message yourself. We'll do that now.",
        selector: '[data-guide="compose-source"]',
        action: { off: '[data-guide="compose-template-switch"]' },
        optional: true,
      },
      {
        title: "Choose your audience",
        body: "Flip this on to send to a saved contact group; leave it off to upload an Excel/CSV file for this send. For uploads you confirm which column holds phone numbers — rows without a valid one are counted and skipped.",
        selector: '[data-guide="compose-source"]',
        action: { on: '[data-guide="compose-source-switch"]' },
        optional: true,
      },
      {
        title: "Write the message",
        body: "Type the SMS and insert {{Variables}} to personalize per recipient — filled from your file's columns or the group's fields at send time. The counter shows characters and how many SMS parts will bill.",
        selector: '[data-guide="compose-message"]',
        action: { off: '[data-guide="compose-source-switch"]' },
        optional: true,
      },
      {
        title: "Schedule it (optional)",
        body: "Turning this on reveals a date picker — a scheduled campaign sends automatically at that time once approved (even if approval lands later). Left off, it sends as soon as it's approved.",
        selector: '[data-guide="compose-schedule"]',
        action: { on: '[data-guide="compose-schedule-switch"]' },
        optional: true,
      },
      {
        title: "Preview & recipient count",
        body: "The live preview fills in row 1's values, and the count is your valid recipients — distinct, non-empty numbers. Amber warnings flag rows skipped for a missing phone, or recipients missing a {{Variable}} value (those render blank).",
        selector: '[data-guide="compose-preview"]',
        action: { off: '[data-guide="compose-schedule-switch"]' },
        optional: true,
      },
      {
        title: "Send for approval",
        body: "Submitting creates the campaign and routes it to your department head (with delegate sign-off too, where that's enabled). Track its progress back on Campaign Management.",
        selector: '[data-guide="compose-submit"]',
        optional: true,
      },
    ],
  },

  "/reminder": {
    title: "Reminders",
    steps: [
      {
        title: "How reminders work",
        body: "A reminder here is a reusable definition: a name, a message format, and a days-left rule (e.g. \"7 days before expiry\"). Creating one needs no approval — it's a template you send with fresh policy data whenever needed.",
      },
      {
        title: "Create a reminder",
        body: "Define the name, the message (custom text with {{Variables}} or an approved template), and the trigger days. You can edit, deactivate, and reactivate it anytime.",
        selector: '[data-guide="reminder-new"]',
        optional: true,
      },
      {
        title: "Find & organize",
        body: "Search by name, filter Active/Inactive, and sort by name or trigger days. Inactive reminders can't be selected for sending until reactivated with the power button.",
        selector: '[data-guide="reminder-toolbar"]',
        optional: true,
      },
      {
        title: "Upload policy data",
        body: "To send, first upload today's policy file — it needs a phone column, an expiry-date column, and any columns your message's {{Variables}} reference. Each reminder then shows how many rows match its days-left rule, plus warnings for missing phones or values.",
        selector: '[data-guide="reminder-upload"]',
        optional: true,
      },
      {
        title: "Select & send",
        body: "Tick the compatible reminders to run against the file, then Send for Approval. Each becomes its own send that ALWAYS needs approval — even if the same reminder was approved before. Once approved, it sends immediately.",
        selector: '[data-guide="reminder-send"]',
        optional: true,
      },
      {
        title: "Track results",
        body: "Every send (pending, sent, or rejected) is tracked in Campaign Management: approvers act on the Reminder Approval tab, and the Reminders tab shows delivery status per send — including which numbers failed, with retry.",
      },
    ],
  },

  "/templates": {
    title: "Template Management",
    steps: [
      {
        title: "What templates are",
        body: "A template is a pre-approved message with its own recipients. Once approved, operators send campaigns or reminders with it without rewriting or re-reviewing the text.",
      },
      {
        title: "Create a template",
        body: "A template needs a name, the message body ({{Variables}} allowed), and recipients — a contact group or an uploaded file. It starts Pending until an approver acts.",
        selector: '[data-guide="template-new"]',
        optional: true,
      },
      {
        title: "The tabs",
        body: "Templates lists your workspace's templates by status. The Approval tab (for approvers) queues templates waiting for review — you can't approve one you created yourself.",
        selector: '[data-guide="template-tabs"]',
      },
      {
        title: "The lifecycle",
        body: "Pending → Approved (usable) or Rejected (with a reason). Approved templates can later be Retired out of use and reactivated. Editing an approved template's recipients appends new ones; campaigns already sent are unaffected.",
        selector: '[data-guide="template-tabs"]',
      },
    ],
  },

  "/contacts": {
    title: "Contact Management",
    steps: [
      {
        title: "Contact groups",
        body: "Groups are named, reusable audiences (e.g. \"Motor policyholders\"). Campaigns, templates, and reminders can send to a group, and its membership is read live at send time.",
      },
      {
        title: "Create a group",
        body: "Create the group, then fill it by uploading an Excel/CSV. The file needs a recognized phone column (phone, phone_number, Mobile, ...). Ethiopian numbers like 09... normalize to +2519... automatically.",
        selector: '[data-guide="contacts-new"]',
        optional: true,
      },
      {
        title: "Find & manage",
        body: "Search groups, view members, export a group to Excel, and deactivate ones you no longer need (deactivated groups keep their data and can be reactivated).",
        selector: '[data-guide="contacts-search"]',
        optional: true,
      },
      {
        title: "Individual contacts & opt-out",
        body: "Open a group's members to edit a contact, deactivate one, or set its opt-out flag — an opted-out contact is skipped by every send, which matters for compliance. Extra file columns (PolicyNo, ExpiryDate, ...) become {{Variables}}.",
      },
      {
        title: "Uploads & duplicates",
        body: "Each upload reports imported / duplicates / failed rows with reasons. Re-uploading an existing phone updates that contact instead of duplicating it, and every group keeps its full upload history.",
      },
    ],
  },

  "/reports": {
    title: "Reports & Analytics",
    steps: [
      {
        title: "What's here",
        body: "Delivery analytics built from every message the platform sent, scoped to your workspace (platform-wide for super admins) and matching the dashboard's numbers.",
      },
      {
        title: "The tabs",
        body: "Analytics tracks daily volumes and status trends. Campaigns breaks results down per campaign. Message Log is the per-SMS record. Users & Access reports on user activity.",
        selector: '[data-guide="reports-tabs"]',
      },
      {
        title: "Message Log",
        body: "The Message Log tab lists individual messages with number, status, error reason, campaign, and time — filterable and paginated. Use it to answer \"did this exact number get delivered, and if not, why?\"",
        selector: '[data-guide="reports-tabs"]',
      },
      {
        title: "Export",
        body: "Request a server-side XLSX/CSV export of the current data; it processes in the background and appears in the export list to download when ready.",
        selector: '[data-guide="reports-export"]',
        optional: true,
      },
    ],
  },

  "/all-users": {
    title: "All Users",
    steps: [
      {
        title: "Platform-wide user list",
        body: "Every account on the platform, whatever workspace it belongs to — with its primary workspace, role, status, and last login.",
      },
      {
        title: "Add a user from Active Directory",
        body: "Add User picks a staff account from Active Directory and can place it in a workspace with a role at once. Username, name, email and password all come from AD and can't be changed here. A user with no workspace can sign in but sees nothing until assigned.",
        selector: '[data-guide="allusers-new"]',
        optional: true,
      },
      {
        title: "One workspace per user",
        body: "A user belongs to exactly one workspace. Change a user's workspace and role, or activate/deactivate them, from the row actions. Passwords are managed in Active Directory, not here.",
      },
    ],
  },

  "/user-management": {
    title: "User Management",
    steps: [
      {
        title: "Your workspace's members",
        body: "Everyone with access to this workspace, with the role that controls what they can do here.",
      },
      {
        title: "Roles",
        body: "Admin (dept. head) approves and manages members. Operator creates and submits campaigns, templates, contacts. Viewer is read-only. Delegate is the CEO-tier approver for two-step (Finance-style) approvals.",
      },
      {
        title: "Add a member",
        body: "Add Member picks a staff account from Active Directory and adds it to this workspace with the role you pick. A user can only be in one workspace; their name and password are managed in AD.",
        selector: '[data-guide="um-new"]',
        optional: true,
      },
    ],
  },

  "/workspaces": {
    title: "Workspaces",
    steps: [
      {
        title: "What workspaces are",
        body: "Workspaces are departments (Underwriting, Finance, Claims, ...). Each has its own members, contacts, templates, campaigns, and approval flow — Finance-kind workspaces add a second, delegate approval tier.",
      },
      {
        title: "Browse or create",
        body: "Switch between the list of existing workspaces and the create form here.",
        selector: '[data-guide="ws-tabs"]',
        optional: true,
      },
      {
        title: "Workspace or branch?",
        body: "First choose what you're creating. A Workspace is top-level; a Branch is created under an existing branch-workspace and inherits its permissions. We'll pick Workspace to walk through it.",
        selector: '[data-guide="ws-create-type"]',
        action: { click: '[data-guide="ws-type-workspace"]' },
        optional: true,
      },
      {
        title: "Divided into branches?",
        body: "Watch — ticking this turns the workspace into an umbrella that holds no data of its own and reveals fields for its first branch. All work then happens inside the branches, which each behave like their own workspace under one roof.",
        selector: '[data-guide="ws-has-branches-row"]',
        action: { on: '[data-guide="ws-has-branches"]' },
        optional: true,
      },
      {
        title: "Details & admin",
        body: "Name it, set a code, an optional daily SMS limit, and assign an admin (who becomes its Department Head). Only unassigned users appear — a user can belong to just one workspace. An umbrella instead asks for its first branch's name and admin.",
        selector: '[data-guide="ws-create-details"]',
        action: { off: '[data-guide="ws-has-branches"]' },
        optional: true,
      },
      {
        title: "Permissions",
        body: "Choose which features the workspace can use — contacts, templates, reminders, reports, and so on. For an umbrella these are inherited by every branch; a branch itself has no separate permissions.",
        selector: '[data-guide="ws-create-perms"]',
        optional: true,
      },
      {
        title: "Delegate sign-off",
        body: "Enable this to require a delegate to approve messages before they send (the Finance two-tier flow), and assign that delegate. Turning it off later gracefully demotes the delegate to Operator rather than removing them.",
        selector: '[data-guide="ws-create-delegation"]',
        optional: true,
      },
      {
        title: "Suspending & limits",
        body: "From the list you can edit a workspace's sender mask and daily limit, change its admin/delegate, or suspend it (which locks all its members out until reactivated).",
        selector: '[data-guide="ws-tabs"]',
        optional: true,
      },
    ],
  },

  "/audit-logs": {
    title: "Audit Logs",
    steps: [
      {
        title: "The paper trail",
        body: "Every significant action — logins, campaign submissions/approvals/rejections, user changes, uploads, retries — is recorded with who did it, from which IP, and when.",
      },
      {
        title: "Filter & search",
        body: "Narrow by severity (Info/Warn/High), by workspace, or free-text search. Newest events first. Export the filtered log to JSON for compliance reviews.",
        selector: '[data-guide="audit-filters"]',
        optional: true,
      },
    ],
  },

  "/system-settings": {
    title: "System Settings",
    steps: [
      {
        title: "Platform configuration",
        body: "Global settings for the whole platform — changes take effect immediately for everyone, so handle with care.",
      },
      {
        title: "The tabs",
        body: "Settings are grouped per area (e.g. the SMSC connection parameters for each carrier). Adjust values and press Save Changes to apply the group. Every change is recorded in the audit log.",
        selector: '[data-guide="settings-tabs"]',
        optional: true,
      },
      {
        title: "Rate limit",
        body: "Messages per second this carrier's gateway accepts — set per gateway. Set too high and the carrier throttles or drops; match your contract's rate.",
        selector: '[data-guide="ss-rate"]',
        optional: true,
      },
      {
        title: "Log retention",
        body: "How long message/delivery logs are kept before cleanup. This is a shared platform-wide value — changing it on either gateway tab changes it everywhere.",
        selector: '[data-guide="ss-retention"]',
        optional: true,
      },
      {
        title: "Save changes",
        body: "Writes this gateway's live SMSC config for the whole platform, effective immediately — you'll confirm first, and every change is recorded in the audit log.",
        selector: '[data-guide="ss-save"]',
        optional: true,
      },
    ],
  },
};

/** Longest-prefix guide lookup: /campaigns/new wins over /campaigns. */
export function resolveGuide(pathname: string): PageGuide | null {
  if (GUIDES[pathname]) return GUIDES[pathname];
  const match = Object.keys(GUIDES)
    .filter((k) => pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return match ? GUIDES[match] : null;
}

/**
 * Guides for content that lives inside a modal Dialog rather than a routed
 * page — opening/closing a dialog is local state, not a URL change, so these
 * are keyed by an explicit id passed to <DialogGuideButton guideId="..." />
 * (usually wired through <DialogHeader guideId="...">) instead of a path.
 */
const DIALOG_GUIDES: Record<string, PageGuide> = {
  "campaign-preview": {
    title: "Campaign Details",
    steps: [
      {
        title: "What you're looking at",
        body: "The full picture of one campaign: its message, its recipients, and — once it's been sent — live delivery results per number.",
      },
      {
        title: "Recipients",
        body: "Before sending this is the live membership of the campaign's source (group, upload, or template). After it's queued, this becomes the actual per-message delivery list — each row's status updates as the carrier reports back.",
        selector: '[data-guide="preview-recipients"]',
        optional: true,
      },
      {
        title: "Failed messages",
        body: "A failed row shows the carrier's rejection reason. Fix a wrong number inline and resend just that one, or retry it as-is — no new approval needed either way.",
        selector: '[data-guide="preview-recipients"]',
        optional: true,
      },
      {
        title: "Cancel while sending",
        body: "A department head can cancel here even while the campaign is actively QUEUED and sending — this stops delivery to everyone who hasn't received it yet. Messages already delivered can't be recalled.",
        selector: '[data-guide="preview-cancel"]',
        optional: true,
      },
      {
        title: "Retry all failed",
        body: "Re-queues every failed/expired message in one action instead of fixing them one at a time.",
        selector: '[data-guide="preview-retry-all"]',
        optional: true,
      },
      {
        title: "Export",
        body: "Downloads this campaign's summary and recipient list as an Excel file.",
        selector: '[data-guide="preview-export"]',
        optional: true,
      },
    ],
  },

  "campaign-approve": {
    title: "Approve or Reject",
    steps: [
      {
        title: "Review before you decide",
        body: "The exact message and full recipient list this campaign will send to — review both before approving, since approval can immediately trigger sending (or queue it for its scheduled time).",
      },
      {
        title: "Reject needs a reason",
        body: "Rejecting returns the campaign to Draft so its creator can fix and resubmit it. The reason you enter here is shown to them, so be specific.",
        selector: '[data-guide="approve-reason"]',
        optional: true,
      },
      {
        title: "Approve or Reject",
        body: "Approve sends it on (immediately for instant campaigns, at the scheduled time otherwise). Reject sends it back to Draft. Both are logged to the audit trail.",
        selector: '[data-guide="approve-actions"]',
        optional: true,
      },
    ],
  },

  "workspace-edit": {
    title: "Edit Workspace",
    steps: [
      {
        title: "Name, code & admin",
        body: "The code can't change after creation. Reassigning the admin transfers Department Head — only users with no other workspace membership are selectable.",
        selector: '[data-guide="we-basics"]',
        optional: true,
      },
      {
        title: "Sender mask & daily limit",
        body: "The sender mask is the \"from\" name recipients see. The daily limit caps how many messages this workspace can send per day — for a branch, it's that branch's own limit; a branch-workspace (umbrella) holds no data so it has no limit of its own.",
        selector: '[data-guide="we-limits"]',
        optional: true,
      },
      {
        title: "Permissions & delegate",
        body: "Feature permissions control what this workspace can do. Enabling delegate sign-off adds a second approval tier — turning it off later demotes the delegate to Operator instead of removing them, so they keep workspace access.",
        selector: '[data-guide="we-perms"]',
        optional: true,
      },
    ],
  },

  "allusers-user-form": {
    title: "Add User from AD",
    steps: [
      {
        title: "Pick the person",
        body: "Choose who to add from Active Directory — type to search by name. Their eSMS username is their AD login name.",
        selector: '[data-guide="au-user"]',
        optional: true,
      },
      {
        title: "Workspace & role (optional)",
        body: "Assign a workspace and role now to grant access immediately, or leave them blank to add the account and place them later. A user belongs to just one workspace at a time.",
        selector: '[data-guide="au-workspace-role"]',
        optional: true,
      },
    ],
  },

  "um-user-form": {
    title: "Add Member",
    steps: [
      {
        title: "Pick the person",
        body: "Choose who to add to this workspace from Active Directory — type to search. Their eSMS username is their AD login name.",
        selector: '[data-guide="um-user"]',
        optional: true,
      },
      {
        title: "Role",
        body: "The role sets what they can do here: Admin manages the workspace and approves, Operator creates and submits, Viewer is read-only, Delegate is the second-tier approver.",
        selector: '[data-guide="um-role"]',
        optional: true,
      },
    ],
  },

  "template-form": {
    title: "Create Template",
    steps: [
      {
        title: "Name the template",
        body: "Give it a clear, unique name — approvers and operators pick the template by this name later.",
        selector: '[data-guide="tf-name"]',
        optional: true,
      },
      {
        title: "Pick recipients",
        body: "Choose the contact group this template sends to. It's required before you can write the message, and its columns become the available {{Variables}}.",
        selector: '[data-guide="tf-recipients"]',
        optional: true,
      },
      {
        title: "Write the message",
        body: "Compose the SMS body once a group is selected. The counter shows characters, GSM-7/UCS-2 encoding, SMS parts and characters left. Amharic or emoji switch the message to UCS-2 (70 characters per SMS, 67 per part); € [ ] { } ^ ~ | \\ count as two.",
        selector: '[data-guide="tf-message"]',
        optional: true,
      },
      {
        title: "Insert variables",
        body: "Click a variable chip to drop a {{placeholder}} at your cursor — it's filled per recipient from the group's columns at send time.",
        selector: '[data-guide="tf-variables"]',
        optional: true,
      },
    ],
  },

  "reminder-form": {
    title: "Create Reminder",
    steps: [
      {
        title: "Define variables",
        body: "Upload a sample Excel file or pick a contact group to extract the column names available as {{Variables}}. This defines variables only — you upload fresh policy data each time you send.",
        selector: '[data-guide="rf-source"]',
        optional: true,
      },
      {
        title: "Name the reminder",
        body: "A clear name to identify this reusable reminder in the list and when sending.",
        selector: '[data-guide="rf-name"]',
        optional: true,
      },
      {
        title: "Days before expiry",
        body: "On send, SMS goes only to contacts whose policy expires in exactly this many days, based on the uploaded file's expiry-date column.",
        selector: '[data-guide="rf-days"]',
        optional: true,
      },
      {
        title: "Write the message",
        body: "Compose the reminder text and insert {{Variables}} from your defined columns. The counter shows characters and SMS parts.",
        selector: '[data-guide="rf-message"]',
        optional: true,
      },
    ],
  },

  "create-group": {
    title: "Create Contact Group",
    steps: [
      {
        title: "Name the group",
        body: "Give it a clear, reusable name — campaigns, templates, and reminders pick their audience by this name.",
        selector: '[data-guide="cg-name"]',
        optional: true,
      },
      {
        title: "Describe it (optional)",
        body: "A short note on who's in the list or what it's for — handy when you have many groups.",
        selector: '[data-guide="cg-description"]',
        optional: true,
      },
      {
        title: "Upload the contacts",
        body: "Attach an Excel/CSV with a recognized phone column (phone, Mobile, …). Ethiopian 09… numbers normalize to +2519… automatically; you'll map the phone column next, and rows without a valid number are skipped.",
        selector: '[data-guide="cg-upload"]',
        optional: true,
      },
    ],
  },

  "individual-contacts": {
    title: "Individual Contacts",
    steps: [
      {
        title: "Search & filter",
        body: "Find a contact by name or number, and switch between Active/Inactive/All.",
        selector: '[data-guide="ic-search"]',
        optional: true,
      },
      {
        title: "Rename",
        body: "Click the pencil to edit a contact's display name — their phone number itself can't be changed here (re-upload to correct a number).",
        selector: '[data-guide="ic-row"]',
        optional: true,
      },
      {
        title: "Opt out",
        body: "Opting a contact out skips them on every future send, across every campaign, reminder, and group — this matters for compliance, so confirm before flipping it on.",
        selector: '[data-guide="ic-row"]',
        optional: true,
      },
      {
        title: "Activate / deactivate",
        body: "Deactivating hides a contact from new sends without deleting their history; reactivate anytime.",
        selector: '[data-guide="ic-row"]',
        optional: true,
      },
    ],
  },
};

/** Guide for content inside a modal Dialog, looked up by explicit id (see DIALOG_GUIDES). */
export function getDialogGuide(id: string): PageGuide | null {
  return DIALOG_GUIDES[id] ?? null;
}
